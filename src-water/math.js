// Deterministic Math, Meandering River-Sea Channel, Gerstner Wave Mirror & 8-Realm Palette Interpolation

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

export function noise2(x, z) {
  const ix = Math.floor(x);
  const iz = Math.floor(z);
  const fx = x - ix;
  const fz = z - iz;
  const ux = fx * fx * (3 - 2 * fx);
  const uz = fz * fz * (3 - 2 * fz);
  const a = hash2(ix, iz);
  const b = hash2(ix + 1, iz);
  const c = hash2(ix, iz + 1);
  const d = hash2(ix + 1, iz + 1);
  return lerp(lerp(a, b, ux), lerp(c, d, ux), uz);
}

export function fbm2(x, z) {
  let v = 0;
  let amp = 0.5;
  let px = x;
  let pz = z;
  for (let i = 0; i < 4; i++) {
    v += amp * noise2(px, pz);
    const nx = px * 1.62 + pz * 1.18;
    const nz = -px * 1.18 + pz * 1.62;
    px = nx;
    pz = nz;
    amp *= 0.5;
  }
  return v;
}

// Continuous 880m River-Sea Voyage Constants (8 Realms x 110m = 880m along -Z)
export const REALM_LEN = 110;
export const TOTAL_VOYAGE_LEN = 880;

// Graceful S-curve river centerline along -Z; straightens at start (z=0) and Sanctuary Lighthouse (z=-845)
export function riverCenterX(z) {
  const startFade = smoothstep(-4, -36, z);
  const endStraight = 1 - smoothstep(-795, -838, z);
  const env = startFade * endStraight;
  return (Math.sin(z * 0.024) * 9.5 + Math.cos(z * 0.011 + 0.9) * 5.2) * env;
}

export function riverTangentYaw(z) {
  const dz = 1.0;
  const dx = riverCenterX(z - dz) - riverCenterX(z + dz);
  // Forward direction is (dx, -2*dz); since skiff forward is (-sin(yaw), -cos(yaw)), yaw = atan2(-dx, 2*dz)
  return Math.atan2(-dx, 2 * dz);
}

// CPU mirror of primary water waves so skiff, floating lanterns, lily pads & Memory Pearls bob naturally
export function waterWaveHeight(x, z, t) {
  const w1 = Math.sin(x * 0.34 + z * 0.42 + t * 1.35) * 0.085;
  const w2 = Math.sin(-x * 0.52 + z * 0.29 + t * 1.82 + 1.1) * 0.052;
  const w3 = Math.cos(x * 0.88 - z * 0.76 + t * 2.35) * 0.026;
  return w1 + w2 + w3;
}

// 8 Seamless Dream-Water Realms (Monet / Little-Prince Storybook Palettes — Strictly Zero Purple/Violet)
export const REALMS = [
  {
    index: 0,
    num: '01',
    zh: '晨雾睡莲',
    en: 'WATER-LILY DAWN',
    fullName: '01 · 晨雾睡莲 (Water-Lily Dawn)',
    poem: '薄雾轻拢翠玉池，睡莲承露待舟行。',
    warpZ: -12,
    skyZenith: [0.22, 0.49, 0.53],
    skyMid: [0.50, 0.75, 0.69],
    skyHorizon: [0.96, 0.85, 0.66],
    sunDir: [-0.24, 0.24, -0.94],
    sunCol: [1.0, 0.91, 0.68],
    waterDeep: [0.05, 0.22, 0.24],
    waterShallow: [0.17, 0.48, 0.43],
    fogCol: [0.84, 0.85, 0.73],
    fogDensity: 0.0062,
    starAmt: 0.0,
    auroraAmt: 0.0,
    subGlowCol: [0.35, 0.78, 0.66],
    subGlowAmt: 0.10,
  },
  {
    index: 1,
    num: '02',
    zh: '水上朱门',
    en: 'SUNKEN TORII LAGOON',
    fullName: '02 · 水上朱门 (Sunken Torii Lagoon)',
    poem: '千重朱影浸琉璃，石灯微火映晴川。',
    warpZ: -118,
    skyZenith: [0.09, 0.36, 0.48],
    skyMid: [0.32, 0.65, 0.68],
    skyHorizon: [0.93, 0.85, 0.68],
    sunDir: [0.18, 0.30, -0.94],
    sunCol: [1.0, 0.92, 0.74],
    waterDeep: [0.03, 0.21, 0.27],
    waterShallow: [0.12, 0.54, 0.55],
    fogCol: [0.76, 0.84, 0.78],
    fogDensity: 0.0050,
    starAmt: 0.0,
    auroraAmt: 0.0,
    subGlowCol: [0.94, 0.45, 0.26],
    subGlowAmt: 0.12,
  },
  {
    index: 2,
    num: '03',
    zh: '琥珀河灯',
    en: 'FLOATING LANTERN DUSK',
    fullName: '03 · 琥珀河灯 (Floating Lantern Dusk)',
    poem: '暮色熔金桥影暖，万点河灯载梦流。',
    warpZ: -228,
    skyZenith: [0.07, 0.21, 0.29],
    skyMid: [0.80, 0.44, 0.26],
    skyHorizon: [0.99, 0.74, 0.38],
    sunDir: [-0.14, 0.14, -0.98],
    sunCol: [1.0, 0.76, 0.36],
    waterDeep: [0.08, 0.14, 0.18],
    waterShallow: [0.35, 0.26, 0.16],
    fogCol: [0.88, 0.62, 0.36],
    fogDensity: 0.0056,
    starAmt: 0.18,
    auroraAmt: 0.0,
    subGlowCol: [0.98, 0.68, 0.24],
    subGlowAmt: 0.38,
  },
  {
    index: 3,
    num: '04',
    zh: '幽海星母',
    en: 'BIOLUMINESCENT JELLYFISH',
    fullName: '04 · 幽海星母 (Bioluminescent Jellyfish)',
    poem: '深渊无声生荧光，水母如星浮夜海。',
    warpZ: -338,
    skyZenith: [0.02, 0.08, 0.13],
    skyMid: [0.04, 0.19, 0.26],
    skyHorizon: [0.11, 0.36, 0.42],
    sunDir: [0.22, 0.42, -0.88],
    sunCol: [0.68, 0.96, 0.90],
    waterDeep: [0.015, 0.07, 0.11],
    waterShallow: [0.05, 0.30, 0.36],
    fogCol: [0.07, 0.25, 0.31],
    fogDensity: 0.0064,
    starAmt: 0.85,
    auroraAmt: 0.08,
    subGlowCol: [0.18, 0.92, 0.82],
    subGlowAmt: 0.72,
  },
  {
    index: 4,
    num: '05',
    zh: '溺水钟楼',
    en: 'DROWNED CATHEDRAL',
    fullName: '05 · 溺水钟楼 (Drowned Cathedral)',
    poem: '断拱残窗沉碧海，潮音犹替旧钟鸣。',
    warpZ: -448,
    skyZenith: [0.05, 0.16, 0.22],
    skyMid: [0.22, 0.38, 0.42],
    skyHorizon: [0.68, 0.73, 0.64],
    sunDir: [-0.28, 0.34, -0.90],
    sunCol: [0.94, 0.91, 0.76],
    waterDeep: [0.035, 0.13, 0.17],
    waterShallow: [0.12, 0.30, 0.32],
    fogCol: [0.46, 0.56, 0.54],
    fogDensity: 0.0068,
    starAmt: 0.42,
    auroraAmt: 0.0,
    subGlowCol: [0.85, 0.78, 0.50],
    subGlowAmt: 0.18,
  },
  {
    index: 5,
    num: '06',
    zh: '绯叶秋峡',
    en: 'CRIMSON MAPLE FJORD',
    fullName: '06 · 绯叶秋峡 (Crimson Maple Fjord)',
    poem: '两岸霜枫燃赤壁，一叶随波入画屏。',
    warpZ: -558,
    skyZenith: [0.10, 0.32, 0.42],
    skyMid: [0.68, 0.41, 0.23],
    skyHorizon: [0.96, 0.70, 0.39],
    sunDir: [0.26, 0.25, -0.93],
    sunCol: [1.0, 0.83, 0.48],
    waterDeep: [0.06, 0.17, 0.20],
    waterShallow: [0.26, 0.33, 0.24],
    fogCol: [0.84, 0.62, 0.40],
    fogDensity: 0.0054,
    starAmt: 0.05,
    auroraAmt: 0.0,
    subGlowCol: [0.92, 0.46, 0.22],
    subGlowAmt: 0.22,
  },
  {
    index: 6,
    num: '07',
    zh: '极光镜海',
    en: 'GLACIAL AURORA MIRROR',
    fullName: '07 · 极光镜海 (Glacial Aurora Mirror)',
    poem: '冰峰倒映翡翠带，星河垂落镜中天。',
    warpZ: -668,
    skyZenith: [0.02, 0.09, 0.15],
    skyMid: [0.06, 0.23, 0.30],
    skyHorizon: [0.18, 0.48, 0.47],
    sunDir: [-0.15, 0.46, -0.87],
    sunCol: [0.76, 0.96, 0.86],
    waterDeep: [0.02, 0.10, 0.16],
    waterShallow: [0.09, 0.36, 0.40],
    fogCol: [0.12, 0.34, 0.37],
    fogDensity: 0.0046,
    starAmt: 0.95,
    auroraAmt: 1.0,
    subGlowCol: [0.24, 0.90, 0.72],
    subGlowAmt: 0.46,
  },
  {
    index: 7,
    num: '08',
    zh: '彼岸灯塔',
    en: 'GOLDEN HORIZON SANCTUARY',
    fullName: '08 · 彼岸灯塔 (Golden Horizon Sanctuary)',
    poem: '水之所存皆化星，金塔长明照归舟。',
    warpZ: -778,
    skyZenith: [0.12, 0.31, 0.39],
    skyMid: [0.70, 0.53, 0.32],
    skyHorizon: [1.0, 0.87, 0.55],
    sunDir: [0.0, 0.19, -0.98],
    sunCol: [1.0, 0.93, 0.68],
    waterDeep: [0.06, 0.20, 0.24],
    waterShallow: [0.28, 0.46, 0.38],
    fogCol: [0.92, 0.79, 0.52],
    fogDensity: 0.0044,
    starAmt: 0.52,
    auroraAmt: 0.22,
    subGlowCol: [0.98, 0.82, 0.40],
    subGlowAmt: 0.45,
  },
];

export function getRealmIndex(z) {
  const idx = Math.floor(clamp(-z, 0, TOTAL_VOYAGE_LEN - 0.01) / REALM_LEN);
  return clamp(idx, 0, REALMS.length - 1);
}

function lerp3(out, a, b, t) {
  out[0] = a[0] + (b[0] - a[0]) * t;
  out[1] = a[1] + (b[1] - a[1]) * t;
  out[2] = a[2] + (b[2] - a[2]) * t;
}

export function createAtmosphereState() {
  return {
    skyZenith: [0.22, 0.49, 0.53],
    skyMid: [0.50, 0.75, 0.69],
    skyHorizon: [0.96, 0.85, 0.66],
    sunDir: [-0.24, 0.24, -0.94],
    sunCol: [1.0, 0.91, 0.68],
    waterDeep: [0.05, 0.22, 0.24],
    waterShallow: [0.17, 0.48, 0.43],
    fogCol: [0.84, 0.85, 0.73],
    fogDensity: 0.0062,
    starAmt: 0.0,
    auroraAmt: 0.0,
    subGlowCol: [0.35, 0.78, 0.66],
    subGlowAmt: 0.10,
  };
}

export function sampleRealmAtmosphere(z, out) {
  // Center of Realm i is at z = -(i * 110 + 55); blend smoothly across realm boundaries
  const u = clamp((-z - 55) / REALM_LEN, 0, REALMS.length - 1);
  const i0 = Math.min(REALMS.length - 1, Math.floor(u));
  const i1 = Math.min(REALMS.length - 1, i0 + 1);
  const rawFrac = u - i0;
  // Hold realm palette pure in middle, glide smoothly across 38% transition zone between realms
  const t = smoothstep(0.30, 0.70, rawFrac);

  const r0 = REALMS[i0];
  const r1 = REALMS[i1];

  lerp3(out.skyZenith, r0.skyZenith, r1.skyZenith, t);
  lerp3(out.skyMid, r0.skyMid, r1.skyMid, t);
  lerp3(out.skyHorizon, r0.skyHorizon, r1.skyHorizon, t);
  lerp3(out.sunDir, r0.sunDir, r1.sunDir, t);
  const sLen = Math.hypot(out.sunDir[0], out.sunDir[1], out.sunDir[2]) || 1;
  out.sunDir[0] /= sLen;
  out.sunDir[1] /= sLen;
  out.sunDir[2] /= sLen;

  lerp3(out.sunCol, r0.sunCol, r1.sunCol, t);
  lerp3(out.waterDeep, r0.waterDeep, r1.waterDeep, t);
  lerp3(out.waterShallow, r0.waterShallow, r1.waterShallow, t);
  lerp3(out.fogCol, r0.fogCol, r1.fogCol, t);
  lerp3(out.subGlowCol, r0.subGlowCol, r1.subGlowCol, t);

  out.fogDensity = lerp(r0.fogDensity, r1.fogDensity, t);
  out.starAmt = lerp(r0.starAmt, r1.starAmt, t);
  out.auroraAmt = lerp(r0.auroraAmt, r1.auroraAmt, t);
  out.subGlowAmt = lerp(r0.subGlowAmt, r1.subGlowAmt, t);
  return out;
}

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
    if (cw <= 0.05) return null;
    const ndcX = cx / cw;
    const ndcY = cy / cw;
    return {
      x: (ndcX * 0.5 + 0.5) * width,
      y: (0.5 - ndcY * 0.5) * height,
    };
  },
};
