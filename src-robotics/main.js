import {
  DEG2RAD,
  M4,
  V3,
  clamp,
  lerp,
  damp,
  rayPlaneY,
  rayAABB,
  buildSiliconeWireArc,
} from './math.js';
import {
  LAB_ENV_VS,
  LAB_ENV_FS,
  WORKBENCH_VS,
  WORKBENCH_FS,
  PCB_SUBSTRATE_VS,
  PCB_SUBSTRATE_FS,
  ELEC_PART_VS,
  ELEC_PART_FS,
  PARTICLE_VS,
  PARTICLE_FS,
  POST_VS,
  POST_FS,
} from './shaders.js';
import {
  BOARD_TOP_Y,
  BENCH_Y,
  PALETTE,
  BOARDS_SPEC,
  createLabMeshes,
  buildWireTubeMesh,
  createParticlePool,
  drawBoardFixedHardware,
  drawElectronicComponent,
  drawRoboticArm,
  drawSolderingIronAndStand,
} from './world.js';
import { RoboticsLabAudio } from './audio.js';

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
const appEl = document.getElementById('robotics-app');
const canvas = document.getElementById('rb-canvas');
const hudEl = document.getElementById('rb-hud');
const overlayEl = document.getElementById('rb-overlay');

const perfEl = document.getElementById('rb-perf');
const statsPillEl = document.getElementById('rb-stats-pill');
const stepTagEl = document.getElementById('rb-step-tag');
const stepDescEl = document.getElementById('rb-step-desc');
const toastFeedEl = document.getElementById('rb-toast-feed');
const hoverLayerEl = document.getElementById('rb-hover-layer');

const bannerEl = document.getElementById('rb-banner');
const bannerTitleEl = document.getElementById('rb-banner-title');
const bannerSubEl = document.getElementById('rb-banner-sub');

const tempValEl = document.getElementById('rb-temp-val');
const railUnitEl = document.getElementById('rb-rail-unit');
const buildFillEl = document.getElementById('rb-build-fill');
const currFillEl = document.getElementById('rb-curr-fill');
const condValEl = document.getElementById('rb-cond-val');

const scoreValEl = document.getElementById('rb-score-val');
const stateValEl = document.getElementById('rb-state-val');
const boardCodeEl = document.getElementById('rb-board-code');

const btnAuto = document.getElementById('btn-auto');
const btnCam = document.getElementById('btn-cam');
const btnReset = document.getElementById('btn-reset');
const btnFs = document.getElementById('btn-fs');
const btnPause = document.getElementById('btn-pause');
const btnTall = document.getElementById('btn-tall');
const menuBtnTall = document.getElementById('menu-btn-tall');

const toolPlaceBtn = document.getElementById('tool-place');
const toolSolderBtn = document.getElementById('tool-solder');
const toolWireBtn = document.getElementById('tool-wire');
const toolStepBtn = document.getElementById('tool-step');
const toolPowerBtn = document.getElementById('tool-power');

const tabBtns = Array.from(document.querySelectorAll('.rb-tab-btn'));
const menuBoardPills = Array.from(document.querySelectorAll('.rb-board-pill'));

const btnStart = document.getElementById('rb-btn-start');
const btnDemo = document.getElementById('rb-btn-demo');
const btnStudio = document.getElementById('rb-btn-studio');
const studioEl = document.getElementById('rb-studio');
const scopeCvs = document.getElementById('rb-scope');
const scopeCtx = scopeCvs ? scopeCvs.getContext('2d') : null;
const volInput = document.getElementById('rb-vol');

// --- WebGL2 Initialization ---
const gl = canvas.getContext('webgl2', {
  antialias: false,
  alpha: false,
  depth: true,
  powerPreference: 'high-performance',
});

if (!gl) {
  throw new Error('WebGL2 is required for Robotics Lab.');
}

const extColorFloat = gl.getExtension('EXT_color_buffer_float');
let lastGlErr = 0;

// Compile Shader Programs
const envProg = createProgram(gl, LAB_ENV_VS, LAB_ENV_FS, [
  'uProj',
  'uView',
  'uCamPos',
  'uTime',
]);

const benchProg = createProgram(gl, WORKBENCH_VS, WORKBENCH_FS, [
  'uProj',
  'uView',
  'uCamPos',
  'uTime',
  'uBoardRect',
  'uSonarOrigin',
  'uSonarDir',
]);

const pcbTraceUniforms = [
  'uProj',
  'uView',
  'uModel',
  'uCamPos',
  'uTime',
  'uBoardTheme',
  'uPowerAmt',
  'uHoverSpot',
  'uTraceCount',
];
for (let i = 0; i < 20; i++) pcbTraceUniforms.push(`uTraces[${i}]`);
const pcbProg = createProgram(gl, PCB_SUBSTRATE_VS, PCB_SUBSTRATE_FS, pcbTraceUniforms);

const partProg = createProgram(gl, ELEC_PART_VS, ELEC_PART_FS, [
  'uProj',
  'uView',
  'uModel',
  'uCamPos',
  'uTime',
  'uMatType',
  'uBaseColor',
  'uParam1',
  'uParam2',
]);

const particleProg = createProgram(gl, PARTICLE_VS, PARTICLE_FS, [
  'uProj',
  'uView',
  'uCamRight',
  'uCamUp',
]);

const postProg = createProgram(gl, POST_VS, POST_FS, [
  'uSceneTex',
  'uTexelSize',
]);

const postVAO = gl.createVertexArray();
const meshes = createLabMeshes(gl);
const particles = createParticlePool(gl, 360);
const audio = new RoboticsLabAudio();

// Offscreen HDR/ACES Framebuffer
let fboWidth = 0;
let fboHeight = 0;
let sceneFBO = null;
let sceneTex = null;
let sceneDepth = null;
let qualityScale = 1.0;

function ensureFramebuffer(w, h) {
  const tw = Math.max(2, Math.floor(w));
  const th = Math.max(2, Math.floor(h));
  if (sceneFBO && tw === fboWidth && th === fboHeight) return;

  if (sceneFBO) gl.deleteFramebuffer(sceneFBO);
  if (sceneTex) gl.deleteTexture(sceneTex);
  if (sceneDepth) gl.deleteRenderbuffer(sceneDepth);

  fboWidth = tw;
  fboHeight = th;

  sceneFBO = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, sceneFBO);

  sceneTex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, sceneTex);
  const internalFmt = extColorFloat ? gl.RGBA16F : gl.RGBA8;
  const dataType = extColorFloat ? gl.HALF_FLOAT : gl.UNSIGNED_BYTE;
  gl.texImage2D(gl.TEXTURE_2D, 0, internalFmt, fboWidth, fboHeight, 0, gl.RGBA, dataType, null);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, sceneTex, 0);

  sceneDepth = gl.createRenderbuffer();
  gl.bindRenderbuffer(gl.RENDERBUFFER, sceneDepth);
  gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT24, fboWidth, fboHeight);
  gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, sceneDepth);

  // Fallback to guaranteed RGBA8 if float FBO incomplete on any driver
  if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE && extColorFloat) {
    gl.bindTexture(gl.TEXTURE_2D, sceneTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, fboWidth, fboHeight, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  }

  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
}

// --- Build State for All 4 Boards ---
function createBoardInstance(spec) {
  const compStates = spec.components.map(() => ({
    placed: false,
    dropOffset: 0.0,
  }));

  const padStates = [];
  spec.components.forEach((comp, cIdx) => {
    comp.pads.forEach(([px, pz]) => {
      padStates.push({
        compIdx: cIdx,
        x: px,
        z: pz,
        progress: 0.0,
        soldered: false,
        heat: 0.0,
      });
    });
  });

  const wireStates = spec.wires.map((w) => {
    const pStart = [w.from[0], 0.34, w.from[1]];
    const pEnd = [w.to[0], 0.34, w.to[1]];
    const curve = buildSiliconeWireArc(pStart, pEnd, w.arcHeight, 26);
    const mesh = buildWireTubeMesh(gl, curve, 0.044, 10);
    return {
      connected: false,
      mesh,
    };
  });

  return {
    spec,
    compStates,
    padStates,
    wireStates,
    powered: false,
    powerSwitchAnim: 0.0,
    completedBonusGiven: false,
  };
}

const boardInstances = BOARDS_SPEC.map((spec) => createBoardInstance(spec));

// --- Active Lab Session State ---
let mode = 'menu'; // 'menu' | 'lab'
let boardIndex = 0;
let activeTool = 1; // 1: Place, 2: Solder, 3: Wire
let score = 0;
let solderCombo = 0;
let activeWireDraftIdx = -1;
let activeWireStartEnd = 0; // 0: started at 'from', 1: started at 'to'

// Camera Orbit State
let camPresetIdx = 0;
const cam = {
  yaw: 0.08,
  pitch: 0.72,
  dist: 8.6,
  target: [0, 0, 0],
  curYaw: 0.08,
  curPitch: 0.72,
  curDist: 8.6,
  curTarget: [0, 0, 0],
  eye: [0, 6, 6],
};

// Pointer & 3D Raycast State
const pointer = {
  ndcX: 0,
  ndcY: 0,
  inside: false,
  leftDown: false,
  rightDown: false,
  lastX: 0,
  lastY: 0,
  worldHit: [0, BOARD_TOP_Y, 0],
  hasBoardHit: false,
  hoverCompIdx: -1,
  hoverPadIdx: -1,
  hoverWireIdx: -1,
  hoverWireEnd: 0,
  hoverSwitch: false,
  hoverLabel: '',
  hoverWorldPos: null,
};

// 380°C Soldering Iron Wand State
const ironState = {
  pos: [-5.15, BENCH_Y + 0.52, -1.45],
  targetPos: [-5.15, BENCH_Y + 0.52, -1.45],
  yaw: 0.25,
  tilt: -0.68,
  heating: false,
  smokeAccum: 0,
};

// Live Powered Electronics Simulation State
const sim = {
  chaserLevels: [0, 0, 0, 0],
  currentDigit: 0,
  digitTimer: 0,
  seg7Active: false,

  radarYaw: 0,
  radarDirSign: 1,
  sonarTimer: 0,
  sonarFlash: 0,
  espLedGlow: 0,

  synthTimer: 0,
  synthStep: 0,
  vuLevel: 0,
  vuActive: false,
  potAngle: -0.4,

  armPower: 0,
  armPhase: 0,
  armYaw: 0.25,
  armShoulder: 0.32,
  armElbow: 0.72,
  armClaw: 0.65,
  armWhirrTimer: 0,
};

// Matrices
const matProj = M4.create();
const matView = M4.create();
const matVP = M4.create();
const matInvVP = M4.create();
const matIdentity = M4.create();
const matTmp = M4.create();

// --- Helper Queries on Current Board ---
function curBoard() {
  return boardInstances[boardIndex];
}

function getBoardCounts(b = curBoard()) {
  let placedCount = 0;
  for (const c of b.compStates) if (c.placed) placedCount++;
  let solderedCount = 0;
  for (const p of b.padStates) if (p.soldered) solderedCount++;
  let wiredCount = 0;
  for (const w of b.wireStates) if (w.connected) wiredCount++;

  const totalComps = b.compStates.length;
  const totalPads = b.padStates.length;
  const totalWires = b.wireStates.length;
  const totalSteps = totalComps + totalPads + totalWires;
  const doneSteps = placedCount + solderedCount + wiredCount;
  const ratio = totalSteps > 0 ? doneSteps / totalSteps : 1;
  const complete =
    placedCount === totalComps &&
    solderedCount === totalPads &&
    wiredCount === totalWires;

  return {
    placedCount,
    totalComps,
    solderedCount,
    totalPads,
    wiredCount,
    totalWires,
    ratio,
    complete,
  };
}

// --- UI Notifications & Banners ---
let bannerTimeout = null;
function showBanner(title, sub) {
  if (!bannerEl) return;
  bannerTitleEl.textContent = title;
  bannerSubEl.textContent = sub;
  bannerEl.classList.add('show');
  if (bannerTimeout) clearTimeout(bannerTimeout);
  bannerTimeout = setTimeout(() => {
    bannerEl.classList.remove('show');
  }, 2400);
}

function pushToast(msg, tone = 'cyan') {
  if (!toastFeedEl) return;
  const el = document.createElement('div');
  el.className = `rb-toast ${tone}`;
  el.textContent = msg;
  toastFeedEl.appendChild(el);
  while (toastFeedEl.children.length > 3) {
    toastFeedEl.removeChild(toastFeedEl.firstChild);
  }
  setTimeout(() => {
    if (el.parentNode) el.parentNode.removeChild(el);
  }, 3200);
}

// --- Tool & Board Switching ---
function setTool(toolId, quiet = false) {
  activeTool = clamp(toolId, 1, 3);
  activeWireDraftIdx = -1;

  toolPlaceBtn.className =
    activeTool === 1 ? 'rb-tool-btn active-emerald' : 'rb-tool-btn';
  toolSolderBtn.className =
    activeTool === 2 ? 'rb-tool-btn active-orange' : 'rb-tool-btn';
  toolWireBtn.className =
    activeTool === 3 ? 'rb-tool-btn active-cyan' : 'rb-tool-btn';

  if (activeTool !== 2) {
    ironState.heating = false;
    audio.setSolderSizzle(false);
  }

  if (!quiet) {
    const names = {
      1: '已切换 [1] 贴装元件工具：点击 PCB 发光虚影卡入芯片',
      2: '已切换 [2] 380°C 恒温电烙铁：点击或按住划过金焊盘连焊',
      3: '已切换 [3] 硅胶杜邦飞线：点击高亮排针座完成跨接',
    };
    pushToast(names[activeTool], activeTool === 2 ? 'amber' : 'emerald');
  }
  syncHudText();
}

function applyCameraPreset(idx = camPresetIdx) {
  const spec = curBoard().spec;
  cam.target[0] = spec.camTarget[0];
  cam.target[1] = spec.camTarget[1];
  cam.target[2] = spec.camTarget[2];

  if (idx === 0) {
    // Standard Workbench Ergonomic Angle
    cam.yaw = 0.06;
    cam.pitch = 0.76;
    cam.dist = spec.camDist;
  } else if (idx === 1) {
    // Macro Solder Inspection Close-up
    cam.yaw = -0.22;
    cam.pitch = 0.62;
    cam.dist = spec.camDist * 0.68;
  } else {
    // Showcase Hero Dramatic Angle
    cam.yaw = 0.48;
    cam.pitch = 0.52;
    cam.dist = spec.camDist * 0.96;
  }
}

function selectBoard(idx) {
  const nextIdx = ((idx % BOARDS_SPEC.length) + BOARDS_SPEC.length) % BOARDS_SPEC.length;
  boardIndex = nextIdx;
  activeWireDraftIdx = -1;
  solderCombo = 0;
  particles.clear();
  audio.setSolderSizzle(false);

  tabBtns.forEach((b, i) => b.classList.toggle('active', i === boardIndex));
  menuBoardPills.forEach((b, i) => b.classList.toggle('active', i === boardIndex));

  const b = curBoard();
  const counts = getBoardCounts(b);
  if (counts.placedCount < counts.totalComps) setTool(1, true);
  else if (counts.solderedCount < counts.totalPads) setTool(2, true);
  else setTool(3, true);

  camPresetIdx = 0;
  applyCameraPreset(0);

  if (mode === 'lab') {
    showBanner(`0${boardIndex + 1} · ${b.spec.name}`, b.spec.subtitle);
  }
  syncHudText();
  return getState();
}

function resetCurrentBoard() {
  const spec = BOARDS_SPEC[boardIndex];
  const b = curBoard();
  b.compStates.forEach((c) => {
    c.placed = false;
    c.dropOffset = 0;
  });
  b.padStates.forEach((p) => {
    p.progress = 0;
    p.soldered = false;
    p.heat = 0;
  });
  b.wireStates.forEach((w) => {
    w.connected = false;
  });
  b.powered = false;
  b.powerSwitchAnim = 0;
  b.completedBonusGiven = false;
  activeWireDraftIdx = -1;
  particles.clear();
  audio.playPowerToggle(false);
  setTool(1, true);
  pushToast(`已拆焊重置：${spec.name}`, 'amber');
  syncHudText();
}

// --- Core Hardware Assembly Actions ---
function placeComponent(compIdx) {
  const b = curBoard();
  const cs = b.compStates[compIdx];
  if (!cs || cs.placed) return false;

  cs.placed = true;
  cs.dropOffset = 0.72;
  score += 120;
  audio.playSnap();

  const comp = b.spec.components[compIdx];
  pushToast(`已贴装：${comp.short} (+120)`, 'emerald');

  const counts = getBoardCounts(b);
  if (counts.placedCount === counts.totalComps && counts.solderedCount < counts.totalPads) {
    setTool(2, true);
    showBanner('元件全部就位！', '已切换 380°C 电烙铁，划过沉金焊盘开始焊接');
  }
  syncHudText();
  return true;
}

function finishPadSolder(padIdx) {
  const b = curBoard();
  const pad = b.padStates[padIdx];
  if (!pad || pad.soldered) return false;

  // Ensure parent component is seated if user directly solders it
  if (!b.compStates[pad.compIdx].placed) {
    b.compStates[pad.compIdx].placed = true;
    b.compStates[pad.compIdx].dropOffset = 0.0;
  }

  pad.progress = 1.0;
  pad.soldered = true;
  pad.heat = 1.0;
  solderCombo++;
  score += 45;

  particles.spawnFluxSmoke(pad.x, BOARD_TOP_Y + 0.04, pad.z, 4);
  particles.spawnSolderSparks(pad.x, BOARD_TOP_Y + 0.04, pad.z, 9);
  audio.playSolderDing(solderCombo);

  const counts = getBoardCounts(b);
  if (counts.solderedCount === counts.totalPads) {
    ironState.heating = false;
    audio.setSolderSizzle(false);
    if (counts.wiredCount < counts.totalWires) {
      setTool(3, true);
      showBanner('全部焊点饱满成型！', '已切换杜邦飞线工具，连接排针完成回路');
    } else {
      checkAutoReadyBanner();
    }
  }
  syncHudText();
  return true;
}

function connectJumperWire(wireIdx) {
  const b = curBoard();
  const ws = b.wireStates[wireIdx];
  if (!ws || ws.connected) return false;

  ws.connected = true;
  activeWireDraftIdx = -1;
  score += 150;
  audio.playWireClick();

  const wSpec = b.spec.wires[wireIdx];
  pushToast(`飞线导通：${wSpec.name} (+150)`, 'gold');

  checkAutoReadyBanner();
  syncHudText();
  return true;
}

function checkAutoReadyBanner() {
  const b = curBoard();
  const counts = getBoardCounts(b);
  if (counts.complete && !b.powered) {
    showBanner('硬件 100% 装配完成！', '按 [Space] 或点击「通电运行」唤醒电路');
  }
}

function toggleBoardPower(forceOn = null) {
  const b = curBoard();
  const nextPowered = forceOn !== null ? Boolean(forceOn) : !b.powered;
  b.powered = nextPowered;
  audio.playPowerToggle(b.powered);

  const counts = getBoardCounts(b);
  if (b.powered) {
    if (counts.complete) {
      if (!b.completedBonusGiven) {
        b.completedBonusGiven = true;
        score += 500;
      }
      showBanner(`${b.spec.code} 通电全速运行！`, b.spec.subtitle);
      pushToast('回路 100% 导通！系统全功率运行 (+500)', 'gold');
    } else {
      const missC = counts.totalComps - counts.placedCount;
      const missP = counts.totalPads - counts.solderedCount;
      const missW = counts.totalWires - counts.wiredCount;
      pushToast(
        `诊断：缺 ${missC} 元件 / ${missP} 焊点 / ${missW} 飞线（按 [G] 可一键补全）`,
        'amber'
      );
    }
  } else {
    pushToast('已切断开发板 5.0V 稳压电源', 'cyan');
  }

  syncHudText();
}

/**
 * Deterministic single-step helper ([F] key & window.__ROBOTICSLAB__.stepAction)
 */
function stepAction() {
  if (mode !== 'lab') startLab();
  const b = curBoard();

  // 1. Place next unplaced component
  for (let i = 0; i < b.compStates.length; i++) {
    if (!b.compStates[i].placed) {
      setTool(1, true);
      placeComponent(i);
      return getState();
    }
  }

  // 2. Solder all unsoldered pads of next component
  for (let cIdx = 0; cIdx < b.compStates.length; cIdx++) {
    const unsoldered = [];
    b.padStates.forEach((p, pIdx) => {
      if (p.compIdx === cIdx && !p.soldered) unsoldered.push(pIdx);
    });
    if (unsoldered.length > 0) {
      setTool(2, true);
      for (const pIdx of unsoldered) {
        const pad = b.padStates[pIdx];
        ironState.pos[0] = pad.x;
        ironState.pos[1] = BOARD_TOP_Y + 0.06;
        ironState.pos[2] = pad.z;
        finishPadSolder(pIdx);
      }
      return getState();
    }
  }

  // 3. Connect next unconnected jumper wire
  for (let w = 0; w < b.wireStates.length; w++) {
    if (!b.wireStates[w].connected) {
      setTool(3, true);
      connectJumperWire(w);
      return getState();
    }
  }

  // 4. Power ON if not yet powered
  if (!b.powered) {
    toggleBoardPower(true);
  }
  return getState();
}

/**
 * One-Click Speed Assemble, Molten Solder & Power-On ([A] button & window.__ROBOTICSLAB__.autoAssembleAndPower)
 */
function autoAssembleAndPower() {
  if (mode !== 'lab') startLab();
  const b = curBoard();

  b.compStates.forEach((cs, idx) => {
    if (!cs.placed) {
      cs.placed = true;
      cs.dropOffset = 0.35 + idx * 0.14;
      score += 120;
    }
  });

  b.padStates.forEach((pad) => {
    if (!pad.soldered) {
      pad.progress = 1.0;
      pad.soldered = true;
      pad.heat = 1.0;
      score += 45;
      particles.spawnFluxSmoke(pad.x, BOARD_TOP_Y + 0.04, pad.z, 2);
      particles.spawnSolderSparks(pad.x, BOARD_TOP_Y + 0.04, pad.z, 3);
    }
  });

  b.wireStates.forEach((ws) => {
    if (!ws.connected) {
      ws.connected = true;
      score += 150;
    }
  });

  activeWireDraftIdx = -1;
  audio.playSnap();
  audio.playSolderDing(6);
  toggleBoardPower(true);
  return getState();
}

function startLab() {
  mode = 'lab';
  overlayEl.classList.add('hidden');
  hudEl.classList.add('visible');
  audio.ensure();
  syncHudText();
  canvas.focus();
  return getState();
}

function openMenuOverlay() {
  mode = 'menu';
  ironState.heating = false;
  audio.setSolderSizzle(false);
  overlayEl.classList.remove('hidden');
  hudEl.classList.remove('visible');
}

// --- HUD Synchronization ---
function syncHudText() {
  const b = curBoard();
  const counts = getBoardCounts(b);

  statsPillEl.textContent = `贴装 ${counts.placedCount}/${counts.totalComps} · 焊点 ${counts.solderedCount}/${counts.totalPads} · 飞线 ${counts.wiredCount}/${counts.totalWires}`;

  // Step Guidance Pill
  if (b.powered && counts.complete) {
    stepTagEl.className = 'power';
    stepTagEl.textContent = '运行';
    stepDescEl.textContent = `${b.spec.code} 运行中 · [B] 换板`;
  } else if (counts.placedCount < counts.totalComps) {
    const nextIdx = b.compStates.findIndex((c) => !c.placed);
    const nextComp = b.spec.components[nextIdx];
    stepTagEl.className = '';
    stepTagEl.textContent = '贴装';
    stepDescEl.textContent = `点击虚影安装 ${nextComp.short}`;
  } else if (counts.solderedCount < counts.totalPads) {
    stepTagEl.className = 'solder';
    stepTagEl.textContent = '焊接';
    stepDescEl.textContent = `剩余 ${counts.totalPads - counts.solderedCount} 处金焊盘待点焊`;
  } else if (counts.wiredCount < counts.totalWires) {
    const nextW = b.wireStates.findIndex((w) => !w.connected);
    stepTagEl.className = 'wire';
    stepTagEl.textContent = '飞线';
    stepDescEl.textContent = `插接 ${b.spec.wires[nextW].name}`;
  } else {
    stepTagEl.className = 'power';
    stepTagEl.textContent = '就绪';
    stepDescEl.textContent = '按 [Space] 拨动电源开关通电！';
  }

  // Bottom-Left Station Card
  const pct = Math.round(counts.ratio * 100);
  buildFillEl.style.width = `${pct}%`;
  condValEl.textContent = `${pct}%`;

  const powerEff = b.powered ? Math.max(0.15, counts.ratio) : 0.0;
  currFillEl.style.width = `${Math.round(6 + powerEff * 88)}%`;
  railUnitEl.textContent = b.powered
    ? `5.0V · ${Math.round(45 + powerEff * 380)}mA`
    : 'DC 5.0V 待机';
  tempValEl.textContent = ironState.heating ? '385°C' : '380°C';

  // Power button state
  toolPowerBtn.classList.toggle('powered-on', b.powered);
  toolPowerBtn.textContent = b.powered ? '[Space] 断电停止' : '[Space] 通电运行';

  // Bottom-Right Score Card
  scoreValEl.textContent = String(score);
  stateValEl.textContent = b.powered
    ? counts.complete
      ? '全功率通电运行'
      : '部分导通测试中'
    : counts.complete
      ? '待拨动开关通电'
      : '防静电台组装中';
  boardCodeEl.textContent = `0${boardIndex + 1} · ${b.spec.code}`;
}

// --- 3D Raycasting & Workbench Picking ---
function updatePicking() {
  pointer.hoverCompIdx = -1;
  pointer.hoverPadIdx = -1;
  pointer.hoverWireIdx = -1;
  pointer.hoverSwitch = false;
  pointer.hoverLabel = '';
  pointer.hoverWorldPos = null;

  if (!pointer.inside || mode !== 'lab') return;

  const { origin, dir } = M4.screenToWorldRay(matInvVP, pointer.ndcX, pointer.ndcY);
  const planeHit = rayPlaneY(origin, dir, BOARD_TOP_Y);
  if (planeHit) {
    pointer.worldHit[0] = planeHit[0];
    pointer.worldHit[1] = BOARD_TOP_Y;
    pointer.worldHit[2] = planeHit[2];
    pointer.hasBoardHit =
      Math.abs(planeHit[0]) <= 4.5 && Math.abs(planeHit[2]) <= 3.3;
  } else {
    pointer.hasBoardHit = false;
  }

  const b = curBoard();

  // 1. Check 3D Power Toggle Switch AABB
  const [sx, sz] = b.spec.powerSwitchPos;
  const tSw = rayAABB(origin, dir, sx - 0.32, 0.0, sz - 0.38, sx + 0.32, 0.72, sz + 0.38);
  if (tSw > 0) {
    pointer.hoverSwitch = true;
    pointer.hoverLabel = b.powered ? '点击拨杆：切断电源 [Space]' : '点击拨杆：通电运行 [Space]';
    pointer.hoverWorldPos = [sx, 0.65, sz];
  }

  if (activeTool === 1) {
    // Pick unplaced ghost component AABBs
    let bestT = Infinity;
    b.spec.components.forEach((comp, idx) => {
      if (b.compStates[idx].placed) return;
      const [cx, cz] = comp.pos;
      const [hw, hh, hd] = comp.aabb;
      const tHit = rayAABB(
        origin,
        dir,
        cx - hw - 0.12,
        -0.05,
        cz - hd - 0.12,
        cx + hw + 0.12,
        hh + 0.18,
        cz + hd + 0.12
      );
      if (tHit > 0 && tHit < bestT) {
        bestT = tHit;
        pointer.hoverCompIdx = idx;
      }
    });
    if (pointer.hoverCompIdx >= 0) {
      const comp = b.spec.components[pointer.hoverCompIdx];
      pointer.hoverLabel = `点击贴装：${comp.name}`;
      pointer.hoverWorldPos = [comp.pos[0], comp.aabb[1] + 0.28, comp.pos[1]];
    }
  } else if (activeTool === 2 && planeHit) {
    // Pick nearest unsoldered ENIG gold pad
    let bestDist = 0.44;
    b.padStates.forEach((pad, idx) => {
      if (pad.soldered) return;
      const d = Math.hypot(planeHit[0] - pad.x, planeHit[2] - pad.z);
      if (d < bestDist) {
        bestDist = d;
        pointer.hoverPadIdx = idx;
      }
    });
    if (pointer.hoverPadIdx >= 0) {
      const pad = b.padStates[pointer.hoverPadIdx];
      const comp = b.spec.components[pad.compIdx];
      pointer.hoverLabel = `380°C 焊点：${comp.short}`;
      pointer.hoverWorldPos = [pad.x, 0.36, pad.z];
    }
  } else if (activeTool === 3 && planeHit) {
    // Pick jumper wire header pins
    let bestDist = 0.58;
    b.spec.wires.forEach((w, wIdx) => {
      if (b.wireStates[wIdx].connected) return;
      const dFrom = Math.hypot(planeHit[0] - w.from[0], planeHit[2] - w.from[1]);
      const dTo = Math.hypot(planeHit[0] - w.to[0], planeHit[2] - w.to[1]);
      if (dFrom < bestDist) {
        bestDist = dFrom;
        pointer.hoverWireIdx = wIdx;
        pointer.hoverWireEnd = 0;
      }
      if (dTo < bestDist) {
        bestDist = dTo;
        pointer.hoverWireIdx = wIdx;
        pointer.hoverWireEnd = 1;
      }
    });
    if (pointer.hoverWireIdx >= 0) {
      const w = b.spec.wires[pointer.hoverWireIdx];
      pointer.hoverLabel =
        activeWireDraftIdx === pointer.hoverWireIdx
          ? `点击插接完成：${w.name}`
          : `点击引出飞线：${w.name}`;
      const pt = pointer.hoverWireEnd === 0 ? w.from : w.to;
      pointer.hoverWorldPos = [pt[0], 0.52, pt[1]];
    }
  }
}

// --- Input & Pointer Events ---
const keys = new Set();

function updatePointerNDC(clientX, clientY) {
  const rect = canvas.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return;
  pointer.ndcX = ((clientX - rect.left) / rect.width) * 2 - 1;
  pointer.ndcY = 1 - ((clientY - rect.top) / rect.height) * 2;
  pointer.inside = true;
}

canvas.addEventListener('contextmenu', (e) => e.preventDefault());

canvas.addEventListener('pointermove', (e) => {
  updatePointerNDC(e.clientX, e.clientY);
  const dx = e.clientX - pointer.lastX;
  const dy = e.clientY - pointer.lastY;
  pointer.lastX = e.clientX;
  pointer.lastY = e.clientY;

  if (pointer.rightDown) {
    cam.yaw -= dx * 0.0065;
    cam.pitch = clamp(cam.pitch + dy * 0.0055, 0.24, 1.38);
  }
});

canvas.addEventListener('pointerdown', (e) => {
  canvas.focus();
  audio.ensure();
  updatePointerNDC(e.clientX, e.clientY);
  pointer.lastX = e.clientX;
  pointer.lastY = e.clientY;

  if (e.button === 2 || e.button === 1 || e.altKey) {
    pointer.rightDown = true;
    return;
  }

  if (e.button === 0 && mode === 'lab') {
    pointer.leftDown = true;
    updatePicking();

    // 1. Direct click on 3D Power Switch works in any tool!
    if (pointer.hoverSwitch) {
      toggleBoardPower();
      return;
    }

    // 2. Tool [1]: Snap hovered ghost component (or nearest unplaced if clicked inside its footprint)
    if (activeTool === 1) {
      if (pointer.hoverCompIdx >= 0) {
        placeComponent(pointer.hoverCompIdx);
      }
      return;
    }

    // 3. Tool [2]: Instant solder on click + continuous drag-solder while held
    if (activeTool === 2) {
      if (pointer.hoverPadIdx >= 0) {
        finishPadSolder(pointer.hoverPadIdx);
      }
      return;
    }

    // 4. Tool [3]: Silicone Jumper Wire header plug
    if (activeTool === 3) {
      if (activeWireDraftIdx >= 0) {
        // Clicking partner pin (or clicking any valid pin of the active wire) completes connection!
        const w = curBoard().spec.wires[activeWireDraftIdx];
        const targetPt = activeWireStartEnd === 0 ? w.to : w.from;
        const distTarget = Math.hypot(
          pointer.worldHit[0] - targetPt[0],
          pointer.worldHit[2] - targetPt[1]
        );
        if (distTarget < 0.78 || pointer.hoverWireIdx === activeWireDraftIdx) {
          connectJumperWire(activeWireDraftIdx);
        } else if (pointer.hoverWireIdx >= 0) {
          activeWireDraftIdx = pointer.hoverWireIdx;
          activeWireStartEnd = pointer.hoverWireEnd;
          audio.playSnap();
        } else {
          activeWireDraftIdx = -1;
        }
      } else if (pointer.hoverWireIdx >= 0) {
        activeWireDraftIdx = pointer.hoverWireIdx;
        activeWireStartEnd = pointer.hoverWireEnd;
        audio.playSnap();
      }
    }
  }
});

window.addEventListener('pointerup', (e) => {
  if (e.button === 0) {
    pointer.leftDown = false;
    ironState.heating = false;
    audio.setSolderSizzle(false);
  }
  if (e.button === 2 || e.button === 1) {
    pointer.rightDown = false;
  }
});

canvas.addEventListener(
  'wheel',
  (e) => {
    if (mode !== 'lab') return;
    e.preventDefault();
    cam.dist = clamp(cam.dist + e.deltaY * 0.0055, 4.4, 14.5);
  },
  { passive: false }
);

window.addEventListener('keydown', (e) => {
  const code = e.code;
  keys.add(code);

  if (code === 'Digit1') {
    if (mode === 'lab') setTool(1);
  } else if (code === 'Digit2') {
    if (mode === 'lab') setTool(2);
  } else if (code === 'Digit3') {
    if (mode === 'lab') setTool(3);
  } else if (code === 'KeyF') {
    if (mode === 'lab') stepAction();
  } else if (code === 'KeyG' || (code === 'KeyA' && (e.shiftKey || e.metaKey || e.ctrlKey))) {
    if (mode === 'lab') {
      e.preventDefault();
      autoAssembleAndPower();
    }
  } else if (code === 'Space') {
    if (mode === 'lab') {
      e.preventDefault();
      toggleBoardPower();
    }
  } else if (code === 'KeyB') {
    selectBoard(boardIndex + 1);
  } else if (code === 'KeyC') {
    camPresetIdx = (camPresetIdx + 1) % 3;
    applyCameraPreset(camPresetIdx);
    const names = ['标准斜俯视焊台机位', '微距焊点特写机位', '全景斜侧展示机位'];
    pushToast(names[camPresetIdx], 'cyan');
  } else if (code === 'KeyR') {
    if (mode === 'lab') resetCurrentBoard();
  } else if (code === 'KeyP' || code === 'Escape') {
    if (mode === 'lab') openMenuOverlay();
    else startLab();
  }
});

window.addEventListener('keyup', (e) => {
  keys.delete(e.code);
});

// --- Bind All UI Controls ---
btnStart?.addEventListener('click', () => startLab());
btnDemo?.addEventListener('click', () => autoAssembleAndPower());
btnAuto?.addEventListener('click', () => autoAssembleAndPower());
btnCam?.addEventListener('click', () => {
  camPresetIdx = (camPresetIdx + 1) % 3;
  applyCameraPreset(camPresetIdx);
});
btnReset?.addEventListener('click', () => resetCurrentBoard());
btnPause?.addEventListener('click', () => openMenuOverlay());

btnFs?.addEventListener('click', () => {
  if (!document.fullscreenElement) {
    appEl.requestFullscreen?.().catch(() => {});
  } else {
    document.exitFullscreen?.().catch(() => {});
  }
});

const toggleTall = () => {
  document.getElementById('robotics-app')?.classList.toggle('tall');
};
btnTall?.addEventListener('click', toggleTall);
menuBtnTall?.addEventListener('click', toggleTall);

toolPlaceBtn?.addEventListener('click', () => setTool(1));
toolSolderBtn?.addEventListener('click', () => setTool(2));
toolWireBtn?.addEventListener('click', () => setTool(3));
toolStepBtn?.addEventListener('click', () => stepAction());
toolPowerBtn?.addEventListener('click', () => toggleBoardPower());

tabBtns.forEach((btn) => {
  btn.addEventListener('click', () => {
    selectBoard(Number(btn.dataset.b || 0));
  });
});

menuBoardPills.forEach((btn) => {
  btn.addEventListener('click', () => {
    selectBoard(Number(btn.dataset.b || 0));
  });
});

btnStudio?.addEventListener('click', () => {
  studioEl.classList.toggle('open');
  if (studioEl.classList.contains('open')) {
    audio.ensure();
  }
});

document.querySelectorAll('.rb-sfx-trigger').forEach((btn) => {
  btn.addEventListener('click', () => {
    const kind = btn.dataset.s;
    if (kind === 'snap') audio.playSnap();
    else if (kind === 'solder') audio.previewSolderHiss();
    else if (kind === 'wire') audio.playWireClick();
    else if (kind === 'power') audio.playPowerToggle(true);
    else if (kind === 'sonar') {
      audio.playSonarPing();
      audio.playServoWhirr(0.24, 1.0);
    } else if (kind === 'chip') {
      audio.previewChiptunePhrase();
    }
  });
});

document.querySelectorAll('.q-pill').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.q-pill').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    const q = btn.dataset.q;
    qualityScale = q === 'low' ? 0.68 : q === 'med' ? 0.85 : 1.0;
  });
});

volInput?.addEventListener('input', () => {
  audio.setVolume(Number(volInput.value) / 100);
});

// --- Simulation Update ---
function updateSimulation(dt, t) {
  // Orbit Camera Keyboard Controls (WASD / Arrow Keys)
  if (mode === 'lab') {
    if (keys.has('KeyA') || keys.has('ArrowLeft')) cam.yaw -= 1.35 * dt;
    if (keys.has('KeyD') || keys.has('ArrowRight')) cam.yaw += 1.35 * dt;
    if (keys.has('KeyW') || keys.has('ArrowUp')) {
      cam.pitch = clamp(cam.pitch + 0.95 * dt, 0.24, 1.38);
    }
    if (keys.has('KeyS') || keys.has('ArrowDown')) {
      cam.pitch = clamp(cam.pitch - 0.95 * dt, 0.24, 1.38);
    }
    if (keys.has('KeyQ')) cam.dist = clamp(cam.dist - 4.5 * dt, 4.4, 14.5);
    if (keys.has('KeyE')) cam.dist = clamp(cam.dist + 4.5 * dt, 4.4, 14.5);
  } else {
    // Gentle turntable showcase orbit while on menu screen
    cam.yaw = 0.08 + Math.sin(t * 0.28) * 0.32;
  }

  cam.curYaw = damp(cam.curYaw, cam.yaw, 10, dt);
  cam.curPitch = damp(cam.curPitch, cam.pitch, 10, dt);
  cam.curDist = damp(cam.curDist, cam.dist, 10, dt);
  for (let k = 0; k < 3; k++) {
    cam.curTarget[k] = damp(cam.curTarget[k], cam.target[k], 8, dt);
  }

  const cosP = Math.cos(cam.curPitch);
  cam.eye[0] = cam.curTarget[0] + Math.sin(cam.curYaw) * cosP * cam.curDist;
  cam.eye[1] = cam.curTarget[1] + Math.sin(cam.curPitch) * cam.curDist;
  cam.eye[2] = cam.curTarget[2] + Math.cos(cam.curYaw) * cosP * cam.curDist;

  const b = curBoard();
  const counts = getBoardCounts(b);

  // Animate component placement spring-drop & power toggle lever
  b.powerSwitchAnim = damp(b.powerSwitchAnim, b.powered ? 1.0 : 0.0, 14, dt);
  for (const cs of b.compStates) {
    if (cs.dropOffset > 0.001) {
      cs.dropOffset = damp(cs.dropOffset, 0.0, 16, dt);
      if (cs.dropOffset < 0.002) cs.dropOffset = 0.0;
    }
  }

  // Cool down freshly molten orange-gold solder cones into mirror silver-tin!
  for (const pad of b.padStates) {
    if (pad.heat > 0.001) {
      pad.heat = Math.max(0.0, pad.heat - dt * 0.58);
    }
  }

  // Update 3D Raycast & 380°C Soldering Iron Wand
  updatePicking();

  if (mode === 'lab' && activeTool === 2 && pointer.hasBoardHit) {
    let tx = pointer.worldHit[0];
    let tz = pointer.worldHit[2];
    let ty = BOARD_TOP_Y + 0.22;
    let touchingPad = false;

    if (pointer.hoverPadIdx >= 0) {
      const pad = b.padStates[pointer.hoverPadIdx];
      tx = pad.x;
      tz = pad.z;
      ty = pointer.leftDown ? BOARD_TOP_Y + 0.045 : BOARD_TOP_Y + 0.12;
      if (pointer.leftDown && !pad.soldered) {
        touchingPad = true;
        pad.progress += dt * 8.5;
        if (pad.progress >= 1.0) {
          finishPadSolder(pointer.hoverPadIdx);
        }
      }
    } else if (pointer.leftDown) {
      ty = BOARD_TOP_Y + 0.055;
      // Also drag-solder any unsoldered pad within sweep radius!
      b.padStates.forEach((pad, idx) => {
        if (pad.soldered) return;
        const d = Math.hypot(tx - pad.x, tz - pad.z);
        if (d < 0.38) {
          touchingPad = true;
          pad.progress += dt * 9.0;
          if (pad.progress >= 1.0) finishPadSolder(idx);
        }
      });
    }

    ironState.targetPos[0] = tx;
    ironState.targetPos[1] = ty;
    ironState.targetPos[2] = tz;
    ironState.heating = touchingPad || pointer.leftDown;

    if (ironState.heating) {
      audio.setSolderSizzle(true, touchingPad ? 1.15 : 0.55);
      ironState.smokeAccum += dt;
      if (ironState.smokeAccum > 0.065) {
        ironState.smokeAccum = 0;
        particles.spawnFluxSmoke(tx, ty + 0.02, tz, 1);
      }
    } else {
      audio.setSolderSizzle(false);
    }
  } else {
    // Park soldering iron neatly on its workbench stand at (-5.15, BENCH_Y + 0.52, -1.45)
    ironState.targetPos[0] = -5.18;
    ironState.targetPos[1] = BENCH_Y + 0.46;
    ironState.targetPos[2] = -1.48;
    ironState.heating = false;
  }

  for (let k = 0; k < 3; k++) {
    ironState.pos[k] = damp(ironState.pos[k], ironState.targetPos[k], 22, dt);
  }

  // --- Live Powered Circuit Animations per Board ---
  const powerEff = b.powered ? (counts.complete ? 1.0 : 0.35 + counts.ratio * 0.5) : 0.0;

  // Reset defaults
  sim.seg7Active = false;
  sim.sonarFlash = Math.max(0, sim.sonarFlash - dt * 2.6);
  sim.espLedGlow = 0;
  sim.vuActive = false;
  sim.vuLevel = damp(sim.vuLevel, 0, 8, dt);
  sim.armPower = damp(sim.armPower, boardIndex === 3 ? powerEff : 0, 6, dt);

  if (powerEff > 0.05) {
    if (boardIndex === 0) {
      // BOARD 01: UNO-R3 Knight-Rider Chasing LED Wave + Live 0-9 3D 7-Segment Counter!
      const pingPong = (Math.sin(t * 4.2) * 0.5 + 0.5) * 3.0;
      for (let i = 0; i < 4; i++) {
        const dist = Math.abs(pingPong - i);
        sim.chaserLevels[i] = Math.max(0.06, Math.exp(-dist * dist * 2.6) * 2.1 * powerEff);
      }
      sim.seg7Active = b.compStates[4]?.placed && powerEff > 0.4;
      if (sim.seg7Active) {
        sim.digitTimer += dt;
        if (sim.digitTimer >= 0.65) {
          sim.digitTimer = 0;
          sim.currentDigit = (sim.currentDigit + 1) % 10;
          if (mode === 'lab') audio.playDigitTick(sim.currentDigit);
        }
      }
    } else if (boardIndex === 1) {
      // BOARD 02: ESP32 Ultrasonic Radar Turret (+-65 deg Servo Sweep + Sonar Ping Rings!)
      const maxAng = 65 * DEG2RAD;
      const prevSign = Math.cos(t * 1.55) >= 0 ? 1 : -1;
      sim.radarYaw = Math.sin(t * 1.55) * maxAng * powerEff;
      sim.espLedGlow = (0.5 + 0.5 * Math.sin(t * 9.0)) * 1.6 * powerEff;

      if (prevSign !== sim.radarDirSign) {
        sim.radarDirSign = prevSign;
        if (mode === 'lab') audio.playServoWhirr(0.22, 1.05);
      }

      sim.sonarTimer += dt;
      if (sim.sonarTimer >= 1.15) {
        sim.sonarTimer = 0;
        sim.sonarFlash = 1.0;
        if (mode === 'lab') audio.playSonarPing();
      }
    } else if (boardIndex === 2) {
      // BOARD 03: SYNTH-555 Chiptune Music Box + Dancing 8-LED VU Bar!
      sim.vuActive = true;
      sim.potAngle = Math.sin(t * 1.4) * 0.85;
      sim.synthTimer += dt;
      if (sim.synthTimer >= 0.145) {
        sim.synthTimer -= 0.145;
        if (mode === 'lab') {
          const noteInfo = audio.playChiptuneStep(sim.synthStep++);
          sim.vuLevel = noteInfo.level * powerEff;
        } else {
          sim.synthStep++;
          sim.vuLevel = (0.45 + 0.5 * Math.abs(Math.sin(sim.synthStep * 0.7))) * powerEff;
        }
      }
    } else if (boardIndex === 3) {
      // BOARD 04: CYBER-ARM 3-Joint Desktop Robotic Gripper Arm Kinematic Cycle!
      sim.armPhase += dt * 1.25 * powerEff;
      const p = sim.armPhase;
      // Smooth pick-lift-rotate-release choreography
      const targetYaw = Math.sin(p * 0.85) * 0.68;
      const liftCycle = Math.sin(p * 1.7);
      const targetShoulder = 0.34 + Math.max(0, -liftCycle) * 0.42;
      const targetElbow = 0.62 + Math.max(0, liftCycle) * 0.35;
      const targetClaw = 0.5 + 0.48 * Math.sin(p * 1.7 + 0.8);

      sim.armYaw = damp(sim.armYaw, targetYaw, 6, dt);
      sim.armShoulder = damp(sim.armShoulder, targetShoulder, 6, dt);
      sim.armElbow = damp(sim.armElbow, targetElbow, 6, dt);
      sim.armClaw = clamp(targetClaw, 0.05, 0.98);

      sim.armWhirrTimer += dt;
      if (sim.armWhirrTimer >= 1.45) {
        sim.armWhirrTimer = 0;
        if (mode === 'lab') audio.playServoWhirr(0.28, 0.88);
      }
    }
  } else {
    for (let i = 0; i < 4; i++) sim.chaserLevels[i] = 0.0;
    sim.radarYaw = damp(sim.radarYaw, 0.0, 5, dt);
    sim.armYaw = damp(sim.armYaw, 0.22, 4, dt);
    sim.armShoulder = damp(sim.armShoulder, 0.28, 4, dt);
    sim.armElbow = damp(sim.armElbow, 0.68, 4, dt);
    sim.armClaw = damp(sim.armClaw, 0.65, 4, dt);
  }
}

// --- Render Full 3D WebGL2 Workbench Scene ---
function renderScene(dt, t) {
  const cssW = appEl.clientWidth || 800;
  const cssH = appEl.clientHeight || 446;
  const dpr = Math.min(window.devicePixelRatio || 1, 2) * qualityScale;
  const pixelW = Math.max(2, Math.floor(cssW * dpr));
  const pixelH = Math.max(2, Math.floor(cssH * dpr));

  if (canvas.width !== pixelW || canvas.height !== pixelH) {
    canvas.width = pixelW;
    canvas.height = pixelH;
  }
  ensureFramebuffer(pixelW, pixelH);

  M4.perspective(matProj, 42 * DEG2RAD, cssW / Math.max(1, cssH), 0.15, 140.0);
  M4.lookAt(matView, cam.eye, cam.curTarget, [0, 1, 0]);
  M4.multiply(matVP, matProj, matView);
  M4.invert(matInvVP, matVP);

  const b = curBoard();
  const counts = getBoardCounts(b);
  const powerEff = b.powered ? (counts.complete ? 1.0 : 0.35 + counts.ratio * 0.5) : 0.0;

  // Bind Offscreen Scene FBO
  gl.bindFramebuffer(gl.FRAMEBUFFER, sceneFBO);
  gl.viewport(0, 0, fboWidth, fboHeight);
  gl.clearColor(0.035, 0.055, 0.072, 1.0);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

  // 1. Studio Makerspace Sky Dome
  gl.disable(gl.DEPTH_TEST);
  gl.depthMask(false);
  gl.useProgram(envProg.prog);
  gl.uniformMatrix4fv(envProg.u.uProj, false, matProj);
  gl.uniformMatrix4fv(envProg.u.uView, false, matView);
  gl.uniform3fv(envProg.u.uCamPos, cam.eye);
  gl.uniform1f(envProg.u.uTime, t);
  gl.bindVertexArray(meshes.skyCube.vao);
  gl.drawElements(gl.TRIANGLES, meshes.skyCube.count, gl.UNSIGNED_SHORT, 0);

  // 2. Anti-Static ESD Workbench Mat (with Sonar Sweep Rings on Board 02!)
  gl.enable(gl.DEPTH_TEST);
  gl.depthMask(true);
  gl.disable(gl.BLEND);
  gl.useProgram(benchProg.prog);
  gl.uniformMatrix4fv(benchProg.u.uProj, false, matProj);
  gl.uniformMatrix4fv(benchProg.u.uView, false, matView);
  gl.uniform3fv(benchProg.u.uCamPos, cam.eye);
  gl.uniform1f(benchProg.u.uTime, t);
  gl.uniform4f(benchProg.u.uBoardRect, 3.65, 2.55, 0.0, 0.0);

  const sonarActive =
    boardIndex === 1 && b.compStates[2]?.placed && powerEff > 0.1 ? powerEff : 0.0;
  gl.uniform4f(benchProg.u.uSonarOrigin, 1.75, BENCH_Y, 0.78, sonarActive);
  gl.uniform3f(
    benchProg.u.uSonarDir,
    Math.sin(sim.radarYaw),
    0.0,
    Math.cos(sim.radarYaw)
  );
  gl.bindVertexArray(meshes.workbench.vao);
  gl.drawElements(gl.TRIANGLES, meshes.workbench.count, gl.UNSIGNED_SHORT, 0);

  // 3. Procedural Fiberglass PCB Substrate, Copper Traces & Racing Electron Pulses!
  gl.useProgram(pcbProg.prog);
  gl.uniformMatrix4fv(pcbProg.u.uProj, false, matProj);
  gl.uniformMatrix4fv(pcbProg.u.uView, false, matView);
  gl.uniformMatrix4fv(pcbProg.u.uModel, false, matIdentity);
  gl.uniform3fv(pcbProg.u.uCamPos, cam.eye);
  gl.uniform1f(pcbProg.u.uTime, t);
  gl.uniform1i(pcbProg.u.uBoardTheme, b.spec.theme);
  gl.uniform1f(pcbProg.u.uPowerAmt, powerEff);

  if (mode === 'lab' && pointer.hasBoardHit) {
    gl.uniform4f(
      pcbProg.u.uHoverSpot,
      pointer.worldHit[0],
      BOARD_TOP_Y,
      pointer.worldHit[2],
      activeTool === 2 ? 0.24 : 0.30
    );
  } else {
    gl.uniform4f(pcbProg.u.uHoverSpot, 0, 0, 0, 0);
  }

  const trCount = Math.min(20, b.spec.traces.length);
  gl.uniform1i(pcbProg.u.uTraceCount, trCount);
  for (let i = 0; i < trCount; i++) {
    const tr = b.spec.traces[i];
    gl.uniform4f(pcbProg.u[`uTraces[${i}]`], tr[0], tr[1], tr[2], tr[3]);
  }
  gl.bindVertexArray(meshes.pcbBoard.vao);
  gl.drawElements(gl.TRIANGLES, meshes.pcbBoard.count, gl.UNSIGNED_SHORT, 0);

  // 4. Opaque 3D Electronics Parts, Pads, Molten Solder Cones, Jumper Wires, Soldering Iron & Robotic Arm!
  gl.useProgram(partProg.prog);
  gl.uniformMatrix4fv(partProg.u.uProj, false, matProj);
  gl.uniformMatrix4fv(partProg.u.uView, false, matView);
  gl.uniform3fv(partProg.u.uCamPos, cam.eye);
  gl.uniform1f(partProg.u.uTime, t);

  // 4a. Fixed PCB Hardware (Standoffs, USB-B, Barrel Jack, 3D Power Switch, Pin Headers)
  drawBoardFixedHardware(gl, partProg, meshes, b.spec, {
    powered: b.powered,
    powerSwitchAnim: b.powerSwitchAnim,
    powerEffective: powerEff,
    activeTool,
    wiredFlags: b.wireStates.map((w) => w.connected),
    highlightWireIdx:
      activeWireDraftIdx >= 0 ? activeWireDraftIdx : pointer.hoverWireIdx,
  });

  // 4b. Through-Hole ENIG Gold Annular Pads + Molten/Silver-Tin Solder Cones!
  b.padStates.forEach((pad, pIdx) => {
    const isHoveredPad = pointer.hoverPadIdx === pIdx;
    const pulseUnsoldered =
      !pad.soldered && (activeTool === 2 || isHoveredPad) ? 1.0 : 0.0;

    M4.fromTRS(matTmp, pad.x, BOARD_TOP_Y + 0.002, pad.z, 0, 0, 0, 0.145, 1.0, 0.145);
    gl.uniformMatrix4fv(partProg.u.uModel, false, matTmp);
    gl.uniform1i(partProg.u.uMatType, 2);
    gl.uniform3fv(partProg.u.uBaseColor, PALETTE.enigGold);
    gl.uniform1f(partProg.u.uParam1, pulseUnsoldered);
    gl.uniform1f(partProg.u.uParam2, 0);
    gl.bindVertexArray(meshes.padRing.vao);
    gl.drawElements(gl.TRIANGLES, meshes.padRing.count, gl.UNSIGNED_SHORT, 0);

    // Tinned lead pin stub protruding from hole
    if (b.compStates[pad.compIdx].placed) {
      M4.fromTRS(matTmp, pad.x, BOARD_TOP_Y, pad.z, 0, 0, 0, 0.028, 0.13, 0.028);
      gl.uniformMatrix4fv(partProg.u.uModel, false, matTmp);
      gl.uniform1i(partProg.u.uMatType, 1);
      gl.uniform3fv(partProg.u.uBaseColor, PALETTE.silverMetal);
      gl.uniform1f(partProg.u.uParam1, 0);
      gl.bindVertexArray(meshes.cylinder.vao);
      gl.drawElements(gl.TRIANGLES, meshes.cylinder.count, gl.UNSIGNED_SHORT, 0);
    }

    // Molten-to-Solid Silver-Tin Solder Cone!
    if (pad.soldered || pad.progress > 0.02) {
      const grow = pad.soldered ? 1.0 : clamp(pad.progress, 0.15, 1.0);
      const heat = pad.soldered ? pad.heat : 1.0;
      M4.fromTRS(
        matTmp,
        pad.x,
        BOARD_TOP_Y + 0.012,
        pad.z,
        0,
        0,
        0,
        0.138 * grow,
        0.125 * grow,
        0.138 * grow
      );
      gl.uniformMatrix4fv(partProg.u.uModel, false, matTmp);
      gl.uniform1i(partProg.u.uMatType, 3);
      gl.uniform3fv(partProg.u.uBaseColor, PALETTE.silverMetal);
      gl.uniform1f(partProg.u.uParam1, heat);
      gl.uniform1f(partProg.u.uParam2, grow);
      gl.bindVertexArray(meshes.solderCone.vao);
      gl.drawElements(gl.TRIANGLES, meshes.solderCone.count, gl.UNSIGNED_SHORT, 0);
    }
  });

  // 4c. Placed Solid 3D Electronic Components
  b.spec.components.forEach((comp, idx) => {
    const cs = b.compStates[idx];
    if (!cs.placed) return;
    comp.dropOffset = cs.dropOffset;
    drawElectronicComponent(gl, partProg, meshes, comp, false, false, sim);
  });

  // 4d. Connected 3D Curved Silicone Jumper Wires + DuPont Crimp Boots
  b.wireStates.forEach((ws, wIdx) => {
    if (!ws.connected) return;
    const wSpec = b.spec.wires[wIdx];
    gl.uniformMatrix4fv(partProg.u.uModel, false, matIdentity);
    gl.uniform1i(partProg.u.uMatType, 7);
    gl.uniform3fv(partProg.u.uBaseColor, wSpec.color);
    gl.uniform1f(partProg.u.uParam1, powerEff);
    gl.bindVertexArray(ws.mesh.vao);
    gl.drawElements(gl.TRIANGLES, ws.mesh.count, gl.UNSIGNED_SHORT, 0);

    // Black DuPont female connector housings seated onto both header pins
    for (const [hx, hz] of [wSpec.from, wSpec.to]) {
      M4.fromTRS(matTmp, hx, 0.25, hz, 0, 0, 0, 0.17, 0.26, 0.17);
      gl.uniformMatrix4fv(partProg.u.uModel, false, matTmp);
      gl.uniform1i(partProg.u.uMatType, 9);
      gl.uniform3fv(partProg.u.uBaseColor, PALETTE.charcoalIC);
      gl.uniform1f(partProg.u.uParam1, 0);
      gl.bindVertexArray(meshes.box.vao);
      gl.drawElements(gl.TRIANGLES, meshes.box.count, gl.UNSIGNED_SHORT, 0);
    }
  });

  // Live Stretching Jumper Wire Preview while wiring in Tool [3]
  if (mode === 'lab' && activeTool === 3 && activeWireDraftIdx >= 0 && pointer.hasBoardHit) {
    const wSpec = b.spec.wires[activeWireDraftIdx];
    const start2D = activeWireStartEnd === 0 ? wSpec.from : wSpec.to;
    meshes.dynWire.update(
      [start2D[0], 0.34, start2D[1]],
      [pointer.worldHit[0], 0.34, pointer.worldHit[2]],
      0.038
    );
    gl.uniformMatrix4fv(partProg.u.uModel, false, matIdentity);
    gl.uniform1i(partProg.u.uMatType, 7);
    gl.uniform3fv(partProg.u.uBaseColor, wSpec.color);
    gl.uniform1f(partProg.u.uParam1, 0.85);
    gl.bindVertexArray(meshes.dynWire.vao);
    gl.drawElements(gl.TRIANGLES, meshes.dynWire.count, gl.UNSIGNED_SHORT, 0);
  }

  // 4e. Board 04 Articulated 3-Joint 3D Mini Desktop Robotic Gripper Arm!
  if (b.spec.hasRoboticArm) {
    drawRoboticArm(gl, partProg, meshes, sim);
  }

  // 4f. 3D 380°C Soldering Iron Wand & Workbench Holder Stand
  drawSolderingIronAndStand(gl, partProg, meshes, ironState);

  // 5. Translucent Pass: Ghost Placement Blueprints + Rising Rosin Flux Smoke & Golden Sparks!
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  gl.depthMask(false);

  gl.useProgram(partProg.prog);
  b.spec.components.forEach((comp, idx) => {
    if (b.compStates[idx].placed) return;
    const isHov = pointer.hoverCompIdx === idx;
    drawElectronicComponent(gl, partProg, meshes, comp, true, isHov, sim);
  });

  // GPU-Instanced Rosin Smoke Wisps & Solder Sparks
  const aliveParticles = particles.updateAndUpload(dt);
  if (aliveParticles > 0) {
    const camRight = [matView[0], matView[4], matView[8]];
    const camUp = [matView[1], matView[5], matView[9]];
    gl.useProgram(particleProg.prog);
    gl.uniformMatrix4fv(particleProg.u.uProj, false, matProj);
    gl.uniformMatrix4fv(particleProg.u.uView, false, matView);
    gl.uniform3fv(particleProg.u.uCamRight, camRight);
    gl.uniform3fv(particleProg.u.uCamUp, camUp);
    gl.bindVertexArray(particles.vao);
    gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, aliveParticles);
  }

  gl.depthMask(true);
  gl.disable(gl.BLEND);

  // 6. ACES Filmic Tone-Mapping & Soft Highlight Glow Post-Pass to Screen
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.viewport(0, 0, canvas.width, canvas.height);
  gl.disable(gl.DEPTH_TEST);
  gl.useProgram(postProg.prog);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, sceneTex);
  gl.uniform1i(postProg.u.uSceneTex, 0);
  gl.uniform2f(postProg.u.uTexelSize, 1.0 / fboWidth, 1.0 / fboHeight);
  gl.bindVertexArray(postVAO);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
  gl.bindVertexArray(null);

  // Render Projected 3D Hover Chip (strictly clamped to central viewport safe area!)
  if (mode === 'lab' && pointer.hoverLabel && pointer.hoverWorldPos) {
    const scr = M4.projectToScreen(
      matVP,
      pointer.hoverWorldPos[0],
      pointer.hoverWorldPos[1],
      pointer.hoverWorldPos[2],
      cssW,
      cssH
    );
    if (scr) {
      const sx = clamp(scr.x, 195, cssW - 195);
      const sy = clamp(scr.y, 138, cssH - 96);
      hoverLayerEl.innerHTML = `<div class="rb-hover-chip" style="left:${sx.toFixed(1)}px;top:${sy.toFixed(1)}px">${pointer.hoverLabel}</div>`;
    } else {
      hoverLayerEl.innerHTML = '';
    }
  } else {
    hoverLayerEl.innerHTML = '';
  }
}

// --- Live Web Audio Oscilloscope inside #rb-studio ---
const scopeBuf = new Uint8Array(256);
function renderStudioScope() {
  if (!scopeCtx || !studioEl.classList.contains('open')) return;
  const w = scopeCvs.width;
  const h = scopeCvs.height;
  scopeCtx.fillStyle = '#060b0f';
  scopeCtx.fillRect(0, 0, w, h);

  // Subtle center reference line
  scopeCtx.strokeStyle = 'rgba(16, 185, 129, 0.22)';
  scopeCtx.lineWidth = 1;
  scopeCtx.beginPath();
  scopeCtx.moveTo(0, h * 0.5);
  scopeCtx.lineTo(w, h * 0.5);
  scopeCtx.stroke();

  if (!audio.analyser) return;
  audio.analyser.getByteTimeDomainData(scopeBuf);
  scopeCtx.strokeStyle = '#22d3ee';
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

// --- IntersectionObserver to Pause WebGL2 Draws When Offscreen ---
let isAppVisible = true;
if (typeof IntersectionObserver !== 'undefined' && appEl) {
  const io = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        isAppVisible = entry.isIntersecting;
      }
    },
    { threshold: 0.01 }
  );
  io.observe(appEl);
}

// --- Main Animation Loop & Telemetry ---
applyCameraPreset(0);
syncHudText();

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
  if (fpsAccum >= 0.45) {
    currentFps = Math.round(fpsFrames / fpsAccum);
    fpsFrames = 0;
    fpsAccum = 0;
    const b = curBoard();
    const statusLabel = b.powered
      ? '5.0V 通电运行'
      : ironState.heating
        ? '385°C 熔锡中'
        : '380°C 恒温待命';
    perfEl.textContent = `${currentFps} FPS · ${b.spec.code} · ${statusLabel}`;
    syncHudText();
  }

  updateSimulation(dt, t);
  renderScene(dt, t);
  renderStudioScope();
}
requestAnimationFrame(frame);

// --- Public State & Automated Verification API ---
function getState() {
  const err = gl.getError();
  if (err !== 0) lastGlErr = err;
  const b = curBoard();
  const counts = getBoardCounts(b);
  return {
    mode,
    fps: currentFps,
    glErr: lastGlErr,
    boardIndex,
    boardName: b.spec.name,
    placedCount: counts.placedCount,
    solderedCount: counts.solderedCount,
    wiredCount: counts.wiredCount,
    powered: b.powered,
    score,
  };
}

window.__ROBOTICSLAB__ = {
  getState,
  startLab,
  selectBoard,
  autoAssembleAndPower,
  stepAction,
};
