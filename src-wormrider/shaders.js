// WebGL2 (#version 300 es) Shaders for Shai-Rider: Twin-Sun Desert, Glittering Sand Ripples & Heat-Haze

export const DUNE_SKY_VS = `#version 300 es
precision highp float;
layout(location = 0) in vec3 aPos;
uniform mat4 uProj;
uniform mat4 uView;
uniform vec3 uCamPos;
out vec3 vDir;
void main() {
  vDir = aPos;
  gl_Position = uProj * uView * vec4(uCamPos + aPos * 620.0, 1.0);
}`;

export const DUNE_SKY_FS = `#version 300 es
precision highp float;
in vec3 vDir;
uniform float uTime;
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

void main() {
  vec3 d = normalize(vDir);
  float el = clamp(d.y, -0.15, 1.0);
  float az = atan(d.x, -d.z);

  // Scorching Arrakis Sunset Dust Atmosphere
  vec3 zenithBronze  = vec3(0.16, 0.085, 0.045);
  vec3 midOchre      = vec3(0.58, 0.27, 0.10);
  vec3 horizonAmber  = vec3(0.92, 0.56, 0.22);
  vec3 groundDust    = vec3(0.76, 0.44, 0.18);

  vec3 sky = mix(midOchre, zenithBronze, smoothstep(0.14, 0.78, el));
  sky = mix(horizonAmber, sky, smoothstep(0.0, 0.26, el));
  sky = mix(groundDust, sky, smoothstep(-0.12, 0.02, el));

  // Wind-sheared high desert dust bands
  float strata = vnoise(vec2(az * 3.5 + uTime * 0.03, el * 14.0));
  float strata2 = vnoise(vec2(az * 7.0 - uTime * 0.05, el * 26.0));
  float band = smoothstep(0.35, 0.85, strata * 0.65 + strata2 * 0.35);
  sky += vec3(0.18, 0.09, 0.03) * band * (1.0 - smoothstep(0.15, 0.65, el));

  // Primary Giant Setting Sun
  vec3 sun1 = normalize(vec3(-0.26, 0.20, -0.945));
  float a1 = acos(clamp(dot(d, sun1), -1.0, 1.0));
  float disc1 = 1.0 - smoothstep(0.068, 0.076, a1);
  float mie1 = exp(-a1 * 4.2) * 0.85 + exp(-a1 * 14.0) * 0.55;
  sky += vec3(1.0, 0.62, 0.20) * mie1;
  sky = mix(sky, vec3(1.0, 0.92, 0.68), disc1);

  // Secondary Smaller White-Gold Binary Companion Sun!
  vec3 sun2 = normalize(vec3(0.15, 0.41, -0.90));
  float a2 = acos(clamp(dot(d, sun2), -1.0, 1.0));
  float disc2 = 1.0 - smoothstep(0.022, 0.027, a2);
  float mie2 = exp(-a2 * 11.0) * 0.45;
  sky += vec3(1.0, 0.86, 0.58) * mie2;
  sky = mix(sky, vec3(1.0, 0.97, 0.88), disc2);

  fragColor = vec4(sky, 1.0);
}`;

export const DUNE_WORLD_VS = `#version 300 es
precision highp float;
precision highp int;
layout(location = 0) in vec3 aPos;
layout(location = 1) in vec3 aNorm;
layout(location = 2) in vec2 aUV;
layout(location = 3) in vec3 aTint;

uniform mat4 uProj;
uniform mat4 uView;
uniform mat4 uModel;
uniform int uMat;
uniform vec4 uBurrow; // xyz: submerged worm head pos, w: bulge strength [0..1]

out vec3 vWorldPos;
out vec3 vNormal;
out vec2 vUV;
out vec3 vTint;

void main() {
  vec4 wp = uModel * vec4(aPos, 1.0);
  vec3 nrm = normalize(transpose(inverse(mat3(uModel))) * aNorm);

  // Live Seismic Sand-Mound Bulge when the Sandworm burrows right beneath the dunes!
  if (uMat == 1 && uBurrow.w > 0.01) {
    vec2 dv = wp.xz - uBurrow.xz;
    float d2 = dot(dv, dv);
    float mound = exp(-d2 / 52.0) * 3.2 * uBurrow.w;
    wp.y += mound;
    if (d2 < 140.0 && d2 > 0.01) {
      vec2 slope = -dv * (mound * 0.05);
      nrm = normalize(nrm + vec3(slope.x, 0.0, slope.y));
    }
  }

  vWorldPos = wp.xyz;
  vNormal = nrm;
  vUV = aUV;
  vTint = aTint;
  gl_Position = uProj * uView * wp;
}`;

export const DUNE_WORLD_FS = `#version 300 es
precision highp float;
precision highp int;
in vec3 vWorldPos;
in vec3 vNormal;
in vec2 vUV;
in vec3 vTint;

uniform int uMat;         // 1:DuneSand, 2:WormArmor, 3:BasaltRock, 4:Vehicle/Stillsuit, 6:Emissive
uniform vec3 uColor;
uniform vec3 uParams;     // x:roughness/glow, y:detailScale, z:alpha
uniform vec3 uCamPos;
uniform float uTime;
uniform float uSpiceGlow;

out vec4 fragColor;

float hash21(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

void main() {
  vec3 V = normalize(uCamPos - vWorldPos);
  float dist = length(uCamPos - vWorldPos);
  vec3 fogHorizon = vec3(0.82, 0.48, 0.20);

  // Emissive Molten Throat, Spice-Eyes, Seismic Rings, Thrusters & Orbital Beam
  if (uMat == 6) {
    vec3 glow = uColor * uParams.x;
    float fogE = 1.0 - exp(-dist * 0.0038);
    glow = mix(glow, fogHorizon, fogE * 0.45);
    fragColor = vec4(glow, uParams.z);
    return;
  }

  vec3 N = normalize(vNormal);
  vec3 Lsun = normalize(vec3(-0.26, 0.32, -0.91));
  vec3 H = normalize(Lsun + V);
  vec3 base = uColor * vTint;

  // Material 1: Wind-Rippled Arrakis Sand + Glittering Spice Micro-Crystals
  if (uMat == 1) {
    float rippleCoord = vWorldPos.x * 3.4 - vWorldPos.z * 1.9 + sin(vWorldPos.z * 0.45) * 2.2;
    float rip = sin(rippleCoord);
    vec3 T = normalize(vec3(0.85, 0.0, -0.52));
    N = normalize(N + T * rip * 0.12);

    float ndl = max(dot(N, Lsun), 0.0);
    // Desert sand forward/rim scatter along sharp dune crests
    float rimSand = pow(1.0 - max(dot(N, V), 0.0), 2.6) * max(0.0, dot(V, -Lsun) * 0.5 + 0.5);

    // Warm copper shadows vs blazing apricot-gold sunlit faces
    vec3 shadowSand = base * vec3(0.36, 0.19, 0.11);
    vec3 litSand = base * vec3(1.22, 0.96, 0.68);
    vec3 col = mix(shadowSand, litSand, smoothstep(0.0, 0.85, ndl));
    col += vec3(1.0, 0.72, 0.34) * rimSand * 0.32;

    // Micro-quartz & Melange spice glitter in sunlit sand!
    vec2 gCell = floor(vWorldPos.xz * 7.5);
    float spark = hash21(gCell);
    if (spark > 0.965 && dist < 85.0) {
      float twinkle = pow(max(dot(N, H), 0.0), 12.0) * (0.5 + 0.5 * sin(uTime * 7.0 + spark * 90.0));
      col += vec3(1.0, 0.86, 0.48) * twinkle * 0.85;
    }

    float fogF = 1.0 - exp(-dist * 0.0046);
    col = mix(col, fogHorizon, fogF * 0.88);
    fragColor = vec4(col, 1.0);
    return;
  }

  // Material 2: Colossal Sandworm Chitinous Carapace + Glowing Spice Fissures
  if (uMat == 2) {
    float plateGroove = sin(vUV.x * 38.0) * 0.5 + 0.5;
    float ringSeam = smoothstep(0.82, 0.98, abs(vUV.y - 0.5) * 2.0);
    N = normalize(N + vec3(plateGroove - 0.5) * 0.14);

    float ndl = max(dot(N, Lsun), 0.0);
    float spec = pow(max(dot(N, H), 0.0), 18.0) * 0.25;
    // Sand-encrusted warm bounce from desert floor below (N.y < 0 gets warm ochre bounce!)
    vec3 desertBounce = mix(vec3(0.45, 0.24, 0.11), vec3(0.24, 0.14, 0.09), N.y * 0.5 + 0.5);
    vec3 col = base * (0.78 + 0.22 * plateGroove) * (desertBounce + vec3(1.05, 0.78, 0.48) * ndl);
    col += vec3(1.0, 0.82, 0.54) * spec;

    // Fiery Cinnabar-Gold Spice Fissures glowing between armor segments!
    col += vec3(1.0, 0.42, 0.08) * ringSeam * (0.28 + uSpiceGlow * 1.45);

    float fogW = 1.0 - exp(-dist * 0.0045);
    col = mix(col, fogHorizon, fogW * 0.82);
    fragColor = vec4(col, 1.0);
    return;
  }

  // Material 3 (Stratified Basalt Cliffs) & Material 4 (Imperial Metal / Stillsuit)
  if (uMat == 3) {
    float strata = sin(vWorldPos.y * 2.6 + vWorldPos.x * 0.2) * 0.12;
    base *= (0.88 + strata);
  }

  float ndl = max(dot(N, Lsun), 0.0);
  float shininess = (uMat == 4) ? 36.0 : 12.0;
  float specAmt = (uMat == 4) ? 0.52 : 0.12;
  float spec = pow(max(dot(N, H), 0.0), shininess) * specAmt;

  // Warm upward desert sand bounce + sunset directional light
  vec3 amb = mix(vec3(0.42, 0.22, 0.10), vec3(0.26, 0.15, 0.10), N.y * 0.5 + 0.5);
  vec3 col = base * (amb + vec3(1.08, 0.80, 0.52) * ndl * 0.88);
  col += vec3(1.0, 0.85, 0.58) * spec;

  float rim = pow(1.0 - max(dot(N, V), 0.0), 3.0);
  col += vec3(0.95, 0.58, 0.24) * rim * 0.24;

  float fogM = 1.0 - exp(-dist * 0.0045);
  col = mix(col, fogHorizon, fogM * 0.84);
  fragColor = vec4(col, 1.0);
}`;

// GPU-Instanced Billowing Sand Spray, Fiery Spice Sparks & Wreckage Shards
export const DUNE_INST_VS = `#version 300 es
precision highp float;
layout(location = 0) in vec3 aPos;
layout(location = 1) in vec2 aUV;
layout(location = 4) in vec4 iPosScale; // xyz: world pos, w: scale
layout(location = 5) in vec4 iRotKind;  // x: rot, y: stretchY, z: unused, w: kind (0=softSandCloud, 1=sharpShard)
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
  vec2 p = vec2(aPos.x, aPos.y * max(0.4, iRotKind.y));
  vec2 rxy = vec2(p.x * c - p.y * s, p.x * s + p.y * c) * iPosScale.w;

  vec3 wp = iPosScale.xyz + camRight * rxy.x + camUp * rxy.y;
  gl_Position = uProj * uView * vec4(wp, 1.0);
}`;

export const DUNE_INST_FS = `#version 300 es
precision highp float;
in vec2 vUV;
in vec4 vCol;
in float vKind;
out vec4 fragColor;

void main() {
  vec2 d = (vUV - 0.5) * 2.0;
  float r2 = dot(d, d);
  if (vKind < 0.5) {
    // Billowing soft sand cloud / spice mist
    if (r2 > 1.0) discard;
    float soft = (1.0 - r2) * (1.0 - r2);
    fragColor = vec4(vCol.rgb, vCol.a * soft);
  } else {
    // Crisp glowing spark or metallic wreckage shard
    if (max(abs(d.x), abs(d.y)) > 0.88) discard;
    fragColor = vCol;
  }
}`;

// Full-Screen Desert Heat-Mirage Shimmer + Anamorphic Sun Bloom + Warm Cinema Grade
export const DUNE_POST_VS = `#version 300 es
precision highp float;
out vec2 vUV;
void main() {
  vec2 pos = vec2((gl_VertexID == 1) ? 3.0 : -1.0, (gl_VertexID == 2) ? 3.0 : -1.0);
  vUV = pos * 0.5 + 0.5;
  gl_Position = vec4(pos, 0.0, 1.0);
}`;

export const DUNE_POST_FS = `#version 300 es
precision highp float;
in vec2 vUV;
uniform sampler2D uTex;
uniform vec2 uRes;
uniform float uTime;
uniform float uHeatAmt;   // Horizon heat-haze mirage strength
uniform float uRushBlur;  // Worm breach / subterranean speed rush
uniform float uSubmerged; // Subtle subterranean amber-sand visor tint when burrowing
out vec4 fragColor;

void main() {
  vec2 uv = vUV;

  // Rising Desert Heat-Haze Shimmer across mid/horizon band
  float horizonBand = smoothstep(0.18, 0.55, uv.y) * (1.0 - smoothstep(0.62, 0.92, uv.y));
  float waveX = sin(uv.y * 65.0 - uTime * 6.5 + uv.x * 12.0) * 0.0014 * uHeatAmt * horizonBand;
  float waveY = cos(uv.x * 48.0 - uTime * 5.2) * 0.0010 * uHeatAmt * horizonBand;
  uv = clamp(uv + vec2(waveX, waveY), vec2(0.002), vec2(0.998));

  vec3 col = texture(uTex, uv).rgb;

  // Horizontal Anamorphic Warm Cinema Flare on bright sun & explosions
  vec2 px = 1.0 / uRes;
  vec3 bL = texture(uTex, clamp(uv - vec2(px.x * 5.0, 0.0), vec2(0.002), vec2(0.998))).rgb;
  vec3 bR = texture(uTex, clamp(uv + vec2(px.x * 5.0, 0.0), vec2(0.002), vec2(0.998))).rgb;
  vec3 bright = max(vec3(0.0), (bL + bR) * 0.5 - vec3(0.68));
  col += bright * vec3(1.0, 0.72, 0.34) * 0.55;

  // Radial speed streak during Breach / Subterranean Surge
  if (uRushBlur > 0.02) {
    vec2 dir = vec2(0.5) - uv;
    float edge = smoothstep(0.16, 0.68, length(dir));
    vec3 streak = texture(uTex, clamp(uv + dir * 0.026 * uRushBlur * edge, vec2(0.002), vec2(0.998))).rgb;
    col = mix(col, streak, edge * uRushBlur * 0.48);
  }

  // Subtle warm sand-veil edge vignette when burrowed deep underground
  float vigDist = length((vUV - 0.5) * vec2(1.15, 1.0));
  if (uSubmerged > 0.02) {
    float subEdge = smoothstep(0.28, 0.85, vigDist);
    col = mix(col, vec3(0.52, 0.25, 0.08), subEdge * uSubmerged * 0.42);
  }

  // Villeneuve-inspired Warm Arrakis Cinema ACES Tone Mapping
  col *= vec3(1.04, 0.99, 0.94);
  col = (col * (2.51 * col + 0.03)) / (col * (2.43 * col + 0.59) + 0.14);

  float vig = 1.0 - smoothstep(0.50, 0.98, vigDist);
  col *= mix(0.72, 1.0, vig);

  fragColor = vec4(pow(max(col, vec3(0.0)), vec3(1.0 / 2.15)), 1.0);
}`;
