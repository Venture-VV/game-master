import {
  PAGE_W,
  PAGE_H,
  SPREAD_THEMES,
  STICKER_CATALOG,
  INK_PALETTE,
  M4,
  V3,
  clamp,
  lerp,
  damp,
  createPRNG,
  raycastOpenPlanner,
} from './math.js';
import {
  DESK_PROP_VS,
  DESK_PROP_FS,
  PAGE_VS,
  PAGE_FS,
  STICKER_VS,
  STICKER_FS,
  INK_VS,
  INK_FS,
  PARTICLE_VS,
  PARTICLE_FS,
  POST_VS,
  POST_FS,
} from './shaders.js';
import {
  createDeskAndBookRig,
  createFountainPenRig,
  createSubdividedPageMesh,
  createStickerMeshes,
  createDeskParticles,
  InkSheetBatch,
} from './world.js';
import { Planner3DAudio } from './audio.js';

// --- WebGL2 Shader & Program Compilation ---
function compileShader(gl, type, src) {
  const sh = gl.createShader(type);
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    const info = gl.getShaderInfoLog(sh);
    gl.deleteShader(sh);
    throw new Error(`Shader compile error: ${info}`);
  }
  return sh;
}

function createProgram(gl, vsSrc, fsSrc, uniformNames) {
  const prog = gl.createProgram();
  const vs = compileShader(gl, gl.VERTEX_SHADER, vsSrc);
  const fs = compileShader(gl, gl.FRAGMENT_SHADER, fsSrc);
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    throw new Error(`Program link error: ${gl.getProgramInfoLog(prog)}`);
  }
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  const u = {};
  for (const name of uniformNames) {
    u[name] = gl.getUniformLocation(prog, name);
  }
  return { prog, u };
}

// --- DOM References ---
const appEl = document.getElementById('planner-app');
const canvas = document.getElementById('pl-canvas');
const hudEl = document.getElementById('pl-hud');
const overlayEl = document.getElementById('pl-overlay');

const perfEl = document.getElementById('pl-perf');
const spreadBadgeEl = document.getElementById('pl-spread-badge');
const spreadNameEl = document.getElementById('pl-spread-name');
const countsEl = document.getElementById('pl-counts');
const toastFeedEl = document.getElementById('pl-toast-feed');
const bannerEl = document.getElementById('pl-banner');
const bannerTitleEl = document.getElementById('pl-banner-title');
const bannerSubEl = document.getElementById('pl-banner-sub');
const liveTipEl = document.getElementById('pl-live-tip');

const trayStickerEl = document.getElementById('pl-tray-sticker');
const trayPenEl = document.getElementById('pl-tray-pen');
const trayTurnEl = document.getElementById('pl-tray-turn');

const modeBtnSticker = document.getElementById('mode-btn-sticker');
const modeBtnPen = document.getElementById('mode-btn-pen');
const modeBtnTurn = document.getElementById('mode-btn-turn');

const btnOpen = document.getElementById('pl-btn-open');
const btnSampleFlip = document.getElementById('pl-btn-sample-flip');
const btnStudio = document.getElementById('pl-btn-studio');
const studioEl = document.getElementById('pl-studio');
const scopeCvs = document.getElementById('pl-scope');
const scopeCtx = scopeCvs ? scopeCvs.getContext('2d') : null;
const titleEl = document.getElementById('pl-title');

const stkChips = Array.from(document.querySelectorAll('.pl-stk-chip'));
const inkChips = Array.from(document.querySelectorAll('.pl-ink-chip'));
const nibChips = Array.from(document.querySelectorAll('.pl-nib-chip'));
const tabBtns = Array.from(document.querySelectorAll('.pl-tab-btn'));
const camChips = Array.from(document.querySelectorAll('.pl-cam-chip, .cam-pill'));

// --- WebGL2 Context Initialization ---
const gl = canvas.getContext('webgl2', {
  antialias: false,
  alpha: false,
  powerPreference: 'high-performance',
});
if (!gl) {
  if (titleEl) titleEl.textContent = '当前浏览器未启用 WebGL2';
  throw new Error('WebGL2 unavailable');
}

const dbgExt = gl.getExtension('WEBGL_debug_renderer_info');
const rendererStr = dbgExt ? String(gl.getParameter(dbgExt.UNMASKED_RENDERER_WEBGL)) : '';
const isSoftwareGL = /SwiftShader|llvmpipe|Software/i.test(rendererStr);
const hasFloatFBO = Boolean(gl.getExtension('EXT_color_buffer_float'));

// --- Compile Shaders ---
const progDesk = createProgram(gl, DESK_PROP_VS, DESK_PROP_FS, [
  'uProj',
  'uView',
  'uModel',
  'uCamPos',
  'uSunDir',
  'uTime',
  'uMatType',
]);

const progPage = createProgram(gl, PAGE_VS, PAGE_FS, [
  'uProj',
  'uView',
  'uTurnProgress',
  'uSpineLift',
  'uPageSide',
  'uSheetFace',
  'uCamPos',
  'uSunDir',
  'uTime',
  'uSpreadIdx',
  'uHoverUV',
]);

const progSticker = createProgram(gl, STICKER_VS, STICKER_FS, [
  'uProj',
  'uView',
  'uModel',
  'uPlacementMode',
  'uPageSide',
  'uStickerUV',
  'uStickerRot',
  'uStickerScale',
  'uTurnProgress',
  'uSpineLift',
  'uSheetFace',
  'uPeelAmount',
  'uCamPos',
  'uSunDir',
  'uTime',
  'uHighlight',
]);

const progInk = createProgram(gl, INK_VS, INK_FS, [
  'uProj',
  'uView',
  'uPageSide',
  'uTurnProgress',
  'uSpineLift',
  'uSheetFace',
  'uCamPos',
  'uSunDir',
  'uTime',
]);

const progParticle = createProgram(gl, PARTICLE_VS, PARTICLE_FS, [
  'uProj',
  'uView',
  'uCamRight',
  'uCamUp',
  'uTime',
]);

const progPost = createProgram(gl, POST_VS, POST_FS, ['uSceneTex', 'uTexel']);
const postEmptyVao = gl.createVertexArray();

// --- Build 3D World Meshes ---
const deskRig = createDeskAndBookRig(gl);
const penRig = createFountainPenRig(gl);
const pageMesh = createSubdividedPageMesh(gl, 36, 24);
const stickerMeshes = createStickerMeshes(gl);
const particles = createDeskParticles(gl, 28, 64);

// 4 Decorative 3D Stickers Displayed on the Side Backing Sheet Card (x=6.05, z=2.25)
const deskSheetStickers = [
  { stickerId: 0, x: 5.62, z: 1.55, rot: 0.12 },
  { stickerId: 1, x: 6.46, z: 1.62, rot: -0.15 },
  { stickerId: 8, x: 5.64, z: 2.75, rot: -0.08 },
  { stickerId: 9, x: 6.44, z: 2.82, rot: 0.18 },
];

// One InkSheetBatch per (spread 0..5, side 0..1) => 12 lightweight VBO batches
const inkBatches = Array.from({ length: SPREAD_THEMES.length * 2 }, () => new InkSheetBatch(gl));
function getInkBatch(spread, side) {
  return inkBatches[spread * 2 + side];
}

// --- Offscreen Scene FBO ---
let fbo = null;
let fboColorTex = null;
let fboDepthRb = null;
let fboW = 0;
let fboH = 0;
let qualityMode = isSoftwareGL ? 'low' : 'high';

function ensureSceneFBO() {
  const dprCap = qualityMode === 'low' ? 0.75 : qualityMode === 'med' ? 1.0 : Math.min(window.devicePixelRatio || 1, 1.75);
  const effDpr = isSoftwareGL ? Math.min(dprCap, 0.75) : dprCap;
  const cw = Math.max(2, Math.floor((appEl.clientWidth || 800) * effDpr));
  const ch = Math.max(2, Math.floor((appEl.clientHeight || 446) * effDpr));

  if (canvas.width !== cw || canvas.height !== ch) {
    canvas.width = cw;
    canvas.height = ch;
  }

  if (fbo && fboW === cw && fboH === ch) return;
  fboW = cw;
  fboH = ch;

  if (fboColorTex) gl.deleteTexture(fboColorTex);
  if (fboDepthRb) gl.deleteRenderbuffer(fboDepthRb);
  if (fbo) gl.deleteFramebuffer(fbo);

  fbo = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);

  fboColorTex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, fboColorTex);
  if (hasFloatFBO) {
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, fboW, fboH, 0, gl.RGBA, gl.HALF_FLOAT, null);
  } else {
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, fboW, fboH, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  }
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, fboColorTex, 0);

  fboDepthRb = gl.createRenderbuffer();
  gl.bindRenderbuffer(gl.RENDERBUFFER, fboDepthRb);
  gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT24, fboW, fboH);
  gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, fboDepthRb);

  const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
  if (status !== gl.FRAMEBUFFER_COMPLETE && hasFloatFBO) {
    gl.bindTexture(gl.TEXTURE_2D, fboColorTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, fboW, fboH, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  }
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
}

// --- Planner Interactive State ---
const audio = new Planner3DAudio();
const rand = createPRNG(20270520);

let isOverlayOpen = true;
let activeTool = 'sticker'; // 'sticker' | 'pen' | 'turn'
let spreadIndex = 0;        // 0..5

// Selected Tool Options
let selectedStickerId = 0;
let stickerPreviewRot = -0.06;
let selectedInkIdx = 0;
let selectedNibIdx = 1; // 0: EF (0.0045), 1: M (0.0072), 2: B (0.0115)
const NIB_WIDTHS = [0.0045, 0.0072, 0.0115];

// Page-Turn Spring State
const turnState = {
  active: false,
  baseSpread: 0, // sheet between baseSpread and baseSpread + 1
  p: 0.0,        // 0 = lying on Right (showing baseSpread), 1 = lying on Left (showing baseSpread + 1)
  targetP: 0.0,
  dragging: false,
  dragStartX: 0,
  dragStartP: 0,
};

// Camera Presets & Orbit State
const CAM_PRESETS = [
  { name: '俯视书桌', yaw: 0.00, pitch: 1.07, dist: 10.5, tx: 0.00, ty: 0.24, tz: 0.22 },
  { name: '微距特写', yaw: -0.10, pitch: 0.88, dist: 7.0,  tx: 0.10, ty: 0.36, tz: 0.20 },
  { name: '斜向暖阳', yaw: 0.34, pitch: 0.82, dist: 9.7,  tx: 0.00, ty: 0.28, tz: 0.14 },
];
let camPresetIdx = 0;
const cam = {
  yaw: CAM_PRESETS[0].yaw,
  pitch: CAM_PRESETS[0].pitch,
  dist: CAM_PRESETS[0].dist,
  targetYaw: CAM_PRESETS[0].yaw,
  targetPitch: CAM_PRESETS[0].pitch,
  targetDist: CAM_PRESETS[0].dist,
  tx: CAM_PRESETS[0].tx,
  ty: CAM_PRESETS[0].ty,
  tz: CAM_PRESETS[0].tz,
  orbitDragging: false,
  lastX: 0,
  lastY: 0,
};

// Placed 3D Stickers & Fountain-Pen Ink Strokes
const stickers = [];
let nextStickerUid = 1;
const inkStrokes = [];
let activeDrawingStroke = null;
let penVelocity = 0;

// 3D Brass Fountain Pen Animated Pose
const penPose = {
  x: 5.55,
  y: 0.24,
  z: 1.55,
  rx: -Math.PI * 0.49,
  ry: 0.0,
  rz: 0.04,
};

// Cursor Raycast Hover State
const pointer = {
  ndcX: 0,
  ndcY: 0,
  inside: false,
  altKey: false,
  hoverHit: null,     // { side, px, py, x, y, z, ... }
  hoveredSticker: null,
};

// Matrices
const matProj = M4.create();
const matView = M4.create();
const matVP = M4.create();
const matInvVP = M4.create();
const matModel = M4.create();
const sunDir = V3.normalize(-0.56, 0.76, 0.32);

// --- Seed Starter Spread 0 Stickers & Neat Fountain-Pen Ink Checkmarks ---
function seedStarterPlannerContent() {
  // 3 Charming Starter 3D Stickers on Spread 0 ("01 · 柴犬咖啡周记")
  stickers.push(
    {
      uid: nextStickerUid++,
      spread: 0,
      side: 0,
      px: 0.78,
      py: 0.24,
      stickerId: 0, // 柴犬店长
      rot: -0.09,
      scale: 0.94,
      peel: 0.0,
      targetPeel: 0.0,
      removing: false,
    },
    {
      uid: nextStickerUid++,
      spread: 0,
      side: 0,
      px: 0.78,
      py: 0.77,
      stickerId: 7, // 手冲咖啡杯
      rot: 0.08,
      scale: 0.92,
      peel: 0.0,
      targetPeel: 0.0,
      removing: false,
    },
    {
      uid: nextStickerUid++,
      spread: 0,
      side: 1,
      px: 0.79,
      py: 0.82,
      stickerId: 5, // 火漆印章
      rot: -0.06,
      scale: 0.96,
      peel: 0.0,
      targetPeel: 0.0,
      removing: false,
    }
  );

  // 3 Neat Espresso-Ink Checkmarks inside Spread 0 Left-page Weekly Checkboxes + 1 Gold Flourish on Right
  const checkRows = [0.176, 0.202, 0.302];
  for (const cy of checkRows) {
    inkStrokes.push({
      spread: 0,
      side: 0,
      colorIdx: 0,
      width: 0.0058,
      points: [
        { px: 0.236, py: cy - 0.002, t: -10 },
        { px: 0.244, py: cy + 0.007, t: -10 },
        { px: 0.255, py: cy - 0.007, t: -10 },
        { px: 0.266, py: cy - 0.016, t: -10 },
      ],
    });
  }

  // Golden calligraphy wave flourish under Shiba Pour-Over Café frame on Right page
  const wavePts = [];
  for (let i = 0; i <= 16; i++) {
    const u = i / 16;
    wavePts.push({
      px: 0.30 + u * 0.40,
      py: 0.618 + Math.sin(u * Math.PI * 2.0) * 0.009,
      t: -10,
    });
  }
  inkStrokes.push({
    spread: 0,
    side: 1,
    colorIdx: 1, // Brass Nib Gold
    width: 0.0068,
    points: wavePts,
  });

  rebuildSpreadInk(0, 0);
  rebuildSpreadInk(0, 1);
  syncHUDText();
}

function rebuildSpreadInk(spread, side) {
  const list = inkStrokes.filter((s) => s.spread === spread && s.side === side);
  getInkBatch(spread, side).rebuild(list);
}

// --- HUD Feedback Helpers ---
let bannerTimer = 0;
function showBanner(title, sub) {
  if (!bannerEl) return;
  bannerTitleEl.textContent = title;
  bannerSubEl.textContent = sub;
  bannerEl.classList.add('show');
  bannerTimer = 2.1;
}

function pushToast(msg, variant = '') {
  if (!toastFeedEl) return;
  const item = document.createElement('div');
  item.className = `pl-toast${variant ? ` ${variant}` : ''}`;
  item.textContent = msg;
  toastFeedEl.appendChild(item);
  while (toastFeedEl.children.length > 3) {
    toastFeedEl.removeChild(toastFeedEl.firstChild);
  }
  setTimeout(() => {
    if (item.parentNode) item.parentNode.removeChild(item);
  }, 2400);
}

function syncHUDText() {
  const th = SPREAD_THEMES[spreadIndex];
  if (spreadBadgeEl) spreadBadgeEl.textContent = `${th.code}/06`;
  if (spreadNameEl) spreadNameEl.textContent = th.title;
  if (countsEl) countsEl.textContent = `贴纸 ${stickers.length} · 墨迹 ${inkStrokes.length}`;

  tabBtns.forEach((b, idx) => {
    b.classList.toggle('active', idx === spreadIndex);
  });
}

function setToolMode(nextTool) {
  activeTool = nextTool;
  modeBtnSticker.classList.toggle('active', activeTool === 'sticker');
  modeBtnPen.classList.toggle('active', activeTool === 'pen');
  modeBtnTurn.classList.toggle('active', activeTool === 'turn');

  trayStickerEl.classList.toggle('active', activeTool === 'sticker');
  trayPenEl.classList.toggle('active', activeTool === 'pen');
  trayTurnEl.classList.toggle('active', activeTool === 'turn');

  canvas.classList.remove('pen-cursor', 'grab-cursor', 'grabbing-cursor');
  if (activeTool === 'pen') {
    canvas.classList.add('pen-cursor');
    liveTipEl.textContent = '按住左键书写立体湿墨 · 右键环视 · [Z] 撤销';
  } else if (activeTool === 'turn') {
    canvas.classList.add('grab-cursor');
    liveTipEl.textContent = '左键横拖书页真实卷曲翻页 · 右键环视 · 滚轮缩放';
  } else {
    const stk = STICKER_CATALOG[selectedStickerId];
    liveTipEl.textContent = `当前：${stk.name} · 左键贴下 · Alt/右键揭起`;
  }
}

function setCameraPreset(idx) {
  camPresetIdx = ((idx % CAM_PRESETS.length) + CAM_PRESETS.length) % CAM_PRESETS.length;
  const p = CAM_PRESETS[camPresetIdx];
  cam.targetYaw = p.yaw;
  cam.targetPitch = p.pitch;
  cam.targetDist = p.dist;
  cam.tx = p.tx;
  cam.ty = p.ty;
  cam.tz = p.tz;

  camChips.forEach((el) => {
    el.classList.toggle('active', Number(el.dataset.cam) === camPresetIdx);
  });
  pushToast(`切换视角 · ${p.name}`);
}

// --- Smooth 3D Page Turning ---
function triggerPageTurn(dirOrTarget = 1) {
  let targetSpread;
  if (dirOrTarget === -1) {
    targetSpread = spreadIndex - 1;
  } else if (dirOrTarget === 1 || dirOrTarget === undefined) {
    targetSpread = spreadIndex + 1;
  } else {
    targetSpread = Number(dirOrTarget);
  }
  targetSpread = clamp(targetSpread, 0, SPREAD_THEMES.length - 1);
  if (targetSpread === spreadIndex && !turnState.active) {
    return;
  }

  const prevSpread = spreadIndex;
  spreadIndex = targetSpread;

  if (targetSpread > prevSpread) {
    // Turning forward: sheet flips Right (0) -> Left (1)
    turnState.active = true;
    turnState.baseSpread = targetSpread - 1;
    turnState.p = prevSpread === targetSpread - 1 && turnState.active ? turnState.p : 0.04;
    turnState.targetP = 1.0;
    audio.playPageTurn(1);
  } else if (targetSpread < prevSpread) {
    // Turning backward: sheet flips Left (1) -> Right (0)
    turnState.active = true;
    turnState.baseSpread = targetSpread;
    turnState.p = prevSpread === targetSpread + 1 && turnState.active ? turnState.p : 0.96;
    turnState.targetP = 0.0;
    audio.playPageTurn(-1);
  }

  syncHUDText();
  const th = SPREAD_THEMES[spreadIndex];
  showBanner(th.title, th.sub);
}

// --- Place / Peel 3D Stickers ---
function placeStickerAt(spread, side, px, py, stickerId, rot = stickerPreviewRot) {
  const safePx = clamp(px, 0.11, 0.89);
  const safePy = clamp(py, 0.11, 0.89);
  const meta = STICKER_CATALOG[stickerId];

  const stk = {
    uid: nextStickerUid++,
    spread,
    side,
    px: safePx,
    py: safePy,
    stickerId,
    rot,
    scale: meta.isWax ? 0.98 : 0.94,
    peel: 0.78, // Starts curled up & presses smoothly flat onto cotton paper!
    targetPeel: 0.0,
    removing: false,
  };
  stickers.push(stk);
  audio.playStickerStick(meta.isWax);
  syncHUDText();
  pushToast(`${meta.isWax ? '火漆盖印' : '贴好 3D 贴纸'} · ${meta.name}`, meta.isWax ? 'wax' : 'matcha');
  return stk;
}

function peelOffSticker(stk) {
  if (!stk || stk.removing) return;
  stk.removing = true;
  stk.targetPeel = 1.05;
  audio.playStickerPeel();
  const meta = STICKER_CATALOG[stk.stickerId];
  pushToast(`揭起贴纸 · ${meta.name}`);
}

function findStickerNear(spread, side, px, py, radius = 0.095) {
  for (let i = stickers.length - 1; i >= 0; i--) {
    const s = stickers[i];
    if (s.removing || s.spread !== spread || s.side !== side) continue;
    const dx = s.px - px;
    const dy = (s.py - py) * (PAGE_H / PAGE_W);
    if (Math.hypot(dx, dy) <= radius) {
      return s;
    }
  }
  return null;
}

function placeRandomStickerOnCurrentSpread() {
  const stickerId = Math.floor(rand() * STICKER_CATALOG.length);
  const side = rand() < 0.5 ? 0 : 1;
  let px = 0.20 + rand() * 0.60;
  let py = 0.20 + rand() * 0.62;
  // Avoid overlapping directly on top of an existing sticker
  for (let attempt = 0; attempt < 6; attempt++) {
    if (!findStickerNear(spreadIndex, side, px, py, 0.14)) break;
    px = 0.18 + rand() * 0.64;
    py = 0.18 + rand() * 0.66;
  }
  const rot = (rand() - 0.5) * 0.34;
  placeStickerAt(spreadIndex, side, px, py, stickerId, rot);
}

// --- Add Sample Fountain-Pen Ink Flourish ---
function addSampleInkOnCurrentSpread(nowSec) {
  const side = rand() < 0.45 ? 0 : 1;
  const colorIdx = Math.floor(rand() * INK_PALETTE.length);
  const cx = 0.24 + rand() * 0.52;
  const cy = 0.24 + rand() * 0.56;
  const kind = inkStrokes.length % 3;
  const pts = [];

  if (kind === 0) {
    // Crisp Star / Sparkle Doodle
    const spikes = 5;
    for (let i = 0; i <= spikes * 2; i++) {
      const a = (i / (spikes * 2)) * Math.PI * 2 - Math.PI * 0.5;
      const r = i % 2 === 0 ? 0.055 : 0.024;
      pts.push({
        px: clamp(cx + Math.cos(a) * r, 0.08, 0.92),
        py: clamp(cy + Math.sin(a) * r * (PAGE_W / PAGE_H), 0.08, 0.92),
        t: nowSec + i * 0.015,
      });
    }
  } else if (kind === 1) {
    // Cozy Latte-Heart Ink Flourish
    const steps = 20;
    for (let i = 0; i <= steps; i++) {
      const a = (i / steps) * Math.PI * 2;
      const hx = 16 * Math.pow(Math.sin(a), 3) * 0.0032;
      const hy = -(13 * Math.cos(a) - 5 * Math.cos(2 * a) - 2 * Math.cos(3 * a) - Math.cos(4 * a)) * 0.0026;
      pts.push({
        px: clamp(cx + hx, 0.08, 0.92),
        py: clamp(cy + hy, 0.08, 0.92),
        t: nowSec + i * 0.012,
      });
    }
  } else {
    // Expressive Calligraphy Checkmark + Ribbon Wave
    pts.push(
      { px: clamp(cx - 0.045, 0.08, 0.92), py: clamp(cy, 0.08, 0.92), t: nowSec },
      { px: clamp(cx - 0.015, 0.08, 0.92), py: clamp(cy + 0.032, 0.08, 0.92), t: nowSec + 0.04 },
      { px: clamp(cx + 0.055, 0.08, 0.92), py: clamp(cy - 0.038, 0.08, 0.92), t: nowSec + 0.09 },
      { px: clamp(cx + 0.095, 0.08, 0.92), py: clamp(cy - 0.052, 0.08, 0.92), t: nowSec + 0.13 }
    );
  }

  inkStrokes.push({
    spread: spreadIndex,
    side,
    colorIdx,
    width: NIB_WIDTHS[selectedNibIdx],
    points: pts,
  });
  rebuildSpreadInk(spreadIndex, side);
  audio.playNibPreview();
  syncHUDText();
  pushToast(`钢笔速写 · ${INK_PALETTE[colorIdx].name}`);
}

function undoLastInkStroke() {
  for (let i = inkStrokes.length - 1; i >= 0; i--) {
    if (inkStrokes[i].spread === spreadIndex) {
      const removed = inkStrokes.splice(i, 1)[0];
      rebuildSpreadInk(removed.spread, removed.side);
      syncHUDText();
      pushToast('已撤销上一笔钢笔字迹');
      return;
    }
  }
}

// --- Open / Toggle Workshop Overlay ---
function openPlannerWorkshop() {
  isOverlayOpen = false;
  overlayEl.classList.add('hidden');
  hudEl.classList.add('visible');
  audio.init();
  setToolMode(activeTool);
  canvas.focus();
}

function togglePauseOverlay(forceOpen) {
  const next = typeof forceOpen === 'boolean' ? forceOpen : !isOverlayOpen;
  isOverlayOpen = next;
  overlayEl.classList.toggle('hidden', !isOverlayOpen);
  hudEl.classList.toggle('visible', !isOverlayOpen);
}

// --- Pointer & Keyboard Event Wiring ---
function updatePointerRay(clientX, clientY) {
  const rect = canvas.getBoundingClientRect();
  if (rect.width < 2 || rect.height < 2) return;
  pointer.ndcX = ((clientX - rect.left) / rect.width) * 2.0 - 1.0;
  pointer.ndcY = 1.0 - ((clientY - rect.top) / rect.height) * 2.0;
  pointer.inside = true;
}

canvas.addEventListener('contextmenu', (e) => e.preventDefault());

canvas.addEventListener('pointermove', (e) => {
  pointer.altKey = e.altKey;
  updatePointerRay(e.clientX, e.clientY);

  if (cam.orbitDragging) {
    const dx = e.clientX - cam.lastX;
    const dy = e.clientY - cam.lastY;
    cam.lastX = e.clientX;
    cam.lastY = e.clientY;
    cam.targetYaw = clamp(cam.targetYaw - dx * 0.0055, -0.92, 0.92);
    cam.targetPitch = clamp(cam.targetPitch + dy * 0.0055, 0.44, 1.38);
    return;
  }

  if (turnState.dragging) {
    const dx = e.clientX - turnState.dragStartX;
    // Dragging left (-dx) increases turnProgress 0 -> 1
    turnState.p = clamp(turnState.dragStartP - dx / 250.0, 0.005, 0.995);
    turnState.targetP = turnState.p;
    return;
  }

  if (activeDrawingStroke && pointer.hoverHit) {
    const hit = pointer.hoverHit;
    if (hit.side === activeDrawingStroke.side) {
      const pts = activeDrawingStroke.points;
      const last = pts[pts.length - 1];
      const dist = Math.hypot(hit.px - last.px, hit.py - last.py);
      if (dist > 0.0045) {
        const nowSec = performance.now() * 0.001;
        pts.push({ px: hit.px, py: hit.py, t: nowSec });
        penVelocity = clamp(dist * 34.0, 0.05, 1.8);
        rebuildSpreadInk(activeDrawingStroke.spread, activeDrawingStroke.side);
      }
    }
  }
});

canvas.addEventListener('pointerdown', (e) => {
  if (isOverlayOpen) return;
  audio.init();
  pointer.altKey = e.altKey;
  updatePointerRay(e.clientX, e.clientY);
  refreshHoverHit();
  canvas.setPointerCapture(e.pointerId);

  // Right-click on a sticker peels it off; otherwise Right/Middle drag orbits camera!
  if (e.button === 2 || e.button === 1) {
    if (e.button === 2 && pointer.hoverHit && !turnState.active) {
      const stk = findStickerNear(spreadIndex, pointer.hoverHit.side, pointer.hoverHit.px, pointer.hoverHit.py);
      if (stk) {
        peelOffSticker(stk);
        return;
      }
    }
    cam.orbitDragging = true;
    cam.lastX = e.clientX;
    cam.lastY = e.clientY;
    canvas.classList.add('grabbing-cursor');
    return;
  }

  if (e.button !== 0) return;

  const hit = pointer.hoverHit;

  // Check if user grabbed an outer page corner in ANY mode, or dragged page in Mode [3]
  const isOuterRightCorner = hit && hit.side === 1 && hit.px > 0.84 && (hit.py > 0.80 || hit.py < 0.16);
  const isOuterLeftCorner = hit && hit.side === 0 && hit.px < 0.16 && (hit.py > 0.80 || hit.py < 0.16);

  if (activeTool === 'turn' || isOuterRightCorner || isOuterLeftCorner) {
    if (hit && hit.side === 1 && spreadIndex < SPREAD_THEMES.length - 1) {
      turnState.active = true;
      turnState.dragging = true;
      turnState.baseSpread = spreadIndex;
      turnState.p = 0.05;
      turnState.targetP = 0.05;
      turnState.dragStartX = e.clientX;
      turnState.dragStartP = 0.05;
      audio.playStickerPeel();
      canvas.classList.add('grabbing-cursor');
      return;
    }
    if (hit && hit.side === 0 && spreadIndex > 0) {
      turnState.active = true;
      turnState.dragging = true;
      turnState.baseSpread = spreadIndex - 1;
      turnState.p = 0.95;
      turnState.targetP = 0.95;
      turnState.dragStartX = e.clientX;
      turnState.dragStartP = 0.95;
      audio.playStickerPeel();
      canvas.classList.add('grabbing-cursor');
      return;
    }
    // Dragging outside book in Mode [3] orbits camera
    if (activeTool === 'turn') {
      cam.orbitDragging = true;
      cam.lastX = e.clientX;
      cam.lastY = e.clientY;
      canvas.classList.add('grabbing-cursor');
      return;
    }
  }

  if (!hit || turnState.active) return;

  if (activeTool === 'sticker') {
    const existing = findStickerNear(spreadIndex, hit.side, hit.px, hit.py);
    if (e.altKey && existing) {
      peelOffSticker(existing);
    } else {
      placeStickerAt(spreadIndex, hit.side, hit.px, hit.py, selectedStickerId, stickerPreviewRot);
    }
  } else if (activeTool === 'pen') {
    const nowSec = performance.now() * 0.001;
    activeDrawingStroke = {
      spread: spreadIndex,
      side: hit.side,
      colorIdx: selectedInkIdx,
      width: NIB_WIDTHS[selectedNibIdx],
      points: [
        { px: hit.px, py: hit.py, t: nowSec },
        { px: clamp(hit.px + 0.002, 0.01, 0.99), py: clamp(hit.py + 0.002, 0.01, 0.99), t: nowSec },
      ],
    };
    inkStrokes.push(activeDrawingStroke);
    penVelocity = 0.35;
    rebuildSpreadInk(spreadIndex, hit.side);
    syncHUDText();
  }
});

function endPointerInteraction() {
  cam.orbitDragging = false;
  canvas.classList.remove('grabbing-cursor');

  if (turnState.dragging) {
    turnState.dragging = false;
    // Commit turn if pulled past threshold
    const startedFromRight = turnState.dragStartP < 0.5;
    if (startedFromRight && turnState.p > 0.24) {
      spreadIndex = turnState.baseSpread + 1;
      turnState.targetP = 1.0;
      audio.playPageTurn(1);
      syncHUDText();
      showBanner(SPREAD_THEMES[spreadIndex].title, SPREAD_THEMES[spreadIndex].sub);
    } else if (!startedFromRight && turnState.p < 0.76) {
      spreadIndex = turnState.baseSpread;
      turnState.targetP = 0.0;
      audio.playPageTurn(-1);
      syncHUDText();
      showBanner(SPREAD_THEMES[spreadIndex].title, SPREAD_THEMES[spreadIndex].sub);
    } else {
      turnState.targetP = startedFromRight ? 0.0 : 1.0;
    }
  }

  activeDrawingStroke = null;
  penVelocity = 0;
}

canvas.addEventListener('pointerup', endPointerInteraction);
canvas.addEventListener('pointercancel', endPointerInteraction);
canvas.addEventListener('pointerleave', () => {
  pointer.inside = false;
});

canvas.addEventListener(
  'wheel',
  (e) => {
    if (isOverlayOpen) return;
    e.preventDefault();
    cam.targetDist = clamp(cam.targetDist + Math.sign(e.deltaY) * 0.65, 5.2, 14.5);
  },
  { passive: false }
);

window.addEventListener('keydown', (e) => {
  pointer.altKey = e.altKey;
  if (e.key === 'Escape') {
    togglePauseOverlay();
    return;
  }
  if (isOverlayOpen) return;

  const k = e.key.toLowerCase();
  if (k === '1') setToolMode('sticker');
  else if (k === '2') setToolMode('pen');
  else if (k === '3') setToolMode('turn');
  else if (k === 'r') {
    stickerPreviewRot += 0.28;
    if (stickerPreviewRot > Math.PI) stickerPreviewRot -= Math.PI * 2;
    pushToast('已微调贴纸角度');
  } else if (k === 'z') {
    undoLastInkStroke();
  } else if (k === 'c') {
    setCameraPreset(camPresetIdx + 1);
  } else if (k === 'd' || e.key === 'ArrowRight') {
    triggerPageTurn(1);
  } else if (k === 'a' || e.key === 'ArrowLeft') {
    triggerPageTurn(-1);
  }
});

window.addEventListener('keyup', (e) => {
  pointer.altKey = e.altKey;
});

// --- UI Button Wiring ---
btnOpen.addEventListener('click', () => {
  openPlannerWorkshop();
});

btnSampleFlip.addEventListener('click', () => {
  openPlannerWorkshop();
  placeRandomStickerOnCurrentSpread();
  setTimeout(() => {
    triggerPageTurn(spreadIndex < SPREAD_THEMES.length - 1 ? 1 : -1);
  }, 320);
});

btnStudio.addEventListener('click', () => {
  audio.init();
  studioEl.classList.toggle('open');
});

document.querySelectorAll('.pl-sfx-trigger').forEach((btn) => {
  btn.addEventListener('click', () => {
    audio.init();
    const s = btn.dataset.s;
    if (s === 'kalimba') audio.playKalimbaChordPreview();
    else if (s === 'page') audio.playPageTurn(1);
    else if (s === 'peel') audio.playStickerPeel();
    else if (s === 'stick') audio.playStickerStick(false);
    else if (s === 'nib') audio.playNibPreview();
    else if (s === 'wax') audio.playWaxStamp();
  });
});

modeBtnSticker.addEventListener('click', () => setToolMode('sticker'));
modeBtnPen.addEventListener('click', () => setToolMode('pen'));
modeBtnTurn.addEventListener('click', () => setToolMode('turn'));

stkChips.forEach((chip) => {
  chip.addEventListener('click', () => {
    selectedStickerId = Number(chip.dataset.stk);
    stkChips.forEach((c) => c.classList.toggle('active', c === chip));
    audio.playStickerPeel();
    setToolMode('sticker');
  });
});

document.getElementById('btn-rot-stk').addEventListener('click', () => {
  stickerPreviewRot += 0.32;
  if (stickerPreviewRot > Math.PI) stickerPreviewRot -= Math.PI * 2;
});

inkChips.forEach((chip) => {
  chip.addEventListener('click', () => {
    selectedInkIdx = Number(chip.dataset.ink);
    inkChips.forEach((c) => c.classList.toggle('active', c === chip));
    setToolMode('pen');
  });
});

nibChips.forEach((chip) => {
  chip.addEventListener('click', () => {
    selectedNibIdx = Number(chip.dataset.nib);
    nibChips.forEach((c) => c.classList.toggle('active', c === chip));
    setToolMode('pen');
  });
});

document.getElementById('btn-undo-ink').addEventListener('click', () => undoLastInkStroke());
document.getElementById('btn-sample-ink').addEventListener('click', () => {
  addSampleInkOnCurrentSpread(performance.now() * 0.001);
});

document.getElementById('btn-prev').addEventListener('click', () => triggerPageTurn(-1));
document.getElementById('btn-next').addEventListener('click', () => triggerPageTurn(1));
document.getElementById('tray-prev-btn').addEventListener('click', () => triggerPageTurn(-1));
document.getElementById('tray-next-btn').addEventListener('click', () => triggerPageTurn(1));
document.getElementById('btn-rand-stk').addEventListener('click', () => placeRandomStickerOnCurrentSpread());

tabBtns.forEach((btn) => {
  btn.addEventListener('click', () => {
    triggerPageTurn(Number(btn.dataset.sp));
  });
});

document.getElementById('btn-cam').addEventListener('click', () => setCameraPreset(camPresetIdx + 1));
document.getElementById('btn-pause').addEventListener('click', () => togglePauseOverlay(true));

document.getElementById('btn-fs').addEventListener('click', () => {
  if (!document.fullscreenElement) {
    appEl.requestFullscreen?.().catch(() => {});
  } else {
    document.exitFullscreen?.().catch(() => {});
  }
});

// Dual-mode #btn-tall & #menu-btn-tall support (injected by scripts/build.mjs in embed mode)
const btnTall = document.getElementById('btn-tall');
const menuBtnTall = document.getElementById('menu-btn-tall');
function toggleTallViewport() {
  const isTall = appEl.classList.toggle('tall');
  if (btnTall) btnTall.textContent = isTall ? '收起' : '大屏';
  if (menuBtnTall) menuBtnTall.textContent = isTall ? '收起大屏视野' : '展开大屏视野';
  ensureSceneFBO();
}
if (btnTall) btnTall.addEventListener('click', toggleTallViewport);
if (menuBtnTall) menuBtnTall.addEventListener('click', toggleTallViewport);

camChips.forEach((btn) => {
  btn.addEventListener('click', () => setCameraPreset(Number(btn.dataset.cam)));
});

document.querySelectorAll('.q-pill').forEach((btn) => {
  btn.addEventListener('click', () => {
    qualityMode = btn.dataset.q;
    document.querySelectorAll('.q-pill').forEach((b) => b.classList.toggle('active', b === btn));
    ensureSceneFBO();
  });
});

const bgmToggleBtn = document.getElementById('pl-bgm-toggle');
bgmToggleBtn.addEventListener('click', () => {
  const next = !audio.bgmEnabled;
  audio.setBgmEnabled(next);
  bgmToggleBtn.classList.toggle('active', next);
  bgmToggleBtn.textContent = next ? '开启' : '静音';
});

const volInput = document.getElementById('pl-vol');
volInput.addEventListener('input', () => {
  audio.setVolume(Number(volInput.value) / 100);
});

// --- Offscreen IntersectionObserver Draw Skip ---
let isAppVisible = true;
if (typeof IntersectionObserver !== 'undefined') {
  const io = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        isAppVisible = entry.isIntersecting;
      }
    },
    { threshold: 0.02 }
  );
  io.observe(appEl);
}

// --- Simulation Update ---
function refreshHoverHit() {
  if (!pointer.inside || turnState.active) {
    pointer.hoverHit = null;
    pointer.hoveredSticker = null;
    return;
  }
  const { orig, dir } = M4.unprojectRay(matInvVP, pointer.ndcX, pointer.ndcY);
  const hit = raycastOpenPlanner(orig, dir);
  pointer.hoverHit = hit;
  if (hit && activeTool === 'sticker') {
    pointer.hoveredSticker = findStickerNear(spreadIndex, hit.side, hit.px, hit.py);
  } else {
    pointer.hoveredSticker = null;
  }
}

function updateSimulation(dt) {
  if (bannerTimer > 0) {
    bannerTimer -= dt;
    if (bannerTimer <= 0 && bannerEl) {
      bannerEl.classList.remove('show');
    }
  }

  // Smoothly damp camera orbit & zoom
  cam.yaw = damp(cam.yaw, cam.targetYaw, 10.0, dt);
  cam.pitch = damp(cam.pitch, cam.targetPitch, 10.0, dt);
  cam.dist = damp(cam.dist, cam.targetDist, 10.0, dt);

  // Spring-smooth 3D Cylindrical Page Curl with crisp settle
  if (turnState.active && !turnState.dragging) {
    const diff = turnState.targetP - turnState.p;
    const step = diff * Math.min(1.0, dt * 7.5) + Math.sign(diff) * Math.min(Math.abs(diff), dt * 0.42);
    turnState.p += step;
    if (Math.abs(turnState.targetP - turnState.p) < 0.005) {
      turnState.p = turnState.targetP;
      turnState.active = false;
    }
  }

  // Update 3D Sticker Peel-Curl / Thumb-Press Settle Animations
  for (let i = stickers.length - 1; i >= 0; i--) {
    const s = stickers[i];
    const isAltHover = pointer.altKey && pointer.hoveredSticker === s;
    const goal = s.removing ? 1.05 : isAltHover ? 0.42 : s.targetPeel;
    s.peel = damp(s.peel, goal, s.removing ? 13.0 : 11.0, dt);
    if (s.removing && s.peel >= 0.96) {
      stickers.splice(i, 1);
      syncHUDText();
    }
  }

  // Update 3D Brass Fountain Pen Pose (tracks nib in Pen mode, rests on stand otherwise)
  let targetPenX = 5.55;
  let targetPenY = 0.24;
  let targetPenZ = 1.65;
  let targetRx = -Math.PI * 0.49;
  let targetRy = 0.0;
  let targetRz = 0.04;

  if (!isOverlayOpen && activeTool === 'pen' && pointer.hoverHit && !turnState.active) {
    const h = pointer.hoverHit;
    targetPenX = h.x;
    targetPenY = h.y + (activeDrawingStroke ? 0.006 : 0.11);
    targetPenZ = h.z;
    // Ergonomic right-handed 52-degree fountain pen writing angle
    targetRx = 0.44;
    targetRy = 0.12;
    targetRz = -0.52 - Math.min(0.12, penVelocity * 0.06);
  }

  penPose.x = damp(penPose.x, targetPenX, 16.0, dt);
  penPose.y = damp(penPose.y, targetPenY, 16.0, dt);
  penPose.z = damp(penPose.z, targetPenZ, 16.0, dt);
  penPose.rx = damp(penPose.rx, targetRx, 14.0, dt);
  penPose.ry = damp(penPose.ry, targetRy, 14.0, dt);
  penPose.rz = damp(penPose.rz, targetRz, 14.0, dt);

  penVelocity = damp(penVelocity, 0.0, 9.0, dt);
  audio.update(dt, Boolean(activeDrawingStroke), penVelocity);
}

// --- Rendering Helpers ---
function drawPropMesh(mesh, matType, modelMat) {
  gl.uniform1i(progDesk.u.uMatType, matType);
  gl.uniformMatrix4fv(progDesk.u.uModel, false, modelMat);
  gl.bindVertexArray(mesh.vao);
  gl.drawElements(gl.TRIANGLES, mesh.count, mesh.indexType, 0);
}

function drawSinglePageSurface(spreadIdx, pageSide, turnProgress, spineLift, sheetFace, camPos, t) {
  // Set hardware face culling matching sheet orientation (side 1 = CCW front, side 0 = CW back)
  gl.cullFace(sheetFace > 0 ? gl.BACK : gl.FRONT);

  gl.useProgram(progPage.prog);
  gl.uniformMatrix4fv(progPage.u.uProj, false, matProj);
  gl.uniformMatrix4fv(progPage.u.uView, false, matView);
  gl.uniform1f(progPage.u.uTurnProgress, turnProgress);
  gl.uniform1f(progPage.u.uSpineLift, spineLift);
  gl.uniform1i(progPage.u.uPageSide, pageSide);
  gl.uniform1f(progPage.u.uSheetFace, sheetFace);
  gl.uniform3fv(progPage.u.uCamPos, camPos);
  gl.uniform3fv(progPage.u.uSunDir, sunDir);
  gl.uniform1f(progPage.u.uTime, t);
  gl.uniform1i(progPage.u.uSpreadIdx, spreadIdx);

  const showHover =
    !isOverlayOpen &&
    !turnState.active &&
    pointer.hoverHit &&
    pointer.hoverHit.side === pageSide &&
    spreadIdx === spreadIndex;
  const toolIdx = activeTool === 'sticker' ? 0.0 : activeTool === 'pen' ? 1.0 : 2.0;
  gl.uniform4f(
    progPage.u.uHoverUV,
    showHover ? pointer.hoverHit.px : -1.0,
    showHover ? pointer.hoverHit.py : -1.0,
    showHover ? 1.0 : 0.0,
    toolIdx
  );

  gl.bindVertexArray(pageMesh.vao);
  gl.drawElements(gl.TRIANGLES, pageMesh.count, gl.UNSIGNED_SHORT, 0);
}

function drawPageInkBatch(spreadIdx, pageSide, turnProgress, spineLift, sheetFace, camPos, t) {
  const batch = getInkBatch(spreadIdx, pageSide);
  if (batch.vertCount <= 0) return;

  gl.useProgram(progInk.prog);
  gl.uniformMatrix4fv(progInk.u.uProj, false, matProj);
  gl.uniformMatrix4fv(progInk.u.uView, false, matView);
  gl.uniform1i(progInk.u.uPageSide, pageSide);
  gl.uniform1f(progInk.u.uTurnProgress, turnProgress);
  gl.uniform1f(progInk.u.uSpineLift, spineLift);
  gl.uniform1f(progInk.u.uSheetFace, sheetFace);
  gl.uniform3fv(progInk.u.uCamPos, camPos);
  gl.uniform3fv(progInk.u.uSunDir, sunDir);
  gl.uniform1f(progInk.u.uTime, t);

  gl.bindVertexArray(batch.vao);
  gl.drawArrays(gl.TRIANGLES, 0, batch.vertCount);
}

function drawPageStickers(spreadIdx, pageSide, turnProgress, spineLift, sheetFace, camPos, t) {
  gl.useProgram(progSticker.prog);
  gl.uniformMatrix4fv(progSticker.u.uProj, false, matProj);
  gl.uniformMatrix4fv(progSticker.u.uView, false, matView);
  gl.uniform1i(progSticker.u.uPlacementMode, 0);
  gl.uniform1i(progSticker.u.uPageSide, pageSide);
  gl.uniform1f(progSticker.u.uTurnProgress, turnProgress);
  gl.uniform1f(progSticker.u.uSpineLift, spineLift);
  gl.uniform1f(progSticker.u.uSheetFace, sheetFace);
  gl.uniform3fv(progSticker.u.uCamPos, camPos);
  gl.uniform3fv(progSticker.u.uSunDir, sunDir);
  gl.uniform1f(progSticker.u.uTime, t);

  for (const s of stickers) {
    if (s.spread !== spreadIdx || s.side !== pageSide) continue;
    const mesh = stickerMeshes[s.stickerId];
    const isHovered = pointer.hoveredSticker === s;
    gl.uniform2f(progSticker.u.uStickerUV, s.px, s.py);
    gl.uniform1f(progSticker.u.uStickerRot, s.rot);
    gl.uniform1f(progSticker.u.uStickerScale, s.scale);
    gl.uniform1f(progSticker.u.uPeelAmount, clamp(s.peel, 0.0, 1.0));
    gl.uniform1f(progSticker.u.uHighlight, isHovered ? 1.0 : 0.0);
    gl.bindVertexArray(mesh.vao);
    gl.drawElements(gl.TRIANGLES, mesh.count, gl.UNSIGNED_SHORT, 0);
  }
}

// --- Full 3D Scene Render Pass ---
let glErrSticky = 0;

function renderScene(t) {
  ensureSceneFBO();

  const aspect = fboW / Math.max(1, fboH);
  M4.perspective(matProj, (39.0 * Math.PI) / 180.0, aspect, 0.25, 65.0);

  const cosP = Math.cos(cam.pitch);
  const sinP = Math.sin(cam.pitch);
  const camPos = [
    cam.tx + Math.sin(cam.yaw) * cosP * cam.dist,
    cam.ty + sinP * cam.dist,
    cam.tz + Math.cos(cam.yaw) * cosP * cam.dist,
  ];

  M4.lookAt(matView, camPos, [cam.tx, cam.ty, cam.tz], [0, 1, 0]);
  M4.multiply(matVP, matProj, matView);
  M4.invert(matInvVP, matVP);

  refreshHoverHit();

  // 1. Render 3D Cozy Desk & Planner into Offscreen FBO
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
  gl.viewport(0, 0, fboW, fboH);
  gl.clearColor(0.11, 0.075, 0.05, 1.0);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

  gl.enable(gl.DEPTH_TEST);
  gl.depthFunc(gl.LEQUAL);
  gl.enable(gl.CULL_FACE);
  gl.cullFace(gl.BACK);

  // A) Desk, Leather Mat, Hardcover Binding, Page Blocks, Brass Hardware & Mug/Washi Props
  gl.useProgram(progDesk.prog);
  gl.uniformMatrix4fv(progDesk.u.uProj, false, matProj);
  gl.uniformMatrix4fv(progDesk.u.uView, false, matView);
  gl.uniform3fv(progDesk.u.uCamPos, camPos);
  gl.uniform3fv(progDesk.u.uSunDir, sunDir);
  gl.uniform1f(progDesk.u.uTime, t);

  M4.identity(matModel);
  drawPropMesh(deskRig.desk, 0, matModel);
  drawPropMesh(deskRig.mat, 1, matModel);
  drawPropMesh(deskRig.cover, 2, matModel);
  drawPropMesh(deskRig.pageBlock, 3, matModel);
  drawPropMesh(deskRig.brass, 4, matModel);
  drawPropMesh(deskRig.props, 5, matModel);

  // Interactive 3D Brass Fountain Pen
  M4.composeTRS(matModel, penPose.x, penPose.y, penPose.z, penPose.rx, penPose.ry, penPose.rz, 1, 1, 1);
  drawPropMesh(penRig.body, 5, matModel);
  drawPropMesh(penRig.brass, 4, matModel);

  // Decorative 3D Stickers sitting on the Side Sticker Backing Sheet Card
  gl.useProgram(progSticker.prog);
  gl.uniformMatrix4fv(progSticker.u.uProj, false, matProj);
  gl.uniformMatrix4fv(progSticker.u.uView, false, matView);
  gl.uniform1i(progSticker.u.uPlacementMode, 1);
  gl.uniform3fv(progSticker.u.uCamPos, camPos);
  gl.uniform3fv(progSticker.u.uSunDir, sunDir);
  gl.uniform1f(progSticker.u.uTime, t);
  gl.uniform1f(progSticker.u.uHighlight, 0.0);

  for (const ds of deskSheetStickers) {
    M4.composeTRS(matModel, ds.x, 0.066, ds.z, 0, ds.rot, 0, 0.36, 0.36, 0.36);
    gl.uniformMatrix4fv(progSticker.u.uModel, false, matModel);
    const sm = stickerMeshes[ds.stickerId];
    gl.bindVertexArray(sm.vao);
    gl.drawElements(gl.TRIANGLES, sm.count, gl.UNSIGNED_SHORT, 0);
  }

  // B) Subdivided Deforming Pages + Attached 3D Stickers + Wet-to-Dry Ink Ribbons
  if (!turnState.active) {
    // Resting Left (side 0) & Right (side 1) Pages of current spreadIndex
    drawSinglePageSurface(spreadIndex, 0, 1.0, 0.0, -1.0, camPos, t);
    drawSinglePageSurface(spreadIndex, 1, 0.0, 0.0, 1.0, camPos, t);

    // 3D Stickers on resting pages
    gl.cullFace(gl.BACK);
    drawPageStickers(spreadIndex, 0, 1.0, 0.0, -1.0, camPos, t);
    drawPageStickers(spreadIndex, 1, 0.0, 0.0, 1.0, camPos, t);

    // Live Hover Preview 3D Sticker (curls gently above the paper!)
    if (!isOverlayOpen && activeTool === 'sticker' && pointer.hoverHit && !pointer.altKey) {
      const h = pointer.hoverHit;
      const sm = stickerMeshes[selectedStickerId];
      const hoverPeel = 0.56 + 0.09 * Math.sin(t * 4.2);
      gl.uniform1i(progSticker.u.uPageSide, h.side);
      gl.uniform1f(progSticker.u.uTurnProgress, h.side === 0 ? 1.0 : 0.0);
      gl.uniform1f(progSticker.u.uSpineLift, 0.024);
      gl.uniform1f(progSticker.u.uSheetFace, h.side === 0 ? -1.0 : 1.0);
      gl.uniform2f(progSticker.u.uStickerUV, clamp(h.px, 0.11, 0.89), clamp(h.py, 0.11, 0.89));
      gl.uniform1f(progSticker.u.uStickerRot, stickerPreviewRot);
      gl.uniform1f(progSticker.u.uStickerScale, 0.96);
      gl.uniform1f(progSticker.u.uPeelAmount, hoverPeel);
      gl.uniform1f(progSticker.u.uHighlight, 0.55);
      gl.bindVertexArray(sm.vao);
      gl.drawElements(gl.TRIANGLES, sm.count, gl.UNSIGNED_SHORT, 0);
    }

    // Alpha-blended Fountain-Pen Ink Ribbons
    gl.disable(gl.CULL_FACE);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.depthMask(false);
    drawPageInkBatch(spreadIndex, 0, 1.0, 0.0, -1.0, camPos, t);
    drawPageInkBatch(spreadIndex, 1, 0.0, 0.0, 1.0, camPos, t);
    gl.depthMask(true);
    gl.disable(gl.BLEND);
  } else {
    // Active 3D Cylindrical/Conical Page Turn between k and k + 1!
    const k = turnState.baseSpread;
    const p = turnState.p;

    // 1) Resting Left page (k, side 0) & Resting Right page (k + 1, side 1)
    drawSinglePageSurface(k, 0, 1.0, 0.0, -1.0, camPos, t);
    drawSinglePageSurface(k + 1, 1, 0.0, 0.0, 1.0, camPos, t);

    // 2) Curling 3D Turning Sheet: Front face = (k, side 1), Back face = (k + 1, side 0)
    drawSinglePageSurface(k, 1, p, 0.008, 1.0, camPos, t);
    drawSinglePageSurface(k + 1, 0, p, 0.008, -1.0, camPos, t);

    // 3) 3D Stickers curling seamlessly in 3D space on resting & turning sheets!
    gl.cullFace(gl.BACK);
    drawPageStickers(k, 0, 1.0, 0.0, -1.0, camPos, t);
    drawPageStickers(k + 1, 1, 0.0, 0.0, 1.0, camPos, t);
    if (p < 0.92) {
      drawPageStickers(k, 1, p, 0.008, 1.0, camPos, t);
    }
    if (p > 0.08) {
      drawPageStickers(k + 1, 0, p, 0.008, -1.0, camPos, t);
    }

    // 4) Fountain-Pen Ink Ribbons curling seamlessly in 3D space!
    gl.disable(gl.CULL_FACE);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.depthMask(false);
    drawPageInkBatch(k, 0, 1.0, 0.0, -1.0, camPos, t);
    drawPageInkBatch(k + 1, 1, 0.0, 0.0, 1.0, camPos, t);
    if (p < 0.96) {
      drawPageInkBatch(k, 1, p, 0.008, 1.0, camPos, t);
    }
    if (p > 0.04) {
      drawPageInkBatch(k + 1, 0, p, 0.008, -1.0, camPos, t);
    }
    gl.depthMask(true);
    gl.disable(gl.BLEND);
  }

  // C) GPU-Instanced Rising Ceramic Mug Coffee Steam & Sunbeam Golden Paper-Dust Motes
  gl.disable(gl.CULL_FACE);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  gl.depthMask(false);

  gl.useProgram(progParticle.prog);
  gl.uniformMatrix4fv(progParticle.u.uProj, false, matProj);
  gl.uniformMatrix4fv(progParticle.u.uView, false, matView);
  // Extract camera right & up vectors from matView transpose
  gl.uniform3f(progParticle.u.uCamRight, matView[0], matView[4], matView[8]);
  gl.uniform3f(progParticle.u.uCamUp, matView[1], matView[5], matView[9]);
  gl.uniform1f(progParticle.u.uTime, t);

  gl.bindVertexArray(particles.vao);
  gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, particles.instanceCount);

  gl.depthMask(true);
  gl.disable(gl.BLEND);

  // 2. Warm ACES Post-Processing Pass to Default Framebuffer
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.viewport(0, 0, canvas.width, canvas.height);
  gl.disable(gl.DEPTH_TEST);

  gl.useProgram(progPost.prog);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, fboColorTex);
  gl.uniform1i(progPost.u.uSceneTex, 0);
  gl.uniform2f(progPost.u.uTexel, 1.0 / fboW, 1.0 / fboH);

  gl.bindVertexArray(postEmptyVao);
  gl.drawArrays(gl.TRIANGLES, 0, 3);

  const err = gl.getError();
  if (err !== gl.NO_ERROR && glErrSticky === 0) {
    glErrSticky = err;
  }
}

// --- Acoustic Oscilloscope in Studio ---
const scopeBuf = new Uint8Array(256);
function renderStudioScope() {
  if (!scopeCtx || !studioEl.classList.contains('open')) return;
  const w = scopeCvs.width;
  const h = scopeCvs.height;
  scopeCtx.fillStyle = '#120d09';
  scopeCtx.fillRect(0, 0, w, h);
  if (!audio.analyser) return;
  audio.analyser.getByteTimeDomainData(scopeBuf);
  scopeCtx.strokeStyle = '#e8a829';
  scopeCtx.lineWidth = 2;
  scopeCtx.beginPath();
  for (let i = 0; i < scopeBuf.length; i++) {
    const x = (i / (scopeBuf.length - 1)) * w;
    const y = (scopeBuf[i] / 255) * h;
    if (i === 0) scopeCtx.moveTo(x, y);
    else scopeCtx.lineTo(x, y);
  }
  scopeCtx.stroke();
}

// --- Initialize Starter Content & Main Animation Loop ---
seedStarterPlannerContent();
setToolMode('sticker');

let lastTime = performance.now();
let fpsFrames = 0;
let fpsAccum = 0;
let currentFps = 60;

function frame(now) {
  requestAnimationFrame(frame);
  if (!isAppVisible) {
    lastTime = now;
    return;
  }

  const dt = Math.min(0.05, Math.max(0.001, (now - lastTime) * 0.001));
  lastTime = now;
  const t = now * 0.001;

  fpsFrames++;
  fpsAccum += dt;
  if (fpsAccum >= 0.5) {
    currentFps = Math.round(fpsFrames / fpsAccum);
    fpsFrames = 0;
    fpsAccum = 0;
    if (perfEl) {
      perfEl.textContent = `${currentFps} FPS · ${CAM_PRESETS[camPresetIdx].name} · 120g 棉浆纸`;
    }
  }

  updateSimulation(dt);
  renderScene(t);
  renderStudioScope();
}
requestAnimationFrame(frame);

// --- Automated Verification & Diagnostic Hook ---
window.__PLANNER3D__ = {
  getState() {
    return {
      mode: isOverlayOpen ? 'menu' : activeTool,
      fps: currentFps,
      glErr: glErrSticky,
      spreadIndex,
      spreadTitle: SPREAD_THEMES[spreadIndex].title,
      turnProgress: Number((turnState.active ? turnState.p : 0).toFixed(4)),
      stickersCount: stickers.length,
      inkStrokesCount: inkStrokes.length,
    };
  },
  openPlanner() {
    openPlannerWorkshop();
    return this.getState();
  },
  turnPage(dir = 1) {
    triggerPageTurn(dir);
    return this.getState();
  },
  placeRandomSticker() {
    placeRandomStickerOnCurrentSpread();
    return this.getState();
  },
  addSampleInk() {
    addSampleInkOnCurrentSpread(performance.now() * 0.001);
    return this.getState();
  },
};
