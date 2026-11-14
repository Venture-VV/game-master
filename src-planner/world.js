// 3D Cozy Walnut Desk Rig, Hardcover 2027 Planner, Subdivided Deforming Pages,
// 10 Sculpted 3D Peel-and-Stick Stickers, Brass Fountain Pen & Dynamic Ink Ribbon Meshes

import { PAGE_W, PAGE_H, deformPagePoint, createPRNG, clamp } from './math.js';

// --- Generic Static Geometry Builder (pos3, norm3, col3, uv2 -> stride 11 floats) ---
class PropGeoBuilder {
  constructor() {
    this.verts = [];
    this.indices = [];
  }

  addVertex(x, y, z, nx, ny, nz, r, g, b, u = 0, v = 0) {
    const idx = this.verts.length / 11;
    this.verts.push(x, y, z, nx, ny, nz, r, g, b, u, v);
    return idx;
  }

  addTri(i0, i1, i2) {
    this.indices.push(i0, i1, i2);
  }

  addQuad(i0, i1, i2, i3) {
    this.indices.push(i0, i1, i2, i0, i2, i3);
  }

  addBox(cx, cy, cz, sx, sy, sz, col, uvY = 0.0) {
    const hx = sx * 0.5, hy = sy * 0.5, hz = sz * 0.5;
    const [r, g, b] = col;
    const faces = [
      // +Y top
      { n: [0, 1, 0], p: [[-hx, hy, -hz], [-hx, hy, hz], [hx, hy, hz], [hx, hy, -hz]] },
      // -Y bottom
      { n: [0, -1, 0], p: [[-hx, -hy, hz], [-hx, -hy, -hz], [hx, -hy, -hz], [hx, -hy, hz]] },
      // +Z front
      { n: [0, 0, 1], p: [[-hx, -hy, hz], [hx, -hy, hz], [hx, hy, hz], [-hx, hy, hz]] },
      // -Z back
      { n: [0, 0, -1], p: [[hx, -hy, -hz], [-hx, -hy, -hz], [-hx, hy, -hz], [hx, hy, -hz]] },
      // +X right
      { n: [1, 0, 0], p: [[hx, -hy, hz], [hx, -hy, -hz], [hx, hy, -hz], [hx, hy, hz]] },
      // -X left
      { n: [-1, 0, 0], p: [[-hx, -hy, -hz], [-hx, -hy, hz], [-hx, hy, hz], [-hx, hy, -hz]] },
    ];
    for (const f of faces) {
      const i0 = this.addVertex(cx + f.p[0][0], cy + f.p[0][1], cz + f.p[0][2], f.n[0], f.n[1], f.n[2], r, g, b, 0, uvY);
      const i1 = this.addVertex(cx + f.p[1][0], cy + f.p[1][1], cz + f.p[1][2], f.n[0], f.n[1], f.n[2], r, g, b, 1, uvY);
      const i2 = this.addVertex(cx + f.p[2][0], cy + f.p[2][1], cz + f.p[2][2], f.n[0], f.n[1], f.n[2], r, g, b, 1, uvY);
      const i3 = this.addVertex(cx + f.p[3][0], cy + f.p[3][1], cz + f.p[3][2], f.n[0], f.n[1], f.n[2], r, g, b, 0, uvY);
      this.addQuad(i0, i1, i2, i3);
    }
  }

  addCylinder(cx, y0, cz, rBot, rTop, height, segs, col, capTop = true, capBot = true, uvY = 0.0) {
    const [cr, cg, cb] = col;
    const y1 = y0 + height;
    const slope = (rBot - rTop) / (height || 1e-4);

    for (let i = 0; i < segs; i++) {
      const a0 = (i / segs) * Math.PI * 2;
      const a1 = ((i + 1) / segs) * Math.PI * 2;
      const c0 = Math.cos(a0), s0 = Math.sin(a0);
      const c1 = Math.cos(a1), s1 = Math.sin(a1);
      const nl = Math.hypot(1, slope);

      const p00 = this.addVertex(cx + c0 * rBot, y0, cz + s0 * rBot, c0 / nl, slope / nl, s0 / nl, cr, cg, cb, i / segs, uvY);
      const p10 = this.addVertex(cx + c1 * rBot, y0, cz + s1 * rBot, c1 / nl, slope / nl, s1 / nl, cr, cg, cb, (i + 1) / segs, uvY);
      const p11 = this.addVertex(cx + c1 * rTop, y1, cz + s1 * rTop, c1 / nl, slope / nl, s1 / nl, cr, cg, cb, (i + 1) / segs, uvY);
      const p01 = this.addVertex(cx + c0 * rTop, y1, cz + s0 * rTop, c0 / nl, slope / nl, s0 / nl, cr, cg, cb, i / segs, uvY);
      this.addQuad(p00, p01, p11, p10);
    }

    if (capTop && rTop > 1e-4) {
      const cIdx = this.addVertex(cx, y1, cz, 0, 1, 0, cr, cg, cb, 0.0, uvY);
      for (let i = 0; i < segs; i++) {
        const a0 = (i / segs) * Math.PI * 2;
        const a1 = ((i + 1) / segs) * Math.PI * 2;
        const v0 = this.addVertex(cx + Math.cos(a0) * rTop, y1, cz + Math.sin(a0) * rTop, 0, 1, 0, cr, cg, cb, 1.0, uvY);
        const v1 = this.addVertex(cx + Math.cos(a1) * rTop, y1, cz + Math.sin(a1) * rTop, 0, 1, 0, cr, cg, cb, 1.0, uvY);
        this.addTri(cIdx, v1, v0);
      }
    }

    if (capBot && rBot > 1e-4) {
      const cIdx = this.addVertex(cx, y0, cz, 0, -1, 0, cr, cg, cb, 0.0, uvY);
      for (let i = 0; i < segs; i++) {
        const a0 = (i / segs) * Math.PI * 2;
        const a1 = ((i + 1) / segs) * Math.PI * 2;
        const v0 = this.addVertex(cx + Math.cos(a0) * rBot, y0, cz + Math.sin(a0) * rBot, 0, -1, 0, cr, cg, cb, 1.0, uvY);
        const v1 = this.addVertex(cx + Math.cos(a1) * rBot, y0, cz + Math.sin(a1) * rBot, 0, -1, 0, cr, cg, cb, 1.0, uvY);
        this.addTri(cIdx, v0, v1);
      }
    }
  }

  addHollowTube(cx, y0, cz, rOuter, rInner, height, segs, colOuter, colInner, uvY = 0.0) {
    this.addCylinder(cx, y0, cz, rOuter, rOuter, height, segs, colOuter, false, false, uvY);
    const y1 = y0 + height;
    const [ir, ig, ib] = colInner;
    const [or, og, ob] = colOuter;
    for (let i = 0; i < segs; i++) {
      const a0 = (i / segs) * Math.PI * 2;
      const a1 = ((i + 1) / segs) * Math.PI * 2;
      const c0 = Math.cos(a0), s0 = Math.sin(a0);
      const c1 = Math.cos(a1), s1 = Math.sin(a1);

      // Inner cylinder wall
      const p00 = this.addVertex(cx + c0 * rInner, y0, cz + s0 * rInner, -c0, 0, -s0, ir, ig, ib, 0, 0);
      const p10 = this.addVertex(cx + c1 * rInner, y0, cz + s1 * rInner, -c1, 0, -s1, ir, ig, ib, 0, 0);
      const p11 = this.addVertex(cx + c1 * rInner, y1, cz + s1 * rInner, -c1, 0, -s1, ir, ig, ib, 0, 0);
      const p01 = this.addVertex(cx + c0 * rInner, y1, cz + s0 * rInner, -c0, 0, -s0, ir, ig, ib, 0, 0);
      this.addQuad(p00, p10, p11, p01);

      // Top annulus rim
      const t0o = this.addVertex(cx + c0 * rOuter, y1, cz + s0 * rOuter, 0, 1, 0, or, og, ob, 0, 0);
      const t1o = this.addVertex(cx + c1 * rOuter, y1, cz + s1 * rOuter, 0, 1, 0, or, og, ob, 0, 0);
      const t1i = this.addVertex(cx + c1 * rInner, y1, cz + s1 * rInner, 0, 1, 0, ir, ig, ib, 0, 0);
      const t0i = this.addVertex(cx + c0 * rInner, y1, cz + s0 * rInner, 0, 1, 0, ir, ig, ib, 0, 0);
      this.addQuad(t0i, t1i, t1o, t0o);
    }
  }

  upload(gl) {
    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);

    const vbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(this.verts), gl.STATIC_DRAW);

    const stride = 11 * 4;
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, stride, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 3, gl.FLOAT, false, stride, 3 * 4);
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 3, gl.FLOAT, false, stride, 6 * 4);
    gl.enableVertexAttribArray(3);
    gl.vertexAttribPointer(3, 2, gl.FLOAT, false, stride, 9 * 4);

    const ibo = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
    const useU32 = this.verts.length / 11 > 65530;
    const idxArr = useU32 ? new Uint32Array(this.indices) : new Uint16Array(this.indices);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, idxArr, gl.STATIC_DRAW);

    gl.bindVertexArray(null);
    return {
      vao,
      count: this.indices.length,
      indexType: useU32 ? gl.UNSIGNED_INT : gl.UNSIGNED_SHORT,
    };
  }
}

// --- Sculpted 3D Sticker Geometry Builder (pos3, norm3, col3, partMat1 -> stride 10 floats) ---
class StickerGeoBuilder {
  constructor() {
    this.verts = [];
    this.indices = [];
  }

  v(x, y, z, nx, ny, nz, col, mat = 1.0) {
    const idx = this.verts.length / 10;
    this.verts.push(x, y, z, nx, ny, nz, col[0], col[1], col[2], mat);
    return idx;
  }

  tri(a, b, c) {
    this.indices.push(a, b, c);
  }

  quad(a, b, c, d) {
    this.indices.push(a, b, c, a, c, d);
  }

  // Glossy white die-cut rounded backing plate
  addDieCutDisc(radius = 0.92, thickness = 0.036, segs = 28, col = [0.995, 0.988, 0.972], mat = 0.0, wobble = 0.0, lobes = 6) {
    const cTop = this.v(0, thickness, 0, 0, 1, 0, col, mat);
    const cBot = this.v(0, 0, 0, 0, -1, 0, col, mat);

    for (let i = 0; i < segs; i++) {
      const a0 = (i / segs) * Math.PI * 2;
      const a1 = ((i + 1) / segs) * Math.PI * 2;
      const r0 = radius * (1.0 + wobble * Math.sin(a0 * lobes + 0.5));
      const r1 = radius * (1.0 + wobble * Math.sin(a1 * lobes + 0.5));
      const x0 = Math.cos(a0) * r0, z0 = Math.sin(a0) * r0;
      const x1 = Math.cos(a1) * r1, z1 = Math.sin(a1) * r1;

      const t0 = this.v(x0, thickness, z0, 0, 1, 0, col, mat);
      const t1 = this.v(x1, thickness, z1, 0, 1, 0, col, mat);
      this.tri(cTop, t1, t0);

      const b0 = this.v(x0, 0, z0, 0, -1, 0, col, mat);
      const b1 = this.v(x1, 0, z1, 0, -1, 0, col, mat);
      this.tri(cBot, b0, b1);

      const s00 = this.v(x0, 0, z0, Math.cos(a0), 0.25, Math.sin(a0), col, mat);
      const s10 = this.v(x1, 0, z1, Math.cos(a1), 0.25, Math.sin(a1), col, mat);
      const s11 = this.v(x1, thickness, z1, Math.cos(a1), 0.25, Math.sin(a1), col, mat);
      const s01 = this.v(x0, thickness, z0, Math.cos(a0), 0.25, Math.sin(a0), col, mat);
      this.quad(s00, s01, s11, s10);
    }
  }

  // Sculpted 3D dome / hemisphere-ellipsoid relief element
  addDome(cx, baseY, cz, rx, ry, rz, col, mat = 1.0, rings = 6, segs = 16) {
    for (let r = 0; r < rings; r++) {
      const v0 = (r / rings) * (Math.PI * 0.5);
      const v1 = ((r + 1) / rings) * (Math.PI * 0.5);
      const cy0 = Math.sin(v0), cr0 = Math.cos(v0);
      const cy1 = Math.sin(v1), cr1 = Math.cos(v1);

      for (let s = 0; s < segs; s++) {
        const a0 = (s / segs) * Math.PI * 2;
        const a1 = ((s + 1) / segs) * Math.PI * 2;
        const pts = [
          [cr0 * Math.cos(a0), cy0, cr0 * Math.sin(a0)],
          [cr0 * Math.cos(a1), cy0, cr0 * Math.sin(a1)],
          [cr1 * Math.cos(a1), cy1, cr1 * Math.sin(a1)],
          [cr1 * Math.cos(a0), cy1, cr1 * Math.sin(a0)],
        ];
        const idx = pts.map(([px, py, pz]) => {
          const nx = px / (rx || 1), ny = py / (ry || 1), nz = pz / (rz || 1);
          const nl = Math.hypot(nx, ny, nz) || 1;
          return this.v(cx + px * rx, baseY + py * ry, cz + pz * rz, nx / nl, ny / nl, nz / nl, col, mat);
        });
        this.quad(idx[0], idx[3], idx[2], idx[1]);
      }
    }
  }

  // Extruded 3D ring / torus rim on sticker surface
  addRing(cx, baseY, cz, rMajor, rTube, col, mat = 2.0, segs = 20, tubeSegs = 8) {
    for (let i = 0; i < segs; i++) {
      const a0 = (i / segs) * Math.PI * 2;
      const a1 = ((i + 1) / segs) * Math.PI * 2;
      for (let j = 0; j < tubeSegs; j++) {
        const b0 = (j / tubeSegs) * Math.PI;
        const b1 = ((j + 1) / tubeSegs) * Math.PI;
        const makePt = (a, b) => {
          const ca = Math.cos(a), sa = Math.sin(a);
          const cb = Math.cos(b), sb = Math.sin(b);
          const rr = rMajor + cb * rTube;
          const x = cx + ca * rr;
          const y = baseY + sb * rTube;
          const z = cz + sa * rr;
          return this.v(x, y, z, ca * cb, sb, sa * cb, col, mat);
        };
        const i0 = makePt(a0, b0);
        const i1 = makePt(a1, b0);
        const i2 = makePt(a1, b1);
        const i3 = makePt(a0, b1);
        this.quad(i0, i3, i2, i1);
      }
    }
  }

  // Sculpted 3D prism / triangle ear / tent / origami wing with bevelled apex
  addTriRelief(p0, p1, p2, apexPt, baseY, height, col, mat = 1.0) {
    const ax = apexPt[0], ay = baseY + height, az = apexPt[1];
    const edges = [[p0, p1], [p1, p2], [p2, p0]];
    for (const [e0, e1] of edges) {
      const ux = e1[0] - e0[0], uz = e1[1] - e0[1];
      const vx = ax - e0[0], vy = height, vz = az - e0[1];
      // cross((ux,0,uz), (vx,vy,vz)) -> (-uz*vy, uz*vx - ux*vz, ux*vy)
      let nx = -uz * vy;
      let ny = Math.abs(uz * vx - ux * vz);
      let nz = ux * vy;
      const nl = Math.hypot(nx, ny, nz) || 1;
      nx /= nl; ny /= nl; nz /= nl;
      const v0 = this.v(e0[0], baseY, e0[1], nx, ny, nz, col, mat);
      const v1 = this.v(e1[0], baseY, e1[1], nx, ny, nz, col, mat);
      const va = this.v(ax, ay, az, nx, ny, nz, col, mat);
      // Ensure upward-facing winding
      const crossY = (e1[0] - e0[0]) * (az - e0[1]) - (e1[1] - e0[1]) * (ax - e0[0]);
      if (crossY < 0) {
        this.tri(v0, v1, va);
      } else {
        this.tri(v1, v0, va);
      }
    }
  }

  upload(gl) {
    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);

    const vbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(this.verts), gl.STATIC_DRAW);

    const stride = 10 * 4;
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, stride, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 3, gl.FLOAT, false, stride, 3 * 4);
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 3, gl.FLOAT, false, stride, 6 * 4);
    gl.enableVertexAttribArray(3);
    gl.vertexAttribPointer(3, 1, gl.FLOAT, false, stride, 9 * 4);

    const ibo = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(this.indices), gl.STATIC_DRAW);

    gl.bindVertexArray(null);
    return { vao, count: this.indices.length };
  }
}

// --- 1. Cozy Walnut Desk, Stitched Leather Mat, Hardcover 2027 Planner & Desk Props ---
export function createDeskAndBookRig(gl) {
  // Warm sunlit stationery colors
  const colWalnut   = [0.290, 0.180, 0.106]; // #4a2e1b
  const colLeather  = [0.205, 0.125, 0.082];
  const colCloth    = [0.155, 0.275, 0.215]; // Deep artisan forest-sage linen cloth
  const colEndpaper = [0.895, 0.840, 0.735];
  const colCreamBlk = [0.965, 0.935, 0.875];
  const colBrass    = [0.910, 0.659, 0.161]; // #e8a829
  const colTerra    = [0.851, 0.325, 0.220]; // #d95338
  const colCeramic  = [0.972, 0.948, 0.905];
  const colMatcha   = [0.180, 0.620, 0.420];
  const colHoney    = [0.898, 0.573, 0.220];
  const colKraft    = [0.740, 0.590, 0.410];

  // A. Walnut Tabletop (y = -0.50 .. 0.0)
  const deskB = new PropGeoBuilder();
  deskB.addBox(0, -0.25, 0, 28.0, 0.50, 18.5, colWalnut);

  // B. Stitched Saddle-Leather Desk Mat + Wooden Pen Rest Cradle
  const matB = new PropGeoBuilder();
  matB.addBox(0, 0.020, 0.10, 15.2, 0.040, 9.8, colLeather);
  // Pen rest stand beside planner right edge
  matB.addBox(5.55, 0.085, 0.55, 0.46, 0.10, 3.1, [0.34, 0.21, 0.12]);

  // C. Linen Cloth Hardcover 2027 Planner Boards & Rounded Spine
  const covB = new PropGeoBuilder();
  // Left & Right rigid hardcover boards
  covB.addBox(-2.22, 0.085, 0.0, 4.32, 0.09, 6.02, colCloth);
  covB.addBox(2.22, 0.085, 0.0, 4.32, 0.09, 6.02, colCloth);
  // Central spine trough
  covB.addBox(0.0, 0.072, 0.0, 0.56, 0.08, 6.04, [0.125, 0.225, 0.175]);
  // Warm cream endpaper border visible around page block
  covB.addBox(-2.18, 0.134, 0.0, 4.18, 0.012, 5.84, colEndpaper);
  covB.addBox(2.18, 0.134, 0.0, 4.18, 0.012, 5.84, colEndpaper);

  // D. Contoured Cream Paper Page Blocks (under Left & Right arched resting pages!)
  const blkB = new PropGeoBuilder();
  const segsU = 18;
  const zTop = -PAGE_H * 0.5;
  const zBot = PAGE_H * 0.5;
  const yFloor = 0.14;

  for (const side of [0, 1]) {
    const turnP = side === 1 ? 0.0 : 1.0;
    for (let i = 0; i < segsU; i++) {
      const u0 = i / segsU;
      const u1 = (i + 1) / segsU;
      const p0 = deformPagePoint(u0, 0.5, turnP, -0.008);
      const p1 = deformPagePoint(u1, 0.5, turnP, -0.008);
      const xL = side === 1 ? p0.x : p1.x;
      const yL = side === 1 ? p0.y : p1.y;
      const xR = side === 1 ? p1.x : p0.x;
      const yR = side === 1 ? p1.y : p0.y;

      // Front (+Z) stepped paper block face
      const f0 = blkB.addVertex(xL, yFloor, zBot, 0, 0, 1, ...colCreamBlk);
      const f1 = blkB.addVertex(xR, yFloor, zBot, 0, 0, 1, ...colCreamBlk);
      const f2 = blkB.addVertex(xR, yR, zBot, 0, 0, 1, ...colCreamBlk);
      const f3 = blkB.addVertex(xL, yL, zBot, 0, 0, 1, ...colCreamBlk);
      blkB.addQuad(f0, f1, f2, f3);

      // Back (-Z) stepped paper block face
      const b0 = blkB.addVertex(xR, yFloor, zTop, 0, 0, -1, ...colCreamBlk);
      const b1 = blkB.addVertex(xL, yFloor, zTop, 0, 0, -1, ...colCreamBlk);
      const b2 = blkB.addVertex(xL, yL, zTop, 0, 0, -1, ...colCreamBlk);
      const b3 = blkB.addVertex(xR, yR, zTop, 0, 0, -1, ...colCreamBlk);
      blkB.addQuad(b0, b1, b2, b3);
    }

    // Outer fore-edge vertical paper block wall (u = 1)
    const pOuter = deformPagePoint(1.0, 0.5, turnP, -0.008);
    const nx = side === 1 ? 1 : -1;
    if (side === 1) {
      const o0 = blkB.addVertex(pOuter.x, yFloor, zBot, nx, 0, 0, ...colCreamBlk);
      const o1 = blkB.addVertex(pOuter.x, yFloor, zTop, nx, 0, 0, ...colCreamBlk);
      const o2 = blkB.addVertex(pOuter.x, pOuter.y, zTop, nx, 0, 0, ...colCreamBlk);
      const o3 = blkB.addVertex(pOuter.x, pOuter.y, zBot, nx, 0, 0, ...colCreamBlk);
      blkB.addQuad(o0, o1, o2, o3);
    } else {
      const o0 = blkB.addVertex(pOuter.x, yFloor, zTop, nx, 0, 0, ...colCreamBlk);
      const o1 = blkB.addVertex(pOuter.x, yFloor, zBot, nx, 0, 0, ...colCreamBlk);
      const o2 = blkB.addVertex(pOuter.x, pOuter.y, zBot, nx, 0, 0, ...colCreamBlk);
      const o3 = blkB.addVertex(pOuter.x, pOuter.y, zTop, nx, 0, 0, ...colCreamBlk);
      blkB.addQuad(o0, o1, o2, o3);
    }
  }

  // E. Brass Corner Protectors & Brass Binder Clip
  const brassB = new PropGeoBuilder();
  const corners = [
    [-4.38, -3.01, 1, 1],
    [-4.38, 3.01, 1, -1],
    [4.38, -3.01, -1, 1],
    [4.38, 3.01, -1, -1],
  ];
  for (const [cx, cz, sx, sz] of corners) {
    brassB.addBox(cx + sx * 0.22, 0.092, cz + sz * 0.06, 0.46, 0.112, 0.14, colBrass);
    brassB.addBox(cx + sx * 0.06, 0.092, cz + sz * 0.22, 0.14, 0.112, 0.46, colBrass);
  }
  // Sculpted Brass Binder Clip near top-left cover edge
  brassB.addBox(-3.15, 0.16, -3.02, 0.56, 0.16, 0.34, colBrass);
  brassB.addBox(-3.28, 0.17, -3.28, 0.05, 0.05, 0.42, colBrass);
  brassB.addBox(-3.02, 0.17, -3.28, 0.05, 0.05, 0.42, colBrass);
  brassB.addBox(-3.15, 0.17, -3.47, 0.31, 0.05, 0.05, colBrass);
  // Brass accent inlay on wooden pen rest
  brassB.addBox(5.55, 0.138, 0.55, 0.48, 0.015, 0.22, colBrass);

  // F. Ceramic Coffee Mug, Washi Tape Rolls, Terracotta Ribbon Bookmark & Side Sticker Sheet
  const propsB = new PropGeoBuilder();

  // 1) Red-Terracotta Woven Ribbon Bookmark draping out from spine bottom
  const ribPts = [
    [0.00, 0.30, 2.55],
    [0.03, 0.31, 2.84],
    [0.10, 0.22, 3.08],
    [0.20, 0.075, 3.35],
    [0.34, 0.055, 3.78],
    [0.44, 0.055, 4.18],
  ];
  const ribHalfW = 0.115;
  for (let i = 0; i < ribPts.length - 1; i++) {
    const a = ribPts[i], b = ribPts[i + 1];
    const i0 = propsB.addVertex(a[0] - ribHalfW, a[1], a[2], 0, 1, 0.2, ...colTerra);
    const i1 = propsB.addVertex(a[0] + ribHalfW, a[1], a[2], 0, 1, 0.2, ...colTerra);
    const i2 = propsB.addVertex(b[0] + ribHalfW, b[1], b[2], 0, 1, 0.2, ...colTerra);
    const i3 = propsB.addVertex(b[0] - ribHalfW, b[1], b[2], 0, 1, 0.2, ...colTerra);
    propsB.addQuad(i0, i3, i2, i1);
  }
  // Classic V-cut ribbon tail at end
  const rt = ribPts[ribPts.length - 1];
  const rvL = propsB.addVertex(rt[0] - ribHalfW, rt[1], rt[2], 0, 1, 0, ...colTerra);
  const rvR = propsB.addVertex(rt[0] + ribHalfW, rt[1], rt[2], 0, 1, 0, ...colTerra);
  const rvM = propsB.addVertex(rt[0] + 0.03, rt[1], rt[2] + 0.14, 0, 1, 0, ...colTerra);
  const rvTipL = propsB.addVertex(rt[0] - ribHalfW + 0.04, rt[1], rt[2] + 0.25, 0, 1, 0, ...colTerra);
  const rvTipR = propsB.addVertex(rt[0] + ribHalfW + 0.04, rt[1], rt[2] + 0.25, 0, 1, 0, ...colTerra);
  propsB.addTri(rvL, rvTipL, rvM);
  propsB.addTri(rvM, rvTipR, rvR);

  // 2) Wooden Coaster + Ceramic Coffee Mug + Hot Espresso Surface at (-6.15, 0.04, -2.25)
  const mx = -6.15, mz = -2.25;
  propsB.addCylinder(mx, 0.04, mz, 0.96, 0.94, 0.08, 28, colKraft, true, false, 0.1);
  // Terracotta base foot + cream stoneware mug body
  propsB.addCylinder(mx, 0.12, mz, 0.64, 0.70, 0.26, 28, colTerra, false, false, 0.2);
  propsB.addHollowTube(mx, 0.38, mz, 0.70, 0.60, 0.80, 28, colCeramic, [0.35, 0.24, 0.17], 0.2);
  // Hot Espresso Liquid Disc inside mug (uvY = 0.95 triggers glossy crema shader!)
  propsB.addCylinder(mx, 0.96, mz, 0.61, 0.61, 0.04, 28, [0.12, 0.07, 0.04], true, false, 0.95);
  // Sculpted Mug Handle on left side (-X)
  for (let h = 0; h < 10; h++) {
    const t0 = (h / 10) * Math.PI - Math.PI * 0.5;
    const t1 = ((h + 1) / 10) * Math.PI - Math.PI * 0.5;
    const hx0 = mx - 0.68 - Math.cos(t0) * 0.36;
    const hy0 = 0.66 + Math.sin(t0) * 0.32;
    const hx1 = mx - 0.68 - Math.cos(t1) * 0.36;
    const hy1 = 0.66 + Math.sin(t1) * 0.32;
    propsB.addBox((hx0 + hx1) * 0.5, (hy0 + hy1) * 0.5, mz, 0.12, 0.12, 0.14, colCeramic, 0.2);
  }

  // 3) Stacked Decorative Washi Tape Rolls at (5.85, 0.04, -2.35) (uvY = 0.75 -> striped washi!)
  propsB.addHollowTube(5.85, 0.04, -2.35, 0.56, 0.32, 0.30, 24, colMatcha, colKraft, 0.75);
  propsB.addHollowTube(5.72, 0.34, -2.25, 0.48, 0.27, 0.26, 24, colHoney, colKraft, 0.75);

  // 4) Tactile Side Sticker Backing Sheet Card at (6.05, 0.052, 2.25)
  propsB.addBox(6.05, 0.052, 2.25, 1.95, 0.022, 2.75, [0.985, 0.968, 0.930], 0.1);

  return {
    desk: deskB.upload(gl),
    mat: matB.upload(gl),
    cover: covB.upload(gl),
    pageBlock: blkB.upload(gl),
    brass: brassB.upload(gl),
    props: propsB.upload(gl),
  };
}

// --- 2. Interactive 3D Brass Fountain Pen Rig (Nib Tip at Origin (0,0,0), Barrel along +Y) ---
export function createFountainPenRig(gl) {
  const bodyB = new PropGeoBuilder();
  const brassB = new PropGeoBuilder();

  const colLacquer = [0.16, 0.10, 0.07]; // Deep espresso-tortoise barrel
  const colIvory   = [0.96, 0.92, 0.83];
  const colBrass   = [0.910, 0.659, 0.161];

  // Iridium tipping ball + tapered 18k Brass Fountain Nib (y = 0.00 .. 0.48)
  brassB.addCylinder(0, 0.0, 0, 0.012, 0.068, 0.28, 12, colBrass, false, true);
  brassB.addCylinder(0, 0.28, 0, 0.068, 0.088, 0.20, 12, colBrass, true, false);
  // Grip section (y = 0.48 .. 0.92)
  bodyB.addCylinder(0, 0.48, 0, 0.088, 0.115, 0.44, 14, colLacquer);
  // Brass center band (y = 0.92 .. 1.00)
  brassB.addCylinder(0, 0.92, 0, 0.120, 0.120, 0.08, 14, colBrass);
  // Hexagonal / faceted ivory & espresso pen barrel (y = 1.00 .. 2.75)
  bodyB.addCylinder(0, 1.00, 0, 0.122, 0.112, 1.45, 8, colLacquer);
  bodyB.addCylinder(0, 2.45, 0, 0.112, 0.095, 0.30, 8, colIvory);
  // Brass finial crown & pocket clip
  brassB.addCylinder(0, 2.75, 0, 0.095, 0.065, 0.12, 12, colBrass);
  brassB.addBox(0.125, 2.25, 0, 0.032, 0.88, 0.048, colBrass);

  return {
    body: bodyB.upload(gl),
    brass: brassB.upload(gl),
  };
}

// --- 3. Subdivided 36x24 Deforming Page Mesh ---
export function createSubdividedPageMesh(gl, segU = 36, segV = 24) {
  const uvs = [];
  const indices = [];

  for (let j = 0; j <= segV; j++) {
    const v = j / segV;
    for (let i = 0; i <= segU; i++) {
      const u = i / segU;
      uvs.push(u, v);
    }
  }

  const rowStride = segU + 1;
  for (let j = 0; j < segV; j++) {
    for (let i = 0; i < segU; i++) {
      const i00 = j * rowStride + i;
      const i10 = i00 + 1;
      const i01 = (j + 1) * rowStride + i;
      const i11 = i01 + 1;
      // CCW winding when viewed from +Y at turnProgress = 0 (u -> +X, v -> +Z)
      indices.push(i00, i01, i11, i00, i11, i10);
    }
  }

  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);

  const vbo = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(uvs), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 8, 0);

  const ibo = gl.createBuffer();
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(indices), gl.STATIC_DRAW);

  gl.bindVertexArray(null);
  return { vao, count: indices.length };
}

// --- 4. All 10 Sculpted 3D Peel-and-Stick Animal & Craft Sticker Meshes ---
export function createStickerMeshes(gl) {
  const cWhite    = [0.995, 0.990, 0.976];
  const cCream    = [0.984, 0.955, 0.895];
  const cHoney    = [0.898, 0.573, 0.220]; // #e59238 Shiba / Ginger
  const cCinnamon = [0.640, 0.405, 0.235]; // Capybara / Otter
  const cWalnut   = [0.380, 0.235, 0.140]; // Owl / Bark
  const cEspresso = [0.105, 0.082, 0.068];
  const cBrass    = [0.910, 0.659, 0.161]; // #e8a829
  const cTerra    = [0.851, 0.325, 0.220]; // #d95338
  const cMatcha   = [0.180, 0.620, 0.420]; // #2e9e6b
  const cSky      = [0.145, 0.537, 0.741]; // #2589bd

  const meshes = [];

  // [0] 柴犬店长 (Shiba Barista)
  {
    const b = new StickerGeoBuilder();
    b.addDieCutDisc(0.94, 0.036, 28, cWhite, 0.0, 0.03, 5);
    b.addDome(0, 0.036, 0.06, 0.66, 0.16, 0.60, cHoney, 1.0);
    // Perked Shiba ears + cream inner ears
    b.addTriRelief([-0.58, -0.22], [-0.18, -0.45], [-0.48, -0.78], [-0.42, -0.50], 0.036, 0.16, cHoney, 1.0);
    b.addTriRelief([0.18, -0.45], [0.58, -0.22], [0.48, -0.78], [0.42, -0.50], 0.036, 0.16, cHoney, 1.0);
    // Plump cream cheeks & muzzle
    b.addDome(-0.26, 0.08, 0.22, 0.28, 0.10, 0.24, cCream, 1.0, 5, 12);
    b.addDome(0.26, 0.08, 0.22, 0.28, 0.10, 0.24, cCream, 1.0, 5, 12);
    b.addDome(0, 0.10, 0.25, 0.26, 0.12, 0.22, cCream, 1.0, 5, 12);
    // Espresso nose, eyes & eyebrows
    b.addDome(0, 0.19, 0.18, 0.09, 0.06, 0.07, cEspresso, 1.0, 4, 10);
    b.addDome(-0.24, 0.16, -0.04, 0.075, 0.05, 0.075, cEspresso, 1.0, 4, 10);
    b.addDome(0.24, 0.16, -0.04, 0.075, 0.05, 0.075, cEspresso, 1.0, 4, 10);
    b.addDome(-0.21, 0.17, -0.18, 0.06, 0.04, 0.04, cCream, 1.0, 3, 8);
    b.addDome(0.21, 0.17, -0.18, 0.06, 0.04, 0.04, cCream, 1.0, 3, 8);
    // Matcha Barista Cap on forehead
    b.addDome(0, 0.14, -0.34, 0.34, 0.10, 0.22, cMatcha, 1.0, 5, 12);
    meshes.push(b.upload(gl));
  }

  // [1] 水豚泡汤 (Onsen Capybara with Golden Yuzu)
  {
    const b = new StickerGeoBuilder();
    b.addDieCutDisc(0.94, 0.036, 28, cWhite, 0.0);
    // Hinoki wood bath rim & sky-blue warm spring water
    b.addDome(0, 0.036, 0.30, 0.76, 0.09, 0.44, [0.78, 0.56, 0.34], 1.0);
    b.addDome(0, 0.065, 0.30, 0.64, 0.08, 0.34, cSky, 1.0);
    // Chill Capybara head & blunt snout
    b.addDome(-0.04, 0.06, 0.02, 0.48, 0.17, 0.40, cCinnamon, 1.0);
    b.addDome(0.24, 0.09, 0.06, 0.26, 0.15, 0.24, [0.52, 0.32, 0.18], 1.0);
    b.addDome(-0.32, 0.14, -0.24, 0.11, 0.08, 0.09, [0.48, 0.29, 0.16], 1.0, 4, 10);
    // Bright Brass-Gold Yuzu citrus balanced on top of head + Matcha leaf!
    b.addDome(-0.08, 0.17, -0.34, 0.20, 0.15, 0.18, cBrass, 1.0, 5, 12);
    b.addDome(0.05, 0.27, -0.38, 0.09, 0.05, 0.05, cMatcha, 1.0, 3, 8);
    meshes.push(b.upload(gl));
  }

  // [2] 宇航橘猫 (Astro Ginger Cat)
  {
    const b = new StickerGeoBuilder();
    b.addDieCutDisc(0.95, 0.036, 28, cWhite, 0.0);
    // Sky-cobalt space visor backdrop + Metallic Brass space-helmet ring
    b.addDome(0, 0.036, 0, 0.78, 0.07, 0.78, [0.12, 0.36, 0.54], 1.0);
    b.addRing(0, 0.045, 0, 0.72, 0.095, cBrass, 2.0, 24, 8);
    // Ginger cat head, tabby ears & cream muzzle inside helmet
    b.addDome(0, 0.07, 0.06, 0.48, 0.16, 0.44, cHoney, 1.0);
    b.addTriRelief([-0.44, -0.14], [-0.14, -0.34], [-0.38, -0.58], [-0.32, -0.38], 0.07, 0.14, cHoney, 1.0);
    b.addTriRelief([0.14, -0.34], [0.44, -0.14], [0.38, -0.58], [0.32, -0.38], 0.07, 0.14, cHoney, 1.0);
    b.addDome(0, 0.15, 0.18, 0.22, 0.09, 0.16, cCream, 1.0, 4, 10);
    b.addDome(0, 0.21, 0.14, 0.07, 0.05, 0.06, cTerra, 1.0, 4, 8);
    b.addDome(-0.18, 0.18, 0.0, 0.07, 0.05, 0.07, cEspresso, 1.0, 4, 8);
    b.addDome(0.18, 0.18, 0.0, 0.07, 0.05, 0.07, cEspresso, 1.0, 4, 8);
    meshes.push(b.upload(gl));
  }

  // [3] 小水獭帐篷 (Otter Tent)
  {
    const b = new StickerGeoBuilder();
    b.addDieCutDisc(0.95, 0.036, 28, cWhite, 0.0, 0.04, 4);
    // Matcha-sage meadow base
    b.addDome(0, 0.036, 0.26, 0.76, 0.06, 0.44, [0.24, 0.56, 0.36], 1.0);
    // Sculpted 3D Matcha & Honey A-Frame Tent
    b.addTriRelief([-0.62, 0.32], [0.42, 0.32], [-0.10, -0.62], [-0.10, -0.12], 0.05, 0.22, cMatcha, 1.0);
    // Cute little River Otter peeking out of tent door!
    b.addDome(-0.10, 0.08, 0.22, 0.26, 0.15, 0.22, cCinnamon, 1.0, 5, 12);
    b.addDome(-0.10, 0.16, 0.30, 0.16, 0.08, 0.12, cCream, 1.0, 4, 10);
    b.addDome(-0.10, 0.21, 0.28, 0.06, 0.04, 0.05, cEspresso, 1.0, 3, 8);
    // Warm Terracotta & Brass Campfire on right
    b.addTriRelief([0.34, 0.44], [0.68, 0.44], [0.51, 0.08], [0.51, 0.30], 0.06, 0.18, cTerra, 1.0);
    b.addDome(0.51, 0.08, 0.36, 0.10, 0.12, 0.10, cBrass, 1.0, 4, 10);
    meshes.push(b.upload(gl));
  }

  // [4] 猫头鹰博士 (Scholar Owl)
  {
    const b = new StickerGeoBuilder();
    b.addDieCutDisc(0.93, 0.036, 28, cWhite, 0.0);
    // Owl body & cream belly feathers
    b.addDome(0, 0.036, 0.10, 0.62, 0.16, 0.64, cWalnut, 1.0);
    b.addDome(0, 0.09, 0.28, 0.40, 0.11, 0.34, cCream, 1.0, 5, 12);
    // Round Brass-Gold Spectacles + Eyes + Golden Beak
    b.addDome(-0.22, 0.14, -0.08, 0.18, 0.07, 0.18, cCream, 1.0, 4, 12);
    b.addDome(0.22, 0.14, -0.08, 0.18, 0.07, 0.18, cCream, 1.0, 4, 12);
    b.addRing(-0.22, 0.16, -0.08, 0.18, 0.038, cBrass, 2.0, 16, 6);
    b.addRing(0.22, 0.16, -0.08, 0.18, 0.038, cBrass, 2.0, 16, 6);
    b.addDome(-0.22, 0.18, -0.08, 0.075, 0.05, 0.075, cEspresso, 1.0, 4, 8);
    b.addDome(0.22, 0.18, -0.08, 0.075, 0.05, 0.075, cEspresso, 1.0, 4, 8);
    b.addTriRelief([-0.09, 0.02], [0.09, 0.02], [0.0, 0.22], [0.0, 0.09], 0.15, 0.10, cHoney, 1.0);
    // Scholarly Mortarboard Cap on top
    b.addTriRelief([-0.52, -0.45], [0.52, -0.45], [0.0, -0.78], [0.0, -0.52], 0.12, 0.09, cEspresso, 1.0);
    b.addTriRelief([-0.52, -0.45], [0.52, -0.45], [0.0, -0.18], [0.0, -0.40], 0.12, 0.09, cEspresso, 1.0);
    meshes.push(b.upload(gl));
  }

  // [5] 火漆印章 (Crimson Wax Seal — Molten Waxy Puddle + Embossed Ring & Star Crest!)
  {
    const b = new StickerGeoBuilder();
    // Organic molten terracotta-crimson wax puddle (mat = 3.0!)
    b.addDieCutDisc(0.92, 0.055, 32, cTerra, 3.0, 0.075, 7);
    // Raised molten outer wax bead ring
    b.addRing(0, 0.055, 0, 0.64, 0.11, [0.78, 0.26, 0.17], 3.0, 24, 8);
    // Inner depressed wax well
    b.addDome(0, 0.04, 0, 0.56, 0.035, 0.56, [0.72, 0.22, 0.15], 3.0, 4, 16);
    // Embossed gold-brushed 5-point wax crest in center!
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * Math.PI * 2 - Math.PI * 0.5;
      const aL = a - 0.36, aR = a + 0.36;
      b.addTriRelief(
        [Math.cos(aL) * 0.16, Math.sin(aL) * 0.16],
        [Math.cos(aR) * 0.16, Math.sin(aR) * 0.16],
        [Math.cos(a) * 0.46, Math.sin(a) * 0.46],
        [Math.cos(a) * 0.22, Math.sin(a) * 0.22],
        0.065,
        0.11,
        [0.90, 0.48, 0.24],
        3.0
      );
    }
    meshes.push(b.upload(gl));
  }

  // [6] 黄金五星章 (Faceted 18k Gold Star Badge)
  {
    const b = new StickerGeoBuilder();
    b.addDieCutDisc(0.92, 0.036, 28, cWhite, 0.0, 0.06, 5);
    const rOuter = 0.78;
    const rInner = 0.34;
    for (let i = 0; i < 5; i++) {
      const aTip = (i / 5) * Math.PI * 2 - Math.PI * 0.5;
      const aPrev = aTip - Math.PI / 5;
      const aNext = aTip + Math.PI / 5;
      const tip = [Math.cos(aTip) * rOuter, Math.sin(aTip) * rOuter];
      const vL  = [Math.cos(aPrev) * rInner, Math.sin(aPrev) * rInner];
      const vR  = [Math.cos(aNext) * rInner, Math.sin(aNext) * rInner];
      b.addTriRelief(vL, tip, [0, 0], [Math.cos(aTip - 0.15) * 0.18, Math.sin(aTip - 0.15) * 0.18], 0.036, 0.19, cBrass, 2.0);
      b.addTriRelief(tip, vR, [0, 0], [Math.cos(aTip + 0.15) * 0.18, Math.sin(aTip + 0.15) * 0.18], 0.036, 0.19, cBrass, 2.0);
    }
    meshes.push(b.upload(gl));
  }

  // [7] 手冲咖啡杯 (Latte Art Cup)
  {
    const b = new StickerGeoBuilder();
    b.addDieCutDisc(0.93, 0.036, 28, cWhite, 0.0);
    // Terracotta saucer + cream cup rim + rich honey crema + cream latte heart!
    b.addDome(0, 0.036, 0, 0.78, 0.06, 0.78, cTerra, 1.0, 4, 20);
    b.addRing(0.56, 0.07, 0.0, 0.18, 0.055, cCream, 1.0, 12, 6);
    b.addRing(0, 0.07, 0, 0.52, 0.075, cCream, 1.0, 22, 8);
    b.addDome(0, 0.07, 0, 0.49, 0.065, 0.49, [0.58, 0.34, 0.16], 1.0, 4, 18);
    // Sculpted 3D Cream Latte Heart in center
    b.addDome(-0.11, 0.12, -0.06, 0.15, 0.05, 0.15, cCream, 1.0, 4, 10);
    b.addDome(0.11, 0.12, -0.06, 0.15, 0.05, 0.15, cCream, 1.0, 4, 10);
    b.addTriRelief([-0.23, -0.02], [0.23, -0.02], [0.0, 0.26], [0.0, 0.08], 0.12, 0.05, cCream, 1.0);
    meshes.push(b.upload(gl));
  }

  // [8] 多肉小盆栽 (Echeveria Rosette Succulent)
  {
    const b = new StickerGeoBuilder();
    b.addDieCutDisc(0.93, 0.036, 28, cWhite, 0.0);
    // Terracotta pot rim
    b.addRing(0, 0.04, 0, 0.68, 0.085, cTerra, 1.0, 22, 6);
    b.addDome(0, 0.036, 0, 0.64, 0.05, 0.64, [0.26, 0.17, 0.11], 1.0, 3, 16);
    // Outer ring of 8 sculpted Matcha-sage succulent petals
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2;
      const aL = a - 0.34, aR = a + 0.34;
      b.addTriRelief(
        [Math.cos(aL) * 0.22, Math.sin(aL) * 0.22],
        [Math.cos(aR) * 0.22, Math.sin(aR) * 0.22],
        [Math.cos(a) * 0.68, Math.sin(a) * 0.68],
        [Math.cos(a) * 0.42, Math.sin(a) * 0.42],
        0.06,
        0.13,
        cMatcha,
        1.0
      );
    }
    // Inner ring of 6 brighter sage-gold succulent petals + center bud
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2 + 0.25;
      const aL = a - 0.42, aR = a + 0.42;
      b.addTriRelief(
        [Math.cos(aL) * 0.10, Math.sin(aL) * 0.10],
        [Math.cos(aR) * 0.10, Math.sin(aR) * 0.10],
        [Math.cos(a) * 0.44, Math.sin(a) * 0.44],
        [Math.cos(a) * 0.25, Math.sin(a) * 0.25],
        0.10,
        0.14,
        [0.28, 0.72, 0.48],
        1.0
      );
    }
    b.addDome(0, 0.14, 0, 0.14, 0.10, 0.14, cTerra, 1.0, 4, 10);
    meshes.push(b.upload(gl));
  }

  // [9] 折纸千纸鹤 (Faceted Golden Origami Crane)
  {
    const b = new StickerGeoBuilder();
    b.addDieCutDisc(0.94, 0.036, 28, cWhite, 0.0, 0.04, 4);
    // Sky-ink circular emblem backdrop
    b.addDome(0, 0.036, 0, 0.72, 0.04, 0.72, [0.88, 0.94, 0.97], 1.0, 3, 18);
    // Central folded diamond body
    b.addTriRelief([-0.24, 0.0], [0.24, 0.0], [0.0, -0.28], [0.0, -0.06], 0.055, 0.16, cHoney, 1.0);
    b.addTriRelief([-0.24, 0.0], [0.24, 0.0], [0.0, 0.28], [0.0, 0.06], 0.055, 0.16, cHoney, 1.0);
    // Swept Left & Right Origami Wings
    b.addTriRelief([-0.16, -0.14], [-0.14, 0.16], [-0.78, -0.32], [-0.42, -0.12], 0.06, 0.19, cBrass, 2.0);
    b.addTriRelief([0.14, 0.16], [0.16, -0.14], [0.78, -0.26], [0.42, -0.10], 0.06, 0.19, cBrass, 2.0);
    // Folded Neck/Head & Tail spires
    b.addTriRelief([-0.08, -0.18], [0.08, -0.18], [-0.18, -0.72], [-0.08, -0.45], 0.06, 0.15, cTerra, 1.0);
    b.addTriRelief([-0.08, 0.18], [0.08, 0.18], [0.18, 0.72], [0.08, 0.45], 0.06, 0.15, cTerra, 1.0);
    meshes.push(b.upload(gl));
  }

  return meshes;
}

// --- 5. GPU-Instanced Mug Steam & Sunbeam Golden Dust Particles ---
export function createDeskParticles(gl, steamCount = 28, dustCount = 64) {
  const rand = createPRNG(20270808);
  const total = steamCount + dustCount;
  const seeds = new Float32Array(total * 4);

  for (let i = 0; i < total; i++) {
    const o = i * 4;
    seeds[o + 0] = rand();
    seeds[o + 1] = rand();
    seeds[o + 2] = rand();
    seeds[o + 3] = i < steamCount ? 0.0 : 1.0;
  }

  const quad = new Float32Array([
    -1, -1,
     1, -1,
     1,  1,
    -1, -1,
     1,  1,
    -1,  1,
  ]);

  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);

  const qVbo = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, qVbo);
  gl.bufferData(gl.ARRAY_BUFFER, quad, gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 8, 0);

  const iVbo = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, iVbo);
  gl.bufferData(gl.ARRAY_BUFFER, seeds, gl.STATIC_DRAW);
  gl.enableVertexAttribArray(1);
  gl.vertexAttribPointer(1, 4, gl.FLOAT, false, 16, 0);
  gl.vertexAttribDivisor(1, 1);

  gl.bindVertexArray(null);
  return { vao, instanceCount: total };
}

// --- 6. Dynamic 3D Fountain-Pen Ink Ribbon Buffer Manager ---
export class InkSheetBatch {
  constructor(gl) {
    this.gl = gl;
    this.vao = gl.createVertexArray();
    this.vbo = gl.createBuffer();
    this.vertCount = 0;

    gl.bindVertexArray(this.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
    const stride = 5 * 4;
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, stride, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 3, gl.FLOAT, false, stride, 2 * 4);
    gl.bindVertexArray(null);
  }

  rebuild(strokes) {
    const data = [];
    const aspectScaleY = PAGE_W / PAGE_H;

    for (const st of strokes) {
      const pts = st.points;
      if (!pts || pts.length < 2) continue;
      const baseHalfW = st.width || 0.0068;
      const colIdx = st.colorIdx || 0;

      for (let i = 0; i < pts.length - 1; i++) {
        const p0 = pts[i];
        const p1 = pts[i + 1];
        const dx = p1.px - p0.px;
        const dy = (p1.py - p0.py) / aspectScaleY;
        const segLen = Math.hypot(dx, dy);
        if (segLen < 1e-5) continue;

        const nx = -dy / segLen;
        const ny = (dx / segLen) * aspectScaleY;

        // Taper nib start and lift end slightly like a real fountain nib!
        const t0 = i / Math.max(1, pts.length - 1);
        const t1 = (i + 1) / Math.max(1, pts.length - 1);
        const taper0 = baseHalfW * (0.45 + 0.55 * Math.sin(clamp(t0, 0.05, 0.95) * Math.PI));
        const taper1 = baseHalfW * (0.45 + 0.55 * Math.sin(clamp(t1, 0.05, 0.95) * Math.PI));

        const l0x = p0.px + nx * taper0, l0y = p0.py + ny * taper0;
        const r0x = p0.px - nx * taper0, r0y = p0.py - ny * taper0;
        const l1x = p1.px + nx * taper1, l1y = p1.py + ny * taper1;
        const r1x = p1.px - nx * taper1, r1y = p1.py - ny * taper1;

        const b0 = p0.t;
        const b1 = p1.t;

        // 2 triangles per ribbon segment
        data.push(
          l0x, l0y, b0, colIdx, -1.0,
          r0x, r0y, b0, colIdx,  1.0,
          l1x, l1y, b1, colIdx, -1.0,

          r0x, r0y, b0, colIdx,  1.0,
          r1x, r1y, b1, colIdx,  1.0,
          l1x, l1y, b1, colIdx, -1.0
        );
      }
    }

    this.vertCount = data.length / 5;
    if (this.vertCount > 0) {
      this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.vbo);
      this.gl.bufferData(this.gl.ARRAY_BUFFER, new Float32Array(data), this.gl.DYNAMIC_DRAW);
    }
  }
}
