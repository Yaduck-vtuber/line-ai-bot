// Physical Hair BSDF (Marschner / Kajiya-Kay Dual-Specular + TT Scatter + Volumetric Self-Shadowing)
// and Hybrid GPU Fur Shaders (64-Layer Volumetric Shells + 48,000 3D Tapered Instanced Strands)
// Includes Dynamic Eyelid-Fur Coverage (uEyeClosure) so fur sweeps over closed eyelids when blinking/sleeping.

const COMMON_HAIR_BSDF_GLSL = /* glsl */ `
  uniform vec3 uBaseColor;
  uniform vec3 uTipColor;
  uniform float uRoughness;
  uniform float uSpecular;
  uniform float uFurDensity;
  uniform vec3 uKeyLightDir;
  uniform vec3 uKeyLightColor;
  uniform float uKeyLightIntensity;
  uniform vec3 uRimLightDir;
  uniform vec3 uRimLightColor;
  uniform float uRimIntensity;
  uniform float uAmbientIntensity;
  uniform vec3 uEnvSkyColor;
  uniform vec3 uEnvGroundColor;
  uniform float uEnvTintStrength;

  // Shift hair tangent along surface normal to model tilted cuticle scales (Marschner 2003)
  vec3 shiftTangent(vec3 T, vec3 N, float shift) {
    return normalize(T + N * shift);
  }

  // Anisotropic Kajiya-Kay / Marschner longitudinal specular lobe
  float hairSpecularLobe(vec3 T, vec3 N, vec3 V, vec3 L, float roughness) {
    vec3 H = normalize(L + V + vec3(1e-6, 1e-6, 1e-6));
    float dotTH = clamp(dot(T, H), -1.0, 1.0);
    float sinTH = sqrt(max(1e-5, 1.0 - dotTH * dotTH));
    float hemiVis = smoothstep(-0.25, 0.15, dot(N, L));

    // Map physical roughness [0.05..0.95] to longitudinal exponent [220..10]
    float exponent = mix(220.0, 10.0, clamp(roughness * roughness, 0.0, 1.0));
    float normFactor = (exponent + 2.0) / 8.0;
    return hemiVis * pow(sinTH, exponent) * normFactor * 0.095;
  }

  // Evaluate complete Physical Hair Shading (R + TRT + TT + Beer-Lambert Deep Shadow + Follicle AO)
  vec3 evaluatePhysicalHairShading(
    vec3 worldPos,
    vec3 surfNormal,
    vec3 hairTangent,
    float h,
    float strandSeed,
    float combMemory
  ) {
    vec3 N = normalize(surfNormal);
    vec3 T = normalize(hairTangent);
    vec3 V = normalize(cameraPosition - worldPos);
    vec3 L = normalize(uKeyLightDir);
    vec3 Lrim = normalize(uRimLightDir);

    // 1. Root-to-Tip Melanin / Pigment Gradient with per-strand micro-variation
    float rootTipMix = smoothstep(0.05, 0.92, pow(h, 0.82));
    vec3 strandTint = mix(vec3(0.92), vec3(1.08), fract(strandSeed * 13.37));
    vec3 albedo = mix(uBaseColor, uTipColor, rootTipMix) * strandTint;

    // 2. Follicle Ambient Occlusion (deep warm occlusion near skin roots)
    float follicleAO = mix(0.22, 1.0, pow(clamp(h, 0.0, 1.0), 0.72));

    // 3. Beer-Lambert Volumetric Hair Self-Shadowing (optical depth through coat)
    float NdotL = dot(N, L);
    float opticalDepth = (1.0 - h) * (0.45 + 0.55 * uFurDensity) / max(0.22, NdotL * 0.5 + 0.55);
    float deepShadow = exp(-opticalDepth * 1.45);
    float wrapDiffuse = clamp((NdotL + 0.45) / 1.45, 0.0, 1.0);

    // 4. Primary Specular Lobe (R): Cuticle surface reflection shifted toward root (-0.16 rad)
    float sheenBoost = 1.0 + combMemory * 0.35;
    vec3 tPrimary = shiftTangent(T, N, -0.16 + (strandSeed - 0.5) * 0.05);
    float specR = hairSpecularLobe(tPrimary, N, V, L, uRoughness) * uSpecular * sheenBoost;
    vec3 colorR = specR * uKeyLightColor * mix(vec3(1.0), albedo, 0.15);

    // 5. Secondary Specular Lobe (TRT): Internal reflection shifted toward tip (+0.24 rad), tinted by pigment
    vec3 tSecondary = shiftTangent(T, N, 0.24 + (strandSeed - 0.5) * 0.08);
    float glint = 0.75 + 0.5 * sin(strandSeed * 62.83);
    float specTRT = hairSpecularLobe(tSecondary, N, V, L, min(1.0, uRoughness * 1.35)) * uSpecular * 0.85 * glint;
    vec3 colorTRT = specTRT * mix(albedo, uTipColor, 0.65) * uKeyLightColor * 1.65;

    // 6. Forward Subsurface Scattering / Transmission Lobe (TT) from Key + Rim Backlights
    float forwardKey = pow(clamp(dot(V, -L + N * 0.35), 0.0, 1.0), 3.2);
    float forwardRim = pow(clamp(dot(V, -Lrim + N * 0.4), 0.0, 1.0), 2.4);
    float fresnelRim = pow(1.0 - max(0.0, dot(N, V)), 2.6);
    vec3 scatterTT = (
      forwardKey * uKeyLightColor * 0.38 +
      (forwardRim * 0.75 + fresnelRim * 0.65) * uRimLightColor * uRimIntensity
    ) * mix(uBaseColor, uTipColor, 0.75) * (0.35 + 0.65 * h);

    // 7. Soft Hemisphere Studio Fill Lighting
    vec3 baseSkyColor = mix(uTipColor, vec3(0.88, 0.92, 1.0), 0.65);
    vec3 baseGroundColor = uBaseColor * 0.38;
    vec3 skyColor = mix(baseSkyColor, uEnvSkyColor, uEnvTintStrength);
    vec3 groundColor = mix(baseGroundColor, uEnvGroundColor, uEnvTintStrength);
    vec3 hemiFill = mix(groundColor, skyColor, N.y * 0.5 + 0.5) * uAmbientIntensity;

    vec3 balancedKeyTint = mix(vec3(1.0), uKeyLightColor, 0.58);
    vec3 directDiffuse = albedo * balancedKeyTint * uKeyLightIntensity * wrapDiffuse * deepShadow;
    vec3 directSpec = (colorR + colorTRT) * uKeyLightIntensity * deepShadow * (0.25 + 0.75 * h);
    vec3 ambientTerm = albedo * hemiFill * follicleAO;

    return directDiffuse + directSpec + scatterTT + ambientTerm;
  }
`;

// Shared GLSL helper for Dynamic Eyelid-Fur Coverage:
// When uEyeClosure == 0.0 (eyes open), the eye aperture is clear so the glossy cornea shines through.
// As uEyeClosure -> 1.0 (squinting/blinking/sleeping), the vertical eye aperture closes into a fine line
// and surrounding fur grows/sweeps over the closed eyelids!
const EYE_CLOSURE_MASK_GLSL = /* glsl */ `
  uniform float uEyeClosure;

  float computeDynamicEyeMask(vec3 p, out float eyelidSweepY) {
    // 1. Keep undercoat directly behind the tiny pink nose cap so skin never shows,
    // while keeping full plush fur over the mouth and surrounding muzzle!
    vec3 dNose = (p - vec3(0.0, 0.078, 1.025)) / vec3(0.054, 0.038, 0.12);
    float noseDist = length(dNose);
    float noseMask = mix(0.36, 1.0, smoothstep(0.65, 1.35, noseDist));

    // 2. Dynamic eye aperture & closed-eyelid fur coverage
    vec3 dL = p - vec3(-0.31, 0.16, 0.89);
    vec3 dR = p - vec3( 0.31, 0.16, 0.89);
    vec3 dNearest = (length(dL) < length(dR)) ? dL : dR;

    // Vertical opening shrinks toward 0 as uEyeClosure approaches 1.0
    float openY = mix(0.162, 0.008, clamp(uEyeClosure, 0.0, 1.0));
    float openX = mix(0.156, 0.125, clamp(uEyeClosure, 0.0, 1.0));

    float ellipDist = length(vec3(dNearest.x / openX, dNearest.y / openY, dNearest.z / 0.22));
    float rawDist = length(vec3(dNearest.x, dNearest.y * 1.05, dNearest.z));

    // Sweep upper & lower eyelid hairs toward the horizontal lid line when closing eyes
    float rimZone = 1.0 - smoothstep(0.04, 0.28, rawDist);
    float dirToLidCenter = -sign(dNearest.y);
    eyelidSweepY = dirToLidCenter * rimZone * uEyeClosure * 0.11;

    if (ellipDist < 1.0) {
      return 0.0;
    }
    // When closed, fur across the eyelid is plush and dense (0.88..1.0)
    float openRimTaper = 0.26 + 0.74 * smoothstep(1.0, 1.55, ellipDist);
    float eyeMask = mix(openRimTaper, 0.92, rimZone * uEyeClosure);
    return eyeMask * noseMask;
  }
`;

export const SHELL_VERTEX_SHADER = /* glsl */ `
  attribute float aFollicleMask;
  attribute vec3 aGroomTangent;
  attribute float aShellIndex;

  uniform float uFurLength;
  uniform float uClumping;
  uniform float uCurliness;
  uniform float uTime;
  uniform float uWindStrength;
  uniform vec3 uPointerLocalPos;
  uniform float uPointerActive;
  uniform float uShellCountScale;
  uniform vec3 uWebGLInertia;
  uniform float uBoopShockwave;

  ${EYE_CLOSURE_MASK_GLSL}

  varying float vLayerHeight;
  varying float vFollicleMask;
  varying vec3 vLocalPos;
  varying vec3 vDisplacedLocal;
  varying vec3 vWorldPos;
  varying vec3 vSurfNormal;
  varying vec3 vHairTangent;
  varying float vCombMemory;

  void main() {
    float h = clamp(aShellIndex * uShellCountScale, 0.0, 1.0);
    vLayerHeight = h;
    vLocalPos = position;

    float eyelidSweepY = 0.0;
    float dynamicEyeMask = computeDynamicEyeMask(position, eyelidSweepY);
    float combinedMask = max(aFollicleMask, dynamicEyeMask * 0.92) * smoothstep(0.0, 0.08, dynamicEyeMask);
    // Directly behind the tiny nose button, cap shell height to stay tucked behind the pink nose tip
    vec3 dNoseRoot = (position - vec3(0.0, 0.078, 1.025)) / vec3(0.054, 0.038, 0.12);
    if (length(dNoseRoot) < 1.15) {
      combinedMask = min(combinedMask, mix(0.36, 0.90, smoothstep(0.65, 1.15, length(dNoseRoot))));
    }
    vFollicleMask = combinedMask;

    vec3 localNormal = normalize(normal);
    vec3 groomDir = normalize(aGroomTangent + vec3(0.0, eyelidSweepY * 2.2, 0.0));
    vec3 sideDir = normalize(cross(localNormal, groomDir) + vec3(1e-4, 0.0, 0.0));

    // Analytical GPU spring inertia + boop wave + pointer combing
    vec3 tangInertia = uWebGLInertia - localNormal * min(0.0, dot(uWebGLInertia, localNormal));
    vec3 gpuDisp = tangInertia;
    vCombMemory = 0.0;

    if (uBoopShockwave > 0.01) {
      float waveFront = (1.0 - uBoopShockwave) * 2.2;
      float dFront = abs(distance(localNormal, vec3(0.0, 0.1, 0.98)) - waveFront);
      if (dFront < 0.38) {
        float ripple = (1.0 - dFront / 0.38) * uBoopShockwave;
        vec3 radial = normalize(localNormal - vec3(0.0, 0.1, 0.98) + vec3(0.0, 1e-4, 0.0));
        gpuDisp += radial * ripple * 0.65;
      }
    }
    if (uPointerActive > 0.5) {
      float pDist = distance(position, uPointerLocalPos);
      if (pDist < 0.45) {
        vCombMemory = (1.0 - pDist / 0.45) * 0.65;
      }
    }

    float bendFactor = pow(h, 1.55);
    vec3 windWave = vec3(
      sin(position.y * 4.2 + uTime * 2.6) * 0.08,
      cos(position.x * 3.8 + uTime * 2.1) * 0.04,
      cos(position.z * 4.0 - uTime * 2.4) * 0.08
    ) * uWindStrength;

    vec3 pointerPush = vec3(0.0);
    if (uPointerActive > 0.5) {
      float pDist = distance(position, uPointerLocalPos);
      if (pDist < 0.55) {
        vec3 away = normalize(position - uPointerLocalPos + vec3(0.0, 1e-4, 0.0));
        away -= localNormal * dot(away, localNormal);
        pointerPush = away * pow(1.0 - pDist / 0.55, 1.8) * 0.35;
      }
    }

    float effectiveLen = uFurLength * combinedMask;

    float lockPhase = dot(position, vec3(5.4, 6.2, 5.0));
    float curlFreq = mix(3.2, 7.8, uCurliness);
    float wavePhase = h * curlFreq + lockPhase;
    float smoothEnv = h * h * (3.0 - 2.0 * h);
    float waveAmp = uCurliness * effectiveLen * 0.28 * smoothEnv;
    vec3 waveOffset = (sideDir * sin(wavePhase) + groomDir * (cos(wavePhase) - 1.0) * 0.55) * waveAmp;
    vec3 waveTangent = (sideDir * cos(wavePhase) - groomDir * sin(wavePhase) * 0.55) * (waveAmp * curlFreq);

    vec3 eyelidOffset = vec3(0.0, eyelidSweepY * h, abs(eyelidSweepY) * 0.35 * h);

    vec3 totalOffset =
      localNormal * (h * effectiveLen) +
      groomDir * (bendFactor * effectiveLen * (0.28 + 0.18 * uClumping)) +
      waveOffset +
      eyelidOffset +
      (gpuDisp * 0.42 + windWave + pointerPush) * bendFactor * effectiveLen;

    vec3 displacedLocal = position + totalOffset;
    vDisplacedLocal = displacedLocal;
    vec4 worldPosition = modelMatrix * vec4(displacedLocal, 1.0);
    vWorldPos = worldPosition.xyz;

    vSurfNormal = normalize(mat3(modelMatrix) * localNormal);

    vec3 localHairDir = normalize(
      localNormal * max(0.01, effectiveLen) +
      groomDir * (1.55 * pow(max(0.05, h), 0.55) * effectiveLen * 0.35) +
      waveTangent +
      (gpuDisp * 0.42 + windWave + pointerPush) * 1.55 * pow(max(0.05, h), 0.55)
    );
    vHairTangent = normalize(mat3(modelMatrix) * localHairDir);

    gl_Position = projectionMatrix * viewMatrix * worldPosition;
  }
`;

export const SHELL_FRAGMENT_SHADER = /* glsl */ `
  ${COMMON_HAIR_BSDF_GLSL}

  uniform float uClumping;
  uniform float uCurliness;

  varying float vLayerHeight;
  varying float vFollicleMask;
  varying vec3 vLocalPos;
  varying vec3 vDisplacedLocal;
  varying vec3 vWorldPos;
  varying vec3 vSurfNormal;
  varying vec3 vHairTangent;
  varying float vCombMemory;

  vec2 octahedralUV(vec3 n) {
    vec3 d = n / (abs(n.x) + abs(n.y) + abs(n.z) + 1e-6);
    vec2 oct = d.y >= 0.0
      ? d.xz
      : (1.0 - abs(d.zx)) * vec2(d.x >= 0.0 ? 1.0 : -1.0, d.z >= 0.0 ? 1.0 : -1.0);
    return oct * 0.5 + 0.5;
  }

  vec3 hash23(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * vec3(443.897, 441.423, 437.195));
    p3 += dot(p3, p3.yzx + 19.19);
    return fract((p3.xxz + p3.yxx) * p3.zyx);
  }

  void main() {
    if (vFollicleMask < 0.04) {
      discard;
    }

    // 3D nose-cap clear volume: only prevent outer shell layers from poking through the glossy pink nose tip itself,
    // while keeping the undercoat intact behind it and full plush fur over the mouth!
    vec3 dNoseCap = (vDisplacedLocal - vec3(0.0, 0.078, 1.218)) / vec3(0.055, 0.039, 0.046);
    if (length(dNoseCap) < 1.0) {
      discard;
    }

    float gridScale = mix(52.0, 96.0, clamp(uFurDensity, 0.0, 1.0));
    vec2 baseUV = octahedralUV(normalize(vLocalPos));
    vec2 warpedUV = baseUV + 0.008 * sin(baseUV.yx * 28.0);
    vec2 sampleUV = warpedUV * gridScale;

    vec2 clumpGrid = warpedUV * (gridScale * 0.24);
    vec2 clumpFract = fract(clumpGrid) - 0.5;
    sampleUV -= clumpFract * (vLayerHeight * uClumping * 1.65);

    vec2 cellId = floor(sampleUV);
    vec2 cellLocal = fract(sampleUV) - 0.5;
    vec3 rand = hash23(cellId);

    float densityFactor = clamp(uFurDensity * 1.08, 0.22, 1.0) * clamp(vFollicleMask * 1.15, 0.0, 1.0);
    float fiberMaxH = mix(0.32, 1.0, rand.z) * densityFactor;
    if (vLayerHeight > fiberMaxH) {
      discard;
    }

    float curlFreq = mix(3.2, 7.8, uCurliness);
    float curlAngle = vLayerHeight * curlFreq + rand.x * 6.28318;
    float smoothEnv = vLayerHeight * vLayerHeight * (3.0 - 2.0 * vLayerHeight);
    float curlRadius = (0.03 * uClumping + 0.12 * uCurliness) * smoothEnv;
    vec2 strandCenter = (rand.xy - 0.5) * 0.22 + vec2(cos(curlAngle), sin(curlAngle)) * curlRadius;

    float distToAxis = length(cellLocal - strandCenter);

    float normH = clamp(vLayerHeight / max(0.15, fiberMaxH), 0.0, 1.0);
    float maxRadius = 0.62 * (1.0 - pow(normH, 1.25));
    if (distToAxis > maxRadius) {
      discard;
    }

    vec3 color = evaluatePhysicalHairShading(
      vWorldPos,
      vSurfNormal,
      vHairTangent,
      vLayerHeight,
      rand.x,
      vCombMemory
    );

    gl_FragColor = vec4(color, 1.0);
  }
`;

export const STRAND_VERTEX_SHADER = /* glsl */ `
  attribute vec3 aRootPos;
  attribute vec3 aRootNormal;
  attribute vec3 aGroomDir;
  attribute vec3 aClumpOffset;
  attribute float aStrandSeed;
  attribute float aMaskValue;

  uniform float uFurLength;
  uniform float uFurDensity;
  uniform float uClumping;
  uniform float uCurliness;
  uniform float uTime;
  uniform float uWindStrength;
  uniform vec3 uPointerLocalPos;
  uniform float uPointerActive;
  uniform vec3 uWebGLInertia;
  uniform float uBoopShockwave;

  ${EYE_CLOSURE_MASK_GLSL}

  varying float vHeight;
  varying float vRibbonU;
  varying float vStrandSeed;
  varying vec3 vWorldPos;
  varying vec3 vSurfNormal;
  varying vec3 vHairTangent;
  varying float vCombMemory;

  void main() {
    float h = position.y;
    float ribbonSide = position.x;

    vHeight = h;
    vRibbonU = ribbonSide;
    vStrandSeed = aStrandSeed;

    float eyelidSweepY = 0.0;
    float dynamicEyeMask = computeDynamicEyeMask(aRootPos, eyelidSweepY);
    float combinedMask = max(aMaskValue, dynamicEyeMask * 0.92) * smoothstep(0.0, 0.08, dynamicEyeMask);

    // Prevent long hero strands rooted directly behind the tiny pink nose button from piercing through the nose tip
    vec3 dNoseRoot = (aRootPos - vec3(0.0, 0.078, 1.025)) / vec3(0.052, 0.036, 0.12);
    if (length(dNoseRoot) < 0.95) {
      gl_Position = vec4(2.0, 2.0, 2.0, 0.0);
      return;
    }

    // Smoothly cull strands inside open eye aperture or above density threshold
    if (aStrandSeed > uFurDensity * 1.02 || combinedMask < 0.04) {
      gl_Position = vec4(2.0, 2.0, 2.0, 0.0);
      return;
    }

    vec3 rootN = normalize(aRootNormal);
    vec3 groomT = normalize(aGroomDir + vec3(0.0, eyelidSweepY * 2.4, 0.0));
    vec3 strandSideDir = normalize(cross(rootN, groomT) + vec3(1e-4, 0.0, 0.0));

    // Analytical GPU spring inertia + boop ripple + pointer combing
    vec3 tangInertia = uWebGLInertia - rootN * min(0.0, dot(uWebGLInertia, rootN));
    vec3 gpuDisp = tangInertia;
    vCombMemory = 0.0;

    if (uBoopShockwave > 0.01) {
      float waveFront = (1.0 - uBoopShockwave) * 2.2;
      float dFront = abs(distance(rootN, vec3(0.0, 0.1, 0.98)) - waveFront);
      if (dFront < 0.38) {
        float ripple = (1.0 - dFront / 0.38) * uBoopShockwave;
        vec3 radial = normalize(rootN - vec3(0.0, 0.1, 0.98) + vec3(0.0, 1e-4, 0.0));
        gpuDisp += radial * ripple * 0.65;
      }
    }
    if (uPointerActive > 0.5) {
      float pDist = distance(aRootPos, uPointerLocalPos);
      if (pDist < 0.45) {
        vCombMemory = (1.0 - pDist / 0.45) * 0.65;
      }
    }

    float lenVar = mix(0.68, 1.24, fract(aStrandSeed * 31.7));
    float fullLen = uFurLength * combinedMask * lenVar;

    float bend = pow(h, 1.6);
    float clumpPull = smoothstep(0.0, 0.9, h) * uClumping * 0.62;

    float lockPhase = dot(aRootPos, vec3(5.4, 6.2, 5.0)) + (aStrandSeed - 0.5) * 0.35;
    float curlFreq = mix(3.2, 7.8, uCurliness);
    float wavePhase = h * curlFreq + lockPhase;
    float smoothEnv = h * h * (3.0 - 2.0 * h);
    float waveAmp = uCurliness * fullLen * 0.30 * smoothEnv;

    vec3 waveVec = (
      strandSideDir * sin(wavePhase) +
      groomT * (cos(wavePhase) - 1.0) * 0.55
    ) * waveAmp;

    vec3 waveDeriv = (
      strandSideDir * cos(wavePhase) -
      groomT * sin(wavePhase) * 0.55
    ) * (waveAmp * curlFreq);

    vec3 windFlutter = vec3(
      sin(aRootPos.y * 5.0 + uTime * 2.9 + aStrandSeed * 6.28) * 0.065,
      cos(aRootPos.x * 4.4 + uTime * 2.3 + aStrandSeed * 6.28) * 0.035,
      cos(aRootPos.z * 4.8 - uTime * 2.6 + aStrandSeed * 6.28) * 0.065
    ) * uWindStrength;

    vec3 pointerPush = vec3(0.0);
    if (uPointerActive > 0.5) {
      float pDist = distance(aRootPos, uPointerLocalPos);
      if (pDist < 0.55) {
        vec3 away = normalize(aRootPos - uPointerLocalPos + vec3(0.0, 1e-4, 0.0));
        away -= rootN * dot(away, rootN);
        pointerPush = away * pow(1.0 - pDist / 0.55, 1.8) * 0.38;
      }
    }

    vec3 dynamicTip = (gpuDisp * 0.46 + windFlutter + pointerPush) * bend * fullLen;
    vec3 eyelidSweepOffset = vec3(0.0, eyelidSweepY * h, abs(eyelidSweepY) * 0.38 * h);

    vec3 spineLocal =
      aRootPos +
      rootN * (h * fullLen) +
      groomT * (bend * fullLen * 0.36) +
      aClumpOffset * clumpPull +
      waveVec +
      eyelidSweepOffset +
      dynamicTip;

    // Gently part any neighboring strand tips around the 3D pink nose cap so the nose peeks out cleanly
    vec3 noseCapCenter = vec3(0.0, 0.078, 1.218);
    vec3 noseCapRadii = vec3(0.058, 0.042, 0.048);
    vec3 dSpineNose = (spineLocal - noseCapCenter) / noseCapRadii;
    float spineNoseDist = length(dSpineNose);
    if (spineNoseDist < 1.0 && spineNoseDist > 1e-4) {
      spineLocal = noseCapCenter + (dSpineNose / spineNoseDist) * noseCapRadii;
    }

    vec3 derivLocal = normalize(
      rootN * max(0.01, fullLen) +
      groomT * (1.6 * pow(max(0.04, h), 0.6) * fullLen * 0.36) +
      aClumpOffset * (uClumping * 0.55) +
      waveDeriv +
      (gpuDisp * 0.46 + windFlutter + pointerPush) * (1.6 * pow(max(0.04, h), 0.6) * fullLen)
    );

    vec4 worldSpine = modelMatrix * vec4(spineLocal, 1.0);
    vec3 worldTang = normalize(mat3(modelMatrix) * derivLocal);
    vec3 worldSurfN = normalize(mat3(modelMatrix) * rootN);

    vec3 viewDir = normalize(cameraPosition - worldSpine.xyz);
    vec3 ribbonRight = normalize(cross(viewDir, worldTang) + vec3(1e-5, 0.0, 0.0));

    float baseRadius = 0.0095 * mix(0.85, 1.25, fract(aStrandSeed * 19.3));
    float taperProfile = pow(max(0.0, 1.0 - h), 0.78);
    float halfWidth = baseRadius * taperProfile;

    vec3 finalWorldPos = worldSpine.xyz + ribbonRight * (ribbonSide * halfWidth);

    vWorldPos = finalWorldPos;
    vHairTangent = worldTang;
    vSurfNormal = normalize(worldSurfN + ribbonRight * (ribbonSide * 0.32));

    gl_Position = projectionMatrix * viewMatrix * vec4(finalWorldPos, 1.0);
  }
`;

export const STRAND_FRAGMENT_SHADER = /* glsl */ `
  ${COMMON_HAIR_BSDF_GLSL}

  varying float vHeight;
  varying float vRibbonU;
  varying float vStrandSeed;
  varying vec3 vWorldPos;
  varying vec3 vSurfNormal;
  varying vec3 vHairTangent;
  varying float vCombMemory;

  void main() {
    float cylProfile = sqrt(max(0.0, 1.0 - vRibbonU * vRibbonU));

    vec3 color = evaluatePhysicalHairShading(
      vWorldPos,
      vSurfNormal,
      vHairTangent,
      vHeight,
      vStrandSeed,
      vCombMemory
    );

    color *= mix(0.76, 1.06, cylProfile);

    gl_FragColor = vec4(color, 1.0);
  }
`;
