import * as THREE from 'three';
import { clamp, lerp } from '../math/noise.js';

export function buildHarborWorld(scene, mats, quality = 'high') {
  const worldGroup = new THREE.Group();
  scene.add(worldGroup);

  const colliders = []; // Solid AABBs: { minX, maxX, minY, maxY, minZ, maxZ, surface }
  const ramps = [];     // Walkable sloped planes: { minX, maxX, minZ, maxZ, y0, y1, axis, flip, surface }
  const indoorZones = []; // { minX, maxX, minZ, maxZ, maxY }
  const shootables = []; // Meshes for weapon raycast impacts
  const animatedProps = {
    swayingContainers: [],
    spinningRadars: [],
    oceanMesh: null,
    relays: [],
    boatGroup: null,
    extractionBeacon: null,
    extractionSpot: null,
    lightningLight: null,
  };

  function addBoxCollider(cx, cy, cz, sx, sy, sz, surface = 'concrete') {
    colliders.push({
      minX: cx - sx * 0.5,
      maxX: cx + sx * 0.5,
      minY: cy - sy * 0.5,
      maxY: cy + sy * 0.5,
      minZ: cz - sz * 0.5,
      maxZ: cz + sz * 0.5,
      surface,
    });
  }

  function makeBox(sx, sy, sz, mat, cx, cy, cz, castShadow = true, receiveShadow = true, shootable = true) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), mat);
    m.position.set(cx, cy, cz);
    m.castShadow = castShadow;
    m.receiveShadow = receiveShadow;
    worldGroup.add(m);
    if (shootable) shootables.push(m);
    return m;
  }

  // ─────────────────── 1. Lighting, Storm Sky Dome & Atmosphere ───────────────────
  scene.fog = new THREE.FogExp2(0x0b1520, 0.0108);
  scene.background = new THREE.Color(0x071019);

  // Procedural Stormy Night Sky Dome (volumetric cloud gradient + distant port haze + moon break)
  const skyGeo = new THREE.SphereGeometry(330, 32, 20);
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      uLightning: { value: 0.0 },
    },
    vertexShader: `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      varying vec3 vDir;
      uniform float uLightning;
      float hash(vec2 p) {
        return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
      }
      float vnoise(vec2 p) {
        vec2 i = floor(p), f = fract(p);
        vec2 u = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
                   mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
      }
      void main() {
        float h = clamp(vDir.y, -0.1, 1.0);
        vec2 uv = vDir.xz / (max(0.18, vDir.y + 0.28)) * 1.6;
        float clouds = vnoise(uv * 2.0) * 0.6 + vnoise(uv * 4.5) * 0.3 + vnoise(uv * 9.0) * 0.1;
        vec3 zenith = vec3(0.022, 0.042, 0.072);
        vec3 horizon = vec3(0.065, 0.115, 0.168);
        vec3 col = mix(horizon, zenith, pow(clamp(h, 0.0, 1.0), 0.55));
        // Cloud deck highlights & distant harbor sodium horizon glow
        col += vec3(0.035, 0.055, 0.085) * smoothstep(0.38, 0.78, clouds) * (1.0 - h * 0.45);
        float sodiumGlow = exp(-abs(h) * 9.0) * (0.45 + 0.55 * clamp(-vDir.z, 0.0, 1.0));
        col += vec3(0.14, 0.075, 0.03) * sodiumGlow;
        // Cold storm moon glow in NW sky
        vec3 moonDir = normalize(vec3(-0.52, 0.58, 0.38));
        float moonHalo = pow(max(0.0, dot(vDir, moonDir)), 18.0);
        col += vec3(0.14, 0.21, 0.30) * moonHalo;
        col += vec3(0.35, 0.48, 0.65) * uLightning * smoothstep(0.35, 0.8, clouds);
        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });
  const skyDome = new THREE.Mesh(skyGeo, skyMat);
  scene.add(skyDome);
  animatedProps.skyMat = skyMat;

  const hemiLight = new THREE.HemisphereLight(0x466d90, 0x1c150e, 0.92);
  scene.add(hemiLight);

  // Cold storm moonlight directional shadow caster
  const moonLight = new THREE.DirectionalLight(0x6e9bc4, 1.15);
  moonLight.position.set(-48, 72, 36);
  moonLight.castShadow = quality !== 'low';
  if (moonLight.castShadow) {
    const mapSz = quality === 'high' ? 2048 : 1024;
    moonLight.shadow.mapSize.set(mapSz, mapSz);
    moonLight.shadow.camera.near = 10;
    moonLight.shadow.camera.far = 210;
    const d = 74;
    moonLight.shadow.camera.left = -d;
    moonLight.shadow.camera.right = d;
    moonLight.shadow.camera.top = d;
    moonLight.shadow.camera.bottom = -d;
    moonLight.shadow.bias = -0.0005;
  }
  scene.add(moonLight);

  // Lightning flash light
  const lightningLight = new THREE.DirectionalLight(0xbcdfff, 0);
  lightningLight.position.set(30, 90, -50);
  scene.add(lightningLight);
  animatedProps.lightningLight = lightningLight;

  // ─────────────────── 2. Ocean & Main Harbor Quay Slab ───────────────────
  const oceanGeo = new THREE.PlaneGeometry(620, 620, 48, 48);
  oceanGeo.rotateX(-Math.PI / 2);
  const oceanMesh = new THREE.Mesh(oceanGeo, mats.ocean);
  oceanMesh.position.set(20, -1.65, -40);
  oceanMesh.receiveShadow = true;
  worldGroup.add(oceanMesh);
  animatedProps.oceanMesh = oceanMesh;

  // Main Quay Platform: X [-64, 64], Z [-56, 56], top at Y = 0
  const tarmac = new THREE.Mesh(new THREE.BoxGeometry(128, 2.2, 112), mats.wetConcrete);
  tarmac.position.set(0, -1.1, 0);
  tarmac.receiveShadow = true;
  worldGroup.add(tarmac);
  shootables.push(tarmac);

  // Quay sea-wall coping curbs & bollards along North (Z = -56) and East (X = 64)
  makeBox(128, 0.45, 0.9, mats.warehouseConcrete, 0, 0.22, -55.55, true, true);
  // North sea-wall safety boundary (low concrete parapet + bollards, keeps player from falling accidentally while allowing clear view of cargo ship)
  addBoxCollider(0, 0.65, -55.7, 128, 1.3, 0.8, 'concrete');

  // West & South perimeter security walls (keeps combat arena tight)
  makeBox(1.2, 4.2, 112, mats.warehouseConcrete, -63.4, 2.1, 0, true, true);
  addBoxCollider(-63.4, 2.5, 0, 1.2, 5.0, 112, 'concrete');

  makeBox(128, 4.2, 1.2, mats.warehouseConcrete, 0, 2.1, 55.4, true, true);
  addBoxCollider(0, 2.5, 55.4, 128, 5.0, 1.2, 'concrete');

  // East sea-wall parapet with gap at Z in [19, 29] for the Extraction Pier!
  makeBox(0.9, 0.95, 75, mats.warehouseConcrete, 63.55, 0.47, -18.5, true, true);
  addBoxCollider(63.55, 0.9, -18.5, 0.9, 1.8, 75, 'concrete');
  makeBox(0.9, 0.95, 27, mats.warehouseConcrete, 63.55, 0.47, 42.5, true, true);
  addBoxCollider(63.55, 0.9, 42.5, 0.9, 1.8, 27, 'concrete');

  // Painted yellow tarmac lane stripes (subtle emissive/reflective strips)
  const stripeMat = new THREE.MeshStandardMaterial({
    color: 0xc88b22,
    roughness: 0.35,
    metalness: 0.1,
  });
  for (let z = -44; z <= 44; z += 8) {
    const s1 = new THREE.Mesh(new THREE.PlaneGeometry(0.28, 4.2), stripeMat);
    s1.rotation.x = -Math.PI / 2;
    s1.position.set(-18, 0.012, z);
    worldGroup.add(s1);
    const s2 = s1.clone();
    s2.position.set(18, 0.012, z);
    worldGroup.add(s2);
  }

  // Rubber dock fenders & mooring bollards along North Quay
  for (let x = -54; x <= 54; x += 12) {
    makeBox(2.2, 1.1, 0.6, mats.rubberBlack, x, -0.35, -56.25, false, false, false);
    const bollard = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.28, 0.75, 10), mats.darkSteel);
    bollard.position.set(x + 3, 0.55, -55.4);
    worldGroup.add(bollard);
  }

  // ─────────────────── 3. Shipping Container Builder & Tactical Stacks ───────────────────
  // Standard 20ft/40ft container helper (width 2.5m, height 2.6m, length 6.2m or 12.2m)
  const sharedContGeo12 = new THREE.BoxGeometry(2.5, 2.6, 12.0);
  const sharedContGeo6 = new THREE.BoxGeometry(2.5, 2.6, 6.0);

  function placeContainer(cx, tier, cz, rotY = 0, len = 12, colorIdx = 0) {
    const geo = len === 12 ? sharedContGeo12 : sharedContGeo6;
    const mat = mats.containers[colorIdx % mats.containers.length];
    const cy = 1.3 + tier * 2.6;
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(cx, cy, cz);
    mesh.rotation.y = rotY;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    worldGroup.add(mesh);
    shootables.push(mesh);

    // Axis-aligned collider (rotY is 0 or Math.PI/2)
    const alignedZ = Math.abs(Math.cos(rotY)) > 0.7;
    const sx = alignedZ ? 2.5 : len;
    const sz = alignedZ ? len : 2.5;
    addBoxCollider(cx, cy, cz, sx, 2.6, sz, 'metal');
    return mesh;
  }

  // West Container Yard (around Relay A at -36, 0, +6)
  placeContainer(-48, 0, 26, 0, 12, 0);
  placeContainer(-48, 1, 26, 0, 12, 1);
  placeContainer(-45.2, 0, 26, 0, 12, 2);

  placeContainer(-48, 0, 6, 0, 12, 3);
  placeContainer(-48, 1, 6, 0, 12, 4);
  placeContainer(-48, 0, -10, 0, 12, 1);
  placeContainer(-45.2, 0, -10, 0, 12, 0);
  placeContainer(-45.2, 1, -10, 0, 12, 2);

  // Walkable West Container Platform + Climbable Steel Ramp!
  placeContainer(-26, 0, 14, 0, 12, 3); // Top at Y = 2.6m!
  // Steel ramp leading up to top of (-26, 0, 14) from Z = 25.5 to Z = 20.0
  const rampLen = 6.1;
  const westRamp = new THREE.Mesh(new THREE.BoxGeometry(2.3, 0.18, rampLen), mats.galvanizedSteel);
  westRamp.position.set(-26, 1.3, 22.75);
  westRamp.rotation.x = Math.atan2(2.6, 5.5);
  westRamp.castShadow = true;
  westRamp.receiveShadow = true;
  worldGroup.add(westRamp);
  shootables.push(westRamp);
  ramps.push({
    minX: -27.2,
    maxX: -24.8,
    minZ: 20.0,
    maxZ: 25.6,
    y0: 2.6, // at minZ (20.0)
    y1: 0.0, // at maxZ (25.6)
    axis: 'z',
    surface: 'metal',
  });

  // Cover stacks around West Relay A
  placeContainer(-36, 0, 20, Math.PI / 2, 6, 1);
  placeContainer(-35, 0, -8, Math.PI / 2, 12, 4);

  // South Infiltration Yard Cover (gives player immediate tactical cover from spawn at Z=+46)
  placeContainer(-12, 0, 34, Math.PI / 2, 6, 0);
  placeContainer(12, 0, 34, Math.PI / 2, 6, 2);
  placeContainer(-28, 0, 38, 0, 12, 4);
  placeContainer(28, 0, 36, 0, 12, 1);
  placeContainer(30.8, 0, 36, 0, 12, 3);
  placeContainer(30.8, 1, 36, 0, 12, 0);

  // North-West & North-East Quay Stacks
  placeContainer(-36, 0, -34, 0, 12, 2);
  placeContainer(-36, 1, -34, 0, 12, 0);
  placeContainer(-22, 0, -28, Math.PI / 2, 6, 3);
  placeContainer(-6, 0, -34, Math.PI / 2, 12, 1);

  placeContainer(38, 0, -36, 0, 12, 4);
  placeContainer(40.8, 0, -36, 0, 12, 1);
  placeContainer(40.8, 1, -36, 0, 12, 2);
  placeContainer(38, 0, -16, Math.PI / 2, 12, 0);

  // East Pier Approach Stacks (Tactical corridor toward Extraction Boat at +71, 24)
  placeContainer(44, 0, 8, 0, 12, 3);
  placeContainer(44, 1, 8, 0, 12, 1);
  placeContainer(46, 0, 34, Math.PI / 2, 6, 2);

  // Walkable East Container Overlook + Steel Ramp (gives elevated vantage over Boss & Pier!)
  placeContainer(26, 0, 12, 0, 12, 0); // Top at Y = 2.6m
  const eastRamp = new THREE.Mesh(new THREE.BoxGeometry(2.3, 0.18, 6.1), mats.galvanizedSteel);
  eastRamp.position.set(26, 1.3, 20.75);
  eastRamp.rotation.x = Math.atan2(2.6, 5.5);
  eastRamp.castShadow = true;
  eastRamp.receiveShadow = true;
  worldGroup.add(eastRamp);
  shootables.push(eastRamp);
  ramps.push({
    minX: 24.8,
    maxX: 27.2,
    minZ: 18.0,
    maxZ: 23.6,
    y0: 2.6,
    y1: 0.0,
    axis: 'z',
    surface: 'metal',
  });

  // Concrete Jersey Barriers scattered for mid-height crouch/ADS cover
  const barrierCoords = [
    [-6, 24, 0], [6, 24, 0],
    [-29, 6, Math.PI / 2], [-43, 6, Math.PI / 2],
    [14, -26, 0], [28, -26, 0],
    [52, 19, 0], [52, 29, 0],
  ];
  barrierCoords.forEach(([bx, bz, rot]) => {
    const sx = rot === 0 ? 3.2 : 0.7;
    const sz = rot === 0 ? 0.7 : 3.2;
    makeBox(sx, 1.05, sz, mats.hazardStripe, bx, 0.525, bz, true, true);
    addBoxCollider(bx, 0.525, bz, sx, 1.05, sz, 'concrete');
  });

  // ─────────────────── 4. Central Harbor Maintenance Warehouse (Indoor Zone!) ───────────────────
  // Spans X [-13, 13], Z [-16, 12], Height 8.2m — open North & South cargo bays + side doorways
  indoorZones.push({ minX: -12.8, maxX: 12.8, minZ: -15.8, maxZ: 11.8, maxY: 8.2 });

  // Side walls with doorway openings in the middle
  // West wall segments: Z [-16, -5] and Z [1, 12]
  makeBox(0.7, 7.6, 11, mats.warehouseConcrete, -13, 3.8, -10.5);
  addBoxCollider(-13, 3.8, -10.5, 0.7, 7.6, 11, 'concrete');
  makeBox(0.7, 7.6, 11, mats.warehouseConcrete, -13, 3.8, 6.5);
  addBoxCollider(-13, 3.8, 6.5, 0.7, 7.6, 11, 'concrete');
  makeBox(0.7, 3.4, 6, mats.warehouseConcrete, -13, 5.9, -2.0); // Lintel over west side door

  // East wall segments: Z [-16, -5] and Z [1, 12]
  makeBox(0.7, 7.6, 11, mats.warehouseConcrete, 13, 3.8, -10.5);
  addBoxCollider(13, 3.8, -10.5, 0.7, 7.6, 11, 'concrete');
  makeBox(0.7, 7.6, 11, mats.warehouseConcrete, 13, 3.8, 6.5);
  addBoxCollider(13, 3.8, 6.5, 0.7, 7.6, 11, 'concrete');
  makeBox(0.7, 3.4, 6, mats.warehouseConcrete, 13, 5.9, -2.0);

  // Pitched / Trussed Warehouse Roof
  makeBox(27.2, 0.5, 28.6, mats.darkSteel, 0, 7.85, -2.0, true, true);
  for (let rz = -14; rz <= 10; rz += 6) {
    makeBox(26.2, 0.45, 0.35, mats.galvanizedSteel, 0, 7.35, rz, false, false, false);
  }

  // Interior Warehouse Cover Crates & Warm Overhead Bay Lights
  const cratePositions = [
    [-7.5, 5.5], [7.5, 5.5], [-7.5, -9.5], [7.5, -9.5],
  ];
  cratePositions.forEach(([cx, cz]) => {
    makeBox(2.4, 1.8, 2.4, mats.woodPallet, cx, 0.9, cz);
    addBoxCollider(cx, 0.9, cz, 2.4, 1.8, 2.4, 'concrete');
  });

  const whLight1 = new THREE.PointLight(0xffa952, 24, 24, 1.6);
  whLight1.position.set(0, 6.8, 5);
  scene.add(whLight1);
  makeBox(1.6, 0.18, 0.5, mats.sodiumLampEmissive, 0, 7.1, 5, false, false, false);

  const whLight2 = new THREE.PointLight(0xffa952, 24, 24, 1.6);
  whLight2.position.set(0, 6.8, -9);
  scene.add(whLight2);
  makeBox(1.6, 0.18, 0.5, mats.sodiumLampEmissive, 0, 7.1, -9, false, false, false);

  // ─────────────────── 5. Ship-to-Shore Gantry Cranes (岸桥起重机 x2) ───────────────────
  function buildGantryCrane(baseX) {
    const crane = new THREE.Group();
    crane.position.set(baseX, 0, -45);
    worldGroup.add(crane);

    const legSpanX = 13;
    const legSpanZ = 14;
    const portalH = 32;

    // 4 Portal Legs + Sill Beams
    const corners = [
      [-legSpanX / 2, -legSpanZ / 2],
      [legSpanX / 2, -legSpanZ / 2],
      [-legSpanX / 2, legSpanZ / 2],
      [legSpanX / 2, legSpanZ / 2],
    ];
    corners.forEach(([lx, lz]) => {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(1.15, portalH, 1.15), mats.craneYellow);
      leg.position.set(lx, portalH / 2, lz);
      leg.castShadow = true;
      crane.add(leg);
      shootables.push(leg);
      addBoxCollider(baseX + lx, 3.0, -45 + lz, 1.3, 6.0, 1.3, 'metal');

      // Hazard base bumper
      const base = new THREE.Mesh(new THREE.BoxGeometry(1.5, 1.8, 1.5), mats.hazardStripe);
      base.position.set(lx, 0.9, lz);
      crane.add(base);
    });

    // Cross portal beams & horizontal main boom extending 38m over cargo ship!
    const crossSillL = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.4, legSpanZ + 2), mats.darkSteel);
    crossSillL.position.set(-legSpanX / 2, 0.7, 0);
    crane.add(crossSillL);
    const crossSillR = crossSillL.clone();
    crossSillR.position.x = legSpanX / 2;
    crane.add(crossSillR);

    const upperCross1 = new THREE.Mesh(new THREE.BoxGeometry(legSpanX + 2, 1.6, 1.4), mats.craneYellow);
    upperCross1.position.set(0, 16, -legSpanZ / 2);
    crane.add(upperCross1);
    const upperCross2 = upperCross1.clone();
    upperCross2.position.z = legSpanZ / 2;
    crane.add(upperCross2);

    // Main horizontal girder boom (Z from -36 waterside to +22 landside = 58m long!)
    const boomL = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.8, 60), mats.craneYellow);
    boomL.position.set(-3.2, portalH, -7);
    boomL.castShadow = true;
    crane.add(boomL);
    const boomR = boomL.clone();
    boomR.position.x = 3.2;
    crane.add(boomR);

    // Apex A-frame tower & forestay/backstay tension cables
    const apexH = 44;
    const mastL = new THREE.Mesh(new THREE.BoxGeometry(0.85, apexH - portalH, 0.85), mats.craneYellow);
    mastL.position.set(-3.2, (apexH + portalH) / 2, -2);
    crane.add(mastL);
    const mastR = mastL.clone();
    mastR.position.x = 3.2;
    crane.add(mastR);
    const apexBar = new THREE.Mesh(new THREE.BoxGeometry(7.6, 0.9, 0.9), mats.craneYellow);
    apexBar.position.set(0, apexH, -2);
    crane.add(apexBar);

    // Aviation Red Warning Strobe at 45m
    const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.45, 8, 8), mats.redEmissive);
    beacon.position.set(0, apexH + 0.8, -2);
    crane.add(beacon);

    // Tension stay rods from apex to boom ends
    const makeStay = (x, zTarget) => {
      const p1 = new THREE.Vector3(x, apexH, -2);
      const p2 = new THREE.Vector3(x, portalH + 0.6, zTarget);
      const dist = p1.distanceTo(p2);
      const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, dist, 6), mats.darkSteel);
      rod.position.copy(p1).add(p2).multiplyScalar(0.5);
      rod.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), p2.clone().sub(p1).normalize());
      crane.add(rod);
    };
    makeStay(-3.2, -34);
    makeStay(3.2, -34);
    makeStay(-3.2, 20);
    makeStay(3.2, 20);

    // Operator Cabin & Trolley + Suspended Swaying Container
    const cab = new THREE.Mesh(new THREE.BoxGeometry(3.4, 2.6, 4.2), mats.shipBridgeWhite);
    cab.position.set(0, portalH - 2.0, -12);
    crane.add(cab);
    const cabWin = new THREE.Mesh(new THREE.BoxGeometry(2.8, 1.1, 0.2), mats.sodiumLampEmissive);
    cabWin.position.set(0, portalH - 2.1, -9.85);
    crane.add(cabWin);

    const swayPivot = new THREE.Group();
    swayPivot.position.set(0, portalH - 1.5, -18);
    crane.add(swayPivot);
    const ropeLen = 15;
    [-1.0, 1.0].forEach((rx) => {
      [-2.4, 2.4].forEach((rz) => {
        const wire = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, ropeLen, 5), mats.darkSteel);
        wire.position.set(rx, -ropeLen / 2, rz);
        swayPivot.add(wire);
      });
    });
    const spreader = new THREE.Mesh(new THREE.BoxGeometry(2.7, 0.5, 12.2), mats.craneYellow);
    spreader.position.set(0, -ropeLen, 0);
    swayPivot.add(spreader);
    const hungCont = new THREE.Mesh(sharedContGeo12, mats.containers[1]);
    hungCont.position.set(0, -ropeLen - 1.55, 0);
    swayPivot.add(hungCont);
    animatedProps.swayingContainers.push({ group: swayPivot, phase: baseX * 0.1 });

    // Powerful Sodium-Vapor Harbor Floodlight mounted under crane girder!
    const lampFixture = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.3, 1.2), mats.sodiumLampEmissive);
    lampFixture.position.set(0, portalH - 1.0, 4);
    crane.add(lampFixture);

    const craneLight = new THREE.SpotLight(0xff9b3d, 160, 72, Math.PI * 0.36, 0.55, 1.35);
    craneLight.position.set(baseX, portalH - 1.2, -41);
    craneLight.target.position.set(baseX, 0, -24);
    scene.add(craneLight);
    scene.add(craneLight.target);
  }

  buildGantryCrane(-28);
  buildGantryCrane(20);

  // Additional Floodlight Masts in South/East Yard for dramatic puddle reflections
  function buildFloodlightMast(mx, mz, targetX, targetZ) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.36, 18, 8), mats.darkSteel);
    pole.position.set(mx, 9, mz);
    pole.castShadow = true;
    worldGroup.add(pole);
    addBoxCollider(mx, 3, mz, 0.8, 6, 0.8, 'metal');

    const head = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.45, 0.8), mats.sodiumLampEmissive);
    head.position.set(mx, 18.1, mz);
    worldGroup.add(head);

    const pt = new THREE.PointLight(0xff9d42, 48, 44, 1.45);
    pt.position.set(mx, 17.4, mz);
    scene.add(pt);
  }
  buildFloodlightMast(-38, 30, -24, 16);
  buildFloodlightMast(38, 32, 52, 24);

  // ─────────────────── 6. 205m Berthed Container Ship ("MV NORTHERN AEGIS") ───────────────────
  const ship = new THREE.Group();
  ship.position.set(-8, -1.6, -76);
  worldGroup.add(ship);

  // Main Hull + Bow + Deck
  const hull = new THREE.Mesh(new THREE.BoxGeometry(176, 11.5, 26), mats.shipHullRed);
  hull.position.set(0, 4.8, 0);
  ship.add(hull);

  const upperHull = new THREE.Mesh(new THREE.BoxGeometry(180, 3.2, 26.6), mats.shipDeckDark);
  upperHull.position.set(2, 11.5, 0);
  ship.add(upperHull);

  // Tapered Ship Bow pointing East (+X)
  const bowGeo = new THREE.ConeGeometry(13.3, 28, 4);
  bowGeo.rotateZ(-Math.PI / 2);
  bowGeo.rotateX(Math.PI / 4);
  const bow = new THREE.Mesh(bowGeo, mats.shipHullRed);
  bow.position.set(101, 6.2, 0);
  ship.add(bow);

  // Stacked Deck Containers on Cargo Ship
  for (let bx = -52; bx <= 62; bx += 14) {
    for (let bz = -8; bz <= 8; bz += 4) {
      const tiers = 2 + ((Math.abs(bx * 7 + bz * 3) % 3));
      for (let t = 0; t < tiers; t++) {
        const dc = new THREE.Mesh(
          sharedContGeo12,
          mats.containers[Math.abs(bx + bz + t) % mats.containers.length]
        );
        dc.rotation.y = Math.PI / 2;
        dc.position.set(bx, 14.4 + t * 2.6, bz);
        ship.add(dc);
      }
    }
  }

  // Towering White Bridge Superstructure & Radar Mast
  const bridge = new THREE.Mesh(new THREE.BoxGeometry(14, 19, 24), mats.shipBridgeWhite);
  bridge.position.set(-70, 21.5, 0);
  ship.add(bridge);

  const bridgeWings = new THREE.Mesh(new THREE.BoxGeometry(8, 3.4, 29.5), mats.shipBridgeWhite);
  bridgeWings.position.set(-69, 29.5, 0);
  ship.add(bridgeWings);

  // Lit Bridge Windows
  const bridgeGlass = new THREE.Mesh(new THREE.BoxGeometry(8.3, 1.1, 22), mats.sodiumLampEmissive);
  bridgeGlass.position.set(-65, 29.7, 0);
  ship.add(bridgeGlass);

  // Spinning Marine Radar Scanner
  const radarMast = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.5, 8, 8), mats.shipBridgeWhite);
  radarMast.position.set(-69, 35, 0);
  ship.add(radarMast);
  const radarBar = new THREE.Mesh(new THREE.BoxGeometry(5.2, 0.45, 0.55), mats.cyanEmissive);
  radarBar.position.set(-69, 39.2, 0);
  ship.add(radarBar);
  animatedProps.spinningRadars.push(radarBar);

  // ─────────────────── 7. Three Uplink Relay Stations (Objectives A, B, C) ───────────────────
  const relaySpecs = [
    { id: 'A', label: '堆场中继 A', pos: new THREE.Vector3(-36, 0, 6) },
    { id: 'B', label: '机库中继 B', pos: new THREE.Vector3(0, 0, -2) },
    { id: 'C', label: '岸桥中继 C', pos: new THREE.Vector3(20, 0, -34) },
  ];

  relaySpecs.forEach((spec) => {
    const rg = new THREE.Group();
    rg.position.copy(spec.pos);
    worldGroup.add(rg);

    // Concrete pad + hazard curb
    const pad = new THREE.Mesh(new THREE.BoxGeometry(3.0, 0.25, 3.0), mats.hazardStripe);
    pad.position.y = 0.125;
    rg.add(pad);

    // Armored Server Rack Cabinet
    const cab = new THREE.Mesh(new THREE.BoxGeometry(1.5, 2.5, 1.3), mats.darkSteel);
    cab.position.y = 1.5;
    cab.castShadow = true;
    rg.add(cab);
    shootables.push(cab);
    addBoxCollider(spec.pos.x, 1.4, spec.pos.z, 1.7, 2.8, 1.5, 'metal');

    // Glowing Cyan Optical Core Strips (switch to dark/smoking red once severed!)
    const coreMat = mats.cyanEmissive.clone();
    const stripL = new THREE.Mesh(new THREE.BoxGeometry(0.14, 1.9, 1.36), coreMat);
    stripL.position.set(-0.55, 1.55, 0);
    rg.add(stripL);
    const stripR = stripL.clone();
    stripR.position.x = 0.55;
    rg.add(stripR);
    const screen = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.55, 1.36), coreMat);
    screen.position.set(0, 1.85, 0);
    rg.add(screen);

    // Antenna Mast + Vertical Sky Beacon Pillar (visible across rainy yard)
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.12, 4.2, 8), mats.galvanizedSteel);
    mast.position.set(0, 4.6, 0);
    rg.add(mast);

    const dish = new THREE.Mesh(new THREE.CylinderGeometry(0.65, 0.15, 0.35, 12), mats.shipBridgeWhite);
    dish.rotation.z = Math.PI / 3;
    dish.position.set(0.3, 6.1, 0);
    rg.add(dish);

    const beaconMat = new THREE.MeshBasicMaterial({
      color: 0x22e6ff,
      transparent: true,
      opacity: 0.16,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const skyBeam = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.55, 36, 12, 1, true), beaconMat);
    skyBeam.position.set(0, 20, 0);
    rg.add(skyBeam);

    const ptLight = new THREE.PointLight(0x1fd8ff, 22, 18, 1.5);
    ptLight.position.set(0, 2.8, 0);
    rg.add(ptLight);

    animatedProps.relays.push({
      id: spec.id,
      label: spec.label,
      pos: spec.pos.clone(),
      group: rg,
      coreMat,
      beaconMat,
      skyBeam,
      dish,
      ptLight,
      severed: false,
      progress: 0,
    });
  });

  // ─────────────────── 8. East Pier & Stealth Extraction Boat ("BREACHER-04") ───────────────────
  // Pier walkway extending from X = 64 to X = 70 at Z = 24, sloping gently down to dock
  const pierDeck = new THREE.Mesh(new THREE.BoxGeometry(7.5, 0.4, 8.5), mats.galvanizedSteel);
  pierDeck.position.set(67.2, -0.35, 24);
  worldGroup.add(pierDeck);
  shootables.push(pierDeck);

  // Walkable ramp down onto the extraction pier (X: 63.5 -> 69.5)
  ramps.push({
    minX: 63.2,
    maxX: 69.8,
    minZ: 19.8,
    maxZ: 28.2,
    y0: 0.0,   // at minX (63.2)
    y1: -0.15, // at maxX (69.8)
    axis: 'x',
    surface: 'metal',
  });
  // Guardrail colliders along pier sides & end so player stops cleanly at boarding zone
  addBoxCollider(67.2, 0.8, 19.6, 7.5, 2.2, 0.5, 'metal');
  addBoxCollider(67.2, 0.8, 28.4, 7.5, 2.2, 0.5, 'metal');
  addBoxCollider(70.6, 0.8, 24.0, 0.6, 2.2, 8.8, 'metal');

  // Stealth Fast-Attack Extraction Boat moored at (73.5, -1.25, 24)
  const boat = new THREE.Group();
  boat.position.set(73.8, -1.25, 24);
  worldGroup.add(boat);
  animatedProps.boatGroup = boat;

  const boatHull = new THREE.Mesh(new THREE.BoxGeometry(4.4, 1.3, 11.2), mats.darkSteel);
  boatHull.position.y = 0.4;
  boat.add(boatHull);
  // Inflatable RIB sponsons
  const sponsonL = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 10.8, 10), mats.rubberBlack);
  sponsonL.rotation.x = Math.PI / 2;
  sponsonL.position.set(-2.1, 0.75, 0);
  boat.add(sponsonL);
  const sponsonR = sponsonL.clone();
  sponsonR.position.x = 2.1;
  boat.add(sponsonR);

  // Tactical Pilot House & Radar Arch
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(2.8, 1.9, 3.8), mats.mechArmor);
  cabin.position.set(0, 1.8, -0.5);
  boat.add(cabin);
  const boatBeaconMat = mats.amberEmissive.clone();
  boatBeaconMat.emissiveIntensity = 0.6;
  const cabinStrip = new THREE.Mesh(new THREE.BoxGeometry(2.9, 0.25, 3.9), boatBeaconMat);
  cabinStrip.position.set(0, 2.65, -0.5);
  boat.add(cabinStrip);

  // Extraction Sky Pillar (hidden until all 3 relays are cut!)
  const extBeamMat = new THREE.MeshBasicMaterial({
    color: 0x2eff88,
    transparent: true,
    opacity: 0.0,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const extBeam = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 1.4, 42, 16, 1, true), extBeamMat);
  extBeam.position.set(68.2, 20, 24);
  worldGroup.add(extBeam);

  const extLight = new THREE.PointLight(0x2eff88, 0, 32, 1.4);
  extLight.position.set(68.5, 3.5, 24);
  scene.add(extLight);

  animatedProps.extractionBeacon = {
    pos: new THREE.Vector3(68.2, 0, 24),
    beamMat: extBeamMat,
    boatMat: boatBeaconMat,
    light: extLight,
    active: false,
  };

  // ─────────────────── 9. Physics / Collision Query Helpers ───────────────────
  function isIndoor(x, y, z) {
    for (let i = 0; i < indoorZones.length; i++) {
      const iz = indoorZones[i];
      if (x >= iz.minX && x <= iz.maxX && z >= iz.minZ && z <= iz.maxZ && y <= iz.maxY) {
        return 1.0;
      }
    }
    return 0.0;
  }

  // Resolve horizontal cylinder/AABB pushout + return floor height & surface under (x, yFeet, z)
  function resolvePlayerPhysics(pos, radius = 0.42, height = 1.7, stepHeight = 0.55) {
    let floorY = 0.0;
    let surface = 'concrete';

    // 1. Check sloped ramps first
    for (let i = 0; i < ramps.length; i++) {
      const r = ramps[i];
      if (pos.x >= r.minX - 0.15 && pos.x <= r.maxX + 0.15 && pos.z >= r.minZ - 0.15 && pos.z <= r.maxZ + 0.15) {
        const t =
          r.axis === 'z'
            ? clamp((pos.z - r.minZ) / (r.maxZ - r.minZ), 0, 1)
            : clamp((pos.x - r.minX) / (r.maxX - r.minX), 0, 1);
        const ry = lerp(r.y0, r.y1, t);
        if (pos.y >= ry - stepHeight && ry >= floorY - 0.3) {
          floorY = Math.max(floorY, ry);
          surface = r.surface;
        }
      }
    }

    // 2. Check solid AABBs (horizontal pushout + top support)
    for (let i = 0; i < colliders.length; i++) {
      const c = colliders[i];
      const overlapX = pos.x + radius > c.minX && pos.x - radius < c.maxX;
      const overlapZ = pos.z + radius > c.minZ && pos.z - radius < c.maxZ;
      if (!overlapX || !overlapZ) continue;

      // Can player stand on top of this collider?
      if (pos.y >= c.maxY - stepHeight && c.maxY > floorY) {
        // Verify center is reasonably near box footprint
        if (pos.x >= c.minX - radius * 0.65 && pos.x <= c.maxX + radius * 0.65 &&
            pos.z >= c.minZ - radius * 0.65 && pos.z <= c.maxZ + radius * 0.65) {
          floorY = c.maxY;
          surface = c.surface;
          continue;
        }
      }

      // Vertical overlap => push out horizontally along minimum penetration axis
      if (pos.y < c.maxY - 0.08 && pos.y + height > c.minY + 0.05) {
        const penLeft = pos.x + radius - c.minX;
        const penRight = c.maxX - (pos.x - radius);
        const penBack = pos.z + radius - c.minZ;
        const penFront = c.maxZ - (pos.z - radius);

        const minPen = Math.min(penLeft, penRight, penBack, penFront);
        if (minPen === penLeft) pos.x = c.minX - radius;
        else if (minPen === penRight) pos.x = c.maxX + radius;
        else if (minPen === penBack) pos.z = c.minZ - radius;
        else pos.z = c.maxZ + radius;
      }
    }

    // Keep within outer quay bounds (allowing East Extraction Pier!)
    pos.x = clamp(pos.x, -62.4, pos.z > 19.5 && pos.z < 28.5 ? 70.0 : 62.7);
    pos.z = clamp(pos.z, -54.8, 54.3);

    return { floorY, surface };
  }

  // Simple obstacle pushout for ground mechanical enemies
  function resolveAgentHorizontal(pos, radius = 0.65) {
    for (let i = 0; i < colliders.length; i++) {
      const c = colliders[i];
      if (c.maxY < 0.4) continue;
      if (pos.x + radius > c.minX && pos.x - radius < c.maxX &&
          pos.z + radius > c.minZ && pos.z - radius < c.maxZ) {
        const penLeft = pos.x + radius - c.minX;
        const penRight = c.maxX - (pos.x - radius);
        const penBack = pos.z + radius - c.minZ;
        const penFront = c.maxZ - (pos.z - radius);
        const m = Math.min(penLeft, penRight, penBack, penFront);
        if (m === penLeft) pos.x = c.minX - radius;
        else if (m === penRight) pos.x = c.maxX + radius;
        else if (m === penBack) pos.z = c.minZ - radius;
        else pos.z = c.maxZ + radius;
      }
    }
    pos.x = clamp(pos.x, -61.5, 62.0);
    pos.z = clamp(pos.z, -53.5, 53.0);
  }

  // Fast segment-vs-AABB line-of-sight check (for enemy vision & laser sight)
  function hasLineOfSight(a, b) {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const dz = b.z - a.z;
    for (let i = 0; i < colliders.length; i++) {
      const c = colliders[i];
      let tmin = 0.0;
      let tmax = 1.0;

      if (Math.abs(dx) < 1e-6) {
        if (a.x < c.minX || a.x > c.maxX) continue;
      } else {
        let t1 = (c.minX - a.x) / dx;
        let t2 = (c.maxX - a.x) / dx;
        if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; }
        tmin = Math.max(tmin, t1);
        tmax = Math.min(tmax, t2);
        if (tmin > tmax) continue;
      }

      if (Math.abs(dy) < 1e-6) {
        if (a.y < c.minY || a.y > c.maxY) continue;
      } else {
        let t1 = (c.minY - a.y) / dy;
        let t2 = (c.maxY - a.y) / dy;
        if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; }
        tmin = Math.max(tmin, t1);
        tmax = Math.min(tmax, t2);
        if (tmin > tmax) continue;
      }

      if (Math.abs(dz) < 1e-6) {
        if (a.z < c.minZ || a.z > c.maxZ) continue;
      } else {
        let t1 = (c.minZ - a.z) / dz;
        let t2 = (c.maxZ - a.z) / dz;
        if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; }
        tmin = Math.max(tmin, t1);
        tmax = Math.min(tmax, t2);
        if (tmin > tmax) continue;
      }

      if (tmin <= tmax && tmax > 0.02 && tmin < 0.98) {
        return false;
      }
    }
    return true;
  }

  function updateWorld(time, dt) {
    // Scroll ocean ripples
    if (mats.oceanNormalTex) {
      mats.oceanNormalTex.offset.x = time * 0.035;
      mats.oceanNormalTex.offset.y = time * 0.022;
    }
    // Sway crane-suspended containers in harbor storm wind
    animatedProps.swayingContainers.forEach((sc) => {
      sc.group.rotation.z = Math.sin(time * 0.75 + sc.phase) * 0.032;
      sc.group.rotation.x = Math.cos(time * 0.55 + sc.phase) * 0.02;
    });
    // Spin ship marine radar
    animatedProps.spinningRadars.forEach((r) => {
      r.rotation.y = time * 1.9;
    });
    // Bob stealth extraction boat on storm waves
    if (animatedProps.boatGroup) {
      animatedProps.boatGroup.position.y = -1.25 + Math.sin(time * 1.8) * 0.12;
      animatedProps.boatGroup.rotation.z = Math.sin(time * 1.3) * 0.035;
      animatedProps.boatGroup.rotation.x = Math.cos(time * 1.1) * 0.025;
    }
    // Pulse active relays
    animatedProps.relays.forEach((rel, idx) => {
      if (!rel.severed) {
        rel.dish.rotation.y = Math.sin(time * 0.8 + idx) * 0.45;
        rel.beaconMat.opacity = 0.13 + Math.sin(time * 3.5 + idx) * 0.05;
      }
    });
    // Pulse extraction beacon when active
    if (animatedProps.extractionBeacon.active) {
      animatedProps.extractionBeacon.beamMat.opacity = 0.2 + Math.sin(time * 4.5) * 0.08;
      animatedProps.extractionBeacon.light.intensity = 32 + Math.sin(time * 6.0) * 8;
    }
    if (animatedProps.skyMat && animatedProps.lightningLight) {
      animatedProps.skyMat.uniforms.uLightning.value = clamp(animatedProps.lightningLight.intensity / 4.5, 0, 1);
    }
  }

  return {
    worldGroup,
    colliders,
    ramps,
    shootables,
    relays: animatedProps.relays,
    extractionBeacon: animatedProps.extractionBeacon,
    lightningLight: animatedProps.lightningLight,
    isIndoor,
    resolvePlayerPhysics,
    resolveAgentHorizontal,
    hasLineOfSight,
    updateWorld,
  };
}
