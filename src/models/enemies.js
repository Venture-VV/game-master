import * as THREE from 'three';
import { clamp, lerp, damp } from '../math/noise.js';

export function createCombatManager(scene, world, mats, sound) {
  const enemies = [];
  const enemyHitMeshes = [];
  const projectiles = []; // Enemy plasma bolts & player EMP grenade
  const tracers = [];     // Fast glowing bullet streaks
  const particles = [];   // Sparks, debris, explosions
  const pickups = [];     // Dropped med/ammo shards
  const shockwaves = [];  // Expanding EMP / explosion spheres

  const sharedSparkGeo = new THREE.BoxGeometry(0.07, 0.07, 0.22);
  const sparkOrangeMat = new THREE.MeshBasicMaterial({ color: 0xffa838 });
  const sparkCyanMat = new THREE.MeshBasicMaterial({ color: 0x38ecff });
  const enemyBoltGeo = new THREE.SphereGeometry(0.09, 6, 6);
  const enemyBoltMat = new THREE.MeshBasicMaterial({ color: 0xff482e });

  function tagHitbox(mesh, enemy, isCrit = false) {
    mesh.userData.enemy = enemy;
    mesh.userData.isCrit = isCrit;
    enemyHitMeshes.push(mesh);
    return mesh;
  }

  function untagEnemyMeshes(enemy) {
    for (let i = enemyHitMeshes.length - 1; i >= 0; i--) {
      if (enemyHitMeshes[i].userData.enemy === enemy) {
        enemyHitMeshes.splice(i, 1);
      }
    }
  }

  // ─────────────────── 1. Procedural Enemy Model Builders ───────────────────
  function spawnGull(x, y, z) {
    const root = new THREE.Group();
    root.position.set(x, y, z);
    scene.add(root);

    const bodyGroup = new THREE.Group();
    root.add(bodyGroup);

    const enemy = {
      type: 'gull',
      name: '猎鸥无人机',
      root,
      bodyGroup,
      pos: root.position,
      vel: new THREE.Vector3(),
      hp: 85,
      maxHp: 85,
      shield: 0,
      maxShield: 0,
      stunTimer: 0,
      hitFlash: 0,
      fireCooldown: 1.2 + Math.random() * 1.2,
      chargeTimer: 0,
      strafeDir: Math.random() < 0.5 ? 1 : -1,
      strafeTimer: 2 + Math.random() * 2,
      hoverSeed: Math.random() * 10,
      dying: false,
      deathTimer: 0,
      rotors: [],
      eyeMat: mats.redEmissive.clone(),
      laserLine: null,
    };

    // Armored central hull
    const hull = tagHitbox(
      new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.34, 0.92), mats.mechArmor),
      enemy,
      false
    );
    hull.castShadow = true;
    bodyGroup.add(hull);

    // Top sensor fin
    const fin = tagHitbox(
      new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.16, 0.55), mats.craneYellow),
      enemy,
      false
    );
    fin.position.set(0, 0.22, -0.05);
    bodyGroup.add(fin);

    // Gimbaled Critical Optic Eye (2.2x Weakspot!)
    const pod = tagHitbox(
      new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 10), mats.mechDarkJoint),
      enemy,
      true
    );
    pod.position.set(0, -0.06, 0.44);
    bodyGroup.add(pod);

    const eye = tagHitbox(
      new THREE.Mesh(new THREE.SphereGeometry(0.14, 10, 10), enemy.eyeMat),
      enemy,
      true
    );
    eye.position.set(0, -0.06, 0.56);
    bodyGroup.add(eye);

    // Twin Tilted Ducted Rotor Nacelles
    [-0.68, 0.68].forEach((nx) => {
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.09, 0.14), mats.mechDarkJoint);
      arm.position.set(nx * 0.55, 0.05, 0);
      bodyGroup.add(arm);

      const shroud = tagHitbox(
        new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.34, 0.18, 14, 1, true), mats.mechArmor),
        enemy,
        false
      );
      shroud.position.set(nx, 0.06, 0);
      bodyGroup.add(shroud);

      const blade = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.02, 0.07), mats.galvanizedSteel);
      blade.position.set(nx, 0.07, 0);
      bodyGroup.add(blade);
      enemy.rotors.push(blade);
    });

    // Telegraph Targeting Laser Line (world space)
    const lGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(),
      new THREE.Vector3(0, 0, 1),
    ]);
    const lMat = new THREE.LineBasicMaterial({
      color: 0xff3224,
      transparent: true,
      opacity: 0.0,
    });
    const laserLine = new THREE.Line(lGeo, lMat);
    laserLine.frustumCulled = false;
    scene.add(laserLine);
    enemy.laserLine = laserLine;

    enemies.push(enemy);
    return enemy;
  }

  function spawnHound(x, z) {
    const root = new THREE.Group();
    root.position.set(x, 0, z);
    scene.add(root);

    const bodyGroup = new THREE.Group();
    bodyGroup.position.y = 0.78;
    root.add(bodyGroup);

    const enemy = {
      type: 'hound',
      name: '猎犬四足机甲',
      root,
      bodyGroup,
      pos: root.position,
      vel: new THREE.Vector3(),
      hp: 130,
      maxHp: 130,
      shield: 0,
      maxShield: 0,
      stunTimer: 0,
      hitFlash: 0,
      fireCooldown: 1.0 + Math.random() * 1.2,
      burstLeft: 0,
      burstTimer: 0,
      gaitPhase: Math.random() * Math.PI * 2,
      flankSign: Math.random() < 0.5 ? 1 : -1,
      dying: false,
      deathTimer: 0,
      legs: [],
      eyeMat: mats.redEmissive.clone(),
    };

    // Angular Quadruped Chassis
    const torso = tagHitbox(
      new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.36, 1.18), mats.mechArmor),
      enemy,
      false
    );
    torso.castShadow = true;
    bodyGroup.add(torso);

    const spinePlate = tagHitbox(
      new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.12, 0.88), mats.craneYellow),
      enemy,
      false
    );
    spinePlate.position.set(0, 0.22, -0.05);
    bodyGroup.add(spinePlate);

    // Armored Sensor Head + Glowing Crimson Visor (Critical 2.2x Weakspot!)
    const head = tagHitbox(
      new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.28, 0.44), mats.mechDarkJoint),
      enemy,
      true
    );
    head.position.set(0, 0.10, 0.68);
    bodyGroup.add(head);

    const visor = tagHitbox(
      new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.11, 0.14), enemy.eyeMat),
      enemy,
      true
    );
    visor.position.set(0, 0.11, 0.86);
    bodyGroup.add(visor);

    // Dorsal Micro-Turret
    const turret = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.48, 8), mats.gunSteel);
    turret.rotation.x = Math.PI / 2;
    turret.position.set(0, 0.34, 0.32);
    bodyGroup.add(turret);

    // 4 Articulated Two-Segment Legs (FL, FR, BL, BR)
    const legOffsets = [
      { x: -0.34, z: 0.42, phase: 0 },
      { x: 0.34, z: 0.42, phase: Math.PI },
      { x: -0.34, z: -0.42, phase: Math.PI },
      { x: 0.34, z: -0.42, phase: 0 },
    ];
    legOffsets.forEach((lo) => {
      const hip = new THREE.Group();
      hip.position.set(lo.x, -0.06, lo.z);
      bodyGroup.add(hip);

      const thigh = tagHitbox(
        new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.42, 0.15), mats.mechArmor),
        enemy,
        false
      );
      thigh.position.set(0, -0.18, 0);
      thigh.rotation.x = -0.28;
      hip.add(thigh);

      const knee = new THREE.Group();
      knee.position.set(0, -0.36, 0.08);
      hip.add(knee);

      const shin = tagHitbox(
        new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.44, 0.11), mats.mechDarkJoint),
        enemy,
        false
      );
      shin.position.set(0, -0.20, -0.04);
      shin.rotation.x = 0.36;
      knee.add(shin);

      enemy.legs.push({ hip, knee, phaseOffset: lo.phase });
    });

    enemies.push(enemy);
    return enemy;
  }

  function spawnHarbormasterBoss(x, z) {
    const root = new THREE.Group();
    root.position.set(x, 0, z);
    scene.add(root);

    const bodyGroup = new THREE.Group();
    bodyGroup.position.y = 2.05;
    root.add(bodyGroup);

    const shieldMat = new THREE.MeshBasicMaterial({
      color: 0x24e8ff,
      transparent: true,
      opacity: 0.18,
      wireframe: true,
    });

    const enemy = {
      type: 'boss',
      name: '港务官重装机甲 · HARBORMASTER',
      root,
      bodyGroup,
      pos: root.position,
      vel: new THREE.Vector3(),
      hp: 620,
      maxHp: 620,
      shield: 260,
      maxShield: 260,
      stunTimer: 0,
      hitFlash: 0,
      fireCooldown: 1.4,
      burstLeft: 0,
      burstTimer: 0,
      gaitPhase: 0,
      dying: false,
      deathTimer: 0,
      legs: [],
      eyeMat: mats.amberEmissive.clone(),
      coreMat: mats.redEmissive.clone(),
      shieldMesh: null,
      gatlingBarrel: null,
    };

    // Heavy Bipedal Armored Upper Chassis
    const chest = tagHitbox(
      new THREE.Mesh(new THREE.BoxGeometry(1.65, 1.35, 1.15), mats.bossArmor),
      enemy,
      false
    );
    chest.castShadow = true;
    bodyGroup.add(chest);

    // Shoulder Pauldrons + Hazard Beacons
    [-1.05, 1.05].forEach((sx) => {
      const pauldron = tagHitbox(
        new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.72, 1.05), mats.hazardStripe),
        enemy,
        false
      );
      pauldron.position.set(sx, 0.35, 0);
      bodyGroup.add(pauldron);

      const strobe = new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 8), enemy.eyeMat);
      strobe.position.set(sx, 0.82, 0);
      bodyGroup.add(strobe);
    });

    // Glowing Chest Fusion Core & Armored Head Visor (2.4x Critical Weakspots!)
    const core = tagHitbox(
      new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.22, 14), enemy.coreMat),
      enemy,
      true
    );
    core.rotation.x = Math.PI / 2;
    core.position.set(0, 0.08, 0.56);
    bodyGroup.add(core);

    const head = tagHitbox(
      new THREE.Mesh(new THREE.BoxGeometry(0.68, 0.42, 0.58), mats.mechDarkJoint),
      enemy,
      true
    );
    head.position.set(0, 0.88, 0.18);
    bodyGroup.add(head);

    const visor = tagHitbox(
      new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.14, 0.12), enemy.coreMat),
      enemy,
      true
    );
    visor.position.set(0, 0.88, 0.48);
    bodyGroup.add(visor);

    // Right-Arm Rotary Autocannon
    const gunArm = new THREE.Group();
    gunArm.position.set(1.28, -0.1, 0.45);
    bodyGroup.add(gunArm);
    const housing = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.38, 0.9), mats.gunmetal);
    gunArm.add(housing);
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 1.15, 10), mats.gunSteel);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.z = 0.75;
    gunArm.add(barrel);
    enemy.gatlingBarrel = barrel;

    // Heavy Bipedal Striding Legs
    [-0.52, 0.52].forEach((lx, idx) => {
      const hip = new THREE.Group();
      hip.position.set(lx, -0.68, 0);
      bodyGroup.add(hip);

      const thigh = tagHitbox(
        new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.82, 0.48), mats.bossArmor),
        enemy,
        false
      );
      thigh.position.y = -0.35;
      hip.add(thigh);

      const knee = new THREE.Group();
      knee.position.set(0, -0.72, 0);
      hip.add(knee);

      const shin = tagHitbox(
        new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.85, 0.52), mats.mechDarkJoint),
        enemy,
        false
      );
      shin.position.y = -0.38;
      knee.add(shin);

      enemy.legs.push({ hip, knee, phaseOffset: idx * Math.PI });
    });

    // Translucent Energy Shield Dome (vulnerable to EMP [Q]!)
    const shieldMesh = new THREE.Mesh(new THREE.IcosahedronGeometry(2.35, 2), shieldMat);
    shieldMesh.position.y = -0.15;
    bodyGroup.add(shieldMesh);
    enemy.shieldMesh = shieldMesh;

    enemies.push(enemy);
    return enemy;
  }

  // ─────────────────── 2. Dynamic Rain Storm System (Indoor-Aware!) ───────────────────
  const RAIN_COUNT = 2600;
  const rainPositions = new Float32Array(RAIN_COUNT * 6);
  const rainSeeds = new Float32Array(RAIN_COUNT * 3);
  for (let i = 0; i < RAIN_COUNT; i++) {
    rainSeeds[i * 3] = (Math.random() - 0.5) * 48;
    rainSeeds[i * 3 + 1] = Math.random() * 24;
    rainSeeds[i * 3 + 2] = (Math.random() - 0.5) * 48;
  }
  const rainGeo = new THREE.BufferGeometry();
  rainGeo.setAttribute('position', new THREE.BufferAttribute(rainPositions, 3));
  const rainMat = new THREE.LineBasicMaterial({
    color: 0x8fb8d8,
    transparent: true,
    opacity: 0.32,
    depthWrite: false,
  });
  const rainLines = new THREE.LineSegments(rainGeo, rainMat);
  rainLines.frustumCulled = false;
  scene.add(rainLines);

  function updateRain(dt, playerPos, enabled = true) {
    rainLines.visible = enabled;
    if (!enabled) return;
    const arr = rainGeo.attributes.position.array;
    const fall = 27.0 * dt;
    const windX = 2.8 * dt;

    for (let i = 0; i < RAIN_COUNT; i++) {
      let ox = rainSeeds[i * 3] + windX;
      let oy = rainSeeds[i * 3 + 1] - fall;
      let oz = rainSeeds[i * 3 + 2];

      if (oy < 0) {
        oy += 24;
        ox = (Math.random() - 0.5) * 48;
        oz = (Math.random() - 0.5) * 48;
      }
      if (ox > 24) ox -= 48;
      rainSeeds[i * 3] = ox;
      rainSeeds[i * 3 + 1] = oy;
      rainSeeds[i * 3 + 2] = oz;

      const wx = playerPos.x + ox;
      const wz = playerPos.z + oz;

      // Suppress rain streaks beneath the Warehouse Roof so indoors stays dry!
      const indoor = world.isIndoor(wx, 1.0, wz) > 0.5 && oy < 7.9;
      const idx = i * 6;
      if (indoor) {
        arr[idx] = arr[idx + 3] = wx;
        arr[idx + 1] = arr[idx + 4] = -10;
        arr[idx + 2] = arr[idx + 5] = wz;
      } else {
        arr[idx] = wx;
        arr[idx + 1] = oy;
        arr[idx + 2] = wz;
        arr[idx + 3] = wx - 0.085;
        arr[idx + 4] = oy + 0.78;
        arr[idx + 5] = wz;
      }
    }
    rainGeo.attributes.position.needsUpdate = true;
  }

  // ─────────────────── 3. Combat Particles, Tracers, EMP & Pickups ───────────────────
  function spawnSparks(pos, count = 8, isCyan = false, speed = 7) {
    const mat = isCyan ? sparkCyanMat : sparkOrangeMat;
    for (let i = 0; i < count; i++) {
      const m = new THREE.Mesh(sharedSparkGeo, mat);
      m.position.copy(pos);
      const vel = new THREE.Vector3(
        (Math.random() - 0.5) * speed,
        Math.random() * speed * 0.8 + 1.2,
        (Math.random() - 0.5) * speed
      );
      m.lookAt(pos.clone().add(vel));
      scene.add(m);
      particles.push({ mesh: m, vel, life: 0.25 + Math.random() * 0.25 });
    }
  }

  function spawnTracer(start, end, color = 0xffcb78) {
    const dist = start.distanceTo(end);
    const mat = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.85,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const geo = new THREE.CylinderGeometry(0.014, 0.014, Math.min(dist, 28), 5);
    geo.rotateX(Math.PI / 2);
    const mesh = new THREE.Mesh(geo, mat);
    const mid = start.clone().lerp(end, 0.5);
    mesh.position.copy(mid);
    mesh.lookAt(end);
    scene.add(mesh);
    tracers.push({ mesh, mat, life: 0.065 });
  }

  function spawnPickup(pos) {
    const g = new THREE.Group();
    g.position.set(pos.x, Math.max(0.45, pos.y), pos.z);
    const core = new THREE.Mesh(new THREE.OctahedronGeometry(0.24, 0), mats.greenEmissive);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.03, 6, 16), mats.cyanEmissive);
    ring.rotation.x = Math.PI / 2;
    g.add(core, ring);
    scene.add(g);
    pickups.push({ group: g, core, pos: g.position, life: 28 });
  }

  function launchEmpGrenade(origin, dir) {
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.11, 10, 10), mats.cyanEmissive);
    mesh.position.copy(origin);
    scene.add(mesh);
    projectiles.push({
      isEmp: true,
      mesh,
      pos: mesh.position,
      vel: dir.clone().multiplyScalar(21).add(new THREE.Vector3(0, 3.8, 0)),
      life: 1.6,
    });
  }

  function detonateEmp(center) {
    sound.playEmpBlast();
    spawnSparks(center, 26, true, 13);

    const swMat = new THREE.MeshBasicMaterial({
      color: 0x26e8ff,
      transparent: true,
      opacity: 0.55,
      wireframe: true,
    });
    const swMesh = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 2), swMat);
    swMesh.position.copy(center);
    scene.add(swMesh);
    shockwaves.push({ mesh: swMesh, mat: swMat, radius: 0.5, maxRadius: 15.5, life: 0.45 });

    let stunnedCount = 0;
    enemies.forEach((e) => {
      if (e.dying) return;
      const d = e.pos.distanceTo(center);
      if (d <= 15.5) {
        stunnedCount++;
        e.stunTimer = 3.6;
        // Strip all shields (counters Harbormaster Boss!) + deal electromagnetic shock damage
        if (e.shield > 0) {
          e.shield = 0;
          if (e.shieldMesh) e.shieldMesh.visible = false;
        }
        damageEnemy(e, 55, false, center);
      }
    });
    return stunnedCount;
  }

  // Apply bullet or EMP damage to an enemy
  let statsCallback = null;
  function setStatsCallback(cb) {
    statsCallback = cb;
  }

  function damageEnemy(enemy, rawDamage, isCrit = false, hitPoint = null) {
    if (enemy.dying) return { killed: false, crit: false };

    let dmg = isCrit ? rawDamage * 2.25 : rawDamage;
    enemy.hitFlash = 0.12;

    if (enemy.shield > 0) {
      const absorbed = Math.min(enemy.shield, dmg);
      enemy.shield -= absorbed;
      dmg -= absorbed * 0.85;
      if (hitPoint) spawnSparks(hitPoint, 6, true, 6);
      if (enemy.shield <= 0 && enemy.shieldMesh) {
        enemy.shieldMesh.visible = false;
        spawnSparks(enemy.pos.clone().add(new THREE.Vector3(0, 1.8, 0)), 18, true, 10);
      }
    } else if (hitPoint) {
      spawnSparks(hitPoint, isCrit ? 11 : 5, false, isCrit ? 9 : 6);
    }

    enemy.hp -= dmg;
    if (enemy.hp <= 0) {
      enemy.dying = true;
      enemy.deathTimer = enemy.type === 'gull' ? 0.55 : 0.35;
      if (enemy.laserLine) enemy.laserLine.material.opacity = 0;
      untagEnemyMeshes(enemy);
      sound.playExplosion(enemy.type === 'boss' ? 1.45 : 0.85);
      spawnSparks(
        enemy.pos.clone().add(new THREE.Vector3(0, enemy.type === 'boss' ? 1.8 : 0.5, 0)),
        enemy.type === 'boss' ? 32 : 16,
        false,
        11
      );
      if (statsCallback) statsCallback({ event: 'kill', enemy, isCrit });
      return { killed: true, crit: isCrit };
    }
    return { killed: false, crit: isCrit };
  }

  // ─────────────────── 4. Enemy Tactical AI & Frame Update ───────────────────
  function update(dt, time, playerPos, playerAlive, onPlayerHit, onPickupCollected) {
    let activeCombatThreat = 0;

    for (let i = enemies.length - 1; i >= 0; i--) {
      const e = enemies[i];

      // Death animation & cleanup
      if (e.dying) {
        e.deathTimer -= dt;
        if (e.type === 'gull') {
          e.pos.y -= 6.5 * dt;
          e.bodyGroup.rotation.z += 9.0 * dt;
          e.bodyGroup.rotation.x += 5.0 * dt;
        } else {
          e.bodyGroup.rotation.z += 3.5 * dt;
          e.bodyGroup.position.y = Math.max(0.2, e.bodyGroup.position.y - 1.5 * dt);
        }
        if (e.deathTimer <= 0) {
          spawnSparks(e.pos.clone().add(new THREE.Vector3(0, 0.4, 0)), 12, false, 8);
          spawnPickup(new THREE.Vector3(e.pos.x, 0.45, e.pos.z));
          scene.remove(e.root);
          if (e.laserLine) scene.remove(e.laserLine);
          enemies.splice(i, 1);
        }
        continue;
      }

      // Hit flash & EMP stun visual
      if (e.hitFlash > 0) {
        e.hitFlash -= dt;
        e.eyeMat.emissiveIntensity = 6.5;
      } else {
        e.eyeMat.emissiveIntensity = e.stunTimer > 0 ? 0.3 : 3.6;
      }

      if (e.stunTimer > 0) {
        e.stunTimer -= dt;
        if (e.laserLine) e.laserLine.material.opacity = 0;
        if (Math.random() < 0.25) {
          spawnSparks(e.pos.clone().add(new THREE.Vector3(0, 0.8, 0)), 1, true, 4);
        }
        continue;
      }

      const toPlayer = playerPos.clone().sub(e.pos);
      const flatDist = Math.hypot(toPlayer.x, toPlayer.z);
      const eyeOrigin = e.pos.clone().add(new THREE.Vector3(0, e.type === 'gull' ? 0 : e.type === 'boss' ? 2.2 : 0.85, 0));
      const playerTarget = playerPos.clone().add(new THREE.Vector3(0, 1.35, 0));
      const hasLOS = flatDist < 62 && world.hasLineOfSight(eyeOrigin, playerTarget);

      if (flatDist < 48) {
        activeCombatThreat = Math.max(activeCombatThreat, hasLOS ? 1.0 : 0.55);
      }

      // ─── AI Type 1: GULL Aerial Recon/Strike Drone ───
      if (e.type === 'gull') {
        e.rotors.forEach((r) => { r.rotation.y += dt * 38; });

        const targetAlt = 4.2 + Math.sin(time * 2.1 + e.hoverSeed) * 0.55;
        e.strafeTimer -= dt;
        if (e.strafeTimer <= 0) {
          e.strafeDir *= -1;
          e.strafeTimer = 2.0 + Math.random() * 2.2;
        }

        const desiredDist = 17;
        const fwd = new THREE.Vector3(toPlayer.x, 0, toPlayer.z).normalize();
        const right = new THREE.Vector3(-fwd.z, 0, fwd.x);
        const pull = clamp((flatDist - desiredDist) * 0.35, -3.5, 4.8);

        const desiredVel = fwd.multiplyScalar(pull).addScaledVector(right, e.strafeDir * 4.2);
        e.vel.x = damp(e.vel.x, desiredVel.x, 3.5, dt);
        e.vel.z = damp(e.vel.z, desiredVel.z, 3.5, dt);
        e.vel.y = damp(e.vel.y, (targetAlt - e.pos.y) * 2.5, 4.0, dt);

        e.pos.addScaledVector(e.vel, dt);
        e.pos.x = clamp(e.pos.x, -58, 60);
        e.pos.z = clamp(e.pos.z, -50, 50);

        // Face player & bank physically with velocity
        const yaw = Math.atan2(toPlayer.x, toPlayer.z);
        e.root.rotation.y = yaw;
        e.bodyGroup.rotation.z = clamp(-e.strafeDir * 0.22, -0.35, 0.35);
        e.bodyGroup.rotation.x = 0.12;

        // Telegraph Laser Lock -> Fire Burst
        if (playerAlive && hasLOS && flatDist < 48) {
          e.fireCooldown -= dt;
          if (e.fireCooldown <= 0) {
            if (e.chargeTimer === 0) sound.playDroneLock();
            e.chargeTimer += dt;

            // Update red targeting laser beam
            const posAttr = e.laserLine.geometry.attributes.position;
            posAttr.setXYZ(0, e.pos.x, e.pos.y - 0.08, e.pos.z);
            posAttr.setXYZ(1, playerTarget.x, playerTarget.y - 0.15, playerTarget.z);
            posAttr.needsUpdate = true;
            e.laserLine.material.opacity = 0.55 + Math.sin(time * 40) * 0.3;

            if (e.chargeTimer >= 0.65) {
              e.chargeTimer = 0;
              e.fireCooldown = 2.1 + Math.random() * 1.1;
              e.laserLine.material.opacity = 0;
              fireEnemyBolt(eyeOrigin, playerTarget, 'gull', 32, 9);
            }
          } else {
            e.laserLine.material.opacity = 0;
          }
        } else {
          e.chargeTimer = 0;
          e.laserLine.material.opacity = 0;
        }
      }

      // ─── AI Type 2 & 3: HOUND Quadruped & HARBORMASTER Boss ───
      else {
        const isBoss = e.type === 'boss';
        const moveSpd = isBoss ? 3.3 : 6.4;
        const stopDist = isBoss ? 14.0 : 9.5;

        if (e.shieldMesh && e.shield > 0) {
          e.shieldMesh.rotation.y += dt * 0.8;
        }
        if (e.gatlingBarrel) {
          e.gatlingBarrel.rotation.z += dt * (e.burstLeft > 0 ? 22 : 3);
        }

        const fwd = new THREE.Vector3(toPlayer.x, 0, toPlayer.z);
        const len = fwd.length() || 1;
        fwd.divideScalar(len);
        const side = new THREE.Vector3(-fwd.z, 0, fwd.x);

        let moveVec = new THREE.Vector3();
        if (flatDist > stopDist || !hasLOS) {
          moveVec.addScaledVector(fwd, moveSpd);
          moveVec.addScaledVector(side, (isBoss ? 0.6 : 2.3) * (e.flankSign || 1));
        } else {
          moveVec.addScaledVector(side, (isBoss ? 1.1 : 3.4) * Math.sin(time * 1.4 + i));
        }

        const prevX = e.pos.x;
        const prevZ = e.pos.z;
        e.pos.x += moveVec.x * dt;
        e.pos.z += moveVec.z * dt;
        world.resolveAgentHorizontal(e.pos, isBoss ? 1.35 : 0.68);

        // If blocked by container, flip flank sign to steer cleanly around cover!
        const actualMoved = Math.hypot(e.pos.x - prevX, e.pos.z - prevZ);
        if (actualMoved < moveSpd * dt * 0.25 && e.flankSign) {
          if (Math.random() < 0.08) e.flankSign *= -1;
        }

        // Smoothly face movement or player
        const targetYaw = Math.atan2(toPlayer.x, toPlayer.z);
        e.root.rotation.y = targetYaw;

        // Procedural Articulated Leg Gait Animation
        e.gaitPhase += actualMoved * (isBoss ? 2.4 : 4.6);
        e.legs.forEach((leg) => {
          const s = Math.sin(e.gaitPhase + leg.phaseOffset);
          const c = Math.cos(e.gaitPhase + leg.phaseOffset);
          leg.hip.rotation.x = s * (isBoss ? 0.38 : 0.55) - (isBoss ? 0 : 0.18);
          leg.knee.rotation.x = Math.max(0, c) * (isBoss ? 0.42 : 0.55) + (isBoss ? 0.1 : 0.28);
        });
        e.bodyGroup.position.y = (isBoss ? 2.05 : 0.78) + Math.abs(Math.sin(e.gaitPhase)) * (isBoss ? 0.07 : 0.05);

        // Burst Weapon Firing
        if (playerAlive && hasLOS && flatDist < 50) {
          e.fireCooldown -= dt;
          if (e.fireCooldown <= 0 && e.burstLeft <= 0) {
            e.burstLeft = isBoss ? 6 : 3;
            e.burstTimer = 0;
            e.fireCooldown = isBoss ? 2.2 : 1.9 + Math.random() * 0.9;
          }
        }
        if (e.burstLeft > 0) {
          e.burstTimer -= dt;
          if (e.burstTimer <= 0) {
            e.burstLeft--;
            e.burstTimer = isBoss ? 0.11 : 0.14;
            fireEnemyBolt(
              eyeOrigin,
              playerTarget,
              e.type,
              isBoss ? 36 : 30,
              isBoss ? 8 : 7
            );
          }
        }
      }
    }

    // Update Enemy Bolts & Player EMP Projectile
    for (let i = projectiles.length - 1; i >= 0; i--) {
      const p = projectiles[i];
      p.life -= dt;

      if (p.isEmp) {
        p.vel.y -= 12.5 * dt;
        const nextPos = p.pos.clone().addScaledVector(p.vel, dt);
        if (nextPos.y <= 0.15 || !world.hasLineOfSight(p.pos, nextPos) || p.life <= 0) {
          detonateEmp(new THREE.Vector3(p.pos.x, Math.max(0.25, p.pos.y), p.pos.z));
          scene.remove(p.mesh);
          projectiles.splice(i, 1);
          continue;
        }
        p.pos.copy(nextPos);
        continue;
      }

      const nextPos = p.pos.clone().addScaledVector(p.vel, dt);
      // Check world obstacle block
      if (!world.hasLineOfSight(p.pos, nextPos) || p.life <= 0) {
        spawnSparks(p.pos, 3, false, 4);
        scene.remove(p.mesh);
        projectiles.splice(i, 1);
        continue;
      }

      // Check player hit / near-miss whiz
      if (playerAlive) {
        const pCenter = playerPos.clone().add(new THREE.Vector3(0, 1.15, 0));
        const d = nextPos.distanceTo(pCenter);
        if (d < 0.62) {
          if (onPlayerHit) onPlayerHit(p.damage, p.origin);
          scene.remove(p.mesh);
          projectiles.splice(i, 1);
          continue;
        } else if (!p.whizzed && d < 2.2) {
          p.whizzed = true;
          sound.playBulletWhiz();
        }
      }
      p.pos.copy(nextPos);
    }

    // Update Tracers
    for (let i = tracers.length - 1; i >= 0; i--) {
      const tr = tracers[i];
      tr.life -= dt;
      tr.mat.opacity = Math.max(0, (tr.life / 0.065) * 0.85);
      if (tr.life <= 0) {
        scene.remove(tr.mesh);
        tr.mesh.geometry.dispose();
        tr.mat.dispose();
        tracers.splice(i, 1);
      }
    }

    // Update Sparks / Debris Particles
    for (let i = particles.length - 1; i >= 0; i--) {
      const pt = particles[i];
      pt.life -= dt;
      if (pt.life <= 0) {
        scene.remove(pt.mesh);
        particles.splice(i, 1);
        continue;
      }
      pt.vel.y -= 16 * dt;
      pt.mesh.position.addScaledVector(pt.vel, dt);
      if (pt.mesh.position.y < 0.03) {
        pt.mesh.position.y = 0.03;
        pt.vel.y *= -0.35;
      }
    }

    // Update Expanding EMP Shockwaves
    for (let i = shockwaves.length - 1; i >= 0; i--) {
      const sw = shockwaves[i];
      sw.life -= dt;
      const u = 1.0 - clamp(sw.life / 0.45, 0, 1);
      const r = lerp(0.5, sw.maxRadius, u);
      sw.mesh.scale.setScalar(r);
      sw.mat.opacity = (1 - u) * 0.55;
      if (sw.life <= 0) {
        scene.remove(sw.mesh);
        sw.mesh.geometry.dispose();
        sw.mat.dispose();
        shockwaves.splice(i, 1);
      }
    }

    // Update Dropped Pickups (magnetic pull within 4.0m)
    for (let i = pickups.length - 1; i >= 0; i--) {
      const pk = pickups[i];
      pk.life -= dt;
      pk.core.rotation.y += dt * 2.8;
      pk.group.position.y = 0.45 + Math.sin(time * 3.5 + i) * 0.08;
      const d = pk.pos.distanceTo(playerPos);
      if (d < 4.2 && playerAlive) {
        pk.pos.lerp(playerPos.clone().add(new THREE.Vector3(0, 0.9, 0)), dt * 9);
        if (d < 1.25) {
          sound.playPickup();
          if (onPickupCollected) onPickupCollected();
          scene.remove(pk.group);
          pickups.splice(i, 1);
          continue;
        }
      }
      if (pk.life <= 0) {
        scene.remove(pk.group);
        pickups.splice(i, 1);
      }
    }

    sound.setCombatIntensity(activeCombatThreat);
  }

  function fireEnemyBolt(origin, target, kind, speed, damage) {
    sound.playEnemyFire(kind);
    const spread = kind === 'boss' ? 0.065 : 0.055;
    const dir = target.clone().sub(origin).normalize();
    dir.x += (Math.random() - 0.5) * spread;
    dir.y += (Math.random() - 0.5) * spread * 0.7;
    dir.z += (Math.random() - 0.5) * spread;
    dir.normalize();

    const mesh = new THREE.Mesh(enemyBoltGeo, enemyBoltMat);
    mesh.position.copy(origin);
    scene.add(mesh);
    projectiles.push({
      isEmp: false,
      mesh,
      pos: mesh.position,
      origin: origin.clone(),
      vel: dir.multiplyScalar(speed),
      damage,
      life: 2.2,
      whizzed: false,
    });
  }

  function clearAll() {
    enemies.forEach((e) => {
      scene.remove(e.root);
      if (e.laserLine) scene.remove(e.laserLine);
    });
    enemies.length = 0;
    enemyHitMeshes.length = 0;
    projectiles.forEach((p) => scene.remove(p.mesh));
    projectiles.length = 0;
    pickups.forEach((pk) => scene.remove(pk.group));
    pickups.length = 0;
  }

  return {
    enemies,
    enemyHitMeshes,
    spawnGull,
    spawnHound,
    spawnHarbormasterBoss,
    spawnSparks,
    spawnTracer,
    launchEmpGrenade,
    damageEnemy,
    setStatsCallback,
    updateRain,
    update,
    clearAll,
  };
}
