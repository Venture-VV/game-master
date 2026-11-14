// Raw WebGL2 (#version 300 es) Shaders for 3D Tactile Planner
// Every shader declares BOTH precision highp float; and precision highp int;
// Warm Artisanal Palette: Cotton Cream, Walnut, Brass, Terracotta, Matcha, Sky & Espresso.

const GLSL_COMMON_MATH = `
const float PAGE_W = 4.10;
const float PAGE_H = 5.60;
const float SPINE_Y = 0.31;
const float PI = 3.14159265359;

float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float noise2D(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = hash21(i);
  float b = hash21(i + vec2(1.0, 0.0));
  float c = hash21(i + vec2(0.0, 1.0));
  float d = hash21(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

float fbm2(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  mat2 rot = mat2(0.80, -0.60, 0.60, 0.80);
  for (int i = 0; i < 4; i++) {
    v += a * noise2D(p);
    p = rot * p * 2.03 + vec2(17.1, 31.7);
    a *= 0.5;
  }
  return v;
}

// Warm afternoon window-blind sunbeam pattern ("god-rays" dappled slats across desk & pages)
float windowSunMask(vec3 wp, float time) {
  vec2 proj = wp.xz - wp.y * vec2(0.68, 0.42);
  float rotCoord = proj.x * 0.62 + proj.y * 0.78 + sin(time * 0.28) * 0.06;
  float blinds = smoothstep(-0.22, 0.28, sin(rotCoord * 2.55));
  float leafDapple = smoothstep(0.30, 0.72, noise2D(proj * 0.55 + vec2(time * 0.05, -time * 0.03)));
  float windowFrame = smoothstep(10.5, 4.2, length(proj * vec2(0.75, 0.95) - vec2(0.4, -0.3)));
  return blinds * (0.62 + 0.38 * leafDapple) * windowFrame;
}
`;

const GLSL_DEFORM_PAGE = `
const float PAGE_W = 4.10;
const float PAGE_H = 5.60;
const float SPINE_Y = 0.31;
const float PI = 3.14159265359;

void deformPageVertex(
  in float u,
  in float v,
  in float turnProgress,
  in float spineLift,
  out vec3 outPos,
  out vec3 outNormal,
  out vec3 outTanU,
  out vec3 outTanV
) {
  float p = clamp(turnProgress, 0.0, 1.0);
  float turnBell = sin(p * PI);
  float pLocal = clamp(p + (v - 0.5) * 0.12 * turnBell, 0.0, 1.0);
  float sP = pLocal * pLocal * (3.0 - 2.0 * pLocal);

  float rawA = mix(0.16, PI - 0.16, sP);
  float a = rawA + (PI * 0.5 - rawA) * (0.20 * turnBell);
  float b = mix(-0.26, 0.26, sP) + 0.72 * sin(pLocal * PI * 2.0);
  float yBase = SPINE_Y + spineLift + 0.025 * turnBell;

  float x;
  float y;
  if (abs(b) < 0.0001) {
    x = PAGE_W * u * cos(a);
    y = yBase + PAGE_W * u * sin(a);
  } else {
    float th = a + b * u;
    x = PAGE_W * (sin(th) - sin(a)) / b;
    y = yBase + PAGE_W * (-cos(th) + cos(a)) / b;
  }
  float z = (v - 0.5) * PAGE_H;

  float thU = a + b * u;
  vec3 tanU = vec3(cos(thU), sin(thU), 0.0);

  float eps = 0.01;
  float v2 = clamp(v + eps, 0.0, 1.0);
  float pLocal2 = clamp(p + (v2 - 0.5) * 0.12 * turnBell, 0.0, 1.0);
  float sP2 = pLocal2 * pLocal2 * (3.0 - 2.0 * pLocal2);
  float rawA2 = mix(0.16, PI - 0.16, sP2);
  float a2 = rawA2 + (PI * 0.5 - rawA2) * (0.20 * turnBell);
  float b2 = mix(-0.26, 0.26, sP2) + 0.72 * sin(pLocal2 * PI * 2.0);

  float x2;
  float y2;
  if (abs(b2) < 0.0001) {
    x2 = PAGE_W * u * cos(a2);
    y2 = yBase + PAGE_W * u * sin(a2);
  } else {
    float th2 = a2 + b2 * u;
    x2 = PAGE_W * (sin(th2) - sin(a2)) / b2;
    y2 = yBase + PAGE_W * (-cos(th2) + cos(a2)) / b2;
  }
  float dvScale = (v + eps <= 1.0) ? (1.0 / eps) : 1.0;
  vec3 tanV = normalize(vec3((x2 - x) * dvScale, (y2 - y) * dvScale, PAGE_H));
  vec3 nrm = normalize(cross(tanV, tanU));

  outPos = vec3(x, y, z);
  outNormal = nrm;
  outTanU = tanU;
  outTanV = tanV;
}
`;

// 1. WALNUT CRAFT DESK, LEATHER MAT, HARDCOVER BINDING, MUG & FOUNTAIN PEN SHADER
export const DESK_PROP_VS = `#version 300 es
precision highp float;
precision highp int;

layout(location = 0) in vec3 aPos;
layout(location = 1) in vec3 aNormal;
layout(location = 2) in vec3 aColor;
layout(location = 3) in vec2 aUV;

uniform mat4 uProj;
uniform mat4 uView;
uniform mat4 uModel;

out vec3 vWorldPos;
out vec3 vNormal;
out vec3 vColor;
out vec2 vUV;
out vec3 vLocalPos;

void main() {
  vec4 wp = uModel * vec4(aPos, 1.0);
  vWorldPos = wp.xyz;
  vLocalPos = aPos;
  mat3 nMat = mat3(uModel);
  vNormal = normalize(nMat * aNormal);
  vColor = aColor;
  vUV = aUV;
  gl_Position = uProj * uView * wp;
}
`;

export const DESK_PROP_FS = `#version 300 es
precision highp float;
precision highp int;

in vec3 vWorldPos;
in vec3 vNormal;
in vec3 vColor;
in vec2 vUV;
in vec3 vLocalPos;

uniform vec3 uCamPos;
uniform vec3 uSunDir;
uniform float uTime;
uniform int uMatType;

out vec4 fragColor;

${GLSL_COMMON_MATH}

float sdBox2D(vec2 p, vec2 b) {
  vec2 d = abs(p) - b;
  return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0);
}

void main() {
  vec3 N = normalize(vNormal);
  vec3 V = normalize(uCamPos - vWorldPos);
  vec3 L = normalize(uSunDir);
  vec3 H = normalize(L + V);

  vec3 baseCol = vColor;
  float rough = 0.55;
  float metallic = 0.0;
  float ao = 1.0;

  if (uMatType == 0) {
    // Sunlit Walnut Craft Desk with growth rings, timber pores & contact shadows
    vec2 wp = vWorldPos.xz;
    float plankId = floor((wp.y + 12.0) * 0.42);
    vec2 gUv = vec2(wp.x * 0.36 + plankId * 3.7, wp.y * 1.65);
    float warp = fbm2(gUv * 0.85) * 2.6;
    float rings = sin((gUv.y + warp) * 7.5) * 0.5 + 0.5;
    rings = pow(rings, 1.6);
    float finePore = noise2D(vec2(wp.x * 24.0, wp.y * 5.5));

    vec3 darkWalnut = vec3(0.185, 0.106, 0.062);
    vec3 midWalnut  = vec3(0.290, 0.180, 0.106); // #4a2e1b
    vec3 honeyGrain = vec3(0.435, 0.275, 0.155);
    baseCol = mix(darkWalnut, midWalnut, rings);
    baseCol = mix(baseCol, honeyGrain, smoothstep(0.65, 0.98, rings) * 0.55);
    baseCol *= (0.91 + 0.14 * finePore);

    // Subtle plank seam groove
    float seam = abs(fract((wp.y + 12.0) * 0.42) - 0.5);
    float seamMask = smoothstep(0.492, 0.50, seam);
    baseCol *= (1.0 - 0.35 * seamMask);
    rough = mix(0.36, 0.52, finePore);

    // Desk contact AO under leather mat & mug coaster
    float matDist = sdBox2D(wp - vec2(0.0, 0.10), vec2(7.65, 4.95));
    ao *= mix(0.45, 1.0, smoothstep(-0.15, 0.55, matDist));
    float mugDist = length(wp - vec2(-6.15, -2.25)) - 1.05;
    ao *= mix(0.50, 1.0, smoothstep(-0.15, 0.45, mugDist));
  } else if (uMatType == 1) {
    // Stitched Saddle-Leather Desk Mat
    vec2 wp = vWorldPos.xz;
    float pebble = noise2D(wp * 32.0) * 0.5 + noise2D(wp * 64.0) * 0.5;
    baseCol = vColor * (0.92 + 0.15 * pebble);
    N = normalize(N + vec3((pebble - 0.5) * 0.08, 0.0, (pebble - 0.5) * 0.08));
    rough = 0.62;

    // Perimeter cream saddle-stitching dashes
    vec2 rel = abs(wp - vec2(0.0, 0.10));
    float borderDist = abs(max(rel.x - 7.36, rel.y - 4.66));
    float insideMat = step(rel.x, 7.42) * step(rel.y, 4.72);
    float along = (rel.x - 7.36 > rel.y - 4.66) ? wp.y : wp.x;
    float dash = step(0.42, fract(along * 3.6));
    float stitch = (1.0 - smoothstep(0.018, 0.036, borderDist)) * dash * insideMat;
    baseCol = mix(baseCol, vec3(0.95, 0.88, 0.74), stitch * 0.88);

    // Planner, mug, washi & pen rest soft AO on mat
    float bookDist = sdBox2D(wp, vec2(4.42, 3.02));
    ao *= mix(0.32, 1.0, smoothstep(-0.10, 0.55, bookDist));
    float mugD = length(wp - vec2(-6.15, -2.25)) - 0.92;
    ao *= mix(0.48, 1.0, smoothstep(-0.10, 0.35, mugD));
    float washiD = length(wp - vec2(5.85, -2.35)) - 0.68;
    ao *= mix(0.55, 1.0, smoothstep(-0.08, 0.30, washiD));
  } else if (uMatType == 2) {
    // Linen Cloth Hardcover Bookbinding
    vec2 weaveUV = vWorldPos.xz * 38.0;
    float wx = sin(weaveUV.x) * 0.5 + 0.5;
    float wy = sin(weaveUV.y) * 0.5 + 0.5;
    float linen = mix(wx, wy, 0.5) * 0.14 + noise2D(weaveUV * 0.35) * 0.08;
    baseCol = vColor * (0.90 + linen);
    rough = 0.76;
    // Gold foil debossed border line near hardcover edge
    vec2 bRel = abs(vWorldPos.xz);
    float foilLine = 1.0 - smoothstep(0.015, 0.035, abs(max(bRel.x - 4.24, bRel.y - 2.88)));
    if (vWorldPos.y > 0.11 && bRel.x > 0.4) {
      baseCol = mix(baseCol, vec3(0.910, 0.659, 0.161), foilLine * 0.65);
      metallic = max(metallic, foilLine * 0.6);
    }
  } else if (uMatType == 3) {
    // Stacked Cream Paper Block Edges (200 fine horizontal page sheets + gilt sheen)
    float sheets = sin(vWorldPos.y * 260.0) * 0.5 + 0.5;
    float grain = noise2D(vec2(vWorldPos.x + vWorldPos.z, vWorldPos.y * 18.0) * 6.0);
    baseCol = vColor * (0.93 + 0.07 * sheets) * (0.96 + 0.06 * grain);
    rough = 0.68;
  } else if (uMatType == 4) {
    // Polished 18k Brass / Gold Nib, Corner Protectors & Binder Clip
    float brush = noise2D(vWorldPos.xz * 45.0 + vWorldPos.y * 25.0);
    baseCol = vColor * (0.95 + 0.10 * brush);
    rough = 0.20;
    metallic = 0.88;
  } else {
    // Ceramic Coffee Mug, Washi Tape, Terracotta Ribbon & Lacquer Pen Barrel
    if (vUV.y > 0.88) {
      // Glossy dark espresso liquid inside the ceramic mug with concentric crema ring!
      float r = vUV.x;
      float ripple = sin(r * 22.0 - uTime * 2.2) * 0.015;
      vec3 espresso = vec3(0.085, 0.048, 0.028);
      vec3 crema = vec3(0.76, 0.48, 0.22);
      baseCol = mix(espresso, crema, smoothstep(0.62, 0.95, r + ripple) * 0.78);
      rough = 0.08;
    } else if (vUV.y > 0.60 && vUV.y <= 0.88) {
      // Striped / patterned Washi Tape roll
      float stripe = step(0.48, fract((vUV.x * 9.0 + vWorldPos.y * 4.5)));
      baseCol = mix(vColor, vec3(0.984, 0.965, 0.925), stripe * 0.38);
      rough = 0.48;
    } else {
      float micro = noise2D(vWorldPos.xz * 18.0 + vWorldPos.y * 18.0);
      baseCol = vColor * (0.96 + 0.07 * micro);
      rough = 0.26;
    }
  }

  float sunSlats = windowSunMask(vWorldPos, uTime);
  float ndl = max(dot(N, L), 0.0);
  float sunLight = ndl * (0.42 + 0.88 * sunSlats);

  // Warm sky bounce + desk bounce
  vec3 hemiAmb = mix(vec3(0.24, 0.17, 0.12), vec3(0.56, 0.49, 0.40), N.y * 0.5 + 0.5);
  vec3 sunCol = vec3(1.06, 0.93, 0.74);

  float specPow = mix(128.0, 10.0, rough);
  float spec = pow(max(dot(N, H), 0.0), specPow) * mix(0.06, 1.15, 1.0 - rough);
  vec3 specTint = mix(vec3(1.0, 0.97, 0.90), baseCol, metallic);

  vec3 diffuse = baseCol * (1.0 - metallic * 0.68);
  vec3 col = (diffuse * (hemiAmb * ao + sunCol * sunLight) + specTint * spec * (0.35 + 0.85 * sunSlats));

  // Brass environment reflection boost so gold hardware gleams warmly even in shadow
  if (metallic > 0.5) {
    float envRef = pow(max(N.y * 0.6 + 0.4, 0.0), 1.5);
    col += baseCol * envRef * 0.34;
  }

  fragColor = vec4(col, 1.0);
}
`;

// 2. PROCEDURAL TACTILE CREAM PAPER PAGE SHADER (6 Distinct Spreads + Spine AO + Curling)
export const PAGE_VS = `#version 300 es
precision highp float;
precision highp int;

layout(location = 0) in vec2 aUV;

uniform mat4 uProj;
uniform mat4 uView;
uniform float uTurnProgress;
uniform float uSpineLift;
uniform int uPageSide;
uniform float uSheetFace;

out vec3 vWorldPos;
out vec3 vNormal;
out vec2 vPageUV;
out float vSpineDist;

${GLSL_DEFORM_PAGE}

void main() {
  float u = aUV.x;
  float v = aUV.y;
  vec3 pos;
  vec3 nrm;
  vec3 tanU;
  vec3 tanV;
  deformPageVertex(u, v, uTurnProgress, uSpineLift, pos, nrm, tanU, tanV);

  vWorldPos = pos;
  vNormal = nrm * uSheetFace;
  // Standard left-to-right reading UV on each individual page
  float px = (uPageSide == 1) ? u : (1.0 - u);
  vPageUV = vec2(px, v);
  vSpineDist = u;

  gl_Position = uProj * uView * vec4(pos, 1.0);
}
`;

export const PAGE_FS = `#version 300 es
precision highp float;
precision highp int;

in vec3 vWorldPos;
in vec3 vNormal;
in vec2 vPageUV;
in float vSpineDist;

uniform vec3 uCamPos;
uniform vec3 uSunDir;
uniform float uTime;
uniform int uSpreadIdx;
uniform int uPageSide;
uniform float uTurnProgress;
uniform vec4 uHoverUV; // (px, py, activeOnThisPage, toolMode)

out vec4 fragColor;

${GLSL_COMMON_MATH}

// Crisp screen-space anti-aliased SDF stroke & fill helpers
float aaFill(float d) {
  float w = max(fwidth(d), 0.0018);
  return 1.0 - smoothstep(-w, w, d);
}

float aaStroke(float d, float halfWidth) {
  return aaFill(abs(d) - halfWidth);
}

float sdSegment(vec2 p, vec2 a, vec2 b) {
  vec2 pa = p - a, ba = b - a;
  float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
  return length(pa - ba * h);
}

float sdRoundRect(vec2 p, vec2 b, float r) {
  vec2 q = abs(p) - b + r;
  return min(max(q.x, q.y), 0.0) + length(max(q, 0.0)) - r;
}

float sdTriangleIsosceles(vec2 p, vec2 q) {
  p.x = abs(p.x);
  vec2 a = p - q * clamp(dot(p, q) / dot(q, q), 0.0, 1.0);
  vec2 b = p - q * vec2(clamp(p.x / q.x, 0.0, 1.0), 1.0);
  float s = -sign(q.y);
  vec2 d = min(vec2(dot(a, a), s * (p.x * q.y - p.y * q.x)),
               vec2(dot(b, b), s * (p.y - q.y)));
  return -sqrt(d.x) * sign(d.y);
}

void main() {
  // Aspect-corrected 2D canvas coordinates p in [0..1] x [0..1.366]
  vec2 uv = vPageUV;
  vec2 p = vec2(uv.x, uv.y * 1.366);

  // Warm stationery palette constants
  vec3 cCream      = vec3(0.984, 0.965, 0.925); // #fbf6ec
  vec3 cEspresso   = vec3(0.090, 0.075, 0.063); // #171310
  vec3 cBrass      = vec3(0.860, 0.595, 0.125); // rich printed gilt
  vec3 cTerracotta = vec3(0.820, 0.295, 0.190); // #d95338
  vec3 cMatcha     = vec3(0.155, 0.565, 0.375); // #2e9e6b
  vec3 cSky        = vec3(0.125, 0.485, 0.685); // #2589bd
  vec3 cHoney      = vec3(0.865, 0.525, 0.175); // #e59238
  vec3 cRuleFaint  = vec3(0.695, 0.630, 0.545);

  // 120gsm Cotton Paper Tooth & Fiber Texture
  float fiberCoarse = noise2D(p * 32.0) * 0.65 + noise2D(p * 68.0 + 11.3) * 0.35;
  float fiberFine   = noise2D(p * 145.0);
  vec3 col = cCream * (0.972 + 0.032 * fiberCoarse + 0.018 * (fiberFine - 0.5));

  // Common Printed Planner Header Bar (y = 0.105) & Footer Folio
  float marginMask = step(0.075, uv.x) * step(uv.x, 0.925);
  float headerLine = aaStroke(p.y - 0.135, 0.0024) * marginMask;
  float subHeaderLine = aaStroke(p.y - 0.150, 0.0012) * marginMask;
  col = mix(col, mix(cCream, cEspresso, 0.78), headerLine);
  col = mix(col, cBrass, subHeaderLine * 0.88);

  // Corner Folio Badge in top outer corner
  vec2 badgePos = (uPageSide == 0) ? vec2(0.125, 0.088) : vec2(0.875, 0.088);
  float badgeBox = sdRoundRect(p - badgePos, vec2(0.045, 0.024), 0.008);
  vec3 spreadAccent = (uSpreadIdx == 0) ? cHoney :
                      (uSpreadIdx == 1) ? cMatcha :
                      (uSpreadIdx == 2) ? cSky :
                      (uSpreadIdx == 3) ? cTerracotta :
                      (uSpreadIdx == 4) ? cBrass : cTerracotta;
  col = mix(col, spreadAccent, aaFill(badgeBox) * 0.88);
  // Decorative header title rule bars beside badge
  vec2 barStart = (uPageSide == 0) ? vec2(0.19, 0.088) : vec2(0.56, 0.088);
  vec2 barEnd   = (uPageSide == 0) ? vec2(0.44, 0.088) : vec2(0.81, 0.088);
  col = mix(col, mix(cCream, cEspresso, 0.55), aaStroke(sdSegment(p, barStart, barEnd), 0.0032));

  // Content area mask
  float inBody = step(0.08, uv.x) * step(uv.x, 0.92) * step(0.175, p.y) * step(p.y, 1.27);

  // =========================================================================
  // 6 DISTINCT PROCEDURAL THEMED SPREADS (0..5)
  // =========================================================================
  if (uSpreadIdx == 0) {
    // 01 · 柴犬咖啡周记 (Shiba Coffee Weekly)
    if (uPageSide == 0) {
      // Left: 6 Weekly Day Blocks + Checkboxes
      for (int i = 0; i < 6; i++) {
        float rowY = 0.25 + float(i) * 0.172;
        float boxD = sdRoundRect(p - vec2(0.50, rowY), vec2(0.40, 0.070), 0.012);
        col = mix(col, mix(cCream, cHoney, 0.09), aaFill(boxD));
        col = mix(col, mix(cCream, cEspresso, 0.25), aaStroke(boxD, 0.0015));
        // Day pill on left of row
        float dayPill = sdRoundRect(p - vec2(0.16, rowY - 0.032), vec2(0.042, 0.018), 0.006);
        col = mix(col, mix(cCream, cHoney, 0.72), aaFill(dayPill));
        // Two task checkboxes per row
        for (int k = 0; k < 2; k++) {
          float cy = rowY - 0.01 + float(k) * 0.036;
          float chk = sdRoundRect(p - vec2(0.245, cy), vec2(0.011, 0.011), 0.002);
          col = mix(col, mix(cCream, cEspresso, 0.45), aaStroke(chk, 0.0014));
          col = mix(col, cRuleFaint, aaStroke(sdSegment(p, vec2(0.275, cy), vec2(0.86, cy)), 0.001));
        }
      }
    } else {
      // Right: Framed Shiba Pour-Over Café Illustration + Coffee Flavor Wheel
      vec2 fc = vec2(0.50, 0.52);
      float frameD = sdRoundRect(p - fc, vec2(0.38, 0.30), 0.02);
      col = mix(col, vec3(0.968, 0.935, 0.875), aaFill(frameD));
      col = mix(col, cHoney, aaStroke(frameD, 0.0028));

      // Shiba Inu portrait inside frame
      vec2 sc = vec2(0.39, 0.54);
      float headD = length((p - sc) * vec2(1.0, 1.12)) - 0.115;
      float earL = sdTriangleIsosceles(vec2(p.x - (sc.x - 0.072), (sc.y - 0.072) - p.y), vec2(0.042, 0.085));
      float earR = sdTriangleIsosceles(vec2(p.x - (sc.x + 0.072), (sc.y - 0.072) - p.y), vec2(0.042, 0.085));
      float shiba = min(headD, min(earL, earR));
      col = mix(col, cHoney, aaFill(shiba));
      // Cream Shiba cheeks & muzzle
      float muzzle = min(
        length((p - (sc + vec2(0.0, 0.038))) * vec2(0.95, 1.25)) - 0.068,
        min(length(p - (sc + vec2(-0.048, 0.025))) - 0.042, length(p - (sc + vec2(0.048, 0.025))) - 0.042)
      );
      col = mix(col, cCream, aaFill(max(muzzle, headD)));
      // Shiba eyes, eyebrows & espresso nose
      float eyes = min(length(p - (sc + vec2(-0.042, -0.012))) - 0.010, length(p - (sc + vec2(0.042, -0.012))) - 0.010);
      float brows = min(length(p - (sc + vec2(-0.038, -0.036))) - 0.008, length(p - (sc + vec2(0.038, -0.036))) - 0.008);
      float nose = length((p - (sc + vec2(0.0, 0.018))) * vec2(1.0, 1.35)) - 0.012;
      col = mix(col, cCream, aaFill(brows));
      col = mix(col, cEspresso, aaFill(min(eyes, nose)));
      // Matcha barista apron below Shiba
      float apron = sdRoundRect(p - (sc + vec2(0.0, 0.165)), vec2(0.085, 0.055), 0.01);
      col = mix(col, cMatcha, aaFill(max(apron, frameD)));

      // V60 Pour-over dripper & carafe on counter right
      vec2 dc = vec2(0.67, 0.56);
      float cone = sdTriangleIsosceles(vec2(p.x - dc.x, p.y - (dc.y - 0.10)), vec2(0.072, -0.10));
      float carafe = sdRoundRect(p - (dc + vec2(0.0, 0.075)), vec2(0.062, 0.058), 0.022);
      col = mix(col, cTerracotta, aaFill(cone));
      col = mix(col, mix(cCream, cEspresso, 0.78), aaFill(carafe));
      // Steam waves above dripper
      for (int s = -1; s <= 1; s++) {
        float sx = dc.x + float(s) * 0.028 + sin(p.y * 45.0) * 0.008;
        float st = sdSegment(p, vec2(sx, dc.y - 0.13), vec2(sx, dc.y - 0.21));
        col = mix(col, cHoney, aaStroke(st, 0.0022));
      }

      // Tasting notes & Flavor Radar below frame
      vec2 rc = vec2(0.26, 1.05);
      for (int r = 1; r <= 3; r++) {
        col = mix(col, mix(cCream, cHoney, 0.45), aaStroke(length(p - rc) - float(r) * 0.042, 0.0013));
      }
      for (int l = 0; l < 5; l++) {
        float ly = 0.92 + float(l) * 0.068;
        col = mix(col, cRuleFaint, aaStroke(sdSegment(p, vec2(0.45, ly), vec2(0.88, ly)), 0.0012));
      }
    }
  } else if (uSpreadIdx == 1) {
    // 02 · 水獭露营手绘 (Otter Camping Dotted Sketchbook)
    // 5mm Matcha-tinted Bullet Journal Dot Grid across both pages
    vec2 gCell = fract(p * 22.0) - 0.5;
    float dotD = (length(gCell) - 0.075) / 22.0;
    col = mix(col, mix(cCream, cMatcha, 0.42), aaFill(dotD) * inBody);

    if (uPageSide == 0) {
      // Left: Camp Gear Packing Checklist + Mini Compass Rose
      for (int i = 0; i < 8; i++) {
        float ly = 0.26 + float(i) * 0.095;
        float cBox = length(p - vec2(0.15, ly)) - 0.013;
        col = mix(col, cMatcha, aaStroke(cBox, 0.0018));
        col = mix(col, mix(cCream, cMatcha, 0.30), aaStroke(sdSegment(p, vec2(0.19, ly), vec2(0.84, ly)), 0.0012));
      }
      vec2 cmp = vec2(0.50, 1.12);
      col = mix(col, cBrass, aaStroke(length(p - cmp) - 0.09, 0.0022));
      col = mix(col, cTerracotta, aaFill(sdTriangleIsosceles(vec2(p.x - cmp.x, cmp.y - 0.075 - p.y), vec2(0.020, -0.075))));
      col = mix(col, cEspresso, aaFill(sdTriangleIsosceles(vec2(p.x - cmp.x, p.y - (cmp.y + 0.075)), vec2(0.020, -0.075))));
    } else {
      // Right: Mountain & Pine Forest A-Frame Tent + Campfire + River Illustration
      vec2 center = vec2(0.50, 0.68);
      float border = sdRoundRect(p - center, vec2(0.39, 0.44), 0.018);
      float clipIn = aaFill(border);
      col = mix(col, vec3(0.955, 0.968, 0.935), clipIn * 0.65);

      // Twin peaks
      float mtn1 = sdTriangleIsosceles(vec2(p.x - 0.37, p.y - 0.34), vec2(0.24, 0.34));
      float mtn2 = sdTriangleIsosceles(vec2(p.x - 0.64, p.y - 0.40), vec2(0.22, 0.28));
      col = mix(col, mix(cCream, cSky, 0.35), aaFill(min(mtn1, mtn2)) * clipIn);

      // Pine trees
      for (int t = 0; t < 4; t++) {
        float tx = 0.20 + float(t) * 0.20;
        float tree = min(
          sdTriangleIsosceles(vec2(p.x - tx, p.y - 0.56), vec2(0.045, 0.11)),
          sdTriangleIsosceles(vec2(p.x - tx, p.y - 0.61), vec2(0.058, 0.12))
        );
        col = mix(col, cMatcha, aaFill(tree) * clipIn);
      }

      // Cozy A-Frame Tent & Campfire
      float tent = sdTriangleIsosceles(vec2(p.x - 0.43, p.y - 0.68), vec2(0.12, 0.18));
      float tentDoor = sdTriangleIsosceles(vec2(p.x - 0.43, p.y - 0.74), vec2(0.05, 0.12));
      col = mix(col, cHoney, aaFill(tent) * clipIn);
      col = mix(col, cEspresso, aaFill(tentDoor) * clipIn);

      float flame = length((p - vec2(0.67, 0.82)) * vec2(1.3, 0.85)) - 0.036;
      col = mix(col, cTerracotta, aaFill(flame) * clipIn);
      col = mix(col, cBrass, aaFill(flame + 0.016) * clipIn);

      // Winding creek waves at bottom
      float waveY = 0.99 + sin(p.x * 20.0) * 0.025;
      float river = abs(p.y - waveY) - 0.038;
      col = mix(col, mix(cCream, cSky, 0.65), aaFill(river) * clipIn);
      col = mix(col, cMatcha, aaStroke(border, 0.0028));
    }
  } else if (uSpreadIdx == 2) {
    // 03 · 猫头鹰观星台 (Owl Observatory & Brass Star-Chart Wheel)
    if (uPageSide == 0) {
      // Left: Lunar Phase Row + Fountain-Pen Ruled Observation Log
      for (int m = 0; m < 5; m++) {
        vec2 mc = vec2(0.20 + float(m) * 0.15, 0.25);
        float moon = length(p - mc) - 0.032;
        float shadowShift = (float(m) - 2.0) * 0.026;
        float cutout = length(p - (mc + vec2(shadowShift, 0.0))) - 0.030;
        col = mix(col, cSky, aaStroke(moon, 0.0018));
        float lit = (m == 2) ? aaFill(moon) : aaFill(max(moon, -cutout));
        col = mix(col, cBrass, lit * 0.88);
      }
      for (int r = 0; r < 11; r++) {
        float ry = 0.36 + float(r) * 0.080;
        col = mix(col, mix(cCream, cSky, 0.32), aaStroke(sdSegment(p, vec2(0.10, ry), vec2(0.90, ry)), 0.0011));
      }
    } else {
      // Right: Golden Brass & Sky-Cobalt Armillary Star-Chart Wheel
      vec2 wc = vec2(0.50, 0.66);
      vec2 dp = p - wc;
      float rad = length(dp);
      float ang = atan(dp.y, dp.x);

      // Deep sky-tinted parchment disc
      col = mix(col, mix(cCream, cSky, 0.14), aaFill(rad - 0.37));
      col = mix(col, cSky, aaStroke(rad - 0.37, 0.0032));
      col = mix(col, cBrass, aaStroke(rad - 0.33, 0.0020));
      col = mix(col, mix(cCream, cSky, 0.45), aaStroke(rad - 0.21, 0.0014));
      col = mix(col, cBrass, aaStroke(rad - 0.10, 0.0016));

      // Degree tick marks around outer ring
      float tickAng = abs(fract(ang * 18.0 / PI + 0.5) - 0.5) / (18.0 / PI);
      float tickArc = tickAng * rad;
      float inRing = step(0.33, rad) * step(rad, 0.37);
      col = mix(col, cSky, (1.0 - smoothstep(0.001, 0.0035, tickArc)) * inRing * 0.75);

      // Crosshairs & ecliptic ring
      col = mix(col, mix(cCream, cBrass, 0.65), aaStroke(sdSegment(p, wc - vec2(0.37, 0.0), wc + vec2(0.37, 0.0)), 0.0012));
      col = mix(col, mix(cCream, cBrass, 0.65), aaStroke(sdSegment(p, wc - vec2(0.0, 0.37), wc + vec2(0.0, 0.37)), 0.0012));
      float eclip = length(dp - vec2(0.05, -0.04)) - 0.25;
      col = mix(col, cTerracotta, aaStroke(eclip, 0.0015) * aaFill(rad - 0.36));

      // Big Dipper constellation lines & golden stars
      vec2 s0 = wc + vec2(-0.18, -0.10);
      vec2 s1 = wc + vec2(-0.09, -0.13);
      vec2 s2 = wc + vec2(-0.02, -0.07);
      vec2 s3 = wc + vec2(0.05, -0.04);
      vec2 s4 = wc + vec2(0.07, 0.06);
      vec2 s5 = wc + vec2(0.17, 0.08);
      vec2 s6 = wc + vec2(0.19, -0.02);
      float cLines = min(
        min(sdSegment(p, s0, s1), sdSegment(p, s1, s2)),
        min(min(sdSegment(p, s2, s3), sdSegment(p, s3, s4)),
            min(sdSegment(p, s4, s5), min(sdSegment(p, s5, s6), sdSegment(p, s6, s3))))
      );
      col = mix(col, cSky, aaStroke(cLines, 0.0020));
      float cStars = min(
        min(length(p - s0), min(length(p - s1), length(p - s2))),
        min(min(length(p - s3), length(p - s4)), min(length(p - s5), length(p - s6)))
      ) - 0.011;
      col = mix(col, cBrass, aaFill(cStars));
      col = mix(col, cEspresso, aaStroke(cStars, 0.0014));

      // Footer caption lines
      col = mix(col, cRuleFaint, aaStroke(sdSegment(p, vec2(0.16, 1.13), vec2(0.84, 1.13)), 0.0012));
      col = mix(col, cRuleFaint, aaStroke(sdSegment(p, vec2(0.24, 1.20), vec2(0.76, 1.20)), 0.0012));
    }
  } else if (uSpreadIdx == 3) {
    // 04 · 企鹅烘焙工坊 (Penguin Bakery Squared Recipe Grid)
    vec2 g2 = abs(fract(p * 18.0) - 0.5) / 18.0;
    float gridD = min(g2.x, g2.y);
    col = mix(col, mix(cCream, cTerracotta, 0.16), (1.0 - smoothstep(0.0, 0.0022, gridD)) * inBody);

    if (uPageSide == 0) {
      // Left: Ingredient Ratio Bars & Oven Temperature Cards
      for (int i = 0; i < 5; i++) {
        float by = 0.28 + float(i) * 0.11;
        float barBg = sdRoundRect(p - vec2(0.52, by), vec2(0.34, 0.022), 0.008);
        float fillW = 0.12 + fract(float(i) * 0.37 + 0.25) * 0.20;
        float barFill = sdRoundRect(p - vec2(0.18 + fillW, by), vec2(fillW, 0.022), 0.008);
        col = mix(col, mix(cCream, cHoney, 0.22), aaFill(barBg));
        col = mix(col, (i % 2 == 0) ? cHoney : cTerracotta, aaFill(barFill) * 0.82);
        col = mix(col, mix(cCream, cEspresso, 0.35), aaStroke(barBg, 0.0014));
      }
      // Two oven dial cards at bottom
      for (int d = 0; d < 2; d++) {
        vec2 dc = vec2(0.31 + float(d) * 0.38, 1.04);
        float card = sdRoundRect(p - dc, vec2(0.15, 0.14), 0.016);
        col = mix(col, cCream, aaFill(card));
        col = mix(col, cTerracotta, aaStroke(card, 0.0020));
        col = mix(col, cBrass, aaStroke(length(p - dc) - 0.075, 0.0025));
        col = mix(col, cEspresso, aaStroke(sdSegment(p, dc, dc + vec2(0.045, -0.042)), 0.003));
      }
    } else {
      // Right: Golden Croissant & Scalloped Terracotta Berry Tart Card
      vec2 cardC = vec2(0.50, 0.66);
      float rCard = sdRoundRect(p - cardC, vec2(0.37, 0.43), 0.022);
      col = mix(col, vec3(0.99, 0.97, 0.93), aaFill(rCard));
      col = mix(col, cTerracotta, aaStroke(rCard, 0.0028));

      // Layered Golden Croissant (top half of card)
      vec2 cc = vec2(0.50, 0.45);
      float cMid = length((p - cc) * vec2(0.85, 1.35)) - 0.088;
      float cL   = length((p - (cc + vec2(-0.105, 0.028))) * vec2(1.0, 1.35)) - 0.062;
      float cR   = length((p - (cc + vec2(0.105, 0.028))) * vec2(1.0, 1.35)) - 0.062;
      float tipL = length(p - (cc + vec2(-0.175, 0.068))) - 0.036;
      float tipR = length(p - (cc + vec2(0.175, 0.068))) - 0.036;
      float crois = min(cMid, min(min(cL, cR), min(tipL, tipR)));
      col = mix(col, cHoney, aaFill(crois));
      col = mix(col, cBrass, aaFill(cMid + 0.018));
      col = mix(col, cEspresso, aaStroke(crois, 0.0020));

      // Scalloped Berry Tart (bottom half of card)
      vec2 tc = vec2(0.50, 0.84);
      vec2 tdp = p - tc;
      float tAng = atan(tdp.y, tdp.x);
      float scallop = length(tdp) - (0.135 + 0.010 * cos(tAng * 14.0));
      col = mix(col, cHoney, aaFill(scallop));
      col = mix(col, cTerracotta, aaFill(length(tdp) - 0.102));
      // Matcha mint leaf on tart center
      float leaf = length((p - (tc + vec2(0.02, -0.01))) * vec2(0.7, 1.6)) - 0.022;
      col = mix(col, cMatcha, aaFill(leaf));
    }
  } else if (uSpreadIdx == 4) {
    // 05 · 水豚温泉日程 (Capybara Onsen Habit Tracker)
    if (uPageSide == 0) {
      // Left: 7x6 Circular Habit Tracker Matrix + Tea Log
      for (int row = 0; row < 6; row++) {
        float ry = 0.27 + float(row) * 0.105;
        float tag = sdRoundRect(p - vec2(0.20, ry), vec2(0.085, 0.020), 0.008);
        col = mix(col, mix(cCream, cMatcha, 0.25), aaFill(tag));
        for (int d = 0; d < 7; d++) {
          vec2 bc = vec2(0.35 + float(d) * 0.078, ry);
          float bub = length(p - bc) - 0.022;
          if ((row + d) % 3 == 0 && row < 3) {
            col = mix(col, (row == 0) ? cBrass : cMatcha, aaFill(bub) * 0.78);
          }
          col = mix(col, mix(cCream, cEspresso, 0.38), aaStroke(bub, 0.0014));
        }
      }
      for (int l = 0; l < 4; l++) {
        float ly = 0.96 + float(l) * 0.075;
        col = mix(col, cRuleFaint, aaStroke(sdSegment(p, vec2(0.12, ly), vec2(0.88, ly)), 0.0012));
      }
    } else {
      // Right: Steaming Hinoki Wood Onsen Tub, Capybara & Floating Yuzu
      vec2 oc = vec2(0.50, 0.68);
      float frame = sdRoundRect(p - oc, vec2(0.38, 0.42), 0.024);
      float inF = aaFill(frame);
      col = mix(col, vec3(0.955, 0.968, 0.945), inF);

      // Bamboo stalks in background
      for (int b = 0; b < 3; b++) {
        float bx = 0.22 + float(b) * 0.065;
        col = mix(col, mix(cCream, cMatcha, 0.65), aaStroke(sdSegment(p, vec2(bx, 0.30), vec2(bx, 0.72)), 0.0055) * inF);
      }

      // Warm Onsen Water ellipse & Hinoki tub rim
      float tubOuter = length((p - vec2(0.52, 0.82)) * vec2(0.82, 1.45)) - 0.27;
      float tubWater = length((p - vec2(0.52, 0.81)) * vec2(0.88, 1.62)) - 0.23;
      col = mix(col, cHoney, aaFill(tubOuter) * inF);
      col = mix(col, mix(cCream, cSky, 0.42), aaFill(tubWater) * inF);

      // Chill Capybara emerging from warm water + golden Yuzu citrus on head!
      vec2 capC = vec2(0.50, 0.72);
      float capHead = sdRoundRect(p - capC, vec2(0.105, 0.075), 0.045);
      float capSnout = sdRoundRect(p - (capC + vec2(0.055, 0.012)), vec2(0.055, 0.048), 0.025);
      float capy = min(capHead, capSnout);
      col = mix(col, vec3(0.66, 0.42, 0.24), aaFill(capy) * inF);
      // Peaceful closed happy eye line
      col = mix(col, cEspresso, aaStroke(sdSegment(p, capC + vec2(-0.02, -0.01), capC + vec2(0.015, -0.01)), 0.0025) * inF);
      // Bright Brass-Gold Yuzu balanced on Capybara's head + floating yuzus!
      float yuzuTop = length(p - (capC + vec2(-0.015, -0.092))) - 0.028;
      float yuzuF1  = length(p - vec2(0.33, 0.84)) - 0.024;
      float yuzuF2  = length(p - vec2(0.70, 0.83)) - 0.024;
      col = mix(col, cBrass, aaFill(min(yuzuTop, min(yuzuF1, yuzuF2))) * inF);
      col = mix(col, cMatcha, aaStroke(frame, 0.0028));
    }
  } else {
    // 06 · 千纸鹤折纸页 (Origami Crane Crease Diagrams & Seigaiha Waves)
    if (uPageSide == 0) {
      // Left: 4 Geometric Origami Crease-Pattern Step Squares
      for (int i = 0; i < 4; i++) {
        vec2 sc = vec2(0.30 + float(i % 2) * 0.40, 0.40 + float(i / 2) * 0.38);
        float sq = sdRoundRect(p - sc, vec2(0.145, 0.145), 0.004);
        col = mix(col, vec3(0.99, 0.975, 0.94), aaFill(sq));
        col = mix(col, cEspresso, aaStroke(sq, 0.0018));
        // Diagonal & median valley/mountain crease lines
        float diag1 = sdSegment(p, sc - vec2(0.14, 0.14), sc + vec2(0.14, 0.14));
        float diag2 = sdSegment(p, sc + vec2(-0.14, 0.14), sc + vec2(0.14, -0.14));
        float dash = step(0.4, fract((p.x + p.y) * 45.0));
        col = mix(col, cTerracotta, aaStroke(diag1, 0.0013) * dash);
        col = mix(col, cSky, aaStroke(diag2, 0.0013));
        if (i >= 1) {
          float diamond = abs(p.x - sc.x) + abs(p.y - sc.y) - 0.10;
          col = mix(col, cBrass, aaStroke(diamond, 0.0015) * aaFill(sq));
        }
      }
      col = mix(col, cRuleFaint, aaStroke(sdSegment(p, vec2(0.15, 1.06), vec2(0.85, 1.06)), 0.0012));
      col = mix(col, cRuleFaint, aaStroke(sdSegment(p, vec2(0.15, 1.15), vec2(0.85, 1.15)), 0.0012));
    } else {
      // Right: Golden Sun Disc, Soaring Geometric Paper Cranes & Seigaiha Waves
      vec2 fc = vec2(0.50, 0.68);
      float box = sdRoundRect(p - fc, vec2(0.38, 0.43), 0.018);
      float inB = aaFill(box);

      // Terracotta-gold rising sun disc
      float sunD = length(p - vec2(0.58, 0.46)) - 0.115;
      col = mix(col, mix(cTerracotta, cBrass, 0.35), aaFill(sunD) * inB * 0.88);

      // Seigaiha concentric wave arcs along bottom of frame
      if (p.y > 0.84 && p.y < 1.11) {
        vec2 wuv = p * 11.0;
        float row = floor(wuv.y);
        vec2 cell = vec2(fract(wuv.x + mod(row, 2.0) * 0.5) - 0.5, fract(wuv.y) - 0.85);
        float r = length(cell);
        float rings = abs(fract(r * 3.2) - 0.5);
        float waveStroke = 1.0 - smoothstep(0.08, 0.18, rings);
        col = mix(col, mix(cCream, cSky, 0.55), waveStroke * inB * step(r, 0.95));
      }

      // Geometric Origami Crane Silhouette soaring across sun
      vec2 cr = vec2(0.42, 0.56);
      float wingL = sdTriangleIsosceles(vec2(p.x - (cr.x - 0.06), p.y - (cr.y - 0.11)), vec2(0.075, 0.13));
      float wingR = sdTriangleIsosceles(vec2(p.x - (cr.x + 0.07), (cr.y + 0.09) - p.y), vec2(0.065, 0.11));
      float body  = abs(p.x - cr.x) + abs(p.y - cr.y) - 0.065;
      float crane = min(body, min(wingL, wingR));
      col = mix(col, cBrass, aaFill(crane) * inB);
      col = mix(col, cEspresso, aaStroke(crane, 0.0018) * inB);
      col = mix(col, cTerracotta, aaStroke(box, 0.0028));
    }
  }

  // Interactive Hover Ring & Soft Contact Shadow under Cursor (Sticker or Pen preview!)
  if (uHoverUV.z > 0.5) {
    vec2 hP = vec2(uHoverUV.x, uHoverUV.y * 1.366);
    float dHover = length(p - hP);
    if (uHoverUV.w < 0.5) {
      // Sticker mode: soft warm drop-shadow beneath floating curled sticker + subtle brass placement ring
      float shadowSoft = exp(-dHover * dHover * 110.0) * 0.22;
      col *= (1.0 - shadowSoft);
      float ring = aaStroke(dHover - 0.092, 0.0018);
      col = mix(col, cBrass, ring * 0.65);
    } else if (uHoverUV.w < 1.5) {
      // Fountain Pen mode: tiny crisp nib target dot
      float nibShadow = exp(-dHover * dHover * 650.0) * 0.18;
      col *= (1.0 - nibShadow);
    }
  }

  // Spine Gutter Ambient Occlusion & Outer Fore-Edge Bevel
  float spineAO = mix(0.56, 1.0, smoothstep(0.0, 0.16, vSpineDist));
  spineAO *= mix(0.88, 1.0, smoothstep(0.0, 0.42, vSpineDist));
  float edgeShade = mix(0.92, 1.0, smoothstep(0.0, 0.025, 1.0 - vSpineDist));

  // Physical Paper Lighting + Micro-tooth Normal Perturbation + Sunbeams
  vec3 N = normalize(vNormal + vec3((fiberFine - 0.5) * 0.06, 0.0, (fiberCoarse - 0.5) * 0.06));
  vec3 L = normalize(uSunDir);
  vec3 V = normalize(uCamPos - vWorldPos);
  vec3 H = normalize(L + V);

  float sunSlats = windowSunMask(vWorldPos, uTime);
  float ndl = max(dot(N, L), 0.0);
  // Cotton paper also has warm subsurface wrap lighting when lifted mid-turn!
  float turnLift = sin(clamp(uTurnProgress, 0.0, 1.0) * PI);
  float wrapTranslucency = max(dot(-N, L), 0.0) * 0.26 * turnLift;

  vec3 ambient = mix(vec3(0.45, 0.38, 0.31), vec3(0.70, 0.65, 0.58), N.y * 0.5 + 0.5);
  vec3 sunCol = vec3(0.96, 0.87, 0.72);
  float paperSheen = pow(max(dot(N, H), 0.0), 18.0) * 0.045 * (0.4 + 0.6 * sunSlats);

  vec3 lit = col * (ambient * spineAO * edgeShade + sunCol * (ndl * (0.34 + 0.58 * sunSlats) + wrapTranslucency)) + paperSheen;

  fragColor = vec4(lit, 1.0);
}
`;

// 3. 3D DIE-CUT SCULPTED STICKER SHADER (with Live 3D Peel-Curl Wave & Page-Curl Attachment!)
export const STICKER_VS = `#version 300 es
precision highp float;
precision highp int;

layout(location = 0) in vec3 aPos;
layout(location = 1) in vec3 aNormal;
layout(location = 2) in vec3 aColor;
layout(location = 3) in float aPartMat; // 0 = glossy white border, 1 = matte-satin animal, 2 = brass metallic, 3 = molten wax

uniform mat4 uProj;
uniform mat4 uView;
uniform mat4 uModel;
uniform int uPlacementMode; // 0 = attached/hovered on 3D planner page, 1 = world-space desk prop
uniform int uPageSide;
uniform vec2 uStickerUV;    // (px, py) on page
uniform float uStickerRot;
uniform float uStickerScale;
uniform float uTurnProgress;
uniform float uSpineLift;
uniform float uSheetFace;   // +1.0 front/resting, -1.0 back of turning sheet
uniform float uPeelAmount;  // [0..1] live 3D peel-curl wave!

out vec3 vWorldPos;
out vec3 vNormal;
out vec3 vColor;
out float vPartMat;
out float vPeelLift;

${GLSL_DEFORM_PAGE}

void main() {
  if (uPlacementMode == 1) {
    vec4 wp = uModel * vec4(aPos, 1.0);
    vWorldPos = wp.xyz;
    vNormal = normalize(mat3(uModel) * aNormal);
    vColor = aColor;
    vPartMat = aPartMat;
    vPeelLift = 0.0;
    gl_Position = uProj * uView * wp;
    return;
  }

  // Local sticker footprint in [-1..1] scaled to world size (~0.40 radius at scale=1)
  float rad = 0.40 * uStickerScale;
  float lx = aPos.x;
  float lz = aPos.z;
  float ly = aPos.y * uStickerScale;

  // Live 3D Peel-Curl Wave: rolls the bottom-right corner upward & slightly inward!
  float peelCoord = clamp((lx * 0.72 + lz * 0.69) * 0.5 + 0.5, 0.0, 1.0);
  float peelCurve = pow(peelCoord, 2.15) * uPeelAmount;
  float peelSlope = 2.15 * pow(max(peelCoord, 0.001), 1.15) * uPeelAmount;
  float peelLift = peelCurve * 0.42 + uPeelAmount * 0.045;
  float inwardPull = peelCurve * peelCurve * 0.14;

  float modX = (lx - inwardPull * 0.72) * rad;
  float modZ = (lz - inwardPull * 0.69) * rad;

  // Rotate in page tangent plane
  float c = cos(uStickerRot);
  float s = sin(uStickerRot);
  float dx = modX * c - modZ * s;
  float dz = modX * s + modZ * c;

  float px = clamp(uStickerUV.x + dx / PAGE_W, 0.002, 0.998);
  float py = clamp(uStickerUV.y + dz / PAGE_H, 0.002, 0.998);
  float u = (uPageSide == 1) ? px : (1.0 - px);
  float v = py;

  vec3 surfPos;
  vec3 surfNrm;
  vec3 tanU;
  vec3 tanV;
  deformPageVertex(u, v, uTurnProgress, uSpineLift, surfPos, surfNrm, tanU, tanV);

  // Page-local right (+px) and down (+py) basis vectors on the active face
  float rightSign = (uPageSide == 1) ? 1.0 : -1.0;
  vec3 basisRight = tanU * rightSign;
  vec3 basisUp    = surfNrm * uSheetFace;
  vec3 basisDown  = tanV;

  // Perturb local normal by peel slope + rotate into deformed 3D page basis
  vec3 locN = normalize(aNormal + vec3(-peelSlope * 0.45, 0.0, -peelSlope * 0.45));
  vec3 rotLocN = vec3(
    locN.x * c - locN.z * s,
    locN.y,
    locN.x * s + locN.z * c
  );

  vec3 worldN = normalize(basisRight * rotLocN.x + basisUp * rotLocN.y + basisDown * rotLocN.z);
  vec3 worldP = surfPos + basisUp * (0.011 + ly + peelLift);

  vWorldPos = worldP;
  vNormal = worldN;
  vColor = aColor;
  vPartMat = aPartMat;
  vPeelLift = peelLift;

  gl_Position = uProj * uView * vec4(worldP, 1.0);
}
`;

export const STICKER_FS = `#version 300 es
precision highp float;
precision highp int;

in vec3 vWorldPos;
in vec3 vNormal;
in vec3 vColor;
in float vPartMat;
in float vPeelLift;

uniform vec3 uCamPos;
uniform vec3 uSunDir;
uniform float uTime;
uniform float uHighlight; // > 0 when hovered for peel-off or active preview

out vec4 fragColor;

${GLSL_COMMON_MATH}

void main() {
  vec3 N = normalize(vNormal);
  vec3 V = normalize(uCamPos - vWorldPos);
  vec3 L = normalize(uSunDir);
  vec3 H = normalize(L + V);

  float sunSlats = windowSunMask(vWorldPos, uTime);
  float ndl = max(dot(N, L), 0.0);
  vec3 baseCol = vColor;

  float rough = 0.42;
  float metallic = 0.0;
  float clearcoat = 0.0;

  if (vPartMat < 0.5) {
    // Glossy white die-cut sticker vinyl border
    rough = 0.16;
    clearcoat = 0.85;
  } else if (vPartMat < 1.5) {
    // Matte-satin sculpted 3D animal / craft clay-vinyl relief
    rough = 0.44;
    clearcoat = 0.25;
  } else if (vPartMat < 2.5) {
    // 18k Brass / Gold Star / Spectacles / Space Helmet Rim
    rough = 0.18;
    metallic = 0.86;
    clearcoat = 0.5;
  } else {
    // Molten Terracotta-Crimson Wax Seal (waxy subsurface warmth + satin gloss)
    rough = 0.28;
    clearcoat = 0.45;
    float wrapWax = max(dot(N, L) * 0.5 + 0.5, 0.0);
    baseCol += vec3(0.14, 0.03, 0.01) * wrapWax;
  }

  vec3 amb = mix(vec3(0.42, 0.35, 0.28), vec3(0.76, 0.71, 0.63), N.y * 0.5 + 0.5);
  vec3 sunCol = vec3(1.06, 0.96, 0.82);

  float specPow = mix(96.0, 14.0, rough);
  float spec = pow(max(dot(N, H), 0.0), specPow) * mix(0.08, 0.95, 1.0 - rough);
  float coatSpec = pow(max(dot(N, H), 0.0), 110.0) * clearcoat * 0.55;
  float rim = pow(1.0 - max(dot(N, V), 0.0), 3.0) * 0.18;

  vec3 specCol = mix(vec3(1.0, 0.98, 0.92), baseCol, metallic);
  vec3 diffCol = baseCol * (1.0 - metallic * 0.62);

  vec3 col = diffCol * (amb + sunCol * ndl * (0.42 + 0.68 * sunSlats))
           + specCol * spec * (0.45 + 0.70 * sunSlats)
           + vec3(1.0, 0.98, 0.92) * coatSpec
           + vec3(0.98, 0.88, 0.68) * rim * (0.5 + vPeelLift * 1.5);

  if (metallic > 0.5) {
    col += baseCol * 0.28 * (N.y * 0.5 + 0.5);
  }

  if (uHighlight > 0.01) {
    float pulse = 0.5 + 0.5 * sin(uTime * 8.0);
    col = mix(col, vec3(0.95, 0.76, 0.28), uHighlight * (0.22 + 0.14 * pulse));
  }

  fragColor = vec4(col, 1.0);
}
`;

// 4. WET-TO-DRY FOUNTAIN PEN INK RIBBON SHADER (Deforms seamlessly with curling 3D pages!)
export const INK_VS = `#version 300 es
precision highp float;
precision highp int;

layout(location = 0) in vec2 aPageUV;    // (px, py)
layout(location = 1) in vec3 aInkMeta;   // (birthTime, colorIdx, edgeCoord [-1..1])

uniform mat4 uProj;
uniform mat4 uView;
uniform int uPageSide;
uniform float uTurnProgress;
uniform float uSpineLift;
uniform float uSheetFace;

out vec3 vWorldPos;
out vec3 vNormal;
out float vBirthTime;
out float vColorIdx;
out float vEdge;

${GLSL_DEFORM_PAGE}

void main() {
  float px = clamp(aPageUV.x, 0.001, 0.999);
  float py = clamp(aPageUV.y, 0.001, 0.999);
  float u = (uPageSide == 1) ? px : (1.0 - px);
  float v = py;

  vec3 pos;
  vec3 nrm;
  vec3 tanU;
  vec3 tanV;
  deformPageVertex(u, v, uTurnProgress, uSpineLift, pos, nrm, tanU, tanV);

  vec3 faceN = nrm * uSheetFace;
  vec3 wp = pos + faceN * 0.0065;

  vWorldPos = wp;
  vNormal = faceN;
  vBirthTime = aInkMeta.x;
  vColorIdx = aInkMeta.y;
  vEdge = aInkMeta.z;

  gl_Position = uProj * uView * vec4(wp, 1.0);
}
`;

export const INK_FS = `#version 300 es
precision highp float;
precision highp int;

in vec3 vWorldPos;
in vec3 vNormal;
in float vBirthTime;
in float vColorIdx;
in float vEdge;

uniform vec3 uCamPos;
uniform vec3 uSunDir;
uniform float uTime;

out vec4 fragColor;

${GLSL_COMMON_MATH}

void main() {
  int cid = int(vColorIdx + 0.5);
  vec3 inkCol = vec3(0.090, 0.075, 0.063); // 0: Espresso
  float metallic = 0.04;
  if (cid == 1) {
    inkCol = vec3(0.910, 0.659, 0.161);    // 1: Brass Nib Gold
    metallic = 0.82;
  } else if (cid == 2) {
    inkCol = vec3(0.851, 0.325, 0.220);    // 2: Terracotta Crimson
    metallic = 0.10;
  } else if (cid == 3) {
    inkCol = vec3(0.180, 0.620, 0.420);    // 3: Matcha Sage
    metallic = 0.08;
  } else if (cid == 4) {
    inkCol = vec3(0.145, 0.537, 0.741);    // 4: Sky Cobalt
    metallic = 0.12;
  }

  // Soft cotton-paper feathering + real fountain-ink edge pooling
  float fiber = noise2D(vWorldPos.xz * 85.0);
  float edgeDist = abs(vEdge);
  float alpha = 1.0 - smoothstep(0.68, 1.0, edgeDist + (fiber - 0.5) * 0.16);
  if (alpha < 0.04) discard;

  // Wet-to-dry glistening transition over 2.8 seconds!
  float age = max(0.0, uTime - vBirthTime);
  float wetness = clamp(1.0 - age * 0.36, 0.0, 1.0);
  float edgePool = smoothstep(0.35, 0.82, edgeDist) * 0.25;
  vec3 baseCol = inkCol * (1.0 - edgePool - wetness * 0.16);

  vec3 N = normalize(vNormal + vec3((fiber - 0.5) * 0.10, 0.0, (fiber - 0.5) * 0.10));
  vec3 V = normalize(uCamPos - vWorldPos);
  vec3 L = normalize(uSunDir);
  vec3 H = normalize(L + V);

  float sunSlats = windowSunMask(vWorldPos, uTime);
  float ndl = max(dot(N, L), 0.0);

  float rough = mix(0.58, 0.09, max(wetness, metallic * 0.75));
  float specPow = mix(120.0, 16.0, rough);
  float spec = pow(max(dot(N, H), 0.0), specPow) * (wetness * 1.15 + metallic * 0.85 + 0.05);

  vec3 specTint = mix(vec3(1.0, 0.97, 0.88), inkCol, metallic);
  vec3 lit = baseCol * (0.58 + 0.52 * ndl * (0.45 + 0.65 * sunSlats)) + specTint * spec;
  if (metallic > 0.5) {
    lit += inkCol * 0.25;
  }

  fragColor = vec4(lit, alpha);
}
`;

// 5. GPU-INSTANCED RISING COFFEE STEAM WISPS & GOLDEN PAPER-DUST MOTES
export const PARTICLE_VS = `#version 300 es
precision highp float;
precision highp int;

layout(location = 0) in vec2 aQuad;
layout(location = 1) in vec4 aSeed; // (seedA, seedB, seedC, kind: 0=steam, 1=dust)

uniform mat4 uProj;
uniform mat4 uView;
uniform vec3 uCamRight;
uniform vec3 uCamUp;
uniform float uTime;

out vec2 vUV;
out float vAlpha;
out float vKind;

void main() {
  vUV = aQuad;
  vKind = aSeed.w;

  vec3 center;
  float size;

  if (aSeed.w < 0.5) {
    // Rising 3D Ceramic Coffee Mug Steam Wisps above (-6.15, 1.12, -2.25)
    float life = fract(aSeed.x + uTime * (0.19 + 0.07 * aSeed.y));
    float angle = aSeed.z * 6.28318 + uTime * 1.15 + life * 4.2;
    float spiralR = 0.08 + life * 0.34;
    center = vec3(
      -6.15 + cos(angle) * spiralR + life * 0.22,
      1.10 + life * 2.15,
      -2.25 + sin(angle) * spiralR * 0.85
    );
    size = mix(0.16, 0.52, life);
    vAlpha = sin(life * 3.14159) * 0.24;
  } else {
    // Warm Afternoon Golden Paper-Dust Motes floating in sunbeams
    float phase = uTime * (0.22 + 0.15 * aSeed.z) + aSeed.x * 20.0;
    center = vec3(
      (aSeed.x - 0.5) * 13.5 + sin(phase) * 0.45,
      0.55 + aSeed.y * 3.8 + cos(phase * 0.8) * 0.28,
      (aSeed.z - 0.5) * 8.5 + sin(phase * 0.65) * 0.35
    );
    size = 0.032 + 0.036 * aSeed.y;
    float twinkle = 0.55 + 0.45 * sin(uTime * 2.4 + aSeed.x * 31.0);
    vAlpha = 0.52 * twinkle;
  }

  vec3 wp = center + (uCamRight * aQuad.x + uCamUp * aQuad.y) * size;
  gl_Position = uProj * uView * vec4(wp, 1.0);
}
`;

export const PARTICLE_FS = `#version 300 es
precision highp float;
precision highp int;

in vec2 vUV;
in float vAlpha;
in float vKind;

out vec4 fragColor;

void main() {
  float r2 = dot(vUV, vUV);
  if (r2 > 1.0) discard;
  float soft = pow(1.0 - r2, (vKind < 0.5) ? 2.2 : 1.6);

  vec3 steamCol = vec3(0.99, 0.96, 0.90);
  vec3 dustCol  = vec3(0.98, 0.82, 0.42);
  vec3 col = (vKind < 0.5) ? steamCol : dustCol;

  fragColor = vec4(col, soft * vAlpha);
}
`;

// 6. WARM ACES POST-PROCESSING & SUNLIT VIGNETTE
export const POST_VS = `#version 300 es
precision highp float;
precision highp int;

out vec2 vUV;

void main() {
  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  vUV = p;
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}
`;

export const POST_FS = `#version 300 es
precision highp float;
precision highp int;

in vec2 vUV;

uniform sampler2D uSceneTex;
uniform vec2 uTexel;

out vec4 fragColor;

vec3 acesWarm(vec3 x) {
  const float a = 2.51;
  const float b = 0.03;
  const float c = 2.43;
  const float d = 0.59;
  const float e = 0.14;
  return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0);
}

void main() {
  vec3 col = texture(uSceneTex, vUV).rgb;

  // Soft 4-tap warm sunlight bloom halo on highlights (cream paper sunbars & brass glints)
  vec2 o = uTexel * 2.5;
  vec3 b0 = texture(uSceneTex, vUV + vec2( o.x,  o.y)).rgb;
  vec3 b1 = texture(uSceneTex, vUV + vec2(-o.x,  o.y)).rgb;
  vec3 b2 = texture(uSceneTex, vUV + vec2( o.x, -o.y)).rgb;
  vec3 b3 = texture(uSceneTex, vUV + vec2(-o.x, -o.y)).rgb;
  vec3 avg = (b0 + b1 + b2 + b3) * 0.25;
  float lum = dot(avg, vec3(0.299, 0.587, 0.114));
  vec3 bloom = max(avg - 0.72, 0.0) * smoothstep(0.68, 1.15, lum);
  col += bloom * vec3(0.32, 0.27, 0.18);

  // Subtle warm studio vignette
  vec2 d = vUV - 0.5;
  float vig = 1.0 - dot(d, d) * 0.34;
  col *= clamp(vig, 0.72, 1.0);

  col = acesWarm(col * 1.04);
  col = pow(col, vec3(1.0 / 2.2));

  fragColor = vec4(col, 1.0);
}
`;
