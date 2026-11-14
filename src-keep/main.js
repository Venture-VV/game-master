// KEEP: PASSWORD FORTRESS — Main WebGL2 Loop, Orbit/Zoom Camera, Password Architect HUD,
// Acoustic Oscilloscope Studio & Automated Verification API

import {
  M4,
  V3,
  clamp,
  lerp,
  damp,
  TIER_DEFS,
  analyzePassword,
  generateSovereignPassword,
} from './math.js';
import {
  SKY_VS,
  SKY_FS,
  OCEAN_VS,
  OCEAN_FS,
  WORLD_VS,
  WORLD_FS,
  SHIELD_VS,
  SHIELD_FS,
  PARTICLE_VS,
  PARTICLE_FS,
  POST_VS,
  POST_FS,
  compileProgram,
} from './shaders.js';
import { createWorldMeshes, createParticleSystem, KingdomWorld } from './world.js';
import { PasswordKeepAudio } from './audio.js';

// --- DOM Elements ---
const appEl = document.getElementById('keep-app');
const canvas = document.getElementById('kp-canvas');
const hudEl = document.getElementById('kp-hud');
const overlayEl = document.getElementById('kp-overlay');
const titleEl = document.getElementById('kp-title');

const perfEl = document.getElementById('kp-perf');
const tierTagEl = document.getElementById('kp-tier-tag');
const bitsValEl = document.getElementById('kp-bits-val');
const crackValEl = document.getElementById('kp-crack-val');

const poolLowerEl = document.getElementById('pool-lower');
const poolDigitEl = document.getElementById('pool-digit');
const poolUpperEl = document.getElementById('pool-upper');
const poolSymbolEl = document.getElementById('pool-symbol');
const poolUnicodeEl = document.getElementById('pool-unicode');

const toastFeedEl = document.getElementById('kp-toast-feed');
const bannerEl = document.getElementById('kp-banner');
const bannerTitleEl = document.getElementById('kp-banner-title');
const bannerSubEl = document.getElementById('kp-banner-sub');

const passInput = document.getElementById('kp-pass-input');
const statBadgeEl = document.getElementById('kp-stat-badge');
const entFillEl = document.getElementById('kp-ent-fill');
const vulnTagEl = document.getElementById('kp-vuln-tag');

const btnCam = document.getElementById('btn-cam');
const btnMute = document.getElementById('btn-mute');
const btnFs = document.getElementById('btn-fs');
const btnPause = document.getElementById('btn-pause');
const btnTall = document.getElementById('btn-tall');
const menuBtnTall = document.getElementById('menu-btn-tall');
const btnClear = document.getElementById('btn-clear');
const btnSiege = document.getElementById('btn-siege');

const btnStart = document.getElementById('kp-btn-start');
const btnSovereign = document.getElementById('kp-btn-sovereign');
const btnStudio = document.getElementById('kp-btn-studio');
const studioEl = document.getElementById('kp-studio');
const scopeCvs = document.getElementById('kp-scope');
const scopeCtx = scopeCvs ? scopeCvs.getContext('2d') : null;
const volRange = document.getElementById('kp-vol');

const debriefEl = document.getElementById('kp-siege-debrief');
const dbTierEl = document.getElementById('db-tier');
const dbBitsEl = document.getElementById('db-bits');
const dbIntEl = document.getElementById('db-int');
const dbBreachEl = document.getElementById('db-breach');
const dbRankEl = document.getElementById('db-rank');

// --- WebGL2 Initialization ---
const gl = canvas.getContext('webgl2', {
  antialias: false,
  alpha: false,
  depth: true,
  stencil: false,
  powerPreference: 'high-performance',
});

if (!gl) {
  throw new Error('WebGL2 is required for KEEP: PASSWORD FORTRESS');
}

const hasFloatFBO =
  Boolean(gl.getExtension('EXT_color_buffer_float')) &&
  Boolean(gl.getExtension('OES_texture_float_linear'));

const progSky = compileProgram(gl, SKY_VS, SKY_FS, [
  'uProj',
  'uView',
  'uCamPos',
  'uSunDir',
  'uTime',
  'uEntropyNorm',
  'uSiegeAmt',
]);
const progOcean = compileProgram(gl, OCEAN_VS, OCEAN_FS, [
  'uProj',
  'uView',
  'uTime',
  'uEntropyNorm',
  'uIslandRadius',
  'uCamPos',
  'uSunDir',
  'uSkyCascadeAmt',
  'uSiegeAmt',
]);
const progWorld = compileProgram(gl, WORLD_VS, WORLD_FS, [
  'uProj',
  'uView',
  'uModel',
  'uCamPos',
  'uSunDir',
  'uTime',
  'uEntropyNorm',
  'uSiegeAmt',
  'uHearthLight',
  'uLighthouseBeam',
  'uColor',
  'uParams',
]);
const progShield = compileProgram(gl, SHIELD_VS, SHIELD_FS, [
  'uProj',
  'uView',
  'uModel',
  'uCamPos',
  'uTime',
  'uShieldAlpha',
  'uShieldHit',
]);
const progParticle = compileProgram(gl, PARTICLE_VS, PARTICLE_FS, ['uProj', 'uView']);
const progPost = compileProgram(gl, POST_VS, POST_FS, [
  'uTex',
  'uRes',
  'uImpactFlash',
  'uGoldGlow',
]);

const meshes = createWorldMeshes(gl);
const particleSys = createParticleSystem(gl, 900);
const postVAO = gl.createVertexArray();

// --- Offscreen Scene Framebuffer ---
let fbo = null;
let fboTex = null;
let fboDepth = null;
let fboW = 0;
let fboH = 0;
let qualityScale = 1.0;
let stickyGlErr = 0;

function createOrResizeFBO() {
  const rectW = Math.max(2, appEl.clientWidth || 800);
  const rectH = Math.max(2, appEl.clientHeight || 446);
  const dpr = Math.min(window.devicePixelRatio || 1, 2) * qualityScale;
  const targetW = Math.max(2, Math.round(rectW * dpr));
  const targetH = Math.max(2, Math.round(rectH * dpr));

  if (canvas.width !== targetW || canvas.height !== targetH) {
    canvas.width = targetW;
    canvas.height = targetH;
  }
  if (fbo && fboW === targetW && fboH === targetH) return;

  fboW = targetW;
  fboH = targetH;

  if (fbo) gl.deleteFramebuffer(fbo);
  if (fboTex) gl.deleteTexture(fboTex);
  if (fboDepth) gl.deleteRenderbuffer(fboDepth);

  fboTex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, fboTex);
  if (hasFloatFBO) {
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, fboW, fboH, 0, gl.RGBA, gl.HALF_FLOAT, null);
  } else {
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, fboW, fboH, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  }
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

createOrResizeFBO();
window.addEventListener('resize', createOrResizeFBO);

// --- Audio, World & Application State ---
const audio = new PasswordKeepAudio();
const world = new KingdomWorld(audio);

let mode = 'menu'; // 'menu' | 'keep' | 'paused'
let analysis = analyzePassword('');
world.applyAnalysis(analysis, false);

const CAM_MODES = [
  { name: '环岛俯瞰', pitchBias: 0.44, distMul: 1.0, autoSpin: 0.14 },
  { name: '仰望圣堡', pitchBias: 0.19, distMul: 0.82, autoSpin: 0.08 },
  { name: '天穹鸟瞰', pitchBias: 0.88, distMul: 1.24, autoSpin: 0.10 },
];
let camModeIdx = 0;
let camYaw = 0.62;
let camPitch = 0.44;
let camZoomMul = 1.0;
let camDistCur = 13.5;
let camLookYCur = 1.1;
let isDragging = false;
let dragLastX = 0;
let dragLastY = 0;

let bannerTimer = 0;
let siegeSmooth = 0;

// --- UI Helpers ---
function pushToast(text, tone = 'gold') {
  if (!toastFeedEl) return;
  const el = document.createElement('div');
  el.className = `kp-toast ${tone}`;
  el.textContent = text;
  toastFeedEl.prepend(el);
  while (toastFeedEl.children.length > 2) {
    toastFeedEl.lastElementChild.remove();
  }
  setTimeout(() => {
    if (el.parentNode) el.remove();
  }, 3200);
}

function showBanner(title, sub, duration = 2.6) {
  if (!bannerEl) return;
  bannerTitleEl.textContent = title;
  bannerSubEl.textContent = sub;
  bannerEl.classList.add('show');
  bannerTimer = duration;
}

function syncHUDFromAnalysis(prevTier = -1) {
  const t = analysis.tier;
  tierTagEl.textContent = `TIER ${t} · ${analysis.tierName}`;
  tierTagEl.className =
    t <= 1 ? 'weak' : t === 2 ? 'mid' : t <= 4 ? 'strong' : 'sovereign';

  bitsValEl.textContent = `${analysis.entropyBits.toFixed(1)} BITS`;
  crackValEl.textContent = analysis.crackTimeLabel;
  statBadgeEl.textContent = `${analysis.passwordLength} 字符 · 建筑 ${world.buildingsCount}`;

  // Pool telemetry pills
  const p = analysis.pools;
  poolLowerEl.textContent = `a-z 农舍 ${p.lower}`;
  poolLowerEl.classList.toggle('active', p.lower > 0);

  poolDigitEl.textContent = `0-9 哨塔 ${p.digit}`;
  poolDigitEl.classList.toggle('active', p.digit > 0);

  poolUpperEl.textContent = `A-Z 石堡 ${p.upper}`;
  poolUpperEl.classList.toggle('active', p.upper > 0);

  poolSymbolEl.textContent = `!@# 火炮 ${p.symbol}`;
  poolSymbolEl.className = `kp-pool-pill gold${p.symbol > 0 ? ' active' : ''}`;

  poolUnicodeEl.textContent = `汉字 圣碑 ${p.unicode}`;
  poolUnicodeEl.className = `kp-pool-pill gold${p.unicode > 0 ? ' active' : ''}`;

  // Progress bar & vulnerability hint
  const pct = clamp((analysis.entropyBits / 115) * 100, 0, 100);
  entFillEl.style.width = `${pct.toFixed(1)}%`;
  entFillEl.style.background =
    t <= 0
      ? '#e0633a'
      : t === 1
      ? '#f97316'
      : t === 2
      ? '#14b8a6'
      : t <= 4
      ? '#10b981'
      : '#f5b82e';

  vulnTagEl.textContent = analysis.warnings[0] || TIER_DEFS[t].desc;

  if (prevTier >= 0 && t > prevTier && mode === 'keep') {
    showBanner(
      `晋升 TIER ${t} · ${analysis.tierName}`,
      `${TIER_DEFS[t].desc}（穷举需 ${analysis.crackTimeLabel}）`,
      2.8
    );
    pushToast(`筑城晋阶：${analysis.tierName}`, t >= 4 ? 'gold' : 'emerald');
  }
}

function applyPasswordValue(newPw, playSfx = true) {
  const prevTier = analysis.tier;
  analysis = analyzePassword(newPw);
  if (passInput && passInput.value !== analysis.password) {
    passInput.value = analysis.password;
  }
  world.applyAnalysis(analysis, playSfx);
  syncHUDFromAnalysis(prevTier);
}

syncHUDFromAnalysis(-1);

// --- Mode Transitions ---
function enterKeepMode(focusInput = true) {
  audio.init();
  mode = 'keep';
  overlayEl.classList.add('hidden');
  hudEl.classList.add('visible');
  createOrResizeFBO();
  if (focusInput && passInput) {
    passInput.focus({ preventScroll: true });
  }
}

function togglePauseMenu() {
  if (mode === 'keep') {
    mode = 'paused';
    titleEl.textContent = `密码筑城 · 已暂停 (TIER ${analysis.tier} ${analysis.tierName})`;
    btnStart.textContent = '继续筑城沙盒';
    overlayEl.classList.remove('hidden');
  } else {
    enterKeepMode(false);
  }
}

function triggerSiegeTest() {
  if (mode !== 'keep') {
    enterKeepMode(false);
  }
  if (world.underSiege) return;

  btnSiege.textContent = '算力轰击中…';
  btnSiege.classList.add('active');
  showBanner(
    '10¹¹ H/s 暴力算力攻城来袭！',
    `当前防线：TIER ${analysis.tier} ${analysis.tierName}（${analysis.entropyBits.toFixed(1)} bits）`,
    2.4
  );

  world.launchSiege((stats) => {
    btnSiege.textContent = '发起算力攻城';
    btnSiege.classList.remove('active');

    const total = Math.max(1, stats.spawned);
    const rank =
      stats.breached === 0 && stats.tier >= 5
        ? 'SSS 神域免疫'
        : stats.breached === 0 && stats.tier >= 4
        ? 'S+ 穹盾完胜'
        : stats.breached <= 2
        ? 'A 固若金汤'
        : stats.breached <= 6
        ? 'B 城防受损'
        : 'D 防线告破';

    if (debriefEl) {
      debriefEl.classList.add('show');
      dbTierEl.textContent = `TIER ${analysis.tier}`;
      dbBitsEl.textContent = `${analysis.entropyBits.toFixed(1)} BITS`;
      dbIntEl.textContent = `${stats.intercepted} / ${total}`;
      dbBreachEl.textContent = String(stats.breached);
      dbRankEl.textContent = rank;
    }

    if (stats.breached === 0) {
      showBanner(
        `攻城实测完胜 · ${rank}`,
        `成功拦截全部 ${stats.intercepted} 波暴力穷举陨石！`,
        3.0
      );
      pushToast(`防线零伤拦截 ${stats.intercepted}/${total} 波！`, 'emerald');
    } else {
      showBanner(
        `防线被击穿 ${stats.breached} 处 · ${rank}`,
        '建议增加密码长度并混编大写、符号与汉字铸造火炮与穹盾！',
        3.2
      );
      pushToast(`警告：弱口令遭算力击穿 ${stats.breached} 处`, 'amber');
    }
  });
}

// --- Event Listeners ---
passInput.addEventListener('input', () => {
  audio.init();
  applyPasswordValue(passInput.value, true);
});

btnClear.addEventListener('click', () => {
  audio.init();
  applyPasswordValue('', true);
  passInput.focus({ preventScroll: true });
});

btnSiege.addEventListener('click', () => {
  triggerSiegeTest();
});

document.querySelectorAll('.kp-chip').forEach((chip) => {
  chip.addEventListener('click', () => {
    audio.init();
    const raw = chip.getAttribute('data-pw') || '';
    const pw = raw === '__RANDOM__' ? generateSovereignPassword() : raw;
    if (mode !== 'keep') enterKeepMode(false);
    applyPasswordValue(pw, true);
  });
});

btnStart.addEventListener('click', () => {
  enterKeepMode(true);
});

btnSovereign.addEventListener('click', () => {
  enterKeepMode(false);
  applyPasswordValue('星穹神龙!99$Citadel#2077', true);
});

btnStudio.addEventListener('click', () => {
  audio.init();
  studioEl.classList.toggle('open');
});

document.querySelectorAll('.kp-sfx-trigger').forEach((btn) => {
  btn.addEventListener('click', () => {
    audio.triggerStudioSfx(btn.getAttribute('data-s'));
  });
});

document.querySelectorAll('.q-pill').forEach((pill) => {
  pill.addEventListener('click', () => {
    document.querySelectorAll('.q-pill').forEach((p) => p.classList.remove('active'));
    pill.classList.add('active');
    const q = pill.getAttribute('data-q');
    qualityScale = q === 'low' ? 0.68 : q === 'med' ? 0.85 : 1.0;
    createOrResizeFBO();
  });
});

if (volRange) {
  volRange.addEventListener('input', () => {
    audio.setVolume(Number(volRange.value) / 100);
  });
}

btnCam.addEventListener('click', () => {
  camModeIdx = (camModeIdx + 1) % CAM_MODES.length;
  camPitch = CAM_MODES[camModeIdx].pitchBias;
  pushToast(`切换机位：${CAM_MODES[camModeIdx].name}`, 'gold');
});

btnMute.addEventListener('click', () => {
  const muted = audio.toggleMute();
  btnMute.textContent = muted ? '静音' : '声效';
});

btnPause.addEventListener('click', () => {
  togglePauseMenu();
});

btnFs.addEventListener('click', () => {
  if (!document.fullscreenElement) {
    appEl.requestFullscreen?.().catch(() => {});
  } else {
    document.exitFullscreen?.().catch(() => {});
  }
});

const toggleTallMode = () => {
  const isTall = appEl.classList.toggle('tall');
  if (btnTall) btnTall.textContent = isTall ? '收起' : '大屏';
  if (menuBtnTall) menuBtnTall.textContent = isTall ? '收起大屏视野' : '展开大屏视野';
  createOrResizeFBO();
};
if (btnTall) btnTall.addEventListener('click', toggleTallMode);
if (menuBtnTall) menuBtnTall.addEventListener('click', toggleTallMode);

// Orbit & Zoom Pointer Controls on Canvas
canvas.addEventListener('pointerdown', (e) => {
  if (e.button !== 0) return;
  isDragging = true;
  dragLastX = e.clientX;
  dragLastY = e.clientY;
  canvas.setPointerCapture?.(e.pointerId);
});

canvas.addEventListener('pointermove', (e) => {
  if (!isDragging) return;
  const dx = e.clientX - dragLastX;
  const dy = e.clientY - dragLastY;
  dragLastX = e.clientX;
  dragLastY = e.clientY;
  camYaw -= dx * 0.0075;
  camPitch = clamp(camPitch + dy * 0.0055, 0.10, 1.22);
});

const stopDrag = () => {
  isDragging = false;
};
canvas.addEventListener('pointerup', stopDrag);
canvas.addEventListener('pointercancel', stopDrag);

canvas.addEventListener(
  'wheel',
  (e) => {
    if (mode !== 'keep') return;
    e.preventDefault();
    camZoomMul = clamp(camZoomMul + Math.sign(e.deltaY) * 0.08, 0.55, 1.65);
  },
  { passive: false }
);

// Keyboard Shortcuts — STRICTLY ignored while typing inside #kp-pass-input!
window.addEventListener('keydown', (e) => {
  if (document.activeElement === passInput) {
    if (e.key === 'Escape') {
      passInput.blur();
    }
    return;
  }
  if (e.metaKey || e.ctrlKey || e.altKey) return;

  const k = e.key.toLowerCase();
  if (k === 'c') {
    btnCam.click();
  } else if (k === 'p' || e.key === 'Escape') {
    togglePauseMenu();
  } else if (k === 'b') {
    triggerSiegeTest();
  }
});

// Offscreen IntersectionObserver Draw Skip
let isAppVisible = true;
if ('IntersectionObserver' in window) {
  const io = new IntersectionObserver(
    (entries) => {
      if (entries[0]) isAppVisible = entries[0].isIntersecting;
    },
    { threshold: 0.01 }
  );
  io.observe(appEl);
}

// --- WebGL2 Scene Rendering ---
const matProj = M4.create();
const matView = M4.create();
const matShield = M4.create();
const sunDir = V3.create(0.58, 0.42, -0.68);
const translucentQueue = [];

function renderScene(time, dt) {
  createOrResizeFBO();

  const tier = analysis.tier;
  const preset = CAM_MODES[camModeIdx];
  if (!isDragging && mode !== 'paused') {
    camYaw += preset.autoSpin * dt;
  }

  // Smoothly frame the evolving kingdom from Raft (Tier 0) up to Dragon Sanctuary (Tier 5)
  const tierDistTable = [11.5, 18.5, 22.5, 27.0, 31.5, 35.5];
  const tierLookYTable = [0.85, 1.45, 2.15, 3.25, 4.95, 6.25];
  const desiredDist = tierDistTable[tier] * preset.distMul * camZoomMul;
  const desiredLookY = tierLookYTable[tier];

  camDistCur = damp(camDistCur, desiredDist, 4.2, dt);
  camLookYCur = damp(camLookYCur, desiredLookY, 4.2, dt);

  const shakeX = (Math.random() - 0.5) * world.cameraShake * 0.65;
  const shakeY = (Math.random() - 0.5) * world.cameraShake * 0.55;

  const cosP = Math.cos(camPitch);
  const eyeX = Math.sin(camYaw) * cosP * camDistCur + shakeX;
  const eyeY = Math.max(1.1, Math.sin(camPitch) * camDistCur + camLookYCur * 0.45 + shakeY);
  const eyeZ = Math.cos(camYaw) * cosP * camDistCur;

  const aspect = fboW / Math.max(1, fboH);
  M4.perspective(matProj, (46 * Math.PI) / 180, aspect, 0.35, 520.0);
  M4.lookAt(matView, eyeX, eyeY, eyeZ, shakeX * 0.4, camLookYCur + shakeY * 0.4, 0, 0, 1, 0);

  const entNorm = world.entropyNormSmooth;
  siegeSmooth = damp(siegeSmooth, world.underSiege ? 1.0 : 0.0, 4.0, dt);

  // Sun sweeps higher in coastal daylight, then warm golden-hour angle in Sovereign Tier 4-5!
  const sunElev = lerp(0.28, lerp(0.68, 0.24, smoothstepRange(0.6, 0.95, entNorm)), smoothstepRange(0.1, 0.45, entNorm));
  const sunAz = -0.75 + entNorm * 0.45;
  V3.normalize(Math.cos(sunAz), sunElev, Math.sin(sunAz), sunDir);

  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
  gl.viewport(0, 0, fboW, fboH);
  gl.clearColor(0.043, 0.067, 0.090, 1.0);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

  // 1. Dynamic Entropy Sky Dome
  gl.disable(gl.DEPTH_TEST);
  gl.depthMask(false);
  gl.disable(gl.CULL_FACE);
  gl.disable(gl.BLEND);

  gl.useProgram(progSky.prog);
  gl.uniformMatrix4fv(progSky.u.uProj, false, matProj);
  gl.uniformMatrix4fv(progSky.u.uView, false, matView);
  gl.uniform3f(progSky.u.uCamPos, eyeX, eyeY, eyeZ);
  gl.uniform3f(progSky.u.uSunDir, sunDir[0], sunDir[1], sunDir[2]);
  gl.uniform1f(progSky.u.uTime, time);
  gl.uniform1f(progSky.u.uEntropyNorm, entNorm);
  gl.uniform1f(progSky.u.uSiegeAmt, siegeSmooth);
  gl.bindVertexArray(meshes.sphere.vao);
  gl.drawElements(gl.TRIANGLES, meshes.sphere.count, meshes.sphere.indexType, 0);

  // 2. Animated Ocean & Coastal Reef Surf
  gl.enable(gl.DEPTH_TEST);
  gl.depthMask(true);

  const islandR = Math.max(2.0, world.islandRadiusSpring.x);
  const cascadeAmt = clamp(world.tierSprings[4].x, 0, 1);

  gl.useProgram(progOcean.prog);
  gl.uniformMatrix4fv(progOcean.u.uProj, false, matProj);
  gl.uniformMatrix4fv(progOcean.u.uView, false, matView);
  gl.uniform1f(progOcean.u.uTime, time);
  gl.uniform1f(progOcean.u.uEntropyNorm, entNorm);
  gl.uniform1f(progOcean.u.uIslandRadius, islandR);
  gl.uniform3f(progOcean.u.uCamPos, eyeX, eyeY, eyeZ);
  gl.uniform3f(progOcean.u.uSunDir, sunDir[0], sunDir[1], sunDir[2]);
  gl.uniform1f(progOcean.u.uSkyCascadeAmt, cascadeAmt);
  gl.uniform1f(progOcean.u.uSiegeAmt, siegeSmooth);
  gl.bindVertexArray(meshes.ocean.vao);
  gl.drawElements(gl.TRIANGLES, meshes.ocean.count, meshes.ocean.indexType, 0);

  // 3. 6-Tier Procedural Island Kingdom, Per-Char Buildings, Dragon & Siege Meteors
  gl.useProgram(progWorld.prog);
  gl.uniformMatrix4fv(progWorld.u.uProj, false, matProj);
  gl.uniformMatrix4fv(progWorld.u.uView, false, matView);
  gl.uniform3f(progWorld.u.uCamPos, eyeX, eyeY, eyeZ);
  gl.uniform3f(progWorld.u.uSunDir, sunDir[0], sunDir[1], sunDir[2]);
  gl.uniform1f(progWorld.u.uTime, time);
  gl.uniform1f(progWorld.u.uEntropyNorm, entNorm);
  gl.uniform1f(progWorld.u.uSiegeAmt, siegeSmooth);

  const hearthGlow =
    tier >= 1 && tier <= 2
      ? 2.2 + 0.45 * Math.sin(time * 13.0)
      : tier >= 3
      ? 1.4
      : 0.6;
  gl.uniform4f(progWorld.u.uHearthLight, 0, tier >= 4 ? 6.0 : 1.5, 0, hearthGlow);

  const s3 = clamp(world.tierSprings[3].x, 0, 1);
  const lhX = Math.cos(0.68) * (islandR * 0.78);
  const lhZ = Math.sin(0.68) * (islandR * 0.78);
  gl.uniform4f(progWorld.u.uLighthouseBeam, lhX, lhZ, time * 1.15, s3);

  translucentQueue.length = 0;
  const drawWorldProp = (mesh, modelMat, col, matType = 0, emissive = 0, alpha = 1, aoHint = 1) => {
    if (alpha < 0.98) {
      const copy = M4.create();
      copy.set(modelMat);
      translucentQueue.push({ mesh, modelMat: copy, col, matType, emissive, alpha, aoHint });
      return;
    }
    gl.uniformMatrix4fv(progWorld.u.uModel, false, modelMat);
    gl.uniform3f(progWorld.u.uColor, col[0], col[1], col[2]);
    gl.uniform4f(progWorld.u.uParams, matType, emissive, 1.0, aoHint);
    gl.bindVertexArray(mesh.vao);
    gl.drawElements(gl.TRIANGLES, mesh.count, mesh.indexType, 0);
  };

  world.render(drawWorldProp, meshes, time);

  // 4. Translucent Waterfalls, Lighthouse Beams & Cannon Tracers
  if (translucentQueue.length > 0) {
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.depthMask(false);
    for (const item of translucentQueue) {
      gl.uniformMatrix4fv(progWorld.u.uModel, false, item.modelMat);
      gl.uniform3f(progWorld.u.uColor, item.col[0], item.col[1], item.col[2]);
      gl.uniform4f(progWorld.u.uParams, item.matType, item.emissive, item.alpha, item.aoHint);
      gl.bindVertexArray(item.mesh.vao);
      gl.drawElements(gl.TRIANGLES, item.mesh.count, item.mesh.indexType, 0);
    }
  }

  // 5. Tier 4-5 Sovereign Golden-Turquoise Fresnel Energy Shield Dome
  const shieldScale = clamp(world.tierSprings[4].x, 0, 1);
  if (shieldScale > 0.02) {
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
    gl.depthMask(false);

    const domeR = (islandR + 2.6) * shieldScale;
    M4.trs(matShield, 0, 0.2, 0, 0, time * 0.08, 0, domeR, domeR * 1.08, domeR);

    gl.useProgram(progShield.prog);
    gl.uniformMatrix4fv(progShield.u.uProj, false, matProj);
    gl.uniformMatrix4fv(progShield.u.uView, false, matView);
    gl.uniformMatrix4fv(progShield.u.uModel, false, matShield);
    gl.uniform3f(progShield.u.uCamPos, eyeX, eyeY, eyeZ);
    gl.uniform1f(progShield.u.uTime, time);
    gl.uniform1f(progShield.u.uShieldAlpha, shieldScale * (0.72 + siegeSmooth * 0.28));
    gl.uniform4f(
      progShield.u.uShieldHit,
      world.shieldHit[0],
      world.shieldHit[1],
      world.shieldHit[2],
      world.shieldHit[3]
    );
    gl.bindVertexArray(meshes.sphere.vao);
    gl.drawElements(gl.TRIANGLES, meshes.sphere.count, meshes.sphere.indexType, 0);
  }

  // 6. GPU-Instanced Smoke, Storm Spray, Cannon Sparks, Dragon Breath & Golden Fireworks
  if (world.particles.length > 0) {
    const d = particleSys.data;
    const count = Math.min(world.particles.length, particleSys.maxParticles);
    for (let i = 0; i < count; i++) {
      const p = world.particles[i];
      const fade = clamp(p.life / p.maxLife, 0, 1);
      const o = i * 12;
      d[o] = p.x;
      d[o + 1] = p.y;
      d[o + 2] = p.z;
      d[o + 3] = p.size;
      d[o + 4] = p.rot;
      d[o + 5] = 1.0;
      d[o + 6] = 0;
      d[o + 7] = p.kind;
      d[o + 8] = p.r;
      d[o + 9] = p.g;
      d[o + 10] = p.b;
      d[o + 11] = p.a * Math.sin(fade * Math.PI * 0.85 + 0.15);
    }

    gl.enable(gl.BLEND);
    // Additive-friendly alpha blend for luminous sparks & soft smoke
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.depthMask(false);

    gl.useProgram(progParticle.prog);
    gl.uniformMatrix4fv(progParticle.u.uProj, false, matProj);
    gl.uniformMatrix4fv(progParticle.u.uView, false, matView);
    gl.bindVertexArray(particleSys.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, particleSys.instVBO);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, d.subarray(0, count * 12));
    gl.drawElementsInstanced(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0, count);
  }

  // 7. Fullscreen ACES Filmic Post-Process
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
  gl.uniform1f(progPost.u.uImpactFlash, world.impactFlash);
  gl.uniform1f(progPost.u.uGoldGlow, world.goldGlow);
  gl.bindVertexArray(postVAO);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
  gl.bindVertexArray(null);
}

function smoothstepRange(e0, e1, x) {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
}

// --- Acoustic Oscilloscope Renderer inside #kp-studio ---
const scopeData = new Uint8Array(256);
function renderStudioScope() {
  if (!scopeCtx || !studioEl || !studioEl.classList.contains('open')) return;
  const w = scopeCvs.width;
  const h = scopeCvs.height;
  scopeCtx.fillStyle = '#060a0e';
  scopeCtx.fillRect(0, 0, w, h);

  scopeCtx.strokeStyle = 'rgba(20, 184, 166, 0.25)';
  scopeCtx.lineWidth = 1;
  scopeCtx.beginPath();
  scopeCtx.moveTo(0, h * 0.5);
  scopeCtx.lineTo(w, h * 0.5);
  scopeCtx.stroke();

  if (!audio.analyser) return;
  audio.analyser.getByteTimeDomainData(scopeData);
  scopeCtx.strokeStyle = '#f5b82e';
  scopeCtx.lineWidth = 2;
  scopeCtx.beginPath();
  for (let i = 0; i < scopeData.length; i++) {
    const x = (i / (scopeData.length - 1)) * w;
    const y = (scopeData[i] / 255) * h;
    if (i === 0) scopeCtx.moveTo(x, y);
    else scopeCtx.lineTo(x, y);
  }
  scopeCtx.stroke();
}

// --- Main Animation Loop ---
let lastNow = performance.now();
let fpsFrames = 0;
let fpsAccum = 0;
let currentFps = 60;

function tick(now) {
  requestAnimationFrame(tick);
  if (!isAppVisible) {
    lastNow = now;
    return;
  }

  const dt = Math.min(0.05, Math.max(0.001, (now - lastNow) * 0.001));
  lastNow = now;
  const time = now * 0.001;

  fpsFrames++;
  fpsAccum += dt;
  if (fpsAccum >= 0.45) {
    currentFps = Math.round(fpsFrames / fpsAccum);
    fpsFrames = 0;
    fpsAccum = 0;
    perfEl.textContent = `${currentFps} FPS · ${analysis.weatherLabel} · ${CAM_MODES[camModeIdx].name}`;
  }

  if (bannerTimer > 0) {
    bannerTimer -= dt;
    if (bannerTimer <= 0 && bannerEl) {
      bannerEl.classList.remove('show');
    }
  }

  if (mode !== 'paused') {
    world.update(dt, time);
    audio.update(dt, analysis.tier, analysis.entropyBits, world.underSiege, mode === 'keep');
  }

  renderScene(time, dt);
  renderStudioScope();
}
requestAnimationFrame(tick);

// --- Automated Verification & External Control API ---
window.__PASSWORDKEEP__ = {
  getState() {
    const err = gl.getError();
    if (err !== 0) stickyGlErr = err;
    return {
      mode,
      fps: currentFps,
      glErr: stickyGlErr,
      passwordLength: analysis.passwordLength,
      entropyBits: analysis.entropyBits,
      tier: analysis.tier,
      tierName: analysis.tierName,
      crackTimeLabel: analysis.crackTimeLabel,
      underSiege: world.underSiege,
      buildingsCount: world.buildingsCount,
    };
  },
  startKeep() {
    enterKeepMode(true);
    return this.getState();
  },
  setPassword(pw = '') {
    if (mode !== 'keep') enterKeepMode(false);
    applyPasswordValue(String(pw), true);
    return this.getState();
  },
  launchSiege() {
    triggerSiegeTest();
    return this.getState();
  },
};
