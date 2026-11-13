// Deterministic Math, Provençal Terrain Heightfield & Matrix Utilities for Starry Nightrider

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

export const WATER_Y = -0.42;
export const BRIDGE_XS = [-34, 32];

export function riverZ(x) {
  return 15.0 * Math.sin(x * 0.031) + 4.0;
}

export function wheatFieldMask(x, z) {
  // Two sweeping golden Provençal wheatfields
  const d1 = Math.hypot((x - 30) * 0.85, (z + 24) * 1.05);
  const d2 = Math.hypot((x + 40) * 0.9, (z - 34) * 0.95);
  const m1 = 1 - smoothstep(14, 25, d1);
  const m2 = 1 - smoothstep(13, 24, d2);
  const rDist = Math.abs(z - riverZ(x));
  const dry = smoothstep(7.5, 11.5, rDist);
  return clamp(Math.max(m1, m2) * dry, 0, 1);
}

export function pathMask(x, z) {
  // Winding dirt path connecting Village -> Bridges -> Windmill Ridge -> Moonrise Summit
  const p1 = Math.abs(x - (-34 + (z + 18) * 0.42));
  const p2 = Math.abs(x - (32 - (z + 10) * 0.42));
  const ringR = Math.hypot(x * 0.92, (z + 8) * 1.05);
  const pRing = Math.abs(ringR - 44);
  const d = Math.min(p1, p2, pRing);
  return 1 - smoothstep(2.2, 4.8, d);
}

export function rawGroundH(x, z) {
  // Base rolling Provençal hills
  let h =
    Math.sin(x * 0.038) * Math.cos(z * 0.036) * 2.35 +
    Math.sin(x * 0.075 + z * 0.055) * 0.85 +
    (fbm2(x * 0.045 + 11.3, z * 0.045 - 7.1) - 0.5) * 3.2;

  // Flatten Saint-Rémy village plaza slightly around (-22, -32)
  const vDist = Math.hypot(x + 22, z + 32);
  const vFlat = 1 - smoothstep(10, 22, vDist);
  h = lerp(h, 0.85, vFlat * 0.78);

  // Sculpted landmark hills:
  // 1. Moonrise Summit at (0, -76) for the Finale Canvas Portal
  const dSummit = Math.hypot(x * 0.82, z + 76);
  h += 7.8 * Math.exp(-(dSummit * dSummit) / (26 * 26));

  // 2. Windmill Ridge at (48, 34)
  const dMill = Math.hypot(x - 48, z - 34);
  h += 5.1 * Math.exp(-(dMill * dMill) / (23 * 23));

  // 3. Cypress Overlook at (-48, 24)
  const dCyp = Math.hypot(x + 48, z - 24);
  h += 4.6 * Math.exp(-(dCyp * dCyp) / (22 * 22));

  // Carve the Starlight River channel
  const rz = riverZ(x);
  const rDist = Math.abs(z - rz);
  if (rDist < 11.0) {
    const bank = smoothstep(3.2, 11.0, rDist);
    h = lerp(-1.22, h, bank);
  }

  // Les Alpilles Perimeter Mountains cradling the playable valley
  const rad = Math.hypot(x, z + 6);
  if (rad > 90) {
    const m = smoothstep(90, 124, rad);
    const crag = 0.65 + 0.7 * fbm2(x * 0.09 + 3.1, z * 0.09 + 8.4);
    h += m * m * 24.0 * crag;
  }

  return h;
}

export function surfaceInfo(x, z) {
  const groundY = rawGroundH(x, z);
  let y = groundY;
  let surf = 'meadow';
  const rz = riverZ(x);

  // Check Provençal arched stone bridges
  for (let i = 0; i < BRIDGE_XS.length; i++) {
    const bx = BRIDGE_XS[i];
    const dx = Math.abs(x - bx);
    const dz = z - rz;
    if (dx < 3.85 && Math.abs(dz) < 9.6) {
      const arch = Math.cos((dz / 9.6) * (Math.PI * 0.5));
      const deckY = 0.65 + arch * 1.45;
      if (deckY > y) {
        y = deckY;
        surf = 'bridge';
      }
    }
  }

  const waterDepth = surf === 'bridge' ? 0 : Math.max(0, WATER_Y - y);
  if (waterDepth > 0.06) {
    surf = 'water';
  } else if (surf !== 'bridge') {
    if (wheatFieldMask(x, z) > 0.45) surf = 'wheat';
    else if (pathMask(x, z) > 0.45) surf = 'path';
  }

  return { y, groundY, waterDepth, surf };
}

export function terrainNormal(x, z) {
  const e = 0.65;
  const hL = rawGroundH(x - e, z);
  const hR = rawGroundH(x + e, z);
  const hD = rawGroundH(x, z - e);
  const hU = rawGroundH(x, z + e);
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
      inFront: true,
    };
  },
};
