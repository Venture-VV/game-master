// 3D Matrix, Hierarchical Anatomical Kinematics, Physiological Curves,
// Ray-Scanner Projection & Deterministic Cortical Noise for X-Ray Anatomy Mirror

export const TAU = Math.PI * 2;
export const DEG2RAD = Math.PI / 180;
export const RAD2DEG = 180 / Math.PI;
export const MAX_JAW_DEG = 34.0;

export function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

export function damp(cur, target, lambda, dt) {
  return lerp(cur, target, 1 - Math.exp(-lambda * dt));
}

export function smoothstep(e0, e1, x) {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
}

// Deterministic Mulberry32 PRNG
export function createPRNG(seed = 5201337) {
  let s = seed >>> 0;
  return function rand() {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Deterministic 3D Value Noise & Ridged Cortical Sulci FBM for Brain Sculpting
function hash3(ix, iy, iz) {
  let n = Math.imul(ix, 374761393) + Math.imul(iy, 668265263) + Math.imul(iz, 1274126177);
  n = (n ^ (n >>> 13)) >>> 0;
  n = Math.imul(n, 1274126177) >>> 0;
  return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
}

export function noise3(x, y, z) {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const iz = Math.floor(z);
  const fx = x - ix;
  const fy = y - iy;
  const fz = z - iz;
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);
  const uz = fz * fz * (3 - 2 * fz);

  const n000 = hash3(ix, iy, iz);
  const n100 = hash3(ix + 1, iy, iz);
  const n010 = hash3(ix, iy + 1, iz);
  const n110 = hash3(ix + 1, iy + 1, iz);
  const n001 = hash3(ix, iy, iz + 1);
  const n101 = hash3(ix + 1, iy, iz + 1);
  const n011 = hash3(ix, iy + 1, iz + 1);
  const n111 = hash3(ix + 1, iy + 1, iz + 1);

  const nx00 = n000 + (n100 - n000) * ux;
  const nx10 = n010 + (n110 - n010) * ux;
  const nx01 = n001 + (n101 - n001) * ux;
  const nx11 = n011 + (n111 - n011) * ux;

  const nxy0 = nx00 + (nx10 - nx00) * uy;
  const nxy1 = nx01 + (nx11 - nx01) * uy;
  return nxy0 + (nxy1 - nxy0) * uz;
}

export function fbm3(x, y, z, octaves = 3) {
  let sum = 0;
  let amp = 0.5;
  let freq = 1.0;
  for (let i = 0; i < octaves; i++) {
    sum += amp * noise3(x * freq, y * freq, z * freq);
    freq *= 2.03;
    amp *= 0.5;
  }
  return sum;
}

// Domain-warped cortical gyri (rounded ridges) & sulci (sharp narrow fissures)
export function evalCorticalGyri(x, y, z) {
  const wx = x * 5.2 + (noise3(x * 3.1 + 4.2, y * 3.1, z * 3.1) - 0.5) * 1.45;
  const wy = y * 5.2 + (noise3(x * 3.1, y * 3.1 + 8.7, z * 3.1) - 0.5) * 1.45;
  const wz = z * 5.2 + (noise3(x * 3.1, y * 3.1, z * 3.1 + 13.1) - 0.5) * 1.45;
  const n1 = Math.sin(wx * 2.4 + Math.cos(wy * 2.1 + wz * 1.9) * 1.5);
  const n2 = Math.sin(wy * 2.7 - Math.cos(wz * 2.3 - wx * 1.6) * 1.4);
  const raw = 0.55 * Math.abs(n1) + 0.45 * Math.abs(n2);
  // Smooth rounded gyrus top, sharp narrow sulcus groove when raw -> 0
  return Math.pow(clamp(raw, 0.0, 1.2), 0.58);
}

// Canonical Anatomical Rig Pivots in Bust Space (facing +Z, +Y up, subject's left is +X)
export const ANAT_PIVOTS = {
  NECK_BASE: [0.0, -0.44, -0.08], // C7 / T1 cervicothoracic base
  HEAD_PIVOT: [0.0, 0.16, -0.05], // Atlanto-occipital joint (C1)
  TMJ_PIVOT: [0.0, 0.34, 0.08],   // Temporomandibular joint condyle axis
  LEFT_EYE: [0.30, 0.58, 0.57],   // Subject's Left eye (+X)
  RIGHT_EYE: [-0.30, 0.58, 0.57], // Subject's Right eye (-X)
  HEART: [0.19, -0.96, 0.15],     // Mediastinum cardiac center (tilted to +X left apex)
};

export const V3 = {
  add(a, b, out = [0, 0, 0]) {
    out[0] = a[0] + b[0];
    out[1] = a[1] + b[1];
    out[2] = a[2] + b[2];
    return out;
  },
  sub(a, b, out = [0, 0, 0]) {
    out[0] = a[0] - b[0];
    out[1] = a[1] - b[1];
    out[2] = a[2] - b[2];
    return out;
  },
  scale(a, s, out = [0, 0, 0]) {
    out[0] = a[0] * s;
    out[1] = a[1] * s;
    out[2] = a[2] * s;
    return out;
  },
  dot(a, b) {
    return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  },
  cross(a, b, out = [0, 0, 0]) {
    const ax = a[0], ay = a[1], az = a[2];
    const bx = b[0], by = b[1], bz = b[2];
    out[0] = ay * bz - az * by;
    out[1] = az * bx - ax * bz;
    out[2] = ax * by - ay * bx;
    return out;
  },
  len(x, y, z) {
    return Math.hypot(x, y, z);
  },
  normalize(x, y, z, out = [0, 0, 0]) {
    const l = Math.hypot(x, y, z);
    if (l < 1e-8) {
      out[0] = 0;
      out[1] = 1;
      out[2] = 0;
      return out;
    }
    const inv = 1 / l;
    out[0] = x * inv;
    out[1] = y * inv;
    out[2] = z * inv;
    return out;
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

  perspective(fovYRad, aspect, near, far, out = new Float32Array(16)) {
    const f = 1.0 / Math.tan(fovYRad * 0.5);
    const nf = 1.0 / (near - far);
    out.fill(0);
    out[0] = f / aspect;
    out[5] = f;
    out[10] = (far + near) * nf;
    out[11] = -1;
    out[14] = 2 * far * near * nf;
    return out;
  },

  lookAt(eye, target, up, out = new Float32Array(16)) {
    let zx = eye[0] - target[0];
    let zy = eye[1] - target[1];
    let zz = eye[2] - target[2];
    let zl = Math.hypot(zx, zy, zz) || 1;
    zx /= zl;
    zy /= zl;
    zz /= zl;

    let xx = up[1] * zz - up[2] * zy;
    let xy = up[2] * zx - up[0] * zz;
    let xz = up[0] * zy - up[1] * zx;
    let xl = Math.hypot(xx, xy, xz) || 1;
    xx /= xl;
    xy /= xl;
    xz /= xl;

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

  multiply(a, b, out = new Float32Array(16)) {
    const a00 = a[0], a01 = a[1], a02 = a[2], a03 = a[3];
    const a10 = a[4], a11 = a[5], a12 = a[6], a13 = a[7];
    const a20 = a[8], a21 = a[9], a22 = a[10], a23 = a[11];
    const a30 = a[12], a31 = a[13], a32 = a[14], a33 = a[15];

    for (let c = 0; c < 4; c++) {
      const b0 = b[c * 4];
      const b1 = b[c * 4 + 1];
      const b2 = b[c * 4 + 2];
      const b3 = b[c * 4 + 3];
      out[c * 4] = a00 * b0 + a10 * b1 + a20 * b2 + a30 * b3;
      out[c * 4 + 1] = a01 * b0 + a11 * b1 + a21 * b2 + a31 * b3;
      out[c * 4 + 2] = a02 * b0 + a12 * b1 + a22 * b2 + a32 * b3;
      out[c * 4 + 3] = a03 * b0 + a13 * b1 + a23 * b2 + a33 * b3;
    }
    return out;
  },

  invert(m, out = new Float32Array(16)) {
    const m00 = m[0], m01 = m[1], m02 = m[2], m03 = m[3];
    const m10 = m[4], m11 = m[5], m12 = m[6], m13 = m[7];
    const m20 = m[8], m21 = m[9], m22 = m[10], m23 = m[11];
    const m30 = m[12], m31 = m[13], m32 = m[14], m33 = m[15];

    const b00 = m00 * m11 - m01 * m10;
    const b01 = m00 * m12 - m02 * m10;
    const b02 = m00 * m13 - m03 * m10;
    const b03 = m01 * m12 - m02 * m11;
    const b04 = m01 * m13 - m03 * m11;
    const b05 = m02 * m13 - m03 * m12;
    const b06 = m20 * m31 - m21 * m30;
    const b07 = m20 * m32 - m22 * m30;
    const b08 = m20 * m33 - m23 * m30;
    const b09 = m21 * m32 - m22 * m31;
    const b10 = m21 * m33 - m23 * m31;
    const b11 = m22 * m33 - m23 * m32;

    let det = b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06;
    if (Math.abs(det) < 1e-10) {
      return M4.identity(out);
    }
    det = 1.0 / det;

    out[0] = (m11 * b11 - m12 * b10 + m13 * b09) * det;
    out[1] = (m02 * b10 - m01 * b11 - m03 * b09) * det;
    out[2] = (m31 * b05 - m32 * b04 + m33 * b03) * det;
    out[3] = (m22 * b04 - m21 * b05 - m23 * b03) * det;
    out[4] = (m12 * b08 - m10 * b11 - m13 * b07) * det;
    out[5] = (m00 * b11 - m02 * b08 + m03 * b07) * det;
    out[6] = (m32 * b02 - m30 * b05 - m33 * b01) * det;
    out[7] = (m20 * b05 - m22 * b02 + m23 * b01) * det;
    out[8] = (m10 * b10 - m11 * b08 + m13 * b06) * det;
    out[9] = (m01 * b08 - m00 * b10 - m03 * b06) * det;
    out[10] = (m30 * b04 - m31 * b02 + m33 * b00) * det;
    out[11] = (m21 * b02 - m20 * b04 - m23 * b00) * det;
    out[12] = (m11 * b07 - m10 * b09 - m12 * b06) * det;
    out[13] = (m00 * b09 - m01 * b07 + m02 * b06) * det;
    out[14] = (m31 * b01 - m30 * b03 - m32 * b00) * det;
    out[15] = (m20 * b03 - m21 * b01 + m22 * b00) * det;
    return out;
  },

  fromRotationY(rad, out = new Float32Array(16)) {
    const c = Math.cos(rad);
    const s = Math.sin(rad);
    M4.identity(out);
    out[0] = c;
    out[2] = -s;
    out[8] = s;
    out[10] = c;
    return out;
  },

  // Builds a 4x4 bone transform rotating (yaw Y -> pitch X -> roll Z) around a 3D pivot
  fromPivotEulerYXZ(pivot, yaw, pitch, roll, out = new Float32Array(16)) {
    const cy = Math.cos(yaw), sy = Math.sin(yaw);
    const cx = Math.cos(pitch), sx = Math.sin(pitch);
    const cz = Math.cos(roll), sz = Math.sin(roll);

    // R = Ry(yaw) * Rx(pitch) * Rz(roll)
    const r00 = cy * cz + sy * sx * sz;
    const r01 = cz * sy * sx - cy * sz;
    const r02 = cx * sy;

    const r10 = cx * sz;
    const r11 = cx * cz;
    const r12 = -sx;

    const r20 = cy * sx * sz - cz * sy;
    const r21 = cy * cz * sx + sy * sz;
    const r22 = cy * cx;

    const px = pivot[0], py = pivot[1], pz = pivot[2];

    out[0] = r00;
    out[1] = r10;
    out[2] = r20;
    out[3] = 0;

    out[4] = r01;
    out[5] = r11;
    out[6] = r21;
    out[7] = 0;

    out[8] = r02;
    out[9] = r12;
    out[10] = r22;
    out[11] = 0;

    out[12] = px - (r00 * px + r01 * py + r02 * pz);
    out[13] = py - (r10 * px + r11 * py + r12 * pz);
    out[14] = pz - (r20 * px + r21 * py + r22 * pz);
    out[15] = 1;
    return out;
  },

  // Orthonormal frame facing target normal (+Z = normal) at position pos with uniform/vec scale
  fromPosNormalScale(pos, normal, scale, out = new Float32Array(16)) {
    const zx = normal[0], zy = normal[1], zz = normal[2];
    const upX = Math.abs(zy) > 0.92 ? 1 : 0;
    const upY = Math.abs(zy) > 0.92 ? 0 : 1;
    let xx = upY * zz;
    let xy = -upX * zz;
    let xz = upX * zy - upY * zx;
    const xl = Math.hypot(xx, xy, xz) || 1;
    xx /= xl;
    xy /= xl;
    xz /= xl;
    const yx = zy * xz - zz * xy;
    const yy = zz * xx - zx * xz;
    const yz = zx * xy - zy * xx;

    out[0] = xx * scale;
    out[1] = xy * scale;
    out[2] = xz * scale;
    out[3] = 0;
    out[4] = yx * scale;
    out[5] = yy * scale;
    out[6] = yz * scale;
    out[7] = 0;
    out[8] = zx * scale;
    out[9] = zy * scale;
    out[10] = zz * scale;
    out[11] = 0;
    out[12] = pos[0];
    out[13] = pos[1];
    out[14] = pos[2];
    out[15] = 1;
    return out;
  },

  transformPoint(m, x, y, z, out = [0, 0, 0]) {
    out[0] = m[0] * x + m[4] * y + m[8] * z + m[12];
    out[1] = m[1] * x + m[5] * y + m[9] * z + m[13];
    out[2] = m[2] * x + m[6] * y + m[10] * z + m[14];
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
      ndcX,
      ndcY,
    };
  },

  // Unprojects normalized device coords [-1..1] to a world-space ray from camPos
  unprojectRay(invVP, ndcX, ndcY, camPos, outDir = [0, 0, -1]) {
    const fx = invVP[0] * ndcX + invVP[4] * ndcY + invVP[8] * 0.5 + invVP[12];
    const fy = invVP[1] * ndcX + invVP[5] * ndcY + invVP[9] * 0.5 + invVP[13];
    const fz = invVP[2] * ndcX + invVP[6] * ndcY + invVP[10] * 0.5 + invVP[14];
    const fw = invVP[3] * ndcX + invVP[7] * ndcY + invVP[11] * 0.5 + invVP[15];
    const invW = Math.abs(fw) > 1e-7 ? 1.0 / fw : 1.0;
    const wx = fx * invW - camPos[0];
    const wy = fy * invW - camPos[1];
    const wz = fz * invW - camPos[2];
    return V3.normalize(wx, wy, wz, outDir);
  },
};

// Mandible TMJ Hinge + Anterior Condylar Glide (0° .. 34°)
export function computeJawKinematics(jawOpenNorm) {
  const open = clamp(jawOpenNorm, 0, 1);
  const angleDeg = open * MAX_JAW_DEG;
  const angleRad = angleDeg * DEG2RAD;
  // Physiological condylar translation forward (+Z) and slightly down (-Y)
  const glideZ = 0.045 * smoothstep(0.15, 1.0, open);
  const glideY = -0.022 * smoothstep(0.15, 1.0, open);
  return { open, angleDeg, angleRad, glideY, glideZ };
}

// Wiggers Physiological Cardiac Cycle Curve & Live P-QRS-T Electrocardiogram Voltage
export function evalCardiacCycle(phase01) {
  const p = ((phase01 % 1) + 1) % 1;
  // Ventricular systolic contraction peaks sharply around p = 0.16..0.28, dicrotic notch at 0.36
  const rapidSys = Math.exp(-Math.pow((p - 0.18) / 0.068, 2));
  const dicrotic = 0.28 * Math.exp(-Math.pow((p - 0.34) / 0.065, 2));
  const atrialKick = 0.22 * Math.exp(-Math.pow((p - 0.91) / 0.045, 2));
  const systole = clamp(rapidSys + dicrotic, 0, 1.15);

  // Synthetic P-QRS-T ECG lead II trace [-0.35 .. +1.0]
  const pWave = 0.16 * Math.exp(-Math.pow((p - 0.05) / 0.025, 2));
  const qDip = -0.18 * Math.exp(-Math.pow((p - 0.115) / 0.008, 2));
  const rPeak = 1.0 * Math.exp(-Math.pow((p - 0.132) / 0.009, 2));
  const sDip = -0.26 * Math.exp(-Math.pow((p - 0.150) / 0.009, 2));
  const tWave = 0.28 * Math.exp(-Math.pow((p - 0.33) / 0.042, 2));
  const ecgMv = pWave + qDip + rPeak + sDip + tWave;

  return { systole, atrialKick, ecgMv };
}

// Physiological Thoracic Respiratory Expansion Curve [0..1]
export function evalRespiration(respPhase01) {
  const p = ((respPhase01 % 1) + 1) % 1;
  // Smooth asymmetric breath: 42% inspiration, 58% relaxed expiration
  if (p < 0.42) {
    const u = p / 0.42;
    return 0.5 - 0.5 * Math.cos(u * Math.PI);
  }
  const u = (p - 0.42) / 0.58;
  return 0.5 + 0.5 * Math.cos(u * Math.PI);
}

// Ray-Plane Intersection for 3D Fluoroscopy Scanner Ring Projection
export function rayPlaneIntersect(rayOrig, rayDir, planePt, planeNorm, out = [0, 0, 0]) {
  const denom = V3.dot(rayDir, planeNorm);
  if (Math.abs(denom) < 1e-5) {
    out[0] = planePt[0];
    out[1] = planePt[1];
    out[2] = planePt[2];
    return false;
  }
  const dx = planePt[0] - rayOrig[0];
  const dy = planePt[1] - rayOrig[1];
  const dz = planePt[2] - rayOrig[2];
  const t = (dx * planeNorm[0] + dy * planeNorm[1] + dz * planeNorm[2]) / denom;
  out[0] = rayOrig[0] + rayDir[0] * t;
  out[1] = rayOrig[1] + rayDir[1] * t;
  out[2] = rayOrig[2] + rayDir[2] * t;
  return t > 0;
}

export function raySphereIntersect(rayOrig, rayDir, center, radius) {
  const ox = rayOrig[0] - center[0];
  const oy = rayOrig[1] - center[1];
  const oz = rayOrig[2] - center[2];
  const b = ox * rayDir[0] + oy * rayDir[1] + oz * rayDir[2];
  const c = ox * ox + oy * oy + oz * oz - radius * radius;
  const disc = b * b - c;
  if (disc < 0) return -1;
  const s = Math.sqrt(disc);
  const t0 = -b - s;
  return t0 > 0 ? t0 : -b + s;
}

// Classifies which anatomical structure is currently under the X-Ray Scanner beam
export function diagnoseAnatomyRegion(bustX, bustY, bustZ, bustYawRad, jawOpen) {
  const cosY = Math.cos(bustYawRad);
  const isBackView = cosY < -0.35;

  if (bustY > 0.72) {
    return isBackView
      ? { title: '顶枕叶皮层 · 人字缝', sub: 'PARIETAL-OCCIPITAL CORTEX' }
      : { title: '额叶皮层 · 额骨颅盖', sub: 'FRONTAL CORTEX & CRANIUM' };
  }
  if (bustY > 0.44) {
    if (isBackView) {
      return { title: '小脑半球 · 枕骨大孔', sub: 'CEREBELLUM & FORAMEN MAGNUM' };
    }
    if (Math.abs(bustX) > 0.48) {
      return { title: '颞肌扇束 · 颧弓颞叶', sub: 'TEMPORALIS & TEMPORAL LOBE' };
    }
    if (Math.abs(bustX) > 0.16) {
      return { title: '眼球晶状体 · 视神经交叉', sub: 'ORBIT, GLOBE & OPTIC NERVE' };
    }
    return { title: '筛骨鼻腔 · 视交叉束', sub: 'NASAL APERTURE & CHIASM' };
  }
  if (bustY > -0.05) {
    if (isBackView) {
      return { title: '延髓脑干 · 寰枢椎 C1-C2', sub: 'BRAINSTEM & ATLAS-AXIS' };
    }
    if (jawOpen > 0.25 && Math.abs(bustX) < 0.42) {
      return { title: '下颌骨张开 · 上下齿列', sub: 'TMJ ARTICULATION & ARCADE' };
    }
    if (Math.abs(bustX) > 0.36) {
      return { title: '咬肌肌束 · 颞下颌关节', sub: 'MASSETER & TMJ CONDYLE' };
    }
    return { title: '上下颌齿弓 · 颏隆突', sub: 'MAXILLA & MANDIBLE TEETH' };
  }
  if (bustY > -0.56) {
    if (isBackView) {
      return { title: '颈椎棘突 C3-C7 · 斜方肌', sub: 'CERVICAL SPINE & TRAPEZIUS' };
    }
    return { title: '颈总动脉 · 胸锁乳突肌', sub: 'CAROTID, JUGULAR & SCM' };
  }
  if (bustY > -0.82) {
    return Math.abs(bustX) > 0.45
      ? { title: '锁骨肩峰 · 三角肌前束', sub: 'CLAVICLE & DELTOID BUNDLE' }
      : { title: '胸骨柄 · 主动脉弓分支', sub: 'MANUBRIUM & AORTIC ARCH' };
  }
  if (isBackView) {
    return { title: '胸椎 T1-T8 · 后肋骨弓', sub: 'THORACIC SPINE & POST. RIBS' };
  }
  if (bustX > -0.08 && bustX < 0.56) {
    return { title: '搏动四腔心 · 左心室心尖', sub: '4-CHAMBER HEART & CORONARY' };
  }
  return { title: '胸廓肋弓 · 胸大肌扇束', sub: 'THORACIC RIBCAGE & PECTORALIS' };
}
