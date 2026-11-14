// 100% Procedural Web Audio Synthesizer for 3D Hardware Soldering & Robotics Lab
// Includes live AnalyserNode for #rb-scope oscilloscope inside #rb-studio

const CHIPTUNE_NOTES = [
  523.25, 659.25, 783.99, 1046.5,
  783.99, 659.25, 587.33, 739.99,
  880.00, 1174.66, 880.00, 739.99,
  659.25, 783.99, 987.77, 1318.51,
];

const CHIPTUNE_BASS = [
  130.81, 130.81, 196.00, 196.00,
  146.83, 146.83, 220.00, 220.00,
  164.81, 164.81, 196.00, 196.00,
  130.81, 146.83, 164.81, 196.00,
];

export class RoboticsLabAudio {
  constructor() {
    this.ctx = null;
    this.masterGain = null;
    this.analyser = null;
    this.noiseBuffer = null;
    this.volume = 0.8;

    // Continuous rosin-flux sizzle nodes
    this.sizzleSrc = null;
    this.sizzleGain = null;
    this.sizzleFilter = null;
    this.sizzleActive = false;
    this.lastCrackleAt = 0;

    // Continuous subtle 50Hz power hum when powered on
    this.humOsc = null;
    this.humGain = null;
  }

  ensure() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      this.ctx = new AC();

      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = this.volume;

      this.analyser = this.ctx.createAnalyser();
      this.analyser.fftSize = 512;
      this.analyser.smoothingTimeConstant = 0.78;

      this.masterGain.connect(this.analyser);
      this.analyser.connect(this.ctx.destination);

      // Build 1.5s reusable white/pink-ish noise buffer for rosin flux sizzle & mechanical clicks
      const len = Math.floor(this.ctx.sampleRate * 1.5);
      this.noiseBuffer = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const data = this.noiseBuffer.getChannelData(0);
      let b0 = 0, b1 = 0, b2 = 0;
      for (let i = 0; i < len; i++) {
        const w = Math.random() * 2 - 1;
        b0 = 0.997 * b0 + w * 0.029;
        b1 = 0.985 * b1 + w * 0.032;
        b2 = 0.950 * b2 + w * 0.048;
        data[i] = (b0 + b1 + b2 + w * 0.35) * 0.65;
      }
    }

    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return true;
  }

  setVolume(val01) {
    this.volume = Math.max(0, Math.min(1, val01));
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setTargetAtTime(this.volume, this.ctx.currentTime, 0.02);
    }
  }

  /**
   * Crisp IC / component socket pin insertion snap
   */
  playSnap() {
    if (!this.ensure()) return;
    const t = this.ctx.currentTime;

    // 1. Sharp socket housing click
    const nSrc = this.ctx.createBufferSource();
    nSrc.buffer = this.noiseBuffer;
    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(1950, t);
    bp.Q.value = 3.2;
    const nGain = this.ctx.createGain();
    nGain.gain.setValueAtTime(0.32, t);
    nGain.gain.exponentialRampToValueAtTime(0.001, t + 0.042);
    nSrc.connect(bp);
    bp.connect(nGain);
    nGain.connect(this.masterGain);
    nSrc.start(t);
    nSrc.stop(t + 0.045);

    // 2. Metallic pin seating thud + snap harmonic
    const osc = this.ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(340, t);
    osc.frequency.exponentialRampToValueAtTime(135, t + 0.055);
    const oGain = this.ctx.createGain();
    oGain.gain.setValueAtTime(0.28, t);
    oGain.gain.exponentialRampToValueAtTime(0.001, t + 0.06);
    osc.connect(oGain);
    oGain.connect(this.masterGain);
    osc.start(t);
    osc.stop(t + 0.065);

    const pinOsc = this.ctx.createOscillator();
    pinOsc.type = 'sine';
    pinOsc.frequency.setValueAtTime(1420, t + 0.012);
    pinOsc.frequency.exponentialRampToValueAtTime(880, t + 0.05);
    const pGain = this.ctx.createGain();
    pGain.gain.setValueAtTime(0.14, t + 0.012);
    pGain.gain.exponentialRampToValueAtTime(0.001, t + 0.055);
    pinOsc.connect(pGain);
    pGain.connect(this.masterGain);
    pinOsc.start(t + 0.012);
    pinOsc.stop(t + 0.06);
  }

  /**
   * Continuous sizzling rosin-flux soldering hiss + bubble micro-crackle while holding iron on pad
   */
  setSolderSizzle(active, intensity = 1.0) {
    if (!active) {
      if (this.sizzleActive && this.sizzleGain && this.ctx) {
        this.sizzleGain.gain.setTargetAtTime(0.0, this.ctx.currentTime, 0.035);
      }
      this.sizzleActive = false;
      return;
    }

    if (!this.ensure()) return;
    const t = this.ctx.currentTime;

    if (!this.sizzleSrc) {
      this.sizzleSrc = this.ctx.createBufferSource();
      this.sizzleSrc.buffer = this.noiseBuffer;
      this.sizzleSrc.loop = true;

      this.sizzleFilter = this.ctx.createBiquadFilter();
      this.sizzleFilter.type = 'bandpass';
      this.sizzleFilter.frequency.value = 3200;
      this.sizzleFilter.Q.value = 1.9;

      this.sizzleGain = this.ctx.createGain();
      this.sizzleGain.gain.value = 0.0;

      this.sizzleSrc.connect(this.sizzleFilter);
      this.sizzleFilter.connect(this.sizzleGain);
      this.sizzleGain.connect(this.masterGain);
      this.sizzleSrc.start(t);
    }

    const targetGain = Math.min(0.24, 0.14 * intensity);
    this.sizzleFilter.frequency.setTargetAtTime(2800 + Math.random() * 1100, t, 0.03);
    this.sizzleGain.gain.setTargetAtTime(targetGain, t, 0.02);
    this.sizzleActive = true;

    // Subtle rosin bubble crackle pop
    if (t - this.lastCrackleAt > 0.075) {
      this.lastCrackleAt = t;
      const pop = this.ctx.createOscillator();
      pop.type = 'sawtooth';
      const f = 1800 + Math.random() * 2200;
      pop.frequency.setValueAtTime(f, t);
      pop.frequency.exponentialRampToValueAtTime(420, t + 0.018);
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.055 * intensity, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.02);
      pop.connect(g);
      g.connect(this.masterGain);
      pop.start(t);
      pop.stop(t + 0.022);
    }
  }

  /**
   * Crisp molten solder cone completion ping
   */
  playSolderDing(combo = 0) {
    if (!this.ensure()) return;
    const t = this.ctx.currentTime;
    const base = Math.min(1480, 740 + combo * 36);

    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(base, t);
    osc.frequency.exponentialRampToValueAtTime(base * 1.25, t + 0.09);

    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.15, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.12);

    osc.connect(g);
    g.connect(this.masterGain);
    osc.start(t);
    osc.stop(t + 0.13);
  }

  /**
   * Studio preview helper for rosin flux soldering sizzle
   */
  previewSolderHiss() {
    if (!this.ensure()) return;
    this.setSolderSizzle(true, 1.2);
    setTimeout(() => this.playSolderDing(3), 360);
    setTimeout(() => this.setSolderSizzle(false), 620);
  }

  /**
   * DuPont silicone jumper wire header plug click
   */
  playWireClick() {
    if (!this.ensure()) return;
    const t = this.ctx.currentTime;
    const freqs = [960, 1480];
    freqs.forEach((f, idx) => {
      const start = t + idx * 0.032;
      const osc = this.ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(f, start);
      osc.frequency.exponentialRampToValueAtTime(f * 0.62, start + 0.035);
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.2, start);
      g.gain.exponentialRampToValueAtTime(0.001, start + 0.04);
      osc.connect(g);
      g.connect(this.masterGain);
      osc.start(start);
      osc.stop(start + 0.045);
    });
  }

  /**
   * Heavy toggle switch clunk + 50Hz/oscillator power-up hum
   */
  playPowerToggle(on) {
    if (!this.ensure()) return;
    const t = this.ctx.currentTime;

    // Mechanical toggle clunk
    const clunk = this.ctx.createOscillator();
    clunk.type = 'square';
    clunk.frequency.setValueAtTime(on ? 210 : 170, t);
    clunk.frequency.exponentialRampToValueAtTime(68, t + 0.055);
    const cg = this.ctx.createGain();
    cg.gain.setValueAtTime(0.24, t);
    cg.gain.exponentialRampToValueAtTime(0.001, t + 0.06);
    clunk.connect(cg);
    cg.connect(this.masterGain);
    clunk.start(t);
    clunk.stop(t + 0.065);

    // Power rail charge / spin-down sweep + 50Hz/100Hz bench supply hum
    const sweep = this.ctx.createOscillator();
    sweep.type = 'sawtooth';
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 950;
    if (on) {
      sweep.frequency.setValueAtTime(100, t + 0.03);
      sweep.frequency.exponentialRampToValueAtTime(440, t + 0.34);
    } else {
      sweep.frequency.setValueAtTime(360, t + 0.02);
      sweep.frequency.exponentialRampToValueAtTime(75, t + 0.28);
    }
    const sg = this.ctx.createGain();
    sg.gain.setValueAtTime(0.14, t + 0.02);
    sg.gain.exponentialRampToValueAtTime(0.001, t + 0.38);
    sweep.connect(lp);
    lp.connect(sg);
    sg.connect(this.masterGain);
    sweep.start(t + 0.02);
    sweep.stop(t + 0.40);

    // Subtle 50Hz / 100Hz bench supply hum while powered
    if (on) {
      if (!this.humOsc) {
        this.humOsc = this.ctx.createOscillator();
        this.humOsc.type = 'sine';
        this.humOsc.frequency.value = 100;
        this.humGain = this.ctx.createGain();
        this.humGain.gain.value = 0.0;
        this.humOsc.connect(this.humGain);
        this.humGain.connect(this.masterGain);
        this.humOsc.start(t);
      }
      this.humGain.gain.setTargetAtTime(0.025, t, 0.08);
    } else if (this.humGain) {
      this.humGain.gain.setTargetAtTime(0.0, t, 0.05);
    }
  }

  /**
   * Ultrasonic radar ping (Board 02 HC-SR04)
   */
  playSonarPing() {
    if (!this.ensure()) return;
    const t = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(2480, t);
    osc.frequency.exponentialRampToValueAtTime(2820, t + 0.06);

    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.001, t);
    g.gain.linearRampToValueAtTime(0.15, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.20);

    osc.connect(g);
    g.connect(this.masterGain);
    osc.start(t);
    osc.stop(t + 0.21);
  }

  /**
   * Micro servo / robotic arm actuator gear whirr (Board 02 & Board 04)
   */
  playServoWhirr(duration = 0.22, pitch = 1.0) {
    if (!this.ensure()) return;
    const t = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(185 * pitch, t);
    osc.frequency.linearRampToValueAtTime(245 * pitch, t + duration * 0.5);
    osc.frequency.linearRampToValueAtTime(175 * pitch, t + duration);

    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 680 * pitch;
    bp.Q.value = 2.6;

    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.001, t);
    g.gain.linearRampToValueAtTime(0.085, t + 0.03);
    g.gain.exponentialRampToValueAtTime(0.001, t + duration);

    osc.connect(bp);
    bp.connect(g);
    g.connect(this.masterGain);
    osc.start(t);
    osc.stop(t + duration + 0.02);
  }

  /**
   * Subtle 7-segment counter clock tick (Board 01 UNO-R3)
   */
  playDigitTick(digit = 0) {
    if (!this.ensure()) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(digit === 0 ? 1046.5 : 660 + digit * 24, t);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.045, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.045);
    osc.connect(g);
    g.connect(this.masterGain);
    osc.start(t);
    osc.stop(t + 0.05);
  }

  /**
   * NE555 + LM386 8-bit Chiptune Arpeggio Step (Board 03 SYNTH-555)
   */
  playChiptuneStep(stepIdx = 0) {
    const idx = ((stepIdx % CHIPTUNE_NOTES.length) + CHIPTUNE_NOTES.length) % CHIPTUNE_NOTES.length;
    const leadFreq = CHIPTUNE_NOTES[idx];
    const bassFreq = CHIPTUNE_BASS[idx];
    const level = 0.42 + ((idx * 37) % 10) * 0.058;

    if (!this.ensure()) return { level, noteIdx: idx };
    const t = this.ctx.currentTime;

    // 555 astable square-wave lead
    const lead = this.ctx.createOscillator();
    lead.type = 'square';
    lead.frequency.setValueAtTime(leadFreq, t);

    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(2800, t);

    const lg = this.ctx.createGain();
    lg.gain.setValueAtTime(0.095, t);
    lg.gain.exponentialRampToValueAtTime(0.001, t + 0.145);

    lead.connect(lp);
    lp.connect(lg);
    lg.connect(this.masterGain);
    lead.start(t);
    lead.stop(t + 0.155);

    // Sub-octave triangle bass every even step
    if (idx % 2 === 0) {
      const bass = this.ctx.createOscillator();
      bass.type = 'triangle';
      bass.frequency.setValueAtTime(bassFreq, t);
      const bg = this.ctx.createGain();
      bg.gain.setValueAtTime(0.11, t);
      bg.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
      bass.connect(bg);
      bg.connect(this.masterGain);
      bass.start(t);
      bass.stop(t + 0.23);
    }

    return { level, noteIdx: idx };
  }

  previewChiptunePhrase() {
    if (!this.ensure()) return;
    for (let i = 0; i < 6; i++) {
      setTimeout(() => this.playChiptuneStep(i), i * 130);
    }
  }
}
