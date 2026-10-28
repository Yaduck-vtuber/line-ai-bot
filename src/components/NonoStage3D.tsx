import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RefreshCw, X } from 'lucide-react';
import { NonoIdleAction } from '../types';
import {
  createOrganicBlobGeometry,
  createMochiFacialFeatures,
} from '../fur/blobCreature';
import { createGPUFurSystem } from '../fur/furSystem';

export interface PanelThemePalette {
  id: string;
  name: string;
  sub: string;
  bgBase: string;
  panelBg: string;
  panelCard: string;
  border: string;
  accent: string;
  accentSecondary: string;
  highlightTagBg: string;
  highlightTagText: string;
  textMain: string;
  textMuted: string;
  glowRgba: string;
}

interface NonoStage3DProps {
  furColor: string;
  customModelUrl: string | null;
  modelScale?: number;
  onModelScaleChange?: (scale: number) => void;
  isThinking: boolean;
  isAwake: boolean;
  idleAction: NonoIdleAction;
  nonoSpeech: string;
  actionLabel: string;
  careBadgeText: string;
  isBubbleOpen: boolean;
  onToggleBubble: (open: boolean) => void;
  panelTheme: PanelThemePalette;
  onSelectNono: () => void;
  onAutoSleep: () => void;
  onEnterDeepSleep: () => void;
  onDragEndNono: () => void;
}

// Critically-damped Second-Order Spring Physics Solver for organic, non-abrupt motion
class Spring1D {
  position: number;
  velocity = 0;
  target: number;
  stiffness: number;
  damping: number;

  constructor(initial = 0, stiffness = 75, damping = 15) {
    this.position = initial;
    this.target = initial;
    this.stiffness = stiffness;
    this.damping = damping;
  }

  update(dt: number): number {
    const safeDt = Math.min(Math.max(dt, 0.001), 0.05);
    const force = -this.stiffness * (this.position - this.target);
    const dampForce = -this.damping * this.velocity;
    this.velocity += (force + dampForce) * safeDt;
    this.position += this.velocity * safeDt;
    return this.position;
  }

  impulse(vel: number) {
    this.velocity += vel;
  }
}

const _pointerNdc = new THREE.Vector2();
const _dragPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
const _planeIntersect = new THREE.Vector3();
const _dragOffset = new THREE.Vector3();
const _headWorldPos = new THREE.Vector3();

/**
 * Curated Two-Tone Fur Palettes (Including ILLGATOR "怠。" MV Venom Magenta & Turquoise!)
 */
export function resolveFurGradientPair(hex: string): {
  base: string;
  tip: string;
  skin: string;
} {
  const normalized = hex.trim().toLowerCase();
  const presetMap: Record<string, { base: string; tip: string; skin: string }> = {
    '#ff1e7a': { base: '#831843', tip: '#00e5c3', skin: '#3b0922' }, // 怠。ヴェノム毒莓 (ILLGATOR)
    '#b845ff': { base: '#6d28d9', tip: '#ffa6dc', skin: '#3b1578' }, // 櫻花電光麻糬
    '#6366f1': { base: '#4338ca', tip: '#7dd3fc', skin: '#26206e' }, // 星夜霓虹紫
    '#ff5ca8': { base: '#db2777', tip: '#ffd6eb', skin: '#6b143b' }, // 草莓蜜桃軟糖
    '#38bdf8': { base: '#1d4ed8', tip: '#a5f3fc', skin: '#152c70' }, // 蘇打冰晶藍
    '#34d399': { base: '#0d9488', tip: '#dcfce7', skin: '#094a44' }, // 抹茶奶霜軟糖
    '#fb923c': { base: '#d97706', tip: '#fef08a', skin: '#6b3804' }, // 焦糖布丁軟糖
  };

  if (presetMap[normalized]) {
    return presetMap[normalized];
  }

  const c = new THREE.Color(hex);
  const hsl = { h: 0, s: 0, l: 0 };
  c.getHSL(hsl);

  const baseColor = new THREE.Color().setHSL(
    hsl.h,
    Math.min(1, hsl.s * 1.05),
    THREE.MathUtils.clamp(hsl.l * 0.72, 0.28, 0.55)
  );
  const tipColor = new THREE.Color().setHSL(
    (hsl.h + 0.05) % 1,
    Math.min(1, hsl.s * 1.0),
    THREE.MathUtils.clamp(hsl.l * 1.35, 0.76, 0.94)
  );
  const skinColor = baseColor.clone().multiplyScalar(0.5);

  return {
    base: `#${baseColor.getHexString()}`,
    tip: `#${tipColor.getHexString()}`,
    skin: `#${skinColor.getHexString()}`,
  };
}

function createSoftShadowTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  const grad = ctx.createRadialGradient(128, 128, 16, 128, 128, 120);
  grad.addColorStop(0, 'rgba(10, 6, 18, 0.75)');
  grad.addColorStop(0.55, 'rgba(10, 6, 18, 0.28)');
  grad.addColorStop(1, 'rgba(10, 6, 18, 0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 256, 256);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function smoothWeight(w: number): number {
  const c = THREE.MathUtils.clamp(w, 0, 1);
  return c * c * (3 - 2 * c);
}

/**
 * Beloved Dialogue Star (Airbrushed Aura Elongated Cross Starburst)
 * Dynamically adapts its aura colors to the unified Panel Theme!
 */
export const PastelAuraStar: React.FC<{
  size?: number;
  className?: string;
  idSuffix?: string;
  accentColor?: string;
  secondaryColor?: string;
  coreColor?: string;
  variant?: string;
}> = ({
  size = 34,
  className = '',
  idSuffix = '1',
  accentColor = '#ff1e7a',
  secondaryColor = '#00e5c3',
  coreColor = '#ccff00',
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 64 64"
    fill="none"
    className={`select-none ${className}`}
  >
    <defs>
      <radialGradient id={`auraGrad-${idSuffix}`} cx="50%" cy="50%" r="50%">
        <stop offset="0%" stopColor={coreColor} stopOpacity="0.95" />
        <stop offset="45%" stopColor={accentColor} stopOpacity="0.72" />
        <stop offset="82%" stopColor={secondaryColor} stopOpacity="0.32" />
        <stop offset="100%" stopColor={secondaryColor} stopOpacity="0" />
      </radialGradient>
    </defs>
    <circle cx="32" cy="32" r="25" fill={`url(#auraGrad-${idSuffix})`} />
    {/* Diagonal secondary rays */}
    <path
      d="M14 14 L29 29 L32 32 L35 29 L50 14 L35 32 L50 50 L32 35 L14 50 L29 32 Z"
      fill={secondaryColor}
      fillOpacity="0.78"
    />
    {/* Long-axis 4-point primary star */}
    <path
      d="M32 2 C33.8 22 36 28.2 62 32 C36 35.8 33.8 42 32 62 C30.2 42 28 35.8 2 32 C28 28.2 30.2 22 32 2 Z"
      fill="#ffffff"
      stroke={accentColor}
      strokeWidth="1.4"
    />
    <circle cx="32" cy="32" r="3.8" fill={coreColor} />
  </svg>
);

export const NonoStage3D: React.FC<NonoStage3DProps> = ({
  furColor,
  customModelUrl,
  modelScale = 1.0,
  onModelScaleChange,
  isThinking,
  isAwake,
  idleAction,
  nonoSpeech,
  actionLabel,
  careBadgeText,
  isBubbleOpen,
  onToggleBubble,
  panelTheme,
  onSelectNono,
  onAutoSleep,
  onEnterDeepSleep,
  onDragEndNono,
}) => {
  const canvasMountRef = useRef<HTMLDivElement | null>(null);
  const bubbleOverlayRef = useRef<HTMLDivElement | null>(null);

  const onSelectRef = useRef(onSelectNono);
  onSelectRef.current = onSelectNono;
  const onAutoSleepRef = useRef(onAutoSleep);
  onAutoSleepRef.current = onAutoSleep;
  const onEnterDeepSleepRef = useRef(onEnterDeepSleep);
  onEnterDeepSleepRef.current = onEnterDeepSleep;
  const onDragEndRef = useRef(onDragEndNono);
  onDragEndRef.current = onDragEndNono;
  const onModelScaleChangeRef = useRef(onModelScaleChange);
  onModelScaleChangeRef.current = onModelScaleChange;

  const [isDraggingNono, setIsDraggingNono] = useState(false);

  // Tuned second-order springs
  const springsRef = useRef({
    headYaw: new Spring1D(0, 66, 14),
    headPitch: new Spring1D(0, 66, 14),
    headRoll: new Spring1D(0, 60, 13.5),
    squishY: new Spring1D(1, 110, 16.5),
    hopY: new Spring1D(0, 90, 15),
    eyeOpen: new Spring1D(1, 150, 19),
    peekZ: new Spring1D(0, 54, 13.5),
    zoomScale: new Spring1D(modelScale, 95, 16),
  });

  useEffect(() => {
    springsRef.current.zoomScale.target = THREE.MathUtils.clamp(modelScale, 0.45, 2.2);
  }, [modelScale]);

  // Continuous phase accumulators & crossfade weights
  const blendStateRef = useRef({
    breathPhase: 0,
    hopPhase: 0,
    swayPhase: 0,
    thinkPhase: 0,
    spinAngle: 0,
    breathSpeed: 2.0,
    breathAmp: 0.036,
    weights: {
      breathing: 1,
      happy_bounce: 0,
      curious_tilt: 0,
      thinking_look: 0,
      peeking: 0,
      sleepy: 0,
      deep_sleep: 0,
      startled_wake: 0,
      excited_spin: 0,
      ai_thinking: 0,
    },
  });

  const desktopPosRef = useRef({ x: 0.85, y: -0.24 });

  const stateRef = useRef({
    furColor,
    customModelUrl,
    idleAction,
    isThinking,
    cursorX: 0,
    cursorY: 0,
    isDragging: false,
    lastInteractionTime: performance.now(),
    autoSleeping: false,
    deepSleeping: false,
    startledUntil: 0,
    boopShockwave: 0,
  });

  const furUniformsRef = useRef<any>(null);
  const skinMatRef = useRef<THREE.MeshStandardMaterial | null>(null);
  const eyelidMatRef = useRef<THREE.MeshPhysicalMaterial | null>(null);

  useEffect(() => {
    stateRef.current.furColor = furColor;
    const { base, tip, skin } = resolveFurGradientPair(furColor);
    if (furUniformsRef.current) {
      furUniformsRef.current.uBaseColor.value.set(base);
      furUniformsRef.current.uTipColor.value.set(tip);
    }
    if (skinMatRef.current) {
      skinMatRef.current.color.set(skin);
    }
    if (eyelidMatRef.current) {
      eyelidMatRef.current.color.set(base);
      eyelidMatRef.current.emissive.set(skin);
      eyelidMatRef.current.sheenColor.set(tip);
    }
  }, [furColor]);

  useEffect(() => {
    stateRef.current.idleAction = idleAction;
    stateRef.current.autoSleeping = idleAction === 'sleepy' || idleAction === 'deep_sleep';
    stateRef.current.deepSleeping = idleAction === 'deep_sleep';

    if (idleAction === 'startled_wake') {
      stateRef.current.startledUntil = performance.now() + 900;
      stateRef.current.boopShockwave = 1.0;
      springsRef.current.squishY.impulse(1.8);
      springsRef.current.headPitch.impulse(-1.4);
    } else if (idleAction === 'happy_bounce' || idleAction === 'excited_spin') {
      springsRef.current.squishY.impulse(0.42);
    } else if (idleAction !== 'deep_sleep' && idleAction !== 'sleepy') {
      springsRef.current.squishY.impulse(0.2);
    }
  }, [idleAction]);

  useEffect(() => {
    stateRef.current.isThinking = isThinking;
  }, [isThinking]);

  const customModelGroupRef = useRef<THREE.Group | null>(null);
  const customMixerRef = useRef<THREE.AnimationMixer | null>(null);
  const customHeadBoneRef = useRef<THREE.Object3D | null>(null);

  useEffect(() => {
    stateRef.current.customModelUrl = customModelUrl;
    if (!customModelGroupRef.current) return;
    const group = customModelGroupRef.current;

    while (group.children.length > 0) {
      group.remove(group.children[0]);
    }
    customMixerRef.current = null;
    customHeadBoneRef.current = null;

    if (!customModelUrl) return;

    const loader = new GLTFLoader();
    loader.load(
      customModelUrl,
      (gltf) => {
        const model = gltf.scene;
        const box = new THREE.Box3().setFromObject(model);
        const size = box.getSize(new THREE.Vector3());
        const center = box.getCenter(new THREE.Vector3());
        const maxDim = Math.max(size.x, size.y, size.z) || 1;
        const scaleFactor = 1.65 / maxDim;

        model.scale.setScalar(scaleFactor);
        model.position.set(
          -center.x * scaleFactor,
          -box.min.y * scaleFactor - 0.65,
          -center.z * scaleFactor
        );

        model.traverse((child) => {
          if ((child as THREE.Mesh).isMesh) {
            child.castShadow = true;
            child.receiveShadow = true;
          }
          if (
            child.type === 'Bone' &&
            /head|neck|face/i.test(child.name) &&
            !customHeadBoneRef.current
          ) {
            customHeadBoneRef.current = child;
          }
        });

        if (gltf.animations && gltf.animations.length > 0) {
          const mixer = new THREE.AnimationMixer(model);
          const clip =
            THREE.AnimationClip.findByName(gltf.animations, 'Idle') ||
            gltf.animations[0];
          if (clip) {
            const action = mixer.clipAction(clip);
            action.fadeIn(0.5).play();
          }
          customMixerRef.current = mixer;
        }

        group.add(model);
        springsRef.current.squishY.impulse(0.5);
      },
      undefined,
      () => {
        // Ignore load error silently
      }
    );
  }, [customModelUrl]);

  useEffect(() => {
    const container = canvasMountRef.current;
    if (!container) return;

    const width = container.clientWidth || window.innerWidth;
    const height = container.clientHeight || window.innerHeight;

    const scene = new THREE.Scene();

    const camera = new THREE.PerspectiveCamera(36, width / height, 0.1, 100);
    camera.position.set(0, 0.3, 4.3);
    camera.lookAt(0, 0.05, 0);

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance',
    });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.12;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(width, height);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    // Clean, warning-free 3-point studio lighting (no PMREM RTT driver warnings)
    const hemiLight = new THREE.HemisphereLight(0xfce7f3, 0x1e1b4b, 1.25);
    scene.add(hemiLight);

    const keyLight = new THREE.DirectionalLight(0xfff7ed, 2.35);
    keyLight.position.set(3.0, 4.2, 3.6);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.width = 1024;
    keyLight.shadow.mapSize.height = 1024;
    keyLight.shadow.bias = -0.0005;
    keyLight.shadow.normalBias = 0.02;
    scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight(0xc4b5fd, 1.9);
    rimLight.position.set(-3.2, 2.0, -3.5);
    scene.add(rimLight);

    const fillLight = new THREE.DirectionalLight(0xf9a8d4, 0.85);
    fillLight.position.set(-2.2, 1.2, 3.0);
    scene.add(fillLight);

    // =========================================================================
    // MAIN NONO ROOT (MOCHI-PUFF 3D GPU FUR + 3D EYELIDS + FUR COVERAGE)
    // =========================================================================
    const nonoRoot = new THREE.Group();
    nonoRoot.position.set(desktopPosRef.current.x, desktopPosRef.current.y, 0);
    scene.add(nonoRoot);

    const shadowTex = createSoftShadowTexture();
    const shadowGeo = new THREE.PlaneGeometry(2.35, 1.8);
    const shadowMat = new THREE.MeshBasicMaterial({
      map: shadowTex,
      transparent: true,
      depthWrite: false,
      opacity: 0.65,
    });
    const shadowMesh = new THREE.Mesh(shadowGeo, shadowMat);
    shadowMesh.rotation.x = -Math.PI / 2;
    shadowMesh.position.y = -0.05;
    nonoRoot.add(shadowMesh);

    const nonoBodyPivot = new THREE.Group();
    const BASE_BODY_SCALE = 0.72;
    nonoBodyPivot.position.set(0, 0.56, 0);
    nonoBodyPivot.scale.setScalar(BASE_BODY_SCALE);
    nonoRoot.add(nonoBodyPivot);

    const grabProxyGeo = new THREE.SphereGeometry(1.38, 18, 18);
    const grabProxyMat = new THREE.MeshBasicMaterial({
      transparent: true,
      opacity: 0,
      depthWrite: false,
    });
    const grabProxyMesh = new THREE.Mesh(grabProxyGeo, grabProxyMat);
    nonoBodyPivot.add(grabProxyMesh);

    const builtInCharacterGroup = new THREE.Group();
    nonoBodyPivot.add(builtInCharacterGroup);

    // 1. Sculpted Mochi-Puff Organic Blob Geometry
    const blobGeometry = createOrganicBlobGeometry(96, 72);
    const initialPair = resolveFurGradientPair(stateRef.current.furColor);

    const skinMaterial = new THREE.MeshStandardMaterial({
      color: new THREE.Color(initialPair.skin),
      roughness: 0.85,
      metalness: 0.05,
    });
    skinMatRef.current = skinMaterial;

    const baseSkinMesh = new THREE.Mesh(blobGeometry, skinMaterial);
    baseSkinMesh.name = 'CreatureBaseSkin';
    baseSkinMesh.castShadow = true;
    baseSkinMesh.receiveShadow = true;
    builtInCharacterGroup.add(baseSkinMesh);

    // 2. Unified Glossy Anime Eyes + 3D Upper/Lower Eyelid Shells + Rosy Blush + Nose + W-Mouth
    const facialFeatures = createMochiFacialFeatures();
    facialFeatures.eyelidMaterial.color.set(initialPair.base);
    facialFeatures.eyelidMaterial.emissive.set(initialPair.skin);
    facialFeatures.eyelidMaterial.sheenColor.set(initialPair.tip);
    eyelidMatRef.current = facialFeatures.eyelidMaterial;
    builtInCharacterGroup.add(facialFeatures.faceGroup);

    // 3. 64-Layer Volumetric GPU Shells + 60,000 3D Tapered Hair Strands (with dynamic uEyeClosure fur coverage)
    const furSystem = createGPUFurSystem(blobGeometry, {
      furLength: 0.31,
      furDensity: 0.78,
      clumping: 0.35,
      curliness: 0.23,
      baseColor: initialPair.base,
      tipColor: initialPair.tip,
      roughness: 0.74,
      specular: 0.28,
      lightIntensity: 1.38,
      rimIntensity: 1.4,
      windStrength: 0.85,
      gpuFurEnabled: true,
    });
    builtInCharacterGroup.add(furSystem.shellMesh);
    builtInCharacterGroup.add(furSystem.strandMesh);
    furUniformsRef.current = furSystem.sharedUniforms;

    const customModelGroup = new THREE.Group();
    customModelGroup.visible = false;
    nonoBodyPivot.add(customModelGroup);
    customModelGroupRef.current = customModelGroup;

    // =========================================================================
    // POINTER INTERACTION: FUR PETTING / PARTING + CLICK BOOP + STEADY DRAG
    // =========================================================================
    const raycaster = new THREE.Raycaster();
    let pointerDownClient = { x: 0, y: 0 };
    let isPointerDownOnNono = false;
    const pointerLocalPos = new THREE.Vector3(0, 0, 1);
    const prevPointerLocalPos = new THREE.Vector3(0, 0, 1);
    const pointerVelocity = new THREE.Vector3();
    let isPointerHoveringFur = false;

    const updateNdc = (clientX: number, clientY: number) => {
      const rect = renderer.domElement.getBoundingClientRect();
      _pointerNdc.x = ((clientX - rect.left) / rect.width) * 2 - 1;
      _pointerNdc.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    };

    const handlePointerDown = (e: PointerEvent) => {
      if (e.button !== 0) return;
      stateRef.current.lastInteractionTime = performance.now();
      updateNdc(e.clientX, e.clientY);
      raycaster.setFromCamera(_pointerNdc, camera);
      const hits = raycaster.intersectObjects(
        [grabProxyMesh, baseSkinMesh, customModelGroup],
        true
      );

      if (hits.length > 0) {
        isPointerDownOnNono = true;
        pointerDownClient = { x: e.clientX, y: e.clientY };
        raycaster.ray.intersectPlane(_dragPlane, _planeIntersect);
        _dragOffset.set(
          desktopPosRef.current.x - _planeIntersect.x,
          desktopPosRef.current.y - _planeIntersect.y,
          0
        );
        try {
          renderer.domElement.setPointerCapture(e.pointerId);
        } catch {
          // ignore
        }
      }
    };

    const handlePointerMove = (e: PointerEvent) => {
      updateNdc(e.clientX, e.clientY);
      stateRef.current.cursorX = _pointerNdc.x;
      stateRef.current.cursorY = _pointerNdc.y;

      raycaster.setFromCamera(_pointerNdc, camera);
      const skinHits = raycaster.intersectObject(baseSkinMesh, false);
      if (skinHits.length > 0 && !stateRef.current.isDragging) {
        const hitPoint = skinHits[0].point.clone();
        nonoBodyPivot.worldToLocal(hitPoint);
        prevPointerLocalPos.copy(pointerLocalPos);
        pointerLocalPos.copy(hitPoint);
        pointerVelocity.subVectors(pointerLocalPos, prevPointerLocalPos).multiplyScalar(32.0);
        isPointerHoveringFur = true;
      } else {
        isPointerHoveringFur = false;
        pointerVelocity.multiplyScalar(0.8);
      }

      if (!isPointerDownOnNono) return;

      const moveDist = Math.hypot(
        e.clientX - pointerDownClient.x,
        e.clientY - pointerDownClient.y
      );

      if (moveDist >= 14) {
        if (!stateRef.current.isDragging) {
          stateRef.current.isDragging = true;
          setIsDraggingNono(true);
        }
        if (raycaster.ray.intersectPlane(_dragPlane, _planeIntersect)) {
          desktopPosRef.current.x = THREE.MathUtils.clamp(
            _planeIntersect.x + _dragOffset.x,
            -2.1,
            2.1
          );
          desktopPosRef.current.y = THREE.MathUtils.clamp(
            _planeIntersect.y + _dragOffset.y,
            -1.15,
            0.45
          );
        }
      }
    };

    const handlePointerUp = (e: PointerEvent) => {
      if (!isPointerDownOnNono) return;
      isPointerDownOnNono = false;
      stateRef.current.lastInteractionTime = performance.now();
      try {
        renderer.domElement.releasePointerCapture(e.pointerId);
      } catch {
        // ignore
      }

      const moveDist = Math.hypot(
        e.clientX - pointerDownClient.x,
        e.clientY - pointerDownClient.y
      );

      if (stateRef.current.isDragging) {
        stateRef.current.isDragging = false;
        setIsDraggingNono(false);
        onDragEndRef.current?.();
      } else if (moveDist < 14) {
        const wasDeepSleep =
          stateRef.current.deepSleeping || stateRef.current.idleAction === 'deep_sleep';
        stateRef.current.autoSleeping = false;
        stateRef.current.deepSleeping = false;
        stateRef.current.boopShockwave = 1.0;

        if (wasDeepSleep) {
          stateRef.current.startledUntil = performance.now() + 900;
          springsRef.current.squishY.impulse(1.8);
          springsRef.current.headPitch.impulse(-1.4);
        } else {
          springsRef.current.squishY.impulse(0.52);
        }
        onSelectRef.current?.();
      }
    };

    // 滑鼠滾輪直接放大／縮小 3D Nono 模型（支援 0.45x ~ 2.2x 無段平滑縮放）
    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      stateRef.current.lastInteractionTime = performance.now();
      const step = e.deltaY < 0 ? 0.08 : -0.08;
      const nextZoom = THREE.MathUtils.clamp(
        Math.round((springsRef.current.zoomScale.target + step) * 100) / 100,
        0.45,
        2.2
      );
      springsRef.current.zoomScale.target = nextZoom;
      springsRef.current.squishY.impulse(e.deltaY < 0 ? 0.16 : -0.14);
      onModelScaleChangeRef.current?.(nextZoom);
    };

    renderer.domElement.addEventListener('pointerdown', handlePointerDown);
    renderer.domElement.addEventListener('wheel', handleWheel, { passive: false });
    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);

    const handleResize = () => {
      if (!container) return;
      const w = container.clientWidth || window.innerWidth;
      const h = container.clientHeight || window.innerHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener('resize', handleResize);

    // Kinematic & GPU fur inertia state trackers
    const prevPosition = new THREE.Vector3();
    const prevRotation = new THREE.Euler();
    const creatureVelocity = new THREE.Vector3();
    const creatureAngularVel = new THREE.Vector3();
    const webGLInertia = new THREE.Vector3();
    const webGLInertiaVel = new THREE.Vector3();

    const clock = new THREE.Clock();
    let frameId = 0;
    let isDisposed = false;

    function tick() {
      if (isDisposed) return;
      try {
        const delta = Math.min(clock.getDelta(), 0.05);
        const elapsed = clock.getElapsedTime();
        const nowMs = performance.now();
        const st = stateRef.current;
        const sp = springsRef.current;
        const bs = blendStateRef.current;
        const w = bs.weights;

        // Check inactivity timers:
        // 1) Over 5 minutes (300 seconds) -> Deep Sleep ('deep_sleep')
        // 2) Over 45 seconds -> Light nap ('sleepy')
        const idleSec = (nowMs - st.lastInteractionTime) / 1000;
        if (
          idleSec >= 300 &&
          !st.deepSleeping &&
          !st.isThinking &&
          st.idleAction !== 'deep_sleep'
        ) {
          st.deepSleeping = true;
          st.autoSleeping = true;
          onEnterDeepSleepRef.current?.();
        } else if (
          idleSec >= 45 &&
          idleSec < 300 &&
          !st.autoSleeping &&
          !st.deepSleeping &&
          !st.isThinking &&
          st.idleAction !== 'sleepy' &&
          st.idleAction !== 'deep_sleep'
        ) {
          st.autoSleeping = true;
          onAutoSleepRef.current?.();
        }

        const isCustom =
          Boolean(st.customModelUrl) && customModelGroup.children.length > 0;
        builtInCharacterGroup.visible = !isCustom;
        customModelGroup.visible = isCustom;

        if (customMixerRef.current) {
          customMixerRef.current.update(delta);
        }

        // Smoothly glide Nono's root position on the desktop
        nonoRoot.position.x = THREE.MathUtils.damp(
          nonoRoot.position.x,
          desktopPosRef.current.x,
          12,
          delta
        );
        nonoRoot.position.y = THREE.MathUtils.damp(
          nonoRoot.position.y,
          desktopPosRef.current.y,
          12,
          delta
        );

        const isStartledActive = nowMs < st.startledUntil;
        const activePose: NonoIdleAction = isStartledActive
          ? 'startled_wake'
          : st.deepSleeping
            ? 'deep_sleep'
            : st.autoSleeping && st.idleAction !== 'deep_sleep'
              ? 'sleepy'
              : st.idleAction;

        // =====================================================================
        // SMOOTH POSE CROSSFADE ENGINE
        // =====================================================================
        const blendRate = 4.0;
        w.breathing = THREE.MathUtils.damp(
          w.breathing,
          activePose === 'breathing' ? 1 : 0,
          blendRate,
          delta
        );
        w.happy_bounce = THREE.MathUtils.damp(
          w.happy_bounce,
          activePose === 'happy_bounce' ? 1 : 0,
          blendRate,
          delta
        );
        w.curious_tilt = THREE.MathUtils.damp(
          w.curious_tilt,
          activePose === 'curious_tilt' ? 1 : 0,
          blendRate,
          delta
        );
        w.thinking_look = THREE.MathUtils.damp(
          w.thinking_look,
          activePose === 'thinking_look' ? 1 : 0,
          blendRate,
          delta
        );
        w.peeking = THREE.MathUtils.damp(
          w.peeking,
          activePose === 'peeking' ? 1 : 0,
          blendRate,
          delta
        );
        w.sleepy = THREE.MathUtils.damp(
          w.sleepy,
          activePose === 'sleepy' ? 1 : 0,
          blendRate * 0.75,
          delta
        );
        w.deep_sleep = THREE.MathUtils.damp(
          w.deep_sleep,
          activePose === 'deep_sleep' ? 1 : 0,
          blendRate * 0.65,
          delta
        );
        w.excited_spin = THREE.MathUtils.damp(
          w.excited_spin,
          activePose === 'excited_spin' ? 1 : 0,
          blendRate,
          delta
        );
        w.startled_wake = THREE.MathUtils.damp(
          w.startled_wake,
          isStartledActive ? 1 : 0,
          10,
          delta
        );
        w.ai_thinking = THREE.MathUtils.damp(
          w.ai_thinking,
          st.isThinking ? 1 : 0,
          5.0,
          delta
        );

        const wHappy = smoothWeight(w.happy_bounce);
        const wCurious = smoothWeight(w.curious_tilt);
        const wThinkLook = smoothWeight(w.thinking_look);
        const wPeek = smoothWeight(w.peeking);
        const wSleepy = smoothWeight(w.sleepy);
        const wDeepSleep = smoothWeight(w.deep_sleep);
        const wExcited = smoothWeight(w.excited_spin);
        const wStartled = smoothWeight(w.startled_wake);
        const wAiThink = smoothWeight(w.ai_thinking);

        const sleepBlend = THREE.MathUtils.clamp(wSleepy + wDeepSleep, 0, 1);
        const awakeAttention = THREE.MathUtils.clamp(
          1 - sleepBlend - wAiThink * 0.85 - wStartled,
          0,
          1
        );

        const targetBreathSpeed =
          1.95 * (1 - sleepBlend) + 1.15 * wSleepy + 0.82 * wDeepSleep;
        const targetBreathAmp =
          0.034 * (1 - sleepBlend) + 0.044 * wSleepy + 0.056 * wDeepSleep;

        bs.breathSpeed = THREE.MathUtils.damp(
          bs.breathSpeed,
          targetBreathSpeed,
          4,
          delta
        );
        bs.breathAmp = THREE.MathUtils.damp(
          bs.breathAmp,
          targetBreathAmp,
          4,
          delta
        );

        bs.breathPhase += delta * bs.breathSpeed;
        bs.hopPhase +=
          delta * (5.2 * wHappy + 5.8 * wExcited + 3.6 * wAiThink + 1.4);
        bs.swayPhase += delta * 1.35;
        bs.thinkPhase += delta * 1.65;

        if (wExcited > 0.01) {
          bs.spinAngle += delta * 4.8 * wExcited;
        } else {
          const modAngle =
            ((bs.spinAngle % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
          const shortest =
            modAngle > Math.PI ? modAngle - Math.PI * 2 : modAngle;
          bs.spinAngle = THREE.MathUtils.damp(shortest, 0, 6, delta);
        }

        // Cursor gaze vector (ZERO when sleeping!)
        const rawCursorX = THREE.MathUtils.clamp(
          st.cursorX - nonoRoot.position.x * 0.42,
          -1.2,
          1.2
        );
        const rawCursorY = THREE.MathUtils.clamp(
          st.cursorY - nonoRoot.position.y * 0.42,
          -1.2,
          1.2
        );
        const relCursorX = rawCursorX * (1 - sleepBlend);
        const relCursorY = rawCursorY * (1 - sleepBlend);

        // 1. HEAD YAW
        const gazeSuppression = Math.max(wThinkLook * 0.45, wExcited * 0.85);
        const baseGazeYaw =
          relCursorX * 0.68 * (1 - gazeSuppression) +
          Math.sin(bs.swayPhase * 0.55) * 0.045 * (1 - sleepBlend);

        const layerYaw =
          Math.sin(bs.thinkPhase * 0.85) * 0.44 * wThinkLook +
          Math.sin(bs.swayPhase * 1.1) * 0.24 * wPeek +
          Math.sin(bs.hopPhase * 0.5) * 0.18 * wHappy +
          (bs.spinAngle + Math.sin(elapsed * 15.0) * 0.2) * wExcited;

        const aiThinkYaw = Math.sin(bs.thinkPhase) * 0.46 * wAiThink;
        const startledYaw = Math.sin(elapsed * 26) * 0.26 * wStartled;

        sp.headYaw.target =
          (baseGazeYaw + layerYaw) * awakeAttention + aiThinkYaw + startledYaw;

        // 2. HEAD PITCH
        const baseGazePitch =
          -relCursorY * 0.4 * (1 - gazeSuppression * 0.5) +
          Math.cos(bs.swayPhase * 0.48) * 0.03 * (1 - sleepBlend);

        const layerPitch =
          (-0.16 + Math.cos(bs.thinkPhase * 1.3) * 0.08) * wThinkLook +
          -0.16 * wExcited +
          Math.sin(bs.hopPhase) * -0.14 * wHappy +
          0.08 * wPeek +
          -0.05 * wCurious;

        const sleepPitch = 0.28 * wSleepy + 0.38 * wDeepSleep;
        const aiThinkPitch =
          (-0.18 + Math.cos(bs.thinkPhase * 1.2) * 0.1) * wAiThink;
        const startledPitch = -0.22 * wStartled;

        sp.headPitch.target =
          (baseGazePitch + layerPitch) * awakeAttention +
          sleepPitch +
          aiThinkPitch +
          startledPitch;

        // 3. HEAD ROLL
        const baseGazeRoll = relCursorX * 0.12 * (1 - sleepBlend);
        const layerRoll =
          (0.32 + Math.sin(bs.swayPhase * 1.1) * 0.07) * wCurious +
          Math.sin(bs.hopPhase * 0.5) * 0.26 * wHappy +
          Math.sin(bs.thinkPhase * 0.85) * -0.12 * wThinkLook +
          Math.sin(bs.swayPhase * 1.1) * 0.08 * wPeek +
          Math.sin(elapsed * 13.0) * 0.18 * wExcited;

        const sleepRoll = 0.16 * wSleepy + 0.24 * wDeepSleep;
        const aiThinkRoll = Math.sin(bs.thinkPhase * 1.2) * 0.16 * wAiThink;
        const startledRoll = Math.cos(elapsed * 24) * 0.18 * wStartled;

        sp.headRoll.target =
          (baseGazeRoll + layerRoll) * awakeAttention +
          sleepRoll +
          aiThinkRoll +
          startledRoll;

        // 4. PEEK Z
        sp.peekZ.target =
          0.44 * wPeek +
          0.14 * wCurious +
          0.14 * wAiThink +
          0.12 * wStartled -
          0.08 * wDeepSleep;

        // 5. HOP Y
        const rawHopWave = Math.abs(Math.sin(bs.hopPhase));
        sp.hopY.target =
          rawHopWave * (0.34 * wHappy + 0.24 * wExcited + 0.08 * wAiThink) +
          0.02 * wCurious +
          0.26 * wStartled -
          0.05 * wSleepy -
          0.09 * wDeepSleep;

        const yaw = sp.headYaw.update(delta);
        const pitch = sp.headPitch.update(delta);
        const roll = sp.headRoll.update(delta);
        const peekZ = sp.peekZ.update(delta);
        const smoothHopY = sp.hopY.update(delta);

        // 6. SQUASH & STRETCH + BREATHING
        const breathWave = Math.sin(bs.breathPhase);
        const bounceSquash =
          Math.sin(bs.hopPhase * 2.0 - 0.4) * (0.13 * wHappy + 0.1 * wExcited);
        const sleepFlatten = -0.05 * wSleepy - 0.09 * wDeepSleep;

        sp.squishY.target =
          1.0 + breathWave * bs.breathAmp + bounceSquash + sleepFlatten;

        const curScaleY = sp.squishY.update(delta);
        const curScaleXZ = THREE.MathUtils.clamp(2.0 - curScaleY, 0.86, 1.16);
        const curZoom = sp.zoomScale.update(delta);
        const effectiveBaseScale = BASE_BODY_SCALE * curZoom;

        nonoBodyPivot.scale.set(
          effectiveBaseScale * curScaleXZ,
          effectiveBaseScale * curScaleY,
          effectiveBaseScale * curScaleXZ
        );
        nonoBodyPivot.position.y = 0.56 * curZoom + breathWave * 0.022 + smoothHopY;
        nonoBodyPivot.position.z = peekZ;

        nonoBodyPivot.rotation.y = yaw;
        nonoBodyPivot.rotation.x = pitch;
        nonoBodyPivot.rotation.z = roll;

        if (customHeadBoneRef.current) {
          customHeadBoneRef.current.rotation.y = yaw * 0.5;
          customHeadBoneRef.current.rotation.x = pitch * 0.5;
        }

        // =====================================================================
        // 3D EYELIDS + FUR-COVERED CLOSED EYELIDS (Never squashes the eyeball!)
        // =====================================================================
        const blinkCycle = elapsed % 3.9;
        const isNaturalBlink = blinkCycle > 3.74;
        const happySquint = rawHopWave > 0.65 ? 0.34 : 1.0;
        const awakeEyeTarget = isNaturalBlink
          ? 0.02
          : THREE.MathUtils.lerp(
              1.0 + 0.08 * wCurious + 0.08 * wPeek,
              happySquint,
              wHappy * 0.82
            );
        // Sleepy = half-closed drowsy eyelids (0.28), Deep sleep = fully closed eyelids (0.0)
        const sleepEyeTarget = THREE.MathUtils.lerp(0.26, 0.0, wDeepSleep);

        sp.eyeOpen.target = isStartledActive
          ? 1.15
          : THREE.MathUtils.lerp(awakeEyeTarget, sleepEyeTarget, sleepBlend);

        const eyeOpenVal = sp.eyeOpen.update(delta);
        const eyeClosure = THREE.MathUtils.clamp(1.0 - eyeOpenVal, 0.0, 1.0);

        for (const eye of facialFeatures.eyes) {
          // Keep the eyeball itself round (no flat squashing!)
          eye.pivot.scale.set(1.0, 1.0, 1.0);

          // Rotate 3D Upper & Lower Eyelids closed over the cornea
          eye.upperLidPivot.rotation.x = THREE.MathUtils.lerp(
            -1.28,
            0.06,
            eyeClosure
          );
          eye.lowerLidPivot.rotation.x = THREE.MathUtils.lerp(
            1.28,
            -0.06,
            eyeClosure
          );

          // Show curved eyelash seam when lids are mostly closed
          eye.closedSeamArc.visible = eyeClosure > 0.62;

          // Hide bright catchlights when eyelids cover them
          const catchlightVis = eyeClosure < 0.72;
          eye.catchlightMain.visible = catchlightVis;
          eye.catchlightSub.visible = catchlightVis;

          eye.catchlightMain.position.x =
            -eye.side * 0.042 + relCursorX * 0.024;
          eye.catchlightMain.position.y = 0.052 + relCursorY * 0.02;
        }

        const blushTarget =
          0.44 +
          0.22 * (wHappy + wExcited) +
          (isPointerHoveringFur ? 0.2 : 0.0) +
          Math.sin(elapsed * 2.0) * 0.04;
        facialFeatures.blushMat.opacity = THREE.MathUtils.clamp(
          blushTarget,
          0.3,
          0.78
        );

        // =====================================================================
        // STEP GPU FUR INERTIA + DYNAMIC EYELID FUR COVERAGE (uEyeClosure)
        // =====================================================================
        const safeDt = Math.max(delta, 0.001);
        creatureVelocity
          .subVectors(nonoBodyPivot.position, prevPosition)
          .divideScalar(safeDt)
          .clampLength(0, 10.0);

        creatureAngularVel
          .set(
            (nonoBodyPivot.rotation.x - prevRotation.x) / safeDt,
            (nonoBodyPivot.rotation.y - prevRotation.y) / safeDt,
            (nonoBodyPivot.rotation.z - prevRotation.z) / safeDt
          )
          .clampLength(0, 12.0);

        prevPosition.copy(nonoBodyPivot.position);
        prevRotation.copy(nonoBodyPivot.rotation);

        if (st.boopShockwave > 0.001) {
          st.boopShockwave = Math.max(0.0, st.boopShockwave - delta * 1.9);
        } else {
          st.boopShockwave = 0.0;
        }

        const targetInertiaX =
          -creatureVelocity.x * 0.06 - creatureAngularVel.z * 0.05;
        const targetInertiaY =
          -creatureVelocity.y * 0.06 + creatureAngularVel.x * 0.05;
        const targetInertiaZ =
          -creatureVelocity.z * 0.06 + creatureAngularVel.y * 0.05;

        webGLInertiaVel.x +=
          ((targetInertiaX - webGLInertia.x) * 30.0 - webGLInertiaVel.x * 6.5) *
          delta;
        webGLInertiaVel.y +=
          ((targetInertiaY - webGLInertia.y) * 30.0 - webGLInertiaVel.y * 6.5) *
          delta;
        webGLInertiaVel.z +=
          ((targetInertiaZ - webGLInertia.z) * 30.0 - webGLInertiaVel.z * 6.5) *
          delta;
        webGLInertia.addScaledVector(webGLInertiaVel, delta);
        webGLInertia.clampLength(0.0, 0.35);

        const furUni = furSystem.sharedUniforms;
        furUni.uTime.value = elapsed;
        furUni.uWebGLInertia.value.copy(webGLInertia);
        furUni.uBoopShockwave.value = st.boopShockwave;
        furUni.uPointerLocalPos.value.copy(pointerLocalPos);
        furUni.uPointerActive.value = isPointerHoveringFur ? 1.0 : 0.0;
        // Pass eyeClosure to GPU fur shaders so fur covers the closed eyelids!
        furUni.uEyeClosure.value = eyeClosure;

        const sScale = (1.0 - smoothHopY * 0.5 + peekZ * 0.12) * curZoom;
        shadowMesh.scale.setScalar(THREE.MathUtils.clamp(sScale, 0.4, 2.4));

        // =====================================================================
        // ANCHOR SPEECH BUBBLE & ZZZ BUBBLE OUTSIDE NONO'S SILHOUETTE (NEVER OVERLAPS NONO!)
        // =====================================================================
        if (bubbleOverlayRef.current) {
          const viewW = container.clientWidth || window.innerWidth;
          const viewH = container.clientHeight || window.innerHeight;

          // 1. Project Nono's 3D body center
          _headWorldPos.set(
            nonoRoot.position.x,
            nonoRoot.position.y + 0.56 * curZoom + smoothHopY * 0.35,
            peekZ * 0.5
          );
          _headWorldPos.project(camera);
          const centerScreenX = (_headWorldPos.x * 0.5 + 0.5) * viewW;
          const centerScreenY = (-_headWorldPos.y * 0.5 + 0.5) * viewH;

          // 2. Project Nono's top-outer hair crown (above all fur strands)
          _headWorldPos.set(
            nonoRoot.position.x,
            nonoRoot.position.y + (0.56 + 1.12 * curZoom) + smoothHopY * 0.35,
            peekZ * 0.5
          );
          _headWorldPos.project(camera);
          const crownScreenY = (-_headWorldPos.y * 0.5 + 0.5) * viewH;

          // 3. Project Nono's outer right fur edge to get exact 2D pixel radius
          _headWorldPos.set(
            nonoRoot.position.x + 1.12 * curZoom,
            nonoRoot.position.y + 0.56 * curZoom + smoothHopY * 0.35,
            peekZ * 0.5
          );
          _headWorldPos.project(camera);
          const edgeScreenX = (_headWorldPos.x * 0.5 + 0.5) * viewW;
          const nonoRadiusPx = Math.max(96, Math.abs(edgeScreenX - centerScreenX));

          const bubbleEl = bubbleOverlayRef.current;
          const bubbleW = bubbleEl.offsetWidth || 350;
          const bubbleH = bubbleEl.offsetHeight || 150;

          // Check if there is enough vertical clearance ABOVE Nono's crown without clipping top of viewport
          const topClearY = crownScreenY - 16;
          if (topClearY - bubbleH >= 52) {
            // Place cleanly ABOVE Nono's head crown (zero overlap!)
            const minX = bubbleW * 0.5 + 16;
            const maxX = Math.max(minX, viewW - bubbleW * 0.5 - 16);
            const clampedX = THREE.MathUtils.clamp(centerScreenX, minX, maxX);
            bubbleEl.style.transform = `translate3d(${Math.round(
              clampedX
            )}px, ${Math.round(topClearY)}px, 0) translate(-50%, -100%)`;
          } else {
            // Nono is near the top of the screen -> Place BESIDE Nono (left or right outside nonoRadiusPx) so it NEVER covers Nono!
            const placeOnLeft = centerScreenX > viewW * 0.48;
            const sideAnchorX = placeOnLeft
              ? Math.max(bubbleW + 16, centerScreenX - nonoRadiusPx - 20)
              : Math.min(viewW - bubbleW - 16, centerScreenX + nonoRadiusPx + 20);
            const sideAnchorY = THREE.MathUtils.clamp(
              centerScreenY,
              56 + bubbleH * 0.5,
              Math.max(120, viewH - bubbleH * 0.5 - 20)
            );
            bubbleEl.style.transform = placeOnLeft
              ? `translate3d(${Math.round(sideAnchorX)}px, ${Math.round(
                  sideAnchorY
                )}px, 0) translate(-100%, -50%)`
              : `translate3d(${Math.round(sideAnchorX)}px, ${Math.round(
                  sideAnchorY
                )}px, 0) translate(0%, -50%)`;
          }
        }

        renderer.render(scene, camera);
      } catch {
        // Prevent any transient frame error from halting the loop
      } finally {
        if (!isDisposed) {
          frameId = requestAnimationFrame(tick);
        }
      }
    }

    frameId = requestAnimationFrame(tick);

    return () => {
      isDisposed = true;
      renderer.domElement.removeEventListener('pointerdown', handlePointerDown);
      renderer.domElement.removeEventListener('wheel', handleWheel);
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('resize', handleResize);
      cancelAnimationFrame(frameId);
      renderer.dispose();
    };
  }, []);

  return (
    <div className="fixed inset-0 z-10 overflow-hidden select-none">
      <div
        ref={canvasMountRef}
        className={`w-full h-full ${
          isDraggingNono ? 'cursor-grabbing' : 'cursor-pointer'
        }`}
      />

      {/* =========================================================================
          COMPANION SPEECH BUBBLE, DIALOGUE STAR & BIG ZZZ BUBBLE ANCHORED OUTSIDE NONO!
      ========================================================================= */}
      <div
        ref={bubbleOverlayRef}
        style={{
          left: 0,
          top: 0,
          transform: 'translate3d(70vw, 24vh, 0) translate(-50%, -100%)',
        }}
        className="fixed z-20 pointer-events-auto will-change-transform"
      >
        {idleAction === 'deep_sleep' ? (
          /* HIGH-VISIBILITY, LARGE '...zzZ...' DEEP SLEEP BUBBLE RIGHT ABOVE NONO */
          <div
            onClick={onSelectNono}
            className="relative group cursor-pointer select-none"
          >
            <PastelAuraStar
              size={46}
              idSuffix="sleep-L"
              accentColor={panelTheme.accent}
              secondaryColor={panelTheme.accentSecondary}
              coreColor={panelTheme.highlightTagBg}
              className="absolute -top-5 -left-5 animate-pulse pointer-events-none"
            />
            <PastelAuraStar
              size={36}
              idSuffix="sleep-R"
              accentColor={panelTheme.accentSecondary}
              secondaryColor={panelTheme.accent}
              coreColor={panelTheme.highlightTagBg}
              className="absolute -bottom-3 -right-4 animate-pulse pointer-events-none"
            />

            <div
              style={{
                backgroundColor: panelTheme.panelBg,
                borderColor: panelTheme.accent,
                boxShadow: `0 18px 46px rgba(4, 2, 10, 0.92), 0 0 32px ${panelTheme.glowRgba}`,
              }}
              className="relative px-7 py-4 rounded-2xl border-2 backdrop-blur-xl flex flex-col items-center gap-1.5 hover:scale-105 transition-transform"
            >
              {/* Diagonal Subculture Stripe Accent */}
              <div
                className="w-full h-1.5 rounded-full mb-0.5 opacity-90"
                style={{
                  backgroundImage: `repeating-linear-gradient(-45deg, ${panelTheme.accent}, ${panelTheme.accent} 6px, ${panelTheme.accentSecondary} 6px, ${panelTheme.accentSecondary} 12px)`,
                }}
              />

              <div
                style={{
                  backgroundColor: panelTheme.highlightTagBg,
                  color: panelTheme.highlightTagText,
                }}
                className="px-2.5 py-0.5 rounded-sm font-mono font-black text-[10px] tracking-wider shadow-xs"
              >
                SLEEP MODE · 點擊喚醒 NONO
              </div>

              {/* Large, Unmissable Animated ZZZ Typography */}
              <div className="flex items-baseline gap-1.5 py-1">
                <span
                  style={{ color: panelTheme.accent }}
                  className="text-xl font-black font-mono animate-bounce"
                >
                  ...z
                </span>
                <span
                  style={{
                    color: panelTheme.accentSecondary,
                    animationDelay: '120ms',
                  }}
                  className="text-3xl font-black font-mono animate-bounce"
                >
                  Z
                </span>
                <span
                  style={{
                    color: panelTheme.highlightTagBg,
                    animationDelay: '240ms',
                    filter: `drop-shadow(0 0 10px ${panelTheme.glowRgba})`,
                  }}
                  className="text-4xl font-black font-mono animate-bounce"
                >
                  Z...
                </span>
              </div>

              <div
                style={{ color: panelTheme.textMuted }}
                className="text-[11px] font-mono"
              >
                熟睡瞇眼中 · 點一下軟糖叫醒她
              </div>

              {/* Speech Tail pointing directly down to Nono's head */}
              <div
                style={{
                  backgroundColor: panelTheme.panelBg,
                  borderColor: panelTheme.accent,
                }}
                className="w-4 h-4 border-r-2 border-b-2 rotate-45 absolute -bottom-2.5 left-1/2 -translate-x-1/2"
              />
            </div>
          </div>
        ) : isBubbleOpen ? (
          /* AWAKE COMPANION DIALOGUE BUBBLE (Closable + Beloved Dialogue Stars + Unified Panel Theme!) */
          <div className="relative w-[340px] sm:w-[375px] max-w-[88vw]">
            {/* Beloved Dialogue Stars on the speech bubble corners! */}
            <PastelAuraStar
              size={44}
              idSuffix="awake-TL"
              accentColor={panelTheme.accent}
              secondaryColor={panelTheme.accentSecondary}
              coreColor={panelTheme.highlightTagBg}
              className="absolute -top-5 -left-5 z-10 pointer-events-none drop-shadow-[0_0_10px_rgba(255,255,255,0.35)]"
            />
            <PastelAuraStar
              size={32}
              idSuffix="awake-BR"
              accentColor={panelTheme.accentSecondary}
              secondaryColor={panelTheme.accent}
              coreColor={panelTheme.highlightTagBg}
              className="absolute -bottom-3 -right-3.5 z-10 pointer-events-none"
            />

            <div
              style={{
                backgroundColor: panelTheme.panelBg,
                borderColor: panelTheme.border,
                boxShadow: `0 18px 46px rgba(4, 2, 10, 0.92), 0 0 30px ${panelTheme.glowRgba}`,
              }}
              className="relative p-3.5 rounded-2xl border-2 backdrop-blur-xl overflow-hidden"
            >
              {/* Top Diagonal Stripe Accent Bar */}
              <div
                className="absolute top-0 left-0 right-0 h-1 opacity-90"
                style={{
                  backgroundImage: `repeating-linear-gradient(-45deg, ${panelTheme.accent}, ${panelTheme.accent} 8px, ${panelTheme.accentSecondary} 8px, ${panelTheme.accentSecondary} 16px)`,
                }}
              />

              {/* Top Header Row inside Companion Bubble */}
              <div className="flex items-center justify-between gap-2 mb-2 pt-0.5">
                <div className="flex items-center gap-1.5 min-w-0">
                  <span
                    style={{
                      background: `linear-gradient(90deg, ${panelTheme.accent}, ${panelTheme.accentSecondary})`,
                    }}
                    className="px-2 py-0.5 rounded-sm text-[10px] font-black tracking-wider text-white shadow-xs shrink-0"
                  >
                    NONO × AVE
                  </span>
                  <span
                    style={{
                      backgroundColor: panelTheme.highlightTagBg,
                      color: panelTheme.highlightTagText,
                    }}
                    className="px-2 py-0.5 rounded-sm font-mono font-extrabold text-[10px] tracking-tight truncate"
                  >
                    {careBadgeText}
                  </span>
                </div>

                {/* Right Controls: Refresh Care Line + Close Bubble Button */}
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={onSelectNono}
                    style={{
                      borderColor: panelTheme.border,
                      color: panelTheme.textMain,
                    }}
                    className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-white/8 hover:bg-white/15 border text-[10px] font-mono transition-colors cursor-pointer"
                    title="點一下換一句關心提醒"
                  >
                    <RefreshCw className="w-2.5 h-2.5" />
                    <span>換一句</span>
                  </button>

                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onToggleBubble(false);
                    }}
                    style={{
                      borderColor: panelTheme.border,
                      color: panelTheme.textMain,
                    }}
                    className="w-5 h-5 rounded-md bg-white/8 hover:bg-rose-500/40 border flex items-center justify-center transition-colors cursor-pointer"
                    title="關閉對話框（隨時可點對話星星或軟糖重新叫出）"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              </div>

              {/* Nono's Spoken Care / Post Notification Text */}
              <p
                onClick={onSelectNono}
                style={{ color: panelTheme.textMain }}
                className="text-xs leading-relaxed whitespace-pre-line cursor-pointer"
              >
                {nonoSpeech}
              </p>

              {/* Footer Row inside Bubble */}
              <div
                style={{
                  borderColor: `${panelTheme.border}44`,
                  color: panelTheme.textMuted,
                }}
                className="mt-2 pt-1.5 border-t flex items-center justify-between text-[10px] font-mono"
              >
                <span>狀態：{actionLabel}</span>
                <span style={{ color: panelTheme.accentSecondary }}>
                  ✦ 點軟糖互動 / 右上角可關閉
                </span>
              </div>

              {/* Speech Tail pointing directly down to Nono's head */}
              <div
                style={{
                  backgroundColor: panelTheme.panelBg,
                  borderColor: panelTheme.border,
                }}
                className="w-4 h-4 border-r-2 border-b-2 rotate-45 absolute -bottom-2.5 left-1/2 -translate-x-1/2"
              />
            </div>
          </div>
        ) : (
          /* WHEN SPEECH BUBBLE IS CLOSED: Show the beloved Floating Dialogue Star beside Nono so Ave can reopen anytime! */
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onToggleBubble(true);
            }}
            style={{
              backgroundColor: panelTheme.panelBg,
              borderColor: panelTheme.border,
              boxShadow: `0 8px 24px rgba(0,0,0,0.8), 0 0 20px ${panelTheme.glowRgba}`,
            }}
            className="group relative flex items-center gap-1.5 px-3 py-1.5 rounded-full border-2 backdrop-blur-xl hover:scale-105 transition-transform cursor-pointer"
            title="點對話星星展開 Nono 的關心對話框"
          >
            <PastelAuraStar
              size={28}
              idSuffix="closed-star-btn"
              accentColor={panelTheme.accent}
              secondaryColor={panelTheme.accentSecondary}
              coreColor={panelTheme.highlightTagBg}
              className="-my-1 group-hover:rotate-12 transition-transform"
            />
            <span
              style={{ color: panelTheme.textMain }}
              className="text-[11px] font-mono font-bold tracking-wide pr-0.5"
            >
              展開對話
            </span>
          </button>
        )}
      </div>

      {/* =========================================================================
          MINI-DISC & KEYCHAIN BADGE (Top-Right)
      ========================================================================= */}
      <div className="fixed top-4 right-6 z-10 pointer-events-none hidden md:flex items-center gap-3">
        <div
          style={{
            backgroundColor: panelTheme.panelBg,
            borderColor: panelTheme.border,
            color: panelTheme.textMain,
            boxShadow: `0 6px 20px ${panelTheme.glowRgba}`,
          }}
          className="px-3.5 py-1.5 rounded-xl border-2 flex items-center gap-2 backdrop-blur-md"
        >
          <PastelAuraStar
            size={20}
            idSuffix="top-right-star"
            accentColor={panelTheme.accent}
            secondaryColor={panelTheme.accentSecondary}
            coreColor={panelTheme.highlightTagBg}
          />
          <span className="text-[10px] font-mono font-black tracking-wider">
            NONO.PET · {panelTheme.name}
          </span>
        </div>

        {/* Spinning Mini-CD Disc */}
        <div
          className="relative w-12 h-12 rounded-full border-2 border-white/80 flex items-center justify-center animate-spin"
          style={{
            animationDuration: '14s',
            boxShadow: `0 0 22px ${panelTheme.glowRgba}`,
            background: `conic-gradient(from 0deg, ${panelTheme.accent}, ${panelTheme.accentSecondary}, ${panelTheme.highlightTagBg}, ${panelTheme.accent})`,
          }}
        >
          <div className="w-9 h-9 rounded-full border border-white/50 flex items-center justify-center bg-black/35 backdrop-blur-xs">
            <div
              style={{ backgroundColor: panelTheme.bgBase }}
              className="w-3.5 h-3.5 rounded-full border-2 border-white/80"
            />
          </div>
        </div>
      </div>

      {/* Bottom Desktop Hint & Instant Wake Button when workbench is hidden */}
      {!isAwake && (
        <div className="fixed bottom-6 left-8 z-20 flex items-center gap-3">
          <button
            type="button"
            onClick={onSelectNono}
            style={{
              backgroundColor: panelTheme.panelBg,
              borderColor: panelTheme.border,
              color: panelTheme.textMain,
              boxShadow: `0 10px 28px ${panelTheme.glowRgba}`,
            }}
            className="px-4 py-2 rounded-full border-2 text-xs backdrop-blur-md transition-all flex items-center gap-2 cursor-pointer hover:scale-105"
          >
            <PastelAuraStar
              size={22}
              idSuffix="wake-btn-star"
              accentColor={panelTheme.accent}
              secondaryColor={panelTheme.accentSecondary}
              coreColor={panelTheme.highlightTagBg}
            />
            <span className="font-medium">點一下展開左側筆記本與 Buffer 工作台</span>
          </button>
        </div>
      )}
    </div>
  );
};
