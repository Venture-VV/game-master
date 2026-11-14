// Raw WebGL2 (#version 300 es) Shaders for 3D Hardware Soldering & Robotics Lab
// Strict Palette: Emerald PCB (#0f6b4a), ENIG Gold (#f5b82e), Solder Silver, Copper Orange (#f97316),
//Cyan LED (#22d3ee), Amber LED (#f59e0b), Signal Red (#ef4444), Warm ESD Slate (#0c1218).

export const LAB_ENV_VS = `#version 300 es
precision highp float;
precision highp int;

layout(location = 0) in vec3 aPos;
uniform mat4 uProj;
uniform mat4 uView;
uniform vec3 uCamPos;
out vec3 vDir;

void main() {
  vDir = aPos;
  gl_Position = uProj * uView * vec4(uCamPos + aPos * 85.0, 1.0);
}`;

export const LAB_ENV_FS = `#version 300 es
precision highp float;
precision highp int;

in vec3 vDir;
uniform float uTime;
out vec4 fragColor;

void main() {
  vec3 d = normalize(vDir);
  float up = clamp(d.y * 0.5 + 0.5, 0.0, 1.0);

  // Warm ESD Slate floor-to-studio brushed charcoal gradient
  vec3 nadir = vec3(0.032, 0.050, 0.068);
  vec3 horizon = vec3(0.062, 0.096, 0.125);
  vec3 zenith = vec3(0.042, 0.068, 0.092);
  vec3 col = mix(nadir, horizon, smoothstep(0.0, 0.48, up));
  col = mix(col, zenith, smoothstep(0.48, 1.0, up));

  // Brushed aluminum architectural studio wall band near horizon
  float band = exp(-abs(d.y - 0.08) * 9.0);
  float brush = sin(atan(d.z, d.x) * 90.0) * 0.008;
  col += (vec3(0.055, 0.082, 0.102) + brush) * band;

  // Subtle distant engineering blueprint grid on upper wall
  if (d.y > -0.05 && d.y < 0.45) {
    float az = atan(d.z, d.x) * 5.72958;
    float el = d.y * 18.0;
    float gx = smoothstep(0.965, 0.995, cos(az * 3.14159));
    float gy = smoothstep(0.965, 0.995, cos(el * 3.14159));
    float gFade = smoothstep(-0.05, 0.10, d.y) * (1.0 - smoothstep(0.28, 0.45, d.y));
    col += vec3(0.03, 0.11, 0.13) * max(gx, gy) * gFade * 0.35;
  }

  // Studio Overhead Key Softbox (Warm Ivory-Amber) & Rim Softbox (Cool Cyan)
  vec3 keyLightDir = normalize(vec3(0.42, 0.82, 0.38));
  vec3 rimLightDir = normalize(vec3(-0.55, 0.68, -0.48));
  float keySpot = pow(max(dot(d, keyLightDir), 0.0), 26.0);
  float rimSpot = pow(max(dot(d, rimLightDir), 0.0), 32.0);
  col += vec3(0.95, 0.84, 0.64) * keySpot * 0.55;
  col += vec3(0.14, 0.72, 0.82) * rimSpot * 0.38;

  fragColor = vec4(col, 1.0);
}`;

export const WORKBENCH_VS = `#version 300 es
precision highp float;
precision highp int;

layout(location = 0) in vec3 aPos;
layout(location = 1) in vec3 aNorm;
layout(location = 2) in vec2 aUV;

uniform mat4 uProj;
uniform mat4 uView;

out vec3 vWorldPos;
out vec3 vNormal;
out vec2 vUV;

void main() {
  vWorldPos = aPos;
  vNormal = aNorm;
  vUV = aUV;
  gl_Position = uProj * uView * vec4(aPos, 1.0);
}`;

export const WORKBENCH_FS = `#version 300 es
precision highp float;
precision highp int;

in vec3 vWorldPos;
in vec3 vNormal;
in vec2 vUV;

uniform vec3 uCamPos;
uniform float uTime;
uniform vec4 uBoardRect;   // xy: halfWidth, halfDepth; zw: centerX, centerZ
uniform vec4 uSonarOrigin; // xyz: origin, w: active intensity (Board 02 sonar sweep)
uniform vec3 uSonarDir;    // xz sweep direction

out vec4 fragColor;

float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

void main() {
  vec2 p = vWorldPos.xz;
  float distOrigin = length(p);

  // Warm Anti-Static ESD Rubber Mat base (#0c1218 -> #111c24)
  float grain = hash21(floor(p * 110.0)) * 0.016 - 0.008;
  vec3 matCol = vec3(0.052, 0.084, 0.108) + grain;

  // Inner active ESD cutting/soldering mat rectangle [-9.5..9.5, -6.5..6.5]
  vec2 matBounds = abs(p) - vec2(9.2, 6.2);
  float insideMat = 1.0 - smoothstep(-0.08, 0.08, max(matBounds.x, matBounds.y));

  // Brushed aluminum bench surround outside the ESD mat
  float brush = sin(p.x * 45.0 + sin(p.y * 8.0) * 0.5) * 0.012;
  vec3 benchMetal = vec3(0.10, 0.13, 0.16) + brush;
  vec3 col = mix(benchMetal, matCol, insideMat);

  // ESD Mat silkscreened cm & 5cm precision grid
  if (insideMat > 0.01) {
    vec2 g1 = abs(fract(p * 1.0 - 0.5) - 0.5) / fwidth(p * 1.0);
    float line1 = 1.0 - min(min(g1.x, g1.y), 1.0);

    vec2 g5 = abs(fract(p * 0.25 - 0.5) - 0.5) / fwidth(p * 0.25);
    float line5 = 1.0 - min(min(g5.x, g5.y), 1.0);

    float borderLine = 1.0 - smoothstep(0.0, 0.06, abs(max(matBounds.x, matBounds.y) + 0.35));
    vec3 gridInk = vec3(0.09, 0.24, 0.26);
    col = mix(col, gridInk, line1 * 0.24 * insideMat);
    col = mix(col, vec3(0.12, 0.36, 0.34), (line5 * 0.42 + borderLine * 0.65) * insideMat);
  }

  // Ambient occlusion shadow directly under the PCB & standoffs
  vec2 dBoard = abs(p - uBoardRect.zw) - uBoardRect.xy;
  float sdBoard = length(max(dBoard, 0.0)) + min(max(dBoard.x, dBoard.y), 0.0);
  float ao = smoothstep(-0.25, 1.15, sdBoard);
  col *= mix(0.32, 1.0, ao);

  // Overhead warm studio worklamp pool
  float lampPool = exp(-dot(p, p) * 0.018);
  col *= (0.58 + 0.68 * lampPool);

  // Live Ultrasonic Sonar Ping Rings on Workbench (Board 02 ESP32 Radar)
  if (uSonarOrigin.w > 0.01) {
    vec2 rel = p - uSonarOrigin.xz;
    float r = length(rel);
    vec2 dir2 = r > 1e-4 ? rel / r : vec2(0.0, 1.0);
    vec2 aim2 = normalize(uSonarDir.xz + vec2(0.0, 1e-5));
    float cone = smoothstep(0.42, 0.92, dot(dir2, aim2));
    float wave = fract(r * 0.55 - uTime * 1.85);
    float ring = smoothstep(0.84, 0.96, wave) * (1.0 - smoothstep(0.96, 1.0, wave));
    float rangeFade = exp(-r * 0.22) * smoothstep(0.25, 0.85, r);
    vec3 sonarCol = mix(vec3(0.06, 0.72, 0.50), vec3(0.13, 0.83, 0.93), 0.65);
    col += sonarCol * (ring * 0.95 + cone * 0.16) * rangeFade * uSonarOrigin.w;
  }

  // Distance fade into dark studio floor
  float edgeFade = smoothstep(22.0, 9.5, distOrigin);
  col = mix(vec3(0.035, 0.054, 0.072), col, edgeFade);

  fragColor = vec4(col, 1.0);
}`;

export const PCB_SUBSTRATE_VS = `#version 300 es
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
  vNormal = normalize(mat3(uModel) * aNorm);
  vUV = aUV;
  gl_Position = uProj * uView * wp;
}`;

export const PCB_SUBSTRATE_FS = `#version 300 es
precision highp float;
precision highp int;

in vec3 vWorldPos;
in vec3 vLocalPos;
in vec3 vNormal;
in vec2 vUV;

uniform vec3 uCamPos;
uniform float uTime;
uniform int uBoardTheme;    // 0: Emerald UNO, 1: Dark-Teal ESP32, 2: Amber-Gold 555, 3: Navy-Cyan Arm Shield
uniform float uPowerAmt;    // 0..1 circuit live power
uniform vec4 uHoverSpot;    // xyz: world hover pos, w: active radius
uniform int uTraceCount;
uniform vec4 uTraces[20];   // (x1, z1, x2, z2) in board space

out vec4 fragColor;

float segDist(vec2 p, vec2 a, vec2 b, out float hOut) {
  vec2 pa = p - a;
  vec2 ba = b - a;
  float h = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-6), 0.0, 1.0);
  hOut = h;
  return length(pa - ba * h);
}

void main() {
  vec3 N = normalize(vNormal);
  vec3 V = normalize(uCamPos - vWorldPos);
  vec3 L1 = normalize(vec3(0.42, 0.84, 0.36));
  vec3 L2 = normalize(vec3(-0.55, 0.65, -0.45));

  // FR-4 Chamfered / Side Fiberglass Edge Laminate
  if (abs(N.y) < 0.65) {
    float ply = 0.5 + 0.5 * sin(vLocalPos.y * 95.0);
    vec3 fr4 = mix(vec3(0.62, 0.50, 0.26), vec3(0.78, 0.66, 0.38), ply);
    float diff = max(dot(N, L1), 0.0) * 0.75 + 0.35;
    fragColor = vec4(fr4 * diff, 1.0);
    return;
  }

  // Theme Solder-Mask Base Colors
  vec3 maskBase = vec3(0.022, 0.235, 0.145); // 0: Deep Rich Emerald #0f6b4a
  if (uBoardTheme == 1) {
    maskBase = vec3(0.018, 0.175, 0.215);    // 1: Deep Matte Dark-Teal IoT
  } else if (uBoardTheme == 2) {
    maskBase = vec3(0.265, 0.148, 0.028);    // 2: Rich Retro Amber-Gold Synth
  } else if (uBoardTheme == 3) {
    maskBase = vec3(0.022, 0.125, 0.205);    // 3: Deep Industrial Navy-Cyan Shield
  }

  vec2 bp = vLocalPos.xz;

  // Subsurface woven fiberglass weave under glossy solder-mask
  float weave = (sin(bp.x * 58.0) * sin(bp.y * 58.0)) * 0.018;
  vec3 col = maskBase + weave;

  // Subtle decorative ground-plane copper hatch pattern under mask
  float diagA = abs(fract((bp.x + bp.y) * 3.2) - 0.5);
  float groundCopper = smoothstep(0.44, 0.49, diagA) * 0.06;
  col += maskBase * groundCopper;

  // Explicit PCB Copper Traces + Racing Electron Pulses when Powered!
  float traceMask = 0.0;
  float pulseGlow = 0.0;
  for (int i = 0; i < 20; i++) {
    if (i >= uTraceCount) break;
    vec4 tr = uTraces[i];
    float h = 0.0;
    float d = segDist(bp, tr.xy, tr.zw, h);
    float trLine = 1.0 - smoothstep(0.038, 0.062, d);
    traceMask = max(traceMask, trLine);

    if (uPowerAmt > 0.01 && d < 0.13) {
      float packet = fract(h * 1.8 - uTime * (1.85 + float(i % 3) * 0.35) + float(i) * 0.21);
      float spark = exp(-pow((packet - 0.5) * 5.2, 2.0));
      float radial = exp(-d * d * 240.0);
      pulseGlow += spark * radial * uPowerAmt;
    }
  }

  // Raised golden-copper trace tint beneath translucent solder mask
  vec3 traceTint = mix(maskBase * 1.55 + vec3(0.14, 0.11, 0.03), vec3(0.82, 0.62, 0.20), 0.38);
  col = mix(col, traceTint, traceMask * 0.88);

  // Silkscreen Perimeter Border & Fiducial Marks
  vec2 halfExt = vec2(3.65, 2.55);
  vec2 edgeDist = halfExt - abs(bp);
  float silkBorder = (1.0 - smoothstep(0.0, 0.035, abs(min(edgeDist.x, edgeDist.y) - 0.14))) *
                     step(0.05, min(edgeDist.x, edgeDist.y));

  // Subtle silkscreen ruler ticks along bottom & top edges
  float tickMask = 0.0;
  if (abs(abs(bp.y) - 2.34) < 0.06 && abs(bp.x) < 3.2) {
    float tx = abs(fract(bp.x * 3.937) - 0.5);
    tickMask = (1.0 - smoothstep(0.0, 0.07, tx)) * 0.65;
  }
  vec3 silkWhite = vec3(0.92, 0.95, 0.94);
  col = mix(col, silkWhite, clamp(silkBorder * 0.72 + tickMask * 0.55, 0.0, 0.85));

  // PBR-inspired glossy solder-mask lighting
  float diff1 = max(dot(N, L1), 0.0);
  float diff2 = max(dot(N, L2), 0.0);
  vec3 H1 = normalize(L1 + V);
  vec3 H2 = normalize(L2 + V);
  float spec1 = pow(max(dot(N, H1), 0.0), 48.0) * 0.38;
  float spec2 = pow(max(dot(N, H2), 0.0), 36.0) * 0.22;
  float fresnel = pow(1.0 - max(dot(N, V), 0.0), 4.0) * 0.14;

  vec3 lit = col * (0.34 + diff1 * 0.72 + diff2 * 0.28);
  lit += vec3(1.0, 0.95, 0.86) * spec1 + vec3(0.35, 0.85, 0.95) * spec2 + vec3(0.12, 0.22, 0.24) * fresnel;

  // Racing Electron Current Pulses along traces when powered!
  if (pulseGlow > 0.001) {
    vec3 electronCol = (uBoardTheme == 2)
      ? vec3(1.0, 0.72, 0.18)
      : mix(vec3(0.13, 0.85, 0.95), vec3(0.96, 0.74, 0.20), 0.35);
    lit += electronCol * min(pulseGlow, 2.2) * 0.95;
  }

  // Subtle 3D Workbench Cursor Inspection Ring on PCB
  if (uHoverSpot.w > 0.01) {
    float hd = length(vWorldPos.xz - uHoverSpot.xz);
    float ring = 1.0 - smoothstep(0.0, 0.035, abs(hd - uHoverSpot.w));
    lit += vec3(0.20, 0.86, 0.76) * ring * 0.55;
  }

  fragColor = vec4(lit, 1.0);
}`;

export const ELEC_PART_VS = `#version 300 es
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
  vNormal = normalize(mat3(uModel) * aNorm);
  vUV = aUV;
  gl_Position = uProj * uView * wp;
}`;

export const ELEC_PART_FS = `#version 300 es
precision highp float;
precision highp int;

in vec3 vWorldPos;
in vec3 vLocalPos;
in vec3 vNormal;
in vec2 vUV;

uniform vec3 uCamPos;
uniform float uTime;
uniform int uMatType;
uniform vec3 uBaseColor;
uniform float uParam1; // solderHeat / ledPower / resistorSeed / hoverGlow / tipHeat
uniform float uParam2; // secondary state

out vec4 fragColor;

void main() {
  vec3 N = normalize(vNormal);
  vec3 V = normalize(uCamPos - vWorldPos);
  vec3 L1 = normalize(vec3(0.42, 0.84, 0.36));
  vec3 L2 = normalize(vec3(-0.55, 0.65, -0.45));
  vec3 H1 = normalize(L1 + V);
  vec3 H2 = normalize(L2 + V);

  float diff1 = max(dot(N, L1), 0.0);
  float diff2 = max(dot(N, L2), 0.0);
  float fresnel = pow(1.0 - max(dot(N, V), 0.0), 3.5);

  // 6: Ghost Placement Blueprint Hologram (Translucent)
  if (uMatType == 6) {
    float scan = 0.55 + 0.45 * sin(vWorldPos.y * 42.0 - uTime * 6.0);
    float pulse = 0.72 + 0.28 * sin(uTime * 4.5);
    float rim = pow(1.0 - abs(dot(N, V)), 1.8);
    float hovered = uParam1; // 0 or 1
    vec3 holoCol = mix(vec3(0.12, 0.82, 0.68), vec3(0.98, 0.74, 0.20), hovered);
    float alpha = clamp(0.22 + rim * 0.48 + hovered * 0.22, 0.18, 0.82) * pulse;
    vec3 finalHolo = holoCol * (0.75 + scan * 0.55 + rim * 0.9);
    fragColor = vec4(finalHolo, alpha);
    return;
  }

  vec3 albedo = uBaseColor;
  float specPow = 32.0;
  float specAmt = 0.35;
  vec3 emissive = vec3(0.0);

  if (uMatType == 0) {
    // Matte Dark-Charcoal Epoxy DIP IC Package + Laser-etched Top Markings
    float micro = fract(sin(dot(floor(vWorldPos.xz * 180.0), vec2(12.9898, 78.233))) * 43758.5453);
    albedo = uBaseColor + (micro - 0.5) * 0.025;
    if (N.y > 0.85) {
      // Crisp silver-ivory IC part-number text bars & Pin-1 notch indicator
      float stripe1 = step(0.32, vUV.y) * step(vUV.y, 0.42) * step(0.18, vUV.x) * step(vUV.x, 0.82);
      float stripe2 = step(0.55, vUV.y) * step(vUV.y, 0.62) * step(0.22, vUV.x) * step(vUV.x, 0.66);
      float dash = step(0.35, fract(vUV.x * 11.0));
      float pin1Dot = 1.0 - smoothstep(0.05, 0.08, length(vUV - vec2(0.14, 0.24)));
      float mark = max((stripe1 + stripe2) * dash * 0.75, pin1Dot);
      albedo = mix(albedo, vec3(0.78, 0.82, 0.84), clamp(mark, 0.0, 1.0));
    }
    specPow = 18.0;
    specAmt = 0.18;
  } else if (uMatType == 1) {
    // Brushed Aluminum / Tin-Plated Metal (IC Leads, USB-B, HC-SR04 Eyes, Heatsink, Arm Struts)
    float aniso = sin((vWorldPos.x + vWorldPos.y * 1.7 + vWorldPos.z) * 85.0) * 0.04;
    albedo = uBaseColor + aniso;
    specPow = 64.0;
    specAmt = 0.85;
  } else if (uMatType == 2) {
    // ENIG Gold-Plated Copper Pads, Header Pins & Piezo Resonator (#f5b82e)
    albedo = vec3(0.96, 0.72, 0.18) * (0.9 + 0.1 * uBaseColor);
    specPow = 72.0;
    specAmt = 0.95;
    // Highlight unsoldered target pad ring subtly when uParam1 > 0
    emissive += vec3(0.98, 0.68, 0.15) * uParam1 * (0.35 + 0.25 * sin(uTime * 6.5));
  } else if (uMatType == 3) {
    // Molten-to-Mirror Silver-Tin Solder Cone!
    float heat = clamp(uParam1, 0.0, 1.0);
    vec3 coolSilver = vec3(0.84, 0.89, 0.94);
    vec3 moltenCol = mix(vec3(0.98, 0.44, 0.08), vec3(1.0, 0.86, 0.42), heat * heat);
    albedo = mix(coolSilver, moltenCol, heat * 0.85);
    specPow = mix(96.0, 42.0, heat);
    specAmt = mix(1.15, 0.65, heat);
    emissive += moltenCol * heat * 1.65;
  } else if (uMatType == 4) {
    // Glossy Colored Translucent LED Dome / 7-Segment Bar / VU Segment
    float glow = max(uParam1, 0.0);
    albedo = mix(uBaseColor * 0.38, uBaseColor, clamp(glow, 0.0, 1.0));
    specPow = 88.0;
    specAmt = 0.92;
    // Bright internal core emission + subsurface scattering
    float core = 0.55 + 0.45 * max(dot(N, V), 0.0);
    emissive += uBaseColor * glow * (1.25 * core + 0.45) + vec3(1.0, 0.97, 0.88) * max(glow - 0.85, 0.0) * 0.55;
  } else if (uMatType == 5) {
    // Ceramic Axial Resistor with 4 Procedural EIA Color Bands
    albedo = vec3(0.85, 0.74, 0.54); // Warm tan ceramic body
    float u = vUV.x;
    int seed = int(uParam1);
    vec3 b1 = (seed % 2 == 0) ? vec3(0.55, 0.24, 0.08) : vec3(0.92, 0.24, 0.18); // Brown / Red
    vec3 b2 = (seed % 3 == 0) ? vec3(0.06, 0.62, 0.42) : vec3(0.96, 0.46, 0.09); // Emerald / Orange
    vec3 b3 = vec3(0.92, 0.24, 0.18); // Red multiplier (220R / 330R)
    vec3 b4 = vec3(0.95, 0.72, 0.18); // Gold 5% tolerance band
    if (abs(u - 0.24) < 0.045) albedo = b1;
    else if (abs(u - 0.39) < 0.045) albedo = b2;
    else if (abs(u - 0.54) < 0.045) albedo = b3;
    else if (abs(u - 0.76) < 0.040) albedo = b4;
    specPow = 40.0;
    specAmt = 0.42;
  } else if (uMatType == 7) {
    // Flexible Silicone Jumper Wire with Live Signal Shimmer
    albedo = uBaseColor;
    specPow = 24.0;
    specAmt = 0.28;
    if (uParam1 > 0.01) {
      float wave = fract(vUV.y * 2.0 - uTime * 2.6);
      float pulse = exp(-pow((wave - 0.5) * 4.5, 2.0));
      emissive += mix(uBaseColor, vec3(0.95, 0.92, 0.75), 0.45) * pulse * uParam1 * 0.55;
    }
  } else if (uMatType == 8) {
    // 380C Soldering Iron Conical Tip (Tinned Silver Point + Temper Collar + Thermal Glow)
    float tipDist = clamp(vUV.y, 0.0, 1.0); // 0 at sharp tip, 1 at base barrel
    vec3 tinned = vec3(0.88, 0.91, 0.95);
    vec3 copperTemper = vec3(0.76, 0.46, 0.22);
    albedo = mix(tinned, copperTemper, smoothstep(0.28, 0.85, tipDist));
    specPow = 84.0;
    specAmt = 0.95;
    float tipGlow = (1.0 - smoothstep(0.0, 0.58, tipDist)) * (0.45 + 0.55 * uParam1);
    emissive += vec3(1.0, 0.48, 0.10) * tipGlow * 1.35;
  } else {
    // 9: Industrial Molded Housing / Capacitor Sleeve / Servo Body / Ergonomic Handle
    specPow = 36.0;
    specAmt = 0.36;
    emissive += uBaseColor * uParam1 * 0.35;
  }

  float spec1 = pow(max(dot(N, H1), 0.0), specPow) * specAmt;
  float spec2 = pow(max(dot(N, H2), 0.0), specPow * 0.75) * (specAmt * 0.55);

  // Metallic reflection tinting for metals (types 1, 2, 3, 8)
  bool isMetal = (uMatType == 1 || uMatType == 2 || uMatType == 3 || uMatType == 8);
  vec3 diffTerm = isMetal ? albedo * 0.38 : albedo;
  vec3 specTint1 = isMetal ? mix(vec3(1.0, 0.96, 0.88), albedo, 0.65) : vec3(1.0, 0.96, 0.90);
  vec3 specTint2 = isMetal ? mix(vec3(0.25, 0.85, 0.95), albedo, 0.55) : vec3(0.25, 0.82, 0.92);

  vec3 envBounce = mix(vec3(0.05, 0.08, 0.10), vec3(0.16, 0.22, 0.26), N.y * 0.5 + 0.5);
  vec3 col = diffTerm * (envBounce + diff1 * 0.82 + diff2 * 0.34);
  col += specTint1 * spec1 + specTint2 * spec2;
  col += (isMetal ? albedo : vec3(0.16, 0.28, 0.32)) * fresnel * 0.24;
  col += emissive;

  fragColor = vec4(col, 1.0);
}`;

export const PARTICLE_VS = `#version 300 es
precision highp float;
precision highp int;

layout(location = 0) in vec2 aQuad;
layout(location = 1) in vec4 iPosSize;    // xyz: world pos, w: size
layout(location = 2) in vec4 iColorAlpha; // rgb: color, a: alpha
layout(location = 3) in vec2 iKindPhase;  // x: 0=rosin smoke, 1=solder spark, y: phase/angle

uniform mat4 uProj;
uniform mat4 uView;
uniform vec3 uCamRight;
uniform vec3 uCamUp;

out vec2 vUV;
out vec4 vColor;
out vec2 vKindPhase;

void main() {
  float ang = iKindPhase.y;
  float c = cos(ang);
  float s = sin(ang);
  vec2 rq = vec2(aQuad.x * c - aQuad.y * s, aQuad.x * s + aQuad.y * c);

  vec3 worldPos = iPosSize.xyz + (uCamRight * rq.x + uCamUp * rq.y) * iPosSize.w;
  vUV = aQuad; // [-1..1]
  vColor = iColorAlpha;
  vKindPhase = iKindPhase;
  gl_Position = uProj * uView * vec4(worldPos, 1.0);
}`;

export const PARTICLE_FS = `#version 300 es
precision highp float;
precision highp int;

in vec2 vUV;
in vec4 vColor;
in vec2 vKindPhase;

out vec4 fragColor;

void main() {
  float r2 = dot(vUV, vUV);
  if (r2 > 1.0) discard;

  if (vKindPhase.x < 0.5) {
    // Soft curling Rosin Flux Smoke Wisp
    float r = sqrt(r2);
    float swirl = sin(vUV.x * 3.8 + vKindPhase.y * 2.0) * cos(vUV.y * 3.4 - vKindPhase.y) * 0.22;
    float soft = pow(max(1.0 - r + swirl * (1.0 - r), 0.0), 2.1);
    fragColor = vec4(vColor.rgb, vColor.a * soft * 0.55);
  } else {
    // Incandescent Golden Solder Spark
    float core = exp(-r2 * 5.5);
    vec3 col = mix(vColor.rgb, vec3(1.0, 0.97, 0.84), core * 0.7);
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
uniform sampler2D uSceneTex;
uniform vec2 uTexelSize;

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
  vec3 hdr = texture(uSceneTex, vUV).rgb;

  // 8-tap soft emissive bloom halo for glowing LEDs, molten solder & electron pulses
  vec3 bloom = vec3(0.0);
  vec2 r1 = uTexelSize * 2.5;
  vec2 r2 = uTexelSize * 5.5;

  vec3 s0 = texture(uSceneTex, vUV + vec2(r1.x, 0.0)).rgb;
  vec3 s1 = texture(uSceneTex, vUV - vec2(r1.x, 0.0)).rgb;
  vec3 s2 = texture(uSceneTex, vUV + vec2(0.0, r1.y)).rgb;
  vec3 s3 = texture(uSceneTex, vUV - vec2(0.0, r1.y)).rgb;
  vec3 s4 = texture(uSceneTex, vUV + vec2(r2.x, r2.y)).rgb;
  vec3 s5 = texture(uSceneTex, vUV + vec2(-r2.x, r2.y)).rgb;
  vec3 s6 = texture(uSceneTex, vUV + vec2(r2.x, -r2.y)).rgb;
  vec3 s7 = texture(uSceneTex, vUV + vec2(-r2.x, -r2.y)).rgb;

  bloom += max(s0 - vec3(0.78), vec3(0.0));
  bloom += max(s1 - vec3(0.78), vec3(0.0));
  bloom += max(s2 - vec3(0.78), vec3(0.0));
  bloom += max(s3 - vec3(0.78), vec3(0.0));
  bloom += max(s4 - vec3(0.78), vec3(0.0)) * 0.7;
  bloom += max(s5 - vec3(0.78), vec3(0.0)) * 0.7;
  bloom += max(s6 - vec3(0.78), vec3(0.0)) * 0.7;
  bloom += max(s7 - vec3(0.78), vec3(0.0)) * 0.7;

  hdr += bloom * 0.16;

  // ACES Filmic Tone Mapping + Gamma
  vec3 mapped = acesFilm(hdr * 1.06);
  mapped = pow(mapped, vec3(1.0 / 2.2));

  // Subtle studio lens vignette
  vec2 q = vUV - 0.5;
  float vig = 1.0 - dot(q, q) * 0.34;
  mapped *= clamp(vig, 0.75, 1.0);

  fragColor = vec4(mapped, 1.0);
}`;
