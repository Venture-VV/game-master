// WebGL2 (#version 300 es) Shaders for Starry Nightrider: Impasto Odyssey

export const SKY_VS = `#version 300 es
precision highp float;
layout(location = 0) in vec3 aPos;
uniform mat4 uProj;
uniform mat4 uView;
uniform vec3 uCamPos;
out vec3 vDir;
void main() {
  vDir = aPos;
  vec4 wp = vec4(uCamPos + aPos * 520.0, 1.0);
  gl_Position = uProj * uView * wp;
}`;

export const SKY_FS = `#version 300 es
precision highp float;
in vec3 vDir;
uniform float uTime;
uniform float uConstLit[5];
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
  mat2 m = mat2(1.6, 1.2, -1.2, 1.6);
  for (int i = 0; i < 4; i++) {
    s += a * vnoise(p);
    p = m * p;
    a *= 0.5;
  }
  return s;
}

void main() {
  vec3 d = normalize(vDir);
  float el = clamp(d.y, -0.15, 1.0);
  float az = atan(d.x, -d.z); // 0 when looking North (-Z)

  // Base nocturnal sky gradient (Prussian -> Ultramarine -> Horizon Cerulean)
  vec3 deepPrussian = vec3(0.035, 0.085, 0.225);
  vec3 ultramarine  = vec3(0.085, 0.215, 0.485);
  vec3 cerulean     = vec3(0.195, 0.435, 0.685);
  vec3 viridianMist = vec3(0.145, 0.385, 0.475);

  vec3 sky = mix(ultramarine, deepPrussian, smoothstep(0.08, 0.78, el));
  sky = mix(viridianMist, sky, smoothstep(-0.02, 0.20, el));

  // Van Gogh's Great Central S-Wave Nebula & Twin Curl Vortices
  vec2 uv = vec2(az * 2.1, el * 3.4);
  float drift = uTime * 0.055;

  // Vortex centers in (az, el) space
  vec2 v1 = uv - vec2(-0.42 + sin(uTime * 0.08) * 0.05, 1.12);
  vec2 v2 = uv - vec2(0.32 - cos(uTime * 0.07) * 0.04, 0.92);
  float r1 = length(v1);
  float r2 = length(v2);
  float swirlAngle1 = 3.4 * exp(-r1 * 1.45);
  float swirlAngle2 = -2.9 * exp(-r2 * 1.55);

  vec2 wuv = uv;
  wuv += vec2(-v1.y, v1.x) * swirlAngle1 * 0.55;
  wuv += vec2(-v2.y, v2.x) * swirlAngle2 * 0.52;
  wuv.x += sin(wuv.y * 3.2 - drift * 2.0) * 0.35;

  float flowA = fbm(wuv * 1.85 + vec2(drift, -drift * 0.4));
  float flowB = fbm(wuv * 3.4 - vec2(drift * 1.3, drift * 0.5));

  // Quantize into segmented Van Gogh directional impasto daubs!
  vec2 strokeGrid = wuv * vec2(13.0, 22.0);
  vec2 cellId = floor(strokeGrid);
  vec2 cellUv = fract(strokeGrid) - 0.5;
  float jitter = hash21(cellId);

  // Brushstroke capsule mask & bristle grooves
  float cap = 1.0 - smoothstep(0.28, 0.49, max(abs(cellUv.x) * 0.85, abs(cellUv.y) * 1.12));
  float bristles = sin((cellUv.y + jitter) * 34.0) * 0.5 + 0.5;
  float ridgeHighlight = smoothstep(0.55, 0.95, bristles) * cap;

  float swirlBand = smoothstep(0.42, 0.74, flowA) * smoothstep(0.03, 0.22, el) * (1.0 - smoothstep(0.62, 0.92, el));
  vec3 milkySwirl = mix(cerulean, vec3(0.62, 0.80, 0.93), smoothstep(0.52, 0.82, flowB));
  sky = mix(sky, milkySwirl, swirlBand * (0.55 + 0.35 * cap));

  // Add individual cobalt/turquoise brushstroke color variation & impasto ridge catchlight
  vec3 strokeTint = mix(vec3(0.06, 0.16, 0.39), vec3(0.26, 0.54, 0.78), jitter);
  sky = mix(sky, strokeTint, cap * 0.24 * smoothstep(0.0, 0.25, el));
  sky += vec3(0.11, 0.19, 0.30) * ridgeHighlight * 0.38;

  // Blazing Crescent Moon (Upper North-East over Moonrise Summit)
  vec3 moonDir = normalize(vec3(0.44, 0.45, -0.777));
  float mAng = acos(clamp(dot(d, moonDir), -1.0, 1.0));
  vec3 biteDir = normalize(moonDir + vec3(-0.042, 0.022, -0.01));
  float bAng = acos(clamp(dot(d, biteDir), -1.0, 1.0));

  float outerDisc = 1.0 - smoothstep(0.058, 0.064, mAng);
  float innerCut  = 1.0 - smoothstep(0.046, 0.053, bAng);
  float crescent  = clamp(outerDisc - innerCut * 0.92, 0.0, 1.0);

  // Concentric broken impasto halo rings around the Moon
  vec3 tAxis = normalize(cross(vec3(0.0, 1.0, 0.0), moonDir));
  vec3 bAxis = cross(moonDir, tAxis);
  float ringTheta = atan(dot(d, bAxis), dot(d, tAxis));
  float ringR = mAng * 38.0;
  float ringBand = sin(ringR * 3.14159) * 0.5 + 0.5;
  float dash = smoothstep(0.25, 0.75, sin(ringTheta * 14.0 + floor(ringR) * 2.7 + uTime * 0.6) * 0.5 + 0.5);
  float moonHalo = exp(-mAng * 6.2) * (0.48 + 0.52 * ringBand * dash);

  vec3 saffron = vec3(0.96, 0.63, 0.16);
  vec3 cadmium = vec3(0.99, 0.85, 0.32);
  sky += mix(saffron, cadmium, 0.65) * moonHalo * 0.92;
  sky = mix(sky, vec3(1.0, 0.92, 0.52), crescent);

  // 9 Signature Swirling Van Gogh Halo Stars
  const vec3 STARS[9] = vec3[9](
    vec3(-0.55, 0.48, -0.68),
    vec3(-0.28, 0.62, -0.73),
    vec3( 0.06, 0.56, -0.82),
    vec3(-0.72, 0.31, -0.62),
    vec3( 0.68, 0.33, -0.65),
    vec3(-0.42, 0.25,  0.87),
    vec3( 0.35, 0.44,  0.82),
    vec3( 0.02, 0.74,  0.67),
    vec3( 0.76, 0.52,  0.38)
  );
  for (int i = 0; i < 9; i++) {
    vec3 sd = normalize(STARS[i]);
    float sa = acos(clamp(dot(d, sd), -1.0, 1.0));
    if (sa < 0.22) {
      float pulse = 0.86 + 0.14 * sin(uTime * 2.1 + float(i) * 1.7);
      float core = 1.0 - smoothstep(0.008, 0.016, sa);
      float rings = sin(sa * 135.0 - uTime * 1.4) * 0.5 + 0.5;
      float halo = exp(-sa * 22.0) * (0.55 + 0.45 * rings) * pulse;
      vec3 scol = (i == 0 || i == 4) ? vec3(0.98, 0.88, 0.48) : vec3(0.96, 0.80, 0.34);
      sky += scol * (halo * 0.78 + core * 1.15);
    }
  }

  // 5 Ignitable Overhead Constellations (linked to the 5 Valley Altars!)
  const vec3 C_CENTERS[5] = vec3[5](
    vec3(-0.52, 0.36,  0.32), // I. Cygnus Overlook
    vec3( 0.42, 0.38, -0.35), // II. Pleiades Wheatfield
    vec3(-0.36, 0.34, -0.18), // III. Pisces Stone Bridge
    vec3( 0.52, 0.40,  0.42), // IV. Corona Windmill Ridge
    vec3(-0.22, 0.42, -0.52)  // V. Ursa Belltower
  );
  for (int c = 0; c < 5; c++) {
    float lit = uConstLit[c];
    vec3 cc = normalize(C_CENTERS[c]);
    vec3 ct = normalize(cross(vec3(0.0, 1.0, 0.0), cc));
    vec3 cb = cross(cc, ct);
    vec2 prevP = vec2(0.0);
    for (int k = 0; k < 4; k++) {
      float fk = float(k);
      vec2 ofs = vec2(
        sin(fk * 2.1 + float(c) * 1.3) * 0.09,
        cos(fk * 1.7 + float(c) * 0.9) * 0.065
      );
      vec3 skDir = normalize(cc + ct * ofs.x + cb * ofs.y);
      float da = acos(clamp(dot(d, skDir), -1.0, 1.0));
      float dimGlow = exp(-da * 38.0) * 0.22;
      float litGlow = exp(-da * 20.0) * (0.95 + 0.2 * sin(uTime * 3.5 + fk)) * lit;
      sky += mix(vec3(0.45, 0.68, 0.95), vec3(1.0, 0.88, 0.38), lit) * (dimGlow + litGlow);

      // Shimmering constellation line segment when ignited!
      if (k > 0 && lit > 0.02) {
        vec2 curP = vec2(dot(d - cc, ct), dot(d - cc, cb));
        vec2 seg = ofs - prevP;
        float tProj = clamp(dot(curP - prevP, seg) / max(0.0001, dot(seg, seg)), 0.0, 1.0);
        float distLine = length(curP - (prevP + seg * tProj));
        float lineMask = (1.0 - smoothstep(0.0018, 0.0055, distLine)) * step(0.0, dot(d, cc));
        sky += vec3(1.0, 0.84, 0.36) * lineMask * lit * 0.68;
      }
      prevP = ofs;
    }
  }

  // Horizon atmospheric blend into Les Alpilles mountains
  vec3 horizonGlow = vec3(0.11, 0.24, 0.42);
  sky = mix(horizonGlow, sky, smoothstep(-0.08, 0.08, el));

  fragColor = vec4(sky, 1.0);
}`;

export const WORLD_VS = `#version 300 es
precision highp float;
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

export const WORLD_FS = `#version 300 es
precision highp float;
in vec3 vWorldPos;
in vec3 vNormal;
in vec2 vUV;
in vec3 vTint;

uniform int uMat;         // 1:Terrain, 2:RiverWater, 3:Cypress, 4:PaintedSolid, 6:Emissive
uniform vec3 uColor;
uniform vec3 uParams;     // x:roughness/glow, y:strokeScale, z:alpha
uniform vec3 uCamPos;
uniform vec3 uLanternPos; // Warm golden lantern carried by Vincent!
uniform float uTime;
uniform float uDashGlow;

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
  vec3 V = normalize(uCamPos - vWorldPos);
  float dist = length(uCamPos - vWorldPos);

  // Emissive Star-Seeds, Cottage Windows, Constellation Beams & Golden Portal
  if (uMat == 6) {
    float pulse = 0.90 + 0.10 * sin(uTime * 4.0 + vWorldPos.x * 0.5 + vWorldPos.y);
    vec3 glow = uColor * uParams.x * pulse;
    float fogF = 1.0 - exp(-dist * 0.0045);
    glow = mix(glow, vec3(0.08, 0.18, 0.36), fogF * 0.45);
    fragColor = vec4(glow, uParams.z);
    return;
  }

  vec3 N = normalize(vNormal);
  vec3 base = uColor * vTint;

  // Starlight River Water (Van Gogh's "Starry Night Over the Rhône" golden reflection bars!)
  if (uMat == 2) {
    vec2 wuv = vWorldPos.xz;
    float ripple = sin(wuv.x * 2.4 + uTime * 2.2 + sin(wuv.y * 1.7)) * 0.5 + 0.5;
    float ripple2 = vnoise(vec2(wuv.x * 1.6 - uTime * 0.8, wuv.y * 4.2));
    vec3 deepWater = vec3(0.04, 0.12, 0.29);
    vec3 tealStroke = vec3(0.11, 0.32, 0.48);
    vec3 col = mix(deepWater, tealStroke, smoothstep(0.35, 0.78, ripple2));

    // Broken horizontal golden reflection bars of the Moon & Village lights
    float moonTrack = exp(-pow((wuv.x - 14.0) * 0.038, 2.0)) + 0.65 * exp(-pow((wuv.x + 26.0) * 0.055, 2.0));
    float barPattern = smoothstep(0.56, 0.86, sin(wuv.y * 5.2 + ripple * 2.4 - uTime * 1.5) * 0.5 + 0.5);
    float strokeBreak = smoothstep(0.35, 0.72, vnoise(vec2(wuv.x * 0.9, wuv.y * 3.5)));
    col += vec3(0.98, 0.79, 0.28) * moonTrack * barPattern * strokeBreak * 0.92;

    // Lantern reflection near horse
    float lDist = length(vWorldPos - uLanternPos);
    col += vec3(0.98, 0.68, 0.22) * (2.2 / (1.0 + lDist * lDist * 0.12)) * (0.5 + 0.5 * barPattern);

    float fresnel = pow(1.0 - max(dot(vec3(0.0, 1.0, 0.0), V), 0.0), 3.0);
    col += vec3(0.18, 0.38, 0.62) * fresnel * 0.55;

    float fogW = 1.0 - exp(-dist * 0.006);
    col = mix(col, vec3(0.08, 0.19, 0.37), fogW);
    fragColor = vec4(col, 1.0);
    return;
  }

  // Impasto Brushstroke Relief Coordinates
  float sc = max(0.3, uParams.y);
  vec2 puv;
  if (uMat == 1) {
    // Flowing contour brushstrokes across Provençal hills
    float swirl = vnoise(vWorldPos.xz * 0.08);
    puv = vWorldPos.xz * 1.35 + vec2(cos(swirl * 6.28), sin(swirl * 6.28)) * 0.9;
  } else if (uMat == 3) {
    // Upward flame-tongue strokes on Cypress trees
    puv = vec2(atan(N.x, N.z) * 4.5 + sin(vWorldPos.y * 1.4 + uTime * 1.3) * 0.45, vWorldPos.y * 2.2);
  } else {
    puv = vUV * sc + vWorldPos.xy * 0.65 + vWorldPos.zy * 0.45;
  }

  vec2 cell = floor(puv * 3.2);
  vec2 fuv = fract(puv * 3.2) - 0.5;
  float cj = hash21(cell);

  // Bristle ridge normal perturbation (gives real 3D oil-paint thickness!)
  float bristle = sin((fuv.x * 0.7 + fuv.y * 1.3 + cj) * 26.0);
  float dabEdge = smoothstep(0.32, 0.49, max(abs(fuv.x), abs(fuv.y)));
  vec3 T = normalize(cross(abs(N.y) > 0.9 ? vec3(1.0, 0.0, 0.0) : vec3(0.0, 1.0, 0.0), N));
  vec3 B = cross(N, T);
  N = normalize(N + T * bristle * 0.14 - B * dabEdge * 0.18);

  // Subtle pigment variation per brushstroke dab (authentic Van Gogh broken-color technique!)
  if (uMat == 1) {
    vec3 coolShift = base * vec3(0.84, 0.96, 1.18);
    vec3 warmShift = base * vec3(1.16, 1.06, 0.84);
    base = mix(coolShift, warmShift, cj);
  } else if (uMat == 3) {
    // Dark emerald + Prussian blue + warm bronze tips on Cypress flames
    vec3 cypDark = vec3(0.03, 0.11, 0.12);
    vec3 cypTeal = vec3(0.08, 0.25, 0.22);
    vec3 cypWarm = vec3(0.22, 0.24, 0.11);
    base = mix(cypDark, cypTeal, cj);
    base = mix(base, cypWarm, smoothstep(0.75, 0.98, cj) * 0.45);
  } else {
    base *= (0.90 + 0.20 * cj);
  }

  // Lighting:
  // 1. Blazing Crescent Moon directional light
  vec3 Lmoon = normalize(vec3(0.44, 0.52, -0.73));
  float ndl = max(dot(N, Lmoon), 0.0);
  vec3 Hmoon = normalize(Lmoon + V);
  float specMoon = pow(max(dot(N, Hmoon), 0.0), 22.0) * (1.0 - uParams.x * 0.65);

  // 2. Nocturnal Sky Hemisphere Fill (Cobalt Zenith vs Deep Valley Shadow)
  vec3 amb = mix(vec3(0.045, 0.095, 0.20), vec3(0.11, 0.22, 0.44), N.y * 0.5 + 0.5);

  vec3 col = base * (amb * 0.95 + vec3(0.68, 0.76, 0.94) * ndl * 0.68);
  col += vec3(0.95, 0.86, 0.56) * specMoon * 0.24; // Wet linseed-oil sheen on bristle ridges!

  // 3. Vincent's Swinging Warm Lantern + Starlight Dash Aura
  vec3 toLantern = uLanternPos - vWorldPos;
  float lDist = length(toLantern);
  vec3 Llan = toLantern / max(lDist, 0.001);
  float lanAtten = (1.0 + uDashGlow * 1.1) / (1.0 + lDist * lDist * 0.085);
  float lanDiff = max(dot(N, Llan), 0.0) * 0.75 + 0.25;
  vec3 lanColor = mix(vec3(1.0, 0.72, 0.22), vec3(0.55, 0.88, 1.0), uDashGlow * 0.45);
  col += base * lanColor * lanAtten * lanDiff * 1.55;

  // Rim highlight from Moonlit Sky
  float rim = pow(1.0 - max(dot(N, V), 0.0), 3.2) * max(0.0, N.y + 0.3);
  col += vec3(0.18, 0.38, 0.66) * rim * 0.26;

  // Painterly cobalt-prussian valley mist
  float fogF = 1.0 - exp(-dist * 0.0055);
  vec3 mistCol = mix(vec3(0.05, 0.13, 0.30), vec3(0.11, 0.24, 0.46), clamp(vWorldPos.y * 0.05 + 0.25, 0.0, 1.0));
  col = mix(col, mistCol, fogF * 0.78);

  fragColor = vec4(col, 1.0);
}`;

// GPU-Instanced 3D Brushstroke Ribbons (Wind-Swaying Golden Wheat + Sky Swirls + Hoof Paint Trails)
export const INST_VS = `#version 300 es
precision highp float;
layout(location = 0) in vec3 aPos;
layout(location = 1) in vec2 aUV;
// Per-instance attributes
layout(location = 4) in vec4 iPosScale; // xyz: base pos, w: scale
layout(location = 5) in vec4 iRotKind;  // x: yaw, y: tilt, z: phase, w: kind (0=wheat, 1=skySwirl, 2=particle)
layout(location = 6) in vec4 iColor;    // rgba

uniform mat4 uProj;
uniform mat4 uView;
uniform vec3 uRiderPos;
uniform float uTime;

out vec2 vUV;
out vec4 vCol;

void main() {
  vUV = aUV;
  vCol = iColor;

  float yaw = iRotKind.x;
  float tilt = iRotKind.y;
  float phase = iRotKind.z;
  float kind = iRotKind.w;
  float sc = iPosScale.w;

  vec3 lp = aPos * sc;

  if (kind < 0.5) {
    // 0: Golden Provençal Wheat Stalks — sway in wind waves & part around galloping horse!
    float hFactor = clamp(aUV.y, 0.0, 1.0);
    float wind = sin(uTime * 2.4 + iPosScale.x * 0.16 + iPosScale.z * 0.12 + phase) * 0.34;
    float gust = cos(uTime * 4.1 + iPosScale.x * 0.32) * 0.10;

    float cy = cos(yaw), sy = sin(yaw);
    vec3 wp = vec3(
      lp.x * cy - lp.z * sy,
      lp.y,
      lp.x * sy + lp.z * cy
    );
    wp.x += (wind + gust) * hFactor * hFactor * sc;
    wp.z += wind * 0.55 * hFactor * hFactor * sc;

    // Horse parting displacement
    vec2 away = iPosScale.xz - uRiderPos.xz;
    float dH = length(away);
    if (dH < 3.4 && dH > 0.01) {
      float push = (1.0 - dH / 3.4);
      wp.xz += normalize(away) * push * push * hFactor * 1.15;
      wp.y -= push * 0.25 * hFactor;
    }

    gl_Position = uProj * uView * vec4(iPosScale.xyz + wp, 1.0);
  } else if (kind < 1.5) {
    // 1: Floating Sky & Valley Swirling Oil-Paint Ribbons
    float drift = uTime * (0.35 + 0.25 * sin(phase)) + phase;
    float cy = cos(yaw + drift * 0.3), sy = sin(yaw + drift * 0.3);
    float ct = cos(tilt), st = sin(tilt);
    vec3 p = vec3(lp.x * 2.6, lp.y * 0.42, lp.z);
    // Slight wave along stroke length
    p.y += sin(aPos.x * 3.0 + uTime * 2.5 + phase) * 0.12 * sc;
    vec3 rp = vec3(p.x * cy - p.z * sy, p.y * ct - p.z * st, p.x * sy + p.z * cy);
    vec3 center = iPosScale.xyz + vec3(cos(drift) * 1.4, sin(drift * 1.3) * 0.45, sin(drift) * 1.4);
    gl_Position = uProj * uView * vec4(center + rp, 1.0);
  } else {
    // 2: Dynamic Hoof / Starlight Dash / Celebration Brushstroke Daubs (billboarded to camera)
    vec3 camRight = vec3(uView[0][0], uView[1][0], uView[2][0]);
    vec3 camUp    = vec3(uView[0][1], uView[1][1], uView[2][1]);
    float c = cos(yaw), s = sin(yaw);
    vec2 rotXY = vec2(aPos.x * c - (aPos.y - 0.5) * s, aPos.x * s + (aPos.y - 0.5) * c) * sc;
    vec3 wp = iPosScale.xyz + camRight * rotXY.x * 1.5 + camUp * rotXY.y;
    gl_Position = uProj * uView * vec4(wp, 1.0);
  }
}`;

export const INST_FS = `#version 300 es
precision highp float;
in vec2 vUV;
in vec4 vCol;
out vec4 fragColor;

void main() {
  // Painterly tapered brushstroke silhouette + bristle streaks
  float taper = sin(clamp(vUV.y, 0.0, 1.0) * 3.14159);
  float edge = abs(vUV.x - 0.5) * 2.0;
  if (edge > 0.95) discard;
  float bristle = 0.82 + 0.18 * sin(vUV.x * 28.0 + vUV.y * 6.0);
  float alpha = vCol.a * smoothstep(1.0, 0.35, edge) * (0.35 + 0.65 * taper);
  if (alpha < 0.03) discard;
  fragColor = vec4(vCol.rgb * bristle, alpha);
}`;

// Full-Screen Directional Impasto Oil-Painting Post-Process Pass
export const POST_VS = `#version 300 es
precision highp float;
out vec2 vUV;
void main() {
  vec2 pos = vec2((gl_VertexID == 1) ? 3.0 : -1.0, (gl_VertexID == 2) ? 3.0 : -1.0);
  vUV = pos * 0.5 + 0.5;
  gl_Position = vec4(pos, 0.0, 1.0);
}`;

export const POST_FS = `#version 300 es
precision highp float;
in vec2 vUV;
uniform sampler2D uTex;
uniform vec2 uRes;
uniform int uBrushMode; // 0: Crisp 3D, 1: Impasto Masterpiece, 2: Wild Van Gogh Swirl
uniform float uTime;
uniform float uSpeedBlur;
out vec4 fragColor;

float luma(vec3 c) {
  return dot(c, vec3(0.299, 0.587, 0.114));
}

void main() {
  vec2 px = 1.0 / uRes;
  vec3 center = texture(uTex, vUV).rgb;

  vec3 painted = center;

  if (uBrushMode > 0) {
    // Compute local structure gradient to align brushstroke direction along contours!
    float lL = luma(texture(uTex, vUV - vec2(px.x * 1.5, 0.0)).rgb);
    float lR = luma(texture(uTex, vUV + vec2(px.x * 1.5, 0.0)).rgb);
    float lD = luma(texture(uTex, vUV - vec2(0.0, px.y * 1.5)).rgb);
    float lU = luma(texture(uTex, vUV + vec2(0.0, px.y * 1.5)).rgb);

    vec2 grad = vec2(lR - lL, lU - lD);
    float gLen = length(grad);
    // Tangent along painted edges (or gentle swirl in flat areas)
    float fallbackAng = sin(vUV.x * 9.0 + uTime * 0.25) * 0.6 + cos(vUV.y * 7.0) * 0.6;
    vec2 dir = (gLen > 0.015) ? normalize(vec2(-grad.y, grad.x)) : vec2(cos(fallbackAng), sin(fallbackAng));
    vec2 nrm = vec2(-dir.y, dir.x);

    float radius = (uBrushMode == 2) ? 2.65 : 1.55;
    vec2 stepAlong = dir * px * radius * 1.75;
    vec2 stepCross = nrm * px * radius * 0.72;

    // 4-Sector Fast Anisotropic Kuwahara Filter (minimum-variance oil-paint region!)
    vec3 m0 = center, s0 = center * center;
    vec3 m1 = center, s1 = center * center;
    vec3 m2 = center, s2 = center * center;
    vec3 m3 = center, s3 = center * center;

    vec3 c;
    c = texture(uTex, vUV + stepAlong).rgb;               m0 += c; s0 += c * c;
    c = texture(uTex, vUV + stepAlong * 0.5 + stepCross).rgb; m0 += c; s0 += c * c;
    c = texture(uTex, vUV + stepCross).rgb;               m0 += c; s0 += c * c;

    c = texture(uTex, vUV - stepAlong).rgb;               m1 += c; s1 += c * c;
    c = texture(uTex, vUV - stepAlong * 0.5 + stepCross).rgb; m1 += c; s1 += c * c;
    c = texture(uTex, vUV + stepCross * 0.8).rgb;         m1 += c; s1 += c * c;

    c = texture(uTex, vUV + stepAlong * 0.9 - stepCross).rgb; m2 += c; s2 += c * c;
    c = texture(uTex, vUV - stepCross).rgb;               m2 += c; s2 += c * c;
    c = texture(uTex, vUV + stepAlong * 0.4).rgb;         m2 += c; s2 += c * c;

    c = texture(uTex, vUV - stepAlong * 0.9 - stepCross).rgb; m3 += c; s3 += c * c;
    c = texture(uTex, vUV - stepAlong * 0.4).rgb;         m3 += c; s3 += c * c;
    c = texture(uTex, vUV - stepCross * 0.8).rgb;         m3 += c; s3 += c * c;

    m0 *= 0.25; s0 = abs(s0 * 0.25 - m0 * m0);
    m1 *= 0.25; s1 = abs(s1 * 0.25 - m1 * m1);
    m2 *= 0.25; s2 = abs(s2 * 0.25 - m2 * m2);
    m3 *= 0.25; s3 = abs(s3 * 0.25 - m3 * m3);

    float v0 = s0.r + s0.g + s0.b;
    float v1 = s1.r + s1.g + s1.b;
    float v2 = s2.r + s2.g + s2.b;
    float v3 = s3.r + s3.g + s3.b;

    float minV = v0;
    painted = m0;
    if (v1 < minV) { minV = v1; painted = m1; }
    if (v2 < minV) { minV = v2; painted = m2; }
    if (v3 < minV) { minV = v3; painted = m3; }

    // Impasto Paint-Edge Catchlight + Woven Linen Canvas Grain
    float bevel = clamp((lR - lL) + (lU - lD), -0.25, 0.25);
    float bristleWave = sin(dot(vUV * uRes, nrm) * 0.85) * 0.018;
    float canvasWeave = (sin(vUV.x * uRes.x * 1.15) * sin(vUV.y * uRes.y * 1.15)) * 0.014;
    float boost = (uBrushMode == 2) ? 1.45 : 0.88;
    painted += vec3(0.95, 0.88, 0.68) * (bevel * 0.26 + bristleWave) * boost;
    painted += canvasWeave * boost;
  }

  // Subtle radial Starlight-Gallop streak at outer screen edges when dashing
  if (uSpeedBlur > 0.02) {
    vec2 toCenter = vec2(0.5) - vUV;
    float edgeMask = smoothstep(0.18, 0.65, length(toCenter));
    vec3 streak = texture(uTex, vUV + toCenter * 0.022 * uSpeedBlur * edgeMask).rgb;
    painted = mix(painted, streak, edgeMask * uSpeedBlur * 0.45);
  }

  // Rich Van Gogh Vibrance & Warm Nocturne Tone Mapping
  float lum = luma(painted);
  painted = mix(vec3(lum), painted, 1.16);
  painted = (painted * (2.51 * painted + 0.03)) / (painted * (2.43 * painted + 0.59) + 0.14);

  // Subtle gallery canvas edge framing
  float vig = 1.0 - smoothstep(0.52, 0.96, length((vUV - 0.5) * vec2(1.12, 1.0)));
  painted *= mix(0.76, 1.0, vig);

  fragColor = vec4(pow(max(painted, vec3(0.0)), vec3(1.0 / 2.15)), 1.0);
}`;
