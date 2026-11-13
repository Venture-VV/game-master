// Deterministic Math, Manhattan 6x6 Street Grid, Bridge/Ramp Heightfield & Matrix Utilities for CROSSTOWN NYC

export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const damp = (a, b, lambda, dt) => lerp(a, b, 1 - Math.exp(-lambda * dt));
export const smoothstep = (e0, e1, x) => {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
};

export function wrapAngle(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hash2(ix, iz) {
  const n = Math.sin(ix * 127.1 + iz * 311.7) * 43758.5453123;
  return n - Math.floor(n);
}

// Manhattan 420m x 420m Open-World District Constants
export const CITY_HALF = 210;
export const DRIVE_LIMIT = 195.5;
export const GRID_STEP = 60;
export const ROAD_CENTERS = [-180, -120, -60, 0, 60, 120, 180];
export const BLOCK_CENTERS = [-150, -90, -30, 30, 90, 150];
export const ROAD_HALF = 8.0;       // 16m wide wet asphalt avenues & streets
export const SIDEWALK_HALF = 11.5;  // 3.5m concrete sidewalks flanking every block

// Central Park occupies the 4 North-Center blocks: bx in {-30, 30}, bz in {-150, -90}
export function isCentralParkBlock(bx, bz) {
  return (bx === -30 || bx === 30) && (bz === -150 || bz === -90);
}

export function isInsideCentralPark(x, z) {
  return Math.abs(x) < 48.5 && z > -168.5 && z < -71.5;
}

// 5 Stunt Jump Ramps across Midtown, Central Park & East River Suspension Bridge
export const STUNT_RAMPS = [
  { x: -60, z: -20, dx: 0, dz: -1, halfW: 2.9, len: 11.0, height: 2.35, name: '时代广场飞跃跳台' },
  { x: 0,   z: -94, dx: 0, dz: -1, halfW: 2.9, len: 11.0, height: 2.45, name: '中央公园镜湖跳台' },
  { x: 180, z: 14,  dx: 0, dz: -1, halfW: 3.3, len: 12.0, height: 2.10, name: '东河悬索桥飞跃台' },
  { x: 60,  z: 22,  dx: 0, dz: 1,  halfW: 2.9, len: 11.0, height: 2.30, name: '第五大道峡谷跳台' },
  { x: 24,  z: 0,   dx: -1, dz: 0, halfW: 2.9, len: 11.0, height: 2.25, name: '中城42街横贯跳台' },
];

// East River Suspension Bridge deck elevation along X = 180, Z in [-108, 108]
export function bridgeDeckHeight(x, z) {
  if (x < 169.5 || x > 190.5 || z < -108 || z > 108) return 0;
  const u = 1.0 - Math.abs(z) / 108.0;
  const edgeX = 1.0 - smoothstep(8.5, 10.5, Math.abs(x - 180.0));
  return smoothstep(0.0, 1.0, u) * 7.2 * edgeX;
}

// Stunt Ramp local height contribution at (x, z)
export function stuntRampHeight(x, z) {
  let best = 0;
  for (let i = 0; i < STUNT_RAMPS.length; i++) {
    const r = STUNT_RAMPS[i];
    const rx = x - r.x;
    const rz = z - r.z;
    // Project onto ramp forward (dx, dz) and lateral (-dz, dx)
    const fwd = rx * r.dx + rz * r.dz; // [-len*0.5 .. +len*0.5], lip at +len*0.5
    const lat = Math.abs(-rx * r.dz + rz * r.dx);
    if (lat <= r.halfW && fwd >= -r.len * 0.5 && fwd <= r.len * 0.52) {
      const t = clamp((fwd + r.len * 0.5) / r.len, 0, 1);
      // Slightly curved launch kicker profile
      const h = (t * 0.65 + t * t * 0.35) * r.height;
      if (h > best) best = h;
    }
  }
  return best;
}

// Nearest distance from x or z to a Manhattan Avenue/Street center
export function distToNearestRoad1D(coord) {
  const nearest = clamp(Math.round(coord / GRID_STEP) * GRID_STEP, -180, 180);
  return Math.abs(coord - nearest);
}

// Unified Ground Height for Car Physics, Traffic, Hydrants & Camera
export function getGroundHeight(x, z) {
  const bridgeH = bridgeDeckHeight(x, z);
  const rampH = stuntRampHeight(x, z);
  if (bridgeH > 0.01 || rampH > 0.01) {
    return bridgeH + rampH;
  }
  const dx = distToNearestRoad1D(x);
  const dz = distToNearestRoad1D(z);
  const onRoad = dx <= ROAD_HALF || dz <= ROAD_HALF;
  if (onRoad) return 0.0;
  if (isInsideCentralPark(x, z)) return 0.08;
  return 0.14; // Subtle Manhattan sidewalk curb step
}

// Forward pitch slope along direction (dirX, dirZ) so ramps launch car velocity upward!
export function getForwardSlope(x, z, dirX, dirZ) {
  const eps = 0.65;
  const h0 = getGroundHeight(x - dirX * eps, z - dirZ * eps);
  const h1 = getGroundHeight(x + dirX * eps, z + dirZ * eps);
  return (h1 - h0) / (2 * eps);
}

// Authentic Bilingual NYC District / Avenue HUD Label
export function getDistrictLabel(x, z) {
  if (x > 152 && Math.abs(z) < 115) return '东河悬索大桥 · EAST RIVER BRIDGE';
  if (isInsideCentralPark(x, z)) return '中央公园 · CENTRAL PARK';
  if (x > -102 && x < -18 && Math.abs(z) < 42) return '时代广场 · TIMES SQUARE';
  if (x > 8 && x < 72 && z > 8 && z < 72) return '帝国大厦街区 · EMPIRE MIDTOWN';
  if (x > 58 && x < 122 && z > -65 && z < -5) return '克莱斯勒中城 · CHRYSLER PLAZA';
  if (z > 90) return '下城苏荷街区 · DOWNTOWN SOHO';
  if (z < -120) return '上城林荫大道 · UPPER MANHATTAN';
  if (x < -120) return '哈德逊河畔西区 · HUDSON WEST';
  return '第五大道中城 · FIFTH AVE MIDTOWN';
}

// 8 Golden Crosstown Rush Beacons touring Manhattan's signature landmarks
export const CROSSTOWN_BEACONS = [
  { x: -60, z: 12,   name: '时代广场南口 · TIMES SQ PLAZA' },
  { x: -60, z: -60,  name: '百老汇霓虹弯 · BROADWAY DRIFT' },
  { x: -60, z: -120, name: '哥伦布圆环 · COLUMBUS CIRCLE' },
  { x: 0,   z: -136, name: '中央公园镜湖 · CENTRAL PARK POND' },
  { x: 60,  z: -60,  name: '上东区公园大道 · PARK AVE SPRINT' },
  { x: 180, z: -6,   name: '东河悬索桥飞跃 · BRIDGE JUMP' },
  { x: 60,  z: 60,   name: '帝国大厦峡谷 · EMPIRE CANYON' },
  { x: 0,   z: 0,    name: '第五大道42街终点 · CROSSTOWN FINISH' },
];

export const M4 = {
  create() {
    const m = new Float32Array(16);
    m[0] = m[5] = m[10] = m[15] = 1;
    return m;
  },
  perspective(out, fovy, aspect, near, far) {
    const f = 1 / Math.tan(fovy * 0.5);
    out.fill(0);
    out[0] = f / aspect;
    out[5] = f;
    out[10] = (far + near) / (near - far);
    out[11] = -1;
    out[14] = (2 * far * near) / (near - far);
    return out;
  },
  lookAt(out, ex, ey, ez, tx, ty, tz, ux = 0, uy = 1, uz = 0) {
    let zx = ex - tx;
    let zy = ey - ty;
    let zz = ez - tz;
    let len = Math.hypot(zx, zy, zz) || 1;
    zx /= len;
    zy /= len;
    zz /= len;

    let xx = uy * zz - uz * zy;
    let xy = uz * zx - ux * zz;
    let xz = ux * zy - uy * zx;
    len = Math.hypot(xx, xy, xz) || 1;
    xx /= len;
    xy /= len;
    xz /= len;

    const yx = zy * xz - zz * xy;
    const yy = zz * xx - zx * xz;
    const yz = zx * xy - zy * xx;

    out[0] = xx; out[1] = yx; out[2] = zx; out[3] = 0;
    out[4] = xy; out[5] = yy; out[6] = zy; out[7] = 0;
    out[8] = xz; out[9] = yz; out[10] = zz; out[11] = 0;
    out[12] = -(xx * ex + xy * ey + xz * ez);
    out[13] = -(yx * ex + yy * ey + yz * ez);
    out[14] = -(zx * ex + zy * ey + zz * ez);
    out[15] = 1;
    return out;
  },
  mul(out, a, b) {
    const a00 = a[0], a01 = a[1], a02 = a[2], a03 = a[3];
    const a10 = a[4], a11 = a[5], a12 = a[6], a13 = a[7];
    const a20 = a[8], a21 = a[9], a22 = a[10], a23 = a[11];
    const a30 = a[12], a31 = a[13], a32 = a[14], a33 = a[15];
    for (let i = 0; i < 4; i++) {
      const b0 = b[i * 4], b1 = b[i * 4 + 1], b2 = b[i * 4 + 2], b3 = b[i * 4 + 3];
      out[i * 4] = b0 * a00 + b1 * a10 + b2 * a20 + b3 * a30;
      out[i * 4 + 1] = b0 * a01 + b1 * a11 + b2 * a21 + b3 * a31;
      out[i * 4 + 2] = b0 * a02 + b1 * a12 + b2 * a22 + b3 * a32;
      out[i * 4 + 3] = b0 * a03 + b1 * a13 + b2 * a23 + b3 * a33;
    }
    return out;
  },
  trs(out, tx, ty, tz, rx, ry, rz, sx, sy, sz) {
    const cx = Math.cos(rx), sxr = Math.sin(rx);
    const cy = Math.cos(ry), syr = Math.sin(ry);
    const cz = Math.cos(rz), szr = Math.sin(rz);
    out[0] = (cy * cz + syr * sxr * szr) * sx;
    out[1] = cx * szr * sx;
    out[2] = (-syr * cz + cy * sxr * szr) * sx;
    out[3] = 0;
    out[4] = (-cy * szr + syr * sxr * cz) * sy;
    out[5] = cx * cz * sy;
    out[6] = (syr * szr + cy * sxr * cz) * sy;
    out[7] = 0;
    out[8] = syr * cx * sz;
    out[9] = -sxr * sz;
    out[10] = cy * cx * sz;
    out[11] = 0;
    out[12] = tx;
    out[13] = ty;
    out[14] = tz;
    out[15] = 1;
    return out;
  },
  projectToScreen(vpMat, wx, wy, wz, width, height) {
    const cx = vpMat[0] * wx + vpMat[4] * wy + vpMat[8] * wz + vpMat[12];
    const cy = vpMat[1] * wx + vpMat[5] * wy + vpMat[9] * wz + vpMat[13];
    const cw = vpMat[3] * wx + vpMat[7] * wy + vpMat[11] * wz + vpMat[15];
    if (cw <= 0.1) {
      // Behind camera: project mirrored direction to bottom/side edge so waypoint stays helpful!
      const inv = 1 / Math.max(0.1, Math.abs(cw));
      const sx = clamp((0.5 - (cx * inv) * 0.5) * width, 48, width - 48);
      return { x: sx, y: height - 54, clamped: true };
    }
    const ndcX = cx / cw;
    const ndcY = cy / cw;
    const rawX = (ndcX * 0.5 + 0.5) * width;
    const rawY = (0.5 - ndcY * 0.5) * height;
    const clamped = rawX < 44 || rawX > width - 44 || rawY < 56 || rawY > height - 54;
    return {
      x: clamp(rawX, 44, width - 44),
      y: clamp(rawY, 56, height - 54),
      clamped,
    };
  },
};
