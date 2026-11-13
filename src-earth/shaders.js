// WebGL2 (#version 300 es) Shaders for Mirror Earth:
// Destructible Continent Sphere, Night City Lights, Rayleigh Atmosphere, Typhoon/Aurora/Storm Weather & ACES Post

export const EARTH_SKY_VS = `#version 300 es
precision highp float;
precision highp int;
layout(location = 0) in vec3 aPos;
uniform mat4 uProj;
uniform mat4 uView;
uniform vec3 uCamPos;
out vec3 vDir;
void main() {
  vDir = aPos;
  gl_Position = uProj * uView * vec4(uCamPos + aPos * 750.0, 1.0);
}`;

export const EARTH_SKY_FS = `#version 300 es
precision highp float;
precision highp int;
in vec3 vDir;
uniform vec3 uSunDir;
uniform float uTime;
out vec4 fragColor;

float hash31(vec3 p) {
  p = fract(p * vec3(443.897, 441.423, 437.195));
  p += dot(p, p.yzx + 19.19);
  return fract((p.x + p.y) * p.z);
}

void main() {
  vec3 d = normalize(vDir);

  // Deep Orbital Obsidian-Navy Space (Zero Purple)
  vec3 col = vec3(0.007, 0.018, 0.042);

  // Subtle Galactic Plane Band (Cool Telemetry Cyan-Slate & Warm Starlight Dust)
  float galPlane = exp(-abs(d.y * 0.65 - d.x * 0.55 + d.z * 0.25) * 4.8);
  col += vec3(0.016, 0.042, 0.072) * galPlane;

  // Crisp Multi-Scale Procedural Starfield
  vec3 starGrid = floor(d * 290.0);
  float h = hash31(starGrid);
  if (h > 0.986) {
    vec3 cellCenter = normalize(starGrid + 0.5);
    float dist = length(d - cellCenter) * 290.0;
    float twinkle = 0.72 + 0.28 * sin(uTime * 2.8 + h * 120.0);
    float bright = smoothstep(0.46, 0.04, dist) * twinkle;
    vec3 starTint = mix(vec3(0.72, 0.88, 1.0), vec3(1.0, 0.88, 0.64), fract(h * 73.1));
    col += starTint * bright * 1.15;
  }

  // Blazing Orbital Sun Disc & Golden-Azure Corona
  float cosSun = clamp(dot(d, normalize(uSunDir)), -1.0, 1.0);
  float ang = acos(cosSun);
  float sunDisc = 1.0 - smoothstep(0.032, 0.040, ang);
  float corona = exp(-ang * 9.5) * 0.75 + exp(-ang * 32.0) * 0.85;
  col += vec3(1.0, 0.78, 0.38) * corona;
  col = mix(col, vec3(1.0, 0.98, 0.90), sunDisc);

  fragColor = vec4(col, 1.0);
}`;

export const EARTH_PLANET_VS = `#version 300 es
precision highp float;
precision highp int;
layout(location = 0) in vec3 aPos;
layout(location = 1) in vec3 aNorm;
layout(location = 2) in vec3 aGeo; // x: elev, y: crater magma heat [0..1], z: aridity (>0) / genesis bio (<0)

uniform mat4 uProj;
uniform mat4 uView;

out vec3 vWorldPos;
out vec3 vNormal;
out vec3 vSphereDir;
out vec3 vGeo;

void main() {
  vWorldPos = aPos;
  vNormal = normalize(aNorm);
  vSphereDir = normalize(aPos);
  vGeo = aGeo;
  gl_Position = uProj * uView * vec4(aPos, 1.0);
}`;

export const EARTH_PLANET_FS = `#version 300 es
precision highp float;
precision highp int;

in vec3 vWorldPos;
in vec3 vNormal;
in vec3 vSphereDir;
in vec3 vGeo;

uniform vec3 uCamPos;
uniform vec3 uSunDir;
uniform float uTime;
uniform int uWeatherMode;
uniform vec4 uTargetRing; // xyz: surface unit dir, w: mode (0=off, 1=meteor amber, 2=terraform emerald)

out vec4 fragColor;

float hash31(vec3 p) {
  p = fract(p * vec3(127.1, 311.7, 74.7));
  p += dot(p, p.yzx + 19.19);
  return fract((p.x + p.y) * p.z);
}

float vnoise3(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  vec3 u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(
      mix(hash31(i), hash31(i + vec3(1, 0, 0)), u.x),
      mix(hash31(i + vec3(0, 1, 0)), hash31(i + vec3(1, 1, 0)), u.x),
      u.y
    ),
    mix(
      mix(hash31(i + vec3(0, 0, 1)), hash31(i + vec3(1, 0, 1)), u.x),
      mix(hash31(i + vec3(0, 1, 1)), hash31(i + vec3(1, 1, 1)), u.x),
      u.y
    ),
    u.z
  );
}

// Spherical metropolitan hub mask for Night-Side Golden City Lights
float cityHub(vec3 d, float latDeg, float lonDeg, float spread) {
  float lat = radians(latDeg);
  float lon = radians(lonDeg);
  vec3 c = vec3(cos(lat) * sin(lon), sin(lat), cos(lat) * cos(lon));
  float ang2 = max(0.0, 2.0 * (1.0 - dot(d, c)));
  return exp(-ang2 / (spread * spread));
}

float evalCityDensity(vec3 d) {
  float m = 0.0;
  // East Asia: Tokyo-Osaka, Beijing-Shanghai-Canton, Seoul
  m += cityHub(d, 35.6, 138.5, 0.085) * 1.25;
  m += cityHub(d, 32.5, 116.5, 0.145) * 1.20;
  m += cityHub(d, 23.2, 113.5, 0.075) * 1.05;
  m += cityHub(d, 37.5, 127.0, 0.065) * 1.00;
  // Europe & Nile: London-Paris-Ruhr-Milan, Madrid, Moscow, Cairo
  m += cityHub(d, 49.5, 5.5, 0.130) * 1.22;
  m += cityHub(d, 41.5, 13.5, 0.085) * 0.95;
  m += cityHub(d, 55.7, 37.6, 0.085) * 0.95;
  m += cityHub(d, 30.0, 31.2, 0.065) * 1.10;
  // North & South America: BosWash-Manhattan-Chicago, California, Mexico, Sao Paulo
  m += cityHub(d, 40.7, -76.5, 0.130) * 1.25;
  m += cityHub(d, 35.5, -119.0, 0.085) * 1.05;
  m += cityHub(d, 19.4, -99.1, 0.065) * 0.95;
  m += cityHub(d, -23.5, -46.6, 0.080) * 0.95;
  // India & Australia
  m += cityHub(d, 25.5, 78.5, 0.125) * 1.05;
  m += cityHub(d, -33.8, 151.2, 0.055) * 0.85;
  return clamp(m, 0.0, 1.35);
}

void main() {
  vec3 dir = normalize(vSphereDir);
  vec3 N = normalize(vNormal);
  vec3 V = normalize(uCamPos - vWorldPos);
  vec3 L = normalize(uSunDir);
  vec3 H = normalize(L + V);

  float elev = vGeo.x;
  float heat = clamp(vGeo.y, 0.0, 1.0);
  float bioParam = vGeo.z; // >0 aridity, <0 Genesis lushness
  float absLat = abs(dir.y);

  float fine = vnoise3(dir * 72.0);
  float micro = vnoise3(dir * 210.0);

  vec3 albedo;
  float specStrength = 0.08;
  float shininess = 18.0;

  bool isOcean = (elev <= 0.025 && heat < 0.08);
  if (isOcean) {
    // Ocean Bathymetry: Turquoise Continental Shelf -> Deep Sapphire Abyss
    float shelf = smoothstep(-0.52, 0.02, elev);
    vec3 deepSea = vec3(0.018, 0.105, 0.255);
    vec3 shallowCyan = vec3(0.045, 0.48, 0.66);
    albedo = mix(deepSea, shallowCyan, shelf * 0.85);

    // Subtle animated ocean swell normal ripple
    vec3 wavePerturb = vec3(
      sin(dir.x * 190.0 + uTime * 1.6),
      cos(dir.y * 190.0 - uTime * 1.3),
      sin(dir.z * 190.0 + uTime * 1.5)
    ) * 0.032;
    N = normalize(dir + wavePerturb);
    specStrength = 0.92;
    shininess = 68.0;

    // Polar Sea Ice Pack
    float seaIce = smoothstep(0.935, 0.975, absLat + (fine - 0.5) * 0.04);
    albedo = mix(albedo, vec3(0.84, 0.93, 0.98), seaIce);
    specStrength = mix(specStrength, 0.22, seaIce);
  } else {
    // Continental Biomes + Genesis Terraformed Emerald Islands!
    float aridity = clamp(bioParam, 0.0, 1.0);
    float genesis = clamp(-bioParam, 0.0, 1.0);

    vec3 coastalGreen = vec3(0.09, 0.36, 0.18);
    vec3 borealForest = vec3(0.07, 0.25, 0.16);
    vec3 goldenDesert = vec3(0.76, 0.58, 0.32);
    vec3 genesisLush  = vec3(0.10, 0.62, 0.37);
    vec3 alpineRock   = vec3(0.35, 0.34, 0.32);
    vec3 snowPeak     = vec3(0.93, 0.97, 1.00);

    vec3 veg = mix(coastalGreen, borealForest, smoothstep(0.35, 0.78, absLat));
    vec3 landCol = mix(veg, goldenDesert, smoothstep(0.28, 0.78, aridity));
    landCol = mix(landCol, genesisLush, genesis * 0.82);
    landCol *= (0.86 + 0.28 * fine);

    // Beach shoreline rim
    float beach = 1.0 - smoothstep(0.025, 0.11, elev);
    landCol = mix(landCol, vec3(0.78, 0.70, 0.48), beach * 0.48 * (1.0 - absLat));

    // Alpine rock & high snowline (Everest, Andes, Alps, Antarctica, Greenland)
    float rockMask = smoothstep(0.75, 1.55, elev);
    landCol = mix(landCol, alpineRock * (0.85 + 0.3 * micro), rockMask);

    float snowLine = smoothstep(1.42, 2.05, elev + absLat * 1.48 + (fine - 0.5) * 0.22);
    albedo = mix(landCol, snowPeak, snowLine);
    specStrength = mix(0.06, 0.28, snowLine);
    shininess = 22.0;
  }

  // Scorched Basalt & Molten Crater Rim where Meteors Impacted!
  if (heat > 0.04) {
    float scorch = smoothstep(0.04, 0.35, heat);
    albedo = mix(albedo, vec3(0.09, 0.08, 0.07), scorch * 0.92);
    specStrength *= (1.0 - scorch * 0.8);
  }

  // Day / Twilight / Night Solar Illumination
  float ndl = dot(N, L);
  float sphereSun = dot(dir, L);
  float dayFactor = smoothstep(-0.08, 0.18, ndl);
  float twilight = exp(-pow((sphereSun - 0.02) * 7.5, 2.0));

  vec3 sunLight = vec3(1.06, 0.98, 0.90) * max(ndl, 0.0);
  vec3 sunsetBounce = vec3(0.96, 0.44, 0.12) * twilight * max(ndl + 0.22, 0.0) * 0.75;
  vec3 nightAmbient = vec3(0.016, 0.036, 0.068);

  vec3 col = albedo * (nightAmbient + sunLight + sunsetBounce);

  // Solar Ocean Specular Glint
  float spec = pow(max(dot(N, H), 0.0), shininess) * specStrength * dayFactor;
  col += mix(vec3(1.0, 0.92, 0.74), vec3(1.0, 0.62, 0.24), twilight) * spec;

  // Night-Side Golden City-Light Clusters across East Asia, Europe & North America!
  float nightMask = 1.0 - smoothstep(-0.14, 0.09, sphereSun);
  if (nightMask > 0.01 && !isOcean && elev < 1.55 && heat < 0.25) {
    float hub = evalCityDensity(dir);
    float genesisTowns = clamp(-bioParam, 0.0, 1.0) * 0.55;
    float urban = max(hub, genesisTowns);
    if (urban > 0.04) {
      float web = smoothstep(0.44, 0.78, vnoise3(dir * 95.0));
      float nodes = smoothstep(0.56, 0.90, micro);
      float lights = urban * (web * 0.65 + nodes * 0.85);
      vec3 cityCol = mix(vec3(1.0, 0.68, 0.22), vec3(0.38, 0.85, 0.96), clamp(-bioParam, 0.0, 1.0) * 0.5);
      col += cityCol * lights * nightMask * 1.45;
    }
  }

  // Incandescent Molten Lava Veins inside Carved Impact Craters!
  if (heat > 0.08) {
    float lavaVein = smoothstep(0.28, 0.82, vnoise3(dir * 64.0 + vec3(0.0, uTime * 0.25, 0.0)));
    float coreGlow = smoothstep(0.12, 0.85, heat) * (0.45 + 0.75 * lavaVein);
    vec3 magmaCol = mix(vec3(0.98, 0.28, 0.04), vec3(1.0, 0.84, 0.24), clamp(heat * lavaVein, 0.0, 1.0));
    col += magmaCol * coreGlow * 2.1;
  }

  // Subtle Day-Side Rayleigh Horizon Aerial Perspective on Surface
  float fresnel = pow(1.0 - max(dot(dir, V), 0.0), 3.2);
  float atmoSun = smoothstep(-0.18, 0.35, sphereSun);
  col += mix(vec3(0.95, 0.45, 0.12), vec3(0.18, 0.62, 0.98), smoothstep(0.0, 0.32, sphereSun)) * fresnel * atmoSun * 0.34;

  // Live 3D Orbital Targeting Reticle Projected onto Planet Surface!
  if (uTargetRing.w > 0.5) {
    float cosT = clamp(dot(dir, normalize(uTargetRing.xyz)), -1.0, 1.0);
    float angT = acos(cosT);
    float ringOuter = smoothstep(0.068, 0.060, angT) * smoothstep(0.048, 0.056, angT);
    float ringInner = smoothstep(0.015, 0.008, angT);
    float pulse = 0.7 + 0.3 * sin(uTime * 7.0);
    vec3 tCol = (uTargetRing.w < 1.5) ? vec3(0.98, 0.45, 0.09) : vec3(0.20, 0.83, 0.60);
    col += tCol * (ringOuter + ringInner * 0.85) * pulse * 1.15;
  }

  fragColor = vec4(col, 1.0);
}`;

export const EARTH_CLOUD_VS = `#version 300 es
precision highp float;
precision highp int;
layout(location = 0) in vec3 aPos;
uniform mat4 uProj;
uniform mat4 uView;
uniform float uRadius;
out vec3 vDir;
out vec3 vWorldPos;
void main() {
  vDir = normalize(aPos);
  vWorldPos = vDir * uRadius;
  gl_Position = uProj * uView * vec4(vWorldPos, 1.0);
}`;

export const EARTH_CLOUD_FS = `#version 300 es
precision highp float;
precision highp int;
in vec3 vDir;
in vec3 vWorldPos;

uniform vec3 uCamPos;
uniform vec3 uSunDir;
uniform float uTime;
uniform int uWeatherMode; // 0:ClearSync, 1:SuperTyphoon, 2:AuroraClear, 3:GlobalThunderstorm

out vec4 fragColor;

float hash31(vec3 p) {
  p = fract(p * vec3(127.1, 311.7, 74.7));
  p += dot(p, p.yzx + 19.19);
  return fract((p.x + p.y) * p.z);
}

float vnoise3(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  vec3 u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(
      mix(hash31(i), hash31(i + vec3(1, 0, 0)), u.x),
      mix(hash31(i + vec3(0, 1, 0)), hash31(i + vec3(1, 1, 0)), u.x),
      u.y
    ),
    mix(
      mix(hash31(i + vec3(0, 0, 1)), hash31(i + vec3(1, 0, 1)), u.x),
      mix(hash31(i + vec3(0, 1, 1)), hash31(i + vec3(1, 1, 1)), u.x),
      u.y
    ),
    u.z
  );
}

float fbmCloud(vec3 p) {
  float v = 0.0;
  float a = 0.52;
  for (int i = 0; i < 4; i++) {
    v += a * vnoise3(p);
    p = p * 2.06 + vec3(1.3, -0.9, 0.7);
    a *= 0.48;
  }
  return v;
}

void main() {
  vec3 d = normalize(vDir);
  vec3 L = normalize(uSunDir);

  // Trade-wind zonal flow
  float rot = uTime * 0.018;
  float cs = cos(rot), sn = sin(rot);
  vec3 flowDir = vec3(d.x * cs + d.z * sn, d.y, -d.x * sn + d.z * cs);

  float baseCloud = fbmCloud(flowDir * 5.8 + vec3(0.0, uTime * 0.01, 0.0));
  float detail = fbmCloud(flowDir * 14.5 - vec3(uTime * 0.02, 0.0, 0.0));
  float density = smoothstep(0.50, 0.80, baseCloud * 0.72 + detail * 0.34);

  if (uWeatherMode == 0) {
    density *= 0.62;
  } else if (uWeatherMode == 2) {
    // Crisp polar skies so Aurora Borealis curtains shine vividly
    density *= 0.38 * (1.0 - smoothstep(0.55, 0.85, abs(d.y)));
  } else if (uWeatherMode == 1) {
    // Super Typhoon Vortex centered in Western Pacific (21°N, 132°E)!
    float tLat = radians(21.0);
    float tLon = radians(132.0);
    vec3 eyeCenter = vec3(cos(tLat) * sin(tLon), sin(tLat), cos(tLat) * cos(tLon));
    vec3 east = normalize(cross(vec3(0.0, 1.0, 0.0), eyeCenter));
    vec3 north = cross(eyeCenter, east);
    vec2 local = vec2(dot(d - eyeCenter, east), dot(d - eyeCenter, north));
    float r = length(local);
    if (r < 0.46) {
      float theta = atan(local.y, local.x) + uTime * 0.85 - log(max(r, 0.018)) * 3.8;
      float spiralArms = 0.5 + 0.5 * sin(theta * 4.0 + detail * 4.5);
      float eyeWall = smoothstep(0.024, 0.058, r) * (1.0 - smoothstep(0.24, 0.45, r));
      float cyclone = eyeWall * (0.62 + 0.38 * spiralArms);
      // Clear calm eye right at r < 0.028!
      density = mix(density * 0.75, cyclone * 1.15, smoothstep(0.45, 0.12, r));
      density *= smoothstep(0.018, 0.036, r);
    }
  } else if (uWeatherMode == 3) {
    // Global Thunderstorm Anvil Deck
    density = smoothstep(0.40, 0.74, baseCloud * 0.70 + detail * 0.38) * 0.92;
  }

  if (density < 0.015) discard;

  float sunDot = dot(d, L);
  float day = smoothstep(-0.14, 0.24, sunDot);
  float sunset = exp(-pow((sunDot - 0.01) * 6.5, 2.0));

  vec3 dayCloud = vec3(0.96, 0.98, 1.0);
  vec3 sunsetCloud = vec3(1.0, 0.56, 0.22);
  vec3 nightCloud = vec3(0.03, 0.06, 0.11);
  if (uWeatherMode == 3) {
    dayCloud = vec3(0.68, 0.76, 0.84);
  }

  vec3 col = mix(nightCloud, dayCloud, day);
  col = mix(col, sunsetCloud, sunset * 0.65);

  // Sheet Lightning Flashes inside Global Thunderstorm Cells!
  if (uWeatherMode == 3) {
    vec3 cell = floor(flowDir * 7.5);
    float cellHash = hash31(cell);
    float wave = sin(uTime * 16.0 + cellHash * 62.8) * sin(uTime * 5.3 + cellHash * 31.4);
    float flash = smoothstep(0.91, 0.995, wave) * step(0.55, density);
    vec3 boltCol = mix(vec3(0.45, 0.86, 1.0), vec3(1.0, 0.84, 0.42), fract(cellHash * 17.3));
    col += boltCol * flash * 2.8;
  }

  // Fade gently when camera flies right through the cloud layer
  float camDist = length(uCamPos - vWorldPos);
  float nearFade = smoothstep(0.8, 3.8, camDist);
  float alpha = clamp(density * 0.86 * nearFade, 0.0, 0.92);

  fragColor = vec4(col, alpha);
}`;

export const EARTH_ATMO_VS = `#version 300 es
precision highp float;
precision highp int;
layout(location = 0) in vec3 aPos;
uniform mat4 uProj;
uniform mat4 uView;
uniform float uRadius;
out vec3 vWorldPos;
void main() {
  vWorldPos = normalize(aPos) * uRadius;
  gl_Position = uProj * uView * vec4(vWorldPos, 1.0);
}`;

export const EARTH_ATMO_FS = `#version 300 es
precision highp float;
precision highp int;
in vec3 vWorldPos;

uniform vec3 uCamPos;
uniform vec3 uSunDir;
uniform float uTime;
uniform float uPlanetR;
uniform float uAtmoR;
uniform int uWeatherMode;

out vec4 fragColor;

vec2 raySphere(vec3 ro, vec3 rd, float rad) {
  float b = dot(ro, rd);
  float c = dot(ro, ro) - rad * rad;
  float h = b * b - c;
  if (h < 0.0) return vec2(1e5, -1e5);
  h = sqrt(h);
  return vec2(-b - h, -b + h);
}

void main() {
  vec3 rayVec = vWorldPos - uCamPos;
  float farDist = length(rayVec);
  vec3 rd = rayVec / max(farDist, 0.0001);

  vec2 atmoHit = raySphere(uCamPos, rd, uAtmoR);
  float tStart = max(0.0, atmoHit.x);
  float tEnd = min(farDist, atmoHit.y);

  // Stop ray at solid planet sphere if occluded
  vec2 planetHit = raySphere(uCamPos, rd, uPlanetR);
  bool hitsPlanet = (planetHit.x > 0.0 && planetHit.x < tEnd);
  if (hitsPlanet) {
    tEnd = min(tEnd, planetHit.x);
  }

  float pathLen = max(0.0, tEnd - tStart);
  if (pathLen <= 0.001) discard;

  vec3 samplePos = uCamPos + rd * ((tStart + tEnd) * 0.5);
  vec3 upDir = normalize(samplePos);
  float altNorm = clamp((length(samplePos) - uPlanetR) / (uAtmoR - uPlanetR), 0.0, 1.0);
  float density = exp(-altNorm * 3.2) * clamp(pathLen / 16.5, 0.0, 1.35);

  vec3 L = normalize(uSunDir);
  float sunAngle = dot(upDir, L);
  float day = smoothstep(-0.24, 0.32, sunAngle);
  float twilight = exp(-pow((sunAngle + 0.03) * 5.2, 2.0));
  float forwardMie = pow(max(dot(rd, L), 0.0), 6.0) * 0.45;

  // Pure Orbital Telemetry Azure & Sunset Amber (Zero Purple!)
  vec3 rayleighBlue = vec3(0.14, 0.58, 0.98);
  vec3 sunsetGold   = vec3(0.98, 0.48, 0.14);
  vec3 col = mix(sunsetGold * 0.55, rayleighBlue, smoothstep(-0.08, 0.28, sunAngle));
  col += sunsetGold * (twilight * 0.55 + forwardMie * day);
  float alpha = density * (0.10 + 0.72 * day + 0.35 * twilight);

  // Polar Emerald-Gold Aurora Borealis & Australis Curtains!
  float polarLat = abs(upDir.y);
  float auroraOval = smoothstep(0.74, 0.86, polarLat) * (1.0 - smoothstep(0.95, 0.995, polarLat));
  float auroraBoost = (uWeatherMode == 2) ? 1.85 : 0.48;
  if (auroraOval > 0.01) {
    float az = atan(upDir.x, upDir.z);
    float curtain1 = sin(az * 14.0 + uTime * 1.35 + sin(az * 5.0 - uTime * 0.7) * 2.2) * 0.5 + 0.5;
    float curtain2 = sin(az * 23.0 - uTime * 1.9 + polarLat * 18.0) * 0.5 + 0.5;
    float rays = pow(curtain1 * 0.65 + curtain2 * 0.35, 2.2);
    float verticalBand = exp(-pow((altNorm - 0.38) * 3.4, 2.0));
    float nightBoost = (uWeatherMode == 2) ? 1.0 : (1.0 - day * 0.65);

    // Vivid Biosphere Emerald (#34d399) -> Solar Gold (#fbbf24) Aurora!
    vec3 auroraCol = mix(vec3(0.12, 0.92, 0.56), vec3(0.98, 0.80, 0.22), smoothstep(0.25, 0.78, altNorm));
    float aurAmt = auroraOval * rays * verticalBand * auroraBoost * nightBoost;
    col += auroraCol * aurAmt * 1.55;
    alpha = max(alpha, aurAmt * 0.72);
  }

  // Soften direct surface tint so continents remain crystal clear when viewed straight down
  if (hitsPlanet) {
    alpha *= 0.46;
  }

  fragColor = vec4(col, clamp(alpha, 0.0, 0.88));
}`;

export const EARTH_PROP_VS = `#version 300 es
precision highp float;
precision highp int;
layout(location = 0) in vec3 aPos;
layout(location = 1) in vec3 aNorm;

uniform mat4 uProj;
uniform mat4 uView;
uniform mat4 uModel;

out vec3 vWorldPos;
out vec3 vNormal;

void main() {
  vec4 wp = uModel * vec4(aPos, 1.0);
  vWorldPos = wp.xyz;
  vNormal = normalize(mat3(uModel) * aNorm);
  gl_Position = uProj * uView * wp;
}`;

export const EARTH_PROP_FS = `#version 300 es
precision highp float;
precision highp int;
in vec3 vWorldPos;
in vec3 vNormal;

uniform vec3 uCamPos;
uniform vec3 uSunDir;
uniform vec3 uColor;
uniform vec3 uParams; // x: metallic/glow, y: emissiveFlag (0=lit, 1=emissive), z: alpha

out vec4 fragColor;

void main() {
  if (uParams.y > 0.5) {
    fragColor = vec4(uColor * uParams.x, uParams.z);
    return;
  }

  vec3 N = normalize(vNormal);
  vec3 V = normalize(uCamPos - vWorldPos);
  vec3 L = normalize(uSunDir);
  vec3 H = normalize(L + V);

  vec3 upPlanet = normalize(vWorldPos);
  float sunHorizon = smoothstep(-0.22, 0.25, dot(upPlanet, L));
  float ndl = max(dot(N, L), 0.0) * (0.25 + 0.75 * sunHorizon);
  float spec = pow(max(dot(N, H), 0.0), 36.0) * uParams.x;
  float rim = pow(1.0 - max(dot(N, V), 0.0), 2.8);

  vec3 amb = mix(vec3(0.08, 0.14, 0.22), vec3(0.22, 0.30, 0.40), sunHorizon);
  vec3 col = uColor * (amb + vec3(1.05, 0.98, 0.88) * ndl);
  col += vec3(0.75, 0.92, 1.0) * spec + vec3(0.22, 0.74, 0.98) * rim * 0.26;

  fragColor = vec4(col, uParams.z);
}`;

export const EARTH_INST_VS = `#version 300 es
precision highp float;
precision highp int;
layout(location = 0) in vec3 aPos;
layout(location = 1) in vec2 aUV;
layout(location = 4) in vec4 iPosScale; // xyz: world pos, w: scale
layout(location = 5) in vec4 iRotKind;  // x: rot, y: stretch, z: unused, w: kind (0=glowOrb, 1=rockShard)
layout(location = 6) in vec4 iColor;

uniform mat4 uProj;
uniform mat4 uView;

out vec2 vUV;
out vec4 vCol;
out float vKind;

void main() {
  vec3 right = vec3(uView[0][0], uView[1][0], uView[2][0]);
  vec3 up    = vec3(uView[0][1], uView[1][1], uView[2][1]);
  float c = cos(iRotKind.x);
  float s = sin(iRotKind.x);
  vec2 p = vec2(aPos.x * c - aPos.y * s, aPos.x * s + aPos.y * c);
  p.y *= iRotKind.y;
  vec3 wp = iPosScale.xyz + (right * p.x + up * p.y) * iPosScale.w;
  vUV = aUV;
  vCol = iColor;
  vKind = iRotKind.w;
  gl_Position = uProj * uView * vec4(wp, 1.0);
}`;

export const EARTH_INST_FS = `#version 300 es
precision highp float;
precision highp int;
in vec2 vUV;
in vec4 vCol;
in float vKind;
out vec4 fragColor;

void main() {
  vec2 p = vUV * 2.0 - 1.0;
  float r2 = dot(p, p);
  if (vKind > 0.5) {
    // Sharp angular tectonic rock shard
    float d = abs(p.x) * 0.85 + abs(p.y) * 1.15;
    if (d > 0.95) discard;
    fragColor = vec4(vCol.rgb * (1.2 - d * 0.4), vCol.a);
    return;
  }
  if (r2 > 1.0) discard;
  float soft = pow(1.0 - r2, 1.8);
  fragColor = vec4(vCol.rgb * (0.85 + 0.55 * soft), vCol.a * soft);
}`;

export const EARTH_POST_VS = `#version 300 es
precision highp float;
precision highp int;
out vec2 vUV;
void main() {
  vec2 pos = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  vUV = pos;
  gl_Position = vec4(pos * 2.0 - 1.0, 0.0, 1.0);
}`;

export const EARTH_POST_FS = `#version 300 es
precision highp float;
precision highp int;
in vec2 vUV;
uniform sampler2D uTex;
uniform vec2 uRes;
uniform float uBoostAmt;
uniform float uImpactFlash;
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
  float r2 = dot(centered, centered);

  // Subtle Supersonic Mach Radial Streaking on Boost
  vec3 hdr = texture(uTex, vUV).rgb;
  if (uBoostAmt > 0.02) {
    vec2 dir = centered * (0.016 * uBoostAmt);
    hdr = hdr * 0.52
        + texture(uTex, clamp(vUV - dir, 0.002, 0.998)).rgb * 0.28
        + texture(uTex, clamp(vUV - dir * 2.0, 0.002, 0.998)).rgb * 0.20;
  }

  // Soft Orbital Glow Halo Sampling
  vec2 px = 1.6 / max(uRes, vec2(1.0));
  vec3 b1 = texture(uTex, clamp(vUV + vec2(px.x, px.y), 0.001, 0.999)).rgb;
  vec3 b2 = texture(uTex, clamp(vUV + vec2(-px.x, px.y), 0.001, 0.999)).rgb;
  vec3 b3 = texture(uTex, clamp(vUV + vec2(px.x, -px.y), 0.001, 0.999)).rgb;
  vec3 b4 = texture(uTex, clamp(vUV + vec2(-px.x, -px.y), 0.001, 0.999)).rgb;
  vec3 avg = (b1 + b2 + b3 + b4) * 0.25;
  hdr += max(avg - vec3(0.62), vec3(0.0)) * 0.36;

  // Brief Tectonic Meteor Flash
  hdr += vec3(1.0, 0.58, 0.18) * uImpactFlash * 0.32;

  vec3 ldr = acesFilm(hdr * 1.08);
  ldr = pow(ldr, vec3(1.0 / 2.2));

  // Subtle Deep-Space Vignette
  ldr *= (1.0 - r2 * 0.28);

  fragColor = vec4(ldr, 1.0);
}`;
