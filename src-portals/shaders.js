// WebGL2 (#version 300 es) Shaders for Endless Portals:
// 8 Procedural Alien Skies, Dual-World Live FBO Portal Window, Architectural Materials & ACES Post-Process

export const PORTAL_SKY_VS = `#version 300 es
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

export const PORTAL_SKY_FS = `#version 300 es
precision highp float;
precision highp int;
in vec3 vDir;
uniform vec3 uSkyZenith;
uniform vec3 uSkyMid;
uniform vec3 uSkyHorizon;
uniform vec3 uSunDir;
uniform vec3 uSunCol;
uniform int uArchType;
uniform float uSeed;
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
  float el = clamp(d.y, -0.25, 1.0);
  float az = atan(d.x, -d.z);

  vec3 sky = mix(uSkyMid, uSkyZenith, smoothstep(0.14, 0.82, max(el, 0.0)));
  sky = mix(uSkyHorizon, sky, smoothstep(-0.02, 0.28, el));
  sky = mix(uSkyHorizon * 0.78, sky, smoothstep(-0.22, 0.0, el));

  vec3 sDir = normalize(uSunDir);
  float sunAng = acos(clamp(dot(d, sDir), -1.0, 1.0));

  // Atmospheric cloud / caustic / nebula strata per archetype
  float n1 = vnoise(vec2(az * 3.8 + uSeed + uTime * 0.025, el * 11.0));
  float n2 = vnoise(vec2(az * 7.6 - uSeed - uTime * 0.04, el * 22.0));
  float strata = smoothstep(0.36, 0.84, n1 * 0.65 + n2 * 0.35);

  if (uArchType == 0) {
    // Sundial Sanctum: Luminous golden cloud-sea near horizon & high cirrus wisps
    float cloudSea = (1.0 - smoothstep(-0.08, 0.18, el)) * (0.55 + 0.45 * n1);
    sky += vec3(0.98, 0.80, 0.42) * cloudSea * 0.42;
    sky += vec3(0.95, 0.88, 0.72) * strata * 0.14 * (1.0 - smoothstep(0.2, 0.75, el));
  } else if (uArchType == 1) {
    // Obsidian Ziggurat: Volcanic ash bands & molten caldera horizon glow
    float caldera = exp(-max(el + 0.04, 0.0) * 7.5);
    sky += vec3(0.95, 0.38, 0.06) * caldera * 0.45;
    sky -= vec3(0.08, 0.05, 0.03) * strata * 0.4;
  } else if (uArchType == 2) {
    // Abyssal Coralhenge: Sunlit pelagic ocean surface rays & turquoise caustics overhead
    float c1 = vnoise(d.xz / (abs(d.y) + 0.32) * 3.2 + uTime * 0.35);
    float c2 = vnoise(d.xz / (abs(d.y) + 0.32) * 5.8 - uTime * 0.28);
    float caustic = pow(clamp(1.0 - abs(c1 - c2) * 2.4, 0.0, 1.0), 3.0);
    float godRay = sin(az * 14.0 + uTime * 0.5) * 0.5 + 0.5;
    sky += vec3(0.22, 0.90, 0.84) * caustic * smoothstep(-0.05, 0.65, el) * 0.38;
    sky += vec3(0.16, 0.72, 0.70) * godRay * exp(-sunAng * 2.5) * 0.22;
  } else if (uArchType == 4) {
    // Emerald Mycelia: Bioluminescent emerald-turquoise canopy mist ribbons
    float rib = sin(az * 5.0 + n1 * 4.2 + uTime * 0.18) * 0.5 + 0.5;
    sky += vec3(0.10, 0.78, 0.62) * pow(rib, 3.0) * smoothstep(0.05, 0.6, el) * 0.26;
  } else if (uArchType == 5) {
    // Origami Wind-Canyon: Binary Companion Second Sun!
    vec3 sun2 = normalize(sDir + vec3(0.32, 0.18, 0.0));
    float a2 = acos(clamp(dot(d, sun2), -1.0, 1.0));
    float disc2 = 1.0 - smoothstep(0.026, 0.032, a2);
    sky += vec3(1.0, 0.88, 0.58) * exp(-a2 * 10.0) * 0.48;
    sky = mix(sky, vec3(1.0, 0.97, 0.86), disc2);
  } else if (uArchType == 6) {
    // Arctic Prism Spire: 22-Degree Ice Halo & Twin Parhelia (Sun-Dogs)!
    float haloRing = exp(-pow((sunAng - 0.36) * 14.0, 2.0)) * 0.34;
    vec3 dogL = normalize(sDir + vec3(-0.36, 0.0, 0.0));
    vec3 dogR = normalize(sDir + vec3(0.36, 0.0, 0.0));
    float dogs = exp(-acos(clamp(dot(d, dogL), -1.0, 1.0)) * 12.0)
               + exp(-acos(clamp(dot(d, dogR), -1.0, 1.0)) * 12.0);
    sky += vec3(0.75, 0.96, 1.0) * haloRing + vec3(1.0, 0.88, 0.58) * dogs * 0.35;
  } else if (uArchType == 7) {
    // Astral Armillary: Crisp Starfield + Golden-Turquoise Celestial Band (Zero Purple!)
    vec2 starCell = floor(vec2(az * 95.0, el * 140.0));
    float sRnd = hash21(starCell + uSeed);
    if (sRnd > 0.976 && el > -0.05) {
      float tw = 0.55 + 0.45 * sin(uTime * 4.2 + sRnd * 80.0);
      vec3 sTint = (fract(sRnd * 31.7) > 0.45) ? vec3(1.0, 0.88, 0.58) : vec3(0.38, 0.94, 0.88);
      sky += sTint * tw * 0.92;
    }
    float band = exp(-pow((el - 0.28 - sin(az * 2.0 + uSeed) * 0.16) * 5.2, 2.0));
    sky += mix(vec3(0.08, 0.46, 0.50), vec3(0.76, 0.56, 0.18), n1) * band * 0.36;
  } else {
    // Monument Aqueducts: Crisp architectural sunlit strata
    sky += uSunCol * strata * 0.11 * (1.0 - smoothstep(0.15, 0.7, el));
  }

  // Primary Sun / Celestial Orb
  float discR = (uArchType == 7) ? 0.042 : 0.062;
  float disc = 1.0 - smoothstep(discR, discR + 0.008, sunAng);
  float mie = exp(-sunAng * 4.5) * 0.68 + exp(-sunAng * 15.0) * 0.48;
  sky += uSunCol * mie * ((uArchType == 7) ? 0.55 : 0.88);
  sky = mix(sky, mix(uSunCol, vec3(1.0, 0.98, 0.90), 0.55), disc);

  fragColor = vec4(sky, 1.0);
}`;

export const PORTAL_WORLD_VS = `#version 300 es
precision highp float;
precision highp int;
layout(location = 0) in vec3 aPos;
layout(location = 1) in vec3 aNorm;
layout(location = 2) in vec2 aUV;
layout(location = 3) in vec4 aColMat;

uniform mat4 uProj;
uniform mat4 uView;
uniform mat4 uModel;
uniform vec4 uTintOverride; // rgb: color override, w: > -0.5 overrides matId, < -0.5 uses vertex aColMat

out vec3 vWorldPos;
out vec3 vNormal;
out vec2 vUV;
out vec4 vColMat;

void main() {
  vec4 wp = uModel * vec4(aPos, 1.0);
  vec3 nrm = normalize(mat3(uModel) * aNorm);
  vWorldPos = wp.xyz;
  vNormal = nrm;
  vUV = aUV;
  if (uTintOverride.w > -0.5) {
    vColMat = vec4(aColMat.rgb * uTintOverride.rgb, uTintOverride.w);
  } else {
    vColMat = aColMat;
  }
  gl_Position = uProj * uView * wp;
}`;

export const PORTAL_WORLD_FS = `#version 300 es
precision highp float;
precision highp int;
in vec3 vWorldPos;
in vec3 vNormal;
in vec2 vUV;
in vec4 vColMat;

uniform vec3 uCamPos;
uniform vec3 uSunDir;
uniform vec3 uSunCol;
uniform vec3 uFogCol;
uniform float uFogDensity;
uniform int uArchType;
uniform float uTime;
uniform float uClipMinZ;
uniform float uClipMaxZ;
uniform int uCutPortalBox;

out vec4 fragColor;

float hash21(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

void main() {
  if (vWorldPos.z < uClipMinZ || vWorldPos.z > uClipMaxZ) {
    discard;
  }
  if (uCutPortalBox == 1) {
    if (abs(vWorldPos.x) < 5.42 && vWorldPos.y > 0.28 && vWorldPos.y < 15.72 &&
        vWorldPos.z < -114.95 && vWorldPos.z > -117.2) {
      discard;
    }
  }

  vec3 base = vColMat.rgb;
  float matId = vColMat.a;
  float dist = length(uCamPos - vWorldPos);
  float fogF = 1.0 - exp(-dist * uFogDensity);

  // Pure Emissive Materials (matId >= 2.5: Runes, Portal Energy Trim, Resonance Rings, Astral Shards, Kelp)
  if (matId >= 2.5) {
    float glowAmt = matId - 2.0;
    vec3 glow = base * glowAmt;
    glow = mix(glow, uFogCol, fogF * 0.42);
    fragColor = vec4(glow, 1.0);
    return;
  }

  vec3 V = normalize(uCamPos - vWorldPos);
  vec3 N = normalize(vNormal);
  vec3 L = normalize(uSunDir);
  vec3 H = normalize(L + V);

  // Terrain Special Surface Effects when matId < -0.2 (Terrain Mesh uses matId = -1.0)
  if (matId < -0.2) {
    if (uArchType == 0 && vWorldPos.y < -2.4) {
      // Golden Cloud-Sea billows below floating marble colonnades
      float billow = sin(vWorldPos.x * 0.18 + uTime * 0.6) * cos(vWorldPos.z * 0.15 - uTime * 0.4);
      vec3 cloudCol = mix(vec3(0.92, 0.72, 0.38), vec3(1.0, 0.94, 0.80), billow * 0.5 + 0.5);
      cloudCol = mix(cloudCol, uFogCol, fogF * 0.86);
      fragColor = vec4(cloudCol, 1.0);
      return;
    }
    if (uArchType == 1 && vWorldPos.y < -1.35) {
      // Flowing Molten Gold-Amber Magma Channel
      float flow = sin(vWorldPos.x * 0.65 + sin(vWorldPos.z * 0.14 + uTime * 0.8) * 2.2);
      float crust = smoothstep(-0.2, 0.55, flow);
      vec3 lava = mix(vec3(1.15, 0.46, 0.06), vec3(0.14, 0.09, 0.08), crust * 0.78);
      lava = mix(lava, uFogCol, fogF * 0.72);
      fragColor = vec4(lava, 1.0);
      return;
    }
    if (uArchType == 5) {
      // Wind-rippled Desert Sandstone Micro-Ridges
      float rip = sin(vWorldPos.x * 2.8 - vWorldPos.z * 1.6);
      N = normalize(N + vec3(0.7, 0.0, -0.5) * rip * 0.10);
    }
    if (uArchType == 7) {
      // Astral Causeway Golden-Teal Starlight Grid
      float gx = smoothstep(0.94, 0.995, cos(vWorldPos.x * 1.5708));
      float gz = smoothstep(0.95, 0.995, cos(vWorldPos.z * 0.7854));
      float line = max(gx, gz) * (1.0 - smoothstep(10.0, 26.0, abs(vWorldPos.x)));
      base += vec3(0.20, 0.78, 0.72) * line * 0.45;
    }
  }

  // Architectural Stratified Carving Detail on Stone / Terracotta
  if (matId >= -0.1 && matId < 0.5) {
    float band = sin(vWorldPos.y * 3.2) * 0.045;
    base *= (1.0 + band);
  }

  float ndl = max(dot(N, L), 0.0);
  float hemi = N.y * 0.5 + 0.5;
  vec3 bounceCol = uFogCol * 0.36 + vec3(0.08, 0.08, 0.07);
  vec3 topAmb = mix(uFogCol * 0.52, vec3(0.36, 0.44, 0.48), 0.35);
  vec3 amb = mix(bounceCol, topAmb, hemi);

  float shininess = (matId > 1.5) ? 48.0 : (matId > 0.5 ? 36.0 : 14.0);
  float specStr = (matId > 1.5) ? 0.78 : (matId > 0.5 ? 0.46 : 0.12);
  float spec = pow(max(dot(N, H), 0.0), shininess) * specStr;

  vec3 col = base * (amb + uSunCol * ndl * 0.88);
  vec3 specTint = (matId > 1.5) ? vec3(1.0, 0.86, 0.48) : vec3(1.0, 0.97, 0.90);
  col += specTint * spec;

  // Underwater Turquoise Caustics across Coralhenge Seabed & Monoliths!
  if (uArchType == 2) {
    float cA = sin(vWorldPos.x * 0.75 + uTime * 1.9 + sin(vWorldPos.z * 0.45));
    float cB = cos(vWorldPos.z * 0.68 - uTime * 1.5 + cos(vWorldPos.x * 0.52));
    float caus = pow(clamp(cA * cB * 0.5 + 0.5, 0.0, 1.0), 4.0);
    col += vec3(0.18, 0.92, 0.82) * caus * max(N.y, 0.15) * 0.42;
  }

  // Translucent Glacier Rim Scatter for Arctic Ice Prisms & Polished Marble
  float rim = pow(1.0 - max(dot(N, V), 0.0), 3.0);
  if (uArchType == 6 && matId > 0.5 && matId < 1.5) {
    col += vec3(0.36, 0.88, 0.98) * rim * 0.48;
  } else {
    col += uSunCol * rim * 0.18;
  }

  col = mix(col, uFogCol, fogF * 0.88);
  fragColor = vec4(col, 1.0);
}`;

// Live Dual-World Portal Window Shader:
// Samples offscreen portalTex (nextWorld rendered from matched camera offset!) at exact screen UV
// with liquid-gold & horizon-turquoise refractive rim ripples!
export const PORTAL_WINDOW_VS = `#version 300 es
precision highp float;
precision highp int;
layout(location = 0) in vec3 aPos;
uniform mat4 uProj;
uniform mat4 uView;
uniform mat4 uModel;
out vec3 vWorldPos;
void main() {
  vec4 wp = uModel * vec4(aPos, 1.0);
  vWorldPos = wp.xyz;
  gl_Position = uProj * uView * wp;
}`;

export const PORTAL_WINDOW_FS = `#version 300 es
precision highp float;
precision highp int;
in vec3 vWorldPos;
uniform sampler2D uPortalTex;
uniform vec2 uViewportSize;
uniform vec3 uCamPos;
uniform float uTime;
out vec4 fragColor;

void main() {
  vec2 screenUV = gl_FragCoord.xy / uViewportSize;

  // Normalized coordinates inside the 10.7m x 15.3m Portal Doorway [-1..1]
  float nx = vWorldPos.x / 5.35;
  float ny = (vWorldPos.y - 8.0) / 7.65;
  float edgeMetric = max(abs(nx), abs(ny));

  // Smoothly relax refractive UV distortion as camera flies right through z = -115.0
  // so crossing the portal plane has ZERO pixel seam!
  float camDist = abs(uCamPos.z - (-115.0));
  float rippleFade = smoothstep(0.8, 6.5, camDist);

  float rimBand = smoothstep(0.68, 1.0, edgeMetric);
  float angle = atan(ny, nx);
  float wave = sin(angle * 8.0 - uTime * 3.6 + edgeMetric * 12.0)
             + cos(angle * 5.0 + uTime * 2.4);

  vec2 distort = vec2(cos(angle), sin(angle)) * wave * 0.0045 * rimBand * rippleFade;
  vec2 sampleUV = clamp(screenUV + distort, vec2(0.001), vec2(0.999));

  vec3 nextWorldCol = texture(uPortalTex, sampleUV).rgb;

  // Swirling Solar-Brass (#f59e0b) & Horizon-Turquoise (#2dd4bf) Event-Horizon Inner Corona
  float swirl = 0.5 + 0.5 * sin(angle * 6.0 - uTime * 4.2);
  vec3 rimCol = mix(vec3(0.18, 0.83, 0.75), vec3(0.98, 0.68, 0.16), swirl);
  float corona = smoothstep(0.84, 1.0, edgeMetric) * (0.45 + 0.55 * rippleFade);

  vec3 finalCol = nextWorldCol + rimCol * corona * 0.85;
  fragColor = vec4(finalCol, 1.0);
}`;

// GPU-Instanced Atmospheric Motes, Golden Spores, Embers & Glider Wingtip Contrails
export const PORTAL_INST_VS = `#version 300 es
precision highp float;
precision highp int;
layout(location = 0) in vec3 aPos;
layout(location = 1) in vec2 aUV;
layout(location = 4) in vec4 iPosScale; // xyz: world pos, w: scale
layout(location = 5) in vec4 iColor;    // rgba

uniform mat4 uProj;
uniform mat4 uView;

out vec2 vUV;
out vec4 vCol;

void main() {
  vec3 right = vec3(uView[0][0], uView[1][0], uView[2][0]);
  vec3 up    = vec3(uView[0][1], uView[1][1], uView[2][1]);
  vec3 wp = iPosScale.xyz + (right * aPos.x + up * aPos.y) * iPosScale.w;
  vUV = aUV;
  vCol = iColor;
  gl_Position = uProj * uView * vec4(wp, 1.0);
}`;

export const PORTAL_INST_FS = `#version 300 es
precision highp float;
precision highp int;
in vec2 vUV;
in vec4 vCol;
out vec4 fragColor;

void main() {
  vec2 d = vUV * 2.0 - 1.0;
  float r2 = dot(d, d);
  if (r2 > 1.0) discard;
  float soft = pow(1.0 - r2, 1.8);
  fragColor = vec4(vCol.rgb * (1.1 + soft * 0.5), vCol.a * soft);
}`;

// Fullscreen ACES Post-Process + Warp Slipstream Radial Blur + Portal Crossing Shimmer
export const PORTAL_POST_VS = `#version 300 es
precision highp float;
precision highp int;
out vec2 vUV;
void main() {
  vec2 pos = vec2((gl_VertexID == 1) ? 3.0 : -1.0, (gl_VertexID == 2) ? 3.0 : -1.0);
  vUV = pos * 0.5 + 0.5;
  gl_Position = vec4(pos, 0.0, 1.0);
}`;

export const PORTAL_POST_FS = `#version 300 es
precision highp float;
precision highp int;
in vec2 vUV;
uniform sampler2D uTex;
uniform float uRushBlur;
uniform float uPortalFlash;
uniform float uTime;
out vec4 fragColor;

vec3 acesFilm(vec3 x) {
  float a = 2.51;
  float b = 0.03;
  float c = 2.43;
  float d = 0.59;
  float e = 0.14;
  return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0);
}

void main() {
  vec2 centered = vUV - 0.5;
  float rad = length(centered);

  vec3 col = texture(uTex, vUV).rgb;

  // Subtle Warp-Boost Radial Slipstream Blur near screen periphery
  float blurAmt = (uRushBlur * 0.014 + uPortalFlash * 0.018) * smoothstep(0.14, 0.68, rad);
  if (blurAmt > 0.0004) {
    vec3 acc = col;
    acc += texture(uTex, clamp(vUV - centered * blurAmt * 0.45, 0.001, 0.999)).rgb;
    acc += texture(uTex, clamp(vUV - centered * blurAmt * 0.90, 0.001, 0.999)).rgb;
    col = acc / 3.0;
  }

  // Luminous Golden-Turquoise Dimensional Crossing Shimmer
  if (uPortalFlash > 0.005) {
    float wave = 0.5 + 0.5 * sin(rad * 18.0 - uTime * 9.0);
    vec3 flashTint = mix(vec3(0.18, 0.85, 0.76), vec3(0.98, 0.76, 0.28), wave);
    col += flashTint * uPortalFlash * (0.22 + 0.36 * smoothstep(0.15, 0.72, rad));
  }

  // Subtle architectural framing vignette
  col *= 1.0 - rad * rad * 0.24;

  // ACES Filmic Tone Mapping + sRGB Curve
  col = acesFilm(col * 1.04);
  col = pow(col, vec3(1.0 / 2.2));

  fragColor = vec4(col, 1.0);
}`;
