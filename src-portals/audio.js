// 100% Procedural Generative Ambient Synth Engine for Endless Portals
// Shifts across Lydian, Dorian, Pentatonic, Mixolydian & Hirajoshi scales per World Archetype
// with Choral Synth Pads, Plucked Harp/Marimba Arpeggios, Aerodynamic Slipstream & Portal Harmonic Swells

const SCALES = {
  lydian: {
    label: 'F-LYDIAN · 悬空圣殿调式',
    root: 87.31, // F2
    notes: [174.61, 196.00, 220.00, 246.94, 261.63, 293.66, 329.63, 349.23, 392.00, 440.00, 493.88, 523.25],
  },
  hirajoshi: {
    label: 'D-HIRAJOSHI · 黑曜熔金调式',
    root: 73.42, // D2
    notes: [146.83, 155.56, 196.00, 220.00, 233.08, 293.66, 311.13, 392.00, 440.00, 466.16, 587.33, 622.25],
  },
  pentatonic: {
    label: 'C-PENTATONIC · 沧海荧光调式',
    root: 65.41, // C2
    notes: [130.81, 146.83, 164.81, 196.00, 220.00, 261.63, 293.66, 329.63, 392.00, 440.00, 523.25, 659.25],
  },
  dorian: {
    label: 'E-DORIAN · 几何秘境调式',
    root: 82.41, // E2
    notes: [164.81, 185.00, 196.00, 220.00, 246.94, 277.18, 293.66, 329.63, 369.99, 392.00, 440.00, 493.88],
  },
  mixolydian: {
    label: 'G-MIXOLYDIAN · 星环双日调式',
    root: 98.00, // G2
    notes: [196.00, 220.00, 246.94, 261.63, 293.66, 329.63, 349.23, 392.00, 440.00, 493.88, 523.25, 587.33],
  },
};

const ARCH_TO_SCALE = [
  'lydian',     // 0: Sundial Sanctum
  'hirajoshi',  // 1: Obsidian Ziggurat
  'pentatonic', // 2: Abyssal Coralhenge
  'dorian',     // 3: Monument Aqueducts
  'pentatonic', // 4: Emerald Mycelia
  'mixolydian', // 5: Origami Wind-Canyon
  'lydian',     // 6: Arctic Prism Spire
  'mixolydian', // 7: Astral Armillary
];

export class PortalsAmbientAudio {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.analyser = null;
    this.reverbIn = null;
    this.noiseBuf = null;
    this.windFilter = null;
    this.windGain = null;
    this.padOscs = [];
    this.padFilter = null;
    this.padGain = null;
    this.vol = 0.8;
    this.currentScaleKey = 'lydian';
    this.arpTimer = 0;
    this.arpStep = 0;
  }

  init() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') {
        this.ctx.resume().catch(() => {});
      }
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try {
      this.ctx = new AC();
    } catch {
      return;
    }

    const comp = this.ctx.createDynamicsCompressor();
    comp.threshold.value = -10;
    comp.knee.value = 12;
    comp.ratio.value = 8;
    comp.attack.value = 0.005;
    comp.release.value = 0.22;

    this.master = this.ctx.createGain();
    this.master.gain.value = this.vol;

    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 512;

    this.master.connect(comp);
    comp.connect(this.analyser);
    this.analyser.connect(this.ctx.destination);

    // Cathedral Stereo-Style Shimmer Delay Bus
    this.reverbIn = this.ctx.createGain();
    this.reverbIn.gain.value = 0.34;
    const dly1 = this.ctx.createDelay(1.2);
    dly1.delayTime.value = 0.31;
    const dly2 = this.ctx.createDelay(1.2);
    dly2.delayTime.value = 0.47;
    const fb1 = this.ctx.createGain();
    fb1.gain.value = 0.38;
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 2400;

    this.reverbIn.connect(dly1);
    dly1.connect(dly2);
    dly2.connect(lp);
    lp.connect(fb1);
    fb1.connect(dly1);
    dly1.connect(this.master);
    lp.connect(this.master);

    // 2-Second Silky Pink Noise Buffer for Sky-Glider Wind Slipstream
    const len = this.ctx.sampleRate * 2;
    this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const ch = this.noiseBuf.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      b0 = 0.997 * b0 + w * 0.028;
      b1 = 0.985 * b1 + w * 0.032;
      b2 = 0.950 * b2 + w * 0.048;
      ch[i] = (b0 + b1 + b2 + w * 0.12) * 0.85;
    }

    const windSrc = this.ctx.createBufferSource();
    windSrc.buffer = this.noiseBuf;
    windSrc.loop = true;
    this.windFilter = this.ctx.createBiquadFilter();
    this.windFilter.type = 'bandpass';
    this.windFilter.frequency.value = 460;
    this.windFilter.Q.value = 0.85;
    this.windGain = this.ctx.createGain();
    this.windGain.gain.value = 0.015;
    windSrc.connect(this.windFilter);
    this.windFilter.connect(this.windGain);
    this.windGain.connect(this.master);
    windSrc.start();

    // Continuous Warm Choral Synth Pad (Root + Fifth + Octave/Ninth)
    const sc = SCALES[this.currentScaleKey];
    this.padFilter = this.ctx.createBiquadFilter();
    this.padFilter.type = 'lowpass';
    this.padFilter.frequency.value = 520;
    this.padFilter.Q.value = 1.4;

    this.padGain = this.ctx.createGain();
    this.padGain.gain.value = 0.045;

    const ratios = [1.0, 1.5, 2.0, 2.25];
    const types = ['sine', 'triangle', 'sawtooth', 'triangle'];
    const detunes = [0, -6, 7, -4];
    const gains = [0.42, 0.28, 0.14, 0.18];

    for (let i = 0; i < ratios.length; i++) {
      const osc = this.ctx.createOscillator();
      osc.type = types[i];
      osc.frequency.value = sc.root * ratios[i];
      osc.detune.value = detunes[i];
      const g = this.ctx.createGain();
      g.gain.value = gains[i];
      osc.connect(g);
      g.connect(this.padFilter);
      osc.start();
      this.padOscs.push({ osc, ratio: ratios[i] });
    }

    this.padFilter.connect(this.padGain);
    this.padGain.connect(this.master);
    this.padGain.connect(this.reverbIn);
  }

  getScaleLabel() {
    return SCALES[this.currentScaleKey]?.label || SCALES.lydian.label;
  }

  setVolume(v) {
    this.vol = v;
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(v, this.ctx.currentTime, 0.05);
    }
  }

  setWorldArchetype(archIdx) {
    const key = ARCH_TO_SCALE[archIdx % ARCH_TO_SCALE.length] || 'lydian';
    this.currentScaleKey = key;
    if (!this.ctx || this.padOscs.length === 0) return;
    const sc = SCALES[key];
    const now = this.ctx.currentTime;
    for (const item of this.padOscs) {
      item.osc.frequency.setTargetAtTime(sc.root * item.ratio, now, 0.35);
    }
  }

  // Plucked Celestial Harp / Warm Marimba Note
  playPluck(freq, dur = 0.75, gainAmt = 0.10, marimbaMode = false) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = marimbaMode ? 'sine' : 'triangle';
    osc.frequency.setValueAtTime(freq, t);

    const over = this.ctx.createOscillator();
    over.type = 'sine';
    over.frequency.setValueAtTime(freq * (marimbaMode ? 4.0 : 2.0), t);

    const flt = this.ctx.createBiquadFilter();
    flt.type = 'lowpass';
    flt.frequency.setValueAtTime(marimbaMode ? 2800 : 3400, t);
    flt.frequency.exponentialRampToValueAtTime(520, t + dur);

    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0005, t);
    g.gain.linearRampToValueAtTime(gainAmt, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0008, t + dur);

    const og = this.ctx.createGain();
    og.gain.setValueAtTime(gainAmt * 0.32, t);
    og.gain.exponentialRampToValueAtTime(0.0005, t + dur * 0.38);

    osc.connect(flt);
    over.connect(og);
    og.connect(flt);
    flt.connect(g);
    g.connect(this.master);
    g.connect(this.reverbIn);

    osc.start(t);
    over.start(t);
    osc.stop(t + dur + 0.04);
    over.stop(t + dur + 0.04);
  }

  // Shimmering Harmonic Chord Swell when crossing a Live Portal Threshold!
  playPortalSwell(archIdx = 0) {
    this.setWorldArchetype(archIdx);
    if (!this.ctx) return;
    const sc = SCALES[this.currentScaleKey];
    const t = this.ctx.currentTime;

    // Warm sub-bass dimensional resonance
    const sub = this.ctx.createOscillator();
    sub.type = 'sine';
    sub.frequency.setValueAtTime(sc.root, t);
    sub.frequency.exponentialRampToValueAtTime(sc.root * 0.5, t + 1.4);
    const sg = this.ctx.createGain();
    sg.gain.setValueAtTime(0.001, t);
    sg.gain.linearRampToValueAtTime(0.22, t + 0.08);
    sg.gain.exponentialRampToValueAtTime(0.001, t + 1.55);
    sub.connect(sg);
    sg.connect(this.master);
    sub.start(t);
    sub.stop(t + 1.6);

    // Shimmering 5-voice chord bloom across the new world's scale
    const chordIndices = [0, 2, 4, 6, 9];
    chordIndices.forEach((idx, i) => {
      const f = sc.notes[idx % sc.notes.length];
      const osc = this.ctx.createOscillator();
      osc.type = i % 2 === 0 ? 'triangle' : 'sawtooth';
      osc.frequency.setValueAtTime(f, t + i * 0.045);
      osc.detune.value = (i - 2) * 5;

      const flt = this.ctx.createBiquadFilter();
      flt.type = 'lowpass';
      flt.frequency.setValueAtTime(420, t + i * 0.045);
      flt.frequency.exponentialRampToValueAtTime(2900, t + 0.35 + i * 0.045);
      flt.frequency.exponentialRampToValueAtTime(640, t + 1.85);

      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.0008, t + i * 0.045);
      g.gain.linearRampToValueAtTime(0.075, t + 0.24 + i * 0.045);
      g.gain.exponentialRampToValueAtTime(0.0008, t + 1.9);

      osc.connect(flt);
      flt.connect(g);
      g.connect(this.master);
      g.connect(this.reverbIn);
      osc.start(t + i * 0.045);
      osc.stop(t + 1.95);
    });
  }

  // Resonance Ring Harp Arpeggio
  playResonanceRing(combo = 1) {
    if (!this.ctx) return;
    const sc = SCALES[this.currentScaleKey];
    const baseOffset = Math.min(4, combo - 1);
    [0, 2, 4, 7].forEach((step, idx) => {
      const freq = sc.notes[(step + baseOffset) % sc.notes.length];
      setTimeout(() => {
        this.playPluck(freq, 0.85, 0.11, false);
      }, idx * 48);
    });
  }

  // Astral Shard Marimba Chime
  playAstralShard() {
    if (!this.ctx) return;
    const sc = SCALES[this.currentScaleKey];
    const pick = sc.notes[5 + Math.floor(Math.random() * 6)];
    this.playPluck(pick, 0.55, 0.12, true);
    setTimeout(() => {
      this.playPluck(pick * 1.5, 0.45, 0.07, true);
    }, 55);
  }

  // Choral Sanctum Pad Swell (for Sound Studio bench)
  playChoralPadPreview() {
    if (!this.ctx) return;
    const sc = SCALES[this.currentScaleKey];
    const t = this.ctx.currentTime;
    [sc.root * 2, sc.notes[2], sc.notes[4], sc.notes[7]].forEach((f, i) => {
      const o = this.ctx.createOscillator();
      o.type = i % 2 === 0 ? 'sawtooth' : 'triangle';
      o.frequency.value = f;
      o.detune.value = (i - 1.5) * 7;
      const lp = this.ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.setValueAtTime(340, t);
      lp.frequency.exponentialRampToValueAtTime(1450, t + 0.6);
      lp.frequency.exponentialRampToValueAtTime(420, t + 2.1);
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.001, t);
      g.gain.linearRampToValueAtTime(0.07, t + 0.45);
      g.gain.exponentialRampToValueAtTime(0.001, t + 2.15);
      o.connect(lp);
      lp.connect(g);
      g.connect(this.master);
      g.connect(this.reverbIn);
      o.start(t);
      o.stop(t + 2.2);
    });
  }

  // Warp Slipstream Surge
  playWarpBoost() {
    if (!this.ctx || !this.noiseBuf) return;
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(320, t);
    bp.frequency.exponentialRampToValueAtTime(1680, t + 0.28);
    bp.frequency.exponentialRampToValueAtTime(520, t + 0.78);
    bp.Q.value = 1.6;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.001, t);
    g.gain.linearRampToValueAtTime(0.18, t + 0.08);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.82);
    src.connect(bp);
    bp.connect(g);
    g.connect(this.master);
    src.start(t);
    src.stop(t + 0.85);

    const sc = SCALES[this.currentScaleKey];
    this.playPluck(sc.notes[4], 0.65, 0.09, false);
  }

  // Updraft Barrel-Roll Spiral Glissando
  playBarrelRoll() {
    if (!this.ctx) return;
    const sc = SCALES[this.currentScaleKey];
    [2, 4, 5, 7, 9, 11].forEach((nIdx, i) => {
      setTimeout(() => {
        this.playPluck(sc.notes[nIdx % sc.notes.length], 0.52, 0.085, i % 2 === 1);
      }, i * 38);
    });
  }

  update(dt, isFlying, speedNorm = 0.5, boostActive = false) {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;

    // Modulate slipstream wind & choral pad filter with glider velocity
    const targetWind = isFlying ? 0.022 + speedNorm * 0.045 + (boostActive ? 0.045 : 0) : 0.012;
    const targetWindFreq = isFlying ? 420 + speedNorm * 680 + (boostActive ? 520 : 0) : 360;
    this.windGain.gain.setTargetAtTime(targetWind, now, 0.08);
    this.windFilter.frequency.setTargetAtTime(targetWindFreq, now, 0.08);

    const lfo = 0.5 + 0.5 * Math.sin(now * 0.55);
    const targetPadGain = isFlying ? 0.055 : 0.032;
    const targetPadFreq = 440 + lfo * 340 + (boostActive ? 260 : 0);
    this.padGain.gain.setTargetAtTime(targetPadGain, now, 0.15);
    this.padFilter.frequency.setTargetAtTime(targetPadFreq, now, 0.15);

    // Generative Ambient Harp/Marimba Arpeggiator synced to flight
    if (isFlying) {
      const interval = boostActive ? 0.24 : 0.36;
      this.arpTimer += dt;
      if (this.arpTimer >= interval) {
        this.arpTimer -= interval;
        const sc = SCALES[this.currentScaleKey];
        const pattern = [0, 4, 7, 9, 6, 4, 2, 5];
        const noteIdx = pattern[this.arpStep % pattern.length];
        const useMarimba = this.arpStep % 3 === 1;
        this.playPluck(sc.notes[noteIdx % sc.notes.length], 0.68, 0.052, useMarimba);
        this.arpStep++;
      }
    }
  }
}
