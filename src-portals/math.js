// Deterministic Seeded PRNG, Corridor Terrain Math & 4x4 Matrix Utilities for Endless Portals

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

// Portal Coordinate Constants:
// Exit Portal Archway in currentWorld stands at z = -115.0 (plaza floor y = 0.0).
// Entrance threshold in nextWorld is at z = +55.0 (plaza floor y = 0.0).
// Offset from currentWorld to nextWorld is exactly +170.0 along Z!
export const PORTAL_Z = -115.0;
export const ENTRANCE_Z = 55.0;
export const PORTAL_SPAN_Z = ENTRANCE_Z - PORTAL_Z; // 170.0

// Smooth S-curve flight centerline that gently weaves between z = +55 and z = -115,
// while pinning strictly to x = 0 at both portal thresholds!
export function corridorCenterX(wp, z) {
  const t = clamp((ENTRANCE_Z - z) / PORTAL_SPAN_Z, 0, 1);
  const envelope = Math.sin(t * Math.PI); // 0 at z=+55 and 0 at z=-115!
  return Math.sin(t * Math.PI * wp.curveFreq + wp.curvePhase) * wp.curveAmp * envelope * envelope;
}

// Flattens terrain to y = 0.0 around both the Entrance Plaza (0, +55) and Exit Portal Plaza (0, -115)
export function portalPlazaMask(x, z) {
  const dExit = Math.hypot(x * 0.85, (z - PORTAL_Z) * 0.65);
  const dEnt = Math.hypot(x * 0.85, (z - ENTRANCE_Z) * 0.65);
  const mExit = 1.0 - smoothstep(10.0, 24.0, dExit);
  const mEnt = 1.0 - smoothstep(10.0, 24.0, dEnt);
  return Math.max(mExit, mEnt);
}

// Archetype-aware procedural heightfield across [-96..96] x [-168..82]
export function worldTerrainH(wp, x, z) {
  const cx = corridorCenterX(wp, z);
  const dx = x - cx;
  const absDx = Math.abs(dx);
  const sx = x * 0.028 + wp.noiseOffX;
  const sz = z * 0.028 + wp.noiseOffZ;
  const n = fbm2(sx, sz);
  const arch = wp.archIdx;

  let h = 0.0;

  if (arch === 0) {
    // 0: Sundial Sanctum — Sea of Golden Clouds below (-5.5m) with elevated marble flanking terraces
    const terrace = smoothstep(15.0, 38.0, absDx);
    const stepH = Math.floor(terrace * 4.0) * 3.2;
    h = -5.2 + n * 2.6 + terrace * 8.0 + stepH * 0.45;
  } else if (arch === 1) {
    // 1: Obsidian Ziggurat — Glowing magma channel floor (-2.2m) flanked by jagged volcanic basalt cliffs
    const wall = smoothstep(13.0, 44.0, absDx);
    const stepped = Math.floor(wall * 5.0) * 3.6;
    h = -2.2 + wall * 14.0 + stepped * 0.55 + (n - 0.4) * 5.0 * wall;
  } else if (arch === 2) {
    // 2: Abyssal Coralhenge — Rippled turquoise seabed with coral reef shelves on flanks
    const reef = smoothstep(14.0, 46.0, absDx);
    const sandWave = Math.sin(x * 0.22 + z * 0.14 + n * 4.0) * 0.65;
    h = -1.8 + sandWave + reef * (9.5 + n * 8.0);
  } else if (arch === 3) {
    // 3: Monument Aqueducts — Geometric Escher-like stepped canyon terraces
    const tier = smoothstep(14.0, 50.0, absDx);
    const quant = Math.round(tier * 6.0) / 6.0;
    h = -1.4 + quant * 18.0 + Math.round(n * 3.0) * 0.9 * tier;
  } else if (arch === 4) {
    // 4: Emerald Mycelia — Lush rolling mossy basin with giant fungal knolls
    const valley = smoothstep(12.0, 45.0, absDx);
    h = -1.6 + Math.sin(x * 0.09 + wp.curvePhase) * 1.1 + valley * (11.0 + n * 9.0);
  } else if (arch === 5) {
    // 5: Origami Wind-Canyon — Sharp faceted wind-sculpted amber sandstone dunes & canyon walls
    const ridge = 1.0 - Math.abs(Math.sin((x * 0.055 + z * 0.038 + n * 1.8) * Math.PI));
    const wall = smoothstep(13.5, 42.0, absDx);
    h = -1.5 + ridge * 3.2 + wall * (16.5 + ridge * 7.5);
  } else if (arch === 6) {
    // 6: Arctic Prism Spire — Frozen mirror fjord (-1.6m) framed by sharp crystalline glacier walls
    const fjord = smoothstep(14.0, 44.0, absDx);
    const shard = Math.abs(n - 0.5) * 16.0;
    h = -1.6 + fjord * (13.0 + shard);
  } else {
    // 7: Astral Armillary — Deep starry void floor (-8.5m) with celestial causeway & flanking star-ridges
    const causeway = 1.0 - smoothstep(6.5, 11.5, absDx);
    const outer = smoothstep(24.0, 58.0, absDx);
    h = lerp(-8.5 + n * 2.2 + outer * 14.0, -0.6, causeway * 0.85);
  }

  // Smoothly blend to y = 0.0 ceremonial deck at Entrance (+55) and Exit Portal (-115)
  const pm = portalPlazaMask(x, z);
  return lerp(h, 0.0, pm);
}

export function worldTerrainNormal(wp, x, z) {
  const e = 0.9;
  const hL = worldTerrainH(wp, x - e, z);
  const hR = worldTerrainH(wp, x + e, z);
  const hD = worldTerrainH(wp, x, z - e);
  const hU = worldTerrainH(wp, x, z + e);
  const nx = hL - hR;
  const ny = 2 * e;
  const nz = hD - hU;
  const inv = 1 / (Math.hypot(nx, ny, nz) || 1);
  return [nx * inv, ny * inv, nz * inv];
}

export const M4 = {
  create() {
    const m = new Float32Array(16);
    m[0] = m[5] = m[10] = m[15] = 1;
    return m;
  },
  identity(out) {
    out.fill(0);
    out[0] = out[5] = out[10] = out[15] = 1;
    return out;
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
