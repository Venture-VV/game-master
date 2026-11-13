import {
  M4,
  DRIVE_LIMIT,
  clamp,
  lerp,
  damp,
  wrapAngle,
  getGroundHeight,
  getForwardSlope,
  getDistrictLabel,
} from './math.js';
import {
  CT_SKY_VS,
  CT_SKY_FS,
  CT_WORLD_VS,
  CT_WORLD_FS,
  CT_INST_VS,
  CT_INST_FS,
  CT_POST_VS,
  CT_POST_FS,
} from './shaders.js';
import {
  createCityPrimitives,
  createParticleSystem,
  buildManhattanDistrict,
  drawPlayerCoupe,
  drawTrafficVehicles,
  drawSmashables,
  drawCrosstownBeacons,
} from './world.js';
import { NYCCrosstownAudio } from './audio.js';

// --- WebGL2 Shader Compilation Utilities ---
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
const appEl = document.getElementById('crosstown-app');
const canvas = document.getElementById('ct-canvas');
const hudEl = document.getElementById('ct-hud');
const overlayEl = document.getElementById('ct-overlay');
const perfEl = document.getElementById('ct-perf');
const compassEl = document.getElementById('ct-compass');
const stageTagEl = document.getElementById('ct-stage-tag');
const stageDescEl = document.getElementById('ct-stage-desc');
const pipsWrapEl = document.getElementById('ct-pips');
const pipEls = Array.from(document.querySelectorAll('.ct-pip'));
const toastFeedEl = document.getElementById('ct-toast-feed');
const waypointsEl = document.getElementById('ct-waypoints');
const bannerEl = document.getElementById('ct-banner');
const bannerTitleEl = document.getElementById('ct-banner-title');
const bannerSubEl = document.getElementById('ct-banner-sub');

const speedValEl = document.getElementById('ct-speed-val');
const gearValEl = document.getElementById('ct-gear-val');
const nitroFillEl = document.getElementById('ct-nitro-fill');
const driftFillEl = document.getElementById('ct-drift-fill');
const scoreValEl = document.getElementById('ct-score-val');
const stateValEl = document.getElementById('ct-state-val');

const kickerEl = document.getElementById('ct-kicker');
const titleEl = document.getElementById('ct-title');
const descEl = document.getElementById('ct-desc');
const debriefEl = document.getElementById('ct-debrief');
const stTimeEl = document.getElementById('st-time');
const stBeaconsEl = document.getElementById('st-beacons');
const stHydrantsEl = document.getElementById('st-hydrants');
const stScoreEl = document.getElementById('st-score');
const stRankEl = document.getElementById('st-rank');

const btnRush = document.getElementById('ct-btn-rush');
const btnFreeRoam = document.getElementById('ct-btn-freeroam');
const btnContinueRoam = document.getElementById('ct-btn-continue-roam');
const btnRestart = document.getElementById('ct-btn-restart');
const btnStudio = document.getElementById('ct-btn-studio');
const studioEl = document.getElementById('ct-studio');
const scopeCvs = document.getElementById('ct-scope');
const scopeCtx = scopeCvs ? scopeCvs.getContext('2d') : null;

// --- WebGL2 Initialization ---
const gl = canvas.getContext('webgl2', {
  antialias: false,
  alpha: false,
  powerPreference: 'high-performance',
});
if (!gl) {
  titleEl.textContent = '当前浏览器未开启 WebGL2';
  throw new Error('WebGL2 unavailable');
}

const dbgExt = gl.getExtension('WEBGL_debug_renderer_info');
const rendererStr = dbgExt ? String(gl.getParameter(dbgExt.UNMASKED_RENDERER_WEBGL)) : '';
const isSoftwareGL = /SwiftShader|llvmpipe|Software/i.test(rendererStr);

const progSky = createProgram(gl, CT_SKY_VS, CT_SKY_FS, ['uProj', 'uView', 'uCamPos', 'uTime']);
const progWorld = createProgram(gl, CT_WORLD_VS, CT_WORLD_FS, [
  'uProj',
  'uView',
  'uModel',
  'uMat',
  'uColor',
  'uParams',
  'uCamPos',
  'uTime',
  'uHeadlightPos',
  'uHeadlightDir',
]);
const progInst = createProgram(gl, CT_INST_VS, CT_INST_FS, ['uProj', 'uView']);
const progPost = createProgram(gl, CT_POST_VS, CT_POST_FS, [
  'uTex',
  'uRes',
  'uTime',
  'uNitroBlur',
  'uBloomAmt',
]);

const postVAO = gl.createVertexArray();
const meshes = createCityPrimitives(gl);
const city = buildManhattanDistrict(gl);
const particleSys = createParticleSystem(gl, 760);
const audio = new NYCCrosstownAudio();

// --- Offscreen Post-Process FBO ---
let fbo = null;
let fboTex = null;
let fboDepth = null;
let fboW = 0;
let fboH = 0;
let quality = isSoftwareGL ? 'med' : 'high';
const qualityScaleMap = isSoftwareGL
  ? { low: 0.5, med: 0.65, high: 0.80 }
  : { low: 0.68, med: 0.85, high: 1.0 };

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

  const sc = qualityScaleMap[quality] || 0.85;
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

// --- IntersectionObserver to Skip Heavy WebGL Draws When Scrolled Off-Screen ---
let isIntersecting = true;
if (typeof IntersectionObserver !== 'undefined') {
  const io = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        isIntersecting = entry.isIntersecting;
      }
    },
    { threshold: 0.01 }
  );
  io.observe(appEl);
}

// --- GPU Particle Pool (0 = Tire Smoke, 1 = Hydrant Water Geyser, 2 = Sparks & Nitro Embers) ---
const particles = [];
function spawnParticle(x, y, z, vx, vy, vz, size, grow, life, r, g, b, a, kind = 0, grav = 9.0) {
  if (particles.length >= particleSys.maxParticles) return;
  particles.push({
    x, y, z, vx, vy, vz,
    size, grow, life, maxLife: life,
    r, g, b, a, kind, grav,
    rot: Math.random() * 6.28,
    vrot: (Math.random() - 0.5) * 4.0,
  });
}

function emitSparks(x, y, z, count = 16, speed = 11.0) {
  for (let i = 0; i < count; i++) {
    const a = Math.random() * Math.PI * 2;
    const sp = speed * (0.4 + Math.random() * 0.8);
    const cyanTint = i % 4 === 0;
    spawnParticle(
      x + (Math.random() - 0.5) * 0.6,
      y + 0.3 + Math.random() * 0.5,
      z + (Math.random() - 0.5) * 0.6,
      Math.cos(a) * sp,
      3.5 + Math.random() * 7.5,
      Math.sin(a) * sp,
      0.42 + Math.random() * 0.35,
      0.0,
      0.32 + Math.random() * 0.32,
      cyanTint ? 0.32 : 1.0,
      cyanTint ? 0.86 : 0.72,
      cyanTint ? 1.0 : 0.20,
      0.95,
      2,
      18.0
    );
  }
}

// Expanding Ground Shockwave Rings (Beacon Clears & Hydrant Bursts)
const shockRings = [];
function spawnShockRing(x, y, z, maxRadius = 15, dur = 0.65, col = [1.0, 0.76, 0.18]) {
  shockRings.push({ x, y: y + 0.18, z, r: 1.2, maxRadius, t: 0, dur, col });
}

// --- Player Muscle Coupe & Game State ---
const car = {
  x: -56.0,
  y: 0.0,
  z: 52.0,
  vy: 0.0,
  yaw: 0.0,           // Visual chassis heading (0 = North -Z along Broadway/7th Ave!)
  moveYaw: 0.0,       // Velocity travel vector angle (diverges smoothly during Space Drift!)
  pitch: 0.0,
  roll: 0.0,
  speed: 0.0,         // m/s (54.2 m/s = 195 KM/H!)
  wheelSpin: 0.0,
  steerVisual: 0.0,
  airborne: false,
  airTime: 0.0,
  braking: false,
  drifting: false,
  boosting: false,
  nitro: 90.0,        // 0..100
  forcedBoostTimer: 0.0,
  driftDuration: 0.0,
  driftPoints: 0.0,
  driftMult: 1,
};

let mode = 'title';        // 'title' | 'playing' | 'paused' | 'victory'
let gameMode = 'rush';     // 'rush' | 'freeroam'
let rushTime = 0.0;
let score = 0;
let beaconsCleared = 0;
let hydrantsSmashed = 0;

let camPreset = 0;         // 0: Chase, 1: Hood, 2: Heli
const camNames = ['低趴追尾 Chase', '引擎盖第一人称 Hood', '直升机航拍 Heli'];
let bloomPreset = 1;       // 0: Crisp (0.55), 1: Dusk (1.0), 2: Neon Surge (1.55)
const bloomValues = [0.55, 1.0, 1.55];
const bloomNames = ['清透', '暮色', '流光'];

let camPos = [-56, 4.2, 61];
let camLook = [-56, 1.4, 42];
let camYaw = 0;
let camShake = 0;
let bannerTimer = 0;

// --- Input State ---
const keys = new Set();
let mouseBoostHeld = false;
let touchSteer = 0;
let touchThrottle = 0;
let touchDrift = false;
let touchBoost = false;

function showToast(msg) {
  const el = document.createElement('div');
  el.className = 'ct-toast';
  el.textContent = msg;
  toastFeedEl.appendChild(el);
  while (toastFeedEl.children.length > 4) {
    toastFeedEl.removeChild(toastFeedEl.firstChild);
  }
  setTimeout(() => {
    if (el.parentNode) el.parentNode.removeChild(el);
  }, 3400);
}

function showBanner(title, sub, dur = 3.0) {
  bannerTitleEl.textContent = title;
  bannerSubEl.textContent = sub;
  bannerEl.classList.add('show');
  bannerTimer = dur;
}

function formatTime(sec) {
  const m = Math.floor(sec / 60);
  const s = sec - m * 60;
  return `${String(m).padStart(2, '0')}:${s.toFixed(1).padStart(4, '0')}`;
}

function resetCarAtMidtown() {
  car.x = -56.0;
  car.z = 52.0;
  car.y = getGroundHeight(car.x, car.z);
  car.vy = 0;
  car.yaw = 0;
  car.moveYaw = 0;
  car.pitch = 0;
  car.roll = 0;
  car.speed = 0;
  car.airborne = false;
  car.airTime = 0;
  car.drifting = false;
  car.boosting = false;
  car.nitro = 95;
  car.forcedBoostTimer = 0;
  car.driftDuration = 0;
  car.driftPoints = 0;
  car.driftMult = 1;
  camYaw = 0;
  camPos = [car.x, car.y + 2.6, car.z + 7.2];
  camLook = [car.x, car.y + 1.1, car.z - 8.0];
}

function resetWorldProps() {
  for (const b of city.beacons) b.cleared = false;
  for (const h of city.hydrants) {
    h.smashed = false;
    h.geyserTimer = 0;
    h.respawnTimer = 0;
  }
  for (const c of city.cones) {
    c.smashed = false;
    c.x = c.homeX;
    c.y = c.homeY;
    c.z = c.homeZ;
    c.vx = c.vy = c.vz = 0;
    c.rx = c.rz = 0;
  }
  particles.length = 0;
  shockRings.length = 0;
}

// --- Mode Launchers (Crosstown Rush & Free Roam) ---
function startRush() {
  audio.init();
  resetWorldProps();
  resetCarAtMidtown();
  gameMode = 'rush';
  mode = 'playing';
  rushTime = 0;
  score = 0;
  beaconsCleared = 0;
  hydrantsSmashed = 0;

  pipEls.forEach((p) => p.classList.remove('done'));
  pipsWrapEl.classList.remove('hidden');
  debriefEl.classList.remove('show');
  stageTagEl.textContent = '计时';
  stageDescEl.textContent = `时代广场南口 [0/${city.beacons.length}]`;

  overlayEl.classList.add('hidden');
  hudEl.classList.add('visible');
  document.getElementById('ct-touch').classList.add('active');
  canvas.focus();

  audio.playBeaconClear(0);
  showBanner('横穿曼哈顿计时赛 · CROSSTOWN RUSH', '冲过 8 座金色街区信标！按住空格手刹漂移叠 ×5 倍率', 3.4);
  showToast('引擎点火！前方直冲时代广场第 1 座金色信标');
}

function startFreeRoam(preservePosition = false) {
  audio.init();
  if (!preservePosition) {
    resetWorldProps();
    resetCarAtMidtown();
    score = 0;
    hydrantsSmashed = 0;
  }
  gameMode = 'freeroam';
  mode = 'playing';
  pipsWrapEl.classList.add('hidden');
  debriefEl.classList.remove('show');
  stageTagEl.textContent = '漫游';
  stageDescEl.textContent = '时代广场 · 中央公园 · 悬索桥飞跃';
  waypointsEl.innerHTML = '';

  overlayEl.classList.add('hidden');
  hudEl.classList.add('visible');
  document.getElementById('ct-touch').classList.add('active');
  canvas.focus();

  showBanner('自由漫游开放街区 · FREE ROAM NYC', '随心漂移 36 座摩天楼街区 · 撞爆消防栓 · 飞跃悬索大桥！', 3.2);
  showToast('已进入曼哈顿开放街区自由漫游模式');
}

function triggerVictory() {
  // Bank any active drift before scoring
  if (car.driftPoints >= 15) {
    score += Math.round(car.driftPoints) * Math.max(2, car.driftMult);
    car.driftPoints = 0;
  }
  mode = 'victory';
  hudEl.classList.remove('visible');
  overlayEl.classList.remove('hidden');
  waypointsEl.innerHTML = '';

  const rank = (score >= 5200 || rushTime < 92) ? 'S+' : (score >= 3600 || rushTime < 128) ? 'S' : 'A';
  kickerEl.textContent = 'MANHATTAN CROSSTOWN CHAMPION // 横穿曼哈顿全信标制霸';
  titleEl.textContent = '中城狂飙传奇 · CROSSTOWN KING';
  descEl.textContent =
    '从百老汇时代广场巨幕峡谷、中央公园镜湖林荫大道，一路腾空飞跃东河悬索大桥直抵第五大道终点！整座不夜城都在你的 V8 声浪中沸腾。';

  stTimeEl.textContent = formatTime(rushTime);
  stBeaconsEl.textContent = `${beaconsCleared} / ${city.beacons.length}`;
  stHydrantsEl.textContent = String(hydrantsSmashed);
  stScoreEl.textContent = String(score);
  stRankEl.textContent = rank;
  debriefEl.classList.add('show');

  btnRush.style.display = 'none';
  btnFreeRoam.style.display = 'none';
  btnContinueRoam.style.display = 'inline-flex';
  btnRestart.style.display = 'inline-flex';
  audio.playBeaconClear(5);
}

// --- NYC Dual-Tone Taxi Horn & AI Cab Call-and-Response! ---
function triggerPlayerHorn() {
  audio.init();
  audio.playHorn(1.0, 0.35, 0.18);

  let replies = 0;
  for (let i = 0; i < city.traffic.length; i++) {
    const v = city.traffic[i];
    if (v.isTruck) continue;
    const d = Math.hypot(v.x - car.x, v.z - car.z);
    if (d < 68 && replies < 3) {
      replies++;
      v.honkFlash = 1.3;
      const delayMs = 130 + replies * 145;
      const pitch = 0.88 + (v.id % 5) * 0.08;
      setTimeout(() => {
        if (mode === 'playing') audio.playHorn(pitch, 0.28, 0.12);
      }, delayMs);
    }
  }
  if (replies > 0 && mode === 'playing') {
    showToast(`纽约黄包车队鸣笛回应！（${replies} 辆计程车闪灯致意）`);
  }
}

// --- Input Listeners ---
window.addEventListener('keydown', (e) => {
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) {
    if (mode === 'playing') e.preventDefault();
  }
  keys.add(e.code);

  if (e.code === 'KeyH' && !e.repeat) {
    triggerPlayerHorn();
  }
  if (e.code === 'KeyC' && !e.repeat) {
    camPreset = (camPreset + 1) % 3;
    showToast(`摄影机位：${camNames[camPreset]}`);
  }
  if ((e.code === 'ShiftLeft' || e.code === 'ShiftRight') && !e.repeat && mode === 'playing') {
    if (car.nitro > 8) audio.playNitroSurge();
  }
  if ((e.code === 'KeyP' || e.code === 'Escape') && !e.repeat) {
    togglePause();
  }
});

window.addEventListener('keyup', (e) => {
  keys.delete(e.code);
});

canvas.addEventListener('mousedown', (e) => {
  if (mode !== 'playing') return;
  audio.init();
  if (e.button === 0) {
    mouseBoostHeld = true;
    if (car.nitro > 8) audio.playNitroSurge();
  }
});

window.addEventListener('mouseup', (e) => {
  if (e.button === 0) mouseBoostHeld = false;
});

canvas.addEventListener('contextmenu', (e) => e.preventDefault());

// Touch Controls
const tPad = document.getElementById('ct-t-pad');
const tKnob = document.getElementById('ct-t-knob');
const tbDrift = document.getElementById('ct-tb-drift');
const tbBoost = document.getElementById('ct-tb-boost');

if (tPad && tKnob) {
  const handlePad = (touch) => {
    const r = tPad.getBoundingClientRect();
    const dx = clamp((touch.clientX - (r.left + r.width / 2)) / (r.width * 0.45), -1, 1);
    const dy = clamp((touch.clientY - (r.top + r.height / 2)) / (r.height * 0.45), -1, 1);
    touchSteer = -dx;
    touchThrottle = -dy;
    tKnob.style.transform = `translate(${dx * 24}px, ${dy * 24}px)`;
  };
  tPad.addEventListener('touchstart', (e) => { e.preventDefault(); handlePad(e.touches[0]); }, { passive: false });
  tPad.addEventListener('touchmove', (e) => { e.preventDefault(); handlePad(e.touches[0]); }, { passive: false });
  tPad.addEventListener('touchend', () => {
    touchSteer = 0;
    touchThrottle = 0;
    tKnob.style.transform = 'translate(0,0)';
  });
}
if (tbDrift) {
  tbDrift.addEventListener('touchstart', (e) => { e.preventDefault(); touchDrift = true; }, { passive: false });
  tbDrift.addEventListener('touchend', () => { touchDrift = false; });
}
if (tbBoost) {
  tbBoost.addEventListener('touchstart', (e) => {
    e.preventDefault();
    touchBoost = true;
    if (car.nitro > 8) audio.playNitroSurge();
  }, { passive: false });
  tbBoost.addEventListener('touchend', () => { touchBoost = false; });
}

// --- UI Buttons & Settings ---
function togglePause() {
  if (mode === 'playing') {
    mode = 'paused';
    mouseBoostHeld = false;
    kickerEl.textContent = 'MIDTOWN PAUSE // 曼哈顿街区已暂停';
    titleEl.textContent = '曼哈顿街区狂飙 · CROSSTOWN NYC';
    descEl.textContent = '可在下方调节城市霓虹辉光、渲染画质，或打开纯代码纽约声学台试听 V8 换挡声浪与双音喇叭。';
    btnRush.textContent = '继续街头狂飙';
    btnRush.style.display = 'inline-flex';
    btnFreeRoam.style.display = gameMode === 'rush' ? 'inline-flex' : 'none';
    btnContinueRoam.style.display = 'none';
    btnRestart.style.display = 'inline-flex';
    debriefEl.classList.remove('show');
    overlayEl.classList.remove('hidden');
  } else if (mode === 'paused') {
    mode = 'playing';
    overlayEl.classList.add('hidden');
    canvas.focus();
  }
}

btnRush.addEventListener('click', () => {
  if (mode === 'paused') togglePause();
  else startRush();
});
btnFreeRoam.addEventListener('click', () => startFreeRoam(false));
btnContinueRoam.addEventListener('click', () => startFreeRoam(true));
btnRestart.addEventListener('click', () => startRush());

btnStudio.addEventListener('click', () => {
  audio.init();
  studioEl.classList.toggle('open');
});

document.querySelectorAll('.ct-sfx-trigger').forEach((btn) => {
  btn.addEventListener('click', () => {
    audio.init();
    const s = btn.dataset.s;
    if (s === 'rev') audio.playRevPreview();
    else if (s === 'horn') audio.playHorn(1.0, 0.36, 0.20);
    else if (s === 'drift') audio.playDriftPreview();
    else if (s === 'hydrant') audio.playHydrantBurst();
    else if (s === 'nitro') audio.playNitroSurge();
    else if (s === 'beacon') audio.playBeaconClear(3);
  });
});

document.querySelectorAll('.bloom-pill').forEach((btn) => {
  btn.addEventListener('click', () => {
    bloomPreset = Number(btn.dataset.b);
    document.querySelectorAll('.bloom-pill').forEach((b) => b.classList.toggle('active', b === btn));
    showToast(`霓虹辉光：${bloomNames[bloomPreset]}`);
  });
});

document.querySelectorAll('.q-pill').forEach((btn) => {
  btn.addEventListener('click', () => {
    quality = btn.dataset.q;
    document.querySelectorAll('.q-pill').forEach((b) => b.classList.toggle('active', b === btn));
    ensureFBO();
  });
});

const volInput = document.getElementById('ct-vol');
if (volInput) {
  volInput.addEventListener('input', () => {
    audio.setVolume(Number(volInput.value) / 100);
  });
}

document.getElementById('btn-horn').addEventListener('click', () => triggerPlayerHorn());
document.getElementById('btn-cam').addEventListener('click', () => {
  camPreset = (camPreset + 1) % 3;
  showToast(`摄影机位：${camNames[camPreset]}`);
});
document.getElementById('btn-pause').addEventListener('click', () => togglePause());
document.getElementById('btn-fs').addEventListener('click', () => {
  if (!document.fullscreenElement) {
    appEl.requestFullscreen?.().catch(() => {});
  } else {
    document.exitFullscreen?.().catch(() => {});
  }
});

function toggleTallView() {
  const isTall = appEl.classList.toggle('tall');
  const b1 = document.getElementById('btn-tall');
  const b2 = document.getElementById('menu-btn-tall');
  if (b1) b1.textContent = isTall ? '收起' : '大屏';
  if (b2) b2.textContent = isTall ? '恢复紧凑内嵌' : '展开大屏视野';
  ensureFBO();
}
document.getElementById('btn-tall')?.addEventListener('click', toggleTallView);
document.getElementById('menu-btn-tall')?.addEventListener('click', toggleTallView);

// --- Beacon Checkpoints, Smashables & Collision Logic ---
function checkBeaconClear() {
  if (mode !== 'playing' || gameMode !== 'rush') return false;
  const b = city.beacons[beaconsCleared];
  if (!b || b.cleared) return false;

  const dist = Math.hypot(car.x - b.x, car.z - b.z);
  if (dist <= 9.5) {
    b.cleared = true;
    if (pipEls[beaconsCleared]) pipEls[beaconsCleared].classList.add('done');
    beaconsCleared++;

    const mult = car.drifting ? Math.max(2, car.driftMult) : 1;
    const bonus = 500 * mult;
    score += bonus;
    car.nitro = clamp(car.nitro + 38, 0, 100);
    camShake = 0.45;
    spawnShockRing(b.x, b.y, b.z, 19.0, 0.75, [1.0, 0.78, 0.22]);
    emitSparks(b.x, b.y + 1.0, b.z, 22, 13.0);
    audio.playBeaconClear(beaconsCleared);

    if (beaconsCleared >= city.beacons.length) {
      triggerVictory();
    } else {
      const nextB = city.beacons[beaconsCleared];
      stageDescEl.textContent = `${nextB.name.split(' · ')[0]} [${beaconsCleared}/${city.beacons.length}]`;
      showBanner(`信标达成 +${bonus}`, `下一站：${nextB.name}`, 2.4);
      showToast(`通过 #${beaconsCleared} 信标！氮气已补充 +38%`);
    }
    return true;
  }
  return false;
}

function bankActiveDrift() {
  if (car.driftPoints >= 22) {
    const mult = Math.max(2, car.driftMult);
    const pts = Math.round(car.driftPoints) * mult;
    score += pts;
    audio.playDriftBank(mult);
    showToast(`完美甩尾入账 DRIFT ×${mult} · +${pts}`);
  }
  car.driftPoints = 0;
  car.driftDuration = 0;
  car.driftMult = 1;
}

function resolveBuildingCollisions() {
  const rad = 1.32;
  const aabbs = city.buildingAABBs;
  for (let i = 0; i < aabbs.length; i++) {
    const b = aabbs[i];
    if (car.x + rad < b.minX || car.x - rad > b.maxX || car.z + rad < b.minZ || car.z - rad > b.maxZ) {
      continue;
    }
    const cx = clamp(car.x, b.minX, b.maxX);
    const cz = clamp(car.z, b.minZ, b.maxZ);
    let dx = car.x - cx;
    let dz = car.z - cz;
    let dist = Math.hypot(dx, dz);

    if (dist < rad) {
      if (dist < 0.001) {
        // Inside box fallback: push out nearest edge
        const dL = Math.abs(car.x - b.minX);
        const dR = Math.abs(b.maxX - car.x);
        const dT = Math.abs(car.z - b.minZ);
        const dB = Math.abs(b.maxZ - car.z);
        const m = Math.min(dL, dR, dT, dB);
        if (m === dL) { dx = -1; dz = 0; }
        else if (m === dR) { dx = 1; dz = 0; }
        else if (m === dT) { dx = 0; dz = -1; }
        else { dx = 0; dz = 1; }
        dist = 0.01;
      }
      const nx = dx / dist;
      const nz = dz / dist;
      car.x = cx + nx * rad;
      car.z = cz + nz * rad;

      const mvX = -Math.sin(car.moveYaw) * car.speed;
      const mvZ = -Math.cos(car.moveYaw) * car.speed;
      const vn = mvX * nx + mvZ * nz;
      if (vn < -1.5) {
        if (Math.abs(vn) > 7.5) {
          emitSparks(cx, car.y + 0.5, cz, 14, 10.0);
          audio.playCollision(clamp(Math.abs(vn) / 26, 0.25, 0.9));
          camShake = Math.max(camShake, 0.38);
          car.driftPoints *= 0.5;
        }
        // Slide smoothly along skyscraper facade rather than getting stuck
        const slideX = (mvX - nx * vn * 1.18) * 0.86;
        const slideZ = (mvZ - nz * vn * 1.18) * 0.86;
        const newSpd = Math.hypot(slideX, slideZ);
        if (newSpd > 0.5) {
          car.speed = Math.sign(car.speed || 1) * newSpd;
          if (car.speed > 0) {
            car.moveYaw = Math.atan2(-slideX, -slideZ);
            car.yaw = lerp(car.yaw, car.moveYaw, 0.35);
          }
        } else {
          car.speed = 0;
        }
      }
    }
  }

  // Island Outer Waterfront Guardrails
  if (Math.abs(car.x) > DRIVE_LIMIT) {
    car.x = Math.sign(car.x) * DRIVE_LIMIT;
    car.speed *= 0.72;
  }
  if (Math.abs(car.z) > DRIVE_LIMIT) {
    car.z = Math.sign(car.z) * DRIVE_LIMIT;
    car.speed *= 0.72;
  }
}

function updateSmashablesAndGeysers(dt) {
  // 1. 28 Smashable NYC Fire Hydrants + 12m Sparkling Cyan-White Water Geysers!
  for (let i = 0; i < city.hydrants.length; i++) {
    const h = city.hydrants[i];
    if (!h.smashed) {
      if (mode === 'playing') {
        const d = Math.hypot(car.x - h.x, car.z - h.z);
        if (d < 2.15 && Math.abs(car.y - h.baseY) < 1.8) {
          h.smashed = true;
          h.geyserTimer = 14.0;
          h.respawnTimer = 22.0;
          h.capX = h.x;
          h.capY = h.baseY + 0.7;
          h.capZ = h.z;
          h.capVx = -Math.sin(car.moveYaw) * Math.max(6, car.speed * 0.5) + (Math.random() - 0.5) * 4;
          h.capVy = 12.5 + Math.random() * 4.5;
          h.capVz = -Math.cos(car.moveYaw) * Math.max(6, car.speed * 0.5) + (Math.random() - 0.5) * 4;

          hydrantsSmashed++;
          const mult = car.drifting ? Math.max(2, car.driftMult) : 1;
          const pts = 100 * mult;
          score += pts;
          car.nitro = clamp(car.nitro + 14, 0, 100);
          camShake = Math.max(camShake, 0.32);

          audio.playHydrantBurst();
          spawnShockRing(h.x, h.baseY, h.z, 7.5, 0.5, [0.32, 0.88, 1.0]);
          showToast(`撞飞纽约消防栓！12米高压水柱 +${pts}`);
        }
      }
    } else {
      if (h.geyserTimer > 0) {
        h.geyserTimer -= dt;
        h.capVy -= 20.0 * dt;
        h.capX += h.capVx * dt;
        h.capY = Math.max(h.baseY + 0.2, h.capY + h.capVy * dt);
        h.capZ += h.capVz * dt;
        h.capRot += 9.0 * dt;

        // Continuous 12m High Sparkling Cyan-White Water Geyser Particle Fountain!
        // vy ~ 16.8 m/s with grav = 11.8 m/s^2 reaches peak height vy^2 / (2*g) = 282 / 23.6 = 11.96m!
        const emitCount = quality === 'low' ? 1 : 2;
        for (let k = 0; k < emitCount; k++) {
          const ang = Math.random() * Math.PI * 2;
          const spread = 0.5 + Math.random() * 1.45;
          const bright = 0.72 + Math.random() * 0.28;
          spawnParticle(
            h.x + (Math.random() - 0.5) * 0.24,
            h.baseY + 0.35,
            h.z + (Math.random() - 0.5) * 0.24,
            Math.cos(ang) * spread,
            15.2 + Math.random() * 2.4,
            Math.sin(ang) * spread,
            0.55 + Math.random() * 0.45,
            1.45,
            1.35 + Math.random() * 0.35,
            0.42 * bright,
            0.88 * bright,
            1.0,
            0.82,
            1,
            11.8
          );
        }
      }
      h.respawnTimer -= dt;
      if (h.respawnTimer <= 0 && Math.hypot(car.x - h.x, car.z - h.z) > 16) {
        h.smashed = false;
      }
    }
  }

  // 2. 24 Smashable Street Cones
  for (let i = 0; i < city.cones.length; i++) {
    const c = city.cones[i];
    if (!c.smashed) {
      if (mode === 'playing') {
        const d = Math.hypot(car.x - c.x, car.z - c.z);
        if (d < 1.85 && Math.abs(car.y - c.y) < 1.5) {
          c.smashed = true;
          c.timer = 12.0;
          c.vx = -Math.sin(car.moveYaw) * Math.max(9, car.speed * 0.8) + (Math.random() - 0.5) * 6;
          c.vy = 7.5 + Math.random() * 4.5;
          c.vz = -Math.cos(car.moveYaw) * Math.max(9, car.speed * 0.8) + (Math.random() - 0.5) * 6;
          score += 25;
          audio.playCollision(0.22);
        }
      }
    } else {
      c.vy -= 19.0 * dt;
      c.x += c.vx * dt;
      c.y += c.vy * dt;
      c.z += c.vz * dt;
      c.rx += 8.5 * dt;
      c.rz += 6.2 * dt;
      const gy = getGroundHeight(c.x, c.z);
      if (c.y < gy) {
        c.y = gy;
        c.vy = Math.abs(c.vy) * 0.35;
        c.vx *= 0.65;
        c.vz *= 0.65;
      }
      c.timer -= dt;
      if (c.timer <= 0) {
        c.smashed = false;
        c.x = c.homeX;
        c.y = c.homeY;
        c.z = c.homeZ;
        c.rx = 0;
        c.rz = 0;
      }
    }
  }
}

function updateTraffic(dt) {
  const fleet = city.traffic;
  for (let i = 0; i < fleet.length; i++) {
    const v = fleet[i];
    if (v.honkFlash > 0) v.honkFlash = Math.max(0, v.honkFlash - dt);
    if (v.hitCooldown > 0) v.hitCooldown = Math.max(0, v.hitCooldown - dt);

    const fwdX = v.onAve ? 0 : v.dir;
    const fwdZ = v.onAve ? v.dir : 0;

    v.x += (fwdX * v.speed + v.vx) * dt;
    v.z += (fwdZ * v.speed + v.vz) * dt;
    v.vx = damp(v.vx, 0, 4.5, dt);
    v.vz = damp(v.vz, 0, 4.5, dt);
    v.speed = damp(v.speed, v.baseSpeed, 2.0, dt);

    // Gently steer back onto assigned Manhattan lane after bumps
    if (v.onAve) {
      v.x = damp(v.x, v.roadCoord + v.laneOffset, 2.2, dt);
      if (v.z > 192) v.z = -192;
      if (v.z < -192) v.z = 192;
    } else {
      v.z = damp(v.z, v.roadCoord - v.laneOffset, 2.2, dt);
      if (v.x > 192) v.x = -192;
      if (v.x < -192) v.x = 192;
    }
    v.y = getGroundHeight(v.x, v.z);

    // Player Car vs NYC Traffic Collision
    if (mode === 'playing') {
      const dx = car.x - v.x;
      const dz = car.z - v.z;
      const minSep = v.isTruck ? 3.15 : 2.75;
      const dist = Math.hypot(dx, dz);
      if (dist < minSep && Math.abs(car.y - v.y) < 2.2) {
        const nx = dist > 0.01 ? dx / dist : 1;
        const nz = dist > 0.01 ? dz / dist : 0;
        const overlap = minSep - dist;
        car.x += nx * overlap * 0.68;
        car.z += nz * overlap * 0.68;
        v.x -= nx * overlap * 0.32;
        v.z -= nz * overlap * 0.32;

        const impactSpd = Math.max(8, Math.abs(car.speed));
        v.vx -= nx * impactSpd * 0.65;
        v.vz -= nz * impactSpd * 0.65;

        if (v.hitCooldown <= 0) {
          v.hitCooldown = 0.55;
          v.honkFlash = 1.1;
          emitSparks((car.x + v.x) * 0.5, car.y + 0.6, (car.z + v.z) * 0.5, 18, 12.0);
          audio.playCollision(0.75);
          if (!v.isTruck) audio.playHorn(1.12, 0.24, 0.12);
          camShake = Math.max(camShake, 0.55);

          if (car.boosting) {
            score += 80;
            showToast('氮气冲撞！撞开街区车流 +80');
            car.speed *= 0.90;
          } else {
            car.speed *= 0.68;
          }
        }
      }
    }
  }
}

// --- Arcade Drift & Nitro Car Physics ---
function updateCarPhysics(dt, t) {
  if (mode !== 'playing') {
    // Title / Debrief Showcase: Subtle idle V8 vibration & cinematic Times Square orbit camera
    const orbitAng = t * 0.26;
    camPos[0] = car.x + Math.sin(orbitAng) * 10.5;
    camPos[1] = car.y + 3.8 + Math.sin(t * 0.5) * 0.6;
    camPos[2] = car.z + Math.cos(orbitAng) * 10.5;
    camLook[0] = car.x - 1.5;
    camLook[1] = car.y + 2.4;
    camLook[2] = car.z - 14.0;
    audio.update(dt, 0, 0, 0, false, false);
    return;
  }

  if (gameMode === 'rush') rushTime += dt;

  const up = keys.has('KeyW') || keys.has('ArrowUp') || touchThrottle > 0.2;
  const down = keys.has('KeyS') || keys.has('ArrowDown') || touchThrottle < -0.2;
  const left = keys.has('KeyA') || keys.has('ArrowLeft');
  const right = keys.has('KeyD') || keys.has('ArrowRight');
  const steerInput = clamp((left ? 1 : 0) - (right ? 1 : 0) + touchSteer, -1, 1);

  const handbrake = keys.has('Space') || touchDrift;
  const boostReq = keys.has('ShiftLeft') || keys.has('ShiftRight') || mouseBoostHeld || touchBoost || car.forcedBoostTimer > 0;

  if (car.forcedBoostTimer > 0) {
    car.forcedBoostTimer = Math.max(0, car.forcedBoostTimer - dt);
  }

  // Nitro Boost Reserve & 195 KM/H (54.2 m/s) Top Speed Surge!
  if (boostReq && (car.nitro > 1.5 || car.forcedBoostTimer > 0)) {
    car.boosting = true;
    if (car.forcedBoostTimer <= 0) {
      car.nitro = Math.max(0, car.nitro - 24.0 * dt);
    }
  } else {
    car.boosting = false;
    car.nitro = Math.min(100, car.nitro + 7.5 * dt);
  }

  const maxFwdSpeed = car.boosting ? 54.2 : 38.4; // 54.2 m/s * 3.6 = 195.1 KM/H!
  let throttle = 0;
  car.braking = false;

  if (car.boosting && !down) {
    throttle = 1.0;
    car.speed = damp(car.speed, maxFwdSpeed, 3.4, dt);
  } else if (up) {
    throttle = 1.0;
    const accel = car.speed < 0 ? 44.0 : 28.5;
    car.speed = Math.min(maxFwdSpeed, car.speed + accel * dt);
  } else if (down) {
    if (car.speed > 1.8) {
      car.braking = true;
      car.speed = Math.max(0, car.speed - 46.0 * dt);
    } else {
      throttle = -0.6;
      car.speed = Math.max(-13.8, car.speed - 20.0 * dt);
    }
  } else {
    // Natural rolling coast drag
    car.speed = damp(car.speed, 0, 1.15, dt);
  }

  // Responsive Arcade Steering + Handbrake Drift Slip-Angle Physics!
  const speedAbs = Math.abs(car.speed);
  const steerAuthority = clamp(speedAbs / 7.5, 0, 1) * (car.speed < -0.5 ? -1 : 1);
  const turnRate = handbrake ? 2.85 : 2.15;

  car.yaw = wrapAngle(car.yaw + steerInput * turnRate * steerAuthority * dt);
  car.steerVisual = damp(car.steerVisual, steerInput * 0.44, 14, dt);

  if (handbrake && speedAbs > 8.5 && !car.airborne) {
    // Kick out rear tail smoothly while preserving brisk cornering speed!
    car.moveYaw = wrapAngle(car.moveYaw + wrapAngle(car.yaw - car.moveYaw) * Math.min(1, 3.1 * dt));
    const maxSlip = 0.78;
    const diff = wrapAngle(car.yaw - car.moveYaw);
    if (Math.abs(diff) > maxSlip) {
      car.moveYaw = wrapAngle(car.yaw - Math.sign(diff) * maxSlip);
    }
    car.speed *= (1.0 - 0.16 * dt);
  } else {
    // Crisp high-grip re-alignment when releasing Space
    car.moveYaw = wrapAngle(car.moveYaw + wrapAngle(car.yaw - car.moveYaw) * Math.min(1, 11.5 * dt));
  }

  const slipAngle = Math.abs(wrapAngle(car.yaw - car.moveYaw));
  const isDriftingNow = !car.airborne && speedAbs > 9.0 && (slipAngle > 0.14 || (handbrake && Math.abs(steerInput) > 0.25));

  if (isDriftingNow) {
    car.drifting = true;
    car.driftDuration += dt;
    car.driftMult = car.driftDuration > 4.0 ? 5 : car.driftDuration > 2.4 ? 4 : car.driftDuration > 1.0 ? 3 : 2;
    car.driftPoints += (speedAbs * (0.4 + slipAngle * 2.2)) * 2.8 * dt;
    car.nitro = Math.min(100, car.nitro + 12.0 * dt);

    // Emit GPU-Instanced Billowing Tire Smoke & Hot Rim Sparks from Rear Wheels!
    const sinY = Math.sin(car.yaw), cosY = Math.cos(car.yaw);
    for (const side of [-0.92, 0.92]) {
      const wx = car.x + cosY * side + sinY * 1.35;
      const wz = car.z - sinY * side + cosY * 1.35;
      if (Math.random() < (quality === 'low' ? 0.45 : 0.85)) {
        spawnParticle(
          wx,
          car.y + 0.22,
          wz,
          (Math.random() - 0.5) * 2.2,
          0.9 + Math.random() * 1.4,
          (Math.random() - 0.5) * 2.2,
          0.75 + Math.random() * 0.45,
          2.6,
          0.48 + Math.random() * 0.28,
          0.86, 0.88, 0.92,
          0.42,
          0,
          -1.2
        );
      }
      if (car.driftMult >= 3 && Math.random() < 0.45) {
        spawnParticle(
          wx,
          car.y + 0.16,
          wz,
          sinY * 5 + (Math.random() - 0.5) * 4,
          2.2 + Math.random() * 3.5,
          cosY * 5 + (Math.random() - 0.5) * 4,
          0.34,
          0.0,
          0.22 + Math.random() * 0.18,
          1.0, 0.72, 0.18,
          0.95,
          2,
          15.0
        );
      }
    }
  } else {
    if (car.drifting) {
      car.drifting = false;
      bankActiveDrift();
    } else if (car.driftPoints > 0) {
      bankActiveDrift();
    }
  }

  // Advance Horizontal Position along moveYaw
  const velX = -Math.sin(car.moveYaw) * car.speed;
  const velZ = -Math.cos(car.moveYaw) * car.speed;
  car.x += velX * dt;
  car.z += velZ * dt;
  car.wheelSpin += (car.speed / 0.37) * dt;

  // Dynamic Chassis Body-Roll & Pitch Squat
  const targetRoll = clamp(steerInput * (speedAbs / 32) * (car.drifting ? 0.15 : 0.09), -0.18, 0.18);
  car.roll = damp(car.roll, targetRoll, 11, dt);

  // Vertical Elevation: Stunt Ramps, Suspension Bridge Arch & Parabolic Jumps!
  const groundY = getGroundHeight(car.x, car.z);
  const fwdX = -Math.sin(car.moveYaw);
  const fwdZ = -Math.cos(car.moveYaw);
  const roadSlope = getForwardSlope(car.x, car.z, fwdX, fwdZ);

  if (!car.airborne) {
    const prevY = car.y;
    if (prevY - groundY > 0.36 && car.vy > 1.8) {
      // Launched off Stunt Jump Ramp or Bridge Crest!
      car.airborne = true;
      car.airTime = 0;
    } else {
      car.y = groundY;
      car.vy = Math.max(0, car.speed) * roadSlope;
      const squat = car.braking ? -0.045 : throttle > 0 ? 0.025 : 0;
      car.pitch = damp(car.pitch, Math.atan(roadSlope) + squat, 12, dt);
    }
  }

  if (car.airborne) {
    car.airTime += dt;
    car.vy -= 20.5 * dt;
    car.y += car.vy * dt;
    car.pitch = damp(car.pitch, clamp(car.vy * 0.020, -0.26, 0.30), 6, dt);

    if (car.y <= groundY) {
      car.y = groundY;
      car.airborne = false;
      if (car.airTime > 0.45) {
        const airPts = Math.round(car.airTime * 220);
        score += airPts;
        camShake = Math.max(camShake, 0.48);
        emitSparks(car.x, car.y + 0.25, car.z, 18, 11.0);
        audio.playCollision(0.45);
        showToast(`腾空飞跃着陆 AIR TIME ${car.airTime.toFixed(1)}s · +${airPts}`);
      }
      car.vy = 0;
      car.airTime = 0;
    }
  }

  resolveBuildingCollisions();
  checkBeaconClear();

  // Update 3 Camera Modes (Chase / Hood / Heli)
  const desiredCamYaw = lerp(car.moveYaw, car.yaw, 0.42);
  camYaw = wrapAngle(camYaw + wrapAngle(desiredCamYaw - camYaw) * Math.min(1, 7.5 * dt));

  if (camPreset === 0) {
    // Low-Slung Dynamic Drift Chase Camera
    const backDist = car.boosting ? 6.2 : 6.9;
    const tx = car.x + Math.sin(camYaw) * backDist;
    const ty = car.y + 2.35 + (car.airborne ? 0.6 : 0);
    const tz = car.z + Math.cos(camYaw) * backDist;
    camPos[0] = damp(camPos[0], tx, 14, dt);
    camPos[1] = damp(camPos[1], ty, 12, dt);
    camPos[2] = damp(camPos[2], tz, 14, dt);

    camLook[0] = damp(camLook[0], car.x - Math.sin(car.yaw) * 4.5, 18, dt);
    camLook[1] = damp(camLook[1], car.y + 1.15, 16, dt);
    camLook[2] = damp(camLook[2], car.z - Math.cos(car.yaw) * 4.5, 18, dt);
  } else if (camPreset === 1) {
    // Hood-Scoop First-Person POV
    const sinC = Math.sin(car.yaw), cosC = Math.cos(car.yaw);
    camPos[0] = car.x - sinC * 0.45;
    camPos[1] = car.y + 1.28;
    camPos[2] = car.z - cosC * 0.45;
    camLook[0] = car.x - sinC * 18.0;
    camLook[1] = car.y + 1.32 + Math.sin(car.pitch) * 12.0;
    camLook[2] = car.z - cosC * 18.0;
  } else {
    // NYPD / News Helicopter Aerial Chase Camera
    const tx = car.x + Math.sin(camYaw) * 18.0;
    const ty = car.y + 15.5;
    const tz = car.z + Math.cos(camYaw) * 18.0;
    camPos[0] = damp(camPos[0], tx, 8, dt);
    camPos[1] = damp(camPos[1], ty, 8, dt);
    camPos[2] = damp(camPos[2], tz, 8, dt);
    camLook[0] = damp(camLook[0], car.x - Math.sin(car.yaw) * 6.0, 12, dt);
    camLook[1] = damp(camLook[1], car.y + 1.0, 12, dt);
    camLook[2] = damp(camLook[2], car.z - Math.cos(car.yaw) * 6.0, 12, dt);
  }

  const speedKmh = Math.abs(car.speed) * 3.6;
  const driftAudioAmt = car.drifting ? clamp(0.45 + slipAngle * 1.1, 0, 1) : 0;
  audio.update(dt, speedKmh, throttle, driftAudioAmt, car.boosting, true);
}

function updateEffects(dt) {
  if (camShake > 0) camShake = Math.max(0, camShake - dt * 1.9);
  if (bannerTimer > 0) {
    bannerTimer -= dt;
    if (bannerTimer <= 0) bannerEl.classList.remove('show');
  }

  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.life -= dt;
    if (p.life <= 0) {
      particles[i] = particles[particles.length - 1];
      particles.pop();
      continue;
    }
    p.vy -= p.grav * dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.z += p.vz * dt;
    p.size += p.grow * dt;
    p.rot += p.vrot * dt;
    if (p.kind === 1 && p.y < 0.12 && p.vy < 0) {
      p.y = 0.12;
      p.vy = Math.abs(p.vy) * 0.25;
      p.vx *= 1.3;
      p.vz *= 1.3;
    }
  }

  for (let i = shockRings.length - 1; i >= 0; i--) {
    const sr = shockRings[i];
    sr.t += dt;
    if (sr.t >= sr.dur) {
      shockRings.splice(i, 1);
      continue;
    }
    sr.r = lerp(1.2, sr.maxRadius, sr.t / sr.dur);
  }
}

// --- HUD & 3D Screen-Space Waypoints ---
function updateWaypointsAndHUD(matVP) {
  if (mode !== 'playing') return;

  const speedKmh = Math.round(Math.abs(car.speed) * 3.6);
  speedValEl.textContent = String(speedKmh);
  gearValEl.textContent = car.speed < -0.8 ? 'KM/H · R' : `KM/H · D${audio.currentGear}`;
  nitroFillEl.style.width = `${clamp(car.nitro, 0, 100).toFixed(0)}%`;
  const driftPct = car.drifting ? clamp((car.driftDuration / 4.2) * 100, 12, 100) : 0;
  driftFillEl.style.width = `${driftPct.toFixed(0)}%`;
  scoreValEl.textContent = String(score);

  if (car.drifting) {
    stateValEl.textContent = `DRIFT ×${car.driftMult} · +${Math.round(car.driftPoints)}`;
    stateValEl.classList.add('hot');
  } else if (car.boosting) {
    stateValEl.textContent = 'NITRO 涡轮极速推进';
    stateValEl.classList.add('hot');
  } else if (car.airborne) {
    stateValEl.textContent = 'AIR 腾空飞跃曼哈顿';
    stateValEl.classList.add('hot');
  } else {
    stateValEl.textContent = gameMode === 'rush' ? '横穿计时冲刺中' : '开放街区自由巡航';
    stateValEl.classList.remove('hot');
  }

  // Compass Heading + District + Rush Timer
  const deg = Math.round(((( -car.yaw * 180) / Math.PI) % 360 + 360) % 360);
  const dirs = ['北', '东北', '东', '东南', '南', '西南', '西', '西北'];
  const dirLbl = dirs[Math.round(deg / 45) % 8];
  const distLbl = getDistrictLabel(car.x, car.z).split(' · ')[0];
  compassEl.textContent = gameMode === 'rush'
    ? `${dirLbl} ${String(deg).padStart(3, '0')}° · ${distLbl} · ${formatTime(rushTime)}`
    : `${dirLbl} ${String(deg).padStart(3, '0')}° · ${distLbl} · 消防栓 ${hydrantsSmashed}`;

  // 3D Screen-Space Waypoint for Active Crosstown Beacon
  if (gameMode === 'rush' && beaconsCleared < city.beacons.length) {
    const b = city.beacons[beaconsCleared];
    const cssW = appEl.clientWidth || 800;
    const cssH = appEl.clientHeight || 446;
    const pt = M4.projectToScreen(matVP, b.x, b.y + 5.2, b.z, cssW, cssH);
    const distM = Math.round(Math.hypot(b.x - car.x, b.z - car.z));
    const shortName = b.name.split(' · ')[0];

    let wpEl = waypointsEl.firstElementChild;
    if (!wpEl) {
      wpEl = document.createElement('div');
      wpEl.className = 'ct-wp';
      wpEl.innerHTML = '<div class="ct-wp-diamond"></div><span class="ct-wp-lbl"></span>';
      waypointsEl.appendChild(wpEl);
    }
    wpEl.style.left = `${pt.x.toFixed(1)}px`;
    wpEl.style.top = `${pt.y.toFixed(1)}px`;
    wpEl.querySelector('.ct-wp-lbl').textContent = `${shortName} · ${distM}m`;
  } else if (waypointsEl.firstChild) {
    waypointsEl.innerHTML = '';
  }
}

// --- WebGL2 Scene Renderer ---
const matProj = M4.create();
const matView = M4.create();
const matVP = M4.create();
const matIdentity = M4.create();
const matTemp = M4.create();
const translucentQueue = [];

function renderScene(t) {
  ensureFBO();
  const aspect = fboW / Math.max(1, fboH);
  const fov = car.boosting ? 1.08 : car.airborne ? 1.04 : 0.96;
  M4.perspective(matProj, fov, aspect, 0.5, 850.0);

  const sx = (Math.random() - 0.5) * camShake * 0.65;
  const sy = (Math.random() - 0.5) * camShake * 0.65;
  const eyeX = camPos[0] + sx;
  const eyeY = camPos[1] + sy;
  const eyeZ = camPos[2];
  M4.lookAt(matView, eyeX, eyeY, eyeZ, camLook[0], camLook[1], camLook[2], 0, 1, 0);
  M4.mul(matVP, matProj, matView);

  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
  gl.viewport(0, 0, fboW, fboH);
  gl.clearColor(0.06, 0.10, 0.16, 1.0);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

  // 1. Manhattan Golden-Hour Dusk Skybox
  gl.disable(gl.DEPTH_TEST);
  gl.depthMask(false);
  gl.disable(gl.CULL_FACE);
  gl.useProgram(progSky.prog);
  gl.uniformMatrix4fv(progSky.u.uProj, false, matProj);
  gl.uniformMatrix4fv(progSky.u.uView, false, matView);
  gl.uniform3f(progSky.u.uCamPos, eyeX, eyeY, eyeZ);
  gl.uniform1f(progSky.u.uTime, t);
  gl.bindVertexArray(meshes.sphere.vao);
  gl.drawElements(gl.TRIANGLES, meshes.sphere.count, meshes.sphere.indexType, 0);

  // 2. Opaque Manhattan Skyline, Wet Asphalt Grid, Bridges, Traffic & Muscle Coupe
  gl.enable(gl.DEPTH_TEST);
  gl.depthMask(true);
  gl.disable(gl.BLEND);
  gl.useProgram(progWorld.prog);
  gl.uniformMatrix4fv(progWorld.u.uProj, false, matProj);
  gl.uniformMatrix4fv(progWorld.u.uView, false, matView);
  gl.uniform3f(progWorld.u.uCamPos, eyeX, eyeY, eyeZ);
  gl.uniform1f(progWorld.u.uTime, t);

  const hlDirX = -Math.sin(car.yaw);
  const hlDirZ = -Math.cos(car.yaw);
  gl.uniform3f(progWorld.u.uHeadlightPos, car.x + hlDirX * 1.9, car.y + 0.68, car.z + hlDirZ * 1.9);
  gl.uniform3f(progWorld.u.uHeadlightDir, hlDirX, -0.08, hlDirZ);

  // Draw all 7 Batched Static City Material Meshes in 7 ultra-fast draw calls!
  gl.uniformMatrix4fv(progWorld.u.uModel, false, matIdentity);
  for (let i = 0; i < city.staticBatches.length; i++) {
    const b = city.staticBatches[i];
    gl.uniform1i(progWorld.u.uMat, b.mat);
    gl.uniform3f(progWorld.u.uColor, b.color[0], b.color[1], b.color[2]);
    gl.uniform3f(progWorld.u.uParams, b.params[0], b.params[1], b.params[2]);
    gl.bindVertexArray(b.mesh.vao);
    gl.drawElements(gl.TRIANGLES, b.mesh.count, b.mesh.indexType, 0);
  }

  translucentQueue.length = 0;
  const drawWorldMesh = (mesh, modelMat, matId, col, p0 = 0.6, p1 = 1.0, alpha = 1.0) => {
    if (alpha < 0.99) {
      const copy = M4.create();
      copy.set(modelMat);
      translucentQueue.push({ mesh, modelMat: copy, matId, col, p0, p1, alpha });
      return;
    }
    gl.uniformMatrix4fv(progWorld.u.uModel, false, modelMat);
    gl.uniform1i(progWorld.u.uMat, matId);
    gl.uniform3f(progWorld.u.uColor, col[0], col[1], col[2]);
    gl.uniform3f(progWorld.u.uParams, p0, p1, 1.0);
    gl.bindVertexArray(mesh.vao);
    gl.drawElements(gl.TRIANGLES, mesh.count, mesh.indexType, 0);
  };

  // Player Muscle Coupe (hide roof/body only in Hood POV if too close, actually keep hood visible or draw normally!)
  if (camPreset !== 1 || mode !== 'playing') {
    drawPlayerCoupe(drawWorldMesh, meshes, car, t);
  } else {
    // In Hood POV, draw front hood nose slightly below camera for awesome immersion!
    drawPlayerCoupe(drawWorldMesh, meshes, car, t);
  }

  // 18 Moving NYC Yellow Cabs & Box Trucks
  drawTrafficVehicles(drawWorldMesh, meshes, city.traffic);

  // 28 Smashable Fire Hydrants & 24 Street Cones
  drawSmashables(drawWorldMesh, meshes, city.hydrants, city.cones);

  // 8 Golden Crosstown Rush Beacons
  if (mode === 'playing' && gameMode === 'rush') {
    drawCrosstownBeacons(drawWorldMesh, meshes, city.beacons, beaconsCleared, t);
  }

  // Expanding Ground Shockwave Rings
  for (const sr of shockRings) {
    const a = 1.0 - sr.t / sr.dur;
    M4.trs(matTemp, sr.x, sr.y, sr.z, 0, 0, 0, sr.r * 2.0, 1.0, sr.r * 2.0);
    drawWorldMesh(meshes.ring, matTemp, 6, sr.col, 2.3, 1.0, a * 0.85);
  }

  // 3. Additive Translucent Beacon Pillars & Shockwave Rings
  if (translucentQueue.length > 0) {
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
    gl.depthMask(false);
    for (const item of translucentQueue) {
      gl.uniformMatrix4fv(progWorld.u.uModel, false, item.modelMat);
      gl.uniform1i(progWorld.u.uMat, item.matId);
      gl.uniform3f(progWorld.u.uColor, item.col[0], item.col[1], item.col[2]);
      gl.uniform3f(progWorld.u.uParams, item.p0, item.p1, item.alpha);
      gl.bindVertexArray(item.mesh.vao);
      gl.drawElements(gl.TRIANGLES, item.mesh.count, item.mesh.indexType, 0);
    }
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  }

  // 4. GPU-Instanced Particles (Drift Tire Smoke, 12m Hydrant Water Geysers & Sparks)
  if (particles.length > 0) {
    const d = particleSys.data;
    const count = Math.min(particles.length, particleSys.maxParticles);
    for (let i = 0; i < count; i++) {
      const p = particles[i];
      const fade = clamp(p.life / p.maxLife, 0, 1);
      const o = i * 12;
      d[o] = p.x;
      d[o + 1] = p.y;
      d[o + 2] = p.z;
      d[o + 3] = p.size;
      d[o + 4] = p.rot;
      d[o + 5] = p.kind === 2 ? 1.8 : p.kind === 1 ? 1.3 : 1.0;
      d[o + 6] = 0;
      d[o + 7] = p.kind;
      d[o + 8] = p.r;
      d[o + 9] = p.g;
      d[o + 10] = p.b;
      d[o + 11] = p.a * fade;
    }
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.depthMask(false);
    gl.useProgram(progInst.prog);
    gl.uniformMatrix4fv(progInst.u.uProj, false, matProj);
    gl.uniformMatrix4fv(progInst.u.uView, false, matView);
    gl.bindVertexArray(particleSys.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, particleSys.instVBO);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, d.subarray(0, count * 12));
    gl.drawElementsInstanced(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0, count);
  }

  // 5. Fullscreen Post-Process (Anamorphic City Bloom + Radial Nitro Speed-Streaks + ACES)
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.viewport(0, 0, canvas.width, canvas.height);
  gl.disable(gl.DEPTH_TEST);
  gl.disable(gl.BLEND);
  gl.depthMask(true);

  const speedNorm = clamp((Math.abs(car.speed) * 3.6 - 115) / 80, 0, 1);
  const nitroBlur = clamp((car.boosting ? 0.85 : 0) + speedNorm * 0.45 + (car.airborne ? 0.35 : 0), 0, 1.0);

  gl.useProgram(progPost.prog);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, fboTex);
  gl.uniform1i(progPost.u.uTex, 0);
  gl.uniform2f(progPost.u.uRes, fboW, fboH);
  gl.uniform1f(progPost.u.uTime, t);
  gl.uniform1f(progPost.u.uNitroBlur, nitroBlur);
  gl.uniform1f(progPost.u.uBloomAmt, bloomValues[bloomPreset]);
  gl.bindVertexArray(postVAO);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
  gl.bindVertexArray(null);

  updateWaypointsAndHUD(matVP);
}

// --- Acoustic Oscilloscope in Studio (#ct-scope) ---
const scopeBuf = new Uint8Array(256);
function renderStudioScope() {
  if (!scopeCtx || !studioEl.classList.contains('open')) return;
  const w = scopeCvs.width;
  const h = scopeCvs.height;
  scopeCtx.fillStyle = '#070a0f';
  scopeCtx.fillRect(0, 0, w, h);
  if (!audio.analyser) return;
  audio.analyser.getByteTimeDomainData(scopeBuf);
  scopeCtx.strokeStyle = '#f5b82e';
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

// --- Main Animation Loop & FPS Telemetry ---
let lastTime = performance.now();
let fpsFrames = 0;
let fpsAccum = 0;
let currentFps = 60;

resetCarAtMidtown();

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, Math.max(0.001, (now - lastTime) * 0.001));
  lastTime = now;

  // Skip heavy WebGL draws cleanly when scrolled out of viewport
  if (!isIntersecting) {
    audio.update(dt, 0, 0, 0, false, false);
    return;
  }

  const t = now * 0.001;
  fpsFrames++;
  fpsAccum += dt;
  if (fpsAccum >= 0.5) {
    currentFps = Math.round(fpsFrames / fpsAccum);
    fpsFrames = 0;
    fpsAccum = 0;
    perfEl.textContent = `${currentFps} FPS · ${bloomNames[bloomPreset]}`;
  }

  if (mode !== 'paused') {
    updateTraffic(dt);
    updateSmashablesAndGeysers(dt);
    updateCarPhysics(dt, t);
    updateEffects(dt);
  } else {
    audio.update(dt, 0, 0, 0, false, false);
  }

  renderScene(t);
  renderStudioScope();
}
requestAnimationFrame(frame);

// --- Automated Verification & Diagnostic Hook ---
window.__CROSSTOWN__ = {
  getState() {
    return {
      mode,
      fps: currentFps,
      glErr: gl.getError(),
      score,
      beaconsCleared,
      beaconsTotal: city.beacons.length,
      speedKmh: Math.round(Math.abs(car.speed) * 3.6),
      car: {
        x: Number(car.x.toFixed(2)),
        y: Number(car.y.toFixed(2)),
        z: Number(car.z.toFixed(2)),
      },
    };
  },
  startRush() {
    startRush();
    return true;
  },
  startFreeRoam() {
    startFreeRoam(false);
    return true;
  },
  triggerBoost(durSec = 1.6) {
    if (mode !== 'playing') startFreeRoam(false);
    car.nitro = 100;
    car.forcedBoostTimer = durSec;
    car.boosting = true;
    car.speed = Math.max(car.speed, 48.0);
    audio.playNitroSurge();
    return true;
  },
  teleportToBeacon(idx = beaconsCleared) {
    if (mode !== 'playing' || gameMode !== 'rush') {
      startRush();
    }
    const targetIdx = clamp(Number(idx) || 0, 0, city.beacons.length - 1);
    const b = city.beacons[targetIdx];
    if (!b) return false;
    car.x = b.x;
    car.z = b.z;
    car.y = getGroundHeight(b.x, b.z);
    car.vy = 0;
    car.airborne = false;
    return checkBeaconClear();
  },
};
