// WebGL2 (#version 300 es) Shaders for TENNIS: GO WILD — 1972 CRT Pong to Solar Singularity Star-Forge
// Palette strictly adheres to Phosphor Cream (#f3efe6), Obsidian (#0a0d12), Solar Gold (#f5b025),
// Electric Cyan (#22d3ee), Emerald (#10b981) & Signal Vermilion (#ef4444)

export const TENNIS_SKY_VS = `#version 300 es
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

export const TENNIS_SKY_FS = `#version 300 es
precision highp float;
precision highp int;
in vec3 vDir;
uniform float uTime;
uniform float uEraMix; // 1.0 (1972 Void) -> 2..4 (Cyber Arena) -> 5.0 (Solar Singularity Star-Forge)
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
  float s = 0.0;
  float a = 0.5;
  for (int i = 0; i < 4; i++) {
    s += a * vnoise(p);
    p = p * 2.04 + vec2(3.1, -1.7);
    a *= 0.5;
  }
  return s;
}

void main() {
  vec3 d = normalize(vDir);
  float el = clamp(d.y, -0.25, 1.0);
  float az = atan(d.x, -d.z);

  // Era 1: Crisp 1972 CRT Obsidian Void
  vec3 crtObsidian = vec3(0.035, 0.045, 0.066);
  float wake3D = smoothstep(1.08, 1.95, uEraMix);
  float solarForge = smoothstep(4.05, 4.92, uEraMix);

  // Era 2-4: Deep Cyber-Stadium Sky with Electric Cyan & Solar Gold Horizon Rim
  vec3 cyberZenith  = vec3(0.025, 0.042, 0.068);
  vec3 cyberMid     = vec3(0.045, 0.095, 0.145);
  vec3 cyberHorizon = vec3(0.08, 0.24, 0.30);
  vec3 cyberSky = mix(cyberHorizon, cyberMid, smoothstep(-0.04, 0.26, el));
  cyberSky = mix(cyberSky, cyberZenith, smoothstep(0.22, 0.80, el));

  // Subtle architectural vector grid arcs in upper stadium dome (Era 2-4)
  float domeGrid = smoothstep(0.96, 0.995, cos(az * 16.0)) + smoothstep(0.97, 0.996, cos(el * 28.0));
  cyberSky += vec3(0.06, 0.35, 0.44) * clamp(domeGrid, 0.0, 1.0) * 0.24 * (1.0 - solarForge) * smoothstep(0.05, 0.45, el);

  // Warm Solar Gold horizon glow toward north opponent baseline (-Z)
  float northGlow = pow(max(0.0, -d.z), 3.0) * (1.0 - smoothstep(0.0, 0.48, abs(el - 0.08)));
  cyberSky += vec3(0.96, 0.69, 0.15) * northGlow * (0.22 + 0.25 * smoothstep(2.8, 4.0, uEraMix));

  // Crisp non-twinkling cyber starfield
  vec2 starCell = floor(vec2(az * 42.0, el * 64.0));
  float st = hash21(starCell);
  if (st > 0.982 && el > 0.06) {
    float tw = 0.65 + 0.35 * sin(uTime * 3.5 + st * 80.0);
    vec3 stCol = (st > 0.992) ? vec3(0.96, 0.78, 0.34) : vec3(0.55, 0.92, 0.98);
    cyberSky += stCol * tw * 0.55;
  }

  vec3 sky = mix(crtObsidian, cyberSky, wake3D);

  // Era 5: Blazing Golden Star-Forge Skybox! Roof tears open into a Solar Singularity Corona
  if (solarForge > 0.005) {
    vec3 forgeZenith = vec3(0.09, 0.055, 0.03);
    vec3 forgeMid    = vec3(0.46, 0.20, 0.06);
    vec3 forgeGold   = vec3(0.96, 0.65, 0.14);
    vec3 forgeSky = mix(forgeGold * 0.72, forgeMid, smoothstep(-0.05, 0.36, el));
    forgeSky = mix(forgeSky, forgeZenith, smoothstep(0.32, 0.88, el));

    // Swirling Solar Plasma Nebula Ribbons (Solar Gold, Amber & Signal Vermilion)
    float neb = fbm(vec2(az * 3.2 + uTime * 0.08, el * 5.5 - uTime * 0.05));
    float neb2 = fbm(vec2(az * 6.4 - uTime * 0.11, el * 9.0 + neb * 1.4));
    float filament = smoothstep(0.38, 0.84, neb * 0.55 + neb2 * 0.45);
    forgeSky += vec3(0.95, 0.52, 0.10) * filament * 0.55;
    forgeSky += vec3(0.94, 0.26, 0.18) * smoothstep(0.62, 0.92, neb2) * 0.28;

    // Colossal Solar Singularity Star behind AI Architect Core
    vec3 sunDir = normalize(vec3(0.0, 0.28, -0.96));
    float ang = acos(clamp(dot(d, sunDir), -1.0, 1.0));
    float coronaSwirl = fbm(vec2(atan(d.y - sunDir.y, d.x - sunDir.x) * 4.0 + uTime * 0.35, ang * 14.0 - uTime * 0.6));
    float corona = exp(-ang * 4.2) * (0.65 + 0.55 * coronaSwirl) + exp(-ang * 14.0) * 0.75;
    float solarDisc = 1.0 - smoothstep(0.105, 0.122, ang);
    float darkSingularity = 1.0 - smoothstep(0.048, 0.062, ang);

    forgeSky += vec3(0.98, 0.68, 0.16) * corona * 0.85;
    forgeSky = mix(forgeSky, vec3(1.0, 0.92, 0.62), solarDisc);
    // Eclipse Singularity Eye at the heart of the Star-Forge!
    forgeSky = mix(forgeSky, vec3(0.05, 0.03, 0.02), darkSingularity * 0.92);

    sky = mix(sky, forgeSky, solarForge);
  }

  fragColor = vec4(sky, 1.0);
}`;

export const TENNIS_WORLD_VS = `#version 300 es
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
uniform float uTime;
uniform float uEraMix;
uniform vec4 uWell; // xyz: gravity well center, w: well active strength [0..1]

out vec3 vWorldPos;
out vec3 vNormal;
out vec2 vUV;
out vec3 vTint;

void main() {
  vec4 wp = uModel * vec4(aPos, 1.0);
  vec3 nrm = normalize(transpose(inverse(mat3(uModel))) * aNorm);

  // Subtle 3D Gravity-Well Funnel Depression on the Court Floor in Era 3+!
  if (uMat == 1 && uWell.w > 0.01) {
    vec2 dv = wp.xz - uWell.xz;
    float d2 = dot(dv, dv);
    float dip = -exp(-d2 / 14.0) * 0.62 * uWell.w;
    wp.y += dip;
    if (d2 < 36.0 && d2 > 0.005) {
      vec2 slope = dv * (-dip * 0.14);
      nrm = normalize(nrm + vec3(slope.x, 0.0, slope.y));
    }
  }

  vWorldPos = wp.xyz;
  vNormal = nrm;
  vUV = aUV;
  vTint = aTint;
  gl_Position = uProj * uView * wp;
}`;

export const TENNIS_WORLD_FS = `#version 300 es
precision highp float;
precision highp int;
in vec3 vWorldPos;
in vec3 vNormal;
in vec2 vUV;
in vec3 vTint;

uniform int uMat;         // 0:RetroFlat, 1:CourtFloor, 2:MechaChassis, 3:StadiumTier, 6:Emissive
uniform vec3 uColor;
uniform vec3 uParams;     // x:glow/roughness, y:detail, z:alpha
uniform vec3 uCamPos;
uniform float uTime;
uniform float uEraMix;
uniform vec4 uBallPulse;  // xyz: primary ball pos, w: speed glow [0..1]
uniform vec4 uWell;       // xyz: gravity well pos, w: strength [0..1]

out vec4 fragColor;

void main() {
  float wake3D = smoothstep(1.08, 1.85, uEraMix);
  float solarForge = smoothstep(4.05, 4.90, uEraMix);

  // Material 0: 1972 Retro Phosphor Cream Unlit Block (smoothly gains 3D bevel in Era 2+)
  if (uMat == 0) {
    vec3 N = normalize(vNormal);
    vec3 L = normalize(vec3(0.25, 0.85, 0.45));
    float ndl = max(dot(N, L), 0.0);
    vec3 flatCol = uColor * vTint;
    vec3 litCol = flatCol * (0.58 + 0.52 * ndl);
    fragColor = vec4(mix(flatCol, litCol, wake3D * 0.65), uParams.z);
    return;
  }

  // Material 6: Pure Emissive Energy (Rails, Ball Core, Bumpers, Shields, Shockwaves)
  if (uMat == 6) {
    vec3 glow = uColor * vTint * uParams.x;
    fragColor = vec4(glow, uParams.z);
    return;
  }

  vec3 V = normalize(uCamPos - vWorldPos);
  vec3 N = normalize(vNormal);
  vec3 Lsun = normalize(vec3(0.18, 0.78, -0.58));
  vec3 H = normalize(Lsun + V);

  // Material 1: Escalating Tennis Court Surface!
  if (uMat == 1) {
    vec3 baseObsidian = vec3(0.038, 0.048, 0.070);
    if (wake3D < 0.01) {
      fragColor = vec4(baseObsidian, 1.0);
      return;
    }

    // Brushed Cyber-Carbon Court with Cyan & Solar Gold Vector Lines
    vec2 p = vWorldPos.xz;
    float gx = abs(fract(p.x * 0.5 + 0.5) - 0.5);
    float gz = abs(fract(p.y * 0.5 + 0.5) - 0.5);
    float minorGrid = 1.0 - smoothstep(0.012, 0.032, min(gx, gz));

    // Official Cyber-Tennis Service Box & Center Circle Markings
    float serviceZ = 1.0 - smoothstep(0.04, 0.09, abs(abs(p.y) - 8.2));
    float centerT  = (1.0 - smoothstep(0.04, 0.09, abs(p.x))) * step(abs(p.y), 8.2);
    float ringDist = abs(length(p) - 3.6);
    float centerCircle = 1.0 - smoothstep(0.04, 0.10, ringDist);
    float baseline = 1.0 - smoothstep(0.05, 0.12, abs(abs(p.y) - 15.6));

    vec3 cyanLine = vec3(0.13, 0.83, 0.93);
    vec3 goldLine = vec3(0.96, 0.69, 0.15);
    vec3 accentCol = mix(cyanLine, goldLine, smoothstep(0.0, 14.0, -p.y) * 0.55 + solarForge * 0.45);

    vec3 col = mix(baseObsidian, vec3(0.052, 0.072, 0.104), wake3D);
    col += cyanLine * minorGrid * 0.09 * wake3D;
    col += accentCol * max(max(serviceZ, centerT), max(centerCircle, baseline)) * 0.34 * wake3D;

    // Live Reactive Ball Proximity Energy Halo on Court Floor!
    float dBall = length(p - uBallPulse.xz);
    float ballGlow = exp(-dBall * 0.42) * (0.35 + 0.45 * uBallPulse.w);
    float ballRing = (1.0 - smoothstep(0.05, 0.18, abs(dBall - 1.35))) * 0.35;
    col += mix(cyanLine, goldLine, uBallPulse.w) * (ballGlow + ballRing) * wake3D;

    // Era 3+ Swirling Golden Gravity Well Vortex on Mid-Court!
    if (uWell.w > 0.01) {
      vec2 wv = p - uWell.xz;
      float r = length(wv);
      float th = atan(wv.y, wv.x);
      float spiral = sin(th * 4.0 - r * 3.2 + uTime * 6.5) * 0.5 + 0.5;
      float wellMask = exp(-r * 0.34) * uWell.w;
      col += vec3(0.96, 0.69, 0.15) * spiral * wellMask * 0.85;
      col += vec3(0.13, 0.83, 0.93) * exp(-r * 0.85) * uWell.w * 0.55;
    }

    // Specular sheen from overhead stadium lights
    float spec = pow(max(dot(N, H), 0.0), 28.0) * 0.18 * wake3D;
    col += mix(vec3(0.55, 0.88, 0.96), vec3(1.0, 0.82, 0.45), solarForge) * spec;

    fragColor = vec4(col, 1.0);
    return;
  }

  // Material 2 (Mecha / Cyber Metallic Chassis) & Material 3 (Stadium Monolith Tiers)
  vec3 base = uColor * vTint;
  float ndl = max(dot(N, Lsun), 0.0);
  float ndl2 = max(dot(N, normalize(vec3(-0.45, 0.45, 0.75))), 0.0);

  if (uMat == 3) {
    // Glowing stadium spectator light bands along horizontal tiers
    float band = smoothstep(0.78, 0.95, sin(vWorldPos.y * 2.4 - uTime * 1.8));
    vec3 tierGlow = mix(vec3(0.13, 0.83, 0.93), vec3(0.96, 0.69, 0.15), step(0.0, -vWorldPos.z) * 0.7 + solarForge * 0.3);
    vec3 col = base * (0.36 + 0.55 * ndl + 0.22 * ndl2);
    col += tierGlow * band * 0.22 * wake3D;
    fragColor = vec4(col, uParams.z);
    return;
  }

  // Material 2: High-Spec Mecha Paddle, Pinball Bumper Pillar & AI Boss Armor
  float seam = smoothstep(0.86, 0.97, max(abs(vUV.x - 0.5), abs(vUV.y - 0.5)) * 2.0);
  float spec = pow(max(dot(N, H), 0.0), 42.0) * 0.65;
  float rim = pow(1.0 - max(dot(N, V), 0.0), 2.8);

  vec3 amb = mix(vec3(0.14, 0.20, 0.26), vec3(0.32, 0.22, 0.10), solarForge);
  vec3 sunCol = mix(vec3(0.88, 0.95, 1.0), vec3(1.0, 0.86, 0.56), solarForge);
  vec3 col = base * (amb + sunCol * ndl * 0.85 + vec3(0.18, 0.48, 0.58) * ndl2 * 0.35);
  col += vec3(1.0, 0.92, 0.72) * spec;
  col += mix(vec3(0.13, 0.83, 0.93), vec3(0.96, 0.69, 0.15), uParams.y) * (rim * 0.36 + seam * 0.22);

  fragColor = vec4(col, uParams.z);
}`;

// GPU-Instanced Comet Fire Trails, Curve Sparks & Boss Explosion Shards
export const TENNIS_INST_VS = `#version 300 es
precision highp float;
precision highp int;
layout(location = 0) in vec3 aPos;
layout(location = 1) in vec2 aUV;
layout(location = 4) in vec4 iPosScale; // xyz: world pos, w: scale
layout(location = 5) in vec4 iRotKind;  // x: rot, y: stretchY, z: unused, w: kind (0=glowOrb, 1=sharpShard, 2=ringPulse)
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

export const TENNIS_INST_FS = `#version 300 es
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
    // Soft glowing plasma / comet fire particle
    if (r2 > 1.0) discard;
    float soft = (1.0 - r2) * (1.0 - r2);
    fragColor = vec4(vCol.rgb, vCol.a * soft);
  } else if (vKind < 1.5) {
    // Crisp retro pixel spark / diamond wreckage shard
    if (abs(d.x) + abs(d.y) > 1.15) discard;
    fragColor = vCol;
  } else {
    // Mini shock-ring particle
    if (r2 > 1.0 || r2 < 0.42) discard;
    fragColor = vCol;
  }
}`;

// Fullscreen Post-Process: Era-1 CRT Scanline -> Smooth ACES Bloom & Speed Rush (Photosensitivity Safe: Zero Harsh Strobe!)
export const TENNIS_POST_VS = `#version 300 es
precision highp float;
precision highp int;
out vec2 vUV;
void main() {
  vec2 pos = vec2((gl_VertexID == 1) ? 3.0 : -1.0, (gl_VertexID == 2) ? 3.0 : -1.0);
  vUV = pos * 0.5 + 0.5;
  gl_Position = vec4(pos, 0.0, 1.0);
}`;

export const TENNIS_POST_FS = `#version 300 es
precision highp float;
precision highp int;
in vec2 vUV;
uniform sampler2D uTex;
uniform vec2 uRes;
uniform float uTime;
uniform float uEraMix;
uniform float uRushBlur;  // Smooth radial speed streak on Comet Smash / Era Swoop
uniform float uBloomAmt;  // Gentle ACES bloom strength
out vec4 fragColor;

void main() {
  vec2 uv = vUV;
  float crtFactor = 1.0 - smoothstep(1.05, 1.85, uEraMix);

  // Subtle classic 1972 CRT barrel curve in Era 1 only
  if (crtFactor > 0.01) {
    vec2 cc = uv - 0.5;
    uv = 0.5 + cc * (1.0 + dot(cc, cc) * 0.08 * crtFactor);
    if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) {
      fragColor = vec4(0.02, 0.025, 0.035, 1.0);
      return;
    }
  }

  vec3 col = texture(uTex, uv).rgb;

  // Smooth Multi-Sample Anamorphic Glow (clamped strictly to prevent any harsh flash)
  vec2 px = 1.0 / uRes;
  vec3 b1 = texture(uTex, clamp(uv - vec2(px.x * 4.5, 0.0), vec2(0.002), vec2(0.998))).rgb;
  vec3 b2 = texture(uTex, clamp(uv + vec2(px.x * 4.5, 0.0), vec2(0.002), vec2(0.998))).rgb;
  vec3 b3 = texture(uTex, clamp(uv - vec2(0.0, px.y * 3.5), vec2(0.002), vec2(0.998))).rgb;
  vec3 b4 = texture(uTex, clamp(uv + vec2(0.0, px.y * 3.5), vec2(0.002), vec2(0.998))).rgb;
  vec3 avgNeighbor = (b1 + b2 + b3 + b4) * 0.25;
  vec3 bright = clamp(avgNeighbor - vec3(0.58), vec3(0.0), vec3(0.85));
  col += bright * vec3(1.0, 0.86, 0.58) * (0.48 * uBloomAmt);

  // Smooth radial speed rush during Comet Smashes & Camera Swoops
  if (uRushBlur > 0.02) {
    vec2 dir = vec2(0.5) - uv;
    float edge = smoothstep(0.18, 0.72, length(dir));
    vec3 streak = texture(uTex, clamp(uv + dir * 0.022 * uRushBlur * edge, vec2(0.002), vec2(0.998))).rgb;
    col = mix(col, streak, edge * uRushBlur * 0.42);
  }

  // Gentle 1972 CRT Phosphor Scanlines in Era 1
  if (crtFactor > 0.01) {
    float scan = 0.92 + 0.08 * sin(uv.y * uRes.y * 1.35);
    col *= mix(1.0, scan, crtFactor);
  }

  // ACES Filmic Tone Mapping
  col = (col * (2.51 * col + 0.03)) / (col * (2.43 * col + 0.59) + 0.14);

  // Soft obsidian cinema vignette
  float vigDist = length((vUV - 0.5) * vec2(1.12, 1.0));
  float vig = 1.0 - smoothstep(0.52, 0.98, vigDist);
  col *= mix(0.74, 1.0, vig);

  fragColor = vec4(pow(max(col, vec3(0.0)), vec3(1.0 / 2.15)), 1.0);
}`;
