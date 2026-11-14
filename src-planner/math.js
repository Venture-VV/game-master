// 4x4 Matrix Math, Isometric Cylindrical/Conical 3D Page-Curl Deformation & Open-Book Raycasting

export const PAGE_W = 4.10;
export const PAGE_H = 5.60;
export const SPINE_Y = 0.31;

export const SPREAD_THEMES = [
  {
    id: 0,
    code: '01',
    short: '柴犬',
    title: '01 · 柴犬咖啡周记',
    sub: '手冲萃取风味轮与每周日程清单',
    accent: '#e59238',
  },
  {
    id: 1,
    code: '02',
    short: '水獭',
    title: '02 · 水獭露营手绘',
    sub: '松林溪谷扎营手记与篝火装备点阵页',
    accent: '#2e9e6b',
  },
  {
    id: 2,
    code: '03',
    short: '观星',
    title: '03 · 猫头鹰观星台',
    sub: '黄铜浑天仪星图与二十八宿弦月观测录',
    accent: '#2589bd',
  },
  {
    id: 3,
    code: '04',
    short: '烘焙',
    title: '04 · 企鹅烘焙工坊',
    sub: '酥皮可颂方格食谱与红莓挞出炉时刻表',
    accent: '#d95338',
  },
  {
    id: 4,
    code: '05',
    short: '水豚',
    title: '05 · 水豚温泉日程',
    sub: '桧木柚子汤池插画与七日静心习惯打卡',
    accent: '#e8a829',
  },
  {
    id: 5,
    code: '06',
    short: '折鹤',
    title: '06 · 千纸鹤折纸页',
    sub: '几何折痕图解与青海波金箔祈愿书签',
    accent: '#d95338',
  },
];

export const STICKER_CATALOG = [
  { id: 0, name: '柴犬店长', en: 'Shiba Barista', short: '柴犬', dot: '#e59238', isWax: false },
  { id: 1, name: '水豚泡汤', en: 'Onsen Capybara', short: '水豚', dot: '#b87442', isWax: false },
  { id: 2, name: '宇航橘猫', en: 'Astro Ginger Cat', short: '橘猫', dot: '#2589bd', isWax: false },
  { id: 3, name: '小水獭帐篷', en: 'Otter Tent', short: '水獭', dot: '#2e9e6b', isWax: false },
  { id: 4, name: '猫头鹰博士', en: 'Scholar Owl', short: '猫头鹰', dot: '#8c5832', isWax: false },
  { id: 5, name: '火漆印章', en: 'Crimson Wax Seal', short: '火漆', dot: '#d95338', isWax: true },
  { id: 6, name: '黄金五星章', en: 'Gold Star', short: '金星', dot: '#e8a829', isWax: false },
  { id: 7, name: '手冲咖啡杯', en: 'Latte Cup', short: '拿铁', dot: '#c97a40', isWax: false },
  { id: 8, name: '多肉小盆栽', en: 'Succulent', short: '多肉', dot: '#2e9e6b', isWax: false },
  { id: 9, name: '折纸千纸鹤', en: 'Origami Crane', short: '纸鹤', dot: '#e8a829', isWax: false },
];

// Strictly warm artisanal stationery inks (Espresso, Brass Gold, Terracotta, Matcha, Sky Cobalt)
export const INK_PALETTE = [
  { id: 0, name: '浓咖钢笔墨', short: '浓咖', hex: '#171310', rgb: [0.090, 0.075, 0.063], metallic: 0.05 },
  { id: 1, name: '黄铜鎏金墨', short: '鎏金', hex: '#e8a829', rgb: [0.910, 0.659, 0.161], metallic: 0.78 },
  { id: 2, name: '赤陶朱砂墨', short: '赤陶', hex: '#d95338', rgb: [0.851, 0.325, 0.220], metallic: 0.12 },
  { id: 3, name: '宇治抹茶墨', short: '抹茶', hex: '#2e9e6b', rgb: [0.180, 0.620, 0.420], metallic: 0.10 },
  { id: 4, name: '晴空钴蓝墨', short: '钴蓝', hex: '#2589bd', rgb: [0.145, 0.537, 0.741], metallic: 0.14 },
];

export function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

export function smoothstep(e0, e1, x) {
  const t = clamp((x - e0) / (e1 - e0), 0.0, 1.0);
  return t * t * (3.0 - 2.0 * t);
}

export function damp(cur, target, lambda, dt) {
  return lerp(cur, target, 1.0 - Math.exp(-lambda * dt));
}

export function createPRNG(seed = 20270419) {
  let s = seed >>> 0;
  return function rand() {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const V3 = {
  len(x, y, z) {
    return Math.hypot(x, y, z);
  },
  normalize(x, y, z) {
    const l = Math.hypot(x, y, z) || 1;
    return [x / l, y / l, z / l];
  },
  dot(a, b) {
    return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  },
  cross(a, b) {
    return [
      a[1] * b[2] - a[2] * b[1],
      a[2] * b[0] - a[0] * b[2],
      a[0] * b[1] - a[1] * b[0],
    ];
  },
};

export const M4 = {
  create() {
    const m = new Float32Array(16);
    m[0] = 1;
    m[5] = 1;
    m[10] = 1;
    m[15] = 1;
    return m;
  },

  identity(out) {
    out.fill(0);
    out[0] = 1;
    out[5] = 1;
    out[10] = 1;
    out[15] = 1;
    return out;
  },

  perspective(out, fovyRad, aspect, near, far) {
    const f = 1.0 / Math.tan(fovyRad * 0.5);
    const nf = 1.0 / (near - far);
    out.fill(0);
    out[0] = f / aspect;
    out[5] = f;
    out[10] = (far + near) * nf;
    out[11] = -1;
    out[14] = 2 * far * near * nf;
    return out;
  },

  lookAt(out, eye, center, up) {
    let zx = eye[0] - center[0];
    let zy = eye[1] - center[1];
    let zz = eye[2] - center[2];
    let len = Math.hypot(zx, zy, zz) || 1;
    zx /= len;
    zy /= len;
    zz /= len;

    let xx = up[1] * zz - up[2] * zy;
    let xy = up[2] * zx - up[0] * zz;
    let xz = up[0] * zy - up[1] * zx;
    len = Math.hypot(xx, xy, xz) || 1;
    xx /= len;
    xy /= len;
    xz /= len;

    const yx = zy * xz - zz * xy;
    const yy = zz * xx - zx * xz;
    const yz = zx * xy - zy * xx;

    out[0] = xx;
    out[1] = yx;
    out[2] = zx;
    out[3] = 0;
    out[4] = xy;
    out[5] = yy;
    out[6] = zy;
    out[7] = 0;
    out[8] = xz;
    out[9] = yz;
    out[10] = zz;
    out[11] = 0;
    out[12] = -(xx * eye[0] + xy * eye[1] + xz * eye[2]);
    out[13] = -(yx * eye[0] + yy * eye[1] + yz * eye[2]);
    out[14] = -(zx * eye[0] + zy * eye[1] + zz * eye[2]);
    out[15] = 1;
    return out;
  },

  multiply(out, a, b) {
    const a00 = a[0], a01 = a[1], a02 = a[2], a03 = a[3];
    const a10 = a[4], a11 = a[5], a12 = a[6], a13 = a[7];
    const a20 = a[8], a21 = a[9], a22 = a[10], a23 = a[11];
    const a30 = a[12], a31 = a[13], a32 = a[14], a33 = a[15];

    let b0 = b[0], b1 = b[1], b2 = b[2], b3 = b[3];
    out[0] = b0 * a00 + b1 * a10 + b2 * a20 + b3 * a30;
    out[1] = b0 * a01 + b1 * a11 + b2 * a21 + b3 * a31;
    out[2] = b0 * a02 + b1 * a12 + b2 * a22 + b3 * a32;
    out[3] = b0 * a03 + b1 * a13 + b2 * a23 + b3 * a33;

    b0 = b[4]; b1 = b[5]; b2 = b[6]; b3 = b[7];
    out[4] = b0 * a00 + b1 * a10 + b2 * a20 + b3 * a30;
    out[5] = b0 * a01 + b1 * a11 + b2 * a21 + b3 * a31;
    out[6] = b0 * a02 + b1 * a12 + b2 * a22 + b3 * a32;
    out[7] = b0 * a03 + b1 * a13 + b2 * a23 + b3 * a33;

    b0 = b[8]; b1 = b[9]; b2 = b[10]; b3 = b[11];
    out[8] = b0 * a00 + b1 * a10 + b2 * a20 + b3 * a30;
    out[9] = b0 * a01 + b1 * a11 + b2 * a21 + b3 * a31;
    out[10] = b0 * a02 + b1 * a12 + b2 * a22 + b3 * a32;
    out[11] = b0 * a03 + b1 * a13 + b2 * a23 + b3 * a33;

    b0 = b[12]; b1 = b[13]; b2 = b[14]; b3 = b[15];
    out[12] = b0 * a00 + b1 * a10 + b2 * a20 + b3 * a30;
    out[13] = b0 * a01 + b1 * a11 + b2 * a21 + b3 * a31;
    out[14] = b0 * a02 + b1 * a12 + b2 * a22 + b3 * a32;
    out[15] = b0 * a03 + b1 * a13 + b2 * a23 + b3 * a33;
    return out;
  },

  invert(out, m) {
    const a00 = m[0], a01 = m[1], a02 = m[2], a03 = m[3];
    const a10 = m[4], a11 = m[5], a12 = m[6], a13 = m[7];
    const a20 = m[8], a21 = m[9], a22 = m[10], a23 = m[11];
    const a30 = m[12], a31 = m[13], a32 = m[14], a33 = m[15];

    const b00 = a00 * a11 - a01 * a10;
    const b01 = a00 * a12 - a02 * a10;
    const b02 = a00 * a13 - a03 * a10;
    const b03 = a01 * a12 - a02 * a11;
    const b04 = a01 * a13 - a03 * a11;
    const b05 = a02 * a13 - a03 * a12;
    const b06 = a20 * a31 - a21 * a30;
    const b07 = a20 * a32 - a22 * a30;
    const b08 = a20 * a33 - a23 * a30;
    const b09 = a21 * a32 - a22 * a31;
    const b10 = a21 * a33 - a23 * a31;
    const b11 = a22 * a33 - a23 * a32;

    let det = b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06;
    if (!det) return null;
    det = 1.0 / det;

    out[0] = (a11 * b11 - a12 * b10 + a13 * b09) * det;
    out[1] = (a02 * b10 - a01 * b11 - a03 * b09) * det;
    out[2] = (a31 * b05 - a32 * b04 + a33 * b03) * det;
    out[3] = (a22 * b04 - a21 * b05 - a23 * b03) * det;
    out[4] = (a12 * b08 - a10 * b11 - a13 * b07) * det;
    out[5] = (a00 * b11 - a02 * b08 + a03 * b07) * det;
    out[6] = (a32 * b02 - a30 * b05 - a33 * b01) * det;
    out[7] = (a20 * b05 - a22 * b02 + a23 * b01) * det;
    out[8] = (a10 * b10 - a11 * b08 + a13 * b06) * det;
    out[9] = (a01 * b08 - a00 * b10 - a03 * b06) * det;
    out[10] = (a30 * b04 - a31 * b02 + a33 * b00) * det;
    out[11] = (a21 * b02 - a20 * b04 - a23 * b00) * det;
    out[12] = (a11 * b07 - a10 * b09 - a12 * b06) * det;
    out[13] = (a00 * b09 - a01 * b07 + a02 * b06) * det;
    out[14] = (a31 * b01 - a30 * b03 - a32 * b00) * det;
    out[15] = (a20 * b03 - a21 * b01 + a22 * b00) * det;
    return out;
  },

  composeTRS(out, tx, ty, tz, rx, ry, rz, sx, sy, sz) {
    const cx = Math.cos(rx), sxr = Math.sin(rx);
    const cy = Math.cos(ry), syr = Math.sin(ry);
    const cz = Math.cos(rz), szr = Math.sin(rz);

    const r00 = cy * cz;
    const r01 = sxr * syr * cz + cx * szr;
    const r02 = -cx * syr * cz + sxr * szr;

    const r10 = -cy * szr;
    const r11 = -sxr * syr * szr + cx * cz;
    const r12 = cx * syr * szr + sxr * cz;

    const r20 = syr;
    const r21 = -sxr * cy;
    const r22 = cx * cy;

    out[0] = r00 * sx;
    out[1] = r01 * sx;
    out[2] = r02 * sx;
    out[3] = 0;

    out[4] = r10 * sy;
    out[5] = r11 * sy;
    out[6] = r12 * sy;
    out[7] = 0;

    out[8] = r20 * sz;
    out[9] = r21 * sz;
    out[10] = r22 * sz;
    out[11] = 0;

    out[12] = tx;
    out[13] = ty;
    out[14] = tz;
    out[15] = 1;
    return out;
  },

  unprojectRay(invVP, ndcX, ndcY) {
    const pNear = transformVec4(invVP, ndcX, ndcY, -1.0, 1.0);
    const pFar = transformVec4(invVP, ndcX, ndcY, 1.0, 1.0);
    const dir = V3.normalize(pFar[0] - pNear[0], pFar[1] - pNear[1], pFar[2] - pNear[2]);
    return { orig: pNear, dir };
  },

  projectToScreen(vp, x, y, z, width, height) {
    const cx = vp[0] * x + vp[4] * y + vp[8] * z + vp[12];
    const cy = vp[1] * x + vp[5] * y + vp[9] * z + vp[13];
    const cw = vp[3] * x + vp[7] * y + vp[11] * z + vp[15];
    if (cw <= 0.05) return null;
    const ndcX = cx / cw;
    const ndcY = cy / cw;
    return {
      x: (ndcX * 0.5 + 0.5) * width,
      y: (0.5 - ndcY * 0.5) * height,
      w: cw,
    };
  },
};

function transformVec4(m, x, y, z, w) {
  const ox = m[0] * x + m[4] * y + m[8] * z + m[12] * w;
  const oy = m[1] * x + m[5] * y + m[9] * z + m[13] * w;
  const oz = m[2] * x + m[6] * y + m[10] * z + m[14] * w;
  const ow = m[3] * x + m[7] * y + m[11] * z + m[15] * w || 1;
  return [ox / ow, oy / ow, oz / ow];
}

/**
 * Exact isometric cylindrical/conical 3D page-curl deformation.
 * Matches `deformPageVertex` in shaders.js bit-for-bit in structure.
 *
 * @param {number} u - Distance from spine [0..1] (0 = spine, 1 = outer fore-edge)
 * @param {number} v - Top-to-bottom coordinate [0..1] (0 = top, 1 = bottom)
 * @param {number} turnProgress - [0..1] (0 = flat on Right stack, 1 = flat on Left stack)
 * @param {number} spineLift - Extra vertical clearance for active turning sheet
 */
export function deformPagePoint(u, v, turnProgress, spineLift = 0.0, out = null) {
  const p = clamp(turnProgress, 0.0, 1.0);
  const turnBell = Math.sin(p * Math.PI);
  // Conical corner skew: bottom fore-corner leads slightly like a real finger flip
  const pLocal = clamp(p + (v - 0.5) * 0.12 * turnBell, 0.0, 1.0);
  const sP = pLocal * pLocal * (3.0 - 2.0 * pLocal);

  // Spine hinge angle sweeps from +0.16 rad (Right cushion arch) to PI - 0.16 rad (Left cushion arch)
  const rawA = lerp(0.16, Math.PI - 0.16, sP);
  const a = rawA + (Math.PI * 0.5 - rawA) * (0.20 * turnBell);
  // Total cylindrical/conical bend angle across page width: lifts edge first, trails gently on settle
  const b = lerp(-0.26, 0.26, sP) + 0.72 * Math.sin(pLocal * Math.PI * 2.0);

  const yBase = SPINE_Y + spineLift + 0.025 * turnBell;

  let x, y;
  if (Math.abs(b) < 1e-4) {
    x = PAGE_W * u * Math.cos(a);
    y = yBase + PAGE_W * u * Math.sin(a);
  } else {
    const th = a + b * u;
    x = PAGE_W * (Math.sin(th) - Math.sin(a)) / b;
    y = yBase + PAGE_W * (-Math.cos(th) + Math.cos(a)) / b;
  }
  const z = (v - 0.5) * PAGE_H;

  // Tangent along +u (unit vector because arc-length is exact!)
  const thU = a + b * u;
  const ux = Math.cos(thU);
  const uy = Math.sin(thU);
  const uz = 0.0;

  // Approximate conical derivative along +v for crisp lighting & surface normal
  const eps = 0.01;
  const v2 = clamp(v + eps, 0.0, 1.0);
  const pLocal2 = clamp(p + (v2 - 0.5) * 0.12 * turnBell, 0.0, 1.0);
  const sP2 = pLocal2 * pLocal2 * (3.0 - 2.0 * pLocal2);
  const rawA2 = lerp(0.16, Math.PI - 0.16, sP2);
  const a2 = rawA2 + (Math.PI * 0.5 - rawA2) * (0.20 * turnBell);
  const b2 = lerp(-0.26, 0.26, sP2) + 0.72 * Math.sin(pLocal2 * Math.PI * 2.0);
  let x2, y2;
  if (Math.abs(b2) < 1e-4) {
    x2 = PAGE_W * u * Math.cos(a2);
    y2 = yBase + PAGE_W * u * Math.sin(a2);
  } else {
    const th2 = a2 + b2 * u;
    x2 = PAGE_W * (Math.sin(th2) - Math.sin(a2)) / b2;
    y2 = yBase + PAGE_W * (-Math.cos(th2) + Math.cos(a2)) / b2;
  }
  const dvScale = v + eps <= 1.0 ? 1.0 / eps : 1.0;
  let vx = (x2 - x) * dvScale;
  let vy = (y2 - y) * dvScale;
  let vz = PAGE_H;
  const vLen = Math.hypot(vx, vy, vz) || 1.0;
  vx /= vLen;
  vy /= vLen;
  vz /= vLen;

  // Front-face outward normal: cross(vTangent, uTangent) -> (0, +1, 0) at p = 0
  let nx = vy * uz - vz * uy;
  let ny = vz * ux - vx * uz;
  let nz = vx * uy - vy * ux;
  const nLen = Math.hypot(nx, ny, nz) || 1.0;
  nx /= nLen;
  ny /= nLen;
  nz /= nLen;

  const res = out || {};
  res.x = x;
  res.y = y;
  res.z = z;
  res.nx = nx;
  res.ny = ny;
  res.nz = nz;
  res.ux = ux;
  res.uy = uy;
  res.uz = uz;
  res.vx = vx;
  res.vy = vy;
  res.vz = vz;
  return res;
}

/**
 * Evaluates a point in standard left-to-right page coordinates (px, py) in [0, 1]^2
 * for either side = 0 (Left page) or side = 1 (Right page).
 */
export function evaluatePageSurface(side, px, py, turnProgress = side === 0 ? 1.0 : 0.0, spineLift = 0.0) {
  const u = side === 1 ? px : 1.0 - px;
  const v = py;
  const pt = deformPagePoint(u, v, turnProgress, spineLift);
  const faceSign = side === 1 ? 1.0 : -1.0;
  return {
    x: pt.x,
    y: pt.y,
    z: pt.z,
    nx: pt.nx * faceSign,
    ny: pt.ny * faceSign,
    nz: pt.nz * faceSign,
    rx: pt.ux * faceSign,
    ry: pt.uy * faceSign,
    rz: pt.uz * faceSign,
    dx: pt.vx,
    dy: pt.vy,
    dz: pt.vz,
    u,
    v,
  };
}

/**
 * Raycasts onto the open resting Left and Right arched planner pages.
 */
export function raycastOpenPlanner(orig, dir) {
  if (Math.abs(dir[1]) < 1e-4) return null;

  // Initial intersection with mid-cushion height y = 0.42
  let t = (0.42 - orig[1]) / dir[1];
  if (t <= 0.05) return null;

  let hx = orig[0] + dir[0] * t;
  let hz = orig[2] + dir[2] * t;

  // 4-step curved arch fixed-point refinement
  for (let i = 0; i < 4; i++) {
    const sideTmp = hx >= 0 ? 1 : 0;
    const uTmp = clamp(Math.abs(hx) / PAGE_W, 0.0, 1.0);
    const vTmp = clamp(hz / PAGE_H + 0.5, 0.0, 1.0);
    const pt = deformPagePoint(uTmp, vTmp, sideTmp === 1 ? 0.0 : 1.0, 0.0);
    t = (pt.y - orig[1]) / dir[1];
    if (t <= 0.05) return null;
    hx = orig[0] + dir[0] * t;
    hz = orig[2] + dir[2] * t;
  }

  const absX = Math.abs(hx);
  const v = hz / PAGE_H + 0.5;
  if (absX > PAGE_W * 0.992 || absX < 0.02 || v < 0.012 || v > 0.988) {
    return null;
  }

  const side = hx >= 0 ? 1 : 0;
  const u = clamp(absX / PAGE_W, 0.0, 1.0);
  const px = side === 1 ? u : 1.0 - u;
  const py = clamp(v, 0.0, 1.0);
  const surf = evaluatePageSurface(side, px, py, side === 0 ? 1.0 : 0.0, 0.0);

  return {
    hit: true,
    side,
    px,
    py,
    u,
    v: py,
    x: surf.x,
    y: surf.y,
    z: surf.z,
    nx: surf.nx,
    ny: surf.ny,
    nz: surf.nz,
  };
}

export function raycastHorizontalPlane(orig, dir, planeY = 0.25) {
  if (Math.abs(dir[1]) < 1e-4) return null;
  const t = (planeY - orig[1]) / dir[1];
  if (t <= 0.05) return null;
  return [orig[0] + dir[0] * t, planeY, orig[2] + dir[2] * t];
}
