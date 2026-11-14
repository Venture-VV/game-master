// 4x4 Matrix Math, Elastic Spring Physics, Deterministic PRNG &
// Information-Theoretic Password Entropy / Vulnerability Analyzer for KEEP: PASSWORD FORTRESS

export const TAU = Math.PI * 2;

export function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

export function smoothstep(e0, e1, x) {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
}

export function damp(cur, target, lambda, dt) {
  return lerp(cur, target, 1 - Math.exp(-lambda * dt));
}

// --- Deterministic Hash & Mulberry32 PRNG ---
export function hashString(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function nextRand() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// --- Juicy Elastic Spring Physics (Sub-stepped for unconditional stability) ---
export function createSpring(initial = 0) {
  return { x: initial, v: 0 };
}

export function springStep(spring, target, stiffness = 210, damping = 14.5, dt = 0.016) {
  const steps = dt > 0.02 ? 3 : 2;
  const h = Math.min(dt, 0.05) / steps;
  for (let i = 0; i < steps; i++) {
    const force = (target - spring.x) * stiffness - spring.v * damping;
    spring.v += force * h;
    spring.x += spring.v * h;
  }
  if (Math.abs(target - spring.x) < 0.0005 && Math.abs(spring.v) < 0.001) {
    spring.x = target;
    spring.v = 0;
  }
  return spring.x;
}

// --- 3D Vector Helpers ---
export const V3 = {
  create(x = 0, y = 0, z = 0) {
    return new Float32Array([x, y, z]);
  },
  dot(a, b) {
    return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  },
  cross(a, b, out = new Float32Array(3)) {
    const ax = a[0], ay = a[1], az = a[2];
    const bx = b[0], by = b[1], bz = b[2];
    out[0] = ay * bz - az * by;
    out[1] = az * bx - ax * bz;
    out[2] = ax * by - ay * bx;
    return out;
  },
  normalize(x, y, z, out = new Float32Array(3)) {
    const len = Math.hypot(x, y, z) || 1;
    out[0] = x / len;
    out[1] = y / len;
    out[2] = z / len;
    return out;
  },
};

// --- Column-Major 4x4 Matrix Utilities (WebGL2 Ready) ---
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

  lookAt(out, eyeX, eyeY, eyeZ, centerX, centerY, centerZ, upX = 0, upY = 1, upZ = 0) {
    let zx = eyeX - centerX;
    let zy = eyeY - centerY;
    let zz = eyeZ - centerZ;
    let len = Math.hypot(zx, zy, zz);
    if (len < 1e-6) {
      zz = 1;
      len = 1;
    }
    zx /= len;
    zy /= len;
    zz /= len;

    let xx = upY * zz - upZ * zy;
    let xy = upZ * zx - upX * zz;
    let xz = upX * zy - upY * zx;
    len = Math.hypot(xx, xy, xz);
    if (len < 1e-6) {
      xx = 1;
      xy = 0;
      xz = 0;
    } else {
      xx /= len;
      xy /= len;
      xz /= len;
    }

    const yx = zy * xz - zz * xy;
    const yy = zz * xx - zx * xz;
    const yz = zx * xy - zy * xx;

    out[0] = xx; out[1] = yx; out[2] = zx; out[3] = 0;
    out[4] = xy; out[5] = yy; out[6] = zy; out[7] = 0;
    out[8] = xz; out[9] = yz; out[10] = zz; out[11] = 0;
    out[12] = -(xx * eyeX + xy * eyeY + xz * eyeZ);
    out[13] = -(yx * eyeX + yy * eyeY + yz * eyeZ);
    out[14] = -(zx * eyeX + zy * eyeY + zz * eyeZ);
    out[15] = 1;
    return out;
  },

  trs(out, tx, ty, tz, rx, ry, rz, sx, sy, sz) {
    const cx = Math.cos(rx), sxr = Math.sin(rx);
    const cy = Math.cos(ry), syr = Math.sin(ry);
    const cz = Math.cos(rz), szr = Math.sin(rz);

    // Intrinsic Y * X * Z rotation order (yaw -> pitch -> roll)
    const r00 = cy * cz + syr * sxr * szr;
    const r01 = cx * szr;
    const r02 = -syr * cz + cy * sxr * szr;

    const r10 = -cy * szr + syr * sxr * cz;
    const r11 = cx * cz;
    const r12 = syr * szr + cy * sxr * cz;

    const r20 = syr * cx;
    const r21 = -sxr;
    const r22 = cy * cx;

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

  beamBetween(out, x0, y0, z0, x1, y1, z1, radius) {
    const dx = x1 - x0;
    const dy = y1 - y0;
    const dz = z1 - z0;
    const len = Math.hypot(dx, dy, dz) || 0.001;
    const ux = dx / len;
    const uy = dy / len;
    const uz = dz / len;

    let ax = 0, ay = 1, az = 0;
    if (Math.abs(uy) > 0.92) {
      ax = 1; ay = 0; az = 0;
    }
    let rx = ay * uz - az * uy;
    let ry = az * ux - ax * uz;
    let rz = ax * uy - ay * ux;
    const rLen = Math.hypot(rx, ry, rz) || 1;
    rx /= rLen; ry /= rLen; rz /= rLen;

    const fx = uy * rz - uz * ry;
    const fy = uz * rx - ux * rz;
    const fz = ux * ry - uy * rx;

    out[0] = rx * radius; out[1] = ry * radius; out[2] = rz * radius; out[3] = 0;
    out[4] = ux * (len * 0.5); out[5] = uy * (len * 0.5); out[6] = uz * (len * 0.5); out[7] = 0;
    out[8] = fx * radius; out[9] = fy * radius; out[10] = fz * radius; out[11] = 0;
    out[12] = (x0 + x1) * 0.5;
    out[13] = (y0 + y1) * 0.5;
    out[14] = (z0 + z1) * 0.5;
    out[15] = 1;
    return out;
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

// --- 6-Tier Fortress Kingdom Definitions ---
export const TIER_DEFS = [
  {
    tier: 0,
    minBits: 0,
    maxBits: 18,
    name: '飘摇木筏',
    weatherLabel: '狂风骤浪 · 鲨影环伺',
    desc: '朽木浮筏随骇浪颠簸，随时被暴力算力吞没',
  },
  {
    tier: 1,
    minBits: 18,
    maxBits: 38,
    name: '木栅聚落',
    weatherLabel: '海雾初晴 · 篝火木寨',
    desc: '绿茵海岛浮现，木栅、哨塔与农舍初具雏形',
  },
  {
    tier: 2,
    minBits: 38,
    maxBits: 58,
    name: '石垣堡垒',
    weatherLabel: '蔚蓝晴湾 · 石垣风车',
    desc: '花岗岩女墙合拢，四叶风车与铁闸瓮城耸立',
  },
  {
    tier: 3,
    minBits: 58,
    maxBits: 80,
    name: '王国主城',
    weatherLabel: '碧海晴空 · 灯塔扬帆',
    desc: '宏伟主堡金旗猎猎，港湾灯塔巡照、黄铜火炮列阵',
  },
  {
    tier: 4,
    minBits: 80,
    maxBits: 102,
    name: '浮空圣城',
    weatherLabel: '鎏金霞光 · 飞艇穹盾',
    desc: '圣城悬空飞瀑垂落，星盘运转、天穹护盾全境张开',
  },
  {
    tier: 5,
    minBits: 102,
    maxBits: 160,
    name: '星穹神域',
    weatherLabel: '星穹圣辉 · 金龙巡天',
    desc: '日曜尖塔加冕，黄金守护神龙振翼盘旋、礼花绽放',
  },
];

const COMMON_WEAK_TOKENS = [
  'password',
  '123456789',
  '12345678',
  '123456',
  '12345',
  'qwertyuiop',
  'qwerty',
  'asdfgh',
  'zxcvbn',
  'admin',
  'letmein',
  'welcome',
  'iloveyou',
  'monkey',
  'dragon',
  'master',
  'abc123',
  'root',
  'guest',
  'pass',
];

const KEYBOARD_ROWS = [
  '1234567890-=',
  '!@#$%^&*()_+',
  'qwertyuiop[]',
  'asdfghjkl;',
  'zxcvbnm,./',
];

export function classifyChar(ch) {
  const code = ch.codePointAt(0) || 0;
  if (code >= 97 && code <= 122) return 'lower';
  if (code >= 65 && code <= 90) return 'upper';
  if (code >= 48 && code <= 57) return 'digit';
  if (code > 127) return 'unicode';
  return 'symbol';
}

export function formatCrackTime(entropyBits) {
  if (entropyBits <= 0.01) return '瞬间秒破 (0.0000秒)';
  // Expected guesses = 0.5 * 2^bits at 10^11 hashes/sec (100 GH/s GPU/ASIC cluster)
  const log2Seconds = entropyBits - 1 - Math.log2(1e11);
  if (log2Seconds < -13.28) {
    return '瞬间秒破 (0.0001秒)';
  }
  const seconds = Math.pow(2, Math.min(log2Seconds, 95));
  if (seconds < 0.01) {
    return `瞬间秒破 (${seconds.toFixed(4)}秒)`;
  }
  if (seconds < 1) {
    return `${seconds.toFixed(2)} 秒 · 极易攻破`;
  }
  if (seconds < 60) {
    return `${Math.max(1, Math.round(seconds))} 秒`;
  }
  const minutes = seconds / 60;
  if (minutes < 60) {
    return `${minutes < 10 ? minutes.toFixed(1) : Math.round(minutes)} 分钟`;
  }
  const hours = minutes / 60;
  if (hours < 24) {
    return `${hours < 10 ? hours.toFixed(1) : Math.round(hours)} 小时`;
  }
  const days = hours / 24;
  if (days < 365) {
    return `${Math.round(days)} 天`;
  }
  const years = days / 365.25;
  if (years < 10000) {
    return `${years < 100 ? years.toFixed(1) : Math.round(years).toLocaleString('en-US')} 年`;
  }
  if (years < 1e8) {
    const wan = years / 1e4;
    return `${wan < 100 ? wan.toFixed(1) : Math.round(wan)} 万年`;
  }
  if (years < 1e12) {
    const yi = years / 1e8;
    return `${yi < 100 ? yi.toFixed(1) : Math.round(yi)} 亿年`;
  }
  const wanyi = years / 1e12;
  if (wanyi < 10000) {
    return `${wanyi < 100 ? wanyi.toFixed(1) : Math.round(wanyi)} 万亿年 · 坚不可摧`;
  }
  return '百亿宇宙纪元 · 坚不可摧';
}

export function analyzePassword(rawPassword) {
  const pw = typeof rawPassword === 'string' ? rawPassword : '';
  const chars = Array.from(pw);
  const length = chars.length;

  let lower = 0;
  let upper = 0;
  let digit = 0;
  let symbol = 0;
  let unicode = 0;
  const charClasses = [];

  for (let i = 0; i < length; i++) {
    const cls = classifyChar(chars[i]);
    charClasses.push(cls);
    if (cls === 'lower') lower++;
    else if (cls === 'upper') upper++;
    else if (cls === 'digit') digit++;
    else if (cls === 'unicode') unicode++;
    else symbol++;
  }

  if (length === 0) {
    return {
      password: '',
      passwordLength: 0,
      entropyBits: 0,
      tier: 0,
      tierName: TIER_DEFS[0].name,
      weatherLabel: TIER_DEFS[0].weatherLabel,
      crackTimeLabel: '瞬间秒破 (0.0000秒)',
      pools: { lower: 0, upper: 0, digit: 0, symbol: 0, unicode: 0 },
      charClasses: [],
      chars: [],
      warnings: ['空口令 · 亟待筑城'],
      poolSize: 0,
    };
  }

  let asciiPool = 0;
  if (lower > 0) asciiPool += 26;
  if (upper > 0) asciiPool += 26;
  if (digit > 0) asciiPool += 10;
  if (symbol > 0) asciiPool += 33;

  // Hybrid information bits: ASCII pool log2 + CJK/Unicode log2 (~11.3 bits per CJK glyph, ~3500 common characters)
  const asciiBitsPerChar = asciiPool > 0 ? Math.log2(asciiPool) : 0;
  const unicodePoolBonus = asciiPool > 0 && unicode > 0 ? 0.32 : 0;
  const asciiCount = length - unicode;

  let rawBits =
    asciiCount * (asciiBitsPerChar + unicodePoolBonus) +
    unicode * 11.35;

  const warnings = [];
  let penaltyBits = 0;
  const lowerPw = pw.toLowerCase();

  // 1. Common leaked dictionary / weak roots
  for (const tok of COMMON_WEAK_TOKENS) {
    if (lowerPw.includes(tok)) {
      const ratio = tok.length / length;
      penaltyBits += tok.length * 2.55 + (ratio > 0.75 ? 4.2 : 1.5);
      warnings.push(`弱词根(${tok})`);
      break;
    }
  }

  // 2. Sequential runs (1234, abcd, 9876, dcba)
  let seqCount = 0;
  for (let i = 0; i <= chars.length - 3; i++) {
    const c0 = chars[i].codePointAt(0);
    const c1 = chars[i + 1].codePointAt(0);
    const c2 = chars[i + 2].codePointAt(0);
    if ((c1 === c0 + 1 && c2 === c1 + 1) || (c1 === c0 - 1 && c2 === c1 - 1)) {
      seqCount++;
    }
  }
  if (seqCount > 0) {
    penaltyBits += 4.5 + seqCount * 2.4;
    if (!warnings.some((w) => w.startsWith('弱词根'))) {
      warnings.push('连续递增序列');
    }
  }

  // 3. Keyboard row walks (qwerty, asdf, !@#$)
  let walkHits = 0;
  for (let i = 0; i <= lowerPw.length - 4; i++) {
    const sub = lowerPw.slice(i, i + 4);
    const rev = sub.split('').reverse().join('');
    for (const row of KEYBOARD_ROWS) {
      if (row.includes(sub) || row.includes(rev)) {
        walkHits++;
        break;
      }
    }
  }
  if (walkHits > 0) {
    penaltyBits += 4.8 + walkHits * 2.2;
    warnings.push('键盘相邻连击');
  }

  // 4. Repeated characters (aaaa, 111, or 88)
  let adjRepeats = 0;
  let tripleRepeats = 0;
  for (let i = 1; i < chars.length; i++) {
    if (chars[i] === chars[i - 1]) {
      adjRepeats++;
      if (i >= 2 && chars[i] === chars[i - 2]) {
        tripleRepeats++;
      }
    }
  }
  if (tripleRepeats > 0) {
    penaltyBits += tripleRepeats * 4.6 + adjRepeats * 1.8;
    warnings.push('大量重复字符');
  } else if (adjRepeats > 0) {
    penaltyBits += adjRepeats * 2.2;
  }

  // 5. Calendar years & dates (1950-2099)
  const yearMatch = pw.match(/(?:19[5-9]\d|20\d{2})/);
  if (yearMatch) {
    penaltyBits += 7.4;
    warnings.push(`年份特征(${yearMatch[0]})`);
  }

  // Unique character ratio check (prevents e.g. 'ababababab' from inflating entropy)
  const uniqueCount = new Set(chars).size;
  if (length >= 4 && uniqueCount <= Math.ceil(length * 0.45)) {
    const factor = clamp((uniqueCount + 1) / length + 0.25, 0.28, 0.85);
    rawBits *= factor;
    if (!warnings.includes('大量重复字符')) warnings.push('字符多样性偏低');
  }

  // Floor at minimal positive entropy for non-empty strings so 123456 stays ~6-9 bits (Tier 0)
  const minFloor = Math.min(length * 1.15, 6.4);
  const entropyBits = Number(Math.max(minFloor, rawBits - penaltyBits).toFixed(1));

  let tier = 0;
  for (let t = TIER_DEFS.length - 1; t >= 0; t--) {
    if (entropyBits >= TIER_DEFS[t].minBits) {
      tier = t;
      break;
    }
  }

  if (warnings.length === 0) {
    if (tier >= 5) warnings.push('全维高熵 · 神域无懈可击');
    else if (tier >= 4) warnings.push('多维混编 · 圣城穹盾护航');
    else if (tier >= 3) warnings.push('结构稳固 · 再添汉字/符号可登神域');
    else warnings.push('建议混编大小写、数字、符号或汉字');
  }

  return {
    password: pw,
    passwordLength: length,
    entropyBits,
    tier,
    tierName: TIER_DEFS[tier].name,
    weatherLabel: TIER_DEFS[tier].weatherLabel,
    crackTimeLabel: formatCrackTime(entropyBits),
    pools: { lower, upper, digit, symbol, unicode },
    charClasses,
    chars,
    warnings,
    poolSize: asciiPool + (unicode > 0 ? 2500 : 0),
  };
}

const SOVEREIGN_KANJI = ['星穹', '金龙', '圣城', '玄铁', '沧海', '曜石', '天工', '苍穹', '昆仑', '惊鸿'];
const SOVEREIGN_WORDS = ['Keep', 'Bastion', 'Solar', 'Aegis', 'Forge', 'Citadel', 'Harbor', 'Crown'];
const SOVEREIGN_SYMS = ['!', '#', '$', '&', '*', '@', '%', '+'];

export function generateSovereignPassword() {
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const n1 = 10 + Math.floor(Math.random() * 89);
  const n2 = 10 + Math.floor(Math.random() * 89);
  return `${pick(SOVEREIGN_KANJI)}${pick(SOVEREIGN_SYMS)}${pick(SOVEREIGN_WORDS)}${n1}${pick(SOVEREIGN_SYMS)}${pick(SOVEREIGN_KANJI)}${n2}`;
}
