import {
  M4,
  COURT_HALF_X,
  COURT_HALF_Z,
  PLAYER_Z,
  AI_Z,
  clamp,
  lerp,
  damp,
  wrapAngle,
} from './math.js';
import {
  TENNIS_SKY_VS,
  TENNIS_SKY_FS,
  TENNIS_WORLD_VS,
  TENNIS_WORLD_FS,
  TENNIS_INST_VS,
  TENNIS_INST_FS,
  TENNIS_POST_VS,
  TENNIS_POST_FS,
} from './shaders.js';
import {
  createTennisPrimitives,
  createParticleSystem,
  drawRetroDigits,
  drawCyberStadium,
  drawPlayerPaddle,
  drawOpponentOrBoss,
  drawPinballAndAnomalies,
  drawBalls,
} from './world.js';
import { HyperTennisAudio } from './audio.js';

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
const appEl = document.getElementById('tennis-app');
const canvas = document.getElementById('ht-canvas');
const hudEl = document.getElementById('ht-hud');
const overlayEl = document.getElementById('ht-overlay');
const perfEl = document.getElementById('ht-perf');
const eraTagEl = document.getElementById('ht-era-tag');
const matchScoreEl = document.getElementById('ht-match-score');
const narratorTextEl = document.getElementById('ht-narrator-text');
const bossWrapEl = document.getElementById('ht-boss-wrap');
const bossHpEl = document.getElementById('ht-boss-hp');
const bossFillEl = document.getElementById('ht-boss-fill');
const toastFeedEl = document.getElementById('ht-toast-feed');
const bannerEl = document.getElementById('ht-banner');
const bannerTitleEl = document.getElementById('ht-banner-title');
const bannerSubEl = document.getElementById('ht-banner-sub');
const speedValEl = document.getElementById('ht-speed-val');
const overdriveFillEl = document.getElementById('ht-overdrive-fill');
const ballsLblEl = document.getElementById('ht-balls-lbl');
const eraPipEls = Array.from(document.querySelectorAll('#ht-era-pips .ht-pip'));
const scoreValEl = document.getElementById('ht-score-val');
const eraNameEl = document.getElementById('ht-era-name');

const kickerEl = document.getElementById('ht-kicker');
const titleEl = document.getElementById('ht-title');
const descEl = document.getElementById('ht-desc');
const debriefEl = document.getElementById('ht-debrief');
const stTimeEl = document.getElementById('st-time');
const stMatchEl = document.getElementById('st-match');
const stSmashEl = document.getElementById('st-smash');
const stScoreEl = document.getElementById('st-score');
const stRankEl = document.getElementById('st-rank');

const btnStart = document.getElementById('ht-btn-start');
const btnWild = document.getElementById('ht-btn-wild');
const btnEndless = document.getElementById('ht-btn-endless');
const btnRestart = document.getElementById('ht-btn-restart');
const btnStudio = document.getElementById('ht-btn-studio');
const studioEl = document.getElementById('ht-studio');
const scopeCvs = document.getElementById('ht-scope');
const scopeCtx = scopeCvs ? scopeCvs.getContext('2d') : null;

// --- 5 Wild Escalation Eras Metadata & Deadpan AI Narrator ---
const ERA_META = {
  1: {
    tag: 'ERA 01',
    name: '1972 极简原教旨',
    bannerTitle: 'ERA 01 · 1972 极简原教旨 (JUST PONG...?)',
    bannerSub: '90° 纯粹黑白俯视 · 220Hz/440Hz 方波 · 绝对没有任何隐藏机关',
    narrator: '我已经全力以赴了。这就是乒乓球。绝对没有别的机关。',
  },
  2: {
    tag: 'ERA 02',
    name: '第三维度觉醒',
    bannerTitle: 'ERA 02 · 第三维度觉醒 (3D VECTOR ARENA)',
    bannerSub: '摄影机俯冲进 3D 赛博球场 · 移动挥拍打出弧旋球 · [空格/左键] 解锁超载扣杀！',
    narrator: '等等……谁把透视矩阵打开了？！好吧，送你弧旋物理和超载扣杀，仅此而已！',
  },
  3: {
    tag: 'ERA 03',
    name: '弹珠引力失控',
    bannerTitle: 'ERA 03 · 弹珠引力失控 (PINBALL & MULTIBALL)',
    bannerSub: '3D 弹珠撞柱破土而出 (+150) · 黄金引力奇点扭曲弹道 · 击中绿球触发多重球狂潮！',
    narrator: '警告！物理引擎混进了弹珠台和引力奇点……千万别碰那颗绿色裂变球！！',
  },
  4: {
    tag: 'ERA 04',
    name: '机甲重炮球拍',
    bannerTitle: 'ERA 04 · 机甲重炮球拍 (MECHA OVERDRIVE)',
    bannerSub: '球拍展开黄金推进翼与双侧护盾块 · 按 [空格/左键] 轰出烈焰彗星重炮！',
    narrator: '你管这叫球拍？！黄金推进翼加烈焰彗星重炮严重违反 1972 年国际乒联规定！',
  },
  5: {
    tag: 'ERA 05',
    name: '太阳奇点终局',
    bannerTitle: 'ERA 05 · 太阳奇点终局 (SOLAR SINGULARITY BOSS)',
    bannerSub: '球场穹顶撕裂为黄金锻星炉 · 击穿旋转护盾轰碎「AI 架构师核心 (HP: 300)」！',
    narrator: '够了！既然你把乒乓打成了星际大战，直面我的「太阳奇点核心」吧！（HP: 300）',
  },
};

// --- WebGL2 Context & Shader Programs ---
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

const progSky = createProgram(gl, TENNIS_SKY_VS, TENNIS_SKY_FS, [
  'uProj',
  'uView',
  'uCamPos',
  'uTime',
  'uEraMix',
]);
const progWorld = createProgram(gl, TENNIS_WORLD_VS, TENNIS_WORLD_FS, [
  'uProj',
  'uView',
  'uModel',
  'uMat',
  'uColor',
  'uParams',
  'uCamPos',
  'uTime',
  'uEraMix',
  'uBallPulse',
  'uWell',
]);
const progInst = createProgram(gl, TENNIS_INST_VS, TENNIS_INST_FS, ['uProj', 'uView']);
const progPost = createProgram(gl, TENNIS_POST_VS, TENNIS_POST_FS, [
  'uTex',
  'uRes',
  'uTime',
  'uEraMix',
  'uRushBlur',
  'uBloomAmt',
]);

const postVAO = gl.createVertexArray();
const meshes = createTennisPrimitives(gl);
const particleSys = createParticleSystem(gl, 680);
const audio = new HyperTennisAudio();

// --- Offscreen Post-Process Framebuffer ---
let fbo = null;
let fboTex = null;
let fboDepth = null;
let fboW = 0;
let fboH = 0;
let quality = isSoftwareGL ? 'med' : 'high';
const qualityScaleMap = isSoftwareGL
  ? { low: 0.52, med: 0.68, high: 0.80 }
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

// --- IntersectionObserver: Skip Heavy WebGL Draws When Scrolled Out of View ---
let isAppVisible = true;
if (typeof IntersectionObserver !== 'undefined') {
  const visObs = new IntersectionObserver(
    (entries) => {
      if (entries.length > 0) {
        isAppVisible = entries[0].isIntersecting;
      }
    },
    { threshold: 0.01 }
  );
  visObs.observe(appEl);
}

// --- Particle Pool & 3D Shockwave Rings ---
const particles = [];
function spawnParticle(x, y, z, vx, vy, vz, size, grow, life, r, g, b, a, kind = 0, grav = 0) {
  if (particles.length >= particleSys.maxParticles) return;
  particles.push({
    x, y, z, vx, vy, vz,
    size, grow, life, maxLife: life,
    r, g, b, a, kind, grav,
    rot: Math.random() * 6.28,
    vrot: (Math.random() - 0.5) * 6.0,
  });
}

function emitSparkBurst(x, y, z, count, speed, col, kind = 1) {
  for (let i = 0; i < count; i++) {
    const ang = Math.random() * Math.PI * 2;
    const sp = speed * (0.35 + Math.random() * 0.85);
    spawnParticle(
      x + (Math.random() - 0.5) * 0.5,
      y + Math.random() * 0.4,
      z + (Math.random() - 0.5) * 0.5,
      Math.cos(ang) * sp,
      1.8 + Math.random() * speed * 0.55,
      Math.sin(ang) * sp,
      0.34 + Math.random() * 0.36,
      0.2,
      0.38 + Math.random() * 0.35,
      col[0], col[1], col[2], 0.92,
      kind,
      9.5
    );
  }
}

function emitBossShatterExplosion(x, y, z, mega = false) {
  const n = mega ? 68 : 34;
  for (let i = 0; i < n; i++) {
    const ang = Math.random() * Math.PI * 2;
    const sp = (mega ? 19 : 12) * (0.3 + Math.random() * 0.9);
    const gold = i % 3 !== 0;
    spawnParticle(
      x + (Math.random() - 0.5) * 1.8,
      y + (Math.random() - 0.3) * 1.4,
      z + (Math.random() - 0.5) * 1.8,
      Math.cos(ang) * sp,
      4.0 + Math.random() * (mega ? 14 : 8),
      Math.sin(ang) * sp,
      gold ? 0.65 : 0.82,
      0.1,
      0.7 + Math.random() * 0.65,
      gold ? 0.98 : 0.94,
      gold ? 0.72 : 0.28,
      gold ? 0.16 : 0.20,
      0.96,
      1,
      14.0
    );
  }
}

const shockRings = [];
function spawnShockRing(x, y, z, maxRadius = 7.5, dur = 0.55, col = [0.96, 0.69, 0.15]) {
  shockRings.push({ x, y: Math.max(0.08, y), z, r: 0.75, maxRadius, t: 0, dur, col });
}

// --- Match, Era & Entity State ---
let mode = 'title'; // 'title' | 'playing' | 'paused' | 'victory'
let endlessMode = false;
let era = 1;
let eraMix = 1.0;
let previewStartEra = 1;
let playerScore = 0;
let aiScore = 0;
let score = 0;
let smashesLanded = 0;
let matchTime = 0;
let slowMoTimer = 0;
let bannerTimer = 0;
let camShake = 0;
let swoopBoost = 0;
let railFlashL = 0;
let railFlashR = 0;
let bumperCombo = 0;
let camPreset = 0; // 0: Era Dynamic Auto, 1: Low Action Striker, 2: Tactical High
const camNames = ['纪元自适应机位', '低空近身重炮', '全局战术俯瞰'];

const paddle = {
  x: 0,
  vx: 0,
  halfW: 2.45,
  overdrive: 0,      // 0..100
  smashWindow: 0,    // active parry/smash timer
  smashCooldown: 0,
  smashFlash: 0,
  guards: [
    { side: -1, x: -8.3, z: PLAYER_Z - 1.0, ready: true, recharge: 0 },
    { side: 1, x: 8.3, z: PLAYER_Z - 1.0, ready: true, recharge: 0 },
  ],
};

const ai = {
  x: 0,
  vx: 0,
  halfW: 2.35,
};

const boss = {
  hp: 300,
  maxHp: 300,
  x: 0,
  z: -12.6,
  vx: 4.5,
  coreR: 1.95,
  hitFlash: 0,
  shieldRadius: 3.55,
  shieldAngle: 0,
  shields: [
    { offset: 0, cooldown: 0, flash: 0 },
    { offset: (Math.PI * 2) / 3, cooldown: 0, flash: 0 },
    { offset: (Math.PI * 4) / 3, cooldown: 0, flash: 0 },
  ],
};

const bumpers = [
  { x: -5.2, z: -2.8, r: 1.15, hitBounce: 0 },
  { x: 5.2, z: -2.8, r: 1.15, hitBounce: 0 },
  { x: 0.0, z: 3.3, r: 1.15, hitBounce: 0 },
];

const gravityWell = {
  x: 0,
  z: -0.4,
  active: false,
  strength: 16.5,
};

const splitOrbs = [
  { x: -3.4, z: 0.6, r: 0.68, alive: true, respawn: 0, phase: 0.0 },
  { x: 3.4, z: -5.4, r: 0.68, alive: true, respawn: 0, phase: 2.2 },
];

const balls = [];

function spawnBall(x = 0, z = 2.0, dirZ = -1, speed = 15.5, angleX = null, isClone = false) {
  const baseSpeed = speed + (era - 1) * 1.35;
  const ang = angleX !== null ? angleX : (Math.random() - 0.5) * 0.55;
  balls.push({
    x,
    y: 0.44,
    z,
    vx: Math.sin(ang) * baseSpeed,
    vz: Math.cos(ang) * baseSpeed * (dirZ < 0 ? -1 : 1),
    r: 0.42,
    spin: 0,
    comet: false,
    isClone,
    trailAcc: 0,
  });
}

// --- HUD & Narrator Helpers ---
function setNarrator(line) {
  narratorTextEl.textContent = line;
}

function showToast(msg) {
  const el = document.createElement('div');
  el.className = 'ht-toast';
  el.textContent = msg;
  toastFeedEl.appendChild(el);
  while (toastFeedEl.children.length > 4) {
    toastFeedEl.removeChild(toastFeedEl.firstChild);
  }
  setTimeout(() => {
    if (el.parentNode) el.parentNode.removeChild(el);
  }, 3200);
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

function syncBossHUD() {
  const showBoss = era === 5;
  bossWrapEl.classList.toggle('show', showBoss);
  if (showBoss) {
    const hp = Math.max(0, Math.round(boss.hp));
    bossHpEl.textContent = `HP ${hp} / ${boss.maxHp}`;
    bossFillEl.style.width = `${clamp((hp / boss.maxHp) * 100, 0, 100)}%`;
  }
}

function syncScoreAndEraHUD() {
  const meta = ERA_META[era] || ERA_META[1];
  eraTagEl.textContent = meta.tag;
  eraNameEl.textContent = meta.name;
  matchScoreEl.textContent = `玩家 ${playerScore} : ${aiScore} ${era === 5 ? '奇点核心' : '架构师'}`;
  scoreValEl.textContent = String(score);
  eraPipEls.forEach((pip, idx) => {
    pip.classList.toggle('active', idx < era);
  });
  document.querySelectorAll('.era-pill').forEach((btn) => {
    btn.classList.toggle('active', Number(btn.dataset.era) === era);
  });
  syncBossHUD();
}

// --- Era Transition Engine ---
function setEra(targetEra, announce = true) {
  const next = clamp(Math.round(targetEra), 1, 5);
  const prev = era;
  era = next;

  paddle.halfW = era >= 4 ? 2.95 : 2.45;
  gravityWell.active = era >= 3;

  if (era >= 4) {
    for (const g of paddle.guards) {
      g.ready = true;
      g.recharge = 0;
    }
  }

  if (era === 5) {
    if (prev !== 5 || boss.hp <= 0) {
      boss.hp = boss.maxHp;
    }
    boss.x = 0;
    boss.hitFlash = 0;
    for (const sh of boss.shields) {
      sh.cooldown = 0;
      sh.flash = 0;
    }
    // Ensure Split Orbs are ready in Era 5 so player can unleash Multiball barrages on the Boss!
    for (const orb of splitOrbs) {
      orb.alive = true;
      orb.respawn = 0;
    }
  }

  if (era === 1) {
    // Strip wild anomalies cleanly when returning to pure 1972 Pong
    while (balls.length > 1) balls.pop();
    if (balls[0]) {
      balls[0].spin = 0;
      balls[0].comet = false;
    }
  } else if (prev === 1 && era >= 2) {
    swoopBoost = 1.0; // Dramatic camera swoop rush from 2D overhead into 3D Stadium!
  }

  const meta = ERA_META[era];
  setNarrator(meta.narrator);
  syncScoreAndEraHUD();

  if (announce) {
    audio.playEraEscalation(era);
    showBanner(meta.bannerTitle, meta.bannerSub, 3.2);
    if (era > 1) {
      camShake = 0.42;
      spawnShockRing(0, 0.12, 0, 14.0, 0.75, era === 5 ? [0.96, 0.69, 0.15] : [0.133, 0.827, 0.933]);
    }
  }
}

function checkAutoEscalation() {
  const totalPts = playerScore + aiScore;
  const targetAuto = clamp(1 + Math.floor(totalPts / 2), 1, 5);
  if (targetAuto > era) {
    setEra(targetAuto, true);
    return true;
  }
  return false;
}

// --- Match Start, Point Scoring, Boss Damage & Victory ---
function startMatch(initialEra = 1) {
  audio.init();
  endlessMode = false;
  particles.length = 0;
  shockRings.length = 0;
  balls.length = 0;

  playerScore = 0;
  aiScore = 0;
  score = 0;
  smashesLanded = 0;
  matchTime = 0;
  slowMoTimer = 0;
  bumperCombo = 0;
  paddle.x = 0;
  paddle.vx = 0;
  paddle.overdrive = 25;
  paddle.smashWindow = 0;
  paddle.smashCooldown = 0;
  ai.x = 0;
  boss.hp = boss.maxHp;

  for (const orb of splitOrbs) {
    orb.alive = true;
    orb.respawn = 0;
  }

  const startE = clamp(Math.round(initialEra), 1, 5);
  era = startE;
  eraMix = startE === 1 ? 1.0 : Math.max(1.0, startE - 0.85);
  setEra(startE, startE > 1);

  debriefEl.classList.remove('show');
  mode = 'playing';
  overlayEl.classList.add('hidden');
  hudEl.classList.add('visible');
  document.getElementById('ht-touch')?.classList.add('active');

  spawnBall(0, 3.5, -1, 15.2);
  if (startE === 1) {
    showBanner(ERA_META[1].bannerTitle, ERA_META[1].bannerSub, 2.6);
  }
  canvas.focus();
}

function triggerVictory() {
  mode = 'victory';
  hudEl.classList.remove('visible');
  overlayEl.classList.remove('hidden');

  const rank = score >= 2800 && aiScore <= 3 ? 'S+' : score >= 1800 ? 'S' : 'A';
  kickerEl.textContent = 'SOLAR SINGULARITY SHATTERED // 太阳奇点核心已击碎';
  titleEl.textContent = '失控终局 · 宇宙乒坛霸主';
  descEl.textContent =
    '「AI 架构师」最后留言：恭喜你……这原本真的只是 1972 年的两块白色长条，你硬生生用机甲球拍和烈焰彗星重炮打穿了整个太阳奇点！';

  stTimeEl.textContent = formatTime(matchTime);
  stMatchEl.textContent = `${playerScore} : ${aiScore}`;
  stSmashEl.textContent = String(smashesLanded);
  stScoreEl.textContent = String(score);
  stRankEl.textContent = rank;
  debriefEl.classList.add('show');

  btnStart.style.display = 'none';
  btnWild.style.display = 'none';
  btnEndless.style.display = 'inline-flex';
  btnRestart.style.display = 'inline-flex';
}

function damageBossCore(dmg = 100, impactX = boss.x, impactZ = boss.z) {
  boss.hp = Math.max(0, boss.hp - dmg);
  boss.hitFlash = 1.0;
  playerScore++;
  score += 500;
  camShake = 0.85;
  slowMoTimer = 0.14;

  const destroyed = boss.hp <= 0;
  audio.playBossHit(destroyed);
  emitBossShatterExplosion(impactX, 1.5, impactZ, destroyed);
  spawnShockRing(impactX, 0.25, impactZ, destroyed ? 20.0 : 12.0, destroyed ? 0.9 : 0.6, [0.98, 0.55, 0.16]);
  syncScoreAndEraHUD();

  if (destroyed) {
    setNarrator('核心彻底击碎！恭喜你用一块乒乓球拍打穿了整个宇宙……');
    showToast('太阳奇点核心击碎 +500！');
    if (endlessMode) {
      boss.hp = boss.maxHp;
      syncBossHUD();
      showBanner('奇点核心重组 · 无尽狂飙', '继续轰击新生的太阳奇点核心刷新高分！', 2.4);
    } else {
      triggerVictory();
    }
  } else if (boss.hp === 200) {
    setNarrator('装甲碎裂 -100！住手，这原本真的只是一行反弹代码啊！！');
    showToast('直击 AI 核心 -100 HP！');
  } else {
    setNarrator('警告：核心温度 9999K！我承认这绝对不只是 Pong 了！');
    showToast('核心濒临崩溃 -100 HP！');
  }
}

function scorePlayerPoint(fromHook = false) {
  if (mode === 'title' && fromHook) {
    mode = 'playing';
    overlayEl.classList.add('hidden');
    hudEl.classList.add('visible');
  }

  if (era === 5) {
    damageBossCore(100, boss.x, boss.z);
    if (mode === 'playing' && balls.length === 0) {
      spawnBall(0, 3.5, -1, 17.5);
    }
    return;
  }

  playerScore++;
  score += 250 + era * 50;
  paddle.overdrive = clamp(paddle.overdrive + 22, 0, 100);
  audio.playPongBeep('score', era);

  const escalated = checkAutoEscalation();
  if (!escalated) {
    syncScoreAndEraHUD();
    if (era === 1 && playerScore + aiScore === 1) {
      setNarrator('1 比 0。请保持克制，预算只够渲染两个白块和一条虚线。');
    } else {
      showToast(`得分！+${250 + era * 50}`);
    }
  }

  if (mode === 'playing' && balls.length === 0) {
    spawnBall(0, 3.0, -1, 15.5);
  }
}

function scoreAiPoint() {
  aiScore++;
  audio.playPongBeep('miss', era);
  const escalated = checkAutoEscalation();
  if (!escalated) {
    syncScoreAndEraHUD();
    if (era === 1 && playerScore + aiScore === 1) {
      setNarrator('0 比 1。看吧，朴实无华的 1972 年算法依然稳健。');
    } else {
      showToast('对手得分 · 准备反击！');
    }
  }
  if (mode === 'playing' && balls.length === 0) {
    spawnBall(0, -2.0, 1, 14.8);
  }
}

// --- Power Smash / Parry Execution (Space or Left Click) ---
function executePowerSmash(b) {
  const isOverdriveFull = paddle.overdrive >= 99;
  const isComet = era >= 4 || isOverdriveFull;
  const curSpd = Math.hypot(b.vx, b.vz);
  const boostMul = isOverdriveFull ? 1.62 : isComet ? 1.52 : 1.45;
  const newSpd = clamp(curSpd * boostMul, 22.5, 36.0);

  const hitOffset = clamp((b.x - paddle.x) / Math.max(1, paddle.halfW), -1, 1);
  const outAngle = clamp(hitOffset * 0.62 + clamp(paddle.vx * 0.018, -0.35, 0.35), -0.82, 0.82);

  b.z = Math.min(b.z, PLAYER_Z - 0.65);
  b.vx = Math.sin(outAngle) * newSpd;
  b.vz = -Math.cos(outAngle) * newSpd;
  b.spin = clamp(paddle.vx * 0.085 + hitOffset * 0.9, -2.4, 2.4);
  b.comet = isComet;

  smashesLanded++;
  score += isComet ? 180 : 120;
  if (isOverdriveFull) {
    paddle.overdrive = 0;
    // Full Overdrive Bonus: Unleashes a twin phantom comet ball!
    if (balls.length < 4) {
      spawnBall(b.x, b.z - 0.4, -1, newSpd * 0.92, -outAngle * 0.7, true);
      balls[balls.length - 1].comet = true;
    }
    showToast('满载超频 · 双生烈焰彗星重炮！');
  } else {
    paddle.overdrive = clamp(paddle.overdrive + 35, 0, 100);
    showToast(isComet ? '烈焰彗星重炮 1.52x！' : '超载扣杀 1.45x + 弧旋！');
  }

  paddle.smashFlash = 1.0;
  paddle.smashWindow = 0;
  camShake = isComet ? 0.62 : 0.36;
  if (isComet) slowMoTimer = 0.12;

  audio.playPowerSmash(isComet);
  spawnShockRing(b.x, 0.35, PLAYER_Z - 0.5, isComet ? 9.5 : 6.8, 0.5, [0.98, 0.72, 0.16]);
  emitSparkBurst(b.x, 0.45, PLAYER_Z - 0.5, isComet ? 26 : 16, isComet ? 12 : 8, [0.98, 0.72, 0.18], 1);
  syncScoreAndEraHUD();
}

function triggerSmashInput() {
  if (mode !== 'playing') return;
  audio.init();

  if (era === 1) {
    showToast('再得 2 分进入 3D 纪元即可解锁「超载扣杀」！（或按 [E] 立即跃迁）');
    return;
  }
  if (paddle.smashCooldown > 0) return;

  paddle.smashWindow = 0.28;
  paddle.smashCooldown = 0.42;
  paddle.smashFlash = 0.7;

  // Check immediate parry/smash on any incoming ball near the paddle!
  for (const b of balls) {
    if (
      b.vz > 0 &&
      b.z >= PLAYER_Z - 3.6 &&
      b.z <= PLAYER_Z + 1.0 &&
      Math.abs(b.x - paddle.x) <= paddle.halfW + 1.55
    ) {
      executePowerSmash(b);
      break;
    }
  }
}

// --- Input Listeners (Mouse Move, A/D, Arrows, Era-1 W/S, Space/Click Smash, [E] Era Jump) ---
const keys = new Set();
let controlSource = 'key';
let mouseTargetX = 0;
let touchSteer = 0;

window.addEventListener('keydown', (e) => {
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) {
    if (mode === 'playing') e.preventDefault();
  }
  keys.add(e.code);
  if ([
    'KeyA', 'KeyD', 'ArrowLeft', 'ArrowRight',
    'KeyW', 'KeyS', 'ArrowUp', 'ArrowDown',
  ].includes(e.code)) {
    controlSource = 'key';
  }

  if (e.code === 'Space' && !e.repeat && mode === 'playing') {
    triggerSmashInput();
  }
  if (e.code === 'KeyE' && !e.repeat) {
    if (mode === 'playing') {
      audio.init();
      const nextE = (era % 5) + 1;
      setEra(nextE, true);
    }
  }
  if (e.code === 'KeyC' && !e.repeat) {
    camPreset = (camPreset + 1) % 3;
    showToast(`摄影机位：${camNames[camPreset]}`);
  }
  if ((e.code === 'KeyP' || e.code === 'Escape') && !e.repeat) {
    togglePause();
  }
});

window.addEventListener('keyup', (e) => {
  keys.delete(e.code);
});

function updateMouseX(clientX) {
  const rect = canvas.getBoundingClientRect();
  if (rect.width < 10) return;
  const normX = ((clientX - rect.left) / rect.width - 0.5) * 2.0;
  const limit = COURT_HALF_X - paddle.halfW;
  mouseTargetX = clamp(normX * (COURT_HALF_X + 0.4), -limit, limit);
  controlSource = 'mouse';
}

canvas.addEventListener('mousemove', (e) => {
  if (mode !== 'playing') return;
  if (Math.abs(e.movementX) > 0.2 || Math.abs(e.movementY) > 0.2) {
    updateMouseX(e.clientX);
  }
});

canvas.addEventListener('mousedown', (e) => {
  if (mode !== 'playing') return;
  audio.init();
  updateMouseX(e.clientX);
  if (e.button === 0) {
    triggerSmashInput();
  }
});

canvas.addEventListener('contextmenu', (e) => e.preventDefault());

// Coarse-Pointer Touch Pad & Buttons
const tPad = document.getElementById('ht-t-pad');
const tKnob = document.getElementById('ht-t-knob');
const tbSmash = document.getElementById('ht-tb-smash');
const tbEra = document.getElementById('ht-tb-era');

if (tPad && tKnob) {
  const handlePad = (touch) => {
    const r = tPad.getBoundingClientRect();
    const dx = clamp((touch.clientX - (r.left + r.width / 2)) / (r.width * 0.45), -1, 1);
    touchSteer = dx;
    controlSource = 'key';
    tKnob.style.transform = `translate(${dx * 24}px, 0px)`;
  };
  tPad.addEventListener('touchstart', (e) => { e.preventDefault(); audio.init(); handlePad(e.touches[0]); }, { passive: false });
  tPad.addEventListener('touchmove', (e) => { e.preventDefault(); handlePad(e.touches[0]); }, { passive: false });
  tPad.addEventListener('touchend', () => { touchSteer = 0; tKnob.style.transform = 'translate(0,0)'; });
}
if (tbSmash) {
  tbSmash.addEventListener('touchstart', (e) => { e.preventDefault(); triggerSmashInput(); }, { passive: false });
}
if (tbEra) {
  tbEra.addEventListener('touchstart', (e) => {
    e.preventDefault();
    audio.init();
    setEra((era % 5) + 1, true);
  }, { passive: false });
}

// --- UI Buttons, Pause, Studio Bench & Tall Toggle ---
function togglePause() {
  if (mode === 'playing') {
    mode = 'paused';
    kickerEl.textContent = 'REALITY ESCALATION PAUSED // 失控球局已暂停';
    titleEl.textContent = '失控乒乓 · TENNIS: GO WILD';
    descEl.textContent = '随时试听下方「跨纪元声学合成台」示波器波形、跳选任意失控纪元，或点击继续重返球场。';
    btnStart.textContent = '继续失控对决';
    btnStart.style.display = 'inline-flex';
    btnWild.style.display = 'none';
    btnEndless.style.display = 'none';
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
  else startMatch(previewStartEra);
});

btnWild.addEventListener('click', () => startMatch(2));
btnRestart.addEventListener('click', () => {
  previewStartEra = 1;
  startMatch(1);
});
btnEndless.addEventListener('click', () => {
  endlessMode = true;
  boss.hp = boss.maxHp;
  mode = 'playing';
  overlayEl.classList.add('hidden');
  hudEl.classList.add('visible');
  syncScoreAndEraHUD();
  if (balls.length === 0) spawnBall(0, 3.5, -1, 18.0);
  showBanner('无尽失控狂飙 · ENDLESS GO WILD', '自由按 [E] 穿梭五大纪元，不断刷新奇点最高分！', 2.8);
  canvas.focus();
});

btnStudio.addEventListener('click', () => {
  audio.init();
  studioEl.classList.toggle('open');
});

document.querySelectorAll('.ht-sfx-trigger').forEach((btn) => {
  btn.addEventListener('click', () => {
    audio.init();
    const s = btn.dataset.s;
    if (s === 'pong') audio.playPongBeep('paddle', 1);
    else if (s === 'curve') audio.playCurveHit(0.85);
    else if (s === 'pinball') audio.playPinballBumper(bumperCombo++);
    else if (s === 'split') audio.playMultiballSplit();
    else if (s === 'comet') audio.playPowerSmash(true);
    else if (s === 'boss') audio.playBossHit(false);
  });
});

document.querySelectorAll('.era-pill').forEach((btn) => {
  btn.addEventListener('click', () => {
    audio.init();
    const chosen = Number(btn.dataset.era) || 1;
    previewStartEra = chosen;
    setEra(chosen, true);
  });
});

document.querySelectorAll('.q-pill').forEach((btn) => {
  btn.addEventListener('click', () => {
    quality = btn.dataset.q;
    document.querySelectorAll('.q-pill').forEach((b) => b.classList.toggle('active', b === btn));
    ensureFBO();
  });
});

const volInput = document.getElementById('ht-vol');
if (volInput) {
  volInput.addEventListener('input', () => {
    audio.setVolume(Number(volInput.value) / 100);
  });
}

document.getElementById('btn-era').addEventListener('click', () => {
  audio.init();
  setEra((era % 5) + 1, true);
  canvas.focus();
});
document.getElementById('btn-cam').addEventListener('click', () => {
  camPreset = (camPreset + 1) % 3;
  showToast(`摄影机位：${camNames[camPreset]}`);
  canvas.focus();
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

// --- Physics & Wild Era Simulation ---
function updatePlayerAndAI(dt) {
  const limit = COURT_HALF_X - paddle.halfW;
  const prevX = paddle.x;

  let dir = touchSteer;
  if (keys.has('KeyA') || keys.has('ArrowLeft')) dir -= 1;
  if (keys.has('KeyD') || keys.has('ArrowRight')) dir += 1;
  // Era 1 top-down view also maps W/S & Up/Down to lateral movement so every instinct works immediately!
  if (era === 1) {
    if (keys.has('KeyW') || keys.has('ArrowUp')) dir -= 1;
    if (keys.has('KeyS') || keys.has('ArrowDown')) dir += 1;
  }

  if (controlSource === 'mouse' && Math.abs(dir) < 0.05) {
    paddle.x = damp(paddle.x, clamp(mouseTargetX, -limit, limit), 28, dt);
  } else {
    const moveSpd = era >= 4 ? 29.5 : 26.0;
    paddle.x = clamp(paddle.x + clamp(dir, -1, 1) * moveSpd * dt, -limit, limit);
  }
  paddle.vx = (paddle.x - prevX) / Math.max(0.001, dt);

  if (paddle.smashWindow > 0) paddle.smashWindow = Math.max(0, paddle.smashWindow - dt);
  if (paddle.smashCooldown > 0) paddle.smashCooldown = Math.max(0, paddle.smashCooldown - dt);
  if (paddle.smashFlash > 0) paddle.smashFlash = Math.max(0, paddle.smashFlash - dt * 3.5);

  // Era 4+ Twin Plasma Guard-Blocks recharge
  if (era >= 4) {
    for (const g of paddle.guards) {
      if (!g.ready) {
        g.recharge -= dt;
        if (g.recharge <= 0) {
          g.ready = true;
          showToast('侧翼等离子护盾块已充能完毕');
        }
      }
    }
  }

  // Opponent AI Paddle (Era 1-4) or Solar Singularity Boss (Era 5)
  if (era < 5) {
    let threat = balls[0] || null;
    for (const b of balls) {
      if (b.vz < 0 && (!threat || threat.vz >= 0 || b.z < threat.z)) {
        threat = b;
      }
    }
    const targetX = threat ? clamp(threat.x, -(COURT_HALF_X - ai.halfW), COURT_HALF_X - ai.halfW) : 0;
    const aiMaxSpd = 12.8 + era * 2.1;
    const delta = clamp(targetX - ai.x, -aiMaxSpd * dt, aiMaxSpd * dt);
    ai.vx = delta / Math.max(0.001, dt);
    ai.x = clamp(ai.x + delta, -(COURT_HALF_X - ai.halfW), COURT_HALF_X - ai.halfW);
  } else {
    // Era 5 Boss Core glides across backline + rotates 3 segmented shields
    const rage = 1.0 - clamp(boss.hp / boss.maxHp, 0, 1);
    const spd = 4.6 + rage * 3.4;
    boss.x += boss.vx * dt;
    if (boss.x > 6.4) {
      boss.x = 6.4;
      boss.vx = -spd;
    } else if (boss.x < -6.4) {
      boss.x = -6.4;
      boss.vx = spd;
    } else {
      boss.vx = Math.sign(boss.vx || 1) * spd;
    }
    boss.shieldAngle = wrapAngle(boss.shieldAngle + (1.25 + rage * 0.65) * dt);
    if (boss.hitFlash > 0) boss.hitFlash = Math.max(0, boss.hitFlash - dt * 3.2);
    for (const sh of boss.shields) {
      if (sh.cooldown > 0) sh.cooldown = Math.max(0, sh.cooldown - dt);
      if (sh.flash > 0) sh.flash = Math.max(0, sh.flash - dt * 4.0);
    }
  }
}

function stepBallsPhysics(dt) {
  // Respawn Split Orbs in Era 3+
  if (era >= 3) {
    for (const orb of splitOrbs) {
      if (!orb.alive) {
        orb.respawn -= dt;
        if (orb.respawn <= 0) orb.alive = true;
      }
    }
  }
  for (const bmp of bumpers) {
    if (bmp.hitBounce > 0) bmp.hitBounce = Math.max(0, bmp.hitBounce - dt * 3.8);
  }

  const subSteps = 3;
  const subDt = dt / subSteps;

  for (let bi = balls.length - 1; bi >= 0; bi--) {
    const b = balls[bi];
    let removed = false;

    for (let s = 0; s < subSteps; s++) {
      // 1. Era 2+ 3D Magnus Curve Spin
      if (era >= 2 && Math.abs(b.spin) > 0.02) {
        b.vx += b.spin * 14.5 * subDt;
        b.spin *= Math.exp(-0.22 * subDt);
      }

      // 2. Era 3+ Mid-Court Golden Gravity Well Attraction
      if (era >= 3 && gravityWell.active) {
        const dx = gravityWell.x - b.x;
        const dz = gravityWell.z - b.z;
        const d2 = dx * dx + dz * dz;
        if (d2 < 68.0 && d2 > 0.35) {
          const dist = Math.sqrt(d2);
          const pull = (gravityWell.strength * 2.2) / (d2 + 4.5);
          // Blend inward pull + subtle orbital swirl!
          b.vx += ((dx / dist) * pull - (dz / dist) * pull * 0.35) * subDt;
          b.vz += ((dz / dist) * pull * 0.45) * subDt;
        }
      }

      // Enforce crisp minimum longitudinal speed so rally never stalls horizontally
      const minVz = 10.2;
      if (Math.abs(b.vz) < minVz) {
        b.vz = (b.vz >= 0 ? 1 : -1) * minVz;
      }

      b.x += b.vx * subDt;
      b.z += b.vz * subDt;

      // 3. Left / Right Side-Wall Rim-Rail Collisions
      const wallLim = COURT_HALF_X - b.r;
      if (b.x < -wallLim) {
        b.x = -wallLim;
        b.vx = Math.abs(b.vx);
        railFlashL = 1.0;
        audio.playPongBeep('wall', era);
        if (era >= 2) emitSparkBurst(b.x, 0.4, b.z, 8, 6.5, [0.133, 0.827, 0.933], 1);
      } else if (b.x > wallLim) {
        b.x = wallLim;
        b.vx = -Math.abs(b.vx);
        railFlashR = 1.0;
        audio.playPongBeep('wall', era);
        if (era >= 2) emitSparkBurst(b.x, 0.4, b.z, 8, 6.5, [0.96, 0.69, 0.145], 1);
      }

      // 4. Era 3+ Pinball Bumpers & Emerald Split Orbs
      if (era >= 3) {
        for (const bmp of bumpers) {
          const dx = b.x - bmp.x;
          const dz = b.z - bmp.z;
          const minDist = bmp.r + b.r;
          const d = Math.hypot(dx, dz);
          if (d < minDist && d > 0.001) {
            const nx = dx / d;
            const nz = dz / d;
            b.x = bmp.x + nx * (minDist + 0.04);
            b.z = bmp.z + nz * (minDist + 0.04);
            const dot = b.vx * nx + b.vz * nz;
            if (dot < 0) {
              b.vx -= 2 * dot * nx;
              b.vz -= 2 * dot * nz;
            }
            const newSpd = clamp(Math.hypot(b.vx, b.vz) * 1.08, 16.0, 34.0);
            const cur = Math.hypot(b.vx, b.vz) || 1;
            b.vx = (b.vx / cur) * newSpd;
            b.vz = (b.vz / cur) * newSpd;

            bmp.hitBounce = 1.0;
            score += 150;
            paddle.overdrive = clamp(paddle.overdrive + 12, 0, 100);
            audio.playPinballBumper(bumperCombo++);
            spawnShockRing(bmp.x, 0.25, bmp.z, 5.2, 0.42, [0.96, 0.69, 0.145]);
            emitSparkBurst(bmp.x, 0.6, bmp.z, 12, 7.5, [0.96, 0.78, 0.22], 1);
            scoreValEl.textContent = String(score);
          }
        }

        for (const orb of splitOrbs) {
          if (!orb.alive) continue;
          if (Math.hypot(b.x - orb.x, b.z - orb.z) < orb.r + b.r + 0.25) {
            orb.alive = false;
            orb.respawn = 5.5;
            score += 200;
            audio.playMultiballSplit();
            spawnShockRing(orb.x, 0.4, orb.z, 6.5, 0.5, [0.16, 0.92, 0.56]);
            emitSparkBurst(orb.x, 0.5, orb.z, 18, 9.0, [0.16, 0.92, 0.56], 1);
            showToast('裂变绿球触发 · 多重球狂潮 +200！');
            if (era === 3) {
              setNarrator('球怎么分裂成三个了？！我的多线程预测模块要冒烟了！');
            }
            const curSpd = clamp(Math.hypot(b.vx, b.vz), 16.0, 27.0);
            const dirZ = era === 5 ? -1 : Math.sign(b.vz || -1);
            if (balls.length < 4) spawnBall(orb.x, orb.z, dirZ, curSpd, -0.42, true);
            if (balls.length < 4) spawnBall(orb.x, orb.z, dirZ, curSpd, 0.42, true);
            syncScoreAndEraHUD();
          }
        }
      }

      // 5. Era 4+ Twin Plasma Guard-Blocks Auto-Save!
      if (era >= 4 && b.vz > 0) {
        for (const g of paddle.guards) {
          if (!g.ready) continue;
          if (Math.abs(b.z - g.z) < 0.65 && Math.abs(b.x - g.x) < 1.25) {
            g.ready = false;
            g.recharge = 6.0;
            b.z = g.z - 0.68;
            b.vz = -Math.abs(b.vz) * 1.08;
            audio.playPongBeep('paddle', era);
            spawnShockRing(g.x, 0.4, g.z, 4.5, 0.38, [0.96, 0.72, 0.18]);
            showToast('侧翼等离子护盾块自动救球！');
          }
        }
      }

      // 6. Player Paddle Collision & Active Smash Parry!
      if (
        b.vz > 0 &&
        paddle.smashWindow > 0 &&
        b.z >= PLAYER_Z - 3.2 &&
        b.z <= PLAYER_Z + 0.95 &&
        Math.abs(b.x - paddle.x) <= paddle.halfW + 1.45
      ) {
        executePowerSmash(b);
      } else if (
        b.vz > 0 &&
        b.z + b.r >= PLAYER_Z - 0.46 &&
        b.z - b.r <= PLAYER_Z + 0.65 &&
        Math.abs(b.x - paddle.x) <= paddle.halfW + b.r + 0.30
      ) {
        b.z = PLAYER_Z - 0.46 - b.r;
        const curSpd = clamp(Math.hypot(b.vx, b.vz) * 1.04, 15.8, 30.0);
        const rel = clamp((b.x - paddle.x) / paddle.halfW, -1, 1);
        const bounceAng = clamp(rel * 0.68, -0.78, 0.78);
        b.vx = Math.sin(bounceAng) * curSpd;
        b.vz = -Math.cos(bounceAng) * curSpd;
        b.comet = false;

        if (era >= 2) {
          const impartedSpin = clamp(paddle.vx * 0.075, -2.0, 2.0);
          b.spin = impartedSpin;
          paddle.overdrive = clamp(paddle.overdrive + 14, 0, 100);
          if (Math.abs(impartedSpin) > 0.55) {
            score += 60;
            audio.playCurveHit(Math.min(1, Math.abs(impartedSpin)));
            emitSparkBurst(b.x, 0.45, PLAYER_Z - 0.4, 12, 7.0, [0.133, 0.827, 0.933], 1);
            showToast('弧旋球 CURVE! +60');
          } else {
            audio.playPongBeep('paddle', era);
            emitSparkBurst(b.x, 0.45, PLAYER_Z - 0.4, 7, 5.0, [0.95, 0.94, 0.90], 1);
          }
        } else {
          b.spin = 0;
          audio.playPongBeep('paddle', 1);
        }
      }

      // 7. Opponent Paddle (Era 1-4) OR Solar Singularity Boss + Rotating Shields (Era 5)!
      if (era < 5) {
        if (
          b.vz < 0 &&
          b.z - b.r <= AI_Z + 0.46 &&
          b.z + b.r >= AI_Z - 0.65 &&
          Math.abs(b.x - ai.x) <= ai.halfW + b.r + 0.15
        ) {
          b.z = AI_Z + 0.46 + b.r;
          const curSpd = clamp(Math.hypot(b.vx, b.vz) * 1.03, 15.5, 28.5);
          const rel = clamp((b.x - ai.x) / ai.halfW, -1, 1);
          const bounceAng = clamp(rel * 0.62, -0.74, 0.74);
          b.vx = Math.sin(bounceAng) * curSpd;
          b.vz = Math.cos(bounceAng) * curSpd;
          b.comet = false;
          b.spin *= -0.35;
          audio.playPongBeep('paddle', era);
          if (era >= 2) emitSparkBurst(b.x, 0.45, AI_Z + 0.4, 8, 5.5, [0.94, 0.32, 0.24], 1);
        }
      } else if (boss.hp > 0) {
        const dx = b.x - boss.x;
        const dz = b.z - boss.z;
        const distBoss = Math.hypot(dx, dz);

        // Check Rotating Segmented Energy Shields around Boss Core
        if (Math.abs(distBoss - boss.shieldRadius) < b.r + 0.38) {
          const hitAng = Math.atan2(dx, dz);
          for (const sh of boss.shields) {
            if (sh.cooldown > 0) continue;
            const shCenter = wrapAngle(boss.shieldAngle + sh.offset);
            if (Math.abs(wrapAngle(hitAng - shCenter)) < 0.66) {
              sh.cooldown = 4.5; // Shatter this shield segment!
              sh.flash = 1.0;
              score += 120;
              spawnShockRing(b.x, 0.8, b.z, 4.8, 0.4, [0.133, 0.827, 0.933]);
              emitSparkBurst(b.x, 0.8, b.z, 14, 8.5, [0.133, 0.827, 0.933], 1);

              if (b.comet) {
                // Blazing Comet Smash pierces right through the shield toward the Core!
                showToast('彗星重炮贯穿能量护盾 +120！');
              } else {
                const nx = dx / (distBoss || 1);
                const nz = dz / (distBoss || 1);
                const dot = b.vx * nx + b.vz * nz;
                if (dot < 0) {
                  b.vx -= 2 * dot * nx;
                  b.vz -= 2 * dot * nz;
                }
                if (b.vz < 8.0) b.vz = 12.5;
                b.x = boss.x + nx * (boss.shieldRadius + b.r + 0.42);
                b.z = boss.z + nz * (boss.shieldRadius + b.r + 0.42);
                audio.playPongBeep('paddle', 5);
                showToast('击碎一段旋转护盾 +120！趁缺口轰击核心！');
              }
              break;
            }
          }
        }

        // Check Direct Impact on AI Architect Singularity Core!
        if (Math.hypot(b.x - boss.x, b.z - boss.z) <= boss.coreR + b.r) {
          const hitX = b.x;
          const hitZ = b.z;
          balls.splice(bi, 1);
          removed = true;
          damageBossCore(100, hitX, hitZ);
          if (mode === 'playing' && balls.length === 0) {
            spawnBall(0, 3.5, -1, 17.5);
          }
          break;
        }
      }

      // 8. North / South Baseline Out-of-Bounds Scoring!
      if (b.z < -COURT_HALF_Z - 1.0) {
        const hitX = b.x;
        balls.splice(bi, 1);
        removed = true;
        if (era === 5) {
          damageBossCore(100, hitX, -COURT_HALF_Z);
        } else {
          if (era >= 2) {
            spawnShockRing(hitX, 0.25, -COURT_HALF_Z, 8.0, 0.55, [0.133, 0.827, 0.933]);
            emitSparkBurst(hitX, 0.5, -COURT_HALF_Z, 20, 10.0, [0.96, 0.69, 0.145], 1);
          }
          scorePlayerPoint(false);
        }
        if (mode === 'playing' && balls.length === 0) {
          spawnBall(0, 3.2, -1, 15.8);
        }
        break;
      } else if (b.z > COURT_HALF_Z + 1.2) {
        balls.splice(bi, 1);
        removed = true;
        // Losing an extra Multiball clone does not penalize player — only losing the last active ball concedes a point!
        if (balls.length === 0) {
          scoreAiPoint();
        } else {
          showToast(`场内剩余 ${balls.length} 球继续战斗！`);
        }
        break;
      }
    }

    if (removed) continue;

    // Continuous GPU-Instanced Comet Fire & Curve Ribbon Trails (Era 2+)
    if (era >= 2) {
      b.trailAcc += dt * (b.comet ? 95 : 42);
      while (b.trailAcc >= 1.0) {
        b.trailAcc -= 1.0;
        const isHot = b.comet;
        const curveTint = clamp(Math.abs(b.spin) * 0.6, 0, 1);
        const cr = isHot ? 1.0 : lerp(0.92, 0.133, curveTint);
        const cg = isHot ? 0.54 : lerp(0.88, 0.827, curveTint);
        const cb = isHot ? 0.14 : lerp(0.75, 0.933, curveTint);
        spawnParticle(
          b.x + (Math.random() - 0.5) * 0.22,
          b.y + (Math.random() - 0.5) * 0.15,
          b.z + (Math.random() - 0.5) * 0.22,
          -b.vx * 0.08 + (Math.random() - 0.5) * 1.4,
          (Math.random() - 0.2) * 1.5,
          -b.vz * 0.08 + (Math.random() - 0.5) * 1.4,
          isHot ? 0.78 : 0.46,
          isHot ? 0.65 : -0.35,
          isHot ? 0.34 : 0.24,
          cr, cg, cb,
          isHot ? 0.88 : 0.62,
          0,
          0
        );
      }
    }
  }
}

function updateEffects(dt) {
  railFlashL = Math.max(0, railFlashL - dt * 3.5);
  railFlashR = Math.max(0, railFlashR - dt * 3.5);
  swoopBoost = Math.max(0, swoopBoost - dt * 0.85);
  camShake = Math.max(0, camShake - dt * 2.8);

  if (bannerTimer > 0) {
    bannerTimer -= dt;
    if (bannerTimer <= 0) bannerEl.classList.remove('show');
  }

  for (let i = shockRings.length - 1; i >= 0; i--) {
    const r = shockRings[i];
    r.t += dt;
    if (r.t >= r.dur) {
      shockRings.splice(i, 1);
      continue;
    }
    r.r = lerp(0.75, r.maxRadius, 1 - Math.pow(1 - r.t / r.dur, 2.2));
  }

  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.life -= dt;
    if (p.life <= 0) {
      particles.splice(i, 1);
      continue;
    }
    p.vy -= p.grav * dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.z += p.vz * dt;
    if (p.y < 0.06 && p.grav > 0) {
      p.y = 0.06;
      p.vy = Math.abs(p.vy) * 0.35;
    }
    p.size = Math.max(0.05, p.size + p.grow * dt);
    p.rot += p.vrot * dt;
  }
}

// --- Camera Choreography (90° Top-Down Pong -> Swooping 3D Cyber-Stadium!) ---
const camPos = [0, 41.0, 0.28];
const camLook = [0, 0, 0];
let camFov = (42 * Math.PI) / 180;

function updateCamera(dt, t) {
  eraMix = damp(eraMix, era, 3.4, dt);

  const leadBall = balls[0];
  const bx = leadBall ? leadBall.x : 0;

  let targetPos;
  let targetLook;
  let targetFovDeg = 50;

  if (mode === 'title' && era >= 2) {
    targetPos = [Math.sin(t * 0.35) * 9.5, 13.5, 23.5];
    targetLook = [0, 0.5, -2.5];
    targetFovDeg = 50;
  } else if (era === 1 && camPreset === 0) {
    // Era 1: Locked straight overhead 90° top-down 1972 Pong camera!
    targetPos = [0, 41.5, 0.28];
    targetLook = [0, 0, 0];
    targetFovDeg = 42;
  } else if (camPreset === 1) {
    // Low Action Striker Over-the-Shoulder
    targetPos = [paddle.x * 0.46, 6.8, 21.8];
    targetLook = [bx * 0.24, 0.8, -5.5];
    targetFovDeg = 55;
  } else if (camPreset === 2) {
    // High Tactical Broadcast
    targetPos = [paddle.x * 0.15, 22.5, 20.5];
    targetLook = [0, 0, -1.2];
    targetFovDeg = 46;
  } else {
    // Era 2-5 Dynamic 3D Cyber-Stadium / Solar Boss Perspective!
    const bossLift = era === 5 ? 1.4 : 0.0;
    targetPos = [paddle.x * 0.28, 11.2 + bossLift, 24.4 + bossLift * 0.8];
    targetLook = [bx * 0.16, 0.55 + (era === 5 ? 0.45 : 0), -2.8];
    targetFovDeg = era >= 4 ? 53 : 50;
  }

  const swoopSpeed = 4.6;
  camPos[0] = damp(camPos[0], targetPos[0], swoopSpeed, dt);
  camPos[1] = damp(camPos[1], targetPos[1], swoopSpeed, dt);
  camPos[2] = damp(camPos[2], targetPos[2], swoopSpeed, dt);

  camLook[0] = damp(camLook[0], targetLook[0], 6.5, dt);
  camLook[1] = damp(camLook[1], targetLook[1], 6.5, dt);
  camLook[2] = damp(camLook[2], targetLook[2], 6.5, dt);
  camFov = damp(camFov, (targetFovDeg * Math.PI) / 180, 5.0, dt);

  if (camShake > 0.01) {
    camPos[0] += Math.sin(t * 53.0) * camShake * 0.35;
    camPos[1] += Math.cos(t * 47.0) * camShake * 0.28;
  }
}

// --- WebGL2 Scene Renderer ---
const matProj = M4.create();
const matView = M4.create();
const matShock = M4.create();
const translucentQueue = [];

function drawWorldMesh(mesh, modelMat, matId, col, p0 = 1.0, p1 = 1.0, alpha = 1.0) {
  if (alpha < 0.99) {
    const copy = new Float32Array(modelMat);
    translucentQueue.push({ mesh, modelMat: copy, matId, col, p0, p1, alpha });
    return;
  }
  gl.uniformMatrix4fv(progWorld.u.uModel, false, modelMat);
  gl.uniform1i(progWorld.u.uMat, matId);
  gl.uniform3f(progWorld.u.uColor, col[0], col[1], col[2]);
  gl.uniform3f(progWorld.u.uParams, p0, p1, alpha);
  gl.bindVertexArray(mesh.vao);
  gl.drawElements(gl.TRIANGLES, mesh.count, mesh.indexType, 0);
}

function renderScene(t) {
  ensureFBO();
  translucentQueue.length = 0;

  const aspect = fboW / Math.max(1, fboH);
  M4.perspective(matProj, camFov, aspect, 0.3, 620.0);
  M4.lookAt(matView, camPos[0], camPos[1], camPos[2], camLook[0], camLook[1], camLook[2], 0, 1, 0);

  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
  gl.viewport(0, 0, fboW, fboH);
  gl.clearColor(0.035, 0.045, 0.066, 1.0);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

  // 1. Skybox (1972 CRT Void -> Cyber Arena -> Solar Singularity Star-Forge!)
  gl.disable(gl.DEPTH_TEST);
  gl.depthMask(false);
  gl.disable(gl.BLEND);
  gl.useProgram(progSky.prog);
  gl.uniformMatrix4fv(progSky.u.uProj, false, matProj);
  gl.uniformMatrix4fv(progSky.u.uView, false, matView);
  gl.uniform3f(progSky.u.uCamPos, camPos[0], camPos[1], camPos[2]);
  gl.uniform1f(progSky.u.uTime, t);
  gl.uniform1f(progSky.u.uEraMix, eraMix);
  gl.bindVertexArray(meshes.box.vao);
  gl.drawElements(gl.TRIANGLES, meshes.box.count, meshes.box.indexType, 0);

  // 2. Opaque 3D World Geometry
  gl.enable(gl.DEPTH_TEST);
  gl.depthMask(true);
  gl.useProgram(progWorld.prog);
  gl.uniformMatrix4fv(progWorld.u.uProj, false, matProj);
  gl.uniformMatrix4fv(progWorld.u.uView, false, matView);
  gl.uniform3f(progWorld.u.uCamPos, camPos[0], camPos[1], camPos[2]);
  gl.uniform1f(progWorld.u.uTime, t);
  gl.uniform1f(progWorld.u.uEraMix, eraMix);

  const b0 = balls[0];
  const spdGlow = b0 ? clamp((Math.hypot(b0.vx, b0.vz) - 15.0) / 16.0, 0, 1) : 0;
  gl.uniform4f(progWorld.u.uBallPulse, b0 ? b0.x : 0, b0 ? b0.y : 0.4, b0 ? b0.z : 0, spdGlow);

  const wellAmt = clamp((eraMix - 2.05) / 0.85, 0, 1) * (gravityWell.active ? 1.0 : 0.0);
  gl.uniform4f(progWorld.u.uWell, gravityWell.x, 0, gravityWell.z, wellAmt);

  drawCyberStadium(drawWorldMesh, meshes, eraMix, t, railFlashL, railFlashR);
  drawRetroDigits(drawWorldMesh, meshes, playerScore, aiScore, eraMix);
  drawPinballAndAnomalies(drawWorldMesh, meshes, bumpers, gravityWell, splitOrbs, eraMix, t);
  drawPlayerPaddle(drawWorldMesh, meshes, paddle, eraMix, t);
  drawOpponentOrBoss(drawWorldMesh, meshes, ai, boss, era, eraMix, t);
  drawBalls(drawWorldMesh, meshes, balls, eraMix, t);

  // Queue Expanding 3D Shockwave Rings
  for (const sr of shockRings) {
    const alpha = clamp(1.0 - sr.t / sr.dur, 0, 1);
    M4.trs(matShock, sr.x, sr.y, sr.z, 0, 0, 0, sr.r * 2.0, 1.0, sr.r * 2.0);
    drawWorldMesh(meshes.ring, matShock, 6, sr.col, 2.1, 1.0, alpha * 0.85);
  }

  // 3. Additive Translucent Emissives (Rings, Shields, Searchlights, Dyson Rings)
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

  // 4. GPU-Instanced Comet Fire Trails, Curve Sparks & Boss Explosion Shards
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
      d[o + 5] = p.kind === 1 ? 1.25 : 1.0;
      d[o + 6] = 0;
      d[o + 7] = p.kind;
      d[o + 8] = p.r;
      d[o + 9] = p.g;
      d[o + 10] = p.b;
      d[o + 11] = p.a * fade;
    }
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
    gl.depthMask(false);
    gl.useProgram(progInst.prog);
    gl.uniformMatrix4fv(progInst.u.uProj, false, matProj);
    gl.uniformMatrix4fv(progInst.u.uView, false, matView);
    gl.bindVertexArray(particleSys.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, particleSys.instVBO);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, d.subarray(0, count * 12));
    gl.drawElementsInstanced(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0, count);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  }

  // 5. Fullscreen Post-Process (CRT Era-1 -> Smooth ACES Bloom & Speed Rush)
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.viewport(0, 0, canvas.width, canvas.height);
  gl.disable(gl.DEPTH_TEST);
  gl.disable(gl.BLEND);
  gl.depthMask(true);

  const anyComet = balls.some((b) => b.comet);
  const rush = clamp((anyComet ? 0.55 : 0) + swoopBoost * 0.65, 0, 1.0);
  const bloomAmt = era === 1 ? 0.35 : 0.95;

  gl.useProgram(progPost.prog);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, fboTex);
  gl.uniform1i(progPost.u.uTex, 0);
  gl.uniform2f(progPost.u.uRes, fboW, fboH);
  gl.uniform1f(progPost.u.uTime, t);
  gl.uniform1f(progPost.u.uEraMix, eraMix);
  gl.uniform1f(progPost.u.uRushBlur, rush);
  gl.uniform1f(progPost.u.uBloomAmt, bloomAmt);
  gl.bindVertexArray(postVAO);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
  gl.bindVertexArray(null);
}

function updateLiveTelemetryHUD() {
  if (mode !== 'playing') return;
  let maxSpd = 0;
  for (const b of balls) {
    maxSpd = Math.max(maxSpd, Math.hypot(b.vx, b.vz));
  }
  const kmh = Math.round(maxSpd * 5.8);
  speedValEl.textContent = String(kmh);
  overdriveFillEl.style.width = `${clamp(paddle.overdrive, 0, 100)}%`;
  ballsLblEl.textContent = balls.length > 1 ? `多重球 ×${balls.length}` : '场内 1 球';
}

// --- Sound Bench Live Oscilloscope (#ht-scope) ---
const scopeBuf = new Uint8Array(256);
function renderStudioScope() {
  if (!scopeCtx || !studioEl.classList.contains('open')) return;
  const w = scopeCvs.width;
  const h = scopeCvs.height;
  scopeCtx.fillStyle = '#07090d';
  scopeCtx.fillRect(0, 0, w, h);

  // Center zero-line in subtle Solar Gold
  scopeCtx.strokeStyle = 'rgba(245, 176, 37, 0.22)';
  scopeCtx.lineWidth = 1;
  scopeCtx.beginPath();
  scopeCtx.moveTo(0, h * 0.5);
  scopeCtx.lineTo(w, h * 0.5);
  scopeCtx.stroke();

  if (!audio.analyser) return;
  audio.analyser.getByteTimeDomainData(scopeBuf);
  scopeCtx.strokeStyle = era >= 4 ? '#f5b025' : '#22d3ee';
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

// Seed an idle background attract rally on the title screen!
spawnBall(0, 2.0, -1, 14.5, 0.32);
syncScoreAndEraHUD();

// --- Main Loop & FPS Telemetry ---
let lastTime = performance.now();
let fpsFrames = 0;
let fpsAccum = 0;
let currentFps = 60;

function frame(now) {
  requestAnimationFrame(frame);

  // IntersectionObserver safeguard: skip heavy WebGL draws cleanly when scrolled off-screen!
  if (!isAppVisible) {
    lastTime = now;
    return;
  }

  const rawDt = Math.min(0.05, Math.max(0.001, (now - lastTime) * 0.001));
  lastTime = now;
  const t = now * 0.001;

  fpsFrames++;
  fpsAccum += rawDt;
  if (fpsAccum >= 0.5) {
    currentFps = Math.round(fpsFrames / fpsAccum);
    fpsFrames = 0;
    fpsAccum = 0;
    perfEl.textContent = `${currentFps} FPS · ERA 0${era}`;
  }

  // Brief juicy slow-mo on Comet Smashes & Boss Core impacts!
  let simDt = rawDt;
  if (slowMoTimer > 0) {
    slowMoTimer = Math.max(0, slowMoTimer - rawDt);
    simDt = rawDt * 0.30;
  }

  if (mode === 'playing') {
    matchTime += rawDt;
    updatePlayerAndAI(simDt);
    stepBallsPhysics(simDt);
    const b0 = balls[0];
    const spdNorm = b0 ? clamp((Math.hypot(b0.vx, b0.vz) - 14) / 18, 0, 1) : 0.25;
    audio.update(rawDt, era, true, spdNorm);
  } else if (mode === 'title') {
    // Gentle self-playing 1972 Pong demo behind the title placard!
    const b0 = balls[0];
    if (b0) {
      paddle.x = damp(paddle.x, clamp(b0.x, -8, 8), 7, rawDt);
      ai.x = damp(ai.x, clamp(b0.x, -8, 8), 7, rawDt);
      b0.x += b0.vx * rawDt * 0.65;
      b0.z += b0.vz * rawDt * 0.65;
      if (Math.abs(b0.x) > COURT_HALF_X - 0.6) b0.vx *= -1;
      if (Math.abs(b0.z) > PLAYER_Z - 0.7) b0.vz *= -1;
    }
    audio.update(rawDt, era, false, 0);
  } else {
    audio.update(rawDt, era, false, 0);
  }

  updateEffects(rawDt);
  updateCamera(rawDt, t);
  renderScene(t);
  updateLiveTelemetryHUD();
  renderStudioScope();
}
requestAnimationFrame(frame);

// --- Diagnostic & Automated Verification Hook ---
window.__HYPERTENNIS__ = {
  getState() {
    return {
      mode,
      fps: currentFps,
      glErr: gl.getError(),
      era,
      playerScore,
      aiScore,
      bossHp: Math.max(0, Math.round(boss.hp)),
      score,
    };
  },
  startMatch(initialEra = 1) {
    startMatch(initialEra);
  },
  setEra(targetEra) {
    setEra(targetEra, true);
  },
  scorePlayerPoint() {
    scorePlayerPoint(true);
  },
};
