// Procedural 3D Dynamic Planet Earth (Cube-Sphere VBO + bufferSubData), 6 World Landmarks & Orbital Craft

import {
  R_EARTH,
  LANDMARKS,
  M4,
  V3,
  clamp,
  sampleEarthGeography,
} from './math.js';

// 6 Cube-Sphere Faces: [right, up, forward] with cross(right, up) == +forward (CCW outward)
const CUBE_FACES = [
  { r: [1, 0, 0], u: [0, 1, 0], f: [0, 0, 1] },   // +Z (Europe / Africa)
  { r: [-1, 0, 0], u: [0, 1, 0], f: [0, 0, -1] }, // -Z (Pacific)
  { r: [0, 0, -1], u: [0, 1, 0], f: [1, 0, 0] },  // +X (Asia / Himalayas)
  { r: [0, 0, 1], u: [0, 1, 0], f: [-1, 0, 0] },  // -X (Americas)
  { r: [1, 0, 0], u: [0, 0, -1], f: [0, 1, 0] },  // +Y (Arctic)
  { r: [1, 0, 0], u: [0, 0, 1], f: [0, -1, 0] },  // -Y (Antarctica)
];

export function createDynamicPlanet(gl, grid = 64) {
  const side = grid + 1;
  const vertsPerFace = side * side;
  const totalVerts = vertsPerFace * 6;
  const strideFloats = 9; // pos(3), norm(3), geo(3: elev, heat, bioParam)

  const vboData = new Float32Array(totalVerts * strideFloats);
  const unitDirs = new Float32Array(totalVerts * 3);
  const baseElevs = new Float32Array(totalVerts);
  const baseBio = new Float32Array(totalVerts);
  const curElevs = new Float32Array(totalVerts);
  const curHeat = new Float32Array(totalVerts);
  const curBio = new Float32Array(totalVerts);

  const indices = new Uint32Array(6 * grid * grid * 6);
  let idxPtr = 0;

  for (let f = 0; f < 6; f++) {
    const face = CUBE_FACES[f];
    const baseV = f * vertsPerFace;

    for (let j = 0; j < side; j++) {
      const tv = (j / grid) * 2.0 - 1.0;
      const wy = Math.tan(tv * Math.PI * 0.25);
      for (let i = 0; i < side; i++) {
        const tu = (i / grid) * 2.0 - 1.0;
        const wx = Math.tan(tu * Math.PI * 0.25);

        const rx = face.f[0] + wx * face.r[0] + wy * face.u[0];
        const ry = face.f[1] + wx * face.r[1] + wy * face.u[1];
        const rz = face.f[2] + wx * face.r[2] + wy * face.u[2];
        const inv = 1.0 / Math.hypot(rx, ry, rz);
        const ux = rx * inv;
        const uy = ry * inv;
        const uz = rz * inv;

        const vIdx = baseV + j * side + i;
        unitDirs[vIdx * 3] = ux;
        unitDirs[vIdx * 3 + 1] = uy;
        unitDirs[vIdx * 3 + 2] = uz;

        const geo = sampleEarthGeography(ux, uy, uz);
        baseElevs[vIdx] = geo.elev;
        baseBio[vIdx] = geo.aridity;
        curElevs[vIdx] = geo.elev;
        curHeat[vIdx] = 0.0;
        curBio[vIdx] = geo.aridity;
      }
    }

    for (let j = 0; j < grid; j++) {
      for (let i = 0; i < grid; i++) {
        const v00 = baseV + j * side + i;
        const v10 = v00 + 1;
        const v01 = v00 + side;
        const v11 = v01 + 1;
        indices[idxPtr++] = v00;
        indices[idxPtr++] = v10;
        indices[idxPtr++] = v11;
        indices[idxPtr++] = v00;
        indices[idxPtr++] = v11;
        indices[idxPtr++] = v01;
      }
    }
  }

  function vertexRadius(vIdx) {
    const e = curElevs[vIdx];
    const h = curHeat[vIdx];
    if (e <= 0.025 && h < 0.08) return R_EARTH;
    return R_EARTH + e;
  }

  function rebuildFaceVertices(f) {
    const baseV = f * vertsPerFace;
    // 1. Write 3D deformed positions & geo attributes
    for (let k = 0; k < vertsPerFace; k++) {
      const vIdx = baseV + k;
      const r = vertexRadius(vIdx);
      const o = vIdx * strideFloats;
      vboData[o] = unitDirs[vIdx * 3] * r;
      vboData[o + 1] = unitDirs[vIdx * 3 + 1] * r;
      vboData[o + 2] = unitDirs[vIdx * 3 + 2] * r;
      vboData[o + 6] = curElevs[vIdx];
      vboData[o + 7] = curHeat[vIdx];
      vboData[o + 8] = curBio[vIdx];
    }

    // 2. Compute crisp finite-difference normals across the face grid
    for (let j = 0; j < side; j++) {
      const j0 = Math.max(0, j - 1);
      const j1 = Math.min(grid, j + 1);
      for (let i = 0; i < side; i++) {
        const i0 = Math.max(0, i - 1);
        const i1 = Math.min(grid, i + 1);

        const idxL = (baseV + j * side + i0) * strideFloats;
        const idxR = (baseV + j * side + i1) * strideFloats;
        const idxD = (baseV + j0 * side + i) * strideFloats;
        const idxU = (baseV + j1 * side + i) * strideFloats;

        const dux = vboData[idxR] - vboData[idxL];
        const duy = vboData[idxR + 1] - vboData[idxL + 1];
        const duz = vboData[idxR + 2] - vboData[idxL + 2];

        const dvx = vboData[idxU] - vboData[idxD];
        const dvy = vboData[idxU + 1] - vboData[idxD + 1];
        const dvz = vboData[idxU + 2] - vboData[idxD + 2];

        let nx = duy * dvz - duz * dvy;
        let ny = duz * dvx - dux * dvz;
        let nz = dux * dvy - duy * dvx;
        const len = Math.hypot(nx, ny, nz);
        const vIdx = baseV + j * side + i;
        const o = vIdx * strideFloats;
        if (len > 1e-6) {
          nx /= len;
          ny /= len;
          nz /= len;
        } else {
          nx = unitDirs[vIdx * 3];
          ny = unitDirs[vIdx * 3 + 1];
          nz = unitDirs[vIdx * 3 + 2];
        }
        vboData[o + 3] = nx;
        vboData[o + 4] = ny;
        vboData[o + 5] = nz;
      }
    }
  }

  for (let f = 0; f < 6; f++) {
    rebuildFaceVertices(f);
  }

  const vao = gl.createVertexArray();
  const vbo = gl.createBuffer();
  const ebo = gl.createBuffer();

  gl.bindVertexArray(vao);
  gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
  gl.bufferData(gl.ARRAY_BUFFER, vboData, gl.DYNAMIC_DRAW);

  const byteStride = strideFloats * 4;
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 3, gl.FLOAT, false, byteStride, 0);
  gl.enableVertexAttribArray(1);
  gl.vertexAttribPointer(1, 3, gl.FLOAT, false, byteStride, 12);
  gl.enableVertexAttribArray(2);
  gl.vertexAttribPointer(2, 3, gl.FLOAT, false, byteStride, 24);

  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ebo);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);
  gl.bindVertexArray(null);

  function uploadFace(f) {
    rebuildFaceVertices(f);
    const floatStart = f * vertsPerFace * strideFloats;
    const floatLen = vertsPerFace * strideFloats;
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferSubData(gl.ARRAY_BUFFER, floatStart * 4, vboData.subarray(floatStart, floatStart + floatLen));
  }

  // Deform a glowing magma crater into continents or oceans!
  function applyMeteorCrater(dir, angRadius = 0.085, depth = 2.05) {
    const dx = dir[0], dy = dir[1], dz = dir[2];
    const outerRad = angRadius * 1.45;
    const cosOuter = Math.cos(outerRad);

    for (let f = 0; f < 6; f++) {
      let modified = false;
      const baseV = f * vertsPerFace;
      for (let k = 0; k < vertsPerFace; k++) {
        const vIdx = baseV + k;
        const ux = unitDirs[vIdx * 3];
        const uy = unitDirs[vIdx * 3 + 1];
        const uz = unitDirs[vIdx * 3 + 2];
        const dot = ux * dx + uy * dy + uz * dz;
        if (dot < cosOuter) continue;

        const ang = Math.acos(clamp(dot, -1, 1));
        const rNorm = ang / angRadius;
        if (rNorm < 1.42) {
          modified = true;
          if (rNorm < 0.85) {
            // Deep parabolic crater bowl with glowing molten floor
            const bowl = 1.0 - (rNorm / 0.85) * (rNorm / 0.85);
            const startE = curElevs[vIdx] < 0 ? Math.max(curElevs[vIdx], -0.35) : curElevs[vIdx];
            curElevs[vIdx] = clamp(startE - depth * bowl, -2.75, 4.2);
            curHeat[vIdx] = clamp(Math.max(curHeat[vIdx], bowl * 1.15), 0, 1);
          } else {
            // Raised tectonic ejecta rim around crater lip
            const rimT = (rNorm - 0.85) / 0.57;
            const rim = Math.sin(rimT * Math.PI) * depth * 0.28;
            const startE = curElevs[vIdx] < 0 ? -0.05 : curElevs[vIdx];
            curElevs[vIdx] = clamp(startE + rim, -2.75, 4.2);
            curHeat[vIdx] = clamp(Math.max(curHeat[vIdx], (1.0 - rimT) * 0.38), 0, 1);
          }
        }
      }
      if (modified) uploadFace(f);
    }
  }

  // Raise lush emerald volcanic islands / mountain chains & cool magma craters!
  function applyGenesisTerraform(dir, angRadius = 0.095, raiseAmt = 1.45) {
    const dx = dir[0], dy = dir[1], dz = dir[2];
    const cosOuter = Math.cos(angRadius);

    for (let f = 0; f < 6; f++) {
      let modified = false;
      const baseV = f * vertsPerFace;
      for (let k = 0; k < vertsPerFace; k++) {
        const vIdx = baseV + k;
        const ux = unitDirs[vIdx * 3];
        const uy = unitDirs[vIdx * 3 + 1];
        const uz = unitDirs[vIdx * 3 + 2];
        const dot = ux * dx + uy * dy + uz * dz;
        if (dot < cosOuter) continue;

        const ang = Math.acos(clamp(dot, -1, 1));
        const t = 1.0 - ang / angRadius;
        if (t > 0) {
          modified = true;
          const ridge = 0.72 + 0.28 * Math.sin(ux * 65.0 + uy * 53.0 + uz * 71.0);
          const delta = t * t * raiseAmt * ridge;
          const floorBase = curElevs[vIdx] < -0.25 ? -0.15 : curElevs[vIdx];
          curElevs[vIdx] = clamp(floorBase + delta, -2.5, 4.1);
          curHeat[vIdx] = Math.max(0, curHeat[vIdx] - t * 0.92);
          curBio[vIdx] = clamp(curBio[vIdx] - t * 1.35, -1.0, 1.0);
        }
      }
      if (modified) uploadFace(f);
    }
  }

  function resetSurface() {
    for (let i = 0; i < totalVerts; i++) {
      curElevs[i] = baseElevs[i];
      curHeat[i] = 0;
      curBio[i] = baseBio[i];
    }
    for (let f = 0; f < 6; f++) {
      rebuildFaceVertices(f);
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, vboData);
  }

  // Fast O(1) lookup of nearest cube-sphere vertex radius for live collision & landmark grounding!
  function sampleSurfaceRadius(ux, uy, uz) {
    const ax = Math.abs(ux), ay = Math.abs(uy), az = Math.abs(uz);
    let f = 0;
    let ma = az;
    if (ax >= ay && ax >= az) {
      f = ux >= 0 ? 2 : 3;
      ma = ax;
    } else if (ay >= ax && ay >= az) {
      f = uy >= 0 ? 4 : 5;
      ma = ay;
    } else {
      f = uz >= 0 ? 0 : 1;
      ma = az;
    }
    const face = CUBE_FACES[f];
    const wx = (ux * face.r[0] + uy * face.r[1] + uz * face.r[2]) / Math.max(ma, 1e-5);
    const wy = (ux * face.u[0] + uy * face.u[1] + uz * face.u[2]) / Math.max(ma, 1e-5);
    const tu = (Math.atan(wx) / (Math.PI * 0.25)) * 0.5 + 0.5;
    const tv = (Math.atan(wy) / (Math.PI * 0.25)) * 0.5 + 0.5;
    const i = clamp(Math.round(tu * grid), 0, grid);
    const j = clamp(Math.round(tv * grid), 0, grid);
    return vertexRadius(f * vertsPerFace + j * side + i);
  }

  return {
    vao,
    count: indices.length,
    indexType: gl.UNSIGNED_INT,
    applyMeteorCrater,
    applyGenesisTerraform,
    resetSurface,
    sampleSurfaceRadius,
  };
}

function makePosNormMesh(gl, positions, normals, indices) {
  const countVerts = positions.length / 3;
  const interleaved = new Float32Array(countVerts * 6);
  for (let i = 0; i < countVerts; i++) {
    interleaved[i * 6] = positions[i * 3];
    interleaved[i * 6 + 1] = positions[i * 3 + 1];
    interleaved[i * 6 + 2] = positions[i * 3 + 2];
    interleaved[i * 6 + 3] = normals[i * 3];
    interleaved[i * 6 + 4] = normals[i * 3 + 1];
    interleaved[i * 6 + 5] = normals[i * 3 + 2];
  }
  const vao = gl.createVertexArray();
  const vbo = gl.createBuffer();
  const ebo = gl.createBuffer();
  gl.bindVertexArray(vao);
  gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
  gl.bufferData(gl.ARRAY_BUFFER, interleaved, gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 24, 0);
  gl.enableVertexAttribArray(1);
  gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 24, 12);
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ebo);
  const idxArr = indices.length > 65535 ? new Uint32Array(indices) : new Uint16Array(indices);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, idxArr, gl.STATIC_DRAW);
  gl.bindVertexArray(null);
  return {
    vao,
    count: indices.length,
    indexType: indices.length > 65535 ? gl.UNSIGNED_INT : gl.UNSIGNED_SHORT,
  };
}

export function createEarthPrimitives(gl) {
  // 1. Smooth UV Sphere (for Skybox, Cloud Shell, Atmosphere Shell & Radomes)
  function buildSphere(latBands = 44, lonBands = 64, craggy = 0.0) {
    const pos = [];
    const nrm = [];
    const idx = [];
    for (let y = 0; y <= latBands; y++) {
      const v = y / latBands;
      const phi = v * Math.PI;
      for (let x = 0; x <= lonBands; x++) {
        const u = x / lonBands;
        const theta = u * Math.PI * 2;
        const nx = -Math.cos(theta) * Math.sin(phi);
        const ny = Math.cos(phi);
        const nz = Math.sin(theta) * Math.sin(phi);
        let r = 1.0;
        if (craggy > 0) {
          const bump = Math.sin(nx * 5.2 + ny * 3.7) * Math.cos(nz * 6.1 - nx * 2.4);
          const crater = Math.abs(Math.sin(nx * 11.0 + nz * 9.0));
          r = 1.0 + craggy * (bump * 0.28 - crater * 0.16);
        }
        pos.push(nx * r, ny * r, nz * r);
        nrm.push(nx, ny, nz);
      }
    }
    for (let y = 0; y < latBands; y++) {
      for (let x = 0; x < lonBands; x++) {
        const a = y * (lonBands + 1) + x;
        const b = a + lonBands + 1;
        idx.push(a, b, a + 1, b, b + 1, a + 1);
      }
    }
    return makePosNormMesh(gl, pos, nrm, idx);
  }

  // 2. Unit Box (-0.5..0.5)
  function buildBox() {
    const faces = [
      { n: [0, 0, 1], v: [[-0.5, -0.5, 0.5], [0.5, -0.5, 0.5], [0.5, 0.5, 0.5], [-0.5, 0.5, 0.5]] },
      { n: [0, 0, -1], v: [[0.5, -0.5, -0.5], [-0.5, -0.5, -0.5], [-0.5, 0.5, -0.5], [0.5, 0.5, -0.5]] },
      { n: [1, 0, 0], v: [[0.5, -0.5, 0.5], [0.5, -0.5, -0.5], [0.5, 0.5, -0.5], [0.5, 0.5, 0.5]] },
      { n: [-1, 0, 0], v: [[-0.5, -0.5, -0.5], [-0.5, -0.5, 0.5], [-0.5, 0.5, 0.5], [-0.5, 0.5, -0.5]] },
      { n: [0, 1, 0], v: [[-0.5, 0.5, 0.5], [0.5, 0.5, 0.5], [0.5, 0.5, -0.5], [-0.5, 0.5, -0.5]] },
      { n: [0, -1, 0], v: [[-0.5, -0.5, -0.5], [0.5, -0.5, -0.5], [0.5, -0.5, 0.5], [-0.5, -0.5, 0.5]] },
    ];
    const pos = [];
    const nrm = [];
    const idx = [];
    faces.forEach((f, fi) => {
      const base = fi * 4;
      f.v.forEach((p) => {
        pos.push(p[0], p[1], p[2]);
        nrm.push(f.n[0], f.n[1], f.n[2]);
      });
      idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    });
    return makePosNormMesh(gl, pos, nrm, idx);
  }

  // 3. 4-Sided Faceted Pyramid (base y=0..apex y=1, base width -0.5..0.5)
  function buildPyramid() {
    const apex = [0, 1, 0];
    const corners = [
      [-0.5, 0, 0.5],
      [0.5, 0, 0.5],
      [0.5, 0, -0.5],
      [-0.5, 0, -0.5],
    ];
    const pos = [];
    const nrm = [];
    const idx = [];
    for (let i = 0; i < 4; i++) {
      const c0 = corners[i];
      const c1 = corners[(i + 1) % 4];
      const e1 = [c1[0] - c0[0], c1[1] - c0[1], c1[2] - c0[2]];
      const e2 = [apex[0] - c0[0], apex[1] - c0[1], apex[2] - c0[2]];
      const fn = V3.normalize(
        e1[1] * e2[2] - e1[2] * e2[1],
        e1[2] * e2[0] - e1[0] * e2[2],
        e1[0] * e2[1] - e1[1] * e2[0]
      );
      const b = i * 3;
      pos.push(c0[0], c0[1], c0[2], c1[0], c1[1], c1[2], apex[0], apex[1], apex[2]);
      nrm.push(fn[0], fn[1], fn[2], fn[0], fn[1], fn[2], fn[0], fn[1], fn[2]);
      idx.push(b, b + 1, b + 2);
    }
    return makePosNormMesh(gl, pos, nrm, idx);
  }

  // 4. Tapered Cone / Cylinder (y=-0.5..0.5 or y=0..1)
  function buildCylinder(segs = 18, topRadius = 1.0, botRadius = 1.0, y0 = -0.5, y1 = 0.5) {
    const pos = [];
    const nrm = [];
    const idx = [];
    for (let i = 0; i <= segs; i++) {
      const a = (i / segs) * Math.PI * 2;
      const c = Math.cos(a);
      const s = Math.sin(a);
      pos.push(c * botRadius, y0, s * botRadius);
      nrm.push(c, 0.25, s);
      pos.push(c * topRadius, y1, s * topRadius);
      nrm.push(c, 0.25, s);
    }
    for (let i = 0; i < segs; i++) {
      const b = i * 2;
      idx.push(b, b + 2, b + 1, b + 1, b + 2, b + 3);
    }
    return makePosNormMesh(gl, pos, nrm, idx);
  }

  // 5. Flat Annulus Shockwave / Target Ring in XZ plane
  function buildRing(segs = 40, innerR = 0.76, outerR = 1.0) {
    const pos = [];
    const nrm = [];
    const idx = [];
    for (let i = 0; i <= segs; i++) {
      const a = (i / segs) * Math.PI * 2;
      const c = Math.cos(a);
      const s = Math.sin(a);
      pos.push(c * innerR, 0, s * innerR, c * outerR, 0, s * outerR);
      nrm.push(0, 1, 0, 0, 1, 0);
    }
    for (let i = 0; i < segs; i++) {
      const b = i * 2;
      idx.push(b, b + 2, b + 1, b + 1, b + 2, b + 3);
    }
    return makePosNormMesh(gl, pos, nrm, idx);
  }

  return {
    sphere: buildSphere(48, 72, 0.0),
    asteroid: buildSphere(14, 18, 1.0),
    dome: buildSphere(12, 18, 0.0),
    box: buildBox(),
    pyramid: buildPyramid(),
    cyl: buildCylinder(16, 0.5, 0.5, -0.5, 0.5),
    cone: buildCylinder(22, 0.16, 0.95, 0.0, 1.0),
    ring: buildRing(40, 0.78, 1.0),
  };
}

export function createOrbitalParticles(gl, maxParticles = 640) {
  const quadVerts = new Float32Array([
    -0.5, -0.5, 0, 0, 0,
     0.5, -0.5, 0, 1, 0,
     0.5,  0.5, 0, 1, 1,
    -0.5,  0.5, 0, 0, 1,
  ]);
  const quadIdx = new Uint16Array([0, 1, 2, 0, 2, 3]);
  const data = new Float32Array(maxParticles * 12);

  const vao = gl.createVertexArray();
  const qvbo = gl.createBuffer();
  const qebo = gl.createBuffer();
  const instVBO = gl.createBuffer();

  gl.bindVertexArray(vao);
  gl.bindBuffer(gl.ARRAY_BUFFER, qvbo);
  gl.bufferData(gl.ARRAY_BUFFER, quadVerts, gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 20, 0);
  gl.enableVertexAttribArray(1);
  gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 20, 12);

  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, qebo);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, quadIdx, gl.STATIC_DRAW);

  gl.bindBuffer(gl.ARRAY_BUFFER, instVBO);
  gl.bufferData(gl.ARRAY_BUFFER, data.byteLength, gl.DYNAMIC_DRAW);

  gl.enableVertexAttribArray(4);
  gl.vertexAttribPointer(4, 4, gl.FLOAT, false, 48, 0);
  gl.vertexAttribDivisor(4, 1);

  gl.enableVertexAttribArray(5);
  gl.vertexAttribPointer(5, 4, gl.FLOAT, false, 48, 16);
  gl.vertexAttribDivisor(5, 1);

  gl.enableVertexAttribArray(6);
  gl.vertexAttribPointer(6, 4, gl.FLOAT, false, 48, 32);
  gl.vertexAttribDivisor(6, 1);

  gl.bindVertexArray(null);
  return { vao, instVBO, data, maxParticles };
}

const mBase = M4.create();
const mLocal = M4.create();
const mOut = M4.create();

function placeOnLandmark(baseMat, lx, ly, lz, rx, ry, rz, sx, sy, sz) {
  M4.trs(mLocal, lx, ly, lz, rx, ry, rz, sx, sy, sz);
  return M4.mul(mOut, baseMat, mLocal);
}

// Render all 6 Iconic 3D World Landmarks oriented along exact globe surface normals!
export function drawWorldLandmarks(drawProp, meshes, planet, damagedFlags, t) {
  for (let i = 0; i < LANDMARKS.length; i++) {
    const lm = LANDMARKS[i];
    const [ux, uy, uz] = lm.dir;
    const surfR = planet.sampleSurfaceRadius(ux, uy, uz) - 0.08;
    M4.basisFromNormal(mBase, ux * surfR, uy * surfR, uz * surfR, ux, uy, uz, 0.35, 1, 1, 1);

    const pulse = 0.75 + 0.25 * Math.sin(t * 4.2 + i * 1.1);
    const isDamaged = Boolean(damagedFlags[i]);

    if (lm.key === 'everest') {
      // 1. Mt. Everest: Himalayan Crystal Snow Massif + Summit Beacon
      drawProp(meshes.pyramid, placeOnLandmark(mBase, 0, 0, 0, 0, 0.2, 0, 2.7, 2.5, 2.4), [0.92, 0.97, 1.0], 0.35, false);
      drawProp(meshes.pyramid, placeOnLandmark(mBase, 1.1, -0.1, 0.5, 0, 0.9, 0, 1.8, 1.7, 1.8), [0.84, 0.91, 0.98], 0.3, false);
      drawProp(meshes.pyramid, placeOnLandmark(mBase, -1.0, -0.1, -0.4, 0, -0.5, 0, 1.6, 1.5, 1.6), [0.80, 0.88, 0.96], 0.3, false);
      drawProp(meshes.dome, placeOnLandmark(mBase, 0, 2.65, 0, 0, 0, 0, 0.16, 0.16, 0.16), [0.22, 0.75, 0.98], 2.2 * pulse, true);
    } else if (lm.key === 'pyramids') {
      // 2. Giza Pyramids: Khufu, Khafre & Menkaure with Solar Gold Capstones
      drawProp(meshes.pyramid, placeOnLandmark(mBase, -0.85, 0, -0.65, 0, 0, 0, 1.75, 1.55, 1.75), [0.88, 0.70, 0.38], 0.22, false);
      drawProp(meshes.pyramid, placeOnLandmark(mBase, 0.72, 0, 0.52, 0, 0, 0, 1.48, 1.32, 1.48), [0.85, 0.67, 0.36], 0.22, false);
      drawProp(meshes.pyramid, placeOnLandmark(mBase, 1.75, 0, 1.35, 0, 0, 0, 0.95, 0.86, 0.95), [0.82, 0.64, 0.34], 0.22, false);
      // Gleaming Solar Gold Capstone on Great Pyramid
      drawProp(meshes.pyramid, placeOnLandmark(mBase, -0.85, 1.24, -0.65, 0, 0, 0, 0.38, 0.34, 0.38), [1.0, 0.82, 0.25], 1.8 * pulse, true);
    } else if (lm.key === 'manhattan') {
      // 3. Manhattan Skyline: One WTC Spire & Skyscraper Cluster
      const towers = [
        [0, 1.35, 0, 0.48, 2.7, 0.48, [0.58, 0.78, 0.94]],
        [0.62, 0.95, 0.22, 0.44, 1.9, 0.44, [0.46, 0.64, 0.82]],
        [-0.58, 1.05, -0.18, 0.42, 2.1, 0.42, [0.52, 0.70, 0.88]],
        [0.24, 0.75, -0.62, 0.46, 1.5, 0.46, [0.42, 0.56, 0.72]],
        [-0.32, 0.68, 0.58, 0.42, 1.36, 0.42, [0.48, 0.62, 0.78]],
      ];
      for (const [tx, ty, tz, sx, sy, sz, col] of towers) {
        drawProp(meshes.box, placeOnLandmark(mBase, tx, ty, tz, 0, 0.2, 0, sx, sy, sz), col, 0.65, false);
      }
      // One WTC Spire + Golden Crown Light
      drawProp(meshes.cyl, placeOnLandmark(mBase, 0, 3.05, 0, 0, 0, 0, 0.08, 0.85, 0.08), [0.35, 0.85, 1.0], 2.0 * pulse, true);
      drawProp(meshes.box, placeOnLandmark(mBase, -0.58, 2.18, -0.18, 0, 0.2, 0, 0.28, 0.16, 0.28), [1.0, 0.78, 0.28], 1.9, true);
    } else if (lm.key === 'fuji') {
      // 4. Mt. Fuji: Symmetric Volcanic Cone + Snow Cap + Torii Beacon
      drawProp(meshes.cone, placeOnLandmark(mBase, 0, 0, 0, 0, 0, 0, 1.95, 1.45, 1.95), [0.28, 0.34, 0.44], 0.2, false);
      drawProp(meshes.cone, placeOnLandmark(mBase, 0, 0.92, 0, 0, 0.3, 0, 0.88, 0.82, 0.88), [0.95, 0.98, 1.0], 0.35, false);
      // Torii Gate in foreground
      drawProp(meshes.box, placeOnLandmark(mBase, 0, 0.45, 1.85, 0, 0, 0, 0.78, 0.10, 0.10), [0.96, 0.38, 0.12], 1.35, true);
      drawProp(meshes.box, placeOnLandmark(mBase, -0.26, 0.22, 1.85, 0, 0, 0, 0.08, 0.46, 0.08), [0.92, 0.32, 0.10], 0.3, false);
      drawProp(meshes.box, placeOnLandmark(mBase, 0.26, 0.22, 1.85, 0, 0, 0, 0.08, 0.46, 0.08), [0.92, 0.32, 0.10], 0.3, false);
    } else if (lm.key === 'eiffel') {
      // 5. Paris Eiffel Spire: 3-Tiered Bronze-Iron Tapered Lattice + Golden Lighthouse
      drawProp(meshes.pyramid, placeOnLandmark(mBase, 0, 0, 0, 0, 0, 0, 1.35, 1.25, 1.35), [0.68, 0.52, 0.34], 0.48, false);
      drawProp(meshes.box, placeOnLandmark(mBase, 0, 0.82, 0, 0, 0, 0, 0.82, 0.12, 0.82), [0.76, 0.60, 0.38], 0.5, false);
      drawProp(meshes.pyramid, placeOnLandmark(mBase, 0, 0.85, 0, 0, 0, 0, 0.72, 1.85, 0.72), [0.74, 0.58, 0.38], 0.52, false);
      drawProp(meshes.dome, placeOnLandmark(mBase, 0, 2.75, 0, 0, 0, 0, 0.16, 0.16, 0.16), [1.0, 0.82, 0.32], 2.4 * pulse, true);
    } else if (lm.key === 'arctic') {
      // 6. Arctic Aurora Research Station: Geodesic Radomes & Solar Arrays
      drawProp(meshes.dome, placeOnLandmark(mBase, -0.45, 0.2, 0, 0, 0, 0, 0.68, 0.68, 0.68), [0.90, 0.96, 1.0], 0.45, false);
      drawProp(meshes.dome, placeOnLandmark(mBase, 0.55, 0.15, 0.35, 0, 0, 0, 0.48, 0.48, 0.48), [0.85, 0.94, 1.0], 0.45, false);
      drawProp(meshes.box, placeOnLandmark(mBase, 0.05, 0.18, -0.55, 0, 0.2, 0, 1.15, 0.32, 0.44), [0.22, 0.68, 0.92], 0.6, false);
      // Rotating Telemetry Dish & Emerald Beacon
      drawProp(meshes.cyl, placeOnLandmark(mBase, -0.45, 1.02, 0, 0, t * 1.5, 0, 0.08, 0.55, 0.08), [0.7, 0.85, 0.95], 0.5, false);
      drawProp(meshes.dome, placeOnLandmark(mBase, -0.45, 1.32, 0, 0, 0, 0, 0.16, 0.16, 0.16), [0.20, 0.92, 0.60], 2.2 * pulse, true);
    }

    // Distress Magma Ring if Landmark suffered Asteroid Impact in Defense Mode!
    if (isDamaged) {
      const rScale = 2.6 + 0.35 * Math.sin(t * 6.0);
      drawProp(
        meshes.ring,
        placeOnLandmark(mBase, 0, 0.25, 0, 0, t * 1.4, 0, rScale, 1.0, rScale),
        [1.0, 0.38, 0.08],
        2.3,
        true,
        0.85
      );
    }
  }
}

const mCraftBase = M4.create();
const mPart = M4.create();
const mPartWorld = M4.create();

// Draw Sleek Orbital Reconnaissance & Terraform Craft!
export function drawOrbitalCraft(drawProp, meshes, craftPos, right, up, back, boostAmt, t) {
  M4.basisFromAxes(mCraftBase, craftPos[0], craftPos[1], craftPos[2], right, up, back, 1, 1, 1);

  const part = (lx, ly, lz, rx, ry, rz, sx, sy, sz) => {
    M4.trs(mPart, lx, ly, lz, rx, ry, rz, sx, sy, sz);
    return M4.mul(mPartWorld, mCraftBase, mPart);
  };

  // Sculpted Titanium-White Orbital Fuselage (-Z is forward nose, +Z is tail)
  drawProp(meshes.cone, part(0, 0, 0.55, -Math.PI * 0.5, 0, 0, 0.34, 1.85, 0.22), [0.90, 0.95, 1.0], 0.65, false);
  // Dark Thermal-Tile Belly & Rear Engine Shroud
  drawProp(meshes.box, part(0, -0.06, 0.22, 0, 0, 0, 0.52, 0.14, 1.05), [0.12, 0.18, 0.26], 0.45, false);
  // Sapphire Telemetry Canopy
  drawProp(meshes.dome, part(0, 0.11, -0.22, 0, 0, 0, 0.19, 0.13, 0.46), [0.22, 0.78, 0.98], 1.45, true);

  // Swept Delta Wings
  drawProp(meshes.box, part(-0.62, -0.01, 0.25, 0, 0.42, 0.05, 1.15, 0.05, 0.52), [0.82, 0.90, 0.98], 0.6, false);
  drawProp(meshes.box, part(0.62, -0.01, 0.25, 0, -0.42, -0.05, 1.15, 0.05, 0.52), [0.82, 0.90, 0.98], 0.6, false);

  // Twin Canting Vertical Stabilizer Fins
  drawProp(meshes.box, part(-0.36, 0.18, 0.52, 0.18, 0, -0.32, 0.05, 0.38, 0.42), [0.24, 0.66, 0.94], 0.6, false);
  drawProp(meshes.box, part(0.36, 0.18, 0.52, 0.18, 0, 0.32, 0.05, 0.38, 0.42), [0.24, 0.66, 0.94], 0.6, false);

  // Wingtip Orbital Strobe Beacons
  const strobe = 0.7 + 0.3 * Math.sin(t * 9.0);
  drawProp(meshes.dome, part(-1.14, 0.0, 0.48, 0, 0, 0, 0.06, 0.06, 0.12), [0.22, 0.85, 0.62], 2.0 * strobe, true);
  drawProp(meshes.dome, part(1.14, 0.0, 0.48, 0, 0, 0, 0.06, 0.06, 0.12), [0.22, 0.75, 0.98], 2.0 * strobe, true);

  // Twin Ion-Plasma Thruster Plumes
  const plumeLen = 0.55 + boostAmt * 1.45 + Math.sin(t * 42.0) * 0.08;
  const plumeCol = boostAmt > 0.35 ? [0.65, 0.95, 1.0] : [0.20, 0.74, 0.98];
  drawProp(meshes.cone, part(-0.18, 0.0, 0.72, Math.PI * 0.5, 0, 0, 0.14, plumeLen, 0.14), plumeCol, 2.4, true, 0.88);
  drawProp(meshes.cone, part(0.18, 0.0, 0.72, Math.PI * 0.5, 0, 0, 0.14, plumeLen, 0.14), plumeCol, 2.4, true, 0.88);

  // Supersonic Mach Vapor Shock-Cone Ring when Boosting!
  if (boostAmt > 0.25) {
    drawProp(
      meshes.ring,
      part(0, 0, 0.15, Math.PI * 0.5, 0, t * 4.0, 1.35 * boostAmt, 1.0, 1.35 * boostAmt),
      [0.38, 0.86, 1.0],
      1.9,
      true,
      0.52 * boostAmt
    );
  }
}
