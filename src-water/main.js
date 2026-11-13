import {
  M4,
  REALMS,
  TOTAL_VOYAGE_LEN,
  clamp,
  lerp,
  damp,
  wrapAngle,
  riverCenterX,
  riverTangentYaw,
  waterWaveHeight,
  getRealmIndex,
  createAtmosphereState,
  sampleRealmAtmosphere,
} from './math.js';
import {
  WATER_SKY_VS,
  WATER_SKY_FS,
  WATER_SURF_VS,
  WATER_SURF_FS,
  WATER_WORLD_VS,
  WATER_WORLD_FS,
  WATER_INST_VS,
  WATER_INST_FS,
  WATER_POST_VS,
  WATER_POST_FS,
} from './shaders.js';
import {
  createWaterPrimitives,
  createWaterParticleSystem,
  buildDreamWaterWorld,
  drawWoodenSkiffAndTraveler,
  drawDynamicWaterWorld,
} from './world.js';
import { ImpressionistWaterAudio } from './audio.js';

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
const appEl = document.getElementById('water-app');
const canvas = document.getElementById('wk-canvas');
const hudEl = document.getElementById('wk-hud');
const overlayEl = document.getElementById('wk-overlay');
const perfEl = document.getElementById('wk-perf');
const realmTagEl = document.getElementById('wk-realm-tag');
const memDescEl = document.getElementById('wk-mem-desc');
const realmPillEls = Array.from(document.querySelectorAll('.wk-realm-pill[data-r]'));
const toastFeedEl = document.getElementById('wk-toast-feed');
const waypointsEl = document.getElementById('wk-waypoints');
const bannerEl = document.getElementById('wk-banner');
const bannerTitleEl = document.getElementById('wk-banner-title');
const bannerSubEl = document.getElementById('wk-banner-sub');

const speedValEl = document.getElementById('wk-speed-val');
const oarFillEl = document.getElementById('wk-oar-fill');
const chimeFillEl = document.getElementById('wk-chime-fill');
const voyageFillEl = document.getElementById('wk-voyage-fill');
const scoreValEl = document.getElementById('wk-score-val');
const stateValEl = document.getElementById('wk-state-val');

const kickerEl = document.getElementById('wk-kicker');
const titleEl = document.getElementById('wk-title');
const descEl = document.getElementById('wk-desc');
const debriefEl = document.getElementById('wk-debrief');
const stTimeEl = document.getElementById('st-time');
const stMemEl = document.getElementById('st-mem');
const stChimeEl = document.getElementById('st-chime');
const stScoreEl = document.getElementById('st-score');
const stRankEl = document.getElementById('st-rank');

const btnStart = document.getElementById('wk-btn-start');
const btnAutoRowMenu = document.getElementById('wk-btn-autorow');
const btnContinue = document.getElementById('wk-btn-continue');
const btnRestart = document.getElementById('wk-btn-restart');
const btnStudio = document.getElementById('wk-btn-studio');
const studioEl = document.getElementById('wk-studio');
const scopeCvs = document.getElementById('wk-scope');
const scopeCtx = scopeCvs ? scopeCvs.getContext('2d') : null;
const btnAutoHud = document.getElementById('btn-auto');

// --- WebGL2 Context Initialization ---
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

const progSky = createProgram(gl, WATER_SKY_VS, WATER_SKY_FS, [
  'uProj',
  'uView',
  'uCamPos',
  'uTime',
  'uSkyZenith',
  'uSkyMid',
  'uSkyHorizon',
  'uSunDir',
  'uSunCol',
  'uStarAmt',
  'uAuroraAmt',
  'uConstellationAmt',
]);

const progWater = createProgram(gl, WATER_SURF_VS, WATER_SURF_FS, [
  'uProj',
  'uView',
  'uSnapXZ',
  'uTime',
  'uBoatWake',
  'uRipples[0]',
  'uCamPos',
  'uSkyZenith',
  'uSkyMid',
  'uSkyHorizon',
  'uSunDir',
  'uSunCol',
  'uWaterDeep',
  'uWaterShallow',
  'uFogCol',
  'uFogDensity',
  'uAuroraAmt',
  'uSubGlowCol',
  'uSubGlowAmt',
  'uLanternPos',
]);

const progWorld = createProgram(gl, WATER_WORLD_VS, WATER_WORLD_FS, [
  'uProj',
  'uView',
  'uModel',
  'uMat',
  'uColor',
  'uParams',
  'uCamPos',
  'uTime',
  'uSunDir',
  'uSunCol',
  'uSkyZenith',
  'uSkyHorizon',
  'uWaterShallow',
  'uFogCol',
  'uFogDensity',
  'uLanternPos',
]);

const progInst = createProgram(gl, WATER_INST_VS, WATER_INST_FS, ['uProj', 'uView']);
const progPost = createProgram(gl, WATER_POST_VS, WATER_POST_FS, [
  'uTex',
  'uRes',
  'uTime',
  'uBrushAmt',
  'uChimePulse',
]);

const postVAO = gl.createVertexArray();
const meshes = createWaterPrimitives(gl);
let world = buildDreamWaterWorld(meshes);
const particleSys = createWaterParticleSystem(gl, 640);
const audio = new ImpressionistWaterAudio();
const atmo = createAtmosphereState();

// --- Offscreen Post-Process Framebuffer ---
let fbo = null;
let fboTex = null;
let fboDepth = null;
let fboW = 0;
let fboH = 0;
let quality = isSoftwareGL ? 'med' : 'high';
const qualityScaleMap = isSoftwareGL
  ? { low: 0.50, med: 0.66, high: 0.80 }
  : { low: 0.68, med: 0.86, high: 1.0 };

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

  const sc = qualityScaleMap[quality] || 0.86;
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

// --- IntersectionObserver to Skip Heavy WebGL Draws WhenScrolled Offscreen ---
let isAppVisible = true;
if (typeof IntersectionObserver !== 'undefined') {
  const io = new IntersectionObserver(
    (entries) => {
      if (entries[0]) isAppVisible = entries[0].isIntersecting;
    },
    { threshold: 0.01 }
  );
  io.observe(appEl);
}

// --- Particle Pool & Live Water Ripples ---
const particles = [];
function spawnParticle(x, y, z, vx, vy, vz, size, life, r, g, b, a, kind = 0, grav = 0.0) {
  if (particles.length >= particleSys.maxParticles) return;
  particles.push({
    x, y, z, vx, vy, vz,
    size, life, maxLife: life,
    r, g, b, a, kind, grav,
    rot: Math.random() * 6.28,
    vrot: (Math.random() - 0.5) * 2.4,
  });
}

// Live Water Surface Ripples (up to 8 passed directly to WATER_SURF_VS + rendered as subtle 3D rings)
const waterRipples = [];
const rippleUniformBuf = new Float32Array(8 * 4);

function spawnWaterRipple(x, z, isChime = false, maxRadius = 6.5, amp = 0.85) {
  if (waterRipples.length >= 12) waterRipples.shift();
  waterRipples.push({
    x,
    z,
    r: isChime ? 0.8 : 0.35,
    maxRadius: isChime ? 36.0 : maxRadius,
    t: 0,
    dur: isChime ? 2.45 : 1.35,
    amp,
    isChime,
  });
}

function emitOarDroplets(x, y, z, intensity = 1.0) {
  const count = Math.round(7 * intensity);
  for (let i = 0; i < count; i++) {
    const a = Math.random() * Math.PI * 2;
    const sp = (1.2 + Math.random() * 2.4) * intensity;
    spawnParticle(
      x + (Math.random() - 0.5) * 0.35,
      y + 0.08,
      z + (Math.random() - 0.5) * 0.35,
      Math.cos(a) * sp,
      1.8 + Math.random() * 2.6 * intensity,
      Math.sin(a) * sp,
      0.13 + Math.random() * 0.09,
      0.48 + Math.random() * 0.35,
      0.78, 0.96, 0.94, 0.82,
      1,
      9.2
    );
  }
}

function emitMemoryStarburst(x, y, z) {
  for (let i = 0; i < 28; i++) {
    const a = (i / 28) * Math.PI * 2 + Math.random() * 0.2;
    const sp = 1.6 + Math.random() * 4.2;
    const isGold = i % 2 === 0;
    spawnParticle(
      x,
      y,
      z,
      Math.cos(a) * sp,
      2.2 + Math.random() * 5.8,
      Math.sin(a) * sp,
      isGold ? 0.36 : 0.28,
      1.25 + Math.random() * 0.9,
      isGold ? 1.0 : 0.32,
      isGold ? 0.86 : 0.95,
      isGold ? 0.40 : 0.86,
      0.95,
      0,
      -1.2 // Float upward toward the sky constellation!
    );
  }
}

// --- Handcrafted Wooden Skiff & Voyage State ---
const boat = {
  x: 0,
  y: 0,
  z: -12,
  yaw: 0,
  pitch: 0,
  roll: 0,
  speed: 0,
  surgeBoost: 0,
  steerLean: 0,
  oarCycle: 0,
  oarLeftPhase: 0,
  oarRightPhase: 0,
  oarAmp: 0.35,
  oarLeftAmp: 0.35,
  oarRightAmp: 0.35,
  prevCatchHalf: 0,
  chimeGlow: 0,
  lanternWorld: [0, 1.2, -14.4],
};

let mode = 'title'; // 'title' | 'playing' | 'paused' | 'sanctuary'
let freeRoamAfterFinale = false;
let sanctuaryReached = false;
let autoRow = false;
let autoChimeCooldown = 0;

let voyageTime = 0;
let score = 0;
let memoriesCollected = 0;
let chimeCount = 0;
let chimeCooldown = 0;
let chimePulse = 0;
let currentRealmIndex = 0;

let brushPreset = 1; // 0: Crisp (0.0), 1: Monet Watercolor (0.56), 2: Storybook Impasto (1.0)
const brushAmounts = [0.0, 0.56, 1.0];
const brushNames = ['清透水色', '莫奈水彩', '绘本厚涂'];

let camPreset = 0; // 0: Poetic Chase, 1: Bow Lantern Close, 2: Storybook Panorama
const camNames = ['诗意追尾', '船首凭栏', '画卷远景'];

let camPos = [0, 3.6, -3.0];
let camLook = [0, 1.2, -24.0];
let lookYawOffset = 0;
let lookPitchOffset = 0;
let bannerTimer = 0;
let ambientSpawnTimer = 0;

// --- Input State ---
const keys = new Set();
let mouseRowHeld = false;
let touchSteer = 0;
let touchRowHeld = false;

function showToast(msg) {
  const el = document.createElement('div');
  el.className = 'wk-toast';
  el.textContent = msg;
  toastFeedEl.appendChild(el);
  while (toastFeedEl.children.length > 4) {
    toastFeedEl.removeChild(toastFeedEl.firstChild);
  }
  setTimeout(() => {
    if (el.parentNode) el.parentNode.removeChild(el);
  }, 3800);
}

function showBanner(title, sub, dur = 3.4) {
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

function syncRealmHUD(idx, announce = false) {
  currentRealmIndex = clamp(idx, 0, REALMS.length - 1);
  const r = REALMS[currentRealmIndex];
  realmTagEl.textContent = `${r.num} · ${r.zh}`;
  realmPillEls.forEach((el) => {
    el.classList.toggle('active', Number(el.dataset.r) === currentRealmIndex);
  });
  if (announce) {
    showBanner(`${r.num} · ${r.zh} · ${r.en}`, r.poem, 3.6);
  }
}

function updateLanternWorldPos() {
  const sy = Math.sin(boat.yaw);
  const cy = Math.cos(boat.yaw);
  // Bow lantern sits at local (0, 1.15, -2.42)
  boat.lanternWorld[0] = boat.x + 2.42 * sy;
  boat.lanternWorld[1] = boat.y + 1.15;
  boat.lanternWorld[2] = boat.z - 2.42 * cy;
}

function snapCameraBehindBoat() {
  const sy = Math.sin(boat.yaw);
  const cy = Math.cos(boat.yaw);
  camPos[0] = boat.x + sy * 8.2;
  camPos[1] = boat.y + 3.4;
  camPos[2] = boat.z + cy * 8.2;
  camLook[0] = boat.x - sy * 12.0;
  camLook[1] = boat.y + 1.4;
  camLook[2] = boat.z - cy * 12.0;
}

// --- Core Actions: Start Voyage, Warp Realm, Ring Lantern Chime ---
function setAutoRow(flag, silent = false) {
  autoRow = Boolean(flag);
  if (btnAutoHud) {
    btnAutoHud.classList.toggle('active-toggle', autoRow);
    btnAutoHud.textContent = autoRow ? '泛舟:开 [T]' : '泛舟 [T]';
  }
  if (!silent) {
    showToast(autoRow ? '已开启「伴流自动泛舟」：轻舟将循水脉与星光自在前行' : '已切换为手动执桨划行');
  }
}

function startVoyage(enableAuto = false) {
  audio.init();
  world = buildDreamWaterWorld(meshes);
  particles.length = 0;
  waterRipples.length = 0;

  boat.x = riverCenterX(-12);
  boat.z = -12;
  boat.y = waterWaveHeight(boat.x, boat.z, 0);
  boat.yaw = riverTangentYaw(-12);
  boat.pitch = 0;
  boat.roll = 0;
  boat.speed = 2.6;
  boat.surgeBoost = 0.25;
  boat.oarCycle = 0;
  boat.chimeGlow = 0.6;
  updateLanternWorldPos();
  snapCameraBehindBoat();

  voyageTime = 0;
  score = 0;
  memoriesCollected = 0;
  chimeCount = 0;
  chimeCooldown = 0;
  sanctuaryReached = false;
  freeRoamAfterFinale = false;
  lookYawOffset = 0;
  lookPitchOffset = 0;

  memDescEl.textContent = '水之记忆 [0 / 16]';
  debriefEl.classList.remove('show');
  setAutoRow(enableAuto, true);

  mode = 'playing';
  overlayEl.classList.add('hidden');
  hudEl.classList.add('visible');
  document.getElementById('wk-touch')?.classList.add('active');
  canvas.focus();

  syncRealmHUD(0, true);
  spawnWaterRipple(boat.lanternWorld[0], boat.lanternWorld[2], true, 24, 0.9);
  audio.playLanternChime(0);
  showToast(enableAuto ? '伴流自动泛舟已开启 · 静享八重水境' : '轻按 W / 左键挥动双桨，按空格敲响船首风铃');
}

function warpRealm(idx = 0) {
  const targetIdx = clamp(Math.floor(idx), 0, REALMS.length - 1);
  const r = REALMS[targetIdx];
  audio.init();

  if (mode === 'title' || mode === 'paused' || mode === 'sanctuary') {
    mode = 'playing';
    overlayEl.classList.add('hidden');
    hudEl.classList.add('visible');
  }
  if (targetIdx < 7) {
    // Allow re-experiencing Sanctuary arrival if player warps back and rows in again
    freeRoamAfterFinale = true;
  }

  boat.z = r.warpZ;
  boat.x = riverCenterX(boat.z);
  boat.y = waterWaveHeight(boat.x, boat.z, performance.now() * 0.001);
  boat.yaw = riverTangentYaw(boat.z);
  boat.pitch = 0;
  boat.roll = 0;
  boat.speed = Math.max(boat.speed, 3.8);
  updateLanternWorldPos();
  snapCameraBehindBoat();

  syncRealmHUD(targetIdx, true);
  spawnWaterRipple(boat.lanternWorld[0], boat.lanternWorld[2], true, 30, 1.0);
  chimePulse = 0.85;
  audio.playLanternChime(targetIdx);
  return true;
}

function ringChime(force = false) {
  if (!force && chimeCooldown > 0.05) return false;
  audio.init();
  chimeCooldown = 0.65;
  chimePulse = 1.0;
  boat.chimeGlow = 1.25;
  chimeCount++;

  updateLanternWorldPos();
  spawnWaterRipple(boat.lanternWorld[0], boat.lanternWorld[2], true, 36.0, 1.05);
  audio.playLanternChime(currentRealmIndex);

  // Awaken nearby Memory Pearls within 46m so they shine & drift toward the skiff!
  let newlyAwakened = 0;
  for (const m of world.memories) {
    if (m.collected) continue;
    const d = Math.hypot(m.x - boat.x, m.z - boat.z);
    if (d < 46.0) {
      if (!m.awakened) newlyAwakened++;
      m.awakened = true;
      m.awakenGlow = 1.4;
      emitMemoryStarburst(m.x, m.y + 0.3, m.z);
    }
  }

  // Sympathetic glow on nearby Floating Dusk Lanterns, 3D Jellyfish & Drowned Cathedral Bells!
  for (const fl of world.floatingLanterns) {
    if (Math.hypot(fl.x - boat.x, fl.z - boat.z) < 38.0) fl.flare = 1.25;
  }
  for (const jf of world.jellyfish) {
    if (Math.hypot(jf.x - boat.x, jf.z - boat.z) < 42.0) jf.flare = 1.35;
  }
  for (const cb of world.cathedralBells) {
    if (Math.hypot(cb.x - boat.x, cb.z - boat.z) < 55.0) {
      cb.swing = 1.0;
      audio.playCathedralBell(164.81);
    }
  }

  if (newlyAwakened > 0) {
    score += newlyAwakened * 50;
    showToast(`风铃金波共鸣！唤醒了 ${newlyAwakened} 枚水之记忆微光`);
  }
  return true;
}

function triggerSanctuaryFinale() {
  sanctuaryReached = true;
  mode = 'sanctuary';
  hudEl.classList.remove('visible');
  overlayEl.classList.remove('hidden');

  audio.playMemoryCollect(7);
  audio.playCathedralBell(130.81);
  emitMemoryStarburst(0, 8.0, world.sanctZ + 12);

  const rank =
    memoriesCollected >= 14 ? '星河满载 · S+' :
    memoriesCollected >= 10 ? '澄明归舟 · S' :
    memoriesCollected >= 6 ? '拾光旅人 · A' : '听水吟游 · B';

  kickerEl.textContent = 'GOLDEN HORIZON SANCTUARY // 八重水境彼岸抵达';
  titleEl.textContent = '水之所存 · 皆化星辰';
  descEl.textContent =
    `小舟已穿过八百八十米梦境水路停靠彼岸灯塔。沿途唤醒的 ${memoriesCollected} 枚「水之记忆」正升入灯塔穹顶化作金色星座，温柔照亮来时的每一道涟漪。`;

  stTimeEl.textContent = formatTime(voyageTime);
  stMemEl.textContent = `${memoriesCollected} / 16`;
  stChimeEl.textContent = String(chimeCount);
  stScoreEl.textContent = String(score);
  stRankEl.textContent = rank;
  debriefEl.classList.add('show');

  btnStart.style.display = 'none';
  btnAutoRowMenu.style.display = 'none';
  btnContinue.style.display = 'inline-flex';
  btnRestart.style.display = 'inline-flex';
}

// --- Input Event Listeners ---
window.addEventListener('keydown', (e) => {
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) {
    if (mode === 'playing') e.preventDefault();
  }
  keys.add(e.code);

  if (e.repeat) return;

  if (e.code === 'Space' && mode === 'playing') {
    ringChime();
  } else if (e.code === 'KeyT') {
    setAutoRow(!autoRow);
  } else if (e.code === 'KeyB') {
    cycleBrushPreset();
  } else if (e.code === 'KeyC') {
    camPreset = (camPreset + 1) % 3;
    showToast(`摄影机位：${camNames[camPreset]}`);
  } else if (e.code === 'KeyN') {
    warpRealm((currentRealmIndex + 1) % REALMS.length);
  } else if (e.code >= 'Digit1' && e.code <= 'Digit8') {
    const rIdx = Number(e.code.slice(5)) - 1;
    warpRealm(rIdx);
  } else if (e.code === 'KeyP' || e.code === 'Escape') {
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
    mouseRowHeld = true;
  } else if (e.button === 2) {
    ringChime();
  }
});

window.addEventListener('mouseup', (e) => {
  if (e.button === 0) mouseRowHeld = false;
});

canvas.addEventListener('contextmenu', (e) => e.preventDefault());

canvas.addEventListener('mousemove', (e) => {
  if (mode !== 'playing') return;
  const rect = canvas.getBoundingClientRect();
  const nx = ((e.clientX - rect.left) / Math.max(1, rect.width) - 0.5) * 2;
  const ny = ((e.clientY - rect.top) / Math.max(1, rect.height) - 0.5) * 2;
  lookYawOffset = -nx * 0.34;
  lookPitchOffset = -ny * 0.16;
});

// Touch Controls
const tPad = document.getElementById('wk-t-pad');
const tKnob = document.getElementById('wk-t-knob');
const tbRow = document.getElementById('wk-tb-row');
const tbChime = document.getElementById('wk-tb-chime');

if (tPad && tKnob) {
  const handlePad = (touch) => {
    const r = tPad.getBoundingClientRect();
    const dx = clamp((touch.clientX - (r.left + r.width / 2)) / (r.width * 0.45), -1, 1);
    const dy = clamp((touch.clientY - (r.top + r.height / 2)) / (r.height * 0.45), -1, 1);
    touchSteer = dx;
    tKnob.style.transform = `translate(${dx * 24}px, ${dy * 24}px)`;
  };
  tPad.addEventListener('touchstart', (e) => { e.preventDefault(); handlePad(e.touches[0]); }, { passive: false });
  tPad.addEventListener('touchmove', (e) => { e.preventDefault(); handlePad(e.touches[0]); }, { passive: false });
  tPad.addEventListener('touchend', () => { touchSteer = 0; tKnob.style.transform = 'translate(0,0)'; });
}
if (tbRow) {
  tbRow.addEventListener('touchstart', (e) => { e.preventDefault(); audio.init(); touchRowHeld = true; }, { passive: false });
  tbRow.addEventListener('touchend', () => { touchRowHeld = false; });
}
if (tbChime) {
  tbChime.addEventListener('touchstart', (e) => { e.preventDefault(); ringChime(); }, { passive: false });
}

// --- HUD & Overlay UI Buttons ---
function cycleBrushPreset(setIdx = null) {
  brushPreset = setIdx !== null ? setIdx : (brushPreset + 1) % 3;
  document.querySelectorAll('.brush-pill').forEach((b) => {
    b.classList.toggle('active', Number(b.dataset.b) === brushPreset);
  });
  showToast(`绘本水彩滤镜：${brushNames[brushPreset]}`);
}

function togglePause() {
  if (mode === 'playing') {
    mode = 'paused';
    mouseRowHeld = false;
    kickerEl.textContent = 'RIVER LANTERN REST // 轻舟暂泊静水';
    titleEl.textContent = '水之所存 · WHAT THE WATER KEEPS';
    descEl.textContent = '可切换莫奈水彩笔触、画质或打开印象派水声琴房试听合成音色，点击继续返回木舟。';
    btnStart.textContent = '继续执桨泛舟';
    btnStart.style.display = 'inline-flex';
    btnAutoRowMenu.style.display = 'inline-flex';
    btnContinue.style.display = 'none';
    btnRestart.style.display = 'inline-flex';
    debriefEl.classList.remove('show');
    overlayEl.classList.remove('hidden');
  } else if (mode === 'paused') {
    mode = 'playing';
    overlayEl.classList.add('hidden');
    canvas.focus();
  }
}

btnStart.addEventListener('click', () => {
  if (mode === 'paused') togglePause();
  else startVoyage(false);
});
btnAutoRowMenu.addEventListener('click', () => {
  if (mode === 'paused') {
    setAutoRow(true);
    togglePause();
  } else {
    startVoyage(true);
  }
});
btnContinue.addEventListener('click', () => {
  freeRoamAfterFinale = true;
  mode = 'playing';
  overlayEl.classList.add('hidden');
  hudEl.classList.add('visible');
  warpRealm(0);
  canvas.focus();
});
btnRestart.addEventListener('click', () => startVoyage(false));

btnStudio.addEventListener('click', () => {
  audio.init();
  studioEl.classList.toggle('open');
});

document.querySelectorAll('.wk-sfx-trigger').forEach((btn) => {
  btn.addEventListener('click', () => {
    audio.init();
    const s = btn.dataset.s;
    if (s === 'oar') audio.playOarStroke(1.0);
    else if (s === 'chime') audio.playLanternChime(currentRealmIndex);
    else if (s === 'piano') audio.playFeltPiano(349.23, 2.2, 0.11);
    else if (s === 'memory') audio.playMemoryCollect(currentRealmIndex);
    else if (s === 'cello') audio.playCelloPad(146.83, 3.0, 0.09);
    else if (s === 'bell') audio.playCathedralBell(164.81);
  });
});

document.querySelectorAll('.brush-pill').forEach((btn) => {
  btn.addEventListener('click', () => cycleBrushPreset(Number(btn.dataset.b)));
});

document.querySelectorAll('.q-pill').forEach((btn) => {
  btn.addEventListener('click', () => {
    quality = btn.dataset.q;
    document.querySelectorAll('.q-pill').forEach((b) => b.classList.toggle('active', b === btn));
    ensureFBO();
  });
});

const volInput = document.getElementById('wk-vol');
if (volInput) {
  volInput.addEventListener('input', () => {
    audio.setVolume(Number(volInput.value) / 100);
  });
}

realmPillEls.forEach((pill) => {
  pill.addEventListener('click', () => warpRealm(Number(pill.dataset.r)));
});
document.getElementById('btn-next-realm')?.addEventListener('click', () => {
  warpRealm((currentRealmIndex + 1) % REALMS.length);
});

btnAutoHud?.addEventListener('click', () => setAutoRow(!autoRow));
document.getElementById('btn-brush')?.addEventListener('click', () => cycleBrushPreset());
document.getElementById('btn-cam')?.addEventListener('click', () => {
  camPreset = (camPreset + 1) % 3;
  showToast(`摄影机位：${camNames[camPreset]}`);
});
document.getElementById('btn-pause')?.addEventListener('click', () => togglePause());
document.getElementById('btn-fs')?.addEventListener('click', () => {
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

// --- Physics, Oar Kinematics & Realm Simulation ---
function triggerOarCatch(intensity = 1.0, steerBias = 0) {
  audio.playOarStroke(intensity);
  boat.surgeBoost = Math.min(1.35, boat.surgeBoost + 0.82 * intensity);

  // Compute Port & Starboard oar blade world positions (~2.25m outboard from skiff center)
  const rightX = Math.cos(boat.yaw);
  const rightZ = -Math.sin(boat.yaw);
  const fwdX = -Math.sin(boat.yaw);
  const fwdZ = -Math.cos(boat.yaw);

  if (steerBias <= 0.65) {
    const px = boat.x - rightX * 2.25 + fwdX * 0.25;
    const pz = boat.z - rightZ * 2.25 + fwdZ * 0.25;
    spawnWaterRipple(px, pz, false, 5.8, 0.78 * intensity);
    emitOarDroplets(px, boat.y, pz, intensity);
  }
  if (steerBias >= -0.65) {
    const sx = boat.x + rightX * 2.25 + fwdX * 0.25;
    const sz = boat.z + rightZ * 2.25 + fwdZ * 0.25;
    spawnWaterRipple(sx, sz, false, 5.8, 0.78 * intensity);
    emitOarDroplets(sx, boat.y, sz, intensity);
  }
}

function updateSimulation(dt, t) {
  if (bannerTimer > 0) {
    bannerTimer -= dt;
    if (bannerTimer <= 0) bannerEl.classList.remove('show');
  }
  chimeCooldown = Math.max(0, chimeCooldown - dt);
  chimePulse = damp(chimePulse, 0, 2.2, dt);
  boat.chimeGlow = damp(boat.chimeGlow, 0, 2.5, dt);
  autoChimeCooldown = Math.max(0, autoChimeCooldown - dt);

  // Title Screen Gentle Meditative Orbit in Realm 01 (Water-Lily Dawn)
  if (mode === 'title') {
    boat.z = -14 - Math.sin(t * 0.12) * 3.5;
    boat.x = riverCenterX(boat.z) + Math.cos(t * 0.18) * 0.8;
    boat.yaw = riverTangentYaw(boat.z) + Math.sin(t * 0.22) * 0.08;
    boat.y = waterWaveHeight(boat.x, boat.z, t);
    boat.pitch = Math.sin(t * 1.4) * 0.025;
    boat.roll = Math.cos(t * 1.1) * 0.03;
    boat.oarCycle += dt * 1.6;
    boat.oarLeftPhase = boat.oarCycle;
    boat.oarRightPhase = boat.oarCycle;
    boat.oarAmp = 0.42;
    boat.oarLeftAmp = 0.42;
    boat.oarRightAmp = 0.42;
    boat.speed = 1.6;
    updateLanternWorldPos();

    const orbitA = t * 0.16;
    camPos[0] = boat.x + Math.sin(orbitA) * 7.4 + 2.2;
    camPos[1] = boat.y + 2.85;
    camPos[2] = boat.z + Math.cos(orbitA) * 7.6 + 2.5;
    camLook[0] = boat.x;
    camLook[1] = boat.y + 1.05;
    camLook[2] = boat.z - 8.0;
    return;
  }

  if (mode !== 'playing') return;

  voyageTime += dt;

  // Player Rowing & Steering Inputs
  const rowForwardInput =
    keys.has('KeyW') ||
    keys.has('ArrowUp') ||
    mouseRowHeld ||
    touchRowHeld;
  const brakeInput = keys.has('KeyS') || keys.has('ArrowDown');
  const leftInput = keys.has('KeyA') || keys.has('ArrowLeft');
  const rightInput = keys.has('KeyD') || keys.has('ArrowRight');

  // If player manually presses W/S, prioritize manual input; otherwise let Auto-Row guide smoothly
  let steer = (leftInput ? 1 : 0) - (rightInput ? 1 : 0) - touchSteer;
  let activeRowing = rowForwardInput;

  if (autoRow && !rowForwardInput && !brakeInput) {
    activeRowing = true;
    // Look ahead for nearest uncollected Memory Pearl within 46m ahead!
    let targetX = riverCenterX(boat.z - 18.0);
    let targetZ = boat.z - 18.0;
    for (const m of world.memories) {
      if (!m.collected && m.z < boat.z + 2.0 && m.z > boat.z - 48.0) {
        targetX = m.x;
        targetZ = m.z;
        const distM = Math.hypot(m.x - boat.x, m.z - boat.z);
        if (!m.awakened && distM < 22.0 && autoChimeCooldown <= 0) {
          ringChime(true);
          autoChimeCooldown = 4.2;
        }
        break;
      }
    }
    if (Math.abs(steer) < 0.05) {
      const desiredYaw = Math.atan2(-(targetX - boat.x), -(targetZ - boat.z));
      const diff = wrapAngle(desiredYaw - boat.yaw);
      steer = clamp(diff * 1.85, -0.85, 0.85);
    }
  }

  steer = clamp(steer, -1, 1);
  boat.steerLean = damp(boat.steerLean, steer, 5.5, dt);

  // Oar Kinematics & Rhythmic Pull-and-Glide Propulsion
  const steerPaddling = Math.abs(steer) > 0.12 && !brakeInput;
  if (activeRowing || steerPaddling) {
    const cadence = activeRowing ? (autoRow && !rowForwardInput ? 4.3 : 5.2) : 4.2;
    const prevCycle = boat.oarCycle;
    boat.oarCycle += dt * cadence;

    // Trigger water-dip catch once per 2*PI oar stroke!
    if (Math.floor(boat.oarCycle / (Math.PI * 2)) > Math.floor(prevCycle / (Math.PI * 2))) {
      triggerOarCatch(activeRowing ? 1.0 : 0.65, activeRowing ? steer * 0.4 : steer);
    }

    boat.oarAmp = damp(boat.oarAmp, activeRowing ? 1.0 : 0.72, 7.0, dt);
    // Differential oar amplitude when turning!
    boat.oarLeftAmp = damp(boat.oarLeftAmp, clamp(boat.oarAmp * (1.0 - steer * 0.48), 0.25, 1.25), 8.0, dt);
    boat.oarRightAmp = damp(boat.oarRightAmp, clamp(boat.oarAmp * (1.0 + steer * 0.48), 0.25, 1.25), 8.0, dt);
    boat.oarLeftPhase = boat.oarCycle;
    boat.oarRightPhase = boat.oarCycle;
  } else if (brakeInput) {
    boat.oarCycle -= dt * 3.8;
    boat.oarLeftPhase = boat.oarCycle;
    boat.oarRightPhase = boat.oarCycle;
    boat.oarAmp = damp(boat.oarAmp, 0.65, 6.0, dt);
    boat.oarLeftAmp = boat.oarAmp;
    boat.oarRightAmp = boat.oarAmp;
  } else {
    // Feather oars gracefully above water while gliding!
    boat.oarAmp = damp(boat.oarAmp, 0.22, 3.5, dt);
    boat.oarLeftAmp = damp(boat.oarLeftAmp, 0.22, 3.5, dt);
    boat.oarRightAmp = damp(boat.oarRightAmp, 0.22, 3.5, dt);
  }

  // Surge & Glide Velocity Physics
  boat.surgeBoost = damp(boat.surgeBoost, 0, 2.1, dt);
  let targetSpeed = 0.85; // Gentle natural river current along -Z
  if (activeRowing) {
    const strokePulse = Math.max(0, Math.cos(boat.oarCycle)) * 2.6;
    targetSpeed = (autoRow && !rowForwardInput ? 7.8 : 9.4) + strokePulse + boat.surgeBoost * 2.2;
  } else if (steerPaddling) {
    targetSpeed = Math.max(boat.speed, 4.4);
  } else if (brakeInput) {
    targetSpeed = -2.2;
  }

  const accelLambda = activeRowing || brakeInput ? 2.6 : 0.72; // Long silky glide on release!
  boat.speed = damp(boat.speed, targetSpeed, accelLambda, dt);

  // Rudder & Differential Oar Turning
  const turnAuthority = 1.28 + clamp(Math.abs(boat.speed) / 10.0, 0, 0.65);
  boat.yaw = wrapAngle(boat.yaw + steer * turnAuthority * dt);

  const fwdX = -Math.sin(boat.yaw);
  const fwdZ = -Math.cos(boat.yaw);
  boat.x += fwdX * boat.speed * dt;
  boat.z += fwdZ * boat.speed * dt;

  // Soft River-Channel Boundary & Obstacle Repulsion (never gets stuck!)
  const chanCenter = riverCenterX(boat.z);
  const maxBankOffset = boat.z < -775 ? 24.0 : 18.5;
  if (Math.abs(boat.x - chanCenter) > maxBankOffset) {
    const targetBankX = clamp(boat.x, chanCenter - maxBankOffset, chanCenter + maxBankOffset);
    boat.x = damp(boat.x, targetBankX, 8.0, dt);
    boat.yaw = damp(boat.yaw, riverTangentYaw(boat.z), 2.5, dt);
  }
  boat.z = clamp(boat.z, -844.0, 12.0);

  for (const ob of world.obstacles) {
    if (Math.abs(ob.z - boat.z) > ob.r + 4.0) continue;
    const dx = boat.x - ob.x;
    const dz = boat.z - ob.z;
    const d = Math.hypot(dx, dz) || 0.01;
    const minSep = ob.r + 1.25;
    if (d < minSep) {
      const push = minSep - d;
      boat.x += (dx / d) * push;
      boat.z += (dz / d) * push;
      boat.speed *= 0.90;
    }
  }

  // Wave Buoyancy, Pitch & Roll
  const waveCenter = waterWaveHeight(boat.x, boat.z, t);
  const waveAhead = waterWaveHeight(boat.x + fwdX * 1.8, boat.z + fwdZ * 1.8, t);
  boat.y = damp(boat.y, waveCenter, 10.0, dt);
  const wavePitch = Math.atan2(waveAhead - waveCenter, 1.8);
  boat.pitch = damp(boat.pitch, wavePitch - boat.surgeBoost * 0.045, 7.0, dt);
  boat.roll = damp(boat.roll, -boat.steerLean * 0.14 + Math.sin(t * 1.7) * 0.02, 6.5, dt);

  updateLanternWorldPos();

  // Check Realm Transition along the 880m Voyage
  const newRealm = getRealmIndex(boat.z);
  if (newRealm !== currentRealmIndex) {
    syncRealmHUD(newRealm, true);
    score += 100;
  }

  // Update Dynamic Realm Creatures & Relics
  for (const fl of world.floatingLanterns) {
    fl.flare = damp(fl.flare, 0, 1.6, dt);
    fl.x = fl.baseX + Math.sin(t * 0.45 + fl.phase) * 0.85;
    fl.z = fl.baseZ + Math.cos(t * 0.35 + fl.phase) * 0.65;
  }
  for (const jf of world.jellyfish) {
    jf.flare = damp(jf.flare, 0, 1.5, dt);
    jf.x = jf.baseX + Math.sin(t * 0.55 + jf.phase) * 1.1;
    jf.y = jf.baseY + Math.sin(t * 1.45 + jf.phase) * 0.55;
  }
  for (const cb of world.cathedralBells) {
    cb.swing = damp(cb.swing, 0, 0.8, dt);
  }

  // Memory Pearl Awakening & Collection (+200 pts)
  for (const m of world.memories) {
    if (m.collected) continue;
    m.awakenGlow = damp(m.awakenGlow, m.awakened ? 0.65 : 0, 1.8, dt);
    const dx = boat.x - m.x;
    const dz = boat.z - m.z;
    const dist = Math.hypot(dx, dz);

    // Awakened Memory Pearls glide gently toward the skiff!
    if (m.awakened && dist < 28.0 && dist > 0.5) {
      const pull = (1.0 - dist / 28.0) * 5.8 * dt;
      m.x += (dx / dist) * pull;
      m.z += (dz / dist) * pull;
    } else if (dist < 8.5) {
      // Gentle close-range magnetic pull even if chime wasn't rung
      m.x += (dx / Math.max(dist, 0.1)) * 2.8 * dt;
      m.z += (dz / Math.max(dist, 0.1)) * 2.8 * dt;
    }

    if (dist < 2.85) {
      m.collected = true;
      memoriesCollected++;
      score += 200;
      memDescEl.textContent = `水之记忆 [${memoriesCollected} / 16]`;
      audio.playMemoryCollect(currentRealmIndex);
      spawnWaterRipple(m.x, m.z, true, 22.0, 0.95);
      emitMemoryStarburst(m.x, m.y + 0.4, m.z);
      showBanner(`${m.title} · [${memoriesCollected}/16]`, m.verse, 3.2);
      showToast(`拾得「${m.title}」+200`);
    }
  }

  // River Starlight Motes Collection (+35 pts)
  for (const rm of world.riverMotes) {
    if (rm.collected) continue;
    const d = Math.hypot(boat.x - rm.x, boat.z - rm.z);
    if (d < 5.2 && d > 0.2) {
      rm.x += ((boat.x - rm.x) / d) * 6.5 * dt;
      rm.z += ((boat.z - rm.z) / d) * 6.5 * dt;
    }
    if (d < 2.1) {
      rm.collected = true;
      score += 35;
      audio.playCelesta(523.25 + (memoriesCollected % 5) * 65.0, 0.9, 0.042);
    }
  }

  // Ambient Realm Firefly / Petal / Aurora Mote Spawner around the Skiff!
  ambientSpawnTimer -= dt;
  if (ambientSpawnTimer <= 0) {
    ambientSpawnTimer = 0.085;
    const rx = boat.x + (Math.random() - 0.5) * 34.0;
    const rz = boat.z - Math.random() * 42.0 + 6.0;
    if (currentRealmIndex === 5) {
      // Realm 06 Crimson Maple Fjord: Drifting scarlet & golden autumn leaves!
      const gold = Math.random() < 0.38;
      spawnParticle(
        rx, 5.5 + Math.random() * 6.0, rz,
        (Math.random() - 0.5) * 1.4, -0.85 - Math.random() * 0.6, 0.6,
        0.28 + Math.random() * 0.16, 4.2,
        gold ? 0.98 : 0.92, gold ? 0.68 : 0.28, 0.18, 0.90,
        2, 0.0
      );
    } else if (currentRealmIndex === 0) {
      // Realm 01 Dawn Lotus Petals & Golden Mist Motes
      spawnParticle(
        rx, 0.4 + Math.random() * 3.2, rz,
        (Math.random() - 0.5) * 0.5, 0.18, 0.2,
        0.22, 3.6,
        1.0, 0.88, 0.62, 0.72,
        0, 0.0
      );
    } else {
      // Fireflies / Lantern Sparks / Bioluminescent Sea Motes
      const seafoam = currentRealmIndex === 3 || currentRealmIndex === 6;
      spawnParticle(
        rx, 0.35 + Math.random() * 4.8, rz,
        (Math.random() - 0.5) * 0.6, 0.22 + Math.random() * 0.35, (Math.random() - 0.5) * 0.6,
        0.24 + Math.random() * 0.14, 3.4,
        seafoam ? 0.28 : 1.0, seafoam ? 0.95 : 0.80, seafoam ? 0.86 : 0.36, 0.82,
        0, 0.0
      );
    }
  }

  // Smooth Camera Presets
  const yawCam = boat.yaw + lookYawOffset;
  const cfX = -Math.sin(yawCam);
  const cfZ = -Math.cos(yawCam);
  let distBack = 8.4;
  let camH = 3.35;
  let lookAhead = 12.5;
  let lookH = 1.45;

  if (camPreset === 1) {
    // Bow Lantern Close Scenic View
    distBack = 3.8;
    camH = 1.95;
    lookAhead = 18.0;
    lookH = 1.65;
  } else if (camPreset === 2) {
    // Wide Storybook Panorama
    distBack = 14.2;
    camH = 6.2;
    lookAhead = 15.0;
    lookH = 1.8;
  }

  const targetCamX = boat.x - cfX * distBack;
  const targetCamY = boat.y + camH;
  const targetCamZ = boat.z - cfZ * distBack;
  camPos[0] = damp(camPos[0], targetCamX, 5.2, dt);
  camPos[1] = damp(camPos[1], targetCamY, 5.2, dt);
  camPos[2] = damp(camPos[2], targetCamZ, 5.2, dt);

  camLook[0] = damp(camLook[0], boat.x + cfX * lookAhead, 7.0, dt);
  camLook[1] = damp(camLook[1], boat.y + lookH + lookPitchOffset * 6.0, 7.0, dt);
  camLook[2] = damp(camLook[2], boat.z + cfZ * lookAhead, 7.0, dt);

  // Sanctuary Arrival Check at Realm 08 Pier (z <= -833)
  if (!sanctuaryReached && !freeRoamAfterFinale && boat.z <= -833.0) {
    triggerSanctuaryFinale();
  }

  audio.update(dt, clamp(Math.abs(boat.speed) / 10.0, 0, 1), currentRealmIndex, true);
}

function updateEffects(dt) {
  for (let i = waterRipples.length - 1; i >= 0; i--) {
    const rp = waterRipples[i];
    rp.t += dt;
    if (rp.t >= rp.dur) {
      waterRipples.splice(i, 1);
      continue;
    }
    const u = rp.t / rp.dur;
    rp.r = lerp(rp.isChime ? 0.8 : 0.35, rp.maxRadius, Math.pow(u, 0.78));
  }

  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.life -= dt;
    if (p.life <= 0 || p.y < -0.5) {
      particles.splice(i, 1);
      continue;
    }
    p.vy -= p.grav * dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.z += p.vz * dt;
    p.rot += p.vrot * dt;
  }
}

// --- WebGL2 Scene Rendering ---
const matProj = M4.create();
const matView = M4.create();
const matVP = M4.create();
const matSkyModel = M4.create();
const matRing = M4.create();
const translucentQueue = [];

function updateWaypointsAndHUD() {
  if (mode !== 'playing') return;

  const knots = Math.abs(boat.speed * 1.55).toFixed(1);
  speedValEl.textContent = knots;
  oarFillEl.style.width = `${Math.round(clamp(Math.abs(boat.speed) / 10.5, 0.06, 1) * 100)}%`;
  chimeFillEl.style.width = `${Math.round((1 - clamp(chimeCooldown / 0.65, 0, 1)) * 100)}%`;
  const progPct = clamp((-boat.z) / 835.0, 0, 1) * 100;
  voyageFillEl.style.width = `${progPct.toFixed(1)}%`;
  scoreValEl.textContent = String(score);

  if (chimePulse > 0.25) stateValEl.textContent = '风铃回响';
  else if (autoRow) stateValEl.textContent = '伴流泛舟';
  else if (Math.abs(boat.speed) > 2.2) stateValEl.textContent = '清波荡桨';
  else stateValEl.textContent = '静水听风';

  // Project nearest 2 uncollected Memory Pearls ahead onto 2D HUD diamonds
  const w = appEl.clientWidth || 800;
  const h = appEl.clientHeight || 446;
  waypointsEl.innerHTML = '';
  let shown = 0;
  for (const m of world.memories) {
    if (m.collected || shown >= 2) continue;
    const dist = Math.hypot(m.x - boat.x, m.z - boat.z);
    if (dist > 115 || m.z > boat.z + 8) continue;
    const scr = M4.projectToScreen(matVP, m.x, m.y + 1.5, m.z, w, h);
    if (!scr || scr.x < 36 || scr.x > w - 36 || scr.y < 54 || scr.y > h - 48) continue;
    const wp = document.createElement('div');
    wp.className = `wk-wp${m.awakened ? ' awakened' : ''}`;
    wp.style.left = `${scr.x.toFixed(1)}px`;
    wp.style.top = `${scr.y.toFixed(1)}px`;
    wp.innerHTML = `<span class="wk-wp-diamond"></span><span>记忆 · ${Math.round(dist)}m</span>`;
    waypointsEl.appendChild(wp);
    shown++;
  }
}

function renderScene(t) {
  sampleRealmAtmosphere(boat.z, atmo);

  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
  gl.viewport(0, 0, fboW, fboH);
  gl.depthMask(true);
  gl.disable(gl.BLEND);
  gl.enable(gl.DEPTH_TEST);
  gl.clearColor(atmo.fogCol[0], atmo.fogCol[1], atmo.fogCol[2], 1.0);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

  const aspect = fboW / Math.max(1, fboH);
  M4.perspective(matProj, (56 * Math.PI) / 180, aspect, 0.35, 760.0);
  M4.lookAt(matView, camPos[0], camPos[1], camPos[2], camLook[0], camLook[1], camLook[2]);
  M4.mul(matVP, matProj, matView);

  // 1. Storybook Sky Dome + Aurora Borealis + Memory Constellation
  gl.depthMask(false);
  gl.disable(gl.CULL_FACE);
  gl.useProgram(progSky.prog);
  gl.uniformMatrix4fv(progSky.u.uProj, false, matProj);
  gl.uniformMatrix4fv(progSky.u.uView, false, matView);
  gl.uniform3f(progSky.u.uCamPos, camPos[0], camPos[1], camPos[2]);
  gl.uniform1f(progSky.u.uTime, t);
  gl.uniform3fv(progSky.u.uSkyZenith, atmo.skyZenith);
  gl.uniform3fv(progSky.u.uSkyMid, atmo.skyMid);
  gl.uniform3fv(progSky.u.uSkyHorizon, atmo.skyHorizon);
  gl.uniform3fv(progSky.u.uSunDir, atmo.sunDir);
  gl.uniform3fv(progSky.u.uSunCol, atmo.sunCol);
  gl.uniform1f(progSky.u.uStarAmt, atmo.starAmt);
  gl.uniform1f(progSky.u.uAuroraAmt, atmo.auroraAmt);
  gl.uniform1f(progSky.u.uConstellationAmt, clamp(memoriesCollected / 16.0, 0, 1));
  gl.bindVertexArray(meshes.sphere.vao);
  gl.drawElements(gl.TRIANGLES, meshes.sphere.count, meshes.sphere.indexType, 0);
  gl.depthMask(true);

  // 2. Painterly Gerstner + Fresnel + Live Boat-Wake & Chime-Ripple Water Surface
  rippleUniformBuf.fill(0);
  const nRip = Math.min(8, waterRipples.length);
  for (let i = 0; i < nRip; i++) {
    const rp = waterRipples[waterRipples.length - 1 - i];
    const fade = 1.0 - rp.t / rp.dur;
    const signedAmp = (rp.isChime ? -1 : 1) * rp.amp * fade * fade;
    rippleUniformBuf[i * 4] = rp.x;
    rippleUniformBuf[i * 4 + 1] = rp.z;
    rippleUniformBuf[i * 4 + 2] = rp.r;
    rippleUniformBuf[i * 4 + 3] = signedAmp;
  }

  const step = meshes.waterCellStep;
  const snapX = Math.floor(boat.x / step) * step;
  const snapZ = Math.floor((boat.z - 42.0) / step) * step;

  gl.useProgram(progWater.prog);
  gl.uniformMatrix4fv(progWater.u.uProj, false, matProj);
  gl.uniformMatrix4fv(progWater.u.uView, false, matView);
  gl.uniform2f(progWater.u.uSnapXZ, snapX, snapZ);
  gl.uniform1f(progWater.u.uTime, t);
  gl.uniform4f(progWater.u.uBoatWake, boat.x, boat.z, boat.yaw, Math.max(0, boat.speed));
  gl.uniform4fv(progWater.u['uRipples[0]'], rippleUniformBuf);
  gl.uniform3f(progWater.u.uCamPos, camPos[0], camPos[1], camPos[2]);
  gl.uniform3fv(progWater.u.uSkyZenith, atmo.skyZenith);
  gl.uniform3fv(progWater.u.uSkyMid, atmo.skyMid);
  gl.uniform3fv(progWater.u.uSkyHorizon, atmo.skyHorizon);
  gl.uniform3fv(progWater.u.uSunDir, atmo.sunDir);
  gl.uniform3fv(progWater.u.uSunCol, atmo.sunCol);
  gl.uniform3fv(progWater.u.uWaterDeep, atmo.waterDeep);
  gl.uniform3fv(progWater.u.uWaterShallow, atmo.waterShallow);
  gl.uniform3fv(progWater.u.uFogCol, atmo.fogCol);
  gl.uniform1f(progWater.u.uFogDensity, atmo.fogDensity);
  gl.uniform1f(progWater.u.uAuroraAmt, atmo.auroraAmt);
  gl.uniform3fv(progWater.u.uSubGlowCol, atmo.subGlowCol);
  gl.uniform1f(progWater.u.uSubGlowAmt, atmo.subGlowAmt);
  gl.uniform3fv(progWater.u.uLanternPos, boat.lanternWorld);
  gl.bindVertexArray(meshes.waterGrid.vao);
  gl.drawElements(gl.TRIANGLES, meshes.waterGrid.count, meshes.waterGrid.indexType, 0);

  // 3. Opaque 3D Realms, Handcrafted Wooden Skiff, Traveler, Oars & Landmarks
  translucentQueue.length = 0;
  gl.useProgram(progWorld.prog);
  gl.uniformMatrix4fv(progWorld.u.uProj, false, matProj);
  gl.uniformMatrix4fv(progWorld.u.uView, false, matView);
  gl.uniform3f(progWorld.u.uCamPos, camPos[0], camPos[1], camPos[2]);
  gl.uniform1f(progWorld.u.uTime, t);
  gl.uniform3fv(progWorld.u.uSunDir, atmo.sunDir);
  gl.uniform3fv(progWorld.u.uSunCol, atmo.sunCol);
  gl.uniform3fv(progWorld.u.uSkyZenith, atmo.skyZenith);
  gl.uniform3fv(progWorld.u.uSkyHorizon, atmo.skyHorizon);
  gl.uniform3fv(progWorld.u.uWaterShallow, atmo.waterShallow);
  gl.uniform3fv(progWorld.u.uFogCol, atmo.fogCol);
  gl.uniform1f(progWorld.u.uFogDensity, atmo.fogDensity);
  gl.uniform3fv(progWorld.u.uLanternPos, boat.lanternWorld);

  const drawWorldMesh = (mesh, modelMat, matId, col, p0 = 0.6, p1 = 1.0, alpha = 1.0) => {
    if (alpha < 0.99) {
      const copy = new Float32Array(modelMat);
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

  // Distance-windowed static realm architecture along the 880m corridor
  const zMinVis = boat.z - 225;
  const zMaxVis = boat.z + 65;
  for (const sd of world.staticDraws) {
    if (sd.z < zMinVis || sd.z > zMaxVis) continue;
    drawWorldMesh(sd.mesh, sd.m, sd.mat, sd.color, sd.params[0], sd.params[1], sd.params[2]);
  }

  // Hero Handcrafted Wooden Skiff, Traveler in Scarf & Dual Animated Oars
  drawWoodenSkiffAndTraveler(drawWorldMesh, meshes, boat, t);

  // Dynamic Floating Lilies, Dusk Lanterns, 3D Jellyfish, Cathedral Bells, Maple Leaves, Sanctuary Beam & 16 Memory Pearls
  drawDynamicWaterWorld(drawWorldMesh, meshes, world, t, boat.z, memoriesCollected);

  // Expanding Golden Chime & Oar Water Rings
  for (const rp of waterRipples) {
    const fade = 1.0 - rp.t / rp.dur;
    const wy = waterWaveHeight(rp.x, rp.z, t) + 0.05;
    M4.trs(matRing, rp.x, wy, rp.z, 0, 0, 0, rp.r * 2.0, 1.0, rp.r * 2.0);
    const col = rp.isChime ? [1.0, 0.84, 0.36] : [0.68, 0.95, 0.92];
    drawWorldMesh(meshes.ring, matRing, 6, col, rp.isChime ? 2.1 : 1.3, 1.0, fade * (rp.isChime ? 0.72 : 0.42));
  }

  // 4. Translucent Pass (3D Bioluminescent Jellyfish Bells, Chime Halos & Sanctuary Light Beams)
  if (translucentQueue.length > 0) {
    gl.enable(gl.BLEND);
    gl.depthMask(false);
    for (const item of translucentQueue) {
      if (item.matId === 6) {
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
      } else {
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      }
      gl.uniformMatrix4fv(progWorld.u.uModel, false, item.modelMat);
      gl.uniform1i(progWorld.u.uMat, item.matId);
      gl.uniform3f(progWorld.u.uColor, item.col[0], item.col[1], item.col[2]);
      gl.uniform3f(progWorld.u.uParams, item.p0, item.p1, item.alpha);
      gl.bindVertexArray(item.mesh.vao);
      gl.drawElements(gl.TRIANGLES, item.mesh.count, item.mesh.indexType, 0);
    }
  }

  // 5. GPU-Instanced Fireflies, Oar-Splash Droplets & Drifting Autumn Maple Leaves
  if (particles.length > 0) {
    const d = particleSys.data;
    const count = Math.min(particles.length, particleSys.maxParticles);
    for (let i = 0; i < count; i++) {
      const p = particles[i];
      const fade = Math.sin(clamp(p.life / p.maxLife, 0, 1) * Math.PI);
      const o = i * 12;
      d[o] = p.x;
      d[o + 1] = p.y;
      d[o + 2] = p.z;
      d[o + 3] = p.size;
      d[o + 4] = p.rot;
      d[o + 5] = p.kind === 2 ? 0.72 : 1.0;
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

  // 6. Painterly Watercolor Kuwahara + Lantern Bloom + Paper-Grain Post-Process
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.viewport(0, 0, canvas.width, canvas.height);
  gl.disable(gl.DEPTH_TEST);
  gl.disable(gl.BLEND);
  gl.depthMask(true);

  gl.useProgram(progPost.prog);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, fboTex);
  gl.uniform1i(progPost.u.uTex, 0);
  gl.uniform2f(progPost.u.uRes, fboW, fboH);
  gl.uniform1f(progPost.u.uTime, t);
  gl.uniform1f(progPost.u.uBrushAmt, brushAmounts[brushPreset]);
  gl.uniform1f(progPost.u.uChimePulse, chimePulse);
  gl.bindVertexArray(postVAO);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
  gl.bindVertexArray(null);

  updateWaypointsAndHUD();
}

// --- Acoustic Oscilloscope in Studio (#wk-scope) ---
const scopeBuf = new Uint8Array(256);
function renderStudioScope() {
  if (!scopeCtx || !studioEl.classList.contains('open')) return;
  const w = scopeCvs.width;
  const h = scopeCvs.height;
  scopeCtx.fillStyle = '#051119';
  scopeCtx.fillRect(0, 0, w, h);
  if (!audio.analyser) return;
  audio.analyser.getByteTimeDomainData(scopeBuf);
  scopeCtx.strokeStyle = '#4fd1c5';
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

// --- Main Loop & FPS Telemetry ---
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
    perfEl.textContent = `${currentFps} FPS · ${brushNames[brushPreset]}`;
  }

  updateSimulation(dt, t);
  updateEffects(dt);
  renderScene(t);
  renderStudioScope();
}
requestAnimationFrame(frame);

// --- Diagnostic & Automated Verification Hook ---
window.__WATERKEEPS__ = {
  getState() {
    return {
      mode,
      fps: currentFps,
      glErr: gl.getError(),
      realmIndex: currentRealmIndex,
      realmName: REALMS[currentRealmIndex].fullName,
      memoriesCollected,
      memoriesTotal: world.memories.length,
      voyageLengthM: TOTAL_VOYAGE_LEN,
      autoRow,
      score,
      boat: {
        x: Number(boat.x.toFixed(2)),
        y: Number(boat.y.toFixed(2)),
        z: Number(boat.z.toFixed(2)),
      },
    };
  },
  startVoyage(auto = false) {
    startVoyage(auto);
    return true;
  },
  warpRealm(idx = 0) {
    return warpRealm(idx);
  },
  ringChime() {
    return ringChime(true);
  },
};
