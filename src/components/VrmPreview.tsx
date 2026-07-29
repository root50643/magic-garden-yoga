import { useEffect, useRef } from "react";
import {
  AmbientLight,
  Box3,
  Color,
  DirectionalLight,
  Group,
  MathUtils,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  PerspectiveCamera,
  PlaneGeometry,
  Quaternion,
  Scene,
  SphereGeometry,
  Timer,
  Vector3,
  WebGLRenderer,
} from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import {
  VRM,
  VRMExpressionPresetName,
  VRMHumanBoneName,
  VRMLoaderPlugin,
  VRMUtils,
} from "@pixiv/three-vrm";
import {
  FINGER_JOINT_DEFINITIONS,
  calculateFingerCurls,
  curlAxisFromRestDirection,
  faceBlendshapesToVrmExpressions,
  halfLifeAlpha,
  type FaceExpressionTargets,
  type FingerJointName,
} from "../lib/avatarMotion";
import { mediaPipeSegmentToVrmDirection } from "../lib/vrmRetarget";
import type {
  AvatarMotionFrame,
  DetectedPose,
  HandSide,
  Landmark,
} from "../types";

interface VrmPreviewProps {
  modelPath: string;
  modelScale: number;
  cameraDistance: number;
  mirrored: boolean;
  pose: DetectedPose | null;
  avatarMotion: AvatarMotionFrame | null;
  motionSmoothing: number;
  motionLostHoldMs: number;
  motionRelaxMs: number;
  reducedMotion: boolean;
  onReady: () => void;
  onError: (message: string) => void;
}

type HumanBoneName =
  (typeof VRMHumanBoneName)[keyof typeof VRMHumanBoneName];

interface SegmentBinding {
  boneName: HumanBoneName;
  childBoneName: HumanBoneName;
  start: number;
  end: number;
  restWorldDirection: Vector3;
  restWorldQuaternion: Quaternion;
}

interface FingerBinding {
  side: HandSide;
  jointName: FingerJointName;
  bone: Object3D;
  restLocalQuaternion: Quaternion;
  curlAxis: Vector3;
}

type ExpressionName =
  | "aa"
  | "ih"
  | "ou"
  | "ee"
  | "oh"
  | "blink"
  | "blinkLeft"
  | "blinkRight"
  | "happy"
  | "surprised";

const SEGMENTS = [
  {
    boneName: VRMHumanBoneName.LeftUpperArm,
    childBoneName: VRMHumanBoneName.LeftLowerArm,
    start: 11,
    end: 13,
  },
  {
    boneName: VRMHumanBoneName.LeftLowerArm,
    childBoneName: VRMHumanBoneName.LeftHand,
    start: 13,
    end: 15,
  },
  {
    boneName: VRMHumanBoneName.RightUpperArm,
    childBoneName: VRMHumanBoneName.RightLowerArm,
    start: 12,
    end: 14,
  },
  {
    boneName: VRMHumanBoneName.RightLowerArm,
    childBoneName: VRMHumanBoneName.RightHand,
    start: 14,
    end: 16,
  },
  {
    boneName: VRMHumanBoneName.LeftUpperLeg,
    childBoneName: VRMHumanBoneName.LeftLowerLeg,
    start: 23,
    end: 25,
  },
  {
    boneName: VRMHumanBoneName.LeftLowerLeg,
    childBoneName: VRMHumanBoneName.LeftFoot,
    start: 25,
    end: 27,
  },
  {
    boneName: VRMHumanBoneName.RightUpperLeg,
    childBoneName: VRMHumanBoneName.RightLowerLeg,
    start: 24,
    end: 26,
  },
  {
    boneName: VRMHumanBoneName.RightLowerLeg,
    childBoneName: VRMHumanBoneName.RightFoot,
    start: 26,
    end: 28,
  },
  {
    boneName: VRMHumanBoneName.LeftFoot,
    childBoneName: VRMHumanBoneName.LeftToes,
    start: 27,
    end: 31,
  },
  {
    boneName: VRMHumanBoneName.RightFoot,
    childBoneName: VRMHumanBoneName.RightToes,
    start: 28,
    end: 32,
  },
] as const;

function landmarkVector(landmark: Landmark): Vector3 {
  // MediaPipe and the front-facing VRM use the same anatomical left/right
  // direction on X. Only Y (down -> up) and depth (camera -> Three.js) need
  // their signs changed. Negating X here sends every limb to the opposite
  // side of the avatar and makes arms/legs cross the torso.
  return new Vector3(landmark.x, -landmark.y, -landmark.z);
}

function makeBindings(vrm: VRM): SegmentBinding[] {
  vrm.scene.updateMatrixWorld(true);
  return SEGMENTS.flatMap((segment) => {
    const bone = vrm.humanoid.getNormalizedBoneNode(segment.boneName);
    const child = vrm.humanoid.getNormalizedBoneNode(segment.childBoneName);
    if (!bone || !child) return [];

    const start = new Vector3();
    const end = new Vector3();
    bone.getWorldPosition(start);
    child.getWorldPosition(end);
    const direction = end.sub(start).normalize();
    const worldQuaternion = new Quaternion();
    bone.getWorldQuaternion(worldQuaternion);
    return [
      {
        ...segment,
        restWorldDirection: direction,
        restWorldQuaternion: worldQuaternion,
      },
    ];
  });
}

function makeFingerBindings(vrm: VRM): FingerBinding[] {
  vrm.scene.updateMatrixWorld(true);
  const bindings: FingerBinding[] = [];

  for (const side of ["left", "right"] as const) {
    for (const definition of FINGER_JOINT_DEFINITIONS) {
      const boneName =
        side === "left" ? definition.leftBone : definition.rightBone;
      const childBoneName =
        side === "left"
          ? definition.leftChildBone
          : definition.rightChildBone;
      const bone = vrm.humanoid.getNormalizedBoneNode(
        boneName as HumanBoneName,
      );
      if (!bone) continue;

      const bonePosition = bone.getWorldPosition(new Vector3());
      let restDirection: Vector3 | null = null;
      if (childBoneName) {
        const child = vrm.humanoid.getNormalizedBoneNode(
          childBoneName as HumanBoneName,
        );
        if (child) {
          restDirection = child
            .getWorldPosition(new Vector3())
            .sub(bonePosition)
            .normalize();
        }
      }
      if (!restDirection && bone.parent) {
        restDirection = bonePosition
          .clone()
          .sub(bone.parent.getWorldPosition(new Vector3()))
          .normalize();
      }
      if (!restDirection || restDirection.lengthSq() < 0.0001) continue;

      const derivedAxis = curlAxisFromRestDirection(restDirection);
      const axisWorld = derivedAxis
        ? new Vector3(derivedAxis.x, derivedAxis.y, derivedAxis.z)
        : new Vector3(0, 0, side === "left" ? -1 : 1);
      const restWorldQuaternion = bone.getWorldQuaternion(new Quaternion());
      const curlAxis = axisWorld
        .applyQuaternion(restWorldQuaternion.clone().invert())
        .normalize();

      bindings.push({
        side,
        jointName: definition.name,
        bone,
        restLocalQuaternion: bone.quaternion.clone(),
        curlAxis,
      });
    }
  }

  return bindings;
}

function motionBlend(smoothing: number, deltaSeconds: number): number {
  const perFrame = Math.min(1, Math.max(0.01, smoothing));
  return 1 - (1 - perFrame) ** Math.max(0, deltaSeconds * 60);
}

function retargetFingers(
  bindings: FingerBinding[],
  motion: AvatarMotionFrame,
  blend: number,
): Set<HandSide> {
  const trackedSides = new Set<HandSide>();
  for (const hand of motion.hands) {
    const landmarks =
      hand.worldLandmarks.length >= 21
        ? hand.worldLandmarks
        : hand.landmarks;
    if (landmarks.length < 21) continue;
    trackedSides.add(hand.side);
    const curls = calculateFingerCurls(landmarks);
    for (const binding of bindings) {
      if (binding.side !== hand.side) continue;
      const curlRotation = new Quaternion().setFromAxisAngle(
        binding.curlAxis,
        curls[binding.jointName],
      );
      const target = binding.restLocalQuaternion
        .clone()
        .multiply(curlRotation);
      binding.bone.quaternion.slerp(target, blend);
    }
  }
  return trackedSides;
}

function relaxFingers(
  bindings: FingerBinding[],
  sides: ReadonlySet<HandSide>,
  blend: number,
): void {
  for (const binding of bindings) {
    if (!sides.has(binding.side)) continue;
    binding.bone.quaternion.slerp(binding.restLocalQuaternion, blend);
  }
}

const ZERO_FACE_TARGETS: FaceExpressionTargets = {
  aa: 0,
  ih: 0,
  ou: 0,
  ee: 0,
  oh: 0,
  blinkLeft: 0,
  blinkRight: 0,
  happy: 0,
  surprised: 0,
};

const EXPRESSION_PRESETS: Record<
  Exclude<ExpressionName, "blink">,
  (typeof VRMExpressionPresetName)[keyof typeof VRMExpressionPresetName]
> = {
  aa: VRMExpressionPresetName.Aa,
  ih: VRMExpressionPresetName.Ih,
  ou: VRMExpressionPresetName.Ou,
  ee: VRMExpressionPresetName.Ee,
  oh: VRMExpressionPresetName.Oh,
  blinkLeft: VRMExpressionPresetName.BlinkLeft,
  blinkRight: VRMExpressionPresetName.BlinkRight,
  happy: VRMExpressionPresetName.Happy,
  surprised: VRMExpressionPresetName.Surprised,
};

function applyFaceExpressions(
  vrm: VRM,
  targets: FaceExpressionTargets,
  currentValues: Partial<Record<ExpressionName, number>>,
  deltaSeconds: number,
  smoothing: number,
): void {
  const manager = vrm.expressionManager;
  if (!manager) return;
  const speedScale = Math.max(0.2, smoothing / 0.38);

  const write = (
    name: ExpressionName,
    preset: string,
    target: number,
    attackHalfLife: number,
    releaseHalfLife: number,
  ) => {
    if (!manager.getExpression(preset)) return;
    const current = currentValues[name] ?? 0;
    const halfLife =
      (target > current ? attackHalfLife : releaseHalfLife) / speedScale;
    const next =
      current +
      (target - current) *
        halfLifeAlpha(deltaSeconds, halfLife);
    currentValues[name] = next;
    manager.setValue(preset, next);
  };

  for (const name of ["aa", "ih", "ou", "ee", "oh"] as const) {
    write(name, EXPRESSION_PRESETS[name], targets[name], 0.06, 0.09);
  }
  write(
    "happy",
    EXPRESSION_PRESETS.happy,
    targets.happy,
    0.075,
    0.12,
  );
  write(
    "surprised",
    EXPRESSION_PRESETS.surprised,
    targets.surprised,
    0.055,
    0.11,
  );

  const hasLeftBlink = Boolean(
    manager.getExpression(VRMExpressionPresetName.BlinkLeft),
  );
  const hasRightBlink = Boolean(
    manager.getExpression(VRMExpressionPresetName.BlinkRight),
  );
  if (hasLeftBlink || hasRightBlink) {
    if (hasLeftBlink) {
      write(
        "blinkLeft",
        VRMExpressionPresetName.BlinkLeft,
        targets.blinkLeft,
        0.025,
        0.045,
      );
    }
    if (hasRightBlink) {
      write(
        "blinkRight",
        VRMExpressionPresetName.BlinkRight,
        targets.blinkRight,
        0.025,
        0.045,
      );
    }
  } else {
    write(
      "blink",
      VRMExpressionPresetName.Blink,
      (targets.blinkLeft + targets.blinkRight) / 2,
      0.025,
      0.045,
    );
  }
}

function retargetPose(
  vrm: VRM,
  bindings: SegmentBinding[],
  pose: DetectedPose,
  blend: number,
) {
  const landmarks =
    pose.worldLandmarks.length >= 33 ? pose.worldLandmarks : pose.landmarks;

  // Apply torso lean first so the limb targets below are solved against the
  // final parent transform instead of being rotated away afterward.
  const leftShoulder = landmarks[11];
  const rightShoulder = landmarks[12];
  const leftHip = landmarks[23];
  const rightHip = landmarks[24];
  if (leftShoulder && rightShoulder && leftHip && rightHip) {
    const shoulderMid = landmarkVector(leftShoulder)
      .add(landmarkVector(rightShoulder))
      .multiplyScalar(0.5);
    const hipMid = landmarkVector(leftHip)
      .add(landmarkVector(rightHip))
      .multiplyScalar(0.5);
    const lean = shoulderMid.sub(hipMid);
    const spine = vrm.humanoid.getNormalizedBoneNode(VRMHumanBoneName.Spine);
    if (spine && lean.lengthSq() > 0.001) {
      const sideLean = Math.atan2(lean.x, Math.max(0.1, lean.y));
      spine.rotation.z += (-sideLean * 0.45 - spine.rotation.z) * blend;
      spine.updateMatrixWorld(true);
    }
  }

  for (const binding of bindings) {
    const start = landmarks[binding.start];
    const end = landmarks[binding.end];
    const direction = mediaPipeSegmentToVrmDirection(start, end);
    if (!direction) continue;
    const targetDirection = new Vector3(
      direction.x,
      direction.y,
      direction.z,
    );

    const bone = vrm.humanoid.getNormalizedBoneNode(binding.boneName);
    if (!bone || !bone.parent) continue;

    const align = new Quaternion().setFromUnitVectors(
      binding.restWorldDirection,
      targetDirection,
    );
    const desiredWorld = align.multiply(binding.restWorldQuaternion);
    const parentWorld = new Quaternion();
    bone.parent.getWorldQuaternion(parentWorld);
    const desiredLocal = parentWorld.invert().multiply(desiredWorld);
    bone.quaternion.slerp(desiredLocal, blend);
    bone.updateMatrixWorld(true);
  }
}

export function VrmPreview({
  modelPath,
  modelScale,
  cameraDistance,
  mirrored,
  pose,
  avatarMotion,
  motionSmoothing,
  motionLostHoldMs,
  motionRelaxMs,
  reducedMotion,
  onReady,
  onError,
}: VrmPreviewProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  const poseRef = useRef<DetectedPose | null>(pose);
  const avatarMotionRef = useRef<AvatarMotionFrame | null>(avatarMotion);
  const handSeenAtRef = useRef<Record<HandSide, number>>({
    left: Number.NEGATIVE_INFINITY,
    right: Number.NEGATIVE_INFINITY,
  });
  const faceSeenAtRef = useRef(Number.NEGATIVE_INFINITY);

  useEffect(() => {
    poseRef.current = pose;
  }, [pose]);

  useEffect(() => {
    avatarMotionRef.current = avatarMotion;
    if (!avatarMotion) return;
    const receivedAt = performance.now();
    for (const hand of avatarMotion.hands) {
      handSeenAtRef.current[hand.side] = receivedAt;
    }
    if (avatarMotion.face) faceSeenAtRef.current = receivedAt;
  }, [avatarMotion]);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const scene = new Scene();
    scene.background = null;
    const camera = new PerspectiveCamera(28, 1, 0.01, 100);
    camera.position.set(0, 1.15, cameraDistance);
    camera.lookAt(0, 1.05, 0);

    const renderer = new WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: "high-performance",
    });
    renderer.setClearColor(new Color(0x000000), 0);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = "srgb";
    mount.appendChild(renderer.domElement);

    const ambient = new AmbientLight(0xfff2dd, 2.2);
    scene.add(ambient);
    const key = new DirectionalLight(0xfff0ca, 3.5);
    key.position.set(2.5, 4, 3);
    scene.add(key);
    const rim = new DirectionalLight(0x8fe8d1, 2);
    rim.position.set(-3, 2, -2);
    scene.add(rim);

    const floor = new Mesh(
      new PlaneGeometry(4, 4),
      new MeshStandardMaterial({
        color: 0x8fd7bb,
        transparent: true,
        opacity: 0.12,
        roughness: 0.8,
      }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.015;
    scene.add(floor);

    const motes = new Group();
    const moteGeometry = new SphereGeometry(0.012, 8, 8);
    for (let index = 0; index < 18; index += 1) {
      const material = new MeshStandardMaterial({
        color: index % 3 === 0 ? 0xffd875 : 0xb9f7d8,
        emissive: index % 3 === 0 ? 0xffb84d : 0x64dba8,
        emissiveIntensity: 1.5,
        transparent: true,
        opacity: 0.8,
      });
      const mote = new Mesh(moteGeometry, material);
      const angle = (index / 18) * Math.PI * 2;
      mote.position.set(
        Math.cos(angle) * (0.75 + (index % 4) * 0.12),
        0.25 + ((index * 37) % 13) * 0.13,
        -0.25 + Math.sin(angle) * 0.35,
      );
      mote.userData.phase = index * 0.7;
      motes.add(mote);
    }
    scene.add(motes);

    let active = true;
    let animationId = 0;
    let currentVrm: VRM | null = null;
    let bindings: SegmentBinding[] = [];
    let fingerBindings: FingerBinding[] = [];
    let faceExpressionValues: Partial<Record<ExpressionName, number>> = {};
    let heldFaceTargets: FaceExpressionTargets = {
      ...ZERO_FACE_TARGETS,
    };
    let fittedModelSize: Vector3 | null = null;
    const timer = new Timer();
    timer.connect(document);

    const fitCamera = () => {
      if (!fittedModelSize) return;

      const verticalFov = MathUtils.degToRad(camera.fov);
      const horizontalFov =
        2 * Math.atan(Math.tan(verticalFov / 2) * Math.max(camera.aspect, 0.1));
      const heightDistance =
        fittedModelSize.y / 2 / Math.tan(verticalFov / 2);
      const widthDistance =
        fittedModelSize.x / 2 / Math.tan(horizontalFov / 2);
      camera.position.y = fittedModelSize.y * 0.52;
      camera.position.z =
        Math.max(cameraDistance, heightDistance, widthDistance) * 1.12;
      camera.lookAt(0, fittedModelSize.y * 0.5, 0);
      camera.updateProjectionMatrix();
    };

    const loader = new GLTFLoader();
    loader.register((parser) => new VRMLoaderPlugin(parser));
    loader.load(
      modelPath,
      (gltf) => {
        if (!active) return;
        const vrm = gltf.userData.vrm as VRM | undefined;
        if (!vrm) {
          onError("VRM 檔案格式無法辨識。");
          return;
        }

        VRMUtils.removeUnnecessaryVertices(vrm.scene);
        VRMUtils.combineSkeletons(vrm.scene);
        VRMUtils.rotateVRM0(vrm);
        vrm.scene.scale.setScalar(modelScale);
        scene.add(vrm.scene);
        vrm.scene.updateMatrixWorld(true);

        const bounds = new Box3().setFromObject(vrm.scene);
        const center = bounds.getCenter(new Vector3());
        const size = bounds.getSize(new Vector3());
        vrm.scene.position.x -= center.x;
        vrm.scene.position.y -= bounds.min.y;
        fittedModelSize = size;
        fitCamera();
        vrm.scene.updateMatrixWorld(true);
        bindings = makeBindings(vrm);
        fingerBindings = makeFingerBindings(vrm);
        currentVrm = vrm;
        onReady();
      },
      undefined,
      () => onError("VRM 模型載入失敗，請確認設定檔中的路徑。"),
    );

    const resize = () => {
      const width = Math.max(1, mount.clientWidth);
      const height = Math.max(1, mount.clientHeight);
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      fitCamera();
    };
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(mount);
    resize();

    const animate = () => {
      if (!active) return;
      timer.update();
      const delta = Math.min(timer.getDelta(), 0.05);
      const elapsed = timer.getElapsed();
      if (currentVrm) {
        if (poseRef.current) {
          retargetPose(
            currentVrm,
            bindings,
            poseRef.current,
            reducedMotion ? 0.18 : 0.34,
          );
        } else {
          currentVrm.scene.rotation.y =
            Math.sin(elapsed * 0.7) * (reducedMotion ? 0.01 : 0.025);
        }

        const now = performance.now();
        const motion = avatarMotionRef.current;
        const freshHands = motion
          ? motion.hands.filter(
              ({ side }) =>
                now - handSeenAtRef.current[side] <= motionLostHoldMs,
            )
          : [];
        const trackedSides =
          motion && freshHands.length > 0
            ? retargetFingers(
                fingerBindings,
                { ...motion, hands: freshHands },
                motionBlend(motionSmoothing, delta),
              )
            : new Set<HandSide>();
        const staleSides = new Set<HandSide>();
        for (const side of ["left", "right"] as const) {
          if (
            !trackedSides.has(side) &&
            now - handSeenAtRef.current[side] > motionLostHoldMs
          ) {
            staleSides.add(side);
          }
        }
        if (staleSides.size > 0) {
          const relaxSeconds = Math.max(0.001, motionRelaxMs / 1000);
          relaxFingers(
            fingerBindings,
            staleSides,
            1 - Math.exp(-delta / relaxSeconds),
          );
        }

        if (
          motion?.face &&
          now - faceSeenAtRef.current <= motionLostHoldMs
        ) {
          heldFaceTargets = faceBlendshapesToVrmExpressions(
            motion.face.blendshapes,
          );
        } else if (
          now - faceSeenAtRef.current > motionLostHoldMs
        ) {
          heldFaceTargets = ZERO_FACE_TARGETS;
        }
        applyFaceExpressions(
          currentVrm,
          heldFaceTargets,
          faceExpressionValues,
          delta,
          motionSmoothing,
        );
        currentVrm.update(delta);
      }

      if (!reducedMotion) {
        motes.children.forEach((mote) => {
          const phase = Number(mote.userData.phase);
          mote.position.y += Math.sin(elapsed * 1.2 + phase) * 0.0007;
          mote.scale.setScalar(0.75 + Math.sin(elapsed * 1.8 + phase) * 0.22);
        });
      }

      renderer.render(scene, camera);
      animationId = requestAnimationFrame(animate);
    };
    animate();

    return () => {
      active = false;
      cancelAnimationFrame(animationId);
      resizeObserver.disconnect();
      timer.dispose();
      currentVrm?.expressionManager?.resetValues();
      currentVrm?.scene.traverse((object) => {
        if (!(object instanceof Mesh)) return;
        object.geometry?.dispose();
        const materials = Array.isArray(object.material)
          ? object.material
          : [object.material];
        materials.forEach((material) => material.dispose());
      });
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [
    cameraDistance,
    modelPath,
    modelScale,
    motionLostHoldMs,
    motionRelaxMs,
    motionSmoothing,
    onError,
    onReady,
    reducedMotion,
  ]);

  return (
    <div
      ref={mountRef}
      className={`vrm-preview${mirrored ? " vrm-preview--mirrored" : ""}`}
      aria-label="會跟著你動作的魔法夥伴"
    />
  );
}
