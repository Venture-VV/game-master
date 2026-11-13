import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';

import { clamp, lerp, damp } from './math/noise.js';
import { createHarborEnvironment, createPBRMaterials, getPuddleFactorAt } from './materials/pbr.js';
import { SoundEngine } from './audio/synth.js';
import { buildHarborWorld } from './models/world.js';
import { createWeaponRig } from './models/weapon.js';
import { createCombatManager } from './models/enemies.js';

const $ = (id) => document.getElementById(id);

async function bootGame() {
  const bootStatus = $('boot-status');
  const bootFill = $('boot-bar-fill');
  const setBoot = async (pct, msg) => {
    if (bootStatus) bootStatus.textContent = msg;
    if (bootFill) bootFill.style.width = `${pct}%`;
    await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 12)));
  };

  await setBoot(18, '初始化 WebGL2 物理渲染管线...');

  const canvas = $('game-canvas');
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    powerPreference: 'high-performance',
  });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.18;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;

  // Detect WebGL GPU string (auto-tune default quality if running on software rasterizer)
  let glRendererName = 'WebGL2 GPU';
  try {
    const gl = renderer.getContext();
    const dbg = gl.getExtension('WEBGL_debug_renderer_info');
    if (dbg) glRendererName = gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) || glRendererName;
  } catch {}
  const isSoftwareGL = /SwiftShader|llvmpipe|Software/i.test(glRendererName);

  let quality = isSoftwareGL ? 'med' : 'high';

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(72, window.innerWidth / window.innerHeight, 0.06, 420);
  camera.rotation.order = 'YXZ';
  scene.add(camera);

  await setBoot(42, '程序化合成雨夜港区 HDRI 环境与 PBR 材质...');
  scene.environment = createHarborEnvironment(renderer);
  const maxAniso = renderer.capabilities.getMaxAnisotropy();
  const mats = createPBRMaterials(maxAniso);

  await setBoot(68, '构建岸桥起重机、集装箱货轮与硬表面港区几何体...');
  const world = buildHarborWorld(scene, mats, quality);

  await setBoot(86, '装配 MK-18 全息步枪与机械敌群 AI...');
  const sound = new SoundEngine();
  const weapon = createWeaponRig(camera, scene, mats);
  const combat = createCombatManager(scene, world, mats, sound);

  // Post-Processing Composer (RenderPass -> UnrealBloomPass -> OutputPass)
  const composer = new EffectComposer(renderer);
  const renderPass = new RenderPass(scene, camera);
  const bloomPass = new UnrealBloomPass(
    new THREE.Vector2(window.innerWidth, window.innerHeight),
    0.46,
    0.38,
    0.86
  );
  const outputPass = new OutputPass();
  composer.addPass(renderPass);
  composer.addPass(bloomPass);
  composer.addPass(outputPass);

  function applyQuality(q) {
    quality = q;
    const maxDpr = q === 'high' ? 1.65 : q === 'med' ? 1.25 : 1.0;
    const dpr = Math.min(window.devicePixelRatio || 1, maxDpr);
    renderer.setPixelRatio(dpr);
    renderer.setSize(window.innerWidth, window.innerHeight);
    composer.setPixelRatio(dpr);
    composer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = q !== 'low';
    document.querySelectorAll('.quality-btn').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.q === q);
    });
  }
  applyQuality(quality);

  window.addEventListener('resize', () => applyQuality(quality));

  await setBoot(100, '断潮行动就绪');
  $('boot-loader').classList.add('done');

  // ─────────────────── Game & Player State ───────────────────
  const game = {
    mode: 'title', // 'title' | 'playing' | 'paused' | 'victory' | 'gameover'
    time: 0,
    missionTime: 0,
    relaysCut: 0,
    kills: 0,
    critKills: 0,
    shotsFired: 0,
    shotsHit: 0,
    bossSpawned: false,
    bossKilled: false,
    bossRef: null,
    sensitivity: 0.0021,
    lightningCooldown: 6.5,
    lightningFlash: 0,
    fps: 60,
  };

  const player = {
    pos: new THREE.Vector3(0, 0, 46), // Feet position
    vel: new THREE.Vector3(),
    yaw: 0,
    pitch: 0,
    eyeHeight: 1.7,
    grounded: true,
    surface: 'concrete',
    crouching: false,
    sliding: false,
    slideTimer: 0,
    slideDir: new THREE.Vector3(),
    hp: 100,
    maxHp: 100,
    timeSinceHit: 10,
    mag: 30,
    maxMag: 30,
    reserve: 180,
    fireTimer: 0,
    stims: 2,
    empCooldown: 0,
    stepDist: 0,
    alive: true,
    cameraKickPitch: 0,
    cameraKickYaw: 0,
    adsToggle: false,
  };

  const keys = {};
  const mouse = {
    leftDown: false,
    rightDown: false,
    draggingLook: false,
    lastX: null,
    lastY: null,
    normX: 0.5,
    inside: false,
  };

  // Touch joystick state
  const touchState = {
    enabled: 'ontouchstart' in window || navigator.maxTouchPoints > 0,
    moveX: 0,
    moveY: 0,
    moveId: null,
    lookId: null,
    lastLookX: 0,
    lastLookY: 0,
    firing: false,
    ads: false,
    interacting: false,
  };
  if (touchState.enabled) {
    $('touch-controls').classList.add('enabled');
  }

  // ─────────────────── HUD & Waypoint Elements ───────────────────
  const hudEl = $('hud');
  const overlayEl = $('overlay-screen');
  const visorFx = $('visor-fx');
  const empFlash = $('emp-flash');
  const crosshairEl = $('crosshair');
  const hitmarkerEl = $('hitmarker');
  const damageRingEl = $('damage-ring');
  const interactBox = $('interact-box');
  const interactFill = $('interact-fill');
  const interactLabel = $('interact-label');
  const waypointsLayer = $('waypoints-layer');

  // Create persistent DOM waypoint nodes for Relays A, B, C + Extraction Boat
  const waypointNodes = world.relays.map((r) => {
    const el = document.createElement('div');
    el.className = 'wp-marker';
    el.innerHTML = `<div class="wp-diamond"></div><div class="wp-label">${r.id}</div>`;
    waypointsLayer.appendChild(el);
    return { type: 'relay', ref: r, el, labelEl: el.querySelector('.wp-label') };
  });
  const extWpEl = document.createElement('div');
  extWpEl.className = 'wp-marker extract';
  extWpEl.style.display = 'none';
  extWpEl.innerHTML = `<div class="wp-diamond"></div><div class="wp-label">撤离快艇</div>`;
  waypointsLayer.appendChild(extWpEl);

  let hitmarkerTimer = 0;
  let damageRingTimer = 0;
  let bannerTimer = 0;
  let lastRelayTickStep = -1;

  function pushRadio(text, isWarn = false) {
    const feed = $('radio-feed');
    const div = document.createElement('div');
    div.className = `radio-msg${isWarn ? ' warn' : ''}`;
    div.textContent = text;
    feed.appendChild(div);
    while (feed.children.length > 3) feed.removeChild(feed.firstChild);
    setTimeout(() => {
      if (div.parentNode) div.parentNode.removeChild(div);
    }, 6200);
  }

  function pushKillFeed(enemyName, isCrit) {
    const feed = $('kill-feed');
    const item = document.createElement('div');
    item.className = `kill-item${isCrit ? ' crit' : ''}`;
    item.textContent = `${isCrit ? '⚡ 弱点暴击 · ' : '击毁 · '}${enemyName}`;
    feed.appendChild(item);
    while (feed.children.length > 4) feed.removeChild(feed.firstChild);
    setTimeout(() => {
      if (item.parentNode) item.parentNode.removeChild(item);
    }, 3400);
  }

  function showBanner(title, sub, dur = 2.8) {
    $('banner-title').textContent = title;
    $('banner-sub').textContent = sub;
    $('center-banner').classList.add('visible');
    bannerTimer = dur;
  }

  combat.setStatsCallback(({ event, enemy, isCrit }) => {
    if (event === 'kill') {
      game.kills++;
      if (isCrit) game.critKills++;
      if (enemy.type === 'boss') {
        game.bossKilled = true;
        showBanner('港务官机甲已摧毁', '东栈桥防线瓦解 · 立即登艇撤离！', 3.4);
        pushRadio('指挥部：干得漂亮！重装港务官已被彻底瘫痪，快上撤离艇！', false);
      }
      pushKillFeed(enemy.name, isCrit);
    }
  });

  // ─────────────────── Mission Reset & Spawning ───────────────────
  function resetMission() {
    combat.clearAll();

    player.pos.set(0, 0, 46);
    player.vel.set(0, 0, 0);
    player.yaw = 0;
    player.pitch = -0.02;
    player.eyeHeight = 1.7;
    player.hp = 100;
    player.timeSinceHit = 10;
    player.mag = 30;
    player.reserve = 180;
    player.stims = 2;
    player.empCooldown = 0;
    player.alive = true;
    player.sliding = false;
    weapon.state.reloading = false;
    weapon.weaponRoot.visible = true;

    game.missionTime = 0;
    game.relaysCut = 0;
    game.kills = 0;
    game.critKills = 0;
    game.shotsFired = 0;
    game.shotsHit = 0;
    game.bossSpawned = false;
    game.bossKilled = false;
    game.bossRef = null;

    // Reset Relays A, B, C
    world.relays.forEach((r, idx) => {
      r.severed = false;
      r.progress = 0;
      r.coreMat.color.setHex(0x22e6ff);
      r.coreMat.emissive.setHex(0x14c8ff);
      r.coreMat.emissiveIntensity = 3.2;
      r.skyBeam.visible = true;
      r.ptLight.color.setHex(0x1fd8ff);
      r.ptLight.intensity = 22;
      const pip = document.querySelectorAll('.relay-pip')[idx];
      if (pip) pip.classList.remove('cut');
    });

    // Reset Extraction Beacon
    world.extractionBeacon.active = false;
    world.extractionBeacon.beamMat.opacity = 0;
    world.extractionBeacon.light.intensity = 0;
    extWpEl.style.display = 'none';
    $('boss-bar-wrap').classList.remove('visible');
    $('mission-phase').textContent = '阶段 01';
    $('mission-text').textContent = '切断三处上行中继 [0 / 3]';

    // Spawn Initial Harbor Patrols guarding the 3 sectors
    combat.spawnGull(-30, 5.2, 16);
    combat.spawnHound(-38, 12);

    combat.spawnGull(0, 5.4, -18);
    combat.spawnHound(-5, 4);

    combat.spawnGull(22, 5.5, -24);
    combat.spawnHound(26, -30);

    $('radio-feed').innerHTML = '';
    pushRadio('指挥部：你已潜入断潮港封锁区。按目标指引切断 [A][B][C] 三座中继塔！');
    showBanner('断潮行动 · 开始', '切断三处上行中继并前往东栈桥撤离', 2.8);
  }

  function deployReinforcements(relayId) {
    if (relayId === 'A') {
      combat.spawnGull(-20, 6.0, -8);
      combat.spawnHound(-24, 28);
      combat.spawnHound(-42, -16);
    } else if (relayId === 'B') {
      combat.spawnGull(-12, 5.8, 22);
      combat.spawnGull(14, 6.0, -20);
      combat.spawnHound(16, 10);
    } else {
      combat.spawnGull(8, 6.0, -38);
      combat.spawnHound(-8, -26);
      combat.spawnHound(34, -12);
    }
  }

  function triggerExtractionPhase() {
    world.extractionBeacon.active = true;
    world.extractionBeacon.boatMat.color.setHex(0x2eff88);
    world.extractionBeacon.boatMat.emissive.setHex(0x18e86e);
    world.extractionBeacon.boatMat.emissiveIntensity = 3.6;
    extWpEl.style.display = 'flex';

    $('mission-phase').textContent = '最终撤离';
    $('mission-text').textContent = '突破封锁 · 抵达东栈桥撤离快艇';

    game.bossSpawned = true;
    game.bossRef = combat.spawnHarbormasterBoss(46, 22);
    combat.spawnGull(50, 6.2, 14);
    combat.spawnHound(40, 28);

    $('boss-bar-wrap').classList.add('visible');
    showBanner('中继全部离线 · 撤离艇就位', '东栈桥信标已点亮 · 警惕港务官重装机甲！', 3.6);
    pushRadio('撤离艇 BREACHER-04：已在东栈桥就位！侦测到重装港务官拦截，用 [Q] EMP 破盾！', true);
  }

  // ─────────────────── Shooting, Reload, EMP & Healing ───────────────────
  const raycaster = new THREE.Raycaster();
  const screenCenter = new THREE.Vector2(0, 0);

  function fireRound() {
    if (weapon.state.reloading || !player.alive) return;
    if (player.mag <= 0) {
      tryReload();
      return;
    }

    player.mag--;
    player.fireTimer = 60 / 680; // 680 RPM crisp tactical carbine
    game.shotsFired++;

    const ads = weapon.state.ads;
    sound.playGunshot();
    sound.playShellCasing(getPuddleFactorAt(player.pos.x, player.pos.z) > 0.55);
    weapon.triggerShot(ads);

    // Subtle controllable camera recoil kick
    player.cameraKickPitch += ads > 0.5 ? 0.0085 : 0.013;
    player.cameraKickYaw += (Math.random() - 0.5) * 0.007;

    // Calculate spread cone (razor-accurate in ADS!)
    const moveFactor = clamp(Math.hypot(player.vel.x, player.vel.z) / 6.5, 0, 1);
    const spread = lerp(0.012 + moveFactor * 0.022, 0.0018, ads);
    screenCenter.set(
      (Math.random() - 0.5) * spread,
      (Math.random() - 0.5) * spread
    );

    raycaster.setFromCamera(screenCenter, camera);
    raycaster.far = 165;

    const candidates = world.shootables.concat(combat.enemyHitMeshes);
    const hits = raycaster.intersectObjects(candidates, false);

    const muzzleWorld = new THREE.Vector3(0, 0.01, -0.58);
    weapon.weaponRoot.localToWorld(muzzleWorld);

    if (hits.length > 0) {
      const first = hits[0];
      combat.spawnTracer(muzzleWorld, first.point);

      const hitEnemy = first.object.userData.enemy;
      if (hitEnemy && !hitEnemy.dying) {
        game.shotsHit++;
        const isCrit = !!first.object.userData.isCrit;
        const res = combat.damageEnemy(hitEnemy, 34, isCrit, first.point);
        sound.playHitmarker(isCrit, res.killed);
        showHitmarker(isCrit || res.killed);
      } else {
        combat.spawnSparks(first.point, 4, false, 5);
        if (Math.random() < 0.35) sound.playRicochet();
      }
    } else {
      const farPt = raycaster.ray.origin.clone().addScaledVector(raycaster.ray.direction, 95);
      combat.spawnTracer(muzzleWorld, farPt);
    }

    if (player.mag === 0 && player.reserve > 0) {
      setTimeout(() => {
        if (player.mag === 0 && game.mode === 'playing') tryReload();
      }, 140);
    }
  }

  function tryReload() {
    if (weapon.state.reloading || player.mag >= player.maxMag || player.reserve <= 0) return;
    weapon.startReload();
  }

  function tryUseEmp() {
    if (player.empCooldown > 0 || !player.alive || game.mode !== 'playing') return;
    player.empCooldown = 9.0;
    const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion).normalize();
    const origin = camera.position.clone().addScaledVector(dir, 0.6);
    combat.launchEmpGrenade(origin, dir);
    empFlash.style.opacity = '1';
    setTimeout(() => { empFlash.style.opacity = '0'; }, 240);
    pushRadio('战术系统：EMP 电磁脉冲手雷已投出！');
  }

  function tryUseStim() {
    if (player.stims <= 0 || player.hp >= player.maxHp || !player.alive) return;
    player.stims--;
    player.hp = Math.min(player.maxHp, player.hp + 55);
    sound.playPickup();
    pushRadio('医疗模块：纳米强心剂已注入，生命体征恢复。');
  }

  function showHitmarker(isCrit) {
    hitmarkerTimer = 0.14;
    hitmarkerEl.classList.toggle('crit', isCrit);
    hitmarkerEl.style.opacity = '1';
    hitmarkerEl.style.transform = 'rotate(45deg) scale(1.12)';
  }

  function onPlayerDamaged(amount, attackerOrigin) {
    if (!player.alive || game.mode !== 'playing') return;
    player.hp = Math.max(0, player.hp - amount);
    player.timeSinceHit = 0;
    sound.playPlayerHurt();

    // Directional damage ring rotation
    if (attackerOrigin) {
      const dx = attackerOrigin.x - player.pos.x;
      const dz = attackerOrigin.z - player.pos.z;
      const worldAngle = Math.atan2(dx, -dz);
      const relAngle = worldAngle + player.yaw;
      damageRingEl.style.transform = `rotate(${relAngle}rad)`;
      damageRingEl.style.opacity = '0.92';
      damageRingTimer = 0.45;
    }

    if (player.hp <= 0) {
      player.alive = false;
      weapon.weaponRoot.visible = false;
      finishGame('gameover');
    }
  }

  // ─────────────────── Game Mode Transitions & Debriefing ───────────────────
  function tryLockPointer() {
    if (touchState.enabled) return;
    try {
      const p = canvas.requestPointerLock?.();
      if (p && typeof p.catch === 'function') p.catch(() => {});
    } catch {}
  }

  function startOrResumeGame() {
    sound.init();
    if (game.mode === 'title' || game.mode === 'victory' || game.mode === 'gameover') {
      resetMission();
    }
    game.mode = 'playing';
    overlayEl.classList.add('hidden');
    hudEl.classList.add('active');
    $('audio-lab').classList.remove('open');
    tryLockPointer();
  }

  function pauseGame() {
    if (game.mode !== 'playing') return;
    game.mode = 'paused';
    overlayEl.classList.remove('hidden');
    $('menu-kicker').textContent = 'SALTLINE TACTICAL // 行动暂停';
    $('menu-title').textContent = '断潮行动 · 暂停';
    $('menu-desc').textContent = '行动已挂起。你可调整渲染画质、鼠标灵敏度，或打开声学合成台实时检视纯代码合成的音效波形。';
    $('debrief-panel').classList.remove('visible');
    $('btn-deploy').textContent = '继续行动';
    $('btn-restart').style.display = 'inline-block';
    try {
      if (document.pointerLockElement) document.exitPointerLock();
    } catch {}
  }

  function finishGame(outcome) {
    game.mode = outcome;
    hudEl.classList.remove('active');
    overlayEl.classList.remove('hidden');
    try {
      if (document.pointerLockElement) document.exitPointerLock();
    } catch {}

    const acc = game.shotsFired > 0 ? Math.round((game.shotsHit / game.shotsFired) * 100) : 0;
    const mins = Math.floor(game.missionTime / 60);
    const secs = (game.missionTime % 60).toFixed(1).padStart(4, '0');
    const timeStr = `${String(mins).padStart(2, '0')}:${secs}`;

    let rank = 'B';
    if (outcome === 'victory') {
      const score =
        (game.missionTime < 210 ? 2 : 1) +
        (game.bossKilled ? 2 : 0) +
        (game.critKills >= 3 ? 1 : 0);
      rank = score >= 4 ? 'S+' : score >= 3 ? 'S' : 'A';
      $('menu-kicker').textContent = 'MISSION ACCOMPLISHED // 撤离成功';
      $('menu-title').textContent = '断潮港已静默';
      $('menu-desc').textContent = 'BREACHER-04 快艇已驶离封锁海域。三处上行中继全部切断，港务防卫网络彻底瘫痪。';
    } else {
      rank = 'F';
      $('menu-kicker').textContent = 'SIGNAL LOST // 行动失败';
      $('menu-title').textContent = '特遣员失联';
      $('menu-desc').textContent = '港区机械防御集群火力凶猛——善用掩体、红点精确瞄准弱点，并按 [Q] 释放 EMP 瘫痪敌群。';
    }

    $('stat-time').textContent = timeStr;
    $('stat-kills').textContent = `${game.kills} (${game.critKills} 暴击)`;
    $('stat-acc').textContent = `${acc}%`;
    $('stat-boss').textContent = game.bossKilled ? '已击破' : '未击破';
    $('stat-rank').textContent = rank;
    $('debrief-panel').classList.add('visible');
    $('btn-deploy').textContent = '再次出击';
    $('btn-restart').style.display = 'none';
  }

  // ─────────────────── Input Listeners (PointerLock + Seamless Fallback + Touch) ───────────────────
  $('btn-deploy').addEventListener('click', () => startOrResumeGame());
  $('btn-restart').addEventListener('click', () => {
    resetMission();
    startOrResumeGame();
  });

  $('aim-hint').addEventListener('click', () => tryLockPointer());

  // Quality buttons & Sliders
  document.querySelectorAll('.quality-btn').forEach((btn) => {
    btn.addEventListener('click', () => applyQuality(btn.dataset.q));
  });

  $('sens-slider').addEventListener('input', (e) => {
    game.sensitivity = parseFloat(e.target.value) * 0.0001;
  });

  $('vol-slider').addEventListener('input', (e) => {
    sound.init();
    sound.setVolume(parseFloat(e.target.value) / 100);
  });

  // Procedural Audio Synth Lab Modal + Live Oscilloscope
  const oscCanvas = $('oscilloscope');
  const oscCtx = oscCanvas.getContext('2d');
  const waveBuf = new Uint8Array(1024);

  $('btn-audio-lab').addEventListener('click', () => {
    sound.init();
    $('audio-lab').classList.toggle('open');
  });

  document.querySelectorAll('.sfx-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      sound.init();
      const act = btn.dataset.sfx;
      if (act === 'rifle-out') sound.playGunshot(0.0);
      else if (act === 'rifle-in') sound.playGunshot(1.0);
      else if (act === 'reload') {
        sound.playReloadStage(0);
        setTimeout(() => sound.playReloadStage(1), 460);
        setTimeout(() => sound.playReloadStage(2), 920);
      } else if (act === 'shell') sound.playShellCasing(false);
      else if (act === 'step-puddle') sound.playFootstep('puddle', true);
      else if (act === 'step-metal') sound.playFootstep('metal', true);
      else if (act === 'emp') sound.playEmpBlast();
      else if (act === 'relay') sound.playRelaySevered();
      else if (act === 'thunder') {
        sound.playThunder();
        game.lightningFlash = 1.0;
      }
    });
  });

  window.addEventListener('keydown', (e) => {
    keys[e.code] = true;
    if (e.code === 'Escape' || e.code === 'KeyP') {
      if (game.mode === 'playing') pauseGame();
      else if (game.mode === 'paused') startOrResumeGame();
    }
    if (game.mode !== 'playing') return;
    if (e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault();

    if (e.code === 'KeyR') tryReload();
    else if (e.code === 'KeyV') player.adsToggle = !player.adsToggle;
    else if (e.code === 'KeyF') {
      const on = weapon.toggleFlashlight();
      $('gear-flash').innerHTML = `<b>[F]</b> 战术灯 ${on ? 'ON' : 'OFF'}`;
    } else if (e.code === 'KeyQ') tryUseEmp();
    else if (e.code === 'KeyH') tryUseStim();
    else if (e.code === 'KeyM') sound.toggleMute();
    else if (e.code === 'Digit1') applyQuality('low');
    else if (e.code === 'Digit2') applyQuality('med');
    else if (e.code === 'Digit3') applyQuality('high');

    // Tactical Slide trigger: Shift + C while moving on ground!
    if ((e.code === 'KeyC' || e.code === 'ControlLeft') && player.grounded && !player.sliding) {
      const spd = Math.hypot(player.vel.x, player.vel.z);
      if ((keys['ShiftLeft'] || keys['ShiftRight']) && spd > 4.2) {
        player.sliding = true;
        player.slideTimer = 0.62;
        player.slideDir.set(player.vel.x, 0, player.vel.z).normalize();
        sound.playFootstep(
          getPuddleFactorAt(player.pos.x, player.pos.z) > 0.5 ? 'puddle' : player.surface,
          true
        );
      }
    }
  });

  window.addEventListener('keyup', (e) => {
    keys[e.code] = false;
  });

  document.addEventListener('pointerlockchange', () => {
    const locked = document.pointerLockElement === canvas;
    $('aim-hint').style.display = locked || touchState.enabled ? 'none' : 'block';
  });

  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  canvas.addEventListener('mouseenter', () => { mouse.inside = true; });
  canvas.addEventListener('mouseleave', () => { mouse.inside = false; mouse.lastX = null; mouse.lastY = null; });

  canvas.addEventListener('mousedown', (e) => {
    if (game.mode !== 'playing') return;
    sound.init();
    try { window.focus(); } catch {}
    if (document.pointerLockElement !== canvas) {
      tryLockPointer();
    }
    if (e.button === 0) {
      mouse.leftDown = true;
      mouse.draggingLook = true;
    } else if (e.button === 2) {
      mouse.rightDown = true;
    }
  });

  window.addEventListener('mouseup', (e) => {
    if (e.button === 0) {
      mouse.leftDown = false;
      mouse.draggingLook = false;
    } else if (e.button === 2) {
      mouse.rightDown = false;
    }
  });

  window.addEventListener('mousemove', (e) => {
    if (game.mode !== 'playing' || !player.alive) return;
    let dx = 0;
    let dy = 0;
    if (document.pointerLockElement === canvas) {
      dx = e.movementX || 0;
      dy = e.movementY || 0;
    } else {
      const rect = canvas.getBoundingClientRect();
      mouse.normX = clamp((e.clientX - rect.left) / Math.max(1, rect.width), 0, 1);
      mouse.inside = true;
      if (mouse.lastX !== null) {
        dx = (e.clientX - mouse.lastX) * 1.45;
        dy = (e.clientY - mouse.lastY) * 1.35;
      }
      mouse.lastX = e.clientX;
      mouse.lastY = e.clientY;
    }
    if (dx !== 0 || dy !== 0) {
      const sens = game.sensitivity * lerp(1.0, 0.58, weapon.state.ads);
      player.yaw -= dx * sens;
      player.pitch = clamp(player.pitch - dy * sens, -1.42, 1.42);
      weapon.addMouseSway(dx, dy);
    }
  });

  // Virtual Touch Controls Setup
  const moveZone = $('touch-move-zone');
  const stickEl = $('touch-stick');
  const lookZone = $('touch-look-zone');

  moveZone.addEventListener('touchstart', (e) => {
    e.preventDefault();
    const t = e.changedTouches[0];
    touchState.moveId = t.identifier;
  }, { passive: false });

  moveZone.addEventListener('touchmove', (e) => {
    e.preventDefault();
    for (let i = 0; i < e.changedTouches.length; i++) {
      const t = e.changedTouches[i];
      if (t.identifier === touchState.moveId) {
        const rect = moveZone.getBoundingClientRect();
        const cx = rect.left + rect.width / 2;
        const cy = rect.top + rect.height / 2;
        const maxR = rect.width * 0.42;
        let dx = t.clientX - cx;
        let dy = t.clientY - cy;
        const dist = Math.hypot(dx, dy);
        if (dist > maxR) {
          dx = (dx / dist) * maxR;
          dy = (dy / dist) * maxR;
        }
        stickEl.style.transform = `translate(${dx}px, ${dy}px)`;
        touchState.moveX = dx / maxR;
        touchState.moveY = dy / maxR;
      }
    }
  }, { passive: false });

  const endTouchMove = (e) => {
    for (let i = 0; i < e.changedTouches.length; i++) {
      if (e.changedTouches[i].identifier === touchState.moveId) {
        touchState.moveId = null;
        touchState.moveX = 0;
        touchState.moveY = 0;
        stickEl.style.transform = 'translate(0px, 0px)';
      }
    }
  };
  moveZone.addEventListener('touchend', endTouchMove);
  moveZone.addEventListener('touchcancel', endTouchMove);

  lookZone.addEventListener('touchstart', (e) => {
    const t = e.changedTouches[0];
    touchState.lookId = t.identifier;
    touchState.lastLookX = t.clientX;
    touchState.lastLookY = t.clientY;
  }, { passive: true });

  lookZone.addEventListener('touchmove', (e) => {
    for (let i = 0; i < e.changedTouches.length; i++) {
      const t = e.changedTouches[i];
      if (t.identifier === touchState.lookId && game.mode === 'playing') {
        const dx = t.clientX - touchState.lastLookX;
        const dy = t.clientY - touchState.lastLookY;
        touchState.lastLookX = t.clientX;
        touchState.lastLookY = t.clientY;
        player.yaw -= dx * 0.0045;
        player.pitch = clamp(player.pitch - dy * 0.0045, -1.4, 1.4);
      }
    }
  }, { passive: true });

  $('t-fire').addEventListener('touchstart', (e) => { e.preventDefault(); touchState.firing = true; });
  $('t-fire').addEventListener('touchend', () => { touchState.firing = false; });
  $('t-ads').addEventListener('touchstart', (e) => { e.preventDefault(); touchState.ads = !touchState.ads; });
  $('t-reload').addEventListener('touchstart', (e) => { e.preventDefault(); tryReload(); });
  $('t-emp').addEventListener('touchstart', (e) => { e.preventDefault(); tryUseEmp(); });
  $('t-use').addEventListener('touchstart', (e) => { e.preventDefault(); touchState.interacting = true; });
  $('t-use').addEventListener('touchend', () => { touchState.interacting = false; });
  $('t-jump').addEventListener('touchstart', (e) => {
    e.preventDefault();
    if (player.grounded) {
      player.vel.y = 6.3;
      player.grounded = false;
    }
  });

  // ─────────────────── Main Frame Loop ───────────────────
  let prevNow = performance.now();
  let fpsAccum = 0;
  let fpsFrames = 0;
  const projVec = new THREE.Vector3();

  function animate(now) {
    requestAnimationFrame(animate);
    const rawDt = (now - prevNow) * 0.001;
    prevNow = now;
    const dt = Math.min(rawDt, 0.05);
    game.time += dt;

    // FPS Counter
    fpsAccum += rawDt;
    fpsFrames++;
    if (fpsAccum >= 0.5) {
      game.fps = Math.round(fpsFrames / fpsAccum);
      fpsAccum = 0;
      fpsFrames = 0;
      $('perf-readout').textContent = `${game.fps} FPS · ${quality.toUpperCase()} · PROCEDURAL PBR`;
    }

    // Draw Live Oscilloscope if Audio Lab is open
    if ($('audio-lab').classList.contains('open')) {
      oscCtx.fillStyle = '#05090d';
      oscCtx.fillRect(0, 0, oscCanvas.width, oscCanvas.height);
      if (sound.getWaveformData(waveBuf)) {
        oscCtx.strokeStyle = '#34d5f7';
        oscCtx.lineWidth = 1.8;
        oscCtx.beginPath();
        for (let i = 0; i < waveBuf.length; i++) {
          const x = (i / waveBuf.length) * oscCanvas.width;
          const y = (waveBuf[i] / 255.0) * oscCanvas.height;
          if (i === 0) oscCtx.moveTo(x, y);
          else oscCtx.lineTo(x, y);
        }
        oscCtx.stroke();
      }
    }

    // Storm Lightning & Rolling Thunder
    game.lightningCooldown -= dt;
    if (game.lightningCooldown <= 0) {
      game.lightningCooldown = 12 + Math.random() * 10;
      game.lightningFlash = 1.0;
      setTimeout(() => {
        if (sound.ctx) sound.playThunder();
      }, 650);
    }
    if (game.lightningFlash > 0) {
      game.lightningFlash = Math.max(0, game.lightningFlash - dt * 3.8);
      const pulse = Math.sin(game.lightningFlash * Math.PI * 3) > 0 ? game.lightningFlash : game.lightningFlash * 0.3;
      world.lightningLight.intensity = pulse * 4.5;
    } else {
      world.lightningLight.intensity = 0;
    }

    world.updateWorld(game.time, dt);

    // ─── Cinematic Live Background Camera when on Title / Victory / Gameover ───
    if (game.mode !== 'playing') {
      weapon.weaponRoot.visible = false;
      if (game.mode === 'title' || game.mode === 'victory' || game.mode === 'gameover') {
        const ang = game.time * 0.11;
        const camX = Math.sin(ang) * 32;
        const camZ = 14 + Math.cos(ang) * 26;
        camera.position.set(camX, 7.5 + Math.sin(game.time * 0.35) * 1.4, camZ);
        camera.lookAt(-6, 4.5, -24);
        camera.fov = 66;
        camera.updateProjectionMatrix();
        combat.updateRain(dt, camera.position, quality !== 'low');
      }
      if (quality === 'low') renderer.render(scene, camera);
      else composer.render();
      return;
    }

    // ─────────────────── Active Gameplay Frame Update ───────────────────
    weapon.weaponRoot.visible = player.alive;
    game.missionTime += dt;

    // Keyboard Arrow-Key Look + Iframe Screen-Edge Auto-Turn support
    const arrowLookSpd = 1.9 * dt;
    if (keys['ArrowLeft']) player.yaw += arrowLookSpd;
    if (keys['ArrowRight']) player.yaw -= arrowLookSpd;
    if (keys['ArrowUp']) player.pitch = clamp(player.pitch + arrowLookSpd * 0.8, -1.42, 1.42);
    if (keys['ArrowDown']) player.pitch = clamp(player.pitch - arrowLookSpd * 0.8, -1.42, 1.42);
    if (document.pointerLockElement !== canvas && mouse.inside && !touchState.enabled) {
      if (mouse.normX < 0.11) player.yaw += ((0.11 - mouse.normX) / 0.11) * 2.1 * dt;
      else if (mouse.normX > 0.89) player.yaw -= ((mouse.normX - 0.89) / 0.11) * 2.1 * dt;
    }

    // Movement Input Vector
    let moveFwd = (keys['KeyW'] ? 1 : 0) - (keys['KeyS'] ? 1 : 0) - touchState.moveY;
    let moveRight = (keys['KeyD'] ? 1 : 0) - (keys['KeyA'] ? 1 : 0) + touchState.moveX;
    const inputLen = Math.hypot(moveFwd, moveRight);
    if (inputLen > 1) {
      moveFwd /= inputLen;
      moveRight /= inputLen;
    }

    const adsHeld = mouse.rightDown || player.adsToggle || touchState.ads;
    player.crouching = !!(keys['KeyC'] || keys['ControlLeft']);
    const sprinting = !!(keys['ShiftLeft'] || keys['ShiftRight']) && moveFwd > 0.2 && !adsHeld && !player.crouching && !player.sliding;

    const sinY = Math.sin(player.yaw);
    const cosY = Math.cos(player.yaw);
    const fwdX = -sinY;
    const fwdZ = -cosY;
    const rightX = cosY;
    const rightZ = -sinY;

    const maxSpeed = player.crouching ? 3.2 : adsHeld ? 3.5 : sprinting ? 7.7 : 5.3;

    if (player.sliding) {
      player.slideTimer -= dt;
      const slideSpd = lerp(4.5, 10.4, clamp(player.slideTimer / 0.62, 0, 1));
      player.vel.x = player.slideDir.x * slideSpd;
      player.vel.z = player.slideDir.z * slideSpd;
      if (player.slideTimer <= 0) player.sliding = false;
    } else {
      const wishX = fwdX * moveFwd + rightX * moveRight;
      const wishZ = fwdZ * moveFwd + rightZ * moveRight;
      const accel = player.grounded ? 16 : 5;
      player.vel.x = damp(player.vel.x, wishX * maxSpeed, accel, dt);
      player.vel.z = damp(player.vel.z, wishZ * maxSpeed, accel, dt);
    }

    // Jump & Gravity
    if (keys['Space'] && player.grounded) {
      player.vel.y = 6.35;
      player.grounded = false;
      player.sliding = false;
    }
    player.vel.y -= 17.5 * dt;

    player.pos.x += player.vel.x * dt;
    player.pos.z += player.vel.z * dt;
    player.pos.y += player.vel.y * dt;

    const phys = world.resolvePlayerPhysics(player.pos, 0.42, player.crouching ? 1.15 : 1.72, 0.58);
    player.surface = phys.surface;

    if (player.pos.y <= phys.floorY + 0.001 && player.vel.y <= 0) {
      player.pos.y = phys.floorY;
      player.vel.y = 0;
      player.grounded = true;
    } else {
      player.grounded = false;
    }

    // Smooth Eye Height & Camera Transform + FOV Kick
    const targetEye = player.sliding ? 0.92 : player.crouching ? 1.10 : 1.70;
    player.eyeHeight = damp(player.eyeHeight, targetEye, 14, dt);
    player.cameraKickPitch = damp(player.cameraKickPitch, 0, 16, dt);
    player.cameraKickYaw = damp(player.cameraKickYaw, 0, 16, dt);

    camera.position.set(player.pos.x, player.pos.y + player.eyeHeight, player.pos.z);
    camera.rotation.set(
      clamp(player.pitch + player.cameraKickPitch, -1.48, 1.48),
      player.yaw + player.cameraKickYaw,
      player.sliding ? -0.065 : 0
    );

    const targetFov = weapon.state.ads > 0.01 ? lerp(72, 50, weapon.state.ads) : sprinting ? 77 : 72;
    camera.fov = damp(camera.fov, targetFov, 14, dt);
    camera.updateProjectionMatrix();

    // Acoustic Indoor Detection & Surface-Aware Footsteps
    const indoor = world.isIndoor(player.pos.x, player.pos.y + 1.0, player.pos.z);
    sound.setIndoorFactor(indoor);

    const horizSpeed = Math.hypot(player.vel.x, player.vel.z);
    if (player.grounded && horizSpeed > 0.8 && !player.sliding) {
      player.stepDist += horizSpeed * dt;
      const stride = sprinting ? 2.15 : 1.75;
      if (player.stepDist >= stride) {
        player.stepDist = 0;
        const puddle = player.pos.y < 0.08 && indoor < 0.5 && getPuddleFactorAt(player.pos.x, player.pos.z) > 0.52;
        sound.playFootstep(puddle ? 'puddle' : player.surface, sprinting);
      }
    }

    // Weapon Update & Full-Auto Firing
    player.fireTimer = Math.max(0, player.fireTimer - dt);
    if ((mouse.leftDown || touchState.firing) && player.fireTimer <= 0 && !sprinting) {
      fireRound();
    }

    weapon.update(
      dt,
      game.time,
      {
        moveSpeed: horizSpeed,
        maxSpeed: 5.3,
        sprinting,
        sliding: player.sliding,
        adsHeld,
        grounded: player.grounded,
      },
      (stage) => sound.playReloadStage(stage),
      () => {
        const need = player.maxMag - player.mag;
        const load = Math.min(need, player.reserve);
        player.mag += load;
        player.reserve -= load;
      }
    );

    // Health Auto-Regeneration after 4.2s out of fire + Cooldowns
    player.timeSinceHit += dt;
    if (player.timeSinceHit > 4.2 && player.hp < player.maxHp && player.alive) {
      player.hp = Math.min(player.maxHp, player.hp + 14 * dt);
    }
    player.empCooldown = Math.max(0, player.empCooldown - dt);

    // ─── Relay Sabotage ([Hold E] within 3.9m) & Extraction Check ───
    let nearRelay = null;
    for (let i = 0; i < world.relays.length; i++) {
      const r = world.relays[i];
      if (!r.severed && r.pos.distanceTo(player.pos) < 3.9) {
        nearRelay = r;
        break;
      }
    }

    if (nearRelay) {
      interactBox.classList.add('visible');
      interactLabel.innerHTML = `按住 <kbd>E</kbd> 切断 ${nearRelay.label}`;
      if (keys['KeyE'] || touchState.interacting) {
        nearRelay.progress = Math.min(1, nearRelay.progress + dt / 1.75);
        const tickStep = Math.floor(nearRelay.progress * 8);
        if (tickStep !== lastRelayTickStep) {
          lastRelayTickStep = tickStep;
          sound.playRelayTick(nearRelay.progress);
        }
        if (nearRelay.progress >= 1) {
          nearRelay.severed = true;
          nearRelay.coreMat.color.setHex(0x3a1812);
          nearRelay.coreMat.emissive.setHex(0xff3818);
          nearRelay.coreMat.emissiveIntensity = 0.55;
          nearRelay.skyBeam.visible = false;
          nearRelay.ptLight.color.setHex(0xff4220);
          nearRelay.ptLight.intensity = 6;

          sound.playRelaySevered();
          combat.spawnSparks(nearRelay.pos.clone().add(new THREE.Vector3(0, 1.8, 0)), 22, true, 9);

          game.relaysCut++;
          const pips = document.querySelectorAll('.relay-pip');
          world.relays.forEach((rel, idx) => {
            if (rel.severed && pips[idx]) pips[idx].classList.add('cut');
          });

          // Tactical Resupply Reward on Relay Cut!
          player.hp = Math.min(player.maxHp, player.hp + 35);
          player.reserve += 60;
          player.stims = Math.min(3, player.stims + 1);

          if (game.relaysCut < 3) {
            $('mission-text').textContent = `切断三处上行中继 [${game.relaysCut} / 3]`;
            showBanner(`${nearRelay.label} 已切断`, `防卫集群增援迫近 · 剩余 ${3 - game.relaysCut} 处中继`, 2.6);
            pushRadio(`指挥部：${nearRelay.label} 离线！侦测到机械猎犬与无人机增援！`, true);
            deployReinforcements(nearRelay.id);
          } else {
            triggerExtractionPhase();
          }
        }
      } else {
        nearRelay.progress = Math.max(0, nearRelay.progress - dt * 1.4);
        lastRelayTickStep = -1;
      }
      interactFill.style.width = `${Math.round(nearRelay.progress * 100)}%`;
    } else {
      interactBox.classList.remove('visible');
    }

    // Check East Pier Boat Extraction!
    if (world.extractionBeacon.active && player.alive) {
      const dExt = player.pos.distanceTo(world.extractionBeacon.pos);
      if (dExt < 4.5) {
        sound.playPickup();
        finishGame('victory');
        return;
      }
    }

    // Update Combat AI, Projectiles, Rain & Particles
    combat.update(
      dt,
      game.time,
      player.pos,
      player.alive,
      onPlayerDamaged,
      () => {
        player.hp = Math.min(player.maxHp, player.hp + 22);
        player.reserve += 30;
      }
    );
    combat.updateRain(dt, camera.position, quality !== 'low');

    // ─────────────────── Update Tactical HUD Elements ───────────────────
    // Crosshair spread & ADS fade
    const spreadPx = Math.round(6 + horizSpeed * 1.4 + player.cameraKickPitch * 260);
    crosshairEl.style.setProperty('--spread', `${spreadPx}px`);
    crosshairEl.style.opacity = String(clamp(1.0 - weapon.state.ads * 1.25, 0, 1));

    if (hitmarkerTimer > 0) {
      hitmarkerTimer -= dt;
      if (hitmarkerTimer <= 0) {
        hitmarkerEl.style.opacity = '0';
        hitmarkerEl.style.transform = 'rotate(45deg) scale(0.9)';
      }
    }
    if (damageRingTimer > 0) {
      damageRingTimer -= dt;
      if (damageRingTimer <= 0) damageRingEl.style.opacity = '0';
    }
    if (bannerTimer > 0) {
      bannerTimer -= dt;
      if (bannerTimer <= 0) $('center-banner').classList.remove('visible');
    }

    // Vitals & Gear Readouts
    const hpInt = Math.ceil(player.hp);
    $('hp-num').textContent = String(hpInt);
    $('hp-bar-fill').style.width = `${hpInt}%`;
    $('hp-bar-fill').style.backgroundColor = hpInt <= 30 ? 'var(--accent-crimson)' : 'var(--text-primary)';
    visorFx.classList.toggle('low-hp', hpInt <= 32);

    $('ammo-mag').textContent = String(player.mag);
    $('ammo-mag').classList.toggle('low', player.mag <= 8);
    $('ammo-res').textContent = `/ ${player.reserve}`;

    const empSlot = $('gear-emp');
    if (player.empCooldown > 0) {
      empSlot.classList.add('cooldown');
      empSlot.innerHTML = `<b>[Q]</b> EMP ${player.empCooldown.toFixed(1)}s`;
    } else {
      empSlot.classList.remove('cooldown');
      empSlot.innerHTML = `<b>[Q]</b> EMP 就绪`;
    }
    $('gear-stim').innerHTML = `<b>[H]</b> 强心剂 ×${player.stims}`;

    // Boss Bar Update
    if (game.bossSpawned && game.bossRef && !game.bossRef.dying && game.bossRef.hp > 0) {
      $('boss-hp-fill').style.width = `${clamp((game.bossRef.hp / game.bossRef.maxHp) * 100, 0, 100)}%`;
      $('boss-shield-fill').style.width = `${clamp((game.bossRef.shield / game.bossRef.maxShield) * 100, 0, 100)}%`;
    } else if (game.bossKilled) {
      $('boss-bar-wrap').classList.remove('visible');
    }

    // Compass Bearing Strip
    const deg = (((-player.yaw * 180) / Math.PI) % 360 + 360) % 360;
    const dirs = ['北 N', '东北 NE', '东 E', '东南 SE', '南 S', '西南 SW', '西 W', '西北 NW'];
    const cardinal = dirs[Math.round(deg / 45) % 8];
    $('compass-track').textContent = `‹  ${String(Math.round((deg + 330) % 360)).padStart(3, '0')}°   ·   ${cardinal} ${String(Math.round(deg)).padStart(3, '0')}°   ·   ${String(Math.round((deg + 30) % 360)).padStart(3, '0')}°  ›`;

    // Project 3D Objective Waypoints onto 2D HUD (safe zone above bottom HUD panels)
    const w = window.innerWidth;
    const h = window.innerHeight;
    waypointNodes.forEach((wp) => {
      if (wp.ref.severed) {
        wp.el.style.display = 'none';
        return;
      }
      wp.el.style.display = 'flex';
      projVec.copy(wp.ref.pos).add(new THREE.Vector3(0, 3.2, 0));
      const dist = Math.round(player.pos.distanceTo(wp.ref.pos));
      projVec.project(camera);
      let sx = (projVec.x * 0.5 + 0.5) * w;
      let sy = (-projVec.y * 0.5 + 0.5) * h;
      if (projVec.z > 1) {
        sx = w - sx;
        sy = h - 148;
      }
      sx = clamp(sx, 72, w - 72);
      sy = clamp(sy, 78, h - 148);
      wp.el.style.left = `${sx}px`;
      wp.el.style.top = `${sy}px`;
      wp.labelEl.textContent = `[${wp.ref.id}] ${dist}m`;
    });

    if (world.extractionBeacon.active) {
      projVec.copy(world.extractionBeacon.pos).add(new THREE.Vector3(0, 3.0, 0));
      const dist = Math.round(player.pos.distanceTo(world.extractionBeacon.pos));
      projVec.project(camera);
      let sx = (projVec.x * 0.5 + 0.5) * w;
      let sy = (-projVec.y * 0.5 + 0.5) * h;
      if (projVec.z > 1) {
        sx = w - sx;
        sy = h - 148;
      }
      extWpEl.style.left = `${clamp(sx, 72, w - 72)}px`;
      extWpEl.style.top = `${clamp(sy, 78, h - 148)}px`;
      extWpEl.querySelector('.wp-label').textContent = `撤离艇 ${dist}m`;
    }

    // Render Scene
    if (quality === 'low') {
      renderer.render(scene, camera);
    } else {
      composer.render();
    }
  }

  // Expose automation/inspection handle for verification & power users
  window.__SALTLINE__ = {
    game,
    player,
    world,
    combat,
    weapon,
    sound,
    glRendererName,
    startOrResumeGame,
    fireRound,
    tryUseEmp,
    tryReload,
    applyQuality,
  };

  requestAnimationFrame(animate);
}

bootGame();
