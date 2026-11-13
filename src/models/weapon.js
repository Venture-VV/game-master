import * as THREE from 'three';
import { clamp, lerp, damp } from '../math/noise.js';

export function createWeaponRig(camera, scene, mats) {
  // Root attached to camera
  const rigHolder = new THREE.Group();
  camera.add(rigHolder);

  const weaponRoot = new THREE.Group();
  rigHolder.add(weaponRoot);

  // Hip-fire vs ADS optical alignment:
  // Holo reticle center in weaponRoot local space is strictly (0, +0.084, -0.03)
  const HIP_POS = new THREE.Vector3(0.205, -0.195, -0.37);
  const ADS_POS = new THREE.Vector3(0.0, -0.084, -0.23);

  function part(geo, mat, x, y, z, rx = 0, ry = 0, rz = 0, parent = weaponRoot) {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    if (rx || ry || rz) m.rotation.set(rx, ry, rz);
    m.castShadow = false;
    parent.add(m);
    return m;
  }

  // 1. Upper & Lower Billet Receiver
  part(new THREE.BoxGeometry(0.044, 0.052, 0.23), mats.gunmetal, 0, 0.008, -0.02);
  part(new THREE.BoxGeometry(0.040, 0.042, 0.16), mats.polymerBlack, 0, -0.032, 0.005);
  // Magwell flare
  part(new THREE.BoxGeometry(0.046, 0.032, 0.068), mats.gunmetal, 0, -0.045, -0.055);
  // Buffer tube & tactical collapsible stock
  part(new THREE.CylinderGeometry(0.016, 0.016, 0.17, 10), mats.gunmetal, 0, 0.012, 0.16, Math.PI / 2, 0, 0);
  part(new THREE.BoxGeometry(0.038, 0.088, 0.11), mats.polymerTan, 0, -0.012, 0.21);
  part(new THREE.BoxGeometry(0.042, 0.105, 0.022), mats.rubberBlack, 0, -0.016, 0.27);

  // Ergonomic Pistol Grip + Trigger Guard
  part(new THREE.BoxGeometry(0.032, 0.095, 0.042), mats.polymerTan, 0, -0.085, 0.058, 0.28, 0, 0);
  part(new THREE.BoxGeometry(0.012, 0.006, 0.042), mats.gunmetal, 0, -0.058, 0.015);

  // Reciprocating Bolt Carrier (visible through right-side ejection port)
  const boltMesh = part(new THREE.BoxGeometry(0.008, 0.018, 0.068), mats.gunSteel, 0.020, 0.016, -0.035);
  // Charging Handle T-latch
  const chargingHandle = part(new THREE.BoxGeometry(0.054, 0.010, 0.022), mats.gunmetal, 0, 0.034, 0.085);

  // 2. M-LOK Ventilated Handguard, Barrel & Suppressor
  part(new THREE.BoxGeometry(0.042, 0.048, 0.25), mats.gunmetal, 0, 0.010, -0.26);
  // Ventilation cooling slots along handguard sides
  for (let i = 0; i < 5; i++) {
    const sz = -0.17 - i * 0.042;
    part(new THREE.BoxGeometry(0.045, 0.012, 0.024), mats.mechDarkJoint, 0, 0.012, sz);
  }
  // Inner steel barrel
  part(new THREE.CylinderGeometry(0.009, 0.009, 0.30, 10), mats.gunSteel, 0, 0.010, -0.32, Math.PI / 2, 0, 0);

  // Tactical SOCOM Suppressor (with dynamic heat emissive material!)
  const suppressorMat = new THREE.MeshStandardMaterial({
    color: 0x262b30,
    roughness: 0.36,
    metalness: 0.85,
    emissive: new THREE.Color(0xff4810),
    emissiveIntensity: 0.0,
  });
  part(new THREE.CylinderGeometry(0.019, 0.019, 0.165, 14), suppressorMat, 0, 0.010, -0.47, Math.PI / 2, 0, 0);
  // Angled Foregrip under handguard
  part(new THREE.BoxGeometry(0.030, 0.038, 0.075), mats.polymerTan, 0, -0.026, -0.26, -0.22, 0, 0);

  // 3. Top Picatinny Rail Teeth
  for (let z = 0.07; z >= -0.36; z -= 0.022) {
    part(new THREE.BoxGeometry(0.024, 0.007, 0.012), mats.gunSteel, 0, 0.038, z);
  }

  // 4. Holographic Reflex Sight (Optical center strictly at (0, +0.084, -0.03))
  const holoGroup = new THREE.Group();
  holoGroup.position.set(0, 0.084, -0.03);
  weaponRoot.add(holoGroup);

  // Base clamp & battery housing
  part(new THREE.BoxGeometry(0.042, 0.022, 0.086), mats.gunmetal, 0, -0.033, 0, 0, 0, 0, holoGroup);
  // Protective armored hood (left, right, top — clear unobstructed window in center!)
  part(new THREE.BoxGeometry(0.006, 0.040, 0.064), mats.polymerBlack, -0.021, -0.003, 0, 0, 0, 0, holoGroup);
  part(new THREE.BoxGeometry(0.006, 0.040, 0.064), mats.polymerBlack, 0.021, -0.003, 0, 0, 0, 0, holoGroup);
  part(new THREE.BoxGeometry(0.048, 0.006, 0.064), mats.polymerBlack, 0, 0.019, 0, 0, 0, 0, holoGroup);

  // Subtle anti-reflective glass lens
  const glassMat = new THREE.MeshBasicMaterial({
    color: 0x48a8c8,
    transparent: true,
    opacity: 0.09,
    depthWrite: false,
  });
  part(new THREE.PlaneGeometry(0.036, 0.032), glassMat, 0, -0.002, -0.005, 0, 0, 0, holoGroup);

  // Crisp Procedural EOTech Holographic Reticle Texture (Circle + 4 ticks + 1-MOA center dot)
  const retCvs = document.createElement('canvas');
  retCvs.width = 128;
  retCvs.height = 128;
  const rctx = retCvs.getContext('2d');
  rctx.clearRect(0, 0, 128, 128);
  rctx.strokeStyle = '#ff3828';
  rctx.lineWidth = 3.2;
  rctx.shadowColor = '#ff2210';
  rctx.shadowBlur = 8;
  rctx.beginPath();
  rctx.arc(64, 64, 34, 0, Math.PI * 2);
  rctx.stroke();
  // 4 outer compass ticks
  [[64, 22, 64, 32], [64, 96, 64, 106], [22, 64, 32, 64], [96, 64, 106, 64]].forEach(([x1, y1, x2, y2]) => {
    rctx.beginPath();
    rctx.moveTo(x1, y1);
    rctx.lineTo(x2, y2);
    rctx.stroke();
  });
  // Precision center dot
  rctx.fillStyle = '#ff5a44';
  rctx.beginPath();
  rctx.arc(64, 64, 3.6, 0, Math.PI * 2);
  rctx.fill();

  const retTex = new THREE.CanvasTexture(retCvs);
  retTex.colorSpace = THREE.SRGBColorSpace;
  const reticleMat = new THREE.MeshBasicMaterial({
    map: retTex,
    transparent: true,
    opacity: 0.95,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const reticlePlane = part(new THREE.PlaneGeometry(0.026, 0.026), reticleMat, 0, 0.0, 0.0, 0, 0, 0, holoGroup);

  // 5. Side AN/PEQ Laser & Tactical Flashlight Module
  part(new THREE.BoxGeometry(0.024, 0.022, 0.072), mats.polymerTan, 0.031, 0.014, -0.29);
  const flashLensMat = mats.cyanEmissive.clone();
  part(new THREE.CylinderGeometry(0.008, 0.008, 0.01, 10), flashLensMat, 0.032, 0.014, -0.33, Math.PI / 2, 0, 0);

  const flashlight = new THREE.SpotLight(0xdff4ff, 55, 42, Math.PI * 0.22, 0.45, 1.3);
  flashlight.position.set(0.032, 0.014, -0.34);
  flashlight.target.position.set(0.0, 0.0, -12.0);
  weaponRoot.add(flashlight);
  weaponRoot.add(flashlight.target);

  // Subtle green/cyan tactical laser beam in hip-fire
  const laserMat = new THREE.MeshBasicMaterial({
    color: 0x24f0c8,
    transparent: true,
    opacity: 0.22,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const laserBeam = new THREE.Mesh(new THREE.CylinderGeometry(0.0014, 0.0014, 14, 6), laserMat);
  laserBeam.rotation.x = Math.PI / 2;
  laserBeam.position.set(0.031, 0.022, -7.34);
  weaponRoot.add(laserBeam);

  // 6. Detachable Curved Polymer Magazine (Animated during 3-stage reload!)
  const magGroup = new THREE.Group();
  magGroup.position.set(0, -0.105, -0.062);
  weaponRoot.add(magGroup);
  part(new THREE.BoxGeometry(0.028, 0.135, 0.056), mats.polymerBlack, 0, 0, 0, -0.16, 0, 0, magGroup);
  // Visible brass cartridges window
  part(new THREE.BoxGeometry(0.030, 0.075, 0.016), mats.brass, 0, 0.005, 0, -0.16, 0, 0, magGroup);

  // 7. First-Person Tactical Armored Gauntlet / Support Hand & Right Hand
  const gloveMat = new THREE.MeshStandardMaterial({
    color: 0x1a2026,
    roughness: 0.58,
    metalness: 0.25,
  });
  const sleeveMat = new THREE.MeshStandardMaterial({
    color: 0x232d36,
    roughness: 0.75,
    metalness: 0.1,
  });

  // Left support arm & gloved hand gripping handguard (pivots slightly during reload!)
  const leftArmGroup = new THREE.Group();
  weaponRoot.add(leftArmGroup);
  part(new THREE.BoxGeometry(0.054, 0.048, 0.068), gloveMat, -0.012, -0.022, -0.25, 0.1, 0.18, -0.2, leftArmGroup);
  part(new THREE.CylinderGeometry(0.036, 0.044, 0.28, 10), sleeveMat, -0.095, -0.115, -0.11, 0.95, 0.38, -0.45, leftArmGroup);
  // Armored knuckle plate
  part(new THREE.BoxGeometry(0.045, 0.012, 0.045), mats.mechArmor, -0.026, -0.036, -0.25, 0.1, 0.18, -0.2, leftArmGroup);

  // Right trigger hand & forearm
  part(new THREE.BoxGeometry(0.048, 0.054, 0.062), gloveMat, 0.006, -0.068, 0.052, 0.25, 0, 0);
  part(new THREE.CylinderGeometry(0.038, 0.046, 0.26, 10), sleeveMat, 0.055, -0.135, 0.19, 1.18, -0.22, 0.15);

  // 8. 3D Star Muzzle Flash + Dynamic Muzzle Light
  const flashMat = new THREE.MeshBasicMaterial({
    color: 0xffb84d,
    transparent: true,
    opacity: 0.0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const muzzleFlash = new THREE.Group();
  muzzleFlash.position.set(0, 0.010, -0.57);
  weaponRoot.add(muzzleFlash);

  const fPlane1 = new THREE.Mesh(new THREE.PlaneGeometry(0.19, 0.19), flashMat);
  const fPlane2 = new THREE.Mesh(new THREE.PlaneGeometry(0.08, 0.28), flashMat);
  fPlane2.rotation.y = Math.PI / 2;
  fPlane2.position.z = -0.08;
  const fPlane3 = fPlane2.clone();
  fPlane3.rotation.z = Math.PI / 2;
  muzzleFlash.add(fPlane1, fPlane2, fPlane3);

  const muzzleLight = new THREE.PointLight(0xff9e3d, 0, 14, 1.8);
  muzzleLight.position.set(0, 0.02, -0.58);
  weaponRoot.add(muzzleLight);

  // 9. World-Space Ejected Brass Shell Casings Pool
  const shellPool = [];
  const shellGeo = new THREE.CylinderGeometry(0.0055, 0.0055, 0.028, 7);
  shellGeo.rotateZ(Math.PI / 2);
  for (let i = 0; i < 24; i++) {
    const sm = new THREE.Mesh(shellGeo, mats.brass);
    sm.visible = false;
    scene.add(sm);
    shellPool.push({
      mesh: sm,
      vel: new THREE.Vector3(),
      rotVel: new THREE.Vector3(),
      life: 0,
      active: false,
    });
  }
  let shellIdx = 0;

  // Animation state
  const state = {
    ads: 0,
    recoilPosZ: 0,
    recoilPitch: 0,
    recoilRoll: 0,
    boltOffset: 0,
    flashTimer: 0,
    barrelHeat: 0,
    swayX: 0,
    swayY: 0,
    bobPhase: 0,
    flashlightOn: true,
    // Reload state
    reloading: false,
    reloadTimer: 0,
    reloadDuration: 1.75,
    reloadStagePlayed: -1,
  };

  function toggleFlashlight() {
    state.flashlightOn = !state.flashlightOn;
    flashlight.visible = state.flashlightOn;
    flashLensMat.emissiveIntensity = state.flashlightOn ? 3.2 : 0.1;
    return state.flashlightOn;
  }

  function triggerShot(adsAmount) {
    state.recoilPosZ = Math.min(0.065, state.recoilPosZ + (adsAmount > 0.5 ? 0.026 : 0.038));
    state.recoilPitch = Math.min(0.11, state.recoilPitch + (adsAmount > 0.5 ? 0.022 : 0.038));
    state.recoilRoll += (Math.random() - 0.5) * 0.045;
    state.boltOffset = 0.048;
    state.flashTimer = 0.042;
    state.barrelHeat = Math.min(1.0, state.barrelHeat + 0.085);
    muzzleFlash.rotation.z = Math.random() * Math.PI * 2;

    // Eject spinning brass casing to the right-rear in world space
    const s = shellPool[shellIdx];
    shellIdx = (shellIdx + 1) % shellPool.length;
    const ejectWorld = new THREE.Vector3(0.04, 0.02, -0.04);
    weaponRoot.localToWorld(ejectWorld);
    s.mesh.position.copy(ejectWorld);
    s.mesh.visible = true;
    s.active = true;
    s.life = 1.6;

    const rightDir = new THREE.Vector3(1, 0.45 + Math.random() * 0.25, 0.15 + (Math.random() - 0.5) * 0.2);
    rightDir.applyQuaternion(camera.quaternion);
    s.vel.copy(rightDir).multiplyScalar(2.6 + Math.random() * 1.1);
    s.rotVel.set(Math.random() * 24, Math.random() * 24, Math.random() * 24);
  }

  function startReload() {
    if (state.reloading) return false;
    state.reloading = true;
    state.reloadTimer = 0;
    state.reloadStagePlayed = -1;
    return true;
  }

  function addMouseSway(dx, dy) {
    state.swayX = clamp(state.swayX - dx * 0.00018, -0.028, 0.028);
    state.swayY = clamp(state.swayY + dy * 0.00018, -0.028, 0.028);
  }

  function update(dt, time, inputInfo, onReloadStage, onReloadComplete) {
    const { moveSpeed, maxSpeed, sprinting, sliding, adsHeld, grounded } = inputInfo;

    // Smooth ADS interpolation (disabled while reloading or sprinting)
    const wantAds = adsHeld && !state.reloading && !sprinting ? 1.0 : 0.0;
    state.ads = damp(state.ads, wantAds, 16, dt);

    // Recover recoil & mouse sway
    state.recoilPosZ = damp(state.recoilPosZ, 0, 18, dt);
    state.recoilPitch = damp(state.recoilPitch, 0, 15, dt);
    state.recoilRoll = damp(state.recoilRoll, 0, 16, dt);
    state.boltOffset = damp(state.boltOffset, 0, 28, dt);
    state.swayX = damp(state.swayX, 0, 10, dt);
    state.swayY = damp(state.swayY, 0, 10, dt);
    state.barrelHeat = Math.max(0, state.barrelHeat - dt * 0.18);
    suppressorMat.emissiveIntensity = state.barrelHeat * 1.35;

    boltMesh.position.z = -0.035 + state.boltOffset;

    // Muzzle flash decay
    if (state.flashTimer > 0) {
      state.flashTimer -= dt;
      const f = clamp(state.flashTimer / 0.042, 0, 1);
      flashMat.opacity = f * 0.92;
      muzzleLight.intensity = f * 18;
    } else {
      flashMat.opacity = 0;
      muzzleLight.intensity = 0;
    }

    // Laser visibility (crisp in hipfire, dimmed in ADS so reticle stays pure)
    laserMat.opacity = state.flashlightOn ? lerp(0.24, 0.04, state.ads) : 0.0;
    reticlePlane.material.opacity = lerp(0.65, 1.0, state.ads);

    // Walk / Sprint Figure-8 Bobbing
    const speedRatio = grounded ? clamp(moveSpeed / maxSpeed, 0, 1.35) : 0;
    if (speedRatio > 0.05 && !sliding) {
      state.bobPhase += dt * (sprinting ? 13.5 : 9.2) * Math.min(1.2, speedRatio);
    }
    const bobScale = lerp(1.0, 0.12, state.ads) * speedRatio;
    const bobX = Math.cos(state.bobPhase) * 0.009 * bobScale;
    const bobY = Math.abs(Math.sin(state.bobPhase)) * -0.011 * bobScale;

    // Idle breathing
    const breathX = Math.sin(time * 1.5) * 0.0018 * (1 - state.ads * 0.8);
    const breathY = Math.cos(time * 2.1) * 0.0022 * (1 - state.ads * 0.8);

    // Base pose interpolation (Hip <-> ADS)
    const px = lerp(HIP_POS.x, ADS_POS.x, state.ads) + bobX + breathX + state.swayX * (1 - state.ads * 0.7);
    const py = lerp(HIP_POS.y, ADS_POS.y, state.ads) + bobY + breathY + state.swayY * (1 - state.ads * 0.7);
    const pz = lerp(HIP_POS.z, ADS_POS.z, state.ads) + state.recoilPosZ;

    let rx = state.recoilPitch;
    let ry = -state.swayX * 1.6;
    let rz = state.recoilRoll - state.swayX * 1.4;

    // Sprint tactical high-low cant & Tactical Slide cant
    if (sliding) {
      rz += 0.42;
      rx += 0.08;
    } else if (sprinting && speedRatio > 0.5 && !state.reloading) {
      rx -= 0.18;
      ry += 0.34;
      rz += 0.22;
    }

    // 3-Stage Reload Procedural Choreography
    magGroup.position.set(0, -0.105, -0.062);
    leftArmGroup.position.set(0, 0, 0);
    chargingHandle.position.z = 0.085;

    if (state.reloading) {
      state.reloadTimer += dt;
      const p = clamp(state.reloadTimer / state.reloadDuration, 0, 1);

      if (p >= 0.06 && state.reloadStagePlayed < 0) {
        state.reloadStagePlayed = 0;
        if (onReloadStage) onReloadStage(0);
      }
      if (p >= 0.52 && state.reloadStagePlayed < 1) {
        state.reloadStagePlayed = 1;
        if (onReloadStage) onReloadStage(1);
      }
      if (p >= 0.80 && state.reloadStagePlayed < 2) {
        state.reloadStagePlayed = 2;
        if (onReloadStage) onReloadStage(2);
      }

      if (p < 0.36) {
        // Stage 1: Tilt rifle right, drop magazine out
        const k = Math.sin((p / 0.36) * Math.PI * 0.5);
        rz -= 0.38 * k;
        rx += 0.14 * k;
        magGroup.position.y = -0.105 - k * 0.24;
        leftArmGroup.position.set(0.06 * k, -0.12 * k, 0.14 * k);
      } else if (p < 0.68) {
        // Stage 2: Insert fresh magazine upward + lock bump
        const u = (p - 0.36) / 0.32;
        const insert = 1.0 - clamp(u * 1.35, 0, 1);
        const bump = u > 0.72 ? Math.sin(((u - 0.72) / 0.28) * Math.PI) * 0.018 : 0;
        rz -= 0.38;
        rx += 0.14 + bump * 2.5;
        magGroup.position.y = -0.105 - insert * 0.24 + bump;
        leftArmGroup.position.set(0.06, -0.08 - insert * 0.12, 0.15);
      } else {
        // Stage 3: Cant left & rack charging handle / bolt release
        const u = (p - 0.68) / 0.32;
        const arc = Math.sin(u * Math.PI);
        rz += 0.26 * arc;
        rx += 0.09 * arc;
        chargingHandle.position.z = 0.085 + arc * 0.045;
        leftArmGroup.position.set(0.04 * arc, 0.03 * arc, 0.22 * arc);
      }

      if (p >= 1.0) {
        state.reloading = false;
        if (onReloadComplete) onReloadComplete();
      }
    }

    weaponRoot.position.set(px, py, pz);
    weaponRoot.rotation.set(rx, ry, rz);

    // Update ejected brass shells in world space
    for (let i = 0; i < shellPool.length; i++) {
      const s = shellPool[i];
      if (!s.active) continue;
      s.life -= dt;
      if (s.life <= 0) {
        s.active = false;
        s.mesh.visible = false;
        continue;
      }
      s.vel.y -= 11.5 * dt;
      s.mesh.position.addScaledVector(s.vel, dt);
      s.mesh.rotation.x += s.rotVel.x * dt;
      s.mesh.rotation.y += s.rotVel.y * dt;
      if (s.mesh.position.y < 0.015) {
        s.mesh.position.y = 0.015;
        s.vel.y = Math.abs(s.vel.y) * 0.38;
        s.vel.x *= 0.65;
        s.vel.z *= 0.65;
      }
    }
  }

  return {
    weaponRoot,
    state,
    toggleFlashlight,
    triggerShot,
    startReload,
    addMouseSway,
    update,
  };
}
