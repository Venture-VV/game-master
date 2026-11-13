// WebGL2 (#version 300 es) Shaders for CROSSTOWN NYC: Wet Reflective Asphalt, Skyscraper Window Grids, Times Square LEDs & Nitro Speed-Streaks

export const CT_SKY_VS = `#version 300 es
precision highp float;
precision highp int;
layout(location = 0) in vec3 aPos;
uniform mat4 uProj;
uniform mat4 uView;
uniform vec3 uCamPos;
out vec3 vDir;
void main() {
  vDir = aPos;
  gl_Position = uProj * uView * vec4(uCamPos + aPos * 680.0, 1.0);
}`;

export const CT_SKY_FS = `#version 300 es
precision highp float;
precision highp int;
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

  // Manhattan Golden-Hour Dusk Palette (Hudson Slate-Blue Zenith -> Warm Sodium-Amber Horizon)
  vec3 zenithSlate  = vec3(0.035, 0.078, 0.138);
  vec3 midHudson    = vec3(0.105, 0.215, 0.325);
  vec3 horizonAmber = vec3(0.92, 0.54, 0.18);
  vec3 cityGlow     = vec3(0.58, 0.34, 0.14);

  vec3 sky = mix(midHudson, zenithSlate, smoothstep(0.16, 0.78, el));
  sky = mix(horizonAmber, sky, smoothstep(0.0, 0.24, el));
  sky = mix(cityGlow, sky, smoothstep(-0.12, 0.02, el));

  // Hudson River Sunset Glow toward West/Southwest (-X, -Z)
  vec3 sunDir = normalize(vec3(-0.62, 0.19, -0.76));
  float sunAng = acos(clamp(dot(d, sunDir), -1.0, 1.0));
  float sunDisc = 1.0 - smoothstep(0.048, 0.056, sunAng);
  float mie = exp(-sunAng * 3.8) * 0.72 + exp(-sunAng * 12.0) * 0.50;
  sky += vec3(1.0, 0.64, 0.20) * mie;
  sky = mix(sky, vec3(1.0, 0.93, 0.72), sunDisc);

  // Golden-lit dusk cloud bands drifting over Midtown
  if (el > 0.02) {
    vec2 cuv = d.xz / (el + 0.18) * 1.35 + vec2(uTime * 0.015, -uTime * 0.008);
    float c1 = vnoise(cuv * 2.2);
    float c2 = vnoise(cuv * 5.1 + 3.7);
    float cloud = smoothstep(0.48, 0.82, c1 * 0.68 + c2 * 0.32) * smoothstep(0.02, 0.18, el) * (1.0 - smoothstep(0.45, 0.85, el));
    vec3 cloudLit = mix(vec3(0.16, 0.24, 0.32), vec3(1.0, 0.68, 0.28), clamp(dot(d, sunDir) * 0.5 + 0.55, 0.0, 1.0));
    sky = mix(sky, cloudLit, cloud * 0.62);
  }

  fragColor = vec4(sky, 1.0);
}`;

export const CT_WORLD_VS = `#version 300 es
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
  mat3 nMat = transpose(inverse(mat3(uModel)));
  vWorldPos = wp.xyz;
  vNormal = normalize(nMat * aNorm);
  vUV = aUV;
  vTint = aTint;
  gl_Position = uProj * uView * wp;
}`;

export const CT_WORLD_FS = `#version 300 es
precision highp float;
precision highp int;
in vec3 vWorldPos;
in vec3 vNormal;
in vec2 vUV;
in vec3 vTint;

// uMat:
// 1 = Manhattan Ground (Wet Reflective Asphalt, Lane Markings, Crosswalks, Sidewalks, Park Lawn)
// 2 = Skyscraper Facade (Procedural Lit Interior Window Grid + Stone/Glass Mullions)
// 3 = Glossy Automotive Metal / Chrome / Bridge Steel
// 4 = Foliage, Brick, Stone & Matte Props
// 5 = Reflective Water (East River & Central Park Pond)
// 6 = HDR Emissive (Beacons, Headlights, Taillights, Nitro Flames, Spires)
// 7 = Times Square Animated Digital LED Billboards
uniform int uMat;
uniform vec3 uColor;
uniform vec3 uParams; // x: glow/roughness, y: detail/seed, z: alpha
uniform vec3 uCamPos;
uniform float uTime;
uniform vec3 uHeadlightPos;
uniform vec3 uHeadlightDir;

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

vec3 calcHeadlightCone(vec3 wp, vec3 N) {
  vec3 toFrag = wp - uHeadlightPos;
  float d = length(toFrag);
  if (d > 48.0 || d < 0.4) return vec3(0.0);
  vec3 dir = toFrag / d;
  float align = dot(dir, uHeadlightDir);
  if (align < 0.72) return vec3(0.0);
  float cone = smoothstep(0.72, 0.94, align);
  float atten = (1.0 - d / 48.0);
  atten *= atten;
  return vec3(1.0, 0.92, 0.72) * cone * atten * (0.45 + 0.55 * max(dot(N, vec3(0.0, 1.0, 0.0)), 0.0)) * 1.15;
}

void main() {
  vec3 V = normalize(uCamPos - vWorldPos);
  float dist = length(uCamPos - vWorldPos);
  vec3 fogCol = mix(vec3(0.14, 0.22, 0.30), vec3(0.72, 0.44, 0.18), clamp(1.0 - vWorldPos.y * 0.012, 0.25, 0.88));
  float fogAmt = 1.0 - exp(-dist * 0.0028);

  // Material 6: Pure HDR Emissive
  if (uMat == 6) {
    vec3 glow = uColor * vTint * uParams.x;
    glow = mix(glow, fogCol, fogAmt * 0.35);
    fragColor = vec4(glow, uParams.z);
    return;
  }

  vec3 N = normalize(vNormal);
  vec3 Lsun = normalize(vec3(-0.60, 0.34, -0.72));
  vec3 H = normalize(Lsun + V);

  // Material 7: Times Square Animated Multi-Panel Digital LED Billboards
  if (uMat == 7) {
    vec2 uv = vUV;
    float panelId = floor(vTint.r * 7.0 + vTint.g * 13.0);
    float scan = 0.86 + 0.14 * sin(uv.y * 110.0 - uTime * 8.0);
    float gridPix = 0.90 + 0.10 * step(0.15, fract(uv.x * 42.0)) * step(0.15, fract(uv.y * 28.0));

    vec3 cSaffron = vec3(0.98, 0.74, 0.14);
    vec3 cCyan    = vec3(0.16, 0.78, 0.98);
    vec3 cAmber   = vec3(0.96, 0.44, 0.12);
    vec3 cEmerald = vec3(0.12, 0.86, 0.52);
    vec3 cWhite   = vec3(0.98, 0.96, 0.90);

    vec3 screenCol = cSaffron;
    int mode = int(mod(panelId, 4.0));
    if (mode == 0) {
      // Broadway Saffron & Cyan Diagonal Energy Bars
      float wave = sin((uv.x * 6.0 + uv.y * 3.0) - uTime * 3.2);
      screenCol = mix(cSaffron, cCyan, smoothstep(-0.2, 0.2, wave));
      float ticker = step(0.76, uv.y) * step(uv.y, 0.90);
      float tickBit = step(0.45, fract(uv.x * 12.0 + uTime * 1.8));
      screenCol = mix(screenCol, cWhite, ticker * tickBit);
    } else if (mode == 1) {
      // NYC Stock / Music Equalizer Columns in Hudson Cyan & Emerald
      float colIdx = floor(uv.x * 10.0);
      float barH = 0.25 + 0.65 * (0.5 + 0.5 * sin(uTime * (2.5 + colIdx * 0.4) + colIdx * 1.7));
      float isBar = step(uv.y, barH) * step(0.14, fract(uv.x * 10.0));
      screenCol = mix(vec3(0.05, 0.12, 0.18), mix(cCyan, cEmerald, uv.y), isBar);
      screenCol += cSaffron * step(abs(uv.y - barH), 0.035);
    } else if (mode == 2) {
      // Warm Amber & Gold Concentric Pulse Sunburst
      vec2 d = (uv - 0.5) * vec2(1.6, 1.0);
      float rings = sin(length(d) * 16.0 - uTime * 4.5);
      screenCol = mix(cAmber, cSaffron, smoothstep(-0.3, 0.3, rings));
      screenCol = mix(screenCol, cWhite, smoothstep(0.28, 0.05, length(d)));
    } else {
      // Split Marquee Poster (Cyan / Saffron / Crisp White)
      screenCol = uv.x < 0.52 ? cCyan : cSaffron;
      float stripe = step(0.4, sin(uv.y * 24.0 + uTime * 5.0));
      if (uv.y < 0.22) screenCol = mix(vec3(0.08, 0.11, 0.15), cWhite, stripe);
    }

    vec3 finalLED = screenCol * scan * gridPix * 1.42;
    finalLED = mix(finalLED, fogCol, fogAmt * 0.4);
    fragColor = vec4(finalLED, 1.0);
    return;
  }

  // Material 5: Shimmering Reflective Water (East River & Central Park Pond)
  if (uMat == 5) {
    float w1 = sin(vWorldPos.x * 1.4 + uTime * 2.1 + vWorldPos.z * 0.7);
    float w2 = cos(vWorldPos.z * 1.9 - uTime * 1.7 - vWorldPos.x * 0.5);
    vec3 Nw = normalize(vec3(w1 * 0.08, 1.0, w2 * 0.08));
    float fres = pow(1.0 - max(dot(Nw, V), 0.0), 3.2);
    vec3 deepWater = vec3(0.035, 0.14, 0.21) * vTint;
    vec3 skyRefl = mix(vec3(0.14, 0.36, 0.50), vec3(0.95, 0.62, 0.24), clamp(fres * 0.85 + 0.15, 0.0, 1.0));
    vec3 col = mix(deepWater, skyRefl, clamp(0.28 + fres * 0.68, 0.0, 1.0));
    float sunGlint = pow(max(dot(Nw, H), 0.0), 64.0);
    col += vec3(1.0, 0.82, 0.42) * sunGlint * 1.35;
    col = mix(col, fogCol, fogAmt * 0.78);
    fragColor = vec4(col, 1.0);
    return;
  }

  // Material 1: Manhattan Streets, Wet Asphalt, Lane Markings, Crosswalks, Sidewalks & Park Lawn
  if (uMat == 1) {
    float x = vWorldPos.x;
    float z = vWorldPos.z;
    float nearAve = clamp(round(x / 60.0) * 60.0, -180.0, 180.0);
    float nearSt  = clamp(round(z / 60.0) * 60.0, -180.0, 180.0);
    float dx = abs(x - nearAve);
    float dz = abs(z - nearSt);

    bool onBridge = (x > 169.5 && x < 190.5 && abs(z) < 108.5 && vWorldPos.y > 0.25);
    bool onAve = (dx < 8.0 && abs(z) < 190.0);
    bool onSt  = (dz < 8.0 && abs(x) < 190.0) && !onBridge;
    bool inPark = (abs(x) < 48.5 && z > -168.5 && z < -71.5 && !onAve && !onSt);

    vec3 col;
    float wetSpec = 0.0;

    if (onAve || onSt || onBridge) {
      float grain = hash21(floor(vWorldPos.xz * 14.0));
      float puddle = smoothstep(0.42, 0.76, vnoise(vWorldPos.xz * 0.15));
      col = vec3(0.085, 0.098, 0.118) * (0.88 + 0.24 * grain);
      col = mix(col, vec3(0.048, 0.060, 0.078), puddle * 0.65);

      // NYC Yellow Double Center Line & Dashed White Lanes
      vec3 paintYellow = vec3(0.96, 0.72, 0.15);
      vec3 paintWhite  = vec3(0.88, 0.90, 0.92);

      if (onBridge) {
        float bdx = abs(x - 180.0);
        if (bdx > 0.07 && bdx < 0.26) col = paintYellow;
        if (abs(bdx - 4.0) < 0.11 && fract(z * 0.14) < 0.45) col = paintWhite;
        if (bdx > 7.55 && bdx < 7.82) col = paintWhite * 0.85;
        // Steel expansion joint every 18m on bridge deck
        if (fract(z / 18.0) < 0.025) col = vec3(0.28, 0.31, 0.35);
      } else {
        bool inter = (onAve && onSt);
        if (!inter) {
          if (onAve) {
            if (dx > 0.07 && dx < 0.26 && dz > 10.8) col = paintYellow;
            if (abs(dx - 4.0) < 0.11 && dz > 11.2 && fract(z * 0.15) < 0.45) col = paintWhite;
            // White Zebra Crosswalk at intersection throats
            if (dz > 8.25 && dz < 10.45 && dx < 7.4 && fract(x * 0.72) < 0.52) col = paintWhite;
            if (abs(dz - 10.75) < 0.18 && dx < 7.5) col = paintWhite;
          }
          if (onSt) {
            if (dz > 0.07 && dz < 0.26 && dx > 10.8) col = paintYellow;
            if (abs(dz - 4.0) < 0.11 && dx > 11.2 && fract(x * 0.15) < 0.45) col = paintWhite;
            if (dx > 8.25 && dx < 10.45 && dz < 7.4 && fract(z * 0.72) < 0.52) col = paintWhite;
            if (abs(dx - 10.75) < 0.18 && dz < 7.5) col = paintWhite;
          }
        }
      }

      // Wet Asphalt Streetlight & Sunset Sky Specular Reflections!
      float fres = pow(1.0 - max(dot(N, V), 0.0), 3.5);
      vec3 reflTint = vec3(0.95, 0.62, 0.22) * (0.22 + 0.58 * puddle);
      // Extra cyan/gold neon sheen near Times Square (-60, 0)
      float tsDist = length(vWorldPos.xz - vec2(-60.0, 0.0));
      float tsMask = 1.0 - smoothstep(18.0, 68.0, tsDist);
      reflTint += mix(vec3(0.16, 0.76, 0.98), vec3(0.98, 0.72, 0.16), 0.5 + 0.5 * sin(x * 0.3)) * tsMask * (0.35 + 0.55 * puddle);

      // Periodic warm streetlight pools along avenues & streets every 30m
      float poolX = cos(x * 0.2094);
      float poolZ = cos(z * 0.2094);
      float lampPool = max(0.0, poolX * poolZ);
      col += vec3(0.96, 0.58, 0.18) * lampPool * (0.08 + 0.16 * puddle);
      col += reflTint * fres * 0.55;
      wetSpec = pow(max(dot(N, H), 0.0), 36.0) * (0.25 + 0.75 * puddle);
      col += vec3(1.0, 0.80, 0.44) * wetSpec;
    } else if (inPark) {
      // Central Park Emerald Lawn & Scenic Gravel Loop Paths
      float blade = vnoise(vWorldPos.xz * 1.8);
      vec3 grassDark = vec3(0.08, 0.30, 0.14);
      vec3 grassLit  = vec3(0.18, 0.52, 0.22);
      col = mix(grassDark, grassLit, blade);
      // Curved diagonal park footpath
      float pathDist = abs(sin(x * 0.065) * 12.0 + (z + 120.0) * 0.32);
      if (pathDist < 1.8) {
        col = vec3(0.48, 0.42, 0.33);
      }
      float ndl = max(dot(N, Lsun), 0.0);
      col *= (0.55 + 0.65 * ndl);
    } else {
      // Concrete Manhattan Sidewalks with Paver Seams & Curb Edge
      float seamX = smoothstep(0.0, 0.05, fract(x * 0.5));
      float seamZ = smoothstep(0.0, 0.05, fract(z * 0.5));
      float paver = 0.88 + 0.12 * (seamX * seamZ);
      col = vec3(0.32, 0.33, 0.35) * paver * vTint;
      float edgeRoad = min(dx, dz);
      if (edgeRoad >= 8.0 && edgeRoad < 8.42) {
        // Granite / Taxi-Yellow Painted Corner Curb
        bool corner = (dx < 12.0 && dz < 12.0);
        col = corner ? vec3(0.88, 0.64, 0.14) : vec3(0.45, 0.46, 0.48);
      }
      float ndl = max(dot(N, Lsun), 0.0);
      col *= (0.52 + 0.58 * ndl);
    }

    col += calcHeadlightCone(vWorldPos, N);
    col = mix(col, fogCol, fogAmt * 0.82);
    fragColor = vec4(col, 1.0);
    return;
  }

  // Material 2: Skyscraper Facade with Procedural Interior Lit Window Grid!
  if (uMat == 2) {
    vec3 baseFacade = uColor * vTint;
    float ndl = max(dot(N, Lsun), 0.0);
    vec3 amb = mix(vec3(0.20, 0.24, 0.30), vec3(0.36, 0.30, 0.24), N.y * 0.5 + 0.5);

    // Rooftop horizontal surfaces
    if (abs(N.y) > 0.68) {
      float roofPatch = 0.85 + 0.15 * hash21(floor(vWorldPos.xz * 0.8));
      vec3 roofCol = baseFacade * 0.58 * roofPatch * (amb + vec3(0.95, 0.74, 0.45) * ndl);
      roofCol = mix(roofCol, fogCol, fogAmt * 0.82);
      fragColor = vec4(roofCol, 1.0);
      return;
    }

    // Vertical Facade Wall: Architectural Floors (every 3.1m) & Window Bays (every 2.3m)
    float wallU = abs(N.x) > 0.5 ? vWorldPos.z : vWorldPos.x;
    float wallV = vWorldPos.y;

    float bayCoord   = wallU / 2.35;
    float floorCoord = wallV / 3.15;
    vec2 cellId = vec2(floor(bayCoord), floor(floorCoord));
    vec2 cellF  = vec2(fract(bayCoord), fract(floorCoord));

    // Mullion / Spandrel frame vs Window Glass Pane
    bool isGlass = (cellF.x > 0.18 && cellF.x < 0.82 && cellF.y > 0.20 && cellF.y < 0.84 && wallV > 1.2);
    bool isStorefront = (wallV > 0.35 && wallV < 3.4 && cellF.x > 0.10 && cellF.x < 0.90);

    vec3 col = baseFacade * (amb + vec3(1.05, 0.76, 0.44) * ndl * 0.82);

    if (isStorefront) {
      float shopSeed = hash21(vec2(cellId.x, floor(vTint.r * 31.0)));
      vec3 warmShop = shopSeed > 0.35 ? vec3(1.0, 0.78, 0.38) : vec3(0.28, 0.78, 0.96);
      col = mix(col * 0.4, warmShop * 0.92, 0.82);
    } else if (isGlass) {
      float bSeed = floor((vTint.r + vTint.g * 2.0) * 19.0);
      float rnd = hash21(cellId + vec2(bSeed * 7.3, bSeed * 3.1));
      float floorBand = hash21(vec2(cellId.y, bSeed));

      // Dusk sky reflection on exterior curtain glass
      float fres = pow(1.0 - max(dot(N, V), 0.0), 2.5);
      vec3 glassRefl = mix(vec3(0.08, 0.16, 0.25), vec3(0.88, 0.56, 0.24), clamp(fres * 0.8 + (1.0 - wallV * 0.008) * 0.35, 0.0, 1.0));

      if (rnd > 0.54 || floorBand > 0.84) {
        // Lit Manhattan Office / Penthouse Interior!
        vec3 litTint = (rnd > 0.86)
          ? vec3(0.32, 0.80, 0.98)  // Cool Hudson cyan studio
          : (rnd > 0.70 ? vec3(0.98, 0.93, 0.80) : vec3(1.0, 0.74, 0.32)); // Warm golden incandescent office
        // Subtle interior ceiling/desk gradient inside the window!
        float interiorGrad = 0.65 + 0.35 * cellF.y;
        col = mix(glassRefl, litTint * interiorGrad * 1.12, 0.84);
      } else {
        col = glassRefl;
        float spec = pow(max(dot(N, H), 0.0), 42.0) * 0.65;
        col += vec3(1.0, 0.78, 0.42) * spec;
      }
    }

    col += calcHeadlightCone(vWorldPos, N) * 0.6;
    col = mix(col, fogCol, fogAmt * 0.82);
    fragColor = vec4(col, 1.0);
    return;
  }

  // Material 3 (Glossy Automotive Clearcoat / Chrome / Bridge Steel) & Material 4 (Park Foliage / Brick / Props)
  vec3 base = uColor * vTint;
  float ndl = max(dot(N, Lsun), 0.0);
  vec3 amb = mix(vec3(0.22, 0.26, 0.34), vec3(0.42, 0.34, 0.24), N.y * 0.5 + 0.5);
  vec3 col = base * (amb + vec3(1.08, 0.80, 0.48) * ndl * 0.88);

  if (uMat == 3) {
    float spec = pow(max(dot(N, H), 0.0), 52.0) * 0.85;
    float fres = pow(1.0 - max(dot(N, V), 0.0), 3.2);
    col += vec3(1.0, 0.86, 0.58) * spec;
    col += vec3(0.36, 0.62, 0.84) * fres * 0.28;
  } else {
    float rim = pow(1.0 - max(dot(N, V), 0.0), 2.8);
    col += vec3(0.95, 0.66, 0.28) * rim * 0.18;
  }

  col += calcHeadlightCone(vWorldPos, N) * 0.75;
  col = mix(col, fogCol, fogAmt * 0.82);
  fragColor = vec4(col, uParams.z);
}`;

// GPU-Instanced Particles: 0 = Drift Tire Smoke, 1 = Hydrant Water Geyser Spray, 2 = Sparks & Nitro Embers
export const CT_INST_VS = `#version 300 es
precision highp float;
precision highp int;
layout(location = 0) in vec3 aPos;
layout(location = 1) in vec2 aUV;
layout(location = 4) in vec4 iPosScale; // xyz: world pos, w: scale
layout(location = 5) in vec4 iRotKind;  // x: rot, y: stretchY, z: unused, w: kind (0=smoke, 1=water, 2=spark)
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

  float c = cos(iRotKind.x);
  float s = sin(iRotKind.x);
  vec2 p = vec2(aPos.x, aPos.y * max(0.35, iRotKind.y));
  vec2 rxy = vec2(p.x * c - p.y * s, p.x * s + p.y * c) * iPosScale.w;

  vec3 wp = iPosScale.xyz + camRight * rxy.x + camUp * rxy.y;
  gl_Position = uProj * uView * vec4(wp, 1.0);
}`;

export const CT_INST_FS = `#version 300 es
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
    // Soft Billowing Drift Tire Smoke
    if (r2 > 1.0) discard;
    float soft = (1.0 - r2) * (1.0 - r2);
    fragColor = vec4(vCol.rgb, vCol.a * soft);
  } else if (vKind < 1.5) {
    // Sparkling Fire Hydrant Cyan-White Water Geyser Droplet & Mist
    if (r2 > 1.0) discard;
    float core = exp(-r2 * 3.2);
    vec3 wCol = mix(vCol.rgb, vec3(1.0, 1.0, 1.0), core * 0.65);
    fragColor = vec4(wCol, vCol.a * (1.0 - r2));
  } else {
    // Hot Rim/Collision Sparks & Nitro Flame Embers
    float mask = max(abs(d.x) * 2.2, abs(d.y));
    if (mask > 0.95) discard;
    fragColor = vec4(vCol.rgb * 1.35, vCol.a * (1.0 - mask * 0.6));
  }
}`;

// Fullscreen Post-Processing: Anamorphic City Light Bloom + Radial Nitro Speed-Streaks + ACES Grade
export const CT_POST_VS = `#version 300 es
precision highp float;
precision highp int;
out vec2 vUV;
void main() {
  vec2 pos = vec2((gl_VertexID == 1) ? 3.0 : -1.0, (gl_VertexID == 2) ? 3.0 : -1.0);
  vUV = pos * 0.5 + 0.5;
  gl_Position = vec4(pos, 0.0, 1.0);
}`;

export const CT_POST_FS = `#version 300 es
precision highp float;
precision highp int;
in vec2 vUV;
uniform sampler2D uTex;
uniform vec2 uRes;
uniform float uTime;
uniform float uNitroBlur; // 0..1 radial speed-streak intensity on Nitro Boost / Jump
uniform float uBloomAmt;  // City bloom preset intensity
out vec4 fragColor;

void main() {
  vec2 uv = vUV;
  vec3 col = texture(uTex, uv).rgb;

  // Anamorphic Horizontal City-Lights Flare (Beacons, Headlights, Spires & Times Square)
  vec2 px = 1.0 / uRes;
  vec3 bL1 = texture(uTex, clamp(uv - vec2(px.x * 4.0, 0.0), vec2(0.002), vec2(0.998))).rgb;
  vec3 bR1 = texture(uTex, clamp(uv + vec2(px.x * 4.0, 0.0), vec2(0.002), vec2(0.998))).rgb;
  vec3 bU1 = texture(uTex, clamp(uv + vec2(0.0, px.y * 3.0), vec2(0.002), vec2(0.998))).rgb;
  vec3 bright = max(vec3(0.0), (bL1 + bR1 + bU1) * 0.333 - vec3(0.64));
  col += bright * vec3(1.0, 0.84, 0.52) * (0.65 * uBloomAmt);

  // Radial Speed-Streak Post-Processing during Nitro Surge (up to 195 KM/H!)
  if (uNitroBlur > 0.015) {
    vec2 dir = vec2(0.5, 0.46) - uv;
    float r = length(dir);
    float edge = smoothstep(0.14, 0.68, r);
    vec3 s1 = texture(uTex, clamp(uv + dir * 0.022 * uNitroBlur * edge, vec2(0.002), vec2(0.998))).rgb;
    vec3 s2 = texture(uTex, clamp(uv + dir * 0.044 * uNitroBlur * edge, vec2(0.002), vec2(0.998))).rgb;
    col = mix(col, (s1 + s2) * 0.5, edge * uNitroBlur * 0.56);
    // Subtle Hudson-cyan & saffron chromatic edge rush
    col += vec3(0.14, 0.56, 0.85) * edge * uNitroBlur * 0.08;
  }

  // Crisp New York Cinema ACES Filmic Tone Mapping
  col *= vec3(1.04, 1.01, 0.97);
  col = (col * (2.51 * col + 0.03)) / (col * (2.43 * col + 0.59) + 0.14);

  float vigDist = length((vUV - 0.5) * vec2(1.15, 1.0));
  float vig = 1.0 - smoothstep(0.52, 1.02, vigDist);
  col *= mix(0.74, 1.0, vig);

  fragColor = vec4(pow(max(col, vec3(0.0)), vec3(1.0 / 2.15)), 1.0);
}`;
