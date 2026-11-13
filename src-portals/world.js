// Procedural 8-Archetype × 450+ Seeded 3D World Generator, Merged Architectural MeshBuilder,
// Live Portal Monument, Kinetic Wonders & Sky-Glider Primitives for Endless Portals

import {
  clamp,
  lerp,
  mulberry32,
  corridorCenterX,
  worldTerrainH,
  worldTerrainNormal,
  PORTAL_Z,
  ENTRANCE_Z,
} from './math.js';

// Strictly Zero-Purple Palettes across all 8 Surreal Architectural Archetypes
const ARCHETYPES = [
  {
    // 0: Sundial Sanctum
    baseZh: '悬空日晷圣殿',
    baseEn: 'SUNDIAL SANCTUM',
    skyZenith: [0.08, 0.25, 0.42],
    skyMid: [0.20, 0.50, 0.60],
    skyHorizon: [0.96, 0.78, 0.44],
    sunDir: [-0.24, 0.34, -0.91],
    sunCol: [1.0, 0.90, 0.60],
    fogCol: [0.90, 0.75, 0.48],
    fogDensity: 0.0035,
    stoneA: [0.95, 0.92, 0.85], // Sandstone Ivory Marble
    stoneB: [0.84, 0.78, 0.66],
    accentBrass: [0.94, 0.66, 0.18],
    glowCol: [0.18, 0.84, 0.75],
    terrainLow: [0.96, 0.80, 0.48],
    terrainHigh: [0.92, 0.88, 0.79],
    moteCol: [1.0, 0.86, 0.48],
    prefixes: [
      ['晨曦', 'DAWN'], ['云海', 'CLOUDSEA'], ['金冕', 'SOLAR'], ['天穹', 'ZENITH'],
      ['白石', 'MARBLE'], ['浮空', 'FLOATING'], ['辉光', 'RADIANT'], ['昼晷', 'GNOMON'],
    ],
    nouns: [
      ['日晷圣殿', 'SUNDIAL SANCTUM'], ['星盘柱廊', 'ASTROLABE COLONNADE'], ['云顶神庙', 'NIMBUS TEMPLE'],
      ['黄铜天坛', 'BRASS ALTAR'], ['光阴回廊', 'CHRONO GALLERY'], ['曜日高台', 'HELIOS TERRACE'],
      ['浮岛圣堂', 'SKYWARD BASILICA'], ['金辉方尖碑', 'SOLAR OBELISK'],
    ],
  },
  {
    // 1: Obsidian Ziggurat
    baseZh: '熔金黑曜神塔',
    baseEn: 'OBSIDIAN ZIGGURAT',
    skyZenith: [0.07, 0.06, 0.06],
    skyMid: [0.34, 0.13, 0.05],
    skyHorizon: [0.94, 0.44, 0.10],
    sunDir: [0.18, 0.22, -0.96],
    sunCol: [1.0, 0.62, 0.18],
    fogCol: [0.68, 0.30, 0.09],
    fogDensity: 0.0041,
    stoneA: [0.14, 0.16, 0.19], // Obsidian Basalt
    stoneB: [0.23, 0.21, 0.19],
    accentBrass: [0.96, 0.64, 0.14],
    glowCol: [1.0, 0.48, 0.08], // Molten Gold-Lava
    terrainLow: [0.95, 0.42, 0.08],
    terrainHigh: [0.16, 0.15, 0.16],
    moteCol: [1.0, 0.52, 0.12],
    prefixes: [
      ['熔金', 'MOLTEN'], ['流火', 'EMBER'], ['黑曜', 'OBSIDIAN'], ['赤焰', 'CALDERA'],
      ['玄武', 'BASALT'], ['锻日', 'FORGE'], ['烬光', 'CINDER'], ['地脉', 'MAGMA'],
    ],
    nouns: [
      ['黑曜神塔', 'OBSIDIAN ZIGGURAT'], ['阶梯祭坛', 'STEPPED CITADEL'], ['熔岩圣火殿', 'PYRE SANCTUARY'],
      ['巨石王座', 'MONOLITH THRONE'], ['流金峡谷', 'LAVA GORGE'], ['烈焰方尖阵', 'FLAME PYLONS'],
      ['锻火神庙', 'VULCAN TEMPLE'], ['玄岩长桥', 'BASALT CAUSEWAY'],
    ],
  },
  {
    // 2: Abyssal Coralhenge
    baseZh: '深海珊瑚巨石',
    baseEn: 'ABYSSAL CORALHENGE',
    skyZenith: [0.03, 0.17, 0.25],
    skyMid: [0.07, 0.46, 0.54],
    skyHorizon: [0.22, 0.78, 0.76],
    sunDir: [0.08, 0.62, -0.78],
    sunCol: [0.62, 0.98, 0.92],
    fogCol: [0.12, 0.58, 0.62],
    fogDensity: 0.0044,
    stoneA: [0.92, 0.87, 0.77], // Shell Ivory
    stoneB: [0.86, 0.48, 0.30], // Warm Terracotta-Coral (Zero purple!)
    accentBrass: [0.92, 0.72, 0.26],
    glowCol: [0.16, 0.94, 0.76], // Bioluminescent Aqua
    terrainLow: [0.76, 0.74, 0.62],
    terrainHigh: [0.18, 0.52, 0.48],
    moteCol: [0.35, 0.96, 0.86],
    prefixes: [
      ['深海', 'ABYSSAL'], ['潮汐', 'TIDAL'], ['沧澜', 'PELAGIC'], ['碧波', 'TURQUOISE'],
      ['螺塔', 'NAUTILUS'], ['潜流', 'CAUSTIC'], ['海渊', 'TRENCH'], ['灵礁', 'REEF'],
    ],
    nouns: [
      ['珊瑚巨石', 'CORALHENGE'], ['旋螺圣塔', 'SPIRAL SPIRE'], ['海藻拱廊', 'KELP ARCHWAY'],
      ['沉没神殿', 'SUNKEN TEMPLE'], ['沧海碑林', 'OCEANIC STELE'], ['潮音回廊', 'TIDAL CLOISTER'],
      ['荧光海坛', 'LUMEN ATOLL'], ['古贝遗迹', 'SHELL MONOLITH'],
    ],
  },
  {
    // 3: Monument Aqueducts
    baseZh: '几何纪念碑谷',
    baseEn: 'MONUMENT AQUEDUCTS',
    skyZenith: [0.10, 0.32, 0.45],
    skyMid: [0.40, 0.68, 0.70],
    skyHorizon: [0.95, 0.76, 0.54],
    sunDir: [-0.35, 0.44, -0.82],
    sunCol: [1.0, 0.90, 0.70],
    fogCol: [0.84, 0.72, 0.58],
    fogDensity: 0.0034,
    stoneA: [0.83, 0.45, 0.29], // Warm Terracotta
    stoneB: [0.96, 0.91, 0.82], // Sandstone Ivory
    accentBrass: [0.18, 0.76, 0.68], // Horizon Turquoise Dome Accent
    glowCol: [0.98, 0.74, 0.24],
    terrainLow: [0.90, 0.78, 0.64],
    terrainHigh: [0.80, 0.44, 0.28],
    moteCol: [0.98, 0.88, 0.66],
    prefixes: [
      ['几何', 'GEOMETRIC'], ['迷城', 'LABYRINTH'], ['悬拱', 'ARCHED'], ['错觉', 'IMPOSSIBLE'],
      ['陶土', 'TERRACOTTA'], ['天梯', 'STAIRWAY'], ['静谧', 'SERENE'], ['幻构', 'PARADOX'],
    ],
    nouns: [
      ['纪念碑谷', 'MONUMENT AQUEDUCTS'], ['悬空水渠', 'SKY VIADUCT'], ['无尽阶梯', 'ENDLESS STAIRS'],
      ['回音穹顶', 'ECHO PAVILION'], ['方尖庭院', 'OBELISK COURT'], ['对称高架', 'SYMMETRY BRIDGE'],
      ['秘境拱门', 'ARCADE CITADEL'], ['折角圣殿', 'ISOMETRIC SANCTUM'],
    ],
  },
  {
    // 4: Emerald Mycelia
    baseZh: '翡翠荧光巨蕈',
    baseEn: 'EMERALD MYCELIA',
    skyZenith: [0.03, 0.14, 0.13],
    skyMid: [0.08, 0.36, 0.31],
    skyHorizon: [0.28, 0.70, 0.55],
    sunDir: [0.22, 0.42, -0.88],
    sunCol: [0.78, 0.98, 0.72],
    fogCol: [0.15, 0.48, 0.40],
    fogDensity: 0.0043,
    stoneA: [0.11, 0.66, 0.52], // Emerald Canopy
    stoneB: [0.88, 0.89, 0.80], // Ivory Stalk
    accentBrass: [0.95, 0.74, 0.22],
    glowCol: [0.98, 0.80, 0.26], // Golden Spore Gills
    terrainLow: [0.10, 0.36, 0.28],
    terrainHigh: [0.16, 0.52, 0.40],
    moteCol: [1.0, 0.84, 0.32],
    prefixes: [
      ['翡翠', 'EMERALD'], ['荧光', 'LUMINOUS'], ['金孢', 'SPORE'], ['幽林', 'VERDANT'],
      ['碧盖', 'CANOPY'], ['浮光', 'BIOLUMEN'], ['古木', 'SYLVAN'], ['晨露', 'DEWDROP'],
    ],
    nouns: [
      ['荧光巨蕈', 'EMERALD MYCELIA'], ['菌盖圣林', 'CANOPY GROVE'], ['金孢幽谷', 'SPORE HOLLOW'],
      ['叠翠伞塔', 'TERRACED FUNGI'], ['灵根拱桥', 'MYCELIUM ARCH'], ['微光林苑', 'GLOWING GLADE'],
      ['翠影高台', 'JADE PAVILION'], ['生息神殿', 'VERDANT SANCTUM'],
    ],
  },
  {
    // 5: Origami Wind-Canyon
    baseZh: '折纸风蚀金峡',
    baseEn: 'ORIGAMI WIND-CANYON',
    skyZenith: [0.18, 0.11, 0.05],
    skyMid: [0.66, 0.34, 0.12],
    skyHorizon: [0.98, 0.72, 0.32],
    sunDir: [-0.26, 0.24, -0.93],
    sunCol: [1.0, 0.84, 0.44],
    fogCol: [0.88, 0.58, 0.24],
    fogDensity: 0.0038,
    stoneA: [0.88, 0.56, 0.26], // Amber Sandstone
    stoneB: [0.95, 0.84, 0.64], // Desert Ivory
    accentBrass: [0.96, 0.70, 0.18],
    glowCol: [0.20, 0.86, 0.76],
    terrainLow: [0.86, 0.58, 0.28],
    terrainHigh: [0.72, 0.38, 0.16],
    moteCol: [1.0, 0.78, 0.38],
    prefixes: [
      ['折纸', 'ORIGAMI'], ['双日', 'TWINSUN'], ['风蚀', 'WINDCARVED'], ['金砂', 'SAFFRON'],
      ['琥珀', 'AMBER'], ['风车', 'WINDVANE'], ['赤砂', 'SANDSTONE'], ['烈阳', 'SUNSCORCHED'],
    ],
    nouns: [
      ['风蚀金峡', 'WIND-CANYON'], ['天然砂拱', 'SANDSTONE ARCH'], ['风翼高塔', 'WINDMILL SPIRE'],
      ['双日大漠', 'BINARY DUNES'], ['棱面岩廊', 'FACETED GORGE'], ['流沙天桥', 'DUNE SPAN'],
      ['黄铜风标阵', 'VANE MONOLITHS'], ['金辉峡门', 'OCHRE GATE'],
    ],
  },
  {
    // 6: Arctic Prism Spire
    baseZh: '极昼冰晶棱镜',
    baseEn: 'ARCTIC PRISM SPIRE',
    skyZenith: [0.06, 0.22, 0.38],
    skyMid: [0.28, 0.64, 0.82],
    skyHorizon: [0.84, 0.96, 0.99],
    sunDir: [0.0, 0.28, -0.96],
    sunCol: [1.0, 0.95, 0.82],
    fogCol: [0.72, 0.90, 0.96],
    fogDensity: 0.0035,
    stoneA: [0.60, 0.89, 0.97], // Glacier Ice Cyan
    stoneB: [0.94, 0.98, 1.00], // Snow Ivory
    accentBrass: [0.96, 0.74, 0.24],
    glowCol: [0.38, 0.94, 1.00],
    terrainLow: [0.74, 0.91, 0.97],
    terrainHigh: [0.95, 0.98, 1.00],
    moteCol: [0.82, 0.97, 1.00],
    prefixes: [
      ['极昼', 'MIDNIGHT-SUN'], ['幻日', 'SUNDOG'], ['冰晶', 'CRYSTAL'], ['棱镜', 'PRISM'],
      ['霜冕', 'FROSTCROWN'], ['冰川', 'GLACIER'], ['凛光', 'HALO'], ['雪魄', 'DIAMOND'],
    ],
    nouns: [
      ['冰晶棱镜', 'PRISM SPIRE'], ['极光冰堂', 'ICE CATHEDRAL'], ['幻日冰拱', 'PARHELIA ARCH'],
      ['霜晶圣塔', 'GLACIER CITADEL'], ['镜面峡湾', 'MIRROR FJORD'], ['六棱冰林', 'HEXAGON COLUMNS'],
      ['寒晶天桥', 'FROZEN CAUSEWAY'], ['白昼圣殿', 'SOLSTICE SANCTUM'],
    ],
  },
  {
    // 7: Astral Armillary
    baseZh: '星环天体书院',
    baseEn: 'ASTRAL ARMILLARY',
    skyZenith: [0.02, 0.05, 0.09],
    skyMid: [0.05, 0.14, 0.22],
    skyHorizon: [0.11, 0.36, 0.40],
    sunDir: [0.14, 0.38, -0.91],
    sunCol: [1.0, 0.84, 0.46],
    fogCol: [0.07, 0.22, 0.28],
    fogDensity: 0.0031,
    stoneA: [0.11, 0.15, 0.20], // Obsidian Monolith
    stoneB: [0.93, 0.89, 0.80], // Celestial Ivory
    accentBrass: [0.96, 0.68, 0.18], // Solar Brass Armillary
    glowCol: [0.18, 0.88, 0.78], // Horizon Turquoise Starlight
    terrainLow: [0.05, 0.11, 0.16],
    terrainHigh: [0.14, 0.24, 0.30],
    moteCol: [1.0, 0.84, 0.42],
    prefixes: [
      ['星环', 'ASTRAL'], ['天球', 'CELESTIAL'], ['浑仪', 'ARMILLARY'], ['星轨', 'ORBITAL'],
      ['观星', 'OBSERVATORY'], ['金桥', 'STARBRIDGE'], ['太虚', 'COSMIC'], ['罗盘', 'COMPASS'],
    ],
    nouns: [
      ['天体书院', 'ASTRAL ARMILLARY'], ['浑天星环', 'ORRERY SANCTUM'], ['星光长桥', 'LIGHTBRIDGE'],
      ['观星碑廊', 'STARMAP GALLERY'], ['黄道神殿', 'ECLIPTIC TEMPLE'], ['天枢高塔', 'POLARIS SPIRE'],
      ['金轨回廊', 'ORBITAL CLOISTER'], ['万象星坛', 'ZODIAC ALTAR'],
    ],
  },
];

// Pure stateless archetype index for World #1..#999:
// Worlds #1..#8 showcase all 8 archetypes in sequence (0..7).
// Worlds #9..#999 step deterministically with step in [1..7] so archIdx(n) !== archIdx(n-1) ALWAYS!
export function getArchetypeForWorld(worldNumber) {
  const n = clamp(Math.round(worldNumber), 1, 999);
  if (n <= 8) return n - 1;
  let arch = 7;
  for (let i = 9; i <= n; i++) {
    const h = ((i * 2654435761) >>> 0) % 7;
    arch = (arch + 1 + h) % 8;
  }
  return arch;
}

export function getWorldMeta(worldNumber) {
  const n = clamp(Math.round(worldNumber), 1, 999);
  const archIdx = getArchetypeForWorld(n);
  const arch = ARCHETYPES[archIdx];
  const rng = mulberry32(n * 7919 + 104729);

  const padNum = String(n).padStart(3, '0');
  let zhName = arch.baseZh;
  let enName = arch.baseEn;

  if (n > 8) {
    const pIdx = (n * 3 + Math.floor(n / 8) * 5) % arch.prefixes.length;
    const nIdx = (n * 7 + Math.floor(n / 8) * 3) % arch.nouns.length;
    zhName = `${arch.prefixes[pIdx][0]}${arch.nouns[nIdx][0]}`;
    enName = `${arch.prefixes[pIdx][1]} ${arch.nouns[nIdx][1]}`;
  }

  const sunAzShift = n <= 2 ? 0.0 : (rng() - 0.5) * 0.42;
  const sunElShift = n <= 2 ? 0.0 : (rng() - 0.5) * 0.12;
  const sunDir = [
    arch.sunDir[0] + sunAzShift,
    clamp(arch.sunDir[1] + sunElShift, 0.14, 0.72),
    arch.sunDir[2],
  ];

  return {
    worldNumber: n,
    padNum,
    archIdx,
    zhName,
    enName,
    worldTitle: `WORLD #${padNum} · ${zhName} ${enName}`,
    shortTitle: `#${padNum} · ${zhName}`,
    skyZenith: arch.skyZenith,
    skyMid: arch.skyMid,
    skyHorizon: arch.skyHorizon,
    sunDir,
    sunCol: arch.sunCol,
    fogCol: arch.fogCol,
    fogDensity: arch.fogDensity,
    stoneA: arch.stoneA,
    stoneB: arch.stoneB,
    accentBrass: arch.accentBrass,
    glowCol: arch.glowCol,
    terrainLow: arch.terrainLow,
    terrainHigh: arch.terrainHigh,
    moteCol: arch.moteCol,
    seedFloat: (n * 1.37) % 100.0,
    curveAmp: n === 1 ? 5.2 : 4.2 + rng() * 6.4,
    curveFreq: 1.0 + Math.floor(rng() * 2.0),
    curvePhase: rng() * Math.PI * 2,
    noiseOffX: (rng() - 0.5) * 200.0,
    noiseOffZ: (rng() - 0.5) * 200.0,
  };
}

// --- Fast Static Architecture MeshBuilder (12 floats / vertex: pos3, norm3, uv2, colMat4) ---
class MeshBuilder {
  constructor(initialVerts = 16384, initialIdx = 36864) {
    this.verts = new Float32Array(initialVerts * 12);
    this.indices = new Uint32Array(initialIdx);
    this.vCount = 0;
    this.iCount = 0;
  }

  ensureCapacity(addV, addI) {
    if ((this.vCount + addV) * 12 > this.verts.length) {
      const next = new Float32Array(Math.max(this.verts.length * 2, (this.vCount + addV) * 24));
      next.set(this.verts);
      this.verts = next;
    }
    if (this.iCount + addI > this.indices.length) {
      const next = new Uint32Array(Math.max(this.indices.length * 2, (this.iCount + addI) * 2));
      next.set(this.indices);
      this.indices = next;
    }
  }

  pushVert(x, y, z, nx, ny, nz, u, v, r, g, b, mat) {
    const o = this.vCount * 12;
    this.verts[o] = x;
    this.verts[o + 1] = y;
    this.verts[o + 2] = z;
    this.verts[o + 3] = nx;
    this.verts[o + 4] = ny;
    this.verts[o + 5] = nz;
    this.verts[o + 6] = u;
    this.verts[o + 7] = v;
    this.verts[o + 8] = r;
    this.verts[o + 9] = g;
    this.verts[o + 10] = b;
    this.verts[o + 11] = mat;
    return this.vCount++;
  }

  pushTri(a, b, c) {
    this.indices[this.iCount++] = a;
    this.indices[this.iCount++] = b;
    this.indices[this.iCount++] = c;
  }

  pushQuad(a, b, c, d) {
    this.indices[this.iCount++] = a;
    this.indices[this.iCount++] = b;
    this.indices[this.iCount++] = c;
    this.indices[this.iCount++] = a;
    this.indices[this.iCount++] = c;
    this.indices[this.iCount++] = d;
  }

  addBox(cx, cy, cz, sx, sy, sz, col, mat = 0.0, rotY = 0.0) {
    this.ensureCapacity(24, 36);
    const hx = sx * 0.5;
    const hy = sy * 0.5;
    const hz = sz * 0.5;
    const c = Math.cos(rotY);
    const s = Math.sin(rotY);
    const tx = (lx, lz) => cx + lx * c + lz * s;
    const tz = (lx, lz) => cz - lx * s + lz * c;
    const r = col[0], g = col[1], b = col[2];

    const faces = [
      { n: [s, 0, c], p: [[-hx, -hy, hz], [hx, -hy, hz], [hx, hy, hz], [-hx, hy, hz]] },
      { n: [-s, 0, -c], p: [[hx, -hy, -hz], [-hx, -hy, -hz], [-hx, hy, -hz], [hx, hy, -hz]] },
      { n: [c, 0, -s], p: [[hx, -hy, hz], [hx, -hy, -hz], [hx, hy, -hz], [hx, hy, hz]] },
      { n: [-c, 0, s], p: [[-hx, -hy, -hz], [-hx, -hy, hz], [-hx, hy, hz], [-hx, hy, -hz]] },
      { n: [0, 1, 0], p: [[-hx, hy, hz], [hx, hy, hz], [hx, hy, -hz], [-hx, hy, -hz]] },
      { n: [0, -1, 0], p: [[-hx, -hy, -hz], [hx, -hy, -hz], [hx, -hy, hz], [-hx, -hy, hz]] },
    ];

    for (const f of faces) {
      const i0 = this.pushVert(tx(f.p[0][0], f.p[0][2]), cy + f.p[0][1], tz(f.p[0][0], f.p[0][2]), f.n[0], f.n[1], f.n[2], 0, 0, r, g, b, mat);
      const i1 = this.pushVert(tx(f.p[1][0], f.p[1][2]), cy + f.p[1][1], tz(f.p[1][0], f.p[1][2]), f.n[0], f.n[1], f.n[2], 1, 0, r, g, b, mat);
      const i2 = this.pushVert(tx(f.p[2][0], f.p[2][2]), cy + f.p[2][1], tz(f.p[2][0], f.p[2][2]), f.n[0], f.n[1], f.n[2], 1, 1, r, g, b, mat);
      const i3 = this.pushVert(tx(f.p[3][0], f.p[3][2]), cy + f.p[3][1], tz(f.p[3][0], f.p[3][2]), f.n[0], f.n[1], f.n[2], 0, 1, r, g, b, mat);
      this.pushQuad(i0, i1, i2, i3);
    }
  }

  // Tapered column, cone, pyramid, crystal spire, or mushroom cap!
  addTaperedPillar(cx, baseY, cz, rBot, rTop, height, segs, col, mat = 0.0, leanX = 0.0, leanZ = 0.0) {
    this.ensureCapacity((segs + 1) * 2 + segs * 2 + 4, segs * 12);
    const r = col[0], g = col[1], b = col[2];
    const slopeY = (rBot - rTop) / Math.max(height, 0.01);

    const ringBot = [];
    const ringTop = [];
    for (let i = 0; i <= segs; i++) {
      const u = i / segs;
      const a = u * Math.PI * 2;
      const ca = Math.cos(a);
      const sa = Math.sin(a);
      const nl = Math.hypot(ca, slopeY, sa) || 1;
      const nx = ca / nl, ny = slopeY / nl, nz = sa / nl;

      ringBot.push(this.pushVert(cx + ca * rBot, baseY, cz + sa * rBot, nx, ny, nz, u, 0, r, g, b, mat));
      ringTop.push(this.pushVert(cx + leanX + ca * rTop, baseY + height, cz + leanZ + sa * rTop, nx, ny, nz, u, 1, r, g, b, mat));
    }
    for (let i = 0; i < segs; i++) {
      this.pushQuad(ringBot[i], ringBot[i + 1], ringTop[i + 1], ringTop[i]);
    }

    // Top cap if rTop > 0.02
    if (rTop > 0.02) {
      const topCenter = this.pushVert(cx + leanX, baseY + height, cz + leanZ, 0, 1, 0, 0.5, 0.5, r, g, b, mat);
      for (let i = 0; i < segs; i++) {
        const a0 = (i / segs) * Math.PI * 2;
        const a1 = ((i + 1) / segs) * Math.PI * 2;
        const v0 = this.pushVert(cx + leanX + Math.cos(a0) * rTop, baseY + height, cz + leanZ + Math.sin(a0) * rTop, 0, 1, 0, 0, 0, r, g, b, mat);
        const v1 = this.pushVert(cx + leanX + Math.cos(a1) * rTop, baseY + height, cz + leanZ + Math.sin(a1) * rTop, 0, 1, 0, 1, 0, r, g, b, mat);
        this.pushTri(topCenter, v1, v0);
      }
    }
    // Bottom cap if rBot > 0.02 (vital for overhanging mushroom gill undersides!)
    if (rBot > 0.02) {
      const botCenter = this.pushVert(cx, baseY, cz, 0, -1, 0, 0.5, 0.5, r, g, b, mat);
      for (let i = 0; i < segs; i++) {
        const a0 = (i / segs) * Math.PI * 2;
        const a1 = ((i + 1) / segs) * Math.PI * 2;
        const v0 = this.pushVert(cx + Math.cos(a0) * rBot, baseY, cz + Math.sin(a0) * rBot, 0, -1, 0, 0, 0, r, g, b, mat);
        const v1 = this.pushVert(cx + Math.cos(a1) * rBot, baseY, cz + Math.sin(a1) * rBot, 0, -1, 0, 1, 0, r, g, b, mat);
        this.pushTri(botCenter, v0, v1);
      }
    }
  }

  // Semicircular 3D Architectural Arch (spans from -spanR to +spanR in X, rotated by rotY)
  addArchSpan(cx, baseY, cz, innerR, radialThick, depthZ, segs, col, mat = 0.0, rotY = 0.0) {
    const outerR = innerR + radialThick;
    const hz = depthZ * 0.5;
    const c = Math.cos(rotY);
    const s = Math.sin(rotY);
    const tx = (lx, lz) => cx + lx * c + lz * s;
    const tz = (lx, lz) => cz - lx * s + lz * c;

    for (let i = 0; i < segs; i++) {
      const a0 = (i / segs) * Math.PI;
      const a1 = ((i + 1) / segs) * Math.PI;
      const am = (a0 + a1) * 0.5;
      const midR = (innerR + outerR) * 0.5;
      const segLen = (a1 - a0) * outerR * 1.06;
      const lx = Math.cos(am) * midR;
      const ly = Math.sin(am) * midR;
      // Approximate each voussoir block cleanly using oriented radial box segments:
      this.ensureCapacity(24, 36);
      const ca = Math.cos(am), sa = Math.sin(am);
      const u1x = ca, u1y = sa;   // radial outward
      const u2x = -sa, u2y = ca;  // tangential along arch
      const hr = radialThick * 0.52;
      const ht = segLen * 0.54;
      const r = col[0], g = col[1], b = col[2];

      const pt = (dr, dt, dz) => {
        const px = lx + u1x * dr + u2x * dt;
        const py = baseY + ly + u1y * dr + u2y * dt;
        return [tx(px, dz), py, tz(px, dz)];
      };

      const p00p = pt(-hr, -ht, hz), p10p = pt(hr, -ht, hz), p11p = pt(hr, ht, hz), p01p = pt(-hr, ht, hz);
      const p00n = pt(-hr, -ht, -hz), p10n = pt(hr, -ht, -hz), p11n = pt(hr, ht, -hz), p01n = pt(-hr, ht, -hz);

      const addQ = (pa, pb, pc, pd, nx, ny, nz) => {
        const i0 = this.pushVert(pa[0], pa[1], pa[2], nx, ny, nz, 0, 0, r, g, b, mat);
        const i1 = this.pushVert(pb[0], pb[1], pb[2], nx, ny, nz, 1, 0, r, g, b, mat);
        const i2 = this.pushVert(pc[0], pc[1], pc[2], nx, ny, nz, 1, 1, r, g, b, mat);
        const i3 = this.pushVert(pd[0], pd[1], pd[2], nx, ny, nz, 0, 1, r, g, b, mat);
        this.pushQuad(i0, i1, i2, i3);
      };

      addQ(p00p, p10p, p11p, p01p, s, 0, c);
      addQ(p10n, p00n, p01n, p11n, -s, 0, -c);
      addQ(p10p, p10n, p11n, p11p, ca * c, sa, -ca * s);
      addQ(p00n, p00p, p01p, p01n, -ca * c, -sa, ca * s);
    }
  }

  // Monumental Glowing Architectural Portal Archway (doorway ~10.7m wide x 15.3m tall, outer monument ~17m x 20.5m)
  addPortalMonument(zPos, wp, isExit = true) {
    const stone = [0.95, 0.91, 0.84];
    const obsidian = [0.11, 0.15, 0.20];
    const brass = [0.96, 0.68, 0.16];
    const turquoise = [0.18, 0.86, 0.76];
    const solarGlow = [1.0, 0.74, 0.20];

    // 1. Ceremonial Stepped Causeway Threshold Plinth (top sits at y = 0.35 matching doorway bottom!)
    this.addBox(0, -0.15, zPos, 21.0, 1.0, 7.6, obsidian, 1.0);
    this.addBox(0, 0.18, zPos, 17.6, 0.34, 5.4, stone, 1.0);
    // Glowing golden-teal threshold sill strip
    this.addBox(0, 0.34, zPos, 11.2, 0.12, 2.2, turquoise, 3.6);

    // 2. Twin Colossal Fluted Pylons flanking x = +-5.35..+-8.35 (doorway opening = 10.70m wide!)
    for (const side of [-1, 1]) {
      const px = side * 6.85;
      // Pylon base & shaft
      this.addBox(px, 1.2, zPos, 3.4, 1.8, 3.8, stone, 1.0);
      this.addBox(px, 8.2, zPos, 3.0, 14.8, 3.1, stone, 1.0);
      // Obsidian & Solar Brass architectural bands
      this.addBox(px, 4.5, zPos, 3.22, 0.55, 3.32, brass, 2.0);
      this.addBox(px, 9.5, zPos, 3.22, 0.55, 3.32, brass, 2.0);
      this.addBox(px, 14.8, zPos, 3.55, 1.1, 3.65, brass, 2.0);

      // Glowing Energy Trim along the inner doorway jambs & front flutes!
      this.addBox(side * 5.46, 8.0, zPos, 0.28, 15.4, 2.4, side < 0 ? solarGlow : turquoise, 3.9);
      this.addBox(px, 8.2, zPos + 1.58, 0.36, 12.6, 0.18, turquoise, 3.6);
      this.addBox(px - side * 0.75, 8.2, zPos + 1.58, 0.22, 11.4, 0.16, solarGlow, 3.7);
    }

    // 3. Grand Stepped Entablature & Solar Astrolabe Crown above y = 15.65
    this.addBox(0, 16.45, zPos, 18.4, 1.6, 4.0, stone, 1.0);
    this.addBox(0, 17.65, zPos, 16.2, 0.9, 3.4, obsidian, 1.0);
    this.addBox(0, 18.45, zPos, 13.0, 0.75, 2.8, brass, 2.0);
    // Inner top soffit energy trim
    this.addBox(0, 15.68, zPos, 11.1, 0.28, 2.4, solarGlow, 3.9);
    // Glowing frieze bar across the entablature
    this.addBox(0, 16.45, zPos + 2.02, 13.6, 0.34, 0.18, turquoise, 3.7);

    // Crown Sundial Crest atop the Portal
    if (isExit) {
      this.addTaperedPillar(0, 18.8, zPos, 1.6, 0.12, 3.6, 6, brass, 2.0);
      this.addArchSpan(0, 18.6, zPos, 2.6, 0.38, 0.55, 10, solarGlow, 3.8);

      // Guardian Approach Obelisks framing the portal avenue
      for (const side of [-1, 1]) {
        const ox = side * 12.6;
        const oz = zPos + 7.5;
        const oy = worldTerrainH(wp, ox, oz);
        this.addBox(ox, oy + 0.6, oz, 2.6, 1.4, 2.6, wp.stoneA, 0.5);
        this.addTaperedPillar(ox, oy + 1.2, oz, 1.05, 0.25, 11.5, 4, wp.stoneB, 1.0);
        this.addTaperedPillar(ox, oy + 12.7, oz, 0.55, 0.04, 1.8, 4, solarGlow, 3.8);
      }
    }
  }

  uploadToGL(gl) {
    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);

    const vbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, this.verts.subarray(0, this.vCount * 12), gl.STATIC_DRAW);

    const stride = 12 * 4;
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, stride, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 3, gl.FLOAT, false, stride, 12);
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 2, gl.FLOAT, false, stride, 24);
    gl.enableVertexAttribArray(3);
    gl.vertexAttribPointer(3, 4, gl.FLOAT, false, stride, 32);

    const ibo = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, this.indices.subarray(0, this.iCount), gl.STATIC_DRAW);

    gl.bindVertexArray(null);
    return {
      vao,
      vbo,
      ibo,
      count: this.iCount,
      indexType: gl.UNSIGNED_INT,
    };
  }
}

// --- Build Terrain Mesh (80 x 60 grid covering x: [-96..96], z: [-168..82]) ---
function buildWorldTerrainMesh(gl, wp) {
  const nx = 76;
  const nz = 58;
  const xMin = -96.0, xMax = 96.0;
  const zMin = -168.0, zMax = 82.0;

  const verts = new Float32Array((nx + 1) * (nz + 1) * 12);
  const indices = new Uint32Array(nx * nz * 6);

  let vo = 0;
  for (let iz = 0; iz <= nz; iz++) {
    const vz = iz / nz;
    const z = lerp(zMin, zMax, vz);
    for (let ix = 0; ix <= nx; ix++) {
      const ux = ix / nx;
      const x = lerp(xMin, xMax, ux);
      const y = worldTerrainH(wp, x, z);
      const nrm = worldTerrainNormal(wp, x, z);

      const hFactor = clamp((y + 3.0) / 14.0, 0, 1);
      // Ceremonial stone causeway tint near portal thresholds
      const plazaDist = Math.min(Math.hypot(x, z - PORTAL_Z), Math.hypot(x, z - ENTRANCE_Z));
      const plazaBlend = 1.0 - clamp((plazaDist - 9.0) / 11.0, 0, 1);

      let cr = lerp(wp.terrainLow[0], wp.terrainHigh[0], hFactor);
      let cg = lerp(wp.terrainLow[1], wp.terrainHigh[1], hFactor);
      let cb = lerp(wp.terrainLow[2], wp.terrainHigh[2], hFactor);

      cr = lerp(cr, 0.90, plazaBlend * 0.65);
      cg = lerp(cg, 0.86, plazaBlend * 0.65);
      cb = lerp(cb, 0.78, plazaBlend * 0.65);

      verts[vo] = x;
      verts[vo + 1] = y;
      verts[vo + 2] = z;
      verts[vo + 3] = nrm[0];
      verts[vo + 4] = nrm[1];
      verts[vo + 5] = nrm[2];
      verts[vo + 6] = ux * 16.0;
      verts[vo + 7] = vz * 22.0;
      verts[vo + 8] = cr;
      verts[vo + 9] = cg;
      verts[vo + 10] = cb;
      verts[vo + 11] = -1.0; // Terrain material marker for procedural surface shader
      vo += 12;
    }
  }

  let io = 0;
  const row = nx + 1;
  for (let iz = 0; iz < nz; iz++) {
    for (let ix = 0; ix < nx; ix++) {
      const a = iz * row + ix;
      const b = a + 1;
      const c = a + row;
      const d = c + 1;
      indices[io++] = a;
      indices[io++] = c;
      indices[io++] = b;
      indices[io++] = b;
      indices[io++] = c;
      indices[io++] = d;
    }
  }

  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);
  const vbo = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
  gl.bufferData(gl.ARRAY_BUFFER, verts, gl.STATIC_DRAW);
  const stride = 48;
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 3, gl.FLOAT, false, stride, 0);
  gl.enableVertexAttribArray(1);
  gl.vertexAttribPointer(1, 3, gl.FLOAT, false, stride, 12);
  gl.enableVertexAttribArray(2);
  gl.vertexAttribPointer(2, 2, gl.FLOAT, false, stride, 24);
  gl.enableVertexAttribArray(3);
  gl.vertexAttribPointer(3, 4, gl.FLOAT, false, stride, 32);

  const ibo = gl.createBuffer();
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);
  gl.bindVertexArray(null);

  return { vao, vbo, ibo, count: indices.length, indexType: gl.UNSIGNED_INT };
}

// --- Populate Archetype-Specific Surreal Architecture + Kinetic Spinners ---
function populateArchetypeArchitecture(mb, wp, rng, spinners) {
  const arch = wp.archIdx;

  // 1. Always build Exit Portal Monument at z = -115 and Arrival Frame at z = +55
  mb.addPortalMonument(PORTAL_Z, wp, true);
  mb.addPortalMonument(ENTRANCE_Z, wp, false);

  if (arch === 0) {
    // 0: Sundial Sanctum — Floating marble colonnades, sundial gnomons & giant rotating brass astrolabes
    for (let z = 36; z >= -98; z -= 22) {
      const cx = corridorCenterX(wp, z);
      for (const side of [-1, 1]) {
        const px = cx + side * (14.5 + rng() * 4.5);
        const py = Math.max(-2.5, worldTerrainH(wp, px, z));
        // Floating marble sanctum plinth + twin colonnade + entablature
        mb.addBox(px, py - 1.2, z, 7.5, 2.8, 9.5, wp.stoneB, 0.5);
        mb.addTaperedPillar(px, py + 0.2, z - 2.8, 0.85, 0.72, 12.5, 8, wp.stoneA, 1.0);
        mb.addTaperedPillar(px, py + 0.2, z + 2.8, 0.85, 0.72, 12.5, 8, wp.stoneA, 1.0);
        mb.addBox(px, py + 13.2, z, 2.8, 1.2, 8.6, wp.stoneA, 1.0);
        mb.addBox(px, py + 14.0, z, 1.8, 0.45, 7.8, wp.accentBrass, 2.0);
        if (rng() > 0.45) {
          // Angled solar-brass sundial gnomon spire
          mb.addTaperedPillar(px + side * 4.5, py + 0.5, z, 1.2, 0.08, 18.0, 4, wp.accentBrass, 2.0, -side * 3.5, -2.0);
        }
      }
    }
    // Giant Rotating Overhead Brass Astrolabe Rings!
    for (const zRing of [12, -38, -82]) {
      const cx = corridorCenterX(wp, zRing);
      spinners.push({ kind: 'astrolabe', x: cx, y: 9.2, z: zRing, scale: 11.5, speed: 0.48, phase: rng() * 6.28, col: wp.accentBrass, mat: 2.0 });
      spinners.push({ kind: 'astrolabeTilt', x: cx, y: 9.2, z: zRing, scale: 9.4, speed: -0.65, phase: rng() * 6.28, col: wp.glowCol, mat: 3.4 });
    }
  } else if (arch === 1) {
    // 1: Obsidian Ziggurat — Stepped basalt ziggurat pyramids, glowing lava seams & fire obelisks
    for (let z = 32; z >= -96; z -= 28) {
      const cx = corridorCenterX(wp, z);
      for (const side of [-1, 1]) {
        const zx = cx + side * (22.0 + rng() * 6.0);
        const zy = worldTerrainH(wp, zx, z) - 1.0;
        for (let step = 0; step < 5; step++) {
          const w = 16.0 - step * 2.8;
          const sy = zy + step * 3.6;
          mb.addBox(zx, sy + 1.7, z, w, 3.4, w, wp.stoneA, 0.4);
          mb.addBox(zx, sy + 3.45, z, w * 0.96, 0.28, w * 0.96, wp.glowCol, 3.6);
        }
        // Temple brazier crown
        mb.addTaperedPillar(zx, zy + 18.2, z, 1.4, 0.2, 4.2, 4, wp.glowCol, 3.9);
      }
      // Closer obsidian fire-obelisks along magma riverbanks
      for (const side of [-1, 1]) {
        const ox = cx + side * 12.2;
        mb.addTaperedPillar(ox, -2.2, z + 11, 1.3, 0.35, 11.0, 4, wp.stoneA, 1.0);
        mb.addTaperedPillar(ox, 8.8, z + 11, 0.65, 0.05, 2.2, 4, wp.glowCol, 3.9);
      }
    }
    for (const zRing of [4, -52]) {
      const cx = corridorCenterX(wp, zRing);
      spinners.push({ kind: 'astrolabe', x: cx, y: 8.5, z: zRing, scale: 10.5, speed: 0.55, phase: rng() * 6.28, col: wp.accentBrass, mat: 2.0 });
    }
  } else if (arch === 2) {
    // 2: Abyssal Coralhenge — Giant spiral nautilus shell towers & swaying bioluminescent kelp arches
    for (let z = 36; z >= -98; z -= 24) {
      const cx = corridorCenterX(wp, z);
      for (const side of [-1, 1]) {
        const sx = cx + side * (15.0 + rng() * 7.0);
        const sy = worldTerrainH(wp, sx, z) - 0.5;
        // Spiral shell monolith built from ascending offset tapered rings
        for (let k = 0; k < 7; k++) {
          const ang = k * 0.75 + z * 0.1;
          const rad = (7 - k) * 0.46;
          const ox = sx + Math.cos(ang) * (k * 0.35);
          const oz = z + Math.sin(ang) * (k * 0.35);
          const segCol = k % 2 === 0 ? wp.stoneA : wp.stoneB;
          mb.addTaperedPillar(ox, sy + k * 2.5, oz, rad + 0.4, rad * 0.82, 2.7, 7, segCol, 0.8);
        }
        mb.addTaperedPillar(sx, sy + 17.5, z, 0.6, 0.05, 3.2, 6, wp.glowCol, 3.6);
      }
      // Overarching Bioluminescent Kelp / Coral Rib Archway spanning corridor
      if (z % 48 === 12 || Math.abs(z + 36) < 6 || Math.abs(z + 84) < 6) {
        mb.addArchSpan(cx, -1.5, z, 13.5, 1.1, 1.8, 12, wp.stoneB, 0.6);
        mb.addArchSpan(cx, -1.5, z + 0.9, 12.8, 0.42, 0.5, 12, wp.glowCol, 3.6);
      }
    }
    for (const zKelp of [16, -28, -72]) {
      const cx = corridorCenterX(wp, zKelp);
      spinners.push({ kind: 'kelpHalo', x: cx, y: 8.2, z: zKelp, scale: 10.2, speed: 0.72, phase: rng() * 6.28, col: wp.glowCol, mat: 3.5 });
    }
  } else if (arch === 3) {
    // 3: Monument Aqueducts — Warm terracotta & ivory Escher-style multi-tier aqueducts & sky stairways
    const viaductZs = [18, -32, -80];
    for (const vz of viaductZs) {
      const cx = corridorCenterX(wp, vz);
      // Grand multi-arch viaduct spanning right across [-36..+36] with clear 14m center arch!
      for (const archCenter of [-24, 0, 24]) {
        const ax = cx + archCenter;
        mb.addBox(ax - 7.5, 6.5, vz, 2.6, 15.0, 3.4, wp.stoneA, 0.3);
        mb.addBox(ax + 7.5, 6.5, vz, 2.6, 15.0, 3.4, wp.stoneA, 0.3);
        mb.addArchSpan(ax, 11.5, vz, 6.2, 1.6, 3.4, 10, wp.stoneB, 0.6);
      }
      // Upper aqueduct deck + miniature arcade + turquoise pavilion domes
      mb.addBox(cx, 19.6, vz, 68.0, 1.5, 4.2, wp.stoneB, 0.8);
      mb.addBox(cx, 20.6, vz, 68.0, 0.5, 4.5, wp.stoneA, 0.4);
      for (const side of [-1, 1]) {
        const px = cx + side * 15.0;
        mb.addBox(px, 22.4, vz, 4.2, 3.2, 4.2, wp.stoneB, 0.8);
        mb.addTaperedPillar(px, 24.0, vz, 2.5, 0.1, 3.2, 8, wp.accentBrass, 1.0);
      }
    }
    // Escher-inspired Floating Stairways & Hovering Obelisks between viaducts
    for (let z = 38; z >= -96; z -= 26) {
      const cx = corridorCenterX(wp, z);
      for (const side of [-1, 1]) {
        const sx = cx + side * 14.5;
        for (let s = 0; s < 8; s++) {
          mb.addBox(sx - side * s * 0.55, 2.5 + s * 1.15, z + s * 0.9, 2.8, 0.6, 1.2, s % 2 === 0 ? wp.stoneB : wp.stoneA, 0.6);
        }
        // Hovering impossible obelisk
        mb.addTaperedPillar(sx, 13.5, z, 0.9, 0.15, 5.2, 4, wp.stoneB, 1.0);
        mb.addTaperedPillar(sx, 13.5, z, 0.9, 0.15, -2.0, 4, wp.accentBrass, 2.0);
      }
    }
  } else if (arch === 4) {
    // 4: Emerald Mycelia — Towering terraced emerald-cyan giant mushrooms with glowing golden gills
    for (let z = 40; z >= -102; z -= 19) {
      const cx = corridorCenterX(wp, z);
      for (const side of [-1, 1]) {
        const mx = cx + side * (13.0 + rng() * 9.0);
        const my = worldTerrainH(wp, mx, z) - 0.6;
        const h = 11.5 + rng() * 11.0;
        const capR = 5.2 + rng() * 3.8;
        const lean = -side * (1.2 + rng() * 1.8);
        // Ivory-jade stalk
        mb.addTaperedPillar(mx, my, z, 1.35, 0.78, h, 7, wp.stoneB, 0.5, lean, 0);
        // Glowing Golden Spore Gill Underside
        mb.addTaperedPillar(mx + lean, my + h - 0.5, z, capR * 0.92, 0.8, 1.2, 9, wp.glowCol, 3.5);
        // Terraced Emerald Umbrella Canopy + Luminous Rim Spots
        mb.addTaperedPillar(mx + lean, my + h + 0.2, z, capR, capR * 0.32, 2.6, 9, wp.stoneA, 0.9);
        mb.addTaperedPillar(mx + lean, my + h + 2.5, z, capR * 0.38, 0.15, 1.4, 9, [0.18, 0.88, 0.72], 3.3);
      }
    }
    for (const zSpore of [8, -44, -86]) {
      const cx = corridorCenterX(wp, zSpore);
      spinners.push({ kind: 'kelpHalo', x: cx, y: 8.6, z: zSpore, scale: 9.6, speed: 0.52, phase: rng() * 6.28, col: wp.glowCol, mat: 3.6 });
    }
  } else if (arch === 5) {
    // 5: Origami Wind-Canyon — Faceted amber sandstone natural arches & kinetic brass wind-vanes
    for (let z = 24; z >= -88; z -= 36) {
      const cx = corridorCenterX(wp, z);
      // Sweeping faceted sandstone arch right over the canyon!
      mb.addArchSpan(cx, -1.0, z, 15.2, 2.8, 4.4, 7, wp.stoneA, 0.3, (rng() - 0.5) * 0.25);
    }
    for (let z = 38; z >= -98; z -= 22) {
      const cx = corridorCenterX(wp, z);
      for (const side of [-1, 1]) {
        const wx = cx + side * (14.5 + rng() * 5.0);
        const wy = worldTerrainH(wp, wx, z) - 0.8;
        const th = 12.0 + rng() * 6.0;
        // Faceted origami sandstone pylon + kinetic spinning desert wind-vane!
        mb.addTaperedPillar(wx, wy, z, 2.4, 0.95, th, 4, wp.stoneB, 0.4);
        mb.addBox(wx, wy + th + 0.5, z, 1.6, 1.0, 1.6, wp.accentBrass, 2.0);
        spinners.push({
          kind: 'windVane',
          x: wx - side * 1.1,
          y: wy + th + 0.5,
          z,
          scale: 4.8,
          speed: side * (1.8 + rng() * 0.9),
          phase: rng() * 6.28,
          col: wp.accentBrass,
          mat: 2.0,
        });
      }
    }
  } else if (arch === 6) {
    // 6: Arctic Prism Spire — Translucent glacier-cyan crystal cathedrals & frozen halo arches
    for (let z = 38; z >= -100; z -= 20) {
      const cx = corridorCenterX(wp, z);
      for (const side of [-1, 1]) {
        const ix = cx + side * (13.5 + rng() * 6.5);
        const iy = worldTerrainH(wp, ix, z) - 1.0;
        // Cluster of 3 angled hexagonal ice-crystal cathedral spires
        mb.addTaperedPillar(ix, iy, z, 2.2, 0.08, 19.5 + rng() * 6.0, 6, wp.stoneA, 1.0, -side * 2.2, 0);
        mb.addTaperedPillar(ix + side * 2.6, iy, z + 2.2, 1.5, 0.06, 13.5, 6, wp.stoneB, 1.0, side * 1.4, 1.0);
        mb.addTaperedPillar(ix - side * 1.4, iy, z - 2.0, 1.2, 0.05, 10.5, 6, wp.glowCol, 3.3, -side * 1.2, -0.8);
      }
      if (Math.abs(z - 18) < 5 || Math.abs(z + 42) < 5 || Math.abs(z + 82) < 5) {
        mb.addArchSpan(cx, -1.2, z, 14.2, 1.3, 1.8, 8, wp.stoneA, 1.0);
      }
    }
    for (const zIce of [-12, -62]) {
      const cx = corridorCenterX(wp, zIce);
      spinners.push({ kind: 'astrolabe', x: cx, y: 9.0, z: zIce, scale: 10.8, speed: 0.42, phase: rng() * 6.28, col: wp.glowCol, mat: 3.4 });
    }
  } else {
    // 7: Astral Armillary — Golden light-bridges, celestial library steles & giant orbiting armillary spheres
    for (let z = 44; z >= -104; z -= 14) {
      const cx = corridorCenterX(wp, z);
      // Floating Golden Light-Bridge segments beneath the flight path!
      mb.addBox(cx, -0.35, z, 8.8, 0.28, 11.5, wp.accentBrass, 2.0);
      mb.addBox(cx - 4.2, -0.15, z, 0.35, 0.25, 11.5, wp.glowCol, 3.7);
      mb.addBox(cx + 4.2, -0.15, z, 0.35, 0.25, 11.5, wp.glowCol, 3.7);

      if (Math.abs(z % 28) < 8) {
        for (const side of [-1, 1]) {
          const sx = cx + side * 15.5;
          mb.addBox(sx, 6.0, z, 2.4, 16.5, 3.6, wp.stoneA, 1.0);
          mb.addBox(sx - side * 1.22, 6.5, z, 0.18, 12.5, 0.45, wp.glowCol, 3.7);
          mb.addTaperedPillar(sx, 14.3, z, 1.3, 0.08, 3.4, 4, wp.accentBrass, 2.0);
        }
      }
    }
    // Colossal Multi-Axis Orbiting Brass Armillary Spheres!
    for (const zArm of [14, -36, -82]) {
      const cx = corridorCenterX(wp, zArm);
      spinners.push({ kind: 'astrolabe', x: cx, y: 8.8, z: zArm, scale: 12.8, speed: 0.54, phase: rng() * 6.28, col: wp.accentBrass, mat: 2.0 });
      spinners.push({ kind: 'astrolabeTilt', x: cx, y: 8.8, z: zArm, scale: 10.6, speed: -0.78, phase: rng() * 6.28, col: wp.glowCol, mat: 3.6 });
    }
  }

  // Far-Horizon Backdrop Spires behind z = -132..-162 (outside the portal pocket so outer landscape has grand depth!)
  for (const side of [-1, 1]) {
    const bx = side * (26.0 + rng() * 14.0);
    const bz = -138.0 - rng() * 18.0;
    const by = worldTerrainH(wp, bx, bz) - 1.0;
    mb.addTaperedPillar(bx, by, bz, 5.5, 0.4, 28.0 + rng() * 10.0, 6, wp.stoneA, 0.6);
  }
}

// --- Generate a Complete Deterministic 3D World Instance ---
export function generateWorld(gl, worldNumber) {
  const meta = getWorldMeta(worldNumber);
  const rng = mulberry32(meta.worldNumber * 15485863 + 32452843);

  const terrainMesh = buildWorldTerrainMesh(gl, meta);
  const mb = new MeshBuilder(18000, 42000);
  const spinners = [];
  populateArchetypeArchitecture(mb, meta, rng, spinners);
  const archMesh = mb.uploadToGL(gl);

  // 4 Glowing Resonance Rings along the 170m flight avenue (z: +24 -> -88)
  const rings = [];
  const ringZs = [20, -16, -52, -86];
  for (let i = 0; i < ringZs.length; i++) {
    const rz = ringZs[i];
    const cx = corridorCenterX(meta, rz) + (rng() - 0.5) * 5.0;
    const ry = 6.4 + Math.sin(i * 1.4 + meta.curvePhase) * 2.4;
    rings.push({
      x: cx,
      y: ry,
      z: rz,
      radius: 4.0,
      collected: false,
      pulse: rng() * 6.28,
    });
  }

  // 10 Rotating Astral Shards (+200 pts each) leading between rings & into the Portal Archway!
  const shards = [];
  for (let i = 0; i < 10; i++) {
    const f = (i + 0.5) / 10;
    const sz = lerp(38.0, -104.0, f);
    const baseCx = corridorCenterX(meta, sz);
    const offset = sz < -92 ? 0.0 : Math.sin(i * 1.15 + meta.curvePhase) * 3.6;
    const sy = sz < -92 ? 7.6 : 6.2 + Math.cos(i * 0.95 + meta.curvePhase) * 2.2;
    shards.push({
      x: baseCx + offset,
      y: sy,
      z: sz,
      collected: false,
      rot: i * 0.7,
    });
  }

  return {
    meta,
    terrainMesh,
    archMesh,
    rings,
    shards,
    spinners,
  };
}

export function disposeWorld(gl, world) {
  if (!world) return;
  for (const m of [world.terrainMesh, world.archMesh]) {
    if (!m) continue;
    if (m.vao) gl.deleteVertexArray(m.vao);
    if (m.vbo) gl.deleteBuffer(m.vbo);
    if (m.ibo) gl.deleteBuffer(m.ibo);
  }
}

// --- Shared Reusable Dynamic Primitives (Skybox, Portal Pocket, Torus, Octahedron, WindVane, Sky-Glider) ---
export function createSharedPrimitives(gl) {
  // 1. Sky Sphere (position-only attribute loc 0)
  const skySphere = (() => {
    const lat = 18, lon = 28;
    const pos = [];
    const idx = [];
    for (let y = 0; y <= lat; y++) {
      const v = y / lat;
      const phi = v * Math.PI;
      for (let x = 0; x <= lon; x++) {
        const u = x / lon;
        const th = u * Math.PI * 2;
        pos.push(Math.sin(phi) * Math.cos(th), Math.cos(phi), Math.sin(phi) * Math.sin(th));
      }
    }
    for (let y = 0; y < lat; y++) {
      for (let x = 0; x < lon; x++) {
        const a = y * (lon + 1) + x;
        const b = a + lon + 1;
        idx.push(a, b, a + 1, b, b + 1, a + 1);
      }
    }
    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    const vbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(pos), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 12, 0);
    const ibo = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(idx), gl.STATIC_DRAW);
    gl.bindVertexArray(null);
    return { vao, count: idx.length, indexType: gl.UNSIGNED_SHORT };
  })();

  // 2. 5-Sided Inward-Facing Portal Pocket at local z in [0.0 .. -1.8], x in [-5.38..5.38], y in [0.32..15.68]
  // Prevents near-plane clipping right as camera crosses z = -115.0!
  const portalPocket = (() => {
    const x0 = -5.38, x1 = 5.38;
    const y0 = 0.32, y1 = 15.68;
    const zf = 0.0, zb = -1.85;
    const pos = [
      // Back wall at zb
      x0, y0, zb,  x1, y0, zb,  x1, y1, zb,  x0, y1, zb,
      // Left inner wall at x0
      x0, y0, zf,  x0, y0, zb,  x0, y1, zb,  x0, y1, zf,
      // Right inner wall at x1
      x1, y0, zb,  x1, y0, zf,  x1, y1, zf,  x1, y1, zb,
      // Bottom sill at y0
      x0, y0, zf,  x1, y0, zf,  x1, y0, zb,  x0, y0, zb,
      // Top soffit at y1
      x0, y1, zb,  x1, y1, zb,  x1, y1, zf,  x0, y1, zf,
    ];
    const idx = [];
    for (let f = 0; f < 5; f++) {
      const o = f * 4;
      idx.push(o, o + 1, o + 2, o, o + 2, o + 3);
    }
    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    const vbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(pos), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 12, 0);
    const ibo = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(idx), gl.STATIC_DRAW);
    gl.bindVertexArray(null);
    return { vao, count: idx.length, indexType: gl.UNSIGNED_SHORT };
  })();

  // 3. Unit Torus in XY plane (major radius = 1.0, tube radius = 0.055) for Resonance Rings & Astrolabes
  const torus = (() => {
    const majSeg = 32, tubSeg = 10;
    const R = 1.0, r = 0.055;
    const mb = new MeshBuilder(512, 2400);
    const grid = [];
    for (let i = 0; i <= majSeg; i++) {
      const u = (i / majSeg) * Math.PI * 2;
      const cu = Math.cos(u), su = Math.sin(u);
      const row = [];
      for (let j = 0; j <= tubSeg; j++) {
        const v = (j / tubSeg) * Math.PI * 2;
        const cv = Math.cos(v), sv = Math.sin(v);
        const px = (R + r * cv) * cu;
        const py = (R + r * cv) * su;
        const pz = r * sv;
        const nx = cv * cu, ny = cv * su, nz = sv;
        row.push(mb.pushVert(px, py, pz, nx, ny, nz, i / majSeg, j / tubSeg, 1, 1, 1, 2.0));
      }
      grid.push(row);
    }
    for (let i = 0; i < majSeg; i++) {
      for (let j = 0; j < tubSeg; j++) {
        mb.pushQuad(grid[i][j], grid[i + 1][j], grid[i + 1][j + 1], grid[i][j + 1]);
      }
    }
    return mb.uploadToGL(gl);
  })();

  // 4. Faceted Diamond Octahedron for Astral Shards (+200)
  const octa = (() => {
    const mb = new MeshBuilder(64, 96);
    mb.addTaperedPillar(0, 0, 0, 0.72, 0.02, 1.15, 4, [1, 1, 1], 3.8);
    mb.addTaperedPillar(0, 0, 0, 0.72, 0.02, -1.15, 4, [1, 1, 1], 3.8);
    return mb.uploadToGL(gl);
  })();

  // 5. 4-Blade Solar Wind-Vane Rotor (for Origami Wind-Canyon)
  const windVane = (() => {
    const mb = new MeshBuilder(160, 280);
    mb.addBox(0, 0, 0, 0.35, 0.35, 0.55, [1, 1, 1], 2.0);
    mb.addBox(0, 0, 0, 2.2, 0.22, 0.08, [1, 1, 1], 2.0);
    mb.addBox(0, 0, 0, 0.22, 2.2, 0.08, [1, 1, 1], 2.0);
    // Sails
    mb.addBox(0.65, 0.16, 0.05, 0.85, 0.28, 0.04, [0.98, 0.92, 0.78], 1.0);
    mb.addBox(-0.65, -0.16, 0.05, 0.85, 0.28, 0.04, [0.98, 0.92, 0.78], 1.0);
    mb.addBox(-0.16, 0.65, 0.05, 0.28, 0.85, 0.04, [0.98, 0.92, 0.78], 1.0);
    mb.addBox(0.16, -0.65, 0.05, 0.28, 0.85, 0.04, [0.98, 0.92, 0.78], 1.0);
    return mb.uploadToGL(gl);
  })();

  // 6. Sleek Golden-Winged Architectural Sky-Glider (faces -Z)
  const glider = (() => {
    const mb = new MeshBuilder(512, 1024);
    const ivory = [0.96, 0.93, 0.86];
    const brass = [0.96, 0.68, 0.16];
    const canopy = [0.09, 0.16, 0.22];
    const tealGlow = [0.18, 0.92, 0.80];
    const goldGlow = [1.0, 0.78, 0.24];

    // Sleek central fuselage needle (-Z nose spearhead to +Z thruster)
    mb.addBox(0, 0.04, 0.22, 0.56, 0.26, 1.85, ivory, 1.0);
    mb.addBox(0, 0.03, -0.92, 0.36, 0.20, 0.72, ivory, 1.0);
    mb.addBox(0, 0.02, -1.42, 0.20, 0.13, 0.48, brass, 2.0);
    mb.addBox(0, 0.02, -1.74, 0.08, 0.08, 0.34, tealGlow, 3.8);
    // Obsidian glass canopy
    mb.addBox(0, 0.20, -0.25, 0.38, 0.18, 1.05, canopy, 1.4);
    // Dorsal solar-brass spine & astrolabe fin
    mb.addBox(0, 0.16, 0.45, 0.10, 0.24, 1.45, brass, 2.0);
    mb.addBox(0, 0.42, 0.92, 0.07, 0.52, 0.68, brass, 2.0);

    // Swept Gull-Delta Main Wings + Solar-Brass Leading Edges + Glowing Turquoise Wingtips
    for (const s of [-1, 1]) {
      // Inner gull root wing
      mb.addBox(s * 0.82, 0.06, 0.22, 1.25, 0.09, 1.15, ivory, 1.0, s * 0.26);
      mb.addBox(s * 0.82, 0.08, -0.26, 1.28, 0.07, 0.18, brass, 2.0, s * 0.26);
      // Outer swept wingtip blade
      mb.addBox(s * 1.82, 0.0, 0.58, 1.15, 0.07, 0.72, brass, 2.0, s * 0.42);
      // Luminous Horizon-Turquoise wingtip aether crystal
      mb.addBox(s * 2.32, 0.0, 0.82, 0.16, 0.12, 0.65, tealGlow, 3.9, s * 0.42);
      // Canted V-tail stabilizers
      mb.addBox(s * 0.46, 0.26, 1.15, 0.62, 0.06, 0.48, ivory, 1.0, s * 0.35);
    }

    // Dual Glowing Aether-Slipstream Thruster Cores at +Z tail
    mb.addBox(-0.18, 0.04, 1.24, 0.18, 0.16, 0.22, tealGlow, 4.1);
    mb.addBox(0.18, 0.04, 1.24, 0.18, 0.16, 0.22, tealGlow, 4.1);
    mb.addBox(0.0, 0.04, 1.28, 0.22, 0.12, 0.18, goldGlow, 4.0);

    return mb.uploadToGL(gl);
  })();

  return { skySphere, portalPocket, torus, octa, windVane, glider };
}

// --- GPU-Instanced Particle System (8 floats / instance: pos3, scale1, rgba4) ---
export function createParticleSystem(gl, maxParticles = 420) {
  const quadVerts = new Float32Array([
    -0.5, -0.5, 0,  0, 0,
     0.5, -0.5, 0,  1, 0,
     0.5,  0.5, 0,  1, 1,
    -0.5,  0.5, 0,  0, 1,
  ]);
  const quadIdx = new Uint16Array([0, 1, 2, 0, 2, 3]);
  const data = new Float32Array(maxParticles * 8);

  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);

  const qvbo = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, qvbo);
  gl.bufferData(gl.ARRAY_BUFFER, quadVerts, gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 20, 0);
  gl.enableVertexAttribArray(1);
  gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 20, 12);

  const qibo = gl.createBuffer();
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, qibo);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, quadIdx, gl.STATIC_DRAW);

  const instVBO = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, instVBO);
  gl.bufferData(gl.ARRAY_BUFFER, data.byteLength, gl.DYNAMIC_DRAW);

  gl.enableVertexAttribArray(4);
  gl.vertexAttribPointer(4, 4, gl.FLOAT, false, 32, 0);
  gl.vertexAttribDivisor(4, 1);

  gl.enableVertexAttribArray(5);
  gl.vertexAttribPointer(5, 4, gl.FLOAT, false, 32, 16);
  gl.vertexAttribDivisor(5, 1);

  gl.bindVertexArray(null);
  return { vao, instVBO, data, maxParticles };
}
