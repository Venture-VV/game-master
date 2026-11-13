// Procedural 420m x 420m Manhattan Open-World District:
// 42+ Skyscrapers (Empire, Chrysler, Times Square, Glass Curtain), Central Park + Pond,
// East River Suspension Bridge + 5 Stunt Ramps, 18 Traffic Vehicles, 28 Hydrants + 24 Cones & Muscle Coupe

import {
  M4,
  BLOCK_CENTERS,
  ROAD_CENTERS,
  STUNT_RAMPS,
  CROSSTOWN_BEACONS,
  isCentralParkBlock,
  bridgeDeckHeight,
  stuntRampHeight,
  getGroundHeight,
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

// Unit Cube Face Table
const BOX_FACES = [
  [[0, 0, 1], [-0.5, -0.5, 0.5], [0.5, -0.5, 0.5], [0.5, 0.5, 0.5], [-0.5, 0.5, 0.5]],
  [[0, 0, -1], [0.5, -0.5, -0.5], [-0.5, -0.5, -0.5], [-0.5, 0.5, -0.5], [0.5, 0.5, -0.5]],
  [[0, 1, 0], [-0.5, 0.5, 0.5], [0.5, 0.5, 0.5], [0.5, 0.5, -0.5], [-0.5, 0.5, -0.5]],
  [[0, -1, 0], [-0.5, -0.5, -0.5], [0.5, -0.5, -0.5], [0.5, -0.5, 0.5], [-0.5, -0.5, 0.5]],
  [[1, 0, 0], [0.5, -0.5, 0.5], [0.5, -0.5, -0.5], [0.5, 0.5, -0.5], [0.5, 0.5, 0.5]],
  [[-1, 0, 0], [-0.5, -0.5, -0.5], [-0.5, -0.5, 0.5], [-0.5, 0.5, 0.5], [-0.5, 0.5, -0.5]],
];

// Fast Static Geometry Batcher so 42+ Skyscrapers, Trees, Bridge & Billboards draw in 7 GPU calls!
class StaticBatch {
  constructor() {
    this.pos = [];
    this.norm = [];
    this.uv = [];
    this.tint = [];
    this.idx = [];
  }

  addBox(tx, ty, tz, sx, sy, sz, col, ry = 0, skipBottom = true) {
    const c = Math.cos(ry), s = Math.sin(ry);
    for (let fi = 0; fi < 6; fi++) {
      if (skipBottom && fi === 3) continue;
      const [n, p0, p1, p2, p3] = BOX_FACES[fi];
      const base = this.pos.length / 3;
      const nx = n[0] * c + n[2] * s;
      const ny = n[1];
      const nz = -n[0] * s + n[2] * c;
      const pts = [p0, p1, p2, p3];
      for (let vi = 0; vi < 4; vi++) {
        const lx = pts[vi][0] * sx;
        const ly = pts[vi][1] * sy;
        const lz = pts[vi][2] * sz;
        const wx = tx + lx * c + lz * s;
        const wy = ty + ly;
        const wz = tz - lx * s + lz * c;
        this.pos.push(wx, wy, wz);
        this.norm.push(nx, ny, nz);
        this.uv.push(vi === 1 || vi === 2 ? 1 : 0, vi >= 2 ? 1 : 0);
        this.tint.push(col[0], col[1], col[2]);
      }
      this.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
  }

  addQuad(p0, p1, p2, p3, nrm, col) {
    const base = this.pos.length / 3;
    const pts = [p0, p1, p2, p3];
    for (let i = 0; i < 4; i++) {
      this.pos.push(pts[i][0], pts[i][1], pts[i][2]);
      this.norm.push(nrm[0], nrm[1], nrm[2]);
      this.uv.push(i === 1 || i === 2 ? 1 : 0, i >= 2 ? 1 : 0);
      this.tint.push(col[0], col[1], col[2]);
    }
    this.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }

  addConeOrCyl(tx, ty, tz, rTop, rBot, h, segs, col) {
    const baseStart = this.pos.length / 3;
    const slopeY = (rBot - rTop) / Math.max(0.01, h);
    for (let i = 0; i <= segs; i++) {
      const u = i / segs;
      const a = u * Math.PI * 2;
      const ca = Math.cos(a), sa = Math.sin(a);
      const nl = Math.hypot(1, slopeY);
      this.pos.push(tx + ca * rBot, ty - h * 0.5, tz + sa * rBot);
      this.norm.push(ca / nl, slopeY / nl, sa / nl);
      this.uv.push(u, 0);
      this.tint.push(col[0], col[1], col[2]);

      this.pos.push(tx + ca * rTop, ty + h * 0.5, tz + sa * rTop);
      this.norm.push(ca / nl, slopeY / nl, sa / nl);
      this.uv.push(u, 1);
      this.tint.push(col[0], col[1], col[2]);
    }
    for (let i = 0; i < segs; i++) {
      const k = baseStart + i * 2;
      this.idx.push(k, k + 2, k + 3, k, k + 3, k + 1);
    }
    if (rTop > 0.04) {
      const ct = this.pos.length / 3;
      this.pos.push(tx, ty + h * 0.5, tz);
      this.norm.push(0, 1, 0);
      this.uv.push(0.5, 0.5);
      this.tint.push(col[0], col[1], col[2]);
      for (let i = 0; i <= segs; i++) {
        const a = (i / segs) * Math.PI * 2;
        this.pos.push(tx + Math.cos(a) * rTop, ty + h * 0.5, tz + Math.sin(a) * rTop);
        this.norm.push(0, 1, 0);
        this.uv.push(0.5, 0.5);
        this.tint.push(col[0], col[1], col[2]);
      }
      for (let i = 0; i < segs; i++) {
        this.idx.push(ct, ct + i + 2, ct + i + 1);
      }
    }
  }

  upload(gl) {
    if (this.idx.length === 0) return null;
    return uploadMesh(gl, this.pos, this.norm, this.uv, this.tint, this.idx);
  }
}

export function createCityPrimitives(gl) {
  // Dynamic Primitives for Vehicles, Wheels, Hydrants, Cones & Beacons
  const bPos = [], bNorm = [], bUV = [], bTint = [], bIdx = [];
  BOX_FACES.forEach(([n, p0, p1, p2, p3], fi) => {
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

  const makeCyl = (rTop, rBot, segs = 16, axisX = false) => {
    const pos = [], norm = [], uv = [], tint = [], idx = [];
    const sy = rBot - rTop;
    const pushV = (x, y, z, nx, ny, nz, u, v) => {
      if (axisX) {
        pos.push(y, x, z);
        norm.push(ny, nx, nz);
      } else {
        pos.push(x, y, z);
        norm.push(nx, ny, nz);
      }
      uv.push(u, v);
      tint.push(1, 1, 1);
    };
    for (let i = 0; i <= segs; i++) {
      const u = i / segs;
      const a = u * Math.PI * 2;
      const ca = Math.cos(a), sa = Math.sin(a);
      const nl = Math.hypot(1, sy);
      pushV(ca * rBot, -0.5, sa * rBot, ca / nl, sy / nl, sa / nl, u, 0);
      pushV(ca * rTop, 0.5, sa * rTop, ca / nl, sy / nl, sa / nl, u, 1);
    }
    for (let i = 0; i < segs; i++) {
      const k = i * 2;
      idx.push(k, k + 2, k + 3, k, k + 3, k + 1);
    }
    for (const side of [-1, 1]) {
      const rad = side > 0 ? rTop : rBot;
      if (rad < 0.02) continue;
      const ct = pos.length / 3;
      pushV(0, side * 0.5, 0, 0, side, 0, 0.5, 0.5);
      for (let i = 0; i <= segs; i++) {
        const a = (i / segs) * Math.PI * 2;
        pushV(Math.cos(a) * rad, side * 0.5, Math.sin(a) * rad, 0, side, 0, 0.5, 0.5);
      }
      for (let i = 0; i < segs; i++) {
        if (side > 0) idx.push(ct, ct + i + 2, ct + i + 1);
        else idx.push(ct, ct + i + 1, ct + i + 2);
      }
    }
    return uploadMesh(gl, pos, norm, uv, tint, idx);
  };

  const cyl = makeCyl(0.5, 0.5, 14, false);
  const wheel = makeCyl(0.5, 0.5, 14, true); // Aligned along X-axis so wheels roll around X!
  const cone = makeCyl(0.04, 0.5, 12, false);

  // Sphere (SkyDome + Hydrant Dome + Beacon Orb)
  const sPos = [], sNorm = [], sUV = [], sTint = [], sIdx = [];
  const latN = 12, lonN = 18;
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

  // Flat Ground Ring (Crosstown Beacon Halo & Shockwave Ring)
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

  return { box, cyl, wheel, cone, sphere, ring };
}

export function createParticleSystem(gl, maxParticles = 760) {
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

// Build Complete 420m x 420m Manhattan Open-World District
export function buildManhattanDistrict(gl) {
  const rng = mulberry32(21242); // NYC 212 area code + 42nd St!

  const bGround = new StaticBatch();     // uMat = 1
  const bTowers = new StaticBatch();     // uMat = 2
  const bMetal = new StaticBatch();      // uMat = 3
  const bProps = new StaticBatch();      // uMat = 4
  const bWater = new StaticBatch();      // uMat = 5
  const bEmissive = new StaticBatch();   // uMat = 6
  const bBillboards = new StaticBatch(); // uMat = 7

  const buildingAABBs = [];
  const pushAABB = (cx, cz, sx, sz) => {
    buildingAABBs.push({
      minX: cx - sx * 0.5,
      maxX: cx + sx * 0.5,
      minZ: cz - sz * 0.5,
      maxZ: cz + sz * 0.5,
    });
  };

  // 1. Manhattan Flat City Ground Grid (-202..202) + Elevated East River Bridge Deck
  const gSegs = 40;
  const gHalf = 202;
  for (let iz = 0; iz < gSegs; iz++) {
    const z0 = lerp(-gHalf, gHalf, iz / gSegs);
    const z1 = lerp(-gHalf, gHalf, (iz + 1) / gSegs);
    for (let ix = 0; ix < gSegs; ix++) {
      const x0 = lerp(-gHalf, gHalf, ix / gSegs);
      const x1 = lerp(-gHalf, gHalf, (ix + 1) / gSegs);
      // Leave open East River tidal channel beneath the Suspension Bridge!
      const midX = (x0 + x1) * 0.5;
      const midZ = (z0 + z1) * 0.5;
      if (midX > 168 && midX < 193 && Math.abs(midZ) < 92) continue;
      bGround.addQuad(
        [x0, 0, z1],
        [x1, 0, z1],
        [x1, 0, z0],
        [x0, 0, z0],
        [0, 1, 0],
        [1, 1, 1]
      );
    }
  }

  // Elevated East River Suspension Bridge Arched Roadway (X in [170, 190], Z in [-108, 108])
  const brSegs = 36;
  for (let i = 0; i < brSegs; i++) {
    const z0 = lerp(-108, 108, i / brSegs);
    const z1 = lerp(-108, 108, (i + 1) / brSegs);
    const y0 = bridgeDeckHeight(180, z0);
    const y1 = bridgeDeckHeight(180, z1);
    const dy = y1 - y0;
    const dz = z1 - z0;
    const nl = Math.hypot(dy, dz);
    const nrm = [0, dz / nl, -dy / nl];
    bGround.addQuad(
      [170.2, y1, z1],
      [189.8, y1, z1],
      [189.8, y0, z0],
      [170.2, y0, z0],
      nrm,
      [1, 1, 1]
    );
    // Steel side deck girders & guardrails along bridge
    const ym = (y0 + y1) * 0.5;
    const zm = (z0 + z1) * 0.5;
    bMetal.addBox(170.0, ym + 0.4, zm, 0.65, 1.35, Math.abs(dz) + 0.2, [0.28, 0.34, 0.40]);
    bMetal.addBox(190.0, ym + 0.4, zm, 0.65, 1.35, Math.abs(dz) + 0.2, [0.28, 0.34, 0.40]);
  }

  // East River Shimmering Water Channel (flowing under the Suspension Bridge & East Waterfront)
  bWater.addQuad(
    [164, -1.1, 240],
    [320, -1.1, 240],
    [320, -1.1, -240],
    [164, -1.1, -240],
    [0, 1, 0],
    [0.85, 0.95, 1.0]
  );
  // Hudson River Shimmering Water along West Waterfront
  bWater.addQuad(
    [-320, -1.1, 240],
    [-199, -1.1, 240],
    [-199, -1.1, -240],
    [-320, -1.1, -240],
    [0, 1, 0],
    [0.92, 0.96, 1.0]
  );

  // 2. Iconic East River Suspension Bridge Twin Towers & Sweeping Catenary Cables!
  for (const tz of [-52, 52]) {
    const deckY = bridgeDeckHeight(180, tz);
    // Left & Right Stone-Steel Gothic Towers (straddling the 16m roadway so cars race right through!)
    for (const tx of [168.8, 191.2]) {
      bMetal.addBox(tx, 19.0, tz, 3.6, 40.0, 4.4, [0.42, 0.45, 0.49]);
      pushAABB(tx, tz, 3.6, 4.4);
      // Aviation amber beacon atop each bridge tower pinnacle
      bEmissive.addBox(tx, 40.2, tz, 1.1, 1.4, 1.1, [1.0, 0.68, 0.16]);
    }
    // Overhead Portal Cross-Beams above traffic clearance
    bMetal.addBox(180.0, deckY + 13.5, tz, 25.5, 2.8, 3.6, [0.44, 0.47, 0.52]);
    bMetal.addBox(180.0, 35.5, tz, 25.5, 3.2, 3.8, [0.44, 0.47, 0.52]);
    bEmissive.addBox(180.0, deckY + 11.8, tz, 17.5, 0.45, 0.8, [0.98, 0.72, 0.18]);
  }

  // Sweeping Catenary Suspension Cables & Necklace Lights on both sides of bridge
  const cableHeightAt = (z) => {
    const az = Math.abs(z);
    if (az <= 52) {
      // Center span catenary between z=-52 (y=38) and z=+52 (y=38), dipping to y=13.5 at z=0
      const u = z / 52.0;
      return 13.5 + u * u * 24.5;
    }
    // Side spans from z=±52 (y=38) down to anchorage at z=±108 (y=2.0)
    const u = (108 - az) / 56.0;
    return 2.0 + u * u * 36.0;
  };

  for (const cx of [170.1, 189.9]) {
    for (let z = -104; z <= 100; z += 6) {
      const yA = cableHeightAt(z);
      const yB = cableHeightAt(z + 6);
      const ym = (yA + yB) * 0.5;
      const dy = yB - yA;
      const segLen = Math.hypot(6, dy);
      // Main cable stepped segments + warm sodium necklace lights
      bMetal.addBox(cx, ym, z + 3, 0.42, 0.48, segLen, [0.58, 0.62, 0.66]);
      bEmissive.addBox(cx, ym + 0.35, z + 3, 0.35, 0.35, 0.55, [1.0, 0.74, 0.22]);

      // Vertical suspender rope down to bridge deck every 12m
      if (Math.abs(z) % 12 === 0 && Math.abs(z) < 98 && Math.abs(z - 52) > 4 && Math.abs(z + 52) > 4) {
        const dY = bridgeDeckHeight(180, z);
        const ropeH = Math.max(1.0, yA - dY);
        bMetal.addBox(cx, dY + ropeH * 0.5, z, 0.14, ropeH, 0.14, [0.50, 0.54, 0.58]);
      }
    }
  }

  // 3. 5 Stunt Jump Ramps with Glowing Saffron Boost Chevrons!
  STUNT_RAMPS.forEach((r) => {
    const slices = 8;
    for (let s = 0; s < slices; s++) {
      const f0 = lerp(-r.len * 0.5, r.len * 0.5, s / slices);
      const f1 = lerp(-r.len * 0.5, r.len * 0.5, (s + 1) / slices);
      const t0 = s / slices;
      const t1 = (s + 1) / slices;
      const base0 = bridgeDeckHeight(r.x + r.dx * f0, r.z + r.dz * f0);
      const base1 = bridgeDeckHeight(r.x + r.dx * f1, r.z + r.dz * f1);
      const h0 = base0 + (t0 * 0.65 + t0 * t0 * 0.35) * r.height;
      const h1 = base1 + (t1 * 0.65 + t1 * t1 * 0.35) * r.height;

      const lx = -r.dz * r.halfW;
      const lz = r.dx * r.halfW;
      const p00 = [r.x + r.dx * f0 - lx, h0, r.z + r.dz * f0 - lz];
      const p10 = [r.x + r.dx * f0 + lx, h0, r.z + r.dz * f0 + lz];
      const p11 = [r.x + r.dx * f1 + lx, h1, r.z + r.dz * f1 + lz];
      const p01 = [r.x + r.dx * f1 - lx, h1, r.z + r.dz * f1 - lz];
      bMetal.addQuad(p00, p10, p11, p01, [0, 0.94, 0.34], [0.22, 0.26, 0.32]);

      if (s % 2 === 1) {
        const fm = (f0 + f1) * 0.5;
        const hm = (h0 + h1) * 0.5 + 0.05;
        bEmissive.addBox(
          r.x + r.dx * fm,
          hm,
          r.z + r.dz * fm,
          r.dx !== 0 ? 0.6 : r.halfW * 1.45,
          0.08,
          r.dz !== 0 ? 0.6 : r.halfW * 1.45,
          [0.98, 0.72, 0.16]
        );
      }
    }
    // Side support wedge walls under the lip
    const lipX = r.x + r.dx * (r.len * 0.34);
    const lipZ = r.z + r.dz * (r.len * 0.34);
    const lipBase = bridgeDeckHeight(lipX, lipZ);
    bMetal.addBox(
      lipX,
      lipBase + r.height * 0.42,
      lipZ,
      r.dx !== 0 ? r.len * 0.32 : r.halfW * 1.95,
      r.height * 0.82,
      r.dz !== 0 ? r.len * 0.32 : r.halfW * 1.95,
      [0.92, 0.62, 0.12]
    );
  });

  // Helper: Rooftop NYC Wooden Water Tower
  const addWaterTower = (wx, roofY, wz) => {
    bMetal.addBox(wx, roofY + 1.0, wz, 1.8, 2.0, 1.8, [0.25, 0.27, 0.30]);
    bProps.addConeOrCyl(wx, roofY + 3.1, wz, 1.45, 1.45, 2.4, 10, [0.56, 0.38, 0.22]);
    bProps.addConeOrCyl(wx, roofY + 4.8, wz, 0.06, 1.65, 1.1, 10, [0.34, 0.24, 0.16]);
  };

  // Helper: Attach Giant Times Square LED Billboard on a Skyscraper Wall
  const addBillboard = (x, y, z, sx, sy, sz, seedVal) => {
    const s = (seedVal % 7) / 7;
    const g = ((seedVal * 3) % 11) / 11;
    bBillboards.addBox(x, y, z, sx, sy, sz, [0.15 + s * 0.8, 0.15 + g * 0.8, 1.0], 0, true);
  };

  // 4. Populate All 36 Blocks (Central Park, Landmarks, Times Square & 42+ Manhattan Skyscrapers!)
  const facadePalettes = [
    [0.78, 0.71, 0.58], // Classic Manhattan Limestone / Sandstone
    [0.34, 0.48, 0.62], // Midtown Hudson Glass-Curtain Blue-Slate
    [0.64, 0.38, 0.27], // Chelsea / SoHo Terracotta Brick
    [0.44, 0.47, 0.51], // Wall St / Park Ave Charcoal Granite
    [0.70, 0.60, 0.46], // Warm Art-Deco Buff Brick
  ];

  for (const bx of BLOCK_CENTERS) {
    for (const bz of BLOCK_CENTERS) {
      // --- SECTOR A: CENTRAL PARK (4 North-Center Blocks) ---
      if (isCentralParkBlock(bx, bz)) {
        // Low rustic park stone perimeter curb (only 0.22m high so cars can cut into Central Park!)
        bProps.addBox(bx, 0.11, bz, 36.2, 0.22, 36.2, [0.22, 0.44, 0.22]);

        // Reflective Central Park Pond in the Northern Lake Blocks (bz === -150)
        if (bz === -150) {
          const pondX = bx === 30 ? 25 : -25;
          bWater.addQuad(
            [pondX - 13, 0.25, bz + 11],
            [pondX + 13, 0.25, bz + 11],
            [pondX + 13, 0.25, bz - 11],
            [pondX - 13, 0.25, bz - 11],
            [0, 1, 0],
            [0.78, 0.98, 0.92]
          );
          // Scenic stone boulder cluster at pond corner
          bProps.addConeOrCyl(pondX + (bx > 0 ? 11 : -11), 0.9, bz - 9, 0.9, 2.2, 1.6, 7, [0.38, 0.39, 0.41]);
        }

        // Bethesda-Style Park Fountain in Block (-30, -90) near park entrance
        if (bx === -30 && bz === -90) {
          bProps.addConeOrCyl(bx, 0.55, bz, 4.8, 5.0, 0.8, 16, [0.62, 0.58, 0.50]);
          bWater.addConeOrCyl(bx, 0.96, bz, 4.3, 4.3, 0.12, 16, [0.75, 0.95, 0.98]);
          bEmissive.addConeOrCyl(bx, 2.2, bz, 0.25, 0.85, 2.4, 10, [0.48, 0.90, 1.0]);
        }

        // 12 Lush Emerald & NYC Golden-Autumn Trees per Central Park quadrant (48 Park Trees!)
        for (let t = 0; t < 12; t++) {
          const ang = (t / 12) * Math.PI * 2 + rng() * 0.35;
          const rad = 11.5 + rng() * 5.2;
          const tx = bx + Math.cos(ang) * rad;
          const tz = bz + Math.sin(ang) * rad;
          const th = 4.8 + rng() * 3.8;
          const autumn = t % 3 === 0;
          const leafCol = autumn
            ? [0.92, 0.62 + rng() * 0.14, 0.14] // Golden NYC Ginkgo / Elm
            : [0.14 + rng() * 0.08, 0.52 + rng() * 0.16, 0.22]; // Central Park Emerald Oak
          bProps.addConeOrCyl(tx, 1.4, tz, 0.28, 0.42, 2.8, 7, [0.34, 0.23, 0.15]);
          bProps.addConeOrCyl(tx, 2.6 + th * 0.42, tz, 0.35, 2.2 + rng() * 0.9, th, 8, leafCol);
        }
        continue;
      }

      // Raised Concrete Sidewalk Plinth for Urban Block (37m x 37m)
      bGround.addBox(bx, 0.09, bz, 37.0, 0.18, 37.0, [0.96, 0.96, 0.98]);

      // --- LANDMARK 1: EMPIRE STATE SPIRE TOWER at Block (30, 30) ---
      if (bx === 30 && bz === 30) {
        const stone = [0.80, 0.73, 0.60];
        bTowers.addBox(bx, 9.0, bz, 33.0, 18.0, 33.0, stone);
        bTowers.addBox(bx, 44.0, bz, 23.0, 54.0, 23.0, stone);
        bTowers.addBox(bx, 81.0, bz, 16.5, 20.0, 16.5, stone);
        bTowers.addBox(bx, 96.5, bz, 11.0, 11.0, 11.0, stone);
        // Floodlit Golden-Saffron Crown + Dirigible Mast Spire (124m!)
        bEmissive.addBox(bx, 104.0, bz, 8.2, 4.2, 8.2, [1.0, 0.76, 0.26]);
        bMetal.addConeOrCyl(bx, 114.5, bz, 0.25, 1.8, 17.0, 10, [0.82, 0.86, 0.90]);
        bEmissive.addConeOrCyl(bx, 124.0, bz, 0.12, 0.55, 3.0, 8, [0.32, 0.86, 1.0]);
        pushAABB(bx, bz, 33.2, 33.2);
        continue;
      }

      // --- LANDMARK 2: CHRYSLER ART-DECO SUNBURST TOWER at Block (90, -30) ---
      if (bx === 90 && bz === -30) {
        const silverStone = [0.74, 0.76, 0.79];
        bTowers.addBox(bx, 8.0, bz, 31.0, 16.0, 31.0, silverStone);
        bTowers.addBox(bx, 42.0, bz, 20.5, 52.0, 20.5, silverStone);
        // Iconic Tiered Art-Deco Sunburst Crown + Illuminated Amber Arches
        for (let tier = 0; tier < 4; tier++) {
          const w = 16.5 - tier * 3.3;
          const y = 70.5 + tier * 4.6;
          bMetal.addBox(bx, y, bz, w, 4.4, w, [0.82, 0.85, 0.89]);
          bEmissive.addBox(bx, y + 0.6, bz, w + 0.35, 1.1, w * 0.55, [1.0, 0.78, 0.28]);
          bEmissive.addBox(bx, y + 0.6, bz, w * 0.55, 1.1, w + 0.35, [1.0, 0.78, 0.28]);
        }
        bMetal.addConeOrCyl(bx, 97.5, bz, 0.08, 1.4, 20.0, 10, [0.90, 0.92, 0.95]);
        bEmissive.addBox(bx, 107.8, bz, 0.8, 1.2, 0.8, [1.0, 0.80, 0.30]);
        pushAABB(bx, bz, 31.2, 31.2);
        continue;
      }

      // --- LANDMARK 3: HUDSON GLASS SUPER-TOWER at Block (-150, 90) ---
      if (bx === -150 && bz === 90) {
        const glass = [0.30, 0.50, 0.68];
        bTowers.addBox(bx, 46.0, bz, 27.0, 92.0, 27.0, glass);
        bTowers.addBox(bx, 98.0, bz, 19.0, 12.0, 19.0, glass);
        bEmissive.addBox(bx, 104.8, bz, 19.4, 1.2, 19.4, [0.22, 0.82, 0.98]);
        bMetal.addConeOrCyl(bx, 114.0, bz, 0.12, 0.9, 17.0, 8, [0.78, 0.84, 0.90]);
        pushAABB(bx, bz, 27.2, 27.2);
        continue;
      }

      // --- LANDMARK 4: ONE TIMES SQUARE + BROADWAY BILLBOARD PLAZA at Block (-30, -30) ---
      if (bx === -30 && bz === -30) {
        // Iconic One Times Square Narrow Billboard Tower on West side facing X=-60 intersection!
        const otsX = -40.5, otsZ = -39.5;
        bTowers.addBox(otsX, 29.0, otsZ, 13.5, 58.0, 15.0, [0.35, 0.39, 0.45]);
        // Stacked Giant LED Screens on West & South faces!
        addBillboard(otsX - 6.9, 16.0, otsZ, 0.35, 16.0, 13.2, 1);
        addBillboard(otsX - 6.9, 36.0, otsZ, 0.35, 18.0, 13.2, 2);
        addBillboard(otsX, 18.0, otsZ + 7.65, 12.2, 18.0, 0.35, 3);
        addBillboard(otsX, 39.0, otsZ + 7.65, 12.2, 18.0, 0.35, 4);
        // New Year's Eve Crystal Ball Mast atop One Times Square!
        bMetal.addConeOrCyl(otsX, 64.0, otsZ, 0.2, 0.35, 12.0, 8, [0.85, 0.88, 0.92]);
        bEmissive.addConeOrCyl(otsX, 69.5, otsZ, 1.9, 1.9, 2.8, 12, [0.28, 0.88, 1.0]);
        pushAABB(otsX, otsZ, 13.8, 15.4);

        // Partner Midtown Glass Tower on East half of block
        const eX = -20.5, eZ = -24.0;
        bTowers.addBox(eX, 37.0, eZ, 15.5, 74.0, 24.0, [0.36, 0.50, 0.64]);
        addBillboard(eX, 16.0, eZ + 12.15, 13.5, 14.0, 0.35, 5);
        pushAABB(eX, eZ, 15.8, 24.4);
        continue;
      }

      // --- GENERAL MANHATTAN CITY BLOCKS (Split 60% into Twin Towers -> 44+ Varied Skyscrapers!) ---
      const isTimesSqAdj = (bx === -90 && (bz === -30 || bz === 30)) || (bx === -30 && bz === 30);
      const splitTwin = rng() > 0.38;

      if (splitTwin) {
        const alongX = rng() > 0.5;
        for (const side of [-1, 1]) {
          const cx = alongX ? bx + side * 8.4 : bx + (rng() - 0.5) * 2.0;
          const cz = alongX ? bz + (rng() - 0.5) * 2.0 : bz + side * 8.4;
          const sx = alongX ? 14.8 : 29.5 + rng() * 3.5;
          const sz = alongX ? 29.5 + rng() * 3.5 : 14.8;
          const h = 32.0 + rng() * 54.0 + (Math.abs(bx) <= 90 && Math.abs(bz) <= 90 ? 14.0 : 0);
          const pal = facadePalettes[Math.floor(rng() * facadePalettes.length)];
          const tint = [
            clamp(pal[0] * (0.9 + rng() * 0.2), 0.15, 1.0),
            clamp(pal[1] * (0.9 + rng() * 0.2), 0.15, 1.0),
            clamp(pal[2] * (0.9 + rng() * 0.2), 0.15, 1.0),
          ];

          bTowers.addBox(cx, h * 0.5, cz, sx, h, sz, tint);
          if (h > 52) {
            const topH = 10 + rng() * 12;
            bTowers.addBox(cx, h + topH * 0.5, cz, sx * 0.72, topH, sz * 0.72, tint);
            if (rng() > 0.5) {
              bEmissive.addBox(cx, h + topH + 0.5, cz, sx * 0.74, 0.8, sz * 0.74, [0.98, 0.72, 0.22]);
            }
          } else if (rng() > 0.45) {
            addWaterTower(cx + sx * 0.2, h, cz - sz * 0.2);
          }

          if (isTimesSqAdj) {
            // Wrap Broadway / 42nd St facing walls in bright warm/cyan LED Billboards!
            const faceX = bx < -60 ? cx + sx * 0.5 + 0.18 : cx - sx * 0.5 - 0.18;
            addBillboard(faceX, 15.5, cz, 0.35, 15.0, sz * 0.82, Math.floor(rng() * 20) + 6);
          }

          pushAABB(cx, cz, sx + 0.4, sz + 0.4);
        }
      } else {
        const sx = 28.0 + rng() * 5.0;
        const sz = 28.0 + rng() * 5.0;
        const h = 42.0 + rng() * 48.0;
        const pal = facadePalettes[Math.floor(rng() * facadePalettes.length)];
        const tint = [
          clamp(pal[0] * (0.92 + rng() * 0.16), 0.15, 1.0),
          clamp(pal[1] * (0.92 + rng() * 0.16), 0.15, 1.0),
          clamp(pal[2] * (0.92 + rng() * 0.16), 0.15, 1.0),
        ];

        bTowers.addBox(bx, h * 0.5, bz, sx, h, sz, tint);
        // Classic Art-Deco Double Setback Crown
        const h2 = 12 + rng() * 14;
        bTowers.addBox(bx, h + h2 * 0.5, bz, sx * 0.72, h2, sz * 0.72, tint);
        if (rng() > 0.45) {
          bMetal.addConeOrCyl(bx, h + h2 + 6.5, bz, 0.12, 0.65, 13.0, 8, [0.78, 0.82, 0.86]);
          bEmissive.addBox(bx, h + h2 + 13.2, bz, 0.7, 0.9, 0.7, [0.98, 0.68, 0.18]);
        } else {
          addWaterTower(bx - 5, h + h2, bz + 5);
        }

        if (isTimesSqAdj) {
          const faceX = bx < -60 ? bx + sx * 0.5 + 0.18 : bx - sx * 0.5 - 0.18;
          addBillboard(faceX, 17.0, bz, 0.35, 18.0, sz * 0.78, Math.floor(rng() * 20) + 12);
          const faceZ = bz < 0 ? bz + sz * 0.5 + 0.18 : bz - sz * 0.5 - 0.18;
          addBillboard(bx, 17.0, faceZ, sx * 0.78, 18.0, 0.35, Math.floor(rng() * 20) + 15);
        }

        pushAABB(bx, bz, sx + 0.4, sz + 0.4);
      }
    }
  }

  // 5. Warm Sodium NYC Streetlights & Traffic Signal Gantries at Intersections
  for (const ax of ROAD_CENTERS) {
    for (const sz of ROAD_CENTERS) {
      if (ax === 180 && Math.abs(sz) < 100) continue; // Skip inside bridge span
      const lx = ax + 8.6;
      const lz = sz + 8.6;
      bMetal.addBox(lx, 3.6, lz, 0.22, 7.2, 0.22, [0.24, 0.27, 0.30]);
      bMetal.addBox(lx - 1.4, 7.0, lz, 3.0, 0.18, 0.18, [0.24, 0.27, 0.30]);
      // Warm Sodium Streetlight Fixture + NYC Yellow Traffic Signal Box!
      bEmissive.addBox(lx - 2.6, 6.85, lz, 0.75, 0.22, 0.45, [1.0, 0.72, 0.24]);
      bMetal.addBox(lx - 2.2, 6.25, lz, 0.38, 0.95, 0.38, [0.92, 0.68, 0.14]);
      const isGreen = ((ax + sz) / 60) % 2 === 0;
      bEmissive.addBox(
        lx - 2.2,
        isGreen ? 5.95 : 6.52,
        lz + 0.21,
        0.22,
        0.22,
        0.08,
        isGreen ? [0.16, 0.95, 0.52] : [1.0, 0.28, 0.18]
      );
    }
  }

  // Perimeter Waterfront Guardrails at ±197m so player never drives off the island edge
  bMetal.addBox(0, 0.55, -197.2, 396, 1.1, 1.2, [0.34, 0.37, 0.42]);
  bMetal.addBox(0, 0.55, 197.2, 396, 1.1, 1.2, [0.34, 0.37, 0.42]);
  bMetal.addBox(-197.2, 0.55, 0, 1.2, 1.1, 396, [0.34, 0.37, 0.42]);
  bMetal.addBox(197.2, 0.55, 0, 1.2, 1.1, 396, [0.34, 0.37, 0.42]);

  const staticBatches = [
    { mat: 1, mesh: bGround.upload(gl), color: [1, 1, 1], params: [0.5, 1.0, 1.0] },
    { mat: 2, mesh: bTowers.upload(gl), color: [1, 1, 1], params: [0.5, 1.0, 1.0] },
    { mat: 3, mesh: bMetal.upload(gl), color: [1, 1, 1], params: [0.6, 1.0, 1.0] },
    { mat: 4, mesh: bProps.upload(gl), color: [1, 1, 1], params: [0.5, 1.0, 1.0] },
    { mat: 5, mesh: bWater.upload(gl), color: [1, 1, 1], params: [0.5, 1.0, 1.0] },
    { mat: 6, mesh: bEmissive.upload(gl), color: [1, 1, 1], params: [1.85, 1.0, 1.0] },
    { mat: 7, mesh: bBillboards.upload(gl), color: [1, 1, 1], params: [1.0, 1.0, 1.0] },
  ].filter((b) => b.mesh !== null);

  return {
    staticBatches,
    buildingAABBs,
    traffic: createTrafficFleet(),
    hydrants: createFireHydrants(),
    cones: createStreetCones(),
    beacons: CROSSTOWN_BEACONS.map((b, i) => ({
      id: i,
      x: b.x,
      y: getGroundHeight(b.x, b.z),
      z: b.z,
      name: b.name,
      cleared: false,
    })),
  };
}

// 18 Moving NYC Vehicles (12 Iconic Yellow Cabs + 6 Box Delivery Trucks) cruising Avenues & Streets
export function createTrafficFleet() {
  const fleet = [];
  const aveChoices = [-120, -60, 0, 60, 120, 180];
  const stChoices = [-120, -60, 0, 60, 120, 180];

  for (let i = 0; i < 18; i++) {
    const onAve = i < 11; // 11 along N-S Avenues (incl. Suspension Bridge!), 7 along E-W Crosstown Streets
    const isTruck = i % 3 === 2; // 6 Box Trucks, 12 NYC Yellow Cabs!
    const dir = i % 2 === 0 ? 1 : -1;
    const laneOffset = dir * 4.0; // Right-hand driving lane!
    const roadCoord = onAve ? aveChoices[i % aveChoices.length] : stChoices[i % stChoices.length];
    const travelPos = -155 + ((i * 53) % 310);

    const x = onAve ? roadCoord + laneOffset : travelPos;
    const z = onAve ? travelPos : roadCoord - laneOffset;
    // Car forward vector in our TRS convention is (-sin(yaw), 0, -cos(yaw)):
    // +Z: yaw = PI, -Z: yaw = 0, +X: yaw = -PI/2, -X: yaw = +PI/2
    const yaw = onAve
      ? (dir > 0 ? Math.PI : 0)
      : (dir > 0 ? -Math.PI * 0.5 : Math.PI * 0.5);

    const baseSpeed = isTruck ? 12.5 + (i % 3) * 1.4 : 15.5 + (i % 4) * 1.8;
    fleet.push({
      id: i,
      isTruck,
      onAve,
      roadCoord,
      laneOffset,
      dir,
      x,
      y: getGroundHeight(x, z),
      z,
      yaw,
      baseSpeed,
      speed: baseSpeed,
      vx: 0,
      vz: 0,
      honkFlash: 0,
      hitCooldown: 0,
      truckTint: i % 2 === 0 ? [0.90, 0.92, 0.95] : [0.20, 0.64, 0.88],
    });
  }
  return fleet;
}

// 28 Smashable NYC Fire Hydrants along Sidewalk Curbs (erupting 12m cyan-white water geysers!)
export function createFireHydrants() {
  const spots = [
    [-68.4, 24], [-51.6, -12], [-68.4, -36], [-51.6, -78],
    [-68.4, -104], [-36, -128.4], [-8.4, -142], [8.4, -112],
    [26, -68.4], [51.6, -84], [68.4, -38], [51.6, -14],
    [94, -8.4], [142, -8.4], [171.5, -116], [188.5, 114],
    [142, 51.6], [96, 68.4], [68.4, 38], [51.6, 82],
    [28, 8.4], [-8.4, 28], [-28, -8.4], [-88, 8.4],
    [-111.6, -34], [-111.6, 42], [111.6, -42], [-8.4, 92],
  ];
  return spots.map(([x, z], id) => ({
    id,
    x,
    baseY: getGroundHeight(x, z),
    z,
    smashed: false,
    geyserTimer: 0,
    respawnTimer: 0,
    capX: x,
    capY: 0.5,
    capZ: z,
    capVx: 0,
    capVy: 0,
    capVz: 0,
    capRot: 0,
  }));
}

// 24 Smashable NYC Orange-Saffron Street Cones near Intersections & Stunt Ramps
export function createStreetCones() {
  const cones = [];
  const clusters = [
    [-63.2, -9], [-56.8, -9], [-63.2, -33], [-56.8, -33],
    [-3.2, -82], [3.2, -82], [176.5, 24], [183.5, 24],
    [56.8, 10], [63.2, 10], [36, -3.2], [36, 3.2],
    [-44, 8.3], [-40, 8.3], [-76, -8.3], [-80, -8.3],
    [8.3, -44], [8.3, -48], [-8.3, 44], [-8.3, 48],
    [68.3, -18], [68.3, -22], [-51.7, 36], [-51.7, 40],
  ];
  clusters.forEach(([x, z], id) => {
    const by = getGroundHeight(x, z);
    cones.push({
      id,
      homeX: x,
      homeY: by,
      homeZ: z,
      x,
      y: by,
      z,
      vx: 0,
      vy: 0,
      vz: 0,
      rx: 0,
      rz: 0,
      smashed: false,
      timer: 0,
    });
  });
  return cones;
}

// Reusable Hierarchical Scratch Matrices
const mRoot = M4.create();
const mPart = M4.create();
const mOut = M4.create();

// Draw Sleek 3D Sports Muscle Taxi/Coupe with Rotating Wheels, Headlights, Brake Lights & Twin Nitro Flames!
export function drawPlayerCoupe(drawFn, meshes, car, time) {
  M4.trs(mRoot, car.x, car.y + 0.48, car.z, car.pitch, car.yaw, car.roll, 1, 1, 1);

  const part = (mesh, lx, ly, lz, rx, ry, rz, sx, sy, sz, mat, col, glow = 0.6) => {
    M4.trs(mPart, lx, ly, lz, rx, ry, rz, sx, sy, sz);
    M4.mul(mOut, mRoot, mPart);
    drawFn(mesh, mOut, mat, col, glow, 1.0, 1.0);
  };

  const saffron = [0.96, 0.72, 0.16];
  const carbon = [0.12, 0.14, 0.17];
  const cabinGlass = [0.09, 0.16, 0.23];
  const tireDark = [0.10, 0.11, 0.13];
  const alloyRim = [0.82, 0.85, 0.88];

  // Sculpted Wide-Body Muscle Chassis + Front Splitter + Rear Diffuser
  part(meshes.box, 0, 0.10, 0, 0, 0, 0, 1.96, 0.50, 4.35, 3, saffron);
  part(meshes.box, 0, -0.11, -2.08, 0, 0, 0, 2.02, 0.12, 0.42, 3, carbon);
  part(meshes.box, 0, -0.09, 2.08, 0, 0, 0, 1.92, 0.16, 0.34, 3, carbon);

  // Matte Carbon V8 Supercharger Hood Scoop & Side Racing Stripes
  part(meshes.box, 0, 0.38, -1.05, 0.04, 0, 0, 0.76, 0.12, 1.45, 3, carbon);
  part(meshes.box, -0.99, 0.08, 0, 0, 0, 0, 0.03, 0.14, 3.85, 4, carbon);
  part(meshes.box, 0.99, 0.08, 0, 0, 0, 0, 0.03, 0.14, 3.85, 4, carbon);

  // Sloped Fastback Greenhouse Cabin + Glowing NYC Rooftop Aero Medallion
  part(meshes.box, 0, 0.56, 0.18, -0.04, 0, 0, 1.56, 0.46, 2.05, 3, cabinGlass);
  part(meshes.box, 0, 0.80, 0.16, 0, 0, 0, 1.38, 0.07, 1.45, 3, saffron);
  part(meshes.box, 0, 0.89, 0.05, 0, 0, 0, 0.62, 0.13, 0.28, 6, [1.0, 0.84, 0.38], 1.9);

  // GT Carbon Rear Wing Spoiler
  part(meshes.box, -0.68, 0.50, 1.94, -0.15, 0, 0, 0.08, 0.32, 0.22, 3, carbon);
  part(meshes.box, 0.68, 0.50, 1.94, -0.15, 0, 0, 0.08, 0.32, 0.22, 3, carbon);
  part(meshes.box, 0, 0.66, 1.98, 0.10, 0, 0, 1.94, 0.07, 0.38, 3, carbon);

  // Bright Twin Headlights (Forward is -Z)
  part(meshes.box, -0.66, 0.16, -2.18, 0, 0, 0, 0.42, 0.15, 0.06, 6, [1.0, 0.96, 0.84], 2.5);
  part(meshes.box, 0.66, 0.16, -2.18, 0, 0, 0, 0.42, 0.15, 0.06, 6, [1.0, 0.96, 0.84], 2.5);

  // Wide Muscle Taillight Bar (flares blazing crimson when braking or drifting!)
  const brakeGlow = car.braking || car.drifting ? 2.8 : 1.35;
  const tailCol = car.braking || car.drifting ? [1.0, 0.16, 0.12] : [0.85, 0.14, 0.10];
  part(meshes.box, -0.62, 0.20, 2.18, 0, 0, 0, 0.54, 0.14, 0.06, 6, tailCol, brakeGlow);
  part(meshes.box, 0.62, 0.20, 2.18, 0, 0, 0, 0.54, 0.14, 0.06, 6, tailCol, brakeGlow);

  // 4 Rotating Alloy Wheels (Front pair steers cleanly with car.steerVisual!)
  const wheelCoords = [
    [-0.96, -0.12, -1.32, car.steerVisual],
    [0.96, -0.12, -1.32, car.steerVisual],
    [-0.98, -0.10, 1.30, 0],
    [0.98, -0.10, 1.30, 0],
  ];
  for (const [wx, wy, wz, st] of wheelCoords) {
    part(meshes.wheel, wx, wy, wz, car.wheelSpin, st, 0, 0.36, 0.74, 0.74, 4, tireDark);
    part(meshes.wheel, wx + (wx > 0 ? 0.03 : -0.03), wy, wz, car.wheelSpin, st, 0, 0.37, 0.46, 0.46, 3, alloyRim);
  }

  // Twin Nitro Exhaust Pipes + Blazing Cyan-Gold Afterburner Flames!
  part(meshes.cyl, -0.46, -0.10, 2.22, Math.PI * 0.5, 0, 0, 0.16, 0.24, 0.16, 3, alloyRim);
  part(meshes.cyl, 0.46, -0.10, 2.22, Math.PI * 0.5, 0, 0, 0.16, 0.24, 0.16, 3, alloyRim);

  if (car.boosting) {
    const flicker = 0.85 + 0.35 * Math.sin(time * 48.0);
    const len = 1.45 * flicker;
    for (const ex of [-0.46, 0.46]) {
      // Outer Hudson-Cyan Mach cone + Inner Saffron-White core
      part(meshes.cone, ex, -0.10, 2.28 + len * 0.5, Math.PI * 0.5, 0, 0, 0.34, len, 0.34, 6, [0.20, 0.82, 1.0], 2.7);
      part(meshes.cone, ex, -0.10, 2.25 + len * 0.32, Math.PI * 0.5, 0, 0, 0.18, len * 0.65, 0.18, 6, [1.0, 0.88, 0.42], 2.9);
    }
  }
}

// Draw 18 Moving NYC Yellow Cabs & Box Delivery Trucks
export function drawTrafficVehicles(drawFn, meshes, traffic) {
  for (let i = 0; i < traffic.length; i++) {
    const v = traffic[i];
    M4.trs(mRoot, v.x, v.y + 0.46, v.z, 0, v.yaw, 0, 1, 1, 1);

    const part = (mesh, lx, ly, lz, sx, sy, sz, mat, col, glow = 0.6) => {
      M4.trs(mPart, lx, ly, lz, 0, 0, 0, sx, sy, sz);
      M4.mul(mOut, mRoot, mPart);
      drawFn(mesh, mOut, mat, col, glow, 1.0, 1.0);
    };

    if (v.isTruck) {
      // NYC Box Delivery Truck
      part(meshes.box, 0, 0.32, -1.85, 2.15, 1.35, 1.55, 3, [0.88, 0.62, 0.16]);
      part(meshes.box, 0, 0.58, -2.25, 1.95, 0.62, 0.80, 3, [0.12, 0.18, 0.25]);
      part(meshes.box, 0, 0.92, 0.68, 2.32, 2.35, 3.65, 3, v.truckTint);
      part(meshes.box, -0.78, 0.05, -2.63, 0.36, 0.16, 0.06, 6, [1.0, 0.94, 0.78], 2.1);
      part(meshes.box, 0.78, 0.05, -2.63, 0.36, 0.16, 0.06, 6, [1.0, 0.94, 0.78], 2.1);
      part(meshes.box, -0.82, 0.08, 2.52, 0.38, 0.16, 0.06, 6, [0.95, 0.18, 0.12], 1.7);
      part(meshes.box, 0.82, 0.08, 2.52, 0.38, 0.16, 0.06, 6, [0.95, 0.18, 0.12], 1.7);
    } else {
      // Iconic NYC Yellow Cab!
      const cabYellow = [0.95, 0.70, 0.14];
      part(meshes.box, 0, 0.12, 0, 1.86, 0.52, 4.15, 3, cabYellow);
      part(meshes.box, 0, 0.56, 0.08, 1.52, 0.46, 2.02, 3, [0.12, 0.18, 0.25]);
      part(meshes.box, 0, 0.80, 0.08, 1.40, 0.06, 1.65, 3, cabYellow);
      // Glowing Rooftop TAXI Medallion (flashes bright cyan-gold when honking back!)
      const medCol = v.honkFlash > 0 ? [0.28, 0.90, 1.0] : [1.0, 0.88, 0.48];
      part(meshes.box, 0, 0.92, 0.04, 0.66, 0.18, 0.30, 6, medCol, v.honkFlash > 0 ? 2.9 : 1.9);
      // Headlights & Red Taillights
      part(meshes.box, -0.64, 0.14, -2.08, 0.36, 0.14, 0.06, 6, [1.0, 0.94, 0.78], 2.1);
      part(meshes.box, 0.64, 0.14, -2.08, 0.36, 0.14, 0.06, 6, [1.0, 0.94, 0.78], 2.1);
      part(meshes.box, -0.64, 0.16, 2.08, 0.40, 0.14, 0.06, 6, [0.95, 0.16, 0.12], 1.7);
      part(meshes.box, 0.64, 0.16, 2.08, 0.40, 0.14, 0.06, 6, [0.95, 0.16, 0.12], 1.7);
    }
  }
}

// Draw 28 Smashable NYC Fire Hydrants + 24 Smashable Street Cones
export function drawSmashables(drawFn, meshes, hydrants, cones) {
  const hydrantRed = [0.88, 0.24, 0.12];
  const silverCap = [0.82, 0.85, 0.88];

  for (let i = 0; i < hydrants.length; i++) {
    const h = hydrants[i];
    if (!h.smashed) {
      M4.trs(mOut, h.x, h.baseY + 0.42, h.z, 0, 0, 0, 0.44, 0.84, 0.44);
      drawFn(meshes.cyl, mOut, 3, hydrantRed);
      M4.trs(mOut, h.x, h.baseY + 0.86, h.z, 0, 0, 0, 0.48, 0.32, 0.48);
      drawFn(meshes.sphere, mOut, 3, silverCap);
      M4.trs(mOut, h.x, h.baseY + 0.56, h.z, 0, 0, 0, 0.68, 0.16, 0.18);
      drawFn(meshes.box, mOut, 3, silverCap);
    } else {
      // Sheared base stub + flying cast-iron cap!
      M4.trs(mOut, h.x, h.baseY + 0.12, h.z, 0, 0, 0, 0.46, 0.24, 0.46);
      drawFn(meshes.cyl, mOut, 3, [0.35, 0.38, 0.42]);
      if (h.geyserTimer > 11.5) {
        M4.trs(mOut, h.capX, h.capY, h.capZ, h.capRot, h.capRot * 0.7, 0, 0.44, 0.65, 0.44);
        drawFn(meshes.cyl, mOut, 3, hydrantRed);
      }
    }
  }

  const coneOrange = [0.98, 0.48, 0.10];
  for (let i = 0; i < cones.length; i++) {
    const c = cones[i];
    M4.trs(mOut, c.x, c.y + 0.36, c.z, c.rx, 0, c.rz, 0.48, 0.72, 0.48);
    drawFn(meshes.cone, mOut, 4, coneOrange);
    M4.trs(mOut, c.x, c.y + 0.42, c.z, c.rx, 0, c.rz, 0.30, 0.14, 0.30);
    drawFn(meshes.cyl, mOut, 6, [0.98, 0.96, 0.88], 1.4, 1.0, 1.0);
  }
}

// Draw 8 Glowing Golden Crosstown Rush Beacons
export function drawCrosstownBeacons(drawFn, meshes, beacons, activeIdx, time) {
  for (let i = 0; i < beacons.length; i++) {
    const b = beacons[i];
    if (b.cleared) continue;
    const isCurrent = i === activeIdx;
    const isNext = i === activeIdx + 1;
    if (!isCurrent && !isNext) continue;

    const pulse = 1.0 + 0.12 * Math.sin(time * 5.2);
    const ringR = (isCurrent ? 11.5 : 8.0) * pulse;
    const gold = isCurrent ? [1.0, 0.76, 0.18] : [0.28, 0.78, 0.98];

    // Glowing Ground Target Ring
    M4.trs(mOut, b.x, b.y + 0.22, b.z, 0, time * 1.8, 0, ringR, 1.0, ringR);
    drawFn(meshes.ring, mOut, 6, gold, isCurrent ? 2.4 : 1.4, 1.0, 0.92);

    if (isCurrent) {
      // Skyward Golden Beacon Pillar + Floating Diamond Orb
      M4.trs(mOut, b.x, b.y + 24.0, b.z, 0, -time * 2.0, 0, 2.8, 48.0, 2.8);
      drawFn(meshes.cyl, mOut, 6, [1.0, 0.78, 0.22], 2.1, 1.0, 0.38);

      const bobY = b.y + 4.4 + Math.sin(time * 4.0) * 0.65;
      M4.trs(mOut, b.x, bobY, b.z, 0.6, time * 2.6, 0.6, 1.8, 1.8, 1.8);
      drawFn(meshes.box, mOut, 6, [0.36, 0.88, 1.0], 2.6, 1.0, 0.95);
    }
  }
}
