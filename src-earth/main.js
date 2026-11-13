import {
  R_EARTH,
  R_CLOUD,
  R_ATMO,
  LANDMARKS,
  M4,
  V3,
  clamp,
  lerp,
  damp,
  latLonToDir,
  dirToLatLon,
  formatLatLon,
  computeSolarDir,
  raySphereIntersect,
} from './math.js';
import {
  EARTH_SKY_VS,
  EARTH_SKY_FS,
  EARTH_PLANET_VS,
  EARTH_PLANET_FS,
  EARTH_CLOUD_VS,
  EARTH_CLOUD_FS,
  EARTH_ATMO_VS,
  EARTH_ATMO_FS,
  EARTH_PROP_VS,
  EARTH_PROP_FS,
  EARTH_INST_VS,
  EARTH_INST_FS,
  EARTH_POST_VS,
  EARTH_POST_FS,
} from './shaders.js';
import {
  createDynamicPlanet,
  createEarthPrimitives,
  createOrbitalParticles,
  drawWorldLandmarks,
  drawOrbitalCraft,
} from './world.js';
import { MirrorEarthAudio } from './audio.js';

// --- WebGL2 Program Compilation ---
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
const appEl = document.getElementById('earth-app');
const canvas = document.getElementById('me-canvas');
const hudEl = document.getElementById('me-hud');
const overlayEl = document.getElementById('me-overlay');
const perfEl = document.getElementById('me-perf');
const gpsEl = document.getElementById('me-gps');
const modeTagEl = document.getElementById('me-mode-tag');
const modeDescEl = document.getElementById('me-mode-desc');
const defPipsWrap = document.getElementById('me-def-pips');
const pipEls = Array.from(document.querySelectorAll('.me-pip'));
const toastFeedEl = document.getElementById('me-toast-feed');
const waypointsEl = document.getElementById('me-waypoints');
const bannerEl = document.getElementById('me-banner');
const bannerTitleEl = document.getElementById('me-banner-title');
const bannerSubEl = document.getElementById('me-banner-sub');

const speedValEl = document.getElementById('me-speed-val');
const altFillEl = document.getElementById('me-alt-fill');
const boostFillEl = document.getElementById('me-boost-fill');
const bioValEl = document.getElementById('me-bio-val');
const scoreValEl = document.getElementById('me-score-val');
const stateValEl = document.getElementById('me-state-val');
const geoStatsEl = document.getElementById('me-geo-stats');

const kickerEl = document.getElementById('me-kicker');
const titleEl = document.getElementById('me-title');
const descEl = document.getElementById('me-desc');
const debriefEl = document.getElementById('me-debrief');
const stTimeEl = document.getElementById('st-time');
const stIntEl = document.getElementById('st-int');
const stBioEl = document.getElementById('st-bio');
const stScoreEl = document.getElementById('st-score');
const stRankEl = document.getElementById('st-rank');

const btnSandbox = document.getElementById('me-btn-sandbox');
const btnDefense = document.getElementById('me-btn-defense');
const btnResetEarth = document.getElementById('me-btn-reset-earth');
const btnStudio = document.getElementById('me-btn-studio');
const studioEl = document.getElementById('me-studio');
const scopeCvs = document.getElementById('me-scope');
const scopeCtx = scopeCvs ? scopeCvs.getContext('2d') : null;

const toolMeteorBtn = document.getElementById('tool-meteor');
const toolTerraBtn = document.getElementById('tool-terra');
const toolLaserBtn = document.getElementById('tool-laser');
const btnSolar = document.getElementById('btn-solar');
const solarRangeEl = document.getElementById('me-solar-range');
const solarLblEl = document.getElementById('me-solar-lbl');
const warpBtns = Array.from(document.querySelectorAll('.me-warp-btn'));

// --- WebGL2 Context & Shaders ---
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

const progSky = createProgram(gl, EARTH_SKY_VS, EARTH_SKY_FS, ['uProj', 'uView', 'uCamPos', 'uSunDir', 'uTime']);
const progPlanet = createProgram(gl, EARTH_PLANET_VS, EARTH_PLANET_FS, [
  'uProj',
  'uView',
  'uCamPos',
  'uSunDir',
  'uTime',
  'uWeatherMode',
  'uTargetRing',
]);
const progCloud = createProgram(gl, EARTH_CLOUD_VS, EARTH_CLOUD_FS, [
  'uProj',
  'uView',
  'uRadius',
  'uCamPos',
  'uSunDir',
  'uTime',
  'uWeatherMode',
]);
const progAtmo = createProgram(gl, EARTH_ATMO_VS, EARTH_ATMO_FS, [
  'uProj',
  'uView',
  'uRadius',
  'uCamPos',
  'uSunDir',
  'uTime',
  'uPlanetR',
  'uAtmoR',
  'uWeatherMode',
]);
const progProp = createProgram(gl, EARTH_PROP_VS, EARTH_PROP_FS, [
  'uProj',
  'uView',
  'uModel',
  'uCamPos',
  'uSunDir',
  'uColor',
  'uParams',
]);
const progInst = createProgram(gl, EARTH_INST_VS, EARTH_INST_FS, ['uProj', 'uView']);
const progPost = createProgram(gl, EARTH_POST_VS, EARTH_POST_FS, [
  'uTex',
  'uRes',
  'uBoostAmt',
  'uImpactFlash',
]);

const postVAO = gl.createVertexArray();
const planet = createDynamicPlanet(gl, isSoftwareGL ? 52 : 64);
const meshes = createEarthPrimitives(gl);
const particleSys = createOrbitalParticles(gl, 640);
const audio = new MirrorEarthAudio();

// --- Offscreen Post-Process FBO ---
let fbo = null;
let fboTex = null;
let fboDepth = null;
let fboW = 0;
let fboH = 0;
let quality = isSoftwareGL ? 'med' : 'high';
const qualityScaleMap = isSoftwareGL
  ? { low: 0.52, med: 0.68, high: 0.82 }
  : { low: 0.70, med: 0.86, high: 1.0 };

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

// --- Simulation & Game State ---
const WEATHER_NAMES = [
  '实时晴空同步',
  '西太平洋超强台风眼',
  '极夜绿金极光带',
  '全球雷暴闪电云',
];
const CAM_NAMES = ['近地轨道追尾', '低空掠海机鼻', '同步卫星全景'];

let mode = 'menu'; // 'menu' | 'sandbox' | 'defense' | 'paused' | 'debrief'
let prevActiveMode = 'sandbox';
let weatherMode = 0;
let camPreset = 0;
let selectedTool = 1; // 1=Kinetic Meteor, 2=Genesis Terraform, 3=Orbital Laser

// UTC Solar Time & Terminator Sync
let solarMode = 'utc'; // 'utc' | 'timelapse' | 'manual'
let solarUtcHours = 12.0;
const sunDir = [0, 0.25, 0.96];

function syncLiveUTC() {
  const d = new Date();
  return d.getUTCHours() + d.getUTCMinutes() / 60 + d.getUTCSeconds() / 3600;
}
solarUtcHours = syncLiveUTC();
computeSolarDir(solarUtcHours, 19.0, sunDir);

// Orbital Craft Tangent Frame State
const craft = {
  dir: latLonToDir(25.2, 92.0), // Overlooking Himalayas & East Asia!
  fwd: [0, 0, 1],
  pos: [0, 0, 68],
  alt: 15.5,
  targetAlt: 15.5,
  speed: 4.0,
  bank: 0.0,
  pitchVis: 0.0,
  boostMeter: 100,
  boostAmt: 0.0,
};

function orthonormalizeCraft() {
  V3.normalize(craft.dir[0], craft.dir[1], craft.dir[2], craft.dir);
  const dot = V3.dot(craft.fwd, craft.dir);
  craft.fwd[0] -= craft.dir[0] * dot;
  craft.fwd[1] -= craft.dir[1] * dot;
  craft.fwd[2] -= craft.dir[2] * dot;
  if (Math.hypot(craft.fwd[0], craft.fwd[1], craft.fwd[2]) < 1e-4) {
    // Fallback North or East tangent
    const ref = Math.abs(craft.dir[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
    const d2 = V3.dot(ref, craft.dir);
    V3.normalize(
      ref[0] - craft.dir[0] * d2,
      ref[1] - craft.dir[1] * d2,
      ref[2] - craft.dir[2] * d2,
      craft.fwd
    );
  } else {
    V3.normalize(craft.fwd[0], craft.fwd[1], craft.fwd[2], craft.fwd);
  }
  const r = R_EARTH + craft.alt;
  craft.pos[0] = craft.dir[0] * r;
  craft.pos[1] = craft.dir[1] * r;
  craft.pos[2] = craft.dir[2] * r;
}

// Point initial heading Northeast toward Mt. Everest & East Asia
craft.fwd = [-0.28, 0.85, 0.45];
orthonormalizeCraft();

// Camera & Visual Feedback State
const camPos = [craft.pos[0], craft.pos[1] + 8, craft.pos[2] + 18];
const camLook = [0, 0, 0];
const camUp = [0, 1, 0];
let menuOrbitLon = 105.0;
let camShake = 0;
let impactFlash = 0;
let bannerTimer = 0;

// Sandbox & Planetary Defense Telemetry Counters
let score = 0;
let cratersCount = 0;
let terraformedCount = 0;
let intercepted = 0;
let biospherePct = 100;
const landmarkDamaged = [false, false, false, false, false, false];

// Projectiles, Rogue Doomsday Asteroids, Beams, Rings & Particles
const kineticMeteors = [];   // Player-launched meteors streaking from orbit
const rogueAsteroids = [];   // Mode 2 incoming Doomsday Rogue Asteroids
const activeBeams = [];      // Genesis beams & twin Orbital Interceptor lasers
const shockRings = [];       // Expanding 3D tectonic/plasma rings on globe or in space
const particles = [];

let defenseWaveIdx = 0;
let defenseSpawnTimer = 0;
let defenseTime = 0;
let defenseRepairTimer = 0;
let defenseRepairPhase = false;

// Cursor Raycast Target on Planet Surface
let mouseNormX = 0;
let mouseNormY = -0.06;
let hasCursorHit = false;
const targetSurfaceDir = [craft.dir[0], craft.dir[1], craft.dir[2]];

// --- UI Toast & Banner Helpers ---
function showToast(msg, tone = '') {
  const el = document.createElement('div');
  el.className = `me-toast${tone ? ` ${tone}` : ''}`;
  el.textContent = msg;
  toastFeedEl.appendChild(el);
  while (toastFeedEl.children.length > 3) {
    toastFeedEl.removeChild(toastFeedEl.firstChild);
  }
  setTimeout(() => {
    el.remove();
  }, 3100);
}

function showBanner(title, sub, dur = 2.8) {
  bannerTitleEl.textContent = title;
  bannerSubEl.textContent = sub;
  bannerEl.classList.add('show');
  bannerTimer = dur;
}

function formatClock(sec) {
  const m = Math.floor(sec / 60);
  const s = (sec % 60).toFixed(1).padStart(4, '0');
  return `${String(m).padStart(2, '0')}:${s}`;
}

function formatUTCLabel(hrs) {
  const h = ((Math.floor(hrs) % 24) + 24) % 24;
  const m = Math.floor((hrs - Math.floor(hrs)) * 60);
  return `UTC ${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

// --- Particle & Shockwave Emitters ---
function spawnParticle(x, y, z, vx, vy, vz, size, grow, life, r, g, b, a, kind = 0, grav = 0) {
  if (particles.length >= particleSys.maxParticles) return;
  particles.push({
    x, y, z, vx, vy, vz,
    size, grow, life, maxLife: life,
    r, g, b, a, kind, grav,
    rot: Math.random() * 6.28,
    vrot: (Math.random() - 0.5) * 4.2,
  });
}

function spawnSurfaceShockRing(dir, maxScale, dur, col) {
  const sr = planet.sampleSurfaceRadius(dir[0], dir[1], dir[2]) + 0.22;
  shockRings.push({
    x: dir[0] * sr,
    y: dir[1] * sr,
    z: dir[2] * sr,
    nx: dir[0],
    ny: dir[1],
    nz: dir[2],
    scale: 0.6,
    maxScale,
    t: 0,
    dur,
    col,
  });
}

function emitTectonicImpactBurst(dir, mega = false) {
  const sr = planet.sampleSurfaceRadius(dir[0], dir[1], dir[2]) + 0.25;
  const px = dir[0] * sr;
  const py = dir[1] * sr;
  const pz = dir[2] * sr;

  // Orthonormal tangent basis for radial ejecta cone
  const ref = Math.abs(dir[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
  const t1 = V3.normalize(
    ref[1] * dir[2] - ref[2] * dir[1],
    ref[2] * dir[0] - ref[0] * dir[2],
    ref[0] * dir[1] - ref[1] * dir[0]
  );
  const t2 = V3.cross(dir, t1);

  const count = mega ? 46 : 30;
  for (let i = 0; i < count; i++) {
    const a = Math.random() * Math.PI * 2;
    const spread = (mega ? 15 : 10.5) * (0.35 + Math.random() * 0.85);
    const upSpd = (mega ? 18 : 12.5) * (0.45 + Math.random() * 0.85);
    const vx = dir[0] * upSpd + (t1[0] * Math.cos(a) + t2[0] * Math.sin(a)) * spread;
    const vy = dir[1] * upSpd + (t1[1] * Math.cos(a) + t2[1] * Math.sin(a)) * spread;
    const vz = dir[2] * upSpd + (t1[2] * Math.cos(a) + t2[2] * Math.sin(a)) * spread;
    const isShard = i % 2 === 0;
    spawnParticle(
      px, py, pz,
      vx, vy, vz,
      isShard ? 0.65 : 1.35,
      isShard ? 0.3 : 2.8,
      0.75 + Math.random() * 0.7,
      1.0,
      isShard ? 0.42 : 0.68,
      isShard ? 0.08 : 0.18,
      0.92,
      isShard ? 1 : 0,
      14.5
    );
  }
}

function emitGenesisBloom(dir) {
  const sr = planet.sampleSurfaceRadius(dir[0], dir[1], dir[2]) + 0.35;
  const px = dir[0] * sr;
  const py = dir[1] * sr;
  const pz = dir[2] * sr;
  const ref = Math.abs(dir[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
  const t1 = V3.normalize(
    ref[1] * dir[2] - ref[2] * dir[1],
    ref[2] * dir[0] - ref[0] * dir[2],
    ref[0] * dir[1] - ref[1] * dir[0]
  );
  const t2 = V3.cross(dir, t1);

  for (let i = 0; i < 24; i++) {
    const a = Math.random() * Math.PI * 2;
    const sp = 5.5 * (0.3 + Math.random() * 0.8);
    const up = 7.5 * (0.4 + Math.random() * 0.8);
    spawnParticle(
      px, py, pz,
      dir[0] * up + (t1[0] * Math.cos(a) + t2[0] * Math.sin(a)) * sp,
      dir[1] * up + (t1[1] * Math.cos(a) + t2[1] * Math.sin(a)) * sp,
      dir[2] * up + (t1[2] * Math.cos(a) + t2[2] * Math.sin(a)) * sp,
      0.95,
      2.1,
      0.7 + Math.random() * 0.5,
      0.16, 0.92, 0.62, 0.82,
      0,
      -2.0
    );
  }
}

function emitSpaceExplosion(x, y, z) {
  const nDir = V3.normalize(x, y, z);
  shockRings.push({
    x, y, z,
    nx: nDir[0], ny: nDir[1], nz: nDir[2],
    scale: 1.0,
    maxScale: 9.5,
    t: 0,
    dur: 0.65,
    col: [0.32, 0.86, 1.0],
  });
  for (let i = 0; i < 38; i++) {
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(Math.random() * 2 - 1);
    const sp = 16.0 * (0.35 + Math.random() * 0.85);
    const vx = Math.sin(phi) * Math.cos(theta) * sp;
    const vy = Math.cos(phi) * sp;
    const vz = Math.sin(phi) * Math.sin(theta) * sp;
    const azure = i % 2 === 0;
    spawnParticle(
      x, y, z, vx, vy, vz,
      azure ? 1.2 : 0.7,
      azure ? 2.6 : 0.4,
      0.65 + Math.random() * 0.55,
      azure ? 0.25 : 1.0,
      azure ? 0.85 : 0.72,
      azure ? 1.0 : 0.22,
      0.95,
      azure ? 0 : 1,
      0
    );
  }
}

// --- Core Sandbox & Defense Actions ---
function setTool(toolId) {
  selectedTool = toolId;
  toolMeteorBtn.className = `me-tool-btn${toolId === 1 ? ' active-amber' : ''}`;
  toolTerraBtn.className = `me-tool-btn${toolId === 2 ? ' active-emerald' : ''}`;
  toolLaserBtn.className = `me-tool-btn${toolId === 3 ? ' active-azure' : ''}`;
}

function launchKineticMeteor(targetDir, instant = false) {
  const d = V3.normalize(targetDir[0], targetDir[1], targetDir[2]);
  if (instant) {
    detonateKineticMeteor(d, 0.088, 2.15, false);
    return;
  }
  const startR = R_EARTH + Math.max(craft.alt + 10.0, 24.0);
  kineticMeteors.push({
    sx: d[0] * startR + craft.fwd[0] * 3.5,
    sy: d[1] * startR + craft.fwd[1] * 3.5,
    sz: d[2] * startR + craft.fwd[2] * 3.5,
    tx: d[0] * R_EARTH,
    ty: d[1] * R_EARTH,
    tz: d[2] * R_EARTH,
    dir: d,
    t: 0,
    dur: 0.20,
  });
  audio.playSonicBoom();
}

function detonateKineticMeteor(dir, angRadius = 0.088, depth = 2.15, isRogue = false, landmarkIdx = -1) {
  planet.applyMeteorCrater(dir, angRadius, depth);
  cratersCount++;
  if (!isRogue) {
    score += 120;
  }
  camShake = Math.max(camShake, isRogue ? 0.95 : 0.58);
  impactFlash = Math.max(impactFlash, isRogue ? 0.85 : 0.52);
  audio.playMeteorImpact(isRogue);
  spawnSurfaceShockRing(dir, isRogue ? 11.5 : 7.2, isRogue ? 0.85 : 0.62, [1.0, 0.45, 0.09]);
  emitTectonicImpactBurst(dir, isRogue);

  if (isRogue && landmarkIdx >= 0) {
    landmarkDamaged[landmarkIdx] = true;
    biospherePct = Math.max(10, biospherePct - 18);
    pipEls[landmarkIdx]?.classList.add('hit');
    const lm = LANDMARKS[landmarkIdx];
    showBanner(`警报：${lm.name} 遭陨石撞击！`, '使用右键 / [2] 造陆生态脉冲即可冷却熔岩修复生态圈', 3.4);
    showToast(`${lm.short}受损！快用 [2/右键] 修复`, 'amber');
  } else {
    const ll = dirToLatLon(dir[0], dir[1], dir[2]);
    showToast(`天基陨石凿刻熔岩坑 (${ll.lat.toFixed(1)}°, ${ll.lon.toFixed(1)}°) +120`, 'amber');
  }
}

function triggerGenesisTerraform(targetDir) {
  const d = V3.normalize(targetDir[0], targetDir[1], targetDir[2]);
  planet.applyGenesisTerraform(d, 0.098, 1.48);
  terraformedCount++;
  score += 150;
  audio.playGenesisTerraform();

  const sr = planet.sampleSurfaceRadius(d[0], d[1], d[2]);
  activeBeams.push({
    x0: craft.pos[0],
    y0: craft.pos[1] - 0.2,
    z0: craft.pos[2],
    x1: d[0] * sr,
    y1: d[1] * sr,
    z1: d[2] * sr,
    col: [0.18, 0.92, 0.62],
    width: 0.55,
    t: 0,
    dur: 0.36,
  });
  spawnSurfaceShockRing(d, 6.8, 0.58, [0.20, 0.88, 0.60]);
  emitGenesisBloom(d);

  // Check if repairing any damaged Landmark in Defense Mode!
  let repairedAny = false;
  for (let i = 0; i < LANDMARKS.length; i++) {
    if (!landmarkDamaged[i]) continue;
    const dot = V3.dot(d, LANDMARKS[i].dir);
    if (dot > 0.962) {
      landmarkDamaged[i] = false;
      repairedAny = true;
      biospherePct = Math.min(100, biospherePct + 18);
      score += 250;
      pipEls[i]?.classList.remove('hit');
      pipEls[i]?.classList.add('done');
      showBanner(`生态修复完成 · ${LANDMARKS[i].name}`, '熔岩火山口已重焕翡翠生机 +250！', 2.6);
      showToast(`修复 ${LANDMARKS[i].short} 生态圈 +250`, 'emerald');
    }
  }

  if (!repairedAny) {
    showToast('造陆生态脉冲：隆起翡翠群岛 +150', 'emerald');
  }
}

function fireOrbitalInterceptorLaser() {
  // Compute craft wingtip positions
  const right = V3.cross(craft.fwd, craft.dir);
  V3.normalize(right[0], right[1], right[2], right);
  const wL = [craft.pos[0] - right[0] * 1.05, craft.pos[1] - right[1] * 1.05, craft.pos[2] - right[2] * 1.05];
  const wR = [craft.pos[0] + right[0] * 1.05, craft.pos[1] + right[1] * 1.05, craft.pos[2] + right[2] * 1.05];

  // Auto-acquire best incoming Rogue Asteroid in front / near aim!
  let bestAst = null;
  let bestScore = Infinity;
  for (const ast of rogueAsteroids) {
    if (!ast.alive) continue;
    const dx = ast.x - craft.pos[0];
    const dy = ast.y - craft.pos[1];
    const dz = ast.z - craft.pos[2];
    const dist = Math.hypot(dx, dy, dz);
    if (dist > 120) continue;
    const toAst = [dx / dist, dy / dist, dz / dist];
    const fwdDot = V3.dot(toAst, craft.fwd);
    if (fwdDot > 0.05 || dist < 48) {
      const metric = dist * (1.35 - Math.max(0, fwdDot) * 0.65);
      if (metric < bestScore) {
        bestScore = metric;
        bestAst = ast;
      }
    }
  }

  let tx, ty, tz;
  let hitAsteroid = false;
  if (bestAst) {
    tx = bestAst.x;
    ty = bestAst.y;
    tz = bestAst.z;
    bestAst.alive = false;
    hitAsteroid = true;
    intercepted++;
    score += 600;
    camShake = Math.max(camShake, 0.45);
    pipEls[bestAst.landmarkIdx]?.classList.add('done');
    emitSpaceExplosion(tx, ty, tz);
    const lm = LANDMARKS[bestAst.landmarkIdx];
    showBanner(`成功拦截末日陨石！+600`, `已守护 ${lm.name} [${intercepted} / 6]`, 2.4);
    showToast(`轨道激光击碎陨石 (${lm.short}) +600`, 'emerald');
    updateDefenseHUDText();
  } else {
    // Fire forward / toward targeted surface direction
    tx = craft.pos[0] + craft.fwd[0] * 38.0;
    ty = craft.pos[1] + craft.fwd[1] * 38.0;
    tz = craft.pos[2] + craft.fwd[2] * 38.0;
    if (hasCursorHit) {
      const sr = planet.sampleSurfaceRadius(targetSurfaceDir[0], targetSurfaceDir[1], targetSurfaceDir[2]);
      tx = targetSurfaceDir[0] * (sr + 1.2);
      ty = targetSurfaceDir[1] * (sr + 1.2);
      tz = targetSurfaceDir[2] * (sr + 1.2);
    }
  }

  audio.playOrbitalLaser(hitAsteroid);
  activeBeams.push(
    { x0: wL[0], y0: wL[1], z0: wL[2], x1: tx, y1: ty, z1: tz, col: [0.22, 0.82, 1.0], width: 0.22, t: 0, dur: 0.22 },
    { x0: wR[0], y0: wR[1], z0: wR[2], x1: tx, y1: ty, z1: tz, col: [0.22, 0.82, 1.0], width: 0.22, t: 0, dur: 0.22 }
  );
}

// --- Landmark Quick-Warp ---
function warpToLandmark(idx) {
  const cleanIdx = ((idx % LANDMARKS.length) + LANDMARKS.length) % LANDMARKS.length;
  const lm = LANDMARKS[cleanIdx];

  // Position craft slightly south-offset so the landmark stands right ahead in center view!
  const approachLat = clamp(lm.lat - 3.2, -85, 85);
  latLonToDir(approachLat, lm.lon, craft.dir);

  // Heading points directly toward the landmark along tangent plane
  craft.fwd[0] = lm.dir[0] - craft.dir[0];
  craft.fwd[1] = lm.dir[1] - craft.dir[1];
  craft.fwd[2] = lm.dir[2] - craft.dir[2];

  const surfElev = planet.sampleSurfaceRadius(lm.dir[0], lm.dir[1], lm.dir[2]) - R_EARTH;
  craft.targetAlt = clamp(surfElev + 7.2, 6.5, 22.0);
  craft.alt = craft.targetAlt;
  craft.speed = 3.5;
  orthonormalizeCraft();

  // Snap camera smoothly behind craft so there is no disorienting whip across the globe
  camPos[0] = craft.pos[0] - craft.fwd[0] * 8.5 + craft.dir[0] * 3.8;
  camPos[1] = craft.pos[1] - craft.fwd[1] * 8.5 + craft.dir[1] * 3.8;
  camPos[2] = craft.pos[2] - craft.fwd[2] * 8.5 + craft.dir[2] * 3.8;

  warpBtns.forEach((b, bi) => b.classList.toggle('active', bi === cleanIdx));
  audio.init();
  audio.playTelemetryPing(true);
  showToast(`已跃迁至 ${lm.name} (${formatLatLon(lm.lat, lm.lon)})`);
  return { index: cleanIdx, name: lm.name, lat: lm.lat, lon: lm.lon };
}

// --- Mode Transitions (Sandbox & Planetary Defense) ---
function updateDefenseHUDText() {
  if (mode === 'defense' || (mode === 'paused' && prevActiveMode === 'defense')) {
    modeTagEl.textContent = '行星防御';
    modeTagEl.classList.add('defense');
    defPipsWrap.style.display = 'inline-flex';
    if (defenseRepairPhase) {
      modeDescEl.textContent = `修复受损生态区 (${Math.ceil(defenseRepairTimer)}s)`;
    } else {
      modeDescEl.textContent = `空格激光拦截末日陨石 [${intercepted} / 6]`;
    }
  } else {
    modeTagEl.textContent = '星球沙盒';
    modeTagEl.classList.remove('defense');
    defPipsWrap.style.display = 'none';
    modeDescEl.textContent = '左键陨石凿坑 · 右键创世造陆 · [M] 防御战役';
  }
}

function startSandboxMode() {
  audio.init();
  audio.playTelemetryPing(false);
  mode = 'sandbox';
  prevActiveMode = 'sandbox';
  rogueAsteroids.length = 0;
  defenseRepairPhase = false;
  landmarkDamaged.fill(false);

  overlayEl.classList.add('hidden');
  hudEl.classList.add('visible');
  debriefEl.classList.remove('show');
  btnResetEarth.style.display = 'inline-flex';
  if (window.matchMedia('(pointer: coarse)').matches) {
    document.getElementById('me-touch')?.classList.add('active');
  }
  updateDefenseHUDText();
  showBanner('镜像地球 · 轨道沙盒已连接', '左键投射陨石凿刻火山口 · 右键释放造陆脉冲隆起群岛', 3.0);
  canvas.focus();
}

function spawnRogueAsteroid(landmarkIdx) {
  const lm = LANDMARKS[landmarkIdx];
  const d = lm.dir;
  // Slight orbital entry angle offset so streak across space looks cinematic
  const ref = Math.abs(d[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
  const east = V3.normalize(
    ref[1] * d[2] - ref[2] * d[1],
    ref[2] * d[0] - ref[0] * d[2],
    ref[0] * d[1] - ref[1] * d[0]
  );
  const startR = R_EARTH + 58.0;
  const sx = d[0] * startR + east[0] * 12.0;
  const sy = d[1] * startR + east[1] * 12.0;
  const sz = d[2] * startR + east[2] * 12.0;
  const sr = planet.sampleSurfaceRadius(d[0], d[1], d[2]);

  rogueAsteroids.push({
    id: landmarkIdx,
    landmarkIdx,
    sx, sy, sz,
    tx: d[0] * sr,
    ty: d[1] * sr,
    tz: d[2] * sr,
    x: sx, y: sy, z: sz,
    dir: d,
    t: 0,
    dur: 17.5,
    alive: true,
    rot: Math.random() * 6.28,
  });

  showToast(`预警：末日小行星正袭向${lm.name}！`, 'amber');
  audio.playTelemetryPing(true);
}

function startDefenseMode() {
  audio.init();
  audio.playSpacePadSwell();
  mode = 'defense';
  prevActiveMode = 'defense';
  setTool(3);

  rogueAsteroids.length = 0;
  intercepted = 0;
  biospherePct = 100;
  defenseTime = 0;
  defenseRepairPhase = false;
  defenseRepairTimer = 0;
  landmarkDamaged.fill(false);
  pipEls.forEach((p) => p.classList.remove('done', 'hit'));

  overlayEl.classList.add('hidden');
  hudEl.classList.add('visible');
  debriefEl.classList.remove('show');
  btnResetEarth.style.display = 'inline-flex';
  if (window.matchMedia('(pointer: coarse)').matches) {
    document.getElementById('me-touch')?.classList.add('active');
  }

  warpToLandmark(0);
  spawnRogueAsteroid(0);
  defenseWaveIdx = 1;
  defenseSpawnTimer = 3.8;
  updateDefenseHUDText();
  showBanner(
    '行星防御战役 · 末日陨石来袭',
    '点击右上角地标快速跃迁，按 [Space] 发射轨道拦截激光守护地球！',
    3.6
  );
  canvas.focus();
}

function finishDefenseCampaign() {
  mode = 'debrief';
  hudEl.classList.remove('visible');
  overlayEl.classList.remove('hidden');
  debriefEl.classList.add('show');

  let rank = 'A';
  if (intercepted === 6 || (intercepted >= 5 && biospherePct >= 98)) {
    rank = 'S+';
  } else if (biospherePct >= 80 || intercepted >= 4) {
    rank = 'S';
  }

  kickerEl.textContent = 'PLANETARY DEFENSE DEBRIEF // 行星防御遥测报告';
  titleEl.textContent = rank === 'S+' ? '苍穹守护者 · 地球毫发无损' : '行星危机解除 · 生态圈存续';
  descEl.textContent =
    '六波深空末日小行星潮已全部解除！你可以继续进入自由沙盒重塑大陆与海洋，或再次发起行星防御挑战更高评级。';

  stTimeEl.textContent = formatClock(defenseTime);
  stIntEl.textContent = `${intercepted} / 6`;
  stBioEl.textContent = `${biospherePct}%`;
  stScoreEl.textContent = String(score);
  stRankEl.textContent = rank;

  btnSandbox.textContent = '继续自由沙盒巡航';
  btnDefense.textContent = '再次挑战行星防御';
  audio.playGenesisTerraform();
}

function togglePause() {
  if (mode === 'sandbox' || mode === 'defense') {
    prevActiveMode = mode;
    mode = 'paused';
    overlayEl.classList.remove('hidden');
    kickerEl.textContent = 'ORBITAL TELEMETRY PAUSED // 轨道巡航已暂停';
    titleEl.textContent = '镜像地球 · 轨道待命';
    descEl.textContent = '随时调整实时四重气象、UTC 晨昏时轴或试听轨道声学合成台。';
    btnSandbox.textContent = prevActiveMode === 'sandbox' ? '继续轨道巡航' : '切换至自由沙盒';
    btnDefense.textContent = prevActiveMode === 'defense' ? '继续防御战役' : '开启行星防御战役';
  } else if (mode === 'paused') {
    mode = prevActiveMode;
    overlayEl.classList.add('hidden');
    hudEl.classList.add('visible');
    canvas.focus();
  }
}

// --- Input & UI Event Listeners ---
const keys = new Set();
window.addEventListener('keydown', (e) => {
  if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
  keys.add(e.code);

  if (e.code === 'KeyP' || e.code === 'Escape') {
    if (mode === 'sandbox' || mode === 'defense' || mode === 'paused') {
      e.preventDefault();
      togglePause();
    }
    return;
  }

  if (e.code === 'KeyG') {
    cycleWeather();
    return;
  }
  if (e.code === 'KeyC') {
    camPreset = (camPreset + 1) % CAM_NAMES.length;
    showToast(`摄影机位：${CAM_NAMES[camPreset]}`);
    return;
  }
  if (e.code === 'KeyT') {
    toggleSolarSyncMode();
    return;
  }
  if (e.code === 'KeyM') {
    if (mode === 'sandbox') startDefenseMode();
    else if (mode === 'defense') startSandboxMode();
    return;
  }

  if (mode !== 'sandbox' && mode !== 'defense') return;

  if (e.code === 'Digit1') {
    setTool(1);
    showToast('已切换：[1] 天基陨石冲击', 'amber');
  } else if (e.code === 'Digit2') {
    setTool(2);
    showToast('已切换：[2] 造陆生态脉冲', 'emerald');
  } else if (e.code === 'Space') {
    e.preventDefault();
    setTool(3);
    fireOrbitalInterceptorLaser();
  } else if (e.code >= 'Digit3' && e.code <= 'Digit8') {
    const lmIdx = Number(e.code.slice(5)) - 3;
    warpToLandmark(lmIdx);
  }
});

window.addEventListener('keyup', (e) => {
  keys.delete(e.code);
});

canvas.addEventListener('contextmenu', (e) => e.preventDefault());

canvas.addEventListener('pointermove', (e) => {
  const rect = canvas.getBoundingClientRect();
  if (rect.width > 0 && rect.height > 0) {
    mouseNormX = ((e.clientX - rect.left) / rect.width) * 2.0 - 1.0;
    mouseNormY = 1.0 - ((e.clientY - rect.top) / rect.height) * 2.0;
  }
});

canvas.addEventListener('pointerdown', (e) => {
  if (mode !== 'sandbox' && mode !== 'defense') return;
  audio.init();
  const rect = canvas.getBoundingClientRect();
  if (rect.width > 0 && rect.height > 0) {
    mouseNormX = ((e.clientX - rect.left) / rect.width) * 2.0 - 1.0;
    mouseNormY = 1.0 - ((e.clientY - rect.top) / rect.height) * 2.0;
    updateCursorRayTarget();
  }

  if (e.button === 2) {
    setTool(2);
    triggerGenesisTerraform(targetSurfaceDir);
  } else if (e.button === 0) {
    if (selectedTool === 2) {
      triggerGenesisTerraform(targetSurfaceDir);
    } else if (selectedTool === 3) {
      fireOrbitalInterceptorLaser();
    } else {
      setTool(1);
      launchKineticMeteor(targetSurfaceDir, false);
    }
  }
});

canvas.addEventListener(
  'wheel',
  (e) => {
    if (mode !== 'sandbox' && mode !== 'defense') return;
    e.preventDefault();
    craft.targetAlt = clamp(craft.targetAlt + Math.sign(e.deltaY) * 2.8, 2.2, 46.0);
  },
  { passive: false }
);

// Touch Joystick & Buttons
let touchX = 0;
let touchY = 0;
const tPad = document.getElementById('me-t-pad');
const tKnob = document.getElementById('me-t-knob');
if (tPad && tKnob) {
  const handleTouch = (e) => {
    e.preventDefault();
    const t = e.touches[0];
    if (!t) return;
    const r = tPad.getBoundingClientRect();
    const dx = clamp((t.clientX - (r.left + r.width * 0.5)) / 36, -1, 1);
    const dy = clamp((t.clientY - (r.top + r.height * 0.5)) / 36, -1, 1);
    touchX = dx;
    touchY = dy;
    tKnob.style.transform = `translate(${dx * 26}px, ${dy * 26}px)`;
  };
  tPad.addEventListener('touchstart', handleTouch, { passive: false });
  tPad.addEventListener('touchmove', handleTouch, { passive: false });
  tPad.addEventListener('touchend', () => {
    touchX = 0;
    touchY = 0;
    tKnob.style.transform = 'translate(0, 0)';
  });
}
document.getElementById('me-tb-meteor')?.addEventListener('click', () => {
  setTool(1);
  launchKineticMeteor(targetSurfaceDir, false);
});
document.getElementById('me-tb-terra')?.addEventListener('click', () => {
  setTool(2);
  triggerGenesisTerraform(targetSurfaceDir);
});
document.getElementById('me-tb-laser')?.addEventListener('click', () => {
  setTool(3);
  fireOrbitalInterceptorLaser();
});

// HUD & Menu Controls Wiring
function setWeatherMode(w) {
  weatherMode = ((w % WEATHER_NAMES.length) + WEATHER_NAMES.length) % WEATHER_NAMES.length;
  document.querySelectorAll('.wx-pill').forEach((b) => {
    b.classList.toggle('active', Number(b.dataset.w) === weatherMode);
  });
  audio.init();
  audio.playTelemetryPing(false);
  showToast(`实时气象：${WEATHER_NAMES[weatherMode]}`);
}

function cycleWeather() {
  setWeatherMode(weatherMode + 1);
}

function toggleSolarSyncMode() {
  if (solarMode === 'utc') {
    solarMode = 'timelapse';
    btnSolar.textContent = '流转 [T]';
    solarLblEl.textContent = '360× 流转';
    showToast('已开启 360× 轨道晨昏线流转演示');
  } else {
    solarMode = 'utc';
    solarUtcHours = syncLiveUTC();
    btnSolar.textContent = 'UTC [T]';
    solarLblEl.textContent = 'UTC 实时';
    showToast('已恢复全球 UTC 实时太阳晨昏同步');
  }
}

btnSandbox.addEventListener('click', () => {
  if (mode === 'paused' && prevActiveMode === 'sandbox') togglePause();
  else startSandboxMode();
});
btnDefense.addEventListener('click', () => {
  if (mode === 'paused' && prevActiveMode === 'defense') togglePause();
  else startDefenseMode();
});
btnResetEarth.addEventListener('click', () => {
  planet.resetSurface();
  cratersCount = 0;
  terraformedCount = 0;
  biospherePct = 100;
  landmarkDamaged.fill(false);
  audio.init();
  audio.playGenesisTerraform();
  showToast('地球大陆与海床已恢复初始原始地貌', 'emerald');
});

document.getElementById('btn-weather').addEventListener('click', cycleWeather);
document.getElementById('btn-cam').addEventListener('click', () => {
  camPreset = (camPreset + 1) % CAM_NAMES.length;
  showToast(`摄影机位：${CAM_NAMES[camPreset]}`);
});
document.getElementById('btn-defense').addEventListener('click', () => {
  if (mode === 'defense') startSandboxMode();
  else startDefenseMode();
});
document.getElementById('btn-pause').addEventListener('click', togglePause);
document.getElementById('btn-fs').addEventListener('click', () => {
  if (!document.fullscreenElement) {
    appEl.requestFullscreen?.().catch(() => {});
  } else {
    document.exitFullscreen?.().catch(() => {});
  }
});

toolMeteorBtn.addEventListener('click', () => setTool(1));
toolTerraBtn.addEventListener('click', () => setTool(2));
toolLaserBtn.addEventListener('click', () => {
  setTool(3);
  fireOrbitalInterceptorLaser();
});
btnSolar.addEventListener('click', toggleSolarSyncMode);

warpBtns.forEach((btn) => {
  btn.addEventListener('click', () => {
    warpToLandmark(Number(btn.dataset.lm));
  });
});

document.querySelectorAll('.wx-pill').forEach((btn) => {
  btn.addEventListener('click', () => setWeatherMode(Number(btn.dataset.w)));
});

document.querySelectorAll('.q-pill').forEach((btn) => {
  btn.addEventListener('click', () => {
    quality = btn.dataset.q;
    document.querySelectorAll('.q-pill').forEach((b) => b.classList.toggle('active', b === btn));
    ensureFBO();
  });
});

solarRangeEl.addEventListener('input', () => {
  solarMode = 'manual';
  solarUtcHours = Number(solarRangeEl.value) / 10.0;
  const txt = formatUTCLabel(solarUtcHours);
  solarLblEl.textContent = txt;
  btnSolar.textContent = `${txt} [T]`;
});

document.getElementById('me-vol').addEventListener('input', (e) => {
  audio.init();
  audio.setVolume(Number(e.target.value) / 100);
});

btnStudio.addEventListener('click', () => {
  audio.init();
  studioEl.classList.toggle('open');
});

document.querySelectorAll('.me-sfx-trigger').forEach((btn) => {
  btn.addEventListener('click', () => {
    audio.init();
    const s = btn.dataset.s;
    if (s === 'pad') audio.playSpacePadSwell();
    else if (s === 'meteor') audio.playMeteorImpact(true);
    else if (s === 'terra') audio.playGenesisTerraform();
    else if (s === 'ping') audio.playTelemetryPing(true);
    else if (s === 'laser') audio.playOrbitalLaser(true);
    else if (s === 'boom') audio.playSonicBoom();
  });
});

// Wire Inline Tall View Toggle (#btn-tall and #menu-btn-tall injected by build.mjs)
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

// --- Cursor Raycast onto 3D Earth Sphere ---
const matProj = M4.create();
const matView = M4.create();
const matVP = M4.create();
const matInvVP = M4.create();
const matTemp = M4.create();

function updateCursorRayTarget() {
  if (M4.invert(matInvVP, matVP)) {
    const nx = mouseNormX;
    const ny = mouseNormY;
    // Near & Far points in world space
    const w0 = matInvVP[3] * nx + matInvVP[7] * ny - matInvVP[11] + matInvVP[15];
    const x0 = (matInvVP[0] * nx + matInvVP[4] * ny - matInvVP[8] + matInvVP[12]) / (w0 || 1);
    const y0 = (matInvVP[1] * nx + matInvVP[5] * ny - matInvVP[9] + matInvVP[13]) / (w0 || 1);
    const z0 = (matInvVP[2] * nx + matInvVP[6] * ny - matInvVP[10] + matInvVP[14]) / (w0 || 1);

    const w1 = matInvVP[3] * nx + matInvVP[7] * ny + matInvVP[11] + matInvVP[15];
    const x1 = (matInvVP[0] * nx + matInvVP[4] * ny + matInvVP[8] + matInvVP[12]) / (w1 || 1);
    const y1 = (matInvVP[1] * nx + matInvVP[5] * ny + matInvVP[9] + matInvVP[13]) / (w1 || 1);
    const z1 = (matInvVP[2] * nx + matInvVP[6] * ny + matInvVP[10] + matInvVP[14]) / (w1 || 1);

    const rd = V3.normalize(x1 - x0, y1 - y0, z1 - z0);
    const hitT = raySphereIntersect(x0, y0, z0, rd[0], rd[1], rd[2], R_EARTH + 0.15);
    if (hitT > 0) {
      hasCursorHit = true;
      V3.normalize(x0 + rd[0] * hitT, y0 + rd[1] * hitT, z0 + rd[2] * hitT, targetSurfaceDir);
      return;
    }
  }

  hasCursorHit = false;
  // Fallback to ground-track point right ahead of the Orbital Craft!
  V3.normalize(
    craft.dir[0] * R_EARTH + craft.fwd[0] * 6.5,
    craft.dir[1] * R_EARTH + craft.fwd[1] * 6.5,
    craft.dir[2] * R_EARTH + craft.fwd[2] * 6.5,
    targetSurfaceDir
  );
}

// --- Simulation Step ---
function updateSimulation(dt) {
  // 1. Update UTC Solar Angle
  if (solarMode === 'utc') {
    solarUtcHours = syncLiveUTC();
  } else if (solarMode === 'timelapse') {
    solarUtcHours = (solarUtcHours + dt * 0.6) % 24.0;
  }
  computeSolarDir(solarUtcHours, 19.0, sunDir);

  if (bannerTimer > 0) {
    bannerTimer -= dt;
    if (bannerTimer <= 0) bannerEl.classList.remove('show');
  }
  camShake = Math.max(0, camShake - dt * 2.2);
  impactFlash = Math.max(0, impactFlash - dt * 2.4);

  // Menu Orbit Preview
  if (mode === 'menu' || mode === 'paused' || mode === 'debrief') {
    if (mode === 'menu') {
      menuOrbitLon = (menuOrbitLon + dt * 5.2) % 360;
      const d = latLonToDir(22.0 + Math.sin(menuOrbitLon * 0.02) * 14.0, menuOrbitLon);
      camPos[0] = d[0] * 94.0;
      camPos[1] = d[1] * 94.0;
      camPos[2] = d[2] * 94.0;
      camLook[0] = 0;
      camLook[1] = 0;
      camLook[2] = 0;
      camUp[0] = 0;
      camUp[1] = 1;
      camUp[2] = 0;
    }
    audio.update(dt, 0.7, 0.0, false, weatherMode, false);
    return;
  }

  // 2. Active Orbital Craft Flight Controls
  let turnInput = 0;
  if (keys.has('KeyA') || keys.has('ArrowLeft')) turnInput += 1;
  if (keys.has('KeyD') || keys.has('ArrowRight')) turnInput -= 1;
  turnInput = clamp(turnInput - touchX, -1, 1);

  let thrustInput = 0;
  if (keys.has('KeyW') || keys.has('ArrowUp')) thrustInput += 1;
  if (keys.has('KeyS') || keys.has('ArrowDown')) thrustInput -= 1;
  thrustInput = clamp(thrustInput - touchY, -1, 1);

  let altInput = 0;
  if (keys.has('KeyQ')) altInput += 1;
  if (keys.has('KeyE')) altInput -= 1;

  const boosting = (keys.has('ShiftLeft') || keys.has('ShiftRight')) && craft.boostMeter > 3;
  if (boosting) {
    craft.boostMeter = Math.max(0, craft.boostMeter - 26 * dt);
    craft.boostAmt = damp(craft.boostAmt, 1.0, 10, dt);
  } else {
    craft.boostMeter = Math.min(100, craft.boostMeter + 18 * dt);
    craft.boostAmt = damp(craft.boostAmt, 0.0, 7, dt);
  }

  // Rotate forward heading around radial surface normal
  if (Math.abs(turnInput) > 0.001) {
    V3.rotateAroundAxis(craft.fwd, craft.dir, turnInput * 1.65 * dt, craft.fwd);
  }
  craft.bank = damp(craft.bank, turnInput * 0.52, 8, dt);

  // Tangential speed & supersonic boost
  let desiredSpeed = 2.6; // Gentle orbital station-keeping drift
  if (thrustInput > 0.05) {
    desiredSpeed = 21.0 * thrustInput + (boosting ? 22.0 : 0);
  } else if (thrustInput < -0.05) {
    desiredSpeed = 9.5 * thrustInput;
  } else if (boosting) {
    desiredSpeed = 38.0;
  }
  craft.speed = damp(craft.speed, desiredSpeed, 5.5, dt);

  // Advance craft along great-circle sphere tangent!
  const orbitR = R_EARTH + craft.alt;
  const dTheta = (craft.speed * dt) / orbitR;
  if (Math.abs(dTheta) > 1e-6) {
    const rightAxis = V3.cross(craft.dir, craft.fwd);
    V3.normalize(rightAxis[0], rightAxis[1], rightAxis[2], rightAxis);
    V3.rotateAroundAxis(craft.dir, rightAxis, dTheta, craft.dir);
    V3.rotateAroundAxis(craft.fwd, rightAxis, dTheta, craft.fwd);
  }

  // Climb orbit (Q) / Dive to surface skimming (E)
  if (Math.abs(altInput) > 0.01) {
    craft.targetAlt = clamp(craft.targetAlt + altInput * 18.5 * dt, 1.9, 46.0);
  }
  const groundElev = Math.max(0, planet.sampleSurfaceRadius(craft.dir[0], craft.dir[1], craft.dir[2]) - R_EARTH);
  const minSafeAlt = groundElev + 1.85;
  craft.targetAlt = Math.max(craft.targetAlt, minSafeAlt);
  craft.alt = Math.max(minSafeAlt, damp(craft.alt, craft.targetAlt, 7.5, dt));
  craft.pitchVis = damp(craft.pitchVis, altInput * 0.28, 8, dt);

  orthonormalizeCraft();

  // Low-altitude ocean spray / dust wake when skimming < 4.2m above surface!
  const clearance = craft.alt - groundElev;
  if (clearance < 4.2 && Math.abs(craft.speed) > 8.0 && Math.random() < 0.7) {
    const surfR = R_EARTH + groundElev + 0.2;
    spawnParticle(
      craft.dir[0] * surfR,
      craft.dir[1] * surfR,
      craft.dir[2] * surfR,
      -craft.fwd[0] * 4.0 + craft.dir[0] * 2.2,
      -craft.fwd[1] * 4.0 + craft.dir[1] * 2.2,
      -craft.fwd[2] * 4.0 + craft.dir[2] * 2.2,
      0.85,
      2.2,
      0.48,
      0.55, 0.88, 1.0, 0.55,
      0,
      0
    );
  }

  // 3. Smooth 3rd-Person Orbital Camera
  const preset = [
    { back: 8.6, up: 3.6, lookAhead: 7.5 },
    { back: 4.4, up: 1.7, lookAhead: 11.0 },
    { back: 24.0, up: 15.0, lookAhead: 4.0 },
  ][camPreset];

  const desCamX = craft.pos[0] - craft.fwd[0] * preset.back + craft.dir[0] * preset.up;
  const desCamY = craft.pos[1] - craft.fwd[1] * preset.back + craft.dir[1] * preset.up;
  const desCamZ = craft.pos[2] - craft.fwd[2] * preset.back + craft.dir[2] * preset.up;

  // Ensure camera never clips beneath planet terrain
  const camDir = V3.normalize(desCamX, desCamY, desCamZ);
  const minCamR = planet.sampleSurfaceRadius(camDir[0], camDir[1], camDir[2]) + 1.2;
  const curCamR = Math.max(minCamR, Math.hypot(desCamX, desCamY, desCamZ));

  camPos[0] = damp(camPos[0], camDir[0] * curCamR, 9.0, dt);
  camPos[1] = damp(camPos[1], camDir[1] * curCamR, 9.0, dt);
  camPos[2] = damp(camPos[2], camDir[2] * curCamR, 9.0, dt);

  // Tilt camera look slightly downward toward Earth's horizon so both continents & stars fill the frame!
  const lookX = craft.pos[0] + craft.fwd[0] * preset.lookAhead - craft.dir[0] * 2.6;
  const lookY = craft.pos[1] + craft.fwd[1] * preset.lookAhead - craft.dir[1] * 2.6;
  const lookZ = craft.pos[2] + craft.fwd[2] * preset.lookAhead - craft.dir[2] * 2.6;
  camLook[0] = damp(camLook[0], lookX, 11.0, dt);
  camLook[1] = damp(camLook[1], lookY, 11.0, dt);
  camLook[2] = damp(camLook[2], lookZ, 11.0, dt);

  camUp[0] = damp(camUp[0], craft.dir[0], 8.0, dt);
  camUp[1] = damp(camUp[1], craft.dir[1], 8.0, dt);
  camUp[2] = damp(camUp[2], craft.dir[2], 8.0, dt);
  V3.normalize(camUp[0], camUp[1], camUp[2], camUp);

  updateCursorRayTarget();

  // 4. Planetary Defense Mode Wave Logic
  if (mode === 'defense') {
    defenseTime += dt;
    const aliveCount = rogueAsteroids.filter((a) => a.alive).length;

    if (defenseWaveIdx < 6) {
      defenseSpawnTimer -= dt;
      if (defenseSpawnTimer <= 0 || (aliveCount === 0 && defenseWaveIdx < 6)) {
        spawnRogueAsteroid(defenseWaveIdx);
        defenseWaveIdx++;
        defenseSpawnTimer = defenseWaveIdx === 1 ? 3.2 : 6.2;
      }
    } else if (aliveCount === 0) {
      const hasDamaged = landmarkDamaged.some(Boolean);
      if (!hasDamaged) {
        finishDefenseCampaign();
        return;
      }
      if (!defenseRepairPhase) {
        defenseRepairPhase = true;
        defenseRepairTimer = 9.5;
        showBanner('最后阶段：修复受损地标生态', '右键 / 按 [2] 冷却受损地标熔岩即可晋升更高评级！', 4.0);
      } else {
        defenseRepairTimer -= dt;
        updateDefenseHUDText();
        if (defenseRepairTimer <= 0) {
          finishDefenseCampaign();
          return;
        }
      }
    }
  }

  const altNorm = clamp((craft.alt - 2.0) / 36.0, 0, 1);
  const spdNorm = clamp(Math.abs(craft.speed) / 36.0, 0, 1);
  audio.update(dt, altNorm, spdNorm, boosting, weatherMode, true);
}

function updateProjectilesAndEffects(dt) {
  // 1. Player Kinetic Meteors
  for (let i = kineticMeteors.length - 1; i >= 0; i--) {
    const m = kineticMeteors[i];
    m.t += dt;
    const p = clamp(m.t / m.dur, 0, 1);
    const mx = lerp(m.sx, m.tx, p);
    const my = lerp(m.sy, m.ty, p);
    const mz = lerp(m.sz, m.tz, p);
    spawnParticle(mx, my, mz, 0, 0, 0, 1.35, 1.8, 0.25, 1.0, 0.56, 0.14, 0.9, 0, 0);
    if (m.t >= m.dur) {
      detonateKineticMeteor(m.dir, 0.088, 2.15, false, -1);
      kineticMeteors.splice(i, 1);
    }
  }

  // 2. Incoming Doomsday Rogue Asteroids (Mode 2)
  for (let i = rogueAsteroids.length - 1; i >= 0; i--) {
    const a = rogueAsteroids[i];
    if (!a.alive) {
      rogueAsteroids.splice(i, 1);
      continue;
    }
    a.t += dt;
    a.rot += dt * 1.9;
    const p = clamp(a.t / a.dur, 0, 1);
    a.x = lerp(a.sx, a.tx, p);
    a.y = lerp(a.sy, a.ty, p);
    a.z = lerp(a.sz, a.tz, p);

    if (Math.random() < 0.75) {
      spawnParticle(
        a.x + (Math.random() - 0.5) * 0.9,
        a.y + (Math.random() - 0.5) * 0.9,
        a.z + (Math.random() - 0.5) * 0.9,
        0, 0, 0,
        1.45, 2.2, 0.42,
        1.0, 0.46, 0.09, 0.85,
        0, 0
      );
    }

    if (a.t >= a.dur) {
      a.alive = false;
      detonateKineticMeteor(a.dir, 0.115, 2.55, true, a.landmarkIdx);
      rogueAsteroids.splice(i, 1);
    }
  }

  // 3. Laser & Genesis Beams
  for (let i = activeBeams.length - 1; i >= 0; i--) {
    activeBeams[i].t += dt;
    if (activeBeams[i].t >= activeBeams[i].dur) {
      activeBeams.splice(i, 1);
    }
  }

  // 4. 3D Shockwave Rings
  for (let i = shockRings.length - 1; i >= 0; i--) {
    const r = shockRings[i];
    r.t += dt;
    if (r.t >= r.dur) {
      shockRings.splice(i, 1);
      continue;
    }
    r.scale = lerp(0.8, r.maxScale, 1 - Math.pow(1 - r.t / r.dur, 2.2));
  }

  // 5. Particles (with spherical radial gravity toward Earth's center when grav != 0!)
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.life -= dt;
    if (p.life <= 0) {
      particles[i] = particles[particles.length - 1];
      particles.pop();
      continue;
    }
    if (p.grav !== 0) {
      const len = Math.hypot(p.x, p.y, p.z) || 1;
      p.vx -= (p.x / len) * p.grav * dt;
      p.vy -= (p.y / len) * p.grav * dt;
      p.vz -= (p.z / len) * p.grav * dt;
    }
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.z += p.vz * dt;
    p.size += p.grow * dt;
    p.rot += p.vrot * dt;
  }
}

// --- Render Scene ---
const translucentProps = [];

function buildBeamMatrix(out, x0, y0, z0, x1, y1, z1, radius) {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const dz = z1 - z0;
  const len = Math.hypot(dx, dy, dz) || 0.01;
  const ux = dx / len;
  const uy = dy / len;
  const uz = dz / len;
  return M4.basisFromNormal(
    out,
    (x0 + x1) * 0.5,
    (y0 + y1) * 0.5,
    (z0 + z1) * 0.5,
    ux, uy, uz,
    0,
    radius, len, radius
  );
}

function renderScene(t) {
  ensureFBO();
  const aspect = fboW / Math.max(1, fboH);
  const fov = 0.94 + craft.boostAmt * 0.14;
  M4.perspective(matProj, fov, aspect, 0.35, 1100.0);

  const sx = (Math.random() - 0.5) * camShake * 0.9;
  const sy = (Math.random() - 0.5) * camShake * 0.9;
  const eyeX = camPos[0] + sx;
  const eyeY = camPos[1] + sy;
  const eyeZ = camPos[2];

  M4.lookAt(matView, eyeX, eyeY, eyeZ, camLook[0], camLook[1], camLook[2], camUp[0], camUp[1], camUp[2]);
  M4.mul(matVP, matProj, matView);

  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
  gl.viewport(0, 0, fboW, fboH);
  gl.clearColor(0.007, 0.018, 0.042, 1.0);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

  // 1. Starfield & Blazing Orbital Sun Skybox
  gl.disable(gl.DEPTH_TEST);
  gl.depthMask(false);
  gl.disable(gl.CULL_FACE);
  gl.disable(gl.BLEND);

  gl.useProgram(progSky.prog);
  gl.uniformMatrix4fv(progSky.u.uProj, false, matProj);
  gl.uniformMatrix4fv(progSky.u.uView, false, matView);
  gl.uniform3f(progSky.u.uCamPos, eyeX, eyeY, eyeZ);
  gl.uniform3f(progSky.u.uSunDir, sunDir[0], sunDir[1], sunDir[2]);
  gl.uniform1f(progSky.u.uTime, t);
  gl.bindVertexArray(meshes.sphere.vao);
  gl.drawElements(gl.TRIANGLES, meshes.sphere.count, meshes.sphere.indexType, 0);

  // 2. Living Destructible 3D Planet Earth (Continents, Oceans, Craters & Night City Lights)
  gl.enable(gl.DEPTH_TEST);
  gl.depthMask(true);
  gl.enable(gl.CULL_FACE);
  gl.cullFace(gl.BACK);

  gl.useProgram(progPlanet.prog);
  gl.uniformMatrix4fv(progPlanet.u.uProj, false, matProj);
  gl.uniformMatrix4fv(progPlanet.u.uView, false, matView);
  gl.uniform3f(progPlanet.u.uCamPos, eyeX, eyeY, eyeZ);
  gl.uniform3f(progPlanet.u.uSunDir, sunDir[0], sunDir[1], sunDir[2]);
  gl.uniform1f(progPlanet.u.uTime, t);
  gl.uniform1i(progPlanet.u.uWeatherMode, weatherMode);

  const showTargetMode =
    (mode === 'sandbox' || mode === 'defense') && selectedTool !== 3
      ? selectedTool
      : 0;
  gl.uniform4f(
    progPlanet.u.uTargetRing,
    targetSurfaceDir[0],
    targetSurfaceDir[1],
    targetSurfaceDir[2],
    showTargetMode
  );
  gl.bindVertexArray(planet.vao);
  gl.drawElements(gl.TRIANGLES, planet.count, planet.indexType, 0);

  // 3. 3D World Landmarks & Incoming Doomsday Rogue Asteroid Boulders
  gl.disable(gl.CULL_FACE);
  gl.useProgram(progProp.prog);
  gl.uniformMatrix4fv(progProp.u.uProj, false, matProj);
  gl.uniformMatrix4fv(progProp.u.uView, false, matView);
  gl.uniform3f(progProp.u.uCamPos, eyeX, eyeY, eyeZ);
  gl.uniform3f(progProp.u.uSunDir, sunDir[0], sunDir[1], sunDir[2]);

  translucentProps.length = 0;
  const drawProp = (mesh, modelMat, col, metalOrGlow = 0.4, emissive = false, alpha = 1.0) => {
    if (alpha < 0.99) {
      const copy = M4.create();
      copy.set(modelMat);
      translucentProps.push({ mesh, modelMat: copy, col, metalOrGlow, emissive, alpha });
      return;
    }
    gl.uniformMatrix4fv(progProp.u.uModel, false, modelMat);
    gl.uniform3f(progProp.u.uColor, col[0], col[1], col[2]);
    gl.uniform3f(progProp.u.uParams, metalOrGlow, emissive ? 1.0 : 0.0, 1.0);
    gl.bindVertexArray(mesh.vao);
    gl.drawElements(gl.TRIANGLES, mesh.count, mesh.indexType, 0);
  };

  drawWorldLandmarks(drawProp, meshes, planet, landmarkDamaged, t);

  // Draw Incoming Doomsday Rogue Asteroids + Trajectory Warning Beams
  for (const ast of rogueAsteroids) {
    if (!ast.alive) continue;
    M4.trs(matTemp, ast.x, ast.y, ast.z, ast.rot, ast.rot * 0.7, 0, 1.55, 1.35, 1.45);
    drawProp(meshes.asteroid, matTemp, [0.42, 0.30, 0.22], 0.25, false, 1.0);
    M4.trs(matTemp, ast.x, ast.y, ast.z, -ast.rot, 0, ast.rot, 1.18, 1.18, 1.18);
    drawProp(meshes.dome, matTemp, [1.0, 0.42, 0.08], 2.1, true, 0.75);
    // Faint orbital warning beam down to target landmark
    buildBeamMatrix(matTemp, ast.x, ast.y, ast.z, ast.tx, ast.ty, ast.tz, 0.09);
    drawProp(meshes.cyl, matTemp, [1.0, 0.45, 0.10], 1.8, true, 0.36);
  }

  // Draw In-Flight Kinetic Meteors
  for (const m of kineticMeteors) {
    const p = clamp(m.t / m.dur, 0, 1);
    const mx = lerp(m.sx, m.tx, p);
    const my = lerp(m.sy, m.ty, p);
    const mz = lerp(m.sz, m.tz, p);
    M4.trs(matTemp, mx, my, mz, t * 8, t * 6, 0, 0.85, 0.85, 0.85);
    drawProp(meshes.asteroid, matTemp, [1.0, 0.62, 0.16], 2.5, true, 1.0);
  }

  // 4. Animated Cloud & Super Typhoon / Thunderstorm Shell
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  gl.depthMask(false);
  gl.enable(gl.CULL_FACE);
  gl.cullFace(gl.BACK);

  gl.useProgram(progCloud.prog);
  gl.uniformMatrix4fv(progCloud.u.uProj, false, matProj);
  gl.uniformMatrix4fv(progCloud.u.uView, false, matView);
  gl.uniform1f(progCloud.u.uRadius, R_CLOUD);
  gl.uniform3f(progCloud.u.uCamPos, eyeX, eyeY, eyeZ);
  gl.uniform3f(progCloud.u.uSunDir, sunDir[0], sunDir[1], sunDir[2]);
  gl.uniform1f(progCloud.u.uTime, t);
  gl.uniform1i(progCloud.u.uWeatherMode, weatherMode);
  gl.bindVertexArray(meshes.sphere.vao);
  gl.drawElements(gl.TRIANGLES, meshes.sphere.count, meshes.sphere.indexType, 0);

  // 5. Rayleigh Blue Atmosphere Halo & Polar Emerald-Gold Aurora Shell (Back-Face Analytic Ray-Sphere)
  gl.disable(gl.DEPTH_TEST);
  gl.cullFace(gl.FRONT);
  gl.useProgram(progAtmo.prog);
  gl.uniformMatrix4fv(progAtmo.u.uProj, false, matProj);
  gl.uniformMatrix4fv(progAtmo.u.uView, false, matView);
  gl.uniform1f(progAtmo.u.uRadius, R_ATMO);
  gl.uniform3f(progAtmo.u.uCamPos, eyeX, eyeY, eyeZ);
  gl.uniform3f(progAtmo.u.uSunDir, sunDir[0], sunDir[1], sunDir[2]);
  gl.uniform1f(progAtmo.u.uTime, t);
  gl.uniform1f(progAtmo.u.uPlanetR, R_EARTH);
  gl.uniform1f(progAtmo.u.uAtmoR, R_ATMO);
  gl.uniform1i(progAtmo.u.uWeatherMode, weatherMode);
  gl.bindVertexArray(meshes.sphere.vao);
  gl.drawElements(gl.TRIANGLES, meshes.sphere.count, meshes.sphere.indexType, 0);

  // 6. Foreground Orbital Reconnaissance Craft, Laser/Genesis Beams & Shockwave Rings
  gl.enable(gl.DEPTH_TEST);
  gl.depthMask(true);
  gl.disable(gl.CULL_FACE);
  gl.disable(gl.BLEND);
  gl.useProgram(progProp.prog);

  if (mode !== 'menu') {
    const right0 = V3.cross(craft.fwd, craft.dir);
    V3.normalize(right0[0], right0[1], right0[2], right0);

    // Apply visual pitch & bank to craft axes
    const pitchedFwd = V3.rotateAroundAxis(craft.fwd, right0, craft.pitchVis);
    const pitchedUp = V3.cross(right0, pitchedFwd);
    const bankedRight = V3.rotateAroundAxis(right0, pitchedFwd, craft.bank);
    const bankedUp = V3.rotateAroundAxis(pitchedUp, pitchedFwd, craft.bank);
    const backAxis = [-pitchedFwd[0], -pitchedFwd[1], -pitchedFwd[2]];

    drawOrbitalCraft(drawProp, meshes, craft.pos, bankedRight, bankedUp, backAxis, craft.boostAmt, t);
  }

  for (const bm of activeBeams) {
    const fade = 1.0 - bm.t / bm.dur;
    buildBeamMatrix(matTemp, bm.x0, bm.y0, bm.z0, bm.x1, bm.y1, bm.z1, bm.width * (0.6 + 0.4 * fade));
    drawProp(meshes.cyl, matTemp, bm.col, 2.5, true, fade * 0.9);
  }

  for (const sr of shockRings) {
    const fade = 1.0 - sr.t / sr.dur;
    M4.basisFromNormal(matTemp, sr.x, sr.y, sr.z, sr.nx, sr.ny, sr.nz, 0, sr.scale, 1.0, sr.scale);
    drawProp(meshes.ring, matTemp, sr.col, 2.4, true, fade * 0.88);
  }

  if (translucentProps.length > 0) {
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
    gl.depthMask(false);
    for (const item of translucentProps) {
      gl.uniformMatrix4fv(progProp.u.uModel, false, item.modelMat);
      gl.uniform3f(progProp.u.uColor, item.col[0], item.col[1], item.col[2]);
      gl.uniform3f(progProp.u.uParams, item.metalOrGlow, item.emissive ? 1.0 : 0.0, item.alpha);
      gl.bindVertexArray(item.mesh.vao);
      gl.drawElements(gl.TRIANGLES, item.mesh.count, item.mesh.indexType, 0);
    }
  }

  // 7. GPU-Instanced Magma Shards, Genesis Spores & Space Explosions
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
      d[o + 5] = p.kind === 1 ? 1.35 : 1.0;
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
  }

  // 8. Fullscreen ACES Post-Process & Supersonic Mach Radial Blur
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
  gl.uniform1f(progPost.u.uBoostAmt, craft.boostAmt);
  gl.uniform1f(progPost.u.uImpactFlash, impactFlash);
  gl.bindVertexArray(postVAO);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
  gl.bindVertexArray(null);

  updateHUDAndWaypoints();
}

// --- HUD Telemetry & 3D Waypoints Projection ---
function updateHUDAndWaypoints() {
  if (mode !== 'sandbox' && mode !== 'defense') return;

  const { lat, lon } = dirToLatLon(craft.dir[0], craft.dir[1], craft.dir[2]);
  const altKm = (craft.alt * 18.0).toFixed(1);
  gpsEl.textContent = `${formatLatLon(lat, lon)} · ALT ${altKm} KM`;

  const mach = (Math.abs(craft.speed) * 0.42).toFixed(1);
  speedValEl.textContent = mach;
  altFillEl.style.width = `${Math.round(clamp((craft.alt / 46.0) * 100, 4, 100))}%`;
  boostFillEl.style.width = `${Math.round(craft.boostMeter)}%`;
  bioValEl.textContent = `${biospherePct}%`;
  scoreValEl.textContent = String(score);
  geoStatsEl.textContent = `陨石坑 ${cratersCount} · 造陆 ${terraformedCount}`;

  if (craft.boostAmt > 0.35) {
    stateValEl.textContent = '超音速破障巡航!';
  } else if (craft.alt < 5.5) {
    stateValEl.textContent = '超低空掠海飞行';
  } else if (mode === 'defense') {
    stateValEl.textContent = '行星防御拦截态';
  } else {
    stateValEl.textContent = '近地轨道巡航';
  }

  // Project 3D Waypoints (clamped inside central viewport clear of top/bottom HUD!)
  const w = appEl.clientWidth || 800;
  const h = appEl.clientHeight || 446;
  let html = '';

  // Priority 1: Incoming Doomsday Rogue Asteroids
  for (const ast of rogueAsteroids) {
    if (!ast.alive) continue;
    const scr = M4.projectToScreen(matVP, ast.x, ast.y, ast.z, w, h);
    if (!scr || scr.x < 40 || scr.x > w - 40 || scr.y < 96 || scr.y > h - 76) continue;
    const rem = Math.max(0, Math.ceil(aTimeLeft(ast)));
    const lm = LANDMARKS[ast.landmarkIdx];
    html += `<div class="me-wp threat" style="left:${scr.x.toFixed(1)}px;top:${scr.y.toFixed(1)}px"><i class="me-wp-diamond"></i><span>末日陨石 → ${lm.short} ${rem}s</span></div>`;
  }

  // Priority 2: Visible World Landmarks on Front Hemisphere
  const camNorm = V3.normalize(camPos[0], camPos[1], camPos[2]);
  for (let i = 0; i < LANDMARKS.length; i++) {
    const lm = LANDMARKS[i];
    if (V3.dot(lm.dir, camNorm) < 0.22) continue;
    const sr = planet.sampleSurfaceRadius(lm.dir[0], lm.dir[1], lm.dir[2]) + 2.8;
    const scr = M4.projectToScreen(matVP, lm.dir[0] * sr, lm.dir[1] * sr, lm.dir[2] * sr, w, h);
    if (!scr || scr.x < 44 || scr.x > w - 44 || scr.y < 96 || scr.y > h - 76) continue;
    const dmg = landmarkDamaged[i];
    const lbl = dmg ? `${lm.short} [待修复]` : lm.short;
    html += `<div class="me-wp${dmg ? ' damaged' : ''}" style="left:${scr.x.toFixed(1)}px;top:${scr.y.toFixed(1)}px"><i class="me-wp-diamond"></i><span>${lbl}</span></div>`;
  }

  waypointsEl.innerHTML = html;
}

function aTimeLeft(ast) {
  return ast.dur - ast.t;
}

// --- Acoustic Oscilloscope in Studio ---
const scopeBuf = new Uint8Array(256);
function renderStudioScope() {
  if (!scopeCtx || !studioEl.classList.contains('open')) return;
  const w = scopeCvs.width;
  const h = scopeCvs.height;
  scopeCtx.fillStyle = '#030710';
  scopeCtx.fillRect(0, 0, w, h);
  if (!audio.analyser) return;
  audio.analyser.getByteTimeDomainData(scopeBuf);
  scopeCtx.strokeStyle = '#38bdf8';
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
    perfEl.textContent = `${currentFps} FPS · ${WEATHER_NAMES[weatherMode]} · ${formatUTCLabel(solarUtcHours)}`;
  }

  updateSimulation(dt);
  updateProjectilesAndEffects(dt);
  renderScene(t);
  renderStudioScope();
}
requestAnimationFrame(frame);

// --- Diagnostic & Automated Verification Hook ---
window.__MIRROREARTH__ = {
  getState() {
    const { lat, lon } = dirToLatLon(craft.dir[0], craft.dir[1], craft.dir[2]);
    return {
      mode,
      fps: currentFps,
      glErr: gl.getError(),
      weatherMode,
      cratersCount,
      intercepted,
      score,
      lat: Number(lat.toFixed(2)),
      lon: Number(lon.toFixed(2)),
      altitude: Number((craft.alt * 18.0).toFixed(1)),
    };
  },
  startSandbox() {
    startSandboxMode();
    return this.getState();
  },
  startDefense() {
    startDefenseMode();
    return this.getState();
  },
  fireMeteorAtFront() {
    const frontDir = V3.normalize(
      craft.dir[0] * R_EARTH + craft.fwd[0] * 6.0,
      craft.dir[1] * R_EARTH + craft.fwd[1] * 6.0,
      craft.dir[2] * R_EARTH + craft.fwd[2] * 6.0
    );
    detonateKineticMeteor(frontDir, 0.09, 2.2, false, -1);
    return this.getState();
  },
  warpLandmark(idx = 0) {
    return warpToLandmark(idx);
  },
};
