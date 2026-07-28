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
  VRMHumanBoneName,
  VRMLoaderPlugin,
  VRMUtils,
} from "@pixiv/three-vrm";
import { mediaPipeSegmentToVrmDirection } from "../lib/vrmRetarget";
import type { DetectedPose, Landmark } from "../types";

interface VrmPreviewProps {
  modelPath: string;
  modelScale: number;
  cameraDistance: number;
  mirrored: boolean;
  pose: DetectedPose | null;
  reducedMotion: boolean;
  onReady: () => void;
  onError: (message: string) => void;
}

interface SegmentBinding {
  boneName: (typeof VRMHumanBoneName)[keyof typeof VRMHumanBoneName];
  childBoneName: (typeof VRMHumanBoneName)[keyof typeof VRMHumanBoneName];
  start: number;
  end: number;
  restWorldDirection: Vector3;
  restWorldQuaternion: Quaternion;
}

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
  reducedMotion,
  onReady,
  onError,
}: VrmPreviewProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  const poseRef = useRef<DetectedPose | null>(pose);

  useEffect(() => {
    poseRef.current = pose;
  }, [pose]);

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
