// Raw WebGL2 (#version 300 es) Shaders for X-Ray Anatomy Mirror:
// Studio Backdrop, GPU-Skinned Multi-Layer Anatomy + 3D Optical Aperture Peel,
// 3D Fluoroscopy Scanner Ring, Instanced Blood/Synapse Particles & ACES Post-Process.
// STRICT PALETTE: Medical Cyan (#22d3ee), Synaptic Gold (#f5b82e), Arterial Coral (#ef4444),
// Myology Terracotta (#d95b38), Bone Ivory (#f2eadc), Alabaster Stone (#d8cec0), Dark Slate (#081017).

export const BG_VS = `#version 300 es
precision highp float;
precision highp int;

out vec2 vUv;

void main() {
  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  vUv = p;
  gl_Position = vec4(p * 2.0 - 1.0, 0.9999, 1.0);
}`;

export const BG_FS = `#version 300 es
precision highp float;
precision highp int;

in vec2 vUv;
uniform vec2 uRes;
uniform float uTime;
uniform float uFullScanMix;
uniform float uNeuralStorm;
out vec4 fragColor;

void main() {
  vec2 aspectUv = (vUv - 0.5) * vec2(uRes.x / max(uRes.y, 1.0), 1.0);
  float rad = length(aspectUv);

  // Diagnostic Dark Slate Base (#081017 -> #0d1b26 center aura, zero purple)
  vec3 col = mix(vec3(0.048, 0.098, 0.138), vec3(0.020, 0.041, 0.062), smoothstep(0.08, 0.95, rad));

  // Subtle Fluoroscopy Millimeter Calibration Grid
  vec2 gridPx = vUv * uRes;
  vec2 gMajor = abs(fract(gridPx / 64.0 - 0.5) - 0.5) / (1.0 / 64.0);
  vec2 gMinor = abs(fract(gridPx / 16.0 - 0.5) - 0.5) / (1.0 / 16.0);
  float lineMaj = 1.0 - smoothstep(0.0, 1.25, min(gMajor.x, gMajor.y));
  float lineMin = 1.0 - smoothstep(0.0, 1.15, min(gMinor.x, gMinor.y));
  float gridFade = (1.0 - smoothstep(0.18, 0.85, rad)) * (0.45 + 0.35 * uFullScanMix);

  col += vec3(0.045, 0.21, 0.26) * lineMaj * 0.28 * gridFade;
  col += vec3(0.035, 0.14, 0.18) * lineMin * 0.10 * gridFade;

  // Center Studio Key & Rim Backlight Halo behind Bust
  float studioGlow = exp(-rad * rad * 3.4);
  vec3 haloTint = mix(vec3(0.06, 0.18, 0.23), vec3(0.10, 0.28, 0.34), uFullScanMix);
  haloTint += vec3(0.16, 0.11, 0.02) * uNeuralStorm * studioGlow;
  col += haloTint * studioGlow * 0.65;

  // Travelling Diagnostic Vertical Sweep Line
  float sweepY = fract(uTime * 0.09);
  float sweep = exp(-abs(vUv.y - sweepY) * 55.0) * 0.035;
  col += vec3(0.13, 0.82, 0.93) * sweep;

  fragColor = vec4(col, 1.0);
}`;

// Shared GPU-Articulated Anatomy Vertex Shader:
// Drives Eye Tracking, Blinking, Respiratory Ribcage, Cardiac Contraction,
// Muscle Bulge, TMJ Mandible Hinge (0..34 deg) & Smooth Cervical Neck/Head Rotation!
export const ANAT_VS = `#version 300 es
precision highp float;
precision highp int;

layout(location = 0) in vec3 aPos;
layout(location = 1) in vec3 aNorm;
layout(location = 2) in vec4 aAnat;
// aAnat.x = headWeight [0..1]
// aAnat.y = jawWeight [0..1]
// aAnat.z = integer organId + fractional coord [0..0.99]
// aAnat.w = morphCode:
//   [0.00..0.98]: ribcage breath weight
//   [1.00..1.98]: upper eyelid blink weight (w - 1.0)
//   [2.00..2.98]: eyeball tracking (2.2 = subject Left +X, 2.8 = subject Right -X)
//   [3.00..3.98]: muscle flex outward bulge (w - 3.0)
//   [4.00..5.00]: 4-chamber heart systolic contraction (w - 4.0)

uniform mat4 uProj;
uniform mat4 uView;
uniform mat4 uMatBust;
uniform vec3 uNeckAngles; // (yaw, pitch, roll) in radians
uniform vec3 uJawKin;     // (angleRad, glideY, glideZ)
uniform vec2 uEyeAngles;  // (yaw, pitch) in radians
uniform float uBreath;
uniform float uBlink;
uniform float uHeartPulse;
uniform float uMuscleFlex;

out vec3 vWorldPos;
out vec3 vWorldNorm;
out vec3 vLocalPos;
out vec4 vAnat;

mat3 rotX(float a) {
  float c = cos(a), s = sin(a);
  return mat3(1.0, 0.0, 0.0,  0.0, c, s,  0.0, -s, c);
}

mat3 rotY(float a) {
  float c = cos(a), s = sin(a);
  return mat3(c, 0.0, -s,  0.0, 1.0, 0.0,  s, 0.0, c);
}

mat3 rotZ(float a) {
  float c = cos(a), s = sin(a);
  return mat3(c, s, 0.0,  -s, c, 0.0,  0.0, 0.0, 1.0);
}

void main() {
  vec3 pos = aPos;
  vec3 nrm = normalize(aNorm);
  float headW = aAnat.x;
  float jawW = aAnat.y;
  float morph = aAnat.w;

  // 1. Local Physiological Morphs (Respiration, Eyelid Blink, Eye Tracking, Muscle Bulge, Heartbeat)
  if (morph > 0.001 && morph < 0.99) {
    float bw = morph * uBreath;
    pos.x *= (1.0 + 0.042 * bw);
    pos.z += (pos.z >= 0.0 ? 0.052 : -0.018) * bw;
    pos.y += 0.024 * bw;
  } else if (morph >= 1.0 && morph < 1.99) {
    float blinkW = (morph - 1.0) * uBlink;
    pos.y -= 0.082 * blinkW;
    pos.z += 0.018 * blinkW;
  } else if (morph >= 2.0 && morph < 2.99) {
    vec3 eyePivot = (morph < 2.5) ? vec3(0.30, 0.58, 0.57) : vec3(-0.30, 0.58, 0.57);
    mat3 mEye = rotY(uEyeAngles.x) * rotX(uEyeAngles.y);
    pos = eyePivot + mEye * (pos - eyePivot);
    nrm = mEye * nrm;
  } else if (morph >= 3.0 && morph < 3.99) {
    float bulgeW = (morph - 3.0) * uMuscleFlex;
    pos += nrm * (0.042 * bulgeW);
  } else if (morph >= 4.0) {
    float hw = clamp(morph - 4.0, 0.0, 1.0);
    vec3 heartPivot = vec3(0.19, -0.96, 0.15);
    vec3 rel = pos - heartPivot;
    // Ventricular systolic squeeze & slight torsional wring
    float squeeze = 1.0 - 0.145 * uHeartPulse * hw;
    float expandTop = 1.0 + 0.075 * uHeartPulse * (1.0 - hw);
    float scaleFactor = mix(expandTop, squeeze, smoothstep(-0.08, 0.18, -rel.y));
    mat3 wring = rotY(0.11 * uHeartPulse * hw);
    rel = wring * (rel * vec3(scaleFactor, 1.0 - 0.08 * uHeartPulse * hw, scaleFactor));
    pos = heartPivot + rel;
    nrm = wring * nrm;
  }

  // 2. TMJ Mandible Jaw Hinge (0..34 deg) + Anterior Condylar Glide
  if (jawW > 0.001) {
    vec3 tmjPivot = vec3(0.0, 0.34, 0.08);
    // Positive X rotation swings +Z chin downward (-Y) and slightly backward (-Z)
    mat3 mJaw = rotX(uJawKin.x * jawW);
    pos = tmjPivot + mJaw * (pos - tmjPivot);
    pos.y += uJawKin.y * jawW;
    pos.z += uJawKin.z * jawW;
    nrm = mJaw * nrm;
  }

  // 3. Articulated Cervical Spine & Cranium Rotation
  if (headW > 0.001) {
    vec3 neckPivot = vec3(0.0, -0.26, -0.06);
    vec3 ang = uNeckAngles * headW;
    mat3 mNeck = rotY(ang.x) * rotX(ang.y) * rotZ(ang.z);
    pos = neckPivot + mNeck * (pos - neckPivot);
    nrm = mNeck * nrm;
  }

  // 4. Bust World Rotation
  vec4 wp = uMatBust * vec4(pos, 1.0);
  vWorldPos = wp.xyz;
  vWorldNorm = normalize(mat3(uMatBust) * nrm);
  vLocalPos = aPos;
  vAnat = aAnat;
  gl_Position = uProj * uView * wp;
}`;

export const ANAT_FS = `#version 300 es
precision highp float;
precision highp int;

in vec3 vWorldPos;
in vec3 vWorldNorm;
in vec3 vLocalPos;
in vec4 vAnat;

uniform vec3 uCamPos;
uniform vec3 uLensPos;
uniform vec3 uLensAxis;
uniform float uLensRadius;
uniform float uFullScanMix;
uniform int uPassType;
// uPassType:
//   0 = Outer Museum Alabaster Bust + Pedestal (discards INSIDE scanner ring!)
//   1 = Myology Striated Muscle Layer
//   2 = Osteology Solid Bone & Enamel Teeth Layer
//   3 = Neuro-Cardiac Folded Cortex, Nerves, Eyes, Vessels & 4-Chamber Heart
//   4 = Radiograph X-Ray Bone Pass (Composite Mode 1 translucent/additive bone + crisp teeth)
//   5 = Translucent Cyan Ghost Skull & Ribcage Rim (Neuro-Cardiac Mode 3)
//   6 = Faint Myology Grazing Ghost Contour (Composite Mode 1)

uniform float uTime;
uniform float uHeartPulse;
uniform float uNeuralStorm;
uniform float uMuscleFlex;
uniform float uJawOpen;

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

void main() {
  vec3 V = normalize(uCamPos - vWorldPos);
  vec3 N = normalize(vWorldNorm);
  if (!gl_FrontFacing) N = -N;

  float organId = floor(vAnat.z + 0.0001);
  float subCoord = fract(vAnat.z);

  // Exact 3D Ray-Plane Intersection against Physical Fluoroscopy Scanner Ring
  vec3 rayDir = -V;
  float denom = dot(rayDir, uLensAxis);
  float safeDenom = abs(denom) > 0.0002 ? denom : -0.0002;
  float tPlane = dot(uLensPos - uCamPos, uLensAxis) / safeDenom;
  vec3 hitPlane = uCamPos + rayDir * tPlane;
  float lensDist = length(hitPlane - uLensPos);
  float effR = mix(uLensRadius, 9.2, uFullScanMix * uFullScanMix);
  float normR = lensDist / max(effR, 0.05);

  vec3 keyDir = normalize(vec3(0.45, 0.62, 0.72));
  vec3 fillDir = normalize(vec3(-0.65, 0.15, 0.45));
  vec3 rimDir = normalize(vec3(0.0, 0.45, -0.88));
  float ndl = max(dot(N, keyDir), 0.0);
  float fill = max(dot(N, fillDir), 0.0);
  float backRim = max(dot(N, rimDir), 0.0);
  float ndv = clamp(abs(dot(N, V)), 0.0, 1.0);
  float fresnel = pow(1.0 - ndv, 2.0);

  // =========================================================================
  // PASS 0: OUTER MUSEUM ALABASTER-WARM-SKIN BUST & DIAGNOSTIC PEDESTAL
  // =========================================================================
  if (uPassType == 0) {
    bool isPedestal = (organId > 3.5);
    if (!isPedestal && normR < 0.985) {
      discard;
    }

    vec3 col;
    if (isPedestal) {
      // Brushed Dark Slate & Synaptic Brass Diagnostic Plinth
      float brassBand = smoothstep(0.72, 0.78, subCoord);
      vec3 slate = vec3(0.065, 0.105, 0.138);
      vec3 brass = vec3(0.82, 0.61, 0.22);
      vec3 baseAlbedo = mix(slate, brass, brassBand);
      vec3 H = normalize(keyDir + V);
      float spec = pow(max(dot(N, H), 0.0), mix(28.0, 64.0, brassBand));
      col = baseAlbedo * (0.26 + 0.72 * ndl + 0.22 * fill) + vec3(0.95, 0.80, 0.45) * spec * (0.25 + 0.55 * brassBand);
      col += vec3(0.13, 0.83, 0.93) * fresnel * 0.16;
      fragColor = vec4(col, 1.0);
      return;
    }

    // Subtle sculpted stone micro-grain
    float grain = vnoise3(vLocalPos * 26.0) * 0.035;

    if (organId > 2.5 && organId < 3.5) {
      // Sculpted Outer Eyeballs with Live Cursor-Tracking Iris & Corneal Specular!
      vec3 eyeCenter = (vAnat.w < 2.5) ? vec3(0.30, 0.58, 0.57) : vec3(-0.30, 0.58, 0.57);
      vec3 localEyeDir = normalize(vLocalPos - eyeCenter);
      float forwardAng = acos(clamp(localEyeDir.z, -1.0, 1.0));
      float scleraMix = smoothstep(0.42, 0.48, forwardAng);
      float pupilMix = 1.0 - smoothstep(0.16, 0.20, forwardAng);

      // Warm Amber-Teal Diagnostic Iris (zero purple)
      float irisSpoke = 0.5 + 0.5 * sin(atan(localEyeDir.y, localEyeDir.x) * 22.0);
      vec3 irisCol = mix(vec3(0.16, 0.36, 0.40), vec3(0.62, 0.46, 0.22), irisSpoke * 0.65);
      vec3 eyeAlbedo = mix(irisCol, vec3(0.89, 0.87, 0.83), scleraMix);
      eyeAlbedo = mix(eyeAlbedo, vec3(0.03, 0.05, 0.07), pupilMix);

      vec3 H = normalize(keyDir + V);
      float wetSpec = pow(max(dot(N, H), 0.0), 96.0) * 0.95;
      col = eyeAlbedo * (0.35 + 0.68 * ndl + 0.22 * fill) + vec3(1.0, 0.98, 0.94) * wetSpec;
    } else if (organId > 1.5 && organId < 2.5) {
      // Recessed Oral Cavity Interior (visible when mouth opens!)
      col = vec3(0.16, 0.07, 0.06) * (0.35 + 0.45 * ndl);
    } else {
      // Classical Museum Alabaster-Warm-Skin Bust (#d8cec0 + gallery chiaroscuro sculpting)
      vec3 alabaster = vec3(0.76, 0.71, 0.65) + grain;
      float lipWeight = (organId > 0.5 && organId < 1.5) ? subCoord : 0.0;
      vec3 warmLip = vec3(0.72, 0.45, 0.36);
      vec3 albedo = mix(alabaster, warmLip, lipWeight * 0.72);

      // Dramatic gallery key light from upper-right-front + cool slate shadow fill
      vec3 studioKey = normalize(vec3(0.58, 0.62, 0.52));
      float keyDiff = pow(clamp(dot(N, studioKey) * 0.82 + 0.18, 0.0, 1.0), 1.25);
      vec3 shadowAmb = vec3(0.09, 0.13, 0.16);
      vec3 sssTint = vec3(0.78, 0.48, 0.32) * pow(1.0 - ndv, 2.6) * 0.16;
      vec3 H = normalize(studioKey + V);
      float spec = pow(max(dot(N, H), 0.0), 38.0) * 0.20;

      col = albedo * (shadowAmb + vec3(0.88, 0.85, 0.80) * keyDiff + vec3(0.10, 0.16, 0.19) * fill)
          + sssTint + vec3(1.0, 0.95, 0.86) * spec;
      col += vec3(0.133, 0.827, 0.933) * (fresnel * 0.20 + backRim * 0.14);
    }

    // Glowing Golden-Cyan Holographic Peel Cross-Section Rim right around Scanner Ring!
    if (uFullScanMix < 0.98 && normR < 1.075) {
      float edgeBand = 1.0 - smoothstep(0.985, 1.075, normR);
      float hotCore = 1.0 - smoothstep(0.985, 1.016, normR);
      float scanTicks = 0.7 + 0.3 * sin(vWorldPos.y * 90.0 - uTime * 8.0);
      vec3 rimGlow = mix(vec3(0.133, 0.827, 0.933), vec3(0.961, 0.722, 0.180), hotCore);
      col = mix(col, rimGlow * 1.45 * scanTicks, edgeBand * 0.92);
    }

    fragColor = vec4(col, 1.0);
    return;
  }

  // =========================================================================
  // PASSES 1..6: INTERNAL ARTICULATED ANATOMY (CLIPPED TO 3D SCANNER APERTURE)
  // =========================================================================
  if (normR > 1.002) {
    discard;
  }

  float scanline = 0.94 + 0.06 * sin(vWorldPos.y * 110.0 - uTime * 5.0);
  float apertureEdge = (uFullScanMix < 0.98) ? smoothstep(0.90, 1.0, normR) : 0.0;

  // --- PASS 1: MYOLOGY (Striated Terracotta-Crimson Muscle Fibers + Pearlescent Tendons) ---
  if (uPassType == 1) {
    // subCoord [0..1] runs longitudinally from origin tendon (0) -> muscle belly (0.5) -> insertion tendon (1)
    float tendonMask = smoothstep(0.16, 0.02, subCoord) + smoothstep(0.84, 0.98, subCoord);
    tendonMask = clamp(tendonMask, 0.0, 1.0);

    // Directional transverse/longitudinal fiber striation
    float crossCoord = (vLocalPos.x * 34.0 + vLocalPos.y * 19.0 + vLocalPos.z * 27.0);
    float fiberWave = sin(crossCoord * 2.6 + vnoise3(vLocalPos * 18.0) * 4.5);
    float fiberBand = 0.5 + 0.5 * fiberWave;

    // Flexion brightens crimson arterial oxygenation in masseter/SCM/pectoralis
    float flexBoost = uMuscleFlex * ((organId < 1.5 || organId > 3.5) ? 1.0 : 0.65);
    vec3 muscleDark = vec3(0.42, 0.11, 0.07);
    vec3 muscleRich = mix(vec3(0.851, 0.357, 0.220), vec3(0.95, 0.32, 0.18), flexBoost);
    vec3 bellyCol = mix(muscleDark, muscleRich, 0.35 + 0.65 * fiberBand);

    // Pearlescent warm ivory aponeurosis & tendon sheath
    vec3 tendonCol = vec3(0.88, 0.82, 0.73) * (0.88 + 0.12 * fiberBand);
    vec3 albedo = mix(bellyCol, tendonCol, tendonMask * 0.82);

    // Perturb lighting slightly with fiber striations + wet fascia sheen
    vec3 N_fib = normalize(N + vec3(fiberWave * 0.09, fiberWave * 0.05, 0.0));
    float diffM = clamp((dot(N_fib, keyDir) + 0.20) / 1.20, 0.0, 1.0);
    vec3 H = normalize(keyDir + V);
    float wetFascia = pow(max(dot(N_fib, H), 0.0), 42.0) * (0.30 + 0.25 * flexBoost);

    vec3 col = albedo * (0.20 + 0.76 * diffM + 0.16 * fill) + vec3(1.0, 0.88, 0.76) * wetFascia;
    col += vec3(0.133, 0.827, 0.933) * fresnel * 0.26;
    col = col * scanline + vec3(0.133, 0.827, 0.933) * apertureEdge * 0.35;
    fragColor = vec4(col, 1.0);
    return;
  }

  // --- PASS 2: OSTEOLOGY (High-Detail Ivory Bone, Enamel Teeth & Radiograph Cyan Fresnel) ---
  if (uPassType == 2) {
    float bonePorosity = vnoise3(vLocalPos * 32.0);
    // Cranial suture lines on upper skull dome
    float sutureNoise = abs(sin(vLocalPos.x * 14.0 + bonePorosity * 3.2) * cos(vLocalPos.z * 11.0 + bonePorosity * 2.5));
    float sutureDark = (organId < 0.5 && vLocalPos.y > 0.55) ? (1.0 - smoothstep(0.0, 0.045, sutureNoise)) * 0.32 : 0.0;

    vec3 boneIvory = vec3(0.92, 0.88, 0.81) * (0.88 + 0.12 * bonePorosity) * (1.0 - sutureDark);
    vec3 trabecular = vec3(0.46, 0.41, 0.34);
    vec3 albedo = mix(trabecular, boneIvory, 0.30 + 0.70 * ndv);

    float specPow = 28.0;
    float specAmt = 0.20;
    if (organId > 0.5 && organId < 1.5) {
      // Gleaming Dental Enamel Crowns (28 Upper & Lower Teeth!)
      albedo = vec3(0.97, 0.95, 0.90);
      specPow = 76.0;
      specAmt = 0.55;
    } else if ((organId > 1.5 && organId < 2.5 && subCoord > 0.70) || (organId > 2.5 && subCoord > 0.76)) {
      // Intervertebral Fibrocartilage Discs & Costal Cartilage (translucent cyan-ivory)
      albedo = vec3(0.56, 0.78, 0.83);
      specPow = 48.0;
      specAmt = 0.34;
    }

    vec3 H = normalize(keyDir + V);
    float spec = pow(max(dot(N, H), 0.0), specPow) * specAmt;
    vec3 col = albedo * (0.18 + 0.76 * ndl + 0.18 * fill) + vec3(1.0, 0.98, 0.92) * spec;
    // Signature Medical Fluoroscopy Cyan Rim
    col += vec3(0.133, 0.827, 0.933) * fresnel * 0.52;
    col = col * scanline + vec3(0.133, 0.827, 0.933) * apertureEdge * 0.38;
    fragColor = vec4(col, 1.0);
    return;
  }

  // --- PASS 3: NEURO-CARDIAC (Folded Cerebral Cortex, Golden Synapses, Eyes/Nerves & 4-Chamber Heart) ---
  if (uPassType == 3) {
    vec3 col = vec3(0.1);
    vec3 H = normalize(keyDir + V);

    if (organId < 2.5) {
      // Organ 1: Cerebral Cortex Hemispheres | Organ 2: Cerebellum Folia
      float fineFold = 0.5 + 0.5 * sin(
        (organId < 1.5 ? 28.0 : 56.0) * vLocalPos.y +
        vnoise3(vLocalPos * (organId < 1.5 ? 16.0 : 26.0)) * 5.8
      );
      float gyrus = clamp(mix(subCoord, fineFold, 0.42), 0.0, 1.0);
      float sulcusAO = smoothstep(0.16, 0.74, gyrus);

      // High-Contrast Deep Sulci Fissures & Warm Cortical Gyri + Cyan Rim (zero purple!)
      vec3 sulcusCol = vec3(0.08, 0.06, 0.05);
      vec3 gyrusCol = mix(vec3(0.58, 0.44, 0.37), vec3(0.26, 0.62, 0.70), 0.25);
      vec3 tissue = mix(sulcusCol, gyrusCol, sulcusAO);

      // Traveling Golden Action-Potential Neural Lightning Waves across Gyri!
      float waveSpeed = 3.0 + 4.8 * uNeuralStorm;
      float apWave1 = sin(vLocalPos.z * 10.5 - vLocalPos.y * 6.5 - uTime * waveSpeed + vnoise3(vLocalPos * 7.5) * 4.6);
      float apWave2 = sin(vLocalPos.x * 12.0 + vLocalPos.y * 9.0 + uTime * (waveSpeed * 1.22));
      float synapseFire = pow(max(0.0, apWave1 * 0.58 + apWave2 * 0.42), mix(6.0, 2.2, uNeuralStorm));
      synapseFire *= smoothstep(0.35, 0.82, gyrus);

      float spec = pow(max(dot(N, H), 0.0), 46.0) * 0.30 * sulcusAO;
      col = tissue * (0.22 + 0.72 * ndl + 0.16 * fill) + vec3(1.0, 0.92, 0.76) * spec;
      col += vec3(0.133, 0.827, 0.933) * fresnel * 0.46;
      // Blazing Synaptic Gold (#f5b82e) cortical action potentials!
      col += vec3(0.98, 0.74, 0.16) * synapseFire * (1.65 + 2.4 * uNeuralStorm);
    } else if (organId < 3.5) {
      // Organ 3: Brainstem, Spinal Cord & Optic Nerve Tracts
      float impulse = pow(max(0.0, sin(subCoord * 18.0 - uTime * (5.5 + 5.0 * uNeuralStorm))), 5.0);
      vec3 nerveBase = vec3(0.68, 0.84, 0.88);
      col = nerveBase * (0.30 + 0.65 * ndl) + vec3(0.133, 0.827, 0.933) * fresnel * 0.65;
      col += vec3(0.961, 0.722, 0.180) * impulse * (1.1 + 1.5 * uNeuralStorm);
    } else if (organId < 4.5) {
      // Organ 4: Diagnostic Fluoroscopy Tracking Eyeballs
      vec3 eyeCenter = (vAnat.w < 2.5) ? vec3(0.30, 0.58, 0.57) : vec3(-0.30, 0.58, 0.57);
      vec3 localDir = normalize(vLocalPos - eyeCenter);
      float ang = acos(clamp(localDir.z, -1.0, 1.0));
      float irisRing = (1.0 - smoothstep(0.42, 0.48, ang)) * smoothstep(0.14, 0.19, ang);
      float pupil = 1.0 - smoothstep(0.14, 0.18, ang);
      col = vec3(0.08, 0.32, 0.40) * (0.35 + 0.65 * ndl);
      col += vec3(0.133, 0.827, 0.933) * (fresnel * 0.95 + irisRing * 0.85);
      col += vec3(0.961, 0.722, 0.180) * irisRing * 0.45;
      col = mix(col, vec3(0.02, 0.06, 0.09), pupil * 0.85);
    } else if (organId < 5.5) {
      // Organ 5: Arterial Heart Chambers (LV/LA), Aortic Arch, Coronary & Carotid Arteries!
      // Strictly warm Arterial Coral-Vermilion (#ef4444 / #f97316, ZERO magenta!)
      float pulseWave = pow(max(0.0, sin(subCoord * 14.0 - uTime * 7.5)), 4.0);
      float beatGlow = 0.45 + 0.85 * uHeartPulse + 0.45 * pulseWave;
      vec3 artBase = vec3(0.82, 0.19, 0.14);
      vec3 artGlow = vec3(0.98, 0.38, 0.18);
      float spec = pow(max(dot(N, H), 0.0), 48.0) * 0.45;
      col = artBase * (0.28 + 0.68 * ndl) + artGlow * beatGlow * 0.62 + vec3(1.0, 0.86, 0.68) * spec;
      col += vec3(0.961, 0.722, 0.180) * fresnel * (0.35 + 0.45 * uHeartPulse);
    } else {
      // Organ 6: Venous Heart Chambers (RV/RA), Vena Cava, Pulmonary Trunk & Jugular Veins!
      float venWave = pow(max(0.0, sin(subCoord * 12.0 + uTime * 5.2)), 4.0);
      vec3 venBase = vec3(0.08, 0.44, 0.56);
      vec3 venGlow = vec3(0.133, 0.827, 0.933);
      float spec = pow(max(dot(N, H), 0.0), 44.0) * 0.38;
      col = venBase * (0.30 + 0.65 * ndl) + venGlow * (0.32 + 0.35 * venWave + 0.55 * fresnel) + vec3(0.85, 0.97, 1.0) * spec;
    }

    col = col * scanline + vec3(0.133, 0.827, 0.933) * apertureEdge * 0.35;
    fragColor = vec4(col, 1.0);
    return;
  }

  // --- PASS 4: COMPOSITE MEDICAL FLUOROSCOPY X-RAY BONE (Mode 1 Signature Radiograph!) ---
  if (uPassType == 4) {
    float isTooth = (organId > 0.5 && organId < 1.5) ? 1.0 : 0.0;
    float xrayRim = pow(1.0 - ndv, 1.65);
    float boneTex = 0.88 + 0.12 * vnoise3(vLocalPos * 28.0);

    vec3 cyanXray = vec3(0.16, 0.84, 0.95);
    vec3 ivoryPeak = vec3(0.95, 0.96, 0.92);
    vec3 radCol = mix(cyanXray * 0.68, ivoryPeak, clamp(xrayRim * 1.15 + isTooth * 0.65, 0.0, 1.0)) * boneTex;

    // Teeth & grazing bone edges have crisp high radiographic density; flat skull dome transmits brain & heart!
    float alpha = clamp(0.12 + 0.76 * xrayRim + isTooth * 0.62, 0.0, 0.95);
    radCol = radCol * scanline + vec3(0.961, 0.722, 0.180) * apertureEdge * 0.30;
    fragColor = vec4(radCol, alpha);
    return;
  }

  // --- PASS 5: GHOST CRANIUM & RIBCAGE SILHOUETTE (Mode 3 Neuro-Cardiac Frame) ---
  if (uPassType == 5) {
    float ghostRim = pow(1.0 - ndv, 2.35);
    float isTooth = (organId > 0.5 && organId < 1.5) ? 0.25 : 0.0;
    vec3 ghostCol = mix(vec3(0.133, 0.827, 0.933), vec3(0.85, 0.96, 0.98), ghostRim);
    float alpha = clamp(ghostRim * 0.46 + isTooth, 0.0, 0.62);
    fragColor = vec4(ghostCol * scanline, alpha);
    return;
  }

  // --- PASS 6: SUBTLE MYOLOGY GRAZING CONTOUR (Composite Mode 1 Soft-Tissue Halo) ---
  float muscRim = pow(1.0 - ndv, 2.6);
  vec3 muscGhost = mix(vec3(0.851, 0.357, 0.220), vec3(0.961, 0.722, 0.180), uMuscleFlex * 0.5);
  fragColor = vec4(muscGhost, muscRim * (0.20 + 0.18 * uMuscleFlex));
}`;

// 3D Physical Brass-and-Cyan Fluoroscopy Scanner Ring Shader
export const RING_VS = `#version 300 es
precision highp float;
precision highp int;

layout(location = 0) in vec3 aPos;
layout(location = 1) in vec3 aNorm;
layout(location = 2) in vec4 aMeta;
// aMeta.x = material (0=brushed brass, 1=glowing cyan emitter, 2=laser reticle/tick, 3=glass lens film)
// aMeta.y = polar angle [0..1]

uniform mat4 uProj;
uniform mat4 uView;
uniform mat4 uModel;

out vec3 vWorldPos;
out vec3 vWorldNorm;
out vec4 vMeta;

void main() {
  vec4 wp = uModel * vec4(aPos, 1.0);
  vWorldPos = wp.xyz;
  vWorldNorm = normalize(mat3(uModel) * aNorm);
  vMeta = aMeta;
  gl_Position = uProj * uView * wp;
}`;

export const RING_FS = `#version 300 es
precision highp float;
precision highp int;

in vec3 vWorldPos;
in vec3 vWorldNorm;
in vec4 vMeta;

uniform vec3 uCamPos;
uniform float uTime;
uniform float uFade;
uniform float uNeuralStorm;

out vec4 fragColor;

void main() {
  if (uFade <= 0.01) discard;
  vec3 V = normalize(uCamPos - vWorldPos);
  vec3 N = normalize(vWorldNorm);
  vec3 L = normalize(vec3(0.4, 0.7, 0.6));
  float ndl = max(dot(N, L), 0.0);
  vec3 H = normalize(L + V);
  float spec = pow(max(dot(N, H), 0.0), 64.0);
  float matId = vMeta.x;
  float ang01 = vMeta.y;

  vec3 col;
  float alpha = uFade;

  if (matId < 0.5) {
    // Brushed Synaptic Brass Gimbal Housing (#d49a35)
    float tick = step(0.86, fract(ang01 * 36.0));
    vec3 brass = mix(vec3(0.76, 0.55, 0.20), vec3(0.96, 0.78, 0.36), tick * 0.5);
    col = brass * (0.30 + 0.72 * ndl) + vec3(1.0, 0.92, 0.68) * spec * 0.75;
  } else if (matId < 1.5) {
    // Active Medical Fluoroscopy Cyan Emitter Bezel (#22d3ee)
    float sweep = 0.68 + 0.32 * sin(ang01 * 6.2831853 * 2.0 - uTime * 4.2);
    col = mix(vec3(0.133, 0.827, 0.933), vec3(0.961, 0.722, 0.180), uNeuralStorm * 0.45) * (1.15 * sweep);
  } else if (matId < 2.5) {
    // Precision Calibration Ticks & Cardinal Laser Crosshairs
    col = vec3(0.961, 0.722, 0.180) * 1.35;
    alpha *= 0.92;
  } else {
    // Subtle Holographic Aperture Bevel Sheen
    float rim = smoothstep(0.65, 1.0, vMeta.z);
    col = vec3(0.133, 0.827, 0.933) * 0.9;
    alpha *= rim * 0.16;
  }

  fragColor = vec4(col, alpha);
}`;

// GPU-Instanced Bloodstream Oxygen Corpuscles & Firing Cortical Synaptic Sparks
export const PARTICLE_VS = `#version 300 es
precision highp float;
precision highp int;

layout(location = 0) in vec2 aQuad;
layout(location = 1) in vec4 iPosSize; // xyz: Bust-space pos, w: radius
layout(location = 2) in vec4 iColKind; // rgb: color, w: headWeight [0..1]

uniform mat4 uProj;
uniform mat4 uView;
uniform mat4 uMatBust;
uniform vec3 uNeckAngles;
uniform vec3 uCamRight;
uniform vec3 uCamUp;

out vec2 vQuad;
out vec3 vWorldPos;
out vec3 vColor;

mat3 rotX(float a) {
  float c = cos(a), s = sin(a);
  return mat3(1.0, 0.0, 0.0,  0.0, c, s,  0.0, -s, c);
}
mat3 rotY(float a) {
  float c = cos(a), s = sin(a);
  return mat3(c, 0.0, -s,  0.0, 1.0, 0.0,  s, 0.0, c);
}
mat3 rotZ(float a) {
  float c = cos(a), s = sin(a);
  return mat3(c, s, 0.0,  -s, c, 0.0,  0.0, 0.0, 1.0);
}

void main() {
  vec3 pos = iPosSize.xyz;
  float headW = iColKind.w;
  if (headW > 0.001) {
    vec3 neckPivot = vec3(0.0, -0.26, -0.06);
    vec3 ang = uNeckAngles * headW;
    mat3 mNeck = rotY(ang.x) * rotX(ang.y) * rotZ(ang.z);
    pos = neckPivot + mNeck * (pos - neckPivot);
  }
  vec3 centerWorld = (uMatBust * vec4(pos, 1.0)).xyz;
  vec3 billPos = centerWorld + (uCamRight * aQuad.x + uCamUp * aQuad.y) * iPosSize.w;
  vQuad = aQuad;
  vWorldPos = billPos;
  vColor = iColKind.rgb;
  gl_Position = uProj * uView * vec4(billPos, 1.0);
}`;

export const PARTICLE_FS = `#version 300 es
precision highp float;
precision highp int;

in vec2 vQuad;
in vec3 vWorldPos;
in vec3 vColor;

uniform vec3 uCamPos;
uniform vec3 uLensPos;
uniform vec3 uLensAxis;
uniform float uLensRadius;
uniform float uFullScanMix;

out vec4 fragColor;

void main() {
  float r2 = dot(vQuad, vQuad);
  if (r2 > 1.0) discard;

  // Clip particles cleanly to the 3D X-Ray Scanner Aperture!
  vec3 rayDir = normalize(vWorldPos - uCamPos);
  float denom = dot(rayDir, uLensAxis);
  float safeDenom = abs(denom) > 0.0002 ? denom : -0.0002;
  float tPlane = dot(uLensPos - uCamPos, uLensAxis) / safeDenom;
  vec3 hitPlane = uCamPos + rayDir * tPlane;
  float effR = mix(uLensRadius, 9.2, uFullScanMix * uFullScanMix);
  if (length(hitPlane - uLensPos) > effR) discard;

  float core = exp(-r2 * 4.2);
  fragColor = vec4(vColor * (1.25 * core), core);
}`;

// ACES Filmic Tone-Mapping & Medical Fluoroscopy Glow Post-Process
export const POST_VS = `#version 300 es
precision highp float;
precision highp int;

out vec2 vUv;

void main() {
  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  vUv = p;
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

export const POST_FS = `#version 300 es
precision highp float;
precision highp int;

in vec2 vUv;
uniform sampler2D uTex;
uniform vec2 uRes;
uniform float uPulseVig;
uniform float uStormFlash;

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
  vec3 col = texture(uTex, vUv).rgb;

  // Soft 4-tap highlight glow for X-Ray cyan rims & golden synapses
  vec3 b0 = max(texture(uTex, vUv + vec2( 1.6,  1.6) * px).rgb - 0.72, 0.0);
  vec3 b1 = max(texture(uTex, vUv + vec2(-1.6,  1.6) * px).rgb - 0.72, 0.0);
  vec3 b2 = max(texture(uTex, vUv + vec2( 1.6, -1.6) * px).rgb - 0.72, 0.0);
  vec3 b3 = max(texture(uTex, vUv + vec2(-1.6, -1.6) * px).rgb - 0.72, 0.0);
  col += (b0 + b1 + b2 + b3) * 0.24;

  // Subtle diagnostic edge vignette + adrenaline cardiac warmth (zero purple)
  vec2 d = vUv - 0.5;
  float r2 = dot(d, d);
  col *= (1.0 - 0.30 * r2);
  col += vec3(0.14, 0.03, 0.01) * (r2 * uPulseVig * 0.65);
  col += vec3(0.12, 0.09, 0.02) * uStormFlash;

  col = acesFilm(col * 1.06);
  col = pow(col, vec3(1.0 / 2.2));
  fragColor = vec4(col, 1.0);
}`;
