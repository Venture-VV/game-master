// WebGL2 (#version 300 es) Shaders for What the Water Keeps:
// Painterly Storybook Sky + Aurora, Gerstner Fresnel Water + Live Wake/Chime Ripples, Lit 3D Realms & Watercolor Post-Process

export const WATER_SKY_VS = `#version 300 es
precision highp float;
precision highp int;
layout(location = 0) in vec3 aPos;
uniform mat4 uProj;
uniform mat4 uView;
uniform vec3 uCamPos;
out vec3 vDir;
void main() {
  vDir = aPos;
  gl_Position = uProj * uView * vec4(uCamPos + aPos * 640.0, 1.0);
}`;

export const WATER_SKY_FS = `#version 300 es
precision highp float;
precision highp int;
in vec3 vDir;
uniform float uTime;
uniform vec3 uSkyZenith;
uniform vec3 uSkyMid;
uniform vec3 uSkyHorizon;
uniform vec3 uSunDir;
uniform vec3 uSunCol;
uniform float uStarAmt;
uniform float uAuroraAmt;
uniform float uConstellationAmt;
out vec4 fragColor;

float hash21(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(hash21(i), hash21(i + vec2(1.0, 0.0)), u.x),
    mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), u.x),
    u.y
  );
}

float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  mat2 rot = mat2(0.80, 0.60, -0.60, 0.80);
  for (int i = 0; i < 4; i++) {
    v += a * vnoise(p);
    p = rot * p * 2.03;
    a *= 0.5;
  }
  return v;
}

void main() {
  vec3 d = normalize(vDir);
  float el = clamp(d.y, -0.15, 1.0);
  float az = atan(d.x, -d.z);

  // Storybook 3-stop atmospheric wash
  vec3 sky = mix(uSkyMid, uSkyZenith, smoothstep(0.16, 0.82, el));
  sky = mix(uSkyHorizon, sky, smoothstep(0.0, 0.28, el));
  sky = mix(uSkyHorizon * 0.90, sky, smoothstep(-0.12, 0.02, el));

  // Soft Monet watercolor cloud brushstrokes drifting gently
  if (el > -0.02) {
    vec2 cloudUV = vec2(az * 2.6 + uTime * 0.012, el * 5.8 - uTime * 0.006);
    float c1 = fbm(cloudUV);
    float c2 = fbm(cloudUV * 2.1 + vec2(3.7, 1.4));
    float cloudMask = smoothstep(0.46, 0.82, c1 * 0.72 + c2 * 0.28) * (1.0 - smoothstep(0.35, 0.85, el));
    vec3 cloudTint = mix(uSkyHorizon * 1.06, uSunCol, 0.35);
    sky = mix(sky, cloudTint, cloudMask * 0.32);
  }

  // Twinkling Little-Prince Starfield in night/twilight realms
  if (uStarAmt > 0.01 && el > 0.03) {
    vec2 starGrid = vec2(az * 46.0, el * 58.0);
    vec2 cell = floor(starGrid);
    vec2 f = fract(starGrid) - 0.5;
    float rnd = hash21(cell);
    if (rnd > 0.915) {
      vec2 jitter = vec2(hash21(cell + 7.1), hash21(cell + 13.3)) - 0.5;
      float r = length(f - jitter * 0.55);
      float twinkle = 0.62 + 0.38 * sin(uTime * (2.2 + rnd * 4.0) + rnd * 40.0);
      float star = (1.0 - smoothstep(0.015, 0.16, r)) * twinkle * smoothstep(0.03, 0.28, el);
      vec3 starCol = mix(vec3(0.76, 0.96, 0.92), vec3(1.0, 0.88, 0.56), fract(rnd * 17.3));
      sky += starCol * star * uStarAmt * 1.15;
    }
  }

  // Undulating Emerald & Warm-Gold Aurora Borealis Ribbons (Realm 07 Glacial Aurora Mirror)
  if (uAuroraAmt > 0.01 && el > 0.02) {
    float wave1 = sin(az * 5.0 + uTime * 0.38 + sin(az * 2.3 - uTime * 0.21) * 1.4) * 0.09;
    float band1 = exp(-abs(el - (0.30 + wave1)) * 11.5);
    float rays1 = 0.55 + 0.45 * vnoise(vec2(az * 28.0 + uTime * 0.45, el * 6.0));
    float curtain1 = band1 * rays1 * smoothstep(0.02, 0.14, el);

    float wave2 = cos(az * 4.0 - uTime * 0.29 + 1.7) * 0.08;
    float band2 = exp(-abs(el - (0.42 + wave2)) * 13.0);
    float rays2 = 0.5 + 0.5 * vnoise(vec2(az * 22.0 - uTime * 0.35, el * 8.0));
    float curtain2 = band2 * rays2 * smoothstep(0.06, 0.20, el);

    vec3 emeraldAurora = vec3(0.19, 0.92, 0.70);
    vec3 goldAurora = vec3(0.96, 0.80, 0.34);
    sky += (emeraldAurora * curtain1 * 0.78 + goldAurora * curtain2 * 0.52) * uAuroraAmt;
  }

  // Warm Sun / Moon Disc + Soft Storybook Halo
  vec3 sunD = normalize(uSunDir);
  float ang = acos(clamp(dot(d, sunD), -1.0, 1.0));
  float sunDisc = 1.0 - smoothstep(0.052, 0.064, ang);
  float mie = exp(-ang * 5.2) * 0.58 + exp(-ang * 16.0) * 0.42;
  sky += uSunCol * mie * 0.72;
  sky = mix(sky, mix(uSunCol, vec3(1.0, 0.98, 0.90), 0.55), sunDisc);

  // Golden Memory Constellation Crown over the -Z Horizon as Memories are gathered!
  if (uConstellationAmt > 0.01 && d.z < -0.25 && el > 0.08 && el < 0.62) {
    for (int i = 0; i < 8; i++) {
      float fi = float(i);
      float lit = clamp(uConstellationAmt * 8.0 - fi, 0.0, 1.0);
      if (lit > 0.01) {
        float ca = (fi - 3.5) * 0.095 + sin(fi * 1.9) * 0.025;
        float ce = 0.26 + sin(fi * 0.85 + 0.4) * 0.09 + (3.5 - abs(fi - 3.5)) * 0.025;
        vec3 starDir = normalize(vec3(sin(ca), ce, -cos(ca)));
        float sa = acos(clamp(dot(d, starDir), -1.0, 1.0));
        float glow = exp(-sa * 120.0) * 1.35 + exp(-sa * 28.0) * 0.25;
        sky += vec3(1.0, 0.86, 0.44) * glow * lit;
      }
    }
  }

  fragColor = vec4(sky, 1.0);
}`;

// Dedicated Painterly Gerstner + Fresnel + Live Boat-Wake & Chime-Ripple Water Shader
export const WATER_SURF_VS = `#version 300 es
precision highp float;
precision highp int;
layout(location = 0) in vec3 aPos;

uniform mat4 uProj;
uniform mat4 uView;
uniform vec2 uSnapXZ;
uniform float uTime;
uniform vec4 uBoatWake;     // x: boatX, y: boatZ, z: boatYaw, w: boatSpeed
uniform vec4 uRipples[8];   // xy: centerXZ, z: radius, w: signedAmp (>0 wake/oar, <0 golden chime)

out vec3 vWorldPos;
out vec3 vNormal;
out float vFoam;
out float vChimeGlow;

void main() {
  vec2 worldXZ = aPos.xz + uSnapXZ;
  float h = 0.0;
  vec2 grad = vec2(0.0);
  float foam = 0.0;
  float chime = 0.0;

  // Evaluate height & analytic gradients cleanly
  float p1 = worldXZ.x * 0.34 + worldXZ.y * 0.42 + uTime * 1.35;
  h += sin(p1) * 0.085;
  grad += vec2(0.34, 0.42) * cos(p1) * 0.085;

  float p2 = -worldXZ.x * 0.52 + worldXZ.y * 0.29 + uTime * 1.82 + 1.1;
  h += sin(p2) * 0.052;
  grad += vec2(-0.52, 0.29) * cos(p2) * 0.052;

  float p3 = worldXZ.x * 0.88 - worldXZ.y * 0.76 + uTime * 2.35;
  h += cos(p3) * 0.026;
  grad += -vec2(0.88, -0.76) * sin(p3) * 0.026;

  float p4 = worldXZ.x * 1.65 + worldXZ.y * 1.42 - uTime * 2.90;
  h += sin(p4) * 0.014;
  grad += vec2(1.65, 1.42) * cos(p4) * 0.014;

  // Kelvin V-Wake
  vec2 rel = worldXZ - uBoatWake.xy;
  vec2 fwd = vec2(-sin(uBoatWake.z), -cos(uBoatWake.z));
  vec2 right = vec2(cos(uBoatWake.z), -sin(uBoatWake.z));
  float behind = -dot(rel, fwd);
  float lat = abs(dot(rel, right));
  float spdFactor = clamp(uBoatWake.w / 9.5, 0.0, 1.35);

  if (behind > -1.2 && behind < 36.0 && spdFactor > 0.03) {
    float vArm = 0.55 + max(0.0, behind) * 0.34;
    float dArm = abs(lat - vArm);
    float env = exp(-dArm * dArm * 0.95) * exp(-max(0.0, behind) * 0.075) * smoothstep(-1.2, 0.6, behind);
    float osc = cos((lat - vArm) * 4.8 - uTime * 6.5);
    h += osc * 0.11 * env * spdFactor;
    float sideSign = dot(rel, right) >= 0.0 ? 1.0 : -1.0;
    grad += right * sideSign * (-sin((lat - vArm) * 4.8 - uTime * 6.5) * 0.42 * env * spdFactor);
    foam += env * spdFactor * (0.55 + 0.45 * max(0.0, osc));

    float centerTrail = exp(-lat * lat * 0.75) * exp(-max(0.0, behind) * 0.12) * smoothstep(-0.4, 1.2, behind);
    foam += centerTrail * spdFactor * 0.55;
  }

  // Interactive Oar & Chime Ring Ripples
  for (int i = 0; i < 8; i++) {
    vec4 rp = uRipples[i];
    float amp = abs(rp.w);
    if (amp > 0.002) {
      vec2 dv = worldXZ - rp.xy;
      float dist = length(dv) + 0.001;
      float dr = dist - rp.z;
      bool isChime = rp.w < 0.0;
      float width = isChime ? 2.25 : 1.05;
      float ringEnv = exp(-(dr * dr) / (width * width));
      float freq = isChime ? 3.2 : 5.4;
      float wave = cos(dr * freq);
      h += wave * ringEnv * amp * (isChime ? 0.20 : 0.13);
      grad += (dv / dist) * (-sin(dr * freq) * ringEnv * amp * 0.44);
      if (isChime) {
        chime += ringEnv * clamp(amp * 1.35, 0.0, 1.25);
      } else {
        foam += ringEnv * clamp(amp * 1.05, 0.0, 0.9);
      }
    }
  }

  vec3 wp = vec3(worldXZ.x, h, worldXZ.y);
  vWorldPos = wp;
  vNormal = normalize(vec3(-grad.x, 1.0, -grad.y));
  vFoam = clamp(foam, 0.0, 1.25);
  vChimeGlow = clamp(chime, 0.0, 1.35);
  gl_Position = uProj * uView * vec4(wp, 1.0);
}`;

export const WATER_SURF_FS = `#version 300 es
precision highp float;
precision highp int;
in vec3 vWorldPos;
in vec3 vNormal;
in float vFoam;
in float vChimeGlow;

uniform vec3 uCamPos;
uniform float uTime;
uniform vec3 uSkyZenith;
uniform vec3 uSkyMid;
uniform vec3 uSkyHorizon;
uniform vec3 uSunDir;
uniform vec3 uSunCol;
uniform vec3 uWaterDeep;
uniform vec3 uWaterShallow;
uniform vec3 uFogCol;
uniform float uFogDensity;
uniform float uAuroraAmt;
uniform vec3 uSubGlowCol;
uniform float uSubGlowAmt;
uniform vec3 uLanternPos;

out vec4 fragColor;

void main() {
  vec3 toCam = uCamPos - vWorldPos;
  float dist = length(toCam);
  vec3 V = toCam / max(dist, 0.001);

  // Add subtle Monet horizontal painterly micro-ripples to surface normal
  float stroke1 = sin(vWorldPos.z * 3.8 + sin(vWorldPos.x * 1.4 + uTime * 0.8) * 1.6 - uTime * 1.7);
  float stroke2 = cos(vWorldPos.x * 4.6 - vWorldPos.z * 2.2 + uTime * 2.1);
  vec3 N = normalize(vNormal + vec3(stroke2 * 0.045, 0.0, stroke1 * 0.065));

  // Schlick Fresnel reflection factor
  float ndv = clamp(dot(N, V), 0.0, 1.0);
  float fresnel = 0.06 + 0.94 * pow(1.0 - ndv, 3.8);

  // Reflected sky vector & mirrored realm palette
  vec3 R = reflect(-V, N);
  float rEl = clamp(R.y, 0.0, 1.0);
  vec3 reflSky = mix(uSkyHorizon, uSkyMid, smoothstep(0.0, 0.28, rEl));
  reflSky = mix(reflSky, uSkyZenith, smoothstep(0.22, 0.78, rEl));

  // Reflected Aurora Borealis ribbons dancing on the mirror sea!
  if (uAuroraAmt > 0.01) {
    float rAz = atan(R.x, -R.z);
    float aWave = sin(rAz * 5.0 + uTime * 0.38) * 0.08;
    float aBand = exp(-abs(rEl - (0.26 + aWave)) * 9.5);
    reflSky += mix(vec3(0.19, 0.92, 0.70), vec3(0.96, 0.80, 0.34), 0.35 + 0.35 * sin(rAz * 3.0)) * aBand * uAuroraAmt * 0.68;
  }

  // Deep vs shallow translucent jade/turquoise body + painterly dappled light patches
  float dapple = 0.5 + 0.5 * sin(vWorldPos.x * 0.55 + sin(vWorldPos.z * 0.35)) * cos(vWorldPos.z * 0.48 - uTime * 0.4);
  vec3 bodyCol = mix(uWaterDeep, uWaterShallow, clamp(0.32 + dapple * 0.52 + (1.0 - ndv) * 0.2, 0.0, 1.0));

  // Bioluminescent jellyfish / floating-lantern sub-surface water pools!
  if (uSubGlowAmt > 0.01) {
    float bioPatch = pow(max(0.0, sin(vWorldPos.x * 0.32 + uTime * 0.7) * cos(vWorldPos.z * 0.28 - uTime * 0.5)), 2.0);
    bodyCol += uSubGlowCol * bioPatch * uSubGlowAmt * 0.55;
  }

  vec3 col = mix(bodyCol, reflSky, clamp(fresnel * 0.86, 0.0, 0.92));

  // Warm Sun / Moon Shimmer Road across wave crests
  vec3 Lsun = normalize(uSunDir);
  vec3 Hsun = normalize(Lsun + V);
  float sunSpec = pow(max(dot(N, Hsun), 0.0), 84.0) * 1.35 + pow(max(dot(N, Hsun), 0.0), 18.0) * 0.22;
  col += uSunCol * sunSpec;

  // Real-time Warm Bow-Lantern Point Reflection Pool dancing ahead of the skiff!
  vec3 toLantern = uLanternPos - vWorldPos;
  float lDist = length(toLantern);
  if (lDist < 26.0) {
    vec3 Llan = toLantern / max(lDist, 0.01);
    vec3 Hlan = normalize(Llan + V);
    float lAtten = 1.0 / (1.0 + lDist * lDist * 0.085);
    float lanSpec = pow(max(dot(N, Hlan), 0.0), 26.0) * 1.45 + max(dot(N, Llan), 0.0) * 0.35;
    col += vec3(1.0, 0.78, 0.34) * lanSpec * lAtten;
  }

  // Oar-Splash & Kelvin V-Wake Seafoam Lace
  if (vFoam > 0.01) {
    float lace = 0.68 + 0.32 * sin(vWorldPos.x * 7.5 + vWorldPos.z * 7.5 - uTime * 5.0);
    vec3 foamCol = mix(vec3(0.76, 0.95, 0.92), uSkyHorizon, 0.38);
    col = mix(col, foamCol, clamp(vFoam * lace * 0.78, 0.0, 0.88));
  }

  // Golden Lantern-Chime Resonance Wave Ring!
  if (vChimeGlow > 0.01) {
    col += vec3(1.0, 0.84, 0.38) * vChimeGlow * 0.92;
  }

  // Atmospheric Mist Horizon Blend
  float fogF = 1.0 - exp(-dist * uFogDensity);
  col = mix(col, uFogCol, clamp(fogF * 0.94, 0.0, 0.96));

  fragColor = vec4(col, 1.0);
}`;

// 3D World Architecture, Wooden Skiff, Traveler, Torii, Jellyfish, Cathedral, Cliffs, Icebergs & Lighthouse
export const WATER_WORLD_VS = `#version 300 es
precision highp float;
precision highp int;
layout(location = 0) in vec3 aPos;
layout(location = 1) in vec3 aNorm;
layout(location = 2) in vec2 aUV;
layout(location = 3) in vec3 aTint;

uniform mat4 uProj;
uniform mat4 uView;
uniform mat4 uModel;

out vec3 vWorldPos;
out vec3 vNormal;
out vec2 vUV;
out vec3 vTint;

void main() {
  vec4 wp = uModel * vec4(aPos, 1.0);
  vWorldPos = wp.xyz;
  vNormal = normalize(transpose(inverse(mat3(uModel))) * aNorm);
  vUV = aUV;
  vTint = aTint;
  gl_Position = uProj * uView * wp;
}`;

export const WATER_WORLD_FS = `#version 300 es
precision highp float;
precision highp int;
in vec3 vWorldPos;
in vec3 vNormal;
in vec2 vUV;
in vec3 vTint;

// uMat: 1=Islet/Foliage, 2=HandcraftedWood, 3=Stone/VermilionLacquer, 4=CrystalIce/Petal, 5=BiolumJellyfish, 6=EmissiveGlow
uniform int uMat;
uniform vec3 uColor;
uniform vec3 uParams;     // x: glow/roughness, y: detail, z: alpha
uniform vec3 uCamPos;
uniform float uTime;
uniform vec3 uSunDir;
uniform vec3 uSunCol;
uniform vec3 uSkyZenith;
uniform vec3 uSkyHorizon;
uniform vec3 uWaterShallow;
uniform vec3 uFogCol;
uniform float uFogDensity;
uniform vec3 uLanternPos;

out vec4 fragColor;

void main() {
  vec3 toCam = uCamPos - vWorldPos;
  float dist = length(toCam);
  vec3 V = toCam / max(dist, 0.001);
  float fogF = 1.0 - exp(-dist * uFogDensity);

  // Material 6: Pure Emissive Glow (Bow Lantern, Floating River Lanterns, Memory Pearls, Lighthouse Beam)
  if (uMat == 6) {
    vec3 glow = uColor * vTint * uParams.x;
    glow = mix(glow, uFogCol, clamp(fogF * 0.52, 0.0, 0.78));
    fragColor = vec4(glow, uParams.z);
    return;
  }

  vec3 N = normalize(vNormal);
  vec3 Lsun = normalize(uSunDir);
  vec3 Hsun = normalize(Lsun + V);
  vec3 base = uColor * vTint;

  // Material 5: Translucent Pulsing 3D Bioluminescent Jellyfish Bell & Veils
  if (uMat == 5) {
    float rim = pow(1.0 - abs(dot(N, V)), 2.1);
    float pulse = 0.75 + 0.25 * sin(uTime * 3.2 + vWorldPos.z * 0.25);
    float ribs = 0.82 + 0.18 * sin(vUV.x * 50.265); // 8 radial bell lobes
    vec3 jellyCol = base * ribs * (0.55 + rim * 1.45) * uParams.x * pulse;
    jellyCol += vec3(0.88, 0.98, 0.94) * rim * 0.38;
    jellyCol = mix(jellyCol, uFogCol, clamp(fogF * 0.65, 0.0, 0.85));
    fragColor = vec4(jellyCol, clamp(uParams.z * (0.48 + rim * 0.52), 0.15, 0.95));
    return;
  }

  // Subtle material craft textures
  if (uMat == 2) {
    // Handcrafted timber planks & wood grain
    float grain = sin(vUV.y * 28.0 + sin(vUV.x * 9.0) * 1.5) * 0.07;
    base *= (0.94 + grain);
  } else if (uMat == 3) {
    // Weathered stone / vermilion lacquer strata + water-line moss darkening near y=0
    float strata = sin(vWorldPos.y * 3.4 + vWorldPos.x * 0.5) * 0.06;
    base *= (0.95 + strata);
    float wetLine = 1.0 - smoothstep(-0.1, 0.85, vWorldPos.y);
    base = mix(base, base * vec3(0.58, 0.68, 0.64), wetLine * 0.45);
  } else if (uMat == 1) {
    // Mossy islet bank: sandy-wet water edge blending into lush willow moss
    float shoreWet = 1.0 - smoothstep(-0.05, 0.55, vWorldPos.y);
    base = mix(base, base * vec3(0.62, 0.66, 0.58), shoreWet * 0.42);
  }

  // Painterly two-tone wrap diffuse lighting + upward water bounce
  float ndl = dot(N, Lsun) * 0.5 + 0.5;
  float wrapDiff = smoothstep(0.18, 0.88, ndl);

  // Upward bounce from turquoise/amber water below (N.y < 0 receives luminous water bounce!)
  vec3 ambSky = mix(uWaterShallow * 0.85, mix(uSkyHorizon, uSkyZenith, 0.45) * 0.62, N.y * 0.5 + 0.5);
  vec3 col = base * (ambSky + uSunCol * wrapDiff * 0.84);

  // Subsurface scattering & crisp facet glint for Crystalline Icebergs & Lotus Petals (uMat == 4)
  if (uMat == 4) {
    float backScatter = pow(clamp(dot(V, -Lsun), 0.0, 1.0), 2.5) * 0.42;
    float rimIce = pow(1.0 - max(dot(N, V), 0.0), 2.6);
    float specIce = pow(max(dot(N, Hsun), 0.0), 42.0) * 0.65;
    col += base * uSunCol * backScatter + mix(vec3(0.65, 0.98, 0.92), uSunCol, 0.4) * (rimIce * 0.36 + specIce);
  } else {
    float spec = pow(max(dot(N, Hsun), 0.0), uMat == 2 ? 24.0 : 14.0) * (uMat == 2 ? 0.24 : 0.14);
    col += uSunCol * spec;
    float rim = pow(1.0 - max(dot(N, V), 0.0), 3.2);
    col += uSkyHorizon * rim * 0.20;
  }

  // Real-time Warm Bow-Lantern Illumination on Skiff, Traveler, Oars & Nearby Relics/Pillars!
  vec3 toLan = uLanternPos - vWorldPos;
  float lanD = length(toLan);
  if (lanD < 22.0) {
    vec3 Llan = toLan / max(lanD, 0.01);
    float atten = 1.0 / (1.0 + lanD * lanD * 0.11);
    float lanNdl = max(dot(N, Llan), 0.0) * 0.75 + 0.25;
    col += base * vec3(1.0, 0.78, 0.34) * lanNdl * atten * 1.45;
  }

  col = mix(col, uFogCol, clamp(fogF * 0.92, 0.0, 0.96));
  fragColor = vec4(col, uParams.z);
}`;

// GPU-Instanced Fireflies, Oar-Splash Droplets & Drifting Lotus/Maple Petals
export const WATER_INST_VS = `#version 300 es
precision highp float;
precision highp int;
layout(location = 0) in vec3 aPos;
layout(location = 1) in vec2 aUV;
layout(location = 4) in vec4 iPosScale; // xyz: world pos, w: scale
layout(location = 5) in vec4 iRotKind;  // x: rot, y: stretchY, z: unused, w: kind (0=glowOrb, 1=droplet, 2=petal/leaf)
layout(location = 6) in vec4 iColor;    // rgba

uniform mat4 uProj;
uniform mat4 uView;

out vec2 vUV;
out vec4 vCol;
out float vKind;

void main() {
  vUV = aUV;
  vCol = iColor;
  vKind = iRotKind.w;

  vec3 camRight = vec3(uView[0][0], uView[1][0], uView[2][0]);
  vec3 camUp    = vec3(uView[0][1], uView[1][1], uView[2][1]);

  float c = cos(iRotKind.x), s = sin(iRotKind.x);
  vec2 p = vec2(aPos.x, aPos.y * max(0.35, iRotKind.y));
  vec2 rxy = vec2(p.x * c - p.y * s, p.x * s + p.y * c) * iPosScale.w;

  vec3 wp = iPosScale.xyz + camRight * rxy.x + camUp * rxy.y;
  gl_Position = uProj * uView * vec4(wp, 1.0);
}`;

export const WATER_INST_FS = `#version 300 es
precision highp float;
precision highp int;
in vec2 vUV;
in vec4 vCol;
in float vKind;
out vec4 fragColor;

void main() {
  vec2 d = (vUV - 0.5) * 2.0;
  float r2 = dot(d, d);
  if (vKind < 0.5) {
    // Soft glowing firefly / lantern mote / sea spark
    if (r2 > 1.0) discard;
    float halo = pow(1.0 - r2, 2.2);
    fragColor = vec4(vCol.rgb * (1.0 + halo * 0.6), vCol.a * halo);
  } else if (vKind < 1.5) {
    // Crisp oar-splash water droplet pearl
    if (r2 > 0.85) discard;
    float rim = smoothstep(0.15, 0.82, r2);
    fragColor = vec4(mix(vCol.rgb, vec3(1.0), rim * 0.45), vCol.a * (1.0 - r2 * 0.5));
  } else {
    // Tapered drifting lotus petal / autumn maple leaf
    float leaf = abs(d.x) * 1.45 + d.y * d.y * 0.85;
    if (leaf > 1.0) discard;
    fragColor = vec4(vCol.rgb, vCol.a * (1.0 - smoothstep(0.55, 1.0, leaf)));
  }
}`;

// Painterly Watercolor / Storybook Oil Edge-Softening, Lantern Bloom & Paper-Grain Post-Process
export const WATER_POST_VS = `#version 300 es
precision highp float;
precision highp int;
out vec2 vUV;
void main() {
  vec2 pos = vec2((gl_VertexID == 1) ? 3.0 : -1.0, (gl_VertexID == 2) ? 3.0 : -1.0);
  vUV = pos * 0.5 + 0.5;
  gl_Position = vec4(pos, 0.0, 1.0);
}`;

export const WATER_POST_FS = `#version 300 es
precision highp float;
precision highp int;
in vec2 vUV;
uniform sampler2D uTex;
uniform vec2 uRes;
uniform float uTime;
uniform float uBrushAmt;   // 0.0 = Crisp, 0.55 = Monet Watercolor, 1.0 = Storybook Impasto
uniform float uChimePulse; // Subtle warm golden edge shimmer when Lantern Chime rings
out vec4 fragColor;

float hash21(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

void main() {
  vec2 px = 1.0 / max(uRes, vec2(1.0));
  vec2 uv = vUV;

  // Subtle watercolor wet-edge micro-warp when painterly mode is active
  if (uBrushAmt > 0.05) {
    float wx = sin(uv.y * 90.0 + uTime * 0.4) * cos(uv.x * 70.0) * 0.00065 * uBrushAmt;
    float wy = cos(uv.x * 85.0 - uTime * 0.3) * 0.00065 * uBrushAmt;
    uv = clamp(uv + vec2(wx, wy), vec2(0.002), vec2(0.998));
  }

  vec3 center = texture(uTex, uv).rgb;
  vec3 col = center;

  // Fast 4-Quadrant Kuwahara Painterly Brush Smoothing (preserves sharp edges while painting flat washes!)
  if (uBrushAmt > 0.05) {
    float r = 1.35 + uBrushAmt * 1.15;
    vec3 m0 = center, s0 = center * center;
    vec3 m1 = center, s1 = center * center;
    vec3 m2 = center, s2 = center * center;
    vec3 m3 = center, s3 = center * center;

    vec3 c0a = texture(uTex, clamp(uv + vec2(-r, -r) * px, vec2(0.002), vec2(0.998))).rgb;
    vec3 c0b = texture(uTex, clamp(uv + vec2(0.0, -r) * px, vec2(0.002), vec2(0.998))).rgb;
    m0 = (m0 + c0a + c0b) / 3.0;
    s0 = (s0 + c0a * c0a + c0b * c0b) / 3.0 - m0 * m0;

    vec3 c1a = texture(uTex, clamp(uv + vec2(r, -r) * px, vec2(0.002), vec2(0.998))).rgb;
    vec3 c1b = texture(uTex, clamp(uv + vec2(r, 0.0) * px, vec2(0.002), vec2(0.998))).rgb;
    m1 = (m1 + c1a + c1b) / 3.0;
    s1 = (s1 + c1a * c1a + c1b * c1b) / 3.0 - m1 * m1;

    vec3 c2a = texture(uTex, clamp(uv + vec2(r, r) * px, vec2(0.002), vec2(0.998))).rgb;
    vec3 c2b = texture(uTex, clamp(uv + vec2(0.0, r) * px, vec2(0.002), vec2(0.998))).rgb;
    m2 = (m2 + c2a + c2b) / 3.0;
    s2 = (s2 + c2a * c2a + c2b * c2b) / 3.0 - m2 * m2;

    vec3 c3a = texture(uTex, clamp(uv + vec2(-r, r) * px, vec2(0.002), vec2(0.998))).rgb;
    vec3 c3b = texture(uTex, clamp(uv + vec2(-r, 0.0) * px, vec2(0.002), vec2(0.998))).rgb;
    m3 = (m3 + c3a + c3b) / 3.0;
    s3 = (s3 + c3a * c3a + c3b * c3b) / 3.0 - m3 * m3;

    float v0 = s0.r + s0.g + s0.b;
    float v1 = s1.r + s1.g + s1.b;
    float v2 = s2.r + s2.g + s2.b;
    float v3 = s3.r + s3.g + s3.b;

    vec3 best = m0;
    float minV = v0;
    if (v1 < minV) { minV = v1; best = m1; }
    if (v2 < minV) { minV = v2; best = m2; }
    if (v3 < minV) { best = m3; }

    col = mix(center, best, clamp(uBrushAmt * 0.78, 0.0, 0.85));
  }

  // Soft Warm Paper-Lantern & Starlight Bloom
  vec3 b1 = texture(uTex, clamp(uv + vec2(-3.5, 0.0) * px, vec2(0.002), vec2(0.998))).rgb;
  vec3 b2 = texture(uTex, clamp(uv + vec2(3.5, 0.0) * px, vec2(0.002), vec2(0.998))).rgb;
  vec3 b3 = texture(uTex, clamp(uv + vec2(0.0, -3.5) * px, vec2(0.002), vec2(0.998))).rgb;
  vec3 b4 = texture(uTex, clamp(uv + vec2(0.0, 3.5) * px, vec2(0.002), vec2(0.998))).rgb;
  vec3 avgBright = max(vec3(0.0), (b1 + b2 + b3 + b4) * 0.25 - vec3(0.64));
  col += avgBright * vec3(1.0, 0.88, 0.62) * 0.52;

  // Subtle cold-press watercolor paper grain
  if (uBrushAmt > 0.05) {
    float grain = (hash21(floor(vUV * uRes * 0.65)) - 0.5) * 0.028 * uBrushAmt;
    col += vec3(grain, grain * 0.96, grain * 0.85);
  }

  // Warm golden edge aura when Lantern Chime resonates
  float vigDist = length((vUV - 0.5) * vec2(1.14, 1.0));
  if (uChimePulse > 0.01) {
    float chimeEdge = smoothstep(0.28, 0.86, vigDist);
    col += vec3(0.98, 0.80, 0.34) * chimeEdge * uChimePulse * 0.24;
  }

  // Storybook Filmic Tone Mapping (Strictly warm gold / jade balance, zero purple)
  col *= vec3(1.02, 1.01, 0.97);
  col = (col * (2.51 * col + 0.03)) / (col * (2.43 * col + 0.59) + 0.14);

  float vig = 1.0 - smoothstep(0.52, 0.98, vigDist);
  col *= mix(0.76, 1.0, vig);

  fragColor = vec4(pow(max(col, vec3(0.0)), vec3(1.0 / 2.15)), 1.0);
}`;
