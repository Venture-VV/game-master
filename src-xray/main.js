import {
  TAU,
  DEG2RAD,
  RAD2DEG,
  M4,
  V3,
  clamp,
  lerp,
  damp,
  computeJawKinematics,
  evalCardiacCycle,
  evalRespiration,
  rayPlaneIntersect,
  diagnoseAnatomyRegion,
} from './math.js';
import {
  BG_VS,
  BG_FS,
  ANAT_VS,
  ANAT_FS,
  RING_VS,
  RING_FS,
  PARTICLE_VS,
  PARTICLE_FS,
  POST_VS,
  POST_FS,
} from './shaders.js';
import {
  createAnatomyWorld,
  createBioParticleSystem,
  WebcamMotionTracker,
} from './world.js';
import { XRayMirrorAudio } from './audio.js';

// --- WebGL2 Shader & Program Helpers ---
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

// --- DOM Elements ---
const appEl = document.getElementById('xray-app');
const canvas = document.getElementById('xr-canvas');
const hudEl = document.getElementById('xr-hud');
const overlayEl = document.getElementById('xr-overlay');
const touchEl = document.getElementById('xr-touch');

const perfEl = document.getElementById('xr-perf');
const vitalsEl = document.getElementById('xr-vitals');
const modeBadgeEl = document.getElementById('xr-mode-badge');
const modeHintEl = document.getElementById('xr-mode-hint');
const toastFeedEl = document.getElementById('xr-toast-feed');
const bannerEl = document.getElementById('xr-banner');
const bannerTitleEl = document.getElementById('xr-banner-title');
const bannerSubEl = document.getElementById('xr-banner-sub');

const bpmValEl = document.getElementById('xr-bpm-val');
const rhythmLblEl = document.getElementById('xr-rhythm-lbl');
const ecgCvs = document.getElementById('xr-ecg');
const ecgCtx = ecgCvs ? ecgCvs.getContext('2d') : null;
const jawFillEl = document.getElementById('xr-jaw-fill');
const sparkFillEl = document.getElementById('xr-spark-fill');

const layerLblEl = document.getElementById('xr-layer-lbl');
const organTitleEl = document.getElementById('xr-organ-title');
const organSubEl = document.getElementById('xr-organ-sub');

const kickerEl = document.getElementById('xr-kicker');
const titleEl = document.getElementById('xr-title');
const descEl = document.getElementById('xr-desc');
const btnStart = document.getElementById('xr-btn-start');
const btnFullMode = document.getElementById('xr-btn-fullmode');
const btnStudio = document.getElementById('xr-btn-studio');
const studioEl = document.getElementById('xr-studio');
const scopeCvs = document.getElementById('xr-scope');
const scopeCtx = scopeCvs ? scopeCvs.getContext('2d') : null;

const btnFullXray = document.getElementById('btn-fullxray');
const btnAutoScan = document.getElementById('btn-autoscan');
const btnWebcam = document.getElementById('btn-webcam');
const btnAdrenaline = document.getElementById('btn-adrenaline');
const btnStorm = document.getElementById('btn-storm');
const btnJaw = document.getElementById('btn-jaw');
const jawRangeEl = document.getElementById('xr-jaw-range');
const jawLblEl = document.getElementById('xr-jaw-lbl');

const layerBtns = [
  document.getElementById('layer-1'),
  document.getElementById('layer-2'),
  document.getElementById('layer-3'),
  document.getElementById('layer-4'),
];

// --- WebGL2 Context Initialization ---
const gl = canvas.getContext('webgl2', {
  antialias: false,
  alpha: false,
  powerPreference: 'high-performance',
});
if (!gl) {
  titleEl.textContent = '当前浏览器未启用 WebGL2';
  throw new Error('WebGL2 unavailable');
}

const dbgExt = gl.getExtension('WEBGL_debug_renderer_info');
const rendererStr = dbgExt ? String(gl.getParameter(dbgExt.UNMASKED_RENDERER_WEBGL)) : '';
const isSoftwareGL = /SwiftShader|llvmpipe|Software/i.test(rendererStr);

const progBg = createProgram(gl, BG_VS, BG_FS, [
  'uRes',
  'uTime',
  'uFullScanMix',
  'uNeuralStorm',
]);

const progAnat = createProgram(gl, ANAT_VS, ANAT_FS, [
  'uProj',
  'uView',
  'uMatBust',
  'uNeckAngles',
  'uJawKin',
  'uEyeAngles',
  'uBreath',
  'uBlink',
  'uHeartPulse',
  'uMuscleFlex',
  'uCamPos',
  'uLensPos',
  'uLensAxis',
  'uLensRadius',
  'uFullScanMix',
  'uPassType',
  'uTime',
  'uNeuralStorm',
  'uJawOpen',
]);

const progRing = createProgram(gl, RING_VS, RING_FS, [
  'uProj',
  'uView',
  'uModel',
  'uCamPos',
  'uTime',
  'uFade',
  'uNeuralStorm',
]);

const progParticle = createProgram(gl, PARTICLE_VS, PARTICLE_FS, [
  'uProj',
  'uView',
  'uMatBust',
  'uNeckAngles',
  'uCamRight',
  'uCamUp',
  'uCamPos',
  'uLensPos',
  'uLensAxis',
  'uLensRadius',
  'uFullScanMix',
]);

const progPost = createProgram(gl, POST_VS, POST_FS, [
  'uTex',
  'uRes',
  'uPulseVig',
  'uStormFlash',
]);

const emptyVAO = gl.createVertexArray();
const world = createAnatomyWorld(gl, isSoftwareGL);
const bioParticles = createBioParticleSystem(gl, isSoftwareGL ? 480 : 660);
const webcam = new WebcamMotionTracker();
const audio = new XRayMirrorAudio();

// --- Offscreen FBO for ACES Filmic Post-Process ---
let fbo = null;
let fboTex = null;
let fboDepth = null;
let fboW = 0;
let fboH = 0;
let quality = isSoftwareGL ? 'med' : 'high';
const qualityScaleMap = isSoftwareGL
  ? { low: 0.56, med: 0.72, high: 0.85 }
  : { low: 0.72, med: 0.88, high: 1.0 };

function ensureFBO() {
  const dpr = Math.min(window.devicePixelRatio || 1, isSoftwareGL ? 1.0 : 1.75);
  const cssW = Math.max(320, appEl.clientWidth || 800);
  const cssH = Math.max(240, appEl.clientHeight || 446);
  const dispW = Math.round(cssW * dpr);
  const dispH = Math.round(cssH * dpr);
  if (canvas.width !== dispW || canvas.height !== dispH) {
    canvas.width = dispW;
    canvas.height = dispH;
  }

  const sc = qualityScaleMap[quality] || 0.88;
  const targetW = Math.max(256, Math.round(dispW * sc));
  const targetH = Math.max(180, Math.round(dispH * sc));
  if (fbo && targetW === fboW && targetH === fboH) return;

  fboW = targetW;
  fboH = targetH;
  if (fbo) gl.deleteFramebuffer(fbo);
  if (fboTex) gl.deleteTexture(fboTex);
  if (fboDepth) gl.deleteRenderbuffer(fboDepth);

  fboTex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, fboTex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, fboW, fboH, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

  fboDepth = gl.createRenderbuffer();
  gl.bindRenderbuffer(gl.RENDERBUFFER, fboDepth);
  gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT24, fboW, fboH);

  fbo = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, fboTex, 0);
  gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, fboDepth);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
}

new ResizeObserver(() => ensureFBO()).observe(appEl);
ensureFBO();

// IntersectionObserver to cleanly skip heavy WebGL draws when offscreen
let isAppVisible = true;
if (typeof IntersectionObserver !== 'undefined') {
  const io = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.target === appEl) {
          isAppVisible = entry.isIntersecting;
        }
      }
    },
    { threshold: 0.01 }
  );
  io.observe(appEl);
}

// --- Live Fluoroscopy & Physiological Simulation State ---
const LAYER_INFO = {
  1: { short: '复合透视', code: 'COMPOSITE X-RAY', cls: 'active-cyan' },
  2: { short: '骨骼透视', code: 'OSTEOLOGY SKULL', cls: 'active-ivory' },
  3: { short: '脑心透视', code: 'NEURO-CARDIAC', cls: 'active-gold' },
  4: { short: '肌群解剖', code: 'MYOLOGY FIBERS', cls: 'active-terra' },
};

let mode = 'menu'; // 'menu' | 'mirror' | 'paused'
let layerMode = 1; // 1=Composite, 2=Osteology, 3=Neuro-Cardiac, 4=Myology
let fullXrayTarget = 0; // 0 = 3D Scanner Ring, 1 = Full-Body X-Ray
let fullScanMix = 0.0;
let autoScan = false;

// Camera & Bust Pose
const camPos = [0, 0.05, 5.05];
const camTarget = [0, -0.16, 0];
const camUp = [0, 1, 0];
const matProj = M4.create();
const matView = M4.create();
const matVP = M4.create();
const matInvVP = M4.create();
const matBust = M4.create();
const matRing = M4.create();

let bustYaw = 0.0;
let targetBustYaw = 0.0;
let neckYaw = 0.0;
let neckPitch = 0.0;
let neckRoll = 0.0;
let eyeYaw = 0.0;
let eyePitch = 0.0;

// 3D Fluoroscopy Scanner Ring State (centered on face/skull/jaw by default!)
const lensPos = [0.0, 0.34, 1.55];
const targetLensPos = [0.0, 0.34, 1.55];
const lensAxis = [0.0, 0.0, 1.0];
let lensRadius = 0.56;
let targetLensRadius = 0.56;
let scannerSpeed = 0.0;

// Cursor State
let pointerNdcX = 0.0;
let pointerNdcY = 0.22;
let pointerActive = false;
let isRightDragging = false;
let isLeftHoldingJaw = false;
let lastDragX = 0;

// Mandible Jaw, Blink, Muscle Flex, Heartbeat & Cortical Neural Storm State
let jawOpen = 0.0;
let scriptedJawTarget = null; // Set when setJawOpen() or slider is used
let jawKin = computeJawKinematics(0);
let muscleFlex = 0.15;

let adrenalineActive = false;
let targetBpm = 72;
let currentBpm = 72;
let cardiacPhase = 0.0;
let prevCardiacPhase = 0.0;
let heartSystole = 0.0;
let respPhase = 0.0;
let breathVal = 0.0;

let blinkTimer = 2.8;
let blinkVal = 0.0;

let neuralStorm = 0.0;
let stormTimer = 0.0;
let stormFlash = 0.0;
let activeSparkCount = 128;
let particleDrawCount = 420;

// Live ECG Scrolling Waveform History (150 px)
const ecgHistory = new Float32Array(150);
let ecgAccum = 0;

// UI Banner & Toast Helpers
let bannerTimer = 0;
function showBanner(title, sub, dur = 2.4) {
  bannerTitleEl.textContent = title;
  bannerSubEl.textContent = sub;
  bannerEl.classList.add('show');
  bannerTimer = dur;
}

function showToast(msg, variant = '') {
  const div = document.createElement('div');
  div.className = `xr-toast${variant ? ` ${variant}` : ''}`;
  div.textContent = msg;
  toastFeedEl.prepend(div);
  while (toastFeedEl.children.length > 3) {
    toastFeedEl.lastElementChild.remove();
  }
  setTimeout(() => {
    div.remove();
  }, 2800);
}

// --- Core Interactive Actions ---
function startMirrorMode(forceFull = null) {
  audio.init();
  mode = 'mirror';
  overlayEl.classList.add('hidden');
  hudEl.classList.add('visible');
  touchEl.classList.add('active');
  if (typeof forceFull === 'boolean') {
    setFullXray(forceFull, false);
  }
  audio.playFluoroscopySweep();
  showBanner(
    fullXrayTarget > 0.5 ? '全身 X 光透视已激活' : '3D 荧光解剖魔镜已就绪',
    '扫掠光标实时透视骨骼·沟回大脑与搏动四腔心脏 · 按 [Space] 张口发声'
  );
  canvas.focus();
}

function togglePauseMenu() {
  if (mode === 'mirror') {
    mode = 'paused';
    overlayEl.classList.remove('hidden');
    kickerEl.textContent = 'FLUOROSCOPY RIG STANDBY // 实时解剖魔镜待命';
    titleEl.textContent = 'X 光解剖魔镜 · 诊断待命';
    descEl.textContent = '随时切换四重解剖剥离层、调试下颌骨张角或试听零采样生物声学合成台。';
    btnStart.textContent = '继续实时 X 光透视';
  } else if (mode === 'paused') {
    mode = 'mirror';
    overlayEl.classList.add('hidden');
    hudEl.classList.add('visible');
    canvas.focus();
  }
}

function applyLayerMode(m, announce = true) {
  let next = 1;
  if (typeof m === 'string') {
    const map = { composite: 1, osteology: 2, bone: 2, neuro: 3, brain: 3, myology: 4, muscle: 4 };
    next = map[m.toLowerCase()] || 1;
  } else {
    const n = Math.round(Number(m) || 1);
    next = n <= 0 ? 1 : (((n - 1) % 4) + 4) % 4 + 1;
  }
  layerMode = next;
  const info = LAYER_INFO[layerMode];

  layerBtns.forEach((btn, idx) => {
    if (!btn) return;
    btn.className = 'xr-tool-btn';
    if (idx + 1 === layerMode) {
      btn.classList.add(info.cls);
    }
  });
  document.querySelectorAll('.ly-pill').forEach((b) => {
    b.classList.toggle('active', Number(b.dataset.l) === layerMode);
  });
  layerLblEl.textContent = info.code;

  if (announce) {
    audio.init();
    audio.playBoneClick(true);
    const variant = layerMode === 3 ? 'gold' : layerMode === 4 ? 'coral' : '';
    showToast(`解剖层：[${layerMode}] ${info.short}`, variant);
  }
}

function setFullXray(enable, announce = true) {
  fullXrayTarget = enable ? 1 : 0;
  btnFullXray.classList.toggle('active', fullXrayTarget > 0.5);
  btnFullXray.textContent = fullXrayTarget > 0.5 ? '环镜透视 [X]' : '全屏透视 [X]';
  modeBadgeEl.textContent = fullXrayTarget > 0.5 ? '全透视' : '透视环';
  modeBadgeEl.classList.toggle('full', fullXrayTarget > 0.5);
  modeHintEl.textContent = fullXrayTarget > 0.5
    ? '全身实时 X 光显影中 · 按 [X] 切回聚焦环'
    : '扫掠光标实时剥离解剖层';

  if (announce) {
    audio.init();
    audio.playFluoroscopySweep();
    showToast(fullXrayTarget > 0.5 ? '已展开全身 X 光透视视野' : '已切换为 3D 黄铜聚焦透视环', 'gold');
  }
}

function fireNeuralStorm(announce = true) {
  neuralStorm = 1.0;
  stormTimer = 3.8;
  stormFlash = 0.55;
  btnStorm.classList.add('active');
  // Immediate particle surge so telemetry updates right away
  const pRes = bioParticles.update(0.016, performance.now() * 0.001, heartSystole, currentBpm / 72, 1.0);
  particleDrawCount = pRes.drawCount;
  activeSparkCount = Math.max(320, pRes.activeSparks);
  if (announce) {
    audio.init();
    audio.playNeuralStorm();
    showBanner('皮层神经元动作电位风暴!', '左右大脑半球沟回与视神经束金色突触同步激发', 2.2);
    showToast('触发皮层突触电位风暴!', 'gold');
  }
}

function toggleAdrenaline() {
  adrenalineActive = !adrenalineActive;
  targetBpm = adrenalineActive ? 148 : 72;
  btnAdrenaline.classList.toggle('active', adrenalineActive);
  rhythmLblEl.textContent = adrenalineActive ? 'BPM · 交感加速' : 'BPM · 窦性心律';
  audio.init();
  audio.playEcgPing(adrenalineActive);
  showToast(
    adrenalineActive ? '肾上腺素注入：心率冲刺 148 BPM!' : '迷走神经平复：恢复 72 BPM 静息心律',
    adrenalineActive ? 'coral' : ''
  );
}

// --- Input & UI Event Listeners ---
const keys = new Set();

window.addEventListener('keydown', (e) => {
  if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
  keys.add(e.code);

  if (e.code === 'KeyP' || e.code === 'Escape') {
    if (mode === 'mirror' || mode === 'paused') {
      e.preventDefault();
      togglePauseMenu();
    }
    return;
  }

  if (e.code === 'Digit1') applyLayerMode(1);
  else if (e.code === 'Digit2') applyLayerMode(2);
  else if (e.code === 'Digit3') applyLayerMode(3);
  else if (e.code === 'Digit4') applyLayerMode(4);
  else if (e.code === 'KeyX') setFullXray(fullXrayTarget < 0.5);
  else if (e.code === 'KeyN') fireNeuralStorm(true);
  else if (e.code === 'KeyE') toggleAdrenaline();
  else if (e.code === 'KeyV') {
    autoScan = !autoScan;
    btnAutoScan.classList.toggle('active', autoScan);
    showToast(autoScan ? '已开启自动全身透视巡航' : '已恢复光标自由扫掠');
  } else if (e.code === 'KeyW') {
    handleWebcamToggle();
  } else if (e.code === 'Space') {
    e.preventDefault();
    scriptedJawTarget = null;
    if (!e.repeat) {
      audio.init();
      audio.playBoneClick(true);
    }
  }
});

window.addEventListener('keyup', (e) => {
  keys.delete(e.code);
});

canvas.addEventListener('contextmenu', (e) => e.preventDefault());

function updatePointerNDC(clientX, clientY) {
  const rect = canvas.getBoundingClientRect();
  if (rect.width > 0 && rect.height > 0) {
    pointerNdcX = ((clientX - rect.left) / rect.width) * 2.0 - 1.0;
    pointerNdcY = 1.0 - ((clientY - rect.top) / rect.height) * 2.0;
    pointerActive = true;
  }
}

canvas.addEventListener('pointermove', (e) => {
  updatePointerNDC(e.clientX, e.clientY);
  if (isRightDragging) {
    const dx = e.clientX - lastDragX;
    lastDragX = e.clientX;
    targetBustYaw += dx * 0.011;
    syncPoseButtons(null);
  }
  if (autoScan && !isRightDragging) {
    autoScan = false;
    btnAutoScan.classList.remove('active');
  }
});

canvas.addEventListener('pointerdown', (e) => {
  if (mode !== 'mirror') return;
  audio.init();
  updatePointerNDC(e.clientX, e.clientY);
  canvas.setPointerCapture?.(e.pointerId);

  if (e.button === 2 || e.button === 1) {
    isRightDragging = true;
    lastDragX = e.clientX;
  } else if (e.button === 0) {
    isLeftHoldingJaw = true;
    scriptedJawTarget = null;
    audio.playBoneClick(true);
  }
});

function releasePointer(e) {
  if (e.button === 2 || e.button === 1) {
    isRightDragging = false;
  }
  if (e.button === 0 && isLeftHoldingJaw) {
    isLeftHoldingJaw = false;
    audio.playBoneClick(false);
  }
}
canvas.addEventListener('pointerup', releasePointer);
canvas.addEventListener('pointercancel', releasePointer);

canvas.addEventListener(
  'wheel',
  (e) => {
    if (mode !== 'mirror') return;
    e.preventDefault();
    targetLensRadius = clamp(targetLensRadius - Math.sign(e.deltaY) * 0.06, 0.30, 1.10);
  },
  { passive: false }
);

// Wire HUD & Overlay Buttons
btnStart.addEventListener('click', () => {
  if (mode === 'paused') togglePauseMenu();
  else startMirrorMode();
});

btnFullMode.addEventListener('click', () => {
  startMirrorMode(true);
});

btnFullXray.addEventListener('click', () => setFullXray(fullXrayTarget < 0.5));

btnAutoScan.addEventListener('click', () => {
  autoScan = !autoScan;
  btnAutoScan.classList.toggle('active', autoScan);
  showToast(autoScan ? '已开启 3D 透视环自动巡航' : '已恢复光标自由扫掠');
});

async function handleWebcamToggle() {
  audio.init();
  const res = await webcam.toggle();
  btnWebcam.classList.toggle('active', res.active);
  if (res.ok && res.active) {
    showToast('本地摄像头镜像已连接：头部偏转与张口实时同步!', 'gold');
  } else if (res.ok && !res.active) {
    showToast('已关闭摄像头镜像，恢复光标实时追踪');
  } else {
    showToast('当前环境未授权摄像头 · 已启用高精度光标与按键实时追踪');
  }
}
btnWebcam.addEventListener('click', handleWebcamToggle);

document.getElementById('btn-pause').addEventListener('click', togglePauseMenu);
document.getElementById('btn-fs').addEventListener('click', () => {
  if (!document.fullscreenElement) {
    appEl.requestFullscreen?.().catch(() => {});
  } else {
    document.exitFullscreen?.().catch(() => {});
  }
});

btnAdrenaline.addEventListener('click', toggleAdrenaline);
btnStorm.addEventListener('click', () => fireNeuralStorm(true));

function syncPoseButtons(activeDeg) {
  document.querySelectorAll('.xr-pose-btn[data-yaw]').forEach((b) => {
    b.classList.toggle('active', activeDeg !== null && Number(b.dataset.yaw) === activeDeg);
  });
}

document.querySelectorAll('.xr-pose-btn[data-yaw]').forEach((btn) => {
  btn.addEventListener('click', () => {
    const deg = Number(btn.dataset.yaw);
    targetBustYaw = deg * DEG2RAD;
    syncPoseButtons(deg);
    audio.init();
    audio.playBoneClick(false);
    showToast(deg === 180 ? '背脊视角：透视颈椎 C1-C7 棘突与小脑' : deg === 68 ? '侧颅视角：观察颧弓与颞下颌关节铰链' : '正视视角：标准解剖学方位');
  });
});

layerBtns.forEach((btn, idx) => {
  btn?.addEventListener('click', () => applyLayerMode(idx + 1));
});

// Jaw button supports press-and-hold OR click-toggle!
let jawBtnToggled = false;
btnJaw.addEventListener('pointerdown', (e) => {
  e.preventDefault();
  audio.init();
  jawBtnToggled = !jawBtnToggled;
  scriptedJawTarget = jawBtnToggled ? 1.0 : 0.0;
  btnJaw.classList.toggle('active-gold', jawBtnToggled);
  audio.playBoneClick(jawBtnToggled);
});

// Touch Controls
document.getElementById('xr-tb-jaw')?.addEventListener('touchstart', (e) => {
  e.preventDefault();
  audio.init();
  isLeftHoldingJaw = true;
  scriptedJawTarget = null;
}, { passive: false });
document.getElementById('xr-tb-jaw')?.addEventListener('touchend', () => {
  isLeftHoldingJaw = false;
});
document.getElementById('xr-tb-storm')?.addEventListener('click', () => fireNeuralStorm(true));
document.getElementById('xr-tb-layer')?.addEventListener('click', () => applyLayerMode((layerMode % 4) + 1));

// Overlay Settings & Studio Controls
document.querySelectorAll('.ly-pill').forEach((btn) => {
  btn.addEventListener('click', () => applyLayerMode(Number(btn.dataset.l)));
});

document.querySelectorAll('.q-pill').forEach((btn) => {
  btn.addEventListener('click', () => {
    quality = btn.dataset.q;
    document.querySelectorAll('.q-pill').forEach((b) => b.classList.toggle('active', b === btn));
    ensureFBO();
  });
});

jawRangeEl.addEventListener('input', () => {
  audio.init();
  const v = Number(jawRangeEl.value) / 100;
  scriptedJawTarget = v > 0.01 ? v : null;
  jawLblEl.textContent = `${Math.round(v * 34)}°`;
});

document.getElementById('xr-vol').addEventListener('input', (e) => {
  audio.init();
  audio.setVolume(Number(e.target.value) / 100);
});

btnStudio.addEventListener('click', () => {
  audio.init();
  studioEl.classList.toggle('open');
});

document.querySelectorAll('.xr-sfx-trigger').forEach((btn) => {
  btn.addEventListener('click', () => {
    audio.init();
    const s = btn.dataset.s;
    if (s === 'heart') audio.playHeartbeat(currentBpm, false);
    else if (s === 'vocal') audio.playVocalDemo();
    else if (s === 'storm') audio.playNeuralStorm();
    else if (s === 'xray') audio.playFluoroscopySweep();
    else if (s === 'bone') audio.playBoneClick(true);
    else if (s === 'ecg') audio.playEcgPing(true);
  });
});

// Wire Inline Tall View Toggle (#btn-tall and #menu-btn-tall injected by build.mjs)
function toggleTallView() {
  const isTall = appEl.classList.toggle('tall');
  const b1 = document.getElementById('btn-tall');
  const b2 = document.getElementById('menu-btn-tall');
  if (b1) b1.textContent = isTall ? '收起' : '大屏';
  if (b2) b2.textContent = isTall ? '收起大屏视野' : '展开大屏视野';
  ensureFBO();
}
document.getElementById('btn-tall')?.addEventListener('click', toggleTallView);
document.getElementById('menu-btn-tall')?.addEventListener('click', toggleTallView);

// --- Live Simulation & Biomechanical Kinematics Update ---
const tmpRayDir = [0, 0, -1];
const scannerPlanePt = [0, 0, 1.55];
const scannerPlaneNorm = [0, 0, 1];
const tmpHit = [0, 0, 1.55];

function updateSimulation(dt, time) {
  if (bannerTimer > 0) {
    bannerTimer -= dt;
    if (bannerTimer <= 0) bannerEl.classList.remove('show');
  }

  // 1. Bust Rotation (A/D or Arrow keys or Right-drag, full +-180 deg)
  const rotInput = (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0)
    - (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0);
  if (rotInput !== 0) {
    targetBustYaw += rotInput * dt * 1.65;
    syncPoseButtons(null);
  }
  // Normalize angle display while keeping smooth interpolation
  bustYaw = damp(bustYaw, targetBustYaw, 9.5, dt);
  M4.fromRotationY(bustYaw, matBust);

  // 2. Camera Matrices (needed for exact cursor-to-scanner ray projection)
  const aspect = Math.max(0.5, fboW / Math.max(1, fboH));
  M4.perspective(39.0 * DEG2RAD, aspect, 0.15, 30.0, matProj);
  M4.lookAt(camPos, camTarget, camUp, matView);
  M4.multiply(matProj, matView, matVP);
  M4.invert(matVP, matInvVP);

  // 3. 3D Fluoroscopy Scanner Ring Position & Live Tracking
  const camSample = webcam.sample();

  if (mode === 'menu') {
    // Graceful anatomical tour sweep across face, brain, jaw & heart behind menu
    targetLensPos[0] = Math.sin(time * 0.82) * 0.36;
    targetLensPos[1] = 0.06 + Math.cos(time * 0.58) * 0.56;
    targetLensPos[2] = 1.55;
  } else if (autoScan) {
    targetLensPos[0] = Math.sin(time * 0.85) * 0.42;
    targetLensPos[1] = -0.10 + Math.cos(time * 0.56) * 0.72;
    targetLensPos[2] = 1.55;
  } else if (pointerActive) {
    M4.unprojectRay(matInvVP, pointerNdcX, pointerNdcY, camPos, tmpRayDir);
    rayPlaneIntersect(camPos, tmpRayDir, scannerPlanePt, scannerPlaneNorm, tmpHit);
    targetLensPos[0] = clamp(tmpHit[0], -1.55, 1.55);
    targetLensPos[1] = clamp(tmpHit[1], -1.35, 1.15);
    targetLensPos[2] = 1.55;
  } else {
    // Iconic half-alabaster / half-X-Ray split over face, eye, brain & jaw before cursor moves!
    targetLensPos[0] = 0.15;
    targetLensPos[1] = 0.28;
    targetLensPos[2] = 1.55;
  }

  const prevX = lensPos[0];
  const prevY = lensPos[1];
  lensPos[0] = damp(lensPos[0], targetLensPos[0], 14.0, dt);
  lensPos[1] = damp(lensPos[1], targetLensPos[1], 14.0, dt);
  lensPos[2] = 1.55;
  scannerSpeed = Math.hypot(lensPos[0] - prevX, lensPos[1] - prevY) / Math.max(dt, 0.001);

  lensRadius = damp(lensRadius, targetLensRadius, 10.0, dt);
  fullScanMix = damp(fullScanMix, fullXrayTarget, 8.5, dt);

  V3.normalize(
    camPos[0] - lensPos[0],
    camPos[1] - lensPos[1],
    camPos[2] - lensPos[2],
    lensAxis
  );

  // 4. Live Neck & Eyeball Gaze Tracking (Webcam or Cursor!)
  let desiredNeckYaw = 0;
  let desiredNeckPitch = 0;
  let desiredEyeYaw = 0;
  let desiredEyePitch = 0;

  if (camSample) {
    desiredNeckYaw = camSample.yaw;
    desiredNeckPitch = camSample.pitch;
    desiredEyeYaw = clamp(camSample.yaw * 0.55, -0.35, 0.35);
    desiredEyePitch = clamp(camSample.pitch * 0.55, -0.25, 0.25);
  } else {
    const gx = clamp(lensPos[0] / 1.4, -1, 1);
    const gy = clamp((lensPos[1] - 0.35) / 1.2, -1, 1);
    desiredNeckYaw = gx * 0.26 + Math.sin(time * 0.7) * 0.03;
    desiredNeckPitch = -gy * 0.18 + Math.cos(time * 0.55) * 0.02;
    desiredEyeYaw = gx * 0.34;
    desiredEyePitch = -gy * 0.26;
  }

  neckYaw = damp(neckYaw, desiredNeckYaw, 6.5, dt);
  neckPitch = damp(neckPitch, desiredNeckPitch, 6.5, dt);
  neckRoll = damp(neckRoll, -neckYaw * 0.16, 6.0, dt);
  eyeYaw = damp(eyeYaw, desiredEyeYaw, 14.0, dt);
  eyePitch = damp(eyePitch, desiredEyePitch, 14.0, dt);

  // 5. Mandible Jaw Hinge (0..34 deg) + Muscle Flex Tension
  let desiredJaw = 0.0;
  if (scriptedJawTarget !== null) {
    desiredJaw = scriptedJawTarget;
  } else if (keys.has('Space') || isLeftHoldingJaw) {
    // Subtle natural vibrato while holding mouth wide open!
    desiredJaw = 0.94 + 0.06 * Math.sin(time * 7.5);
  } else if (camSample) {
    desiredJaw = camSample.jawOpen;
  } else if (mode === 'menu') {
    // Occasional gentle demonstration jaw articulation in background preview
    const demoWave = Math.sin(time * 0.95) - 0.55;
    desiredJaw = demoWave > 0 ? clamp(demoWave * 1.6, 0, 0.68) : 0;
  }

  jawOpen = damp(jawOpen, desiredJaw, 12.0, dt);
  jawKin = computeJawKinematics(jawOpen);

  const neckEffort = Math.min(1, Math.hypot(neckYaw, neckPitch) * 1.6);
  const targetFlex = clamp(
    0.16 + jawOpen * 0.78 + neckEffort * 0.35 + (adrenalineActive ? 0.30 : 0.0),
    0.0,
    1.0
  );
  muscleFlex = damp(muscleFlex, targetFlex, 8.0, dt);

  // 6. Natural Spontaneous Eyelid Blinking
  blinkTimer -= dt;
  if (blinkTimer <= 0) {
    blinkTimer = 2.6 + ((Math.sin(time * 13.7) * 0.5 + 0.5) * 2.4);
    blinkVal = 1.0;
  } else {
    blinkVal = damp(blinkVal, 0.0, 15.0, dt);
  }

  // 7. Cardiac Cycle (68..155 BPM), Live ECG Trace & Thoracic Respiration
  const excitementBpm = targetBpm + jawOpen * 6.0 + neuralStorm * 12.0;
  currentBpm = damp(currentBpm, clamp(excitementBpm, 68, 155), 2.5, dt);

  prevCardiacPhase = cardiacPhase;
  cardiacPhase = (cardiacPhase + (currentBpm / 60.0) * dt) % 1.0;
  if (cardiacPhase < prevCardiacPhase && mode === 'mirror') {
    audio.playHeartbeat(currentBpm, adrenalineActive);
  }

  const card = evalCardiacCycle(cardiacPhase);
  heartSystole = card.systole;

  // Respiration (~1 beat per 4.3 heartbeats)
  respPhase = (respPhase + (currentBpm / 60.0 / 4.3) * dt) % 1.0;
  breathVal = evalRespiration(respPhase);

  // Scroll Live P-QRS-T ECG Buffer at ~60 samples/sec
  ecgAccum += dt;
  while (ecgAccum >= 1 / 60) {
    ecgAccum -= 1 / 60;
    ecgHistory.copyWithin(0, 1);
    ecgHistory[ecgHistory.length - 1] = card.ecgMv;
  }

  // 8. Cortical Neural Storm Decay & Bio-Particle Simulation
  if (stormTimer > 0) {
    stormTimer -= dt;
    if (stormTimer <= 0) {
      btnStorm.classList.remove('active');
    }
  }
  neuralStorm = damp(neuralStorm, stormTimer > 0 ? 1.0 : 0.0, 3.2, dt);
  stormFlash = damp(stormFlash, 0.0, 5.5, dt);

  const pState = bioParticles.update(dt, time, heartSystole, currentBpm / 72.0, neuralStorm);
  particleDrawCount = pState.drawCount;
  activeSparkCount = pState.activeSparks;

  // 9. Continuous Audio Synth Modulation
  audio.updateContinuous(jawOpen, scannerSpeed, fullScanMix, mode === 'mirror');
}

// --- Multi-Pass WebGL2 Anatomy & Fluoroscopy Renderer ---
function bindCommonAnatUniforms(time) {
  const u = progAnat.u;
  gl.useProgram(progAnat.prog);
  gl.uniformMatrix4fv(u.uProj, false, matProj);
  gl.uniformMatrix4fv(u.uView, false, matView);
  gl.uniformMatrix4fv(u.uMatBust, false, matBust);
  gl.uniform3f(u.uNeckAngles, neckYaw, neckPitch, neckRoll);
  gl.uniform3f(u.uJawKin, jawKin.angleRad, jawKin.glideY, jawKin.glideZ);
  gl.uniform2f(u.uEyeAngles, eyeYaw, eyePitch);
  gl.uniform1f(u.uBreath, breathVal);
  gl.uniform1f(u.uBlink, blinkVal);
  gl.uniform1f(u.uHeartPulse, heartSystole);
  gl.uniform1f(u.uMuscleFlex, muscleFlex);
  gl.uniform3f(u.uCamPos, camPos[0], camPos[1], camPos[2]);
  gl.uniform3f(u.uLensPos, lensPos[0], lensPos[1], lensPos[2]);
  gl.uniform3f(u.uLensAxis, lensAxis[0], lensAxis[1], lensAxis[2]);
  gl.uniform1f(u.uLensRadius, lensRadius);
  gl.uniform1f(u.uFullScanMix, fullScanMix);
  gl.uniform1f(u.uTime, time);
  gl.uniform1f(u.uNeuralStorm, neuralStorm);
  gl.uniform1f(u.uJawOpen, jawOpen);
}

function drawMesh(mesh, passType) {
  gl.uniform1i(progAnat.u.uPassType, passType);
  gl.bindVertexArray(mesh.vao);
  gl.drawElements(gl.TRIANGLES, mesh.count, gl.UNSIGNED_INT, 0);
}

function drawBioParticles() {
  if (particleDrawCount <= 0) return;
  const u = progParticle.u;
  gl.useProgram(progParticle.prog);
  gl.uniformMatrix4fv(u.uProj, false, matProj);
  gl.uniformMatrix4fv(u.uView, false, matView);
  gl.uniformMatrix4fv(u.uMatBust, false, matBust);
  gl.uniform3f(u.uNeckAngles, neckYaw, neckPitch, neckRoll);
  // Extract camera right & up vectors from matView columns/rows
  gl.uniform3f(u.uCamRight, matView[0], matView[4], matView[8]);
  gl.uniform3f(u.uCamUp, matView[1], matView[5], matView[9]);
  gl.uniform3f(u.uCamPos, camPos[0], camPos[1], camPos[2]);
  gl.uniform3f(u.uLensPos, lensPos[0], lensPos[1], lensPos[2]);
  gl.uniform3f(u.uLensAxis, lensAxis[0], lensAxis[1], lensAxis[2]);
  gl.uniform1f(u.uLensRadius, lensRadius);
  gl.uniform1f(u.uFullScanMix, fullScanMix);

  gl.bindVertexArray(bioParticles.vao);
  gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, particleDrawCount);
}

function renderScene(time) {
  ensureFBO();
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
  gl.viewport(0, 0, fboW, fboH);
  // CRITICAL: Enable depthMask(true) BEFORE gl.clear so the depth buffer clears every frame!
  gl.depthMask(true);
  gl.clearColor(0.031, 0.063, 0.090, 1.0);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

  // 1. Diagnostic Dark-Slate Studio Backdrop & Millimeter Grid
  gl.disable(gl.DEPTH_TEST);
  gl.depthMask(false);
  gl.disable(gl.BLEND);
  gl.useProgram(progBg.prog);
  gl.uniform2f(progBg.u.uRes, fboW, fboH);
  gl.uniform1f(progBg.u.uTime, time);
  gl.uniform1f(progBg.u.uFullScanMix, fullScanMix);
  gl.uniform1f(progBg.u.uNeuralStorm, neuralStorm);
  gl.bindVertexArray(emptyVAO);
  gl.drawArrays(gl.TRIANGLES, 0, 3);

  // 2. Outer Museum Alabaster-Warm-Skin Bust (discards cleanly inside Scanner Ring!)
  gl.enable(gl.DEPTH_TEST);
  gl.depthFunc(gl.LEQUAL);
  gl.depthMask(true);
  gl.disable(gl.CULL_FACE);
  bindCommonAnatUniforms(time);
  drawMesh(world.outerMesh, 0);

  // 3. Internal Articulated Anatomy inside Scanner Aperture according to Layer Mode
  if (layerMode === 1) {
    // MODE 1: COMPOSITE MEDICAL FLUOROSCOPY (Brain & Heart + Translucent X-Ray Skull/Teeth + Sparks!)
    drawMesh(world.neuroMesh, 3);

    gl.enable(gl.BLEND);
    gl.depthMask(false);
    gl.enable(gl.CULL_FACE);
    gl.cullFace(gl.BACK);

    // Radiograph X-Ray Skeleton & Crisp 28 Teeth over Brain & Heart
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    drawMesh(world.boneMesh, 4);

    // Subtle Myology Grazing Contour + Additive Bloodstream & Cortical Sparks
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
    drawMesh(world.muscleMesh, 6);
    gl.disable(gl.CULL_FACE);
    drawBioParticles();

    gl.disable(gl.BLEND);
    gl.depthMask(true);
  } else if (layerMode === 2) {
    // MODE 2: OSTEOLOGY (Solid Ivory Skull, 28 Enamel Teeth, Hinged Jaw, Spine & 16 Breathing Ribs)
    drawMesh(world.boneMesh, 2);
  } else if (layerMode === 3) {
    // MODE 3: NEURO-CARDIAC (Folded Cerebral Cortex, Golden Synapses, Eyes/Nerves & 4-Chamber Heart)
    drawMesh(world.neuroMesh, 3);

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
    gl.depthMask(false);
    gl.enable(gl.CULL_FACE);
    gl.cullFace(gl.BACK);
    bindCommonAnatUniforms(time);
    drawMesh(world.boneMesh, 5); // Translucent cyan ghost cranium & ribcage frame
    gl.disable(gl.CULL_FACE);

    drawBioParticles();
    gl.disable(gl.BLEND);
    gl.depthMask(true);
  } else {
    // MODE 4: MYOLOGY (Striated Terracotta-Crimson Muscle Fibers + Tendons over Ivory Skeleton!)
    drawMesh(world.boneMesh, 2);
    drawMesh(world.muscleMesh, 1);
  }

  // 4. Floating 3D Brass-and-Cyan Physical Fluoroscopy Scanner Ring
  const ringFade = clamp(1.0 - fullScanMix * 1.15, 0.0, 1.0);
  if (ringFade > 0.01) {
    M4.fromPosNormalScale(lensPos, lensAxis, lensRadius, matRing);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.depthMask(false);
    gl.useProgram(progRing.prog);
    gl.uniformMatrix4fv(progRing.u.uProj, false, matProj);
    gl.uniformMatrix4fv(progRing.u.uView, false, matView);
    gl.uniformMatrix4fv(progRing.u.uModel, false, matRing);
    gl.uniform3f(progRing.u.uCamPos, camPos[0], camPos[1], camPos[2]);
    gl.uniform1f(progRing.u.uTime, time);
    gl.uniform1f(progRing.u.uFade, ringFade);
    gl.uniform1f(progRing.u.uNeuralStorm, neuralStorm);
    gl.bindVertexArray(world.scannerRing.vao);
    gl.drawElements(gl.TRIANGLES, world.scannerRing.count, gl.UNSIGNED_INT, 0);
    gl.disable(gl.BLEND);
    gl.depthMask(true);
  }

  // 5. ACES Filmic Post-Process to Main Canvas
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.viewport(0, 0, canvas.width, canvas.height);
  gl.disable(gl.DEPTH_TEST);
  gl.depthMask(false);
  gl.useProgram(progPost.prog);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, fboTex);
  gl.uniform1i(progPost.u.uTex, 0);
  gl.uniform2f(progPost.u.uRes, fboW, fboH);
  gl.uniform1f(progPost.u.uPulseVig, adrenalineActive ? heartSystole : heartSystole * 0.25);
  gl.uniform1f(progPost.u.uStormFlash, stormFlash);
  gl.bindVertexArray(emptyVAO);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
  gl.bindVertexArray(null);
}

// --- HUD Telemetry, Live ECG Monitor & Studio Scope ---
function updateHUD() {
  if (mode !== 'mirror') return;

  const yawDeg = Math.round((((bustYaw * RAD2DEG) % 360) + 540) % 360 - 180);
  vitalsEl.textContent = `${Math.round(currentBpm)} BPM · 下颌 ${jawKin.angleDeg.toFixed(1)}° · 视角 ${yawDeg}°`;
  bpmValEl.textContent = String(Math.round(currentBpm));
  jawFillEl.style.width = `${Math.round(jawOpen * 100)}%`;

  const sparkPct = clamp(Math.round((activeSparkCount / 360) * 100), 12, 100);
  sparkFillEl.style.width = `${sparkPct}%`;

  // Diagnose anatomical structure under the active 3D Scanner Ring
  const diag = diagnoseAnatomyRegion(lensPos[0], lensPos[1] + 0.12, 0, bustYaw, jawOpen);
  organTitleEl.textContent = diag.title;
  organSubEl.textContent = `火花 ${activeSparkCount} · ${diag.sub}`;

  // Draw Live P-QRS-T Electrocardiogram Trace (strictly Medical Cyan & Synaptic Gold)
  if (ecgCtx) {
    const w = ecgCvs.width;
    const h = ecgCvs.height;
    ecgCtx.fillStyle = '#050b10';
    ecgCtx.fillRect(0, 0, w, h);
    ecgCtx.strokeStyle = adrenalineActive ? '#ef4444' : '#22d3ee';
    ecgCtx.lineWidth = 1.6;
    ecgCtx.beginPath();
    for (let i = 0; i < ecgHistory.length; i++) {
      const x = (i / (ecgHistory.length - 1)) * w;
      const y = h * 0.68 - ecgHistory[i] * (h * 0.52);
      if (i === 0) ecgCtx.moveTo(x, y);
      else ecgCtx.lineTo(x, y);
    }
    ecgCtx.stroke();
  }
}

const scopeBuf = new Uint8Array(256);
function renderStudioScope() {
  if (!scopeCtx || !studioEl.classList.contains('open')) return;
  const w = scopeCvs.width;
  const h = scopeCvs.height;
  scopeCtx.fillStyle = '#04090d';
  scopeCtx.fillRect(0, 0, w, h);
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

// --- Main Animation Loop ---
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
    const lInfo = LAYER_INFO[layerMode];
    perfEl.textContent = `${currentFps} FPS · ${lInfo.short} · 镜径 ${lensRadius.toFixed(2)}`;
  }

  updateSimulation(dt, t);
  renderScene(t);
  updateHUD();
  renderStudioScope();
}
requestAnimationFrame(frame);

// --- Diagnostic & Automated Verification API ---
window.__XRAYMIRROR__ = {
  getState() {
    return {
      mode,
      fps: currentFps,
      glErr: gl.getError(),
      layerMode,
      jawAngleDeg: Number(jawKin.angleDeg.toFixed(1)),
      bpm: Math.round(currentBpm),
      fullXray: fullXrayTarget > 0.5,
      neuralSparks: activeSparkCount,
    };
  },
  startMirror(full = false) {
    startMirrorMode(Boolean(full));
    return this.getState();
  },
  setLayerMode(m = 1) {
    applyLayerMode(m, false);
    return this.getState();
  },
  setJawOpen(v = 1) {
    const clamped = clamp(Number(v) || 0, 0, 1);
    scriptedJawTarget = clamped;
    jawOpen = clamped;
    jawKin = computeJawKinematics(jawOpen);
    jawRangeEl.value = String(Math.round(clamped * 100));
    jawLblEl.textContent = `${Math.round(jawKin.angleDeg)}°`;
    return this.getState();
  },
  triggerNeuralStorm() {
    fireNeuralStorm(false);
    return this.getState();
  },
  toggleFullXray(force) {
    const next = typeof force === 'boolean' ? force : fullXrayTarget < 0.5;
    setFullXray(next, false);
    fullScanMix = fullXrayTarget;
    return this.getState();
  },
};
