// 3D Math, Matrix4, Ray-Plane & AABB Picking, Catmull-Rom Jumper Curves & Deterministic PRNG

export const TAU = Math.PI * 2;
export const DEG2RAD = Math.PI / 180;

export function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

export function smoothstep(e0, e1, x) {
  const t = clamp((x - e0) / (e1 - e0 || 1e-6), 0, 1);
  return t * t * (3 - 2 * t);
}

export function damp(cur, target, lambda, dt) {
  return lerp(cur, target, 1 - Math.exp(-lambda * dt));
}

export function mulberry32(seed) {
  let s = seed >>> 0;
  return function next() {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const V3 = {
  create(x = 0, y = 0, z = 0) {
    return [x, y, z];
  },
  add(a, b) {
    return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
  },
  sub(a, b) {
    return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  },
  scale(a, s) {
    return [a[0] * s, a[1] * s, a[2] * s];
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
  len(a) {
    return Math.hypot(a[0], a[1], a[2]);
  },
  dist(a, b) {
    return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
  },
  normalize(a) {
    const l = Math.hypot(a[0], a[1], a[2]);
    if (l < 1e-8) return [0, 1, 0];
    return [a[0] / l, a[1] / l, a[2] / l];
  },
  lerp(a, b, t) {
    return [
      a[0] + (b[0] - a[0]) * t,
      a[1] + (b[1] - a[1]) * t,
      a[2] + (b[2] - a[2]) * t,
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

  copy(out, a) {
    out.set(a);
    return out;
  },

  perspective(out, fovy, aspect, near, far) {
    const f = 1.0 / Math.tan(fovy * 0.5);
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
    let len = Math.hypot(zx, zy, zz);
    if (len < 1e-8) {
      zz = 1;
    } else {
      zx /= len;
      zy /= len;
      zz /= len;
    }

    let xx = up[1] * zz - up[2] * zy;
    let xy = up[2] * zx - up[0] * zz;
    let xz = up[0] * zy - up[1] * zx;
    len = Math.hypot(xx, xy, xz);
    if (len < 1e-8) {
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

    const b00 = b[0], b01 = b[1], b02 = b[2], b03 = b[3];
    const b10 = b[4], b11 = b[5], b12 = b[6], b13 = b[7];
    const b20 = b[8], b21 = b[9], b22 = b[10], b23 = b[11];
    const b30 = b[12], b31 = b[13], b32 = b[14], b33 = b[15];

    out[0] = b00 * a00 + b01 * a10 + b02 * a20 + b03 * a30;
    out[1] = b00 * a01 + b01 * a11 + b02 * a21 + b03 * a31;
    out[2] = b00 * a02 + b01 * a12 + b02 * a22 + b03 * a32;
    out[3] = b00 * a03 + b01 * a13 + b02 * a23 + b03 * a33;

    out[4] = b10 * a00 + b11 * a10 + b12 * a20 + b13 * a30;
    out[5] = b10 * a01 + b11 * a11 + b12 * a21 + b13 * a31;
    out[6] = b10 * a02 + b11 * a12 + b12 * a22 + b13 * a32;
    out[7] = b10 * a03 + b11 * a13 + b12 * a23 + b13 * a33;

    out[8] = b20 * a00 + b21 * a10 + b22 * a20 + b23 * a30;
    out[9] = b20 * a01 + b21 * a11 + b22 * a21 + b23 * a31;
    out[10] = b20 * a02 + b21 * a12 + b22 * a22 + b23 * a32;
    out[11] = b20 * a03 + b21 * a13 + b22 * a23 + b23 * a33;

    out[12] = b30 * a00 + b31 * a10 + b32 * a20 + b33 * a30;
    out[13] = b30 * a01 + b31 * a11 + b32 * a21 + b33 * a31;
    out[14] = b30 * a02 + b31 * a12 + b32 * a22 + b33 * a32;
    out[15] = b30 * a03 + b31 * a13 + b32 * a23 + b33 * a33;
    return out;
  },

  invert(out, a) {
    const a00 = a[0], a01 = a[1], a02 = a[2], a03 = a[3];
    const a10 = a[4], a11 = a[5], a12 = a[6], a13 = a[7];
    const a20 = a[8], a21 = a[9], a22 = a[10], a23 = a[11];
    const a30 = a[12], a31 = a[13], a32 = a[14], a33 = a[15];

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

    let det =
      b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06;
    if (Math.abs(det) < 1e-10) {
      return M4.identity(out);
    }
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

  translate(out, a, x, y, z) {
    if (a !== out) out.set(a);
    out[12] = a[0] * x + a[4] * y + a[8] * z + a[12];
    out[13] = a[1] * x + a[5] * y + a[9] * z + a[13];
    out[14] = a[2] * x + a[6] * y + a[10] * z + a[14];
    out[15] = a[3] * x + a[7] * y + a[11] * z + a[15];
    return out;
  },

  rotateX(out, a, rad) {
    const s = Math.sin(rad);
    const c = Math.cos(rad);
    const a10 = a[4], a11 = a[5], a12 = a[6], a13 = a[7];
    const a20 = a[8], a21 = a[9], a22 = a[10], a23 = a[11];
    if (a !== out) {
      out[0] = a[0]; out[1] = a[1]; out[2] = a[2]; out[3] = a[3];
      out[12] = a[12]; out[13] = a[13]; out[14] = a[14]; out[15] = a[15];
    }
    out[4] = a10 * c + a20 * s;
    out[5] = a11 * c + a21 * s;
    out[6] = a12 * c + a22 * s;
    out[7] = a13 * c + a23 * s;
    out[8] = a20 * c - a10 * s;
    out[9] = a21 * c - a11 * s;
    out[10] = a22 * c - a12 * s;
    out[11] = a23 * c - a13 * s;
    return out;
  },

  rotateY(out, a, rad) {
    const s = Math.sin(rad);
    const c = Math.cos(rad);
    const a00 = a[0], a01 = a[1], a02 = a[2], a03 = a[3];
    const a20 = a[8], a21 = a[9], a22 = a[10], a23 = a[11];
    if (a !== out) {
      out[4] = a[4]; out[5] = a[5]; out[6] = a[6]; out[7] = a[7];
      out[12] = a[12]; out[13] = a[13]; out[14] = a[14]; out[15] = a[15];
    }
    out[0] = a00 * c - a20 * s;
    out[1] = a01 * c - a21 * s;
    out[2] = a02 * c - a22 * s;
    out[3] = a03 * c - a23 * s;
    out[8] = a00 * s + a20 * c;
    out[9] = a01 * s + a21 * c;
    out[10] = a02 * s + a22 * c;
    out[11] = a03 * s + a23 * c;
    return out;
  },

  rotateZ(out, a, rad) {
    const s = Math.sin(rad);
    const c = Math.cos(rad);
    const a00 = a[0], a01 = a[1], a02 = a[2], a03 = a[3];
    const a10 = a[4], a11 = a[5], a12 = a[6], a13 = a[7];
    if (a !== out) {
      out[8] = a[8]; out[9] = a[9]; out[10] = a[10]; out[11] = a[11];
      out[12] = a[12]; out[13] = a[13]; out[14] = a[14]; out[15] = a[15];
    }
    out[0] = a00 * c + a10 * s;
    out[1] = a01 * c + a11 * s;
    out[2] = a02 * c + a12 * s;
    out[3] = a03 * c + a13 * s;
    out[4] = a10 * c - a00 * s;
    out[5] = a11 * c - a01 * s;
    out[6] = a12 * c - a02 * s;
    out[7] = a13 * c - a03 * s;
    return out;
  },

  scale(out, a, sx, sy, sz) {
    out[0] = a[0] * sx; out[1] = a[1] * sx; out[2] = a[2] * sx; out[3] = a[3] * sx;
    out[4] = a[4] * sy; out[5] = a[5] * sy; out[6] = a[6] * sy; out[7] = a[7] * sy;
    out[8] = a[8] * sz; out[9] = a[9] * sz; out[10] = a[10] * sz; out[11] = a[11] * sz;
    if (a !== out) {
      out[12] = a[12]; out[13] = a[13]; out[14] = a[14]; out[15] = a[15];
    }
    return out;
  },

  fromTRS(out, tx, ty, tz, rx, ry, rz, sx = 1, sy = 1, sz = 1) {
    M4.identity(out);
    M4.translate(out, out, tx, ty, tz);
    if (ry !== 0) M4.rotateY(out, out, ry);
    if (rx !== 0) M4.rotateX(out, out, rx);
    if (rz !== 0) M4.rotateZ(out, out, rz);
    if (sx !== 1 || sy !== 1 || sz !== 1) M4.scale(out, out, sx, sy, sz);
    return out;
  },

  transformPoint(m, x, y, z) {
    const w = m[3] * x + m[7] * y + m[11] * z + m[15] || 1;
    return [
      (m[0] * x + m[4] * y + m[8] * z + m[12]) / w,
      (m[1] * x + m[5] * y + m[9] * z + m[13]) / w,
      (m[2] * x + m[6] * y + m[10] * z + m[14]) / w,
    ];
  },

  projectToScreen(vp, x, y, z, width, height) {
    const cx = vp[0] * x + vp[4] * y + vp[8] * z + vp[12];
    const cy = vp[1] * x + vp[5] * y + vp[9] * z + vp[13];
    const cz = vp[2] * x + vp[6] * y + vp[10] * z + vp[14];
    const cw = vp[3] * x + vp[7] * y + vp[11] * z + vp[15];
    if (cw <= 0.05) return null;
    const ndcX = cx / cw;
    const ndcY = cy / cw;
    const ndcZ = cz / cw;
    if (ndcZ < -1 || ndcZ > 1.05) return null;
    return {
      x: (ndcX * 0.5 + 0.5) * width,
      y: (0.5 - ndcY * 0.5) * height,
      z: ndcZ,
    };
  },

  screenToWorldRay(invVP, ndcX, ndcY) {
    const near = M4.transformPoint(invVP, ndcX, ndcY, -1.0);
    const far = M4.transformPoint(invVP, ndcX, ndcY, 1.0);
    const dir = V3.normalize(V3.sub(far, near));
    return { origin: near, dir };
  },
};

/**
 * Intersect a 3D ray with horizontal plane y = planeY.
 * Returns [hx, planeY, hz, t] or null if behind/parallel.
 */
export function rayPlaneY(origin, dir, planeY = 0) {
  if (Math.abs(dir[1]) < 1e-6) return null;
  const t = (planeY - origin[1]) / dir[1];
  if (t <= 0) return null;
  return [
    origin[0] + dir[0] * t,
    planeY,
    origin[2] + dir[2] * t,
    t,
  ];
}

/**
 * Slab method 3D Ray-AABB intersection.
 * Returns distance t >= 0 if hit, else -1.
 */
export function rayAABB(origin, dir, minX, minY, minZ, maxX, maxY, maxZ) {
  let tmin = -Infinity;
  let tmax = Infinity;

  const boundsMin = [minX, minY, minZ];
  const boundsMax = [maxX, maxY, maxZ];

  for (let i = 0; i < 3; i++) {
    const o = origin[i];
    const d = dir[i];
    if (Math.abs(d) < 1e-8) {
      if (o < boundsMin[i] || o > boundsMax[i]) return -1;
    } else {
      let t1 = (boundsMin[i] - o) / d;
      let t2 = (boundsMax[i] - o) / d;
      if (t1 > t2) {
        const tmp = t1;
        t1 = t2;
        t2 = tmp;
      }
      if (t1 > tmin) tmin = t1;
      if (t2 < tmax) tmax = t2;
      if (tmin > tmax) return -1;
    }
  }

  if (tmax < 0) return -1;
  return tmin >= 0 ? tmin : tmax;
}

/**
 * Catmull-Rom 3D spline evaluation between p1 and p2 (t in [0, 1]).
 */
export function catmullRomPoint(p0, p1, p2, p3, t) {
  const t2 = t * t;
  const t3 = t2 * t;
  const out = [0, 0, 0];
  for (let k = 0; k < 3; k++) {
    const v0 = p0[k], v1 = p1[k], v2 = p2[k], v3 = p3[k];
    out[k] =
      0.5 *
      (2 * v1 +
        (-v0 + v2) * t +
        (2 * v0 - 5 * v1 + 4 * v2 - v3) * t2 +
        (-v0 + 3 * v1 - 3 * v2 + v3) * t3);
  }
  return out;
}

/**
 * Sample a smooth Catmull-Rom curve from an array of >= 2 3D points.
 */
export function sampleCatmullRom3D(points, segments = 24) {
  if (points.length < 2) return points.slice();
  const pts = [
    points[0],
    ...points,
    points[points.length - 1],
  ];
  const spanCount = points.length - 1;
  const result = [];
  for (let i = 0; i <= segments; i++) {
    const u = (i / segments) * spanCount;
    const idx = Math.min(spanCount - 1, Math.floor(u));
    const localT = u - idx;
    result.push(
      catmullRomPoint(pts[idx], pts[idx + 1], pts[idx + 2], pts[idx + 3], localT)
    );
  }
  return result;
}

/**
 * Build control points and sampled 3D curve for a flexible silicone DuPont jumper wire
 * rising vertically from pin A, arcing smoothly across the board, and plugging vertically into pin B.
 */
export function buildSiliconeWireArc(pStart, pEnd, arcHeight = 1.05, segments = 28) {
  const dx = pEnd[0] - pStart[0];
  const dz = pEnd[2] - pStart[2];
  const span = Math.hypot(dx, dz);
  const lift = Math.max(0.55, arcHeight + span * 0.16);
  // Subtle lateral bow so wires never look stiffly planar
  const nx = span > 1e-4 ? (-dz / span) * 0.14 : 0.08;
  const nz = span > 1e-4 ? (dx / span) * 0.14 : 0.0;

  const p0 = [pStart[0], pStart[1], pStart[2]];
  const p1 = [pStart[0], pStart[1] + 0.34, pStart[2]];
  const p2 = [
    lerp(pStart[0], pEnd[0], 0.28) + nx,
    Math.max(pStart[1], pEnd[1]) + lift * 0.86,
    lerp(pStart[2], pEnd[2], 0.28) + nz,
  ];
  const p3 = [
    lerp(pStart[0], pEnd[0], 0.5) + nx * 1.15,
    Math.max(pStart[1], pEnd[1]) + lift,
    lerp(pStart[2], pEnd[2], 0.5) + nz * 1.15,
  ];
  const p4 = [
    lerp(pStart[0], pEnd[0], 0.72) + nx,
    Math.max(pStart[1], pEnd[1]) + lift * 0.86,
    lerp(pStart[2], pEnd[2], 0.72) + nz,
  ];
  const p5 = [pEnd[0], pEnd[1] + 0.34, pEnd[2]];
  const p6 = [pEnd[0], pEnd[1], pEnd[2]];

  return sampleCatmullRom3D([p0, p1, p2, p3, p4, p5, p6], segments);
}
