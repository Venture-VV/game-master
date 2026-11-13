// 100% Procedural Web Audio API Synthesizer — Zero External Audio Files

export class SoundEngine {
  constructor() {
    this.ctx = null;
    this.masterGain = null;
    this.compressor = null;
    this.analyser = null;
    this.sfxBus = null;
    this.musicBus = null;
    this.ambienceBus = null;
    this.indoorReverb = null;
    this.indoorSend = null;
    this.outdoorDelay = null;
    this.outdoorSend = null;

    this.whiteBuffer = null;
    this.pinkBuffer = null;
    this.saturationCurve = null;

    this.muted = false;
    this.volume = 0.8;
    this.indoorFactor = 0.0;
    this.combatIntensity = 0.0;
    this.musicPlaying = false;
    this.musicTimer = null;
    this.stepIndex = 0;
    this.nextNoteTime = 0;
    this.rainSource = null;
    this.surfSource = null;
  }

  init() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') {
        this.ctx.resume().catch(() => {});
      }
      return;
    }

    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;

    this.ctx = new AudioCtx();
    const ctx = this.ctx;

    // Brickwall compressor / limiter + Master Gain + Analyser
    this.compressor = ctx.createDynamicsCompressor();
    this.compressor.threshold.value = -8;
    this.compressor.knee.value = 8;
    this.compressor.ratio.value = 12;
    this.compressor.attack.value = 0.002;
    this.compressor.release.value = 0.14;

    this.masterGain = ctx.createGain();
    this.masterGain.gain.value = this.muted ? 0 : this.volume;

    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = 1024;
    this.analyser.smoothingTimeConstant = 0.78;

    this.compressor.connect(this.masterGain);
    this.masterGain.connect(this.analyser);
    this.analyser.connect(ctx.destination);

    this.sfxBus = ctx.createGain();
    this.sfxBus.gain.value = 0.95;
    this.sfxBus.connect(this.compressor);

    this.musicBus = ctx.createGain();
    this.musicBus.gain.value = 0.34;
    this.musicBus.connect(this.compressor);

    this.ambienceBus = ctx.createGain();
    this.ambienceBus.gain.value = 0.42;
    this.ambienceBus.connect(this.compressor);

    // Precompute noise buffers (3 seconds)
    const sr = ctx.sampleRate;
    const len = sr * 3;
    this.whiteBuffer = ctx.createBuffer(2, len, sr);
    this.pinkBuffer = ctx.createBuffer(2, len, sr);

    for (let ch = 0; ch < 2; ch++) {
      const wData = this.whiteBuffer.getChannelData(ch);
      const pData = this.pinkBuffer.getChannelData(ch);
      let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
      for (let i = 0; i < len; i++) {
        const white = Math.random() * 2 - 1;
        wData[i] = white;
        b0 = 0.99886 * b0 + white * 0.0555179;
        b1 = 0.99332 * b1 + white * 0.0750759;
        b2 = 0.96900 * b2 + white * 0.1538520;
        b3 = 0.86650 * b3 + white * 0.3104856;
        b4 = 0.55000 * b4 + white * 0.5329522;
        b5 = -0.7616 * b5 - white * 0.0168980;
        pData[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.11;
        b6 = white * 0.115926;
      }
    }

    // Soft-clipping waveshaper curve for gunshot punch
    this.saturationCurve = new Float32Array(512);
    for (let i = 0; i < 512; i++) {
      const x = (i / 255.5) - 1;
      this.saturationCurve[i] = Math.tanh(x * 2.8);
    }

    // Synthesize Indoor Warehouse Convolution Impulse Response (1.25s metallic hall)
    const irLen = Math.floor(sr * 1.25);
    const irBuf = ctx.createBuffer(2, irLen, sr);
    for (let ch = 0; ch < 2; ch++) {
      const d = irBuf.getChannelData(ch);
      for (let i = 0; i < irLen; i++) {
        const t = i / irLen;
        const env = Math.pow(1 - t, 2.8);
        const early = i < sr * 0.045 && i % 390 < 12 ? 0.55 : 1.0;
        d[i] = (Math.random() * 2 - 1) * env * early * 0.5;
      }
    }
    this.indoorReverb = ctx.createConvolver();
    this.indoorReverb.buffer = irBuf;
    this.indoorSend = ctx.createGain();
    this.indoorSend.gain.value = 0.18;
    this.indoorReverb.connect(this.indoorSend);
    this.indoorSend.connect(this.compressor);

    // Outdoor Container Canyon Slapback Echo
    this.outdoorDelay = ctx.createDelay(0.5);
    this.outdoorDelay.delayTime.value = 0.135;
    const fb = ctx.createGain();
    fb.gain.value = 0.26;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 1450;
    this.outdoorSend = ctx.createGain();
    this.outdoorSend.gain.value = 0.22;

    this.outdoorDelay.connect(lp);
    lp.connect(fb);
    fb.connect(this.outdoorDelay);
    lp.connect(this.outdoorSend);
    this.outdoorSend.connect(this.compressor);

    this.startStormAmbience();
    this.startMusicLoop();
  }

  setVolume(v) {
    this.volume = Math.max(0, Math.min(1, v));
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setTargetAtTime(
        this.muted ? 0 : this.volume,
        this.ctx.currentTime,
        0.03
      );
    }
  }

  toggleMute() {
    this.muted = !this.muted;
    this.setVolume(this.volume);
    return this.muted;
  }

  setIndoorFactor(f) {
    this.indoorFactor = Math.max(0, Math.min(1, f));
    if (!this.ctx || !this.ambienceBus) return;
    const now = this.ctx.currentTime;
    // Rain muffles slightly inside the warehouse
    this.ambienceBus.gain.setTargetAtTime(0.42 - this.indoorFactor * 0.2, now, 0.15);
  }

  setCombatIntensity(val) {
    this.combatIntensity = Math.max(0, Math.min(1, val));
  }

  getWaveformData(targetArray) {
    if (!this.analyser) return false;
    this.analyser.getByteTimeDomainData(targetArray);
    return true;
  }

  getFrequencyData(targetArray) {
    if (!this.analyser) return false;
    this.analyser.getByteFrequencyData(targetArray);
    return true;
  }

  startStormAmbience() {
    if (!this.ctx || this.rainSource) return;
    const ctx = this.ctx;

    // Continuous Harbor Rain Layer
    const rain = ctx.createBufferSource();
    rain.buffer = this.pinkBuffer;
    rain.loop = true;
    const rainBp = ctx.createBiquadFilter();
    rainBp.type = 'bandpass';
    rainBp.frequency.value = 2200;
    rainBp.Q.value = 0.55;
    const rainGain = ctx.createGain();
    rainGain.gain.value = 0.32;
    rain.connect(rainBp);
    rainBp.connect(rainGain);
    rainGain.connect(this.ambienceBus);
    rain.start();
    this.rainSource = rain;

    // Deep Harbor Ocean Swell Layer
    const surf = ctx.createBufferSource();
    surf.buffer = this.pinkBuffer;
    surf.loop = true;
    const surfLp = ctx.createBiquadFilter();
    surfLp.type = 'lowpass';
    surfLp.frequency.value = 240;
    const surfGain = ctx.createGain();
    surfGain.gain.value = 0.36;

    // Slow wave swell LFO
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.14;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 0.14;
    lfo.connect(lfoGain);
    lfoGain.connect(surfGain.gain);
    lfo.start();

    surf.connect(surfLp);
    surfLp.connect(surfGain);
    surfGain.connect(this.ambienceBus);
    surf.start();
    this.surfSource = surf;
  }

  // Adaptive Dark-Synth Tactical Score (D minor, 118 BPM)
  startMusicLoop() {
    if (!this.ctx || this.musicPlaying) return;
    this.musicPlaying = true;
    this.nextNoteTime = this.ctx.currentTime + 0.05;
    this.stepIndex = 0;

    const bassNotes = [36.71, 36.71, 36.71, 43.65, 41.20, 41.20, 32.70, 36.71]; // D1, F1, E1, C1
    const arpNotes = [146.83, 174.61, 220.0, 233.08, 220.0, 174.61, 164.81, 130.81];

    const scheduler = () => {
      if (!this.ctx || !this.musicPlaying) return;
      const stepDur = 60 / 118 / 4; // 16th note
      while (this.nextNoteTime < this.ctx.currentTime + 0.18) {
        this.scheduleMusicStep(this.stepIndex, this.nextNoteTime, stepDur, bassNotes, arpNotes);
        this.nextNoteTime += stepDur;
        this.stepIndex = (this.stepIndex + 1) % 32;
      }
      this.musicTimer = setTimeout(scheduler, 60);
    };
    scheduler();
  }

  scheduleMusicStep(step, t, dur, bassNotes, arpNotes) {
    const ctx = this.ctx;
    const combat = this.combatIntensity;

    // Atmospheric sub-pulse on eighth/quarter steps
    if (step % 4 === 0 || (combat > 0.35 && step % 2 === 0)) {
      const freq = bassNotes[(step >> 2) % bassNotes.length];
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(freq, t);

      const flt = ctx.createBiquadFilter();
      flt.type = 'lowpass';
      const cutoff = 110 + combat * 320 + (step % 4 === 0 ? 70 : 0);
      flt.frequency.setValueAtTime(cutoff, t);
      flt.frequency.exponentialRampToValueAtTime(65, t + dur * 1.8);

      const g = ctx.createGain();
      const amp = (step % 4 === 0 ? 0.22 : 0.14 * combat);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(amp, t + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur * 1.85);

      osc.connect(flt);
      flt.connect(g);
      g.connect(this.musicBus);
      osc.start(t);
      osc.stop(t + dur * 1.9);
    }

    // Combat arpeggiator & electronic hi-hat pulse when enemies engage
    if (combat > 0.22) {
      if (step % 2 === 1 || combat > 0.65) {
        const osc = ctx.createOscillator();
        osc.type = 'triangle';
        const f = arpNotes[step % arpNotes.length] * (step % 8 === 7 ? 2 : 1);
        osc.frequency.setValueAtTime(f, t);

        const g = ctx.createGain();
        const a = (combat - 0.2) * 0.11;
        g.gain.setValueAtTime(0.0001, t);
        g.gain.linearRampToValueAtTime(Math.max(0.001, a), t + 0.008);
        g.gain.exponentialRampToValueAtTime(0.0001, t + dur * 0.9);

        osc.connect(g);
        g.connect(this.musicBus);
        if (this.outdoorDelay) g.connect(this.outdoorDelay);
        osc.start(t);
        osc.stop(t + dur);
      }

      // Crisp tactical percussion pulse on kick/hat
      if (step % 4 === 0) {
        const k = ctx.createOscillator();
        k.type = 'sine';
        k.frequency.setValueAtTime(115, t);
        k.frequency.exponentialRampToValueAtTime(34, t + 0.11);
        const kg = ctx.createGain();
        kg.gain.setValueAtTime(combat * 0.28, t);
        kg.gain.exponentialRampToValueAtTime(0.0001, t + 0.13);
        k.connect(kg);
        kg.connect(this.musicBus);
        k.start(t);
        k.stop(t + 0.14);
      }
    }
  }

  // Helper to spawn filtered noise burst
  noiseBurst(t, duration, filterType, freq, q, peakGain, dest, usePink = false) {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = usePink ? this.pinkBuffer : this.whiteBuffer;
    src.playbackRate.value = 0.9 + Math.random() * 0.22;
    const offset = Math.random() * 1.5;

    const flt = ctx.createBiquadFilter();
    flt.type = filterType;
    flt.frequency.setValueAtTime(freq, t);
    flt.Q.value = q;

    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peakGain, t + 0.002);
    g.gain.exponentialRampToValueAtTime(0.0001, t + duration);

    src.connect(flt);
    flt.connect(g);
    g.connect(dest);
    src.start(t, offset, duration + 0.02);
    return { flt, g };
  }

  // 1. MK-18 Rifle Gunshot (Outdoor / Indoor acoustic tail + 4 randomized variations)
  playGunshot(overrideIndoor = null) {
    this.init();
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const indoor = overrideIndoor !== null ? overrideIndoor : this.indoorFactor;
    const pitchVar = 0.94 + Math.random() * 0.12;

    // Layer A: Sub-bass chest thump
    const sub = ctx.createOscillator();
    sub.type = 'sine';
    sub.frequency.setValueAtTime(165 * pitchVar, t);
    sub.frequency.exponentialRampToValueAtTime(36, t + 0.075);
    const subG = ctx.createGain();
    subG.gain.setValueAtTime(0.75, t);
    subG.gain.exponentialRampToValueAtTime(0.001, t + 0.09);
    sub.connect(subG);
    subG.connect(this.sfxBus);
    sub.start(t);
    sub.stop(t + 0.095);

    // Layer B: Waveshaped supersonic crack
    const crackSrc = ctx.createBufferSource();
    crackSrc.buffer = this.whiteBuffer;
    crackSrc.playbackRate.value = pitchVar;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(1950 * pitchVar, t);
    bp.frequency.exponentialRampToValueAtTime(680, t + 0.11);
    bp.Q.value = 0.85;

    const shaper = ctx.createWaveShaper();
    shaper.curve = this.saturationCurve;

    const crackG = ctx.createGain();
    crackG.gain.setValueAtTime(0.82, t);
    crackG.gain.exponentialRampToValueAtTime(0.001, t + 0.12);

    crackSrc.connect(bp);
    bp.connect(shaper);
    shaper.connect(crackG);
    crackG.connect(this.sfxBus);
    crackSrc.start(t, Math.random(), 0.14);

    // Layer C: Mechanical bolt carrier clack (+24ms)
    this.noiseBurst(t + 0.022, 0.038, 'bandpass', 4600 * pitchVar, 3.2, 0.24, this.sfxBus);

    // Layer D: Acoustic Environment Tail (Outdoor slapback vs Indoor warehouse boom)
    const tailDur = 0.36 + indoor * 0.35;
    const tail = this.noiseBurst(
      t + 0.012,
      tailDur,
      'lowpass',
      (1600 - indoor * 450) * pitchVar,
      0.7,
      0.26,
      this.sfxBus,
      true
    );
    if (indoor > 0.25 && this.indoorReverb) {
      const sendG = ctx.createGain();
      sendG.gain.value = indoor * 0.85;
      tail.g.connect(sendG);
      sendG.connect(this.indoorReverb);
    }
    if (indoor < 0.85 && this.outdoorDelay) {
      const outG = ctx.createGain();
      outG.gain.value = (1 - indoor * 0.7) * 0.65;
      crackG.connect(outG);
      outG.connect(this.outdoorDelay);
    }
  }

  // 2. Brass Shell Casing Bounce (3 metallic modal pings)
  playShellCasing(inPuddle = false) {
    this.init();
    if (!this.ctx) return;
    const ctx = this.ctx;
    const baseT = ctx.currentTime + 0.16 + Math.random() * 0.06;
    const bounces = inPuddle ? 2 : 3;
    const baseModes = [3980, 6420, 9180];
    const detune = 0.94 + Math.random() * 0.12;

    for (let b = 0; b < bounces; b++) {
      const bt = baseT + b * (0.075 + Math.random() * 0.035);
      const amp = 0.075 * Math.pow(0.48, b);
      for (let m = 0; m < baseModes.length; m++) {
        const osc = ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.value = baseModes[m] * detune * (1 + b * 0.012);
        const g = ctx.createGain();
        g.gain.setValueAtTime(amp / (m + 1), bt);
        g.gain.exponentialRampToValueAtTime(0.0001, bt + (inPuddle ? 0.025 : 0.055));
        osc.connect(g);
        g.connect(this.sfxBus);
        osc.start(bt);
        osc.stop(bt + 0.065);
      }
      if (inPuddle && b === 0) {
        this.noiseBurst(bt, 0.05, 'bandpass', 3600, 1.8, 0.08, this.sfxBus);
      }
    }
  }

  // 3. Three-Stage Mechanical Reload (0: Mag Out, 1: Mag In, 2: Bolt Rack)
  playReloadStage(stage = 0) {
    this.init();
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const v = 0.95 + Math.random() * 0.1;

    if (stage === 0) {
      // Catch click + polymer mag slide out
      this.noiseBurst(t, 0.022, 'bandpass', 3200 * v, 4.0, 0.25, this.sfxBus);
      const slide = this.noiseBurst(t + 0.025, 0.14, 'bandpass', 1400 * v, 2.2, 0.16, this.sfxBus);
      slide.flt.frequency.exponentialRampToValueAtTime(620, t + 0.16);
    } else if (stage === 1) {
      // Hollow polymer thump + crisp steel latch lock
      const thud = ctx.createOscillator();
      thud.type = 'triangle';
      thud.frequency.setValueAtTime(195 * v, t);
      thud.frequency.exponentialRampToValueAtTime(68, t + 0.055);
      const tg = ctx.createGain();
      tg.gain.setValueAtTime(0.36, t);
      tg.gain.exponentialRampToValueAtTime(0.001, t + 0.065);
      thud.connect(tg);
      tg.connect(this.sfxBus);
      thud.start(t);
      thud.stop(t + 0.07);

      this.noiseBurst(t + 0.042, 0.028, 'bandpass', 4100 * v, 4.5, 0.3, this.sfxBus);
    } else {
      // Bolt carrier pull + heavy spring slam forward
      const pull = this.noiseBurst(t, 0.075, 'bandpass', 2800 * v, 3.0, 0.22, this.sfxBus);
      pull.flt.frequency.linearRampToValueAtTime(4200 * v, t + 0.07);

      this.noiseBurst(t + 0.095, 0.045, 'bandpass', 5100 * v, 3.5, 0.34, this.sfxBus);
      const clank = ctx.createOscillator();
      clank.type = 'sawtooth';
      clank.frequency.setValueAtTime(620 * v, t + 0.095);
      clank.frequency.exponentialRampToValueAtTime(180, t + 0.14);
      const cg = ctx.createGain();
      cg.gain.setValueAtTime(0.18, t + 0.095);
      cg.gain.exponentialRampToValueAtTime(0.001, t + 0.145);
      clank.connect(cg);
      cg.connect(this.sfxBus);
      clank.start(t + 0.095);
      clank.stop(t + 0.15);
    }
  }

  // 4. Surface-Aware Footsteps ('concrete' | 'puddle' | 'metal')
  playFootstep(surface = 'concrete', sprint = false) {
    this.init();
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const gainScale = sprint ? 1.25 : 0.85;
    const v = 0.92 + Math.random() * 0.16;

    if (surface === 'puddle') {
      // Boot splash + water scatter
      this.noiseBurst(t, 0.11, 'bandpass', 2400 * v, 1.1, 0.22 * gainScale, this.sfxBus);
      this.noiseBurst(t + 0.03, 0.14, 'highpass', 3800 * v, 0.8, 0.13 * gainScale, this.sfxBus);
    } else if (surface === 'metal') {
      // Grated steel catwalk clang
      const modes = [320, 790, 1640];
      modes.forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        osc.type = idx === 0 ? 'triangle' : 'sine';
        osc.frequency.setValueAtTime(freq * v, t);
        osc.frequency.exponentialRampToValueAtTime(freq * 0.84, t + 0.09);
        const g = ctx.createGain();
        g.gain.setValueAtTime((0.14 / (idx + 1)) * gainScale, t);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.095);
        osc.connect(g);
        g.connect(this.sfxBus);
        osc.start(t);
        osc.stop(t + 0.1);
      });
      this.noiseBurst(t, 0.04, 'bandpass', 3100 * v, 2.2, 0.14 * gainScale, this.sfxBus);
    } else {
      // Wet concrete heel thump + grit
      const heel = ctx.createOscillator();
      heel.type = 'sine';
      heel.frequency.setValueAtTime(105 * v, t);
      heel.frequency.exponentialRampToValueAtTime(42, t + 0.055);
      const hg = ctx.createGain();
      hg.gain.setValueAtTime(0.22 * gainScale, t);
      hg.gain.exponentialRampToValueAtTime(0.001, t + 0.06);
      heel.connect(hg);
      hg.connect(this.sfxBus);
      heel.start(t);
      heel.stop(t + 0.065);

      this.noiseBurst(t + 0.008, 0.055, 'bandpass', 2200 * v, 1.6, 0.12 * gainScale, this.sfxBus);
    }
  }

  // 5. Crisp Hitmarker & Headshot Kill Confirmation
  playHitmarker(isCrit = false, isKill = false) {
    this.init();
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;

    this.noiseBurst(t, 0.022, 'bandpass', isCrit ? 2800 : 1950, 3.5, 0.28, this.sfxBus);

    if (isCrit) {
      const ping = ctx.createOscillator();
      ping.type = 'triangle';
      ping.frequency.setValueAtTime(1320, t);
      ping.frequency.exponentialRampToValueAtTime(660, t + 0.06);
      const pg = ctx.createGain();
      pg.gain.setValueAtTime(0.22, t);
      pg.gain.exponentialRampToValueAtTime(0.001, t + 0.065);
      ping.connect(pg);
      pg.connect(this.sfxBus);
      ping.start(t);
      ping.stop(t + 0.07);
    }

    if (isKill) {
      const k = ctx.createOscillator();
      k.type = 'sine';
      k.frequency.setValueAtTime(587.33, t + 0.02); // D5
      k.frequency.setValueAtTime(880.0, t + 0.065); // A5
      const kg = ctx.createGain();
      kg.gain.setValueAtTime(0.18, t + 0.02);
      kg.gain.exponentialRampToValueAtTime(0.0001, t + 0.19);
      k.connect(kg);
      kg.connect(this.sfxBus);
      k.start(t + 0.02);
      k.stop(t + 0.2);
    }
  }

  // 6. Bullet Whiz & Ricochet
  playBulletWhiz() {
    this.init();
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const b = this.noiseBurst(t, 0.14, 'bandpass', 3600, 4.5, 0.18, this.sfxBus);
    b.flt.frequency.exponentialRampToValueAtTime(750, t + 0.14);
  }

  playRicochet() {
    this.init();
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    const startF = 2400 + Math.random() * 900;
    osc.frequency.setValueAtTime(startF, t);
    osc.frequency.exponentialRampToValueAtTime(520, t + 0.16);
    const flt = ctx.createBiquadFilter();
    flt.type = 'bandpass';
    flt.frequency.value = 2200;
    flt.Q.value = 4.0;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.16, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.17);
    osc.connect(flt);
    flt.connect(g);
    g.connect(this.sfxBus);
    osc.start(t);
    osc.stop(t + 0.18);
  }

  // 7. Enemy Weapons, Telegraph & Explosions
  playDroneLock() {
    this.init();
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(520, t);
    osc.frequency.exponentialRampToValueAtTime(1480, t + 0.35);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.001, t);
    g.gain.linearRampToValueAtTime(0.09, t + 0.15);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.38);
    osc.connect(g);
    g.connect(this.sfxBus);
    osc.start(t);
    osc.stop(t + 0.4);
  }

  playEnemyFire(kind = 'gull') {
    this.init();
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    const f0 = kind === 'boss' ? 240 : kind === 'hound' ? 420 : 680;
    osc.frequency.setValueAtTime(f0 * (0.95 + Math.random() * 0.1), t);
    osc.frequency.exponentialRampToValueAtTime(85, t + 0.11);
    const g = ctx.createGain();
    g.gain.setValueAtTime(kind === 'boss' ? 0.28 : 0.16, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
    osc.connect(g);
    g.connect(this.sfxBus);
    osc.start(t);
    osc.stop(t + 0.13);

    this.noiseBurst(t, 0.08, 'bandpass', 1800, 1.8, 0.14, this.sfxBus);
  }

  playExplosion(scale = 1.0) {
    this.init();
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;

    const sub = ctx.createOscillator();
    sub.type = 'sine';
    sub.frequency.setValueAtTime(95, t);
    sub.frequency.exponentialRampToValueAtTime(24, t + 0.55 * scale);
    const sg = ctx.createGain();
    sg.gain.setValueAtTime(Math.min(0.9, 0.65 * scale), t);
    sg.gain.exponentialRampToValueAtTime(0.001, t + 0.6 * scale);
    sub.connect(sg);
    sg.connect(this.sfxBus);
    sub.start(t);
    sub.stop(t + 0.65 * scale);

    const boom = this.noiseBurst(
      t,
      0.75 * scale,
      'lowpass',
      920,
      0.8,
      Math.min(0.85, 0.6 * scale),
      this.sfxBus,
      true
    );
    boom.flt.frequency.exponentialRampToValueAtTime(140, t + 0.7 * scale);
    if (this.outdoorDelay) boom.g.connect(this.outdoorDelay);
  }

  // 8. Tactical EMP Blast & Relay Sabotage
  playEmpBlast() {
    this.init();
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;

    // Electromagnetic sub drop + rising harmonic ring
    const drop = ctx.createOscillator();
    drop.type = 'sine';
    drop.frequency.setValueAtTime(320, t);
    drop.frequency.exponentialRampToValueAtTime(32, t + 0.48);
    const dg = ctx.createGain();
    dg.gain.setValueAtTime(0.7, t);
    dg.gain.exponentialRampToValueAtTime(0.001, t + 0.52);
    drop.connect(dg);
    dg.connect(this.sfxBus);
    drop.start(t);
    drop.stop(t + 0.55);

    const ring = ctx.createOscillator();
    ring.type = 'triangle';
    ring.frequency.setValueAtTime(440, t);
    ring.frequency.exponentialRampToValueAtTime(2200, t + 0.36);
    const rg = ctx.createGain();
    rg.gain.setValueAtTime(0.28, t);
    rg.gain.exponentialRampToValueAtTime(0.0001, t + 0.42);
    ring.connect(rg);
    rg.connect(this.sfxBus);
    ring.start(t);
    ring.stop(t + 0.45);

    this.noiseBurst(t, 0.35, 'bandpass', 3400, 2.5, 0.35, this.sfxBus);
  }

  playRelayTick(progress = 0.5) {
    this.init();
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = 'square';
    osc.frequency.setValueAtTime(420 + progress * 780, t);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.08, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
    osc.connect(g);
    g.connect(this.sfxBus);
    osc.start(t);
    osc.stop(t + 0.055);
  }

  playRelaySevered() {
    this.init();
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;

    // Heavy breaker clunk + transformer power-down sweep + alarm klaxon
    this.noiseBurst(t, 0.09, 'bandpass', 1600, 1.4, 0.5, this.sfxBus);
    const pwr = ctx.createOscillator();
    pwr.type = 'sawtooth';
    pwr.frequency.setValueAtTime(480, t + 0.04);
    pwr.frequency.exponentialRampToValueAtTime(45, t + 0.78);
    const pg = ctx.createGain();
    pg.gain.setValueAtTime(0.32, t + 0.04);
    pg.gain.exponentialRampToValueAtTime(0.0001, t + 0.82);
    pwr.connect(pg);
    pg.connect(this.sfxBus);
    pwr.start(t + 0.04);
    pwr.stop(t + 0.85);

    // Dual-pulse harbor klaxon
    for (let i = 0; i < 2; i++) {
      const kt = t + 0.25 + i * 0.42;
      const klax = ctx.createOscillator();
      klax.type = 'sawtooth';
      klax.frequency.setValueAtTime(370, kt);
      klax.frequency.linearRampToValueAtTime(330, kt + 0.3);
      const flt = ctx.createBiquadFilter();
      flt.type = 'lowpass';
      flt.frequency.value = 1100;
      const kg = ctx.createGain();
      kg.gain.setValueAtTime(0.18, kt);
      kg.gain.exponentialRampToValueAtTime(0.001, kt + 0.32);
      klax.connect(flt);
      flt.connect(kg);
      kg.connect(this.sfxBus);
      if (this.outdoorDelay) kg.connect(this.outdoorDelay);
      klax.start(kt);
      klax.stop(kt + 0.34);
    }
  }

  // 9. Distant Rolling Storm Thunder
  playThunder() {
    this.init();
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.pinkBuffer;
    src.playbackRate.value = 0.55;

    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(340, t);
    lp.frequency.exponentialRampToValueAtTime(85, t + 2.4);

    const g = ctx.createGain();
    g.gain.setValueAtTime(0.001, t);
    g.gain.linearRampToValueAtTime(0.45, t + 0.14);
    g.gain.setValueAtTime(0.32, t + 0.45);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 2.6);

    src.connect(lp);
    lp.connect(g);
    g.connect(this.ambienceBus);
    src.start(t, 0, 2.7);
  }

  playPlayerHurt() {
    this.init();
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(140, t);
    osc.frequency.exponentialRampToValueAtTime(48, t + 0.16);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.42, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
    osc.connect(g);
    g.connect(this.sfxBus);
    osc.start(t);
    osc.stop(t + 0.19);
    this.noiseBurst(t, 0.08, 'lowpass', 900, 1.0, 0.25, this.sfxBus);
  }

  playPickup() {
    this.init();
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const notes = [523.25, 659.25, 783.99];
    notes.forEach((n, i) => {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(n, t + i * 0.045);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.14, t + i * 0.045);
      g.gain.exponentialRampToValueAtTime(0.0001, t + i * 0.045 + 0.14);
      osc.connect(g);
      g.connect(this.sfxBus);
      osc.start(t + i * 0.045);
      osc.stop(t + i * 0.045 + 0.15);
    });
  }
}
