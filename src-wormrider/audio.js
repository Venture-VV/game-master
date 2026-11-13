// 100% Procedural Desert Cinema Web Audio Engine (Colossal Brass Braaam, Thumper, Subterranean Sand & Hijaz War-Drums)

export class DesertCinemaAudio {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.analyser = null;
    this.echoIn = null;
    this.noiseBuf = null;
    this.sandGain = null;
    this.sandFilter = null;
    this.subRumbleGain = null;
    this.vol = 0.8;
    this.beatTimer = 0;
    this.beatStep = 0;
  }

  init() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();

    const comp = this.ctx.createDynamicsCompressor();
    comp.threshold.value = -8;
    comp.knee.value = 10;
    comp.ratio.value = 10;
    comp.attack.value = 0.003;
    comp.release.value = 0.16;

    this.master = this.ctx.createGain();
    this.master.gain.value = this.vol;

    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 512;

    this.master.connect(comp);
    comp.connect(this.analyser);
    this.analyser.connect(this.ctx.destination);

    // Canyon / Desert Slapback Echo Bus
    this.echoIn = this.ctx.createGain();
    this.echoIn.gain.value = 0.25;
    const dly = this.ctx.createDelay(1.0);
    dly.delayTime.value = 0.27;
    const fb = this.ctx.createGain();
    fb.gain.value = 0.32;
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 1700;
    this.echoIn.connect(dly);
    dly.connect(lp);
    lp.connect(fb);
    fb.connect(dly);
    lp.connect(this.master);

    // 2s Pink/Brown Desert Noise Buffer
    const len = this.ctx.sampleRate * 2;
    this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const ch = this.noiseBuf.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      b0 = 0.997 * b0 + w * 0.029;
      b1 = 0.985 * b1 + w * 0.034;
      b2 = 0.950 * b2 + w * 0.050;
      ch[i] = (b0 + b1 + b2 + w * 0.16) * 0.92;
    }

    // Continuous Sand-Cascade Surf + Subterranean Tectonic Rumble
    const sandSrc = this.ctx.createBufferSource();
    sandSrc.buffer = this.noiseBuf;
    sandSrc.loop = true;
    this.sandFilter = this.ctx.createBiquadFilter();
    this.sandFilter.type = 'lowpass';
    this.sandFilter.frequency.value = 520;
    this.sandFilter.Q.value = 1.2;
    this.sandGain = this.ctx.createGain();
    this.sandGain.gain.value = 0.03;
    sandSrc.connect(this.sandFilter);
    this.sandFilter.connect(this.sandGain);
    this.sandGain.connect(this.master);
    sandSrc.start();

    // Deep 46 Hz tectonic rumble oscillator when worm moves
    const subOsc = this.ctx.createOscillator();
    subOsc.type = 'triangle';
    subOsc.frequency.value = 46;
    this.subRumbleGain = this.ctx.createGain();
    this.subRumbleGain.gain.value = 0.0;
    subOsc.connect(this.subRumbleGain);
    this.subRumbleGain.connect(this.master);
    subOsc.start();
  }

  setVolume(v) {
    this.vol = v;
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(v, this.ctx.currentTime, 0.04);
    }
  }

  // Iconic Colossal Low-Brass "BRAAAM" Horn Blast!
  playBraaam(rootHz = 73.42, dur = 1.85) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const sub = this.ctx.createOscillator();
    sub.type = 'sine';
    sub.frequency.setValueAtTime(rootHz * 0.5, t);
    sub.frequency.exponentialRampToValueAtTime(rootHz * 0.48, t + dur);

    const brassMix = this.ctx.createGain();
    brassMix.gain.setValueAtTime(0.0001, t);
    brassMix.gain.linearRampToValueAtTime(0.28, t + 0.09);
    brassMix.gain.setValueAtTime(0.24, t + dur * 0.55);
    brassMix.gain.exponentialRampToValueAtTime(0.0008, t + dur);

    const flt = this.ctx.createBiquadFilter();
    flt.type = 'lowpass';
    flt.frequency.setValueAtTime(220, t);
    flt.frequency.exponentialRampToValueAtTime(1180, t + 0.22);
    flt.frequency.exponentialRampToValueAtTime(280, t + dur);
    flt.Q.value = 2.4;

    [-9, 0, 9, 1200].forEach((detuneCents, idx) => {
      const o = this.ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = idx === 3 ? rootHz * 1.5 : rootHz;
      o.detune.value = idx === 3 ? 4 : detuneCents;
      const g = this.ctx.createGain();
      g.gain.value = idx === 3 ? 0.16 : 0.34;
      o.connect(g);
      g.connect(flt);
      o.start(t);
      o.stop(t + dur + 0.05);
    });

    sub.connect(brassMix);
    flt.connect(brassMix);
    brassMix.connect(this.master);
    brassMix.connect(this.echoIn);
    sub.start(t);
    sub.stop(t + dur + 0.05);
  }

  // Fremen Mechanical Thumper Slam ("CLACK ... BOOOM")
  playThumper() {
    if (!this.ctx || !this.noiseBuf) return;
    const t = this.ctx.currentTime;

    // Sharp mechanical spring-latch click
    const click = this.ctx.createOscillator();
    click.type = 'square';
    click.frequency.setValueAtTime(920, t);
    click.frequency.exponentialRampToValueAtTime(180, t + 0.04);
    const cg = this.ctx.createGain();
    cg.gain.setValueAtTime(0.14, t);
    cg.gain.exponentialRampToValueAtTime(0.001, t + 0.045);
    click.connect(cg);
    cg.connect(this.master);
    click.start(t);
    click.stop(t + 0.05);

    // Deep seismic desert thump
    const boom = this.ctx.createOscillator();
    boom.type = 'sine';
    boom.frequency.setValueAtTime(84, t + 0.02);
    boom.frequency.exponentialRampToValueAtTime(25, t + 0.52);
    const bg = this.ctx.createGain();
    bg.gain.setValueAtTime(0.001, t);
    bg.gain.linearRampToValueAtTime(0.38, t + 0.03);
    bg.gain.exponentialRampToValueAtTime(0.001, t + 0.56);
    boom.connect(bg);
    bg.connect(this.master);
    bg.connect(this.echoIn);
    boom.start(t + 0.02);
    boom.stop(t + 0.58);
  }

  // Dual Maker-Hook Metallic Cable Grapple!
  playHookLatch() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    [680, 1020, 1360].forEach((f, i) => {
      const o = this.ctx.createOscillator();
      o.type = 'triangle';
      o.frequency.setValueAtTime(f, t + i * 0.03);
      o.frequency.exponentialRampToValueAtTime(f * 1.35, t + i * 0.03 + 0.14);
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.16, t + i * 0.03);
      g.gain.exponentialRampToValueAtTime(0.001, t + i * 0.03 + 0.18);
      o.connect(g);
      g.connect(this.master);
      g.connect(this.echoIn);
      o.start(t + i * 0.03);
      o.stop(t + i * 0.03 + 0.2);
    });
  }

  // Colossal Skyward Sandworm Breach Roar + Sand Fountain!
  playBreach() {
    if (!this.ctx || !this.noiseBuf) return;
    const t = this.ctx.currentTime;

    // Cascading sand eruption hiss
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(240, t);
    bp.frequency.exponentialRampToValueAtTime(1450, t + 0.25);
    bp.frequency.exponentialRampToValueAtTime(380, t + 1.15);
    bp.Q.value = 0.9;
    const sg = this.ctx.createGain();
    sg.gain.setValueAtTime(0.001, t);
    sg.gain.linearRampToValueAtTime(0.32, t + 0.08);
    sg.gain.exponentialRampToValueAtTime(0.001, t + 1.2);
    src.connect(bp);
    bp.connect(sg);
    sg.connect(this.master);
    src.start(t);
    src.stop(t + 1.25);

    this.playBraaam(73.42, 1.55);
  }

  // Harvester / Ornithopter Hull Crunch & Spice Explosion!
  playDevourCrunch(mega = false) {
    if (!this.ctx || !this.noiseBuf) return;
    const t = this.ctx.currentTime;

    // Sub-impact punch
    const sub = this.ctx.createOscillator();
    sub.type = 'sine';
    sub.frequency.setValueAtTime(mega ? 110 : 140, t);
    sub.frequency.exponentialRampToValueAtTime(26, t + (mega ? 0.85 : 0.45));
    const sg = this.ctx.createGain();
    sg.gain.setValueAtTime(mega ? 0.42 : 0.28, t);
    sg.gain.exponentialRampToValueAtTime(0.001, t + (mega ? 0.9 : 0.5));
    sub.connect(sg);
    sg.connect(this.master);
    sub.start(t);
    sub.stop(t + 0.95);

    // Metallic hull tearing noise burst
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const flt = this.ctx.createBiquadFilter();
    flt.type = 'lowpass';
    flt.frequency.setValueAtTime(2400, t);
    flt.frequency.exponentialRampToValueAtTime(220, t + (mega ? 0.95 : 0.5));
    const ng = this.ctx.createGain();
    ng.gain.setValueAtTime(mega ? 0.34 : 0.22, t);
    ng.gain.exponentialRampToValueAtTime(0.001, t + (mega ? 1.0 : 0.55));
    src.connect(flt);
    flt.connect(ng);
    ng.connect(this.master);
    ng.connect(this.echoIn);
    src.start(t);
    src.stop(t + 1.05);

    if (mega) {
      setTimeout(() => this.playBraaam(82.41, 1.4), 110);
    }
  }

  // Middle-Eastern Darbuka Goblet Drum ("doum" / "tek" / "ka")
  playDarbuka(type = 'doum') {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    if (type === 'doum') {
      o.type = 'sine';
      o.frequency.setValueAtTime(118, t);
      o.frequency.exponentialRampToValueAtTime(56, t + 0.16);
      g.gain.setValueAtTime(0.20, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.19);
    } else {
      o.type = 'triangle';
      const f0 = type === 'tek' ? 430 : 540;
      o.frequency.setValueAtTime(f0, t);
      o.frequency.exponentialRampToValueAtTime(170, t + 0.065);
      g.gain.setValueAtTime(type === 'tek' ? 0.11 : 0.075, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.075);
    }
    o.connect(g);
    g.connect(this.master);
    o.start(t);
    o.stop(t + 0.22);
  }

  // Haunting Desert Duduk Double-Reed Solo Note (D Hijaz: D, Eb, F#, G, A, Bb, C)
  playDuduk(freq, dur = 0.9, vel = 0.085) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.value = freq;

    const vib = this.ctx.createOscillator();
    const vg = this.ctx.createGain();
    vib.frequency.value = 5.4;
    vg.gain.value = freq * 0.009;
    vib.connect(vg);
    vg.connect(osc.frequency);

    // Nasal double-reed formant bandpass around 950 Hz
    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 920;
    bp.Q.value = 2.2;

    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vel, t + 0.14);
    g.gain.setValueAtTime(vel * 0.85, t + dur * 0.7);
    g.gain.exponentialRampToValueAtTime(0.0008, t + dur);

    osc.connect(bp);
    bp.connect(g);
    g.connect(this.master);
    g.connect(this.echoIn);

    osc.start(t);
    vib.start(t);
    osc.stop(t + dur + 0.05);
    vib.stop(t + dur + 0.05);
  }

  update(dt, speedNorm, submerged, riding, active) {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;

    // Modulate sand-surf vs deep muffled subterranean rumble!
    if (this.sandGain && this.sandFilter && this.subRumbleGain) {
      const targetSand = active && riding ? 0.05 + speedNorm * 0.14 : 0.025;
      const targetFreq = submerged > 0.5 ? 165 : 420 + speedNorm * 820;
      const targetSub = active && riding ? (submerged > 0.5 ? 0.16 : 0.07 * speedNorm) : 0.0;
      this.sandGain.gain.setTargetAtTime(targetSand, now, 0.08);
      this.sandFilter.frequency.setTargetAtTime(targetFreq, now, 0.08);
      this.subRumbleGain.gain.setTargetAtTime(targetSub, now, 0.08);
    }

    if (!active || !riding) return;

    // Driving Hijaz Maqsum / Baladi Desert War-Drum Groove (8-step bar)
    const stepDur = 0.19 - speedNorm * 0.04;
    this.beatTimer -= dt;
    if (this.beatTimer <= 0) {
      this.beatTimer = stepDur;
      const s = this.beatStep % 8;
      // Pattern: DOUM - tek - ka DOUM tek -
      if (s === 0 || s === 5) this.playDarbuka('doum');
      else if (s === 2 || s === 6) this.playDarbuka('tek');
      else if (s === 4) this.playDarbuka('ka');

      // Haunting D-Hijaz Duduk phrase every 16 steps!
      if (this.beatStep % 8 === 0) {
        const hijaz = [293.66, 311.13, 369.99, 392.0, 440.0, 369.99, 311.13, 293.66];
        const barIdx = Math.floor(this.beatStep / 8) % hijaz.length;
        this.playDuduk(hijaz[barIdx], stepDur * 6.8, 0.075);
      }
      this.beatStep++;
    }
  }
}
