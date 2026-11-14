// 3D Procedural Electronics Primitives, 4 Switchable Hardware Boards,
// 380°C Soldering Iron Wand, Articulated 3-Joint Robotic Gripper Arm & Instanced Flux Smoke/Sparks

import { TAU, DEG2RAD, M4, V3, clamp, lerp, buildSiliconeWireArc } from './math.js';

export const BOARD_TOP_Y = 0.0;
export const BENCH_Y = -0.32;

// Authentic Industrial Hardware Color Palette
export const PALETTE = {
  charcoalIC: [0.11, 0.13, 0.15],
  darkSlate: [0.16, 0.20, 0.24],
  silverMetal: [0.80, 0.85, 0.90],
  brushedAlum: [0.70, 0.76, 0.82],
  darkHeatsink: [0.22, 0.27, 0.32],
  enigGold: [0.96, 0.72, 0.18],
  copperOrange: [0.976, 0.451, 0.086],
  ledCyan: [0.133, 0.827, 0.933],
  ledEmerald: [0.063, 0.725, 0.506],
  ledAmber: [0.961, 0.620, 0.043],
  ledRed: [0.937, 0.255, 0.200],
  servoTeal: [0.08, 0.48, 0.64],
  ivoryHorn: [0.92, 0.94, 0.95],
  capNavy: [0.09, 0.22, 0.32],
  amberGrip: [0.92, 0.54, 0.08],
};

// 7-Segment truth table [a, b, c, d, e, f, g] for digits 0..9
export const SEG7_DIGITS = [
  [1, 1, 1, 1, 1, 1, 0], // 0
  [0, 1, 1, 0, 0, 0, 0], // 1
  [1, 1, 0, 1, 1, 0, 1], // 2
  [1, 1, 1, 1, 0, 0, 1], // 3
  [0, 1, 1, 0, 0, 1, 1], // 4
  [1, 0, 1, 1, 0, 1, 1], // 5
  [1, 0, 1, 1, 1, 1, 1], // 6
  [1, 1, 1, 0, 0, 0, 0], // 7
  [1, 1, 1, 1, 1, 1, 1], // 8
  [1, 1, 1, 1, 0, 1, 1], // 9
];

function uploadIndexedMesh(gl, verts, indices) {
  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);

  const vbo = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(verts), gl.STATIC_DRAW);

  const ibo = gl.createBuffer();
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(indices), gl.STATIC_DRAW);

  const stride = 8 * 4;
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 3, gl.FLOAT, false, stride, 0);
  gl.enableVertexAttribArray(1);
  gl.vertexAttribPointer(1, 3, gl.FLOAT, false, stride, 3 * 4);
  gl.enableVertexAttribArray(2);
  gl.vertexAttribPointer(2, 2, gl.FLOAT, false, stride, 6 * 4);

  gl.bindVertexArray(null);
  return { vao, vbo, ibo, count: indices.length };
}

function createBoxMesh(gl) {
  // Unit cube [-0.5..0.5]^3 with face UVs [0..1]
  const faces = [
    { n: [0, 1, 0], u: [1, 0, 0], v: [0, 0, 1], o: [-0.5, 0.5, -0.5] },
    { n: [0, -1, 0], u: [1, 0, 0], v: [0, 0, -1], o: [-0.5, -0.5, 0.5] },
    { n: [0, 0, 1], u: [1, 0, 0], v: [0, 1, 0], o: [-0.5, -0.5, 0.5] },
    { n: [0, 0, -1], u: [-1, 0, 0], v: [0, 1, 0], o: [0.5, -0.5, -0.5] },
    { n: [1, 0, 0], u: [0, 0, -1], v: [0, 1, 0], o: [0.5, -0.5, 0.5] },
    { n: [-1, 0, 0], u: [0, 0, 1], v: [0, 1, 0], o: [-0.5, -0.5, -0.5] },
  ];
  const verts = [];
  const indices = [];
  let base = 0;
  for (const f of faces) {
    const corners = [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1],
    ];
    for (const [cu, cv] of corners) {
      const px = f.o[0] + f.u[0] * cu + f.v[0] * cv;
      const py = f.o[1] + f.u[1] * cu + f.v[1] * cv;
      const pz = f.o[2] + f.u[2] * cu + f.v[2] * cv;
      verts.push(px, py, pz, f.n[0], f.n[1], f.n[2], cu, cv);
    }
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
    base += 4;
  }
  return uploadIndexedMesh(gl, verts, indices);
}

function createSkyCubeMesh(gl) {
  const pos = [
    -1, -1,  1,   1, -1,  1,   1,  1,  1,  -1,  1,  1,
    -1, -1, -1,  -1,  1, -1,   1,  1, -1,   1, -1, -1,
  ];
  const idx = [
    0, 1, 2, 0, 2, 3,
    4, 5, 6, 4, 6, 7,
    3, 2, 6, 3, 6, 5,
    4, 7, 1, 4, 1, 0,
    1, 7, 6, 1, 6, 2,
    4, 0, 3, 4, 3, 5,
  ];
  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);
  const vbo = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(pos), gl.STATIC_DRAW);
  const ibo = gl.createBuffer();
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(idx), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
  gl.bindVertexArray(null);
  return { vao, count: idx.length };
}

function createPlaneMesh(gl, halfExtent = 26.0, y = BENCH_Y) {
  const verts = [
    -halfExtent, y, -halfExtent, 0, 1, 0, 0, 0,
     halfExtent, y, -halfExtent, 0, 1, 0, 1, 0,
     halfExtent, y,  halfExtent, 0, 1, 0, 1, 1,
    -halfExtent, y,  halfExtent, 0, 1, 0, 0, 1,
  ];
  const indices = [0, 3, 2, 0, 2, 1];
  return uploadIndexedMesh(gl, verts, indices);
}

function createChamferBoardMesh(gl, hw = 3.65, hd = 2.55, yBot = -0.11, yTop = 0.0, ch = 0.24) {
  // 8-vertex chamfered polygon in XZ
  const poly = [
    [-hw + ch, -hd],
    [ hw - ch, -hd],
    [ hw,      -hd + ch],
    [ hw,       hd - ch],
    [ hw - ch,  hd],
    [-hw + ch,  hd],
    [-hw,       hd - ch],
    [-hw,      -hd + ch],
  ];
  const verts = [];
  const indices = [];

  // Top face (center fan)
  verts.push(0, yTop, 0, 0, 1, 0, 0.5, 0.5);
  for (let i = 0; i < poly.length; i++) {
    const [x, z] = poly[i];
    verts.push(x, yTop, z, 0, 1, 0, (x / hw) * 0.5 + 0.5, (z / hd) * 0.5 + 0.5);
  }
  for (let i = 0; i < poly.length; i++) {
    const next = (i + 1) % poly.length;
    indices.push(0, 1 + next, 1 + i);
  }

  // Bottom face
  const botCenter = verts.length / 8;
  verts.push(0, yBot, 0, 0, -1, 0, 0.5, 0.5);
  for (let i = 0; i < poly.length; i++) {
    const [x, z] = poly[i];
    verts.push(x, yBot, z, 0, -1, 0, (x / hw) * 0.5 + 0.5, (z / hd) * 0.5 + 0.5);
  }
  for (let i = 0; i < poly.length; i++) {
    const next = (i + 1) % poly.length;
    indices.push(botCenter, botCenter + 1 + i, botCenter + 1 + next);
  }

  // Side FR-4 edges
  for (let i = 0; i < poly.length; i++) {
    const next = (i + 1) % poly.length;
    const [x0, z0] = poly[i];
    const [x1, z1] = poly[next];
    const dx = x1 - x0;
    const dz = z1 - z0;
    const len = Math.hypot(dx, dz) || 1;
    const nx = -dz / len;
    const nz = dx / len;
    const b = verts.length / 8;
    verts.push(
      x0, yBot, z0, nx, 0, nz, 0, 0,
      x1, yBot, z1, nx, 0, nz, 1, 0,
      x1, yTop, z1, nx, 0, nz, 1, 1,
      x0, yTop, z0, nx, 0, nz, 0, 1
    );
    indices.push(b, b + 2, b + 1, b, b + 3, b + 2);
  }

  return uploadIndexedMesh(gl, verts, indices);
}

function createCylinderMesh(gl, segs = 20, rBottom = 1.0, rTop = 1.0, capped = true) {
  const verts = [];
  const indices = [];
  const slopeY = rBottom - rTop;

  for (let i = 0; i <= segs; i++) {
    const u = i / segs;
    const a = u * TAU;
    const c = Math.cos(a);
    const s = Math.sin(a);
    const nl = Math.hypot(1, slopeY);
    const nx = c / nl;
    const ny = slopeY / nl;
    const nz = s / nl;
    verts.push(c * rBottom, 0, s * rBottom, nx, ny, nz, u, 0);
    verts.push(c * rTop, 1, s * rTop, nx, ny, nz, u, 1);
  }
  for (let i = 0; i < segs; i++) {
    const b = i * 2;
    indices.push(b, b + 1, b + 3, b, b + 3, b + 2);
  }

  if (capped && rTop > 0.001) {
    const tc = verts.length / 8;
    verts.push(0, 1, 0, 0, 1, 0, 0.5, 0.5);
    for (let i = 0; i <= segs; i++) {
      const a = (i / segs) * TAU;
      const c = Math.cos(a);
      const s = Math.sin(a);
      verts.push(c * rTop, 1, s * rTop, 0, 1, 0, c * 0.5 + 0.5, s * 0.5 + 0.5);
    }
    for (let i = 0; i < segs; i++) {
      indices.push(tc, tc + 1 + i + 1, tc + 1 + i);
    }
  }

  if (capped && rBottom > 0.001) {
    const bc = verts.length / 8;
    verts.push(0, 0, 0, 0, -1, 0, 0.5, 0.5);
    for (let i = 0; i <= segs; i++) {
      const a = (i / segs) * TAU;
      const c = Math.cos(a);
      const s = Math.sin(a);
      verts.push(c * rBottom, 0, s * rBottom, 0, -1, 0, c * 0.5 + 0.5, s * 0.5 + 0.5);
    }
    for (let i = 0; i < segs; i++) {
      indices.push(bc, bc + 1 + i, bc + 1 + i + 1);
    }
  }

  return uploadIndexedMesh(gl, verts, indices);
}

function createAnnularPadMesh(gl, segs = 20, rInner = 0.36, rOuter = 1.0, height = 0.016) {
  const verts = [];
  const indices = [];
  for (let i = 0; i <= segs; i++) {
    const u = i / segs;
    const a = u * TAU;
    const c = Math.cos(a);
    const s = Math.sin(a);
    verts.push(c * rInner, height, s * rInner, 0, 1, 0, 0, u);
    verts.push(c * rOuter, height, s * rOuter, 0, 1, 0, 1, u);
  }
  for (let i = 0; i < segs; i++) {
    const b = i * 2;
    indices.push(b, b + 1, b + 3, b, b + 3, b + 2);
  }
  // Outer bevel skirt
  const baseOuter = verts.length / 8;
  for (let i = 0; i <= segs; i++) {
    const a = (i / segs) * TAU;
    const c = Math.cos(a);
    const s = Math.sin(a);
    verts.push(c * rOuter, 0, s * rOuter, c, 0.3, s, 0, 0);
    verts.push(c * rOuter, height, s * rOuter, c, 0.3, s, 0, 1);
  }
  for (let i = 0; i < segs; i++) {
    const b = baseOuter + i * 2;
    indices.push(b, b + 1, b + 3, b, b + 3, b + 2);
  }
  return uploadIndexedMesh(gl, verts, indices);
}

function createSolderConeMesh(gl, segs = 20, rings = 6) {
  // Concave wetted solder meniscus fillet (y in [0..1], r from 1.0 down to 0.16)
  const verts = [];
  const indices = [];
  for (let r = 0; r <= rings; r++) {
    const v = r / rings;
    // Concave meniscus profile: r(v) = lerp(0.16, 1.0, (1 - v)^1.75)
    const rad = lerp(0.15, 1.0, Math.pow(1.0 - v, 1.75));
    const drdv = -1.75 * 0.85 * Math.pow(Math.max(1.0 - v, 0.02), 0.75);
    for (let i = 0; i <= segs; i++) {
      const u = i / segs;
      const a = u * TAU;
      const c = Math.cos(a);
      const s = Math.sin(a);
      const nHoriz = 1.0;
      const nVert = -drdv * 0.65;
      const nl = Math.hypot(nHoriz, nVert);
      verts.push(c * rad, v, s * rad, (c * nHoriz) / nl, nVert / nl, (s * nHoriz) / nl, u, v);
    }
  }
  const stride = segs + 1;
  for (let r = 0; r < rings; r++) {
    for (let i = 0; i < segs; i++) {
      const a = r * stride + i;
      const b = a + stride;
      indices.push(a, b, b + 1, a, b + 1, a + 1);
    }
  }
  // Cap tiny top tip
  const tc = verts.length / 8;
  verts.push(0, 1, 0, 0, 1, 0, 0.5, 1);
  for (let i = 0; i <= segs; i++) {
    const a = (i / segs) * TAU;
    verts.push(Math.cos(a) * 0.15, 1, Math.sin(a) * 0.15, 0, 1, 0, 0.5, 1);
  }
  for (let i = 0; i < segs; i++) {
    indices.push(tc, tc + 1 + i + 1, tc + 1 + i);
  }
  return uploadIndexedMesh(gl, verts, indices);
}

function createLedDomeMesh(gl, segs = 18, domeRings = 6) {
  // 5mm LED: bottom rim flange [0..0.12], cylindrical body [0.12..0.65], hemispherical dome [0.65..1.0]
  const profile = [
    [1.12, 0.00],
    [1.12, 0.12],
    [0.95, 0.13],
    [0.95, 0.65],
  ];
  for (let k = 1; k <= domeRings; k++) {
    const t = (k / domeRings) * (Math.PI * 0.5);
    profile.push([Math.cos(t) * 0.95, 0.65 + Math.sin(t) * 0.35]);
  }

  const verts = [];
  const indices = [];
  for (let p = 0; p < profile.length; p++) {
    const [rad, y] = profile[p];
    const prev = profile[Math.max(0, p - 1)];
    const next = profile[Math.min(profile.length - 1, p + 1)];
    const dy = next[1] - prev[1];
    const dr = next[0] - prev[0];
    const nl = Math.hypot(dy, -dr) || 1;
    const nr = dy / nl;
    const ny = -dr / nl;

    for (let i = 0; i <= segs; i++) {
      const u = i / segs;
      const a = u * TAU;
      const c = Math.cos(a);
      const s = Math.sin(a);
      verts.push(c * rad, y, s * rad, c * nr, ny, s * nr, u, y);
    }
  }
  const stride = segs + 1;
  for (let p = 0; p < profile.length - 1; p++) {
    for (let i = 0; i < segs; i++) {
      const a = p * stride + i;
      const b = a + stride;
      indices.push(a, b, b + 1, a, b + 1, a + 1);
    }
  }
  return uploadIndexedMesh(gl, verts, indices);
}

/**
 * Build a 3D cylindrical silicone tube mesh along a sampled 3D curve.
 */
export function buildWireTubeMesh(gl, curvePoints, radius = 0.042, radialSegs = 10) {
  const verts = [];
  const indices = [];
  const nPts = curvePoints.length;

  let prevUp = [0, 0, 1];
  for (let i = 0; i < nPts; i++) {
    const p = curvePoints[i];
    const pPrev = curvePoints[Math.max(0, i - 1)];
    const pNext = curvePoints[Math.min(nPts - 1, i + 1)];
    const tang = V3.normalize(V3.sub(pNext, pPrev));

    let side = V3.cross(tang, prevUp);
    if (V3.len(side) < 1e-4) {
      side = V3.cross(tang, [1, 0, 0]);
    }
    side = V3.normalize(side);
    const binorm = V3.normalize(V3.cross(side, tang));
    prevUp = binorm;

    const vCoord = i / (nPts - 1);
    for (let j = 0; j <= radialSegs; j++) {
      const uCoord = j / radialSegs;
      const ang = uCoord * TAU;
      const c = Math.cos(ang);
      const s = Math.sin(ang);
      const nx = side[0] * c + binorm[0] * s;
      const ny = side[1] * c + binorm[1] * s;
      const nz = side[2] * c + binorm[2] * s;
      verts.push(
        p[0] + nx * radius,
        p[1] + ny * radius,
        p[2] + nz * radius,
        nx,
        ny,
        nz,
        uCoord,
        vCoord
      );
    }
  }

  const stride = radialSegs + 1;
  for (let i = 0; i < nPts - 1; i++) {
    for (let j = 0; j < radialSegs; j++) {
      const a = i * stride + j;
      const b = a + stride;
      indices.push(a, b, b + 1, a, b + 1, a + 1);
    }
  }
  return uploadIndexedMesh(gl, verts, indices);
}

/**
 * Create dynamic wire tube VAO/VBO so we can render a live stretching jumper wire in Tool [3].
 */
export function createDynamicWireMesh(gl, segments = 24, radialSegs = 8) {
  const nPts = segments + 1;
  const strideVerts = radialSegs + 1;
  const vertFloatCount = nPts * strideVerts * 8;
  const indices = [];
  for (let i = 0; i < nPts - 1; i++) {
    for (let j = 0; j < radialSegs; j++) {
      const a = i * strideVerts + j;
      const b = a + strideVerts;
      indices.push(a, b, b + 1, a, b + 1, a + 1);
    }
  }

  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);

  const vbo = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
  gl.bufferData(gl.ARRAY_BUFFER, vertFloatCount * 4, gl.DYNAMIC_DRAW);

  const ibo = gl.createBuffer();
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(indices), gl.STATIC_DRAW);

  const byteStride = 8 * 4;
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 3, gl.FLOAT, false, byteStride, 0);
  gl.enableVertexAttribArray(1);
  gl.vertexAttribPointer(1, 3, gl.FLOAT, false, byteStride, 3 * 4);
  gl.enableVertexAttribArray(2);
  gl.vertexAttribPointer(2, 2, gl.FLOAT, false, byteStride, 6 * 4);
  gl.bindVertexArray(null);

  const scratch = new Float32Array(vertFloatCount);

  return {
    vao,
    count: indices.length,
    segments,
    update(pStart, pEnd, radius = 0.04) {
      const pts = buildSiliconeWireArc(pStart, pEnd, 0.85, segments);
      let ptr = 0;
      let prevUp = [0, 0, 1];
      for (let i = 0; i < pts.length; i++) {
        const p = pts[i];
        const pPrev = pts[Math.max(0, i - 1)];
        const pNext = pts[Math.min(pts.length - 1, i + 1)];
        const tang = V3.normalize(V3.sub(pNext, pPrev));
        let side = V3.cross(tang, prevUp);
        if (V3.len(side) < 1e-4) side = V3.cross(tang, [1, 0, 0]);
        side = V3.normalize(side);
        const binorm = V3.normalize(V3.cross(side, tang));
        prevUp = binorm;
        const vCoord = i / (pts.length - 1);
        for (let j = 0; j <= radialSegs; j++) {
          const uCoord = j / radialSegs;
          const ang = uCoord * TAU;
          const c = Math.cos(ang);
          const s = Math.sin(ang);
          const nx = side[0] * c + binorm[0] * s;
          const ny = side[1] * c + binorm[1] * s;
          const nz = side[2] * c + binorm[2] * s;
          scratch[ptr++] = p[0] + nx * radius;
          scratch[ptr++] = p[1] + ny * radius;
          scratch[ptr++] = p[2] + nz * radius;
          scratch[ptr++] = nx;
          scratch[ptr++] = ny;
          scratch[ptr++] = nz;
          scratch[ptr++] = uCoord;
          scratch[ptr++] = vCoord;
        }
      }
      gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, scratch);
    },
  };
}

export function createLabMeshes(gl) {
  return {
    skyCube: createSkyCubeMesh(gl),
    workbench: createPlaneMesh(gl, 26.0, BENCH_Y),
    pcbBoard: createChamferBoardMesh(gl, 3.65, 2.55, -0.11, BOARD_TOP_Y, 0.24),
    box: createBoxMesh(gl),
    cylinder: createCylinderMesh(gl, 20, 1.0, 1.0, true),
    coneTip: createCylinderMesh(gl, 20, 0.04, 1.0, true), // sharp tip at y=0, collar at y=1
    padRing: createAnnularPadMesh(gl, 20, 0.36, 1.0, 0.015),
    solderCone: createSolderConeMesh(gl, 20, 6),
    ledDome: createLedDomeMesh(gl, 18, 5),
    dynWire: createDynamicWireMesh(gl, 24, 8),
  };
}

/**
 * GPU-instanced Particle Pool for Rising Rosin Flux Smoke Wisps & Golden Solder Sparks
 */
export function createParticlePool(gl, maxParticles = 320) {
  const quadVerts = new Float32Array([
    -1, -1,
     1, -1,
     1,  1,
    -1, -1,
     1,  1,
    -1,  1,
  ]);

  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);

  const qbo = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, qbo);
  gl.bufferData(gl.ARRAY_BUFFER, quadVerts, gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

  // 10 floats per instance: posSize(4), colorAlpha(4), kindPhase(2)
  const strideFloats = 10;
  const instanceData = new Float32Array(maxParticles * strideFloats);
  const ibo = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, ibo);
  gl.bufferData(gl.ARRAY_BUFFER, instanceData.byteLength, gl.DYNAMIC_DRAW);

  const byteStride = strideFloats * 4;
  gl.enableVertexAttribArray(1);
  gl.vertexAttribPointer(1, 4, gl.FLOAT, false, byteStride, 0);
  gl.vertexAttribDivisor(1, 1);

  gl.enableVertexAttribArray(2);
  gl.vertexAttribPointer(2, 4, gl.FLOAT, false, byteStride, 4 * 4);
  gl.vertexAttribDivisor(2, 1);

  gl.enableVertexAttribArray(3);
  gl.vertexAttribPointer(3, 2, gl.FLOAT, false, byteStride, 8 * 4);
  gl.vertexAttribDivisor(3, 1);

  gl.bindVertexArray(null);

  const list = [];

  return {
    vao,
    spawnFluxSmoke(x, y, z, count = 2) {
      for (let i = 0; i < count; i++) {
        if (list.length >= maxParticles) list.shift();
        list.push({
          kind: 0,
          x: x + (Math.random() - 0.5) * 0.08,
          y: y + 0.05,
          z: z + (Math.random() - 0.5) * 0.08,
          vx: (Math.random() - 0.5) * 0.16,
          vy: 0.48 + Math.random() * 0.36,
          vz: (Math.random() - 0.5) * 0.16,
          size: 0.08 + Math.random() * 0.05,
          grow: 0.38 + Math.random() * 0.24,
          age: 0,
          life: 1.35 + Math.random() * 0.65,
          phase: Math.random() * TAU,
          spin: (Math.random() - 0.5) * 1.8,
          r: 0.84,
          g: 0.89,
          b: 0.92,
        });
      }
    },
    spawnSolderSparks(x, y, z, count = 8) {
      for (let i = 0; i < count; i++) {
        if (list.length >= maxParticles) list.shift();
        const ang = Math.random() * TAU;
        const spd = 0.65 + Math.random() * 1.45;
        list.push({
          kind: 1,
          x,
          y: y + 0.05,
          z,
          vx: Math.cos(ang) * spd,
          vy: 0.85 + Math.random() * 1.35,
          vz: Math.sin(ang) * spd,
          size: 0.032 + Math.random() * 0.024,
          grow: -0.02,
          age: 0,
          life: 0.36 + Math.random() * 0.28,
          phase: Math.random() * TAU,
          spin: 0,
          r: 1.0,
          g: 0.68 + Math.random() * 0.24,
          b: 0.16,
        });
      }
    },
    updateAndUpload(dt) {
      let aliveCount = 0;
      for (let i = list.length - 1; i >= 0; i--) {
        const p = list[i];
        p.age += dt;
        if (p.age >= p.life) {
          list.splice(i, 1);
          continue;
        }
        const u = p.age / p.life;
        if (p.kind === 0) {
          // Curling rising rosin smoke
          p.vx += Math.sin(p.age * 4.5 + p.phase) * 0.32 * dt;
          p.vz += Math.cos(p.age * 3.8 + p.phase) * 0.32 * dt;
          p.x += p.vx * dt;
          p.y += p.vy * dt;
          p.z += p.vz * dt;
          p.size += p.grow * dt;
          p.phase += p.spin * dt;
        } else {
          // Ballistic solder sparks with PCB bounce
          p.vy -= 5.8 * dt;
          p.x += p.vx * dt;
          p.y += p.vy * dt;
          p.z += p.vz * dt;
          if (p.y < BOARD_TOP_Y + 0.02) {
            p.y = BOARD_TOP_Y + 0.02;
            p.vy = Math.abs(p.vy) * 0.38;
            p.vx *= 0.65;
            p.vz *= 0.65;
          }
        }

        const alpha =
          p.kind === 0
            ? Math.sin(Math.min(u * Math.PI, Math.PI)) * 0.62
            : 1.0 - u * u;

        const base = aliveCount * strideFloats;
        instanceData[base + 0] = p.x;
        instanceData[base + 1] = p.y;
        instanceData[base + 2] = p.z;
        instanceData[base + 3] = Math.max(0.01, p.size);
        instanceData[base + 4] = p.r;
        instanceData[base + 5] = p.g;
        instanceData[base + 6] = p.b;
        instanceData[base + 7] = alpha;
        instanceData[base + 8] = p.kind;
        instanceData[base + 9] = p.phase;
        aliveCount++;
      }

      if (aliveCount > 0) {
        gl.bindBuffer(gl.ARRAY_BUFFER, ibo);
        gl.bufferSubData(
          gl.ARRAY_BUFFER,
          0,
          instanceData.subarray(0, aliveCount * strideFloats)
        );
      }
      return aliveCount;
    },
    clear() {
      list.length = 0;
    },
  };
}

function makeDualRowPads(cx, cz, cols, pitchX, rowHalfSpanZ) {
  const pads = [];
  const x0 = cx - ((cols - 1) * pitchX) * 0.5;
  for (let c = 0; c < cols; c++) {
    const px = x0 + c * pitchX;
    pads.push([px, cz - rowHalfSpanZ]);
    pads.push([px, cz + rowHalfSpanZ]);
  }
  return pads;
}

/**
 * 4 Switchable 3D Electronics Lab Projects Specification
 */
export const BOARDS_SPEC = [
  // ============================================================================
  // BOARD 01: UNO-R3 追光流水灯矩阵
  // ============================================================================
  {
    index: 0,
    code: 'UNO-R3',
    name: 'UNO-R3 追光流水灯矩阵',
    subtitle: '经典翠绿倒角开发板 · ATmega328P 主控与 0-9 数码管流水阵列',
    theme: 0, // Emerald #0f6b4a
    powerSwitchPos: [-3.05, 0.15],
    camTarget: [0.0, 0.0, 0.0],
    camDist: 8.6,
    traces: [
      [-3.05, 0.15, -1.65, 0.65],
      [-1.65, 0.65, -0.55, 0.65],
      [-0.55, 0.65, -0.55, -0.45],
      [-0.55, 0.65, 1.35, 0.75],
      [-0.55, -0.45, 0.95, -0.55],
      [0.95, -0.55, 0.95, -1.55],
      [1.35, 0.75, 2.35, 0.75],
      [-1.95, -0.65, -0.55, -0.45],
      [-2.45, 1.55, -1.25, 0.85],
      [-2.15, -1.95, 0.65, -1.95],
      [-0.35, 1.95, 1.45, 1.95],
      [1.65, 1.95, 2.55, 1.55],
    ],
    components: [
      {
        id: 'atmega328',
        name: 'ATmega328P DIP-28 芯片',
        short: 'ATmega328P',
        kind: 'dip28',
        pos: [-0.45, 0.62],
        aabb: [1.05, 0.36, 0.46],
        pads: makeDualRowPads(-0.45, 0.62, 3, 0.72, 0.38),
      },
      {
        id: 'xtal16',
        name: '16MHz 石英晶振',
        short: '16MHz 晶振',
        kind: 'crystal',
        pos: [-1.95, -0.62],
        aabb: [0.46, 0.38, 0.28],
        pads: [
          [-2.16, -0.62],
          [-1.74, -0.62],
        ],
      },
      {
        id: 'led4',
        name: '4 路高亮 LED 阵列',
        short: '4路LED阵列',
        kind: 'led_array',
        pos: [0.95, -1.45],
        aabb: [1.08, 0.52, 0.36],
        pads: [
          [0.14, -1.45],
          [0.68, -1.45],
          [1.22, -1.45],
          [1.76, -1.45],
        ],
      },
      {
        id: 'res4',
        name: '色环限流电阻排',
        short: '色环电阻排',
        kind: 'resistor_bank',
        pos: [0.95, -0.52],
        aabb: [1.06, 0.28, 0.38],
        pads: [
          [0.14, -0.52],
          [0.68, -0.52],
          [1.22, -0.52],
          [1.76, -0.52],
        ],
      },
      {
        id: 'seg7',
        name: '7 段数码管',
        short: '7段数码管',
        kind: 'seg7',
        pos: [2.35, 0.58],
        aabb: [0.64, 0.42, 0.82],
        pads: [
          [2.02, -0.18],
          [2.68, -0.18],
          [2.02, 1.34],
          [2.68, 1.34],
        ],
      },
      {
        id: 'rst_btn',
        name: '微动复位按键',
        short: '复位按键',
        kind: 'tact_btn',
        pos: [-2.35, 1.48],
        aabb: [0.38, 0.38, 0.38],
        pads: [
          [-2.62, 1.48],
          [-2.08, 1.48],
        ],
      },
    ],
    wires: [
      {
        id: 'uno_w1',
        name: '5V 稳压供电母线',
        color: PALETTE.ledRed,
        from: [-2.15, -2.02],
        to: [-0.35, -2.02],
        arcHeight: 0.78,
      },
      {
        id: 'uno_w2',
        name: 'D2-D5 追光脉冲飞线',
        color: PALETTE.ledCyan,
        from: [-1.15, 2.02],
        to: [0.68, -2.02],
        arcHeight: 1.25,
      },
      {
        id: 'uno_w3',
        name: 'BCD 数码管译码飞线',
        color: PALETTE.ledAmber,
        from: [0.45, 2.02],
        to: [2.35, 2.02],
        arcHeight: 0.85,
      },
    ],
  },

  // ============================================================================
  // BOARD 02: ESP32 超声波雷达云台
  // ============================================================================
  {
    index: 1,
    code: 'ESP32-RADAR',
    name: 'ESP32 超声波雷达云台',
    subtitle: '深青物联网主板 · SG90 微型舵机驱动 HC-SR04 双探头 ±65° 声呐扫描',
    theme: 1, // Dark Teal #0b4f5c
    powerSwitchPos: [-3.05, 0.15],
    camTarget: [0.1, 0.1, 0.0],
    camDist: 8.8,
    traces: [
      [-3.05, 0.15, -1.55, 0.15],
      [-1.55, 0.15, -1.55, -1.15],
      [-1.55, 0.15, 0.15, 0.15],
      [0.15, 0.15, 1.75, -0.45],
      [1.75, -0.45, 1.75, 0.92],
      [0.15, 0.15, 0.15, 1.35],
      [-1.55, -1.15, 0.15, -1.25],
      [-1.85, 1.98, 1.15, 1.98],
      [-0.65, -2.02, 1.85, -2.02],
    ],
    components: [
      {
        id: 'esp32_mod',
        name: 'ESP32 双核模组',
        short: 'ESP32模组',
        kind: 'esp32',
        pos: [-1.35, 0.25],
        aabb: [0.85, 0.36, 1.05],
        pads: [
          [-2.08, -0.35],
          [-2.08, 0.25],
          [-2.08, 0.85],
          [-0.62, -0.35],
          [-0.62, 0.25],
          [-0.62, 0.85],
        ],
      },
      {
        id: 'sg90_servo',
        name: 'SG90 9g 微型舵机',
        short: 'SG90舵机',
        kind: 'servo_sg90',
        pos: [1.75, -0.55],
        aabb: [0.68, 0.78, 0.48],
        pads: [
          [1.22, -1.08],
          [1.75, -1.08],
          [2.28, -1.08],
        ],
      },
      {
        id: 'hcsr04',
        name: 'HC-SR04 双圆筒超声波探头',
        short: 'HC-SR04探头',
        kind: 'ultrasonic',
        pos: [1.75, 0.78],
        aabb: [1.05, 0.95, 0.46],
        pads: [
          [1.15, 1.26],
          [1.55, 1.26],
          [1.95, 1.26],
          [2.35, 1.26],
        ],
      },
      {
        id: 'filter_caps',
        name: '稳压滤波电容组',
        short: '滤波电容组',
        kind: 'cap_bank',
        pos: [-0.25, -1.25],
        aabb: [0.72, 0.68, 0.42],
        pads: [
          [-0.68, -1.25],
          [-0.36, -1.25],
          [0.08, -1.25],
          [0.40, -1.25],
        ],
      },
      {
        id: 'piezo_buz',
        name: '压电蜂鸣器',
        short: '压电蜂鸣器',
        kind: 'buzzer',
        pos: [0.15, 1.32],
        aabb: [0.46, 0.48, 0.46],
        pads: [
          [-0.28, 1.32],
          [0.58, 1.32],
        ],
      },
    ],
    wires: [
      {
        id: 'esp_w1',
        name: '5V 舵机动力供电线',
        color: PALETTE.ledRed,
        from: [-1.85, -2.02],
        to: [1.25, -2.02],
        arcHeight: 0.92,
      },
      {
        id: 'esp_w2',
        name: 'GPIO18 舵机 PWM 飞线',
        color: PALETTE.ledEmerald,
        from: [-0.55, -2.02],
        to: [2.28, -2.02],
        arcHeight: 0.88,
      },
      {
        id: 'esp_w3',
        name: 'TRIG/ECHO 声呐回波线',
        color: PALETTE.ledCyan,
        from: [-1.85, 2.02],
        to: [1.75, 2.02],
        arcHeight: 1.05,
      },
    ],
  },

  // ============================================================================
  // BOARD 03: SYNTH-555 芯片八音盒
  // ============================================================================
  {
    index: 2,
    code: 'SYNTH-555',
    name: 'SYNTH-555 芯片八音盒',
    subtitle: '复古琥珀流金声学板 · NE555 + LM386 实时八音盒琶音与 8 段电平灯柱',
    theme: 2, // Warm Amber-Gold #6e4710
    powerSwitchPos: [-3.05, 0.15],
    camTarget: [0.0, 0.0, 0.0],
    camDist: 8.6,
    traces: [
      [-3.05, 0.15, -1.55, -0.55],
      [-1.55, -0.55, -0.15, -0.55],
      [-0.15, -0.55, 1.25, -0.65],
      [-1.55, -0.55, -1.35, 1.05],
      [-0.15, -0.55, 0.45, 1.05],
      [0.45, 1.05, 2.35, 0.25],
      [1.25, -0.65, 2.35, 0.25],
      [-1.85, 2.02, 0.65, 2.02],
      [-1.45, -2.02, 1.45, -2.02],
    ],
    components: [
      {
        id: 'ne555',
        name: 'NE555 时基芯片',
        short: 'NE555芯片',
        kind: 'dip8',
        pos: [-1.45, -0.55],
        aabb: [0.58, 0.34, 0.44],
        pads: makeDualRowPads(-1.45, -0.55, 2, 0.48, 0.36),
      },
      {
        id: 'lm386',
        name: 'LM386 功放芯片',
        short: 'LM386功放',
        kind: 'dip8',
        pos: [-0.05, -0.55],
        aabb: [0.58, 0.34, 0.44],
        pads: makeDualRowPads(-0.05, -0.55, 2, 0.48, 0.36),
      },
      {
        id: 'pot_dial',
        name: '旋转电位器旋钮',
        short: '电位器旋钮',
        kind: 'pot_knob',
        pos: [-1.35, 1.05],
        aabb: [0.58, 0.68, 0.58],
        pads: [
          [-1.72, 1.56],
          [-1.35, 1.56],
          [-0.98, 1.56],
        ],
      },
      {
        id: 'gold_piezo',
        name: '黄金压电扬声器',
        short: '黄金扬声器',
        kind: 'piezo_gold',
        pos: [0.65, 1.05],
        aabb: [0.76, 0.28, 0.76],
        pads: [
          [0.12, 1.72],
          [1.18, 1.72],
        ],
      },
      {
        id: 'vu_bar8',
        name: '8 段电平灯柱',
        short: '8段电平柱',
        kind: 'vu_bar',
        pos: [2.32, 0.15],
        aabb: [0.46, 0.38, 1.38],
        pads: [
          [1.82, -0.95],
          [1.82, -0.22],
          [1.82, 0.52],
          [1.82, 1.25],
        ],
      },
    ],
    wires: [
      {
        id: 'syn_w1',
        name: 'NE555 振荡调频飞线',
        color: PALETTE.ledAmber,
        from: [-1.85, -2.02],
        to: [-1.85, 2.02],
        arcHeight: 1.08,
      },
      {
        id: 'syn_w2',
        name: 'LM386 音频耦合飞线',
        color: PALETTE.ledCyan,
        from: [-0.05, -2.02],
        to: [0.65, 2.02],
        arcHeight: 1.18,
      },
      {
        id: 'syn_w3',
        name: 'VU 电平采样母线',
        color: PALETTE.ledEmerald,
        from: [1.25, -2.02],
        to: [2.32, -2.02],
        arcHeight: 0.75,
      },
    ],
  },

  // ============================================================================
  // BOARD 04: CYBER-ARM 机械臂驱动盾 + 3-Joint Desktop Robotic Gripper Arm
  // ============================================================================
  {
    index: 3,
    code: 'CYBER-ARM',
    name: 'CYBER-ARM 机械臂驱动盾',
    subtitle: '工业深海青电机驱动盾 · L298N 散热电桥联动右侧三轴桌面机械夹爪臂',
    theme: 3, // Industrial Navy-Cyan #0c354e
    hasRoboticArm: true,
    powerSwitchPos: [-3.05, 0.15],
    camTarget: [1.35, 0.42, 0.05],
    camDist: 11.4,
    traces: [
      [-3.05, 0.15, -1.35, 0.25],
      [-1.35, 0.25, 0.45, 0.55],
      [0.45, 0.55, 2.65, 0.55],
      [-1.35, 0.25, -1.15, -1.15],
      [-1.15, -1.15, 1.15, -1.05],
      [1.15, -1.05, 2.85, -0.55],
      [0.45, 0.55, 2.85, 1.35],
      [-1.85, 2.02, 2.65, 2.02],
      [-1.65, -2.02, 2.65, -2.02],
    ],
    components: [
      {
        id: 'l298n',
        name: 'L298N 散热片电桥芯片',
        short: 'L298N电桥',
        kind: 'l298n',
        pos: [0.45, 0.65],
        aabb: [0.95, 1.05, 0.62],
        pads: [
          [-0.25, 0.02],
          [0.10, 0.02],
          [0.45, 0.02],
          [0.80, 0.02],
          [1.15, 0.02],
        ],
      },
      {
        id: 'dual_caps',
        name: '双路大电容',
        short: '双路大电容',
        kind: 'cap_bank_large',
        pos: [-1.25, -0.95],
        aabb: [0.88, 0.92, 0.52],
        pads: [
          [-1.78, -0.95],
          [-1.40, -0.95],
          [-0.96, -0.95],
          [-0.58, -0.95],
        ],
      },
      {
        id: 'pwm_driver',
        name: 'PWM 调速芯片',
        short: 'PWM调速芯片',
        kind: 'pwm_ic',
        pos: [1.25, -1.05],
        aabb: [0.85, 0.36, 0.46],
        pads: makeDualRowPads(1.25, -1.05, 2, 0.62, 0.38),
      },
      {
        id: 'sense_res',
        name: '大功率采样排阻',
        short: '采样排阻',
        kind: 'resistor_bank',
        pos: [-1.45, 0.85],
        aabb: [0.98, 0.32, 0.38],
        pads: [
          [-2.12, 0.85],
          [-1.68, 0.85],
          [-1.22, 0.85],
          [-0.78, 0.85],
        ],
      },
    ],
    wires: [
      {
        id: 'arm_w1',
        name: '12V H桥主动力线',
        color: PALETTE.ledRed,
        from: [-1.25, -2.02],
        to: [3.05, -0.85],
        arcHeight: 0.95,
      },
      {
        id: 'arm_w2',
        name: '肩肘双轴伺服信号线',
        color: PALETTE.ledCyan,
        from: [1.25, -2.02],
        to: [3.05, 0.05],
        arcHeight: 0.85,
      },
      {
        id: 'arm_w3',
        name: '机械爪开合驱动飞线',
        color: PALETTE.ledAmber,
        from: [0.45, 2.02],
        to: [3.05, 0.95],
        arcHeight: 0.95,
      },
    ],
  },
];

// Reusable scratch matrix
const mTmp = M4.create();
const mJoint = M4.create();
const mPart = M4.create();

function drawPart(gl, prog, mesh, modelMat, matType, color, p1 = 0, p2 = 0) {
  gl.uniformMatrix4fv(prog.u.uModel, false, modelMat);
  gl.uniform1i(prog.u.uMatType, matType);
  gl.uniform3fv(prog.u.uBaseColor, color);
  gl.uniform1f(prog.u.uParam1, p1);
  gl.uniform1f(prog.u.uParam2, p2);
  gl.bindVertexArray(mesh.vao);
  gl.drawElements(gl.TRIANGLES, mesh.count, gl.UNSIGNED_SHORT, 0);
}

/**
 * Draw fixed onboard connectors, corner brass standoffs, power toggle switch & header blocks
 */
export function drawBoardFixedHardware(gl, prog, meshes, boardSpec, state) {
  const { powerSwitchAnim, powerEffective } = state;

  // 1. Four Corner Brushed-Gold Standoffs + Top Mounting Rings
  const corners = [
    [-3.28, -2.18],
    [ 3.28, -2.18],
    [ 3.28,  2.18],
    [-3.28,  2.18],
  ];
  for (const [cx, cz] of corners) {
    M4.fromTRS(mTmp, cx, BENCH_Y, cz, 0, 0, 0, 0.16, Math.abs(BENCH_Y) - 0.10, 0.16);
    drawPart(gl, prog, meshes.cylinder, mTmp, 2, PALETTE.enigGold);
    M4.fromTRS(mTmp, cx, BOARD_TOP_Y + 0.002, cz, 0, 0, 0, 0.22, 1.0, 0.22);
    drawPart(gl, prog, meshes.padRing, mTmp, 2, PALETTE.enigGold);
  }

  // 2. Left-Edge Metallic USB-B Port & DC Power Barrel Jack
  M4.fromTRS(mTmp, -3.38, 0.28, -1.18, 0, 0, 0, 0.72, 0.56, 0.62);
  drawPart(gl, prog, meshes.box, mTmp, 1, PALETTE.silverMetal);
  M4.fromTRS(mTmp, -3.72, 0.28, -1.18, 0, 0, 0, 0.08, 0.36, 0.42);
  drawPart(gl, prog, meshes.box, mTmp, 0, PALETTE.charcoalIC);

  // DC Barrel Jack
  M4.fromTRS(mTmp, -3.28, 0.24, 1.38, 0, 0, 0, 0.76, 0.48, 0.54);
  drawPart(gl, prog, meshes.box, mTmp, 9, PALETTE.charcoalIC);
  M4.fromTRS(mTmp, -3.68, 0.24, 1.38, 0, 0, Math.PI * 0.5, 0.18, 0.16, 0.18);
  drawPart(gl, prog, meshes.cylinder, mTmp, 1, PALETTE.silverMetal);

  // 3. Interactive 3D Power Toggle Switch on Left Side!
  const [sx, sz] = boardSpec.powerSwitchPos;
  M4.fromTRS(mTmp, sx, 0.12, sz, 0, 0, 0, 0.46, 0.24, 0.62);
  drawPart(gl, prog, meshes.box, mTmp, 9, PALETTE.darkSlate);
  M4.fromTRS(mTmp, sx, 0.24, sz, 0, 0, 0, 0.14, 0.08, 0.14);
  drawPart(gl, prog, meshes.cylinder, mTmp, 1, PALETTE.silverMetal);

  // Tilting Metallic Bat-Handle Toggle Lever
  const tiltZ = 0;
  const tiltX = lerp(0.45, -0.45, powerSwitchAnim);
  M4.identity(mTmp);
  M4.translate(mTmp, mTmp, sx, 0.28, sz);
  M4.rotateX(mTmp, mTmp, tiltX);
  M4.rotateZ(mTmp, mTmp, tiltZ);
  M4.scale(mTmp, mTmp, 0.065, 0.44, 0.065);
  drawPart(
    gl,
    prog,
    meshes.cylinder,
    mTmp,
    powerSwitchAnim > 0.5 ? 2 : 1,
    powerSwitchAnim > 0.5 ? PALETTE.enigGold : PALETTE.silverMetal
  );

  // Onboard Power Status Pilot LED right next to toggle switch
  M4.fromTRS(mTmp, sx + 0.42, 0.0, sz, 0, 0, 0, 0.11, 0.22, 0.11);
  drawPart(
    gl,
    prog,
    meshes.ledDome,
    mTmp,
    4,
    PALETTE.ledEmerald,
    state.powered ? 0.8 + powerEffective * 1.3 : 0.0
  );

  // 4. Pin Header Housings & Golden Male Pins for all Jumper Wire Endpoints
  for (let wIdx = 0; wIdx < boardSpec.wires.length; wIdx++) {
    const w = boardSpec.wires[wIdx];
    const isWired = state.wiredFlags[wIdx];
    const isHighlight = state.highlightWireIdx === wIdx;
    const endpoints = [w.from, w.to];
    for (let e = 0; e < 2; e++) {
      const [hx, hz] = endpoints[e];
      M4.fromTRS(mTmp, hx, 0.09, hz, 0, 0, 0, 0.24, 0.18, 0.24);
      drawPart(gl, prog, meshes.box, mTmp, 9, PALETTE.charcoalIC, isHighlight ? 0.6 : 0.0);
      M4.fromTRS(mTmp, hx, 0.0, hz, 0, 0, 0, 0.036, 0.42, 0.036);
      drawPart(
        gl,
        prog,
        meshes.cylinder,
        mTmp,
        2,
        PALETTE.enigGold,
        !isWired && (state.activeTool === 3 || isHighlight) ? 1.0 : 0.0
      );
    }
  }

  // Board 04 Output Terminal Block on Right Edge linking to Robotic Arm
  if (boardSpec.hasRoboticArm) {
    M4.fromTRS(mTmp, 3.35, 0.22, 0.05, 0, 0, 0, 0.42, 0.44, 2.35);
    drawPart(gl, prog, meshes.box, mTmp, 9, PALETTE.servoTeal);
    // Heavy ribbon conduit bridge over to the Robotic Arm pedestal
    M4.fromTRS(mTmp, 4.35, BENCH_Y + 0.05, 0.08, 0, 0, 0, 1.75, 0.08, 0.46);
    drawPart(gl, prog, meshes.box, mTmp, 9, PALETTE.charcoalIC, powerEffective * 0.2);
  }
}

/**
 * Draw a single socketed 3D Electronic Component (either real PBR or translucent Ghost Blueprint)
 */
export function drawElectronicComponent(gl, prog, meshes, comp, isGhost, hoverFlag, sim) {
  const [cx, cz] = comp.pos;
  const liftY = isGhost ? 0.03 : comp.dropOffset || 0.0;
  const matOverride = (realMat) => (isGhost ? 6 : realMat);
  const ghostP1 = hoverFlag ? 1.0 : 0.0;

  switch (comp.kind) {
    case 'dip28':
    case 'pwm_ic': {
      const lenX = comp.kind === 'dip28' ? 1.88 : 1.52;
      const pinPairs = comp.kind === 'dip28' ? 8 : 6;
      // Plastic IC Socket + Matte Epoxy DIP Body
      M4.fromTRS(mTmp, cx, liftY + 0.14, cz, 0, 0, 0, lenX, 0.22, 0.56);
      drawPart(gl, prog, meshes.box, mTmp, matOverride(0), PALETTE.charcoalIC, isGhost ? ghostP1 : 0);
      if (!isGhost) {
        for (let i = 0; i < pinPairs; i++) {
          const px = cx - (lenX * 0.42) + (i / (pinPairs - 1)) * (lenX * 0.84);
          for (const sz of [-0.33, 0.33]) {
            M4.fromTRS(mTmp, px, liftY + 0.09, cz + sz, 0, 0, 0, 0.06, 0.20, 0.08);
            drawPart(gl, prog, meshes.box, mTmp, 1, PALETTE.silverMetal);
          }
        }
      }
      break;
    }

    case 'dip8': {
      M4.fromTRS(mTmp, cx, liftY + 0.14, cz, 0, 0, 0, 0.88, 0.22, 0.54);
      drawPart(gl, prog, meshes.box, mTmp, matOverride(0), PALETTE.charcoalIC, isGhost ? ghostP1 : 0);
      if (!isGhost) {
        for (let i = 0; i < 4; i++) {
          const px = cx - 0.32 + i * 0.213;
          for (const sz of [-0.32, 0.32]) {
            M4.fromTRS(mTmp, px, liftY + 0.09, cz + sz, 0, 0, 0, 0.06, 0.20, 0.08);
            drawPart(gl, prog, meshes.box, mTmp, 1, PALETTE.silverMetal);
          }
        }
      }
      break;
    }

    case 'esp32': {
      // Dark carrier module PCB + Brushed Tin RF Shield Can + Gold Antenna Trace
      M4.fromTRS(mTmp, cx, liftY + 0.06, cz, 0, 0, 0, 1.38, 0.08, 1.88);
      drawPart(gl, prog, meshes.box, mTmp, matOverride(9), PALETTE.charcoalIC, isGhost ? ghostP1 : 0);
      M4.fromTRS(mTmp, cx, liftY + 0.18, cz + 0.18, 0, 0, 0, 1.12, 0.18, 1.24);
      drawPart(gl, prog, meshes.box, mTmp, matOverride(1), PALETTE.silverMetal, isGhost ? ghostP1 : 0);
      if (!isGhost) {
        M4.fromTRS(mTmp, cx, liftY + 0.105, cz - 0.68, 0, 0, 0, 0.92, 0.02, 0.28);
        drawPart(gl, prog, meshes.box, mTmp, 2, PALETTE.enigGold);
        // Tiny WiFi status LED on ESP32
        M4.fromTRS(mTmp, cx + 0.45, liftY + 0.10, cz - 0.55, 0, 0, 0, 0.07, 0.10, 0.07);
        drawPart(gl, prog, meshes.ledDome, mTmp, 4, PALETTE.ledCyan, sim.espLedGlow);
      }
      break;
    }

    case 'crystal': {
      // HC-49S Brushed Steel Quartz Crystal Can
      M4.fromTRS(mTmp, cx, liftY + 0.04, cz, 0, 0, 0, 0.72, 0.30, 0.34);
      drawPart(gl, prog, meshes.cylinder, mTmp, matOverride(1), PALETTE.silverMetal, isGhost ? ghostP1 : 0);
      break;
    }

    case 'led_array': {
      const cols = [PALETTE.ledCyan, PALETTE.ledEmerald, PALETTE.ledAmber, PALETTE.ledRed];
      for (let i = 0; i < 4; i++) {
        const lx = cx - 0.81 + i * 0.54;
        const glow = !isGhost ? (sim.chaserLevels[i] || 0.0) : 0.0;
        M4.fromTRS(mTmp, lx, liftY + 0.08, cz, 0, 0, 0, 0.17, 0.38, 0.17);
        drawPart(
          gl,
          prog,
          meshes.ledDome,
          mTmp,
          matOverride(4),
          cols[i],
          isGhost ? ghostP1 : glow
        );
        if (!isGhost) {
          M4.fromTRS(mTmp, lx - 0.05, liftY, cz, 0, 0, 0, 0.02, 0.10, 0.02);
          drawPart(gl, prog, meshes.cylinder, mTmp, 1, PALETTE.silverMetal);
          M4.fromTRS(mTmp, lx + 0.05, liftY, cz, 0, 0, 0, 0.02, 0.10, 0.02);
          drawPart(gl, prog, meshes.cylinder, mTmp, 1, PALETTE.silverMetal);
        }
      }
      break;
    }

    case 'resistor_bank': {
      for (let i = 0; i < 4; i++) {
        const rx = cx - 0.81 + i * 0.54;
        // Horizontal axial ceramic body along Z
        M4.identity(mTmp);
        M4.translate(mTmp, mTmp, rx, liftY + 0.16, cz - 0.22);
        M4.rotateX(mTmp, mTmp, Math.PI * 0.5);
        M4.scale(mTmp, mTmp, 0.085, 0.44, 0.085);
        drawPart(
          gl,
          prog,
          meshes.cylinder,
          mTmp,
          matOverride(5),
          PALETTE.ivoryHorn,
          isGhost ? ghostP1 : i
        );
        if (!isGhost) {
          for (const lz of [-0.24, 0.24]) {
            M4.fromTRS(mTmp, rx, liftY, cz + lz, 0, 0, 0, 0.022, 0.16, 0.022);
            drawPart(gl, prog, meshes.cylinder, mTmp, 1, PALETTE.silverMetal);
          }
        }
      }
      break;
    }

    case 'seg7': {
      // Dark charcoal 7-segment display housing
      M4.fromTRS(mTmp, cx, liftY + 0.15, cz, 0, 0, 0, 1.06, 0.28, 1.42);
      drawPart(gl, prog, meshes.box, mTmp, matOverride(0), PALETTE.charcoalIC, isGhost ? ghostP1 : 0);
      if (!isGhost) {
        const mask = SEG7_DIGITS[sim.currentDigit % 10];
        // 7 segments [a, b, c, d, e, f, g] in local XZ on top face y = liftY + 0.30
        const sy = liftY + 0.30;
        const segDefs = [
          [0.0, -0.46, 0.48, 0.09],  // a (top)
          [0.24, -0.23, 0.09, 0.42], // b (top-right)
          [0.24,  0.23, 0.09, 0.42], // c (bottom-right)
          [0.0,  0.46, 0.48, 0.09],  // d (bottom)
          [-0.24, 0.23, 0.09, 0.42], // e (bottom-left)
          [-0.24,-0.23, 0.09, 0.42], // f (top-left)
          [0.0,  0.00, 0.46, 0.09],  // g (middle)
        ];
        for (let s = 0; s < 7; s++) {
          const [ox, oz, sw, sd] = segDefs[s];
          const lit = sim.seg7Active ? mask[s] * 1.95 : 0.04;
          M4.fromTRS(mTmp, cx + ox, sy, cz + oz, 0, 0, 0, sw, 0.035, sd);
          drawPart(gl, prog, meshes.box, mTmp, 4, PALETTE.ledAmber, lit);
        }
        // Decimal point pulsing
        M4.fromTRS(mTmp, cx + 0.38, sy, cz + 0.46, 0, 0, 0, 0.08, 0.035, 0.08);
        drawPart(gl, prog, meshes.box, mTmp, 4, PALETTE.ledCyan, sim.seg7Active ? 1.4 : 0.04);
      }
      break;
    }

    case 'tact_btn': {
      M4.fromTRS(mTmp, cx, liftY + 0.09, cz, 0, 0, 0, 0.56, 0.18, 0.56);
      drawPart(gl, prog, meshes.box, mTmp, matOverride(9), PALETTE.charcoalIC, isGhost ? ghostP1 : 0);
      M4.fromTRS(mTmp, cx, liftY + 0.16, cz, 0, 0, 0, 0.18, 0.16, 0.18);
      drawPart(gl, prog, meshes.cylinder, mTmp, matOverride(9), PALETTE.ledRed, isGhost ? ghostP1 : 0);
      break;
    }

    case 'servo_sg90': {
      // Translucent Teal-Cyan SG90 Micro Servo Body + Rotating White Cross Horn
      M4.fromTRS(mTmp, cx, liftY + 0.32, cz, 0, 0, 0, 1.12, 0.62, 0.58);
      drawPart(gl, prog, meshes.box, mTmp, matOverride(9), PALETTE.servoTeal, isGhost ? ghostP1 : 0);
      if (!isGhost) {
        // Output shaft + rotating servo horn synced with sim.radarYaw!
        M4.fromTRS(mTmp, cx, liftY + 0.63, cz + 0.18, 0, 0, 0, 0.15, 0.12, 0.15);
        drawPart(gl, prog, meshes.cylinder, mTmp, 2, PALETTE.enigGold);

        M4.fromTRS(mTmp, cx, liftY + 0.75, cz + 0.18, 0, sim.radarYaw, 0, 0.92, 0.06, 0.16);
        drawPart(gl, prog, meshes.box, mTmp, 9, PALETTE.ivoryHorn);
        M4.fromTRS(mTmp, cx, liftY + 0.75, cz + 0.18, 0, sim.radarYaw, 0, 0.16, 0.06, 0.52);
        drawPart(gl, prog, meshes.box, mTmp, 9, PALETTE.ivoryHorn);
      }
      break;
    }

    case 'ultrasonic': {
      // HC-SR04 Twin Ultrasonic Eyes mounted on Turret Cradle — physically sweeps +-65 deg when powered!
      const yaw = isGhost ? 0.0 : sim.radarYaw;
      // Turret pedestal post fixed to PCB
      M4.fromTRS(mTmp, cx, liftY, cz, 0, 0, 0, 0.20, 0.32, 0.20);
      drawPart(gl, prog, meshes.cylinder, mTmp, matOverride(1), PALETTE.darkSlate, isGhost ? ghostP1 : 0);

      // Rotating HC-SR04 Vertical Board
      M4.fromTRS(mJoint, cx, liftY + 0.58, cz, 0, yaw, 0, 1.88, 0.76, 0.10);
      drawPart(gl, prog, meshes.box, mJoint, matOverride(9), PALETTE.servoTeal, isGhost ? ghostP1 : 0);

      // Twin Brushed-Aluminum Ultrasonic Transducer Cylinders ("Eyes") facing +Z + yaw
      for (const sideX of [-0.52, 0.52]) {
        M4.identity(mTmp);
        M4.translate(mTmp, mTmp, cx, liftY + 0.58, cz);
        M4.rotateY(mTmp, mTmp, yaw);
        M4.translate(mTmp, mTmp, sideX, 0, 0.05);
        M4.rotateX(mTmp, mTmp, Math.PI * 0.5);
        M4.scale(mTmp, mTmp, 0.33, 0.36, 0.33);
        drawPart(gl, prog, meshes.cylinder, mTmp, matOverride(1), PALETTE.silverMetal, isGhost ? ghostP1 : 0);

        if (!isGhost) {
          // Dark acoustic mesh center inside each ultrasonic cylinder (pulses cyan on ping!)
          M4.identity(mPart);
          M4.translate(mPart, mPart, cx, liftY + 0.58, cz);
          M4.rotateY(mPart, mPart, yaw);
          M4.translate(mPart, mPart, sideX, 0, 0.40);
          M4.rotateX(mPart, mPart, Math.PI * 0.5);
          M4.scale(mPart, mPart, 0.24, 0.03, 0.24);
          drawPart(gl, prog, meshes.cylinder, mPart, 4, PALETTE.ledCyan, sim.sonarFlash * 1.6);
        }
      }
      break;
    }

    case 'cap_bank':
    case 'cap_bank_large': {
      const r = comp.kind === 'cap_bank_large' ? 0.32 : 0.24;
      const h = comp.kind === 'cap_bank_large' ? 0.82 : 0.58;
      const dx = comp.kind === 'cap_bank_large' ? 0.42 : 0.36;
      for (const ox of [-dx, dx]) {
        M4.fromTRS(mTmp, cx + ox, liftY + 0.05, cz, 0, 0, 0, r, h, r);
        drawPart(gl, prog, meshes.cylinder, mTmp, matOverride(9), PALETTE.capNavy, isGhost ? ghostP1 : 0);
        if (!isGhost) {
          // Aluminum K-vent top cap
          M4.fromTRS(mTmp, cx + ox, liftY + 0.05 + h, cz, 0, 0, 0, r * 0.88, 0.02, r * 0.88);
          drawPart(gl, prog, meshes.cylinder, mTmp, 1, PALETTE.silverMetal);
        }
      }
      break;
    }

    case 'buzzer': {
      M4.fromTRS(mTmp, cx, liftY + 0.02, cz, 0, 0, 0, 0.40, 0.42, 0.40);
      drawPart(gl, prog, meshes.cylinder, mTmp, matOverride(9), PALETTE.charcoalIC, isGhost ? ghostP1 : 0);
      if (!isGhost) {
        M4.fromTRS(mTmp, cx, liftY + 0.44, cz, 0, 0, 0, 0.12, 0.02, 0.12);
        drawPart(gl, prog, meshes.cylinder, mTmp, 2, PALETTE.enigGold);
      }
      break;
    }

    case 'pot_knob': {
      M4.fromTRS(mTmp, cx, liftY + 0.10, cz, 0, 0, 0, 0.84, 0.20, 0.84);
      drawPart(gl, prog, meshes.box, mTmp, matOverride(9), PALETTE.darkSlate, isGhost ? ghostP1 : 0);
      const rot = isGhost ? 0 : sim.potAngle;
      M4.fromTRS(mTmp, cx, liftY + 0.20, cz, 0, rot, 0, 0.34, 0.46, 0.34);
      drawPart(gl, prog, meshes.cylinder, mTmp, matOverride(1), PALETTE.brushedAlum, isGhost ? ghostP1 : 0);
      if (!isGhost) {
        M4.fromTRS(mTmp, cx, liftY + 0.67, cz, 0, rot, 0, 0.08, 0.03, 0.55);
        drawPart(gl, prog, meshes.box, mTmp, 4, PALETTE.ledAmber, 0.9);
      }
      break;
    }

    case 'piezo_gold': {
      // Golden Brass Piezo Acoustic Speaker Disc (vibrates subtly with synth beat!)
      const vib = !isGhost ? sim.vuLevel * 0.025 : 0.0;
      M4.fromTRS(mTmp, cx, liftY + 0.03 + vib, cz, 0, 0, 0, 0.72, 0.08, 0.72);
      drawPart(gl, prog, meshes.cylinder, mTmp, matOverride(2), PALETTE.enigGold, isGhost ? ghostP1 : 0);
      if (!isGhost) {
        M4.fromTRS(mTmp, cx, liftY + 0.115 + vib, cz, 0, 0, 0, 0.48, 0.02, 0.48);
        drawPart(gl, prog, meshes.cylinder, mTmp, 1, PALETTE.ivoryHorn);
      }
      break;
    }

    case 'vu_bar': {
      // 8-Segment LED VU Bar Graph
      M4.fromTRS(mTmp, cx, liftY + 0.13, cz, 0, 0, 0, 0.64, 0.24, 2.52);
      drawPart(gl, prog, meshes.box, mTmp, matOverride(0), PALETTE.charcoalIC, isGhost ? ghostP1 : 0);
      if (!isGhost) {
        for (let i = 0; i < 8; i++) {
          const sz = cz + 1.05 - i * 0.30; // bottom (+Z) to top (-Z)
          let c = PALETTE.ledEmerald;
          if (i >= 6) c = PALETTE.ledRed;
          else if (i >= 4) c = PALETTE.ledAmber;
          const threshold = (i + 0.45) / 8.0;
          const lit = sim.vuActive && sim.vuLevel >= threshold ? 2.0 : 0.05;
          M4.fromTRS(mTmp, cx, liftY + 0.26, sz, 0, 0, 0, 0.44, 0.05, 0.21);
          drawPart(gl, prog, meshes.box, mTmp, 4, c, lit);
        }
      }
      break;
    }

    case 'l298n': {
      // Vertical Multiwatt IC + Tall Multi-Fin Extruded Brushed-Aluminum Heatsink!
      M4.fromTRS(mTmp, cx, liftY + 0.36, cz - 0.18, 0, 0, 0, 1.45, 0.64, 0.22);
      drawPart(gl, prog, meshes.box, mTmp, matOverride(0), PALETTE.charcoalIC, isGhost ? ghostP1 : 0);
      // Heatsink spine
      M4.fromTRS(mTmp, cx, liftY + 0.48, cz + 0.04, 0, 0, 0, 1.62, 0.92, 0.16);
      drawPart(gl, prog, meshes.box, mTmp, matOverride(1), PALETTE.brushedAlum, isGhost ? ghostP1 : 0);
      if (!isGhost) {
        // 7 Cooling Fins
        for (let f = 0; f < 7; f++) {
          const fx = cx - 0.72 + f * 0.24;
          M4.fromTRS(mTmp, fx, liftY + 0.48, cz + 0.28, 0, 0, 0, 0.06, 0.90, 0.38);
          drawPart(gl, prog, meshes.box, mTmp, 1, PALETTE.brushedAlum);
        }
      }
      break;
    }
  }
}

/**
 * Draw the Articulated 3-Joint 3D Mini Desktop Robotic Gripper Arm beside Board 04!
 */
export function drawRoboticArm(gl, prog, meshes, sim) {
  const baseX = 5.35;
  const baseZ = 0.08;
  const yaw = sim.armYaw;          // Joint 1: Turntable Yaw
  const shoulder = sim.armShoulder; // Joint 2: Shoulder Pitch
  const elbow = sim.armElbow;       // Joint 3: Elbow Pitch
  const claw = sim.armClaw;         // Twin Mechanical Claws open/close [0..1]

  // Heavy Brushed-Aluminum Pedestal Base on Workbench
  M4.fromTRS(mTmp, baseX, BENCH_Y, baseZ, 0, 0, 0, 1.18, 0.26, 1.18);
  drawPart(gl, prog, meshes.cylinder, mTmp, 1, PALETTE.darkHeatsink);

  // Glowing Cyan Status Ring around Turntable Bearing
  M4.fromTRS(mTmp, baseX, BENCH_Y + 0.265, baseZ, 0, 0, 0, 0.96, 1.0, 0.96);
  drawPart(gl, prog, meshes.padRing, mTmp, 4, PALETTE.ledCyan, 0.25 + sim.armPower * 1.5);

  // Joint 1: Rotating Turret Waist
  M4.fromTRS(mTmp, baseX, BENCH_Y + 0.27, baseZ, 0, yaw, 0, 0.78, 0.34, 0.78);
  drawPart(gl, prog, meshes.cylinder, mTmp, 9, PALETTE.servoTeal);

  // Shoulder Bracket Clevis
  const pivot1Y = BENCH_Y + 0.74;
  M4.fromTRS(mTmp, baseX, pivot1Y, baseZ, 0, yaw, 0, 0.62, 0.36, 0.56);
  drawPart(gl, prog, meshes.box, mTmp, 1, PALETTE.brushedAlum);

  // Golden Servo Axle Hub at Shoulder
  M4.identity(mTmp);
  M4.translate(mTmp, mTmp, baseX, pivot1Y, baseZ);
  M4.rotateY(mTmp, mTmp, yaw);
  M4.rotateZ(mTmp, mTmp, Math.PI * 0.5);
  M4.translate(mTmp, mTmp, 0, -0.36, 0);
  M4.scale(mTmp, mTmp, 0.16, 0.72, 0.16);
  drawPart(gl, prog, meshes.cylinder, mTmp, 2, PALETTE.enigGold);

  // Compute Shoulder Boom Transform (length L1 = 1.55)
  const L1 = 1.55;
  const sinY = Math.sin(yaw);
  const cosY = Math.cos(yaw);
  // Arm extends toward -X (toward workspace) in local frame, rotated by yaw & shoulder pitch
  const boomDirLocalX = -Math.sin(shoulder);
  const boomDirLocalY = Math.cos(shoulder);

  for (const zOff of [-0.22, 0.22]) {
    M4.identity(mTmp);
    M4.translate(mTmp, mTmp, baseX, pivot1Y, baseZ);
    M4.rotateY(mTmp, mTmp, yaw);
    M4.translate(mTmp, mTmp, 0, 0, zOff);
    M4.rotateZ(mTmp, mTmp, shoulder);
    M4.translate(mTmp, mTmp, 0, L1 * 0.5, 0);
    M4.scale(mTmp, mTmp, 0.18, L1, 0.08);
    drawPart(gl, prog, meshes.box, mTmp, 1, PALETTE.silverMetal);
  }

  // Joint 2 -> Elbow World Position
  const elbowX = baseX + boomDirLocalX * L1 * cosY;
  const elbowY = pivot1Y + boomDirLocalY * L1;
  const elbowZ = baseZ - boomDirLocalX * L1 * sinY;

  // Elbow Actuator Drum
  M4.fromTRS(mTmp, elbowX, elbowY, elbowZ, 0, yaw, 0, 0.42, 0.34, 0.54);
  drawPart(gl, prog, meshes.box, mTmp, 9, PALETTE.amberGrip);

  // Forearm Boom (length L2 = 1.32, total pitch = shoulder + elbow)
  const totalPitch = shoulder + elbow;
  const L2 = 1.32;
  M4.identity(mTmp);
  M4.translate(mTmp, mTmp, elbowX, elbowY, elbowZ);
  M4.rotateY(mTmp, mTmp, yaw);
  M4.rotateZ(mTmp, mTmp, totalPitch);
  M4.translate(mTmp, mTmp, 0, L2 * 0.5, 0);
  M4.scale(mTmp, mTmp, 0.16, L2, 0.24);
  drawPart(gl, prog, meshes.box, mTmp, 1, PALETTE.brushedAlum);

  // Wrist & Twin Articulated Mechanical Claws!
  const foreDirX = -Math.sin(totalPitch);
  const foreDirY = Math.cos(totalPitch);
  const wristX = elbowX + foreDirX * L2 * cosY;
  const wristY = elbowY + foreDirY * L2;
  const wristZ = elbowZ - foreDirX * L2 * sinY;

  M4.identity(mTmp);
  M4.translate(mTmp, mTmp, wristX, wristY, wristZ);
  M4.rotateY(mTmp, mTmp, yaw);
  M4.rotateZ(mTmp, mTmp, totalPitch);
  M4.scale(mTmp, mTmp, 0.24, 0.22, 0.52);
  drawPart(gl, prog, meshes.box, mTmp, 9, PALETTE.charcoalIC);

  // Left & Right Pinching Gripper Claws
  const spread = 0.09 + claw * 0.19;
  const pinchAng = (1.0 - claw) * 0.28;
  for (const side of [-1, 1]) {
    M4.identity(mTmp);
    M4.translate(mTmp, mTmp, wristX, wristY, wristZ);
    M4.rotateY(mTmp, mTmp, yaw);
    M4.rotateZ(mTmp, mTmp, totalPitch);
    M4.translate(mTmp, mTmp, 0, 0.26, side * spread);
    M4.rotateX(mTmp, mTmp, -side * pinchAng);
    M4.scale(mTmp, mTmp, 0.12, 0.46, 0.07);
    drawPart(gl, prog, meshes.box, mTmp, 2, PALETTE.enigGold);
  }

  // Calibration Energy Cube held in claws when pinching or resting on front anvil!
  if (sim.armPower > 0.2 && claw < 0.35) {
    M4.identity(mTmp);
    M4.translate(mTmp, mTmp, wristX, wristY, wristZ);
    M4.rotateY(mTmp, mTmp, yaw);
    M4.rotateZ(mTmp, mTmp, totalPitch);
    M4.translate(mTmp, mTmp, 0, 0.34, 0);
    M4.scale(mTmp, mTmp, 0.22, 0.22, 0.22);
    drawPart(gl, prog, meshes.box, mTmp, 4, PALETTE.ledCyan, 1.65);
  } else {
    M4.fromTRS(mTmp, 4.15, BENCH_Y + 0.14, 1.65, 0, 0.3, 0, 0.24, 0.24, 0.24);
    drawPart(gl, prog, meshes.box, mTmp, 4, PALETTE.ledAmber, 0.65 + sim.armPower * 0.8);
  }
}

/**
 * Draw 3D Soldering Station Stand + 380°C Soldering Iron Wand!
 */
export function drawSolderingIronAndStand(gl, prog, meshes, ironState) {
  // 1. Workbench Soldering Iron Holder Stand at (-5.25, BENCH_Y, -1.55)
  const stX = -5.25;
  const stZ = -1.55;
  M4.fromTRS(mTmp, stX, BENCH_Y + 0.08, stZ, 0, 0.25, 0, 1.15, 0.16, 1.45);
  drawPart(gl, prog, meshes.box, mTmp, 9, PALETTE.charcoalIC);
  // Brass Tip-Cleaning Wool Cup
  M4.fromTRS(mTmp, stX + 0.12, BENCH_Y + 0.16, stZ + 0.32, 0, 0, 0, 0.28, 0.20, 0.28);
  drawPart(gl, prog, meshes.cylinder, mTmp, 2, PALETTE.enigGold);
  // Metal Cradle Ring
  M4.fromTRS(mTmp, stX - 0.12, BENCH_Y + 0.42, stZ - 0.28, 0.5, 0.25, 0, 0.26, 1.0, 0.26);
  drawPart(gl, prog, meshes.padRing, mTmp, 1, PALETTE.silverMetal);

  // 2. 3D 380°C Soldering Iron Wand (tip at ironState.pos, tilted ergonomically!)
  const [tx, ty, tz] = ironState.pos;
  const activeHeat = ironState.heating ? 1.0 : 0.35;

  M4.identity(mJoint);
  M4.translate(mJoint, mJoint, tx, ty, tz);
  M4.rotateY(mJoint, mJoint, ironState.yaw);
  M4.rotateZ(mJoint, mJoint, ironState.tilt); // ~0.68 rad ergonomic angle

  // Sharp Conical 380C Copper-Iron Tip (y from 0 to 0.52 along wand axis)
  M4.copy(mTmp, mJoint);
  M4.scale(mTmp, mTmp, 0.085, 0.52, 0.085);
  drawPart(gl, prog, meshes.coneTip, mTmp, 8, PALETTE.silverMetal, activeHeat);

  // Stainless Steel Ventilated Heating Barrel (y from 0.52 to 1.42)
  M4.copy(mTmp, mJoint);
  M4.translate(mTmp, mTmp, 0, 0.52, 0);
  M4.scale(mTmp, mTmp, 0.095, 0.90, 0.095);
  drawPart(gl, prog, meshes.cylinder, mTmp, 1, PALETTE.silverMetal);

  // Heat-Shield Collar Flange
  M4.copy(mTmp, mJoint);
  M4.translate(mTmp, mTmp, 0, 1.42, 0);
  M4.scale(mTmp, mTmp, 0.21, 0.10, 0.21);
  drawPart(gl, prog, meshes.cylinder, mTmp, 9, PALETTE.charcoalIC);

  // Ergonomic Warm-Amber & Slate Insulated Grip Handle (y from 1.52 to 2.85)
  M4.copy(mTmp, mJoint);
  M4.translate(mTmp, mTmp, 0, 1.52, 0);
  M4.scale(mTmp, mTmp, 0.165, 1.32, 0.165);
  drawPart(gl, prog, meshes.cylinder, mTmp, 9, PALETTE.amberGrip, ironState.heating ? 0.25 : 0.0);

  // Temperature LED Ring on Handle
  M4.copy(mTmp, mJoint);
  M4.translate(mTmp, mTmp, 0, 1.82, 0);
  M4.scale(mTmp, mTmp, 0.172, 0.09, 0.172);
  drawPart(
    gl,
    prog,
    meshes.cylinder,
    mTmp,
    4,
    ironState.heating ? PALETTE.copperOrange : PALETTE.ledEmerald,
    ironState.heating ? 1.8 : 0.9
  );
}
