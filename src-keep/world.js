// Living 6-Tier Procedural 3D Island Kingdom, Per-Character Elastic Builders,
// Articulated 3D Golden Guardian Dragon & Interactive Brute-Force Siege Engine

import { M4, TAU, clamp, lerp, smoothstep, createSpring, springStep, mulberry32, hashString } from './math.js';

// Warm Sandstone, Limestone, Terracotta, Turquoise & Emerald Palette
export const PAL = {
  limestone: [0.906, 0.878, 0.824],   // #e7e0d2 Fortress Limestone
  stoneTrim: [0.655, 0.630, 0.575],   // Carved Ashlar Trim
  cliffRock: [0.540, 0.515, 0.455],   // Sea Cliff Granite
  terracotta: [0.878, 0.388, 0.227],  // #e0633a Roof Terracotta
  gold: [0.961, 0.722, 0.180],        // #f5b82e Sandstone Gold
  brass: [0.845, 0.635, 0.205],       // Forged Cannon & Astrolabe Brass
  meadow: [0.063, 0.725, 0.506],      // #10b981 Emerald Meadow
  pine: [0.055, 0.485, 0.345],        // Coastal Cypress / Pine Foliage
  turquoise: [0.078, 0.722, 0.651],   // #14b8a6 Sea Turquoise
  amber: [0.976, 0.451, 0.086],       // #f97316 Flame Amber
  windowGlow: [1.000, 0.760, 0.280],  // Warm Tavern / Keep Window Light
  oak: [0.485, 0.315, 0.165],         // Driftwood & Palisade Timber
  oakDark: [0.295, 0.185, 0.095],     // Heavy Beams & Gun Carriages
  sail: [0.955, 0.925, 0.845],        // Canvas Sails & Windmill Vanes
  iron: [0.145, 0.180, 0.215],        // #0b1117 Slate Iron / Shark Fin
  siegeHull: [0.180, 0.120, 0.100],   // Dark Obsidian-Rust Battering Meteor
  siegeCore: [0.950, 0.270, 0.110],   // Blazing Crimson-Amber Threat Core
};

function uploadMesh(gl, positions, normals, uvs, indices) {
  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);

  const posBuf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, posBuf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(positions), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);

  const nrmBuf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, nrmBuf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(normals), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(1);
  gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 0, 0);

  const uvBuf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, uvBuf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(uvs), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(2);
  gl.vertexAttribPointer(2, 2, gl.FLOAT, false, 0, 0);

  const idxArr = positions.length / 3 > 65535 ? new Uint32Array(indices) : new Uint16Array(indices);
  const idxBuf = gl.createBuffer();
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, idxBuf);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, idxArr, gl.STATIC_DRAW);

  gl.bindVertexArray(null);
  return {
    vao,
    count: idxArr.length,
    indexType: idxArr instanceof Uint32Array ? gl.UNSIGNED_INT : gl.UNSIGNED_SHORT,
  };
}

function buildBoxMesh(gl) {
  const p = [];
  const n = [];
  const uv = [];
  const idx = [];
  const faces = [
    { nrm: [0, 0, 1], u: [1, 0, 0], v: [0, 1, 0] },
    { nrm: [0, 0, -1], u: [-1, 0, 0], v: [0, 1, 0] },
    { nrm: [0, 1, 0], u: [1, 0, 0], v: [0, 0, -1] },
    { nrm: [0, -1, 0], u: [1, 0, 0], v: [0, 0, 1] },
    { nrm: [1, 0, 0], u: [0, 0, -1], v: [0, 1, 0] },
    { nrm: [-1, 0, 0], u: [0, 0, 1], v: [0, 1, 0] },
  ];
  let vBase = 0;
  for (const f of faces) {
    const corners = [
      [-0.5, -0.5],
      [0.5, -0.5],
      [0.5, 0.5],
      [-0.5, 0.5],
    ];
    for (const [cu, cv] of corners) {
      p.push(
        f.nrm[0] * 0.5 + f.u[0] * cu + f.v[0] * cv,
        f.nrm[1] * 0.5 + f.u[1] * cu + f.v[1] * cv,
        f.nrm[2] * 0.5 + f.u[2] * cu + f.v[2] * cv
      );
      n.push(f.nrm[0], f.nrm[1], f.nrm[2]);
      uv.push(cu + 0.5, cv + 0.5);
    }
    idx.push(vBase, vBase + 1, vBase + 2, vBase, vBase + 2, vBase + 3);
    vBase += 4;
  }
  return uploadMesh(gl, p, n, uv, idx);
}

function buildCylinderMesh(gl, segs = 16, rTop = 1, rBot = 1, yMin = -0.5, yMax = 0.5) {
  const p = [];
  const n = [];
  const uv = [];
  const idx = [];
  const slopeY = (rBot - rTop) / Math.max(0.001, yMax - yMin);

  // Side ring
  for (let i = 0; i <= segs; i++) {
    const u = i / segs;
    const a = u * TAU;
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    const nl = Math.hypot(ca, slopeY, sa) || 1;
    p.push(ca * rBot, yMin, sa * rBot);
    n.push(ca / nl, slopeY / nl, sa / nl);
    uv.push(u, 0);

    p.push(ca * rTop, yMax, sa * rTop);
    n.push(ca / nl, slopeY / nl, sa / nl);
    uv.push(u, 1);
  }
  for (let i = 0; i < segs; i++) {
    const b = i * 2;
    idx.push(b, b + 2, b + 3, b, b + 3, b + 1);
  }

  // Top cap
  if (rTop > 0.001) {
    const topCenter = p.length / 3;
    p.push(0, yMax, 0);
    n.push(0, 1, 0);
    uv.push(0.5, 0.5);
    for (let i = 0; i <= segs; i++) {
      const a = (i / segs) * TAU;
      p.push(Math.cos(a) * rTop, yMax, Math.sin(a) * rTop);
      n.push(0, 1, 0);
      uv.push(0.5 + Math.cos(a) * 0.5, 0.5 + Math.sin(a) * 0.5);
    }
    for (let i = 0; i < segs; i++) {
      idx.push(topCenter, topCenter + 1 + i + 1, topCenter + 1 + i);
    }
  }

  // Bottom cap
  if (rBot > 0.001) {
    const botCenter = p.length / 3;
    p.push(0, yMin, 0);
    n.push(0, -1, 0);
    uv.push(0.5, 0.5);
    for (let i = 0; i <= segs; i++) {
      const a = (i / segs) * TAU;
      p.push(Math.cos(a) * rBot, yMin, Math.sin(a) * rBot);
      n.push(0, -1, 0);
      uv.push(0.5 + Math.cos(a) * 0.5, 0.5 + Math.sin(a) * 0.5);
    }
    for (let i = 0; i < segs; i++) {
      idx.push(botCenter, botCenter + 1 + i, botCenter + 1 + i + 1);
    }
  }

  return uploadMesh(gl, p, n, uv, idx);
}

function buildGableRoofMesh(gl) {
  // Ridge along Z [-0.5..0.5], width X [-0.5..0.5], height Y [0..0.6]
  const p = [];
  const n = [];
  const uv = [];
  const idx = [];
  const addTri = (a, b, c) => {
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
    const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    let nx = uy * vz - uz * vy;
    let ny = uz * vx - ux * vz;
    let nz = ux * vy - uy * vx;
    const nl = Math.hypot(nx, ny, nz) || 1;
    nx /= nl; ny /= nl; nz /= nl;
    const base = p.length / 3;
    p.push(...a, ...b, ...c);
    n.push(nx, ny, nz, nx, ny, nz, nx, ny, nz);
    uv.push(0, 0, 1, 0, 0.5, 1);
    idx.push(base, base + 1, base + 2);
  };
  const addQuad = (a, b, c, d) => {
    addTri(a, b, c);
    addTri(a, c, d);
  };

  const fl = [-0.55, 0, 0.55], fr = [0.55, 0, 0.55], ft = [0, 0.58, 0.55];
  const bl = [-0.55, 0, -0.55], br = [0.55, 0, -0.55], bt = [0, 0.58, -0.55];

  addTri(fl, fr, ft);
  addTri(br, bl, bt);
  addQuad(fr, br, bt, ft);
  addQuad(bl, fl, ft, bt);
  addQuad(bl, br, fr, fl);
  return uploadMesh(gl, p, n, uv, idx);
}

function buildOctaMesh(gl) {
  const p = [];
  const n = [];
  const uv = [];
  const idx = [];
  const top = [0, 1, 0];
  const bot = [0, -1, 0];
  const ring = [
    [1, 0, 0],
    [0, 0, -1],
    [-1, 0, 0],
    [0, 0, 1],
  ];
  const addTri = (a, b, c) => {
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
    const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    let nx = uy * vz - uz * vy;
    let ny = uz * vx - ux * vz;
    let nz = ux * vy - uy * vx;
    const nl = Math.hypot(nx, ny, nz) || 1;
    const base = p.length / 3;
    p.push(...a, ...b, ...c);
    n.push(nx / nl, ny / nl, nz / nl, nx / nl, ny / nl, nz / nl, nx / nl, ny / nl, nz / nl);
    uv.push(0, 0, 1, 0, 0.5, 1);
    idx.push(base, base + 1, base + 2);
  };
  for (let i = 0; i < 4; i++) {
    const r0 = ring[i];
    const r1 = ring[(i + 1) % 4];
    addTri(r0, r1, top);
    addTri(r1, r0, bot);
  }
  return uploadMesh(gl, p, n, uv, idx);
}

function buildSphereMesh(gl, latSegs = 20, lonSegs = 32) {
  const p = [];
  const n = [];
  const uv = [];
  const idx = [];
  for (let y = 0; y <= latSegs; y++) {
    const v = y / latSegs;
    const phi = v * Math.PI;
    const sp = Math.sin(phi);
    const cp = Math.cos(phi);
    for (let x = 0; x <= lonSegs; x++) {
      const u = x / lonSegs;
      const th = u * TAU;
      const px = sp * Math.cos(th);
      const py = cp;
      const pz = sp * Math.sin(th);
      p.push(px, py, pz);
      n.push(px, py, pz);
      uv.push(u, v);
    }
  }
  const stride = lonSegs + 1;
  for (let y = 0; y < latSegs; y++) {
    for (let x = 0; x < lonSegs; x++) {
      const a = y * stride + x;
      const b = a + stride;
      idx.push(a, a + 1, b + 1, a, b + 1, b);
    }
  }
  return uploadMesh(gl, p, n, uv, idx);
}

function buildTorusMesh(gl, majorSegs = 32, minorSegs = 10, R = 1.0, r = 0.055) {
  const p = [];
  const n = [];
  const uv = [];
  const idx = [];
  for (let i = 0; i <= majorSegs; i++) {
    const u = i / majorSegs;
    const th = u * TAU;
    const ct = Math.cos(th);
    const st = Math.sin(th);
    for (let j = 0; j <= minorSegs; j++) {
      const v = j / minorSegs;
      const ph = v * TAU;
      const cp = Math.cos(ph);
      const sp = Math.sin(ph);
      const rad = R + r * cp;
      p.push(rad * ct, r * sp, rad * st);
      n.push(cp * ct, sp, cp * st);
      uv.push(u, v);
    }
  }
  const stride = minorSegs + 1;
  for (let i = 0; i < majorSegs; i++) {
    for (let j = 0; j < minorSegs; j++) {
      const a = i * stride + j;
      const b = a + stride;
      idx.push(a, b, b + 1, a, b + 1, a + 1);
    }
  }
  return uploadMesh(gl, p, n, uv, idx);
}

function buildSculptedIslandMesh(gl) {
  // Organic 32-gon multi-ring island mound with rocky coastal cliffs & gently domed meadow top
  const rings = [
    { r: 0.0, y: 0.34 },
    { r: 0.45, y: 0.30 },
    { r: 0.80, y: 0.22 },
    { r: 0.96, y: 0.08 },
    { r: 1.04, y: -0.35 },
    { r: 0.82, y: -1.15 },
    { r: 0.0, y: -1.45 },
  ];
  const segs = 32;
  const p = [];
  const n = [];
  const uv = [];
  const idx = [];

  const lobe = (ang) => 1.0 + 0.065 * Math.sin(ang * 5.0 + 0.7) + 0.045 * Math.cos(ang * 3.0 - 0.4);

  for (let rIdx = 0; rIdx < rings.length; rIdx++) {
    const ring = rings[rIdx];
    for (let s = 0; s <= segs; s++) {
      const u = s / segs;
      const ang = u * TAU;
      const lb = ring.r > 0.01 ? lobe(ang) : 1.0;
      const px = Math.cos(ang) * ring.r * lb;
      const pz = Math.sin(ang) * ring.r * lb;
      const py = ring.y;
      p.push(px, py, pz);

      if (rIdx <= 2) {
        n.push(Math.cos(ang) * 0.14, 0.98, Math.sin(ang) * 0.14);
      } else if (rIdx <= 4) {
        n.push(Math.cos(ang) * 0.92, 0.35, Math.sin(ang) * 0.92);
      } else {
        n.push(Math.cos(ang) * 0.65, -0.75, Math.sin(ang) * 0.65);
      }
      uv.push(u, rIdx / (rings.length - 1));
    }
  }
  const stride = segs + 1;
  for (let rIdx = 0; rIdx < rings.length - 1; rIdx++) {
    for (let s = 0; s < segs; s++) {
      const a = rIdx * stride + s;
      const b = a + stride;
      idx.push(a, b, b + 1, a, b + 1, a + 1);
    }
  }
  return uploadMesh(gl, p, n, uv, idx);
}

function buildOceanMesh(gl) {
  // Concentric radial ocean disc out to R=150 with high vertex density around the island shore
  const radialRings = 68;
  const angSegs = 84;
  const p = [];
  const n = [];
  const uv = [];
  const idx = [];

  for (let r = 0; r <= radialRings; r++) {
    const t = r / radialRings;
    // Quadratic spacing: 0..25m gets dense rings, smoothly stretches to 150m horizon
    const rad = 150.0 * (0.16 * t + 0.84 * t * t);
    for (let s = 0; s <= angSegs; s++) {
      const u = s / angSegs;
      const a = u * TAU;
      p.push(Math.cos(a) * rad, 0, Math.sin(a) * rad);
      n.push(0, 1, 0);
      uv.push(u, t);
    }
  }
  const stride = angSegs + 1;
  for (let r = 0; r < radialRings; r++) {
    for (let s = 0; s < angSegs; s++) {
      const a = r * stride + s;
      const b = a + stride;
      idx.push(a, b, b + 1, a, b + 1, a + 1);
    }
  }
  return uploadMesh(gl, p, n, uv, idx);
}

export function createWorldMeshes(gl) {
  return {
    box: buildBoxMesh(gl),
    cyl: buildCylinderMesh(gl, 16, 1, 1, -0.5, 0.5),
    beam: buildCylinderMesh(gl, 10, 1, 1, -1.0, 1.0),
    taperCyl: buildCylinderMesh(gl, 14, 0.72, 1.0, -0.5, 0.5),
    cone: buildCylinderMesh(gl, 14, 0.02, 1.0, -0.5, 0.5),
    roof: buildGableRoofMesh(gl),
    octa: buildOctaMesh(gl),
    sphere: buildSphereMesh(gl, 20, 32),
    torus: buildTorusMesh(gl, 36, 10, 1.0, 0.045),
    island: buildSculptedIslandMesh(gl),
    ocean: buildOceanMesh(gl),
  };
}

export function createParticleSystem(gl, maxParticles = 900) {
  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);

  const corners = new Float32Array([-1, -1, 1, -1, 1, 1, -1, 1]);
  const indices = new Uint16Array([0, 1, 2, 0, 2, 3]);

  const cornerVBO = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, cornerVBO);
  gl.bufferData(gl.ARRAY_BUFFER, corners, gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

  const idxBuf = gl.createBuffer();
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, idxBuf);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);

  const strideBytes = 12 * 4;
  const instVBO = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, instVBO);
  gl.bufferData(gl.ARRAY_BUFFER, maxParticles * strideBytes, gl.DYNAMIC_DRAW);

  gl.enableVertexAttribArray(1);
  gl.vertexAttribPointer(1, 4, gl.FLOAT, false, strideBytes, 0);
  gl.vertexAttribDivisor(1, 1);

  gl.enableVertexAttribArray(2);
  gl.vertexAttribPointer(2, 4, gl.FLOAT, false, strideBytes, 16);
  gl.vertexAttribDivisor(2, 1);

  gl.enableVertexAttribArray(3);
  gl.vertexAttribPointer(3, 4, gl.FLOAT, false, strideBytes, 32);
  gl.vertexAttribDivisor(3, 1);

  gl.bindVertexArray(null);
  return {
    vao,
    instVBO,
    maxParticles,
    data: new Float32Array(maxParticles * 12),
  };
}

// --- Living 6-Tier Kingdom World State & Simulation ---
const MAX_CHAR_SLOTS = 48;

export class KingdomWorld {
  constructor(audio) {
    this.audio = audio;
    this.mat = M4.create();

    // Tier elastic springs (0..5)
    this.tierSprings = Array.from({ length: 6 }, (_, i) => createSpring(i === 0 ? 1 : 0));
    this.islandRadiusSpring = createSpring(2.3);
    this.entropyNormSmooth = 0;

    // Per-character structure slots with elastic spring pop-in
    this.charSlots = Array.from({ length: MAX_CHAR_SLOTS }, (_, i) => ({
      index: i,
      active: false,
      charClass: 'lower',
      seed: 1000 + i * 7919,
      spring: createSpring(0),
      recoil: 0,
    }));

    this.currentAnalysis = null;
    this.buildingsCount = 4;

    //Particles & Visual Effects
    this.particles = [];
    this.cannonBeams = [];
    this.breachFires = [];
    this.fireworkTimer = 0.8;
    this.smokeTimer = 0.08;

    // Shield hit shockwave state (xyz = unit dir, w = flash [0..1])
    this.shieldHit = [0, 1, 0, 0];

    // Siege Engine State
    this.underSiege = false;
    this.siegeTimer = 0;
    this.siegeSpawnAccum = 0;
    this.siegeMeteors = [];
    this.siegeStats = { spawned: 0, intercepted: 0, breached: 0 };
    this.cameraShake = 0;
    this.impactFlash = 0;
    this.goldGlow = 0;
    this.onSiegeComplete = null;

    // Articulated Golden Dragon flight & breath state
    this.dragonPos = [0, 15, 0];
    this.dragonBreathTarget = null;
    this.dragonBreathTimer = 0;
  }

  applyAnalysis(analysis, playAudio = false) {
    const prev = this.currentAnalysis;
    const prevLen = prev ? prev.passwordLength : 0;
    const prevTier = prev ? prev.tier : 0;

    this.currentAnalysis = analysis;
    const len = analysis.passwordLength;

    for (let i = 0; i < MAX_CHAR_SLOTS; i++) {
      const slot = this.charSlots[i];
      if (i < len) {
        const wasActive = slot.active;
        slot.active = true;
        slot.charClass = analysis.charClasses[i] || 'lower';
        slot.seed = hashString(`${i}:${analysis.chars[i]}:${slot.charClass}`);
        if (!wasActive) {
          // Give newly typed character an energetic upward spring kick!
          slot.spring.v = 6.2;
        }
      } else {
        slot.active = false;
      }
    }

    // Recompute live 3D buildings count (tier architectural landmarks + per-character structures)
    const tierBaseCounts = [4, 11, 20, 30, 40, 50];
    this.buildingsCount = tierBaseCounts[analysis.tier] + len;

    if (playAudio && this.audio) {
      if (analysis.tier > prevTier) {
        this.audio.playTierFanfare(analysis.tier);
        this.goldGlow = 0.85;
        if (analysis.tier === 5) {
          this.audio.playDragonRoar();
          this.spawnCelebrationFirework(0, 16, 0);
        }
      } else if (len !== prevLen) {
        const isDelete = len < prevLen;
        const lastCls = len > 0 ? analysis.charClasses[len - 1] : 'lower';
        this.audio.playCharBuild(lastCls, analysis.entropyBits, isDelete);
      }
    }

    // Clear residual breach fires if user strengthens password up a tier
    if (analysis.tier > prevTier && this.breachFires.length > 0) {
      this.breachFires.length = 0;
    }
  }

  launchSiege(onComplete) {
    this.underSiege = true;
    this.siegeTimer = 6.6;
    this.siegeSpawnAccum = 0.05;
    this.siegeMeteors.length = 0;
    this.breachFires.length = 0;
    this.siegeStats = { spawned: 0, intercepted: 0, breached: 0 };
    this.onSiegeComplete = onComplete || null;

    const tier = this.currentAnalysis ? this.currentAnalysis.tier : 0;
    if (this.audio) {
      if (tier >= 5) this.audio.playDragonRoar();
      else if (tier >= 2) this.audio.playCannonVolley();
      else this.audio.playBreachAlarm();
    }
  }

  spawnParticle(p) {
    if (this.particles.length >= 880) {
      this.particles.shift();
    }
    this.particles.push(p);
  }

  spawnCelebrationFirework(bx, by, bz) {
    const palette = [
      [0.98, 0.78, 0.22], // Sandstone Gold
      [0.10, 0.86, 0.68], // Sea Turquoise
      [0.98, 0.50, 0.14], // Flame Amber
      [0.16, 0.90, 0.55], // Emerald
    ];
    const col = palette[Math.floor(Math.random() * palette.length)];
    for (let i = 0; i < 28; i++) {
      const th = Math.random() * TAU;
      const ph = Math.acos(2 * Math.random() - 1);
      const spd = 4.5 + Math.random() * 5.5;
      this.spawnParticle({
        x: bx,
        y: by,
        z: bz,
        vx: Math.sin(ph) * Math.cos(th) * spd,
        vy: Math.cos(ph) * spd + 1.8,
        vz: Math.sin(ph) * Math.sin(th) * spd,
        size: 0.34 + Math.random() * 0.22,
        grow: -0.08,
        rot: Math.random() * TAU,
        kind: 1,
        r: col[0],
        g: col[1],
        b: col[2],
        a: 1.0,
        life: 0.9 + Math.random() * 0.55,
        maxLife: 1.45,
        gravity: 5.5,
      });
    }
    if (this.audio) this.audio.playFireworkPop();
  }

  spawnSiegeMeteor() {
    const tier = this.currentAnalysis ? this.currentAnalysis.tier : 0;
    const az = Math.random() * TAU;
    const startR = 38 + Math.random() * 14;
    const sx = Math.cos(az) * startR;
    const sz = Math.sin(az) * startR;
    const sy = 20 + Math.random() * 13;

    const targetSpread = tier === 0 ? 2.0 : Math.min(8.5, 3.5 + tier * 1.2);
    const tAz = Math.random() * TAU;
    const tRad = Math.random() * targetSpread;
    const tx = Math.cos(tAz) * tRad;
    const tz = Math.sin(tAz) * tRad;
    const ty = tier >= 4 ? 4.2 : tier >= 1 ? 1.2 : 0.2;

    // Defense probability scales authentically with password entropy & symbol cannons
    const symCount = this.currentAnalysis ? this.currentAnalysis.pools.symbol : 0;
    let interceptMode = 'none';
    if (tier >= 5) {
      interceptMode = Math.random() < 0.48 ? 'dragon' : Math.random() < 0.55 ? 'cannon' : 'shield';
    } else if (tier === 4) {
      interceptMode = Math.random() < 0.45 ? 'cannon' : 'shield';
    } else if (tier === 3) {
      const chance = Math.min(0.92, 0.74 + symCount * 0.05);
      interceptMode = Math.random() < chance ? 'cannon' : 'wall';
    } else if (tier === 2) {
      const chance = Math.min(0.82, 0.52 + symCount * 0.08);
      interceptMode = Math.random() < chance ? 'cannon' : 'breach';
    } else if (tier === 1) {
      const chance = Math.min(0.35, symCount * 0.12);
      interceptMode = Math.random() < chance ? 'cannon' : 'breach';
    }

    const interceptFrac =
      interceptMode === 'dragon'
        ? 0.52 + Math.random() * 0.16
        : interceptMode === 'cannon'
        ? 0.58 + Math.random() * 0.18
        : interceptMode === 'shield'
        ? 0.72
        : 1.0;

    this.siegeStats.spawned++;
    this.siegeMeteors.push({
      sx, sy, sz,
      tx, ty, tz,
      x: sx, y: sy, z: sz,
      t: 0,
      dur: 1.15 + Math.random() * 0.35,
      rot: Math.random() * TAU,
      interceptMode,
      interceptFrac,
      alive: true,
    });
  }

  getSlotPlacement(slot, islandR, tier) {
    const idx = slot.index;
    const goldenAngle = 2.39996323;
    const angle = idx * goldenAngle + (slot.seed % 100) * 0.006;

    if (tier === 0) {
      // Arrange extra planks/crates snugly around the driftwood raft
      const r = 1.15 + (idx % 6) * 0.32;
      return {
        x: Math.cos(angle) * r,
        y: 0.18,
        z: Math.sin(angle) * r,
        yaw: -angle + Math.PI * 0.5,
      };
    }

    let radNorm = 0.54 + ((idx * 0.17) % 0.34);
    if (slot.charClass === 'symbol') {
      // Brass cannons stand along outer coastal ramparts facing seaward!
      radNorm = 0.84;
    } else if (slot.charClass === 'upper') {
      // Stone bastion towers form strong inner-outer defensive ring
      radNorm = 0.74;
    } else if (slot.charClass === 'unicode') {
      // Golden sanctuary obelisks grace elevated ring
      radNorm = 0.62;
    }
    const r = Math.max(3.4, islandR * radNorm);
    const groundY = 0.24 * (1.0 - (radNorm * radNorm) * 0.28) * Math.min(1.6, 0.9 + tier * 0.12);
    return {
      x: Math.cos(angle) * r,
      y: groundY,
      z: Math.sin(angle) * r,
      yaw: Math.atan2(Math.cos(angle), Math.sin(angle)),
    };
  }

  update(dt, time) {
    const analysis = this.currentAnalysis;
    const tier = analysis ? analysis.tier : 0;
    const bits = analysis ? analysis.entropyBits : 0;

    // Smooth atmospheric entropy [0..1]
    const targetNorm = clamp(bits / 112.0, 0, 1);
    this.entropyNormSmooth = lerp(this.entropyNormSmooth, targetNorm, 1 - Math.exp(-3.2 * dt));

    // Step 6 tier springs with juicy overshoot
    for (let k = 0; k < 6; k++) {
      const target = tier >= k ? 1.0 : 0.0;
      springStep(this.tierSprings[k], target, 175, 13.5, dt);
    }

    const targetIslandR = tier === 0 ? 2.2 : 7.8 + tier * 1.35;
    const islandR = springStep(this.islandRadiusSpring, targetIslandR, 150, 14.0, dt);

    // Step per-character structure springs
    for (let i = 0; i < MAX_CHAR_SLOTS; i++) {
      const slot = this.charSlots[i];
      springStep(slot.spring, slot.active ? 1.0 : 0.0, 225, 13.2, dt);
      if (slot.recoil > 0) slot.recoil = Math.max(0, slot.recoil - dt * 3.5);
    }

    // Update Golden Guardian Dragon orbital trajectory (Tier 5)
    const dragOrbitR = 12.2 + Math.sin(time * 0.7) * 1.8;
    const dragAng = time * 0.88;
    this.dragonPos[0] = Math.cos(dragAng) * dragOrbitR;
    this.dragonPos[1] = 13.2 + Math.sin(time * 1.75) * 1.35;
    this.dragonPos[2] = Math.sin(dragAng) * dragOrbitR;

    if (this.dragonBreathTimer > 0) {
      this.dragonBreathTimer = Math.max(0, this.dragonBreathTimer - dt);
      if (this.dragonBreathTarget) {
        for (let k = 0; k < 2; k++) {
          const f = Math.random();
          this.spawnParticle({
            x: lerp(this.dragonPos[0], this.dragonBreathTarget[0], f),
            y: lerp(this.dragonPos[1], this.dragonBreathTarget[1], f),
            z: lerp(this.dragonPos[2], this.dragonBreathTarget[2], f),
            vx: (Math.random() - 0.5) * 2.5,
            vy: 0.8 + Math.random() * 1.8,
            vz: (Math.random() - 0.5) * 2.5,
            size: 0.55 + Math.random() * 0.45,
            grow: 0.4,
            rot: Math.random() * TAU,
            kind: 1,
            r: 0.99,
            g: 0.74,
            b: 0.18,
            a: 0.95,
            life: 0.28,
            maxLife: 0.28,
            gravity: -1.5,
          });
        }
      }
    }

    // Decay screen/shield feedback flashes
    this.cameraShake = Math.max(0, this.cameraShake - dt * 2.6);
    this.impactFlash = Math.max(0, this.impactFlash - dt * 2.8);
    this.goldGlow = Math.max(0, this.goldGlow - dt * 1.4);
    this.shieldHit[3] = Math.max(0, this.shieldHit[3] - dt * 2.2);

    // Ambient smoke / storm spray / waterfall mist emitters
    this.smokeTimer -= dt;
    if (this.smokeTimer <= 0) {
      this.smokeTimer = 0.09;
      if (tier === 0) {
        // Choppy storm spray around the raft
        const a = Math.random() * TAU;
        this.spawnParticle({
          x: Math.cos(a) * 2.4,
          y: 0.15,
          z: Math.sin(a) * 2.4,
          vx: (Math.random() - 0.5) * 2.2,
          vy: 1.4 + Math.random() * 1.6,
          vz: (Math.random() - 0.5) * 2.2,
          size: 0.35,
          grow: 0.45,
          rot: Math.random() * TAU,
          kind: 0,
          r: 0.72,
          g: 0.84,
          b: 0.88,
          a: 0.38,
          life: 0.75,
          maxLife: 0.75,
          gravity: 3.2,
        });
      } else if (tier >= 1 && tier <= 3) {
        // Cozy rising campfire / hearth smoke puffs
        this.spawnParticle({
          x: (Math.random() - 0.5) * 0.35,
          y: tier >= 3 ? 8.2 : 1.5,
          z: (Math.random() - 0.5) * 0.35,
          vx: 0.45 + (Math.random() - 0.5) * 0.35,
          vy: 1.65 + Math.random() * 0.65,
          vz: (Math.random() - 0.5) * 0.35,
          size: 0.28,
          grow: 0.55,
          rot: Math.random() * TAU,
          kind: 0,
          r: 0.85,
          g: 0.83,
          b: 0.78,
          a: 0.34,
          life: 1.7,
          maxLife: 1.7,
          gravity: -0.2,
        });
      }
      if (tier >= 4) {
        // Sky-citadel waterfall plunge mist & golden levitation motes
        const idx = Math.floor(Math.random() * 4);
        const ang = idx * (Math.PI * 0.5);
        this.spawnParticle({
          x: Math.cos(ang) * 6.8 + (Math.random() - 0.5) * 0.9,
          y: 0.35,
          z: Math.sin(ang) * 6.8 + (Math.random() - 0.5) * 0.9,
          vx: (Math.random() - 0.5) * 0.9,
          vy: 1.2 + Math.random() * 0.9,
          vz: (Math.random() - 0.5) * 0.9,
          size: 0.55,
          grow: 0.65,
          rot: Math.random() * TAU,
          kind: 0,
          r: 0.78,
          g: 0.96,
          b: 0.94,
          a: 0.36,
          life: 1.1,
          maxLife: 1.1,
          gravity: 0.2,
        });
      }
    }

    // Tier 5 Celebratory Golden Fireworks
    if (tier >= 5) {
      this.fireworkTimer -= dt;
      if (this.fireworkTimer <= 0) {
        this.fireworkTimer = 1.65 + Math.random() * 1.4;
        const a = Math.random() * TAU;
        const r = 5.5 + Math.random() * 5.0;
        this.spawnCelebrationFirework(Math.cos(a) * r, 15.5 + Math.random() * 4.5, Math.sin(a) * r);
      }
    }

    // Burning Breach Fires (if weak password was breached during Siege)
    for (let i = this.breachFires.length - 1; i >= 0; i--) {
      const bf = this.breachFires[i];
      bf.life -= dt;
      if (bf.life <= 0) {
        this.breachFires.splice(i, 1);
        continue;
      }
      if (Math.random() < 0.45) {
        this.spawnParticle({
          x: bf.x + (Math.random() - 0.5) * 0.5,
          y: bf.y + 0.3,
          z: bf.z + (Math.random() - 0.5) * 0.5,
          vx: (Math.random() - 0.5) * 0.8,
          vy: 2.2 + Math.random() * 1.5,
          vz: (Math.random() - 0.5) * 0.8,
          size: 0.42,
          grow: 0.5,
          rot: Math.random() * TAU,
          kind: Math.random() < 0.5 ? 1 : 0,
          r: 0.95,
          g: 0.36,
          b: 0.08,
          a: 0.75,
          life: 0.85,
          maxLife: 0.85,
          gravity: -0.4,
        });
      }
    }

    // Active Brute-Force Siege Barrage Update
    if (this.underSiege) {
      this.siegeTimer -= dt;
      if (this.siegeTimer > 1.1) {
        this.siegeSpawnAccum -= dt;
        if (this.siegeSpawnAccum <= 0) {
          this.siegeSpawnAccum = 0.27;
          this.spawnSiegeMeteor();
        }
      }

      for (let i = this.siegeMeteors.length - 1; i >= 0; i--) {
        const m = this.siegeMeteors[i];
        m.t += dt;
        m.rot += dt * 5.5;
        const p = clamp(m.t / m.dur, 0, 1);
        // Parabolic arc
        m.x = lerp(m.sx, m.tx, p);
        m.z = lerp(m.sz, m.tz, p);
        m.y = lerp(m.sy, m.ty, p) + Math.sin(p * Math.PI) * 4.5;

        // Fiery meteor trail
        if (Math.random() < 0.75) {
          this.spawnParticle({
            x: m.x,
            y: m.y,
            z: m.z,
            vx: (Math.random() - 0.5) * 1.2,
            vy: 0.8 + Math.random() * 1.2,
            vz: (Math.random() - 0.5) * 1.2,
            size: 0.42,
            grow: 0.35,
            rot: Math.random() * TAU,
            kind: 1,
            r: 0.96,
            g: 0.34,
            b: 0.10,
            a: 0.85,
            life: 0.38,
            maxLife: 0.38,
            gravity: 0,
          });
        }

        if (p >= m.interceptFrac) {
          this.resolveMeteorImpact(m, islandR, tier);
          this.siegeMeteors.splice(i, 1);
        }
      }

      if (this.siegeTimer <= 0 && this.siegeMeteors.length === 0) {
        this.underSiege = false;
        if (this.onSiegeComplete) {
          this.onSiegeComplete({ ...this.siegeStats, tier });
        }
      }
    }

    // Update Cannon Tracer Beams
    for (let i = this.cannonBeams.length - 1; i >= 0; i--) {
      const b = this.cannonBeams[i];
      b.life -= dt;
      if (b.life <= 0) this.cannonBeams.splice(i, 1);
    }

    // Update All GPU Particles
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const pt = this.particles[i];
      pt.life -= dt;
      if (pt.life <= 0) {
        this.particles.splice(i, 1);
        continue;
      }
      pt.vy -= (pt.gravity || 0) * dt;
      pt.x += pt.vx * dt;
      pt.y += pt.vy * dt;
      pt.z += pt.vz * dt;
      pt.size = Math.max(0.05, pt.size + (pt.grow || 0) * dt);
      pt.rot += dt * 1.2;
    }
  }

  resolveMeteorImpact(m, islandR, tier) {
    if (m.interceptMode === 'dragon') {
      this.siegeStats.intercepted++;
      this.dragonBreathTarget = [m.x, m.y, m.z];
      this.dragonBreathTimer = 0.32;
      if (this.audio && Math.random() < 0.45) this.audio.playDragonRoar();
      this.spawnBurst(m.x, m.y, m.z, PAL.gold, 18, 1);
      return;
    }

    if (m.interceptMode === 'cannon') {
      this.siegeStats.intercepted++;
      // Pick nearest symbol cannon or bastion turret to fire tracer beam
      const ang = Math.atan2(m.z, m.x);
      const ox = Math.cos(ang) * (islandR * 0.82);
      const oz = Math.sin(ang) * (islandR * 0.82);
      const oy = tier >= 4 ? 4.8 : 1.6;

      this.cannonBeams.push({
        x0: ox, y0: oy, z0: oz,
        x1: m.x, y1: m.y, z1: m.z,
        col: PAL.gold,
        life: 0.22,
        maxLife: 0.22,
      });

      // Trigger recoil on active symbol cannons
      for (const slot of this.charSlots) {
        if (slot.active && slot.charClass === 'symbol') slot.recoil = 1.0;
      }

      if (this.audio) this.audio.playCannonVolley();
      this.spawnBurst(m.x, m.y, m.z, PAL.amber, 16, 1);
      return;
    }

    if (m.interceptMode === 'shield') {
      this.siegeStats.intercepted++;
      const len = Math.hypot(m.x, m.y, m.z) || 1;
      this.shieldHit = [m.x / len, Math.max(0.12, m.y / len), m.z / len, 1.0];
      if (this.audio) this.audio.playShieldDeflect();
      this.spawnParticle({
        x: m.x, y: m.y, z: m.z,
        vx: 0, vy: 0, vz: 0,
        size: 0.6, grow: 7.5,
        rot: 0, kind: 2,
        r: PAL.turquoise[0], g: PAL.turquoise[1], b: PAL.turquoise[2], a: 0.95,
        life: 0.45, maxLife: 0.45, gravity: 0,
      });
      this.spawnBurst(m.x, m.y, m.z, PAL.turquoise, 14, 1);
      return;
    }

    if (m.interceptMode === 'wall') {
      this.siegeStats.intercepted++;
      this.cameraShake = Math.min(0.45, this.cameraShake + 0.16);
      if (this.audio) this.audio.playCannonVolley();
      this.spawnBurst(m.x, m.y, m.z, PAL.amber, 14, 1);
      return;
    }

    // Breach on weak Tier 0-2!
    this.siegeStats.breached++;
    this.cameraShake = Math.min(1.0, this.cameraShake + 0.48);
    this.impactFlash = Math.min(0.85, this.impactFlash + 0.42);
    if (this.audio) this.audio.playBreachAlarm();
    this.spawnBurst(m.x, m.y, m.z, PAL.siegeCore, 20, 1);
    if (this.breachFires.length < 6) {
      this.breachFires.push({ x: m.x, y: m.y, z: m.z, life: 4.8 });
    }
  }

  spawnBurst(x, y, z, col, count = 14, kind = 1) {
    for (let i = 0; i < count; i++) {
      const th = Math.random() * TAU;
      const ph = Math.acos(2 * Math.random() - 1);
      const spd = 2.8 + Math.random() * 5.2;
      this.spawnParticle({
        x, y, z,
        vx: Math.sin(ph) * Math.cos(th) * spd,
        vy: Math.abs(Math.cos(ph)) * spd + 1.2,
        vz: Math.sin(ph) * Math.sin(th) * spd,
        size: 0.34 + Math.random() * 0.24,
        grow: -0.15,
        rot: Math.random() * TAU,
        kind,
        r: col[0], g: col[1], b: col[2], a: 0.95,
        life: 0.55 + Math.random() * 0.35,
        maxLife: 0.9,
        gravity: 6.5,
      });
    }
  }

  // --- Draw Complete 6-Tier Procedural 3D Kingdom ---
  // drawFn(mesh, modelMat, col, matType, emissive, alpha, aoHint)
  render(drawFn, meshes, time) {
    const analysis = this.currentAnalysis;
    const tier = analysis ? analysis.tier : 0;
    const m = this.mat;

    const s1 = Math.max(0, this.tierSprings[1].x);
    const s2 = Math.max(0, this.tierSprings[2].x);
    const s3 = Math.max(0, this.tierSprings[3].x);
    const s4 = Math.max(0, this.tierSprings[4].x);
    const s5 = Math.max(0, this.tierSprings[5].x);
    const islandR = Math.max(2.0, this.islandRadiusSpring.x);

    // ------------------------------------------------------------------
    // TIER 0: Storm-Tossed Driftwood Raft + Tattered Flag + Circling Shark
    // (In Tier 1-2 moves out as coastal jetty raft; in Tier 3+ evolves into Harbor Brigantine!)
    // ------------------------------------------------------------------
    if (s3 < 0.85) {
      const raftScale = clamp(1.0 - s3, 0, 1);
      const raftDist = lerp(0, islandR + 2.4, clamp(s1, 0, 1));
      const stormFactor = clamp(1.0 - s1, 0, 1);
      const heave = Math.sin(time * 2.7) * (0.26 * stormFactor + 0.06) - this.cameraShake * 0.25;
      const pitch = Math.sin(time * 2.1 + 0.6) * (0.14 * stormFactor + 0.03) + this.cameraShake * 0.18;
      const roll = Math.cos(time * 2.4) * (0.16 * stormFactor + 0.03);

      // 6 driftwood logs lashed together
      for (let i = -2.5; i <= 2.5; i += 1.0) {
        const lx = raftDist + i * 0.44 * raftScale;
        M4.trs(m, lx, heave - 0.12, 0, Math.PI * 0.5 + pitch, 0, roll, 0.20 * raftScale, 1.85 * raftScale, 0.20 * raftScale);
        drawFn(meshes.cyl, m, PAL.oak, 1, 0, 1, 0.9);
      }
      // Crossbeam planks
      for (const zOff of [-0.95, 0.95]) {
        M4.trs(m, raftDist, heave + 0.04, zOff * raftScale, pitch, 0, roll, 2.7 * raftScale, 0.12 * raftScale, 0.34 * raftScale);
        drawFn(meshes.box, m, PAL.oakDark, 1, 0, 1, 0.85);
      }
      // Mast + fluttering tattered cloth flag + rum barrel + storm lantern
      M4.trs(m, raftDist - 0.3 * raftScale, heave + 1.45 * raftScale, 0, pitch, 0, roll, 0.09 * raftScale, 2.8 * raftScale, 0.09 * raftScale);
      drawFn(meshes.cyl, m, PAL.oakDark, 1, 0, 1, 1.0);

      const flap = Math.sin(time * 7.5) * 0.22;
      M4.trs(m, raftDist + 0.42 * raftScale, heave + 2.35 * raftScale, flap * 0.2, pitch, flap, roll, 1.35 * raftScale, 0.62 * raftScale, 0.06 * raftScale);
      drawFn(meshes.box, m, tier === 0 ? PAL.terracotta : PAL.sail, 1, 0, 1, 1.0);

      // Wooden barrel & flickering lantern crate on raft
      M4.trs(m, raftDist + 0.68 * raftScale, heave + 0.36 * raftScale, 0.48 * raftScale, pitch, 0.4, roll, 0.32 * raftScale, 0.56 * raftScale, 0.32 * raftScale);
      drawFn(meshes.cyl, m, PAL.oak, 1, 0, 1, 0.88);
      M4.trs(m, raftDist - 0.72 * raftScale, heave + 0.32 * raftScale, -0.45 * raftScale, pitch, 0, roll, 0.28 * raftScale, 0.38 * raftScale, 0.28 * raftScale);
      drawFn(meshes.box, m, PAL.amber, 5, 1.4, 1, 1.0);

      // Menacing Circling Shark Fin in Tier 0!
      if (stormFactor > 0.08) {
        const sharkAng = -time * 1.15;
        const sharkR = 4.6 + Math.sin(time * 0.8) * 0.55;
        const sx = Math.cos(sharkAng) * sharkR;
        const sz = Math.sin(sharkAng) * sharkR;
        const sy = Math.sin(time * 2.9 + sharkAng) * 0.18 - 0.14;
        M4.trs(m, sx, sy + 0.22 * stormFactor, sz, -0.28, -sharkAng, 0, 0.14 * stormFactor, 0.78 * stormFactor, 0.46 * stormFactor);
        drawFn(meshes.cone, m, PAL.iron, 1, 0, 1, 0.8);
      }
    }

    // ------------------------------------------------------------------
    // TIER 1: Emergent Grassy Island, Timber Palisade & Flickering Campfire
    // ------------------------------------------------------------------
    if (s1 > 0.01) {
      const islScaleY = (1.65 + s2 * 0.55 + s3 * 0.45) * s1;
      M4.trs(m, 0, -0.15, 0, 0, 0, 0, islandR, islScaleY, islandR);
      drawFn(meshes.island, m, PAL.meadow, 2, 0, 1, 1.0);

      // Sandy / Limestone Shoreline Collar
      M4.trs(m, 0, -0.26, 0, 0, 0.2, 0, islandR * 1.05, 0.35 * s1, islandR * 1.05);
      drawFn(meshes.cyl, m, PAL.limestone, 0, 0, 1, 0.85);

      // Timber Palisade Stakes (visible in Tier 1, replaced/upgraded by Stone Curtain Walls in Tier 2)
      const palScale = clamp(s1 * (1.0 - s2 * 0.92), 0, 1);
      if (palScale > 0.03) {
        const stakeCount = 26;
        for (let i = 0; i < stakeCount; i++) {
          if (i === 0 || i === 1) continue; // Gate opening
          const a = (i / stakeCount) * TAU;
          const rP = islandR * 0.87;
          M4.trs(m, Math.cos(a) * rP, 0.85 * palScale, Math.sin(a) * rP, 0, -a, 0, 0.18 * palScale, 1.55 * palScale, 0.18 * palScale);
          drawFn(meshes.cyl, m, PAL.oak, 1, 0, 1, 0.85);
          M4.trs(m, Math.cos(a) * rP, 1.82 * palScale, Math.sin(a) * rP, 0, -a, 0, 0.19 * palScale, 0.45 * palScale, 0.19 * palScale);
          drawFn(meshes.cone, m, PAL.oakDark, 1, 0, 1, 0.95);
        }
      }

      // Coastal Pine / Cypress Trees dotting the emerald meadow
      const treeCount = 7;
      for (let i = 0; i < treeCount; i++) {
        const a = i * 0.897 + 0.42;
        const tr = islandR * (0.48 + (i % 3) * 0.11);
        const tx = Math.cos(a) * tr;
        const tz = Math.sin(a) * tr;
        const ts = s1 * (0.75 + (i % 2) * 0.22);
        M4.trs(m, tx, 0.55 * ts, tz, 0, 0, 0, 0.14 * ts, 0.75 * ts, 0.14 * ts);
        drawFn(meshes.cyl, m, PAL.oakDark, 1, 0, 1, 0.8);
        M4.trs(m, tx, 1.25 * ts, tz, 0, a, 0, 0.62 * ts, 1.35 * ts, 0.62 * ts);
        drawFn(meshes.cone, m, PAL.pine, 1, 0, 1, 0.92);
        M4.trs(m, tx, 1.85 * ts, tz, 0, -a, 0, 0.45 * ts, 1.05 * ts, 0.45 * ts);
        drawFn(meshes.cone, m, PAL.meadow, 1, 0, 1, 1.0);
      }

      // Flickering 3D Central Campfire (Tier 1-2, superseded by Grand Keep in Tier 3)
      const fireScale = clamp(s1 * (1.0 - s3 * 0.95), 0, 1);
      if (fireScale > 0.03) {
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * TAU;
          M4.trs(m, Math.cos(a) * 0.72 * fireScale, 0.48 * fireScale, Math.sin(a) * 0.72 * fireScale, 0.2, a, 0, 0.26 * fireScale, 0.22 * fireScale, 0.26 * fireScale);
          drawFn(meshes.box, m, PAL.stoneTrim, 0, 0, 1, 0.85);
        }
        const flick = 0.85 + 0.22 * Math.sin(time * 14.0);
        M4.trs(m, 0, 0.82 * fireScale, 0, 0, time * 2.5, 0, 0.48 * fireScale, 0.95 * fireScale * flick, 0.48 * fireScale);
        drawFn(meshes.cone, m, PAL.amber, 5, 1.85, 1, 1.0);
        M4.trs(m, 0, 0.72 * fireScale, 0, 0, -time * 3.5, 0, 0.28 * fireScale, 0.65 * fireScale * flick, 0.28 * fireScale);
        drawFn(meshes.cone, m, PAL.gold, 5, 2.2, 1, 1.0);
      }
    }

    // ------------------------------------------------------------------
    // TIER 2: Carved Stone Curtain Walls, Spinning Windmill & Gatehouse
    // ------------------------------------------------------------------
    if (s2 > 0.01) {
      const wallSegs = 10;
      const wallR = islandR * 0.84;
      for (let i = 0; i < wallSegs; i++) {
        const a0 = (i / wallSegs) * TAU;
        const a1 = ((i + 1) / wallSegs) * TAU;
        const midA = (a0 + a1) * 0.5;
        const wx = Math.cos(midA) * wallR;
        const wz = Math.sin(midA) * wallR;
        const segLen = 2.0 * wallR * Math.sin(Math.PI / wallSegs);

        if (i === 0) {
          // Arched Stone Bridge & Iron Portcullis Gatehouse at front (angle ~ 0)
          for (const side of [-1, 1]) {
            M4.trs(m, wx + Math.sin(midA) * side * 1.15, 1.55 * s2, wz - Math.cos(midA) * side * 1.15, 0, -midA, 0, 1.05 * s2, 3.1 * s2, 1.05 * s2);
            drawFn(meshes.box, m, PAL.limestone, 0, 0, 1, 0.92);
            M4.trs(m, wx + Math.sin(midA) * side * 1.15, 3.45 * s2, wz - Math.cos(midA) * side * 1.15, 0, -midA, 0, 0.82 * s2, 0.95 * s2, 0.82 * s2);
            drawFn(meshes.cone, m, PAL.terracotta, 1, 0, 1, 1.0);
          }
          // Gatehouse lintel & iron portcullis
          M4.trs(m, wx, 2.45 * s2, wz, 0, -midA + Math.PI * 0.5, 0, 2.2 * s2, 0.85 * s2, 0.95 * s2);
          drawFn(meshes.box, m, PAL.limestone, 0, 0, 1, 0.9);
          M4.trs(m, wx, 1.15 * s2, wz, 0, -midA + Math.PI * 0.5, 0, 1.45 * s2, 1.85 * s2, 0.22 * s2);
          drawFn(meshes.box, m, PAL.iron, 0, 0, 1, 0.65);
          // Stone causeway bridge extending seaward
          const bx = Math.cos(midA) * (wallR + 1.8);
          const bz = Math.sin(midA) * (wallR + 1.8);
          M4.trs(m, bx, 0.35 * s2, bz, 0, -midA + Math.PI * 0.5, 0, 1.65 * s2, 0.45 * s2, 3.2 * s2);
          drawFn(meshes.box, m, PAL.stoneTrim, 0, 0, 1, 0.88);
        } else {
          // Carved Curtain Wall Segment + Crenelations
          M4.trs(m, wx, 1.18 * s2, wz, 0, -midA + Math.PI * 0.5, 0, segLen * s2, 2.15 * s2, 0.68 * s2);
          drawFn(meshes.box, m, PAL.limestone, 0, 0, 1, 0.88);
          // Corner Bastion Turret
          const cx = Math.cos(a0) * wallR;
          const cz = Math.sin(a0) * wallR;
          M4.trs(m, cx, 1.45 * s2, cz, 0, 0, 0, 0.68 * s2, 2.75 * s2, 0.68 * s2);
          drawFn(meshes.taperCyl, m, PAL.limestone, 0, 0, 1, 0.92);
          M4.trs(m, cx, 2.92 * s2, cz, 0, 0, 0, 0.76 * s2, 0.35 * s2, 0.76 * s2);
          drawFn(meshes.cyl, m, PAL.stoneTrim, 0, 0, 1, 1.0);
        }
      }

      // Spinning 4-Blade Wooden & Canvas Windmill on West Hill
      const wmX = -islandR * 0.44;
      const wmZ = -islandR * 0.32;
      M4.trs(m, wmX, 1.85 * s2, wmZ, 0, 0, 0, 1.05 * s2, 3.1 * s2, 1.05 * s2);
      drawFn(meshes.taperCyl, m, PAL.limestone, 0, 0, 1, 0.92);
      M4.trs(m, wmX, 3.78 * s2, wmZ, 0, 0, 0, 1.08 * s2, 1.05 * s2, 1.08 * s2);
      drawFn(meshes.cone, m, PAL.terracotta, 1, 0, 1, 1.0);

      // Rotating 4 Windmill Blades
      const spin = time * 1.65;
      for (let b = 0; b < 4; b++) {
        const ba = spin + b * (Math.PI * 0.5);
        const hubX = wmX + 0.86 * s2;
        const hubY = 2.85 * s2;
        const dy = Math.sin(ba) * 1.25 * s2;
        const dz = Math.cos(ba) * 1.25 * s2;
        M4.trs(m, hubX, hubY + dy, wmZ + dz, -ba, 0, 0, 0.10 * s2, 0.42 * s2, 2.35 * s2);
        drawFn(meshes.box, m, PAL.sail, 1, 0, 1, 1.0);
        M4.trs(m, hubX - 0.04, hubY + dy, wmZ + dz, -ba, 0, 0, 0.12 * s2, 0.09 * s2, 2.45 * s2);
        drawFn(meshes.box, m, PAL.oakDark, 1, 0, 1, 0.95);
      }
    }

    // ------------------------------------------------------------------
    // TIER 3: Grand Central Castle Keep, Harbor Lighthouse & Sailing Brigantine
    // ------------------------------------------------------------------
    const keepLift = s4 * (3.85 + Math.sin(time * 1.45) * 0.28);
    if (s3 > 0.01) {
      // Central Sovereign Keep Body
      M4.trs(m, 0, (2.55 + keepLift) * s3, 0, 0, 0, 0, 4.1 * s3, 4.6 * s3, 4.1 * s3);
      drawFn(meshes.box, m, PAL.limestone, 0, 0, 1, 0.94);

      // Upper Royal Hall + Terracotta Hipped Roof
      M4.trs(m, 0, (5.55 + keepLift) * s3, 0, 0, 0, 0, 2.85 * s3, 2.45 * s3, 2.85 * s3);
      drawFn(meshes.box, m, PAL.limestone, 0, 0, 1, 0.98);
      M4.trs(m, 0, (6.75 + keepLift) * s3, 0, 0, 0, 0, 3.05 * s3, 2.2 * s3, 3.05 * s3);
      drawFn(meshes.roof, m, PAL.terracotta, 1, 0, 1, 1.0);

      // Glowing Mullioned Amber Windows on 4 sides of Keep
      for (let f = 0; f < 4; f++) {
        const fa = f * (Math.PI * 0.5);
        const wx = Math.cos(fa) * 2.08 * s3;
        const wz = Math.sin(fa) * 2.08 * s3;
        M4.trs(m, wx, (3.2 + keepLift) * s3, wz, 0, -fa + Math.PI * 0.5, 0, 0.85 * s3, 1.15 * s3, 0.08 * s3);
        drawFn(meshes.box, m, PAL.windowGlow, 5, 1.35, 1, 1.0);
      }

      // 4 Tall Corner Keep Turrets + Fluttering Sandstone Gold Banners
      for (const sx of [-1, 1]) {
        for (const sz of [-1, 1]) {
          const tx = sx * 2.15 * s3;
          const tz = sz * 2.15 * s3;
          M4.trs(m, tx, (3.25 + keepLift) * s3, tz, 0, 0, 0, 0.88 * s3, 5.9 * s3, 0.88 * s3);
          drawFn(meshes.taperCyl, m, PAL.limestone, 0, 0, 1, 0.95);
          M4.trs(m, tx, (6.78 + keepLift) * s3, tz, 0, 0, 0, 1.05 * s3, 1.65 * s3, 1.05 * s3);
          drawFn(meshes.cone, m, PAL.terracotta, 1, 0, 1, 1.0);

          // Royal Golden Banner Pole & Fluttering Pennant
          M4.trs(m, tx, (8.15 + keepLift) * s3, tz, 0, 0, 0, 0.06 * s3, 1.45 * s3, 0.06 * s3);
          drawFn(meshes.cyl, m, PAL.brass, 3, 0, 1, 1.0);
          const wave = Math.sin(time * 5.8 + sx + sz) * 0.22;
          M4.trs(m, tx + 0.48 * s3, (8.55 + keepLift) * s3, tz + wave * 0.2, 0, wave, 0, 0.95 * s3, 0.42 * s3, 0.05 * s3);
          drawFn(meshes.box, m, PAL.gold, 3, 0.25, 1, 1.0);
        }
      }

      // Harbor Lighthouse on South-East Promontory with Rotating Golden Beam!
      const lhAng = 0.68;
      const lhX = Math.cos(lhAng) * (islandR * 0.78);
      const lhZ = Math.sin(lhAng) * (islandR * 0.78);
      M4.trs(m, lhX, 2.45 * s3, lhZ, 0, 0, 0, 0.78 * s3, 4.4 * s3, 0.78 * s3);
      drawFn(meshes.taperCyl, m, PAL.limestone, 0, 0, 1, 0.95);
      // Terracotta stripe band & Brass Lantern Room
      M4.trs(m, lhX, 3.1 * s3, lhZ, 0, 0, 0, 0.69 * s3, 0.95 * s3, 0.69 * s3);
      drawFn(meshes.cyl, m, PAL.terracotta, 1, 0, 1, 0.95);
      M4.trs(m, lhX, 4.95 * s3, lhZ, 0, 0, 0, 0.58 * s3, 0.85 * s3, 0.58 * s3);
      drawFn(meshes.cyl, m, PAL.gold, 5, 1.9, 1, 1.0);
      M4.trs(m, lhX, 5.65 * s3, lhZ, 0, 0, 0, 0.72 * s3, 0.75 * s3, 0.72 * s3);
      drawFn(meshes.cone, m, PAL.brass, 3, 0, 1, 1.0);

      // Sweeping translucent volumetric light cone from lighthouse
      const beamAng = time * 1.15;
      const bEndX = lhX + Math.cos(beamAng) * 14.0;
      const bEndZ = lhZ + Math.sin(beamAng) * 14.0;
      M4.beamBetween(m, lhX, 4.95 * s3, lhZ, bEndX, 1.2, bEndZ, 0.52 * s3);
      drawFn(meshes.beam, m, PAL.gold, 5, 1.5, 0.26 * s3, 1.0);

      // Moored Royal Sailing Brigantine rocking gently outside the Gatehouse!
      const shipX = islandR + 3.8;
      const shipZ = -1.6;
      const shipRock = Math.sin(time * 1.8) * 0.06;
      const shipHeave = Math.sin(time * 2.1) * 0.12;
      M4.trs(m, shipX, shipHeave + 0.35 * s3, shipZ, shipRock, 0.18, 0, 1.35 * s3, 0.95 * s3, 4.2 * s3);
      drawFn(meshes.box, m, PAL.oakDark, 1, 0, 1, 0.88);
      // Gold stern trim
      M4.trs(m, shipX, shipHeave + 0.88 * s3, shipZ - 1.75 * s3, shipRock, 0.18, 0, 1.42 * s3, 0.65 * s3, 0.95 * s3);
      drawFn(meshes.box, m, PAL.gold, 3, 0, 1, 0.95);
      // Fore & Main Masts + Square Rigged Sails
      for (const mz of [-0.65, 0.95]) {
        M4.trs(m, shipX + mz * 0.18, shipHeave + 2.35 * s3, shipZ + mz * s3, shipRock, 0.18, 0, 0.11 * s3, 3.6 * s3, 0.11 * s3);
        drawFn(meshes.cyl, m, PAL.oak, 1, 0, 1, 1.0);
        M4.trs(m, shipX + mz * 0.18 + 0.12, shipHeave + 2.55 * s3, shipZ + mz * s3, shipRock, 0.18, 0, 0.18 * s3, 1.75 * s3, 2.05 * s3);
        drawFn(meshes.box, m, PAL.sail, 1, 0, 1, 1.0);
      }
    }

    // ------------------------------------------------------------------
    // TIER 4: Elevated Sky-Citadel Terraces, Waterfalls, Solar Astrolabe & Zeppelin
    // ------------------------------------------------------------------
    if (s4 > 0.01) {
      // Levitating Upper Citadel Terrace Plinth + Glowing Under-Crystal Core
      M4.trs(m, 0, keepLift * s4, 0, 0, 0.39, 0, 6.9 * s4, 1.45 * s4, 6.9 * s4);
      drawFn(meshes.island, m, PAL.meadow, 2, 0, 1, 0.95);
      M4.trs(m, 0, (keepLift - 1.35) * s4, 0, 0, time * 1.2, 0, 1.65 * s4, 1.85 * s4, 1.65 * s4);
      drawFn(meshes.octa, m, PAL.turquoise, 5, 1.7, 1, 1.0);

      // 4 Rim Waterfall Cascades pouring off the Sky Terrace into the lagoon!
      for (let i = 0; i < 4; i++) {
        const wa = i * (Math.PI * 0.5);
        const wx = Math.cos(wa) * 6.55 * s4;
        const wz = Math.sin(wa) * 6.55 * s4;
        const fallH = Math.max(1.0, keepLift + 0.35);
        M4.trs(m, wx, (fallH * 0.5 - 0.2) * s4, wz, 0, -wa + Math.PI * 0.5, 0, 1.15 * s4, fallH * s4, 0.26 * s4);
        drawFn(meshes.box, m, PAL.turquoise, 4, 0.65, 0.86 * s4, 1.0);
      }

      // 3 Gimbaled Rotating Brass Solar Astrolabe Rings crowning the Keep!
      const astroY = (9.4 + keepLift) * s4;
      M4.trs(m, 0, astroY, 0, time * 0.95, time * 0.65, 0.35, 3.15 * s4, 3.15 * s4, 3.15 * s4);
      drawFn(meshes.torus, m, PAL.brass, 3, 0.15, 1, 1.0);
      M4.trs(m, 0, astroY, 0, -time * 1.25, 0.5, time * 0.85, 2.45 * s4, 2.45 * s4, 2.45 * s4);
      drawFn(meshes.torus, m, PAL.gold, 3, 0.25, 1, 1.0);
      M4.trs(m, 0, astroY, 0, 0.8, -time * 1.6, -time * 0.7, 1.75 * s4, 1.75 * s4, 1.75 * s4);
      drawFn(meshes.torus, m, PAL.turquoise, 5, 1.4, 1, 1.0);

      // Cruising Royal Zeppelin Airship orbiting the Sky Citadel!
      const zepAng = -time * 0.38;
      const zepR = islandR + 4.8;
      const zx = Math.cos(zepAng) * zepR;
      const zz = Math.sin(zepAng) * zepR;
      const zy = 9.2 + Math.sin(time * 1.5) * 0.45;
      const zepYaw = -zepAng;

      // Envelope balloon (elongated sphere along Z) + golden trim band + gondola
      M4.trs(m, zx, zy, zz, 0, zepYaw, 0, 1.15 * s4, 1.15 * s4, 2.85 * s4);
      drawFn(meshes.sphere, m, PAL.sail, 1, 0, 1, 1.0);
      M4.trs(m, zx, zy, zz, Math.PI * 0.5, zepYaw, 0, 1.18 * s4, 0.45 * s4, 1.18 * s4);
      drawFn(meshes.cyl, m, PAL.gold, 3, 0.1, 1, 1.0);
      M4.trs(m, zx, zy - 1.28 * s4, zz, 0, zepYaw, 0, 0.65 * s4, 0.48 * s4, 1.55 * s4);
      drawFn(meshes.box, m, PAL.oakDark, 1, 0, 1, 0.9);
      // Tail fins
      M4.trs(m, zx - Math.sin(zepYaw) * 2.4 * s4, zy, zz - Math.cos(zepYaw) * 2.4 * s4, 0, zepYaw, time * 12.0, 0.95 * s4, 0.12 * s4, 0.12 * s4);
      drawFn(meshes.box, m, PAL.brass, 3, 0, 1, 1.0);
    }

    // ------------------------------------------------------------------
    // TIER 5: Sovereign Solar Spire, Outer Sanctuary Monoliths & Articulated Golden Dragon!
    // ------------------------------------------------------------------
    if (s5 > 0.01) {
      const spireY = (9.4 + keepLift) * s5;
      M4.trs(m, 0, spireY, 0, 0, time * 2.2, 0, 0.85 * s5, 1.45 * s5, 0.85 * s5);
      drawFn(meshes.octa, m, PAL.gold, 5, 2.4, 1, 1.0);
      // Vertical sovereign sunbeam pillar
      M4.trs(m, 0, spireY + 5.5 * s5, 0, 0, 0, 0, 0.24 * s5, 11.0 * s5, 0.24 * s5);
      drawFn(meshes.cyl, m, PAL.gold, 5, 2.0, 0.34 * s5, 1.0);

      // 6 Floating Outer Runic Sanctuary Monoliths
      for (let i = 0; i < 6; i++) {
        const ma = (i / 6) * TAU + time * 0.16;
        const mr = islandR + 2.8;
        const my = 4.6 + Math.sin(time * 1.9 + i * 1.1) * 0.55;
        M4.trs(m, Math.cos(ma) * mr, my * s5, Math.sin(ma) * mr, 0, -ma, 0, 0.48 * s5, 1.85 * s5, 0.48 * s5);
        drawFn(meshes.box, m, PAL.limestone, 0, 0, 1, 0.95);
        M4.trs(m, Math.cos(ma) * mr, (my + 1.45) * s5, Math.sin(ma) * mr, 0, time * 2.4 + i, 0, 0.38 * s5, 0.62 * s5, 0.38 * s5);
        drawFn(meshes.octa, m, PAL.gold, 5, 1.8, 1, 1.0);
      }

      // ARTICULATED 3D GOLDEN GUARDIAN DRAGON flapping in banking orbit!
      this.renderGoldenDragon(drawFn, meshes, time, s5);
    }

    // ------------------------------------------------------------------
    // PER-CHARACTER SPAWNED STRUCTURES (Elastic Spring Pop-In!)
    // ------------------------------------------------------------------
    for (let i = 0; i < MAX_CHAR_SLOTS; i++) {
      const slot = this.charSlots[i];
      const sc = slot.spring.x;
      if (sc <= 0.02) continue;

      const plc = this.getSlotPlacement(slot, islandR, tier);
      const rand = mulberry32(slot.seed);
      const hVar = 0.85 + rand() * 0.38;

      if (tier === 0) {
        // Extra raft deck timber module + cargo crate/lantern per typed character!
        const heave = Math.sin(time * 2.7 + i * 0.5) * 0.24;
        M4.trs(m, plc.x, heave + 0.08, plc.z, 0, plc.yaw, 0, 0.65 * sc, 0.14 * sc, 0.65 * sc);
        drawFn(meshes.box, m, PAL.oak, 1, 0, 1, 0.88);
        M4.trs(m, plc.x, heave + 0.32 * sc, plc.z, 0, plc.yaw + 0.3, 0, 0.34 * sc, 0.34 * sc, 0.34 * sc);
        drawFn(
          meshes.box,
          m,
          slot.charClass === 'symbol' ? PAL.brass : slot.charClass === 'digit' ? PAL.amber : PAL.oakDark,
          slot.charClass === 'symbol' ? 3 : 1,
          slot.charClass === 'digit' ? 0.9 : 0,
          1,
          0.95
        );
        continue;
      }

      if (slot.charClass === 'lower') {
        // Cozy Limestone & Timber Cottage with Terracotta Gabled Roof & Glowing Window!
        const ch = 0.95 * hVar * sc;
        M4.trs(m, plc.x, plc.y + ch * 0.5, plc.z, 0, plc.yaw, 0, 0.92 * sc, ch, 1.08 * sc);
        drawFn(meshes.box, m, PAL.limestone, 0, 0, 1, 0.9);
        M4.trs(m, plc.x, plc.y + ch, plc.z, 0, plc.yaw, 0, 1.02 * sc, 0.72 * sc, 1.15 * sc);
        drawFn(meshes.roof, m, PAL.terracotta, 1, 0, 1, 1.0);
        // Glowing cottage window
        M4.trs(
          m,
          plc.x + Math.sin(plc.yaw) * 0.55 * sc,
          plc.y + ch * 0.52,
          plc.z + Math.cos(plc.yaw) * 0.55 * sc,
          0, plc.yaw, 0,
          0.32 * sc, 0.32 * sc, 0.06 * sc
        );
        drawFn(meshes.box, m, PAL.windowGlow, 5, 1.35, 1, 1.0);
      } else if (slot.charClass === 'digit') {
        // Tall Timber & Stone Watchtower with Pointed Roof & Brazier!
        const th = 2.05 * hVar * sc;
        M4.trs(m, plc.x, plc.y + th * 0.5, plc.z, 0, plc.yaw, 0, 0.68 * sc, th, 0.68 * sc);
        drawFn(meshes.box, m, PAL.oak, 1, 0, 1, 0.9);
        M4.trs(m, plc.x, plc.y + th + 0.18 * sc, plc.z, 0, plc.yaw, 0, 0.88 * sc, 0.36 * sc, 0.88 * sc);
        drawFn(meshes.box, m, PAL.oakDark, 1, 0, 1, 0.95);
        M4.trs(m, plc.x, plc.y + th + 0.76 * sc, plc.z, 0, plc.yaw, 0, 0.62 * sc, 0.85 * sc, 0.62 * sc);
        drawFn(meshes.cone, m, PAL.terracotta, 1, 0, 1, 1.0);
      } else if (slot.charClass === 'upper') {
        // Crenelated Stone Bastion Tower with Golden Pennant!
        const bh = 2.45 * hVar * sc;
        M4.trs(m, plc.x, plc.y + bh * 0.5, plc.z, 0, 0, 0, 0.58 * sc, bh, 0.58 * sc);
        drawFn(meshes.taperCyl, m, PAL.limestone, 0, 0, 1, 0.92);
        M4.trs(m, plc.x, plc.y + bh + 0.16 * sc, plc.z, 0, 0, 0, 0.68 * sc, 0.34 * sc, 0.68 * sc);
        drawFn(meshes.cyl, m, PAL.stoneTrim, 0, 0, 1, 1.0);
        M4.trs(m, plc.x + 0.25 * sc, plc.y + bh + 0.72 * sc, plc.z, 0, Math.sin(time * 5 + i) * 0.25, 0, 0.52 * sc, 0.26 * sc, 0.05 * sc);
        drawFn(meshes.box, m, PAL.gold, 3, 0.2, 1, 1.0);
      } else if (slot.charClass === 'symbol') {
        // Forged Brass Rampart Cannon on Oak Gun Carriage!
        const rec = slot.recoil * 0.28;
        const rx = plc.x - Math.sin(plc.yaw) * rec;
        const rz = plc.z - Math.cos(plc.yaw) * rec;
        M4.trs(m, rx, plc.y + 0.26 * sc, rz, 0, plc.yaw, 0, 0.58 * sc, 0.36 * sc, 0.88 * sc);
        drawFn(meshes.box, m, PAL.oakDark, 1, 0, 1, 0.88);
        // Forged Brass Cannon Barrel tilted seaward
        M4.trs(
          m,
          rx + Math.sin(plc.yaw) * 0.25 * sc,
          plc.y + 0.55 * sc,
          rz + Math.cos(plc.yaw) * 0.25 * sc,
          1.32, plc.yaw, 0,
          0.20 * sc, 1.25 * sc, 0.20 * sc
        );
        drawFn(meshes.taperCyl, m, PAL.brass, 3, slot.recoil > 0.2 ? 0.8 : 0.05, 1, 1.0);
      } else {
        // Unicode / CJK: Sovereign Golden Runic Obelisk with Levitating Crystal!
        const oh = 2.2 * hVar * sc;
        M4.trs(m, plc.x, plc.y + oh * 0.45, plc.z, 0, plc.yaw, 0, 0.52 * sc, oh, 0.52 * sc);
        drawFn(meshes.taperCyl, m, PAL.gold, 3, 0.22, 1, 0.98);
        const bob = Math.sin(time * 2.8 + i) * 0.18;
        M4.trs(m, plc.x, plc.y + oh + 0.55 * sc + bob, plc.z, 0, time * 2.5 + i, 0, 0.34 * sc, 0.52 * sc, 0.34 * sc);
        drawFn(meshes.octa, m, PAL.turquoise, 5, 1.85, 1, 1.0);
      }
    }

    // ------------------------------------------------------------------
    // ACTIVE SIEGE METEORS & CANNON INTERCEPTOR BEAMS
    // ------------------------------------------------------------------
    for (const sm of this.siegeMeteors) {
      M4.trs(m, sm.x, sm.y, sm.z, sm.rot, sm.rot * 0.7, 0, 0.92, 0.92, 0.92);
      drawFn(meshes.octa, m, PAL.siegeHull, 0, 0, 1, 0.8);
      M4.trs(m, sm.x, sm.y, sm.z, -sm.rot, 0, sm.rot, 0.68, 0.68, 0.68);
      drawFn(meshes.octa, m, PAL.siegeCore, 5, 2.2, 0.9, 1.0);
    }

    for (const cb of this.cannonBeams) {
      const fade = cb.life / cb.maxLife;
      M4.beamBetween(m, cb.x0, cb.y0, cb.z0, cb.x1, cb.y1, cb.z1, 0.14 * fade);
      drawFn(meshes.beam, m, cb.col, 5, 2.4, fade * 0.92, 1.0);
    }
  }

  renderGoldenDragon(drawFn, meshes, time, scale) {
    const m = this.mat;
    const baseAng = time * 0.88;
    const orbitR = 12.2 + Math.sin(time * 0.7) * 1.8;

    // 9 Sinuous Spine & Tail Segments + Horned Head + Flapping 2-Jointed Wings!
    const segCount = 9;
    for (let s = 0; s < segCount; s++) {
      const lag = s * 0.085;
      const ang = baseAng - lag;
      const r = orbitR + Math.sin(time * 2.4 - s * 0.55) * 0.32;
      const px = Math.cos(ang) * r;
      const pz = Math.sin(ang) * r;
      const py = 13.2 + Math.sin(time * 1.75 - lag * 1.8) * 1.35 + Math.sin(time * 5.2 - s * 0.75) * 0.24;

      // Tangent heading along counter-clockwise orbit: (-sin(ang), 0, cos(ang))
      const yaw = -ang;
      const bank = 0.34;
      const taper = 1.0 - (s / segCount) * 0.72;
      const bodyS = scale * taper;

      if (s === 0) {
        // Sculpted Golden Dragon Head + Snout + Twin Horns + Emerald Eyes
        M4.trs(m, px, py, pz, 0.08, yaw, bank, 0.78 * bodyS, 0.68 * bodyS, 1.15 * bodyS);
        drawFn(meshes.box, m, PAL.gold, 3, 0.35, 1, 1.0);
        // Snout
        const fwdX = Math.sin(yaw);
        const fwdZ = Math.cos(yaw);
        const rgtX = Math.cos(yaw);
        const rgtZ = -Math.sin(yaw);
        M4.trs(
          m,
          px + fwdX * 0.82 * bodyS,
          py - 0.08 * bodyS,
          pz + fwdZ * 0.82 * bodyS,
          0.12, yaw, bank,
          0.52 * bodyS, 0.44 * bodyS, 0.75 * bodyS
        );
        drawFn(meshes.box, m, PAL.gold, 3, 0.4, 1, 1.0);
        // Swept-back golden horns
        for (const side of [-1, 1]) {
          const hx = px + rgtX * side * 0.32 * bodyS - fwdX * 0.35 * bodyS;
          const hz = pz + rgtZ * side * 0.32 * bodyS - fwdZ * 0.35 * bodyS;
          M4.trs(m, hx, py + 0.55 * bodyS, hz, -0.75, yaw, side * 0.25, 0.14 * bodyS, 0.95 * bodyS, 0.14 * bodyS);
          drawFn(meshes.cone, m, PAL.amber, 5, 1.4, 1, 1.0);
        }
      } else {
        // Articulated Golden Scale Segment + Dorsal Crest
        M4.trs(m, px, py, pz, 0, yaw, bank, 0.62 * bodyS, 0.58 * bodyS, 0.95 * bodyS);
        drawFn(meshes.sphere, m, s % 2 === 0 ? PAL.gold : PAL.brass, 3, 0.25, 1, 1.0);
        M4.trs(m, px, py + 0.52 * bodyS, pz, -0.35, yaw, bank, 0.12 * bodyS, 0.48 * bodyS, 0.32 * bodyS);
        drawFn(meshes.cone, m, PAL.amber, 5, 1.2, 1, 1.0);
      }

      // Articulated 2-Jointed Flapping Wings attached to Thorax (s === 2)
      if (s === 2) {
        const flap = Math.sin(time * 5.6) * 0.68;
        const outerFlap = Math.sin(time * 5.6 - 0.55) * 0.82;
        const rightX = Math.cos(yaw);
        const rightZ = -Math.sin(yaw);

        for (const side of [-1, 1]) {
          // Inner Wing Span
          const w1Len = 2.15 * scale;
          const w1Roll = side * flap;
          const midX = px + rightX * side * Math.cos(flap) * w1Len * 0.5;
          const midY = py + Math.sin(flap) * w1Len * 0.5;
          const midZ = pz + rightZ * side * Math.cos(flap) * w1Len * 0.5;

          M4.trs(m, midX, midY, midZ, 0, yaw, w1Roll, w1Len, 0.09 * scale, 1.55 * scale);
          drawFn(meshes.box, m, PAL.gold, 3, 0.35, 1, 1.0);

          // Outer Wing Tip Membrane
          const tipBaseX = px + rightX * side * Math.cos(flap) * w1Len;
          const tipBaseY = py + Math.sin(flap) * w1Len;
          const tipBaseZ = pz + rightZ * side * Math.cos(flap) * w1Len;
          const w2Len = 1.85 * scale;
          const outerX = tipBaseX + rightX * side * Math.cos(outerFlap) * w2Len * 0.5;
          const outerY = tipBaseY + Math.sin(outerFlap) * w2Len * 0.5;
          const outerZ = tipBaseZ + rightZ * side * Math.cos(outerFlap) * w2Len * 0.5;

          M4.trs(m, outerX, outerY, outerZ, 0, yaw - side * 0.22, side * outerFlap, w2Len, 0.06 * scale, 1.15 * scale);
          drawFn(meshes.box, m, PAL.amber, 5, 1.25, 0.92, 1.0);
        }
      }

      // Tail Flame Spade (last segment)
      if (s === segCount - 1) {
        M4.trs(m, px, py, pz, Math.PI * 0.5, yaw, 0, 0.45 * scale, 0.95 * scale, 0.14 * scale);
        drawFn(meshes.octa, m, PAL.turquoise, 5, 1.65, 1, 1.0);
      }
    }
  }
}
