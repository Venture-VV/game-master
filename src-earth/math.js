// Spherical Geography, Continental Heightfield, Orbital Vector Math & Matrix Utilities for Mirror Earth

export const R_EARTH = 52.0;
export const R_CLOUD = 53.38;
export const R_ATMO = 57.6;
export const DEG2RAD = Math.PI / 180;
export const RAD2DEG = 180 / Math.PI;

export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const damp = (a, b, lambda, dt) => lerp(a, b, 1 - Math.exp(-lambda * dt));
export const smoothstep = (e0, e1, x) => {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
};

export function wrapAngle(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

// Convert geographic (latDeg [-90..90], lonDeg [-180..180]) to 3D unit sphere vector
// Convention: +Y = North Pole, +Z = Prime Meridian (0°E Europe/Africa), +X = 90°E (Asia), -X = 90°W (Americas)
export function latLonToDir(latDeg, lonDeg, out = [0, 1, 0]) {
  const lat = latDeg * DEG2RAD;
  const lon = lonDeg * DEG2RAD;
  const cl = Math.cos(lat);
  out[0] = cl * Math.sin(lon);
  out[1] = Math.sin(lat);
  out[2] = cl * Math.cos(lon);
  return out;
}

export function dirToLatLon(ux, uy, uz) {
  const len = Math.hypot(ux, uy, uz) || 1;
  const ny = clamp(uy / len, -1, 1);
  const lat = Math.asin(ny) * RAD2DEG;
  const lon = Math.atan2(ux / len, uz / len) * RAD2DEG;
  return { lat, lon };
}

export function formatLatLon(lat, lon) {
  const ns = lat >= 0 ? 'N' : 'S';
  const ew = lon >= 0 ? 'E' : 'W';
  const aLat = Math.abs(lat).toFixed(2).padStart(5, '0');
  const aLon = Math.abs(lon).toFixed(2).padStart(6, '0');
  return `${aLat}°${ns} · ${aLon}°${ew}`;
}

export function computeSolarDir(utcHours, axialTiltDeg = 18.5, out = [0, 0, 1]) {
  // At 12:00 UTC, Sun is directly over Prime Meridian (lon = 0°E).
  // At 04:00 UTC, Sun is over +120°E (East Asia Noon). At 17:00 UTC, Sun is over -75°W (New York Noon).
  const subLon = (12.0 - utcHours) * 15.0;
  return latLonToDir(axialTiltDeg, subLon, out);
}

// 3D Deterministic Hash & FBM Noise for Fractal Coastlines & Ridged Mountains
export function hash3(ix, iy, iz) {
  const n = Math.sin(ix * 127.1 + iy * 311.7 + iz * 74.7) * 43758.5453123;
  return n - Math.floor(n);
}

export function noise3(x, y, z) {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const iz = Math.floor(z);
  const fx = x - ix;
  const fy = y - iy;
  const fz = z - iz;
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);
  const uz = fz * fz * (3 - 2 * fz);

  const n000 = hash3(ix, iy, iz);
  const n100 = hash3(ix + 1, iy, iz);
  const n010 = hash3(ix, iy + 1, iz);
  const n110 = hash3(ix + 1, iy + 1, iz);
  const n001 = hash3(ix, iy, iz + 1);
  const n101 = hash3(ix + 1, iy, iz + 1);
  const n011 = hash3(ix, iy + 1, iz + 1);
  const n111 = hash3(ix + 1, iy + 1, iz + 1);

  const nx00 = lerp(n000, n100, ux);
  const nx10 = lerp(n010, n110, ux);
  const nx01 = lerp(n001, n101, ux);
  const nx11 = lerp(n011, n111, ux);

  const nxy0 = lerp(nx00, nx10, uy);
  const nxy1 = lerp(nx01, nx11, uy);
  return lerp(nxy0, nxy1, uz);
}

export function fbm3(x, y, z, octaves = 4) {
  let v = 0;
  let amp = 0.5;
  let px = x;
  let py = y;
  let pz = z;
  for (let i = 0; i < octaves; i++) {
    v += amp * noise3(px, py, pz);
    const nx = px * 2.02 + py * 0.18;
    const ny = py * 2.02 - pz * 0.15;
    const nz = pz * 2.02 + px * 0.14;
    px = nx;
    py = ny;
    pz = nz;
    amp *= 0.5;
  }
  return v;
}

export function ridged3(x, y, z) {
  let v = 0;
  let amp = 0.55;
  let px = x;
  let py = y;
  let pz = z;
  for (let i = 0; i < 3; i++) {
    const r = 1.0 - Math.abs(noise3(px, py, pz) * 2.0 - 1.0);
    v += amp * r * r;
    px = px * 2.15 + 1.7;
    py = py * 2.15 - 1.3;
    pz = pz * 2.15 + 0.9;
    amp *= 0.48;
  }
  return v;
}

// 6 Iconic World Landmarks with Real Geographic Coordinates
export const LANDMARKS = [
  {
    id: 0,
    key: 'everest',
    short: '珠峰',
    name: '珠穆朗玛雪峰',
    en: 'MT. EVEREST',
    lat: 27.98,
    lon: 86.92,
    dir: latLonToDir(27.98, 86.92),
  },
  {
    id: 1,
    key: 'pyramids',
    short: '金字塔',
    name: '埃及吉萨金字塔',
    en: 'GIZA PYRAMIDS',
    lat: 29.98,
    lon: 31.13,
    dir: latLonToDir(29.98, 31.13),
  },
  {
    id: 2,
    key: 'manhattan',
    short: '曼哈顿',
    name: '纽约曼哈顿塔群',
    en: 'MANHATTAN SKYLINE',
    lat: 40.71,
    lon: -74.01,
    dir: latLonToDir(40.71, -74.01),
  },
  {
    id: 3,
    key: 'fuji',
    short: '富士山',
    name: '日本富士山',
    en: 'MT. FUJI',
    lat: 35.36,
    lon: 138.73,
    dir: latLonToDir(35.36, 138.73),
  },
  {
    id: 4,
    key: 'eiffel',
    short: '铁塔',
    name: '巴黎铁塔尖碑',
    en: 'EIFFEL SPIRE',
    lat: 48.86,
    lon: 2.29,
    dir: latLonToDir(48.86, 2.29),
  },
  {
    id: 5,
    key: 'arctic',
    short: '北极站',
    name: '北极极光科考站',
    en: 'ARCTIC AURORA BASE',
    lat: 78.92,
    lon: 11.93,
    dir: latLonToDir(78.92, 11.93),
  },
];

// Precomputed Spherical Continental Lobes (lat, lon, angularRadiusDeg, weight, ridgeBoost, aridity)
const RAW_LOBES = [
  // North America & Greenland
  [64, -150, 13, 0.92, 0.5, 0.1],
  [57, -104, 19, 1.05, 0.25, 0.15],
  [41, -113, 14, 1.02, 0.85, 0.55], // Rockies
  [39, -86, 15, 0.98, 0.2, 0.15],
  [41, -74, 8, 0.92, 0.15, 0.1],    // US Northeast / Manhattan
  [23, -102, 10, 0.88, 0.45, 0.5],  // Mexico
  [13, -86, 6.5, 0.78, 0.3, 0.1],   // Central America
  [73, -42, 12.5, 1.05, 0.45, 0.0], // Greenland Ice Sheet

  // South America & Andes
  [5, -67, 11, 0.95, 0.3, 0.05],
  [-8, -58, 16, 1.06, 0.15, 0.02],  // Amazon Rainforest
  [-17, -46, 12, 0.94, 0.25, 0.2],  // Brazil Highlands
  [-17, -69, 9.5, 0.98, 1.05, 0.4], // Central Andes
  [-34, -68, 10, 0.92, 0.95, 0.35], // Southern Andes
  [-47, -69, 7.5, 0.84, 0.55, 0.3], // Patagonia

  // Europe & Svalbard
  [47, 3, 10.5, 0.96, 0.25, 0.12],  // France / Iberia / Paris
  [46.5, 10.5, 6.5, 0.95, 0.85, 0.1], // Alps
  [52, 18, 11, 0.96, 0.18, 0.12],   // Central Europe
  [54.5, -2.5, 5.2, 0.82, 0.2, 0.08], // British Isles
  [63, 16, 9.5, 0.90, 0.45, 0.08],  // Scandinavia
  [78.9, 12.5, 4.8, 0.88, 0.35, 0.0], // Svalbard Arctic Base

  // Africa & Sahara & Madagascar
  [26, 8, 17, 1.08, 0.22, 0.98],    // Western Sahara
  [26, 28, 14, 1.04, 0.20, 0.96],   // Egypt / Giza / Eastern Sahara
  [11, -4, 12, 0.96, 0.18, 0.45],   // West Africa
  [8, 39, 10.5, 0.94, 0.55, 0.65],  // Ethiopian Highlands
  [-3, 22, 14, 1.04, 0.22, 0.05],   // Congo Basin
  [-19, 25, 13, 0.98, 0.32, 0.55],  // Southern Africa
  [-19, 46.5, 5.2, 0.82, 0.35, 0.25], // Madagascar

  // Eurasia, Arabia, Himalayas & Japan
  [24, 46, 11.5, 0.98, 0.28, 0.96], // Arabian Peninsula
  [56, 44, 16, 1.04, 0.2, 0.2],     // European Russia
  [61, 82, 21, 1.08, 0.28, 0.2],    // Western/Central Siberia
  [63, 128, 19, 1.04, 0.42, 0.18],  // Eastern Siberia
  [44, 66, 15, 1.02, 0.38, 0.82],   // Central Asian Steppe / Gobi
  [32, 87, 14.5, 1.22, 1.55, 0.45], // Tibetan Plateau & Mt. Everest!
  [21, 78, 11.5, 0.98, 0.3, 0.32],  // India
  [34, 111, 15.5, 1.06, 0.38, 0.22], // China
  [16, 102, 9.5, 0.88, 0.32, 0.08], // SE Asia
  [-2, 114, 8.5, 0.76, 0.35, 0.05], // Borneo / Indonesia
  [36.0, 138.7, 5.0, 0.88, 0.78, 0.1], // Japan Archipelago & Mt. Fuji!

  // Australia & New Zealand
  [-25, 134, 13.5, 1.04, 0.24, 0.88], // Australia Outback
  [-42, 172, 4.5, 0.78, 0.65, 0.08],  // New Zealand

  // Antarctica Polar Continent
  [-83, 0, 18, 1.12, 0.5, 0.0],
  [-77, 85, 15, 1.05, 0.45, 0.0],
  [-79, -95, 14, 1.02, 0.45, 0.0],
];

const CONTINENT_LOBES = RAW_LOBES.map(([lat, lon, radDeg, weight, ridge, arid]) => {
  const d = latLonToDir(lat, lon);
  const rad = radDeg * DEG2RAD;
  return {
    dx: d[0],
    dy: d[1],
    dz: d[2],
    invSigma2: 1.0 / (rad * rad),
    weight,
    ridge,
    arid,
  };
});

// Carve realistic inland seas (Mediterranean, Red Sea, Gulf of Mexico, Hudson Bay, Sea of Japan)
const SEA_CARVES = [
  [36, 18, 7.2, 0.78],   // Mediterranean Sea
  [43, 34, 4.5, 0.62],   // Black Sea
  [21, 38, 4.2, 0.58],   // Red Sea
  [25, -90, 7.5, 0.76],  // Gulf of Mexico
  [60, -85, 6.8, 0.68],  // Hudson Bay
  [40, 134, 4.5, 0.62],  // Sea of Japan (separates Japan cleanly from mainland!)
].map(([lat, lon, radDeg, strength]) => {
  const d = latLonToDir(lat, lon);
  const rad = radDeg * DEG2RAD;
  return { dx: d[0], dy: d[1], dz: d[2], invSigma2: 1.0 / (rad * rad), strength };
});

export function sampleEarthGeography(ux, uy, uz) {
  // Fractal coastline coordinate warp
  const wx = ux + (fbm3(ux * 4.2 + 3.1, uy * 4.2 - 1.7, uz * 4.2 + 0.8, 3) - 0.5) * 0.16;
  const wy = uy + (fbm3(ux * 4.2 - 2.4, uy * 4.2 + 2.9, uz * 4.2 - 1.2, 3) - 0.5) * 0.16;
  const wz = uz + (fbm3(ux * 4.2 + 0.6, uy * 4.2 + 1.1, uz * 4.2 + 3.5, 3) - 0.5) * 0.16;
  const wLen = Math.hypot(wx, wy, wz) || 1;
  const nx = wx / wLen;
  const ny = wy / wLen;
  const nz = wz / wLen;

  let mask = 0;
  let ridgeSum = 0;
  let aridSum = 0;
  let wTotal = 0.001;

  for (let i = 0; i < CONTINENT_LOBES.length; i++) {
    const c = CONTINENT_LOBES[i];
    const dot = nx * c.dx + ny * c.dy + nz * c.dz;
    if (dot < 0.55) continue;
    const ang2 = Math.max(0, 2.0 * (1.0 - dot));
    const g = Math.exp(-ang2 * c.invSigma2) * c.weight;
    if (g > 0.01) {
      mask = Math.max(mask, g) + g * 0.22;
      ridgeSum += g * c.ridge;
      aridSum += g * c.arid;
      wTotal += g;
    }
  }

  for (let i = 0; i < SEA_CARVES.length; i++) {
    const s = SEA_CARVES[i];
    const dot = nx * s.dx + ny * s.dy + nz * s.dz;
    if (dot < 0.85) continue;
    const ang2 = Math.max(0, 2.0 * (1.0 - dot));
    mask -= Math.exp(-ang2 * s.invSigma2) * s.strength;
  }

  const coastDetail = (fbm3(ux * 11.5, uy * 11.5, uz * 11.5, 4) - 0.48) * 0.34;
  const landVal = mask + coastDetail - 0.52;

  const ridgeFactor = ridgeSum / wTotal;
  const aridity = clamp(aridSum / wTotal, 0, 1);

  let elev;
  if (landVal > 0) {
    const mtn = ridged3(ux * 9.2 + 2.1, uy * 9.2 - 0.8, uz * 9.2 + 1.4);
    const plain = smoothstep(0.0, 0.38, landVal) * 0.65;
    elev = 0.14 + plain + Math.pow(smoothstep(0.04, 0.55, landVal), 1.15) * mtn * (0.65 + ridgeFactor * 2.15);
  } else {
    // Ocean bathymetry: coastal continental shelf -> abyssal plain + mid-ocean ridge
    const midRidge = ridged3(ux * 6.0, uy * 6.0, uz * 6.0) * 0.25;
    elev = clamp(landVal * 2.2 + midRidge * 0.3, -1.45, -0.04);
  }

  // Sculpt crisp signature peaks / plateaus right under our 6 Landmarks so they stand proudly on land!
  for (let i = 0; i < LANDMARKS.length; i++) {
    const lm = LANDMARKS[i];
    const dot = ux * lm.dir[0] + uy * lm.dir[1] + uz * lm.dir[2];
    if (dot > 0.992) {
      const ang2 = Math.max(0, 2.0 * (1.0 - dot));
      if (lm.key === 'everest') {
        elev = Math.max(elev, 1.4 + Math.exp(-ang2 * 950) * 2.15);
      } else if (lm.key === 'fuji') {
        elev = Math.max(elev, 0.32 + Math.exp(-ang2 * 1600) * 1.65);
      } else {
        elev = Math.max(elev, 0.36 + Math.exp(-ang2 * 1100) * 0.22);
      }
    }
  }

  return { elev, aridity };
}

// Vector3 Helpers
export const V3 = {
  normalize(x, y, z, out = [0, 0, 0]) {
    const l = Math.hypot(x, y, z) || 1;
    out[0] = x / l;
    out[1] = y / l;
    out[2] = z / l;
    return out;
  },
  dot(a, b) {
    return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  },
  cross(a, b, out = [0, 0, 0]) {
    const ax = a[0], ay = a[1], az = a[2];
    const bx = b[0], by = b[1], bz = b[2];
    out[0] = ay * bz - az * by;
    out[1] = az * bx - ax * bz;
    out[2] = ax * by - ay * bx;
    return out;
  },
  rotateAroundAxis(v, axis, angle, out = [0, 0, 0]) {
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    const d = V3.dot(axis, v) * (1 - c);
    const cx = axis[1] * v[2] - axis[2] * v[1];
    const cy = axis[2] * v[0] - axis[0] * v[2];
    const cz = axis[0] * v[1] - axis[1] * v[0];
    out[0] = v[0] * c + cx * s + axis[0] * d;
    out[1] = v[1] * c + cy * s + axis[1] * d;
    out[2] = v[2] * c + cz * s + axis[2] * d;
    return out;
  },
};

export function raySphereIntersect(ox, oy, oz, dx, dy, dz, radius) {
  const b = ox * dx + oy * dy + oz * dz;
  const c = ox * ox + oy * oy + oz * oz - radius * radius;
  const disc = b * b - c;
  if (disc < 0) return -1;
  const sq = Math.sqrt(disc);
  const t0 = -b - sq;
  if (t0 > 0) return t0;
  const t1 = -b + sq;
  return t1 > 0 ? t1 : -1;
}

export const M4 = {
  create() {
    const m = new Float32Array(16);
    m[0] = m[5] = m[10] = m[15] = 1;
    return m;
  },
  perspective(out, fovy, aspect, near, far) {
    const f = 1 / Math.tan(fovy * 0.5);
    out.fill(0);
    out[0] = f / aspect;
    out[5] = f;
    out[10] = (far + near) / (near - far);
    out[11] = -1;
    out[14] = (2 * far * near) / (near - far);
    return out;
  },
  lookAt(out, ex, ey, ez, tx, ty, tz, ux = 0, uy = 1, uz = 0) {
    let zx = ex - tx;
    let zy = ey - ty;
    let zz = ez - tz;
    let len = Math.hypot(zx, zy, zz) || 1;
    zx /= len;
    zy /= len;
    zz /= len;

    let xx = uy * zz - uz * zy;
    let xy = uz * zx - ux * zz;
    let xz = ux * zy - uy * zx;
    len = Math.hypot(xx, xy, xz);
    if (len < 1e-4) {
      xx = 1; xy = 0; xz = 0;
    } else {
      xx /= len; xy /= len; xz /= len;
    }

    const yx = zy * xz - zz * xy;
    const yy = zz * xx - zx * xz;
    const yz = zx * xy - zy * xx;

    out[0] = xx; out[1] = yx; out[2] = zx; out[3] = 0;
    out[4] = xy; out[5] = yy; out[6] = zy; out[7] = 0;
    out[8] = xz; out[9] = yz; out[10] = zz; out[11] = 0;
    out[12] = -(xx * ex + xy * ey + xz * ez);
    out[13] = -(yx * ex + yy * ey + yz * ez);
    out[14] = -(zx * ex + zy * ey + zz * ez);
    out[15] = 1;
    return out;
  },
  mul(out, a, b) {
    const a00 = a[0], a01 = a[1], a02 = a[2], a03 = a[3];
    const a10 = a[4], a11 = a[5], a12 = a[6], a13 = a[7];
    const a20 = a[8], a21 = a[9], a22 = a[10], a23 = a[11];
    const a30 = a[12], a31 = a[13], a32 = a[14], a33 = a[15];
    for (let i = 0; i < 4; i++) {
      const b0 = b[i * 4], b1 = b[i * 4 + 1], b2 = b[i * 4 + 2], b3 = b[i * 4 + 3];
      out[i * 4] = b0 * a00 + b1 * a10 + b2 * a20 + b3 * a30;
      out[i * 4 + 1] = b0 * a01 + b1 * a11 + b2 * a21 + b3 * a31;
      out[i * 4 + 2] = b0 * a02 + b1 * a12 + b2 * a22 + b3 * a32;
      out[i * 4 + 3] = b0 * a03 + b1 * a13 + b2 * a23 + b3 * a33;
    }
    return out;
  },
  trs(out, tx, ty, tz, rx, ry, rz, sx, sy, sz) {
    const cx = Math.cos(rx), sxr = Math.sin(rx);
    const cy = Math.cos(ry), syr = Math.sin(ry);
    const cz = Math.cos(rz), szr = Math.sin(rz);
    out[0] = (cy * cz + syr * sxr * szr) * sx;
    out[1] = cx * szr * sx;
    out[2] = (-syr * cz + cy * sxr * szr) * sx;
    out[3] = 0;
    out[4] = (-cy * szr + syr * sxr * cz) * sy;
    out[5] = cx * cz * sy;
    out[6] = (syr * szr + cy * sxr * cz) * sy;
    out[7] = 0;
    out[8] = syr * cx * sz;
    out[9] = -sxr * sz;
    out[10] = cy * cx * sz;
    out[11] = 0;
    out[12] = tx;
    out[13] = ty;
    out[14] = tz;
    out[15] = 1;
    return out;
  },
  // Orient a local +Y-up model onto planet surface point (px,py,pz) with surface normal (nx,ny,nz)
  basisFromNormal(out, px, py, pz, nx, ny, nz, yawLocal = 0, sx = 1, sy = 1, sz = 1) {
    // East tangent = [0,1,0] x N
    let ex = nz;
    let ey = 0;
    let ez = -nx;
    let el = Math.hypot(ex, ey, ez);
    if (el < 1e-4) {
      ex = 1; ey = 0; ez = 0;
    } else {
      ex /= el; ey /= el; ez /= el;
    }
    // North tangent = N x E
    const tx = ny * ez - nz * ey;
    const ty = nz * ex - nx * ez;
    const tz = nx * ey - ny * ex;

    const c = Math.cos(yawLocal);
    const s = Math.sin(yawLocal);
    const rx0 = ex * c + tx * s;
    const rx1 = ey * c + ty * s;
    const rx2 = ez * c + tz * s;
    const rz0 = -ex * s + tx * c;
    const rz1 = -ey * s + ty * c;
    const rz2 = -ez * s + tz * c;

    out[0] = rx0 * sx; out[1] = rx1 * sx; out[2] = rx2 * sx; out[3] = 0;
    out[4] = nx * sy;  out[5] = ny * sy;  out[6] = nz * sy;  out[7] = 0;
    out[8] = rz0 * sz; out[9] = rz1 * sz; out[10] = rz2 * sz; out[11] = 0;
    out[12] = px;      out[13] = py;      out[14] = pz;       out[15] = 1;
    return out;
  },
  // Orient Orbital Craft from position P, forward F, up U, with bank & pitch
  basisFromAxes(out, px, py, pz, right, up, back, sx = 1, sy = 1, sz = 1) {
    out[0] = right[0] * sx; out[1] = right[1] * sx; out[2] = right[2] * sx; out[3] = 0;
    out[4] = up[0] * sy;    out[5] = up[1] * sy;    out[6] = up[2] * sy;    out[7] = 0;
    out[8] = back[0] * sz;  out[9] = back[1] * sz;  out[10] = back[2] * sz; out[11] = 0;
    out[12] = px;           out[13] = py;           out[14] = pz;           out[15] = 1;
    return out;
  },
  invert(out, m) {
    const m00 = m[0], m01 = m[1], m02 = m[2], m03 = m[3];
    const m10 = m[4], m11 = m[5], m12 = m[6], m13 = m[7];
    const m20 = m[8], m21 = m[9], m22 = m[10], m23 = m[11];
    const m30 = m[12], m31 = m[13], m32 = m[14], m33 = m[15];

    const b00 = m00 * m11 - m01 * m10;
    const b01 = m00 * m12 - m02 * m10;
    const b02 = m00 * m13 - m03 * m10;
    const b03 = m01 * m12 - m02 * m11;
    const b04 = m01 * m13 - m03 * m11;
    const b05 = m02 * m13 - m03 * m12;
    const b06 = m20 * m31 - m21 * m30;
    const b07 = m20 * m32 - m22 * m30;
    const b08 = m20 * m33 - m23 * m30;
    const b09 = m21 * m32 - m22 * m31;
    const b10 = m21 * m33 - m23 * m31;
    const b11 = m22 * m33 - m23 * m32;

    let det = b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06;
    if (!det) return null;
    det = 1.0 / det;

    out[0] = (m11 * b11 - m12 * b10 + m13 * b09) * det;
    out[1] = (m02 * b10 - m01 * b11 - m03 * b09) * det;
    out[2] = (m31 * b05 - m32 * b04 + m33 * b03) * det;
    out[3] = (m22 * b04 - m21 * b05 - m23 * b03) * det;
    out[4] = (m12 * b08 - m10 * b11 - m13 * b07) * det;
    out[5] = (m00 * b11 - m02 * b08 + m03 * b07) * det;
    out[6] = (m32 * b02 - m30 * b05 - m33 * b01) * det;
    out[7] = (m20 * b05 - m22 * b02 + m23 * b01) * det;
    out[8] = (m10 * b10 - m11 * b08 + m13 * b06) * det;
    out[9] = (m01 * b08 - m00 * b10 - m03 * b06) * det;
    out[10] = (m30 * b04 - m31 * b02 + m33 * b00) * det;
    out[11] = (m21 * b02 - m20 * b04 - m23 * b00) * det;
    out[12] = (m11 * b07 - m10 * b09 - m12 * b06) * det;
    out[13] = (m00 * b09 - m01 * b07 + m02 * b06) * det;
    out[14] = (m31 * b01 - m30 * b03 - m32 * b00) * det;
    out[15] = (m20 * b03 - m21 * b01 + m22 * b00) * det;
    return out;
  },
  projectToScreen(vpMat, wx, wy, wz, width, height) {
    const cx = vpMat[0] * wx + vpMat[4] * wy + vpMat[8] * wz + vpMat[12];
    const cy = vpMat[1] * wx + vpMat[5] * wy + vpMat[9] * wz + vpMat[13];
    const cw = vpMat[3] * wx + vpMat[7] * wy + vpMat[11] * wz + vpMat[15];
    if (cw <= 0.05) return null;
    const ndcX = cx / cw;
    const ndcY = cy / cw;
    return {
      x: (ndcX * 0.5 + 0.5) * width,
      y: (0.5 - ndcY * 0.5) * height,
    };
  },
};
