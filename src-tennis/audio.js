// 100% Procedural Escalating Web Audio Engine for TENNIS: GO WILD (失控乒乓)
// Evolves from 1972 Square-Wave Beeps -> Electro-Funk Bass -> Pinball Chimes -> Mecha Drums & Solar Boss Brass!

export class HyperTennisAudio {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.analyser = null;
    this.echoIn = null;
    this.noiseBuf = null;
    this.wellDroneGain = null;
    this.wellDroneOsc = null;
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
    comp.threshold.value = -9;
    comp.knee.value = 10;
    comp.ratio.value = 9;
    comp.attack.value = 0.003;
    comp.release.value = 0.14;

    this.master = this.ctx.createGain();
    this.master.gain.value = this.vol;

    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 512;

    this.master.connect(comp);
    comp.connect(this.analyser);
    this.analyser.connect(this.ctx.destination);

    // Stereo-feel Cyber Stadium Slapback Delay Bus (used in Era 2+)
    this.echoIn = this.ctx.createGain();
    this.echoIn.gain.value = 0.22;
    const dly = this.ctx.createDelay(1.0);
    dly.delayTime.value = 0.185;
    const fb = this.ctx.createGain();
    fb.gain.value = 0.28;
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 2200;
    this.echoIn.connect(dly);
    dly.connect(lp);
    lp.connect(fb);
    fb.connect(dly);
    lp.connect(this.master);

    // 1.5s Crisp Synth Noise Buffer (Snares, Hi-Hats, Comet Fire & Boss Explosions)
    const len = Math.floor(this.ctx.sampleRate * 1.5);
    this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const ch = this.noiseBuf.getChannelData(0);
    let b0 = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      b0 = 0.72 * b0 + w * 0.28;
      ch[i] = w * 0.65 + b0 * 0.35;
    }

    // Subtle Gravity-Well Hum Oscillator (inaudible until Era 3+)
    this.wellDroneOsc = this.ctx.createOscillator();
    this.wellDroneOsc.type = 'sine';
    this.wellDroneOsc.frequency.value = 73.42; // D2
    this.wellDroneGain = this.ctx.createGain();
    this.wellDroneGain.gain.value = 0.0;
    this.wellDroneOsc.connect(this.wellDroneGain);
    this.wellDroneGain.connect(this.master);
    this.wellDroneOsc.start();
  }

  setVolume(v) {
    this.vol = v;
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(v, this.ctx.currentTime, 0.04);
    }
  }

  // Era 1 Pure 1972 Square-Wave Beep-Boop (220Hz Wall / 440Hz Paddle / 110Hz Miss / 587Hz Point)
  playPongBeep(kind = 'paddle', era = 1) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    o.type = 'square';

    let freq = 440;
    let dur = 0.065;
    let gainAmt = 0.16;
    if (kind === 'wall') {
      freq = 220;
      dur = 0.048;
      gainAmt = 0.13;
    } else if (kind === 'score') {
      freq = 587.33;
      dur = 0.16;
      gainAmt = 0.18;
    } else if (kind === 'miss') {
      freq = 110;
      dur = 0.22;
      gainAmt = 0.18;
    }

    o.frequency.setValueAtTime(freq, t);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gainAmt, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g);
    g.connect(this.master);
    if (era >= 2) g.connect(this.echoIn);
    o.start(t);
    o.stop(t + dur + 0.01);

    // Era 2+ adds a tight kinetic sub-punch under paddle hits
    if (era >= 2 && kind === 'paddle') {
      const sub = this.ctx.createOscillator();
      sub.type = 'triangle';
      sub.frequency.setValueAtTime(155, t);
      sub.frequency.exponentialRampToValueAtTime(48, t + 0.09);
      const sg = this.ctx.createGain();
      sg.gain.setValueAtTime(0.20, t);
      sg.gain.exponentialRampToValueAtTime(0.001, t + 0.095);
      sub.connect(sg);
      sg.connect(this.master);
      sub.start(t);
      sub.stop(t + 0.1);
    }
  }

  // Era 2+ 3D Magnus Curve Spin Hit ("CURVE!" Electric Filter Sweep)
  playCurveHit(spinNorm = 0.7) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(293.66, t);
    o.frequency.exponentialRampToValueAtTime(587.33 + spinNorm * 220, t + 0.16);

    const flt = this.ctx.createBiquadFilter();
    flt.type = 'bandpass';
    flt.frequency.setValueAtTime(500, t);
    flt.frequency.exponentialRampToValueAtTime(2600, t + 0.15);
    flt.Q.value = 3.5;

    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.18, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.18);

    o.connect(flt);
    flt.connect(g);
    g.connect(this.master);
    g.connect(this.echoIn);
    o.start(t);
    o.stop(t + 0.19);
  }

  // Era 2+ Power Smash / Era 4+ Blazing Comet Sub-Drop!
  playPowerSmash(isComet = false) {
    if (!this.ctx || !this.noiseBuf) return;
    const t = this.ctx.currentTime;

    // Tectonic Sub-Drop
    const sub = this.ctx.createOscillator();
    sub.type = 'sine';
    sub.frequency.setValueAtTime(isComet ? 165 : 132, t);
    sub.frequency.exponentialRampToValueAtTime(30, t + (isComet ? 0.42 : 0.26));
    const sg = this.ctx.createGain();
    sg.gain.setValueAtTime(isComet ? 0.40 : 0.28, t);
    sg.gain.exponentialRampToValueAtTime(0.001, t + (isComet ? 0.45 : 0.28));
    sub.connect(sg);
    sg.connect(this.master);
    sub.start(t);
    sub.stop(t + 0.46);

    // Golden Fifth Power Chord Stab
    const freqs = isComet ? [293.66, 440.0, 587.33, 739.99] : [293.66, 440.0, 587.33];
    freqs.forEach((f, idx) => {
      const o = this.ctx.createOscillator();
      o.type = idx === 0 ? 'sawtooth' : 'triangle';
      o.frequency.setValueAtTime(f, t);
      o.detune.value = (idx - 1) * 6;
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(isComet ? 0.11 : 0.08, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + (isComet ? 0.34 : 0.20));
      o.connect(g);
      g.connect(this.master);
      g.connect(this.echoIn);
      o.start(t);
      o.stop(t + 0.36);
    });

    // Comet Plasma Whoosh Burst
    if (isComet) {
      const src = this.ctx.createBufferSource();
      src.buffer = this.noiseBuf;
      const bp = this.ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.setValueAtTime(1800, t);
      bp.frequency.exponentialRampToValueAtTime(360, t + 0.32);
      bp.Q.value = 1.4;
      const ng = this.ctx.createGain();
      ng.gain.setValueAtTime(0.24, t);
      ng.gain.exponentialRampToValueAtTime(0.001, t + 0.34);
      src.connect(bp);
      bp.connect(ng);
      ng.connect(this.master);
      src.start(t);
      src.stop(t + 0.36);
    }
  }

  // Era 3+ Sparkling Arcade Pinball Bumper Bell Chime!
  playPinballBumper(combo = 0) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const bells = [1046.5, 1174.66, 1318.51, 1567.98, 1760.0, 2093.0];
    const base = bells[combo % bells.length];

    // FM Metallic Bell Pair
    const car = this.ctx.createOscillator();
    const mod = this.ctx.createOscillator();
    const modG = this.ctx.createGain();
    car.type = 'sine';
    mod.type = 'sine';
    car.frequency.value = base;
    mod.frequency.value = base * 2.41;
    modG.gain.setValueAtTime(base * 0.85, t);
    modG.gain.exponentialRampToValueAtTime(1.0, t + 0.18);

    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.19, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.30);

    mod.connect(modG);
    modG.connect(car.frequency);
    car.connect(g);
    g.connect(this.master);
    g.connect(this.echoIn);
    car.start(t);
    mod.start(t);
    car.stop(t + 0.32);
    mod.stop(t + 0.32);
  }

  // Era 3+ Multiball Split Orb Shimmer Triad!
  playMultiballSplit() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    [587.33, 739.99, 880.0, 1174.66].forEach((f, i) => {
      const o = this.ctx.createOscillator();
      o.type = 'triangle';
      const st = t + i * 0.045;
      o.frequency.setValueAtTime(f, st);
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.15, st);
      g.gain.exponentialRampToValueAtTime(0.001, st + 0.22);
      o.connect(g);
      g.connect(this.master);
      g.connect(this.echoIn);
      o.start(st);
      o.stop(st + 0.24);
    });
  }

  // Dramatic Era Escalation Riser Sweep + Impact Brass Stab!
  playEraEscalation(era = 2) {
    if (!this.ctx) return;
    if (era === 1) {
      this.playPongBeep('paddle', 1);
      return;
    }
    const t = this.ctx.currentTime;

    // Ascending Riser Sweep
    const sweep = this.ctx.createOscillator();
    sweep.type = 'sawtooth';
    sweep.frequency.setValueAtTime(146.83, t);
    sweep.frequency.exponentialRampToValueAtTime(587.33 + era * 110, t + 0.42);
    const flt = this.ctx.createBiquadFilter();
    flt.type = 'lowpass';
    flt.frequency.setValueAtTime(320, t);
    flt.frequency.exponentialRampToValueAtTime(3400, t + 0.42);
    flt.Q.value = 3.0;
    const sg = this.ctx.createGain();
    sg.gain.setValueAtTime(0.01, t);
    sg.gain.linearRampToValueAtTime(0.20, t + 0.36);
    sg.gain.exponentialRampToValueAtTime(0.001, t + 0.55);
    sweep.connect(flt);
    flt.connect(sg);
    sg.connect(this.master);
    sg.connect(this.echoIn);
    sweep.start(t);
    sweep.stop(t + 0.58);

    // Heroic Brass Chord Hit
    this.playBrassStab(era >= 5 ? 146.83 : 110.0, 0.95);
  }

  playBrassStab(rootHz = 146.83, dur = 0.75) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const flt = this.ctx.createBiquadFilter();
    flt.type = 'lowpass';
    flt.frequency.setValueAtTime(260, t);
    flt.frequency.exponentialRampToValueAtTime(1850, t + 0.12);
    flt.frequency.exponentialRampToValueAtTime(420, t + dur);
    flt.Q.value = 2.0;

    const mixG = this.ctx.createGain();
    mixG.gain.setValueAtTime(0.001, t);
    mixG.gain.linearRampToValueAtTime(0.24, t + 0.04);
    mixG.gain.exponentialRampToValueAtTime(0.001, t + dur);

    [1.0, 1.5, 2.0, 2.5].forEach((mul, idx) => {
      const o = this.ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = rootHz * mul;
      o.detune.value = (idx - 1.5) * 7;
      const g = this.ctx.createGain();
      g.gain.value = 0.25;
      o.connect(g);
      g.connect(flt);
      o.start(t);
      o.stop(t + dur + 0.03);
    });

    flt.connect(mixG);
    mixG.connect(this.master);
    mixG.connect(this.echoIn);
  }

  // Era 5 Solar Singularity Boss Impact & Shatter Fanfare!
  playBossHit(destroyed = false) {
    if (!this.ctx || !this.noiseBuf) return;
    const t = this.ctx.currentTime;

    const boom = this.ctx.createOscillator();
    boom.type = 'sine';
    boom.frequency.setValueAtTime(destroyed ? 150 : 125, t);
    boom.frequency.exponentialRampToValueAtTime(24, t + (destroyed ? 0.95 : 0.48));
    const bg = this.ctx.createGain();
    bg.gain.setValueAtTime(destroyed ? 0.44 : 0.34, t);
    bg.gain.exponentialRampToValueAtTime(0.001, t + (destroyed ? 1.0 : 0.52));
    boom.connect(bg);
    bg.connect(this.master);
    boom.start(t);
    boom.stop(t + 1.02);

    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(2800, t);
    lp.frequency.exponentialRampToValueAtTime(190, t + (destroyed ? 0.95 : 0.45));
    const ng = this.ctx.createGain();
    ng.gain.setValueAtTime(destroyed ? 0.34 : 0.22, t);
    ng.gain.exponentialRampToValueAtTime(0.001, t + (destroyed ? 0.98 : 0.48));
    src.connect(lp);
    lp.connect(ng);
    ng.connect(this.master);
    ng.connect(this.echoIn);
    src.start(t);
    src.stop(t + 1.0);

    if (destroyed) {
      [293.66, 369.99, 440.0, 587.33].forEach((f, idx) => {
        setTimeout(() => this.playBrassStab(f * 0.5, 0.7), idx * 120);
      });
    }
  }

  // Internal Groove Sequencer Helpers (Era 2 -> Era 5)
  _playSynthBass(freq, dur = 0.14, punch = 1.0) {
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(freq, t);

    const flt = this.ctx.createBiquadFilter();
    flt.type = 'lowpass';
    flt.frequency.setValueAtTime(980 * punch, t);
    flt.frequency.exponentialRampToValueAtTime(160, t + dur);
    flt.Q.value = 3.2;

    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.13 * punch, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);

    o.connect(flt);
    flt.connect(g);
    g.connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  _playDrum(kind) {
    const t = this.ctx.currentTime;
    if (kind === 'kick') {
      const o = this.ctx.createOscillator();
      o.type = 'sine';
      o.frequency.setValueAtTime(132, t);
      o.frequency.exponentialRampToValueAtTime(38, t + 0.11);
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.22, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.13);
      o.connect(g);
      g.connect(this.master);
      o.start(t);
      o.stop(t + 0.14);
    } else if (kind === 'snare' && this.noiseBuf) {
      const src = this.ctx.createBufferSource();
      src.buffer = this.noiseBuf;
      const hp = this.ctx.createBiquadFilter();
      hp.type = 'bandpass';
      hp.frequency.value = 1450;
      hp.Q.value = 0.9;
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.13, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
      src.connect(hp);
      hp.connect(g);
      g.connect(this.master);
      g.connect(this.echoIn);
      src.start(t);
      src.stop(t + 0.13);
    } else if (kind === 'hat' && this.noiseBuf) {
      const src = this.ctx.createBufferSource();
      src.buffer = this.noiseBuf;
      const hp = this.ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 5800;
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.045, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.04);
      src.connect(hp);
      hp.connect(g);
      g.connect(this.master);
      src.start(t);
      src.stop(t + 0.045);
    }
  }

  _playArpNote(freq, dur = 0.11, vel = 0.055) {
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    o.type = 'triangle';
    o.frequency.value = freq;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vel, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g);
    g.connect(this.master);
    g.connect(this.echoIn);
    o.start(t);
    o.stop(t + dur + 0.01);
  }

  update(dt, era, active, speedNorm = 0.3) {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;

    // Gravity Well low shimmer drone in Era 3+
    if (this.wellDroneGain && this.wellDroneOsc) {
      const wellActive = active && era >= 3 ? 0.045 + speedNorm * 0.03 : 0.0;
      this.wellDroneGain.gain.setTargetAtTime(wellActive, now, 0.1);
      this.wellDroneOsc.frequency.setTargetAtTime(era >= 5 ? 73.42 : 65.41, now, 0.2);
    }

    // Era 1 has ZERO background music — pure deadpan 1972 silence between Pong beeps!
    if (!active || era <= 1) return;

    // Tempo escalates from 120 BPM (Era 2) -> 138 BPM (Era 5)
    const stepDur = era === 2 ? 0.125 : era === 3 ? 0.118 : era === 4 ? 0.112 : 0.106;
    this.beatTimer -= dt;
    if (this.beatTimer <= 0) {
      this.beatTimer = stepDur;
      const s = this.beatStep % 16;

      // Electro-Funk Octave Bassline (D Dorian: D2=73.42, F2=87.31, G2=98.0, A2=110.0, C3=130.81, D3=146.83)
      const bassLine = [
        73.42, 146.83, 73.42, 0,
        87.31, 0, 98.0, 110.0,
        73.42, 146.83, 130.81, 0,
        110.0, 98.0, 87.31, 130.81,
      ];
      if (bassLine[s] > 0) {
        this._playSynthBass(bassLine[s], stepDur * 0.92, era >= 4 ? 1.15 : 0.9);
      }

      // Era 2+: Crisp Hats; Era 3+: Kick & Snare; Era 4/5: Full Driving Cyber-Rock Drums!
      if (era === 2) {
        if (s % 4 === 0) this._playDrum('kick');
        if (s % 2 === 0) this._playDrum('hat');
      } else if (era === 3) {
        if (s % 4 === 0) this._playDrum('kick');
        if (s === 4 || s === 12) this._playDrum('snare');
        if (s % 2 === 1) this._playDrum('hat');
      } else {
        if (s === 0 || s === 3 || s === 6 || s === 8 || s === 10 || s === 14) this._playDrum('kick');
        if (s === 4 || s === 12) this._playDrum('snare');
        this._playDrum('hat');
      }

      // Era 3+: Sparkling Pinball/Cyber Arpeggio
      if (era >= 3 && s % 2 === 0) {
        const arp = [587.33, 698.46, 880.0, 1046.5, 880.0, 783.99, 698.46, 659.25];
        this._playArpNote(arp[(s / 2 + Math.floor(this.beatStep / 16)) % arp.length], stepDur * 1.1, era >= 5 ? 0.068 : 0.05);
      }

      // Era 5 Boss Battle: Heroic Brass Fifth Stab on bar downbeat!
      if (era >= 5 && s === 0 && Math.floor(this.beatStep / 16) % 2 === 0) {
        this.playBrassStab(146.83, stepDur * 4.5);
      }

      this.beatStep++;
    }
  }
}
