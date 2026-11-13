// Deterministic PRNG, Procedural Noise & Normal Map Synthesis

export const PI = Math.PI;
export const TAU = Math.PI * 2;

export const clamp = (x, min, max) => (x < min ? min : x > max ? max : x);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smoothstep = (e0, e1, x) => {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
};
export const damp = (current, target, lambda, dt) =>
  lerp(current, target, 1 - Math.exp(-lambda * dt));

export function createRng(seed = 20261113) {
  let a = seed | 0;
  return function rng() {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Precompute tileable permutation & value tables
const PERM = new Uint8Array(512);
const GRAD_X = new Float32Array(256);
const GRAD_Y = new Float32Array(256);
const VAL_TAB = new Float32Array(256);

(function initNoiseTables() {
  const r = createRng(948271);
  const p = new Uint8Array(256);
  for (let i = 0; i < 256; i++) {
    p[i] = i;
    const ang = r() * TAU;
    GRAD_X[i] = Math.cos(ang);
    GRAD_Y[i] = Math.sin(ang);
    VAL_TAB[i] = r();
  }
  for (let i = 255; i > 0; i--) {
    const j = (r() * (i + 1)) | 0;
    const tmp = p[i];
    p[i] = p[j];
    p[j] = tmp;
  }
  for (let i = 0; i < 512; i++) PERM[i] = p[i & 255];
})();

function fade(t) {
  return t * t * t * (t * (t * 6 - 15) + 10);
}

// Tileable 2D gradient Perlin noise in [0, 1], wrapping over `period`
export function noise2D(x, y, period = 256) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const u = fade(xf);
  const v = fade(yf);

  const x0 = ((xi % period) + period) % period;
  const y0 = ((yi % period) + period) % period;
  const x1 = (x0 + 1) % period;
  const y1 = (y0 + 1) % period;

  const aa = PERM[(PERM[x0 & 255] + (y0 & 255)) & 511];
  const ba = PERM[(PERM[x1 & 255] + (y0 & 255)) & 511];
  const ab = PERM[(PERM[x0 & 255] + (y1 & 255)) & 511];
  const bb = PERM[(PERM[x1 & 255] + (y1 & 255)) & 511];

  const d00 = GRAD_X[aa] * xf + GRAD_Y[aa] * yf;
  const d10 = GRAD_X[ba] * (xf - 1) + GRAD_Y[ba] * yf;
  const d01 = GRAD_X[ab] * xf + GRAD_Y[ab] * (yf - 1);
  const d11 = GRAD_X[bb] * (xf - 1) + GRAD_Y[bb] * (yf - 1);

  const nx0 = lerp(d00, d10, u);
  const nx1 = lerp(d01, d11, u);
  return clamp(lerp(nx0, nx1, v) * 0.72 + 0.5, 0, 1);
}

// Tileable Fractal Brownian Motion (FBM) in [0, 1]
export function fbm2D(u, v, baseFreq = 4, octaves = 5, gain = 0.5) {
  let sum = 0;
  let amp = 1;
  let norm = 0;
  let freq = baseFreq;
  for (let i = 0; i < octaves; i++) {
    sum += amp * noise2D(u * freq, v * freq, freq);
    norm += amp;
    amp *= gain;
    freq *= 2;
  }
  return sum / norm;
}

// Tileable Worley cellular noise (returns inverted F1 distance in [0, 1])
export function worley2D(u, v, cells = 8) {
  const x = u * cells;
  const y = v * cells;
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  let minDist = 8.0;

  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const cx = (((xi + dx) % cells) + cells) % cells;
      const cy = (((yi + dy) % cells) + cells) % cells;
      const h = PERM[(PERM[cx & 255] + (cy & 255)) & 511];
      const px = xi + dx + VAL_TAB[h];
      const py = yi + dy + VAL_TAB[(h + 73) & 255];
      const ddx = px - x;
      const ddy = py - y;
      const d2 = ddx * ddx + ddy * ddy;
      if (d2 < minDist) minDist = d2;
    }
  }
  return clamp(1.0 - Math.sqrt(minDist), 0, 1);
}

// Convert a scalar height Float32Array (size x size) into RGBA tangent-space normal map Uint8Array
export function heightToNormalMap(heightData, size, strength = 2.5) {
  const out = new Uint8Array(size * size * 4);
  const mask = size - 1;
  for (let y = 0; y < size; y++) {
    const ym = ((y - 1) & mask) * size;
    const yc = y * size;
    const yp = ((y + 1) & mask) * size;
    for (let x = 0; x < size; x++) {
      const xm = (x - 1) & mask;
      const xp = (x + 1) & mask;

      const tl = heightData[ym + xm];
      const tc = heightData[ym + x];
      const tr = heightData[ym + xp];
      const ml = heightData[yc + xm];
      const mr = heightData[yc + xp];
      const bl = heightData[yp + xm];
      const bc = heightData[yp + x];
      const br = heightData[yp + xp];

      // Sobel filter
      const dx = (tr + 2 * mr + br - (tl + 2 * ml + bl)) * strength;
      const dy = (bl + 2 * bc + br - (tl + 2 * tc + tr)) * strength;
      const dz = 1.0;
      const invLen = 1.0 / Math.sqrt(dx * dx + dy * dy + dz * dz);

      const idx = (yc + x) * 4;
      out[idx] = clamp((-dx * invLen * 0.5 + 0.5) * 255, 0, 255) | 0;
      out[idx + 1] = clamp((-dy * invLen * 0.5 + 0.5) * 255, 0, 255) | 0;
      out[idx + 2] = clamp((dz * invLen * 0.5 + 0.5) * 255, 0, 255) | 0;
      out[idx + 3] = 255;
    }
  }
  return out;
}
