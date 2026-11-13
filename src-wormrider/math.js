// Deterministic Math, Wind-Sculpted Arrakis Dune Heightfield & Matrix Utilities for Shai-Rider

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

// 3 Rich Melange Spice Basins in the Deep Erg where Imperial Harvesters operate
export const SPICE_BASINS = [
  { x: -46, z: -42, r: 26 },
  { x: 54, z: -28, r: 26 },
  { x: 4, z: -96, r: 30 },
];

export function spiceMask(x, z) {
  let m = 0;
  for (let i = 0; i < SPICE_BASINS.length; i++) {
    const b = SPICE_BASINS[i];
    const d = Math.hypot(x - b.x, z - b.z);
    m = Math.max(m, 1 - smoothstep(b.r * 0.45, b.r, d));
  }
  return m;
}

// Wind-sculpted asymmetric barchan & transverse dunes across a 360m x 360m desert arena
export function duneH(x, z) {
  // Primary transverse dune ridges (ridged abs-sin gives authentic sharp wind-blown dune crests!)
  const warp = (fbm2(x * 0.014 + 4.2, z * 0.014 - 2.7) - 0.5) * 26.0;
  const u = (x * 0.82 + z * 0.57 + warp) * 0.048;
  const ridge1 = (1.0 - Math.abs(Math.sin(u))) * 5.6;

  // Secondary cross-swell dunes
  const v = (-x * 0.45 + z * 0.89) * 0.031 + Math.sin(x * 0.018) * 1.1;
  const ridge2 = (1.0 - Math.abs(Math.sin(v))) * 2.8;

  let h = ridge1 + ridge2 - 3.2;

  // Flatten Spice Basins slightly into natural salt-pan depressions
  const sm = spiceMask(x, z);
  h = lerp(h, -1.4, sm * 0.68);

  // Starting Fremen Sietch Dune Crest at (0, 62) so player overlooks the entire convoy!
  const dStart = Math.hypot(x, z - 62);
  h += 5.4 * Math.exp(-(dStart * dStart) / (22 * 22));

  // Perimeter Shield-Wall Mesa Ring (r > 142m rises into dramatic rocky desert cliffs)
  const rad = Math.hypot(x, z + 18);
  if (rad > 142) {
    const wall = smoothstep(142, 182, rad);
    const crag = 0.7 + 0.65 * fbm2(x * 0.06 + 7.1, z * 0.06 + 2.3);
    h += wall * wall * 34.0 * crag;
  }

  return h;
}

export function duneNormal(x, z) {
  const e = 0.85;
  const hL = duneH(x - e, z);
  const hR = duneH(x + e, z);
  const hD = duneH(x, z - e);
  const hU = duneH(x, z + e);
  const nx = hL - hR;
  const ny = 2 * e;
  const nz = hD - hU;
  const inv = 1 / Math.hypot(nx, ny, nz);
  return [nx * inv, ny * inv, nz * inv];
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
