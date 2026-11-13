// Procedural Arrakis Dunes, 26-Segment Colossal Sandworm, Fremen Rider, Spice Harvesters, Ornithopters & Command Frigate

import {
  M4,
  SPICE_BASINS,
  spiceMask,
  duneH,
  duneNormal,
  mulberry32,
  clamp,
  lerp,
} from './math.js';

function uploadMesh(gl, pos, norm, uv, tint, idx) {
  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);

  const mk = (loc, data, size) => {
    const b = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, b);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(data), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, size, gl.FLOAT, false, 0, 0);
  };

  mk(0, pos, 3);
  mk(1, norm, 3);
  mk(2, uv, 2);
  mk(3, tint, 3);

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

export function createDesertPrimitives(gl) {
  // 1. Box
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

  // 2. Tapered Cylinder / Cone
  const makeCyl = (rTop, rBot, segs = 16) => {
    const pos = [], norm = [], uv = [], tint = [], idx = [];
    const sy = rBot - rTop;
    for (let i = 0; i <= segs; i++) {
      const u = i / segs;
      const a = u * Math.PI * 2;
      const ca = Math.cos(a), sa = Math.sin(a);
      const nl = Math.hypot(1, sy);
      pos.push(ca * rBot, -0.5, sa * rBot, ca * rTop, 0.5, sa * rTop);
      norm.push(ca / nl, sy / nl, sa / nl, ca / nl, sy / nl, sa / nl);
      uv.push(u, 0, u, 1);
      tint.push(1, 1, 1, 1, 1, 1);
    }
    for (let i = 0; i < segs; i++) {
      const k = i * 2;
      idx.push(k, k + 2, k + 3, k, k + 3, k + 1);
    }
    if (rTop > 0.02) {
      const ct = pos.length / 3;
      pos.push(0, 0.5, 0); norm.push(0, 1, 0); uv.push(0.5, 0.5); tint.push(1, 1, 1);
      for (let i = 0; i <= segs; i++) {
        const a = (i / segs) * Math.PI * 2;
        pos.push(Math.cos(a) * rTop, 0.5, Math.sin(a) * rTop);
        norm.push(0, 1, 0); uv.push(0.5, 0.5); tint.push(1, 1, 1);
      }
      for (let i = 0; i < segs; i++) idx.push(ct, ct + i + 2, ct + i + 1);
    }
    return uploadMesh(gl, pos, norm, uv, tint, idx);
  };

  const cyl = makeCyl(0.5, 0.5, 16);
  const wormSeg = makeCyl(0.47, 0.52, 18);
  const cone = makeCyl(0.02, 0.52, 10);
  const crag = makeCyl(0.18, 0.62, 6);

  // 3. Sphere
  const sPos = [], sNorm = [], sUV = [], sTint = [], sIdx = [];
  const latN = 14, lonN = 20;
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
      sUV.push(u, v);
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

  // 4. Flat Ring (Seismic Thumper Shockwaves & Breach Blast Rings)
  const rPos = [], rNorm = [], rUV = [], rTint = [], rIdx = [];
  const rSegs = 28;
  for (let i = 0; i <= rSegs; i++) {
    const a = (i / rSegs) * Math.PI * 2;
    const ca = Math.cos(a), sa = Math.sin(a);
    rPos.push(ca * 0.44, 0, sa * 0.44, ca * 0.5, 0, sa * 0.5);
    rNorm.push(0, 1, 0, 0, 1, 0);
    rUV.push(i / rSegs, 0, i / rSegs, 1);
    rTint.push(1, 1, 1, 1, 1, 1);
  }
  for (let i = 0; i < rSegs; i++) {
    const k = i * 2;
    rIdx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2);
  }
  const ring = uploadMesh(gl, rPos, rNorm, rUV, rTint, rIdx);

  // 5. Vast Wind-Sculpted Arrakis Erg Terrain (124 x 124 spanning 368m x 368m)
  const gN = 124, span = 368;
  const gPos = [], gNorm = [], gUV = [], gTint = [], gIdx = [];
  for (let iz = 0; iz <= gN; iz++) {
    const z = (iz / gN - 0.5) * span;
    for (let ix = 0; ix <= gN; ix++) {
      const x = (ix / gN - 0.5) * span;
      const y = duneH(x, z);
      const nrm = duneNormal(x, z);
      gPos.push(x, y, z);
      gNorm.push(nrm[0], nrm[1], nrm[2]);
      gUV.push(ix * 0.5, iz * 0.5);

      const sm = spiceMask(x, z);
      const rad = Math.hypot(x, z + 18);
      const cliff = clamp((rad - 138) / 34, 0, 1);

      // Golden-apricot Arrakis sand
      let cr = 0.86, cg = 0.58, cb = 0.30;
      // Blazing Cinnabar-Saffron Melange Spice Basins!
      cr = lerp(cr, 0.98, sm * 0.88);
      cg = lerp(cg, 0.34, sm * 0.88);
      cb = lerp(cb, 0.08, sm * 0.88);
      // Dark Obsidian-Sandstone Shield-Wall Cliffs
      cr = lerp(cr, 0.25, cliff);
      cg = lerp(cg, 0.15, cliff);
      cb = lerp(cb, 0.10, cliff);

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

  return { box, cyl, wormSeg, cone, crag, sphere, ring, terrain };
}

export function buildDesertArena(meshes) {
  const rng = mulberry32(10191); // Year 10,191 AG!
  const staticDraws = [];

  const pushStatic = (mesh, tx, ty, tz, rx, ry, rz, sx, sy, sz, mat, color, p0 = 0.5, p1 = 1.0, p2 = 1.0) => {
    const m = M4.create();
    M4.trs(m, tx, ty, tz, rx, ry, rz, sx, sy, sz);
    staticDraws.push({ mesh, m, mat, color, params: [p0, p1, p2] });
  };

  // Dramatic Basalt Desert Rock Spires & Eroded Monoliths jutting from the sand
  const rockSpots = [
    [-18, 56, 1.3], [22, 52, 1.1], [-68, 12, 1.7], [74, 18, 1.6],
    [-86, -54, 1.9], [86, -62, 1.8], [-24, -68, 1.2], [38, -74, 1.35],
    [-58, -104, 1.8], [62, -108, 1.75], [0, -134, 2.2], [-96, 48, 1.9],
    [98, 54, 1.85], [-34, 16, 0.95], [40, 22, 1.05], [-12, -18, 0.9],
  ];
  rockSpots.forEach(([rx, rz, sc], i) => {
    const ry = duneH(rx, rz);
    const col = [0.24 + (i % 3) * 0.03, 0.15 + (i % 2) * 0.02, 0.10];
    pushStatic(meshes.crag, rx, ry + 3.2 * sc, rz, (rng() - 0.5) * 0.2, rng() * 6.28, (rng() - 0.5) * 0.2, 5.2 * sc, 8.5 * sc, 4.6 * sc, 3, col);
    pushStatic(meshes.crag, rx + 2.4 * sc, ry + 1.6 * sc, rz - 1.5 * sc, 0.12, i, -0.1, 3.6 * sc, 4.8 * sc, 3.4 * sc, 3, col);
  });

  // 3 Colossal Imperial Spice Harvesters operating in the 3 Melange Basins
  const harvesterNames = [
    '哈肯尼甲号香料母车 · ALPHA',
    '哈肯尼乙号香料母车 · BETA',
    '帝国深漠精炼母舰 · GAMMA',
  ];
  const harvesters = SPICE_BASINS.map((b, idx) => ({
    id: idx,
    name: harvesterNames[idx],
    cx: b.x,
    cz: b.z,
    x: b.x,
    y: duneH(b.x, b.z),
    z: b.z,
    yaw: idx * 2.1,
    hp: 100,
    maxHp: 100,
    alive: true,
    hitFlash: 0,
  }));

  // 6 Imperial Escort Sand-Skiffs patrolling around the Harvesters
  const skiffs = [];
  for (let i = 0; i < 6; i++) {
    const b = SPICE_BASINS[i % 3];
    skiffs.push({
      cx: b.x,
      cz: b.z,
      orbitR: 15 + (i % 2) * 7,
      ang: i * 1.05,
      spd: (i % 2 === 0 ? 1 : -1) * 0.55,
      x: b.x + 15,
      y: 2,
      z: b.z,
      yaw: 0,
      alive: true,
      respawn: 0,
    });
  }

  // 8 Dragonfly Quad-Wing Imperial Ornithopters circling at low-to-mid altitude (Breach to snatch them!)
  const ornithopters = [];
  for (let i = 0; i < 8; i++) {
    const b = SPICE_BASINS[i % 3];
    ornithopters.push({
      cx: b.x * 0.75,
      cz: b.z * 0.75,
      orbitR: 22 + (i % 3) * 12,
      alt: 10.5 + (i % 3) * 2.8,
      ang: i * 0.78,
      spd: (i % 2 === 0 ? 1 : -1) * (0.62 + (i % 3) * 0.08),
      x: 0,
      y: 12,
      z: 0,
      yaw: 0,
      alive: true,
      respawn: 0,
    });
  }

  // Stage 02 Finale Boss: Imperial Harkon-Class Command Frigate + Orbital Thermal Lance
  const frigate = {
    active: false,
    alive: true,
    x: 0,
    y: 16.5,
    z: -52,
    yaw: 0,
    hp: 200,
    maxHp: 200,
    hitFlash: 0,
    beamX: 0,
    beamZ: -30,
    beamAng: 0,
  };

  return { staticDraws, harvesters, skiffs, ornithopters, frigate };
}

export function createSandParticleSystem(gl, maxParticles = 520) {
  const pos = [-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0];
  const uv = [0, 0, 1, 0, 1, 1, 0, 1];
  const idx = [0, 1, 2, 0, 2, 3];

  const data = new Float32Array(maxParticles * 12);
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
  gl.bufferData(gl.ARRAY_BUFFER, data, gl.DYNAMIC_DRAW);

  const stride = 12 * 4;
  for (let k = 0; k < 3; k++) {
    const loc = 4 + k;
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 4, gl.FLOAT, false, stride, k * 16);
    gl.vertexAttribDivisor(loc, 1);
  }
  gl.bindVertexArray(null);

  return { vao, instVBO, data, maxParticles };
}

// Reusable scratch matrices for hierarchical drawing
const mRoot = M4.create();
const mPart = M4.create();
const mOut = M4.create();

// Draw Fremen Warrior (On-Foot during Thumper Summoning OR Mounted atop Segment #2!)
export function drawFremenWarrior(drawFn, meshes, x, y, z, yaw, lean, time, mounted = false) {
  M4.trs(mRoot, x, y, z, lean, yaw, 0, 1, 1, 1);
  const p = (mesh, lx, ly, lz, rx, ry, rz, sx, sy, sz, mat, col, g = 0.5) => {
    M4.trs(mPart, lx, ly, lz, rx, ry, rz, sx, sy, sz);
    M4.mul(mOut, mRoot, mPart);
    drawFn(mesh, mOut, mat, col, g, 1, 1);
  };

  const stillsuit = [0.16, 0.14, 0.13];
  const sandCloak = [0.68, 0.54, 0.36];
  const ibadBlue  = [0.18, 0.82, 1.0];

  // Legs & Torso
  p(meshes.cyl, -0.18, 0.45, 0, mounted ? 0.25 : 0, 0, 0.08, 0.16, 0.85, 0.18, 4, stillsuit);
  p(meshes.cyl,  0.18, 0.45, 0, mounted ? -0.20 : 0, 0, -0.08, 0.16, 0.85, 0.18, 4, stillsuit);
  p(meshes.box,  0, 1.12, 0, -0.1, 0, 0, 0.44, 0.64, 0.28, 4, stillsuit);
  // Flowing Fremen Desert Scarf / Cloak whipping in the sand-wind!
  const capeWave = Math.sin(time * 9.5) * 0.16;
  p(meshes.cone, capeWave * 0.4, 0.96, 0.42, -0.68 - (mounted ? 0.35 : 0), 0, capeWave, 0.68, 1.25, 0.18, 4, sandCloak);

  // Hooded Head + Glowing Blue Eyes-of-Ibad Visor!
  p(meshes.sphere, 0, 1.60, -0.03, 0, 0, 0, 0.30, 0.32, 0.30, 4, sandCloak);
  p(meshes.box, 0, 1.61, -0.16, 0, 0, 0, 0.18, 0.05, 0.06, 6, ibadBlue, 2.2);

  // Dual Maker-Hook Poles in Hands!
  if (mounted) {
    p(meshes.cyl, -0.34, 1.15, -0.45, 1.15, 0.2, 0.2, 0.05, 1.35, 0.05, 4, [0.75, 0.72, 0.66]);
    p(meshes.cyl,  0.34, 1.15, -0.45, 1.15, -0.2, -0.2, 0.05, 1.35, 0.05, 4, [0.75, 0.72, 0.66]);
  }
}

// Draw 26-Segment Colossal Sandworm (66m long, 3-Petal Baleen Jaw, Glowing Throat & Rider!)
export function drawColossalSandworm(drawFn, meshes, worm, time, mounted) {
  const segs = worm.segments;
  const carapace = [0.34, 0.23, 0.16];
  const darkPlate = [0.22, 0.15, 0.10];
  const baleenTooth = [0.94, 0.88, 0.74];

  // Draw segments tail-to-head
  for (let i = segs.length - 1; i >= 0; i--) {
    const s = segs[i];
    // Skip segments deep below local sand so subterranean burrowing looks seamless!
    const localSandY = duneH(s.x, s.z);
    if (s.y < localSandY - s.r * 1.35) continue;

    // Cylinder default axis is +Y; pitching by (s.pitch - PI/2) aligns +Y with forward (-sin(yaw)*cos(pitch), sin(pitch), -cos(yaw)*cos(pitch))!
    M4.trs(mRoot, s.x, s.y, s.z, s.pitch - Math.PI * 0.5, s.yaw, s.roll || 0, 1, 1, 1);

    const len = i === 0 ? 3.2 : 2.95;
    M4.trs(mPart, 0, 0, 0, 0, 0, 0, s.r * 2.0, len, s.r * 2.0);
    M4.mul(mOut, mRoot, mPart);
    drawFn(meshes.wormSeg, mOut, 2, carapace, 0.55, 1.0, 1.0);

    // Dorsal armored ridge scale on top of each segment
    if (i > 0 && i < segs.length - 2) {
      const pried = mounted && (i === 2 || i === 3) ? 0.32 : 0.0;
      M4.trs(mPart, 0, 0, -s.r * 0.96, -0.25 - pried, 0, 0, s.r * 1.15, len * 0.72, s.r * 0.28);
      M4.mul(mOut, mRoot, mPart);
      drawFn(meshes.box, mOut, 2, darkPlate, 0.5, 1.0, 1.0);
    }

    // Segment 0: Iconic Three-Petal Roaring Jaw & Crystalline Baleen Teeth!
    if (i === 0) {
      // Glowing Molten-Spice Inner Gullet
      M4.trs(mPart, 0, 1.35, 0, 0, 0, 0, s.r * 1.52, 0.55, s.r * 1.52);
      M4.mul(mOut, mRoot, mPart);
      drawFn(meshes.cyl, mOut, 6, [1.0, 0.44, 0.08], 2.1, 1, 1);

      const jawAngle = 0.22 + worm.jawOpen * 0.62;
      for (let j = 0; j < 3; j++) {
        const phi = (j / 3) * Math.PI * 2 + time * 0.25;
        const jx = Math.cos(phi) * s.r * 0.72;
        const jz = Math.sin(phi) * s.r * 0.72;
        M4.trs(mPart, jx, 2.05, jz, Math.sin(phi) * jawAngle, 0, -Math.cos(phi) * jawAngle, s.r * 0.92, 2.5, s.r * 0.92);
        M4.mul(mOut, mRoot, mPart);
        drawFn(meshes.cone, mOut, 2, darkPlate, 0.5, 1, 1);
      }

      // Ring of 12 Crystalline Baleen Teeth!
      for (let t = 0; t < 12; t++) {
        const ta = (t / 12) * Math.PI * 2;
        const tx = Math.cos(ta) * s.r * 0.84;
        const tz = Math.sin(ta) * s.r * 0.84;
        M4.trs(mPart, tx, 1.75, tz, -Math.sin(ta) * 0.35, 0, Math.cos(ta) * 0.35, 0.24, 1.25, 0.24);
        M4.mul(mOut, mRoot, mPart);
        drawFn(meshes.cone, mOut, 4, baleenTooth, 0.25, 1, 1);
      }
    }
  }

  // Mounted Fremen Warrior standing heroically atop Segment #2!
  if (mounted && segs[2]) {
    const s2 = segs[2];
    const sandY = duneH(s2.x, s2.z);
    if (s2.y > sandY - 1.2) {
      drawFremenWarrior(
        drawFn,
        meshes,
        s2.x,
        s2.y + s2.r * 0.95,
        s2.z,
        s2.yaw,
        -0.18 - s2.pitch * 0.5,
        time,
        true
      );
    }
  }
}

// Draw Imperial Spice Harvester, Hover-Skiffs, Flapping Ornithopters & Harkon Command Frigate
export function drawImperialForces(drawFn, meshes, arena, time) {
  const hullBronze = [0.28, 0.24, 0.20];
  const armorSlate = [0.17, 0.16, 0.16];
  const spiceTank  = [0.76, 0.42, 0.14];

  // 1. Colossal Spice Harvesters
  for (const h of arena.harvesters) {
    if (!h.alive) continue;
    const fl = h.hitFlash > 0 ? 2.1 : 1.0;
    const col = [hullBronze[0] * fl, hullBronze[1] * fl, hullBronze[2] * fl];
    M4.trs(mRoot, h.x, h.y + 2.4, h.z, 0, h.yaw, 0, 1, 1, 1);

    const p = (mesh, lx, ly, lz, rx, ry, rz, sx, sy, sz, mat, c, g = 0.4) => {
      M4.trs(mPart, lx, ly, lz, rx, ry, rz, sx, sy, sz);
      M4.mul(mOut, mRoot, mPart);
      drawFn(mesh, mOut, mat, c, g, 1, 1);
    };

    // Main Industrial Deck & Spice Silo Tanks
    p(meshes.box, 0, 0.4, 0, 0, 0, 0, 9.2, 3.2, 14.8, 4, col);
    p(meshes.sphere, 0, 2.4, 1.2, 0, 0, 0, 6.2, 3.8, 6.8, 4, spiceTank);
    p(meshes.box, 0, 2.5, -4.2, 0, 0, 0, 5.2, 2.2, 4.2, 4, armorSlate);
    // Glowing amber bridge visor & warning beacon
    p(meshes.box, 0, 2.7, -6.35, 0, 0, 0, 3.8, 0.55, 0.2, 6, [1.0, 0.68, 0.18], 2.0);
    // 4 Massive Caterpillar Treads
    [[-4.8, -4.2], [4.8, -4.2], [-4.8, 4.2], [4.8, 4.2]].forEach(([tx, tz]) => {
      p(meshes.box, tx, -1.2, tz, 0, 0, 0, 1.8, 2.2, 5.4, 4, armorSlate);
    });
    // Rotating Front Spice Vacuum Auger!
    p(meshes.cyl, 0, -1.0, -8.2, 0, 0, Math.PI * 0.5, 1.9, 7.6, 1.9, 4, [0.45, 0.34, 0.22]);
  }

  // 2. Escort Hover-Skiffs
  for (const sk of arena.skiffs) {
    if (!sk.alive) continue;
    M4.trs(mRoot, sk.x, sk.y, sk.z, 0, sk.yaw, 0, 1, 1, 1);
    M4.trs(mPart, 0, 0, 0, 0, 0, 0, 2.4, 0.9, 4.8);
    M4.mul(mOut, mRoot, mPart);
    drawFn(meshes.box, mOut, 4, hullBronze);
    M4.trs(mPart, 0, -0.45, 0, 0, 0, 0, 1.8, 0.25, 3.6);
    M4.mul(mOut, mRoot, mPart);
    drawFn(meshes.box, mOut, 6, [1.0, 0.52, 0.14], 1.8);
  }

  // 3. Quad-Wing Flapping Dragonfly Ornithopters!
  for (const o of arena.ornithopters) {
    if (!o.alive) continue;
    M4.trs(mRoot, o.x, o.y, o.z, 0.14, o.yaw, 0.22, 1, 1, 1);
    // Faceted Cockpit + Long Tailboom
    M4.trs(mPart, 0, 0, -0.6, 0, 0, 0, 1.5, 1.25, 3.4);
    M4.mul(mOut, mRoot, mPart);
    drawFn(meshes.box, mOut, 4, hullBronze);
    M4.trs(mPart, 0, 0.15, 2.8, -1.45, 0, 0, 0.55, 4.6, 0.55);
    M4.mul(mOut, mRoot, mPart);
    drawFn(meshes.cone, mOut, 4, armorSlate);
    M4.trs(mPart, 0, 0.0, -2.35, 0, 0, 0, 1.1, 0.55, 0.2);
    M4.mul(mOut, mRoot, mPart);
    drawFn(meshes.box, mOut, 6, [1.0, 0.62, 0.18], 2.0);

    // 4 High-Speed Vibrating Dragonfly Wings!
    const flapA = Math.sin(time * 58.0 + o.ang) * 0.36;
    const flapB = -flapA;
    [
      [-1, -0.3, flapA, 0.18],
      [ 1, -0.3, -flapA, -0.18],
      [-1,  0.5, flapB, -0.15],
      [ 1,  0.5, -flapB, 0.15],
    ].forEach(([side, wz, roll, sweep]) => {
      M4.trs(mPart, side * 3.8, 0.45 + Math.abs(roll) * 0.6, wz, 0, sweep, roll, 6.8, 0.07, 0.58);
      M4.mul(mOut, mRoot, mPart);
      drawFn(meshes.box, mOut, 4, [0.58, 0.54, 0.48]);
    });
  }

  // 4. Stage 02 Finale Boss: Harkon-Class Command Frigate
  const fr = arena.frigate;
  if (fr.active && fr.alive) {
    const fl = fr.hitFlash > 0 ? 2.2 : 1.0;
    const cMain = [0.22 * fl, 0.19 * fl, 0.18 * fl];
    M4.trs(mRoot, fr.x, fr.y, fr.z, Math.sin(time * 1.2) * 0.03, fr.yaw, Math.cos(time * 0.9) * 0.04, 1, 1, 1);

    // Massive Armored Hull & Side Engine Nacelles
    M4.trs(mPart, 0, 0, 0, 0, 0, 0, 16.0, 5.4, 34.0);
    M4.mul(mOut, mRoot, mPart);
    drawFn(meshes.box, mOut, 4, cMain);

    [-10.2, 10.2].forEach((nx) => {
      M4.trs(mPart, nx, -0.6, 2.0, 0, 0, 0, 4.4, 3.6, 22.0);
      M4.mul(mOut, mRoot, mPart);
      drawFn(meshes.box, mOut, 4, armorSlate);
    });

    // Exposed Ventral Spice-Reactor Core (Breach into it from below!)
    M4.trs(mPart, 0, -2.9, 0, 0, time * 2.0, 0, 6.8, 1.8, 6.8);
    M4.mul(mOut, mRoot, mPart);
    drawFn(meshes.sphere, mOut, 6, [1.0, 0.38, 0.08], 2.5, 1, 1);
  }
}
