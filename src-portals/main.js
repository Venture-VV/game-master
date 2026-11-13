import {
  M4,
  clamp,
  lerp,
  damp,
  smoothstep,
  corridorCenterX,
  worldTerrainH,
  PORTAL_Z,
  ENTRANCE_Z,
  PORTAL_SPAN_Z,
} from './math.js';
import {
  PORTAL_SKY_VS,
  PORTAL_SKY_FS,
  PORTAL_WORLD_VS,
  PORTAL_WORLD_FS,
  PORTAL_WINDOW_VS,
  PORTAL_WINDOW_FS,
  PORTAL_INST_VS,
  PORTAL_INST_FS,
  PORTAL_POST_VS,
  PORTAL_POST_FS,
} from './shaders.js';
import {
  createSharedPrimitives,
  createParticleSystem,
  generateWorld,
  disposeWorld,
} from './world.js';
import { PortalsAmbientAudio } from './audio.js';

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
const appEl = document.getElementById('portals-app');
const canvas = document.getElementById('ep-canvas');
const hudEl = document.getElementById('ep-hud');
const overlayEl = document.getElementById('ep-overlay');
const perfEl = document.getElementById('ep-perf');
const worldTagEl = document.getElementById('ep-world-tag');
const worldNameEl = document.getElementById('ep-world-name');
const pipEls = Array.from(document.querySelectorAll('.ep-pip'));
const portalFillEl = document.getElementById('ep-portal-fill');
const toastFeedEl = document.getElementById('ep-toast-feed');
const waypointsEl = document.getElementById('ep-waypoints');
const bannerEl = document.getElementById('ep-banner');
const bannerTitleEl = document.getElementById('ep-banner-title');
const bannerSubEl = document.getElementById('ep-banner-sub');
const speedValEl = document.getElementById('ep-speed-val');
const boostFillEl = document.getElementById('ep-boost-fill');
const comboValEl = document.getElementById('ep-combo-val');
const scoreValEl = document.getElementById('ep-score-val');
const stateValEl = document.getElementById('ep-state-val');

const titleEl = document.getElementById('ep-title');
const descEl = document.getElementById('ep-desc');
const debriefEl = document.getElementById('ep-debrief');
const stWorldEl = document.getElementById('st-world');
const stPortalsEl = document.getElementById('st-portals');
const stRingsEl = document.getElementById('st-rings');
const stScoreEl = document.getElementById('st-score');

const btnStart = document.getElementById('ep-btn-start');
const btnAutoMenu = document.getElementById('ep-btn-auto');
const btnNextMenu = document.getElementById('ep-btn-nextworld');
const btnStudio = document.getElementById('ep-btn-studio');
const studioEl = document.getElementById('ep-studio');
const scaleReadoutEl = document.getElementById('ep-scale-readout');
const scopeCvs = document.getElementById('ep-scope');
const scopeCtx = scopeCvs ? scopeCvs.getContext('2d') : null;

const btnHudAuto = document.getElementById('btn-auto');
const btnHudNext = document.getElementById('btn-next');
const btnHudFs = document.getElementById('btn-fs');
const btnHudPause = document.getElementById('btn-pause');
const seedInputEl = document.getElementById('ep-seed-input');
const btnJumpSeed = document.getElementById('ep-btn-jump');
const touchWrapEl = document.getElementById('ep-touch');

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

const progSky = createProgram(gl, PORTAL_SKY_VS, PORTAL_SKY_FS, [
  'uProj', 'uView', 'uCamPos', 'uSkyZenith', 'uSkyMid', 'uSkyHorizon',
  'uSunDir', 'uSunCol', 'uArchType', 'uSeed', 'uTime',
]);
const progWorld = createProgram(gl, PORTAL_WORLD_VS, PORTAL_WORLD_FS, [
  'uProj', 'uView', 'uModel', 'uTintOverride', 'uCamPos', 'uSunDir', 'uSunCol',
  'uFogCol', 'uFogDensity', 'uArchType', 'uTime', 'uClipMinZ', 'uClipMaxZ', 'uCutPortalBox',
]);
const progPortalWin = createProgram(gl, PORTAL_WINDOW_VS, PORTAL_WINDOW_FS, [
  'uProj', 'uView', 'uModel', 'uPortalTex', 'uViewportSize', 'uCamPos', 'uTime',
]);
const progInst = createProgram(gl, PORTAL_INST_VS, PORTAL_INST_FS, ['uProj', 'uView']);
const progPost = createProgram(gl, PORTAL_POST_VS, PORTAL_POST_FS, [
  'uTex', 'uRushBlur', 'uPortalFlash', 'uTime',
]);

const postVAO = gl.createVertexArray();
const meshes = createSharedPrimitives(gl);
const particleSys = createParticleSystem(gl, 420);
const audio = new PortalsAmbientAudio();

// --- Dual Offscreen FBOs: portalFBO (nextWorld live view) & mainFBO (currentWorld + portal window) ---
let mainFBO = null, mainTex = null, mainDepth = null;
let portalFBO = null, portalTex = null, portalDepth = null;
let fboW = 0, fboH = 0;

let quality = isSoftwareGL ? 'med' : 'high';
const qualityScaleMap = isSoftwareGL
  ? { low: 0.42, med: 0.52, high: 0.68 }
  : { low: 0.68, med: 0.86, high: 1.0 };
document.querySelectorAll('.q-pill').forEach((b) => {
  b.classList.toggle('active', b.dataset.q === quality);
});

function createSingleFBO(w, h) {
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

  const depth = gl.createRenderbuffer();
  gl.bindRenderbuffer(gl.RENDERBUFFER, depth);
  gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT24, w, h);

  const fb = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
  gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, depth);

  gl.bindTexture(gl.TEXTURE_2D, null);
  gl.bindRenderbuffer(gl.RENDERBUFFER, null);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  return { fb, tex, depth };
}

function ensureFBOs() {
  const dpr = Math.min(window.devicePixelRatio || 1, isSoftwareGL ? 1.0 : 1.65);
  const cssW = Math.max(320, appEl.clientWidth || 800);
  const cssH = Math.max(240, appEl.clientHeight || 446);
  const dispW = Math.round(cssW * dpr);
  const dispH = Math.round(cssH * dpr);
  if (canvas.width !== dispW || canvas.height !== dispH) {
    canvas.width = dispW;
    canvas.height = dispH;
  }

  const sc = qualityScaleMap[quality] || 0.84;
  const targetW = Math.max(256, Math.round(dispW * sc));
  const targetH = Math.max(160, Math.round(dispH * sc));
  if (mainFBO && portalFBO && targetW === fboW && targetH === fboH) return;

  fboW = targetW;
  fboH = targetH;

  for (const old of [
    { fb: mainFBO, tex: mainTex, depth: mainDepth },
    { fb: portalFBO, tex: portalTex, depth: portalDepth },
  ]) {
    if (old.fb) gl.deleteFramebuffer(old.fb);
    if (old.tex) gl.deleteTexture(old.tex);
    if (old.depth) gl.deleteRenderbuffer(old.depth);
  }

  const m = createSingleFBO(fboW, fboH);
  mainFBO = m.fb; mainTex = m.tex; mainDepth = m.depth;

  const p = createSingleFBO(fboW, fboH);
  portalFBO = p.fb; portalTex = p.tex; portalDepth = p.depth;
}

new ResizeObserver(() => ensureFBOs()).observe(appEl);
ensureFBOs();

// --- IntersectionObserver to Pause Heavy WebGL Draws When Offscreen ---
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

// --- World State & Endless Dual-World Queue ---
let mode = 'title'; // 'title' | 'playing' | 'paused'
let autopilot = false;
let worldNumber = 1;
let portalsCrossed = 0;
let totalRingsCollected = 0;
let score = 0;
let combo = 1;

let currentWorld = generateWorld(gl, 1);
let nextWorld = generateWorld(gl, 2);

// --- Sky-Glider Player State ---
const player = {
  x: 0.0,
  y: 7.4,
  z: 46.0,
  vx: 0.0,
  vy: 0.0,
  speed: 38.5,
  yaw: 0.0,
  pitch: 0.0,
  roll: 0.0,
  rollSpin: 0.0,
  rollCooldown: 0.0,
  boostMeter: 90.0,
  boostVisual: 0.0,
};

let camPreset = 0; // 0: Cinema Chase, 1: Close Wing, 2: First-Person Cockpit
const camNames = ['天翼追尾机位', '近距掠翼机位', '第一人称星门视角'];
const camPos = [0.0, 9.5, 55.0];
const camLook = [0.0, 7.2, 26.0];
let portalFlash = 0.0;
let bannerTimer = 0.0;

// --- Atmospheric & Glider Wake Particles ---
const particles = [];
function spawnParticle(x, y, z, vx, vy, vz, size, life, r, g, b, a) {
  if (particles.length >= particleSys.maxParticles) return;
  particles.push({ x, y, z, vx, vy, vz, size, life, maxLife: life, r, g, b, a });
}

function emitRingBurst(x, y, z, col) {
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    const sp = 7.0 + Math.random() * 8.0;
    spawnParticle(
      x + Math.cos(a) * 2.2,
      y + Math.sin(a) * 2.2,
      z,
      Math.cos(a) * sp,
      Math.sin(a) * sp,
      -8.0 - Math.random() * 8.0,
      0.65 + Math.random() * 0.45,
      0.65 + Math.random() * 0.35,
      col[0], col[1], col[2], 0.92
    );
  }
}

// --- HUD & Toast Helpers ---
function showToast(msg) {
  const el = document.createElement('div');
  el.className = 'ep-toast';
  el.textContent = msg;
  toastFeedEl.prepend(el);
  while (toastFeedEl.children.length > 3) {
    toastFeedEl.lastElementChild.remove();
  }
  setTimeout(() => el.remove(), 2400);
}

function showWorldBanner(meta) {
  bannerTitleEl.textContent = `WORLD #${meta.padNum} · ${meta.zhName}`;
  bannerSubEl.textContent = `${meta.enName} // ${audio.getScaleLabel().split(' · ')[0]}`;
  bannerEl.classList.add('show');
  bannerTimer = 2.5;
}

function syncWorldHUD() {
  const m = currentWorld.meta;
  worldTagEl.textContent = `WORLD #${m.padNum}`;
  worldNameEl.textContent = m.zhName;
  if (seedInputEl && document.activeElement !== seedInputEl) {
    seedInputEl.value = String(m.worldNumber);
  }
  if (scaleReadoutEl) {
    scaleReadoutEl.textContent = audio.getScaleLabel();
  }
  const collectedInWorld = currentWorld.rings.filter((r) => r.collected).length;
  pipEls.forEach((p, idx) => p.classList.toggle('done', idx < collectedInWorld));

  scoreValEl.textContent = score.toLocaleString();
  stateValEl.textContent = `穿越 ${portalsCrossed} 界 · ${autopilot ? '自动巡航' : '手动滑翔'}`;
  comboValEl.textContent = `×${combo} · ${autopilot ? '巡航锁定' : '谐波共鸣'}`;
  btnHudAuto.classList.toggle('active', autopilot);
  btnHudAuto.textContent = autopilot ? '巡航中 [T]' : '巡航 [T]';
}

// Single reusable 3D Portal Waypoint Badge
const portalWpEl = document.createElement('div');
portalWpEl.className = 'ep-wp';
portalWpEl.innerHTML = `<span id="ep-wp-lbl">NEXT #002</span><i class="ep-wp-diamond"></i>`;
waypointsEl.appendChild(portalWpEl);
const portalWpLbl = portalWpEl.querySelector('#ep-wp-lbl');

// --- Input Controls (Keyboard, Pointer Look, Boost, Roll & Touch) ---
const keys = new Set();
let mouseSteerX = 0.0;
let mouseSteerY = 0.0;
let pointerBoostHeld = false;
let touchSteerX = 0.0;
let touchSteerY = 0.0;
let touchBoostHeld = false;

function triggerBarrelRoll() {
  if (player.rollCooldown > 0 || player.rollSpin > 0.01) return;
  player.rollSpin = Math.PI * 2;
  player.rollCooldown = 0.72;
  player.vy = Math.max(player.vy + 4.5, 3.2);
  audio.playBarrelRoll();
  emitRingBurst(player.x, player.y, player.z - 1.5, [0.18, 0.90, 0.78]);
}

window.addEventListener('keydown', (e) => {
  if (document.activeElement === seedInputEl) {
    if (e.code === 'Enter') {
      btnJumpSeed.click();
    }
    return;
  }
  keys.add(e.code);
  if (e.code === 'Space' && mode === 'playing') {
    e.preventDefault();
    triggerBarrelRoll();
  } else if (e.code === 'KeyT') {
    toggleAutopilot();
  } else if (e.code === 'KeyN') {
    warpNextWorld();
  } else if (e.code === 'KeyC' && mode === 'playing') {
    camPreset = (camPreset + 1) % 3;
    showToast(`机位切换：${camNames[camPreset]}`);
  } else if (e.code === 'KeyP' || e.code === 'Escape') {
    if (mode === 'playing' || mode === 'paused') togglePause();
  }
});

window.addEventListener('keyup', (e) => {
  keys.delete(e.code);
});

canvas.addEventListener('pointermove', (e) => {
  if (mode !== 'playing') return;
  const rect = canvas.getBoundingClientRect();
  if (rect.width < 10 || rect.height < 10) return;
  const nx = ((e.clientX - rect.left) / rect.width) * 2 - 1;
  const ny = ((e.clientY - rect.top) / rect.height) * 2 - 1;
  mouseSteerX = clamp(nx, -1, 1);
  mouseSteerY = clamp(-ny, -1, 1);
});

canvas.addEventListener('pointerleave', () => {
  mouseSteerX = 0;
  mouseSteerY = 0;
  pointerBoostHeld = false;
});

canvas.addEventListener('pointerdown', (e) => {
  if (mode !== 'playing') return;
  audio.init();
  if (e.button === 2) {
    triggerBarrelRoll();
  } else {
    pointerBoostHeld = true;
    audio.playWarpBoost();
  }
});

window.addEventListener('pointerup', () => {
  pointerBoostHeld = false;
});

canvas.addEventListener('contextmenu', (e) => e.preventDefault());

// Coarse-pointer Touch Pad Wiring
const tPad = document.getElementById('ep-t-pad');
const tKnob = document.getElementById('ep-t-knob');
if (tPad && tKnob) {
  const handleTouchMove = (e) => {
    const t = e.touches[0];
    if (!t) return;
    const r = tPad.getBoundingClientRect();
    const dx = clamp((t.clientX - (r.left + r.width * 0.5)) / 40, -1, 1);
    const dy = clamp((t.clientY - (r.top + r.height * 0.5)) / 40, -1, 1);
    touchSteerX = dx;
    touchSteerY = -dy;
    tKnob.style.transform = `translate(${dx * 26}px, ${dy * 26}px)`;
  };
  tPad.addEventListener('touchstart', (e) => { e.preventDefault(); handleTouchMove(e); }, { passive: false });
  tPad.addEventListener('touchmove', (e) => { e.preventDefault(); handleTouchMove(e); }, { passive: false });
  tPad.addEventListener('touchend', () => {
    touchSteerX = 0;
    touchSteerY = 0;
    tKnob.style.transform = 'translate(0, 0)';
  });
}
document.getElementById('ep-tb-roll')?.addEventListener('touchstart', (e) => {
  e.preventDefault();
  triggerBarrelRoll();
}, { passive: false });
document.getElementById('ep-tb-boost')?.addEventListener('touchstart', (e) => {
  e.preventDefault();
  touchBoostHeld = true;
}, { passive: false });
document.getElementById('ep-tb-boost')?.addEventListener('touchend', () => {
  touchBoostHeld = false;
});

// --- Flight Mode Transitions, Autopilot & Instant World Warp ---
function enterFlight(useAutopilot) {
  audio.init();
  audio.setWorldArchetype(currentWorld.meta.archIdx);
  autopilot = Boolean(useAutopilot);
  const wasTitle = mode === 'title';
  mode = 'playing';

  if (wasTitle) {
    player.x = 0.0;
    player.y = 7.4;
    player.z = 46.0;
    player.vx = 0;
    player.vy = 0;
    player.yaw = 0;
    player.pitch = 0;
    player.roll = 0;
    camPos[0] = 0.0;
    camPos[1] = 9.6;
    camPos[2] = 54.6;
    camLook[0] = 0.0;
    camLook[1] = 7.4;
    camLook[2] = 24.0;
    audio.playPortalSwell(currentWorld.meta.archIdx);
    showWorldBanner(currentWorld.meta);
  }

  overlayEl.classList.add('hidden');
  hudEl.classList.add('visible');
  touchWrapEl?.classList.add('active');
  syncWorldHUD();
  canvas.focus();
}

function startFlight() {
  enterFlight(false);
}

function startAutopilot() {
  enterFlight(true);
}

function toggleAutopilot() {
  if (mode === 'title') {
    startAutopilot();
    return;
  }
  autopilot = !autopilot;
  syncWorldHUD();
  showToast(autopilot ? '已开启自动巡航漫游 [T]' : '已切换为手动天翼滑翔');
}

function togglePause() {
  if (mode === 'playing') {
    mode = 'paused';
    overlayEl.classList.remove('hidden');
    debriefEl.classList.add('show');
    stWorldEl.textContent = `#${currentWorld.meta.padNum}`;
    stPortalsEl.textContent = String(portalsCrossed);
    stRingsEl.textContent = String(totalRingsCollected);
    stScoreEl.textContent = score.toLocaleString();
    titleEl.textContent = `星门驻留 · ${currentWorld.meta.zhName}`;
    descEl.textContent = `当前位于 ${currentWorld.meta.worldTitle}，前方传送门正实时映出下一界「${nextWorld.meta.zhName}」的风景。可随时继续滑翔、开启自动巡航或定向跃迁至任意星界。`;
    btnStart.textContent = '继续手动滑翔';
  } else if (mode === 'paused') {
    enterFlight(autopilot);
  }
}

// Seamless Live-Crossing Promotion when camera passes z <= PORTAL_Z (-115.0)
function promoteLivePortalCrossing() {
  disposeWorld(gl, currentWorld);
  currentWorld = nextWorld;
  worldNumber = currentWorld.meta.worldNumber;
  const upcomingNum = (worldNumber % 999) + 1;
  nextWorld = generateWorld(gl, upcomingNum);

  // Exact +170.0m coordinate frame promotion (zero visual discontinuity!)
  player.z += PORTAL_SPAN_Z;
  camPos[2] += PORTAL_SPAN_Z;
  camLook[2] += PORTAL_SPAN_Z;
  for (const p of particles) {
    p.z += PORTAL_SPAN_Z;
  }

  portalsCrossed++;
  score += 500 * combo;
  player.boostMeter = Math.min(100, player.boostMeter + 34);
  portalFlash = 0.88;

  audio.playPortalSwell(currentWorld.meta.archIdx);
  showWorldBanner(currentWorld.meta);
  showToast(`穿越星门 +${500 * combo} · 抵达 #${currentWorld.meta.padNum}`);
  syncWorldHUD();
}

// Instant Warp to Next World or Specific Seed (#001..#999) via [N] / UI / Diagnostic API
function warpNextWorld(targetSeed) {
  audio.init();
  const hasSeed = typeof targetSeed === 'number' && Number.isFinite(targetSeed);
  const destNum = hasSeed ? clamp(Math.round(targetSeed), 1, 999) : (worldNumber % 999) + 1;

  if (destNum === nextWorld.meta.worldNumber) {
    disposeWorld(gl, currentWorld);
    currentWorld = nextWorld;
    nextWorld = generateWorld(gl, (destNum % 999) + 1);
  } else {
    disposeWorld(gl, currentWorld);
    disposeWorld(gl, nextWorld);
    currentWorld = generateWorld(gl, destNum);
    nextWorld = generateWorld(gl, (destNum % 999) + 1);
  }

  worldNumber = currentWorld.meta.worldNumber;
  portalsCrossed++;
  if (mode === 'playing') {
    score += 500;
  }

  player.x = 0.0;
  player.y = 7.4;
  player.z = 46.0;
  player.vx = 0;
  player.vy = 0;
  player.roll = 0;
  camPos[0] = 0.0;
  camPos[1] = 9.6;
  camPos[2] = 54.6;
  camLook[0] = 0.0;
  camLook[1] = 7.4;
  camLook[2] = 24.0;
  particles.length = 0;
  portalFlash = 0.95;

  audio.playPortalSwell(currentWorld.meta.archIdx);
  showWorldBanner(currentWorld.meta);
  syncWorldHUD();

  if (mode === 'paused') {
    stWorldEl.textContent = `#${currentWorld.meta.padNum}`;
    stPortalsEl.textContent = String(portalsCrossed);
    titleEl.textContent = `星门驻留 · ${currentWorld.meta.zhName}`;
  }
  return currentWorld.meta.worldNumber;
}

// --- UI Event Listeners ---
btnStart.addEventListener('click', () => enterFlight(false));
btnAutoMenu.addEventListener('click', () => enterFlight(true));
btnNextMenu.addEventListener('click', () => {
  warpNextWorld();
  if (mode !== 'playing') enterFlight(autopilot);
});
btnHudAuto.addEventListener('click', () => toggleAutopilot());
btnHudNext.addEventListener('click', () => warpNextWorld());
btnHudPause.addEventListener('click', () => togglePause());

btnHudFs.addEventListener('click', () => {
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
  ensureFBOs();
}
document.getElementById('btn-tall')?.addEventListener('click', toggleTallView);
document.getElementById('menu-btn-tall')?.addEventListener('click', toggleTallView);

btnJumpSeed?.addEventListener('click', () => {
  const val = Number(seedInputEl?.value || 1);
  warpNextWorld(val);
  if (mode !== 'playing') enterFlight(autopilot);
});

btnStudio.addEventListener('click', () => {
  audio.init();
  audio.setWorldArchetype(currentWorld.meta.archIdx);
  if (scaleReadoutEl) scaleReadoutEl.textContent = audio.getScaleLabel();
  studioEl.classList.toggle('open');
});

document.querySelectorAll('.ep-sfx-trigger').forEach((btn) => {
  btn.addEventListener('click', () => {
    audio.init();
    const s = btn.dataset.s;
    if (s === 'portal') audio.playPortalSwell(currentWorld.meta.archIdx);
    else if (s === 'ring') audio.playResonanceRing(combo);
    else if (s === 'shard') audio.playAstralShard();
    else if (s === 'pad') audio.playChoralPadPreview();
    else if (s === 'boost') audio.playWarpBoost();
    else if (s === 'roll') audio.playBarrelRoll();
  });
});

document.querySelectorAll('.q-pill').forEach((btn) => {
  btn.addEventListener('click', () => {
    quality = btn.dataset.q;
    document.querySelectorAll('.q-pill').forEach((b) => b.classList.toggle('active', b === btn));
    ensureFBOs();
  });
});

document.getElementById('ep-vol')?.addEventListener('input', (e) => {
  audio.setVolume(Number(e.target.value) / 100);
});

// --- Simulation Update ---
function updateSimulation(dt, t) {
  portalFlash = Math.max(0, portalFlash - dt * 1.9);
  if (bannerTimer > 0) {
    bannerTimer -= dt;
    if (bannerTimer <= 0) bannerEl.classList.remove('show');
  }

  // Ambient world particles around camera
  if (Math.random() < 0.72) {
    const mc = currentWorld.meta.moteCol;
    const arch = currentWorld.meta.archIdx;
    const rise = arch === 1 ? 6.5 : arch === 2 ? 2.4 : -1.2;
    spawnParticle(
      camPos[0] + (Math.random() - 0.5) * 44.0,
      Math.max(0.5, camPos[1] + (Math.random() - 0.5) * 18.0),
      camPos[2] - 12.0 - Math.random() * 64.0,
      (Math.random() - 0.5) * 1.8,
      rise + (Math.random() - 0.5) * 1.5,
      (Math.random() - 0.5) * 1.8,
      0.38 + Math.random() * 0.42,
      1.6 + Math.random() * 1.2,
      mc[0], mc[1], mc[2], 0.76
    );
  }

  // Title Screen: Live Cinematic Parallax Hover right in front of World #001's Portal Archway,
  // showcasing World #002 living in real-time 3D inside the doorway!
  if (mode === 'title') {
    const swayX = Math.sin(t * 0.52) * 4.4;
    const swayY = 7.6 + Math.cos(t * 0.38) * 1.3;
    player.x = swayX * 0.65;
    player.y = swayY - 0.9;
    player.z = -96.5 + Math.sin(t * 0.31) * 3.5;
    player.roll = -Math.cos(t * 0.52) * 0.22;
    player.pitch = 0.03;
    player.yaw = 0.0;

    camPos[0] = swayX;
    camPos[1] = swayY + 1.2;
    camPos[2] = player.z + 9.5;
    camLook[0] = swayX * 0.12;
    camLook[1] = 8.0;
    camLook[2] = PORTAL_Z - 8.0;
    audio.update(dt, false, 0.3, false);
    return;
  }

  if (mode === 'paused') {
    audio.update(dt, false, 0.2, false);
    return;
  }

  // --- Active Sky-Glider Flight (Manual or Hands-Off Autopilot) ---
  player.rollCooldown = Math.max(0, player.rollCooldown - dt);
  if (player.rollSpin > 0) {
    player.rollSpin = Math.max(0, player.rollSpin - dt * 11.4);
  }

  let steerX = 0.0;
  let steerY = 0.0;
  let wantBoost = false;

  if (autopilot) {
    // Mollick Hands-Off Autopilot: gracefully threads Resonance Rings, Shards & Portal Center!
    let targetX = corridorCenterX(currentWorld.meta, player.z - 18.0);
    let targetY = 7.6 + Math.sin(t * 0.9) * 1.1;

    // Look ahead for nearest upcoming Resonance Ring
    for (const r of currentWorld.rings) {
      if (!r.collected && r.z < player.z - 1.5 && r.z > player.z - 46.0) {
        targetX = r.x;
        targetY = r.y;
        break;
      }
    }
    // Align cleanly with Portal Archway center for z < -86
    if (player.z < -86.0) {
      const alignT = smoothstep(-86.0, -106.0, player.z);
      targetX = lerp(targetX, 0.0, alignT);
      targetY = lerp(targetY, 7.8, alignT);
    }

    steerX = clamp((targetX - player.x) * 0.22, -1, 1);
    steerY = clamp((targetY - player.y) * 0.26, -1, 1);
    wantBoost = player.z > -92.0 && player.z < 25.0 && player.boostMeter > 45;
  } else {
    // Manual Interactive Sky-Glider Controls
    let kx = 0, ky = 0;
    if (keys.has('KeyA') || keys.has('ArrowLeft')) kx -= 1;
    if (keys.has('KeyD') || keys.has('ArrowRight')) kx += 1;
    if (keys.has('KeyW') || keys.has('ArrowUp')) ky += 1;
    if (keys.has('KeyS') || keys.has('ArrowDown')) ky -= 1;

    steerX = clamp(kx + mouseSteerX * 0.65 + touchSteerX, -1, 1);
    steerY = clamp(ky + mouseSteerY * 0.65 + touchSteerY, -1, 1);
    wantBoost = (
      keys.has('ShiftLeft') ||
      keys.has('ShiftRight') ||
      pointerBoostHeld ||
      touchBoostHeld
    ) && player.boostMeter > 4.0;
  }

  if (wantBoost) {
    player.boostMeter = Math.max(0, player.boostMeter - 22.0 * dt);
    player.boostVisual = damp(player.boostVisual, 1.0, 9.0, dt);
  } else {
    player.boostMeter = Math.min(100, player.boostMeter + 9.5 * dt);
    player.boostVisual = damp(player.boostVisual, 0.0, 6.0, dt);
  }

  const targetSpeed = wantBoost ? 58.0 : 38.5;
  player.speed = damp(player.speed, targetSpeed, 5.5, dt);

  player.vx = damp(player.vx, steerX * 24.0, 7.5, dt);
  player.vy = damp(player.vy, steerY * 16.5, 7.5, dt);

  player.x += player.vx * dt;
  player.y += player.vy * dt;
  player.z -= player.speed * dt;

  // Soft canyon & floor updraft cushion (zero frustrating crash screens!)
  const cx = corridorCenterX(currentWorld.meta, player.z);
  const maxOffset = player.z < -95.0 ? 10.0 : 22.0;
  if (player.x > cx + maxOffset) {
    player.x = damp(player.x, cx + maxOffset, 10, dt);
    player.vx *= 0.8;
  } else if (player.x < cx - maxOffset) {
    player.x = damp(player.x, cx - maxOffset, 10, dt);
    player.vx *= 0.8;
  }

  const groundY = Math.max(-1.0, worldTerrainH(currentWorld.meta, player.x, player.z));
  const minSafeY = player.z < -105.0 ? 2.4 : groundY + 2.2;
  if (player.y < minSafeY) {
    player.y = damp(player.y, minSafeY + 0.6, 14, dt);
    player.vy = Math.max(0, player.vy);
  } else if (player.y > 22.0) {
    player.y = damp(player.y, 22.0, 10, dt);
  }

  // Astral Portal Tractor Funnel (z in [-98 .. -115]) guides glider right through the 11m x 16m doorway!
  if (player.z < -96.0) {
    const funnel = smoothstep(-96.0, -112.5, player.z);
    const clampedDoorX = clamp(player.x, -3.4, 3.4);
    const clampedDoorY = clamp(player.y, 3.8, 12.2);
    player.x = lerp(player.x, clampedDoorX * (1.0 - funnel * 0.65), funnel * 0.42);
    player.y = lerp(player.y, lerp(clampedDoorY, 7.8, funnel * 0.55), funnel * 0.42);
  }

  player.yaw = damp(player.yaw, -player.vx * 0.016, 8.0, dt);
  player.pitch = damp(player.pitch, player.vy * 0.022, 8.0, dt);
  player.roll = damp(player.roll, -steerX * 0.58, 9.0, dt);

  // Emit Luminous Glider Wingtip Slipstream Contrails
  const totalRoll = player.roll + player.rollSpin;
  const cr = Math.cos(totalRoll), sr = Math.sin(totalRoll);
  for (const s of [-1, 1]) {
    const wx = player.x + s * 2.3 * cr;
    const wy = player.y + s * 2.3 * sr;
    const wz = player.z + 0.85;
    spawnParticle(
      wx, wy, wz,
      0, 0, player.speed * 0.16,
      wantBoost ? 0.34 : 0.22,
      wantBoost ? 0.42 : 0.28,
      wantBoost ? 0.98 : 0.18,
      wantBoost ? 0.74 : 0.90,
      wantBoost ? 0.22 : 0.80,
      0.78
    );
  }

  // Check Collectibles: Resonance Rings & Astral Shards
  const magnetBonus = player.rollSpin > 0.05 ? 3.2 : wantBoost ? 1.4 : 0.0;
  for (const ring of currentWorld.rings) {
    if (ring.collected) continue;
    const dz = Math.abs(player.z - ring.z);
    const dxy = Math.hypot(player.x - ring.x, player.y - ring.y);
    if (dz < 3.4 && dxy < ring.radius + 1.4 + magnetBonus) {
      ring.collected = true;
      totalRingsCollected++;
      combo = Math.min(4, combo + 1);
      const pts = 250 * combo;
      score += pts;
      player.boostMeter = Math.min(100, player.boostMeter + 28);
      audio.playResonanceRing(combo);
      emitRingBurst(ring.x, ring.y, ring.z, [0.98, 0.74, 0.20]);
      showToast(`星界共振环 ×${combo} +${pts}`);
      if (autopilot && combo === 4 && Math.random() < 0.5) {
        triggerBarrelRoll();
      }
      syncWorldHUD();
    }
  }

  for (const sh of currentWorld.shards) {
    if (sh.collected) continue;
    const d = Math.hypot(player.x - sh.x, player.y - sh.y, player.z - sh.z);
    if (d < 3.2 + magnetBonus * 1.4) {
      sh.collected = true;
      score += 200;
      player.boostMeter = Math.min(100, player.boostMeter + 12);
      audio.playAstralShard();
      emitRingBurst(sh.x, sh.y, sh.z, [0.18, 0.92, 0.82]);
      scoreValEl.textContent = score.toLocaleString();
    }
  }

  // Update Third-Person / Cockpit Cinema Camera
  const cfg = [
    { dist: 9.8, up: 2.35, lookAhead: 15.0 },
    { dist: 6.2, up: 1.55, lookAhead: 17.0 },
    { dist: -0.6, up: 0.35, lookAhead: 22.0 },
  ][camPreset];

  const desiredCamX = player.x * (player.z < -104.0 ? 0.65 : 0.86);
  const desiredCamY = player.y + cfg.up;
  const desiredCamZ = player.z + cfg.dist;

  camPos[0] = damp(camPos[0], desiredCamX, 12.0, dt);
  camPos[1] = damp(camPos[1], desiredCamY, 12.0, dt);
  camPos[2] = desiredCamZ;

  camLook[0] = damp(camLook[0], player.x * 0.55, 14.0, dt);
  camLook[1] = damp(camLook[1], player.y + 0.25, 14.0, dt);
  camLook[2] = player.z - cfg.lookAhead;

  // Seamless Live Portal Threshold Promotion right as the camera crosses z <= -115.0!
  if (camPos[2] <= PORTAL_Z) {
    promoteLivePortalCrossing();
  }

  // Update Real-Time Telemetry Bars
  const kmh = Math.round(player.speed * 3.6);
  speedValEl.textContent = String(kmh);
  boostFillEl.style.width = `${Math.round(player.boostMeter)}%`;
  const progPct = clamp(((ENTRANCE_Z - player.z) / PORTAL_SPAN_Z) * 100, 0, 100);
  portalFillEl.style.width = `${progPct.toFixed(1)}%`;

  audio.update(dt, true, clamp((player.speed - 35) / 25, 0, 1), wantBoost);
}

function updateParticles(dt) {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.life -= dt;
    if (p.life <= 0) {
      particles[i] = particles[particles.length - 1];
      particles.pop();
      continue;
    }
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.z += p.vz * dt;
  }
}

// --- Reusable Matrices for Zero-GC Rendering ---
const matProj = M4.create();
const matViewMain = M4.create();
const matViewPortal = M4.create();
const matVP = M4.create();
const matIdentity = M4.create();
const matTemp = M4.create();

// Render a single 3D World (either nextWorld into portalFBO or currentWorld into mainFBO)
function renderWorldScene(world, viewMat, eyeX, eyeY, eyeZ, t, clipMinZ, clipMaxZ, cutPortalBox) {
  const meta = world.meta;

  // 1. Procedural Archetype Skybox
  gl.disable(gl.DEPTH_TEST);
  gl.depthMask(false);
  gl.disable(gl.CULL_FACE);
  gl.disable(gl.BLEND);

  gl.useProgram(progSky.prog);
  gl.uniformMatrix4fv(progSky.u.uProj, false, matProj);
  gl.uniformMatrix4fv(progSky.u.uView, false, viewMat);
  gl.uniform3f(progSky.u.uCamPos, eyeX, eyeY, eyeZ);
  gl.uniform3fv(progSky.u.uSkyZenith, meta.skyZenith);
  gl.uniform3fv(progSky.u.uSkyMid, meta.skyMid);
  gl.uniform3fv(progSky.u.uSkyHorizon, meta.skyHorizon);
  gl.uniform3fv(progSky.u.uSunDir, meta.sunDir);
  gl.uniform3fv(progSky.u.uSunCol, meta.sunCol);
  gl.uniform1i(progSky.u.uArchType, meta.archIdx);
  gl.uniform1f(progSky.u.uSeed, meta.seedFloat);
  gl.uniform1f(progSky.u.uTime, t);
  gl.bindVertexArray(meshes.skySphere.vao);
  gl.drawElements(gl.TRIANGLES, meshes.skySphere.count, meshes.skySphere.indexType, 0);

  // 2. Terrain + Merged Surreal Architecture + Kinetic Spinners + Collectibles
  gl.enable(gl.DEPTH_TEST);
  gl.depthFunc(gl.LEQUAL);
  gl.depthMask(true);

  gl.useProgram(progWorld.prog);
  gl.uniformMatrix4fv(progWorld.u.uProj, false, matProj);
  gl.uniformMatrix4fv(progWorld.u.uView, false, viewMat);
  gl.uniform3f(progWorld.u.uCamPos, eyeX, eyeY, eyeZ);
  gl.uniform3fv(progWorld.u.uSunDir, meta.sunDir);
  gl.uniform3fv(progWorld.u.uSunCol, meta.sunCol);
  gl.uniform3fv(progWorld.u.uFogCol, meta.fogCol);
  gl.uniform1f(progWorld.u.uFogDensity, meta.fogDensity);
  gl.uniform1i(progWorld.u.uArchType, meta.archIdx);
  gl.uniform1f(progWorld.u.uTime, t);
  gl.uniform1f(progWorld.u.uClipMinZ, clipMinZ);
  gl.uniform1f(progWorld.u.uClipMaxZ, clipMaxZ);
  gl.uniform1i(progWorld.u.uCutPortalBox, cutPortalBox);

  // Use vertex aColMat directly (uTintOverride.w = -1.0)
  gl.uniform4f(progWorld.u.uTintOverride, 1, 1, 1, -1.0);
  gl.uniformMatrix4fv(progWorld.u.uModel, false, matIdentity);

  // Draw Terrain (1 draw call)
  gl.bindVertexArray(world.terrainMesh.vao);
  gl.drawElements(gl.TRIANGLES, world.terrainMesh.count, world.terrainMesh.indexType, 0);

  // Draw All Static Monuments & Portal Archway (1 draw call!)
  gl.bindVertexArray(world.archMesh.vao);
  gl.drawElements(gl.TRIANGLES, world.archMesh.count, world.archMesh.indexType, 0);

  // Draw Kinetic Wonders (Rotating Brass Astrolabes, Wind-Vanes, Kelp Halos & Armillary Spheres)
  for (const sp of world.spinners) {
    const ang = t * sp.speed + sp.phase;
    if (sp.kind === 'windVane') {
      M4.trs(matTemp, sp.x, sp.y, sp.z, 0, Math.PI * 0.5, ang, sp.scale, sp.scale, sp.scale);
      gl.uniformMatrix4fv(progWorld.u.uModel, false, matTemp);
      gl.uniform4f(progWorld.u.uTintOverride, sp.col[0], sp.col[1], sp.col[2], sp.mat);
      gl.bindVertexArray(meshes.windVane.vao);
      gl.drawElements(gl.TRIANGLES, meshes.windVane.count, meshes.windVane.indexType, 0);
    } else {
      const rx = sp.kind === 'astrolabeTilt' ? Math.sin(ang * 0.7) * 0.55 : sp.kind === 'kelpHalo' ? Math.sin(ang) * 0.18 : 0.14;
      const ry = sp.kind === 'astrolabeTilt' ? Math.cos(ang * 0.5) * 0.45 : 0.0;
      M4.trs(matTemp, sp.x, sp.y, sp.z, rx, ry, ang, sp.scale, sp.scale, sp.scale * 1.4);
      gl.uniformMatrix4fv(progWorld.u.uModel, false, matTemp);
      gl.uniform4f(progWorld.u.uTintOverride, sp.col[0], sp.col[1], sp.col[2], sp.mat);
      gl.bindVertexArray(meshes.torus.vao);
      gl.drawElements(gl.TRIANGLES, meshes.torus.count, meshes.torus.indexType, 0);
    }
  }

  // Draw Glowing Resonance Rings
  gl.bindVertexArray(meshes.torus.vao);
  for (const ring of world.rings) {
    if (ring.collected) continue;
    const pulse = 1.0 + Math.sin(t * 3.8 + ring.pulse) * 0.05;
    M4.trs(matTemp, ring.x, ring.y, ring.z, 0, 0, t * 1.2 + ring.pulse, ring.radius * pulse, ring.radius * pulse, ring.radius * 1.6);
    gl.uniformMatrix4fv(progWorld.u.uModel, false, matTemp);
    gl.uniform4f(progWorld.u.uTintOverride, 0.98, 0.72, 0.18, 3.8);
    gl.drawElements(gl.TRIANGLES, meshes.torus.count, meshes.torus.indexType, 0);

    // Inner turquoise harmonic ring
    M4.trs(matTemp, ring.x, ring.y, ring.z, 0, 0, -t * 1.8, ring.radius * 0.86, ring.radius * 0.86, ring.radius * 1.1);
    gl.uniformMatrix4fv(progWorld.u.uModel, false, matTemp);
    gl.uniform4f(progWorld.u.uTintOverride, 0.18, 0.90, 0.80, 3.7);
    gl.drawElements(gl.TRIANGLES, meshes.torus.count, meshes.torus.indexType, 0);
  }

  // Draw Sparkling Astral Shards (+200)
  gl.bindVertexArray(meshes.octa.vao);
  for (const sh of world.shards) {
    if (sh.collected) continue;
    const bob = Math.sin(t * 3.2 + sh.rot) * 0.35;
    M4.trs(matTemp, sh.x, sh.y + bob, sh.z, 0.25, t * 2.4 + sh.rot, 0, 0.95, 1.15, 0.95);
    gl.uniformMatrix4fv(progWorld.u.uModel, false, matTemp);
    gl.uniform4f(progWorld.u.uTintOverride, 0.22, 0.94, 0.84, 3.9);
    gl.drawElements(gl.TRIANGLES, meshes.octa.count, meshes.octa.indexType, 0);
  }
}

function drawPlayerGliderInPass(zOffset, clipMinZ, clipMaxZ) {
  if (camPreset === 2 && mode === 'playing') return;
  gl.useProgram(progWorld.prog);
  gl.uniform1f(progWorld.u.uClipMinZ, clipMinZ);
  gl.uniform1f(progWorld.u.uClipMaxZ, clipMaxZ);
  gl.uniform1i(progWorld.u.uCutPortalBox, 0);
  gl.uniform4f(progWorld.u.uTintOverride, 1, 1, 1, -1.0);

  M4.trs(
    matTemp,
    player.x,
    player.y,
    player.z + zOffset,
    player.pitch,
    player.yaw,
    player.roll + player.rollSpin,
    1.0,
    1.0,
    1.0
  );
  gl.uniformMatrix4fv(progWorld.u.uModel, false, matTemp);
  gl.bindVertexArray(meshes.glider.vao);
  gl.drawElements(gl.TRIANGLES, meshes.glider.count, meshes.glider.indexType, 0);
}

function renderScene(t) {
  const fovDeg = 62.0 + player.boostVisual * 8.5;
  M4.perspective(matProj, (fovDeg * Math.PI) / 180, fboW / fboH, 0.22, 760.0);

  // Ensure portalTex is unbound from TEXTURE0 before rendering into portalFBO!
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, null);

  // =========================================================================
  // PASS 1: Render nextWorld into Offscreen portalFBO (Offset +170m along Z!)
  // =========================================================================
  const pEyeX = camPos[0];
  const pEyeY = camPos[1];
  const pEyeZ = camPos[2] + PORTAL_SPAN_Z;
  M4.lookAt(
    matViewPortal,
    pEyeX, pEyeY, pEyeZ,
    camLook[0], camLook[1], camLook[2] + PORTAL_SPAN_Z,
    0, 1, 0
  );

  gl.bindFramebuffer(gl.FRAMEBUFFER, portalFBO);
  gl.viewport(0, 0, fboW, fboH);
  gl.depthMask(true);
  gl.clearColor(nextWorld.meta.fogCol[0], nextWorld.meta.fogCol[1], nextWorld.meta.fogCol[2], 1.0);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

  // Clip anything behind z = +54.78 in nextWorld so near-side geometry never blocks the portal camera!
  renderWorldScene(nextWorld, matViewPortal, pEyeX, pEyeY, pEyeZ, t, -9999.0, ENTRANCE_Z - 0.22, 0);

  // If the Sky-Glider nose is slicing across z = -115.0, draw its emerged half inside nextWorld!
  if (player.z < PORTAL_Z + 3.0) {
    drawPlayerGliderInPass(PORTAL_SPAN_Z, -9999.0, ENTRANCE_Z + 0.02);
  }

  // =========================================================================
  // PASS 2: Render currentWorld + Live Portal Window into Offscreen mainFBO
  // =========================================================================
  M4.lookAt(
    matViewMain,
    camPos[0], camPos[1], camPos[2],
    camLook[0], camLook[1], camLook[2],
    0, 1, 0
  );
  M4.mul(matVP, matProj, matViewMain);

  gl.bindFramebuffer(gl.FRAMEBUFFER, mainFBO);
  gl.viewport(0, 0, fboW, fboH);
  gl.depthMask(true);
  gl.clearColor(currentWorld.meta.fogCol[0], currentWorld.meta.fogCol[1], currentWorld.meta.fogCol[2], 1.0);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

  renderWorldScene(currentWorld, matViewMain, camPos[0], camPos[1], camPos[2], t, -9999.0, 9999.0, 1);

  // Draw Sky-Glider in currentWorld (clipped cleanly at z = -115.02 as it enters the portal plane!)
  drawPlayerGliderInPass(0.0, PORTAL_Z - 0.02, 9999.0);

  // Draw the 5-Sided Live Portal Doorway Window at z = -115.0 sampling portalTex!
  gl.useProgram(progPortalWin.prog);
  gl.uniformMatrix4fv(progPortalWin.u.uProj, false, matProj);
  gl.uniformMatrix4fv(progPortalWin.u.uView, false, matViewMain);
  M4.trs(matTemp, 0, 0, PORTAL_Z, 0, 0, 0, 1, 1, 1);
  gl.uniformMatrix4fv(progPortalWin.u.uModel, false, matTemp);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, portalTex);
  gl.uniform1i(progPortalWin.u.uPortalTex, 0);
  gl.uniform2f(progPortalWin.u.uViewportSize, fboW, fboH);
  gl.uniform3f(progPortalWin.u.uCamPos, camPos[0], camPos[1], camPos[2]);
  gl.uniform1f(progPortalWin.u.uTime, t);
  gl.bindVertexArray(meshes.portalPocket.vao);
  gl.drawElements(gl.TRIANGLES, meshes.portalPocket.count, meshes.portalPocket.indexType, 0);
  gl.bindTexture(gl.TEXTURE_2D, null);

  // Draw GPU-Instanced Spores, Embers & Wingtip Slipstream Particles
  if (particles.length > 0) {
    const d = particleSys.data;
    const count = Math.min(particles.length, particleSys.maxParticles);
    for (let i = 0; i < count; i++) {
      const p = particles[i];
      const fade = clamp(p.life / p.maxLife, 0, 1);
      const o = i * 8;
      d[o] = p.x;
      d[o + 1] = p.y;
      d[o + 2] = p.z;
      d[o + 3] = p.size;
      d[o + 4] = p.r;
      d[o + 5] = p.g;
      d[o + 6] = p.b;
      d[o + 7] = p.a * fade;
    }
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
    gl.depthMask(false);
    gl.useProgram(progInst.prog);
    gl.uniformMatrix4fv(progInst.u.uProj, false, matProj);
    gl.uniformMatrix4fv(progInst.u.uView, false, matViewMain);
    gl.bindVertexArray(particleSys.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, particleSys.instVBO);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, d.subarray(0, count * 8));
    gl.drawElementsInstanced(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0, count);
    gl.disable(gl.BLEND);
  }

  // =========================================================================
  // PASS 3: Fullscreen ACES Filmic Post-Process & Portal Shimmer to Canvas
  // =========================================================================
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.viewport(0, 0, canvas.width, canvas.height);
  gl.disable(gl.DEPTH_TEST);
  gl.depthMask(true);

  gl.useProgram(progPost.prog);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, mainTex);
  gl.uniform1i(progPost.u.uTex, 0);
  gl.uniform1f(progPost.u.uRushBlur, player.boostVisual);
  gl.uniform1f(progPost.u.uPortalFlash, portalFlash);
  gl.uniform1f(progPost.u.uTime, t);
  gl.bindVertexArray(postVAO);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
  gl.bindVertexArray(null);
  gl.bindTexture(gl.TEXTURE_2D, null);

  // Project Next-World Portal Waypoint above the Archway Crown when playing (clear of arrival banner)
  if (mode === 'playing' && bannerTimer <= 0.05 && player.z > PORTAL_Z + 18.0) {
    const cssW = appEl.clientWidth || 800;
    const cssH = appEl.clientHeight || 446;
    const sp = M4.projectToScreen(matVP, 0, 21.8, PORTAL_Z, cssW, cssH);
    if (sp && sp.x > 60 && sp.x < cssW - 60 && sp.y > 68 && sp.y < cssH - 72) {
      const distM = Math.max(0, Math.round(player.z - PORTAL_Z));
      portalWpLbl.textContent = `下界 #${nextWorld.meta.padNum} · ${nextWorld.meta.zhName} (${distM}m)`;
      portalWpEl.style.display = 'flex';
      portalWpEl.style.left = `${sp.x.toFixed(1)}px`;
      portalWpEl.style.top = `${sp.y.toFixed(1)}px`;
    } else {
      portalWpEl.style.display = 'none';
    }
  } else {
    portalWpEl.style.display = 'none';
  }
}

// --- Acoustic Oscilloscope in #ep-studio ---
const scopeBuf = new Uint8Array(256);
function renderStudioScope() {
  if (!scopeCtx || !studioEl.classList.contains('open')) return;
  const w = scopeCvs.width;
  const h = scopeCvs.height;
  scopeCtx.fillStyle = '#060a10';
  scopeCtx.fillRect(0, 0, w, h);
  if (!audio.analyser) return;
  audio.analyser.getByteTimeDomainData(scopeBuf);
  scopeCtx.strokeStyle = '#2dd4bf';
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

// --- Main Animation Loop & FPS Readout ---
let lastTime = performance.now();
let fpsFrames = 0;
let fpsAccum = 0;
let currentFps = 60;

syncWorldHUD();

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
    perfEl.textContent = `${currentFps} FPS · 实景星门`;
  }

  updateSimulation(dt, t);
  updateParticles(dt);
  renderScene(t);
  renderStudioScope();
}
requestAnimationFrame(frame);

// --- Diagnostic & Automated Verification Hook ---
window.__PORTALS__ = {
  getState() {
    return {
      mode,
      autopilot,
      fps: currentFps,
      glErr: gl.getError(),
      worldNumber,
      worldTitle: currentWorld.meta.worldTitle,
      portalsCrossed,
      score,
      player: {
        x: Number(player.x.toFixed(2)),
        y: Number(player.y.toFixed(2)),
        z: Number(player.z.toFixed(2)),
      },
    };
  },
  startFlight,
  startAutopilot,
  warpNextWorld,
};
