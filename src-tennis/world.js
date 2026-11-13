// Procedural 3D Geometry, 1972 7-Segment Scoreboard, Cyber-Stadium, Pinball Bumpers, Mecha Paddle & Solar Boss Core
// Zero External Assets — 100% WebGL2 Procedural VAOs & GPU-Instanced Particle System

import {
  M4,
  COURT_HALF_X,
  COURT_HALF_Z,
  PLAYER_Z,
  AI_Z,
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

export function createTennisPrimitives(gl) {
  // 1. Unit Box
  const bPos = [], bNorm = [], bUV = [], bTint = [], bIdx = [];
  const faces = [
    [[0, 0, 1], [-0.5, -0.5, 0.5], [0.5, -0.5, 0.5], [0.5, 0.5, 0.5], [-0.5, 0.5, 0.5]],
    [[0, 0, -1], [0.5, -0.5, -0.5], [-0.5, -0.5, -0.5], [-0.5, 0.5, -0.5], [0.5, 0.5, -0.5]],
    [[0, 1, 0], [-0.5, 0.5, 0.5], [0.5, 0.5, 0.5], [0.5, 0.5, -0.5], [-0.5, 0.5, -0.5]],
    [[0, -1, 0], [-0.5, -0.5, -0.5], [0.5, -0.5, -0.5], [0.5, -0.5, 0.5], [-0.5, -0.5, 0.5]],
    [[1, 0, 0], [0.5, -0.5, 0.5], [0.5, -0.5, -0.5], [0.5, 0.5, -0.5], [0.5, 0.5, 0.5]],
    [[-1, 0, 0], [-0.5, -0.5, -0.5], [-0.5, -0.5, 0.5], [-0.5, 0.5, 0.5], [-0.5, -0.5, -0.5]],
  ];
  // Fix -X face last vertex cleanly:
  faces[5] = [[-1, 0, 0], [-0.5, -0.5, -0.5], [-0.5, -0.5, 0.5], [-0.5, 0.5, 0.5], [-0.5, 0.5, -0.5]];
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
  const makeCyl = (rTop, rBot, segs = 20) => {
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
  const cyl = makeCyl(0.5, 0.5, 20);
  const cone = makeCyl(0.03, 0.52, 14);
  const hexPillar = makeCyl(0.46, 0.54, 6);

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

  // 4. Flat Ring (Shockwaves, Bumper Halos, Gravity Well Accretion Rings, Dyson Rings)
  const rPos = [], rNorm = [], rUV = [], rTint = [], rIdx = [];
  const rSegs = 32;
  for (let i = 0; i <= rSegs; i++) {
    const a = (i / rSegs) * Math.PI * 2;
    const ca = Math.cos(a), sa = Math.sin(a);
    rPos.push(ca * 0.43, 0, sa * 0.43, ca * 0.5, 0, sa * 0.5);
    rNorm.push(0, 1, 0, 0, 1, 0);
    rUV.push(i / rSegs, 0, i / rSegs, 1);
    rTint.push(1, 1, 1, 1, 1, 1);
  }
  for (let i = 0; i < rSegs; i++) {
    const k = i * 2;
    rIdx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2);
  }
  const ring = uploadMesh(gl, rPos, rNorm, rUV, rTint, rIdx);

  // 5. Curved 3D Shield Arc Segment (Era 5 Boss Rotating Energy Shields, ~76 deg arc)
  const shPos = [], shNorm = [], shUV = [], shTint = [], shIdx = [];
  const arcSegs = 12;
  const halfSpan = 0.66; // radians (~75.6 deg total)
  for (let i = 0; i <= arcSegs; i++) {
    const u = i / arcSegs;
    const a = lerp(-halfSpan, halfSpan, u);
    const ca = Math.cos(a), sa = Math.sin(a);
    // Extruded vertical curved barrier at radius 1.0, height [-0.5..0.5]
    shPos.push(sa, -0.5, ca, sa, 0.5, ca);
    shNorm.push(sa, 0, ca, sa, 0, ca);
    shUV.push(u, 0, u, 1);
    shTint.push(1, 1, 1, 1, 1, 1);
  }
  for (let i = 0; i < arcSegs; i++) {
    const k = i * 2;
    shIdx.push(k, k + 2, k + 3, k, k + 3, k + 1);
    // Backface so shield is visible from all angles
    shIdx.push(k, k + 3, k + 2, k, k + 1, k + 3);
  }
  const shieldArc = uploadMesh(gl, shPos, shNorm, shUV, shTint, shIdx);

  // 6. Subdivided 3D Court Surface (52 x 68 vertices for smooth Gravity-Well deformation!)
  const gxN = 52, gzN = 68;
  const spanX = (COURT_HALF_X + 1.4) * 2;
  const spanZ = (COURT_HALF_Z + 1.4) * 2;
  const cPos = [], cNorm = [], cUV = [], cTint = [], cIdx = [];
  for (let iz = 0; iz <= gzN; iz++) {
    const vz = iz / gzN;
    const z = (vz - 0.5) * spanZ;
    for (let ix = 0; ix <= gxN; ix++) {
      const vx = ix / gxN;
      const x = (vx - 0.5) * spanX;
      cPos.push(x, 0, z);
      cNorm.push(0, 1, 0);
      cUV.push(vx, vz);
      cTint.push(1, 1, 1);
    }
  }
  for (let iz = 0; iz < gzN; iz++) {
    for (let ix = 0; ix < gxN; ix++) {
      const a = iz * (gxN + 1) + ix;
      const b = a + gxN + 1;
      cIdx.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  const court = uploadMesh(gl, cPos, cNorm, cUV, cTint, cIdx);

  return { box, cyl, cone, hexPillar, sphere, ring, shieldArc, court };
}

export function createParticleSystem(gl, maxParticles = 680) {
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
  gl.bufferData(gl.ARRAY_BUFFER, data.byteLength, gl.DYNAMIC_DRAW);

  const stride = 12 * 4;
  gl.enableVertexAttribArray(4);
  gl.vertexAttribPointer(4, 4, gl.FLOAT, false, stride, 0);
  gl.vertexAttribDivisor(4, 1);

  gl.enableVertexAttribArray(5);
  gl.vertexAttribPointer(5, 4, gl.FLOAT, false, stride, 16);
  gl.vertexAttribDivisor(5, 1);

  gl.enableVertexAttribArray(6);
  gl.vertexAttribPointer(6, 4, gl.FLOAT, false, stride, 32);
  gl.vertexAttribDivisor(6, 1);

  gl.bindVertexArray(null);
  return { vao, instVBO, data, maxParticles };
}

// 1972 Atari Pong 7-Segment Digit Patterns (0..9)
const DIGIT_SEGS = [
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

const mScratch = M4.create();

function drawSingleDigit(drawFn, meshes, digit, cx, cz, scale, col, matId, glow, alpha) {
  const segs = DIGIT_SEGS[clamp(Math.floor(digit) % 10, 0, 9)];
  const w = 1.15 * scale;
  const h = 1.95 * scale;
  const th = 0.24 * scale;
  const y = 0.04;
  // 0:top, 1:topR, 2:botR, 3:bot, 4:botL, 5:topL, 6:mid
  const defs = [
    [0, -h * 0.5, w, th],
    [w * 0.45, -h * 0.25, th, h * 0.52],
    [w * 0.45, h * 0.25, th, h * 0.52],
    [0, h * 0.5, w, th],
    [-w * 0.45, h * 0.25, th, h * 0.52],
    [-w * 0.45, -h * 0.25, th, h * 0.52],
    [0, 0, w * 0.9, th],
  ];
  for (let i = 0; i < 7; i++) {
    if (!segs[i]) continue;
    const [dx, dz, sx, sz] = defs[i];
    M4.trs(mScratch, cx + dx, y, cz + dz, 0, 0, 0, sx, 0.07, sz);
    drawFn(meshes.box, mScratch, matId, col, glow, 1.0, alpha);
  }
}

export function drawRetroDigits(drawFn, meshes, playerScore, aiScore, eraMix) {
  const isRetro = eraMix < 1.5;
  const matId = isRetro ? 0 : 6;
  const alpha = isRetro ? 1.0 : 0.34;
  const glow = isRetro ? 1.0 : 0.85;
  const pCol = isRetro ? [0.953, 0.937, 0.902] : [0.133, 0.827, 0.933];
  const aCol = isRetro ? [0.953, 0.937, 0.902] : [0.96, 0.69, 0.145];

  const drawNum = (val, cx, cz, col) => {
    const v = Math.max(0, Math.floor(val));
    if (v < 10) {
      drawSingleDigit(drawFn, meshes, v, cx, cz, 1.15, col, matId, glow, alpha);
    } else {
      drawSingleDigit(drawFn, meshes, Math.floor(v / 10), cx - 0.82, cz, 1.0, col, matId, glow, alpha);
      drawSingleDigit(drawFn, meshes, v % 10, cx + 0.82, cz, 1.0, col, matId, glow, alpha);
    }
  };

  // AI Score on North Half (-Z), Player Score on South Half (+Z)
  drawNum(aiScore, -5.2, -5.2, aCol);
  drawNum(playerScore, 5.2, 5.2, pCol);
}

export function drawCyberStadium(drawFn, meshes, eraMix, t, railFlashL, railFlashR) {
  const wake3D = clamp((eraMix - 1.05) / 0.85, 0, 1);
  const mechaRise = clamp((eraMix - 3.05) / 0.85, 0, 1);
  const solarForge = clamp((eraMix - 4.05) / 0.85, 0, 1);

  // 1. Court Floor
  M4.trs(mScratch, 0, -0.02, 0, 0, 0, 0, 1, 1, 1);
  drawFn(meshes.court, mScratch, 1, [1, 1, 1], 0.5, 1.0, 1.0);

  // 2. Classic 1972 Dotted Centerline across X at Z = 0 (extrudes gently in 3D!)
  const dashCount = 15;
  const cream = [0.953, 0.937, 0.902];
  const cyan = [0.133, 0.827, 0.933];
  const gold = [0.96, 0.69, 0.145];
  for (let i = 0; i < dashCount; i++) {
    const x = lerp(-COURT_HALF_X + 0.85, COURT_HALF_X - 0.85, i / (dashCount - 1));
    const dashCol = wake3D < 0.2 ? cream : [
      lerp(cream[0], cyan[0], wake3D * 0.7),
      lerp(cream[1], cyan[1], wake3D * 0.7),
      lerp(cream[2], cyan[2], wake3D * 0.7),
    ];
    M4.trs(mScratch, x, 0.04, 0, 0, 0, 0, 0.82, 0.08, 0.24);
    drawFn(meshes.box, mScratch, wake3D < 0.2 ? 0 : 6, dashCol, 1.15, 1.0, 1.0);
  }

  // 3. Left & Right Side-Walls / Rim-Rails
  const railH = lerp(0.18, 0.92, wake3D);
  const railW = lerp(0.22, 0.56, wake3D);
  const lenZ = COURT_HALF_Z * 2 + 1.2;

  // Era 1 flat white lines -> Era 2+ metallic wall chassis + blazing Solar Gold / Electric Cyan Rim-Rails!
  [-1, 1].forEach((side) => {
    const rx = side * (COURT_HALF_X + railW * 0.5);
    const flash = side < 0 ? railFlashL : railFlashR;
    if (wake3D < 0.08) {
      M4.trs(mScratch, rx, 0.05, 0, 0, 0, 0, railW, 0.10, lenZ);
      drawFn(meshes.box, mScratch, 0, cream, 1.0, 1.0, 1.0);
    } else {
      // Beveled metallic rail housing
      M4.trs(mScratch, rx, railH * 0.45, 0, 0, 0, 0, railW, railH, lenZ);
      drawFn(meshes.box, mScratch, 2, [0.14, 0.19, 0.25], 0.5, side < 0 ? 0.15 : 0.85, 1.0);

      // Glowing top Rim-Rail laser strip (Left = Electric Cyan, Right = Solar Gold, surges on bounce!)
      const baseGlowCol = side < 0 ? cyan : gold;
      const gInt = 1.35 + flash * 2.1;
      M4.trs(mScratch, rx - side * 0.08, railH + 0.06, 0, 0, 0, 0, 0.22, 0.14, lenZ);
      drawFn(meshes.box, mScratch, 6, baseGlowCol, gInt, 1.0, 1.0);
    }
  });

  if (wake3D < 0.05) return;

  // 4. Era 2+ Surrounding 3D Cyber-Stadium Grandstand Tiers & Light Pylons!
  const riseY = (1.0 - wake3D) * -9.0;
  // Tear open stadium roof/walls outward slightly in Era 5 Star-Forge!
  const openSpread = solarForge * 3.8;

  for (let tier = 0; tier < 3; tier++) {
    const distOut = COURT_HALF_X + 3.4 + tier * 2.8 + openSpread;
    const th = (1.4 + tier * 1.45) * wake3D;
    const ty = riseY + th * 0.5 - 0.3;
    [-1, 1].forEach((side) => {
      M4.trs(mScratch, side * distOut, ty, 0, 0, 0, 0, 2.2, th, lenZ + 8 + tier * 4);
      drawFn(meshes.box, mScratch, 3, [0.09, 0.12, 0.17], 0.5, 1.0, 1.0);
    });
  }

  // North Backdrop Stadium Archway (parts open in Era 5 for the Solar Singularity!)
  if (solarForge < 0.98) {
    const archSpread = solarForge * 12.0;
    [-1, 1].forEach((side) => {
      M4.trs(mScratch, side * (7.5 + archSpread), riseY + 2.6 * wake3D, -COURT_HALF_Z - 5.5, 0, 0, 0, 13.0, 5.4 * wake3D, 2.4);
      drawFn(meshes.box, mScratch, 3, [0.10, 0.13, 0.18], 0.5, 1.0, 1.0);
    });
  }

  // 4 Towering Corner Stadium Light-Pylons
  const corners = [
    [-COURT_HALF_X - 2.6 - openSpread * 0.5, -COURT_HALF_Z - 1.5],
    [COURT_HALF_X + 2.6 + openSpread * 0.5, -COURT_HALF_Z - 1.5],
    [-COURT_HALF_X - 2.6 - openSpread * 0.5, COURT_HALF_Z + 1.5],
    [COURT_HALF_X + 2.6 + openSpread * 0.5, COURT_HALF_Z + 1.5],
  ];
  corners.forEach(([px, pz], idx) => {
    const pyH = 9.5 * wake3D;
    M4.trs(mScratch, px, riseY + pyH * 0.5, pz, 0, idx * 0.78, 0, 1.35, pyH, 1.35);
    drawFn(meshes.hexPillar, mScratch, 2, [0.16, 0.21, 0.27], 0.5, idx % 2, 1.0);

    // Pylon Crown Floodlight
    const crownCol = idx < 2 ? gold : cyan;
    M4.trs(mScratch, px, riseY + pyH + 0.35, pz, 0, 0, 0, 1.8, 0.65, 1.8);
    drawFn(meshes.box, mScratch, 6, crownCol, 1.65, 1.0, 1.0);

    // Era 4+ Skyward Mecha Searchlight Beams!
    if (mechaRise > 0.05) {
      const sway = Math.sin(t * 1.4 + idx * 1.6) * 0.14;
      M4.trs(mScratch, px, riseY + pyH + 11.0, pz, sway, 0, -sway * 0.7, 0.9, 22.0 * mechaRise, 0.9);
      drawFn(meshes.cyl, mScratch, 6, crownCol, 1.45, 1.0, 0.24 * mechaRise);
    }
  });

  // Era 5 Colossal Orbiting Solar Dyson Rings behind the Boss!
  if (solarForge > 0.03) {
    const ringScale = 24.0 * solarForge;
    M4.trs(mScratch, 0, 7.5, -COURT_HALF_Z - 16.0, 1.15, t * 0.32, 0.28, ringScale, 1.0, ringScale);
    drawFn(meshes.ring, mScratch, 6, gold, 1.85, 1.0, 0.78 * solarForge);

    M4.trs(mScratch, 0, 7.5, -COURT_HALF_Z - 16.0, 0.85, -t * 0.48, -0.36, ringScale * 0.72, 1.0, ringScale * 0.72);
    drawFn(meshes.ring, mScratch, 6, [1.0, 0.45, 0.16], 1.75, 1.0, 0.72 * solarForge);
  }
}

export function drawPlayerPaddle(drawFn, meshes, paddle, eraMix, t) {
  const wake3D = clamp((eraMix - 1.05) / 0.85, 0, 1);
  const mecha = clamp((eraMix - 3.05) / 0.85, 0, 1);
  const w = paddle.halfW * 2;
  const px = paddle.x;
  const pz = PLAYER_Z;
  const bank = clamp(-paddle.vx * 0.012, -0.24, 0.24) * wake3D;

  // Era 1: Crisp Flat Phosphor Cream Block!
  if (wake3D < 0.08) {
    M4.trs(mScratch, px, 0.28, pz, 0, 0, 0, w, 0.55, 0.72);
    drawFn(meshes.box, mScratch, 0, [0.953, 0.937, 0.902], 1.0, 1.0, 1.0);
    return;
  }

  // Era 2+: Sleek 3D Vector-Striker Chassis
  const coreW = lerp(w, w * 0.74, mecha);
  M4.trs(mScratch, px, 0.48, pz, 0, 0, bank, coreW, 0.68, 0.88);
  drawFn(meshes.box, mScratch, 2, [0.88, 0.91, 0.95], 0.5, 0.2, 1.0);

  // Glowing Front Strike Strip (surges Solar Gold when Overdrive ready or Smashing!)
  const smashHot = clamp(paddle.smashFlash + (paddle.overdrive >= 100 ? 0.65 : 0), 0, 1);
  const stripCol = [
    lerp(0.133, 0.98, smashHot),
    lerp(0.827, 0.72, smashHot),
    lerp(0.933, 0.18, smashHot),
  ];
  M4.trs(mScratch, px, 0.50, pz - 0.44, 0, 0, bank, coreW * 0.94, 0.30, 0.16);
  drawFn(meshes.box, mScratch, 6, stripCol, 1.65 + smashHot * 1.4, 1.0, 1.0);

  // Power Smash Electromagnetic Swing Arc in front of Paddle
  if (paddle.smashWindow > 0.01) {
    const arcAlpha = clamp(paddle.smashWindow / 0.26, 0, 1);
    M4.trs(mScratch, px, 0.48, pz - 1.35, 0, Math.PI, 0, paddle.halfW * 1.18, 0.65, 1.35);
    drawFn(meshes.shieldArc, mScratch, 6, [0.98, 0.74, 0.20], 2.2, 1.0, arcAlpha * 0.82);
  }

  // Era 4+: MECHA PADDLE OVERDRIVE — Articulated Golden Thruster Wings, Cannons & Twin Guard-Blocks!
  if (mecha > 0.02) {
    const unfold = mecha;
    [-1, 1].forEach((side) => {
      const wx = px + side * (coreW * 0.5 + 0.62 * unfold);
      // Articulated Golden Wing Blade
      M4.trs(
        mScratch,
        wx,
        0.58 + 0.12 * Math.sin(t * 5.0),
        pz + 0.18,
        0.12,
        side * 0.28 * unfold,
        bank + side * 0.22 * unfold,
        1.45 * unfold,
        0.34,
        0.92
      );
      drawFn(meshes.box, mScratch, 2, [0.96, 0.69, 0.15], 0.5, 0.95, 1.0);

      // Forward Mecha Shoulder Plasma Barrel
      M4.trs(mScratch, px + side * (coreW * 0.44), 0.82, pz - 0.15, Math.PI * 0.5, 0, 0, 0.32 * unfold, 1.15 * unfold, 0.32 * unfold);
      drawFn(meshes.cyl, mScratch, 2, [0.24, 0.30, 0.38], 0.5, 0.8, 1.0);

      // Blazing Electric-Cyan Rear Jet Thruster Plume (flares with lateral speed!)
      const jetLen = (0.95 + Math.min(1.4, Math.abs(paddle.vx) * 0.06) + 0.2 * Math.sin(t * 28.0 + side)) * unfold;
      M4.trs(mScratch, wx * 0.96 + px * 0.04, 0.52, pz + 0.65 + jetLen * 0.45, -Math.PI * 0.5, 0, 0, 0.42 * unfold, jetLen, 0.42 * unfold);
      drawFn(meshes.cone, mScratch, 6, [0.133, 0.827, 0.933], 2.1, 1.0, 0.85);
    });

    // Twin Plasma Guard-Blocks hovering on flanks!
    if (paddle.guards) {
      for (const g of paddle.guards) {
        if (!g.ready) continue;
        const bob = Math.sin(t * 4.2 + g.side * 1.5) * 0.12;
        M4.trs(mScratch, g.x, 0.46 + bob, g.z, 0, 0, 0, 1.9 * unfold, 0.42, 0.42);
        drawFn(meshes.box, mScratch, 6, [0.96, 0.72, 0.18], 1.75, 1.0, 0.76 * unfold);
      }
    }
  }
}

export function drawOpponentOrBoss(drawFn, meshes, ai, boss, era, eraMix, t) {
  const wake3D = clamp((eraMix - 1.05) / 0.85, 0, 1);
  const solarBoss = clamp((eraMix - 4.05) / 0.85, 0, 1);

  // Era 1-4 (and fading out as Boss materializes): Opponent Paddle
  if (solarBoss < 0.95) {
    const w = ai.halfW * 2 * (1.0 - solarBoss * 0.85);
    if (wake3D < 0.08) {
      M4.trs(mScratch, ai.x, 0.28, AI_Z, 0, 0, 0, w, 0.55, 0.72);
      drawFn(meshes.box, mScratch, 0, [0.953, 0.937, 0.902], 1.0, 1.0, 1.0);
    } else {
      M4.trs(mScratch, ai.x, 0.48, AI_Z, 0, 0, 0, w, 0.68, 0.86);
      drawFn(meshes.box, mScratch, 2, [0.22, 0.26, 0.32], 0.5, 0.85, 1.0);

      M4.trs(mScratch, ai.x, 0.50, AI_Z + 0.44, 0, 0, 0, w * 0.92, 0.30, 0.16);
      drawFn(meshes.box, mScratch, 6, [0.94, 0.32, 0.24], 1.75, 1.0, 1.0);
    }
  }

  // Era 5: AI ARCHITECT SOLAR SINGULARITY CORE (HP: 300) + Rotating Shields!
  if (solarBoss > 0.02 && boss.hp > 0) {
    const bx = boss.x;
    const bz = boss.z;
    const by = 1.65 + Math.sin(t * 2.6) * 0.22;
    const sc = solarBoss;
    const flash = boss.hitFlash;

    // Glowing Ground Shadow Target Ring
    M4.trs(mScratch, bx, 0.06, bz, 0, t * 1.2, 0, 5.2 * sc, 1.0, 5.2 * sc);
    drawFn(meshes.ring, mScratch, 6, [0.96, 0.65, 0.15], 1.6, 1.0, 0.65 * sc);

    // Inner Blazing Singularity Core Sphere (pulses faster as HP drops!)
    const rage = 1.0 - clamp(boss.hp / boss.maxHp, 0, 1);
    const pulse = 1.0 + Math.sin(t * (6.0 + rage * 10.0)) * 0.08;
    const coreR = 2.45 * sc * pulse;
    const coreCol = flash > 0.05
      ? [1.0, 0.95, 0.78]
      : [lerp(0.96, 0.95, rage), lerp(0.68, 0.26, rage), lerp(0.15, 0.18, rage)];
    M4.trs(mScratch, bx, by, bz, t * 0.9, t * 1.4, 0, coreR, coreR, coreR);
    drawFn(meshes.sphere, mScratch, 6, coreCol, 2.0 + flash * 1.5, 1.0, 1.0);

    // Counter-Rotating Gyroscopic Armor Cages around the AI Core
    M4.trs(mScratch, bx, by, bz, t * 1.3, t * 0.8, 0.45, 3.6 * sc, 1.0, 3.6 * sc);
    drawFn(meshes.ring, mScratch, 2, [0.92, 0.72, 0.28], 0.5, 0.95, 1.0);

    M4.trs(mScratch, bx, by, bz, -t * 1.1, 0.6, t * 1.5, 4.1 * sc, 1.0, 4.1 * sc);
    drawFn(meshes.ring, mScratch, 2, [0.25, 0.32, 0.40], 0.5, 0.85, 1.0);

    // Crown & Base Monolith Spikes
    M4.trs(mScratch, bx, by + 2.1 * sc, bz, 0, t * 2.0, 0, 1.1 * sc, 1.5 * sc, 1.1 * sc);
    drawFn(meshes.cone, mScratch, 2, [0.96, 0.69, 0.15], 0.5, 0.9, 1.0);

    // 3 Rotating Segmented Energy Shields Orbiting the Core at radius boss.shieldRadius!
    for (let i = 0; i < boss.shields.length; i++) {
      const sh = boss.shields[i];
      if (sh.cooldown > 0) continue; // temporarily shattered!
      const ang = boss.shieldAngle + sh.offset;
      M4.trs(mScratch, bx, 0.95, bz, 0, ang, 0, boss.shieldRadius * sc, 1.55 * sc, boss.shieldRadius * sc);
      const shCol = sh.flash > 0.05 ? [1.0, 0.92, 0.65] : [0.133, 0.827, 0.933];
      drawFn(meshes.shieldArc, mScratch, 6, shCol, 1.75 + sh.flash * 1.6, 1.0, 0.72 * sc);
    }
  }
}

export function drawPinballAndAnomalies(drawFn, meshes, bumpers, well, splitOrbs, eraMix, t) {
  const pinballRise = clamp((eraMix - 2.05) / 0.85, 0, 1);
  if (pinballRise < 0.02) return;

  // 1. Erupting 3D Pinball Bumpers
  for (let i = 0; i < bumpers.length; i++) {
    const b = bumpers[i];
    const popScale = 1.0 + b.hitBounce * 0.32;
    const h = 1.05 * pinballRise;
    const yBase = (pinballRise - 1.0) * 1.2;

    // Metallic Bumper Pedestal
    M4.trs(mScratch, b.x, yBase + h * 0.45, b.z, 0, t * 0.8 + i, 0, b.r * 1.65 * popScale, h, b.r * 1.65 * popScale);
    drawFn(meshes.cyl, mScratch, 2, [0.20, 0.27, 0.35], 0.5, 0.85, 1.0);

    // Glowing Solar Gold / Cyan Crown Cap
    const hot = b.hitBounce;
    const capCol = [
      lerp(0.96, 1.0, hot),
      lerp(0.69, 0.94, hot),
      lerp(0.15, 0.62, hot),
    ];
    M4.trs(mScratch, b.x, yBase + h + 0.08, b.z, 0, 0, 0, b.r * 2.05 * popScale, 0.24, b.r * 2.05 * popScale);
    drawFn(meshes.cyl, mScratch, 6, capCol, 1.75 + hot * 1.8, 1.0, 1.0);

    // Floor Halo Ring
    M4.trs(mScratch, b.x, 0.05, b.z, 0, -t * 1.5, 0, b.r * 2.6 * popScale, 1.0, b.r * 2.6 * popScale);
    drawFn(meshes.ring, mScratch, 6, [0.133, 0.827, 0.933], 1.45 + hot * 1.2, 1.0, 0.68 * pinballRise);
  }

  // 2. Swirling Mid-Court Golden Gravity Well
  if (well.active) {
    const ws = pinballRise;
    M4.trs(mScratch, well.x, 0.18 + Math.sin(t * 4.0) * 0.06, well.z, 0, 0, 0, 0.85 * ws, 0.85 * ws, 0.85 * ws);
    drawFn(meshes.sphere, mScratch, 6, [1.0, 0.78, 0.24], 2.2, 1.0, 0.92 * ws);

    for (let rIdx = 0; rIdx < 3; rIdx++) {
      const rad = (2.1 + rIdx * 1.45) * ws;
      const dir = rIdx % 2 === 0 ? 1 : -1;
      M4.trs(mScratch, well.x, 0.06 + rIdx * 0.03, well.z, 0.08 * Math.sin(t * 2 + rIdx), dir * t * (2.4 - rIdx * 0.45), 0, rad, 1.0, rad);
      const rCol = rIdx === 1 ? [0.133, 0.827, 0.933] : [0.96, 0.69, 0.145];
      drawFn(meshes.ring, mScratch, 6, rCol, 1.65, 1.0, (0.68 - rIdx * 0.14) * ws);
    }
  }

  // 3. Emerald Split Orbs (Multiball Frenzy Triggers!)
  for (const orb of splitOrbs) {
    if (!orb.alive) continue;
    const bob = 0.62 + Math.sin(t * 4.5 + orb.phase) * 0.18;
    const emerald = [0.16, 0.92, 0.56];
    M4.trs(mScratch, orb.x, bob, orb.z, t * 2.0, t * 2.6, 0, orb.r * 1.85, orb.r * 1.85, orb.r * 1.85);
    drawFn(meshes.sphere, mScratch, 6, emerald, 2.0, 1.0, 0.95);

    M4.trs(mScratch, orb.x, bob, orb.z, 0.65, -t * 3.2, 0.35, orb.r * 3.1, 1.0, orb.r * 3.1);
    drawFn(meshes.ring, mScratch, 6, [0.52, 0.98, 0.78], 1.75, 1.0, 0.78);
  }
}

export function drawBalls(drawFn, meshes, balls, eraMix, t) {
  const isRetro = eraMix < 1.35;
  for (const b of balls) {
    if (isRetro) {
      // Classic 1972 Crisp Square Pixel Ball!
      M4.trs(mScratch, b.x, 0.28, b.z, 0, 0, 0, b.r * 2.1, 0.52, b.r * 2.1);
      drawFn(meshes.box, mScratch, 0, [0.953, 0.937, 0.902], 1.0, 1.0, 1.0);
    } else {
      const comet = b.comet ? 1.0 : 0.0;
      const curveAmt = clamp(Math.abs(b.spin) * 0.5, 0, 1);
      const col = b.comet
        ? [1.0, 0.62, 0.16]
        : curveAmt > 0.25
          ? [0.18, 0.90, 0.98]
          : [0.98, 0.94, 0.84];
      const sc = b.r * (b.comet ? 2.45 : 2.1);
      M4.trs(mScratch, b.x, b.y, b.z, t * 6.0, t * 8.0, 0, sc, sc, sc);
      drawFn(meshes.sphere, mScratch, 6, col, 1.9 + comet * 1.2, 1.0, 1.0);

      // Orbiting Spin / Comet Halo around active ball
      if (b.comet || curveAmt > 0.2) {
        const ringCol = b.comet ? [0.96, 0.34, 0.18] : [0.133, 0.827, 0.933];
        M4.trs(mScratch, b.x, b.y, b.z, 0.35, t * 12.0, -0.35, sc * 1.85, 1.0, sc * 1.85);
        drawFn(meshes.ring, mScratch, 6, ringCol, 2.0, 1.0, 0.78);
      }
    }
  }
}
