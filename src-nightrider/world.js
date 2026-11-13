// Procedural Provençal 3D Meshes, Landmarks, Instanced Wheat/Swirls & Articulated Horse + Vincent

import {
  M4,
  WATER_Y,
  BRIDGE_XS,
  riverZ,
  wheatFieldMask,
  pathMask,
  rawGroundH,
  surfaceInfo,
  terrainNormal,
  mulberry32,
  clamp,
  lerp,
} from './math.js';

function uploadMesh(gl, pos, norm, uv, tint, idx) {
  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);

  const mkBuf = (loc, arr, size) => {
    const b = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, b);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(arr), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, size, gl.FLOAT, false, 0, 0);
  };

  mkBuf(0, pos, 3);
  mkBuf(1, norm, 3);
  mkBuf(2, uv, 2);
  mkBuf(3, tint, 3);

  const ib = gl.createBuffer();
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib);
  const use32 = pos.length / 3 > 65000;
  gl.bufferData(
    gl.ELEMENT_ARRAY_BUFFER,
    use32 ? new Uint32Array(idx) : new Uint16Array(idx),
    gl.STATIC_DRAW
  );
  gl.bindVertexArray(null);

  return {
    vao,
    count: idx.length,
    indexType: use32 ? gl.UNSIGNED_INT : gl.UNSIGNED_SHORT,
  };
}

export function createPrimitives(gl) {
  // 1. Unit Box
  const bPos = [], bNorm = [], bUV = [], bTint = [], bIdx = [];
  const faces = [
    [[0, 0, 1], [-0.5, -0.5, 0.5], [0.5, -0.5, 0.5], [0.5, 0.5, 0.5], [-0.5, 0.5, 0.5]],
    [[0, 0, -1], [0.5, -0.5, -0.5], [-0.5, -0.5, -0.5], [-0.5, 0.5, -0.5], [0.5, 0.5, -0.5]],
    [[0, 1, 0], [-0.5, 0.5, 0.5], [0.5, 0.5, 0.5], [0.5, 0.5, -0.5], [-0.5, 0.5, -0.5]],
    [[0, -1, 0], [-0.5, -0.5, -0.5], [0.5, -0.5, -0.5], [0.5, -0.5, 0.5], [-0.5, -0.5, 0.5]],
    [[1, 0, 0], [0.5, -0.5, 0.5], [0.5, -0.5, -0.5], [0.5, 0.5, -0.5], [0.5, 0.5, 0.5]],
    [[-1, 0, 0], [-0.5, -0.5, -0.5], [-0.5, -0.5, 0.5], [-0.5, 0.5, 0.5], [-0.5, 0.5, -0.5]],
  ];
  faces.forEach(([n, p0, p1, p2, p3], fi) => {
    const base = fi * 4;
    [p0, p1, p2, p3].forEach((p, vi) => {
      bPos.push(p[0], p[1], p[2]);
      bNorm.push(n[0], n[1], n[2]);
      bUV.push(vi === 1 || vi === 2 ? 1 : 0, vi >= 2 ? 1 : 0);
      bTint.push(1, 1, 1);
    });
    bIdx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  });
  const box = uploadMesh(gl, bPos, bNorm, bUV, bTint, bIdx);

  // 2. Tapered Cone / Cylinder Helper
  const makeTaperCyl = (rTop, rBot, segs = 14) => {
    const pos = [], norm = [], uv = [], tint = [], idx = [];
    const slopeY = rBot - rTop;
    for (let i = 0; i <= segs; i++) {
      const u = i / segs;
      const a = u * Math.PI * 2;
      const ca = Math.cos(a), sa = Math.sin(a);
      const nl = Math.hypot(1, slopeY);
      const nx = ca / nl, ny = slopeY / nl, nz = sa / nl;
      pos.push(ca * rBot, -0.5, sa * rBot, ca * rTop, 0.5, sa * rTop);
      norm.push(nx, ny, nz, nx, ny, nz);
      uv.push(u * 2, 0, u * 2, 1);
      tint.push(1, 1, 1, 1, 1, 1);
    }
    for (let i = 0; i < segs; i++) {
      const k = i * 2;
      idx.push(k, k + 2, k + 3, k, k + 3, k + 1);
    }
    // Top & bottom caps
    if (rTop > 0.01) {
      const cTop = pos.length / 3;
      pos.push(0, 0.5, 0); norm.push(0, 1, 0); uv.push(0.5, 0.5); tint.push(1, 1, 1);
      for (let i = 0; i <= segs; i++) {
        const a = (i / segs) * Math.PI * 2;
        pos.push(Math.cos(a) * rTop, 0.5, Math.sin(a) * rTop);
        norm.push(0, 1, 0); uv.push(0.5, 0.5); tint.push(1, 1, 1);
      }
      for (let i = 0; i < segs; i++) idx.push(cTop, cTop + i + 2, cTop + i + 1);
    }
    return uploadMesh(gl, pos, norm, uv, tint, idx);
  };

  const cyl = makeTaperCyl(0.5, 0.5, 14);
  const cone = makeTaperCyl(0.03, 0.55, 14);
  const roofPyr = makeTaperCyl(0.02, 0.72, 4);

  // 3. Sphere (for Sky Dome, Star-Seeds, Muzzle/Joints)
  const sPos = [], sNorm = [], sUV = [], sTint = [], sIdx = [];
  const latN = 16, lonN = 22;
  for (let y = 0; y <= latN; y++) {
    const v = y / latN;
    const phi = v * Math.PI;
    for (let x = 0; x <= lonN; x++) {
      const u = x / lonN;
      const th = u * Math.PI * 2;
      const sx = -Math.cos(th) * Math.sin(phi);
      const sy = Math.cos(phi);
      const sz = Math.sin(th) * Math.sin(phi);
      sPos.push(sx * 0.5, sy * 0.5, sz * 0.5);
      sNorm.push(sx, sy, sz);
      sUV.push(u * 2, v * 2);
      sTint.push(1, 1, 1);
    }
  }
  for (let y = 0; y < latN; y++) {
    for (let x = 0; x < lonN; x++) {
      const a = y * (lonN + 1) + x;
      const b = a + lonN + 1;
      sIdx.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  const sphere = uploadMesh(gl, sPos, sNorm, sUV, sTint, sIdx);

  // 4. Sculpted Torus Ring (Sky-Hoops & Constellation Halos)
  const tPos = [], tNorm = [], tUV = [], tTint = [], tIdx = [];
  const majN = 26, minN = 10, R = 0.5, r = 0.055;
  for (let i = 0; i <= majN; i++) {
    const u = (i / majN) * Math.PI * 2;
    const cu = Math.cos(u), su = Math.sin(u);
    for (let j = 0; j <= minN; j++) {
      const v = (j / minN) * Math.PI * 2;
      const cv = Math.cos(v), sv = Math.sin(v);
      const px = (R + r * cv) * cu;
      const py = (R + r * cv) * su;
      const pz = r * sv;
      tPos.push(px, py, pz);
      tNorm.push(cv * cu, cv * su, sv);
      tUV.push(i / majN, j / minN);
      tTint.push(1, 1, 1);
    }
  }
  for (let i = 0; i < majN; i++) {
    for (let j = 0; j < minN; j++) {
      const a = i * (minN + 1) + j;
      const b = a + minN + 1;
      tIdx.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  const torus = uploadMesh(gl, tPos, tNorm, tUV, tTint, tIdx);

  // 5. Saint-Rémy Valley Terrain Grid (118 x 118)
  const gN = 118, span = 248;
  const gPos = [], gNorm = [], gUV = [], gTint = [], gIdx = [];
  for (let iz = 0; iz <= gN; iz++) {
    const z = (iz / gN - 0.5) * span;
    for (let ix = 0; ix <= gN; ix++) {
      const x = (ix / gN - 0.5) * span;
      const y = rawGroundH(x, z);
      const nrm = terrainNormal(x, z);
      gPos.push(x, y, z);
      gNorm.push(nrm[0], nrm[1], nrm[2]);
      gUV.push(ix * 0.5, iz * 0.5);

      // Biome vertex color blending
      const wm = wheatFieldMask(x, z);
      const pm = pathMask(x, z);
      const rad = Math.hypot(x, z + 6);
      const mtn = clamp((rad - 86) / 28, 0, 1);
      const riverBed = clamp((WATER_Y + 0.15 - y) * 1.4, 0, 1);

      // Night meadow (rich deep Prussian-viridian)
      let cr = 0.075, cg = 0.185, cb = 0.285;
      // Blend golden wheat soil
      cr = lerp(cr, 0.52, wm);
      cg = lerp(cg, 0.38, wm);
      cb = lerp(cb, 0.11, wm);
      // Blend warm ochre path
      cr = lerp(cr, 0.46, pm * 0.85);
      cg = lerp(cg, 0.34, pm * 0.85);
      cb = lerp(cb, 0.17, pm * 0.85);
      // Blend Les Alpilles indigo-limestone crags
      cr = lerp(cr, 0.13, mtn);
      cg = lerp(cg, 0.22, mtn);
      cb = lerp(cb, 0.42, mtn);
      // Blend dark Prussian riverbed
      cr = lerp(cr, 0.05, riverBed);
      cg = lerp(cg, 0.12, riverBed);
      cb = lerp(cb, 0.25, riverBed);

      gTint.push(cr, cg, cb);
    }
  }
  for (let iz = 0; iz < gN; iz++) {
    for (let ix = 0; ix < gN; ix++) {
      const a = iz * (gN + 1) + ix;
      const b = a + gN + 1;
      gIdx.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  const terrain = uploadMesh(gl, gPos, gNorm, gUV, gTint, gIdx);

  // 6. Starlight River Ribbon Mesh
  const rPos = [], rNorm = [], rUV = [], rTint = [], rIdx = [];
  const rSegs = 96;
  for (let i = 0; i <= rSegs; i++) {
    const x = (i / rSegs - 0.5) * 244;
    const rz = riverZ(x);
    rPos.push(x, WATER_Y, rz - 10.5, x, WATER_Y, rz + 10.5);
    rNorm.push(0, 1, 0, 0, 1, 0);
    rUV.push(i * 0.4, 0, i * 0.4, 1);
    rTint.push(1, 1, 1, 1, 1, 1);
  }
  for (let i = 0; i < rSegs; i++) {
    const k = i * 2;
    rIdx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2);
  }
  const river = uploadMesh(gl, rPos, rNorm, rUV, rTint, rIdx);

  return { box, cyl, cone, roofPyr, sphere, torus, terrain, river };
}

export function buildProvençalWorld(meshes) {
  const rng = mulberry32(188906); // June 1889 — Saint-Rémy!
  const draws = [];
  const obstacles = []; // { x, z, r }
  const windmills = []; // { x, y, z, yaw }

  const pushStatic = (mesh, tx, ty, tz, rx, ry, rz, sx, sy, sz, mat, color, p0 = 0.4, p1 = 2.0, p2 = 1.0) => {
    const m = M4.create();
    M4.trs(m, tx, ty, tz, rx, ry, rz, sx, sy, sz);
    draws.push({ mesh, m, mat, color, params: [p0, p1, p2] });
  };

  // 1. Two Arched Provençal Stone Bridges across the Starlight River
  BRIDGE_XS.forEach((bx) => {
    const rz = riverZ(bx);
    const segs = 9;
    for (let i = 0; i < segs; i++) {
      const f = (i + 0.5) / segs - 0.5;
      const dz = f * 19.2;
      const arch = Math.cos((dz / 9.6) * (Math.PI * 0.5));
      const nextDz = dz + 1.0;
      const nextArch = Math.cos(clamp(nextDz / 9.6, -1, 1) * (Math.PI * 0.5));
      const pitch = -Math.atan2((nextArch - arch) * 1.45, 1.0);
      const deckY = 0.42 + arch * 1.45;
      // Stone deck slab
      pushStatic(meshes.box, bx, deckY, rz + dz, pitch, 0, 0, 7.6, 0.52, 2.35, 4, [0.54, 0.46, 0.34], 0.55, 2.4);
      // Low stone parapets on left & right
      pushStatic(meshes.box, bx - 3.65, deckY + 0.52, rz + dz, pitch, 0, 0, 0.42, 0.65, 2.35, 4, [0.46, 0.40, 0.31], 0.6, 2.0);
      pushStatic(meshes.box, bx + 3.65, deckY + 0.52, rz + dz, pitch, 0, 0, 0.42, 0.65, 2.35, 4, [0.46, 0.40, 0.31], 0.6, 2.0);
    }
    // Bridge Warm Lantern Posts at center
    [-3.65, 3.65].forEach((ox) => {
      pushStatic(meshes.cyl, bx + ox, 2.55, rz, 0, 0, 0, 0.18, 1.4, 0.18, 4, [0.22, 0.24, 0.28]);
      pushStatic(meshes.sphere, bx + ox, 3.35, rz, 0, 0, 0, 0.46, 0.46, 0.46, 6, [1.0, 0.82, 0.32], 1.8, 1, 1);
    });
  });

  // 2. Iconic Saint-Martin Tall Spire Church at (-24, -36)
  {
    const cx = -24, cz = -36;
    const gy = rawGroundH(cx, cz);
    // Stone Nave
    pushStatic(meshes.box, cx, gy + 2.8, cz + 2.5, 0, 0.18, 0, 6.2, 5.6, 9.6, 4, [0.56, 0.49, 0.36], 0.5, 3.0);
    pushStatic(meshes.roofPyr, cx, gy + 7.0, cz + 2.5, 0, 0.18 + Math.PI * 0.25, 0, 6.8, 2.9, 10.2, 4, [0.16, 0.30, 0.52], 0.45, 2.6);
    // Tall Belltower & Iconic Pointed Steeple piercing the night sky!
    pushStatic(meshes.box, cx, gy + 5.8, cz - 2.6, 0, 0.18, 0, 3.8, 11.6, 3.8, 4, [0.60, 0.52, 0.38], 0.5, 3.2);
    pushStatic(meshes.cone, cx, gy + 16.2, cz - 2.6, 0, 0, 0, 3.6, 9.4, 3.6, 4, [0.14, 0.28, 0.54], 0.4, 3.0);
    // Glowing golden clock/rose window
    pushStatic(meshes.sphere, cx + 0.35, gy + 8.8, cz - 0.65, 0, 0, 0, 1.15, 1.15, 0.4, 6, [1.0, 0.82, 0.28], 1.9, 1, 1);
    obstacles.push({ x: cx, z: cz + 0.5, r: 5.4 });
  }

  // 3. Sleeping Saint-Rémy Cottages with Warm Candlelit Windows
  const cottageSpots = [
    [-33, -30, 0.2], [-14, -31, -0.3], [-15, -23, 0.5], [-28, -22, -0.15],
    [-38, -40, 0.4], [-11, -40, -0.4], [-22, -47, 0.1], [12, -36, -0.25],
    [19, -43, 0.35], [-42, -23, 0.6], [38, 18, -0.5], [42, 44, 0.3],
  ];
  const wallTones = [
    [0.58, 0.49, 0.33],
    [0.50, 0.46, 0.38],
    [0.62, 0.48, 0.29],
    [0.44, 0.47, 0.46],
  ];
  const roofTones = [
    [0.56, 0.27, 0.18], // Provençal terracotta
    [0.16, 0.31, 0.52], // Cobalt slate
    [0.24, 0.38, 0.44], // Viridian slate
  ];
  cottageSpots.forEach(([hx, hz, yaw], i) => {
    const hy = rawGroundH(hx, hz);
    const w = 4.2 + (i % 3) * 0.7;
    const d = 3.8 + ((i + 1) % 2) * 0.9;
    const h = 3.2 + (i % 2) * 0.9;
    pushStatic(meshes.box, hx, hy + h * 0.5 - 0.2, hz, 0, yaw, 0, w, h, d, 4, wallTones[i % wallTones.length], 0.55, 2.2);
    pushStatic(
      meshes.roofPyr,
      hx,
      hy + h + 0.95,
      hz,
      0,
      yaw + Math.PI * 0.25,
      0,
      w * 1.18,
      2.3,
      d * 1.18,
      4,
      roofTones[i % roofTones.length],
      0.5,
      2.2
    );
    // Glowing warm cadmium cottage window!
    const wx = hx + Math.sin(yaw) * (d * 0.51);
    const wz = hz + Math.cos(yaw) * (d * 0.51);
    pushStatic(meshes.box, wx, hy + h * 0.48, wz, 0, yaw, 0, 0.95, 0.88, 0.12, 6, [1.0, 0.78, 0.24], 1.85, 1, 1);
    obstacles.push({ x: hx, z: hz, r: Math.max(w, d) * 0.56 });
  });

  // 4. Three Turning Provençal Windmills on the Ridges
  const millCoords = [
    [52, 37, -0.65],
    [22, -48, 0.42],
    [-55, -14, 0.85],
  ];
  millCoords.forEach(([mx, mz, myaw]) => {
    const my = rawGroundH(mx, mz);
    pushStatic(meshes.cyl, mx, my + 4.2, mz, 0, myaw, 0, 4.2, 8.8, 4.2, 4, [0.58, 0.50, 0.36], 0.5, 2.8);
    pushStatic(meshes.cone, mx, my + 9.6, mz, 0, myaw, 0, 4.6, 2.8, 4.6, 4, [0.16, 0.32, 0.54], 0.45, 2.4);
    pushStatic(meshes.box, mx + Math.sin(myaw) * 2.12, my + 5.2, mz + Math.cos(myaw) * 2.12, 0, myaw, 0, 0.85, 1.1, 0.12, 6, [1.0, 0.80, 0.28], 1.8, 1, 1);
    windmills.push({ x: mx, y: my + 7.6, z: mz, yaw: myaw });
    obstacles.push({ x: mx, z: mz, r: 2.4 });
  });

  // 5. 28 Twisted Flame Cypress Trees (Van Gogh's Cupressus!)
  const cypressCoords = [
    [-42, 16, 1.35], [-53, 28, 1.55], [-46, 33, 1.15], [-30, 12, 1.25],
    [-18, 22, 1.05], [14, 18, 1.20], [26, 28, 1.30], [42, 26, 1.10],
    [56, 29, 1.40], [44, -14, 1.25], [22, -12, 1.05], [-8, -52, 1.30],
    [10, -54, 1.22], [-14, -66, 1.45], [14, -66, 1.42], [-58, 4, 1.32],
    [60, -4, 1.28], [-64, -32, 1.38], [58, -36, 1.24], [-6, 38, 1.18],
    [18, 48, 1.35], [-28, 46, 1.28], [0, 56, 1.40], [-48, -48, 1.30],
    [36, -56, 1.25], [-68, 20, 1.42], [68, 18, 1.36], [-8, -22, 1.12],
  ];
  cypressCoords.forEach(([tx, tz, sc], idx) => {
    const ty = rawGroundH(tx, tz);
    if (ty < WATER_Y + 0.3) return;
    // Trunk
    pushStatic(meshes.cyl, tx, ty + 1.0 * sc, tz, 0, 0, 0, 0.65 * sc, 2.2 * sc, 0.65 * sc, 4, [0.16, 0.12, 0.09], 0.7, 1.5);
    // 4 stacked flame-like twisting dark-viridian cones!
    for (let t = 0; t < 4; t++) {
      const leanX = Math.sin(idx * 1.9 + t * 1.1) * 0.08;
      const leanZ = Math.cos(idx * 1.3 + t * 0.9) * 0.08;
      const w = (2.8 - t * 0.52) * sc;
      const h = (4.6 - t * 0.45) * sc;
      const cy = ty + (2.8 + t * 2.45) * sc;
      pushStatic(meshes.cone, tx + leanX * t * 2.2, cy, tz + leanZ * t * 2.2, leanX, t * 0.8, leanZ, w, h, w, 3, [1, 1, 1], 0.45, 2.4);
    }
    // Secondary flame tongue alongside tall cypresses
    const ox = (idx % 2 === 0 ? 1 : -1) * 0.75 * sc;
    pushStatic(meshes.cone, tx + ox, ty + 3.8 * sc, tz + 0.3, 0.05, idx, -0.06, 1.4 * sc, 5.4 * sc, 1.4 * sc, 3, [1, 1, 1], 0.45, 2.2);
    obstacles.push({ x: tx, z: tz, r: 1.05 * sc });
  });

  // 6. 5 Dormant Constellation Easel Altars across Saint-Rémy Valley
  const altarDefs = [
    { name: '天鹅座 · 柏树高地', x: -48, z: 24 },
    { name: '昴宿星团 · 金麦梯田', x: 30, z: -24 },
    { name: '双鱼座 · 西石桥畔', x: -34, z: riverZ(-34) - 13.5 },
    { name: '北冕座 · 风车山脊', x: 45, z: 31 },
    { name: '北斗七星 · 钟楼北坡', x: -12, z: -44 },
  ];
  const constellations = altarDefs.map((d, idx) => {
    const y = surfaceInfo(d.x, d.z).y;
    // Stone pedestal & painter's easel legs
    pushStatic(meshes.cyl, d.x, y + 0.35, d.z, 0, 0, 0, 3.2, 0.7, 3.2, 4, [0.48, 0.44, 0.36], 0.5, 2.0);
    pushStatic(meshes.cyl, d.x, y + 0.8, d.z, 0, 0, 0, 2.2, 0.35, 2.2, 4, [0.60, 0.54, 0.40], 0.45, 2.0);
    return {
      id: idx,
      name: d.name,
      x: d.x,
      y,
      z: d.z,
      lit: false,
      litAnim: 0,
    };
  });

  // 7. Grand Moonrise Canvas Frame atop Moonrise Summit (0, -76)
  const portalY = rawGroundH(0, -76);
  // Stone summit platform + Baroque Golden Canvas Frame pillars & lintel
  pushStatic(meshes.cyl, 0, portalY + 0.35, -76, 0, 0, 0, 8.6, 0.8, 8.6, 4, [0.50, 0.45, 0.36], 0.5, 2.4);
  pushStatic(meshes.box, -3.2, portalY + 4.1, -76, 0, 0, 0, 0.72, 7.2, 0.72, 4, [0.86, 0.66, 0.20], 0.28, 2.2);
  pushStatic(meshes.box, 3.2, portalY + 4.1, -76, 0, 0, 0, 0.72, 7.2, 0.72, 4, [0.86, 0.66, 0.20], 0.28, 2.2);
  pushStatic(meshes.box, 0, portalY + 7.55, -76, 0, 0, 0, 7.4, 0.82, 0.85, 4, [0.90, 0.70, 0.22], 0.26, 2.2);
  pushStatic(meshes.box, 0, portalY + 0.85, -76, 0, 0, 0, 7.2, 0.45, 0.82, 4, [0.82, 0.62, 0.18], 0.30, 2.2);
  const portal = { x: 0, y: portalY, z: -76, open: false };

  // 8. 45 Swirling Golden Star-Seeds along scenic riding lines
  const starSeeds = [];
  const addSeedArc = (x0, z0, x1, z1, count, curve = 0) => {
    for (let i = 0; i < count; i++) {
      const t = (i + 0.5) / count;
      const nx = -(z1 - z0), nz = x1 - x0;
      const nl = Math.hypot(nx, nz) || 1;
      const bend = Math.sin(t * Math.PI) * curve;
      const sx = lerp(x0, x1, t) + (nx / nl) * bend;
      const sz = lerp(z0, z1, t) + (nz / nl) * bend;
      const sy = surfaceInfo(sx, sz).y + 1.25;
      starSeeds.push({ x: sx, y: sy, z: sz, taken: false, respawn: 0, phase: rng() * 6.28 });
    }
  };
  addSeedArc(0, 18, -34, riverZ(-34), 8, -6);     // Start -> West Bridge
  addSeedArc(-34, riverZ(-34) - 8, -48, 24, 7, 7); // West Bridge -> Cygnus Overlook
  addSeedArc(4, 14, 32, riverZ(32), 7, 5);         // Start -> East Bridge
  addSeedArc(32, riverZ(32) - 6, 30, -24, 6, -4);  // East Bridge -> Pleiades Wheatfield
  addSeedArc(32, riverZ(32) + 8, 45, 31, 6, 5);    // East Bridge -> Corona Windmill
  addSeedArc(24, -28, -12, -44, 6, -6);            // Wheatfield -> Belltower
  addSeedArc(-10, -48, 0, -71, 5, 3);              // Belltower -> Moonrise Summit

  // 9. 6 Golden Sky-Hoops (Speed & Score Boost Rings over Bridges & Hills!)
  const hoopDefs = [
    { x: -34, z: riverZ(-34), yaw: 0 },
    { x: 32, z: riverZ(32), yaw: 0 },
    { x: 18, z: -18, yaw: 0.7 },
    { x: -20, z: 12, yaw: -0.6 },
    { x: 38, z: 10, yaw: 0.2 },
    { x: -4, z: -60, yaw: 0.1 },
  ];
  const skyHoops = hoopDefs.map((h) => {
    const sy = surfaceInfo(h.x, h.z).y + 2.35;
    return { x: h.x, y: sy, z: h.z, yaw: h.yaw, cd: 0 };
  });

  // 10. 6 Roaming Nocturne Ink-Whirlwinds (Dash through to paint over them!)
  const whirlCenters = [
    [-22, 4], [18, 22], [26, -12], [-38, -14], [6, -34], [-14, 34],
  ];
  const whirlwinds = whirlCenters.map(([cx, cz], i) => ({
    cx,
    cz,
    x: cx,
    y: 0,
    z: cz,
    orbitR: 8 + (i % 3) * 3.5,
    ang: i * 1.1,
    spd: (i % 2 === 0 ? 1 : -1) * (0.48 + i * 0.04),
    respawn: 0,
  }));

  return {
    draws,
    obstacles,
    windmills,
    constellations,
    portal,
    starSeeds,
    skyHoops,
    whirlwinds,
  };
}

export function createInstancedBrushSystem(gl, maxDynamic = 420) {
  const rng = mulberry32(890619);

  // Tapered Painterly Ribbon Quad (2 segments high so wheat bends smoothly!)
  const pos = [
    -0.16, 0.0, 0,   0.16, 0.0, 0,
    -0.13, 0.52, 0,  0.13, 0.52, 0,
     0.0,  1.05, 0,
  ];
  const uv = [
    0, 0,  1, 0,
    0, 0.52, 1, 0.52,
    0.5, 1.0,
  ];
  const idx = [
    0, 1, 2,  1, 3, 2,
    2, 3, 4,
  ];

  // Build Static Instances: 1,450 Golden Wheat Stalks + 550 Floating Sky/Valley Swirl Daubs
  const staticList = [];

  // Golden Wheat Stalks across both Provençal Wheatfields
  let wheatPlaced = 0;
  let guard = 0;
  while (wheatPlaced < 1450 && guard < 18000) {
    guard++;
    const x = (rng() - 0.5) * 145;
    const z = (rng() - 0.5) * 145;
    const mask = wheatFieldMask(x, z);
    if (mask > 0.28 && pathMask(x, z) < 0.55) {
      const y = rawGroundH(x, z);
      if (y > WATER_Y + 0.25) {
        const sc = (0.85 + rng() * 0.65) * (0.65 + 0.45 * mask);
        const goldShift = rng();
        const r = lerp(0.84, 0.99, goldShift);
        const g = lerp(0.58, 0.80, goldShift);
        const b = lerp(0.14, 0.28, goldShift);
        staticList.push(
          x, y - 0.05, z, sc,
          rng() * 6.28, 0, rng() * 6.28, 0.0,
          r, g, b, 0.95
        );
        wheatPlaced++;
      }
    }
  }

  // Floating 3D Swirling Oil-Paint Daubs in the Night Air & Sky
  const palette = [
    [0.98, 0.82, 0.30, 0.72], // Cadmium Star Gold
    [0.24, 0.56, 0.86, 0.62], // Cerulean Swirl
    [0.18, 0.46, 0.58, 0.58], // Viridian Mist
    [0.68, 0.84, 0.96, 0.65], // Milky Nebula
  ];
  for (let i = 0; i < 550; i++) {
    const ang = rng() * Math.PI * 2;
    const rad = 10 + rng() * 98;
    const x = Math.cos(ang) * rad;
    const z = Math.sin(ang) * rad - 8;
    const y = 5.5 + rng() * 34.0;
    const sc = 0.65 + rng() * 1.45;
    const c = palette[i % palette.length];
    staticList.push(
      x, y, z, sc,
      ang + 1.57, (rng() - 0.5) * 0.7, rng() * 6.28, 1.0,
      c[0], c[1], c[2], c[3]
    );
  }

  const staticCount = staticList.length / 12;
  const totalCap = staticCount + maxDynamic;
  const instanceData = new Float32Array(totalCap * 12);
  instanceData.set(staticList, 0);

  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);

  const vbPos = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, vbPos);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(pos), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);

  const vbUV = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, vbUV);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(uv), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(1);
  gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 0, 0);

  const ib = gl.createBuffer();
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(idx), gl.STATIC_DRAW);

  const instVBO = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, instVBO);
  gl.bufferData(gl.ARRAY_BUFFER, instanceData, gl.DYNAMIC_DRAW);

  const stride = 12 * 4;
  for (let k = 0; k < 3; k++) {
    const loc = 4 + k;
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 4, gl.FLOAT, false, stride, k * 16);
    gl.vertexAttribDivisor(loc, 1);
  }

  gl.bindVertexArray(null);

  return {
    vao,
    instVBO,
    instanceData,
    indexCount: idx.length,
    staticCount,
    maxDynamic,
  };
}

// Articulated 3D Steed & Vincent van Gogh Rider
const mHorseRoot = M4.create();
const mPart = M4.create();
const mWorld = M4.create();

export function drawHorseAndVincent(drawFn, meshes, rider, time) {
  const spdNorm = clamp(Math.abs(rider.speed) / 18.0, 0, 1.25);
  const bob = Math.sin(rider.gaitPhase * 2.0) * 0.08 * spdNorm;
  const pitchGait = Math.cos(rider.gaitPhase) * 0.055 * spdNorm + rider.pitch;

  M4.trs(
    mHorseRoot,
    rider.x,
    rider.y + 1.18 + bob,
    rider.z,
    pitchGait,
    rider.yaw,
    rider.bank,
    1,
    1,
    1
  );

  const part = (mesh, lx, ly, lz, rx, ry, rz, sx, sy, sz, mat, col, p0 = 0.4, p1 = 2.5, p2 = 1) => {
    M4.trs(mPart, lx, ly, lz, rx, ry, rz, sx, sy, sz);
    M4.mul(mWorld, mHorseRoot, mPart);
    drawFn(mesh, mWorld, mat, col, p0, p1, p2);
  };

  const coatChestnut = [0.64, 0.39, 0.19];
  const coatDark = [0.38, 0.22, 0.11];
  const maneGold = [0.92, 0.74, 0.30];
  const saddleLeather = [0.28, 0.16, 0.09];

  // Horse Torso, Muscular Chest & Haunches
  part(meshes.box, 0, 0.04, 0.0, 0, 0, 0, 0.66, 0.62, 1.56, 4, coatChestnut);
  part(meshes.sphere, 0, 0.08, -0.68, 0, 0, 0, 0.72, 0.68, 0.76, 4, coatChestnut);
  part(meshes.sphere, 0, 0.08, 0.66, 0, 0, 0, 0.70, 0.66, 0.74, 4, coatChestnut);

  // Arched Neck, Head, Muzzle & Alert Ears (nods rhythmically with gallop!)
  const headNod = Math.sin(rider.gaitPhase + 0.6) * 0.10 * spdNorm;
  const neckTurn = rider.steer * 0.22;
  part(meshes.cyl, 0, 0.56, -0.82, 0.55 + headNod, neckTurn, 0, 0.36, 0.92, 0.44, 4, coatChestnut);
  part(meshes.box, -neckTurn * 0.18, 0.94 + headNod * 0.2, -1.14, 0.42 + headNod, neckTurn, 0, 0.30, 0.32, 0.64, 4, coatChestnut);
  part(meshes.box, -neckTurn * 0.22, 0.84 + headNod * 0.2, -1.42, 0.42 + headNod, neckTurn, 0, 0.22, 0.22, 0.28, 4, coatDark);
  // White blaze on forehead & ears
  part(meshes.box, -neckTurn * 0.18, 1.02 + headNod * 0.2, -1.18, 0.42 + headNod, neckTurn, 0, 0.10, 0.18, 0.34, 4, [0.94, 0.90, 0.80]);
  part(meshes.cone, -0.11, 1.18, -0.98, 0.15, neckTurn, 0.12, 0.10, 0.24, 0.10, 4, coatChestnut);
  part(meshes.cone, 0.11, 1.18, -0.98, 0.15, neckTurn, -0.12, 0.10, 0.24, 0.10, 4, coatChestnut);

  // Flowing Golden Mane & Streaming Impasto Tail
  for (let m = 0; m < 4; m++) {
    const wave = Math.sin(time * 8 + m * 1.1) * 0.06;
    part(meshes.box, wave, 0.46 + m * 0.16, -0.62 - m * 0.09, 0.55, 0, 0.2, 0.10, 0.22, 0.18, 4, maneGold);
  }
  const tailLift = -0.55 - spdNorm * 0.55 + Math.sin(time * 7.5) * 0.12;
  part(meshes.cone, Math.sin(time * 6) * 0.08, -0.06, 1.06, tailLift, 0, 0, 0.24, 0.95, 0.24, 4, maneGold);

  // 4 Articulated Two-Segment Legs (4-beat equine gallop kinematics!)
  const legSpecs = [
    [-0.24, -0.62, 0.0],  // Front-Left
    [ 0.24, -0.62, 0.85], // Front-Right
    [-0.25,  0.62, 2.55], // Hind-Left
    [ 0.25,  0.62, 3.40], // Hind-Right
  ];
  legSpecs.forEach(([lx, lz, phOfs], li) => {
    const ph = rider.gaitPhase + phOfs;
    const stride = Math.sin(ph) * 0.68 * Math.min(1.1, spdNorm + 0.04);
    const kneeBend = Math.max(0, Math.cos(ph)) * 0.65 * spdNorm;
    const upperPitch = stride;
    const lowerPitch = stride - (li < 2 ? kneeBend : -kneeBend * 0.75);

    const uy = -0.34;
    part(meshes.cyl, lx, uy, lz, upperPitch, 0, 0, 0.19, 0.58, 0.21, 4, coatChestnut);
    const kx = lx;
    const ky = uy - Math.cos(upperPitch) * 0.30;
    const kz = lz - Math.sin(upperPitch) * 0.30;
    part(meshes.cyl, kx, ky - Math.cos(lowerPitch) * 0.26, kz - Math.sin(lowerPitch) * 0.26, lowerPitch, 0, 0, 0.13, 0.56, 0.14, 4, coatDark);
    // Hoof
    const hy = ky - Math.cos(lowerPitch) * 0.54;
    const hz = kz - Math.sin(lowerPitch) * 0.54;
    part(meshes.box, kx, hy, hz, lowerPitch, 0, 0, 0.15, 0.11, 0.18, 4, [0.15, 0.13, 0.12]);
  });

  // Leather Saddle + Vincent van Gogh Rider!
  part(meshes.box, 0, 0.36, -0.04, 0, 0, 0, 0.72, 0.16, 0.68, 4, saddleLeather);

  const lean = -0.14 - spdNorm * 0.24 - (rider.dashT > 0 ? 0.18 : 0);
  const cobaltJacket = [0.13, 0.31, 0.64];
  const strawHat = [0.95, 0.77, 0.20];
  const beardRed = [0.78, 0.36, 0.14];

  // Vincent's Torso (Cobalt Painter's Coat) & Riding Legs
  part(meshes.box, 0, 0.74, -0.04, lean, 0, 0, 0.46, 0.62, 0.32, 4, cobaltJacket);
  part(meshes.cyl, -0.33, 0.22, -0.06, 0.35, 0, 0.18, 0.17, 0.62, 0.19, 4, [0.16, 0.22, 0.34]);
  part(meshes.cyl, 0.33, 0.22, -0.06, 0.35, 0, -0.18, 0.17, 0.62, 0.19, 4, [0.16, 0.22, 0.34]);

  // Wooden Field Easel & Rolled Canvas strapped on Vincent's back!
  part(meshes.box, 0, 0.80, 0.17, lean - 0.08, 0, 0.15, 0.44, 0.54, 0.06, 4, [0.92, 0.87, 0.74]);
  part(meshes.box, 0, 0.80, 0.20, lean - 0.08, 0, -0.22, 0.08, 0.78, 0.06, 4, [0.58, 0.38, 0.18]);

  // Vincent's Head, Red-Ochre Beard & Iconic Golden Straw Hat!
  part(meshes.sphere, 0, 1.18, -0.10 + lean * 0.25, 0, neckTurn * 0.5, 0, 0.28, 0.30, 0.28, 4, [0.88, 0.68, 0.52]);
  part(meshes.box, 0, 1.11, -0.21 + lean * 0.25, 0.15, neckTurn * 0.5, 0, 0.20, 0.15, 0.12, 4, beardRed);
  // Wide straw brim + crown + cobalt ribbon
  part(meshes.cyl, 0, 1.31, -0.09 + lean * 0.25, -0.12, neckTurn * 0.5, 0, 0.66, 0.05, 0.66, 4, strawHat, 0.35);
  part(meshes.cyl, 0, 1.39, -0.08 + lean * 0.25, -0.12, neckTurn * 0.5, 0, 0.34, 0.16, 0.34, 4, strawHat, 0.35);
  part(meshes.cyl, 0, 1.34, -0.08 + lean * 0.25, -0.12, neckTurn * 0.5, 0, 0.36, 0.04, 0.36, 4, [0.10, 0.24, 0.52]);

  // Left Arm holding Reins + Right Arm holding Swinging Golden Starlight Lantern!
  part(meshes.cyl, -0.28, 0.82, -0.24, 0.85, 0.2, 0.2, 0.13, 0.48, 0.13, 4, cobaltJacket);
  part(meshes.cyl, 0.30, 0.86, -0.22, 0.72, -0.25, -0.35, 0.13, 0.48, 0.13, 4, cobaltJacket);
  const lanSwing = Math.sin(time * 5.2) * 0.06;
  part(meshes.sphere, 0.44 + lanSwing, 0.74, -0.44, 0, 0, 0, 0.24, 0.30, 0.24, 6, [1.0, 0.86, 0.34], 2.4, 1, 1);
}
