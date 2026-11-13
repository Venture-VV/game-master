// 100% Procedural WebGL2 Geometry for What the Water Keeps:
// Sculpted Clinker Wooden Skiff, Traveler in Flowing Scarf, Dual Animated Oars & 8 Dream-Water Realms (880m)

import {
  M4,
  REALMS,
  riverCenterX,
  waterWaveHeight,
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

export function createWaterPrimitives(gl) {
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

  // 2. Tapered Cylinder / Cone / Faceted Crystal Prism
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
  const cone = makeCyl(0.03, 0.55, 12);
  const prism = makeCyl(0.10, 0.58, 6);
  const octTower = makeCyl(0.38, 0.52, 8);

  // 3. Smooth UV Sphere
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

  // 4. Scalloped Bell Dome (for 3D Bioluminescent Jellyfish & Lotus/Lantern Shades)
  const dPos = [], dNorm = [], dUV = [], dTint = [], dIdx = [];
  const dLat = 10, dLon = 20;
  for (let y = 0; y <= dLat; y++) {
    const v = y / dLat;
    const phi = v * Math.PI * 0.58;
    for (let x = 0; x <= dLon; x++) {
      const u = x / dLon;
      const th = u * Math.PI * 2;
      const scallop = 1.0 + Math.sin(u * Math.PI * 16.0) * 0.045 * v;
      const r = Math.sin(phi) * 0.5 * scallop;
      const py = Math.cos(phi) * 0.5;
      const sx = -Math.cos(th), sz = Math.sin(th);
      dPos.push(sx * r, py, sz * r);
      dNorm.push(sx * Math.sin(phi), Math.cos(phi), sz * Math.sin(phi));
      dUV.push(u, v);
      dTint.push(1, 1, 1);
    }
  }
  for (let y = 0; y < dLat; y++) {
    for (let x = 0; x < dLon; x++) {
      const a = y * (dLon + 1) + x;
      const b = a + dLon + 1;
      dIdx.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  const dome = uploadMesh(gl, dPos, dNorm, dUV, dTint, dIdx);

  // 5. Monet Notched Water-Lily Pad (circular disc with classic V-cleft!)
  const lpPos = [0, 0.02, 0], lpNorm = [0, 1, 0], lpUV = [0.5, 0.5], lpTint = [0.85, 1.0, 0.88], lpIdx = [];
  const lpSegs = 22;
  const cleftSpan = 0.36; // radians left open as lily cleft
  for (let i = 0; i <= lpSegs; i++) {
    const u = i / lpSegs;
    const a = cleftSpan * 0.5 + u * (Math.PI * 2 - cleftSpan);
    const rimWave = 0.48 + Math.sin(u * Math.PI * 6.0) * 0.018;
    lpPos.push(Math.cos(a) * rimWave, 0.01 + Math.sin(u * Math.PI) * 0.015, Math.sin(a) * rimWave);
    lpNorm.push(0, 1, 0);
    lpUV.push(0.5 + Math.cos(a) * 0.5, 0.5 + Math.sin(a) * 0.5);
    lpTint.push(1.0, 0.96, 0.90);
  }
  for (let i = 1; i <= lpSegs; i++) {
    lpIdx.push(0, i + 1, i);
  }
  const lilyPad = uploadMesh(gl, lpPos, lpNorm, lpUV, lpTint, lpIdx);

  // 6. Extruded 3D Semicircular Stone/Timber Arch (for Canal Bridges, Gothic Cathedral Vaults & Rose Windows)
  const arPos = [], arNorm = [], arUV = [], arTint = [], arIdx = [];
  const arcSteps = 18;
  const rOuter = 0.50, rInner = 0.39, halfDepth = 0.16;
  for (let i = 0; i <= arcSteps; i++) {
    const u = i / arcSteps;
    const a = u * Math.PI; // 0 to PI over +Y
    const ca = Math.cos(a), sa = Math.sin(a);
    // 4 vertices per cross-section: outer-front, inner-front, inner-back, outer-back
    const pts = [
      [ca * rOuter, sa * rOuter, halfDepth, ca, sa, 0.35],
      [ca * rInner, sa * rInner, halfDepth, -ca, -sa, 0.35],
      [ca * rInner, sa * rInner, -halfDepth, -ca, -sa, -0.35],
      [ca * rOuter, sa * rOuter, -halfDepth, ca, sa, -0.35],
    ];
    for (let k = 0; k < 4; k++) {
      const p = pts[k];
      const nl = Math.hypot(p[3], p[4], p[5]) || 1;
      arPos.push(p[0], p[1], p[2]);
      arNorm.push(p[3] / nl, p[4] / nl, p[5] / nl);
      arUV.push(u * 3.0, k / 3);
      arTint.push(1, 1, 1);
    }
  }
  for (let i = 0; i < arcSteps; i++) {
    const b = i * 4;
    const n = b + 4;
    for (let k = 0; k < 4; k++) {
      const k2 = (k + 1) % 4;
      arIdx.push(b + k, n + k, n + k2, b + k, n + k2, b + k2);
    }
  }
  const arch = uploadMesh(gl, arPos, arNorm, arUV, arTint, arIdx);

  // 7. Handcrafted Double-Ended Wooden Clinker Skiff Hull (hollow interior + curved sheer + pointed bow/stern!)
  const hPos = [], hNorm = [], hUV = [], hTint = [], hIdx = [];
  const zStations = 14; // z from -2.35 (bow) to +2.25 (stern)
  const profPts = 9;    // cross-section from port gunwale -> interior -> keel -> exterior -> starboard
  // Build outer + inner shell cleanly via symmetric U-rib stations
  for (let iz = 0; iz <= zStations; iz++) {
    const v = iz / zStations; // 0 = bow (-Z), 1 = stern (+Z)
    const z = lerp(-2.38, 2.22, v);
    // Graceful pointed bow & tapered stern width envelope
    const beamEnv = Math.pow(Math.sin(clamp(v, 0.001, 0.999) * Math.PI), 0.68);
    const halfBeam = 0.76 * beamEnv + 0.025;
    // Classic upward sheer at bow & stern
    const sheerY = 0.42 + Math.pow(Math.abs(v - 0.52) * 2.0, 2.1) * 0.28;
    const keelY = -0.22 + Math.pow(Math.abs(v - 0.5) * 2.0, 2.6) * 0.16;

    for (let ip = 0; ip < profPts; ip++) {
      // s goes -1 (port gunwale) -> 0 (keel) -> +1 (starboard gunwale)
      const s = (ip / (profPts - 1)) * 2 - 1;
      const absS = Math.abs(s);
      const px = Math.sign(s) * Math.pow(absS, 0.78) * halfBeam;
      const py = lerp(keelY, sheerY, absS * absS);
      const nx = s * 0.85;
      const ny = (absS > 0.85 ? 0.55 : -0.45);
      const nl = Math.hypot(nx, ny, 0.1) || 1;
      hPos.push(px, py, z);
      hNorm.push(nx / nl, ny / nl, (v - 0.5) * 0.25);
      hUV.push(ip / (profPts - 1), v * 4.0);
      // Darker oiled cedar near keel, warm honey-teak along gunwales
      const woodShade = lerp(0.72, 1.08, absS);
      hTint.push(woodShade, woodShade * 0.94, woodShade * 0.86);
    }
  }
  for (let iz = 0; iz < zStations; iz++) {
    for (let ip = 0; ip < profPts - 1; ip++) {
      const a = iz * profPts + ip;
      const b = a + profPts;
      // Double-sided indices so both exterior clinker hull AND concave interior planks render solidly!
      hIdx.push(a, b, a + 1, b, b + 1, a + 1);
      hIdx.push(a, a + 1, b, b, a + 1, b + 1);
    }
  }
  const boatHull = uploadMesh(gl, hPos, hNorm, hUV, hTint, hIdx);

  // 8. Flat Halo Ring
  const rPos = [], rNorm = [], rUV = [], rTint = [], rIdx = [];
  const rSegs = 28;
  for (let i = 0; i <= rSegs; i++) {
    const a = (i / rSegs) * Math.PI * 2;
    const ca = Math.cos(a), sa = Math.sin(a);
    rPos.push(ca * 0.42, 0, sa * 0.42, ca * 0.5, 0, sa * 0.5);
    rNorm.push(0, 1, 0, 0, 1, 0);
    rUV.push(i / rSegs, 0, i / rSegs, 1);
    rTint.push(1, 1, 1, 1, 1, 1);
  }
  for (let i = 0; i < rSegs; i++) {
    const k = i * 2;
    rIdx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2);
  }
  const ring = uploadMesh(gl, rPos, rNorm, rUV, rTint, rIdx);

  // 9. Vast Seamless Water Grid (136 x 136 vertices spanning 272m x 272m, 2.0m cell step)
  const wN = 136;
  const wSpan = 272;
  const wPos = [], wNorm = [], wUV = [], wTint = [], wIdx = [];
  for (let iz = 0; iz <= wN; iz++) {
    const z = (iz / wN - 0.5) * wSpan;
    for (let ix = 0; ix <= wN; ix++) {
      const x = (ix / wN - 0.5) * wSpan;
      wPos.push(x, 0, z);
      wNorm.push(0, 1, 0);
      wUV.push(ix / wN, iz / wN);
      wTint.push(1, 1, 1);
    }
  }
  for (let iz = 0; iz < wN; iz++) {
    for (let ix = 0; ix < wN; ix++) {
      const a = iz * (wN + 1) + ix;
      const b = a + wN + 1;
      wIdx.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  const waterGrid = uploadMesh(gl, wPos, wNorm, wUV, wTint, wIdx);

  return {
    box,
    cyl,
    cone,
    prism,
    octTower,
    sphere,
    dome,
    lilyPad,
    arch,
    boatHull,
    ring,
    waterGrid,
    waterCellStep: wSpan / wN,
  };
}

export function createWaterParticleSystem(gl, maxParticles = 640) {
  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);

  const qPos = new Float32Array([-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0]);
  const qUV = new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]);
  const qIdx = new Uint16Array([0, 1, 2, 0, 2, 3]);

  const bPos = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, bPos);
  gl.bufferData(gl.ARRAY_BUFFER, qPos, gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);

  const bUV = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, bUV);
  gl.bufferData(gl.ARRAY_BUFFER, qUV, gl.STATIC_DRAW);
  gl.enableVertexAttribArray(1);
  gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 0, 0);

  const ib = gl.createBuffer();
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, qIdx, gl.STATIC_DRAW);

  // 12 floats per instance: iPosScale (4), iRotKind (4), iColor (4)
  const data = new Float32Array(maxParticles * 12);
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

// Poetic Memory Pearl Titles & Verses (16 Memories = 2 per Dream-Water Realm)
const MEMORY_LORE = [
  ['记忆 · 露华初醒', '晨雾里第一瓣睡莲舒展，替水波收起昨夜的星光。'],
  ['记忆 · 垂柳风笺', '柳丝轻点碧水，画出一圈圈无人拆阅的温柔回信。'],
  ['记忆 · 朱门倒影', '千重鸟居立于镜海，潮水记得每一声虔诚的祈愿。'],
  ['记忆 · 石灯微火', '苔痕斑驳的石灯里，仍亮着百年前旅人留下的暖意。'],
  ['记忆 · 暮桥晚笛', '拱桥下的琥珀水波，把黄昏拉成一首悠长的慢板。'],
  ['记忆 · 万点河灯', '每一盏漂流的纸灯，都是一句被水轻轻托住的思念。'],
  ['记忆 · 幽海星脉', '深海并不黑暗，成群水母正替沉睡的星辰呼吸。'],
  ['记忆 · 浮光水母', '当风铃轻响，透明的伞盖便在海底绽开翡翠色的涟漪。'],
  ['记忆 · 沉钟回响', '海水漫过古老玫瑰窗，潮汐仍在替钟楼敲响晚祷。'],
  ['记忆 · 断拱月影', '半沉的石拱之间，回荡着旧日唱诗班澄澈的余音。'],
  ['记忆 · 霜枫题诗', '秋峡飘落的一片红叶，是山峦寄往远海的书签。'],
  ['记忆 · 赤壁流金', '夕照穿过层叠枫林，将整条峡湾染作流动的琥珀。'],
  ['记忆 · 冰镜极光', '千年浮冰如水晶雕琢，在海面捧住垂落的翡翠极光。'],
  ['记忆 · 星河同舟', '水天合一的镜海里，小舟仿佛正划行在星云深处。'],
  ['记忆 · 归航金帆', '穿过八重梦境的水波，远方灯塔终于在金色地平线升起。'],
  ['记忆 · 水之所存', '凡被水温柔铭记的微光，终将在彼岸升作不灭的星座。'],
];

export function buildDreamWaterWorld(meshes) {
  const rng = mulberry32(20260520);
  const staticDraws = [];
  const obstacles = [];

  const pushStatic = (mesh, tx, ty, tz, rx, ry, rz, sx, sy, sz, mat, color, p0 = 0.6, p1 = 1.0, p2 = 1.0) => {
    const m = M4.create();
    M4.trs(m, tx, ty, tz, rx, ry, rz, sx, sy, sz);
    staticDraws.push({ mesh, m, mat, color, params: [p0, p1, p2], z: tz });
  };

  const addObstacle = (x, z, r) => {
    obstacles.push({ x, z, r });
  };

  // =========================================================================
  // REALM 01 (z: +16 .. -110): 晨雾睡莲 · WATER-LILY DAWN
  // =========================================================================
  const willowIslets = [
    [-16, 4, 1.1], [17, -14, 1.15], [-18, -32, 1.25], [16, -50, 1.05],
    [-16, -70, 1.2], [18, -88, 1.3], [-19, -102, 1.1],
  ];
  for (const [ox, z, sc] of willowIslets) {
    const cx = riverCenterX(z) + ox;
    // Soft mossy Monet island mound
    pushStatic(meshes.sphere, cx, -0.35, z, 0, rng() * 6.28, 0, 11.5 * sc, 3.2 * sc, 9.8 * sc, 1, [0.24, 0.48, 0.34]);
    pushStatic(meshes.sphere, cx + (ox > 0 ? -2.2 : 2.2), -0.45, z + 2.4, 0, 0, 0, 7.2 * sc, 2.1 * sc, 6.4 * sc, 1, [0.30, 0.54, 0.38]);
    addObstacle(cx, z, 5.6 * sc);

    // Leaning Weeping Willow Trunk + Cascading Jade Curtains
    const lean = ox > 0 ? -0.22 : 0.22;
    pushStatic(meshes.cyl, cx, 2.6 * sc, z, 0.06, 0, lean, 0.68 * sc, 4.8 * sc, 0.68 * sc, 2, [0.36, 0.27, 0.19]);
    pushStatic(meshes.sphere, cx - lean * 4.2, 5.2 * sc, z, 0, 0, 0, 6.2 * sc, 3.4 * sc, 6.2 * sc, 1, [0.36, 0.64, 0.44]);
    for (let f = 0; f < 7; f++) {
      const a = (f / 7) * Math.PI * 2 + z * 0.1;
      const fx = cx - lean * 4.0 + Math.cos(a) * 2.4 * sc;
      const fz = z + Math.sin(a) * 2.4 * sc;
      pushStatic(meshes.cyl, fx, 2.7 * sc, fz, 0, a, 0, 0.20, 4.2 * sc, 0.20, 1, [0.44, 0.74, 0.50]);
    }
  }

  // Floating Lily Pads & Blooming Lotus Blossoms (bobbing dynamically in renderScene!)
  const floatingLilies = [];
  for (let i = 0; i < 48; i++) {
    const z = 8 - rng() * 116;
    const rc = riverCenterX(z);
    // Keep a gentle clear central lane while dotting edges and soft clusters
    const side = rng() < 0.5 ? -1 : 1;
    const offset = side * (3.2 + rng() * 12.5);
    floatingLilies.push({
      x: rc + offset,
      z,
      rot: rng() * Math.PI * 2,
      scale: 0.95 + rng() * 1.15,
      hasLotus: i % 2 === 0,
      lotusWarm: i % 4 === 0, // Coral-peach vs ivory-gold blossom
      phase: rng() * 6.28,
    });
  }

  // =========================================================================
  // REALM 02 (z: -110 .. -220): 水上朱门 · SUNKEN TORII LAGOON
  // =========================================================================
  const toriiZs = [-122, -144, -166, -188, -208];
  toriiZs.forEach((z, idx) => {
    const cx = riverCenterX(z);
    const halfSpan = 7.4 + (idx % 2) * 0.8;
    const h = 10.6 + (idx === 2 ? 1.8 : 0);
    const vermilion = [0.88, 0.24, 0.15];
    const darkStone = [0.20, 0.24, 0.25];

    // Submerged Stone Pedestals (Nemaki) + Twin Vermilion Pillars (Hashira)
    for (const s of [-1, 1]) {
      const px = cx + s * halfSpan;
      pushStatic(meshes.cyl, px, 0.4, z, 0, 0, 0, 1.45, 2.6, 1.45, 3, darkStone);
      pushStatic(meshes.cyl, px, h * 0.5, z, 0, 0, s * -0.025, 0.96, h, 0.96, 3, vermilion);
      addObstacle(px, z, 1.25);
    }
    // Lower Tie-Beam (Nuki) + Center Strut (Gakuzuka)
    pushStatic(meshes.box, cx, h - 2.1, z, 0, 0, 0, halfSpan * 2 + 3.4, 0.62, 0.65, 3, vermilion);
    pushStatic(meshes.box, cx, h - 1.0, z, 0, 0, 0, 1.15, 1.85, 0.58, 3, [0.16, 0.18, 0.20]);
    pushStatic(meshes.box, cx, h - 1.0, z + 0.32, 0, 0, 0, 0.72, 1.25, 0.12, 6, [1.0, 0.82, 0.40], 1.5, 1.0, 1.0);

    // Top Curved Lintel (Kasagi + Dark Cap Shimagi + Upturned Wing Tips)
    pushStatic(meshes.box, cx, h + 0.05, z, 0, 0, 0, halfSpan * 2 + 4.8, 0.72, 1.05, 3, vermilion);
    pushStatic(meshes.box, cx, h + 0.52, z, 0, 0, 0, halfSpan * 2 + 5.2, 0.34, 1.22, 3, darkStone);
    for (const s of [-1, 1]) {
      pushStatic(meshes.box, cx + s * (halfSpan + 2.9), h + 0.52, z, 0, 0, s * 0.18, 2.6, 0.58, 1.12, 3, vermilion);
      pushStatic(meshes.box, cx + s * (halfSpan + 3.0), h + 0.88, z, 0, 0, s * 0.18, 2.8, 0.28, 1.26, 3, darkStone);
    }

    // Flanking Sunken Stone Tōrō Lanterns in the Lagoon
    for (const s of [-1, 1]) {
      const lx = cx + s * (halfSpan + 5.6 + (idx % 2) * 1.8);
      const lz = z + 9.5;
      pushStatic(meshes.cyl, lx, 0.9, lz, 0, 0, 0, 0.85, 2.4, 0.85, 3, [0.52, 0.56, 0.54]);
      pushStatic(meshes.box, lx, 2.15, lz, 0, 0, 0, 1.25, 0.32, 1.25, 3, [0.56, 0.60, 0.58]);
      pushStatic(meshes.box, lx, 2.68, lz, 0, 0, 0, 0.78, 0.78, 0.78, 6, [1.0, 0.78, 0.34], 1.85, 1.0, 1.0);
      pushStatic(meshes.cone, lx, 3.38, lz, 0, Math.PI * 0.25, 0, 1.65, 0.85, 1.65, 3, [0.44, 0.48, 0.47]);
      addObstacle(lx, lz, 1.0);
    }
  });

  // =========================================================================
  // REALM 03 (z: -220 .. -330): 琥珀河灯 · FLOATING LANTERN DUSK
  // =========================================================================
  const bridgeZs = [-238, -276, -314];
  bridgeZs.forEach((z) => {
    const cx = riverCenterX(z);
    // Graceful High Arched Canal Bridge (clear height ~8.2m so skiff glides smoothly underneath!)
    pushStatic(meshes.arch, cx, 0.2, z, 0, 0, 0, 21.0, 16.5, 4.6, 2, [0.46, 0.29, 0.18]);
    pushStatic(meshes.arch, cx, 0.75, z, 0, 0, 0, 21.4, 16.8, 0.45, 2, [0.64, 0.40, 0.23]);
    // Stone Bridge Abutments + Stilted Lantern Tea-Pavilions on both banks
    for (const s of [-1, 1]) {
      const bx = cx + s * 12.2;
      pushStatic(meshes.box, bx, 1.8, z, 0, 0, 0, 5.2, 4.8, 5.8, 3, [0.38, 0.35, 0.33]);
      addObstacle(bx, z, 3.2);

      // Stilted Wooden Dusk Pavilion with glowing warm windows
      const px = cx + s * 17.5;
      const pz = z - 14.0;
      pushStatic(meshes.box, px, 2.8, pz, 0, 0, 0, 6.2, 4.2, 6.2, 2, [0.38, 0.24, 0.16]);
      pushStatic(meshes.box, px - s * 2.9, 3.0, pz, 0, 0, 0, 0.55, 2.2, 3.8, 6, [1.0, 0.74, 0.32], 1.75, 1.0, 1.0);
      pushStatic(meshes.cone, px, 5.9, pz, 0, 0.78, 0, 8.6, 2.4, 8.6, 3, [0.24, 0.28, 0.30]);
      // Hanging Bridge Paper Lanterns
      pushStatic(meshes.sphere, cx + s * 4.8, 6.8, z + 1.8, 0, 0, 0, 0.72, 0.92, 0.72, 6, [1.0, 0.76, 0.30], 2.1, 1.0, 1.0);
    }
  });

  // 58 Drifting Glowing Paper River Lanterns across Realm 03 (and trailing gently into 02/04)
  const floatingLanterns = [];
  for (let i = 0; i < 58; i++) {
    const z = -214 - rng() * 120;
    const cx = riverCenterX(z);
    const ox = (rng() - 0.5) * 24.0;
    floatingLanterns.push({
      baseX: cx + ox,
      baseZ: z,
      x: cx + ox,
      z,
      rot: rng() * 6.28,
      phase: rng() * 6.28,
      scale: 0.78 + rng() * 0.45,
      flare: 0,
    });
  }

  // =========================================================================
  // REALM 04 (z: -330 .. -440): 幽海星母 · BIOLUMINESCENT JELLYFISH
  // =========================================================================
  for (let i = 0; i < 10; i++) {
    const z = -336 - i * 10.5;
    const s = i % 2 === 0 ? -1 : 1;
    const sx = riverCenterX(z) + s * (15.5 + (i % 3) * 2.8);
    const h = 7.0 + rng() * 7.5;
    pushStatic(meshes.prism, sx, h * 0.35, z, (rng() - 0.5) * 0.18, rng() * 6.28, (rng() - 0.5) * 0.18, 5.2, h, 4.8, 3, [0.10, 0.22, 0.26]);
    // Bioluminescent coral veins on sea stacks
    pushStatic(meshes.sphere, sx - s * 1.8, 0.65, z + 1.2, 0, 0, 0, 1.4, 0.7, 1.4, 6, [0.20, 0.95, 0.84], 1.7, 1.0, 1.0);
    addObstacle(sx, z, 3.0);
  }

  // 28 Pulsing 3D Bioluminescent Jellyfish (both beneath/at surface & floating ethereally in the misty night air!)
  const jellyfish = [];
  for (let i = 0; i < 28; i++) {
    const z = -332 - rng() * 108;
    const cx = riverCenterX(z);
    const airborne = i % 3 !== 0; // 2/3 hover magically above the water surface, 1/3 glow right at/beneath the surface!
    const ox = airborne ? (rng() - 0.5) * 24.0 : (rng() < 0.5 ? -1 : 1) * (3.5 + rng() * 10.5);
    jellyfish.push({
      baseX: cx + ox,
      baseY: airborne ? 2.0 + rng() * 6.2 : -0.25 + rng() * 0.55,
      baseZ: z,
      x: cx + ox,
      y: 2.0,
      z,
      scale: 1.05 + rng() * 1.35,
      goldTint: i % 4 === 0, // Golden starlight jellyfish vs Seafoam-Cyan jellyfish!
      phase: rng() * 6.28,
      flare: 0,
    });
  }

  // =========================================================================
  // REALM 05 (z: -440 .. -550): 溺水钟楼 · DROWNED CATHEDRAL
  // =========================================================================
  const stonePale = [0.58, 0.62, 0.60];
  const stoneDark = [0.36, 0.42, 0.42];
  const naveZs = [-452, -470, -488, -512, -532];
  naveZs.forEach((z, idx) => {
    const cx = riverCenterX(z);
    const span = 9.2;
    for (const s of [-1, 1]) {
      const px = cx + s * span;
      const colH = 11.5 + (idx % 2) * 2.5;
      // Clustered Gothic Limestone Pier + Flying Buttress
      pushStatic(meshes.cyl, px, colH * 0.42, z, 0, 0, 0, 1.65, colH, 1.65, 3, stonePale);
      pushStatic(meshes.box, px + s * 3.2, 4.2, z, 0, 0, s * 0.42, 5.6, 0.85, 1.15, 3, stoneDark);
      pushStatic(meshes.cyl, px + s * 5.6, 2.8, z, 0, 0, 0, 1.45, 7.2, 1.45, 3, stoneDark);
      addObstacle(px, z, 1.5);
    }
    // Soaring Ribbed Cathedral Vault Arch spanning high over the nave channel (intact on 3, dramatically broken on 2)
    if (idx !== 1 && idx !== 4) {
      pushStatic(meshes.arch, cx, 7.8, z, 0, 0, 0, span * 2 + 1.2, 12.5, 1.8, 3, stonePale);
    }
  });

  // Colossal Half-Submerged Gothic Rose Window at z = -498 (Player rows right through the luminous stone circle!)
  {
    const rz = -498;
    const rcx = riverCenterX(rz);
    pushStatic(meshes.arch, rcx, 0.5, rz, 0, 0, 0, 21.5, 21.5, 2.2, 3, stonePale);
    for (let k = 1; k <= 5; k++) {
      const a = (k / 6) * Math.PI;
      const mx = rcx + Math.cos(a) * 8.6;
      const my = 0.5 + Math.sin(a) * 8.6;
      pushStatic(meshes.sphere, mx, my, rz, 0, 0, 0, 1.25, 1.25, 0.8, 6, [0.96, 0.84, 0.46], 1.65, 1.0, 1.0);
    }
  }

  // Two Towering Drowned Bell Spires with Hanging Bronze Sea-Bells!
  const cathedralBells = [];
  [[-13.5, -476], [13.8, -524]].forEach(([ox, bz]) => {
    const bx = riverCenterX(bz) + ox;
    pushStatic(meshes.octTower, bx, 7.5, bz, 0, 0.39, 0, 5.2, 16.5, 5.2, 3, stonePale);
    // Open belfry pillars + steep spire roof
    for (const sx of [-1.4, 1.4]) {
      for (const sz of [-1.4, 1.4]) {
        pushStatic(meshes.cyl, bx + sx, 17.5, bz + sz, 0, 0, 0, 0.55, 4.2, 0.55, 3, stoneDark);
      }
    }
    pushStatic(meshes.cone, bx, 22.2, bz, 0, 0.39, 0, 5.8, 6.2, 5.8, 3, [0.22, 0.36, 0.38]);
    addObstacle(bx, bz, 3.2);
    cathedralBells.push({ x: bx, y: 17.4, z: bz, swing: 0 });
  });

  // =========================================================================
  // REALM 06 (z: -550 .. -660): 绯叶秋峡 · CRIMSON MAPLE FJORD
  // =========================================================================
  for (let i = 0; i < 14; i++) {
    const z = -554 - i * 7.8;
    const cx = riverCenterX(z);
    for (const s of [-1, 1]) {
      const wallX = cx + s * (14.2 + (i % 3) * 1.8);
      const wallH = 16.0 + ((i * 5) % 11);
      // Terraced warm ochre-slate canyon cliffs
      pushStatic(meshes.prism, wallX, wallH * 0.42, z, 0, i * 1.1, s * -0.06, 7.8, wallH, 8.2, 3, [0.46, 0.31, 0.22]);
      pushStatic(meshes.prism, wallX + s * 4.5, wallH * 0.62, z - 2.5, 0, i * 0.7, 0, 9.2, wallH * 1.25, 9.2, 3, [0.38, 0.25, 0.19]);
      addObstacle(wallX, z, 4.2);

      // Cantilevered Crimson & Golden-Amber Maple Trees leaning out over the fjord!
      if (i % 2 === (s > 0 ? 0 : 1)) {
        const tx = cx + s * 11.2;
        const mapleCrimson = i % 3 === 0 ? [0.92, 0.54, 0.18] : [0.86, 0.24, 0.16];
        pushStatic(meshes.cyl, tx + s * 1.4, 4.2, z, 0, 0, s * 0.48, 0.52, 4.8, 0.52, 2, [0.30, 0.20, 0.15]);
        pushStatic(meshes.sphere, tx - s * 0.6, 6.2, z, 0, 0, 0, 5.6, 2.4, 5.2, 4, mapleCrimson);
        pushStatic(meshes.sphere, tx - s * 2.4, 5.5, z + 1.4, 0, 0, 0, 4.0, 1.8, 3.8, 4, [0.96, 0.64, 0.20]);
      }
    }
  }

  // Drifting Autumn Maple Leaf Rafts on the Fjord Water
  const mapleClusters = [];
  for (let i = 0; i < 36; i++) {
    const z = -552 - rng() * 106;
    const cx = riverCenterX(z);
    mapleClusters.push({
      x: cx + (rng() - 0.5) * 19.0,
      z,
      rot: rng() * 6.28,
      scale: 0.55 + rng() * 0.55,
      gold: i % 3 === 0,
    });
  }

  // =========================================================================
  // REALM 07 (z: -660 .. -770): 极光镜海 · GLACIAL AURORA MIRROR
  // =========================================================================
  for (let i = 0; i < 18; i++) {
    const z = -665 - i * 5.8;
    const cx = riverCenterX(z);
    const s = i % 2 === 0 ? -1 : 1;
    const ix = cx + s * (11.5 + (i % 4) * 2.8);
    const ih = 9.5 + (i % 5) * 3.4;
    const iceTint = i % 2 === 0 ? [0.46, 0.88, 0.90] : [0.34, 0.78, 0.82];
    pushStatic(meshes.prism, ix, ih * 0.36, z, (rng() - 0.5) * 0.22, rng() * 6.28, s * -0.12, 6.2, ih, 5.8, 4, iceTint);
    pushStatic(meshes.cone, ix - s * 2.4, ih * 0.22, z + 2.1, 0.1, i, 0, 4.2, ih * 0.58, 4.2, 4, [0.62, 0.95, 0.94]);
    addObstacle(ix, z, 3.4);
  }
  // Crystalline Glacial Ice Arch spanning the Aurora Sea at z = -716!
  {
    const az = -716;
    const acx = riverCenterX(az);
    pushStatic(meshes.arch, acx, 0.4, az, 0, 0, 0, 23.0, 19.5, 3.2, 4, [0.54, 0.92, 0.94]);
  }

  // =========================================================================
  // REALM 08 (z: -770 .. -895): 彼岸灯塔 · GOLDEN HORIZON SANCTUARY
  // =========================================================================
  // Twin Welcoming Golden Harbor Beacons at z = -790
  for (const s of [-1, 1]) {
    const gx = s * 10.8;
    const gz = -790;
    pushStatic(meshes.octTower, gx, 4.2, gz, 0, 0, 0, 2.8, 9.5, 2.8, 3, [0.86, 0.82, 0.72]);
    pushStatic(meshes.sphere, gx, 9.5, gz, 0, 0, 0, 1.5, 1.5, 1.5, 6, [1.0, 0.84, 0.40], 2.1, 1.0, 1.0);
    addObstacle(gx, gz, 2.0);
  }

  // Monumental Golden Horizon Sanctuary Isle & Lighthouse at z = -858 (with Timber Landing Pier at z = -840)
  const sanctZ = -858;
  pushStatic(meshes.sphere, 0, -0.4, sanctZ, 0, 0, 0, 32.0, 6.5, 26.0, 1, [0.42, 0.56, 0.42]);
  pushStatic(meshes.octTower, 0, 2.2, sanctZ, 0, 0.39, 0, 14.0, 3.6, 14.0, 3, [0.84, 0.80, 0.70]);
  // Timber Arrival Pier jutting toward +Z so skiff glides right up to the Sanctuary!
  pushStatic(meshes.box, 0, 0.55, -840, 0, 0, 0, 3.6, 0.42, 14.0, 2, [0.52, 0.35, 0.22]);
  for (const pz of [-834, -839, -844]) {
    for (const px of [-1.6, 1.6]) {
      pushStatic(meshes.cyl, px, -0.1, pz, 0, 0, 0, 0.32, 2.2, 0.32, 2, [0.38, 0.25, 0.16]);
    }
  }
  // Soaring Ivory & Brass Lighthouse Tower (28m tall)
  pushStatic(meshes.octTower, 0, 13.5, sanctZ, 0, 0.39, 0, 6.4, 21.0, 6.4, 3, [0.94, 0.90, 0.80]);
  pushStatic(meshes.cyl, 0, 24.2, sanctZ, 0, 0, 0, 5.6, 0.75, 5.6, 2, [0.76, 0.56, 0.26]);
  // Glowing Golden Fresnel Lantern Heart + Conical Brass Dome
  pushStatic(meshes.cyl, 0, 26.2, sanctZ, 0, 0, 0, 3.6, 3.4, 3.6, 6, [1.0, 0.88, 0.46], 2.5, 1.0, 1.0);
  pushStatic(meshes.cone, 0, 29.2, sanctZ, 0, 0, 0, 5.2, 3.2, 5.2, 2, [0.82, 0.60, 0.26]);
  // Celestial Sanctuary Arch framing the Lighthouse
  pushStatic(meshes.arch, 0, 2.5, sanctZ + 3.0, 0, 0, 0, 24.0, 24.0, 1.4, 3, [0.90, 0.84, 0.68]);
  addObstacle(0, sanctZ, 11.5);

  // =========================================================================
  // 16 COLLECTIBLE MEMORY PEARLS ("水之记忆 [0 / 16]" — 2 per Realm)
  // =========================================================================
  const memoryZList = [
    -36, -82,    // Realm 01: Dawn Lilies
    -144, -192,  // Realm 02: Sunken Torii
    -248, -298,  // Realm 03: Floating Lantern Dusk
    -358, -408,  // Realm 04: Bioluminescent Jellyfish
    -468, -498,  // Realm 05: Drowned Cathedral & Rose Window!
    -576, -626,  // Realm 06: Crimson Maple Fjord
    -686, -716,  // Realm 07: Glacial Aurora Mirror & Ice Arch!
    -792, -826,  // Realm 08: Golden Horizon Sanctuary Approach
  ];

  const memories = memoryZList.map((mz, idx) => {
    const rcx = riverCenterX(mz);
    // Gentle scenic lateral offset (0 right inside Rose Window & Ice Arch & Sanctuary Pier!)
    const centered = mz === -144 || mz === -498 || mz === -716 || mz === -826;
    const ox = centered ? 0 : (idx % 2 === 0 ? -3.4 : 3.4);
    const lore = MEMORY_LORE[idx];
    return {
      id: idx,
      realmIndex: Math.floor(idx / 2),
      baseX: rcx + ox,
      baseZ: mz,
      x: rcx + ox,
      y: 0.85,
      z: mz,
      collected: false,
      awakened: false,
      awakenGlow: 0,
      title: lore[0],
      verse: lore[1],
    };
  });

  // 64 Gentle Starlight / Firefly River Motes along the 880m channel (+35 pts each)
  const riverMotes = [];
  for (let i = 0; i < 64; i++) {
    const z = -18 - i * 13.0;
    const ox = Math.sin(i * 1.7) * 5.2;
    riverMotes.push({
      x: riverCenterX(z) + ox,
      y: 0.75 + (i % 3) * 0.25,
      z,
      collected: false,
      phase: i * 0.9,
    });
  }

  return {
    staticDraws,
    obstacles,
    floatingLilies,
    floatingLanterns,
    jellyfish,
    cathedralBells,
    mapleClusters,
    memories,
    riverMotes,
    sanctZ,
  };
}

// Reusable scratch matrix for skiff & dynamic world rendering
const mTmp = M4.create();
const mLocal = M4.create();
const mBoat = M4.create();

function drawPart(drawMesh, mesh, parentMat, lx, ly, lz, rx, ry, rz, sx, sy, sz, mat, col, p0 = 0.6, p1 = 1.0, alpha = 1.0) {
  M4.trs(mLocal, lx, ly, lz, rx, ry, rz, sx, sy, sz);
  M4.mul(mTmp, parentMat, mLocal);
  drawMesh(mesh, mTmp, mat, col, p0, p1, alpha);
}

// Handcrafted Wooden Skiff + Glowing Bow Lantern + Seated Traveler in Flowing Scarf + Dual Animated Wooden Oars
export function drawWoodenSkiffAndTraveler(drawMesh, meshes, boat, t) {
  M4.trs(mBoat, boat.x, boat.y, boat.z, boat.pitch, boat.yaw, boat.roll, 1, 1, 1);

  const warmTeak = [0.56, 0.36, 0.21];
  const darkCedar = [0.36, 0.22, 0.13];
  const brass = [0.86, 0.68, 0.30];

  // 1. Sculpted Clinker Wooden Hull + Interior Thwart Benches & Floor Grate
  drawPart(drawMesh, meshes.boatHull, mBoat, 0, 0.04, 0, 0, 0, 0, 1.0, 1.0, 1.0, 2, warmTeak);
  drawPart(drawMesh, meshes.box, mBoat, 0, -0.08, 0.05, 0, 0, 0, 0.76, 0.06, 2.55, 2, darkCedar);
  // Center Rowing Thwart + Forward & Stern Benches
  drawPart(drawMesh, meshes.box, mBoat, 0, 0.20, 0.18, 0, 0, 0, 1.24, 0.07, 0.36, 2, warmTeak);
  drawPart(drawMesh, meshes.box, mBoat, 0, 0.22, -1.15, 0, 0, 0, 0.88, 0.06, 0.32, 2, darkCedar);
  drawPart(drawMesh, meshes.box, mBoat, 0, 0.22, 1.32, 0, 0, 0, 0.82, 0.06, 0.30, 2, darkCedar);

  // Brass Oarlocks on Port & Starboard Gunwales
  drawPart(drawMesh, meshes.cyl, mBoat, -0.73, 0.44, -0.10, 0, 0, 0, 0.09, 0.14, 0.09, 2, brass);
  drawPart(drawMesh, meshes.cyl, mBoat, 0.73, 0.44, -0.10, 0, 0, 0, 0.09, 0.14, 0.09, 2, brass);

  // 2. Curved Wooden Bow Lantern Post + Swinging Warm Paper Lantern!
  drawPart(drawMesh, meshes.cyl, mBoat, 0, 0.82, -2.02, 0.24, 0, 0, 0.09, 0.92, 0.09, 2, darkCedar);
  drawPart(drawMesh, meshes.cyl, mBoat, 0, 1.26, -2.26, 1.25, 0, 0, 0.07, 0.46, 0.07, 2, darkCedar);

  const swingZ = -boat.roll * 1.4 + Math.sin(t * 2.6) * 0.08;
  const swingX = boat.pitch * 1.1 + Math.cos(t * 2.1) * 0.05;
  const pulse = 2.15 + Math.sin(t * 5.2) * 0.15 + boat.chimeGlow * 1.6;
  drawPart(drawMesh, meshes.cyl, mBoat, swingZ * 0.12, 1.12, -2.42 + swingX * 0.1, swingX, 0, swingZ, 0.28, 0.36, 0.28, 6, [1.0, 0.82, 0.38], pulse, 1.0, 1.0);
  drawPart(drawMesh, meshes.cone, mBoat, swingZ * 0.12, 1.33, -2.42 + swingX * 0.1, swingX, 0, swingZ, 0.38, 0.14, 0.38, 2, brass);

  // 3. Seated Traveler (facing -Z forward in cozy storybook coat + wide traveler hat + flowing scarf!)
  const leanFwd = Math.sin(boat.oarLeftPhase) * 0.14 * boat.oarAmp;
  // Coat torso
  drawPart(drawMesh, meshes.cone, mBoat, 0, 0.56, 0.22 - leanFwd * 0.35, leanFwd, 0, -boat.steerLean * 0.15, 0.56, 0.72, 0.44, 1, [0.16, 0.42, 0.46]);
  // Shoulders & Traveler Head + Conical Storybook Hat
  const headY = 0.98;
  const headZ = 0.20 - leanFwd * 0.55;
  drawPart(drawMesh, meshes.sphere, mBoat, 0, headY, headZ, 0, boat.steerLean * 0.35, 0, 0.27, 0.28, 0.27, 1, [0.95, 0.84, 0.72]);
  drawPart(drawMesh, meshes.cone, mBoat, 0, headY + 0.16, headZ + 0.02, -0.10, 0, 0, 0.72, 0.28, 0.72, 2, [0.86, 0.66, 0.34]);

  // 4-Segment Articulated Flowing Sunset-Apricot Scarf trailing in the river breeze!
  const scarfCol = [0.95, 0.52, 0.34];
  const windSpd = clamp(boat.speed / 9.0, 0.15, 1.25);
  for (let i = 0; i < 4; i++) {
    const fi = i + 1;
    const waveX = Math.sin(t * (3.6 + windSpd * 2.5) - i * 0.95) * (0.06 + i * 0.065) + boat.steerLean * i * 0.10;
    const waveY = headY - 0.10 - i * 0.045 + Math.cos(t * 4.2 - i * 0.8) * 0.035 * windSpd;
    const segZ = headZ + 0.14 + fi * (0.20 + windSpd * 0.06);
    drawPart(
      drawMesh,
      meshes.box,
      mBoat,
      waveX,
      waveY,
      segZ,
      -0.18 + windSpd * 0.15,
      waveX * 0.5,
      0,
      0.19 - i * 0.022,
      0.045,
      0.26,
      4,
      scarfCol
    );
  }

  // 4. Two Animated Wooden Oars (Port s=-1, Starboard s=+1) with Authentic Catch-Pull-Feather Kinematics!
  const drawOar = (side, phase, amp) => {
    // phase: 0..2*PI -> sin(phase) sweeps blade fore/aft; cos(phase) dips blade into water during pull!
    const sweep = Math.sin(phase) * (0.58 * amp);
    const dip = Math.cos(phase) * (0.30 * amp) - 0.16; // Negative dip angles outer blade down into water
    const lockX = side * 0.73;
    const lockY = 0.46;
    const lockZ = -0.10;

    // Pivot oar shaft around oarlock: inner handle reaches traveler's hands, outer blade extends 1.85m into water!
    const yawOar = side * (-0.05 + sweep);
    const rollOar = side * dip;

    // Compute midpoint of 2.35m oar shaft (0.55m inboard handle, 1.80m outboard blade)
    const outDist = 0.62;
    const dirX = side * Math.cos(sweep) * Math.cos(dip);
    const dirY = Math.sin(dip);
    const dirZ = Math.sin(sweep) * Math.cos(dip);

    const midX = lockX + dirX * outDist;
    const midY = lockY + dirY * outDist;
    const midZ = lockZ + dirZ * outDist;

    // Oar Shaft (cyl axis is local Y, so rotate Z by -side*(PI/2 - dip) and Y by -side*sweep)
    M4.trs(mLocal, midX, midY, midZ, 0, -side * sweep, -side * (Math.PI * 0.5 - dip), 0.065, 2.35, 0.065);
    M4.mul(mTmp, mBoat, mLocal);
    drawMesh(meshes.cyl, mTmp, 2, warmTeak, 0.6, 1.0, 1.0);

    // Wide Painted Oar Blade at outer tip!
    const tipX = lockX + dirX * 1.68;
    const tipY = lockY + dirY * 1.68;
    const tipZ = lockZ + dirZ * 1.68;
    M4.trs(mLocal, tipX, tipY, tipZ, 0, -side * sweep, -side * (Math.PI * 0.5 - dip), 0.035, 0.68, 0.22);
    M4.mul(mTmp, mBoat, mLocal);
    drawMesh(meshes.box, mTmp, 2, [0.88, 0.68, 0.36], 0.6, 1.0, 1.0);

    // Traveler Arm reaching toward inboard oar handle!
    const hndX = lockX - dirX * 0.42;
    const hndY = lockY - dirY * 0.42;
    const hndZ = lockZ - dirZ * 0.42;
    const shX = side * 0.22;
    const shY = 0.74;
    const shZ = 0.18 - leanFwd * 0.4;
    drawPart(
      drawMesh,
      meshes.cyl,
      mBoat,
      (shX + hndX) * 0.5,
      (shY + hndY) * 0.5,
      (shZ + hndZ) * 0.5,
      0.75,
      yawOar * 0.3,
      side * -0.25,
      0.095,
      0.56,
      0.095,
      1,
      [0.18, 0.46, 0.50]
    );
  };

  drawOar(-1, boat.oarLeftPhase, boat.oarLeftAmp);
  drawOar(1, boat.oarRightPhase, boat.oarRightAmp);
}

// Dynamic Realm Elements: Floating Lily Pads & Lotuses, Floating Dusk Lanterns, 3D Pulsing Jellyfish, Bells, Maple Leaves, Sanctuary Beam & 16 Memory Pearls
export function drawDynamicWaterWorld(drawMesh, meshes, world, t, boatZ, memoriesCollected) {
  const minZ = boatZ - 215;
  const maxZ = boatZ + 65;

  // 1. Realm 01 Floating Notched Lily Pads & Multi-Petal Lotus Blossoms
  for (const lp of world.floatingLilies) {
    if (lp.z < minZ || lp.z > maxZ) continue;
    const wy = waterWaveHeight(lp.x, lp.z, t);
    M4.trs(mTmp, lp.x, wy + 0.02, lp.z, 0, lp.rot + Math.sin(t * 0.6 + lp.phase) * 0.06, 0, lp.scale * 2.1, 1.0, lp.scale * 2.1);
    drawMesh(meshes.lilyPad, mTmp, 1, [0.22, 0.56, 0.38], 0.6, 1.0, 1.0);
    if (lp.hasLotus) {
      const petalCol = lp.lotusWarm ? [0.98, 0.62, 0.48] : [0.99, 0.94, 0.84];
      M4.trs(mTmp, lp.x, wy + 0.16, lp.z, 0, lp.rot, 0, lp.scale * 0.68, lp.scale * 0.42, lp.scale * 0.68);
      drawMesh(meshes.dome, mTmp, 4, petalCol, 0.8, 1.0, 1.0);
      M4.trs(mTmp, lp.x, wy + 0.24, lp.z, 0, 0, 0, lp.scale * 0.24, lp.scale * 0.22, lp.scale * 0.24);
      drawMesh(meshes.sphere, mTmp, 6, [1.0, 0.84, 0.36], 1.7, 1.0, 1.0);
    }
  }

  // 2. Realm 03 Drifting Glowing Paper River Lanterns
  for (const fl of world.floatingLanterns) {
    if (fl.z < minZ || fl.z > maxZ) continue;
    const wy = waterWaveHeight(fl.x, fl.z, t);
    const s = fl.scale;
    const glow = 1.85 + Math.sin(t * 3.4 + fl.phase) * 0.22 + fl.flare * 1.5;
    M4.trs(mTmp, fl.x, wy + 0.04, fl.z, 0, fl.rot + t * 0.18, 0, 0.72 * s, 0.08, 0.72 * s);
    drawMesh(meshes.box, mTmp, 2, [0.42, 0.26, 0.15], 0.6, 1.0, 1.0);
    M4.trs(mTmp, fl.x, wy + 0.28 * s, fl.z, 0, fl.rot + t * 0.18, 0, 0.46 * s, 0.52 * s, 0.46 * s);
    drawMesh(meshes.cyl, mTmp, 6, [1.0, 0.76, 0.30], glow, 1.0, 1.0);
  }

  // 3. Realm 04 Pulsing 3D Bioluminescent Jellyfish (Bell + Glowing Core + 4 Undulating Tentacles!)
  for (const jf of world.jellyfish) {
    if (jf.z < minZ || jf.z > maxZ) continue;
    const pulse = Math.sin(t * 2.6 + jf.phase);
    const bellW = jf.scale * (1.0 + pulse * 0.12);
    const bellH = jf.scale * (0.92 - pulse * 0.10);
    const col = jf.goldTint ? [1.0, 0.80, 0.36] : [0.24, 0.94, 0.86];
    const glow = 1.25 + jf.flare * 1.4;

    // Inner luminescent core
    M4.trs(mTmp, jf.x, jf.y - 0.05 * jf.scale, jf.z, 0, 0, 0, bellW * 0.42, bellH * 0.42, bellW * 0.42);
    drawMesh(meshes.sphere, mTmp, 6, col, glow * 1.45, 1.0, 1.0);

    // Translucent scalloped jellyfish dome (queued into translucent pass via alpha < 1!)
    M4.trs(mTmp, jf.x, jf.y, jf.z, 0, t * 0.35 + jf.phase, 0, bellW * 1.35, bellH * 1.15, bellW * 1.35);
    drawMesh(meshes.dome, mTmp, 5, col, glow, 1.0, 0.78);

    // 4 Trailing Oral Tentacles swaying gently
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * Math.PI * 2 + jf.phase;
      const swayX = Math.sin(t * 2.4 + jf.phase + k) * 0.18 * jf.scale;
      const tx = jf.x + Math.cos(a) * 0.24 * jf.scale + swayX * 0.4;
      const tz = jf.z + Math.sin(a) * 0.24 * jf.scale;
      M4.trs(mTmp, tx, jf.y - 0.68 * jf.scale, tz, 0, 0, swayX * 0.45, 0.055 * jf.scale, 1.28 * jf.scale, 0.055 * jf.scale);
      drawMesh(meshes.cyl, mTmp, 6, col, glow * 0.95, 1.0, 0.72);
    }
  }

  // 4. Realm 05 Swinging Bronze Cathedral Bells
  for (const cb of world.cathedralBells) {
    if (cb.z < minZ || cb.z > maxZ) continue;
    const sw = Math.sin(t * 1.8 + cb.z) * (0.12 + cb.swing * 0.45);
    M4.trs(mTmp, cb.x, cb.y, cb.z, 0, 0, sw, 1.65, 1.85, 1.65);
    drawMesh(meshes.dome, mTmp, 2, [0.78, 0.58, 0.26], 0.6, 1.0, 1.0);
  }

  // 5. Realm 06 Floating Crimson & Gold Autumn Maple Leaves
  for (const mc of world.mapleClusters) {
    if (mc.z < minZ || mc.z > maxZ) continue;
    const wy = waterWaveHeight(mc.x, mc.z, t);
    const leafCol = mc.gold ? [0.96, 0.68, 0.20] : [0.90, 0.26, 0.16];
    M4.trs(mTmp, mc.x, wy + 0.03, mc.z, 0, mc.rot + t * 0.25, 0, mc.scale * 1.1, 0.05, mc.scale * 1.1);
    drawMesh(meshes.lilyPad, mTmp, 4, leafCol, 0.7, 1.0, 1.0);
  }

  // 6. Realm 08 Rotating Golden Sanctuary Lighthouse Beams & Ascending Memory Constellation!
  if (world.sanctZ >= minZ - 95) {
    const beamYaw = t * 0.55;
    for (const dir of [-1, 1]) {
      const bx = Math.sin(beamYaw) * dir * 18.0;
      const bz = world.sanctZ + Math.cos(beamYaw) * dir * 18.0;
      M4.trs(mTmp, bx, 26.2, bz, Math.PI * 0.5, beamYaw + (dir < 0 ? Math.PI : 0), 0, 4.2, 36.0, 4.2);
      drawMesh(meshes.cone, mTmp, 6, [1.0, 0.88, 0.48], 1.55, 1.0, 0.26);
    }

    // Golden Constellation Spiral of Collected Memories rising above the Sanctuary Lighthouse!
    const shownOrbs = Math.max(2, memoriesCollected);
    for (let i = 0; i < shownOrbs; i++) {
      const a = t * 0.45 + (i / 16) * Math.PI * 4.0;
      const rad = 5.5 + (i % 4) * 1.8;
      const oy = 14.0 + i * 1.35 + Math.sin(t * 1.8 + i) * 0.45;
      M4.trs(mTmp, Math.cos(a) * rad, oy, world.sanctZ + Math.sin(a) * rad, 0, 0, 0, 0.75, 0.75, 0.75);
      drawMesh(meshes.sphere, mTmp, 6, [1.0, 0.88, 0.44], 2.4, 1.0, 1.0);
    }
  }

  // 7. 16 Collectible Floating Memory Pearls ("水之记忆")
  for (const m of world.memories) {
    if (m.collected || m.z < minZ || m.z > maxZ) continue;
    const wy = waterWaveHeight(m.x, m.z, t);
    const bobY = wy + 0.85 + Math.sin(t * 2.4 + m.id) * 0.16;
    m.y = bobY;
    const boost = 1.0 + m.awakenGlow * 0.9;

    // Floating Lotus Cradle on water surface
    M4.trs(mTmp, m.x, wy + 0.08, m.z, 0, t * 0.6 + m.id, 0, 1.45, 0.35, 1.45);
    drawMesh(meshes.dome, mTmp, 4, [0.98, 0.84, 0.58], 0.8, 1.0, 1.0);

    // Radiant Golden-Seafoam Memory Pearl Orb
    M4.trs(mTmp, m.x, bobY, m.z, 0, t * 1.2, 0, 0.62 * boost, 0.62 * boost, 0.62 * boost);
    drawMesh(meshes.sphere, mTmp, 6, [1.0, 0.90, 0.52], 2.4 * boost, 1.0, 1.0);

    // Orbiting Harmonic Ring + Soft Vertical Starlight Guide Filament
    M4.trs(mTmp, m.x, bobY, m.z, 0.45, t * 1.8 + m.id, 0.25, 1.55 * boost, 1.0, 1.55 * boost);
    drawMesh(meshes.ring, mTmp, 6, [0.35, 0.95, 0.86], 1.9 * boost, 1.0, 0.78);

    M4.trs(mTmp, m.x, bobY + 3.6, m.z, 0, 0, 0, 0.12 * boost, 7.2, 0.12 * boost);
    drawMesh(meshes.cyl, mTmp, 6, [1.0, 0.88, 0.48], 1.7 * boost, 1.0, 0.38);
  }

  // 8. Gentle River Starlight Motes
  for (const rm of world.riverMotes) {
    if (rm.collected || rm.z < minZ || rm.z > maxZ) continue;
    const wy = waterWaveHeight(rm.x, rm.z, t);
    const my = wy + 0.52 + Math.sin(t * 2.8 + rm.phase) * 0.14;
    M4.trs(mTmp, rm.x, my, rm.z, 0, 0, 0, 0.26, 0.26, 0.26);
    drawMesh(meshes.sphere, mTmp, 6, [0.55, 0.96, 0.88], 2.0, 1.0, 1.0);
  }
}
