// Raw WebGL2 (#version 300 es) Shaders for KEEP: PASSWORD FORTRESS
// Strict Palette: Sandstone Gold (#f5b82e), Fortress Limestone (#e7e0d2), Roof Terracotta (#e0633a),
// Sea Turquoise (#14b8a6), Emerald Meadow (#10b981), Flame Amber (#f97316), Slate Charcoal (#0b1117).
// Warm Sandstone, Coastal Turquoise & Emerald Palette. Every shader declares highp float & highp int.

export const SKY_VS = `#version 300 es
precision highp float;
precision highp int;

layout(location = 0) in vec3 aPos;
uniform mat4 uProj;
uniform mat4 uView;
uniform vec3 uCamPos;
out vec3 vDir;

void main() {
  vDir = aPos;
  gl_Position = uProj * uView * vec4(uCamPos + aPos * 420.0, 1.0);
}`;

export const SKY_FS = `#version 300 es
precision highp float;
precision highp int;

in vec3 vDir;
uniform vec3 uSunDir;
uniform float uTime;
uniform float uEntropyNorm; // 0.0 (0 bits storm) -> 1.0 (115+ bits sovereign golden sky)
uniform float uSiegeAmt;    // 0.0 -> 1.0 active brute-force siege alert

out vec4 fragColor;

float hash31(vec3 p) {
  p = fract(p * vec3(443.897, 441.423, 437.195));
  p += dot(p, p.yzx + 19.19);
  return fract((p.x + p.y) * p.z);
}

float hash21(vec2 p) {
  p = fract(p * vec2(127.1, 311.7));
  p += dot(p, p + 34.23);
  return fract(p.x * p.y);
}

float noise2(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(hash21(i), hash21(i + vec2(1.0, 0.0)), u.x),
    mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), u.x),
    u.y
  );
}

float fbm2(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  mat2 rot = mat2(0.8, 0.6, -0.6, 0.8);
  for (int i = 0; i < 4; i++) {
    v += a * noise2(p);
    p = rot * p * 2.03 + vec2(7.1, 3.4);
    a *= 0.5;
  }
  return v;
}

void main() {
  vec3 d = normalize(vDir);
  vec3 sunD = normalize(uSunDir);
  float h = clamp(d.y, -0.2, 1.0);
  float up = clamp(d.y, 0.0, 1.0);

  // Regime weights: storm (0..0.28), coastal daylight (0.22..0.68), sovereign golden-hour (0.60..1.0)
  float wDay = smoothstep(0.14, 0.42, uEntropyNorm);
  float wGold = smoothstep(0.58, 0.90, uEntropyNorm);

  // 1. Stormy Slate-Teal Squall Sky (<25 bits)
  vec3 stormZenith = vec3(0.048, 0.082, 0.112);
  vec3 stormHorizon = vec3(0.145, 0.215, 0.255);
  vec3 stormSky = mix(stormHorizon, stormZenith, pow(up, 0.65));

  // 2. Crisp Coastal Daylight Azure-Turquoise Sky (25-70 bits)
  vec3 dayZenith = vec3(0.065, 0.345, 0.545);
  vec3 dayMid = vec3(0.165, 0.595, 0.745);
  vec3 dayHorizon = vec3(0.560, 0.835, 0.865);
  vec3 daySky = mix(dayHorizon, dayMid, smoothstep(0.0, 0.35, up));
  daySky = mix(daySky, dayZenith, smoothstep(0.28, 0.95, up));

  // 3. Sovereign Golden-Hour Sanctuary Sky (70-128+ bits) — Teal-Cerulean Zenith -> Cream -> Sandstone Gold
  vec3 sovZenith = vec3(0.038, 0.175, 0.265);
  vec3 sovMid = vec3(0.155, 0.465, 0.495);
  vec3 sovHorizon = vec3(0.945, 0.715, 0.255);
  vec3 sovSky = mix(sovHorizon, sovMid, smoothstep(0.0, 0.36, up));
  sovSky = mix(sovSky, sovZenith, smoothstep(0.30, 0.92, up));

  vec3 col = mix(stormSky, daySky, wDay);
  col = mix(col, sovSky, wGold);

  // Procedural Moving Clouds (dark squall bands in low entropy, sunlit cumulus in medium/high)
  if (d.y > -0.04) {
    vec2 cloudUV = d.xz / (max(d.y, 0.06) + 0.18);
    float windSpd = mix(0.32, 0.09, wDay);
    float n = fbm2(cloudUV * 1.15 + vec2(uTime * windSpd, -uTime * windSpd * 0.4));
    float cloudMask = smoothstep(mix(0.36, 0.52, wDay), 0.84, n) * smoothstep(-0.02, 0.18, d.y);

    vec3 stormCloud = vec3(0.075, 0.115, 0.145);
    vec3 dayCloud = vec3(0.94, 0.96, 0.94);
    vec3 goldCloud = vec3(0.99, 0.84, 0.48);
    vec3 cCol = mix(stormCloud, dayCloud, wDay);
    cCol = mix(cCol, goldCloud, wGold * 0.82);
    col = mix(col, cCol, cloudMask * mix(0.75, 0.45, wGold));

    // Subtle distant storm squall lightning flash at very low entropy
    float stormWeight = 1.0 - wDay;
    if (stormWeight > 0.05) {
      float flash = pow(max(0.0, sin(uTime * 3.7) * sin(uTime * 11.3)), 16.0);
      col += vec3(0.35, 0.58, 0.65) * flash * stormWeight * cloudMask * 0.65;
    }
  }

  // Sun Disc, Golden Corona & Crepuscular Sunbeams
  float cosSun = clamp(dot(d, sunD), -1.0, 1.0);
  float ang = acos(cosSun);
  float sunVis = mix(0.14, 1.0, wDay);
  float sunDisc = (1.0 - smoothstep(0.028, 0.042, ang)) * sunVis;
  float corona = (exp(-ang * 7.5) * 0.55 + exp(-ang * 24.0) * 0.75) * sunVis;

  // Radial crepuscular god-rays in high entropy
  float rayAngle = atan(d.y - sunD.y, d.x - sunD.x);
  float rays = 0.5 + 0.5 * sin(rayAngle * 12.0 + uTime * 0.45) * cos(rayAngle * 7.0 - uTime * 0.3);
  float beamGlow = exp(-ang * 3.2) * rays * wGold * 0.32 * smoothstep(-0.05, 0.25, d.y);

  col += vec3(0.98, 0.75, 0.26) * (corona + beamGlow);
  col = mix(col, vec3(1.0, 0.97, 0.86), sunDisc);

  // Celebratory Sovereign Starlight in Upper Dome (Tier 4-5)
  if (wGold > 0.15 && d.y > 0.12) {
    vec3 starGrid = floor(d * 220.0);
    float sh = hash31(starGrid);
    if (sh > 0.984) {
      vec3 cellCenter = normalize(starGrid + 0.5);
      float dist = length(d - cellCenter) * 220.0;
      float tw = 0.65 + 0.35 * sin(uTime * 3.6 + sh * 95.0);
      float br = smoothstep(0.45, 0.04, dist) * tw * smoothstep(0.12, 0.55, d.y);
      vec3 starCol = mix(vec3(0.65, 0.95, 0.90), vec3(1.0, 0.86, 0.42), fract(sh * 53.7));
      col += starCol * br * wGold * 1.15;
    }
  }

  // Brute-force Siege Horizon Alert Glow (Flame Amber & Warm Crimson)
  if (uSiegeAmt > 0.001) {
    float horBand = exp(-abs(h - 0.06) * 6.5);
    float pulse = 0.78 + 0.22 * sin(uTime * 7.5);
    col += vec3(0.92, 0.34, 0.08) * horBand * uSiegeAmt * pulse * 0.52;
  }

  fragColor = vec4(pow(max(col, vec3(0.0)), vec3(1.85)), 1.0);
}`;

export const OCEAN_VS = `#version 300 es
precision highp float;
precision highp int;

layout(location = 0) in vec3 aPos;

uniform mat4 uProj;
uniform mat4 uView;
uniform float uTime;
uniform float uEntropyNorm;
uniform float uIslandRadius;

out vec3 vWorldPos;
out vec3 vNormal;
out float vWaveCrest;

float waveHeight(vec2 p, float t, float stormAmt) {
  float amp = mix(0.16, 0.68, stormAmt);
  float freq = mix(0.28, 0.42, stormAmt);
  float spd = mix(1.45, 2.85, stormAmt);

  // Dampen wave amplitude right at island shore for clean foam collar
  float dist = length(p);
  float shoreDamp = smoothstep(max(0.5, uIslandRadius * 0.55), uIslandRadius + 4.5, dist);
  amp *= mix(0.35, 1.0, shoreDamp);

  float w1 = sin(p.x * freq + t * spd + p.y * 0.18) * amp;
  float w2 = cos(p.y * (freq * 1.27) - t * (spd * 0.86) - p.x * 0.22) * (amp * 0.65);
  float w3 = sin((p.x + p.y) * (freq * 1.85) + t * (spd * 1.32)) * (amp * 0.32);
  return w1 + w2 + w3;
}

void main() {
  float stormAmt = 1.0 - smoothstep(0.05, 0.45, uEntropyNorm);
  vec2 xz = aPos.xz;
  float eps = 0.35;
  float hC = waveHeight(xz, uTime, stormAmt);
  float hX = waveHeight(xz + vec2(eps, 0.0), uTime, stormAmt);
  float hZ = waveHeight(xz + vec2(0.0, eps), uTime, stormAmt);

  vec3 pos = vec3(xz.x, hC - 0.35, xz.y);
  vec3 nrm = normalize(vec3(hC - hX, eps, hC - hZ));

  vWorldPos = pos;
  vNormal = nrm;
  vWaveCrest = clamp((hC / max(0.22, mix(0.22, 0.85, stormAmt))) * 0.5 + 0.5, 0.0, 1.0);
  gl_Position = uProj * uView * vec4(pos, 1.0);
}`;

export const OCEAN_FS = `#version 300 es
precision highp float;
precision highp int;

in vec3 vWorldPos;
in vec3 vNormal;
in float vWaveCrest;

uniform vec3 uCamPos;
uniform vec3 uSunDir;
uniform float uTime;
uniform float uEntropyNorm;
uniform float uIslandRadius;
uniform float uSkyCascadeAmt; // >0 in Tier 4-5 when waterfalls splash into the sea
uniform float uSiegeAmt;

out vec4 fragColor;

float hash21(vec2 p) {
  p = fract(p * vec2(127.1, 311.7));
  p += dot(p, p + 34.23);
  return fract(p.x * p.y);
}

float noise2(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(hash21(i), hash21(i + vec2(1.0, 0.0)), u.x),
    mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), u.x),
    u.y
  );
}

void main() {
  vec3 N = normalize(vNormal);
  vec3 V = normalize(uCamPos - vWorldPos);
  vec3 L = normalize(uSunDir);

  float wDay = smoothstep(0.14, 0.44, uEntropyNorm);
  float wGold = smoothstep(0.58, 0.90, uEntropyNorm);
  float dist = length(vWorldPos.xz);

  // Base deep & shallow lagoon colors (Sea Turquoise #14b8a6 & Emerald #10b981, Storm Slate-Teal)
  vec3 stormDeep = vec3(0.032, 0.095, 0.125);
  vec3 stormShallow = vec3(0.065, 0.185, 0.215);

  vec3 dayDeep = vec3(0.035, 0.265, 0.385);
  vec3 dayShallow = vec3(0.078, 0.722, 0.651); // #14b8a6 Sea Turquoise

  vec3 sovDeep = vec3(0.042, 0.315, 0.365);
  vec3 sovShallow = vec3(0.075, 0.745, 0.585); // Shimmering Emerald-Turquoise

  float reefMask = 1.0 - smoothstep(uIslandRadius * 0.7, uIslandRadius + 9.5, dist);
  vec3 deepCol = mix(mix(stormDeep, dayDeep, wDay), sovDeep, wGold);
  vec3 shalCol = mix(mix(stormShallow, dayShallow, wDay), sovShallow, wGold);
  vec3 waterCol = mix(deepCol, shalCol, reefMask);

  // Fresnel sky reflection
  float fres = pow(1.0 - max(dot(N, V), 0.0), 4.0);
  vec3 skyRefl = mix(
    vec3(0.15, 0.23, 0.28),
    mix(vec3(0.45, 0.78, 0.88), vec3(0.96, 0.76, 0.34), wGold),
    wDay
  );
  waterCol = mix(waterCol, skyRefl, clamp(fres * 0.68, 0.0, 0.75));

  // Animated caustic & wave sparkle
  float nFoam = noise2(vWorldPos.xz * 0.85 + vec2(uTime * 0.6, -uTime * 0.45));
  float stormWhitecap = smoothstep(0.68, 0.92, vWaveCrest * 0.75 + nFoam * 0.35) * (1.0 - wDay * 0.65);

  // Shoreline surf rings around island or raft
  float shoreDist = abs(dist - max(2.2, uIslandRadius));
  float surfWave = sin(shoreDist * 3.4 - uTime * 3.2) * 0.5 + 0.5;
  float shoreFoam = smoothstep(2.4, 0.15, shoreDist) * smoothstep(0.35, 0.85, surfWave + nFoam * 0.35);

  // Tier 4-5 Sky Citadel waterfall plunge pool foam rings at 4 cardinal spillways
  float plungeFoam = 0.0;
  if (uSkyCascadeAmt > 0.01) {
    float rPlunge = 6.8;
    for (int i = 0; i < 4; i++) {
      float ang = float(i) * 1.5707963;
      vec2 pCenter = vec2(cos(ang), sin(ang)) * rPlunge;
      float dP = length(vWorldPos.xz - pCenter);
      float ring = sin(dP * 4.5 - uTime * 5.5) * 0.5 + 0.5;
      plungeFoam += smoothstep(3.2, 0.2, dP) * (0.45 + 0.55 * ring);
    }
    plungeFoam = clamp(plungeFoam, 0.0, 1.0) * uSkyCascadeAmt;
  }

  float totalFoam = clamp(stormWhitecap * 0.65 + shoreFoam * 0.88 + plungeFoam * 0.92, 0.0, 1.0);
  vec3 foamCol = mix(vec3(0.76, 0.84, 0.86), vec3(0.98, 0.97, 0.92), wDay);
  waterCol = mix(waterCol, foamCol, totalFoam);

  // Sun specular glitter path (Sandstone Gold #f5b82e)
  vec3 H = normalize(L + V);
  float spec = pow(max(dot(N, H), 0.0), mix(42.0, 140.0, wDay));
  vec3 specCol = mix(vec3(0.55, 0.70, 0.75), vec3(0.99, 0.82, 0.38), mix(0.35, 1.0, wGold));
  waterCol += specCol * spec * mix(0.35, 1.35, wDay);

  // Horizon distance fog blend so ocean melts seamlessly into the sky dome
  float camDist = length(vWorldPos - uCamPos);
  float fogAmt = smoothstep(55.0, 145.0, camDist);
  vec3 fogCol = mix(
    vec3(0.145, 0.215, 0.255),
    mix(vec3(0.560, 0.835, 0.865), vec3(0.945, 0.715, 0.255), wGold),
    wDay
  );
  if (uSiegeAmt > 0.01) {
    fogCol += vec3(0.38, 0.14, 0.03) * uSiegeAmt;
  }
  waterCol = mix(waterCol, fogCol, fogAmt);

  fragColor = vec4(pow(max(waterCol, vec3(0.0)), vec3(1.85)), 1.0);
}`;

export const WORLD_VS = `#version 300 es
precision highp float;
precision highp int;

layout(location = 0) in vec3 aPos;
layout(location = 1) in vec3 aNorm;
layout(location = 2) in vec2 aUV;

uniform mat4 uProj;
uniform mat4 uView;
uniform mat4 uModel;

out vec3 vWorldPos;
out vec3 vLocalPos;
out vec3 vNormal;
out vec2 vUV;

void main() {
  vec4 wp = uModel * vec4(aPos, 1.0);
  vWorldPos = wp.xyz;
  vLocalPos = aPos;
  mat3 nMat = mat3(uModel);
  // Safe normalize for non-uniform TRS scales: divide by squared column lengths
  vec3 c0 = nMat[0];
  vec3 c1 = nMat[1];
  vec3 c2 = nMat[2];
  vec3 invScale2 = vec3(
    1.0 / max(dot(c0, c0), 1e-6),
    1.0 / max(dot(c1, c1), 1e-6),
    1.0 / max(dot(c2, c2), 1e-6)
  );
  vNormal = normalize(nMat * (aNorm * invScale2));
  vUV = aUV;
  gl_Position = uProj * uView * wp;
}`;

export const WORLD_FS = `#version 300 es
precision highp float;
precision highp int;

in vec3 vWorldPos;
in vec3 vLocalPos;
in vec3 vNormal;
in vec2 vUV;

uniform vec3 uCamPos;
uniform vec3 uSunDir;
uniform float uTime;
uniform float uEntropyNorm;
uniform float uSiegeAmt;
uniform vec4 uHearthLight;    // xyz: campfire/forge world pos, w: intensity
uniform vec4 uLighthouseBeam; // xy: lighthouse XZ, z: beam angle, w: intensity
uniform vec3 uColor;
uniform vec4 uParams;         // x: matType (0=stone,1=wood/roof,2=meadow,3=brass/gold,4=waterfall,5=emissive), y: emissiveBoost, z: alpha, w: aoHint

out vec4 fragColor;

float hash31(vec3 p) {
  p = fract(p * vec3(127.1, 311.7, 74.7));
  p += dot(p, p.yzx + 19.19);
  return fract((p.x + p.y) * p.z);
}

void main() {
  vec3 N = normalize(vNormal);
  vec3 V = normalize(uCamPos - vWorldPos);
  vec3 L = normalize(uSunDir);

  float matType = uParams.x;
  float emissive = uParams.y;
  float alpha = uParams.z;
  float aoHint = uParams.w;

  // Linearize palette color so ACES + 1/2.2 sRGB post-process preserves deep rich diorama hues
  vec3 baseCol = pow(max(uColor, vec3(0.0)), vec3(2.05));
  float roughness = 0.65;
  float specStrength = 0.22;

  // Tactile procedural surface sculpting per material class
  if (matType < 0.5) {
    // 0: Carved Fortress Limestone / Ashlar Masonry
    float row = floor(vWorldPos.y * 3.2);
    float brick = fract((vWorldPos.x + vWorldPos.z) * 1.35 + mod(row, 2.0) * 0.5);
    float mortarY = smoothstep(0.06, 0.15, fract(vWorldPos.y * 3.2));
    float mortarX = smoothstep(0.05, 0.13, brick);
    float blockHash = hash31(vec3(floor((vWorldPos.x + vWorldPos.z) * 1.35 + mod(row, 2.0) * 0.5), row, 1.0));
    baseCol *= (0.82 + 0.24 * blockHash) * (0.76 + 0.24 * mortarY * mortarX);
    roughness = 0.70;
    specStrength = 0.16;
  } else if (matType < 1.5) {
    // 1: Roof Terracotta Shingles & Seasoned Oak Timber
    float plank = sin((vLocalPos.x * 10.0 + vLocalPos.z * 10.0 + vLocalPos.y * 16.0)) * 0.5 + 0.5;
    baseCol *= 0.84 + 0.24 * plank;
    roughness = 0.54;
    specStrength = 0.26;
  } else if (matType < 2.5) {
    // 2: Lush Emerald Island Meadow & Limestone Sea Cliff
    float topMask = smoothstep(0.42, 0.78, N.y);
    vec3 cliffCol = pow(vec3(0.56, 0.52, 0.44), vec3(2.05)) * (0.78 + 0.28 * sin(vWorldPos.y * 4.5));
    float dapple = hash31(floor(vWorldPos * 3.5));
    vec3 grassCol = mix(baseCol * 0.82, pow(vec3(0.09, 0.72, 0.46), vec3(2.05)), 0.32 + 0.45 * dapple);
    baseCol = mix(cliffCol, grassCol, topMask);
    roughness = 0.78;
    specStrength = 0.12;
  } else if (matType < 3.5) {
    // 3: Forged Cannon Brass & Sovereign Sandstone Gold
    roughness = 0.20;
    specStrength = 1.15;
  } else if (matType < 4.5) {
    // 4: Animated Rim Waterfall Cascade
    float flow = vWorldPos.y * 2.6 + uTime * 5.2;
    float streak = sin(vLocalPos.x * 16.0 + sin(flow * 0.7)) * 0.5 + 0.5;
    float foamPulse = sin(flow * 2.2 + streak * 3.1) * 0.5 + 0.5;
    baseCol = mix(pow(vec3(0.08, 0.72, 0.65), vec3(2.05)), vec3(0.92, 0.98, 0.96), foamPulse * 0.72);
    emissive = max(emissive, 0.35);
  }

  // Lighting: Warm Directional Sun + Sky Hemisphere + Sandstone Shadow Tint
  float wDay = smoothstep(0.14, 0.44, uEntropyNorm);
  float wGold = smoothstep(0.58, 0.90, uEntropyNorm);

  float wrapDiff = max(0.0, (dot(N, L) + 0.16) / 1.16);

  vec3 sunCol = mix(
    vec3(0.48, 0.62, 0.70),
    mix(vec3(1.25, 1.16, 0.96), vec3(1.38, 1.02, 0.48), wGold),
    wDay
  );
  vec3 skyAmb = mix(
    vec3(0.12, 0.18, 0.24),
    mix(vec3(0.20, 0.36, 0.48), vec3(0.28, 0.32, 0.24), wGold),
    wDay
  );
  // Warm sandstone bounce from ground/island below
  vec3 bounceAmb = mix(vec3(0.05, 0.09, 0.11), vec3(0.24, 0.16, 0.07), wDay);
  vec3 ambient = mix(bounceAmb, skyAmb, N.y * 0.5 + 0.5);

  // Tactile diorama ambient occlusion near ground/waterline & crevices
  float worldAO = smoothstep(-1.2, 2.4, vWorldPos.y) * 0.36 + 0.64;
  worldAO *= clamp(aoHint, 0.35, 1.15);

  vec3 lit = baseCol * (ambient * worldAO + sunCol * wrapDiff * mix(0.60, 1.12, wDay));

  // Specular highlight (rich golden sheen on brass/gold & wet storm surfaces)
  vec3 H = normalize(L + V);
  float shininess = mix(128.0, 14.0, roughness);
  float spec = pow(max(dot(N, H), 0.0), shininess) * specStrength;
  if (matType >= 2.5 && matType < 3.5) {
    // Metallic tint for brass & gold
    lit += mix(vec3(1.0, 0.92, 0.68), baseCol * 1.4, 0.65) * spec * 1.35;
    float fresMetal = pow(1.0 - max(dot(N, V), 0.0), 3.0);
    lit += vec3(0.96, 0.76, 0.32) * fresMetal * 0.28;
  } else {
    lit += sunCol * spec * 0.45;
  }

  // Dynamic Hearth / Campfire / Torch Warm Point Light
  if (uHearthLight.w > 0.01) {
    vec3 toLight = uHearthLight.xyz - vWorldPos;
    float d2 = dot(toLight, toLight) + 1.2;
    float atten = uHearthLight.w / d2;
    float pNdl = max(dot(N, normalize(toLight)), 0.0) * 0.7 + 0.3;
    lit += baseCol * vec3(1.0, 0.56, 0.16) * atten * pNdl * 2.4;
  }

  // Sweeping Harbor Lighthouse Beam Illumination (Tier 3+)
  if (uLighthouseBeam.w > 0.01) {
    vec2 rel = vWorldPos.xz - uLighthouseBeam.xy;
    float rDist = length(rel);
    if (rDist > 0.8 && rDist < 36.0) {
      vec2 beamDir = vec2(cos(uLighthouseBeam.z), sin(uLighthouseBeam.z));
      float align = dot(normalize(rel), beamDir);
      float cone = smoothstep(0.90, 0.995, align) * (1.0 - smoothstep(8.0, 36.0, rDist));
      lit += vec3(0.98, 0.80, 0.32) * cone * uLighthouseBeam.w * 0.55;
    }
  }

  // Emissive Windows, Torchlight Flicker, Solar Spire & Siege Meteors
  if (emissive > 0.001) {
    float flicker = 1.0;
    if (matType > 4.5) {
      flicker = 0.88 + 0.12 * sin(uTime * 11.0 + vWorldPos.x * 3.1 + vWorldPos.z * 2.7);
    }
    lit = mix(lit, baseCol * (1.15 + emissive * 0.85) * flicker, clamp(emissive, 0.0, 1.0));
    if (emissive > 1.0) {
      lit += baseCol * (emissive - 1.0) * flicker * 0.65;
    }
  }

  // Subtle Aerial Perspective Fog
  float camDist = length(vWorldPos - uCamPos);
  float fogAmt = smoothstep(65.0, 155.0, camDist);
  vec3 fogCol = pow(
    mix(
      vec3(0.145, 0.215, 0.255),
      mix(vec3(0.560, 0.835, 0.865), vec3(0.945, 0.715, 0.255), wGold),
      wDay
    ),
    vec3(1.85)
  );
  lit = mix(lit, fogCol, fogAmt * 0.85);

  fragColor = vec4(lit, alpha);
}`;

export const SHIELD_VS = `#version 300 es
precision highp float;
precision highp int;

layout(location = 0) in vec3 aPos;
layout(location = 1) in vec3 aNorm;

uniform mat4 uProj;
uniform mat4 uView;
uniform mat4 uModel;

out vec3 vWorldPos;
out vec3 vLocalDir;
out vec3 vNormal;

void main() {
  vec4 wp = uModel * vec4(aPos, 1.0);
  vWorldPos = wp.xyz;
  vLocalDir = normalize(aPos);
  vNormal = normalize(mat3(uModel) * aNorm);
  gl_Position = uProj * uView * wp;
}`;

export const SHIELD_FS = `#version 300 es
precision highp float;
precision highp int;

in vec3 vWorldPos;
in vec3 vLocalDir;
in vec3 vNormal;

uniform vec3 uCamPos;
uniform float uTime;
uniform float uShieldAlpha;  // 0..1 visibility in Tier 4-5
uniform vec4 uShieldHit;     // xyz: unit impact dir on dome, w: shockwave flash [0..1]

out vec4 fragColor;

void main() {
  if (vLocalDir.y < -0.02) discard;

  vec3 N = normalize(vNormal);
  vec3 V = normalize(uCamPos - vWorldPos);
  float fres = pow(1.0 - abs(dot(N, V)), 2.6);

  // Geodesic Sacred-Lattice Energy Grid (Sandstone Gold #f5b82e + Sea Turquoise #14b8a6)
  float lat = acos(clamp(vLocalDir.y, -1.0, 1.0)) * 14.0;
  float lon = atan(vLocalDir.z, vLocalDir.x) * 12.0;
  float g1 = abs(sin(lat));
  float g2 = abs(sin(lon + lat * 0.5));
  float g3 = abs(sin(lon - lat * 0.5));
  float hexLine = (1.0 - smoothstep(0.0, 0.11, g1))
                + (1.0 - smoothstep(0.0, 0.11, g2))
                + (1.0 - smoothstep(0.0, 0.11, g3));
  hexLine = clamp(hexLine, 0.0, 1.0);

  // Upward sovereign pulse wave
  float scan = sin(vLocalDir.y * 18.0 - uTime * 2.6) * 0.5 + 0.5;
  float pulse = pow(scan, 5.0);

  vec3 turq = vec3(0.078, 0.722, 0.651);
  vec3 gold = vec3(0.961, 0.722, 0.180);
  vec3 col = mix(turq, gold, clamp(hexLine * 0.65 + pulse * 0.55, 0.0, 1.0));

  float baseFade = smoothstep(-0.02, 0.18, vLocalDir.y);
  float alpha = (fres * 0.36 + hexLine * 0.085 + pulse * 0.05) * baseFade * uShieldAlpha;

  // Siege Meteor Deflection Shockwave Ring!
  if (uShieldHit.w > 0.001) {
    float angDist = acos(clamp(dot(normalize(vLocalDir), normalize(uShieldHit.xyz)), -1.0, 1.0));
    float ringR = (1.0 - uShieldHit.w) * 0.95;
    float ring = exp(-abs(angDist - ringR) * 18.0) * uShieldHit.w;
    float core = exp(-angDist * 7.0) * uShieldHit.w;
    col = mix(col, vec3(1.0, 0.88, 0.42), clamp(ring + core, 0.0, 1.0));
    alpha += (ring * 0.85 + core * 0.65) * baseFade;
  }

  fragColor = vec4(col, clamp(alpha, 0.0, 0.92));
}`;

export const PARTICLE_VS = `#version 300 es
precision highp float;
precision highp int;

layout(location = 0) in vec2 aCorner;
layout(location = 1) in vec4 iPosSize; // xyz: world pos, w: size
layout(location = 2) in vec4 iRotKind; // x: rot, y: stretch, z: unused, w: kind (0=smoke, 1=spark/firework, 2=ring)
layout(location = 3) in vec4 iColor;   // rgba

uniform mat4 uProj;
uniform mat4 uView;

out vec2 vUV;
out vec4 vColor;
flat out int vKind;

void main() {
  vec3 right = vec3(uView[0][0], uView[1][0], uView[2][0]);
  vec3 up = vec3(uView[0][1], uView[1][1], uView[2][1]);

  float c = cos(iRotKind.x);
  float s = sin(iRotKind.x);
  vec2 rotCorner = vec2(
    aCorner.x * c - aCorner.y * s,
    (aCorner.x * s + aCorner.y * c) * max(0.5, iRotKind.y)
  );

  vec3 worldPos = iPosSize.xyz + (right * rotCorner.x + up * rotCorner.y) * iPosSize.w;
  vUV = aCorner;
  vColor = iColor;
  vKind = int(iRotKind.w + 0.5);
  gl_Position = uProj * uView * vec4(worldPos, 1.0);
}`;

export const PARTICLE_FS = `#version 300 es
precision highp float;
precision highp int;

in vec2 vUV;
in vec4 vColor;
flat in int vKind;

out vec4 fragColor;

void main() {
  float r = length(vUV);
  if (r > 1.0) discard;

  if (vKind == 0) {
    // Soft billowing smoke / sea spray puff
    float soft = pow(1.0 - r, 1.75);
    fragColor = vec4(vColor.rgb, vColor.a * soft);
  } else if (vKind == 2) {
    // Expanding golden/turquoise shockwave ring
    float ring = exp(-abs(r - 0.72) * 11.0) * (1.0 - smoothstep(0.88, 1.0, r));
    fragColor = vec4(vColor.rgb * 1.25, vColor.a * ring);
  } else {
    // Blazing firework star / cannon spark / dragon flame
    float core = exp(-r * 3.6);
    float hot = 1.0 - smoothstep(0.0, 0.34, r);
    vec3 col = mix(vColor.rgb, vec3(1.0, 0.98, 0.88), hot * 0.7);
    fragColor = vec4(col, vColor.a * core);
  }
}`;

export const POST_VS = `#version 300 es
precision highp float;
precision highp int;

out vec2 vUV;

void main() {
  vec2 pos = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  vUV = pos;
  gl_Position = vec4(pos * 2.0 - 1.0, 0.0, 1.0);
}`;

export const POST_FS = `#version 300 es
precision highp float;
precision highp int;

in vec2 vUV;
uniform sampler2D uTex;
uniform vec2 uRes;
uniform float uImpactFlash; // Warm amber/crimson flash on breach or cannon salvo
uniform float uGoldGlow;    // Warm celebratory glow on tier-up

out vec4 fragColor;

vec3 acesFilm(vec3 x) {
  const float a = 2.51;
  const float b = 0.03;
  const float c = 2.43;
  const float d = 0.59;
  const float e = 0.14;
  return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0);
}

void main() {
  vec2 px = 1.0 / max(uRes, vec2(1.0));
  vec3 col = texture(uTex, vUV).rgb;

  // Lightweight 4-tap warm highlight bloom
  vec3 b0 = texture(uTex, vUV + vec2( 1.5,  1.5) * px).rgb;
  vec3 b1 = texture(uTex, vUV + vec2(-1.5,  1.5) * px).rgb;
  vec3 b2 = texture(uTex, vUV + vec2( 1.5, -1.5) * px).rgb;
  vec3 b3 = texture(uTex, vUV + vec2(-1.5, -1.5) * px).rgb;
  vec3 avg = (b0 + b1 + b2 + b3) * 0.25;
  float luma = dot(avg, vec3(0.299, 0.587, 0.114));
  col += max(vec3(0.0), avg - 0.72) * (0.28 + uGoldGlow * 0.35) * smoothstep(0.65, 1.2, luma);

  // Vignette & Siege / Tier-Up Feedback (Strict Sandstone Gold & Flame Amber)
  vec2 centered = vUV - 0.5;
  float r2 = dot(centered, centered);
  col *= 1.0 - r2 * 0.36;

  if (uImpactFlash > 0.001) {
    col += vec3(0.95, 0.38, 0.09) * uImpactFlash * (0.18 + r2 * 0.85);
  }
  if (uGoldGlow > 0.001) {
    col += vec3(0.96, 0.72, 0.18) * uGoldGlow * 0.16;
  }

  col = acesFilm(col * 1.06);
  col = pow(col, vec3(1.0 / 2.2));
  fragColor = vec4(col, 1.0);
}`;

export function compileProgram(gl, vsSrc, fsSrc, uniformNames = []) {
  const compile = (type, src) => {
    const sh = gl.createShader(type);
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
      const info = gl.getShaderInfoLog(sh);
      gl.deleteShader(sh);
      throw new Error(`Shader compile error: ${info}`);
    }
    return sh;
  };

  const vs = compile(gl.VERTEX_SHADER, vsSrc);
  const fs = compile(gl.FRAGMENT_SHADER, fsSrc);
  const prog = gl.createProgram();
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  gl.deleteShader(vs);
  gl.deleteShader(fs);

  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    const info = gl.getProgramInfoLog(prog);
    gl.deleteProgram(prog);
    throw new Error(`Program link error: ${info}`);
  }

  const u = {};
  for (const name of uniformNames) {
    u[name] = gl.getUniformLocation(prog, name);
  }
  return { prog, u };
}
