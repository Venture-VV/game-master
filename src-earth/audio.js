// 100% Procedural NASA Orbital, Atmospheric Wind & Tectonic Web Audio Synthesizer for Mirror Earth

export class MirrorEarthAudio {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.analyser = null;
    this.spaceEcho = null;
    this.noiseBuf = null;
    this.padGain = null;
    this.padFilter = null;
    this.windGain = null;
    this.windFilter = null;
    this.vol = 0.8;
    this.thunderTimer = 3.5;
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
    this.ctx = new AC();

    const comp = this.ctx.createDynamicsCompressor();
    comp.threshold.value = -10;
    comp.knee.value = 12;
    comp.ratio.value = 8;
    comp.attack.value = 0.004;
    comp.release.value = 0.18;

    this.master = this.ctx.createGain();
    this.master.gain.value = this.vol;

    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 512;

    this.master.connect(comp);
    comp.connect(this.analyser);
    this.analyser.connect(this.ctx.destination);

    // Deep-Space Shimmer Delay Bus
    this.spaceEcho = this.ctx.createGain();
    this.spaceEcho.gain.value = 0.28;
    const dly = this.ctx.createDelay(1.0);
    dly.delayTime.value = 0.31;
    const fb = this.ctx.createGain();
    fb.gain.value = 0.36;
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 1950;

    this.spaceEcho.connect(dly);
    dly.connect(lp);
    lp.connect(fb);
    fb.connect(dly);
    lp.connect(this.master);

    // 2s Pink/Brown Atmospheric & Tectonic Noise Buffer
    const len = this.ctx.sampleRate * 2;
    this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const ch = this.noiseBuf.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      b0 = 0.997 * b0 + w * 0.029;
      b1 = 0.985 * b1 + w * 0.034;
      b2 = 0.950 * b2 + w * 0.050;
      ch[i] = (b0 + b1 + b2 + w * 0.15) * 0.9;
    }

    // 1. Continuous NASA Ambient Space Pad (C2 + G2 + D3 warm cosmic drone)
    this.padFilter = this.ctx.createBiquadFilter();
    this.padFilter.type = 'lowpass';
    this.padFilter.frequency.value = 310;
    this.padFilter.Q.value = 1.4;

    this.padGain = this.ctx.createGain();
    this.padGain.gain.value = 0.045;

    [65.41, 98.0, 146.83].forEach((hz, idx) => {
      const o = this.ctx.createOscillator();
      o.type = idx === 0 ? 'sine' : 'triangle';
      o.frequency.value = hz;
      o.detune.value = (idx - 1) * 4.5;
      const g = this.ctx.createGain();
      g.gain.value = idx === 0 ? 0.45 : 0.24;
      o.connect(g);
      g.connect(this.padFilter);
      o.start();
    });
    this.padFilter.connect(this.padGain);
    this.padGain.connect(this.master);

    // 2. Continuous Tropospheric Wind Rush (modulated by low-altitude skimming & Mach boost)
    const windSrc = this.ctx.createBufferSource();
    windSrc.buffer = this.noiseBuf;
    windSrc.loop = true;

    this.windFilter = this.ctx.createBiquadFilter();
    this.windFilter.type = 'bandpass';
    this.windFilter.frequency.value = 380;
    this.windFilter.Q.value = 0.85;

    this.windGain = this.ctx.createGain();
    this.windGain.gain.value = 0.01;

    windSrc.connect(this.windFilter);
    this.windFilter.connect(this.windGain);
    this.windGain.connect(this.master);
    windSrc.start();
  }

  setVolume(v) {
    this.vol = v;
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(v, this.ctx.currentTime, 0.04);
    }
  }

  // Studio Trigger 1: Swelling Deep-Space NASA Pad Chord
  playSpacePadSwell() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const flt = this.ctx.createBiquadFilter();
    flt.type = 'lowpass';
    flt.frequency.setValueAtTime(180, t);
    flt.frequency.exponentialRampToValueAtTime(980, t + 0.65);
    flt.frequency.exponentialRampToValueAtTime(240, t + 2.1);

    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.22, t + 0.35);
    g.gain.exponentialRampToValueAtTime(0.0008, t + 2.2);

    [130.81, 196.0, 293.66, 392.0].forEach((hz, i) => {
      const o = this.ctx.createOscillator();
      o.type = i % 2 === 0 ? 'sawtooth' : 'triangle';
      o.frequency.value = hz;
      o.detune.value = (i - 1.5) * 6;
      const og = this.ctx.createGain();
      og.gain.value = 0.22;
      o.connect(og);
      og.connect(flt);
      o.start(t);
      o.stop(t + 2.25);
    });

    flt.connect(g);
    g.connect(this.master);
    g.connect(this.spaceEcho);
  }

  // Tectonic Sub-Bass Meteor Impact Boom + Crustal Magma Fracture!
  playMeteorImpact(mega = false) {
    if (!this.ctx || !this.noiseBuf) return;
    const t = this.ctx.currentTime;
    const dur = mega ? 1.45 : 0.95;

    // 1. Tectonic Sub-Sine Drop (98 Hz -> 22 Hz)
    const sub = this.ctx.createOscillator();
    sub.type = 'sine';
    sub.frequency.setValueAtTime(mega ? 112 : 96, t);
    sub.frequency.exponentialRampToValueAtTime(21, t + dur);
    const sg = this.ctx.createGain();
    sg.gain.setValueAtTime(0.001, t);
    sg.gain.linearRampToValueAtTime(mega ? 0.48 : 0.38, t + 0.02);
    sg.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    sub.connect(sg);
    sg.connect(this.master);
    sub.start(t);
    sub.stop(t + dur + 0.05);

    // 2. Crustal Ejecta Roar
    const nSrc = this.ctx.createBufferSource();
    nSrc.buffer = this.noiseBuf;
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(2200, t);
    lp.frequency.exponentialRampToValueAtTime(160, t + dur);
    const ng = this.ctx.createGain();
    ng.gain.setValueAtTime(mega ? 0.36 : 0.26, t);
    ng.gain.exponentialRampToValueAtTime(0.001, t + dur);
    nSrc.connect(lp);
    lp.connect(ng);
    ng.connect(this.master);
    ng.connect(this.spaceEcho);
    nSrc.start(t);
    nSrc.stop(t + dur + 0.05);
  }

  // Lush Biosphere Emerald Genesis Terraform Harmonic Pulse!
  playGenesisTerraform() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const notes = [261.63, 329.63, 392.0, 493.88, 587.33]; // Cmaj9 Emerald Harmony
    notes.forEach((hz, i) => {
      const st = t + i * 0.045;
      const o = this.ctx.createOscillator();
      o.type = 'triangle';
      o.frequency.setValueAtTime(hz, st);
      o.frequency.exponentialRampToValueAtTime(hz * 1.005, st + 0.55);

      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.0001, st);
      g.gain.linearRampToValueAtTime(0.11, st + 0.04);
      g.gain.exponentialRampToValueAtTime(0.0008, st + 0.62);

      o.connect(g);
      g.connect(this.master);
      g.connect(this.spaceEcho);
      o.start(st);
      o.stop(st + 0.65);
    });
  }

  // Crystalline NASA Quindar / GPS Orbital Telemetry Sonar Ping!
  playTelemetryPing(high = false) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const f1 = high ? 2475 : 1860;
    const f2 = high ? 1238 : 2475;

    [f1, f2].forEach((f, idx) => {
      const st = t + idx * 0.065;
      const o = this.ctx.createOscillator();
      o.type = 'sine';
      o.frequency.setValueAtTime(f, st);
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.0001, st);
      g.gain.linearRampToValueAtTime(0.13, st + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0008, st + 0.16);
      o.connect(g);
      g.connect(this.master);
      g.connect(this.spaceEcho);
      o.start(st);
      o.stop(st + 0.18);
    });
  }

  // Twin Orbital Interceptor Plasma Laser Pulse (+ Asteroid Shatter)
  playOrbitalLaser(shatter = false) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;

    [1, 1.015].forEach((mult) => {
      const o = this.ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(1680 * mult, t);
      o.frequency.exponentialRampToValueAtTime(240 * mult, t + 0.19);

      const bp = this.ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.setValueAtTime(1400, t);
      bp.frequency.exponentialRampToValueAtTime(420, t + 0.19);
      bp.Q.value = 1.8;

      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.14, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.21);

      o.connect(bp);
      bp.connect(g);
      g.connect(this.master);
      g.connect(this.spaceEcho);
      o.start(t);
      o.stop(t + 0.22);
    });

    if (shatter) {
      setTimeout(() => this.playMeteorImpact(false), 65);
    }
  }

  // Supersonic Mach Boost / Low-Altitude Atmospheric Wind Surge
  playSonicBoom() {
    if (!this.ctx || !this.noiseBuf) return;
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(280, t);
    bp.frequency.exponentialRampToValueAtTime(1850, t + 0.18);
    bp.frequency.exponentialRampToValueAtTime(420, t + 0.72);
    bp.Q.value = 1.1;

    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.001, t);
    g.gain.linearRampToValueAtTime(0.28, t + 0.06);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.78);

    src.connect(bp);
    bp.connect(g);
    g.connect(this.master);
    src.start(t);
    src.stop(t + 0.82);
  }

  update(dt, altNorm, speedNorm, boostActive, weatherMode, active) {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;

    // 1. Modulate Orbital Pad vs Low-Altitude Atmospheric Wind Rush
    if (this.padGain && this.padFilter && this.windGain && this.windFilter) {
      const lowAltFactor = Math.max(0, 1.0 - altNorm * 2.2); // strongest near surface!
      const stormWind = weatherMode === 1 || weatherMode === 3 ? 0.045 : 0.0;
      const targetWind = active
        ? 0.012 + lowAltFactor * (0.06 + speedNorm * 0.12) + (boostActive ? 0.08 : 0) + stormWind
        : 0.008;
      const targetWindFreq = 320 + lowAltFactor * 650 + speedNorm * 580 + (boostActive ? 520 : 0);

      const targetPad = active ? 0.035 + altNorm * 0.045 : 0.03;
      const padBreath = 290 + Math.sin(now * 0.45) * 95 + altNorm * 160;

      this.windGain.gain.setTargetAtTime(targetWind, now, 0.08);
      this.windFilter.frequency.setTargetAtTime(targetWindFreq, now, 0.08);
      this.padGain.gain.setTargetAtTime(targetPad, now, 0.15);
      this.padFilter.frequency.setTargetAtTime(padBreath, now, 0.15);
    }

    // 2. Occasional distant thunder rumble in Weather Mode 3 (Global Thunderstorm)
    if (active && weatherMode === 3 && this.noiseBuf) {
      this.thunderTimer -= dt;
      if (this.thunderTimer <= 0) {
        this.thunderTimer = 3.8 + Math.random() * 4.5;
        const src = this.ctx.createBufferSource();
        src.buffer = this.noiseBuf;
        const lp = this.ctx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.value = 185;
        const g = this.ctx.createGain();
        g.gain.setValueAtTime(0.001, now);
        g.gain.linearRampToValueAtTime(0.14, now + 0.18);
        g.gain.exponentialRampToValueAtTime(0.001, now + 1.35);
        src.connect(lp);
        lp.connect(g);
        g.connect(this.master);
        src.start(now);
        src.stop(now + 1.4);
      }
    }
  }
}
