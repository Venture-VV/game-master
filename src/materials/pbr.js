import * as THREE from 'three';
import {
  PI,
  TAU,
  clamp,
  lerp,
  smoothstep,
  fbm2D,
  worley2D,
  heightToNormalMap,
  createRng,
} from '../math/noise.js';

function makeDataTex(data, size, srgb = false, repeatX = 1, repeatY = 1, aniso = 8) {
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat, THREE.UnsignedByteType);
  tex.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeatX, repeatY);
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.anisotropy = aniso;
  tex.needsUpdate = true;
  return tex;
}

// Generate HDR Equirectangular Environment Map using HalfFloatType (guaranteed linear filtering in WebGL2)
export function createHarborEnvironment(renderer) {
  const w = 256;
  const h = 128;
  const data = new Uint16Array(w * h * 4);
  const toHalf = THREE.DataUtils.toHalfFloat;

  // Key directional light hotspots on horizon & overhead cranes (phi in [0,1], theta in [0,1] from top)
  const hotspots = [
    { u: 0.18, v: 0.43, r: 6.5, g: 3.6, b: 1.4, rad: 0.045 }, // Sodium crane floodlight W
    { u: 0.46, v: 0.45, r: 7.2, g: 4.1, b: 1.6, rad: 0.04 },  // Sodium crane floodlight N
    { u: 0.74, v: 0.46, r: 1.6, g: 4.8, b: 6.2, rad: 0.05 },  // Cold cyan relay/warehouse glow
    { u: 0.88, v: 0.48, r: 5.0, g: 2.8, b: 1.2, rad: 0.04 },  // Pier beacon
    { u: 0.32, v: 0.22, r: 1.3, g: 1.9, b: 2.8, rad: 0.11 },  // Moonlight break in storm clouds
  ];

  for (let y = 0; y < h; y++) {
    const v = y / (h - 1); // 0 = zenith, 0.5 = horizon, 1 = nadir
    for (let x = 0; x < w; x++) {
      const u = x / w;

      let r = 0.025;
      let g = 0.038;
      let b = 0.058;

      if (v < 0.52) {
        // Stormy night sky with dramatic cloud luminance
        const cloud = fbm2D(u * 2.0, v * 3.0, 4, 4, 0.52);
        const horizonHaze = Math.pow(clamp(v / 0.52, 0, 1), 3.2);
        r = lerp(0.018, 0.11, horizonHaze) + cloud * 0.045;
        g = lerp(0.028, 0.13, horizonHaze) + cloud * 0.065;
        b = lerp(0.048, 0.18, horizonHaze) + cloud * 0.095;
      } else {
        // Dark wet harbor ground bounce
        const nadirFade = clamp((v - 0.52) / 0.48, 0, 1);
        r = lerp(0.09, 0.012, nadirFade);
        g = lerp(0.08, 0.016, nadirFade);
        b = lerp(0.09, 0.024, nadirFade);
      }

      // Add HDR hotspots so wet puddles & brushed metal catch realistic highlights
      for (let i = 0; i < hotspots.length; i++) {
        const hs = hotspots[i];
        let du = Math.abs(u - hs.u);
        if (du > 0.5) du = 1.0 - du;
        const dv = v - hs.v;
        const d = Math.sqrt(du * du + dv * dv);
        const falloff = Math.exp(-(d * d) / (hs.rad * hs.rad));
        r += hs.r * falloff;
        g += hs.g * falloff;
        b += hs.b * falloff;
      }

      const idx = (y * w + x) * 4;
      data[idx] = toHalf(r);
      data[idx + 1] = toHalf(g);
      data[idx + 2] = toHalf(b);
      data[idx + 3] = toHalf(1.0);
    }
  }

  const eqTex = new THREE.DataTexture(data, w, h, THREE.RGBAFormat, THREE.HalfFloatType);
  eqTex.mapping = THREE.EquirectangularReflectionMapping;
  eqTex.minFilter = THREE.LinearFilter;
  eqTex.magFilter = THREE.LinearFilter;
  eqTex.needsUpdate = true;

  const pmrem = new THREE.PMREMGenerator(renderer);
  pmrem.compileEquirectangularShader();
  const envRT = pmrem.fromEquirectangular(eqTex);
  eqTex.dispose();
  pmrem.dispose();
  return envRT.texture;
}

// Analytical puddle query matching tarmac UV scale (world size 140m repeated 14x => 10m tile)
export function getPuddleFactorAt(worldX, worldZ) {
  const u = ((worldX / 10.0) % 1 + 1) % 1;
  const v = ((worldZ / 10.0) % 1 + 1) % 1;
  const macro = fbm2D(u, v, 3, 4, 0.55);
  return smoothstep(0.53, 0.62, macro);
}

export function createPBRMaterials(maxAnisotropy = 8) {
  const aniso = Math.min(maxAnisotropy, 8);

  // 1. Wet Rain-Soaked Harbor Concrete / Tarmac with Mirror Puddles
  const concSize = 256;
  const concAlbedo = new Uint8Array(concSize * concSize * 4);
  const concRough = new Uint8Array(concSize * concSize * 4);
  const concHeight = new Float32Array(concSize * concSize);

  for (let y = 0; y < concSize; y++) {
    const v = y / concSize;
    for (let x = 0; x < concSize; x++) {
      const u = x / concSize;
      const macro = fbm2D(u, v, 3, 4, 0.55);
      const grit = fbm2D(u + 0.31, v + 0.73, 16, 3, 0.5);
      const cell = worley2D(u, v, 24);
      const puddle = smoothstep(0.52, 0.63, macro);
      const dampRing = smoothstep(0.44, 0.53, macro) * (1.0 - puddle);

      // Expansion joint grooves
      const jointX = Math.abs(u - 0.5) < 0.006 ? 1.0 : 0.0;
      const jointY = Math.abs(v - 0.5) < 0.006 ? 1.0 : 0.0;
      const joint = Math.max(jointX, jointY) * (1.0 - puddle * 0.85);

      // Dry/damp base luminance vs darkened wet concrete
      let base = 54 + grit * 26 + cell * 11 - joint * 20;
      base *= lerp(1.0, 0.46, smoothstep(0.43, 0.6, macro));

      // Subtle oil iridescence / grime
      const grime = fbm2D(u * 2 + 0.1, v * 2 + 0.4, 6, 3, 0.5);
      const r = clamp(base * (0.96 + grime * 0.08), 10, 255);
      const g = clamp(base * (0.99 + grime * 0.05), 10, 255);
      const b = clamp(base * (1.05 + puddle * 0.08), 12, 255);

      // Roughness: puddles are mirror smooth (0.04), damp ring (0.28), coarse concrete (0.84)
      let rough = lerp(0.84 - grit * 0.1, 0.25, dampRing);
      rough = lerp(rough, 0.035, puddle);

      // Height: flat water surface in puddles, pitted aggregate outside
      const hVal = lerp((grit * 0.65 + cell * 0.35) * (1.0 - joint * 0.8), 0.5, puddle * 0.96);
      concHeight[y * concSize + x] = hVal;

      const idx = (y * concSize + x) * 4;
      concAlbedo[idx] = r | 0;
      concAlbedo[idx + 1] = g | 0;
      concAlbedo[idx + 2] = b | 0;
      concAlbedo[idx + 3] = 255;

      const rv = clamp(rough * 255, 6, 255) | 0;
      concRough[idx] = rv;
      concRough[idx + 1] = rv;
      concRough[idx + 2] = rv;
      concRough[idx + 3] = 255;
    }
  }
  const concNormal = heightToNormalMap(concHeight, concSize, 2.2);

  const wetConcrete = new THREE.MeshStandardMaterial({
    map: makeDataTex(concAlbedo, concSize, true, 14, 14, aniso),
    normalMap: makeDataTex(concNormal, concSize, false, 14, 14, aniso),
    normalScale: new THREE.Vector2(0.85, 0.85),
    roughnessMap: makeDataTex(concRough, concSize, false, 14, 14, aniso),
    roughness: 1.0,
    metalness: 0.08,
    envMapIntensity: 1.55,
  });

  // 2. Corrugated Shipping Containers (Shared Normal + Roughness + 5 Stenciled Color Variants)
  const contSize = 256;
  const contHeight = new Float32Array(contSize * contSize);
  const contRoughData = new Uint8Array(contSize * contSize * 4);
  const contMetalData = new Uint8Array(contSize * contSize * 4);
  const contRustMask = new Float32Array(contSize * contSize);

  for (let y = 0; y < contSize; y++) {
    const v = y / contSize;
    for (let x = 0; x < contSize; x++) {
      const u = x / contSize;
      // 18 trapezoidal corrugation ribs across container length
      const wave = Math.sin(u * TAU * 18);
      const trap = clamp(wave * 2.4, -1, 1) * 0.5 + 0.5;
      // Frame border along top/bottom/left/right
      const frame =
        u < 0.035 || u > 0.965 || v < 0.055 || v > 0.945 ? 1.0 : 0.0;
      const dent = (fbm2D(u + 0.2, v + 0.6, 8, 3, 0.5) - 0.5) * 0.14;
      const hVal = frame ? 0.78 + dent * 0.3 : trap * 0.72 + dent;
      contHeight[y * contSize + x] = hVal;

      // Rust concentrated near bottom edge, top seam, and random patches
      const nRust = fbm2D(u * 1.3 + 0.4, v * 1.3 + 0.1, 10, 4, 0.55);
      const bottomWear = Math.pow(clamp((v - 0.72) / 0.28, 0, 1), 1.4) * 0.45;
      const rust = smoothstep(0.58, 0.74, nRust + bottomWear);
      contRustMask[y * contSize + x] = rust;

      // Rain streaks running vertically
      const streak = fbm2D(u * 6.0, v * 0.5, 8, 2, 0.5);
      const rough = clamp(lerp(0.42 - streak * 0.12, 0.88, rust), 0.18, 0.95);
      const metal = clamp(lerp(0.38, 0.08, rust) + (frame ? 0.18 : 0), 0.05, 0.85);

      const idx = (y * contSize + x) * 4;
      const rv = (rough * 255) | 0;
      const mv = (metal * 255) | 0;
      contRoughData[idx] = contRoughData[idx + 1] = contRoughData[idx + 2] = rv;
      contRoughData[idx + 3] = 255;
      contMetalData[idx] = contMetalData[idx + 1] = contMetalData[idx + 2] = mv;
      contMetalData[idx + 3] = 255;
    }
  }
  const contNormalTex = makeDataTex(
    heightToNormalMap(contHeight, contSize, 3.4),
    contSize,
    false,
    1,
    1,
    aniso
  );
  const contRoughTex = makeDataTex(contRoughData, contSize, false, 1, 1, aniso);
  const contMetalTex = makeDataTex(contMetalData, contSize, false, 1, 1, aniso);

  const containerPalettes = [
    { name: 'navy', rgb: [30, 62, 92], code: 'SLTN 482910-4', brand: 'SALTLINE MARITIME' },
    { name: 'oxide', rgb: [126, 46, 34], code: 'KRSU 903418-2', brand: 'PACIFIC FREIGHT' },
    { name: 'ochre', rgb: [152, 102, 28], code: 'HLXU 217604-8', brand: 'HARBOR LOGISTICS' },
    { name: 'teal', rgb: [26, 82, 86], code: 'CMAU 774129-0', brand: 'AEGIS LINE' },
    { name: 'slate', rgb: [54, 64, 72], code: 'MSCU 639205-1', brand: 'NORTH QUAY' },
  ];

  const containers = containerPalettes.map((pal) => {
    const cw = 512;
    const ch = 256;
    const cvs = document.createElement('canvas');
    cvs.width = cw;
    cvs.height = ch;
    const ctx = cvs.getContext('2d');
    const img = ctx.createImageData(cw, ch);
    const d = img.data;

    for (let y = 0; y < ch; y++) {
      const v = y / ch;
      for (let x = 0; x < cw; x++) {
        const u = x / cw;
        const maskIdx = y * contSize + ((x >> 1) % contSize);
        const rust = contRustMask[maskIdx];
        const grime = fbm2D(u * 2 + 0.15, v + 0.25, 8, 3, 0.5);
        const ribShade = 0.9 + Math.sin(u * TAU * 36) * 0.1;
        const shade = (0.82 + grime * 0.26) * ribShade - (v > 0.85 ? (v - 0.85) * 1.3 : 0);

        const r = lerp(pal.rgb[0] * shade, 98 + grime * 28, rust);
        const g = lerp(pal.rgb[1] * shade, 46 + grime * 16, rust);
        const b = lerp(pal.rgb[2] * shade, 26 + grime * 10, rust);

        const idx = (y * cw + x) * 4;
        d[idx] = clamp(r, 8, 255);
        d[idx + 1] = clamp(g, 8, 255);
        d[idx + 2] = clamp(b, 8, 255);
        d[idx + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);

    // Crisp 2:1 proportioned shipping container typography & ISO weight table
    ctx.save();
    ctx.fillStyle = 'rgba(232, 238, 242, 0.78)';
    ctx.font = 'bold 15px Arial, sans-serif';
    ctx.fillText(pal.code, 355, 44);
    ctx.font = 'bold 12px Arial, sans-serif';
    ctx.fillText('45G1', 355, 60);
    ctx.font = 'bold 28px Arial, sans-serif';
    ctx.fillStyle = 'rgba(235, 240, 245, 0.58)';
    ctx.fillText(pal.brand, 42, 134);
    ctx.font = '11px monospace';
    ctx.fillStyle = 'rgba(220, 228, 232, 0.65)';
    ctx.fillText('MAX GROSS  32,500 KG', 42, 158);
    ctx.fillText('TARE        3,740 KG', 42, 173);
    ctx.fillStyle = 'rgba(235, 175, 40, 0.82)';
    ctx.fillRect(22, 20, 28, 9);
    ctx.restore();

    const mapTex = new THREE.CanvasTexture(cvs);
    mapTex.colorSpace = THREE.SRGBColorSpace;
    mapTex.anisotropy = aniso;
    mapTex.needsUpdate = true;

    return new THREE.MeshStandardMaterial({
      map: mapTex,
      normalMap: contNormalTex,
      normalScale: new THREE.Vector2(1.05, 1.05),
      roughnessMap: contRoughTex,
      metalnessMap: contMetalTex,
      roughness: 1.0,
      metalness: 1.0,
      envMapIntensity: 1.3,
    });
  });

  // 3. Galvanized Diamond Treadplate Steel (Catwalks, Ramps, Platforms)
  const galvSize = 128;
  const galvAlbedo = new Uint8Array(galvSize * galvSize * 4);
  const galvRough = new Uint8Array(galvSize * galvSize * 4);
  const galvHeight = new Float32Array(galvSize * galvSize);

  for (let y = 0; y < galvSize; y++) {
    const v = y / galvSize;
    for (let x = 0; x < galvSize; x++) {
      const u = x / galvSize;
      // Crisscross diamond lugs
      const gx = (u * 12) % 1;
      const gy = (v * 12) % 1;
      const lugA = Math.max(0, 1.0 - Math.abs(gx - 0.25) * 9 - Math.abs(gy - 0.25) * 3.2);
      const lugB = Math.max(0, 1.0 - Math.abs(gx - 0.75) * 3.2 - Math.abs(gy - 0.75) * 9);
      const lug = clamp(Math.max(lugA, lugB), 0, 1);

      const spangle = worley2D(u, v, 18);
      const wear = fbm2D(u, v, 6, 3, 0.5);
      galvHeight[y * galvSize + x] = lug * 0.75 + wear * 0.2;

      const lum = 105 + spangle * 34 + lug * 24 - wear * 18;
      const idx = (y * galvSize + x) * 4;
      galvAlbedo[idx] = clamp(lum * 0.96, 30, 235) | 0;
      galvAlbedo[idx + 1] = clamp(lum * 1.0, 30, 240) | 0;
      galvAlbedo[idx + 2] = clamp(lum * 1.06, 35, 245) | 0;
      galvAlbedo[idx + 3] = 255;

      const r = clamp((0.46 - lug * 0.16 + spangle * 0.14) * 255, 25, 230) | 0;
      galvRough[idx] = galvRough[idx + 1] = galvRough[idx + 2] = r;
      galvRough[idx + 3] = 255;
    }
  }
  const galvanizedSteel = new THREE.MeshStandardMaterial({
    map: makeDataTex(galvAlbedo, galvSize, true, 6, 6, aniso),
    normalMap: makeDataTex(heightToNormalMap(galvHeight, galvSize, 2.6), galvSize, false, 6, 6, aniso),
    roughnessMap: makeDataTex(galvRough, galvSize, false, 6, 6, aniso),
    roughness: 1.0,
    metalness: 0.78,
    envMapIntensity: 1.35,
  });

  // 4. Warehouse Concrete & Structural Steel Materials
  const wallSize = 128;
  const wallAlbedo = new Uint8Array(wallSize * wallSize * 4);
  const wallHeight = new Float32Array(wallSize * wallSize);
  for (let y = 0; y < wallSize; y++) {
    const v = y / wallSize;
    for (let x = 0; x < wallSize; x++) {
      const u = x / wallSize;
      const n = fbm2D(u, v, 8, 4, 0.5);
      const seam = Math.abs((v * 4) % 1) < 0.03 ? 1.0 : 0.0;
      wallHeight[y * wallSize + x] = n * 0.7 - seam * 0.5;
      const c = 68 + n * 30 - seam * 18 - v * 12;
      const idx = (y * wallSize + x) * 4;
      wallAlbedo[idx] = clamp(c * 0.98, 20, 200) | 0;
      wallAlbedo[idx + 1] = clamp(c * 1.0, 20, 200) | 0;
      wallAlbedo[idx + 2] = clamp(c * 1.04, 22, 210) | 0;
      wallAlbedo[idx + 3] = 255;
    }
  }
  const warehouseConcrete = new THREE.MeshStandardMaterial({
    map: makeDataTex(wallAlbedo, wallSize, true, 4, 2, aniso),
    normalMap: makeDataTex(heightToNormalMap(wallHeight, wallSize, 1.8), wallSize, false, 4, 2, aniso),
    roughness: 0.82,
    metalness: 0.06,
  });

  // 5. Industrial Crane Steel, Dark Steel, Ship Hull, Wood, Rubber
  const craneYellow = new THREE.MeshStandardMaterial({
    color: 0xb87a1e,
    roughness: 0.48,
    metalness: 0.62,
    envMapIntensity: 1.2,
  });

  const darkSteel = new THREE.MeshStandardMaterial({
    color: 0x1e262e,
    roughness: 0.42,
    metalness: 0.82,
    envMapIntensity: 1.35,
  });

  const shipHullRed = new THREE.MeshStandardMaterial({
    color: 0x4c1b18,
    roughness: 0.55,
    metalness: 0.45,
  });

  const shipDeckDark = new THREE.MeshStandardMaterial({
    color: 0x141b22,
    roughness: 0.5,
    metalness: 0.6,
  });

  const shipBridgeWhite = new THREE.MeshStandardMaterial({
    color: 0xb8c4ce,
    roughness: 0.52,
    metalness: 0.25,
  });

  const woodPallet = new THREE.MeshStandardMaterial({
    color: 0x5c4328,
    roughness: 0.86,
    metalness: 0.02,
  });

  const rubberBlack = new THREE.MeshStandardMaterial({
    color: 0x141618,
    roughness: 0.78,
    metalness: 0.05,
  });

  // 6. Hazard Stripe Canvas Texture (Jersey barriers, Relay bases, Crane legs)
  const hazCvs = document.createElement('canvas');
  hazCvs.width = 128;
  hazCvs.height = 128;
  const hctx = hazCvs.getContext('2d');
  hctx.fillStyle = '#d48d1c';
  hctx.fillRect(0, 0, 128, 128);
  hctx.fillStyle = '#181c20';
  for (let i = -128; i < 256; i += 32) {
    hctx.beginPath();
    hctx.moveTo(i, 0);
    hctx.lineTo(i + 16, 0);
    hctx.lineTo(i - 48, 128);
    hctx.lineTo(i - 64, 128);
    hctx.closePath();
    hctx.fill();
  }
  const hazTex = new THREE.CanvasTexture(hazCvs);
  hazTex.colorSpace = THREE.SRGBColorSpace;
  hazTex.wrapS = hazTex.wrapT = THREE.RepeatWrapping;
  const hazardStripe = new THREE.MeshStandardMaterial({
    map: hazTex,
    roughness: 0.45,
    metalness: 0.35,
  });

  // 7. Weapon & Mechanical Enemy Materials
  const gunmetal = new THREE.MeshStandardMaterial({
    color: 0x242a30,
    roughness: 0.32,
    metalness: 0.88,
    envMapIntensity: 1.5,
  });

  const gunSteel = new THREE.MeshStandardMaterial({
    color: 0x434d56,
    roughness: 0.24,
    metalness: 0.94,
    envMapIntensity: 1.6,
  });

  const polymerBlack = new THREE.MeshStandardMaterial({
    color: 0x15181c,
    roughness: 0.64,
    metalness: 0.14,
    envMapIntensity: 0.9,
  });

  const polymerTan = new THREE.MeshStandardMaterial({
    color: 0x52483a,
    roughness: 0.62,
    metalness: 0.12,
  });

  const brass = new THREE.MeshStandardMaterial({
    color: 0xd4a442,
    roughness: 0.22,
    metalness: 0.95,
    envMapIntensity: 1.6,
  });

  const mechArmor = new THREE.MeshStandardMaterial({
    color: 0x222932,
    roughness: 0.35,
    metalness: 0.84,
    envMapIntensity: 1.4,
  });

  const mechDarkJoint = new THREE.MeshStandardMaterial({
    color: 0x12161b,
    roughness: 0.52,
    metalness: 0.68,
  });

  const bossArmor = new THREE.MeshStandardMaterial({
    color: 0x2f2522,
    roughness: 0.3,
    metalness: 0.88,
    envMapIntensity: 1.5,
  });

  // 8. Emissive Beacons & Holographic Materials (drive UnrealBloomPass cleanly)
  const cyanEmissive = new THREE.MeshStandardMaterial({
    color: 0x22e6ff,
    emissive: 0x14c8ff,
    emissiveIntensity: 3.2,
    roughness: 0.2,
    metalness: 0.1,
  });

  const amberEmissive = new THREE.MeshStandardMaterial({
    color: 0xffa834,
    emissive: 0xff8818,
    emissiveIntensity: 3.4,
    roughness: 0.2,
    metalness: 0.1,
  });

  const redEmissive = new THREE.MeshStandardMaterial({
    color: 0xff3b2f,
    emissive: 0xff2618,
    emissiveIntensity: 3.8,
    roughness: 0.2,
    metalness: 0.1,
  });

  const greenEmissive = new THREE.MeshStandardMaterial({
    color: 0x2eff88,
    emissive: 0x18e86e,
    emissiveIntensity: 3.4,
    roughness: 0.2,
    metalness: 0.1,
  });

  const sodiumLampEmissive = new THREE.MeshStandardMaterial({
    color: 0xffd298,
    emissive: 0xff9d3b,
    emissiveIntensity: 4.5,
    roughness: 0.15,
  });

  // 9. Ocean Water Material with normal ripples
  const oceanNormalHeight = new Float32Array(128 * 128);
  for (let y = 0; y < 128; y++) {
    for (let x = 0; x < 128; x++) {
      const u = x / 128;
      const v = y / 128;
      oceanNormalHeight[y * 128 + x] =
        fbm2D(u, v, 6, 4, 0.55) * 0.7 + Math.sin(u * TAU * 4 + v * TAU * 2) * 0.15;
    }
  }
  const oceanNormalTex = makeDataTex(
    heightToNormalMap(oceanNormalHeight, 128, 2.8),
    128,
    false,
    28,
    28,
    aniso
  );
  const ocean = new THREE.MeshStandardMaterial({
    color: 0x07131d,
    normalMap: oceanNormalTex,
    normalScale: new THREE.Vector2(1.1, 1.1),
    roughness: 0.11,
    metalness: 0.22,
    envMapIntensity: 1.8,
  });

  //Dispose helper or random helper
  const rng = createRng(7712);

  return {
    wetConcrete,
    containers,
    galvanizedSteel,
    warehouseConcrete,
    craneYellow,
    darkSteel,
    shipHullRed,
    shipDeckDark,
    shipBridgeWhite,
    woodPallet,
    rubberBlack,
    hazardStripe,
    gunmetal,
    gunSteel,
    polymerBlack,
    polymerTan,
    brass,
    mechArmor,
    mechDarkJoint,
    bossArmor,
    cyanEmissive,
    amberEmissive,
    redEmissive,
    greenEmissive,
    sodiumLampEmissive,
    ocean,
    oceanNormalTex,
    rng,
  };
}
