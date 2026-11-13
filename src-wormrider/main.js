import {
  M4,
  clamp,
  lerp,
  damp,
  wrapAngle,
  spiceMask,
  duneH,
} from './math.js';
import {
  DUNE_SKY_VS,
  DUNE_SKY_FS,
  DUNE_WORLD_VS,
  DUNE_WORLD_FS,
  DUNE_INST_VS,
  DUNE_INST_FS,
  DUNE_POST_VS,
  DUNE_POST_FS,
} from './shaders.js';
import {
  createDesertPrimitives,
  buildDesertArena,
  createSandParticleSystem,
  drawFremenWarrior,
  drawColossalSandworm,
  drawImperialForces,
} from './world.js';
import { DesertCinemaAudio } from './audio.js';

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
const appEl = document.getElementById('wormrider-app');
const canvas = document.getElementById('wr-canvas');
const hudEl = document.getElementById('wr-hud');
const overlayEl = document.getElementById('wr-overlay');
const perfEl = document.getElementById('wr-perf');
const compassEl = document.getElementById('wr-compass');
const stageTagEl = document.getElementById('wr-stage-tag');
const stageDescEl = document.getElementById('wr-stage-desc');
const pipEls = Array.from(document.querySelectorAll('.wr-pip'));
const bossWrapEl = document.getElementById('wr-boss-wrap');
const bossPctEl = document.getElementById('wr-boss-pct');
const bossFillEl = document.getElementById('wr-boss-fill');
const toastFeedEl = document.getElementById('wr-toast-feed');
const waypointsEl = document.getElementById('wr-waypoints');
const hookPromptEl = document.getElementById('wr-hook-prompt');
const bannerEl = document.getElementById('wr-banner');
const bannerTitleEl = document.getElementById('wr-banner-title');
const bannerSubEl = document.getElementById('wr-banner-sub');
const speedValEl = document.getElementById('wr-speed-val');
const diveFillEl = document.getElementById('wr-dive-fill');
const spiceFillEl = document.getElementById('wr-spice-fill');
const armorPipEls = Array.from(document.querySelectorAll('#wr-armor-pips .armor-pip'));
const scoreValEl = document.getElementById('wr-score-val');
const stateValEl = document.getElementById('wr-state-val');

const kickerEl = document.getElementById('wr-kicker');
const titleEl = document.getElementById('wr-title');
const descEl = document.getElementById('wr-desc');
const debriefEl = document.getElementById('wr-debrief');
const stTimeEl = document.getElementById('st-time');
const stHarvEl = document.getElementById('st-harv');
const stOrniEl = document.getElementById('st-orni');
const stScoreEl = document.getElementById('st-score');
const stRankEl = document.getElementById('st-rank');

const btnStart = document.getElementById('wr-btn-start');
const btnQuickRide = document.getElementById('wr-btn-quickride');
const btnFreeRide = document.getElementById('wr-btn-freeride');
const btnRestart = document.getElementById('wr-btn-restart');
const btnStudio = document.getElementById('wr-btn-studio');
const studioEl = document.getElementById('wr-studio');
const scopeCvs = document.getElementById('wr-scope');
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

const progSky = createProgram(gl, DUNE_SKY_VS, DUNE_SKY_FS, ['uProj', 'uView', 'uCamPos', 'uTime']);
const progWorld = createProgram(gl, DUNE_WORLD_VS, DUNE_WORLD_FS, [
  'uProj',
  'uView',
  'uModel',
  'uMat',
  'uBurrow',
  'uColor',
  'uParams',
  'uCamPos',
  'uTime',
  'uSpiceGlow',
]);
const progInst = createProgram(gl, DUNE_INST_VS, DUNE_INST_FS, ['uProj', 'uView']);
const progPost = createProgram(gl, DUNE_POST_VS, DUNE_POST_FS, [
  'uTex',
  'uRes',
  'uTime',
  'uHeatAmt',
  'uRushBlur',
  'uSubmerged',
]);

const postVAO = gl.createVertexArray();
const meshes = createDesertPrimitives(gl);
let arena = buildDesertArena(meshes);
const particleSys = createSandParticleSystem(gl, 520);
const audio = new DesertCinemaAudio();

// --- Offscreen Post-Process FBO ---
let fbo = null;
let fboTex = null;
let fboDepth = null;
let fboW = 0;
let fboH = 0;
let quality = isSoftwareGL ? 'med' : 'high';
const qualityScaleMap = isSoftwareGL
  ? { low: 0.5, med: 0.65, high: 0.78 }
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

// --- Particle Pool (Sand Spray, Spice Geysers & Wreckage Shards) ---
const particles = [];
function spawnParticle(x, y, z, vx, vy, vz, size, grow, life, r, g, b, a, kind = 0, grav = 9.0) {
  if (particles.length >= particleSys.maxParticles) return;
  particles.push({
    x, y, z, vx, vy, vz,
    size, grow, life, maxLife: life,
    r, g, b, a, kind, grav,
    rot: Math.random() * 6.28,
    vrot: (Math.random() - 0.5) * 3.5,
  });
}

function emitSandBurst(x, y, z, count, speed, scale = 2.6, spiceTint = 0) {
  for (let i = 0; i < count; i++) {
    const ang = Math.random() * Math.PI * 2;
    const sp = speed * (0.35 + Math.random() * 0.85);
    const cr = lerp(0.88, 1.0, spiceTint);
    const cg = lerp(0.60, 0.38, spiceTint);
    const cb = lerp(0.32, 0.08, spiceTint);
    spawnParticle(
      x + (Math.random() - 0.5) * 3.2,
      y + Math.random() * 1.6,
      z + (Math.random() - 0.5) * 3.2,
      Math.cos(ang) * sp,
      speed * (0.45 + Math.random() * 0.9),
      Math.sin(ang) * sp,
      scale * (0.7 + Math.random() * 0.7),
      4.2,
      0.75 + Math.random() * 0.65,
      cr, cg, cb, 0.62,
      0,
      11.5
    );
  }
}

function emitWreckageExplosion(x, y, z, mega = false) {
  const nShards = mega ? 44 : 24;
  for (let i = 0; i < nShards; i++) {
    const a = Math.random() * Math.PI * 2;
    const sp = (mega ? 22 : 14) * (0.35 + Math.random() * 0.85);
    const hot = i % 2 === 0;
    spawnParticle(
      x + (Math.random() - 0.5) * 3.0,
      y + 1.2 + Math.random() * 2.5,
      z + (Math.random() - 0.5) * 3.0,
      Math.cos(a) * sp,
      8 + Math.random() * (mega ? 20 : 13),
      Math.sin(a) * sp,
      hot ? 0.85 : 1.15,
      0.0,
      0.85 + Math.random() * 0.7,
      hot ? 1.0 : 0.32,
      hot ? 0.58 : 0.27,
      hot ? 0.14 : 0.22,
      0.95,
      1,
      18.0
    );
  }
  emitSandBurst(x, y, z, mega ? 34 : 18, mega ? 16 : 10, mega ? 4.4 : 3.0, 0.85);
}

// Expanding 3D Seismic Shockwave Rings
const shockRings = [];
function spawnShockRing(x, y, z, maxRadius = 22, dur = 0.85, col = [1.0, 0.66, 0.20]) {
  shockRings.push({ x, y: y + 0.35, z, r: 1.5, maxRadius, t: 0, dur, col });
}

// --- Colossal 26-Segment Sandworm State ---
const NUM_SEGS = 26;
const SEG_DIST = 2.55;
const worm = {
  x: 0,
  y: 0,
  z: 18,
  vy: 0,
  yaw: 0,
  pitch: 0,
  roll: 0,
  speed: 26,
  jawOpen: 0.15,
  submerged: 0,        // 0..1 smooth depth factor
  airborne: false,
  wasSubmerged: false,
  diveCharge: 0,       // 0..1 charge built while holding Dive
  spiceMeter: 55,      // 0..100 Melange Overdrive reserve
  spiceGlow: 0,        // 0..1 glowing carapace fissures
  segments: [],
};

function createWormSegments(startX, startZ, yaw = 0) {
  worm.x = startX;
  worm.z = startZ;
  worm.yaw = yaw;
  worm.pitch = 0;
  worm.roll = 0;
  worm.vy = 0;
  worm.airborne = false;
  worm.wasSubmerged = false;
  worm.submerged = 0;
  worm.diveCharge = 0;
  worm.y = duneH(startX, startZ) + 1.25;
  worm.segments = [];
  const fwdX = -Math.sin(yaw);
  const fwdZ = -Math.cos(yaw);
  for (let i = 0; i < NUM_SEGS; i++) {
    const sx = startX - fwdX * i * SEG_DIST;
    const sz = startZ - fwdZ * i * SEG_DIST;
    const taper = i === 0 ? 3.35 : i <= 3 ? 3.55 - (i - 1) * 0.06 : lerp(3.32, 1.05, (i - 4) / (NUM_SEGS - 5));
    worm.segments.push({
      x: sx,
      y: duneH(sx, sz) + 1.15,
      z: sz,
      yaw,
      pitch: 0,
      roll: 0,
      r: taper,
    });
  }
}
createWormSegments(0, 26, 0.35);

// --- Fremen Warrior & Game Campaign State ---
const fremen = {
  x: 0,
  y: duneH(0, 60.5),
  z: 60.5,
  yaw: 0,
  thumperX: 0,
  thumperZ: 55.2,
  hookCableT: 0,
};

let mode = 'title';          // 'title' | 'playing' | 'paused' | 'victory'
let playPhase = 'riding';    // 'summon' | 'riding' | 'freeroam'
let summonTimer = 0;
let nextThumpAt = 0.08;
let campaignTime = 0;
let score = 0;
let harvestersDevoured = 0;
let orniKills = 0;
let armorPips = 4;
let damageCooldown = 0;
let camPreset = 0;           // 0: Colossal Chase, 1: Close Rider Shoulder, 2: Wide Epic Cinema
let hazePreset = 1;          // 0: Low (0.35), 1: High (1.0), 2: Extreme (1.75)
const hazeValues = [0.35, 1.0, 1.75];
const hazeNames = ['清冽大漠', '炽热蜃景', '熔金烈日'];
const camNames = ['巨物追尾', '驭虫肩后', '史诗远景'];

let camPos = [0, 18, 72];
let camLook = [0, 4, 20];
let camShake = 0;
let lookYawOffset = 0;
let lookPitchOffset = 0;
let bannerTimer = 0;

// --- Input State ---
const keys = new Set();
let diveHeld = false;
let boostHeld = false;
let touchSteer = 0;

function showToast(msg) {
  const el = document.createElement('div');
  el.className = 'wr-toast';
  el.textContent = msg;
  toastFeedEl.appendChild(el);
  while (toastFeedEl.children.length > 4) {
    toastFeedEl.removeChild(toastFeedEl.firstChild);
  }
  setTimeout(() => {
    if (el.parentNode) el.parentNode.removeChild(el);
  }, 3600);
}

function showBanner(title, sub, dur = 3.0) {
  bannerTitleEl.textContent = title;
  bannerSubEl.textContent = sub;
  bannerEl.classList.add('show');
  bannerTimer = dur;
}

function updateArmorUI() {
  armorPipEls.forEach((el, idx) => {
    el.classList.toggle('lost', idx >= armorPips);
  });
}

function formatTime(sec) {
  const m = Math.floor(sec / 60);
  const s = sec - m * 60;
  return `${String(m).padStart(2, '0')}:${s.toFixed(1).padStart(4, '0')}`;
}

// --- Start / Mount / Victory Transitions ---
function mountSandwormNow() {
  if (playPhase === 'riding' || playPhase === 'freeroam') return;
  playPhase = 'riding';
  fremen.hookCableT = 0.45;
  hookPromptEl.classList.remove('show');
  audio.playHookLatch();
  setTimeout(() => audio.playBraaam(73.42, 1.7), 90);
  camShake = 0.7;
  worm.yaw = 0;
  worm.vy = 14.5;
  worm.airborne = true;
  worm.jawOpen = 0.85;
  stageTagEl.textContent = '破沙狩猎';
  stageDescEl.textContent = `吞噬哈肯尼香料母车 [${harvestersDevoured} / 3]`;
  showBanner('夏胡鲁已臣服 · SHAI-HULUD MOUNTED', '按住空格潜入流沙蓄力，在香料母车正下方松开破沙一击秒吞！', 3.4);
  showToast('造物主双钩咬合成功！冲向深漠三座香料盆地');
}

function startCampaign(skipRitual = false) {
  audio.init();
  arena = buildDesertArena(meshes);
  particles.length = 0;
  shockRings.length = 0;
  campaignTime = 0;
  score = 0;
  harvestersDevoured = 0;
  orniKills = 0;
  armorPips = 4;
  damageCooldown = 0;
  worm.spiceMeter = 60;
  worm.spiceGlow = 0;
  lookYawOffset = 0;
  lookPitchOffset = 0;

  pipEls.forEach((p) => p.classList.remove('done'));
  bossWrapEl.classList.remove('show');
  debriefEl.classList.remove('show');
  updateArmorUI();

  mode = 'playing';
  overlayEl.classList.add('hidden');
  hudEl.classList.add('visible');
  document.getElementById('wr-touch').classList.add('active');
  canvas.focus();

  if (skipRitual) {
    createWormSegments(0, 50, 0);
    playPhase = 'summon'; // allow mountSandwormNow to run cleanly
    mountSandwormNow();
  } else {
    playPhase = 'summon';
    summonTimer = 0;
    nextThumpAt = 0.08;
    fremen.x = 0;
    fremen.z = 60.5;
    fremen.y = duneH(0, 60.5);
    fremen.yaw = 0;
    // Start worm deep underground charging south toward the Thumper!
    createWormSegments(0, -4, Math.PI);
    for (const s of worm.segments) s.y = duneH(s.x, s.z) - 7.5;
    worm.y = duneH(0, -4) - 6.0;
    worm.submerged = 1.0;

    stageTagEl.textContent = '沙槌召唤';
    stageDescEl.textContent = '弗雷曼沙槌震波召唤百米沙虫……';
    showBanner('敲响弗雷曼沙槌 · THUMPER ACTIVE', '深漠地底震波急速逼近，准备甩出造物主钩爪！', 2.6);
    showToast('沙槌已植入沙脊！百米巨虫正在沙海地底冲来');
  }
}

function triggerDiveReleaseBreach() {
  if (mode !== 'playing') return;
  if (playPhase === 'summon') {
    if (summonTimer >= 1.1) mountSandwormNow();
    return;
  }
  if (worm.airborne && worm.submerged < 0.25) return;

  const charge = worm.diveCharge;
  const fromDeep = worm.submerged > 0.35 || charge > 0.18;
  worm.wasSubmerged = fromDeep;
  worm.airborne = true;
  worm.submerged = 0;
  worm.vy = fromDeep ? lerp(19.5, 30.5, clamp(charge, 0, 1)) : 16.5;
  worm.diveCharge = 0;
  worm.jawOpen = 1.0;

  const groundY = duneH(worm.x, worm.z);
  if (worm.y < groundY + 1.2) worm.y = groundY + 1.25;

  audio.playBreach();
  camShake = fromDeep ? 0.95 : 0.45;
  spawnShockRing(worm.x, groundY, worm.z, fromDeep ? 26 : 15, 0.85);
  emitSandBurst(worm.x, groundY, worm.z, fromDeep ? 36 : 18, fromDeep ? 17 : 10, fromDeep ? 4.2 : 2.8, worm.spiceGlow);
  checkWormDevourCollisions();
}

function triggerStage2Boss() {
  const fr = arena.frigate;
  fr.active = true;
  fr.alive = true;
  fr.hp = fr.maxHp;
  fr.x = clamp(worm.x * 0.4, -40, 40);
  fr.z = clamp(worm.z - 46, -110, -18);
  fr.y = duneH(fr.x, fr.z) + 17.5;
  fr.beamX = worm.x + 18;
  fr.beamZ = worm.z - 14;

  bossWrapEl.classList.add('show');
  bossPctEl.textContent = '100%';
  bossFillEl.style.width = '100%';
  stageTagEl.textContent = '旗舰决战';
  stageDescEl.textContent = '潜沙躲避热能光矛 · 破沙跃击哈肯旗舰反应炉';
  audio.playBraaam(65.41, 2.3);
  camShake = 0.85;
  showBanner('帝国哈肯号指挥舰降临！', '按住空格潜沙免疫轨道光矛，在舰体正下方松开破沙撞碎反应炉！', 4.2);
  showToast('警告：轨道热能光矛已锁定地表，潜入沙底逼近旗舰！');
}

function triggerVictory() {
  mode = 'victory';
  hudEl.classList.remove('visible');
  overlayEl.classList.remove('hidden');
  hookPromptEl.classList.remove('show');

  const rank = score >= 3600 && campaignTime < 135 ? 'S+' : score >= 2600 ? 'S' : 'A';
  kickerEl.textContent = 'SHAI-HULUD TRIUMPHANT // 厄拉科斯深漠完全解放';
  titleEl.textContent = '大漠霸主 · 穆阿迪布传奇';
  descEl.textContent =
    '三座哈肯尼重型香料母车与帝国哈肯号轨道指挥护卫舰已尽数葬身沙海！双日余晖之下，弗雷曼骑手立于百米夏胡鲁背脊之上统御深漠。';

  stTimeEl.textContent = formatTime(campaignTime);
  stHarvEl.textContent = `${harvestersDevoured} / 3`;
  stOrniEl.textContent = String(orniKills);
  stScoreEl.textContent = String(score);
  stRankEl.textContent = rank;
  debriefEl.classList.add('show');

  btnStart.style.display = 'none';
  btnQuickRide.style.display = 'none';
  btnFreeRide.style.display = 'inline-flex';
  btnRestart.style.display = 'inline-flex';
  audio.playBraaam(73.42, 2.4);
}

// --- Input Listeners ---
window.addEventListener('keydown', (e) => {
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) {
    if (mode === 'playing') e.preventDefault();
  }
  keys.add(e.code);

  if (e.code === 'Space' && !e.repeat) {
    if (mode === 'playing' && playPhase === 'summon') {
      if (summonTimer >= 1.4) mountSandwormNow();
    } else if (mode === 'playing') {
      diveHeld = true;
    }
  }
  if (e.code === 'KeyE' && mode === 'playing' && playPhase === 'summon') {
    mountSandwormNow();
  }
  if ((e.code === 'ShiftLeft' || e.code === 'ShiftRight') && mode === 'playing') {
    boostHeld = true;
  }
  if (e.code === 'KeyC' && !e.repeat) {
    camPreset = (camPreset + 1) % 3;
    showToast(`摄影机位：${camNames[camPreset]}`);
  }
  if (e.code === 'KeyH' && !e.repeat) {
    cycleHazePreset();
  }
  if ((e.code === 'KeyP' || e.code === 'Escape') && !e.repeat) {
    togglePause();
  }
});

window.addEventListener('keyup', (e) => {
  keys.delete(e.code);
  if (e.code === 'Space') {
    if (diveHeld) {
      diveHeld = false;
      triggerDiveReleaseBreach();
    }
  }
  if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') {
    boostHeld = false;
  }
});

canvas.addEventListener('mousedown', (e) => {
  if (mode !== 'playing') return;
  audio.init();
  if (e.button === 0) {
    if (playPhase === 'summon') {
      if (summonTimer >= 1.2) mountSandwormNow();
    } else {
      diveHeld = true;
    }
  } else if (e.button === 2) {
    boostHeld = true;
  }
});

window.addEventListener('mouseup', (e) => {
  if (e.button === 0 && diveHeld) {
    diveHeld = false;
    triggerDiveReleaseBreach();
  } else if (e.button === 2) {
    boostHeld = false;
  }
});

canvas.addEventListener('contextmenu', (e) => e.preventDefault());

canvas.addEventListener('mousemove', (e) => {
  if (mode !== 'playing') return;
  const rect = canvas.getBoundingClientRect();
  const nx = ((e.clientX - rect.left) / Math.max(1, rect.width) - 0.5) * 2;
  const ny = ((e.clientY - rect.top) / Math.max(1, rect.height) - 0.5) * 2;
  lookYawOffset = -nx * 0.36;
  lookPitchOffset = -ny * 0.18;
});

// Touch Controls
const tPad = document.getElementById('wr-t-pad');
const tKnob = document.getElementById('wr-t-knob');
const tbDive = document.getElementById('wr-tb-dive');
const tbBoost = document.getElementById('wr-tb-boost');

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
if (tbDive) {
  tbDive.addEventListener('touchstart', (e) => {
    e.preventDefault();
    if (playPhase === 'summon') mountSandwormNow();
    else diveHeld = true;
  }, { passive: false });
  tbDive.addEventListener('touchend', (e) => {
    e.preventDefault();
    if (diveHeld) {
      diveHeld = false;
      triggerDiveReleaseBreach();
    }
  }, { passive: false });
}
if (tbBoost) {
  tbBoost.addEventListener('touchstart', (e) => { e.preventDefault(); boostHeld = true; }, { passive: false });
  tbBoost.addEventListener('touchend', () => { boostHeld = false; });
}

// --- UI Buttons & Settings ---
function cycleHazePreset(setIdx = null) {
  hazePreset = setIdx !== null ? setIdx : (hazePreset + 1) % 3;
  document.querySelectorAll('.haze-pill').forEach((b) => {
    b.classList.toggle('active', Number(b.dataset.h) === hazePreset);
  });
  showToast(`热浪海市蜃楼：${hazeNames[hazePreset]}`);
}

function togglePause() {
  if (mode === 'playing') {
    mode = 'paused';
    diveHeld = false;
    boostHeld = false;
    kickerEl.textContent = 'SIETCH TACTICAL PAUSE // 深漠行动已暂停';
    titleEl.textContent = '沙丘巨虫 · SHAI-RIDER';
    descEl.textContent = '调整热浪滤镜、渲染画质或试听纯代码沙漠声学合成台，点击继续返回沙虫背脊。';
    btnStart.textContent = '继续驭虫狂飙';
    btnStart.style.display = 'inline-flex';
    btnQuickRide.style.display = 'none';
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
  else startCampaign(false);
});
btnQuickRide.addEventListener('click', () => startCampaign(true));
btnRestart.addEventListener('click', () => startCampaign(false));
btnFreeRide.addEventListener('click', () => {
  mode = 'playing';
  playPhase = 'freeroam';
  overlayEl.classList.add('hidden');
  hudEl.classList.add('visible');
  stageTagEl.textContent = '无尽巡猎';
  stageDescEl.textContent = '自由驰骋厄拉科斯双日沙海 · 捕猎帝国扑翼机编队';
  canvas.focus();
});

btnStudio.addEventListener('click', () => {
  audio.init();
  studioEl.classList.toggle('open');
});

document.querySelectorAll('.wr-sfx-trigger').forEach((btn) => {
  btn.addEventListener('click', () => {
    audio.init();
    const s = btn.dataset.s;
    if (s === 'braaam') audio.playBraaam(73.42, 1.85);
    else if (s === 'thumper') audio.playThumper();
    else if (s === 'hook') audio.playHookLatch();
    else if (s === 'breach') audio.playBreach();
    else if (s === 'crunch') audio.playDevourCrunch(true);
    else if (s === 'duduk') audio.playDuduk(369.99, 1.35, 0.11);
  });
});

document.querySelectorAll('.haze-pill').forEach((btn) => {
  btn.addEventListener('click', () => cycleHazePreset(Number(btn.dataset.h)));
});

document.querySelectorAll('.q-pill').forEach((btn) => {
  btn.addEventListener('click', () => {
    quality = btn.dataset.q;
    document.querySelectorAll('.q-pill').forEach((b) => b.classList.toggle('active', b === btn));
    ensureFBO();
  });
});

const volInput = document.getElementById('wr-vol');
if (volInput) {
  volInput.addEventListener('input', () => {
    audio.setVolume(Number(volInput.value) / 100);
  });
}

document.getElementById('btn-haze').addEventListener('click', () => cycleHazePreset());
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

// --- Simulation Step ---
function updateSpineChain(dt) {
  const s0 = worm.segments[0];
  s0.x = worm.x;
  s0.y = worm.y;
  s0.z = worm.z;
  s0.yaw = worm.yaw;
  s0.pitch = worm.pitch;
  s0.roll = worm.roll;

  for (let i = 1; i < worm.segments.length; i++) {
    const prev = worm.segments[i - 1];
    const cur = worm.segments[i];
    let dx = prev.x - cur.x;
    let dy = prev.y - cur.y;
    let dz = prev.z - cur.z;
    const dist = Math.hypot(dx, dy, dz) || 0.001;
    dx /= dist;
    dy /= dist;
    dz /= dist;

    cur.x = prev.x - dx * SEG_DIST;
    cur.y = prev.y - dy * SEG_DIST;
    cur.z = prev.z - dz * SEG_DIST;

    // Gentle sinusoidal desert slither ripple along tail segments when on sand!
    const groundY = duneH(cur.x, cur.z);
    if (!worm.airborne && worm.submerged < 0.5 && cur.y < groundY + 1.0) {
      cur.y = damp(cur.y, groundY + cur.r * 0.34, 14, dt);
    }

    const horiz = Math.hypot(dx, dz) || 0.0001;
    cur.yaw = Math.atan2(-dx, -dz);
    cur.pitch = Math.atan2(dy, horiz);
    cur.roll = damp(cur.roll, prev.roll * 0.86, 12, dt);
  }
}

function updateImperialUnits(dt, t) {
  // 1. Harvesters slowly crawl inside their Melange Spice Basins
  for (const h of arena.harvesters) {
    if (!h.alive) continue;
    h.hitFlash = Math.max(0, h.hitFlash - dt * 3.5);
    h.yaw = wrapAngle(h.yaw + 0.12 * dt);
    h.x = h.cx + Math.sin(h.yaw) * 7.5;
    h.z = h.cz + Math.cos(h.yaw) * 7.5;
    h.y = duneH(h.x, h.z);
  }

  // 2. Escort Sand-Skiffs
  for (const sk of arena.skiffs) {
    if (!sk.alive) {
      if (harvestersDevoured < 3) {
        sk.respawn -= dt;
        if (sk.respawn <= 0) sk.alive = true;
      }
      continue;
    }
    sk.ang += sk.spd * dt;
    const nx = sk.cx + Math.cos(sk.ang) * sk.orbitR;
    const nz = sk.cz + Math.sin(sk.ang) * sk.orbitR;
    sk.yaw = Math.atan2(-(nx - sk.x), -(nz - sk.z));
    sk.x = nx;
    sk.z = nz;
    sk.y = duneH(nx, nz) + 1.35 + Math.sin(t * 4.5 + sk.ang) * 0.22;
  }

  // 3. Flapping Ornithopters
  for (const o of arena.ornithopters) {
    if (!o.alive) {
      o.respawn -= dt;
      if (o.respawn <= 0) o.alive = true;
      continue;
    }
    o.ang += o.spd * dt;
    const nx = o.cx + Math.cos(o.ang) * o.orbitR;
    const nz = o.cz + Math.sin(o.ang) * o.orbitR;
    o.yaw = Math.atan2(-(nx - o.x), -(nz - o.z));
    o.x = nx;
    o.z = nz;
    o.y = Math.max(duneH(nx, nz) + 8.5, o.alt + Math.sin(t * 2.4 + o.ang) * 1.6);
  }

  // 4. Stage 02 Boss: Harkon-Class Command Frigate + Orbital Thermal Lance
  const fr = arena.frigate;
  if (fr.active && fr.alive) {
    fr.hitFlash = Math.max(0, fr.hitFlash - dt * 3.2);
    fr.beamAng += dt * 0.36;
    const targetX = Math.sin(fr.beamAng) * 42;
    const targetZ = -48 + Math.cos(fr.beamAng * 0.8) * 32;
    const dx = targetX - fr.x;
    const dz = targetZ - fr.z;
    fr.yaw = damp(fr.yaw, Math.atan2(-dx, -dz), 2.0, dt);
    fr.x = damp(fr.x, targetX, 0.9, dt);
    fr.z = damp(fr.z, targetZ, 0.9, dt);
    fr.y = duneH(fr.x, fr.z) + 17.5 + Math.sin(t * 1.6) * 0.8;

    // Sweeping Orbital Thermal Lance chases the Sandworm across the desert surface!
    const chaseRate = 0.72;
    fr.beamX = damp(fr.beamX, worm.x + Math.sin(t * 2.1) * 6.0, chaseRate, dt);
    fr.beamZ = damp(fr.beamZ, worm.z + Math.cos(t * 1.7) * 6.0, chaseRate, dt);
    const by = duneH(fr.beamX, fr.beamZ);
    if (Math.random() < 0.65) {
      spawnParticle(
        fr.beamX + (Math.random() - 0.5) * 2.6,
        by + 0.4,
        fr.beamZ + (Math.random() - 0.5) * 2.6,
        (Math.random() - 0.5) * 8,
        4 + Math.random() * 7,
        (Math.random() - 0.5) * 8,
        1.4,
        2.5,
        0.45,
        1.0, 0.48, 0.10, 0.75,
        0,
        6.0
      );
    }

    // Check Thermal Lance damage when worm is exposed on surface
    if (mode === 'playing' && worm.submerged < 0.45 && damageCooldown <= 0) {
      const dBeam = Math.hypot(worm.x - fr.beamX, worm.z - fr.beamZ);
      if (dBeam < 5.2 && Math.abs(worm.y - by) < 5.5) {
        damageCooldown = 1.6;
        camShake = 0.65;
        audio.playDevourCrunch(false);
        if (armorPips > 1) {
          armorPips--;
          updateArmorUI();
          showToast('轨道热能光矛灼伤！按住空格潜入流沙即可完全规避');
        } else {
          armorPips = 4;
          score = Math.max(0, score - 150);
          updateArmorUI();
          showToast('弗雷曼钩爪护盾紧急重铸 (-150)！快潜沙逼近旗舰底部');
        }
      }
    }
  }
}

function checkWormDevourCollisions() {
  const hx = worm.x;
  const hy = worm.y;
  const hz = worm.z;
  const reachBonus = worm.spiceGlow * 2.4;

  // 1. Devour Hover-Skiffs
  for (const sk of arena.skiffs) {
    if (!sk.alive) continue;
    const d = Math.hypot(hx - sk.x, hy - sk.y, hz - sk.z);
    if (d < 6.8 + reachBonus && worm.submerged < 0.75) {
      sk.alive = false;
      sk.respawn = 14.0;
      score += 150;
      worm.spiceMeter = Math.min(100, worm.spiceMeter + 18);
      worm.jawOpen = 0.95;
      audio.playDevourCrunch(false);
      emitWreckageExplosion(sk.x, sk.y, sk.z, false);
      camShake = Math.max(camShake, 0.35);
      showToast('吞噬帝国护卫沙艇 +150');
    }
  }

  // 2. Skyward Breach Snatch on Airborne Ornithopters!
  for (const o of arena.ornithopters) {
    if (!o.alive) continue;
    const d0 = Math.hypot(hx - o.x, hy - o.y, hz - o.z);
    const s2 = worm.segments[2];
    const d2 = Math.hypot(s2.x - o.x, s2.y - o.y, s2.z - o.z);
    if (Math.min(d0, d2) < 9.2 + reachBonus) {
      o.alive = false;
      o.respawn = 12.0;
      orniKills++;
      score += 400;
      worm.spiceMeter = Math.min(100, worm.spiceMeter + 26);
      worm.jawOpen = 1.0;
      audio.playDevourCrunch(false);
      emitWreckageExplosion(o.x, o.y, o.z, false);
      camShake = Math.max(camShake, 0.55);
      showToast('破空扑碎帝国蜻蜓扑翼机 +400！');
    }
  }

  // 3. Devour Colossal Spice Harvesters!
  for (const h of arena.harvesters) {
    if (!h.alive) continue;
    const dXZ = Math.hypot(hx - h.x, hz - h.z);
    const dY = Math.abs(hy - (h.y + 2.2));

    // Hint when burrowed directly underneath a Harvester!
    if (worm.submerged > 0.55 && dXZ < 13.5 && h.hitFlash <= 0) {
      stateValEl.textContent = '正处母车下方 · 松开鲸跃秒吞！';
    }

    if (worm.submerged < 0.55 && dXZ < 12.2 + reachBonus && dY < 9.5) {
      const isMegaBreach = worm.wasSubmerged || (worm.airborne && worm.vy > 4.0);
      if (isMegaBreach || h.hp <= 55) {
        h.hp = 0;
        h.alive = false;
        harvestersDevoured++;
        const pts = isMegaBreach ? 800 : 550;
        score += pts;
        worm.spiceMeter = 100;
        armorPips = Math.min(4, armorPips + 1);
        updateArmorUI();
        pipEls[h.id]?.classList.add('done');
        audio.playDevourCrunch(true);
        emitWreckageExplosion(h.x, h.y + 2.5, h.z, true);
        spawnShockRing(h.x, h.y, h.z, 34, 1.05, [1.0, 0.45, 0.10]);
        camShake = 1.0;

        if (harvestersDevoured < 3) {
          stageDescEl.textContent = `吞噬哈肯尼香料母车 [${harvestersDevoured} / 3]`;
          showBanner(
            isMegaBreach ? `破地一击秒吞！+${pts}` : `吞噬香料母车！+${pts}`,
            `已摧毁 ${h.name}（剩余 ${3 - harvestersDevoured} 座母车）`,
            2.8
          );
          showToast(`巨口吞没 ${h.name} +${pts}`);
        } else {
          stageDescEl.textContent = '三座香料母车全灭！迎战轨道指挥舰';
          triggerStage2Boss();
        }
      } else if (h.hitFlash <= 0.05) {
        h.hp -= 55;
        h.hitFlash = 1.0;
        score += 250;
        worm.spiceMeter = Math.min(100, worm.spiceMeter + 30);
        audio.playDevourCrunch(false);
        emitWreckageExplosion(h.x, h.y + 2.0, h.z, false);
        camShake = 0.65;
        // Push worm forward slightly so one pass doesn't double-tick
        worm.x += -Math.sin(worm.yaw) * 6.5;
        worm.z += -Math.cos(worm.yaw) * 6.5;
        showToast(`重创 ${h.name} 装甲 (-55%)！潜沙从底部跃起可一口秒吞`);
      }
    }
  }

  // 4. Stage 02 Finale: Skyward Breach into Harkon Command Frigate Ventral Reactor!
  const fr = arena.frigate;
  if (fr.active && fr.alive && fr.hitFlash <= 0.05) {
    const dXZ = Math.hypot(hx - fr.x, hz - fr.z);
    const dY = Math.abs(hy - (fr.y - 2.2));
    if (worm.submerged > 0.55 && dXZ < 15.5) {
      stateValEl.textContent = '已锁定旗舰舰腹 · 松开空格破空撞击！';
    }
    if (worm.airborne && dXZ < 14.5 + reachBonus && dY < 9.5) {
      fr.hp = Math.max(0, fr.hp - 100);
      fr.hitFlash = 1.0;
      const pct = Math.round((fr.hp / fr.maxHp) * 100);
      bossPctEl.textContent = `${pct}%`;
      bossFillEl.style.width = `${pct}%`;
      audio.playDevourCrunch(true);
      emitWreckageExplosion(fr.x, fr.y - 2.0, fr.z, true);
      spawnShockRing(fr.x, fr.y - 2.5, fr.z, 36, 1.0, [1.0, 0.38, 0.08]);
      camShake = 1.1;

      if (fr.hp <= 0) {
        fr.alive = false;
        bossWrapEl.classList.remove('show');
        score += 1500;
        emitWreckageExplosion(fr.x, fr.y, fr.z, true);
        showToast('哈肯号指挥护卫舰反应炉彻底引爆 +1500！');
        setTimeout(() => {
          if (mode === 'playing') triggerVictory();
        }, 1150);
      } else {
        score += 600;
        worm.vy = -6.0;
        showBanner('重创哈肯号反应炉 (50%)！', '再发动一次潜沙鲸跃即可彻底吞没帝国旗舰！', 3.0);
        showToast('命中旗舰底部香料反应炉 +600！');
      }
    }
  }
}

function updateSimulation(dt, t) {
  bannerTimer = Math.max(0, bannerTimer - dt);
  if (bannerTimer <= 0) bannerEl.classList.remove('show');
  damageCooldown = Math.max(0, damageCooldown - dt);
  camShake = Math.max(0, camShake - dt * 1.8);

  // Title Screen Cinematic Attract Loop
  if (mode === 'title') {
    worm.yaw = wrapAngle(worm.yaw + 0.24 * dt);
    const gx = -Math.sin(worm.yaw) * 25 * dt;
    const gz = -Math.cos(worm.yaw) * 25 * dt;
    worm.x += gx;
    worm.z += gz;
    const distOrigin = Math.hypot(worm.x, worm.z + 10);
    if (distOrigin > 82) {
      worm.yaw = damp(worm.yaw, Math.atan2(worm.x, worm.z + 10), 2.2, dt);
    }
    const gy = duneH(worm.x, worm.z);
    const waveArc = Math.sin(t * 1.15);
    worm.y = gy + 1.4 + Math.max(0, waveArc - 0.35) * 14.0;
    worm.pitch = Math.cos(t * 1.15) * 0.35;
    worm.jawOpen = 0.25 + Math.max(0, waveArc) * 0.65;
    if (Math.random() < 0.55) {
      emitSandBurst(worm.x, gy + 0.5, worm.z, 1, 7, 2.6, 0.2);
    }
    updateSpineChain(dt);
    updateImperialUnits(dt, t);

    const camAng = t * 0.16;
    camPos[0] = worm.x + Math.sin(camAng) * 32;
    camPos[2] = worm.z + Math.cos(camAng) * 32;
    camPos[1] = Math.max(duneH(camPos[0], camPos[2]) + 7.0, worm.y + 9.5);
    camLook[0] = worm.x;
    camLook[1] = worm.y + 2.5;
    camLook[2] = worm.z;
    return;
  }

  if (mode !== 'playing') return;

  campaignTime += dt;
  updateImperialUnits(dt, t);

  // Phase 01: Fremen Thumper Ritual (~3.2s interactive intro)
  if (playPhase === 'summon') {
    summonTimer += dt;

    // Allow player to step slightly or look around on Sietch crest
    const steerIn = (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) - (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0);
    fremen.yaw = clamp(fremen.yaw - steerIn * 0.9 * dt, -0.65, 0.65);

    if (summonTimer >= nextThumpAt && summonTimer < 1.45) {
      nextThumpAt += 0.68;
      const ty = duneH(fremen.thumperX, fremen.thumperZ);
      audio.playThumper();
      spawnShockRing(fremen.thumperX, ty, fremen.thumperZ, 24, 0.82, [1.0, 0.72, 0.24]);
      camShake = 0.32;
    }

    // Subterranean Shai-Hulud charges from z = 4 to z = 50.5!
    if (summonTimer < 1.45) {
      const prog = clamp(summonTimer / 1.45, 0, 1);
      worm.x = Math.sin(prog * 5.0) * 3.5;
      worm.z = lerp(4, 50.5, prog);
      const sy = duneH(worm.x, worm.z);
      worm.y = sy - 3.6;
      worm.yaw = Math.PI;
      worm.pitch = 0;
      worm.submerged = 1.0;
      if (Math.random() < 0.85) {
        emitSandBurst(worm.x, sy + 0.6, worm.z, 2, 11, 3.4, 0.35);
      }
    } else {
      // Colossal Breach right beside the Fremen Warrior!
      if (worm.submerged > 0.5) {
        worm.submerged = 0;
        worm.yaw = 0.15;
        audio.playBreach();
        const sy = duneH(worm.x, worm.z);
        spawnShockRing(worm.x, sy, worm.z, 28, 0.95);
        emitSandBurst(worm.x, sy, worm.z, 34, 16, 4.0, 0.5);
        camShake = 0.85;
        hookPromptEl.classList.add('show');
      }
      const riseT = clamp((summonTimer - 1.45) / 1.15, 0, 1);
      const sy = duneH(worm.x, worm.z);
      worm.z = lerp(50.5, 45.0, riseT);
      worm.y = sy + 2.2 + Math.sin(riseT * Math.PI * 0.75) * 7.2;
      worm.pitch = 0.45 * (1 - riseT * 0.5);
      worm.jawOpen = 0.92;

      // Auto-latch Maker-Hooks at 2.75s so nobody ever misses the ride!
      if (summonTimer >= 2.75) {
        mountSandwormNow();
      }
    }

    updateSpineChain(dt);

    // Dramatic low-angle over-the-shoulder Fremen summoning camera
    const tx = fremen.x + Math.sin(fremen.yaw) * 4.5 + 3.2;
    const tz = fremen.z + 7.2;
    const ty = duneH(tx, tz) + 3.1;
    camPos[0] = damp(camPos[0], tx, 6, dt);
    camPos[1] = damp(camPos[1], ty, 6, dt);
    camPos[2] = damp(camPos[2], tz, 6, dt);
    camLook[0] = damp(camLook[0], worm.x * 0.5, 8, dt);
    camLook[1] = damp(camLook[1], duneH(0, 52) + 3.2, 8, dt);
    camLook[2] = damp(camLook[2], 44, 8, dt);
    audio.update(dt, 0.35, worm.submerged, false, true);
    return;
  }

  // Phase 02: Full Colossal Sandworm Riding & Skyward Breach!
  fremen.hookCableT = Math.max(0, fremen.hookCableT - dt);

  let steer = 0;
  if (keys.has('KeyA') || keys.has('ArrowLeft')) steer -= 1;
  if (keys.has('KeyD') || keys.has('ArrowRight')) steer += 1;
  steer = clamp(steer + touchSteer, -1, 1);

  const throttleBias = (keys.has('KeyW') || keys.has('ArrowUp') ? 4.5 : 0) - (keys.has('KeyS') || keys.has('ArrowDown') ? 4.5 : 0);

  // Spice Overdrive Boost
  const usingSpice = (boostHeld || keys.has('ShiftLeft') || keys.has('ShiftRight')) && worm.spiceMeter > 2;
  if (usingSpice) {
    worm.spiceMeter = Math.max(0, worm.spiceMeter - 24 * dt);
    worm.spiceGlow = damp(worm.spiceGlow, 1.0, 10, dt);
  } else {
    // Passive recharge when slithering through glowing Melange Spice Basins!
    const basinRichness = spiceMask(worm.x, worm.z);
    worm.spiceMeter = Math.min(100, worm.spiceMeter + (3.2 + basinRichness * 16.0) * dt);
    worm.spiceGlow = damp(worm.spiceGlow, basinRichness * 0.45, 5, dt);
  }

  const turnRate = worm.airborne ? 0.92 : 1.52;
  worm.yaw = wrapAngle(worm.yaw - steer * turnRate * dt);
  worm.roll = damp(worm.roll, -steer * 0.38, 7, dt);

  let targetSpeed = 27.5 + throttleBias;
  if (diveHeld && !worm.airborne) targetSpeed = 38.5;
  if (usingSpice) targetSpeed += 11.5;
  worm.speed = damp(worm.speed, targetSpeed, 5.5, dt);

  const fwdX = -Math.sin(worm.yaw);
  const fwdZ = -Math.cos(worm.yaw);
  worm.x += fwdX * worm.speed * dt;
  worm.z += fwdZ * worm.speed * dt;

  // Keep inside the Shield-Wall Mesa Ring (soft steer back if rad > 142m)
  const radFromCenter = Math.hypot(worm.x, worm.z + 18);
  if (radFromCenter > 140) {
    const inwardYaw = Math.atan2(worm.x, worm.z + 18);
    worm.yaw = wrapAngle(worm.yaw + wrapAngle(inwardYaw - worm.yaw) * 2.8 * dt);
    if (radFromCenter > 152) {
      const s = 152 / radFromCenter;
      worm.x *= s;
      worm.z = (worm.z + 18) * s - 18;
    }
  }

  const groundY = duneH(worm.x, worm.z);
  const aheadY = duneH(worm.x + fwdX * 4.0, worm.z + fwdZ * 4.0);
  const terrainPitch = Math.atan2(aheadY - groundY, 4.0);

  if (worm.airborne) {
    worm.submerged = damp(worm.submerged, 0.0, 14.0, dt);
    worm.vy -= 26.0 * dt;
    worm.y += worm.vy * dt;
    worm.pitch = damp(worm.pitch, clamp(Math.atan2(worm.vy, worm.speed), -0.82, 0.92), 10, dt);
    worm.jawOpen = damp(worm.jawOpen, worm.vy > -2 ? 0.95 : 0.45, 6, dt);

    // Slamming back into the Arrakis Sand!
    if (worm.y <= groundY + 1.15 && worm.vy < 0) {
      worm.y = groundY + 1.15;
      worm.airborne = false;
      worm.wasSubmerged = false;
      const slamForce = clamp(-worm.vy / 28, 0.3, 1.0);
      worm.vy = 0;
      camShake = Math.max(camShake, slamForce * 0.72);
      audio.playThumper();
      spawnShockRing(worm.x, groundY, worm.z, 14 + slamForce * 14, 0.75);
      emitSandBurst(worm.x, groundY, worm.z, 22, 13 * slamForce, 3.4, worm.spiceGlow);
    }
  } else if (diveHeld) {
    // Burrowing deep beneath the dunes!
    worm.submerged = damp(worm.submerged, 1.0, 8.5, dt);
    worm.diveCharge = clamp(worm.diveCharge + dt * 1.08, 0, 1);
    worm.y = damp(worm.y, groundY - 4.4, 9.0, dt);
    worm.pitch = damp(worm.pitch, terrainPitch - 0.18, 8, dt);
    worm.jawOpen = damp(worm.jawOpen, 0.25, 6, dt);

    if (Math.random() < 0.9) {
      emitSandBurst(worm.x, groundY + 1.2, worm.z, 2, 9.5, 3.1, worm.spiceGlow);
    }
  } else {
    // Cruising powerfully atop the wind-rippled dunes!
    worm.submerged = damp(worm.submerged, 0.0, 9.0, dt);
    worm.diveCharge = Math.max(0, worm.diveCharge - dt * 1.6);
    worm.y = damp(worm.y, groundY + 1.35, 11.0, dt);
    worm.pitch = damp(worm.pitch, terrainPitch, 8.5, dt);
    worm.jawOpen = damp(worm.jawOpen, usingSpice ? 0.65 : 0.22, 5, dt);

    if (Math.random() < 0.75) {
      const sideX = Math.cos(worm.yaw) * 3.4;
      const sideZ = -Math.sin(worm.yaw) * 3.4;
      spawnParticle(
        worm.x + sideX, groundY + 0.6, worm.z + sideZ,
        sideX * 1.4, 3.5 + Math.random() * 4.0, sideZ * 1.4,
        2.3, 3.6, 0.65,
        0.88, 0.58, 0.30, 0.52, 0, 9.5
      );
      spawnParticle(
        worm.x - sideX, groundY + 0.6, worm.z - sideZ,
        -sideX * 1.4, 3.5 + Math.random() * 4.0, -sideZ * 1.4,
        2.3, 3.6, 0.65,
        0.88, 0.58, 0.30, 0.52, 0, 9.5
      );
    }
  }

  updateSpineChain(dt);

  // Update HUD State Readout before collision overrides
  if (worm.airborne) {
    stateValEl.textContent = '破沙鲸跃腾空!';
  } else if (worm.submerged > 0.5) {
    stateValEl.textContent = worm.diveCharge >= 0.95 ? '蓄力满载 · 松开鲸跃!' : '流沙地底潜行';
  } else if (usingSpice) {
    stateValEl.textContent = '香料狂暴冲刺!';
  } else {
    stateValEl.textContent = '沙海地表巡航';
  }

  checkWormDevourCollisions();

  // Megascale Third-Person Cinema Camera
  const anchor = worm.segments[2] || worm.segments[0];
  const presetCfg = [
    { dist: 24.5, up: 10.2, lookAhead: 12.0 },
    { dist: 14.5, up: 6.4, lookAhead: 15.0 },
    { dist: 36.0, up: 16.5, lookAhead: 10.0 },
  ][camPreset];

  const camYaw = worm.yaw + lookYawOffset;
  const backX = Math.sin(camYaw) * presetCfg.dist;
  const backZ = Math.cos(camYaw) * presetCfg.dist;
  const anchorSurfaceY = Math.max(anchor.y, duneH(anchor.x, anchor.z) + 1.2);
  let desiredCamX = anchor.x + backX;
  let desiredCamZ = anchor.z + backZ;
  let desiredCamY = anchorSurfaceY + presetCfg.up + lookPitchOffset * 7.0 + (worm.airborne ? 3.0 : 0);
  desiredCamY = Math.max(desiredCamY, duneH(desiredCamX, desiredCamZ) + 3.2);

  camPos[0] = damp(camPos[0], desiredCamX, 6.5, dt);
  camPos[1] = damp(camPos[1], desiredCamY, 6.5, dt);
  camPos[2] = damp(camPos[2], desiredCamZ, 6.5, dt);

  const lookTargetY = worm.submerged > 0.5 ? groundY + 1.8 : worm.y + 2.2;
  camLook[0] = damp(camLook[0], worm.x + fwdX * presetCfg.lookAhead, 8.5, dt);
  camLook[1] = damp(camLook[1], lookTargetY, 8.5, dt);
  camLook[2] = damp(camLook[2], worm.z + fwdZ * presetCfg.lookAhead, 8.5, dt);

  const speedNorm = clamp((worm.speed - 20) / 26, 0, 1);
  audio.update(dt, speedNorm, worm.submerged, true, true);
}

// --- Particle & Ring Simulation ---
function updateEffects(dt) {
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
  }

  for (let i = shockRings.length - 1; i >= 0; i--) {
    const r = shockRings[i];
    r.t += dt;
    if (r.t >= r.dur) {
      shockRings.splice(i, 1);
      continue;
    }
    r.r = lerp(2.0, r.maxRadius, 1 - Math.pow(1 - r.t / r.dur, 2.2));
  }
}

// --- Render Frame ---
const matProj = M4.create();
const matView = M4.create();
const matVP = M4.create();
const matIdentity = M4.create();
const matTemp = M4.create();
const translucentQueue = [];

function updateWaypointsAndHUD(vpMat) {
  if (mode !== 'playing') return;

  const deg = Math.round(((wrapAngle(-worm.yaw) * 180) / Math.PI + 360) % 360);
  const dirs = ['北 N', '东北 NE', '东 E', '东南 SE', '南 S', '西南 SW', '西 W', '西北 NW'];
  const dirLbl = dirs[Math.round(deg / 45) % 8];
  compassEl.textContent = `${dirLbl} · ${String(deg).padStart(3, '0')}° · 深漠震频`;

  const kmh = playPhase === 'summon' ? 0 : Math.round(worm.speed * 3.8);
  speedValEl.textContent = String(kmh);
  diveFillEl.style.width = `${Math.round(worm.diveCharge * 100)}%`;
  spiceFillEl.style.width = `${Math.round(worm.spiceMeter)}%`;
  scoreValEl.textContent = String(score);

  // Project 3D Waypoints for Alive Harvesters or Stage 2 Frigate
  const w = appEl.clientWidth || 800;
  const h = appEl.clientHeight || 446;
  const targets = [];
  if (arena.frigate.active && arena.frigate.alive) {
    targets.push({
      x: arena.frigate.x,
      y: arena.frigate.y + 5.0,
      z: arena.frigate.z,
      label: '哈肯旗舰',
      boss: true,
    });
  } else {
    for (const hv of arena.harvesters) {
      if (!hv.alive) continue;
      targets.push({
        x: hv.x,
        y: hv.y + 7.5,
        z: hv.z,
        label: '香料母车',
        boss: false,
      });
    }
  }

  let html = '';
  for (const tg of targets) {
    const scr = M4.projectToScreen(vpMat, tg.x, tg.y, tg.z, w, h);
    if (!scr || scr.x < 24 || scr.x > w - 24 || scr.y < 52 || scr.y > h - 42) continue;
    const dist = Math.round(Math.hypot(tg.x - worm.x, tg.z - worm.z));
    html += `<div class="wr-wp${tg.boss ? ' boss' : ''}" style="left:${scr.x.toFixed(1)}px;top:${scr.y.toFixed(1)}px"><i class="wr-wp-diamond"></i><span>${tg.label} ${dist}m</span></div>`;
  }
  waypointsEl.innerHTML = html;
}

function renderScene(t) {
  ensureFBO();
  const aspect = fboW / Math.max(1, fboH);
  const fov = worm.airborne ? 1.06 : 0.98;
  M4.perspective(matProj, fov, aspect, 0.8, 900.0);

  const sx = (Math.random() - 0.5) * camShake * 1.1;
  const sy = (Math.random() - 0.5) * camShake * 1.1;
  const eyeX = camPos[0] + sx;
  const eyeY = camPos[1] + sy;
  const eyeZ = camPos[2];
  M4.lookAt(matView, eyeX, eyeY, eyeZ, camLook[0], camLook[1], camLook[2], 0, 1, 0);
  M4.mul(matVP, matProj, matView);

  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
  gl.viewport(0, 0, fboW, fboH);
  gl.clearColor(0.75, 0.42, 0.16, 1.0);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

  // 1. Twin-Sun Arrakis Sunset Skybox
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

  // 2. Opaque Desert Terrain, Sandworm, Fremen Warrior & Imperial Forces
  gl.enable(gl.DEPTH_TEST);
  gl.depthMask(true);
  gl.disable(gl.BLEND);
  gl.useProgram(progWorld.prog);
  gl.uniformMatrix4fv(progWorld.u.uProj, false, matProj);
  gl.uniformMatrix4fv(progWorld.u.uView, false, matView);
  gl.uniform3f(progWorld.u.uCamPos, eyeX, eyeY, eyeZ);
  gl.uniform1f(progWorld.u.uTime, t);
  gl.uniform1f(progWorld.u.uSpiceGlow, worm.spiceGlow);
  gl.uniform4f(progWorld.u.uBurrow, worm.x, worm.y, worm.z, worm.submerged);

  translucentQueue.length = 0;
  const drawWorldMesh = (mesh, modelMat, matId, col, p0 = 0.5, p1 = 1.0, alpha = 1.0) => {
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

  // Arrakis Erg Terrain
  drawWorldMesh(meshes.terrain, matIdentity, 1, [1.0, 1.0, 1.0], 0.7, 1.0, 1.0);

  // Basalt Spires & Monoliths
  for (const sd of arena.staticDraws) {
    drawWorldMesh(sd.mesh, sd.m, sd.mat, sd.color, sd.params[0], sd.params[1], 1.0);
  }

  // On-Foot Fremen Warrior + Mechanical Thumper during Ritual!
  const isMounted = mode !== 'playing' || playPhase !== 'summon';
  if (!isMounted) {
    drawFremenWarrior(drawWorldMesh, meshes, fremen.x, fremen.y, fremen.z, fremen.yaw, -0.06, t, false);
    const ty = duneH(fremen.thumperX, fremen.thumperZ);
    M4.trs(matTemp, fremen.thumperX, ty + 0.65, fremen.thumperZ, 0, 0, 0, 0.16, 1.35, 0.16);
    drawWorldMesh(meshes.cyl, matTemp, 4, [0.55, 0.44, 0.28]);
    const pistonY = ty + 1.05 + Math.abs(Math.sin(t * 7.2)) * 0.35;
    M4.trs(matTemp, fremen.thumperX, pistonY, fremen.thumperZ, 0, t * 3.0, 0, 0.48, 0.28, 0.48);
    drawWorldMesh(meshes.cyl, matTemp, 6, [1.0, 0.66, 0.18], 2.0, 1.0, 1.0);
  } else if (fremen.hookCableT > 0 && worm.segments[2]) {
    // Brief gleaming Maker-Hook grapple cables right as warrior mounts!
    const s2 = worm.segments[2];
    M4.trs(matTemp, s2.x, s2.y + s2.r + 1.2, s2.z + 1.2, 0.8, s2.yaw, 0, 0.08, 4.2, 0.08);
    drawWorldMesh(meshes.cyl, matTemp, 6, [1.0, 0.82, 0.42], 2.2, 1.0, 1.0);
  }

  // Colossal 26-Segment Sandworm & Mounted Rider
  drawColossalSandworm(drawWorldMesh, meshes, worm, t, isMounted);

  // Imperial Harvesters, Skiffs, Flapping Ornithopters & Harkon Frigate
  drawImperialForces(drawWorldMesh, meshes, arena, t);

  // Queue Seismic Shockwave Rings & Stage 2 Orbital Thermal Lance
  for (const sr of shockRings) {
    const a = 1.0 - sr.t / sr.dur;
    M4.trs(matTemp, sr.x, duneH(sr.x, sr.z) + 0.45, sr.z, 0, 0, 0, sr.r * 2.0, 1.0, sr.r * 2.0);
    drawWorldMesh(meshes.ring, matTemp, 6, sr.col, 2.2, 1.0, a * 0.85);
  }

  if (arena.frigate.active && arena.frigate.alive) {
    const fr = arena.frigate;
    const by = duneH(fr.beamX, fr.beamZ);
    const beamH = Math.max(8, fr.y - by);
    M4.trs(matTemp, fr.beamX, by + beamH * 0.5, fr.beamZ, 0, t * 5.0, 0, 2.4, beamH, 2.4);
    drawWorldMesh(meshes.cyl, matTemp, 6, [1.0, 0.36, 0.08], 2.6, 1.0, 0.72);
    M4.trs(matTemp, fr.beamX, by + 0.4, fr.beamZ, 0, -t * 3.0, 0, 8.5, 1.0, 8.5);
    drawWorldMesh(meshes.ring, matTemp, 6, [1.0, 0.55, 0.14], 2.4, 1.0, 0.85);
  }

  // 3. Translucent Emissive Rings & Orbital Beam
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

  // 4. GPU-Instanced Sand Spray & Wreckage Shards
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
      d[o + 5] = p.kind === 1 ? 1.4 : 1.0;
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

  // 5. Fullscreen Heat-Mirage Shimmer, Sun Flare & ACES Post-Process
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.viewport(0, 0, canvas.width, canvas.height);
  gl.disable(gl.DEPTH_TEST);
  gl.disable(gl.BLEND);
  gl.depthMask(true);

  const rush = clamp(
    (worm.airborne ? 0.65 : 0) + worm.spiceGlow * 0.55 + (worm.submerged > 0.5 ? 0.38 : 0),
    0,
    1.0
  );

  gl.useProgram(progPost.prog);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, fboTex);
  gl.uniform1i(progPost.u.uTex, 0);
  gl.uniform2f(progPost.u.uRes, fboW, fboH);
  gl.uniform1f(progPost.u.uTime, t);
  gl.uniform1f(progPost.u.uHeatAmt, hazeValues[hazePreset]);
  gl.uniform1f(progPost.u.uRushBlur, rush);
  gl.uniform1f(progPost.u.uSubmerged, worm.submerged);
  gl.bindVertexArray(postVAO);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
  gl.bindVertexArray(null);

  updateWaypointsAndHUD(matVP);
}

// --- Acoustic Oscilloscope in Studio ---
const scopeBuf = new Uint8Array(256);
function renderStudioScope() {
  if (!scopeCtx || !studioEl.classList.contains('open')) return;
  const w = scopeCvs.width;
  const h = scopeCvs.height;
  scopeCtx.fillStyle = '#0d0704';
  scopeCtx.fillRect(0, 0, w, h);
  if (!audio.analyser) return;
  audio.analyser.getByteTimeDomainData(scopeBuf);
  scopeCtx.strokeStyle = '#f09a24';
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
  const dt = Math.min(0.05, Math.max(0.001, (now - lastTime) * 0.001));
  lastTime = now;
  const t = now * 0.001;

  fpsFrames++;
  fpsAccum += dt;
  if (fpsAccum >= 0.5) {
    currentFps = Math.round(fpsFrames / fpsAccum);
    fpsFrames = 0;
    fpsAccum = 0;
    perfEl.textContent = `${currentFps} FPS · ${hazeNames[hazePreset]}`;
  }

  updateSimulation(dt, t);
  updateEffects(dt);
  renderScene(t);
  renderStudioScope();
}
requestAnimationFrame(frame);

// --- Automated Verification & Diagnostics Hook ---
window.__WORMRIDER__ = {
  getState() {
    return {
      mode,
      playPhase,
      fps: currentFps,
      glErr: gl.getError(),
      score,
      harvestersDevoured,
      harvestersAlive: arena.harvesters.filter((h) => h.alive).length,
      orniKills,
      frigateActive: arena.frigate.active,
      frigateAlive: arena.frigate.alive,
      frigateHp: arena.frigate.hp,
      worm: {
        x: Number(worm.x.toFixed(1)),
        y: Number(worm.y.toFixed(1)),
        z: Number(worm.z.toFixed(1)),
        submerged: Number(worm.submerged.toFixed(2)),
        airborne: worm.airborne,
        diveCharge: Number(worm.diveCharge.toFixed(2)),
        segments: worm.segments.length,
      },
    };
  },
  forceMount() {
    mountSandwormNow();
  },
  breachHarvester(idx = 0) {
    const h = arena.harvesters[idx];
    if (!h || !h.alive) return false;
    worm.airborne = false;
    worm.x = h.x;
    worm.z = h.z;
    worm.y = h.y - 2.0;
    worm.submerged = 1.0;
    worm.diveCharge = 1.0;
    triggerDiveReleaseBreach();
    return true;
  },
  breachFrigate() {
    const fr = arena.frigate;
    if (!fr.active || !fr.alive) return false;
    fr.hitFlash = 0;
    worm.x = fr.x;
    worm.z = fr.z;
    worm.y = fr.y - 3.0;
    worm.submerged = 0.0;
    worm.diveCharge = 1.0;
    worm.airborne = true;
    worm.vy = 26.0;
    checkWormDevourCollisions();
    return true;
  },
};
