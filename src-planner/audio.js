// 100% Procedural Macro Paper & Stationery ASMR Web Audio Synthesizer (Planner3DAudio)
// Voices: Cotton Page-Flip Rustle & Settle Thump, Adhesive Sticker Peel Zip, Thumb-Press Pat,
// Iridium Fountain-Nib Paper Scratch, Molten Wax-Seal Brass Thud & Afternoon Kalimba/Nylon Lo-Fi Loop.

export class Planner3DAudio {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.analyser = null;
    this.roomSend = null;
    this.paperNoiseBuf = null;
    this.crackleNoiseBuf = null;

    this.nibGain = null;
    this.nibToothFilter = null;
    this.nibCrispFilter = null;

    this.vol = 0.8;
    this.bgmEnabled = true;
    this.bgmStep = 0;
    this.bgmTimer = 0.25;
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
    comp.threshold.value = -12;
    comp.knee.value = 14;
    comp.ratio.value = 6;
    comp.attack.value = 0.004;
    comp.release.value = 0.16;

    this.master = this.ctx.createGain();
    this.master.gain.value = this.vol;

    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 512;

    this.master.connect(comp);
    comp.connect(this.analyser);
    this.analyser.connect(this.ctx.destination);

    // Warm Wooden Studio Room Early-Reflection Bus
    this.roomSend = this.ctx.createGain();
    this.roomSend.gain.value = 0.22;
    const dly = this.ctx.createDelay(0.5);
    dly.delayTime.value = 0.14;
    const fb = this.ctx.createGain();
    fb.gain.value = 0.24;
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 2400;

    this.roomSend.connect(dly);
    dly.connect(lp);
    lp.connect(fb);
    fb.connect(dly);
    lp.connect(this.master);

    const sr = this.ctx.sampleRate;

    // 1) 2-second Warm Cotton-Paper Fiber Pink/Brown Noise Buffer
    this.paperNoiseBuf = this.ctx.createBuffer(1, sr * 2, sr);
    const pCh = this.paperNoiseBuf.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0;
    for (let i = 0; i < pCh.length; i++) {
      const w = Math.random() * 2 - 1;
      b0 = 0.996 * b0 + w * 0.032;
      b1 = 0.982 * b1 + w * 0.042;
      b2 = 0.940 * b2 + w * 0.065;
      pCh[i] = (b0 + b1 + b2 + w * 0.22) * 0.85;
    }

    // 2) 1.5-second Micro-Textured Adhesive Crackle Buffer (for realistic sticker peel ASMR!)
    this.crackleNoiseBuf = this.ctx.createBuffer(1, Math.floor(sr * 1.5), sr);
    const cCh = this.crackleNoiseBuf.getChannelData(0);
    let hold = 0;
    for (let i = 0; i < cCh.length; i++) {
      if (Math.random() < 0.085) {
        hold = (Math.random() * 2 - 1) * (0.55 + Math.random() * 0.45);
      } else {
        hold *= 0.92;
      }
      cCh[i] = hold + (Math.random() * 2 - 1) * 0.18;
    }

    // 3) Continuous Velocity-Modulated Fountain-Pen Nib Friction Loop
    const nibSrc = this.ctx.createBufferSource();
    nibSrc.buffer = this.paperNoiseBuf;
    nibSrc.loop = true;

    this.nibToothFilter = this.ctx.createBiquadFilter();
    this.nibToothFilter.type = 'bandpass';
    this.nibToothFilter.frequency.value = 1750;
    this.nibToothFilter.Q.value = 2.4;

    this.nibCrispFilter = this.ctx.createBiquadFilter();
    this.nibCrispFilter.type = 'bandpass';
    this.nibCrispFilter.frequency.value = 4100;
    this.nibCrispFilter.Q.value = 3.2;

    const crispMix = this.ctx.createGain();
    crispMix.gain.value = 0.55;

    this.nibGain = this.ctx.createGain();
    this.nibGain.gain.value = 0.0;

    nibSrc.connect(this.nibToothFilter);
    nibSrc.connect(this.nibCrispFilter);
    this.nibToothFilter.connect(this.nibGain);
    this.nibCrispFilter.connect(crispMix);
    crispMix.connect(this.nibGain);
    this.nibGain.connect(this.master);
    nibSrc.start();
  }

  setVolume(v) {
    this.vol = Math.max(0, Math.min(1, v));
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(this.vol, this.ctx.currentTime, 0.03);
    }
  }

  setBgmEnabled(flag) {
    this.bgmEnabled = Boolean(flag);
  }

  // Real-time update for Fountain-Pen Nib ASMR + Cozy Afternoon Kalimba & Nylon-Guitar Loop
  update(dt, isDrawing = false, penSpeed = 0) {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime;

    if (this.nibGain) {
      if (isDrawing && penSpeed > 0.005) {
        const spd = Math.min(1.8, penSpeed);
        const targetGain = Math.min(0.24, 0.045 + spd * 0.14);
        this.nibGain.gain.setTargetAtTime(targetGain, now, 0.018);
        this.nibToothFilter.frequency.setTargetAtTime(1450 + spd * 920, now, 0.025);
        this.nibCrispFilter.frequency.setTargetAtTime(3600 + spd * 1450, now, 0.025);
      } else {
        this.nibGain.gain.setTargetAtTime(0.0, now, 0.025);
      }
    }

    if (!this.bgmEnabled) return;

    this.bgmTimer -= dt;
    if (this.bgmTimer <= 0) {
      // Gentle sunlit studio 16-step pattern (Fmaj9 -> Em7 -> Dm9 -> Cmaj9)
      const chords = [
        [174.61, 261.63, 329.63, 392.00, 523.25], // Fmaj9
        [164.81, 246.94, 293.66, 392.00, 493.88], // Em7
        [146.83, 220.00, 261.63, 329.63, 440.00], // Dm9
        [130.81, 196.00, 246.94, 293.66, 392.00], // Cmaj9
      ];
      const bar = Math.floor(this.bgmStep / 4) % chords.length;
      const beat = this.bgmStep % 4;
      const chord = chords[bar];

      if (beat === 0) {
        // Warm Nylon-Guitar thumb bass note + soft kalimba harmonic
        this._pluckNylon(chord[0], 0.095, 1.35, now);
        this._pluckKalimba(chord[2], 0.065, 0.95, now + 0.03);
      } else if (beat === 1) {
        this._pluckKalimba(chord[3], 0.060, 0.85, now);
      } else if (beat === 2) {
        this._pluckNylon(chord[1], 0.070, 1.05, now);
        this._pluckKalimba(chord[4], 0.068, 1.05, now + 0.04);
      } else {
        this._pluckKalimba(chord[2 + (bar % 2)], 0.052, 0.80, now);
      }

      this.bgmStep++;
      // Relaxed swing groove
      this.bgmTimer = beat % 2 === 0 ? 0.48 : 0.42;
    }
  }

  _pluckKalimba(freq, amp, dur, t0) {
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    const tine = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    const tineGain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, t0);

    // Metallic kalimba tine overtone (~6.2x fundamental, decays in 35ms)
    tine.type = 'triangle';
    tine.frequency.setValueAtTime(freq * 6.18, t0);
    tineGain.gain.setValueAtTime(amp * 0.35, t0);
    tineGain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.042);

    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(amp, t0 + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0002, t0 + dur);

    osc.connect(g);
    tine.connect(tineGain);
    tineGain.connect(g);
    g.connect(this.master);
    g.connect(this.roomSend);

    osc.start(t0);
    tine.start(t0);
    osc.stop(t0 + dur + 0.04);
    tine.stop(t0 + 0.06);
  }

  _pluckNylon(freq, amp, dur, t0) {
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    const flt = this.ctx.createBiquadFilter();
    const g = this.ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(freq, t0);

    flt.type = 'lowpass';
    flt.frequency.setValueAtTime(freq * 4.5, t0);
    flt.frequency.exponentialRampToValueAtTime(freq * 1.4, t0 + dur * 0.75);

    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(amp, t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0002, t0 + dur);

    osc.connect(flt);
    flt.connect(g);
    g.connect(this.master);
    g.connect(this.roomSend);

    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
  }

  // 1. Crisp Cotton-Paper Page-Flip Rustle + Soft Settle Cushion Thump
  playPageTurn(dir = 1) {
    this.init();
    if (!this.ctx || !this.paperNoiseBuf) return;
    const t0 = this.ctx.currentTime;

    // A) Paper curl & air-slice friction rustle
    const src = this.ctx.createBufferSource();
    src.buffer = this.paperNoiseBuf;
    src.playbackRate.value = dir >= 0 ? 1.04 : 0.94;

    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = 1.35;
    bp.frequency.setValueAtTime(820, t0);
    bp.frequency.exponentialRampToValueAtTime(2650, t0 + 0.16);
    bp.frequency.exponentialRampToValueAtTime(640, t0 + 0.42);

    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.001, t0);
    g.gain.linearRampToValueAtTime(0.28, t0 + 0.09);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.44);

    src.connect(bp);
    bp.connect(g);
    g.connect(this.master);
    g.connect(this.roomSend);
    src.start(t0);
    src.stop(t0 + 0.46);

    // B) Soft stacked-page settle thump at t0 + 0.34s
    const thudOsc = this.ctx.createOscillator();
    const thudGain = this.ctx.createGain();
    const ts = t0 + 0.33;
    thudOsc.type = 'sine';
    thudOsc.frequency.setValueAtTime(108, ts);
    thudOsc.frequency.exponentialRampToValueAtTime(44, ts + 0.13);

    thudGain.gain.setValueAtTime(0.001, ts);
    thudGain.gain.linearRampToValueAtTime(0.22, ts + 0.012);
    thudGain.gain.exponentialRampToValueAtTime(0.0005, ts + 0.15);

    thudOsc.connect(thudGain);
    thudGain.connect(this.master);
    thudOsc.start(ts);
    thudOsc.stop(ts + 0.17);
  }

  // 2. Tactile Adhesive Sticker Peel Zip (Rising micro-crackle filtered noise)
  playStickerPeel() {
    this.init();
    if (!this.ctx || !this.crackleNoiseBuf) return;
    const t0 = this.ctx.currentTime;

    const src = this.ctx.createBufferSource();
    src.buffer = this.crackleNoiseBuf;

    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = 3.6;
    bp.frequency.setValueAtTime(680, t0);
    bp.frequency.exponentialRampToValueAtTime(3850, t0 + 0.21);

    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.001, t0);
    g.gain.linearRampToValueAtTime(0.26, t0 + 0.035);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.23);

    src.connect(bp);
    bp.connect(g);
    g.connect(this.master);
    src.start(t0);
    src.stop(t0 + 0.25);
  }

  // 3. Satisfying Thumb-Press Sticker Pat (or Molten Wax-Seal Thud)
  playStickerStick(isWax = false) {
    if (isWax) {
      this.playWaxStamp();
      return;
    }
    this.init();
    if (!this.ctx || !this.paperNoiseBuf) return;
    const t0 = this.ctx.currentTime;

    // Warm cushioned thumb-pad thud on hardcover book
    const osc = this.ctx.createOscillator();
    const og = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(168, t0);
    osc.frequency.exponentialRampToValueAtTime(56, t0 + 0.095);

    og.gain.setValueAtTime(0.001, t0);
    og.gain.linearRampToValueAtTime(0.32, t0 + 0.008);
    og.gain.exponentialRampToValueAtTime(0.0005, t0 + 0.11);

    osc.connect(og);
    og.connect(this.master);
    osc.start(t0);
    osc.stop(t0 + 0.12);

    // Crisp finger-smoothing paper brush tail
    const nSrc = this.ctx.createBufferSource();
    nSrc.buffer = this.paperNoiseBuf;
    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(1320, t0);
    bp.frequency.linearRampToValueAtTime(920, t0 + 0.11);
    bp.Q.value = 1.6;

    const ng = this.ctx.createGain();
    ng.gain.setValueAtTime(0.18, t0);
    ng.gain.exponentialRampToValueAtTime(0.001, t0 + 0.12);

    nSrc.connect(bp);
    bp.connect(ng);
    ng.connect(this.master);
    nSrc.start(t0);
    nSrc.stop(t0 + 0.13);
  }

  // 4. Molten Wax-Seal Solid Brass Stamp Thud
  playWaxStamp() {
    this.init();
    if (!this.ctx || !this.paperNoiseBuf) return;
    const t0 = this.ctx.currentTime;

    // Heavy walnut-desk impact thump
    const sub = this.ctx.createOscillator();
    const sg = this.ctx.createGain();
    sub.type = 'triangle';
    sub.frequency.setValueAtTime(124, t0);
    sub.frequency.exponentialRampToValueAtTime(38, t0 + 0.16);
    sg.gain.setValueAtTime(0.38, t0);
    sg.gain.exponentialRampToValueAtTime(0.0008, t0 + 0.18);
    sub.connect(sg);
    sg.connect(this.master);
    sub.start(t0);
    sub.stop(t0 + 0.20);

    // Damped solid brass stamp handle metallic ring
    [1860, 2790].forEach((hz, idx) => {
      const ring = this.ctx.createOscillator();
      const rg = this.ctx.createGain();
      ring.type = 'sine';
      ring.frequency.setValueAtTime(hz, t0);
      rg.gain.setValueAtTime(idx === 0 ? 0.085 : 0.045, t0);
      rg.gain.exponentialRampToValueAtTime(0.0002, t0 + 0.22);
      ring.connect(rg);
      rg.connect(this.master);
      rg.connect(this.roomSend);
      ring.start(t0);
      ring.stop(t0 + 0.24);
    });

    // Warm molten wax squish
    const wSrc = this.ctx.createBufferSource();
    wSrc.buffer = this.paperNoiseBuf;
    const wBp = this.ctx.createBiquadFilter();
    wBp.type = 'bandpass';
    wBp.frequency.setValueAtTime(760, t0);
    wBp.frequency.exponentialRampToValueAtTime(340, t0 + 0.14);
    wBp.Q.value = 2.8;
    const wg = this.ctx.createGain();
    wg.gain.setValueAtTime(0.20, t0);
    wg.gain.exponentialRampToValueAtTime(0.001, t0 + 0.15);
    wSrc.connect(wBp);
    wBp.connect(wg);
    wg.connect(this.master);
    wSrc.start(t0);
    wSrc.stop(t0 + 0.16);
  }

  // 5. One-Shot Fountain-Pen Nib Calligraphy Scratch Burst (for Studio & Sample Ink)
  playNibPreview() {
    this.init();
    if (!this.ctx || !this.paperNoiseBuf) return;
    const t0 = this.ctx.currentTime;

    const strokes = [
      { delay: 0.00, dur: 0.11, f0: 1650, f1: 2450 },
      { delay: 0.14, dur: 0.19, f0: 1950, f1: 3100 },
      { delay: 0.36, dur: 0.09, f0: 2200, f1: 1700 },
    ];
    for (const st of strokes) {
      const ts = t0 + st.delay;
      const src = this.ctx.createBufferSource();
      src.buffer = this.paperNoiseBuf;
      const bp = this.ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.Q.value = 2.6;
      bp.frequency.setValueAtTime(st.f0, ts);
      bp.frequency.linearRampToValueAtTime(st.f1, ts + st.dur);

      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.001, ts);
      g.gain.linearRampToValueAtTime(0.22, ts + 0.02);
      g.gain.exponentialRampToValueAtTime(0.001, ts + st.dur);

      src.connect(bp);
      bp.connect(g);
      g.connect(this.master);
      src.start(ts);
      src.stop(ts + st.dur + 0.02);
    }
  }

  // 6. Studio Soundboard Kalimba + Nylon Arpeggio Preview
  playKalimbaChordPreview() {
    this.init();
    if (!this.ctx) return;
    const t0 = this.ctx.currentTime;
    const notes = [174.61, 261.63, 329.63, 392.00, 523.25];
    this._pluckNylon(notes[0], 0.13, 1.4, t0);
    notes.slice(1).forEach((hz, i) => {
      this._pluckKalimba(hz, 0.095, 1.1, t0 + 0.055 * (i + 1));
    });
  }
}
