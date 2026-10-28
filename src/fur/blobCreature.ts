import * as THREE from 'three';

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0.0, Math.min(1.0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3.0 - 2.0 * t);
}

function normalize3(x: number, y: number, z: number): [number, number, number] {
  const l = Math.sqrt(x * x + y * y + z * z) || 1.0;
  return [x / l, y / l, z / l];
}

/**
 * Evaluates the anatomical follicle growth mask at a local position on the blob surface.
 * Note: Eye-socket opening vs. closed-eyelid fur coverage is now controlled dynamically in
 * the vertex/fragment shader via `uEyeClosure`, so follicles are populated across the eyelid
 * region as well and smoothly cover the eyelids when Nono blinks, squints, or sleeps!
 */
export function evaluateFollicleMask(x: number, y: number, z: number): number {
  // Complete hair-free clear zone (mask = 0.0) on the pink nose button & W-mouth
  const nx = x / 0.118;
  const ny = (y - 0.062) / 0.096;
  const nz = (z - 1.02) / 0.18;
  const distNoseMouth = Math.sqrt(nx * nx + ny * ny + nz * nz);
  const noseMouthMask = smoothstep(0.95, 1.68, distNoseMouth);

  // Bottom belly contact pad taper
  const bottomMask = smoothstep(-1.05, -0.72, y);

  // Extra fluff boost on cheeks and chest tuft
  const cheekDist = Math.min(
    Math.hypot(x + 0.56, y - 0.02, z - 0.68),
    Math.hypot(x - 0.56, y - 0.02, z - 0.68)
  );
  const cheekFluff = 1.0 + 0.22 * (1.0 - smoothstep(0.0, 0.42, cheekDist));

  return Math.max(0.0, Math.min(1.25, noseMouthMask * bottomMask * cheekFluff));
}

/**
 * Computes the biological grooming flow tangent vector on the blob surface.
 * Hairs part naturally from a crown whorl at the top of the head, sweep around
 * the eye sockets and nose button, and flow downward with a subtle cheek/belly swirl.
 */
export function evaluateGroomFlow(
  x: number,
  y: number,
  z: number,
  nx: number,
  ny: number,
  nz: number
): [number, number, number] {
  let fx = x * 0.25;
  let fy = -0.85;
  let fz = (z - 0.15) * 0.25;

  const eyeCenters: [number, number, number][] = [
    [-0.33, 0.17, 0.86],
    [0.33, 0.17, 0.86],
  ];
  for (let i = 0; i < 2; i++) {
    const [ex, ey, ez] = eyeCenters[i];
    const dx = x - ex;
    const dy = y - ey;
    const dz = z - ez;
    const d = Math.sqrt(dx * dx + dy * dy + dz * dz) + 1e-5;
    if (d < 0.48) {
      const influence = (1.0 - d / 0.48) * 0.85;
      fx += (dx / d) * influence;
      fy += (dy / d) * influence * 0.6;
      fz += (dz / d) * influence * 0.3;
    }
  }

  // Gently part hairs radially around the pink nose button so upper muzzle hairs don't droop over the nose
  const ndx = x - 0.0;
  const ndy = y - 0.068;
  const ndz = z - 1.02;
  const nd = Math.sqrt(ndx * ndx + ndy * ndy + ndz * ndz) + 1e-5;
  if (nd < 0.26) {
    const noseInfluence = (1.0 - nd / 0.26) * 0.95;
    const sideSign = ndx >= 0.0 ? 1.0 : -1.0;
    fx += (ndx / nd + sideSign * 0.45) * noseInfluence;
    fy += (ndy / nd) * noseInfluence * 0.55;
  }

  const dotFN = fx * nx + fy * ny + fz * nz;
  let tx = fx - dotFN * nx;
  let ty = fy - dotFN * ny;
  let tz = fz - dotFN * nz;
  const len = Math.sqrt(tx * tx + ty * ty + tz * tz);
  if (len > 1e-5) {
    tx /= len;
    ty /= len;
    tz /= len;
  } else {
    tx = 1.0;
    ty = 0.0;
    tz = 0.0;
  }
  return [tx, ty, tz];
}

/**
 * Sculpt a unit sphere vertex into our cute "Mochi-Puff" blob creature with
 * chubby pear cheeks, perky ears, stubby side arms, and recessed eye sockets.
 */
function sculptBlobPosition(u: number, v: number, w: number): [number, number, number] {
  let x = u;
  let y = v;
  let z = w;

  // 1. Pear/Mochi silhouette: chubby lower cheeks & belly, slightly tapered crown
  const bellyWidth = 1.0 + 0.22 * Math.exp(-Math.pow((y + 0.24) / 0.55, 2.0));
  const cheekPuff = 1.0 + 0.14 * Math.exp(-Math.pow((y + 0.05) / 0.38, 2.0)) * Math.max(0, z);
  x *= bellyWidth * cheekPuff;
  z *= 0.94 + 0.12 * Math.exp(-Math.pow((y + 0.22) / 0.6, 2.0));
  y *= 0.96;

  // Slightly flatten the base so Mochi-Puff sits cozily on the ground
  if (y < -0.55) {
    const t = (-0.55 - y) / 0.45;
    y = -0.55 - Math.tanh(t * 1.15) * 0.32;
  }

  // 2. Perky sculptural ears on top-left and top-right
  const leftEarDir = normalize3(-0.46, 0.86, 0.06);
  const rightEarDir = normalize3(0.46, 0.86, 0.06);
  const dotLEar = Math.max(0.0, u * leftEarDir[0] + v * leftEarDir[1] + w * leftEarDir[2]);
  const dotREar = Math.max(0.0, u * rightEarDir[0] + v * rightEarDir[1] + w * rightEarDir[2]);
  const earProfile = Math.pow(Math.max(dotLEar, dotREar), 14.0) * 0.44;
  x += u * earProfile * 0.75;
  y += v * earProfile * 1.15;
  z += w * earProfile * 0.55;

  // 3. Cute stubby side nubbins (little arms)
  const leftArmDir = normalize3(-0.94, -0.08, 0.28);
  const rightArmDir = normalize3(0.94, -0.08, 0.28);
  const dotLArm = Math.max(0.0, u * leftArmDir[0] + v * leftArmDir[1] + w * leftArmDir[2]);
  const dotRArm = Math.max(0.0, u * rightArmDir[0] + v * rightArmDir[1] + w * rightArmDir[2]);
  const armProfile = Math.pow(Math.max(dotLArm, dotRArm), 18.0) * 0.24;
  x += u * armProfile * 1.1;
  y += v * armProfile * 0.6;
  z += w * armProfile * 0.9;

  // 4. Subtle anatomical eye socket indentation so the glossy eyes sit nested inside the plush fur
  const lx = x + 0.33;
  const rx = x - 0.33;
  const ey = y - 0.17;
  const ez = z - 0.86;
  const dEye = Math.min(
    Math.sqrt(lx * lx + ey * ey + ez * ez),
    Math.sqrt(rx * rx + ey * ey + ez * ez)
  );
  if (dEye < 0.32) {
    const indent = (1.0 - smoothstep(0.0, 0.32, dEye)) * 0.065;
    z -= indent;
  }

  return [x, y, z];
}

export function createOrganicBlobGeometry(widthSegments = 96, heightSegments = 72) {
  const geom = new THREE.SphereGeometry(1.0, widthSegments, heightSegments);
  const posAttr = geom.attributes.position;
  const count = posAttr.count;

  for (let i = 0; i < count; i++) {
    const u = posAttr.getX(i);
    const v = posAttr.getY(i);
    const w = posAttr.getZ(i);
    const [sx, sy, sz] = sculptBlobPosition(u, v, w);
    posAttr.setXYZ(i, sx, sy, sz);
  }

  geom.computeVertexNormals();
  const normAttr = geom.attributes.normal;

  const follicleMaskArray = new Float32Array(count);
  const groomTangentArray = new Float32Array(count * 3);

  for (let i = 0; i < count; i++) {
    const x = posAttr.getX(i);
    const y = posAttr.getY(i);
    const z = posAttr.getZ(i);
    const nx = normAttr.getX(i);
    const ny = normAttr.getY(i);
    const nz = normAttr.getZ(i);

    follicleMaskArray[i] = evaluateFollicleMask(x, y, z);
    const [tx, ty, tz] = evaluateGroomFlow(x, y, z, nx, ny, nz);
    groomTangentArray[i * 3] = tx;
    groomTangentArray[i * 3 + 1] = ty;
    groomTangentArray[i * 3 + 2] = tz;
  }

  geom.setAttribute('aFollicleMask', new THREE.BufferAttribute(follicleMaskArray, 1));
  geom.setAttribute('aGroomTangent', new THREE.BufferAttribute(groomTangentArray, 3));

  return geom;
}

export interface MochiEyeRig {
  pivot: THREE.Group;
  eyeball: THREE.Mesh;
  upperLidPivot: THREE.Group;
  lowerLidPivot: THREE.Group;
  closedSeamArc: THREE.Mesh;
  basePos: THREE.Vector3;
  catchlightMain: THREE.Mesh;
  catchlightSub: THREE.Mesh;
  side: -1 | 1;
}

/**
 * Creates unified, crystal-clear glossy 3D anime eyes WITH real 3D Upper & Lower Eyelid Shells!
 * When Nono blinks, squints happily, or sleeps, the 3D eyelids rotate shut over the round cornea
 * (so the eyeball is NEVER squashed flat!), and the surrounding GPU fur sweeps across the closed lids.
 */
export function createMochiFacialFeatures() {
  const faceGroup = new THREE.Group();
  faceGroup.name = 'FacialFeatures';

  // Unified high-gloss glass-enamel eyeball material
  const unifiedEyeMaterial = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color('#140c24'),
    emissive: new THREE.Color('#1f1138'),
    emissiveIntensity: 0.28,
    roughness: 0.03,
    metalness: 0.06,
    clearcoat: 1.0,
    clearcoatRoughness: 0.02,
    reflectivity: 1.0,
    ior: 1.52,
  });

  // Unified crisp pure-white catchlight material
  const unifiedHighlightMat = new THREE.MeshBasicMaterial({
    color: new THREE.Color('#ffffff'),
  });

  // Plush 3D Eyelid material (color synced with Nono's fur palette!)
  const eyelidMaterial = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color('#6d28d9'),
    emissive: new THREE.Color('#3b1578'),
    emissiveIntensity: 0.18,
    roughness: 0.62,
    metalness: 0.02,
    sheen: 1.0,
    sheenRoughness: 0.35,
    sheenColor: new THREE.Color('#ffa6dc'),
    side: THREE.DoubleSide,
  });

  // Soft dark eyelash seam that appears when the upper & lower eyelids close
  const closedSeamMat = new THREE.MeshBasicMaterial({
    color: new THREE.Color('#270d3b'),
  });

  const eyes: MochiEyeRig[] = [];
  const eyeSides: (-1 | 1)[] = [-1, 1];

  // Upper hemisphere dome for upper eyelid & lower hemisphere dome for lower eyelid
  const upperLidGeo = new THREE.SphereGeometry(
    0.178,
    32,
    18,
    0,
    Math.PI * 2,
    0,
    Math.PI * 0.52
  );
  upperLidGeo.scale(0.98, 1.1, 0.72);

  const lowerLidGeo = new THREE.SphereGeometry(
    0.177,
    32,
    18,
    0,
    Math.PI * 2,
    Math.PI * 0.48,
    Math.PI * 0.52
  );
  lowerLidGeo.scale(0.98, 1.1, 0.72);

  for (const side of eyeSides) {
    const eyePivot = new THREE.Group();
    eyePivot.position.set(side * 0.31, 0.16, 0.94);
    eyePivot.rotation.y = side * 0.22;
    eyePivot.rotation.x = -0.06;

    // 1. Unified glossy cornea sphere (remains round, never flattened!)
    const eyeballGeo = new THREE.SphereGeometry(0.168, 36, 28);
    eyeballGeo.scale(0.96, 1.08, 0.68);
    const eyeball = new THREE.Mesh(eyeballGeo, unifiedEyeMaterial);
    eyePivot.add(eyeball);

    // 2. Primary large anime catchlight (top-inner)
    const catchlightMainGeo = new THREE.SphereGeometry(0.044, 20, 16);
    catchlightMainGeo.scale(1.0, 1.15, 0.35);
    const catchlightMain = new THREE.Mesh(catchlightMainGeo, unifiedHighlightMat);
    catchlightMain.position.set(-side * 0.042, 0.052, 0.114);
    eyePivot.add(catchlightMain);

    // 3. Secondary lower-outer catchlight
    const catchlightSubGeo = new THREE.SphereGeometry(0.022, 16, 12);
    catchlightSubGeo.scale(1.0, 1.0, 0.35);
    const catchlightSub = new THREE.Mesh(catchlightSubGeo, unifiedHighlightMat);
    catchlightSub.position.set(side * 0.046, -0.048, 0.112);
    eyePivot.add(catchlightSub);

    // 4. 3D Upper Eyelid Shell (rotates around X from -1.28 rad [open] to 0.02 rad [closed])
    const upperLidPivot = new THREE.Group();
    const upperLidMesh = new THREE.Mesh(upperLidGeo, eyelidMaterial);
    upperLidPivot.add(upperLidMesh);
    upperLidPivot.rotation.x = -1.28;
    eyePivot.add(upperLidPivot);

    // 5. 3D Lower Eyelid Shell (rotates around X from +1.28 rad [open] to -0.02 rad [closed])
    const lowerLidPivot = new THREE.Group();
    const lowerLidMesh = new THREE.Mesh(lowerLidGeo, eyelidMaterial);
    lowerLidPivot.add(lowerLidMesh);
    lowerLidPivot.rotation.x = 1.28;
    eyePivot.add(lowerLidPivot);

    // 6. Gentle curved closed-eyelid lash line
    const seamGeo = new THREE.TorusGeometry(0.115, 0.011, 10, 24, Math.PI * 0.85);
    const closedSeamArc = new THREE.Mesh(seamGeo, closedSeamMat);
    closedSeamArc.position.set(0, -0.01, 0.118);
    closedSeamArc.rotation.z = Math.PI * 1.075;
    closedSeamArc.rotation.x = 0.22;
    closedSeamArc.visible = false;
    eyePivot.add(closedSeamArc);

    faceGroup.add(eyePivot);
    eyes.push({
      pivot: eyePivot,
      eyeball,
      upperLidPivot,
      lowerLidPivot,
      closedSeamArc,
      basePos: eyePivot.position.clone(),
      catchlightMain,
      catchlightSub,
      side,
    });
  }

  // Rosy glowing blush ovals nestled right below the eyes on the plush cheeks
  const blushMat = new THREE.MeshBasicMaterial({
    color: new THREE.Color('#ff6ca3'),
    transparent: true,
    opacity: 0.48,
    depthWrite: false,
  });

  for (const side of eyeSides) {
    const blushGeo = new THREE.SphereGeometry(0.115, 20, 16);
    blushGeo.scale(1.38, 0.74, 0.34);
    const blush = new THREE.Mesh(blushGeo, blushMat);
    blush.position.set(side * 0.49, 0.0, 0.96);
    blush.rotation.y = side * 0.34;
    blush.rotation.z = -side * 0.1;
    faceGroup.add(blush);
  }

  // Cute bright pink nose button positioned so just its glossy tip peeks out from the plush fur!
  const noseMat = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color('#ff8cb6'),
    roughness: 0.22,
    clearcoat: 0.65,
  });
  const noseGeo = new THREE.SphereGeometry(0.044, 22, 16);
  noseGeo.scale(1.22, 0.86, 0.82);
  const nose = new THREE.Mesh(noseGeo, noseMat);
  nose.position.set(0, 0.078, 1.215);
  faceGroup.add(nose);

  // Cute W-mouth tucked deep at the skin layer so it is naturally covered by the fluffy muzzle fur
  const mouthMat = new THREE.MeshBasicMaterial({ color: new THREE.Color('#3a102e') });
  for (const side of [-1, 1] as const) {
    const arcGeo = new THREE.TorusGeometry(0.042, 0.011, 10, 20, Math.PI * 0.92);
    const arc = new THREE.Mesh(arcGeo, mouthMat);
    arc.position.set(side * 0.041, 0.032, 1.032);
    arc.rotation.x = Math.PI + 0.15;
    arc.rotation.y = side * 0.14;
    faceGroup.add(arc);
  }

  return {
    faceGroup,
    group: faceGroup,
    eyes,
    eyelidMaterial,
    leftEyeGroup: eyes[0].pivot,
    rightEyeGroup: eyes[1].pivot,
    leftSpec1: eyes[0].catchlightMain,
    rightSpec1: eyes[1].catchlightMain,
    blushMat,
    noseMesh: nose,
  };
}
