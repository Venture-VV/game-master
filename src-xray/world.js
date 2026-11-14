// Procedural Multi-Layer 3D Human Anatomical Rig, Physical Fluoroscopy Scanner Ring,
// Vascular/Cortical Particle System & Optional Privacy-First Local Webcam Tracker.
// Zero External Assets — 100% Procedural Parametric Lofting, Swept Tubes & Cortical FBM.

import {
  TAU,
  clamp,
  lerp,
  smoothstep,
  createPRNG,
  evalCorticalGyri,
  V3,
} from './math.js';

// Interleaved Mesh Builder: pos(3) + norm(3) + anat(4) = 10 floats / vertex
class MeshBuilder {
  constructor() {
    this.verts = [];
    this.indices = [];
    this.groupStartVert = 0;
    this.groupStartIdx = 0;
  }

  get vertCount() {
    return (this.verts.length / 10) | 0;
  }

  beginGroup() {
    this.groupStartVert = this.vertCount;
    this.groupStartIdx = this.indices.length;
  }

  pushVert(px, py, pz, nx, ny, nz, headW, jawW, organTag, morphCode) {
    const idx = this.vertCount;
    this.verts.push(px, py, pz, nx, ny, nz, headW, jawW, organTag, morphCode);
    return idx;
  }

  pushTri(a, b, c) {
    this.indices.push(a, b, c);
  }

  pushQuad(a, b, c, d) {
    this.indices.push(a, b, c, a, c, d);
  }

  // Recomputes area-weighted smooth vertex normals for the current sub-mesh group
  endGroupSmoothNormals() {
    const vStart = this.groupStartVert;
    const vEnd = this.vertCount;
    const count = vEnd - vStart;
    if (count <= 0) return;

    const nxArr = new Float32Array(count);
    const nyArr = new Float32Array(count);
    const nzArr = new Float32Array(count);

    for (let i = this.groupStartIdx; i < this.indices.length; i += 3) {
      const ia = this.indices[i];
      const ib = this.indices[i + 1];
      const ic = this.indices[i + 2];
      const ba = ia * 10;
      const bb = ib * 10;
      const bc = ic * 10;

      const e1x = this.verts[bb] - this.verts[ba];
      const e1y = this.verts[bb + 1] - this.verts[ba + 1];
      const e1z = this.verts[bb + 2] - this.verts[ba + 2];

      const e2x = this.verts[bc] - this.verts[ba];
      const e2y = this.verts[bc + 1] - this.verts[ba + 1];
      const e2z = this.verts[bc + 2] - this.verts[ba + 2];

      const cx = e1y * e2z - e1z * e2y;
      const cy = e1z * e2x - e1x * e2z;
      const cz = e1x * e2y - e1y * e2x;

      if (ia >= vStart && ia < vEnd) {
        nxArr[ia - vStart] += cx;
        nyArr[ia - vStart] += cy;
        nzArr[ia - vStart] += cz;
      }
      if (ib >= vStart && ib < vEnd) {
        nxArr[ib - vStart] += cx;
        nyArr[ib - vStart] += cy;
        nzArr[ib - vStart] += cz;
      }
      if (ic >= vStart && ic < vEnd) {
        nxArr[ic - vStart] += cx;
        nyArr[ic - vStart] += cy;
        nzArr[ic - vStart] += cz;
      }
    }

    for (let v = 0; v < count; v++) {
      const base = (vStart + v) * 10;
      const x = nxArr[v];
      const y = nyArr[v];
      const z = nzArr[v];
      const l = Math.hypot(x, y, z);
      if (l > 1e-8) {
        this.verts[base + 3] = x / l;
        this.verts[base + 4] = y / l;
        this.verts[base + 5] = z / l;
      } else {
        this.verts[base + 3] = 0;
        this.verts[base + 4] = 1;
        this.verts[base + 5] = 0;
      }
    }
  }

  // Parametric UV grid builder (wrapU = true closes seam cleanly with welded normals!)
  addGrid(uSegs, vSegs, wrapU, evalFn) {
    this.beginGroup();
    const cols = wrapU ? uSegs : uSegs + 1;
    const base = this.vertCount;

    for (let iv = 0; iv <= vSegs; iv++) {
      const v = iv / vSegs;
      for (let iu = 0; iu < cols; iu++) {
        const u = iu / uSegs;
        const pt = evalFn(u, v);
        this.pushVert(
          pt.x,
          pt.y,
          pt.z,
          0,
          1,
          0,
          pt.headW ?? 0,
          pt.jawW ?? 0,
          pt.organTag ?? 0,
          pt.morph ?? 0
        );
      }
    }

    for (let iv = 0; iv < vSegs; iv++) {
      for (let iu = 0; iu < uSegs; iu++) {
        const c0 = iu;
        const c1 = wrapU ? (iu + 1) % uSegs : iu + 1;
        const a = base + iv * cols + c0;
        const b = base + iv * cols + c1;
        const c = base + (iv + 1) * cols + c1;
        const d = base + (iv + 1) * cols + c0;
        this.pushQuad(a, d, c, b);
      }
    }

    this.endGroupSmoothNormals();
  }

  // Sweeps an elliptical/flattened cross-section along a 3D Catmull-Rom / polyline path
  addSweptTube(pts, segsAround, profileFn, capEnds = true) {
    const n = pts.length;
    if (n < 2) return;
    this.beginGroup();

    const tangents = [];
    for (let i = 0; i < n; i++) {
      const pPrev = pts[Math.max(0, i - 1)];
      const pNext = pts[Math.min(n - 1, i + 1)];
      tangents.push(V3.normalize(pNext[0] - pPrev[0], pNext[1] - pPrev[1], pNext[2] - pPrev[2]));
    }

    // Parallel transport frame to prevent twisting along curved ribs, vessels & muscles
    let nrm = Math.abs(tangents[0][1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
    let bin = V3.cross(tangents[0], nrm);
    V3.normalize(bin[0], bin[1], bin[2], bin);
    nrm = V3.cross(bin, tangents[0]);
    V3.normalize(nrm[0], nrm[1], nrm[2], nrm);

    const ringBase = this.vertCount;
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1);
      const T = tangents[i];
      if (i > 0) {
        const dotTN = V3.dot(T, nrm);
        nrm = V3.normalize(nrm[0] - T[0] * dotTN, nrm[1] - T[1] * dotTN, nrm[2] - T[2] * dotTN);
        bin = V3.cross(T, nrm);
        V3.normalize(bin[0], bin[1], bin[2], bin);
      }

      const prof = profileFn(t, pts[i]);
      const rx = prof.rx ?? prof.r ?? 0.05;
      const ry = prof.ry ?? prof.r ?? 0.05;

      for (let j = 0; j < segsAround; j++) {
        const ang = (j / segsAround) * TAU;
        const ca = Math.cos(ang) * rx;
        const sa = Math.sin(ang) * ry;
        const px = pts[i][0] + bin[0] * ca + nrm[0] * sa;
        const py = pts[i][1] + bin[1] * ca + nrm[1] * sa;
        const pz = pts[i][2] + bin[2] * ca + nrm[2] * sa;
        this.pushVert(
          px,
          py,
          pz,
          0,
          1,
          0,
          prof.headW ?? 0,
          prof.jawW ?? 0,
          prof.organTag ?? 0,
          prof.morph ?? 0
        );
      }
    }

    for (let i = 0; i < n - 1; i++) {
      for (let j = 0; j < segsAround; j++) {
        const jNext = (j + 1) % segsAround;
        const a = ringBase + i * segsAround + j;
        const b = ringBase + i * segsAround + jNext;
        const c = ringBase + (i + 1) * segsAround + jNext;
        const d = ringBase + (i + 1) * segsAround + j;
        this.pushQuad(a, b, c, d);
      }
    }

    if (capEnds) {
      const p0 = profileFn(0, pts[0]);
      const cStart = this.pushVert(
        pts[0][0],
        pts[0][1],
        pts[0][2],
        0,
        1,
        0,
        p0.headW ?? 0,
        p0.jawW ?? 0,
        p0.organTag ?? 0,
        p0.morph ?? 0
      );
      for (let j = 0; j < segsAround; j++) {
        const jNext = (j + 1) % segsAround;
        this.pushTri(cStart, ringBase + jNext, ringBase + j);
      }

      const p1 = profileFn(1, pts[n - 1]);
      const lastRing = ringBase + (n - 1) * segsAround;
      const cEnd = this.pushVert(
        pts[n - 1][0],
        pts[n - 1][1],
        pts[n - 1][2],
        0,
        1,
        0,
        p1.headW ?? 0,
        p1.jawW ?? 0,
        p1.organTag ?? 0,
        p1.morph ?? 0
      );
      for (let j = 0; j < segsAround; j++) {
        const jNext = (j + 1) % segsAround;
        this.pushTri(cEnd, lastRing + j, lastRing + jNext);
      }
    }

    this.endGroupSmoothNormals();
  }

  // Deformed UV ellipsoid helper
  addEllipsoid(cx, cy, cz, rx, ry, rz, uSegs, vSegs, deformFn) {
    this.addGrid(uSegs, vSegs, true, (u, v) => {
      const phi = v * Math.PI;
      const theta = u * TAU;
      const sp = Math.sin(phi);
      const nx = sp * Math.sin(theta);
      const ny = Math.cos(phi);
      const nz = sp * Math.cos(theta);
      const pt = {
        x: cx + nx * rx,
        y: cy + ny * ry,
        z: cz + nz * rz,
        nx,
        ny,
        nz,
        headW: 1,
        jawW: 0,
        organTag: 0,
        morph: 0,
      };
      if (deformFn) deformFn(pt, u, v);
      return pt;
    });
  }

  upload(gl) {
    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);

    const vbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(this.verts), gl.STATIC_DRAW);

    const ebo = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ebo);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint32Array(this.indices), gl.STATIC_DRAW);

    const stride = 40; // 10 * 4 bytes
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, stride, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 3, gl.FLOAT, false, stride, 12);
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 4, gl.FLOAT, false, stride, 24);

    gl.bindVertexArray(null);
    return { vao, vbo, ebo, count: this.indices.length };
  }
}

// ============================================================================
// LAYER A: OUTER MUSEUM ALABASTER SCULPTURE BUST, PARTING LIPS, EYELIDS & PLINTH
// ============================================================================
function buildOuterBustMesh(gl, detailScale = 1.0) {
  const mb = new MeshBuilder();
  const uSegs = Math.round(76 * detailScale);
  const vSegs = Math.round(68 * detailScale);

  // 1. Unified Portrait Head, Parting Lips, Neck, Shoulders & Upper Bust
  // v = 0 (crown of head y = +1.30) -> v = 1 (base of bust torso y = -1.68)
  mb.addGrid(uSegs, vSegs, true, (u, v) => {
    // theta = 0 faces +Z (front nose/lips), PI faces -Z (occiput/back)
    const theta = (u - 0.5) * TAU;
    const st = Math.sin(theta);
    const ct = Math.cos(theta);
    const absX = Math.abs(st);

    let x = 0;
    let y = 0;
    let z = 0;
    let headW = 0;
    let jawW = 0;
    let organTag = 0.0;
    let morph = 0.0;

    if (v <= 0.56) {
      // --- CRANIUM & SCULPTED CLASSICAL PORTRAIT FACE (v: 0 .. 0.56 -> phi: 0 .. 0.88*PI) ---
      const vn = v / 0.56;
      const phi = vn * 0.88 * Math.PI;
      const sp = Math.sin(phi);
      const cp = Math.cos(phi);

      // Cranial proportions: narrower at jaw/chin, fuller at parietal dome
      const jawTaper = 1.0 - 0.24 * smoothstep(0.52, 0.96, vn) * (0.4 + 0.6 * Math.max(0, ct));
      let rx = 0.77 * jawTaper;
      let ry = 0.72;
      let rz = 0.84 * (1.0 - 0.10 * smoothstep(0.60, 1.0, vn));

      x = st * sp * rx;
      y = 0.58 + cp * ry;
      z = ct * sp * rz;
      headW = 1.0;

      // Flatten temporal sides slightly & add occipital fullness at back
      const sideMask = Math.pow(absX, 3.0) * smoothstep(0.22, 0.62, vn) * (1.0 - smoothstep(0.65, 0.92, vn));
      x *= 1.0 - 0.07 * sideMask;
      if (ct < 0) {
        const occiput = Math.pow(-ct, 2.0) * Math.exp(-Math.pow((y - 0.62) / 0.34, 2));
        z -= 0.07 * occiput;
      }

      // Front facial sculpting (ct > 0)
      if (ct > 0.05) {
        const front = smoothstep(0.05, 0.45, ct);

        // Supraorbital Brow Ridge (y ~ 0.70)
        const browY = Math.exp(-Math.pow((y - 0.705) / 0.055, 2));
        const browX = Math.exp(-Math.pow((Math.abs(x) - 0.24) / 0.22, 2));
        z += 0.068 * browY * browX * front;

        // Orbital Eye Sockets + Sculpted Upper & Lower Eyelids framing Tracking Eyeballs!
        for (const eyeSign of [-1, 1]) {
          const ex = (x - eyeSign * 0.30) / 0.145;
          const ey = (y - 0.58) / 0.082;
          const eRad2 = ex * ex + ey * ey;
          if (eRad2 < 2.2) {
            // Deepen orbital cavity behind eyeball front (z_cornea = 0.702) so eyeball gleams through!
            const socketWell = Math.exp(-eRad2 * 1.45);
            z -= 0.195 * socketWell;

            // Sculpted Eyelid Folds right around the palpebral slit (|ey| ~ 0.55..0.95)
            const slitOpen = 1.0 - smoothstep(0.0, 0.58, Math.abs(ey));
            const lidRim = Math.exp(-Math.pow((Math.abs(ey) - 0.64) / 0.22, 2)) * Math.exp(-ex * ex * 0.85);
            z += 0.125 * lidRim;
            // Push inner slit behind eyeball (z ~ 0.53) so cornea & iris emerge cleanly!
            z -= 0.065 * slitOpen * Math.exp(-ex * ex * 1.2);

            // Tag Upper Eyelid (y > 0.585) for live natural blinking!
            if (y > 0.582 && eRad2 < 1.35) {
              const blinkAmt = clamp(Math.exp(-ex * ex * 1.1) * Math.exp(-Math.pow((ey - 0.45) / 0.48, 2)), 0, 0.96);
              if (blinkAmt > 0.08) {
                morph = 1.0 + blinkAmt;
              }
            }
          }
        }

        // Classical Nasal Bridge, Dorsum, Nasal Tip & Alar Nostrils
        const noseY = smoothstep(0.73, 0.63, y) * (1.0 - smoothstep(0.33, 0.28, y));
        const noseWidth = mixVal(0.062, 0.105, smoothstep(0.62, 0.36, y));
        const noseX = Math.exp(-Math.pow(x / noseWidth, 2));
        const noseProfile = mixVal(0.09, 0.225, smoothstep(0.68, 0.38, y));
        z += noseProfile * noseY * noseX * front;
        // Subtle nostril wings at (x = +-0.095, y = 0.365)
        const alar = Math.exp(-Math.pow((Math.abs(x) - 0.095) / 0.048, 2)) * Math.exp(-Math.pow((y - 0.365) / 0.042, 2));
        z += 0.068 * alar * front;

        // Zygomatic Cheekbones (x = +-0.48, y = 0.44)
        const cheek = Math.exp(-Math.pow((Math.abs(x) - 0.46) / 0.19, 2)) * Math.exp(-Math.pow((y - 0.44) / 0.13, 2));
        z += 0.062 * cheek * front;
        x += Math.sign(x) * 0.032 * cheek * front;

        // Partable Upper & Lower Vermilion Lips + Recessed Oral Pouch!
        const mouthXMask = Math.exp(-Math.pow(x / 0.205, 2));
        const upperLip = Math.exp(-Math.pow((y - 0.215) / 0.034, 2)) * mouthXMask;
        const lowerLip = Math.exp(-Math.pow((y - 0.125) / 0.036, 2)) * mouthXMask;
        const oralSlit = Math.exp(-Math.pow((y - 0.170) / 0.020, 2)) * Math.exp(-Math.pow(x / 0.175, 2));

        // Cupid's bow dip at x = 0 on upper lip
        const cupidsBow = 1.0 - 0.22 * Math.exp(-Math.pow(x / 0.04, 2));
        z += 0.082 * upperLip * cupidsBow * front;
        z += 0.076 * lowerLip * front;

        // Recess the oral slit into a dark oral pouch so parting the jaw opens the mouth!
        if (oralSlit > 0.32 && front > 0.6) {
          z -= 0.24 * smoothstep(0.32, 0.92, oralSlit);
          organTag = 2.0; // Dark oral cavity interior
        } else if (upperLip + lowerLip > 0.26 && front > 0.5) {
          organTag = 1.0 + clamp((upperLip + lowerLip) * 0.75, 0.05, 0.95);
        }

        // Mental Protuberance (Sculpted Chin)
        const chin = Math.exp(-Math.pow(x / 0.17, 2)) * Math.exp(-Math.pow((y - 0.01) / 0.085, 2));
        z += 0.088 * chin * front;
      }

      // Smooth Jaw Skinning Weight: lower lip (y < 0.168) & chin rotate 100% with TMJ mandible!
      if (y < 0.34 && z > -0.12) {
        const frontJaw = smoothstep(-0.12, 0.28, z);
        const belowMouth = smoothstep(0.174, 0.145, y);
        jawW = clamp(belowMouth * frontJaw, 0.0, 1.0);
      }
    } else {
      // --- NECK, SUPRASTERNAL NOTCH, SHOULDERS & UPPER THORACIC SCULPTURE BUST (v: 0.56 .. 1.0) ---
      const vt = (v - 0.56) / 0.44;
      y = lerp(-0.04, -1.66, vt);

      // Neck cylinder (vt: 0..0.34) flaring smoothly into classical museum bust shoulders & chest
      const shoulderFlare = smoothstep(0.24, 0.68, vt);
      const baseTaper = 1.0 - 0.26 * smoothstep(0.74, 1.0, vt);

      const rx = lerp(0.44, 1.48, shoulderFlare) * baseTaper;
      const rz = lerp(0.45, 0.72, shoulderFlare) * baseTaper;

      x = st * rx;
      z = ct * rz - 0.06 * (1.0 - shoulderFlare);

      // Suprasternal hollow & clavicular ridge definition on front chest
      if (ct > 0) {
        const notch = Math.exp(-Math.pow(x / 0.14, 2)) * Math.exp(-Math.pow((y + 0.55) / 0.09, 2));
        z -= 0.055 * notch * ct;
        const clav = Math.exp(-Math.pow((Math.abs(x) - 0.55) / 0.38, 2)) * Math.exp(-Math.pow((y + 0.53) / 0.065, 2));
        z += 0.042 * clav * ct;
        const pec = Math.exp(-Math.pow((Math.abs(x) - 0.46) / 0.36, 2)) * Math.exp(-Math.pow((y + 0.96) / 0.26, 2));
        z += 0.075 * pec * ct;
      }

      // Smooth cervical neck articulation weight from shoulders (0) -> skull base (1)
      headW = clamp(1.0 - smoothstep(0.0, 0.36, vt), 0.0, 1.0);
      // Chin/submental underside follows jaw slightly near top of neck
      if (vt < 0.10 && z > 0.15) {
        jawW = (1.0 - vt / 0.10) * smoothstep(0.15, 0.40, z) * 0.65;
      }
      // Subtle chest respiratory lift & expansion
      if (vt > 0.35 && vt < 0.92) {
        morph = 0.65 * Math.sin(((vt - 0.35) / 0.57) * Math.PI);
      }
    }

    return { x, y, z, headW, jawW, organTag, morph };
  });

  // 2. Sculpted Left & Right Auricles (Ears) attached to Cranium
  for (const side of [-1, 1]) {
    const helixPts = [];
    for (let i = 0; i <= 12; i++) {
      const t = i / 12;
      const ang = lerp(-0.35 * Math.PI, 1.22 * Math.PI, t);
      helixPts.push([
        side * (0.75 + 0.045 * Math.sin(ang)),
        0.51 + 0.165 * Math.sin(ang - 0.35),
        -0.03 - 0.095 * Math.cos(ang),
      ]);
    }
    mb.addSweptTube(helixPts, 8, (t) => ({
      rx: 0.034 * (1.0 - 0.25 * Math.abs(t - 0.5)),
      ry: 0.048,
      headW: 1.0,
      jawW: 0.0,
      organTag: 0.0,
      morph: 0.0,
    }));
  }

  // 3. Twin Outer Tracking Eyeballs (with Corneal Dome Bulge & Live Gaze Morph!)
  for (const side of [-1, 1]) {
    // side = +1 is Subject Left (+X -> morph 2.2), side = -1 is Subject Right (-X -> morph 2.8)
    const morphEye = side > 0 ? 2.2 : 2.8;
    mb.addEllipsoid(side * 0.30, 0.58, 0.57, 0.130, 0.130, 0.132, 22, 16, (pt) => {
      // Slight corneal bulge at +Z pole for realistic wet specular glint
      const cornea = Math.max(0, pt.nz);
      pt.z += 0.014 * Math.pow(cornea, 4.0);
      pt.headW = 1.0;
      pt.jawW = 0.0;
      pt.organTag = 3.2;
      pt.morph = morphEye;
    });
  }

  // 4. Sleek Architectural Slate & Brass Diagnostic Plinth Pedestal (organId = 4, never discarded!)
  mb.addGrid(48, 12, true, (u, v) => {
    const theta = u * TAU;
    // Tapered bust waist -> brass collar ring -> wide heavy diagnostic base
    let r = 0.92;
    let y = lerp(-1.64, -2.08, v);
    let sub = 0.2;
    if (v < 0.28) {
      r = lerp(1.08, 0.64, v / 0.28);
    } else if (v < 0.45) {
      r = 0.68 + 0.06 * Math.sin(((v - 0.28) / 0.17) * Math.PI);
      sub = 0.85; // Brass accent ring!
    } else {
      r = lerp(0.70, 1.18, (v - 0.45) / 0.55);
      sub = v > 0.86 ? 0.82 : 0.25;
    }
    const rzScale = v < 0.28 ? lerp(0.54, 0.82, v / 0.28) : 0.86;
    return {
      x: Math.sin(theta) * r,
      y,
      z: Math.cos(theta) * r * rzScale - 0.04,
      headW: 0,
      jawW: 0,
      organTag: 4.0 + sub,
      morph: 0,
    };
  });

  return mb.upload(gl);
}

function mixVal(a, b, t) {
  return a + (b - a) * t;
}

// ============================================================================
// LAYER B: MUSCULAR SYSTEM (MYOLOGY — Striated Fibers, Bulging Masseter, SCM, Pectoralis)
// ============================================================================
function buildMuscleMesh(gl) {
  const mb = new MeshBuilder();

  for (const side of [-1, 1]) {
    // 1. MASSETER (Powerful Jaw Closing Muscle — stretches with jaw & bulges on flex!)
    for (let bundle = 0; bundle < 2; bundle++) {
      const zOff = bundle * 0.075;
      const pts = [];
      for (let i = 0; i <= 8; i++) {
        const t = i / 8;
        pts.push([
          side * lerp(0.64, 0.56, t),
          lerp(0.41, 0.03, t),
          lerp(0.32 - zOff, 0.22 - zOff * 0.8, t),
        ]);
      }
      mb.addSweptTube(pts, 10, (t) => ({
        rx: 0.048 + 0.024 * Math.sin(t * Math.PI),
        ry: 0.095 + 0.032 * Math.sin(t * Math.PI),
        headW: 1.0,
        jawW: smoothstep(0.08, 0.92, t),
        organTag: 1.0 + clamp(t, 0.02, 0.98),
        morph: 3.0 + 0.92 * Math.sin(t * Math.PI), // Masseter bulge!
      }));
    }

    // 2. TEMPORALIS FAN (5 converging radial bundles on side of cranium -> coronoid process)
    for (let f = 0; f < 5; f++) {
      const fanAng = lerp(-0.55, 0.72, f / 4);
      const pts = [];
      for (let i = 0; i <= 7; i++) {
        const t = i / 7;
        const spread = 1.0 - t;
        pts.push([
          side * (0.69 - 0.09 * t + 0.03 * Math.sin(t * Math.PI)),
          lerp(0.86 + 0.12 * Math.cos(fanAng) * spread, 0.35, t),
          lerp(-0.04 + 0.34 * Math.sin(fanAng) * spread, 0.24, t),
        ]);
      }
      mb.addSweptTube(pts, 8, (t) => ({
        rx: 0.026 + 0.015 * Math.sin(t * Math.PI),
        ry: 0.068 * (1.0 - 0.42 * t),
        headW: 1.0,
        jawW: smoothstep(0.65, 1.0, t) * 0.75,
        organTag: 2.0 + clamp(t, 0.02, 0.98),
        morph: 3.0 + 0.45 * Math.sin(t * Math.PI),
      }));
    }

    // 3. ORBICULARIS OCULI (Concentric sphincter ring around each orbit)
    const orbEyePts = [];
    const eyeSteps = 18;
    for (let i = 0; i <= eyeSteps; i++) {
      const a = (i / eyeSteps) * TAU;
      orbEyePts.push([
        side * (0.30 + 0.165 * Math.cos(a) * side),
        0.58 + 0.118 * Math.sin(a),
        0.61 - 0.05 * Math.pow(Math.cos(a), 2),
      ]);
    }
    mb.addSweptTube(orbEyePts, 7, (t) => ({
      rx: 0.024,
      ry: 0.042,
      headW: 1.0,
      jawW: 0.0,
      organTag: 3.0 + 0.45 + 0.25 * Math.sin(t * TAU),
      morph: 0.0,
    }), false);

    // 4. ZYGOMATICUS MAJOR & BUCCINATOR CHEEK STRAPS (Zygoma -> Mouth Corner)
    for (let b = 0; b < 2; b++) {
      const pts = [];
      for (let i = 0; i <= 6; i++) {
        const t = i / 6;
        pts.push([
          side * lerp(0.56, 0.22, t),
          lerp(0.42 - b * 0.08, 0.17 - b * 0.02, t),
          lerp(0.42, 0.71, t) + 0.03 * Math.sin(t * Math.PI),
        ]);
      }
      mb.addSweptTube(pts, 7, (t) => ({
        rx: 0.022,
        ry: 0.038,
        headW: 1.0,
        jawW: smoothstep(0.4, 1.0, t) * 0.48,
        organTag: 3.0 + clamp(t, 0.02, 0.98),
        morph: 0.0,
      }));
    }

    // 5. STERNOCLEIDOMASTOID (Iconic Twin V-Shaped Neck Straps: Mastoid -> Sternum & Clavicle)
    for (let headIdx = 0; headIdx < 2; headIdx++) {
      const destX = headIdx === 0 ? 0.08 : 0.29;
      const destZ = headIdx === 0 ? 0.43 : 0.37;
      const pts = [];
      for (let i = 0; i <= 10; i++) {
        const t = i / 10;
        const arcOut = Math.sin(t * Math.PI) * 0.08;
        pts.push([
          side * (lerp(0.54, destX, t) + arcOut),
          lerp(0.28, -0.56, t),
          lerp(-0.18, destZ, t) + arcOut * 0.6,
        ]);
      }
      mb.addSweptTube(pts, 9, (t) => ({
        rx: 0.042 + 0.018 * Math.sin(t * Math.PI),
        ry: 0.062 + 0.020 * Math.sin(t * Math.PI),
        headW: 1.0 - t * 0.94,
        jawW: 0.0,
        organTag: 4.0 + clamp(t, 0.02, 0.98),
        morph: 3.0 + 0.55 * Math.sin(t * Math.PI),
      }));
    }

    // 6. SPLENIUS CAPITIS & POSTERIOR TRAPEZIUS (Rich Back-of-Neck & Shoulder Myology!)
    for (let f = 0; f < 4; f++) {
      const uFan = f / 3;
      const pts = [];
      for (let i = 0; i <= 9; i++) {
        const t = i / 9;
        pts.push([
          side * lerp(0.14 + uFan * 0.24, 0.16 + uFan * 0.98, t),
          lerp(0.32 - uFan * 0.18, -0.55 - uFan * 0.42, t),
          lerp(-0.36, -0.44 + uFan * 0.34, t) - 0.05 * Math.sin(t * Math.PI),
        ]);
      }
      mb.addSweptTube(pts, 8, (t) => ({
        rx: 0.044 + 0.022 * Math.sin(t * Math.PI),
        ry: 0.088,
        headW: (1.0 - t) * (1.0 - uFan * 0.45),
        jawW: 0.0,
        organTag: 5.0 + clamp(t, 0.02, 0.98),
        morph: 0.35 * t,
      }));
    }

    // 7. PECTORALIS MAJOR FAN (5 Converging Chest Bundles: Sternum/Clavicle -> Humerus)
    for (let f = 0; f < 5; f++) {
      const uPec = f / 4;
      const originY = lerp(-0.56, -1.30, uPec);
      const originX = uPec < 0.22 ? lerp(0.46, 0.12, uPec / 0.22) : 0.11;
      const pts = [];
      for (let i = 0; i <= 9; i++) {
        const t = i / 9;
        const chestCurve = Math.sin(t * Math.PI) * (0.16 + 0.06 * (1.0 - uPec));
        pts.push([
          side * lerp(originX, 1.18, t),
          lerp(originY, -0.82 - uPec * 0.10, t),
          lerp(0.45, 0.14, t) + chestCurve,
        ]);
      }
      mb.addSweptTube(pts, 9, (t) => ({
        rx: 0.052 + 0.025 * Math.sin(t * Math.PI),
        ry: 0.095 * (1.0 - 0.32 * t),
        headW: 0.0,
        jawW: 0.0,
        organTag: 5.0 + clamp(t, 0.02, 0.98),
        morph: 0.72 * Math.sin(t * Math.PI), // Expands with ribcage breathing!
      }));
    }

    // 8. DELTOID SHOULDER BUNDLES (Anterior, Lateral, Posterior Heads)
    for (let d = 0; d < 3; d++) {
      const zAngle = (d - 1) * 0.68;
      const pts = [];
      for (let i = 0; i <= 8; i++) {
        const t = i / 8;
        const capCurve = Math.sin(t * Math.PI) * 0.12;
        pts.push([
          side * (lerp(1.02, 1.38, t) + capCurve),
          lerp(-0.50, -1.28, t),
          Math.sin(zAngle) * lerp(0.22, 0.28, t) - 0.04,
        ]);
      }
      mb.addSweptTube(pts, 9, (t) => ({
        rx: 0.068 + 0.032 * Math.sin(t * Math.PI),
        ry: 0.115 * (1.0 - 0.25 * t),
        headW: 0.0,
        jawW: 0.0,
        organTag: 5.0 + clamp(t, 0.02, 0.98),
        morph: 3.0 + 0.40 * Math.sin(t * Math.PI),
      }));
    }
  }

  // 9. ORBICULARIS ORIS (Upper & Lower Lip Muscle Ring parting live with Jaw!)
  const lipRingPts = [];
  for (let i = 0; i <= 20; i++) {
    const a = (i / 20) * TAU;
    lipRingPts.push([
      0.22 * Math.cos(a),
      0.17 + 0.068 * Math.sin(a),
      0.73 - 0.06 * Math.pow(Math.cos(a), 2),
    ]);
  }
  mb.addSweptTube(lipRingPts, 7, (t, pt) => ({
    rx: 0.026,
    ry: 0.034,
    headW: 1.0,
    jawW: smoothstep(0.175, 0.155, pt[1]),
    organTag: 3.55,
    morph: 0.0,
  }), false);

  return mb.upload(gl);
}

// ============================================================================
// LAYER C: SKELETAL SYSTEM (OSTEOLOGY — Skull, 28 Teeth, Hinged Mandible, Spine & 16 Ribs)
// ============================================================================
function buildBoneMesh(gl, detailScale = 1.0) {
  const mb = new MeshBuilder();

  // 1. CRANIUM, BROW RIDGE, HOLLOW ORBITS, NASAL APERTURE & MAXILLA (headW = 1, jawW = 0)
  mb.addGrid(Math.round(64 * detailScale), Math.round(48 * detailScale), true, (u, v) => {
    const theta = (u - 0.5) * TAU;
    const phi = lerp(0.02, 0.78 * Math.PI, v);
    const sp = Math.sin(phi);
    const cp = Math.cos(phi);
    const st = Math.sin(theta);
    const ct = Math.cos(theta);

    // Narrower facial maxilla below, wider cranial vault above
    const lowerNarrow = 1.0 - 0.30 * smoothstep(0.55, 1.0, v);
    let x = st * sp * 0.69 * lowerNarrow;
    let y = 0.63 + cp * 0.57;
    let z = ct * sp * 0.75 * (1.0 - 0.12 * smoothstep(0.62, 1.0, v));

    // Temporal fossa indentation on sides of skull behind brow
    const tempFossa = Math.exp(-Math.pow((Math.abs(x) - 0.60) / 0.16, 2))
      * Math.exp(-Math.pow((y - 0.60) / 0.18, 2))
      * Math.exp(-Math.pow((z - 0.15) / 0.26, 2));
    x -= Math.sign(x) * 0.085 * tempFossa;

    if (ct > 0.05) {
      const front = smoothstep(0.05, 0.40, ct);
      // Prominent Supraorbital Brow Ridge & Glabella
      const brow = Math.exp(-Math.pow((y - 0.70) / 0.048, 2)) * Math.exp(-Math.pow(x / 0.44, 2));
      z += 0.088 * brow * front;

      // Deep Sculpted Orbital Sockets
      for (const side of [-1, 1]) {
        const ox = (x - side * 0.285) / 0.138;
        const oy = (y - 0.575) / 0.108;
        const r2 = ox * ox + oy * oy;
        if (r2 < 2.0) {
          const rim = Math.exp(-Math.pow((Math.sqrt(r2) - 1.02) / 0.22, 2));
          const pit = Math.exp(-r2 * 1.65);
          z += 0.055 * rim * front;
          z -= 0.25 * pit * front;
        }
      }

      // Piriform Nasal Aperture (Hollow Skeletal Nose Cavity!)
      const nx = x / 0.085;
      const ny = (y - 0.41) / 0.105;
      const nr2 = nx * nx + ny * ny;
      const nasalBridge = Math.exp(-Math.pow(x / 0.065, 2)) * Math.exp(-Math.pow((y - 0.56) / 0.06, 2));
      z += 0.085 * nasalBridge * front;
      if (nr2 < 1.6) {
        z -= 0.18 * Math.exp(-nr2 * 1.7) * front;
      }

      // Maxilla Alveolar Arch above Upper Teeth (y ~ 0.24..0.32)
      const maxArch = Math.exp(-Math.pow(x / 0.25, 2)) * Math.exp(-Math.pow((y - 0.27) / 0.065, 2));
      z += 0.15 * maxArch * front;
    }

    // Clamp bottom of cranium at maxillary palate (y >= 0.22 in front, >= 0.26 at foramen magnum)
    if (v > 0.82) {
      const palateY = ct > 0.1 ? 0.23 : 0.27;
      y = lerp(y, palateY, smoothstep(0.82, 1.0, v));
    }

    return { x, y, z, headW: 1.0, jawW: 0.0, organTag: 0.2, morph: 0.0 };
  });

  // 2. BRIDGED 3D ZYGOMATIC ARCHES (Cheekbone Bridges on Left & Right!)
  for (const side of [-1, 1]) {
    const zygoPts = [
      [side * 0.29, 0.45, 0.59],
      [side * 0.52, 0.44, 0.48],
      [side * 0.67, 0.43, 0.26],
      [side * 0.65, 0.41, 0.04],
    ];
    mb.addSweptTube(zygoPts, 8, (t) => ({
      rx: 0.032,
      ry: 0.052 * (1.0 - 0.30 * t),
      headW: 1.0,
      jawW: 0.0,
      organTag: 0.25,
      morph: 0.0,
    }));
  }

  // 3. ARTICULATED MANDIBLE JAWBONE (Condyle -> Ramus -> Gonial Angle -> Chin -> Opposite Condyle)
  // 100% jawW = 1.0 so it hinges crisply around TMJ_PIVOT (0, 0.34, 0.08)!
  const jawBodyPts = [
    [-0.59, 0.35, 0.08], // Right TMJ condyle
    [-0.58, 0.22, 0.11],
    [-0.54, 0.05, 0.16], // Right gonial angle
    [-0.41, 0.01, 0.38],
    [-0.24, -0.01, 0.58],
    [0.0, -0.02, 0.67],  // Mental protuberance chin!
    [0.24, -0.01, 0.58],
    [0.41, 0.01, 0.38],
    [0.54, 0.05, 0.16],  // Left gonial angle
    [0.58, 0.22, 0.11],
    [0.59, 0.35, 0.08],  // Left TMJ condyle
  ];
  mb.addSweptTube(jawBodyPts, 10, (t) => {
    const mid = 1.0 - Math.abs(t - 0.5) * 2.0;
    return {
      rx: lerp(0.036, 0.052, mid),
      ry: lerp(0.055, 0.092, smoothstep(0.1, 0.6, mid)),
      headW: 1.0,
      jawW: 1.0,
      organTag: 0.35,
      morph: 0.0,
    };
  });

  // Mandibular Coronoid Processes (Anterior upward triangular prongs on Left & Right ramus)
  for (const side of [-1, 1]) {
    mb.addSweptTube(
      [
        [side * 0.53, 0.14, 0.21],
        [side * 0.56, 0.27, 0.24],
        [side * 0.57, 0.37, 0.23],
      ],
      7,
      (t) => ({
        rx: 0.022 * (1.0 - 0.55 * t),
        ry: 0.054 * (1.0 - 0.60 * t),
        headW: 1.0,
        jawW: 1.0,
        organTag: 0.35,
        morph: 0.0,
      })
    );
  }

  // Mandibular Alveolar Gum Arch supporting Lower Teeth
  const lowerAlvPts = [];
  for (let i = 0; i <= 10; i++) {
    const a = lerp(-0.44 * Math.PI, 0.44 * Math.PI, i / 10);
    lowerAlvPts.push([0.26 * Math.sin(a), 0.08, 0.34 + 0.30 * Math.cos(a)]);
  }
  mb.addSweptTube(lowerAlvPts, 8, () => ({
    rx: 0.036,
    ry: 0.045,
    headW: 1.0,
    jawW: 1.0,
    organTag: 0.35,
    morph: 0.0,
  }));

  // 4. UPPER & LOWER DENTAL ARCADES (14 Upper Teeth + 14 Lower Teeth = 28 Sculpted Enamel Teeth!)
  const numTeethPerArch = 14;
  for (let arch = 0; arch < 2; arch++) {
    const isLower = arch === 1;
    const jawW = isLower ? 1.0 : 0.0;
    const baseY = isLower ? 0.132 : 0.198;
    const archW = isLower ? 0.245 : 0.260;
    const archD = isLower ? 0.285 : 0.305;

    for (let i = 0; i < numTeethPerArch; i++) {
      const u = (i + 0.5) / numTeethPerArch; // 0..1 from right molar to left molar
      const ang = lerp(-0.43 * Math.PI, 0.43 * Math.PI, u);
      const distCenter = Math.abs(u - 0.5) * 2.0; // 0 = central incisor, 1 = molar
      const tx = archW * Math.sin(ang);
      const tz = 0.345 + archD * Math.cos(ang);

      // Incisors are wide/thin blades; canines are pointed; molars are broader blocks
      const isMolar = distCenter > 0.52;
      const toothR = isMolar ? 0.025 : lerp(0.021, 0.017, distCenter / 0.52);
      const crownH = isLower ? 0.034 : 0.038;
      const dirY = isLower ? 1 : -1;

      mb.addEllipsoid(
        tx,
        baseY + dirY * crownH * 0.35,
        tz,
        toothR,
        crownH,
        isMolar ? 0.025 : 0.015,
        8,
        6,
        (pt) => {
          pt.headW = 1.0;
          pt.jawW = jawW;
          pt.organTag = 1.2; // Gleaming Dental Enamel!
          pt.morph = 0.0;
        }
      );
    }
  }

  // 5. ARTICULATED VERTEBRAL COLUMN: 7 Cervical (C1..C7) + 8 Thoracic (T1..T8) Vertebrae!
  const totalVerts = 15;
  for (let vIdx = 0; vIdx < totalVerts; vIdx++) {
    const t = vIdx / (totalVerts - 1);
    const y = lerp(0.22, -1.52, t);
    // Physiological cervical lordosis (curves slightly forward) + thoracic kyphosis (curves back)
    const zCurve = vIdx < 7
      ? -0.14 + 0.04 * Math.sin((vIdx / 6) * Math.PI)
      : -0.16 - 0.16 * Math.sin(((vIdx - 6) / 8) * Math.PI * 0.75);
    const headW = vIdx < 7 ? clamp(1.0 - (vIdx / 7) * 0.92, 0.05, 0.96) : 0.0;
    const scale = lerp(0.82, 1.25, t);

    // Cylindrical Vertebral Body
    mb.addEllipsoid(0, y, zCurve, 0.11 * scale, 0.042, 0.095 * scale, 12, 6, (pt) => {
      pt.headW = headW;
      pt.jawW = 0.0;
      pt.organTag = 2.2;
      pt.morph = 0.0;
    });

    // Intervertebral Fibrocartilage Disc (organTag 2.85 = translucent cyan-ivory disc!)
    if (vIdx < totalVerts - 1) {
      mb.addEllipsoid(0, y - 0.058, zCurve, 0.105 * scale, 0.019, 0.090 * scale, 10, 5, (pt) => {
        pt.headW = headW * 0.92;
        pt.jawW = 0.0;
        pt.organTag = 2.85;
        pt.morph = 0.0;
      });
    }

    // Posterior Spinous Process & Transverse Processes (visible when rotating bust 180 deg!)
    mb.addSweptTube(
      [
        [-0.19 * scale, y, zCurve - 0.05],
        [0, y - 0.01, zCurve - 0.12],
        [0.19 * scale, y, zCurve - 0.05],
      ],
      6,
      () => ({
        rx: 0.022,
        ry: 0.026,
        headW,
        jawW: 0.0,
        organTag: 2.25,
        morph: 0.0,
      })
    );
    mb.addSweptTube(
      [
        [0, y, zCurve - 0.07],
        [0, y - 0.035 * scale, zCurve - 0.23 * scale],
      ],
      6,
      (u) => ({
        rx: 0.020 * (1.0 - 0.35 * u),
        ry: 0.030 * (1.0 - 0.30 * u),
        headW,
        jawW: 0.0,
        organTag: 2.30,
        morph: 0.0,
      })
    );
  }

  // 6. MANUBRIUM, STERNUM BODY & XIPHOID PROCESS (Anterior Midline Chest Bone)
  const sternumPts = [
    [0, -0.56, 0.42], // Manubrium jugular notch
    [0, -0.72, 0.47], // Sternal angle (Angle of Louis)
    [0, -1.02, 0.49], // Gladiolus body
    [0, -1.28, 0.46], // Lower body
    [0, -1.41, 0.43], // Xiphoid process tip
  ];
  mb.addSweptTube(sternumPts, 8, (t) => ({
    rx: t < 0.25 ? lerp(0.13, 0.09, t / 0.25) : lerp(0.085, 0.028, (t - 0.25) / 0.75),
    ry: 0.032,
    headW: 0.0,
    jawW: 0.0,
    organTag: 3.2,
    morph: 0.75, // Rises & expands with thoracic respiration!
  }));

  // 7. S-CURVED CLAVICLES (Collarbones) & SCAPULAR ACROMION HINTS
  for (const side of [-1, 1]) {
    const clavPts = [];
    for (let i = 0; i <= 10; i++) {
      const t = i / 10;
      const sCurveZ = Math.sin(t * TAU) * 0.065;
      clavPts.push([
        side * lerp(0.10, 1.18, t),
        lerp(-0.56, -0.47, t) + 0.02 * Math.sin(t * Math.PI),
        lerp(0.44, 0.04, t) + sCurveZ,
      ]);
    }
    mb.addSweptTube(clavPts, 8, (t) => ({
      rx: 0.034 + 0.012 * Math.abs(t - 0.5),
      ry: 0.028,
      headW: 0.0,
      jawW: 0.0,
      organTag: 3.15,
      morph: 0.45 * (1.0 - 0.4 * t),
    }));

    // Posterior Scapular Spine & Glenoid Shoulder Socket
    mb.addSweptTube(
      [
        [side * 0.36, -0.68, -0.38],
        [side * 0.78, -0.58, -0.32],
        [side * 1.18, -0.52, -0.05],
      ],
      7,
      (t) => ({
        rx: 0.035,
        ry: lerp(0.075, 0.045, t),
        headW: 0.0,
        jawW: 0.0,
        organTag: 3.20,
        morph: 0.30,
      })
    );

    // Upper Humeral Head & Shaft Stub at Shoulder Joint
    mb.addEllipsoid(side * 1.24, -0.62, 0.02, 0.11, 0.11, 0.10, 10, 8, (pt) => {
      pt.headW = 0.0;
      pt.jawW = 0.0;
      pt.organTag = 3.1;
      pt.morph = 0.25;
    });
    mb.addSweptTube(
      [
        [side * 1.25, -0.66, 0.02],
        [side * 1.32, -1.48, 0.00],
      ],
      8,
      (t) => ({
        rx: lerp(0.068, 0.052, t),
        ry: lerp(0.068, 0.052, t),
        headW: 0.0,
        jawW: 0.0,
        organTag: 3.1,
        morph: 0.20,
      })
    );

    // 8. EIGHT PAIRS (16) OF CURVED ANATOMICAL RIBS + COSTAL CARTILAGE!
    for (let rIdx = 0; rIdx < 8; rIdx++) {
      const uRib = rIdx / 7;
      const spineY = lerp(-0.58, -1.42, uRib);
      const spineZ = lerp(-0.19, -0.31, uRib);
      const maxWidth = lerp(0.58, 1.02, Math.sin(lerp(0.22, 0.88, uRib) * Math.PI));
      const frontY = spineY - lerp(0.08, 0.18, uRib);
      const sternX = rIdx < 6 ? 0.08 : lerp(0.14, 0.34, (rIdx - 5) / 2);
      const sternY = rIdx < 6 ? frontY : -1.28 - (rIdx - 6) * 0.05;

      const ribPts = [];
      const steps = 14;
      for (let s = 0; s <= steps; s++) {
        const st = s / steps;
        const ang = lerp(-0.5 * Math.PI, 0.48 * Math.PI, st);
        const rx = st < 0.82
          ? maxWidth * Math.cos((st - 0.42) * 1.95)
          : lerp(maxWidth * Math.cos(0.40 * 1.95), sternX, (st - 0.82) / 0.18);
        const rz = lerp(spineZ, 0.47, 0.5 + 0.5 * Math.sin(ang));
        const ry = lerp(spineY, sternY, smoothstep(0.15, 0.95, st)) - 0.05 * Math.sin(st * Math.PI);
        ribPts.push([side * Math.max(sternX, rx), ry, rz]);
      }

      mb.addSweptTube(ribPts, 7, (st) => ({
        rx: 0.019,
        ry: 0.032,
        headW: 0.0,
        jawW: 0.0,
        // Last 20% near sternum is translucent Costal Cartilage (subCoord > 0.76)!
        organTag: 3.0 + (st > 0.78 ? 0.85 : 0.25),
        morph: 0.88 * Math.sin(st * Math.PI * 0.85 + 0.15), // Ribcage breathing expansion!
      }));
    }
  }

  return mb.upload(gl);
}

// ============================================================================
// LAYER D: NEURO-CARDIAC SYSTEM (Folded Cortex, Cerebellum, Eyes/Optic Nerves & Beating 4-Chamber Heart)
// ============================================================================
function buildNeuroCardiacMesh(gl, detailScale = 1.0) {
  const mb = new MeshBuilder();
  const uBrain = Math.round(46 * detailScale);
  const vBrain = Math.round(36 * detailScale);

  // 1. FOLDED LEFT & RIGHT CEREBRAL HEMISPHERES (Frontal, Parietal, Temporal & Occipital Lobes + Gyri/Sulci!)
  for (const side of [-1, 1]) {
    mb.addEllipsoid(side * 0.28, 0.83, -0.06, 0.275, 0.29, 0.52, uBrain, vBrain, (pt) => {
      // Flatten medial wall along the longitudinal interhemispheric fissure!
      if (side > 0 && pt.x < 0.032) {
        pt.x = lerp(pt.x, 0.032, 0.85);
      } else if (side < 0 && pt.x > -0.032) {
        pt.x = lerp(pt.x, -0.032, 0.85);
      }

      // Temporal lobe bulge downward & forward on lateral inferior side
      const temporalMask = smoothstep(0.15, 0.55, Math.abs(pt.x))
        * smoothstep(0.72, 0.45, pt.y)
        * smoothstep(-0.20, 0.25, pt.z);
      pt.y -= 0.085 * temporalMask;
      pt.x += side * 0.035 * temporalMask;

      // Bake genuine 3D Cortical Gyri & Sulci folds!
      const gyrus = evalCorticalGyri(pt.x, pt.y, pt.z);
      const disp = (gyrus - 0.5) * 0.042;
      pt.x += pt.nx * disp;
      pt.y += pt.ny * disp;
      pt.z += pt.nz * disp;

      pt.headW = 1.0;
      pt.jawW = 0.0;
      pt.organTag = 1.0 + clamp(gyrus, 0.02, 0.98);
      pt.morph = 0.0;
    });

    // 2. CEREBELLAR HEMISPHERES (Tucked beneath occipital lobes with fine horizontal folia!)
    mb.addEllipsoid(side * 0.20, 0.40, -0.44, 0.20, 0.14, 0.19, 24, 18, (pt) => {
      const folia = 0.5 + 0.5 * Math.sin(pt.y * 68.0 + pt.z * 12.0);
      const disp = (folia - 0.5) * 0.016;
      pt.x += pt.nx * disp;
      pt.y += pt.ny * disp;
      pt.z += pt.nz * disp;
      pt.headW = 1.0;
      pt.jawW = 0.0;
      pt.organTag = 2.0 + clamp(folia, 0.02, 0.98);
      pt.morph = 0.0;
    });

    // 3. INNER FLUOROSCOPY TRACKING EYEBALLS + OPTIC NERVES (CN II -> Optic Chiasm)
    const morphEye = side > 0 ? 2.2 : 2.8;
    mb.addEllipsoid(side * 0.30, 0.58, 0.57, 0.124, 0.124, 0.126, 20, 14, (pt) => {
      pt.headW = 1.0;
      pt.jawW = 0.0;
      pt.organTag = 4.5;
      pt.morph = morphEye;
    });

    const opticPts = [
      [side * 0.30, 0.58, 0.45],
      [side * 0.21, 0.55, 0.25],
      [side * 0.08, 0.52, 0.08], // Optic chiasm
      [-side * 0.14, 0.50, -0.12], // Optic tract into thalamus/LGN
    ];
    mb.addSweptTube(opticPts, 7, (t) => ({
      rx: 0.022,
      ry: 0.022,
      headW: 1.0,
      jawW: 0.0,
      organTag: 3.0 + clamp(t, 0.02, 0.98),
      morph: 0.0,
    }));

    // 4. CERVICAL SPINAL NERVE ROOTS (Branching laterally from cervical cord)
    for (let nIdx = 0; nIdx < 6; nIdx++) {
      const ny = lerp(0.16, -0.48, nIdx / 5);
      const hW = clamp(1.0 - (nIdx / 6) * 0.90, 0.05, 0.95);
      mb.addSweptTube(
        [
          [0, ny, -0.16],
          [side * 0.22, ny - 0.05, -0.12],
          [side * 0.44, ny - 0.14, -0.04],
        ],
        5,
        (t) => ({
          rx: 0.014 * (1.0 - 0.45 * t),
          ry: 0.014 * (1.0 - 0.45 * t),
          headW: hW * (1.0 - 0.35 * t),
          jawW: 0.0,
          organTag: 3.0 + clamp(t, 0.02, 0.98),
          morph: 0.0,
        })
      );
    }

    // 5. COMMON CAROTID ARTERY (Organ 5 Arterial Coral) & INTERNAL JUGULAR VEIN (Organ 6 Venous Cyan)
    const carotidPts = [
      [side * 0.12, -0.70, 0.18],
      [side * 0.19, -0.44, 0.08],
      [side * 0.23, -0.12, 0.02],
      [side * 0.24, 0.20, 0.00],
      [side * 0.18, 0.46, 0.02], // Enters Circle of Willis
    ];
    mb.addSweptTube(carotidPts, 8, (t) => ({
      rx: 0.028 * (1.0 - 0.22 * t),
      ry: 0.028 * (1.0 - 0.22 * t),
      headW: smoothstep(0.22, 0.92, t),
      jawW: 0.0,
      organTag: 5.0 + clamp(t, 0.02, 0.98),
      morph: 0.0,
    }));

    const jugularPts = [
      [side * 0.25, 0.40, -0.05],
      [side * 0.29, 0.12, -0.02],
      [side * 0.27, -0.20, 0.04],
      [side * 0.22, -0.54, 0.14],
      [-0.12, -0.78, 0.16], // Drains into Superior Vena Cava on right (-X)!
    ];
    mb.addSweptTube(jugularPts, 8, (t) => ({
      rx: 0.031 * (0.8 + 0.25 * t),
      ry: 0.031 * (0.8 + 0.25 * t),
      headW: 1.0 - smoothstep(0.08, 0.78, t),
      jawW: 0.0,
      organTag: 6.0 + clamp(t, 0.02, 0.98),
      morph: 0.0,
    }));
  }

  // 6. BRAINSTEM (Pons & Medulla) + SPINAL CORD DESCENDING DOWN VERTEBRAL CANAL
  const cordPts = [
    [0, 0.54, -0.05], // Midbrain
    [0, 0.40, -0.10], // Pons bulge
    [0, 0.24, -0.15], // Medulla oblongata
    [0, -0.12, -0.13],
    [0, -0.48, -0.17],
    [0, -0.95, -0.26],
    [0, -1.45, -0.31],
  ];
  mb.addSweptTube(cordPts, 10, (t) => {
    const ponsBulge = Math.exp(-Math.pow((t - 0.14) / 0.09, 2)) * 0.048;
    return {
      rx: lerp(0.068, 0.034, smoothstep(0.0, 0.45, t)) + ponsBulge,
      ry: lerp(0.064, 0.032, smoothstep(0.0, 0.45, t)) + ponsBulge * 0.8,
      headW: clamp(1.0 - smoothstep(0.18, 0.55, t), 0.0, 1.0),
      jawW: 0.0,
      organTag: 3.0 + clamp(t, 0.02, 0.98),
      morph: 0.0,
    };
  });

  // 7. BEATING 4-CHAMBER 3D HEART INSIDE LEFT MEDIASTINUM (+X = Subject Left!)
  // 7a. Left Ventricle & Cardiac Apex (Arterial Warm Coral-Vermilion, organId = 5, morph = 4.95)
  mb.addEllipsoid(0.24, -1.01, 0.18, 0.18, 0.25, 0.17, 24, 18, (pt) => {
    // Taper inferiorly toward left-anterior cardiac apex!
    const apexT = smoothstep(-0.82, -1.24, pt.y);
    pt.x += 0.09 * apexT;
    pt.z += 0.06 * apexT;
    const cone = 1.0 - 0.42 * apexT;
    pt.x = 0.24 + (pt.x - 0.24) * cone;
    pt.z = 0.18 + (pt.z - 0.18) * cone;
    pt.headW = 0.0;
    pt.jawW = 0.0;
    pt.organTag = 5.35;
    pt.morph = 4.95;
  });

  // 7b. Right Ventricle (Anterior-Right Venous Chamber, organId = 6, morph = 4.88)
  mb.addEllipsoid(0.07, -1.00, 0.22, 0.15, 0.21, 0.14, 20, 16, (pt) => {
    pt.headW = 0.0;
    pt.jawW = 0.0;
    pt.organTag = 6.35;
    pt.morph = 4.88;
  });

  // 7c. Left Atrium (+X posterior-superior, organId = 5) & Right Atrium (-X superior, organId = 6)
  mb.addEllipsoid(0.25, -0.80, 0.08, 0.12, 0.11, 0.11, 14, 10, (pt) => {
    pt.headW = 0.0;
    pt.jawW = 0.0;
    pt.organTag = 5.15;
    pt.morph = 4.35;
  });
  mb.addEllipsoid(0.02, -0.82, 0.14, 0.125, 0.12, 0.12, 14, 10, (pt) => {
    pt.headW = 0.0;
    pt.jawW = 0.0;
    pt.organTag = 6.20;
    pt.morph = 4.35;
  });

  // 7d. Ascending Aorta & Iconic Aortic Arch curving over Pulmonary Trunk!
  const aortaPts = [
    [0.18, -0.86, 0.16],
    [0.12, -0.71, 0.20],
    [0.15, -0.63, 0.14], // Crest of Aortic Arch
    [0.22, -0.69, 0.01],
    [0.18, -0.92, -0.10], // Descending thoracic aorta
    [0.12, -1.42, -0.16],
  ];
  mb.addSweptTube(aortaPts, 10, (t) => ({
    rx: lerp(0.068, 0.052, t),
    ry: lerp(0.068, 0.052, t),
    headW: 0.0,
    jawW: 0.0,
    organTag: 5.0 + clamp(t, 0.02, 0.98),
    morph: 4.55 * (1.0 - 0.5 * t),
  }));

  // 7e. Superior Vena Cava & Bifurcating Pulmonary Trunk (Venous Medical Cyan, organId = 6)
  mb.addSweptTube(
    [
      [-0.08, -0.58, 0.15],
      [-0.02, -0.78, 0.15],
      [0.01, -0.90, 0.15],
    ],
    9,
    (t) => ({
      rx: 0.052,
      ry: 0.052,
      headW: 0.0,
      jawW: 0.0,
      organTag: 6.0 + clamp(t, 0.02, 0.98),
      morph: 4.30,
    })
  );
  mb.addSweptTube(
    [
      [0.09, -0.88, 0.24],
      [0.16, -0.73, 0.19],
      [0.36, -0.74, 0.08], // Left pulmonary artery
    ],
    8,
    (t) => ({
      rx: lerp(0.050, 0.036, t),
      ry: lerp(0.050, 0.036, t),
      headW: 0.0,
      jawW: 0.0,
      organTag: 6.0 + clamp(t, 0.02, 0.98),
      morph: 4.45,
    })
  );

  // 7f. Epicardial Coronary Artery Branches hugging the beating ventricles!
  mb.addSweptTube(
    [
      [0.16, -0.84, 0.26],
      [0.19, -0.98, 0.33],
      [0.27, -1.14, 0.29],
      [0.32, -1.23, 0.22],
    ],
    6,
    (t) => ({
      rx: 0.016 * (1.0 - 0.35 * t),
      ry: 0.016 * (1.0 - 0.35 * t),
      headW: 0.0,
      jawW: 0.0,
      organTag: 5.0 + clamp(t, 0.02, 0.98),
      morph: 4.95,
    })
  );

  return mb.upload(gl);
}

// ============================================================================
// 3D PHYSICAL BRASS-AND-CYAN FLUOROSCOPY SCANNER RING MESH (Unit Radius = 1.0)
// ============================================================================
export function createScannerRingMesh(gl) {
  const mb = new MeshBuilder();
  const segs = 72;

  // 1. Outer Brushed-Brass Gimbal Housing Torus (r = 1.018 .. 1.078, matId = 0)
  mb.addGrid(segs, 10, true, (u, v) => {
    const theta = u * TAU;
    const phi = v * TAU;
    const R = 1.048;
    const rTube = 0.028;
    const rad = R + Math.cos(phi) * rTube;
    return {
      x: Math.cos(theta) * rad,
      y: Math.sin(theta) * rad,
      z: Math.sin(phi) * 0.024,
      headW: 0.0, // Used as matId in RING_VS!
      jawW: u,    // Polar angle [0..1]
      organTag: 0,
      morph: 0,
    };
  });

  // 2. Active Glowing Medical Fluoroscopy Cyan Inner Emitter Bezel (r = 0.992 .. 1.022, matId = 1)
  mb.addGrid(segs, 8, true, (u, v) => {
    const theta = u * TAU;
    const phi = v * TAU;
    const R = 1.006;
    const rTube = 0.015;
    const rad = R + Math.cos(phi) * rTube;
    return {
      x: Math.cos(theta) * rad,
      y: Math.sin(theta) * rad,
      z: Math.sin(phi) * 0.018 + 0.006,
      headW: 1.0,
      jawW: u,
      organTag: 0,
      morph: 0,
    };
  });

  // 3. Four Cardinal Synaptic-Gold Laser Sight Notches & Gimbal Clamps (matId = 2)
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * TAU;
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    mb.addSweptTube(
      [
        [ca * 0.94, sa * 0.94, 0.012],
        [ca * 1.11, sa * 1.11, 0.012],
      ],
      6,
      (t) => ({
        rx: lerp(0.006, 0.016, t),
        ry: 0.012,
        headW: 2.0,
        jawW: k * 0.25,
        organTag: 0,
        morph: 0,
      })
    );
  }

  // 4. Subtle Inner Aperture Lens Bevel Sheen (r = 0.91 .. 1.00, matId = 3)
  mb.addGrid(segs, 2, true, (u, v) => {
    const theta = u * TAU;
    const rad = lerp(0.91, 1.00, v);
    return {
      x: Math.cos(theta) * rad,
      y: Math.sin(theta) * rad,
      z: 0.0,
      headW: 3.0,
      jawW: u,
      organTag: v,
      morph: 0,
    };
  });

  return mb.upload(gl);
}

// ============================================================================
// BUILD COMPLETE MULTI-LAYER ANATOMICAL WORLD
// ============================================================================
export function createAnatomyWorld(gl, isSoftwareGL = false) {
  const detail = isSoftwareGL ? 0.82 : 1.0;
  return {
    outerMesh: buildOuterBustMesh(gl, detail),
    muscleMesh: buildMuscleMesh(gl),
    boneMesh: buildBoneMesh(gl, detail),
    neuroMesh: buildNeuroCardiacMesh(gl, detail),
    scannerRing: createScannerRingMesh(gl),
  };
}

// ============================================================================
// GPU-INSTANCED BLOODSTREAM OXYGEN CORPUSCLES & CORTICAL SYNAPTIC SPARKS
// ============================================================================
export function createBioParticleSystem(gl, maxParticles = 660) {
  const rand = createPRNG(20260502);
  const quadVerts = new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]);
  const instanceData = new Float32Array(maxParticles * 8); // posSize(4) + colHeadW(4)

  // Pre-seed particles into 3 physiological pools:
  // Pool 0 (0..179): Arterial Oxygen Corpuscles (Heart -> Aorta -> Carotids -> Brain)
  // Pool 1 (180..279): Venous Return Corpuscles (Brain -> Jugulars -> Vena Cava -> Right Atrium)
  // Pool 2 (280..max-1): Cortical Action-Potential Synaptic Sparks across Left/Right Hemispheres!
  const particles = [];
  for (let i = 0; i < maxParticles; i++) {
    const kind = i < 180 ? 0 : i < 280 ? 1 : 2;
    const side = rand() < 0.5 ? -1 : 1;
    // Random cortical point on folded brain surface
    const theta = rand() * TAU;
    const phi = Math.acos(2 * rand() - 1) * 0.72;
    const bx = side * (0.06 + Math.abs(Math.sin(phi) * Math.sin(theta)) * 0.50);
    const by = 0.72 + Math.cos(phi) * 0.33;
    const bz = -0.04 + Math.sin(phi) * Math.cos(theta) * 0.50;

    particles.push({
      kind,
      side,
      phase: rand(),
      speed: 0.28 + rand() * 0.42,
      jitterX: (rand() - 0.5) * 0.04,
      jitterZ: (rand() - 0.5) * 0.04,
      bx,
      by,
      bz,
      theta,
      phi,
    });
  }

  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);

  const quadVbo = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, quadVbo);
  gl.bufferData(gl.ARRAY_BUFFER, quadVerts, gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 8, 0);

  const instVbo = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, instVbo);
  gl.bufferData(gl.ARRAY_BUFFER, instanceData.byteLength, gl.DYNAMIC_DRAW);

  gl.enableVertexAttribArray(1);
  gl.vertexAttribPointer(1, 4, gl.FLOAT, false, 32, 0);
  gl.vertexAttribDivisor(1, 1);

  gl.enableVertexAttribArray(2);
  gl.vertexAttribPointer(2, 4, gl.FLOAT, false, 32, 16);
  gl.vertexAttribDivisor(2, 1);

  gl.bindVertexArray(null);

  function update(dt, time, heartSystole, bpmScale, neuralStorm) {
    let activeSparks = 0;
    // During normal state show ~420 particles; during Neural Storm ignite all 660!
    const activeLimit = Math.round(lerp(420, maxParticles, clamp(neuralStorm, 0, 1)));
    let writeCount = 0;

    for (let i = 0; i < activeLimit; i++) {
      const p = particles[i];
      let px = 0;
      let py = 0;
      let pz = 0;
      let size = 0.022;
      let r = 1;
      let g = 0.8;
      let b = 0.2;
      let headW = 0.0;

      if (p.kind === 0) {
        // Arterial surge boosted by systolic ejection!
        p.phase = (p.phase + dt * p.speed * bpmScale * (0.65 + 1.45 * heartSystole)) % 1.0;
        const t = p.phase;
        if (t < 0.25) {
          const u = t / 0.25;
          px = lerp(0.19, 0.14, u) + p.jitterX;
          py = lerp(-0.96, -0.64, u);
          pz = lerp(0.16, 0.18, u) + p.jitterZ;
          headW = 0.0;
        } else {
          const u = (t - 0.25) / 0.75;
          px = p.side * lerp(0.14, 0.22, Math.sin(u * Math.PI * 0.7)) + p.jitterX;
          py = lerp(-0.64, 0.56, u);
          pz = lerp(0.15, 0.02, u) + p.jitterZ;
          headW = smoothstep(0.20, 0.88, u);
        }
        size = 0.020 + 0.010 * heartSystole;
        // Warm Arterial Coral-Vermilion (#ef4444 / #fb923c, zero purple!)
        r = 0.98;
        g = 0.34 + 0.20 * heartSystole;
        b = 0.16;
      } else if (p.kind === 1) {
        // Venous return down Jugulars -> Superior Vena Cava
        p.phase = (p.phase + dt * p.speed * 0.72 * bpmScale) % 1.0;
        const t = p.phase;
        px = lerp(p.side * 0.26, -0.04, smoothstep(0.55, 1.0, t)) + p.jitterX;
        py = lerp(0.46, -0.88, t);
        pz = lerp(-0.04, 0.15, t) + p.jitterZ;
        headW = 1.0 - smoothstep(0.08, 0.72, t);
        size = 0.019;
        // Medical Fluoroscopy Cyan (#22d3ee)
        r = 0.133;
        g = 0.827;
        b = 0.933;
      } else {
        // Cortical Action-Potential Sparks dancing along cerebral gyri!
        const stormSpeed = 1.0 + 3.2 * neuralStorm;
        p.phase = (p.phase + dt * p.speed * 1.45 * stormSpeed) % 1.0;
        const pulse = Math.sin(p.phase * Math.PI);
        const hop = 0.035 * Math.sin(time * 4.0 + i);
        px = p.bx + Math.cos(time * 2.3 + i) * 0.025;
        py = p.by + hop;
        pz = p.bz + Math.sin(time * 2.1 + i * 1.7) * 0.035;
        headW = 1.0;
        size = (0.016 + 0.022 * neuralStorm) * (0.45 + 0.85 * pulse);

        // Synaptic Gold (#f5b82e) & Crisp Cyan-White (#a5f3fc)
        const goldMix = (i % 4 === 0) ? 0.25 : 0.92;
        r = lerp(0.20, 0.98, goldMix);
        g = lerp(0.90, 0.76, goldMix);
        b = lerp(0.96, 0.20, goldMix);
        if (pulse > 0.25) activeSparks++;
      }

      const base = writeCount * 8;
      instanceData[base] = px;
      instanceData[base + 1] = py;
      instanceData[base + 2] = pz;
      instanceData[base + 3] = size;
      instanceData[base + 4] = r;
      instanceData[base + 5] = g;
      instanceData[base + 6] = b;
      instanceData[base + 7] = headW;
      writeCount++;
    }

    gl.bindBuffer(gl.ARRAY_BUFFER, instVbo);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, instanceData.subarray(0, writeCount * 8));
    return { drawCount: writeCount, activeSparks };
  }

  return { vao, update };
}

// ============================================================================
// OPTIONAL PRIVACY-FIRST LOCAL 48x36 OFFSCREEN WEBCAM MOTION & MOUTH TRACKER
// ============================================================================
export class WebcamMotionTracker {
  constructor() {
    this.active = false;
    this.video = null;
    this.stream = null;
    this.cvs = document.createElement('canvas');
    this.cvs.width = 48;
    this.cvs.height = 36;
    this.ctx = this.cvs.getContext('2d', { willReadFrequently: true });
    this.prevLuma = new Float32Array(48 * 36);
    this.yaw = 0;
    this.pitch = 0;
    this.jawOpen = 0;
  }

  async toggle() {
    if (this.active) {
      this.stop();
      return { ok: true, active: false };
    }
    if (!navigator.mediaDevices || typeof navigator.mediaDevices.getUserMedia !== 'function') {
      return { ok: false, active: false, reason: 'unavailable' };
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 160 }, height: { ideal: 120 }, facingMode: 'user' },
        audio: false,
      });
      const vid = document.createElement('video');
      vid.srcObject = stream;
      vid.muted = true;
      vid.playsInline = true;
      await vid.play();
      this.stream = stream;
      this.video = vid;
      this.active = true;
      return { ok: true, active: true };
    } catch {
      this.stop();
      return { ok: false, active: false, reason: 'denied' };
    }
  }

  stop() {
    this.active = false;
    if (this.stream) {
      this.stream.getTracks().forEach((t) => t.stop());
      this.stream = null;
    }
    this.video = null;
  }

  sample() {
    if (!this.active || !this.video || this.video.readyState < 2 || !this.ctx) {
      return null;
    }
    const w = 48;
    const h = 36;
    // Mirror horizontally like a natural vanity/X-Ray mirror!
    this.ctx.save();
    this.ctx.scale(-1, 1);
    this.ctx.drawImage(this.video, -w, 0, w, h);
    this.ctx.restore();

    const data = this.ctx.getImageData(0, 0, w, h).data;
    let sumW = 0;
    let sumX = 0;
    let sumY = 0;

    for (let y = 3; y < h - 3; y++) {
      for (let x = 4; x < w - 4; x++) {
        const idx = y * w + x;
        const p = idx * 4;
        const r = data[p];
        const g = data[p + 1];
        const b = data[p + 2];
        const luma = 0.299 * r + 0.587 * g + 0.114 * b;
        const diff = Math.abs(luma - this.prevLuma[idx]);
        this.prevLuma[idx] = luma;

        // Warm skin/face salience + motion weight
        const warmBias = Math.max(0, r - b * 0.85) * 0.35;
        const weight = warmBias + diff * 1.6;
        if (weight > 8) {
          sumW += weight;
          sumX += x * weight;
          sumY += y * weight;
        }
      }
    }

    if (sumW > 120) {
      const cx = sumX / sumW; // 0..48
      const cy = sumY / sumW; // 0..36
      this.yaw = clamp(((cx - 24) / 14) * 0.55, -0.58, 0.58);
      this.pitch = clamp(((cy - 17) / 11) * 0.38, -0.38, 0.38);

      // Estimate mouth opening from dark oral cavity contrast below face centroid
      const mx0 = clamp(Math.round(cx - 4), 4, w - 9);
      const myCheek = clamp(Math.round(cy - 2), 3, h - 10);
      const myMouth = clamp(Math.round(cy + 5), 6, h - 4);
      let cheekLum = 1;
      let mouthDark = 255;
      for (let dx = 0; dx < 8; dx++) {
        cheekLum += this.prevLuma[myCheek * w + mx0 + dx];
        mouthDark = Math.min(mouthDark, this.prevLuma[myMouth * w + mx0 + dx]);
      }
      cheekLum /= 8;
      const contrast = (cheekLum - mouthDark) / Math.max(cheekLum, 40);
      this.jawOpen = clamp((contrast - 0.28) * 2.4, 0, 1);
    }

    return { yaw: this.yaw, pitch: this.pitch, jawOpen: this.jawOpen };
  }
}
