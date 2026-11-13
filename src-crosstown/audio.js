// 100% Procedural NYC Web Audio Engine: V8 Multi-Sawtooth RPM Synth + Gear Shifts, Drift Screech, Hydrant Burst, Dual-Tone Horn & Funk-Breakbeat

export class NYCCrosstownAudio {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.analyser = null;
    this.echoIn = null;
    this.noiseBuf = null;

    // Continuous Vehicle Synth Nodes
    this.engOsc1 = null;
    this.engOsc2 = null;
    this.engSub = null;
    this.engFilter = null;
    this.engGain = null;

    this.screechGain = null;
    this.screechFilter1 = null;
    this.screechFilter2 = null;

    this.nitroGain = null;
    this.nitroFilter = null;

    this.vol = 0.8;
    this.currentGear = 1;
    this.shiftDropTimer = 0;
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
    comp.ratio.value = 8;
    comp.attack.value = 0.003;
    comp.release.value = 0.14;

    this.master = this.ctx.createGain();
    this.master.gain.value = this.vol;

    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 512;

    this.master.connect(comp);
    comp.connect(this.analyser);
    this.analyser.connect(this.ctx.destination);

    // Manhattan Skyscraper Canyon Slapback Echo
    this.echoIn = this.ctx.createGain();
    this.echoIn.gain.value = 0.22;
    const dly = this.ctx.createDelay(0.6);
    dly.delayTime.value = 0.17;
    const fb = this.ctx.createGain();
    fb.gain.value = 0.26;
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 2100;
    this.echoIn.connect(dly);
    dly.connect(lp);
    lp.connect(fb);
    fb.connect(dly);
    lp.connect(this.master);

    // 2-Second White/Pink Urban Noise Buffer
    const len = this.ctx.sampleRate * 2;
    this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const ch = this.noiseBuf.getChannelData(0);
    let b0 = 0, b1 = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      b0 = 0.992 * b0 + w * 0.045;
      b1 = 0.960 * b1 + w * 0.075;
      ch[i] = (b0 + b1 + w * 0.42) * 0.72;
    }

    // 1. Continuous V8 Multi-Sawtooth Engine Synthesizer
    this.engOsc1 = this.ctx.createOscillator();
    this.engOsc1.type = 'sawtooth';
    this.engOsc1.frequency.value = 48;

    this.engOsc2 = this.ctx.createOscillator();
    this.engOsc2.type = 'sawtooth';
    this.engOsc2.frequency.value = 96;
    this.engOsc2.detune.value = 9;

    this.engSub = this.ctx.createOscillator();
    this.engSub.type = 'triangle';
    this.engSub.frequency.value = 24;

    const g1 = this.ctx.createGain(); g1.gain.value = 0.45;
    const g2 = this.ctx.createGain(); g2.gain.value = 0.32;
    const gSub = this.ctx.createGain(); gSub.gain.value = 0.50;

    this.engFilter = this.ctx.createBiquadFilter();
    this.engFilter.type = 'lowpass';
    this.engFilter.frequency.value = 180;
    this.engFilter.Q.value = 2.6;

    this.engGain = this.ctx.createGain();
    this.engGain.gain.value = 0.0;

    this.engOsc1.connect(g1); g1.connect(this.engFilter);
    this.engOsc2.connect(g2); g2.connect(this.engFilter);
    this.engSub.connect(gSub); gSub.connect(this.engFilter);
    this.engFilter.connect(this.engGain);
    this.engGain.connect(this.master);

    this.engOsc1.start();
    this.engOsc2.start();
    this.engSub.start();

    // 2. Continuous Bandpass Tire Screech on Drift
    const screechSrc = this.ctx.createBufferSource();
    screechSrc.buffer = this.noiseBuf;
    screechSrc.loop = true;

    this.screechFilter1 = this.ctx.createBiquadFilter();
    this.screechFilter1.type = 'bandpass';
    this.screechFilter1.frequency.value = 1280;
    this.screechFilter1.Q.value = 7.5;

    this.screechFilter2 = this.ctx.createBiquadFilter();
    this.screechFilter2.type = 'bandpass';
    this.screechFilter2.frequency.value = 1790;
    this.screechFilter2.Q.value = 6.0;

    this.screechGain = this.ctx.createGain();
    this.screechGain.gain.value = 0.0;

    screechSrc.connect(this.screechFilter1);
    screechSrc.connect(this.screechFilter2);
    this.screechFilter1.connect(this.screechGain);
    this.screechFilter2.connect(this.screechGain);
    this.screechGain.connect(this.master);
    this.screechGain.connect(this.echoIn);
    screechSrc.start();

    // 3. Continuous Nitro Turbine Roar
    const nitroSrc = this.ctx.createBufferSource();
    nitroSrc.buffer = this.noiseBuf;
    nitroSrc.loop = true;
    this.nitroFilter = this.ctx.createBiquadFilter();
    this.nitroFilter.type = 'bandpass';
    this.nitroFilter.frequency.value = 820;
    this.nitroFilter.Q.value = 1.6;
    this.nitroGain = this.ctx.createGain();
    this.nitroGain.gain.value = 0.0;
    nitroSrc.connect(this.nitroFilter);
    this.nitroFilter.connect(this.nitroGain);
    this.nitroGain.connect(this.master);
    nitroSrc.start();
  }

  setVolume(v) {
    this.vol = v;
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(v, this.ctx.currentTime, 0.04);
    }
  }

  // Dual-Tone NYC Taxi Horn (Player & AI Cabs Honking Back!)
  playHorn(pitchScale = 1.0, dur = 0.34, vol = 0.16) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const fA = 440 * pitchScale;
    const fB = 556 * pitchScale; // Slightly gritty NYC cab major-third interval

    const flt = this.ctx.createBiquadFilter();
    flt.type = 'bandpass';
    flt.frequency.value = 1180 * pitchScale;
    flt.Q.value = 1.8;

    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.018);
    g.gain.setValueAtTime(vol * 0.9, t + dur - 0.05);
    g.gain.exponentialRampToValueAtTime(0.0008, t + dur);

    [fA, fB].forEach((freq) => {
      const o = this.ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(freq, t);
      o.connect(flt);
      o.start(t);
      o.stop(t + dur + 0.03);
    });

    flt.connect(g);
    g.connect(this.master);
    g.connect(this.echoIn);
  }

  // Pressurized NYC Fire Hydrant Iron Cap Clang + Sparkling Water Geyser Burst!
  playHydrantBurst() {
    if (!this.ctx || !this.noiseBuf) return;
    const t = this.ctx.currentTime;

    // Cast-iron cap ping
    [780, 1190].forEach((f, idx) => {
      const o = this.ctx.createOscillator();
      o.type = 'triangle';
      o.frequency.setValueAtTime(f, t);
      o.frequency.exponentialRampToValueAtTime(f * 0.45, t + 0.16);
      const cg = this.ctx.createGain();
      cg.gain.setValueAtTime(idx === 0 ? 0.22 : 0.14, t);
      cg.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
      o.connect(cg);
      cg.connect(this.master);
      o.start(t);
      o.stop(t + 0.20);
    });

    // High-pressure water fountain rush
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(650, t);
    bp.frequency.exponentialRampToValueAtTime(2400, t + 0.15);
    bp.frequency.exponentialRampToValueAtTime(1100, t + 1.15);
    bp.Q.value = 1.1;

    const wg = this.ctx.createGain();
    wg.gain.setValueAtTime(0.001, t);
    wg.gain.linearRampToValueAtTime(0.28, t + 0.04);
    wg.gain.exponentialRampToValueAtTime(0.001, t + 1.2);

    src.connect(bp);
    bp.connect(wg);
    wg.connect(this.master);
    wg.connect(this.echoIn);
    src.start(t);
    src.stop(t + 1.25);
  }

  // Gear-Shift Exhaust Burble Pop
  playGearShiftPop() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(115, t);
    o.frequency.exponentialRampToValueAtTime(38, t + 0.09);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.14, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.10);
    o.connect(g);
    g.connect(this.master);
    o.start(t);
    o.stop(t + 0.11);
  }

  // Studio Preview: V8 Muscle Rev
  playRevPreview() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const flt = this.ctx.createBiquadFilter();
    flt.type = 'lowpass';
    flt.frequency.setValueAtTime(220, t);
    flt.frequency.exponentialRampToValueAtTime(1350, t + 0.35);
    flt.frequency.exponentialRampToValueAtTime(280, t + 0.95);
    flt.Q.value = 3.0;

    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.001, t);
    g.gain.linearRampToValueAtTime(0.24, t + 0.08);
    g.gain.exponentialRampToValueAtTime(0.001, t + 1.0);

    [1, 2, 0.5].forEach((mult, idx) => {
      const o = this.ctx.createOscillator();
      o.type = idx === 2 ? 'triangle' : 'sawtooth';
      o.frequency.setValueAtTime(52 * mult, t);
      o.frequency.exponentialRampToValueAtTime(168 * mult, t + 0.36);
      o.frequency.setValueAtTime(118 * mult, t + 0.42); // Gear shift drop!
      o.frequency.exponentialRampToValueAtTime(64 * mult, t + 0.95);
      o.connect(flt);
      o.start(t);
      o.stop(t + 1.02);
    });
    flt.connect(g);
    g.connect(this.master);
  }

  // Studio Preview: Tire Screech Burst
  playDriftPreview() {
    if (!this.ctx || !this.noiseBuf) return;
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(1220, t);
    bp.frequency.linearRampToValueAtTime(1580, t + 0.35);
    bp.frequency.linearRampToValueAtTime(1140, t + 0.75);
    bp.Q.value = 8.0;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.001, t);
    g.gain.linearRampToValueAtTime(0.22, t + 0.06);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.80);
    src.connect(bp);
    bp.connect(g);
    g.connect(this.master);
    g.connect(this.echoIn);
    src.start(t);
    src.stop(t + 0.85);
  }

  // Nitro Surge Ignition Burst
  playNitroSurge() {
    if (!this.ctx || !this.noiseBuf) return;
    const t = this.ctx.currentTime;
    const sub = this.ctx.createOscillator();
    sub.type = 'sawtooth';
    sub.frequency.setValueAtTime(75, t);
    sub.frequency.exponentialRampToValueAtTime(220, t + 0.42);
    const sg = this.ctx.createGain();
    sg.gain.setValueAtTime(0.18, t);
    sg.gain.exponentialRampToValueAtTime(0.001, t + 0.45);
    sub.connect(sg);
    sg.connect(this.master);
    sub.start(t);
    sub.stop(t + 0.48);

    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(500, t);
    bp.frequency.exponentialRampToValueAtTime(2600, t + 0.45);
    const ng = this.ctx.createGain();
    ng.gain.setValueAtTime(0.20, t);
    ng.gain.exponentialRampToValueAtTime(0.001, t + 0.50);
    src.connect(bp);
    bp.connect(ng);
    ng.connect(this.master);
    src.start(t);
    src.stop(t + 0.52);
  }

  // Traffic Collision / Fender Sparks Impact
  playCollision(intensity = 0.7) {
    if (!this.ctx || !this.noiseBuf) return;
    const t = this.ctx.currentTime;
    const thud = this.ctx.createOscillator();
    thud.type = 'sine';
    thud.frequency.setValueAtTime(135, t);
    thud.frequency.exponentialRampToValueAtTime(34, t + 0.24);
    const tg = this.ctx.createGain();
    tg.gain.setValueAtTime(0.28 * intensity, t);
    tg.gain.exponentialRampToValueAtTime(0.001, t + 0.26);
    thud.connect(tg);
    tg.connect(this.master);
    thud.start(t);
    thud.stop(t + 0.28);

    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(2600, t);
    lp.frequency.exponentialRampToValueAtTime(340, t + 0.22);
    const ng = this.ctx.createGain();
    ng.gain.setValueAtTime(0.20 * intensity, t);
    ng.gain.exponentialRampToValueAtTime(0.001, t + 0.24);
    src.connect(lp);
    lp.connect(ng);
    ng.connect(this.master);
    src.start(t);
    src.stop(t + 0.26);
  }

  // Crosstown Golden Beacon Cleared Chime!
  playBeaconClear(idx = 0) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const root = 349.23 * Math.pow(1.06, idx % 6); // Rising F-major9 NYC brass triad
    [1, 1.25, 1.5, 2.0].forEach((m, i) => {
      const o = this.ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(root * m, t + i * 0.045);
      const flt = this.ctx.createBiquadFilter();
      flt.type = 'lowpass';
      flt.frequency.value = 2200;
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.11, t + i * 0.045);
      g.gain.exponentialRampToValueAtTime(0.001, t + i * 0.045 + 0.36);
      o.connect(flt);
      flt.connect(g);
      g.connect(this.master);
      g.connect(this.echoIn);
      o.start(t + i * 0.045);
      o.stop(t + i * 0.045 + 0.40);
    });
  }

  playDriftBank(mult = 2) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const base = 523.25 * (1 + (mult - 2) * 0.12);
    [base, base * 1.25].forEach((f, i) => {
      const o = this.ctx.createOscillator();
      o.type = 'triangle';
      o.frequency.setValueAtTime(f, t + i * 0.04);
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.12, t + i * 0.04);
      g.gain.exponentialRampToValueAtTime(0.001, t + i * 0.04 + 0.22);
      o.connect(g);
      g.connect(this.master);
      o.start(t + i * 0.04);
      o.stop(t + i * 0.04 + 0.24);
    });
  }

  // NYC Funk-Breakbeat Drum & Bass Primitives
  playBreakDrum(kind) {
    if (!this.ctx || !this.noiseBuf) return;
    const t = this.ctx.currentTime;
    if (kind === 'kick') {
      const o = this.ctx.createOscillator();
      o.type = 'sine';
      o.frequency.setValueAtTime(132, t);
      o.frequency.exponentialRampToValueAtTime(42, t + 0.13);
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.22, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
      o.connect(g);
      g.connect(this.master);
      o.start(t);
      o.stop(t + 0.16);
    } else if (kind === 'snare' || kind === 'ghost') {
      const vol = kind === 'snare' ? 0.13 : 0.055;
      const src = this.ctx.createBufferSource();
      src.buffer = this.noiseBuf;
      const hp = this.ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 950;
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(vol, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + (kind === 'snare' ? 0.13 : 0.065));
      src.connect(hp);
      hp.connect(g);
      g.connect(this.master);
      src.start(t);
      src.stop(t + 0.15);
    } else if (kind === 'hat') {
      const src = this.ctx.createBufferSource();
      src.buffer = this.noiseBuf;
      const hp = this.ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 5200;
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.045, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.04);
      src.connect(hp);
      hp.connect(g);
      g.connect(this.master);
      src.start(t);
      src.stop(t + 0.05);
    }
  }

  playFunkBass(hz, dur = 0.14) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(hz, t);

    const flt = this.ctx.createBiquadFilter();
    flt.type = 'lowpass';
    flt.frequency.setValueAtTime(980, t);
    flt.frequency.exponentialRampToValueAtTime(210, t + dur);
    flt.Q.value = 3.2;

    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.11, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);

    o.connect(flt);
    flt.connect(g);
    g.connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  update(dt, speedKmh, throttle, driftAmt, boosting, active) {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;

    if (!active) {
      this.engGain.gain.setTargetAtTime(0.0, now, 0.08);
      this.screechGain.gain.setTargetAtTime(0.0, now, 0.06);
      this.nitroGain.gain.setTargetAtTime(0.0, now, 0.06);
      return;
    }

    // 5-Speed Automatic Transmission Simulation with Gear-Shift Pitch Drops!
    const absSpd = Math.abs(speedKmh);
    const gearThresholds = [0, 38, 74, 112, 150, 220];
    let newGear = 1;
    for (let g = 1; g <= 5; g++) {
      if (absSpd >= gearThresholds[g - 1]) newGear = g;
    }
    if (newGear > this.currentGear && absSpd > 25) {
      this.shiftDropTimer = 0.14;
      this.playGearShiftPop();
    }
    this.currentGear = newGear;
    if (this.shiftDropTimer > 0) this.shiftDropTimer = Math.max(0, this.shiftDropTimer - dt);

    const gLo = gearThresholds[newGear - 1];
    const gHi = gearThresholds[newGear];
    const gearRatioPos = Math.max(0, Math.min(1, (absSpd - gLo) / Math.max(12, gHi - gLo)));
    const rpmNorm = 0.22 + gearRatioPos * 0.72 + (throttle > 0.1 ? 0.08 : 0) - (this.shiftDropTimer > 0 ? 0.22 : 0);
    const baseHz = 40 + rpmNorm * 128 + (boosting ? 26 : 0);

    this.engOsc1.frequency.setTargetAtTime(baseHz, now, 0.035);
    this.engOsc2.frequency.setTargetAtTime(baseHz * 2.0, now, 0.035);
    this.engSub.frequency.setTargetAtTime(baseHz * 0.5, now, 0.035);
    this.engFilter.frequency.setTargetAtTime(160 + rpmNorm * 820 + (throttle > 0 ? 220 : 0), now, 0.04);
    this.engGain.gain.setTargetAtTime(0.045 + rpmNorm * 0.065, now, 0.05);

    // Drift Tire Screech Modulation
    const targetScreech = driftAmt > 0.15 && absSpd > 24 ? Math.min(0.17, driftAmt * 0.18) : 0.0;
    const flutter = Math.sin(now * 28.0) * 65;
    this.screechFilter1.frequency.setTargetAtTime(1240 + absSpd * 2.2 + flutter, now, 0.03);
    this.screechFilter2.frequency.setTargetAtTime(1740 + absSpd * 2.6 - flutter, now, 0.03);
    this.screechGain.gain.setTargetAtTime(targetScreech, now, 0.04);

    // Nitro Turbine Modulation
    this.nitroFilter.frequency.setTargetAtTime(boosting ? 1450 : 600, now, 0.06);
    this.nitroGain.gain.setTargetAtTime(boosting ? 0.12 : 0.0, now, 0.05);

    // Driving NYC Funk-Breakbeat Groove (16-step bar @ ~120 BPM)
    const stepDur = boosting ? 0.112 : 0.124;
    this.beatTimer -= dt;
    if (this.beatTimer <= 0) {
      this.beatTimer = stepDur;
      const s = this.beatStep % 16;

      // Classic East-Coast Funk Breakbeat Pattern (Amen/ Clyde Stubblefield inspired)
      if (s === 0 || s === 6 || s === 10) this.playBreakDrum('kick');
      if (s === 4 || s === 12) this.playBreakDrum('snare');
      if (s === 7 || s === 9 || s === 15) this.playBreakDrum('ghost');
      if (s % 2 === 0 || s === 11) this.playBreakDrum('hat');

      // Syncopated F-Mixolydian / Funk Slap Bassline
      const bassNotes = [
        87.31, 0, 87.31, 103.83,
        116.54, 0, 130.81, 116.54,
        87.31, 0, 155.56, 130.81,
        116.54, 103.83, 87.31, 77.78,
      ];
      if (bassNotes[s] > 0) {
        this.playFunkBass(bassNotes[s], stepDur * 1.15);
      }
      this.beatStep++;
    }
  }
}
