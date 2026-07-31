import {
  type CSSProperties,
  type FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from "react";
import { SkeletonOverlay } from "./components/SkeletonOverlay";
import { VrmPreview } from "./components/VrmPreview";
import { AvatarMotionTracker } from "./lib/avatarMotionTracker";
import { GardenAudio } from "./lib/audio";
import { loadGameConfig, resolvePoseScoreThreshold } from "./lib/config";
import {
  initialGameState,
  isScoredPhase,
  reduceGameState,
} from "./lib/gameState";
import { HoldTracker } from "./lib/holdTracker";
import {
  readLeaderboard,
  removeStaleLeaderboardChallenges,
  submitLeaderboardEntry,
} from "./lib/leaderboard";
import { evaluatePose } from "./lib/poseEvaluator";
import { PoseSmoother } from "./lib/poseSmoother";
import { PoseTracker } from "./lib/poseTracker";
import { resolvePublicAssetPath } from "./lib/publicAsset";
import type {
  AvatarMotionFrame,
  DetectedPose,
  GameConfig,
  LeaderboardEntry,
  PoseConstraint,
  PoseFrame,
  PoseScore,
  TrackingStatus,
} from "./types";

const BODY_CHECK_INDICES = [0, 11, 12, 23, 24, 25, 26, 27, 28];
const RING_CIRCUMFERENCE = 2 * Math.PI * 30;

function avatarDebugFrame(timestampMs: number): AvatarMotionFrame {
  const flexion = ((Math.sin(timestampMs / 850) + 1) / 2) * 1.2;
  const fistAmount = Math.min(1, flexion / 1.2);
  const spreadPulse = (Math.sin(timestampMs / 1_350) + 1) / 2;
  const debugHand = (side: "left" | "right") => {
    const sideSign = side === "left" ? 1 : -1;
    // Exercise almost the complete palm-front ↔ palm-back range so the
    // acceptance page catches wrist amplitude caps and ±180° seam flips.
    const roll =
      Math.sin(timestampMs / 1_650) * Math.PI * 0.98 * sideSign;
    const pitch = Math.sin(timestampMs / 1_730) * 0.28;
    const rotate = (x: number, y: number, z: number) => {
      const rollX = x * Math.cos(roll) + z * Math.sin(roll);
      const rollZ = -x * Math.sin(roll) + z * Math.cos(roll);
      return {
        x: rollX,
        y: y * Math.cos(pitch) - rollZ * Math.sin(pitch),
        z: y * Math.sin(pitch) + rollZ * Math.cos(pitch),
        visibility: 1,
        presence: 1,
      };
    };
    const landmarks = Array.from({ length: 21 }, () => rotate(0, 0, 0));
    landmarks[0] = rotate(0, 0, 0);

    const openThumb = [
      [-0.45, 0.25, 0],
      [-0.7, 0.38, 0],
      [-0.86, 0.55, 0],
      [-0.95, 0.72, 0],
    ] as const;
    const closedThumb = [
      [-0.38, 0.35, 0.05],
      [-0.28, 0.58, 0.12],
      [-0.05, 0.72, 0.18],
      [0.12, 0.8, 0.15],
    ] as const;
    [1, 2, 3, 4].forEach((index, thumbIndex) => {
      const open = openThumb[thumbIndex];
      const closed = closedThumb[thumbIndex];
      landmarks[index] = rotate(
        (open[0] + (closed[0] - open[0]) * fistAmount) * sideSign,
        open[1] + (closed[1] - open[1]) * fistAmount,
        open[2] + (closed[2] - open[2]) * fistAmount,
      );
    });

    const fingerChains = [
      {
        indices: [5, 6, 7, 8],
        x: -0.45,
        length: 0.38,
        spread: -0.34,
      },
      {
        indices: [9, 10, 11, 12],
        x: -0.15,
        length: 0.42,
        spread: 0.18,
      },
      {
        indices: [13, 14, 15, 16],
        x: 0.17,
        length: 0.39,
        spread: 0.08,
      },
      {
        indices: [17, 18, 19, 20],
        x: 0.47,
        length: 0.34,
        spread: 0.16,
      },
    ];
    for (const { indices, x, length, spread } of fingerChains) {
      let currentX = x;
      let y = 0.76;
      let z = 0;
      indices.forEach((index, segmentIndex) => {
        if (segmentIndex > 0) {
          const angle = flexion * segmentIndex * 0.75;
          currentX +=
            Math.sin(spread * spreadPulse * (1 - fistAmount)) * length;
          y += Math.cos(angle) * length;
          z += Math.sin(angle) * length;
        }
        landmarks[index] = rotate(currentX * sideSign, y, z);
      });
    }
    return landmarks;
  };
  const blink = Math.sin(timestampMs / 230) > 0.92 ? 1 : 0;
  const mouth = (Math.sin(timestampMs / 640) + 1) / 2;

  return {
    timestampMs,
    inferenceMs: 0,
    hands: (["left", "right"] as const).map((side) => {
      const worldLandmarks = debugHand(side);
      const screenCenterX = side === "left" ? 0.3 : 0.7;
      return {
        side,
        landmarks: worldLandmarks.map((point) => ({
          ...point,
          x: screenCenterX + point.x * 0.08,
          y: 0.72 - point.y * 0.12,
          z: point.z * 0.08,
        })),
        worldLandmarks: worldLandmarks.map((point) => ({ ...point })),
        confidence: 1,
        updatedAtMs: timestampMs,
      };
    }),
    face: {
      updatedAtMs: timestampMs,
      blendshapes: {
        eyeBlinkLeft: blink,
        eyeBlinkRight: blink,
        jawOpen: mouth * 0.7,
        mouthSmileLeft: 1 - mouth,
        mouthSmileRight: 1 - mouth,
      },
    },
  };
}

function formatTime(milliseconds: number): string {
  const totalTenths = Math.max(0, Math.floor(milliseconds / 100));
  const minutes = Math.floor(totalTenths / 600);
  const seconds = Math.floor((totalTenths % 600) / 10);
  const tenths = totalTenths % 10;
  return `${minutes.toString().padStart(2, "0")}:${seconds
    .toString()
    .padStart(2, "0")}.${tenths}`;
}

function describeConstraint(constraint: PoseConstraint): string {
  if (constraint.type === "angle") {
    return `${constraint.points.join(" → ")}｜目標 ${constraint.target}°｜容錯 ${constraint.tolerance}°`;
  }
  if (constraint.type === "relativePosition") {
    return `${constraint.a} / ${constraint.b}｜${constraint.axis} 軸 ${constraint.relation}｜滿分區 ${constraint.margin}｜容錯 ${constraint.tolerance}`;
  }
  return `${constraint.a} / ${constraint.b}｜目標比例 ${constraint.target}｜容錯 ${constraint.tolerance}`;
}

function isFullBodyReady(pose: DetectedPose | null): boolean {
  if (!pose || pose.landmarks.length < 33) return false;
  return BODY_CHECK_INDICES.every((index) => {
    const landmark = pose.landmarks[index];
    return (
      landmark &&
      landmark.visibility >= 0.43 &&
      landmark.x >= 0.015 &&
      landmark.x <= 0.985 &&
      landmark.y >= 0.015 &&
      landmark.y <= 0.985
    );
  });
}

function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() =>
    typeof window === "undefined"
      ? false
      : window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(query.matches);
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  return reduced;
}

function trackingCopy(
  status: TrackingStatus,
  pose: DetectedPose | null,
  score: PoseScore | null,
): { title: string; detail: string; good: boolean } {
  if (status === "loading") {
    return {
      title: "正在喚醒魔法鏡頭",
      detail: "第一次載入姿勢模型可能需要幾秒鐘。",
      good: false,
    };
  }
  if (status === "error") {
    return {
      title: "攝影機需要幫忙",
      detail: "請檢查權限後再試一次。",
      good: false,
    };
  }
  if (status === "multiplePeople") {
    return {
      title: "一次一位探險家",
      detail: "請讓其他人先離開鏡頭範圍。",
      good: false,
    };
  }
  if (status === "noPerson" || !pose) {
    return {
      title: "請站到鏡頭前",
      detail: "往後站一些，讓頭、手和腳都看得見。",
      good: false,
    };
  }
  if (score && !score.bodyInFrame) {
    return {
      title: "全身要住在框框裡",
      detail: "再往後一步，別讓手腳跑出畫面。",
      good: false,
    };
  }
  if (score && !score.visibilityOk) {
    return {
      title: "有些關節被擋住了",
      detail: "面向鏡頭並讓雙手雙腳保持清楚。",
      good: false,
    };
  }
  if (!isFullBodyReady(pose)) {
    return {
      title: "再往後站一點",
      detail: "讓頭頂到腳底完整出現在鏡頭中。",
      good: false,
    };
  }
  return {
    title: score?.passing ? "姿勢正確，保持住！" : "全身辨識完成",
    detail: score?.passing ? "魔法光環正在充能。" : "跟著左邊的姿勢卡開始模仿。",
    good: true,
  };
}

export function App() {
  const [config, setConfig] = useState<GameConfig | null>(null);
  const [gameState, dispatchGame] = useReducer(
    reduceGameState,
    initialGameState,
  );
  const { phase, eligibleForLeaderboard } = gameState;
  const [fatalError, setFatalError] = useState("");
  const [cameraError, setCameraError] = useState("");
  const [vrmReady, setVrmReady] = useState(false);
  const [vrmError, setVrmError] = useState("");
  const [trackingStatus, setTrackingStatus] =
    useState<TrackingStatus>("loading");
  const [frame, setFrame] = useState<PoseFrame | null>(null);
  const [avatarMotion, setAvatarMotion] =
    useState<AvatarMotionFrame | null>(null);
  const [avatarWarning, setAvatarWarning] = useState("");
  const [avatarCapabilities, setAvatarCapabilities] = useState<{
    hands: boolean;
    face: boolean;
  } | null>(null);
  const [avatarProgress, setAvatarProgress] = useState("starting");
  const [smoothedPose, setSmoothedPose] = useState<DetectedPose | null>(null);
  const [currentPoseIndex, setCurrentPoseIndex] = useState(0);
  const [poseScore, setPoseScore] = useState<PoseScore | null>(null);
  const [holdProgress, setHoldProgress] = useState(0);
  const [countdown, setCountdown] = useState(3);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [transitionTitle, setTransitionTitle] = useState("太棒了！");
  const [nickname, setNickname] = useState("");
  const [nameError, setNameError] = useState("");
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [scoreSaved, setScoreSaved] = useState(false);
  const [quality, setQuality] = useState<"low" | "high">("high");
  const [muted, setMuted] = useState(
    () => localStorage.getItem("magic-garden-yoga:muted") === "true",
  );

  const videoRef = useRef<HTMLVideoElement>(null);
  const trackerRef = useRef<PoseTracker | null>(null);
  const avatarTrackerRef = useRef<AvatarMotionTracker | null>(null);
  const audioRef = useRef(new GardenAudio(!muted));
  const holdTrackerRef = useRef<HoldTracker | null>(null);
  const completionLockRef = useRef(false);
  const elapsedRef = useRef(0);
  const poseStartElapsedRef = useRef(0);
  const transitionTimerRef = useRef<number | null>(null);
  const poseSmootherRef = useRef<PoseSmoother | null>(null);
  if (poseSmootherRef.current === null) {
    poseSmootherRef.current = new PoseSmoother();
  }
  const reducedMotion = useReducedMotion();
  const poseDebugEnabled = useMemo(
    () => new URLSearchParams(window.location.search).get("poseDebug") === "1",
    [],
  );
  const avatarDebugEnabled = useMemo(
    () =>
      new URLSearchParams(window.location.search).get("avatarDebug") === "1",
    [],
  );

  const clearSmoothedPose = useCallback(() => {
    poseSmootherRef.current?.reset();
    setSmoothedPose(null);
    avatarTrackerRef.current?.setPose(null);
    setAvatarMotion(null);
  }, []);
  const handleTrackerFrame = useCallback((nextFrame: PoseFrame) => {
    setFrame(nextFrame);
    const onlyPose =
      nextFrame.poses.length === 1 ? nextFrame.poses[0] ?? null : null;
    if (!onlyPose) {
      avatarTrackerRef.current?.setPose(null);
      poseSmootherRef.current?.reset();
      setSmoothedPose(null);
      setAvatarMotion(null);
      return;
    }

    const nextSmoothedPose =
      poseSmootherRef.current?.update(onlyPose) ?? onlyPose;
    avatarTrackerRef.current?.setPose(nextSmoothedPose);
    setSmoothedPose(nextSmoothedPose);
  }, []);

  const activePose =
    config?.poses[Math.min(currentPoseIndex, config.poses.length - 1)] ?? null;
  const activeScoreThreshold =
    activePose && config
      ? resolvePoseScoreThreshold(
          activePose,
          config.poseDetection.scoreThreshold,
        )
      : 100;
  const detectedPose =
    frame?.poses.length === 1 ? smoothedPose : null;
  const tracking = trackingCopy(
    trackingStatus,
    detectedPose,
    phase === "playing" ? poseScore : null,
  );
  const avatarDebugReady =
    avatarDebugEnabled && vrmReady && !vrmError;
  const readyToStart =
    avatarDebugReady ||
    (trackingStatus === "ready" &&
      isFullBodyReady(detectedPose) &&
      vrmReady &&
      !cameraError &&
      !vrmError);
  const showSkip =
    phase === "playing" && elapsedMs - poseStartElapsedRef.current >= 8000;
  const lowMotion = reducedMotion || quality === "low";

  const refreshLeaderboard = useCallback((gameConfig: GameConfig) => {
    setLeaderboard(
      readLeaderboard(
        localStorage,
        gameConfig.challengeId,
        gameConfig.leaderboard.limit,
      ),
    );
  }, []);

  const handleVrmReady = useCallback(() => setVrmReady(true), []);
  const handleVrmError = useCallback((message: string) => {
    setVrmError(message);
    setVrmReady(false);
  }, []);

  useEffect(() => {
    if (!avatarDebugEnabled) return;
    let animationId = 0;
    const update = (timestamp: number) => {
      setAvatarMotion(avatarDebugFrame(timestamp));
      animationId = requestAnimationFrame(update);
    };
    animationId = requestAnimationFrame(update);
    return () => cancelAnimationFrame(animationId);
  }, [avatarDebugEnabled]);

  useEffect(() => {
    let active = true;
    loadGameConfig()
      .then((loadedConfig) => {
        if (!active) return;
        setConfig(loadedConfig);
        setQuality(loadedConfig.effects.defaultQuality);
        audioRef.current = new GardenAudio(
          loadedConfig.effects.audioEnabled && !muted,
        );
        removeStaleLeaderboardChallenges(
          localStorage,
          loadedConfig.challengeId,
        );
        refreshLeaderboard(loadedConfig);
        setCountdown(loadedConfig.timing.countdownSeconds);
        dispatchGame({ type: "CONFIG_LOADED" });
      })
      .catch((error: unknown) => {
        if (!active) return;
        setFatalError(
          error instanceof Error ? error.message : "遊戲設定載入失敗。",
        );
        dispatchGame({ type: "FATAL_ERROR" });
      });
    return () => {
      active = false;
    };
  }, [refreshLeaderboard]);

  useEffect(() => {
    if (!config || !videoRef.current || phase === "error") return;
    let active = true;

    clearSmoothedPose();
    setFrame(null);
    setAvatarWarning("");
    setAvatarCapabilities(null);
    setAvatarProgress("starting");
    const tracker = new PoseTracker({
      onFrame: handleTrackerFrame,
      onStatus: setTrackingStatus,
      onError: (error) => {
        clearSmoothedPose();
        setCameraError(error.message);
      },
    });
    trackerRef.current = tracker;
    const avatarTracker = new AvatarMotionTracker({
      onFrame: setAvatarMotion,
      onWarning: (_feature, message) => setAvatarWarning(message),
      onReady: setAvatarCapabilities,
      onProgress: (feature, progress) =>
        setAvatarProgress(`${feature}:${progress}`),
    });
    avatarTrackerRef.current = avatarTracker;
    setCameraError("");
    setAvatarProgress("tracker:start");
    void avatarTracker
      .start(
        videoRef.current,
        {
          ...config.avatarTracking,
          maxInferenceFps:
            config.effects.defaultQuality === "low"
              ? config.avatarTracking.lowQualityMaxInferenceFps
              : config.avatarTracking.maxInferenceFps,
        },
        config.poseDetection.wasmPath,
      )
      .catch((error: unknown) => {
        if (
          !active ||
          avatarTrackerRef.current !== avatarTracker
        ) {
          return;
        }
        setAvatarWarning(
          error instanceof Error
            ? error.message
            : "手指與表情同步無法啟動。",
        );
      });
    void tracker
      .start(videoRef.current, config.poseDetection)
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        clearSmoothedPose();
        setCameraError(
          error instanceof Error ? error.message : "攝影機啟動失敗。",
        );
      });

    return () => {
      active = false;
      tracker.stop();
      avatarTracker.stop();
      poseSmootherRef.current?.reset();
      if (trackerRef.current === tracker) trackerRef.current = null;
      if (avatarTrackerRef.current === avatarTracker) {
        avatarTrackerRef.current = null;
      }
    };
  }, [clearSmoothedPose, config, handleTrackerFrame, phase === "error"]);

  useEffect(() => {
    if (!config) return;
    avatarTrackerRef.current?.setMaxInferenceFps(
      quality === "low"
        ? config.avatarTracking.lowQualityMaxInferenceFps
        : config.avatarTracking.maxInferenceFps,
    );
  }, [config, quality]);

  useEffect(() => {
    if (phase !== "countdown" || !config) return;

    if (countdown <= 0) {
      elapsedRef.current = 0;
      setElapsedMs(0);
      poseStartElapsedRef.current = 0;
      holdTrackerRef.current = new HoldTracker({
        holdSeconds:
          config.poses[0]?.holdSeconds ?? config.timing.defaultHoldSeconds,
        graceMs: config.timing.trackingGraceMs,
      });
      audioRef.current.play("go");
      dispatchGame({ type: "COUNTDOWN_FINISHED" });
      return;
    }

    audioRef.current.play("countdown");
    const timer = window.setTimeout(
      () => setCountdown((value) => value - 1),
      1000,
    );
    return () => window.clearTimeout(timer);
  }, [config, countdown, phase]);

  useEffect(() => {
    if (!isScoredPhase(phase)) return;

    let animationId = 0;
    let lastTimestamp = performance.now();
    const tick = (timestamp: number) => {
      elapsedRef.current += Math.max(0, timestamp - lastTimestamp);
      lastTimestamp = timestamp;
      setElapsedMs(elapsedRef.current);
      animationId = requestAnimationFrame(tick);
    };
    animationId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animationId);
  }, [phase]);

  const finishRun = useCallback(() => {
    if (!config) return;
    setScoreSaved(false);
    setNickname("");
    setNameError("");
    refreshLeaderboard(config);
    audioRef.current.play("finish");
    dispatchGame({
      type: "TRANSITION_FINISHED",
      challengeComplete: true,
    });
  }, [config, refreshLeaderboard]);

  const advanceAfterTransition = useCallback(
    (nextPoseIndex: number) => {
      if (!config) return;
      if (nextPoseIndex >= config.poses.length) {
        completionLockRef.current = false;
        finishRun();
        return;
      }

      const nextPose = config.poses[nextPoseIndex];
      setCurrentPoseIndex(nextPoseIndex);
      setPoseScore(null);
      setHoldProgress(0);
      poseStartElapsedRef.current = elapsedRef.current;
      holdTrackerRef.current = new HoldTracker({
        holdSeconds: nextPose.holdSeconds ?? config.timing.defaultHoldSeconds,
        graceMs: config.timing.trackingGraceMs,
      });
      completionLockRef.current = false;
      dispatchGame({
        type: "TRANSITION_FINISHED",
        challengeComplete: false,
      });
    },
    [config, finishRun],
  );

  const startTransition = useCallback(
    (skipped: boolean) => {
      if (!config || completionLockRef.current) return;
      completionLockRef.current = true;
      setTransitionTitle(skipped ? "休息一下，繼續前進！" : "太棒了，魔法成功！");
      dispatchGame({ type: "POSE_FINISHED", skipped });
      if (skipped) {
        audioRef.current.play("tap");
      } else {
        audioRef.current.play("success");
      }

      if (transitionTimerRef.current !== null) {
        window.clearTimeout(transitionTimerRef.current);
      }
      transitionTimerRef.current = window.setTimeout(
        () => advanceAfterTransition(currentPoseIndex + 1),
        lowMotion ? 350 : config.timing.transitionMs,
      );
    },
    [advanceAfterTransition, config, currentPoseIndex, lowMotion],
  );

  useEffect(() => {
    if (
      phase !== "playing" ||
      !config ||
      !activePose ||
      !frame ||
      completionLockRef.current
    ) {
      return;
    }

    const result = evaluatePose(
      detectedPose,
      activePose,
      activeScoreThreshold,
    );
    setPoseScore(result);

    const tracker = holdTrackerRef.current;
    if (!tracker) return;
    const snapshot = tracker.update(
      frame.poses.length === 1 && detectedPose !== null && result.passing,
      frame.timestampMs,
    );
    setHoldProgress(snapshot.progress);
    if (snapshot.completed) {
      startTransition(false);
    }
  }, [
    activePose,
    activeScoreThreshold,
    config,
    detectedPose,
    frame,
    phase,
    startTransition,
  ]);

  useEffect(
    () => () => {
      if (transitionTimerRef.current !== null) {
        window.clearTimeout(transitionTimerRef.current);
      }
    },
    [],
  );

  const startGame = () => {
    if (!config || !readyToStart) return;
    audioRef.current.play("tap");
    setCurrentPoseIndex(0);
    setPoseScore(null);
    setHoldProgress(0);
    setElapsedMs(0);
    elapsedRef.current = 0;
    poseStartElapsedRef.current = 0;
    setScoreSaved(false);
    completionLockRef.current = false;
    setCountdown(config.timing.countdownSeconds);
    dispatchGame({ type: "START" });
  };

  const restartGame = () => {
    audioRef.current.play("tap");
    setCurrentPoseIndex(0);
    setPoseScore(null);
    setHoldProgress(0);
    setElapsedMs(0);
    elapsedRef.current = 0;
    completionLockRef.current = false;
    dispatchGame({ type: "RESTART" });
  };

  const retryCamera = () => {
    if (!config || !videoRef.current) return;
    setCameraError("");
    setTrackingStatus("loading");
    clearSmoothedPose();
    setFrame(null);
    trackerRef.current?.stop();
    const tracker = new PoseTracker({
      onFrame: handleTrackerFrame,
      onStatus: setTrackingStatus,
      onError: (error) => {
        clearSmoothedPose();
        setCameraError(error.message);
      },
    });
    trackerRef.current = tracker;
    void tracker
      .start(videoRef.current, config.poseDetection)
      .catch((error: unknown) =>
        setCameraError(
          error instanceof Error ? error.message : "攝影機啟動失敗。",
        ),
      );
  };

  const toggleMute = () => {
    const nextMuted = audioRef.current.toggleMuted();
    setMuted(nextMuted);
    localStorage.setItem("magic-garden-yoga:muted", String(nextMuted));
  };

  const submitScore = (event: FormEvent) => {
    event.preventDefault();
    if (!config || !eligibleForLeaderboard || scoreSaved) return;
    try {
      const entries = submitLeaderboardEntry(
        localStorage,
        {
          challengeId: config.challengeId,
          displayName: nickname,
          elapsedMs: Math.round(elapsedRef.current),
        },
        {
          limit: config.leaderboard.limit,
          nameMaxLength: config.leaderboard.nameMaxLength,
        },
      );
      setLeaderboard(entries);
      setScoreSaved(true);
      setNameError("");
      audioRef.current.play("success");
    } catch (error) {
      setNameError(error instanceof Error ? error.message : "暱稱無法儲存。");
    }
  };

  const particleStyles = useMemo(
    () =>
      Array.from({ length: lowMotion ? 0 : quality === "high" ? 28 : 12 }, (_, index) => {
        const angle = (index / 28) * Math.PI * 2;
        const radius = 180 + (index % 5) * 42;
        return {
          "--particle-x": `${Math.cos(angle) * radius}px`,
          "--particle-y": `${Math.sin(angle) * radius}px`,
          "--particle-rotate": `${160 + index * 29}deg`,
          "--particle-color":
            index % 3 === 0 ? "#ffd873" : index % 3 === 1 ? "#8ff1c6" : "#d4bdff",
          animationDelay: `${(index % 7) * 32}ms`,
        } as CSSProperties;
      }),
    [lowMotion, quality],
  );

  const cameraPhase =
    phase === "playing"
      ? "game"
      : phase === "countdown"
        ? "countdown"
        : phase === "transition"
          ? "transition"
          : phase;
  const inGame =
    phase === "playing" ||
    phase === "countdown" ||
    phase === "transition";
  const inAdventure = phase === "ready" || inGame;

  return (
    <div className={`app-shell phase-${phase} quality-${quality}`}>
      <div className="ambient-orb ambient-orb--one" />
      <div className="ambient-orb ambient-orb--two" />

      <header className="topbar">
        <div className="brand-mark">
          <span className="brand-mark__icon" aria-hidden="true">
            ✦
          </span>
          <span>魔法花園瑜珈</span>
        </div>
        <div className="topbar__actions">
          <button
            className="icon-button"
            type="button"
            onClick={() => setQuality((value) => (value === "high" ? "low" : "high"))}
            aria-label="切換動畫畫質"
          >
            {quality === "high" ? "✨ 精緻光效" : "🌱 節能光效"}
          </button>
          <button
            className="icon-button"
            type="button"
            onClick={toggleMute}
            aria-label={muted ? "開啟音效" : "關閉音效"}
          >
            {muted ? "🔇 音效關閉" : "🔊 音效開啟"}
          </button>
        </div>
      </header>

      {phase === "boot" && (
        <main className="screen loading-screen">
          <section className="loading-card">
            <div className="loading-spinner" />
            <h1>正在打開魔法花園</h1>
            <p>載入姿勢卡、魔法夥伴與本機辨識模型中……</p>
          </section>
        </main>
      )}

      {phase === "error" && (
        <main className="screen error-screen">
          <section className="error-card">
            <h1>花園暫時打不開</h1>
            <p>{fatalError}</p>
            <button
              className="primary-button"
              type="button"
              onClick={() => window.location.reload()}
            >
              重新載入
            </button>
          </section>
        </main>
      )}

      {inAdventure && config && (phase === "ready" || activePose) && (
        <main
          className={`screen ${
            phase === "ready" ? "ready-screen" : "game-screen"
          }`}
        >
          {phase === "ready" ? (
            <section className="hero-copy" key="ready-copy">
              <div className="eyebrow">✦ 今日的勇氣任務</div>
              <h1 className="hero-title">
                魔法花園
                <span>瑜珈闖關</span>
              </h1>
              <p className="hero-subtitle">{config.subtitle}</p>
              <div className="quest-meta">
                <span className="meta-chip">
                  <b>{config.poses.length}</b> 個姿勢
                </span>
                <span className="meta-chip">
                  每式保持 <b>{config.timing.defaultHoldSeconds}</b> 秒
                </span>
                <span className="meta-chip">影像只在本機處理</span>
              </div>
              <div className="readiness-card" data-ready={readyToStart}>
                <span className="readiness-card__light" />
                <div>
                  <strong>
                    {avatarDebugReady
                      ? "VRM 顯示驗收模式"
                      : cameraError || vrmError || tracking.title}
                  </strong>
                  <small>
                    {avatarDebugReady
                      ? "可直接開始冒險，檢查主模型與攝影機小視窗版面；合成的手部與臉部資料不會加入瑜珈評分。"
                      : cameraError
                      ? "允許攝影機權限後按「重試攝影機」。"
                      : vrmError
                        ? "請檢查 game.json 中的 VRM 路徑。"
                        : tracking.detail}
                  </small>
                </div>
              </div>
              {cameraError && !avatarDebugReady ? (
                <button
                  className="primary-button"
                  type="button"
                  onClick={retryCamera}
                >
                  ↻ 重試攝影機
                </button>
              ) : (
                <button
                  className="primary-button"
                  type="button"
                  disabled={!readyToStart}
                  onClick={startGame}
                >
                  開始冒險 <span aria-hidden="true">→</span>
                </button>
              )}
              <p className="privacy-note">
                請保留約兩公尺距離，確保頭頂、雙手與雙腳都在畫面中。遊戲不錄影，也不會上傳攝影機內容。
              </p>
              {avatarWarning && (
                <p className="avatar-tracking-warning" role="status">
                  手指／表情同步暫時無法使用：{avatarWarning}
                  <br />
                  身體姿勢判定與闖關不受影響。
                </p>
              )}
            </section>
          ) : activePose ? (
            <section className="game-screen__left" key="game-panel">
              <div className="game-hud">
                <div className="level-progress" aria-label="關卡進度">
                  {config.poses.map((pose, index) => (
                    <span
                      key={pose.id}
                      className={`level-dot ${
                        index < currentPoseIndex
                          ? "level-dot--complete"
                          : index === currentPoseIndex
                            ? "level-dot--current"
                            : ""
                      }`}
                    >
                      {index < currentPoseIndex ? "✓" : index + 1}
                    </span>
                  ))}
                </div>
                <div className="timer-chip">⏱ {formatTime(elapsedMs)}</div>
              </div>

              <article className="pose-card">
                <div className="pose-card__image-wrap">
                  <img
                    className="pose-card__image"
                    src={resolvePublicAssetPath(activePose.imagePath)}
                    alt={`${activePose.name}姿勢示範`}
                  />
                  <span className="pose-card__number">
                    第 {currentPoseIndex + 1} / {config.poses.length} 式
                  </span>
                </div>
                <div className="pose-card__content">
                  <div className="pose-card__title-row">
                    <h2 className="pose-card__title">{activePose.name}</h2>
                    <span className="pose-card__english">
                      {activePose.englishName}
                    </span>
                  </div>
                  <p className="pose-card__instruction">
                    {activePose.instruction}
                  </p>
                </div>
              </article>

              <div className="coach-box" role="status" aria-live="polite">
                <span className="coach-box__icon">✦</span>
                <span>
                  {phase === "countdown"
                    ? "準備好囉！倒數結束後才會開始計時。"
                    : poseScore?.hint ?? tracking.detail}
                </span>
              </div>

              {poseDebugEnabled && phase === "playing" && poseScore && (
                <details className="pose-debug">
                  <summary>
                    姿勢判定細節（校正用，本關門檻 {activeScoreThreshold} 分）
                  </summary>
                  <ol>
                    {activePose.constraints.map((constraint, index) => (
                      <li
                        key={`${constraint.type}-${index}`}
                        data-low={
                          (poseScore.constraintScores[index] ?? 0) <
                          activeScoreThreshold
                        }
                      >
                        <span>
                          {describeConstraint(constraint)}
                          <small>{constraint.hint}</small>
                        </span>
                        <strong>
                          {Math.round(poseScore.constraintScores[index] ?? 0)}
                        </strong>
                      </li>
                    ))}
                  </ol>
                </details>
              )}

              <div className="hold-panel">
                <div className="progress-ring">
                  <svg viewBox="0 0 72 72" aria-hidden="true">
                    <circle
                      className="progress-ring__track"
                      cx="36"
                      cy="36"
                      r="30"
                    />
                    <circle
                      className="progress-ring__value"
                      cx="36"
                      cy="36"
                      r="30"
                      strokeDasharray={RING_CIRCUMFERENCE}
                      strokeDashoffset={
                        RING_CIRCUMFERENCE * (1 - holdProgress)
                      }
                    />
                  </svg>
                  <span className="progress-ring__label">
                    {Math.round(holdProgress * 100)}%
                  </span>
                </div>
                <div className="hold-panel__copy">
                  <strong>
                    {poseScore?.passing
                      ? "很好，保持住！"
                      : "模仿姿勢來充能"}
                  </strong>
                  <span>
                    正確度 {Math.round(poseScore?.score ?? 0)} 分・保持{" "}
                    {activePose.holdSeconds ??
                      config.timing.defaultHoldSeconds}{" "}
                    秒
                  </span>
                </div>
              </div>

              <div className="game-actions">
                {showSkip && (
                  <button
                    className="skip-button"
                    type="button"
                    onClick={() => startTransition(true)}
                  >
                    需要休息？跳過這一式（本局不列入排行榜）
                  </button>
                )}
              </div>
            </section>
          ) : null}

          <section
            key="avatar-stage"
            className={`portal-card portal-card--${cameraPhase}`}
            data-hand-tracking={
              avatarCapabilities === null
                ? "loading"
                : avatarCapabilities.hands
                  ? "ready"
                  : "unavailable"
            }
            data-face-tracking={
              avatarCapabilities === null
                ? "loading"
                : avatarCapabilities.face
                  ? "ready"
                  : "unavailable"
            }
            data-avatar-progress={avatarProgress}
          >
            <div className="portal-label">
              <i />{" "}
              {phase === "ready"
                ? "你的魔法動作夥伴"
                : "跟著魔法夥伴一起伸展"}
            </div>
            <VrmPreview
              modelPath={resolvePublicAssetPath(config.avatar.modelPath)}
              modelScale={config.avatar.scale}
              cameraDistance={config.avatar.cameraDistance}
              mirrored={config.avatar.mirrored}
              pose={detectedPose}
              avatarMotion={avatarMotion}
              motionSmoothing={config.avatarTracking.smoothing}
              motionLostHoldMs={config.avatarTracking.lostHoldMs}
              motionRelaxMs={config.avatarTracking.relaxMs}
              wristRotationEnabled={
                config.avatarTracking.hands.wristRotationEnabled
              }
              fingerSpreadInfluence={
                config.avatarTracking.hands.fingerSpreadInfluence
              }
              fingerSpreadMaxDegrees={
                config.avatarTracking.hands.fingerSpreadMaxDegrees
              }
              reducedMotion={lowMotion}
              onReady={handleVrmReady}
              onError={handleVrmError}
            />
          </section>
        </main>
      )}

      {phase === "countdown" && (
        <div className="countdown-overlay" aria-live="assertive">
          <div key={countdown} className="countdown-number">
            {countdown}
          </div>
        </div>
      )}

      {phase === "transition" && (
        <div className="transition-overlay" aria-live="polite">
          <div className="portal-burst" />
          {particleStyles.map((style, index) => (
            <i key={index} className="magic-particle" style={style} />
          ))}
          <div className="transition-copy">
            <span>勇氣星 +1</span>
            <strong>{transitionTitle}</strong>
          </div>
        </div>
      )}

      {phase === "complete" && config && (
        <main className="screen complete-screen">
          <section className="result-panel">
            <div className="result-hero">
              <div className="result-star">★</div>
              <h1>花園任務完成！</h1>
              <p>
                你完成了 {config.poses.length} 個瑜珈姿勢，讓整座魔法花園重新發光。
              </p>
              <div className="result-time">
                <small>有效闖關時間</small>
                {formatTime(elapsedRef.current)}
              </div>
            </div>

            <div className="result-content">
              <h2>勇氣排行榜</h2>
              <p className="result-content__intro">
                排行榜只保存在這台電腦；同一個暱稱會保留最快成績。
              </p>

              {eligibleForLeaderboard ? (
                scoreSaved ? (
                  <div className="result-notice">成績已經收進排行榜，做得很好！</div>
                ) : (
                  <form className="name-form" onSubmit={submitScore}>
                    <input
                      className="name-input"
                      value={nickname}
                      onChange={(event) => setNickname(event.target.value)}
                      maxLength={config.leaderboard.nameMaxLength}
                      placeholder="輸入暱稱"
                      aria-label="排行榜暱稱"
                      autoComplete="off"
                    />
                    <button className="primary-button" type="submit">
                      儲存
                    </button>
                  </form>
                )
              ) : (
                <div className="result-notice">
                  這一局有跳過姿勢，所以不列入排行榜；練習完成仍然值得鼓掌！
                </div>
              )}

              {nameError && <div className="result-notice">{nameError}</div>}

              {leaderboard.length > 0 ? (
                <ol className="leaderboard">
                  {leaderboard.map((entry, index) => (
                    <li key={entry.id} className="leaderboard__row">
                      <span className="leaderboard__rank">{index + 1}</span>
                      <span className="leaderboard__name">{entry.displayName}</span>
                      <span className="leaderboard__time">
                        {formatTime(entry.elapsedMs)}
                      </span>
                    </li>
                  ))}
                </ol>
              ) : (
                <div className="leaderboard__empty">還沒有紀錄，成為第一位探險家吧！</div>
              )}

              <div className="result-actions">
                <button className="secondary-button" type="button" onClick={restartGame}>
                  回到準備頁
                </button>
              </div>
            </div>
          </section>
        </main>
      )}

      <aside className={`camera-panel camera-panel--${cameraPhase}`}>
        <video
          ref={videoRef}
          className="camera-panel__video"
          muted
          autoPlay
          playsInline
        />
        <div className="camera-panel__shade" />
        <SkeletonOverlay
          pose={detectedPose}
          avatarMotion={avatarMotion}
          passing={Boolean(poseScore?.passing)}
          active={phase !== "boot" && phase !== "error" && phase !== "complete"}
          detailed={quality === "high"}
          videoRef={videoRef}
        />
        <div className="camera-panel__corners" />
        <div className="camera-panel__status">
          <span className="tracking-pill" data-good={tracking.good}>
            <i /> {cameraError || tracking.title}
          </span>
          {phase === "playing" && <span>{Math.round(poseScore?.score ?? 0)} 分</span>}
        </div>
      </aside>
    </div>
  );
}
