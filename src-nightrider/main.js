// Starry Nightrider: Impasto Odyssey — Main WebGL2 Engine, Horse Physics & Constellation Director

import {
  clamp,
  lerp,
  damp,
  wrapAngle,
  surfaceInfo,
  M4,
} from './math.js';
import {
  SKY_VS,
  SKY_FS,
  WORLD_VS,
  WORLD_FS,
  INST_VS,
  INST_FS,
  POST_VS,
  POST_FS,
} from './shaders.js';
import { NocturneAudio } from './audio.js';
import {
  createPrimitives,
  buildProvençalWorld,
  createInstancedBrushSystem,
  drawHorseAndVincent,
} from './world.js';

const $ = (id) => document.getElementById(id);

function compileShader(gl, type, src) {
  const s = gl.createShader(type);
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
    throw new Error(gl.getShaderInfoLog(s) || 'Shader compile error');
  }
  return s;
}

function linkProgram(gl, vsSrc, fsSrc) {
  const p = gl.createProgram();
  gl.attachShader(p, compileShader(gl, gl.VERTEX_SHADER, vsSrc));
  gl.attachShader(p, compileShader(gl, gl.FRAGMENT_SHADER, fsSrc));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
    throw new Error(gl.getProgramInfoLog(p) || 'Program link error');
  }
  return p;
}

function initGame() {
  const appEl = $('nightrider-app');
  const canvas = $('nr-canvas');
  const gl = canvas.getContext('webgl2', {
    antialias: false,
    alpha: false,
    depth: true,
    powerPreference: 'high-performance',
  });

  if (!gl) {
    $('nr-desc').textContent = '当前浏览器环境未开启 WebGL2，请使用现代浏览器打开体验。';
    return;
  }

  // Detect software renderer (SwiftShader / llvmpipe) to auto-tune internal FBO scale
  let isSoftwareGL = false;
  try {
    const dbg = gl.getExtension('WEBGL_debug_renderer_info');
    const rendererStr = dbg
      ? String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL))
      : String(gl.getParameter(gl.RENDERER));
    if (/SwiftShader|llvmpipe|Software/i.test(rendererStr)) isSoftwareGL = true;
  } catch {}

  // Compile all 4 WebGL2 (#version 300 es) programs
  const skyProg = linkProgram(gl, SKY_VS, SKY_FS);
  const worldProg = linkProgram(gl, WORLD_VS, WORLD_FS);
  const instProg = linkProgram(gl, INST_VS, INST_FS);
  const postProg = linkProgram(gl, POST_VS, POST_FS);

  const uSky = {
    uProj: gl.getUniformLocation(skyProg, 'uProj'),
    uView: gl.getUniformLocation(skyProg, 'uView'),
    uCamPos: gl.getUniformLocation(skyProg, 'uCamPos'),
    uTime: gl.getUniformLocation(skyProg, 'uTime'),
    uConstLit: Array.from({ length: 5 }, (_, i) =>
      gl.getUniformLocation(skyProg, `uConstLit[${i}]`)
    ),
  };

  const uWorld = {
    uProj: gl.getUniformLocation(worldProg, 'uProj'),
    uView: gl.getUniformLocation(worldProg, 'uView'),
    uModel: gl.getUniformLocation(worldProg, 'uModel'),
    uMat: gl.getUniformLocation(worldProg, 'uMat'),
    uColor: gl.getUniformLocation(worldProg, 'uColor'),
    uParams: gl.getUniformLocation(worldProg, 'uParams'),
    uCamPos: gl.getUniformLocation(worldProg, 'uCamPos'),
    uLanternPos: gl.getUniformLocation(worldProg, 'uLanternPos'),
    uTime: gl.getUniformLocation(worldProg, 'uTime'),
    uDashGlow: gl.getUniformLocation(worldProg, 'uDashGlow'),
  };

  const uInst = {
    uProj: gl.getUniformLocation(instProg, 'uProj'),
    uView: gl.getUniformLocation(instProg, 'uView'),
    uRiderPos: gl.getUniformLocation(instProg, 'uRiderPos'),
    uTime: gl.getUniformLocation(instProg, 'uTime'),
  };

  const uPost = {
    uTex: gl.getUniformLocation(postProg, 'uTex'),
    uRes: gl.getUniformLocation(postProg, 'uRes'),
    uBrushMode: gl.getUniformLocation(postProg, 'uBrushMode'),
    uTime: gl.getUniformLocation(postProg, 'uTime'),
    uSpeedBlur: gl.getUniformLocation(postProg, 'uSpeedBlur'),
  };

  const emptyVAO = gl.createVertexArray();
  const meshes = createPrimitives(gl);
  const world = buildProvençalWorld(meshes);
  const brushes = createInstancedBrushSystem(gl, 420);
  const audio = new NocturneAudio();

  // Offscreen Scene Framebuffer for Anisotropic Painterly Post-Processing
  let fbo = null;
  let fboTex = null;
  let fboDepth = null;
  let fboW = 0;
  let fboH = 0;

  function ensureFBO(w, h) {
    if (fbo && fboW === w && fboH === h) return;
    if (fboTex) gl.deleteTexture(fboTex);
    if (fboDepth) gl.deleteRenderbuffer(fboDepth);
    if (fbo) gl.deleteFramebuffer(fbo);

    fboW = Math.max(64, w);
    fboH = Math.max(64, h);

    fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);

    fboTex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, fboTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, fboW, fboH, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, fboTex, 0);

    fboDepth = gl.createRenderbuffer();
    gl.bindRenderbuffer(gl.RENDERBUFFER, fboDepth);
    gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT24, fboW, fboH);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, fboDepth);

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  // Game & Rider State
  const BRUSH_NAMES = ['清透原画', '厚涂名画', '狂野梵高'];
  const CAM_PRESETS = [
    { name: '经典追尾', dist: 7.5, height: 2.85, lookY: 2.25 },
    { name: '仰望星穹', dist: 6.1, height: 1.55, lookY: 3.05 },
    { name: '全景画卷', dist: 11.2, height: 4.35, lookY: 2.15 },
  ];

  const state = {
    mode: 'title', // 'title' | 'playing' | 'paused' | 'victory' | 'freeride'
    time: 0,
    runTime: 0,
    fps: 60,
    quality: 'high',
    brushMode: 1, // Default: Impasto Masterpiece!
    camMode: 0,
    score: 0,
    seedsCollected: 0,
    purified: 0,
    litCount: 0,
    combo: 0,
    comboTimer: 0,
  };

  const rider = {
    x: 2,
    y: surfaceInfo(2, 22).y,
    z: 22,
    vy: 0,
    yaw: 0.08,
    speed: 0,
    steer: 0,
    bank: 0,
    pitch: 0,
    grounded: true,
    surf: 'meadow',
    gaitPhase: 0,
    lastBeat: -1,
    energy: 100, // Starlight Paint-Brush Energy [0..100]
    dashT: 0,
    boostT: 0,
    hurtCd: 0,
  };

  const cam = {
    x: 2,
    y: 5,
    z: 30,
    orbitYaw: 0,
    targetOrbit: 0,
    fov: 58,
  };

  // Dynamic Brushstroke Particles (Hoof paint splashes, Starlight Dash comet, Constellation fireworks)
  const particles = [];
  function spawnPaintDaub(x, y, z, vx, vy, vz, col, scale = 0.42, life = 1.0) {
    if (particles.length >= brushes.maxDynamic) particles.shift();
    particles.push({
      x,
      y,
      z,
      vx,
      vy,
      vz,
      r: col[0],
      g: col[1],
      b: col[2],
      scale,
      life,
      maxLife: life,
      rot: Math.random() * 6.28,
    });
  }

  function burstPaint(x, y, z, count = 24, golden = true) {
    const pal = golden
      ? [
          [1.0, 0.86, 0.28],
          [0.98, 0.66, 0.18],
          [0.36, 0.78, 0.98],
        ]
      : [
          [0.32, 0.72, 0.96],
          [0.98, 0.84, 0.32],
          [0.24, 0.62, 0.58],
        ];
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2 + Math.random() * 0.4;
      const sp = 2.5 + Math.random() * 7.5;
      const c = pal[i % pal.length];
      spawnPaintDaub(
        x,
        y,
        z,
        Math.cos(a) * sp,
        2.5 + Math.random() * 6.5,
        Math.sin(a) * sp,
        c,
        0.48 + Math.random() * 0.45,
        0.9 + Math.random() * 0.7
      );
    }
  }

  // Resize handling
  function resize() {
    const rect = appEl.getBoundingClientRect();
    const cssW = Math.max(320, rect.width || window.innerWidth);
    const cssH = Math.max(240, rect.height || window.innerHeight);
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let qScale = state.quality === 'low' ? 0.64 : state.quality === 'med' ? 0.82 : 1.0;
    if (isSoftwareGL) qScale = Math.min(qScale, 0.65);

    const w = Math.max(320, Math.round(cssW * dpr * qScale));
    const h = Math.max(200, Math.round(cssH * dpr * qScale));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    ensureFBO(w, h);
  }
  window.addEventListener('resize', resize);
  if (typeof ResizeObserver !== 'undefined') {
    new ResizeObserver(resize).observe(appEl);
  }
  resize();

  // HUD Banner & Toast Helpers
  let bannerTimer = 0;
  function showBanner(title, sub) {
    $('nr-banner-title').textContent = title;
    $('nr-banner-sub').textContent = sub;
    $('nr-banner').classList.add('show');
    bannerTimer = 3.4;
  }

  function addToast(text) {
    const box = $('nr-toast-feed');
    const el = document.createElement('div');
    el.className = 'nr-toast';
    el.textContent = text;
    box.appendChild(el);
    while (box.children.length > 3) box.removeChild(box.firstChild);
    setTimeout(() => {
      if (el.parentNode) el.parentNode.removeChild(el);
    }, 4200);
  }

  // Waypoint DOM Markers for unlit Constellations & Finale Portal
  const wpNodes = [];
  for (let i = 0; i < 6; i++) {
    const d = document.createElement('div');
    d.className = 'nr-wp';
    $('nr-waypoints').appendChild(d);
    wpNodes.push(d);
  }

  function resetWorldRun() {
    state.runTime = 0;
    state.score = 0;
    state.seedsCollected = 0;
    state.purified = 0;
    state.litCount = 0;
    state.combo = 0;
    state.comboTimer = 0;

    rider.x = 2;
    rider.z = 22;
    rider.y = surfaceInfo(2, 22).y;
    rider.vy = 0;
    rider.yaw = 0.08;
    rider.speed = 6.0; // Start already trotting smoothly into the valley!
    rider.steer = 0;
    rider.bank = 0;
    rider.pitch = 0;
    rider.grounded = true;
    rider.energy = 100;
    rider.dashT = 0;
    rider.boostT = 0;
    rider.hurtCd = 0;

    world.constellations.forEach((c) => {
      c.lit = false;
      c.litAnim = 0;
    });
    world.portal.open = false;
    world.starSeeds.forEach((s) => {
      s.taken = false;
      s.respawn = 0;
    });
    world.whirlwinds.forEach((w) => {
      w.respawn = 0;
    });
    particles.length = 0;
    updateObjectiveHUD();
  }

  function updateObjectiveHUD() {
    const pips = document.querySelectorAll('.nr-star-pip');
    pips.forEach((p, idx) => p.classList.toggle('lit', world.constellations[idx]?.lit));

    if (state.mode === 'freeride') {
      $('nr-stage-tag').textContent = '自由写生';
      $('nr-stage-desc').textContent = '圣雷米星穹已全部点亮 · 尽情策马漫游';
    } else if (state.litCount < 5) {
      $('nr-stage-tag').textContent = '星穹复苏';
      $('nr-stage-desc').textContent = `点亮圣雷米星象画架 [${state.litCount} / 5]`;
    } else {
      $('nr-stage-tag').textContent = '终章开启';
      $('nr-stage-desc').textContent = '前往北方「新月山巅」跃入巨型金色画框！';
    }
  }

  function startRide(restart = false) {
    audio.init();
    if (restart || state.mode === 'title' || state.mode === 'victory') {
      resetWorldRun();
    }
    state.mode = 'playing';
    $('nr-overlay').classList.add('hide');
    $('nr-hud').classList.add('active');
    $('nr-debrief').classList.remove('show');
    try {
      window.focus();
      canvas.focus({ preventScroll: true });
    } catch {}
    if (state.runTime < 0.2) {
      showBanner('星月夜 · 策马入画', '收集金色星芒 · 点亮五座星象圣坛');
      addToast('提示：按 W 加速驰骋，Shift 或左键释放「星流画笔冲刺」撞碎夜魇墨涡！');
    }
  }

  function pauseRide() {
    if (state.mode !== 'playing' && state.mode !== 'freeride') return;
    state.mode = 'paused';
    $('nr-kicker').textContent = 'SAINT-RÉMY, JUNE 1889 // 画卷暂歇';
    $('nr-title').textContent = '夜曲暂歇 · PAUSED';
    $('nr-desc').textContent = '可随时切换油画笔触强度、试听「夜曲琴房」的大提琴与竖琴泛音，或继续策马驰骋。';
    $('nr-btn-start').textContent = '继续驰骋';
    $('nr-btn-restart').style.display = 'inline-flex';
    $('nr-btn-freeride').style.display = 'none';
    $('nr-overlay').classList.remove('hide');
  }

  function completeMasterpiece() {
    state.mode = 'victory';
    audio.playConstellationHarp();
    const mins = Math.floor(state.runTime / 60);
    const secs = (state.runTime % 60).toFixed(1).padStart(4, '0');
    const rank =
      state.score >= 3800 && state.runTime < 150
        ? 'S+'
        : state.score >= 2600
        ? 'S'
        : 'A';

    $('st-time').textContent = `${String(mins).padStart(2, '0')}:${secs}`;
    $('st-seeds').textContent = `${state.seedsCollected}`;
    $('st-purified').textContent = `${state.purified}`;
    $('st-score').textContent = `${state.score}`;
    $('st-rank').textContent = rank;
    $('nr-debrief').classList.add('show');

    $('nr-kicker').textContent = 'MASTERPIECE COMPLETED // 1889 圣雷米馆藏达成';
    $('nr-title').textContent = '星月夜 · 传世完篇';
    $('nr-desc').textContent =
      '五座星宫已在普罗旺斯夜空璀璨连结，金色星流驱散了全部夜魇暗雾。你可以留在画中无尽自由漫游，或重新挑战更高画作评级。';
    $('nr-btn-start').textContent = '再绘一局';
    $('nr-btn-restart').style.display = 'none';
    $('nr-btn-freeride').style.display = 'inline-flex';
    $('nr-overlay').classList.remove('hide');
  }

  function triggerDash() {
    if (rider.dashT > 0.12 || rider.energy < 22) return;
    rider.energy = Math.max(0, rider.energy - 28);
    rider.dashT = 0.85;
    rider.speed = Math.max(rider.speed + 6.5, 20.5);
    audio.playDashBrush();
    burstPaint(rider.x, rider.y + 1.2, rider.z, 12, true);
  }

  function triggerJump() {
    if (!rider.grounded) return;
    rider.vy = 8.4;
    rider.grounded = false;
    audio.playPluck(440, 0.5, 0.1);
    burstPaint(rider.x, rider.y + 0.3, rider.z, 8, false);
  }

  function cycleBrushMode() {
    state.brushMode = (state.brushMode + 1) % 3;
    document.querySelectorAll('.brush-pill').forEach((b) => {
      b.classList.toggle('active', Number(b.dataset.b) === state.brushMode);
    });
    addToast(`油画笔触切换：${BRUSH_NAMES[state.brushMode]}`);
  }

  function cycleCamMode() {
    state.camMode = (state.camMode + 1) % CAM_PRESETS.length;
    addToast(`摄影机位切换：${CAM_PRESETS[state.camMode].name}`);
  }

  // Input Listeners (Seamless Keyboard + Hover/Drag Mouse + Mobile Touch)
  const keys = {};
  const pointer = { dragging: false, lastX: null, normX: 0.5, inside: false };
  const touch = { active: false, moveId: null, mx: 0, my: 0 };

  window.addEventListener('keydown', (e) => {
    keys[e.code] = true;
    if (e.code === 'KeyP' || (e.code === 'Escape' && (state.mode === 'playing' || state.mode === 'freeride'))) {
      pauseRide();
      return;
    }
    if (state.mode !== 'playing' && state.mode !== 'freeride') return;
    if (e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault();
    if (e.code === 'Space') triggerJump();
    else if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') triggerDash();
    else if (e.code === 'KeyB') cycleBrushMode();
    else if (e.code === 'KeyC') cycleCamMode();
  });

  window.addEventListener('keyup', (e) => {
    keys[e.code] = false;
  });

  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  canvas.addEventListener('mouseenter', () => { pointer.inside = true; });
  canvas.addEventListener('mouseleave', () => {
    pointer.inside = false;
    pointer.dragging = false;
    pointer.lastX = null;
    cam.targetOrbit = 0;
  });
  canvas.addEventListener('mousedown', (e) => {
    if (state.mode !== 'playing' && state.mode !== 'freeride') return;
    audio.init();
    try {
      window.focus();
      canvas.focus({ preventScroll: true });
    } catch {}
    if (e.button === 0) {
      pointer.dragging = true;
      pointer.lastX = e.clientX;
      triggerDash();
    } else if (e.button === 2) {
      triggerJump();
    }
  });
  window.addEventListener('mouseup', () => {
    pointer.dragging = false;
  });
  window.addEventListener('mousemove', (e) => {
    if (state.mode !== 'playing' && state.mode !== 'freeride') return;
    const rect = canvas.getBoundingClientRect();
    pointer.normX = clamp((e.clientX - rect.left) / Math.max(1, rect.width), 0, 1);
    if (pointer.dragging && pointer.lastX !== null) {
      const dx = e.clientX - pointer.lastX;
      cam.targetOrbit = clamp(cam.targetOrbit - dx * 0.006, -1.6, 1.6);
    } else {
      // Gentle panoramic look-offset following cursor horizontally
      cam.targetOrbit = (0.5 - pointer.normX) * 0.55;
    }
    pointer.lastX = e.clientX;
  });

  // UI Button Wiring
  $('nr-btn-start').addEventListener('click', () => {
    startRide(state.mode === 'victory');
  });
  $('nr-btn-restart').addEventListener('click', () => startRide(true));
  $('nr-btn-freeride').addEventListener('click', () => {
    state.mode = 'freeride';
    $('nr-overlay').classList.add('hide');
    $('nr-hud').classList.add('active');
    updateObjectiveHUD();
    showBanner('无尽写生漫游', '圣雷米夜空已永恒闪耀 · 自由驰骋');
  });

  if ($('btn-pause')) $('btn-pause').addEventListener('click', pauseRide);
  if ($('btn-brush')) $('btn-brush').addEventListener('click', cycleBrushMode);
  if ($('btn-cam')) $('btn-cam').addEventListener('click', cycleCamMode);

  if ($('btn-tall')) {
    const syncTall = () => {
      const tall = appEl.classList.contains('tall');
      $('btn-tall').textContent = tall ? '收起' : '大屏';
      if ($('menu-btn-tall')) $('menu-btn-tall').textContent = tall ? '恢复紧凑高度' : '展开大屏视野';
      resize();
      setTimeout(resize, 220);
    };
    $('btn-tall').addEventListener('click', () => {
      appEl.classList.toggle('tall');
      syncTall();
    });
    if ($('menu-btn-tall')) {
      $('menu-btn-tall').addEventListener('click', () => {
        appEl.classList.toggle('tall');
        syncTall();
      });
    }
  }

  if ($('btn-fs')) {
    $('btn-fs').addEventListener('click', () => {
      if (!document.fullscreenElement) {
        (appEl.requestFullscreen || appEl.webkitRequestFullscreen)?.call(appEl)?.catch?.(() => {});
      } else {
        document.exitFullscreen?.().catch?.(() => {});
      }
    });
  }

  // Acoustic Nocturne Studio Bench
  $('nr-btn-studio').addEventListener('click', () => {
    audio.init();
    $('nr-studio').classList.toggle('open');
  });
  document.querySelectorAll('.studio-trigger').forEach((b) => {
    b.addEventListener('click', () => {
      audio.init();
      const s = b.dataset.s;
      if (s === 'guitar') audio.playPluck(293.66, 1.3, 0.18);
      else if (s === 'cello') audio.playCello(146.83, 2.2, 0.16);
      else if (s === 'harp') audio.playConstellationHarp();
      else if (s === 'chime') audio.playStarChime(Math.floor(Math.random() * 8));
      else if (s === 'dash') audio.playDashBrush();
      else if (s === 'hoof-bridge') audio.playHoof('bridge', 0.9, 0);
      else if (s === 'hoof-water') audio.playHoof('water', 0.9, 0);
    });
  });

  document.querySelectorAll('.brush-pill').forEach((b) => {
    b.addEventListener('click', () => {
      state.brushMode = Number(b.dataset.b);
      document.querySelectorAll('.brush-pill').forEach((x) => x.classList.toggle('active', x === b));
    });
  });

  document.querySelectorAll('.nr-q-pill').forEach((b) => {
    b.addEventListener('click', () => {
      state.quality = b.dataset.q;
      document.querySelectorAll('.nr-q-pill').forEach((x) => x.classList.toggle('active', x === b));
      resize();
    });
  });

  $('nr-vol').addEventListener('input', (e) => {
    audio.init();
    audio.setVolume(parseFloat(e.target.value) / 100);
  });

  // Mobile Touch Controls
  if ('ontouchstart' in window || navigator.maxTouchPoints > 0) {
    touch.active = true;
    $('nr-touch').classList.add('show');
  }
  const tZone = $('nr-t-pad'), tStick = $('nr-t-knob');
  tZone.addEventListener('touchstart', (e) => {
    e.preventDefault();
    audio.init();
    touch.moveId = e.changedTouches[0].identifier;
  }, { passive: false });
  tZone.addEventListener('touchmove', (e) => {
    e.preventDefault();
    for (const t of e.changedTouches) {
      if (t.identifier === touch.moveId) {
        const r = tZone.getBoundingClientRect();
        const maxR = r.width * 0.4;
        let dx = t.clientX - (r.left + r.width * 0.5);
        let dy = t.clientY - (r.top + r.height * 0.5);
        const d = Math.hypot(dx, dy);
        if (d > maxR) { dx = (dx / d) * maxR; dy = (dy / d) * maxR; }
        tStick.style.transform = `translate(${dx}px, ${dy}px)`;
        touch.mx = dx / maxR;
        touch.my = dy / maxR;
      }
    }
  }, { passive: false });
  const endTouch = (e) => {
    for (const t of e.changedTouches) {
      if (t.identifier === touch.moveId) {
        touch.moveId = null;
        touch.mx = 0;
        touch.my = 0;
        tStick.style.transform = '';
      }
    }
  };
  tZone.addEventListener('touchend', endTouch);
  tZone.addEventListener('touchcancel', endTouch);
  $('nr-tb-dash').addEventListener('touchstart', (e) => { e.preventDefault(); triggerDash(); });
  $('nr-tb-jump').addEventListener('touchstart', (e) => { e.preventDefault(); triggerJump(); });

  // Matrix scratchpads & Oscilloscope
  const mProj = M4.create();
  const mView = M4.create();
  const mVP = M4.create();
  const mTmp = M4.create();
  const mLocal = M4.create();
  const mBlade = M4.create();

  const scopeCanvas = $('nr-scope');
  const scopeCtx = scopeCanvas ? scopeCanvas.getContext('2d') : null;
  const scopeData = new Uint8Array(512);

  function drawWorldMesh(mesh, modelMat, mat, color, p0 = 0.4, p1 = 2.2, p2 = 1.0) {
    gl.uniformMatrix4fv(uWorld.uModel, false, modelMat);
    gl.uniform1i(uWorld.uMat, mat);
    gl.uniform3fv(uWorld.uColor, color);
    gl.uniform3f(uWorld.uParams, p0, p1, p2);
    gl.bindVertexArray(mesh.vao);
    gl.drawElements(gl.TRIANGLES, mesh.count, mesh.indexType, 0);
  }

  let prevNow = performance.now();
  let fpsAcc = 0;
  let fpsFrames = 0;

  function tick(now) {
    requestAnimationFrame(tick);
    const rawDt = (now - prevNow) * 0.001;
    prevNow = now;
    const dt = Math.min(rawDt, 0.05);
    state.time += dt;

    fpsAcc += rawDt;
    fpsFrames++;
    if (fpsAcc >= 0.5) {
      state.fps = Math.round(fpsFrames / fpsAcc);
      fpsAcc = 0;
      fpsFrames = 0;
      $('nr-perf').textContent = `${state.fps} FPS · ${BRUSH_NAMES[state.brushMode]}`;
    }

    // Studio Oscilloscope
    if (scopeCtx && $('nr-studio').classList.contains('open') && audio.analyser) {
      audio.analyser.getByteTimeDomainData(scopeData);
      scopeCtx.fillStyle = '#071126';
      scopeCtx.fillRect(0, 0, 560, 64);
      scopeCtx.strokeStyle = '#f4c534';
      scopeCtx.lineWidth = 2;
      scopeCtx.beginPath();
      for (let i = 0; i < scopeData.length; i++) {
        const x = (i / scopeData.length) * 560;
        const y = (scopeData[i] / 255) * 64;
        if (i === 0) scopeCtx.moveTo(x, y);
        else scopeCtx.lineTo(x, y);
      }
      scopeCtx.stroke();
    }

    const activePlay = state.mode === 'playing' || state.mode === 'freeride';

    if (activePlay) {
      if (state.mode === 'playing') state.runTime += dt;

      // 1. Horse Steering & Gallop Velocity Physics
      const accelIn =
        (keys['KeyW'] || keys['ArrowUp'] ? 1 : 0) -
        (keys['KeyS'] || keys['ArrowDown'] ? 1 : 0) -
        touch.my;
      const steerIn =
        (keys['KeyA'] || keys['ArrowLeft'] ? 1 : 0) -
        (keys['KeyD'] || keys['ArrowRight'] ? 1 : 0) -
        touch.mx;

      rider.dashT = Math.max(0, rider.dashT - dt);
      rider.boostT = Math.max(0, rider.boostT - dt);
      rider.hurtCd = Math.max(0, rider.hurtCd - dt);
      rider.energy = Math.min(100, rider.energy + 9.5 * dt);

      const topSpeed =
        rider.dashT > 0 ? 23.5 : rider.boostT > 0 ? 21.0 : rider.surf === 'water' ? 11.2 : 16.5;

      if (accelIn > 0.05) {
        rider.speed = damp(rider.speed, topSpeed * Math.min(1, accelIn), 3.6, dt);
      } else if (accelIn < -0.05) {
        rider.speed = damp(rider.speed, -4.5, 4.5, dt);
      } else {
        // Gentle cruise decay
        const minDash = rider.dashT > 0 ? 19.5 : 0;
        rider.speed = Math.max(minDash, damp(rider.speed, 0, 1.65, dt));
      }

      rider.steer = damp(rider.steer, clamp(steerIn, -1, 1), 8.5, dt);
      const turnAgility = lerp(2.25, 1.48, clamp(Math.abs(rider.speed) / 22, 0, 1));
      rider.yaw = wrapAngle(rider.yaw + rider.steer * turnAgility * dt);
      rider.bank = damp(rider.bank, rider.steer * clamp(rider.speed / 15, 0.15, 1) * 0.22, 8.0, dt);

      const fwdX = -Math.sin(rider.yaw);
      const fwdZ = -Math.cos(rider.yaw);
      rider.x += fwdX * rider.speed * dt;
      rider.z += fwdZ * rider.speed * dt;

      // Soft Valley Perimeter Boundary (Keep inside Les Alpilles basin r <= 96m)
      const radFromCenter = Math.hypot(rider.x, rider.z + 6);
      if (radFromCenter > 95) {
        const pushBack = (radFromCenter - 95) * 0.65;
        rider.x -= (rider.x / radFromCenter) * pushBack;
        rider.z -= ((rider.z + 6) / radFromCenter) * pushBack;
      }

      // Smooth Obstacle Slide Collision (Cottages, Church, Windmills, Cypress Trunks)
      for (let i = 0; i < world.obstacles.length; i++) {
        const ob = world.obstacles[i];
        const dx = rider.x - ob.x;
        const dz = rider.z - ob.z;
        const minR = ob.r + 0.95;
        const d = Math.hypot(dx, dz);
        if (d < minR && d > 0.001) {
          rider.x = ob.x + (dx / d) * minR;
          rider.z = ob.z + (dz / d) * minR;
        }
      }

      // Vertical Ground & Jump Physics + Terrain Pitch Alignment
      rider.vy -= 21.0 * dt;
      rider.y += rider.vy * dt;
      const surfHere = surfaceInfo(rider.x, rider.z);
      const surfAhead = surfaceInfo(rider.x + fwdX * 1.2, rider.z + fwdZ * 1.2);
      rider.surf = surfHere.surf;

      if (rider.y <= surfHere.y + 0.02 && rider.vy <= 0) {
        rider.y = surfHere.y;
        rider.vy = 0;
        rider.grounded = true;
      } else {
        rider.grounded = false;
      }

      const targetPitch = rider.grounded
        ? clamp(Math.atan2(surfAhead.y - surfHere.y, 1.2), -0.45, 0.45)
        : clamp(rider.vy * 0.035, -0.38, 0.42);
      rider.pitch = damp(rider.pitch, targetPitch, 9.0, dt);

      // Equine Gait Cycle, Hoofbeats & Paint-Splash Trail
      const spdAbs = Math.abs(rider.speed);
      if (spdAbs > 0.4) {
        rider.gaitPhase += dt * (3.2 + spdAbs * 0.68);
        if (rider.grounded) {
          const beat = Math.floor((rider.gaitPhase / (Math.PI * 2)) * 4) % 4;
          if (beat !== rider.lastBeat) {
            rider.lastBeat = beat;
            audio.playHoof(rider.surf, clamp(spdAbs / 18, 0, 1), beat);
            if (spdAbs > 8.5 || rider.dashT > 0 || rider.surf === 'water') {
              const col =
                rider.dashT > 0
                  ? [1.0, 0.86, 0.30]
                  : rider.surf === 'water'
                  ? [0.42, 0.80, 0.98]
                  : [0.95, 0.74, 0.24];
              spawnPaintDaub(
                rider.x - fwdX * 0.6 + (Math.random() - 0.5) * 0.5,
                rider.y + 0.25,
                rider.z - fwdZ * 0.6 + (Math.random() - 0.5) * 0.5,
                -fwdX * 1.8 + (Math.random() - 0.5) * 1.6,
                1.4 + Math.random() * 1.8,
                -fwdZ * 1.8 + (Math.random() - 0.5) * 1.6,
                col,
                rider.dashT > 0 ? 0.52 : 0.32,
                0.65
              );
            }
          }
        }
      }

      // Combo decay
      if (state.comboTimer > 0) {
        state.comboTimer -= dt;
        if (state.comboTimer <= 0) state.combo = 0;
      }

      // 2. Collect Swirling Golden Star-Seeds
      for (let i = 0; i < world.starSeeds.length; i++) {
        const s = world.starSeeds[i];
        if (s.taken) {
          s.respawn -= dt;
          if (s.respawn <= 0) s.taken = false;
          continue;
        }
        const d = Math.hypot(s.x - rider.x, s.z - rider.z);
        if (d < 2.45 && Math.abs(s.y - (rider.y + 1.2)) < 2.6) {
          s.taken = true;
          s.respawn = 28.0;
          state.seedsCollected++;
          state.combo++;
          state.comboTimer = 5.5;
          state.score += 50 + Math.min(state.combo, 10) * 10;
          rider.energy = Math.min(100, rider.energy + 18);
          audio.playStarChime(state.combo - 1);
          burstPaint(s.x, s.y, s.z, 8, true);
        }
      }

      // 3. Golden Sky-Hoops (Speed Boost + Masterpiece Bonus!)
      for (let i = 0; i < world.skyHoops.length; i++) {
        const h = world.skyHoops[i];
        h.cd = Math.max(0, h.cd - dt);
        if (h.cd <= 0) {
          const d = Math.hypot(h.x - rider.x, h.z - rider.z);
          if (d < 2.85 && Math.abs(h.y - (rider.y + 1.5)) < 2.8) {
            h.cd = 6.0;
            rider.boostT = 2.6;
            rider.speed = Math.max(rider.speed + 5.5, 21.0);
            rider.energy = Math.min(100, rider.energy + 35);
            state.combo += 2;
            state.comboTimer = 6.0;
            state.score += 300;
            audio.playHoopBoost();
            burstPaint(h.x, h.y, h.z, 20, true);
            addToast('跃穿星环 · 极速星流 +300');
          }
        }
      }

      // 4. Ignite Dormant Constellation Altars!
      for (let i = 0; i < world.constellations.length; i++) {
        const c = world.constellations[i];
        if (c.lit) {
          c.litAnim = Math.min(1, c.litAnim + dt * 0.9);
          continue;
        }
        const d = Math.hypot(c.x - rider.x, c.z - rider.z);
        if (d < 4.2) {
          c.lit = true;
          c.litAnim = 0.05;
          state.litCount++;
          state.score += 500;
          rider.energy = 100;
          audio.playConstellationHarp();
          burstPaint(c.x, c.y + 2.2, c.z, 36, true);
          updateObjectiveHUD();

          if (state.litCount < 5) {
            showBanner(`点亮 · ${c.name}`, `圣雷米星宫已复苏 [${state.litCount} / 5]`);
            addToast(`星象复苏：${c.name} (+500)`);
          } else {
            world.portal.open = true;
            showBanner('五曜连珠 · 画框之门开启', '策马登顶北方「新月山巅」完成传世画作！');
            addToast('终章开启：前往北方新月山巅跃入金色巨型画框！');
          }
        }
      }

      // 5. Roaming Nocturne Ink-Whirlwinds (Dash through to paint over them!)
      for (let i = 0; i < world.whirlwinds.length; i++) {
        const w = world.whirlwinds[i];
        if (w.respawn > 0) {
          w.respawn -= dt;
          continue;
        }
        w.ang += w.spd * dt;
        w.x = w.cx + Math.cos(w.ang) * w.orbitR;
        w.z = w.cz + Math.sin(w.ang) * w.orbitR;
        w.y = surfaceInfo(w.x, w.z).y;

        const d = Math.hypot(w.x - rider.x, w.z - rider.z);
        if (d < 2.65) {
          if (rider.dashT > 0 || rider.boostT > 0) {
            // Paint over & purify the Ink-Whirlwind!
            w.respawn = 18.0;
            state.purified++;
            state.combo += 2;
            state.comboTimer = 6.0;
            state.score += 250;
            rider.energy = Math.min(100, rider.energy + 30);
            audio.playPurifyGloom();
            burstPaint(w.x, w.y + 1.8, w.z, 28, true);
            addToast('星流挥毫 · 净除夜魇墨涡 +250');
          } else if (rider.hurtCd <= 0) {
            rider.hurtCd = 1.4;
            rider.speed *= 0.35;
            state.combo = 0;
            rider.energy = Math.max(0, rider.energy - 18);
            audio.playGloomBump();
            addToast('触碰夜魇墨涡！按 Shift / 左键星流冲刺可将其绘成金星');
          }
        }
      }

      // 6. Grand Moonrise Canvas Portal Finale Check
      if (world.portal.open && state.mode === 'playing') {
        const dp = Math.hypot(world.portal.x - rider.x, world.portal.z - rider.z);
        if (dp < 4.1) {
          state.score += 1000;
          completeMasterpiece();
        }
      }

      // Update Camera Chase Spring
      cam.orbitYaw = damp(cam.orbitYaw, cam.targetOrbit, 6.0, dt);
      const preset = CAM_PRESETS[state.camMode];
      const viewYaw = rider.yaw + cam.orbitYaw;
      const targetCamX = rider.x + Math.sin(viewYaw) * preset.dist;
      const targetCamZ = rider.z + Math.cos(viewYaw) * preset.dist;
      const groundAtCam = surfaceInfo(targetCamX, targetCamZ).y;
      const targetCamY = Math.max(groundAtCam + 1.05, rider.y + preset.height);

      cam.x = damp(cam.x, targetCamX, 10.0, dt);
      cam.y = damp(cam.y, targetCamY, 9.0, dt);
      cam.z = damp(cam.z, targetCamZ, 10.0, dt);

      const targetFov = rider.dashT > 0 ? 68 : rider.boostT > 0 ? 65 : 58 + clamp(spdAbs / 18, 0, 1) * 5;
      cam.fov = damp(cam.fov, targetFov, 7.0, dt);

      M4.lookAt(
        mView,
        cam.x,
        cam.y,
        cam.z,
        rider.x + fwdX * 3.2,
        rider.y + preset.lookY,
        rider.z + fwdZ * 3.2,
        0,
        1,
        0
      );

      // Update HUD Readouts
      $('nr-score-val').textContent = `${state.score}`;
      $('nr-combo-val').textContent = state.combo > 1 ? `连击 ×${state.combo}` : '星彩写生';
      $('nr-speed-val').textContent = `${Math.round(spdAbs * 3.2)}`;
      $('nr-energy-fill').style.width = `${Math.round(rider.energy)}%`;

      // Compass Readout
      const deg = ((Math.round((-rider.yaw * 180) / Math.PI) % 360) + 360) % 360;
      const dirs = ['北 N', '东北', '东 E', '东南', '南 S', '西南', '西 W', '西北'];
      $('nr-compass').textContent = `${dirs[Math.round(deg / 45) % 8]} · ${String(deg).padStart(3, '0')}°`;
    } else {
      // Sweeping Cinematic Title / Victory Camera overlooking Horse, Church Spire & Swirling Sky!
      const orbitA = state.time * 0.14;
      cam.x = Math.sin(orbitA) * 32 - 6;
      cam.z = Math.cos(orbitA) * 32 - 12;
      cam.y = Math.max(surfaceInfo(cam.x, cam.z).y + 4.5, 9.5 + Math.sin(state.time * 0.3) * 1.5);
      cam.fov = 58;
      M4.lookAt(mView, cam.x, cam.y, cam.z, -10, 7.5, -34, 0, 1, 0);
    }

    if (bannerTimer > 0) {
      bannerTimer -= dt;
      if (bannerTimer <= 0) $('nr-banner').classList.remove('show');
    }

    // Update Generative Acoustic Nocturne Music
    audio.update(dt, clamp(Math.abs(rider.speed) / 18, 0, 1), state.litCount, activePlay);

    // Update Dynamic Paint Daub Particles
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.life -= dt;
      if (p.life <= 0) {
        particles.splice(i, 1);
        continue;
      }
      p.vy -= 5.2 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
    }

    // ═══════════════════════ RENDER PASSES ═══════════════════════
    const aspect = fboW / Math.max(1, fboH);
    M4.perspective(mProj, (cam.fov * Math.PI) / 180, aspect, 0.35, 750.0);
    M4.mul(mVP, mProj, mView);

    // Project 3D Waypoints onto HUD when playing
    if (activePlay) {
      const rect = appEl.getBoundingClientRect();
      world.constellations.forEach((c, idx) => {
        const el = wpNodes[idx];
        if (c.lit) {
          el.style.display = 'none';
          return;
        }
        const sp = M4.projectToScreen(mVP, c.x, c.y + 4.2, c.z, rect.width, rect.height);
        if (!sp || sp.x < 16 || sp.x > rect.width - 16 || sp.y < 16 || sp.y > rect.height - 16) {
          el.style.display = 'none';
        } else {
          const distM = Math.round(Math.hypot(c.x - rider.x, c.z - rider.z));
          el.style.display = 'flex';
          el.style.transform = `translate(${sp.x}px, ${sp.y}px) translate(-50%, -50%)`;
          el.innerHTML = `<i class="wp-diamond"></i><span>${c.name.split(' · ')[0]} · ${distM}m</span>`;
        }
      });
      const portalEl = wpNodes[5];
      if (world.portal.open && state.mode === 'playing') {
        const sp = M4.projectToScreen(
          mVP,
          world.portal.x,
          world.portal.y + 6.0,
          world.portal.z,
          rect.width,
          rect.height
        );
        if (sp && sp.x > 16 && sp.x < rect.width - 16 && sp.y > 16 && sp.y < rect.height - 16) {
          const distM = Math.round(Math.hypot(world.portal.x - rider.x, world.portal.z - rider.z));
          portalEl.style.display = 'flex';
          portalEl.style.transform = `translate(${sp.x}px, ${sp.y}px) translate(-50%, -50%)`;
          portalEl.innerHTML = `<i class="wp-diamond gold"></i><span>新月山巅画框 · ${distM}m</span>`;
        } else {
          portalEl.style.display = 'none';
        }
      } else {
        portalEl.style.display = 'none';
      }
    }

    // Bind Scene FBO
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.viewport(0, 0, fboW, fboH);
    gl.enable(gl.DEPTH_TEST);
    gl.depthMask(true);
    gl.disable(gl.BLEND);
    gl.clearColor(0.05, 0.11, 0.25, 1.0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    // PASS 1: Living Van Gogh Starry Night Sky Dome
    gl.useProgram(skyProg);
    gl.depthMask(false);
    gl.uniformMatrix4fv(uSky.uProj, false, mProj);
    gl.uniformMatrix4fv(uSky.uView, false, mView);
    gl.uniform3f(uSky.uCamPos, cam.x, cam.y, cam.z);
    gl.uniform1f(uSky.uTime, state.time);
    for (let i = 0; i < 5; i++) {
      gl.uniform1f(uSky.uConstLit[i], world.constellations[i].litAnim);
    }
    gl.bindVertexArray(meshes.sphere.vao);
    gl.drawElements(gl.TRIANGLES, meshes.sphere.count, meshes.sphere.indexType, 0);
    gl.depthMask(true);

    // PASS 2: 3D Impasto Terrain, River, Village, Cypresses, Windmills & Vincent on Horseback
    gl.useProgram(worldProg);
    gl.uniformMatrix4fv(uWorld.uProj, false, mProj);
    gl.uniformMatrix4fv(uWorld.uView, false, mView);
    gl.uniform3f(uWorld.uCamPos, cam.x, cam.y, cam.z);
    const lanX = rider.x - Math.sin(rider.yaw - 0.5) * 0.65;
    const lanZ = rider.z - Math.cos(rider.yaw - 0.5) * 0.65;
    gl.uniform3f(uWorld.uLanternPos, lanX, rider.y + 1.9, lanZ);
    gl.uniform1f(uWorld.uTime, state.time);
    gl.uniform1f(uWorld.uDashGlow, rider.dashT > 0 ? 1.0 : rider.boostT > 0 ? 0.6 : 0.0);

    // Terrain & Starlight River
    M4.trs(mTmp, 0, 0, 0, 0, 0, 0, 1, 1, 1);
    drawWorldMesh(meshes.terrain, mTmp, 1, [1, 1, 1], 0.55, 1.8, 1);
    drawWorldMesh(meshes.river, mTmp, 2, [1, 1, 1], 0.25, 1.0, 1);

    // Static Provençal Buildings, Church Spire, Bridges & Cypresses
    for (let i = 0; i < world.draws.length; i++) {
      const d = world.draws[i];
      drawWorldMesh(d.mesh, d.m, d.mat, d.color, d.params[0], d.params[1], d.params[2]);
    }

    // Rotating Windmill Sails
    world.windmills.forEach((wm, idx) => {
      const hubX = wm.x + Math.sin(wm.yaw) * 2.25;
      const hubZ = wm.z + Math.cos(wm.yaw) * 2.25;
      const spin = state.time * 0.95 + idx * 1.2;
      M4.trs(mTmp, hubX, wm.y, hubZ, 0, wm.yaw, spin, 1, 1, 1);
      M4.trs(mLocal, 0, 0, 0, 0, 0, 0, 0.28, 7.6, 0.14);
      drawWorldMesh(meshes.box, M4.mul(mBlade, mTmp, mLocal), 4, [0.84, 0.72, 0.42], 0.45, 2.0);
      M4.trs(mLocal, 0, 0, 0, 0, 0, 0, 7.6, 0.28, 0.14);
      drawWorldMesh(meshes.box, M4.mul(mBlade, mTmp, mLocal), 4, [0.84, 0.72, 0.42], 0.45, 2.0);
    });

    // Golden Star-Seeds
    for (let i = 0; i < world.starSeeds.length; i++) {
      const s = world.starSeeds[i];
      if (s.taken) continue;
      const bobY = s.y + Math.sin(state.time * 3.4 + s.phase) * 0.24;
      M4.trs(mTmp, s.x, bobY, s.z, 0.4, state.time * 2.2 + s.phase, 0.4, 0.62, 0.62, 0.62);
      drawWorldMesh(meshes.sphere, mTmp, 6, [1.0, 0.86, 0.28], 1.95, 1, 1);
    }

    // Golden Sky-Hoops
    for (let i = 0; i < world.skyHoops.length; i++) {
      const h = world.skyHoops[i];
      M4.trs(mTmp, h.x, h.y, h.z, 0, h.yaw, state.time * 0.8, 4.2, 4.2, 4.2);
      const col = h.cd > 0 ? [0.42, 0.72, 0.95] : [1.0, 0.82, 0.24];
      drawWorldMesh(meshes.torus, mTmp, 6, col, 1.85, 1, 1);
    }

    // Constellation Easel Halos
    for (let i = 0; i < world.constellations.length; i++) {
      const c = world.constellations[i];
      const ringCol = c.lit ? [1.0, 0.86, 0.30] : [0.38, 0.72, 0.98];
      M4.trs(mTmp, c.x, c.y + 2.35, c.z, 0, state.time * (c.lit ? 1.8 : 0.7), 0, 3.1, 3.1, 3.1);
      drawWorldMesh(meshes.torus, mTmp, 6, ringCol, c.lit ? 2.2 : 1.5, 1, 1);
      M4.trs(mTmp, c.x, c.y + 2.35, c.z, 0.5, -state.time * 1.2, 0.5, 0.75, 0.75, 0.75);
      drawWorldMesh(meshes.sphere, mTmp, 6, ringCol, 2.2, 1, 1);
    }

    // Roaming Nocturne Ink-Whirlwinds (Stacked counter-rotating charcoal-Prussian ink rings)
    for (let i = 0; i < world.whirlwinds.length; i++) {
      const w = world.whirlwinds[i];
      if (w.respawn > 0) continue;
      for (let k = 0; k < 4; k++) {
        const sc = 1.2 + k * 0.72;
        const wob = Math.sin(state.time * 5 + k) * 0.22;
        M4.trs(
          mTmp,
          w.x + wob,
          w.y + 0.65 + k * 0.92,
          w.z - wob,
          Math.PI * 0.5 + wob * 0.2,
          state.time * (4.5 - k * 0.7),
          0,
          sc,
          sc,
          sc * 1.2
        );
        drawWorldMesh(meshes.torus, mTmp, 4, [0.05, 0.11, 0.20], 0.7, 2.0, 1);
      }
    }

    // Articulated Galloping Horse & Vincent van Gogh
    drawHorseAndVincent(drawWorldMesh, meshes, rider, state.time);

    // PASS 3: GPU-Instanced Golden Wheatfields, Sky Swirl Daubs & Paint Particles + Additive Beams
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.depthMask(false);

    // Copy active dynamic particles into tail of instance buffer
    const dynCount = Math.min(particles.length, brushes.maxDynamic);
    let offset = brushes.staticCount * 12;
    for (let i = 0; i < dynCount; i++) {
      const p = particles[i];
      const alpha = clamp(p.life / p.maxLife, 0, 1);
      brushes.instanceData[offset] = p.x;
      brushes.instanceData[offset + 1] = p.y;
      brushes.instanceData[offset + 2] = p.z;
      brushes.instanceData[offset + 3] = p.scale * (0.5 + 0.5 * alpha);
      brushes.instanceData[offset + 4] = p.rot;
      brushes.instanceData[offset + 5] = 0;
      brushes.instanceData[offset + 6] = 0;
      brushes.instanceData[offset + 7] = 2.0; // billboard paint daub
      brushes.instanceData[offset + 8] = p.r;
      brushes.instanceData[offset + 9] = p.g;
      brushes.instanceData[offset + 10] = p.b;
      brushes.instanceData[offset + 11] = alpha * 0.95;
      offset += 12;
    }

    gl.useProgram(instProg);
    gl.uniformMatrix4fv(uInst.uProj, false, mProj);
    gl.uniformMatrix4fv(uInst.uView, false, mView);
    gl.uniform3f(uInst.uRiderPos, rider.x, rider.y, rider.z);
    gl.uniform1f(uInst.uTime, state.time);

    gl.bindVertexArray(brushes.vao);
    if (dynCount > 0) {
      gl.bindBuffer(gl.ARRAY_BUFFER, brushes.instVBO);
      gl.bufferSubData(
        gl.ARRAY_BUFFER,
        brushes.staticCount * 12 * 4,
        brushes.instanceData.subarray(brushes.staticCount * 12, (brushes.staticCount + dynCount) * 12)
      );
    }
    gl.drawElementsInstanced(
      gl.TRIANGLES,
      brushes.indexCount,
      gl.UNSIGNED_SHORT,
      0,
      brushes.staticCount + dynCount
    );

    // Additive Translucent Skyward Constellation Beams & Grand Moonrise Canvas Portal!
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
    gl.useProgram(worldProg);
    for (let i = 0; i < world.constellations.length; i++) {
      const c = world.constellations[i];
      const dCam = Math.hypot(c.x - cam.x, c.z - cam.z);
      const nearFade = clamp((dCam - 3.5) / 8.5, 0.08, 1.0);
      const bCol = c.lit ? [1.0, 0.85, 0.32] : [0.25, 0.62, 0.96];
      const bAlpha = (c.lit ? 0.16 : 0.09) * nearFade;
      const bRad = c.lit ? 0.42 : 0.28;
      M4.trs(mTmp, c.x, c.y + 42, c.z, 0, state.time * 0.5, 0, bRad, 84, bRad);
      drawWorldMesh(meshes.cyl, mTmp, 6, bCol, 1.4, 1, bAlpha);
    }

    // Moonrise Summit Canvas Frame Inner Shimmer
    {
      const pOpen = world.portal.open;
      const pCol = pOpen ? [1.0, 0.86, 0.32] : [0.22, 0.52, 0.88];
      M4.trs(mTmp, world.portal.x, world.portal.y + 4.2, world.portal.z, 0, 0, 0, 5.7, 6.2, 0.18);
      drawWorldMesh(meshes.box, mTmp, 6, pCol, pOpen ? 2.1 : 0.9, 1, pOpen ? 0.52 : 0.16);
      if (pOpen) {
        M4.trs(mTmp, world.portal.x, world.portal.y + 48, world.portal.z, 0, state.time, 0, 2.2, 96, 2.2);
        drawWorldMesh(meshes.cyl, mTmp, 6, [1.0, 0.86, 0.34], 1.8, 1, 0.28);
      }
    }

    gl.depthMask(true);
    gl.disable(gl.BLEND);

    // PASS 4: Full-Screen Directional Impasto Oil-Painting Post-Processor -> Default Framebuffer!
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.disable(gl.DEPTH_TEST);

    gl.useProgram(postProg);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, fboTex);
    gl.uniform1i(uPost.uTex, 0);
    gl.uniform2f(uPost.uRes, fboW, fboH);
    gl.uniform1i(uPost.uBrushMode, state.brushMode);
    gl.uniform1f(uPost.uTime, state.time);
    const speedBlur =
      rider.dashT > 0 ? 1.0 : rider.boostT > 0 ? 0.75 : clamp((Math.abs(rider.speed) - 12) / 10, 0, 0.45);
    gl.uniform1f(uPost.uSpeedBlur, activePlay ? speedBlur : 0.0);

    gl.bindVertexArray(emptyVAO);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  window.__NIGHTRIDER__ = {
    state,
    rider,
    world,
    gl,
    startRide,
    triggerDash,
    triggerJump,
    cycleBrushMode,
  };

  requestAnimationFrame(tick);
}

initGame();
