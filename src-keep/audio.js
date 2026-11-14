// 100% Procedural Web Audio Synthesizer & Live Oscilloscope Analyser for KEEP: PASSWORD FORTRESS
// Tactile wood/stone/brass construction pops, medieval horn fanfares, ocean surf, hearth crackle,
// cannon volleys, shield deflection chimes, dragon roars, and dynamic lute/harp/brass kingdom score.

const KINGDOM_SCALE_HZ = [
  146.83, // D3
  164.81, // E3
  185.00, // F#3
  196.00, // G3
  220.00, // A3
  246.94, // B3
  261.63, // C4 (Mixolydian 7th)
  293.66, // D4
  329.63, // E4
  369.99, // F#4
  392.00, // G4
  440.00, // A4
  493.88, // B4
  587.33, // D5
  659.25, // E5
  739.99, // F#5
  880.00, // A5
];

const LUTE_MELODY_IDX = [0, 4, 7, 9, 11, 9, 7, 5, 3, 7, 10, 7, 4, 6, 7, 4];

export class PasswordKeepAudio {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.analyser = null;
    this.echoSend = null;
    this.noiseBuf = null;
    this.surfFilter = null;
    this.surfGain = null;
    this.droneGain = null;
    this.droneFilter = null;

    this.vol = 0.8;
    this.muted = false;
    this.stepTimer = 0.45;
    this.stepIdx = 0;
    this.crackleTimer = 0.3;
    this.surfPhase = 0;
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
    comp.threshold.value = -12;
    comp.knee.value = 14;
    comp.ratio.value = 7;
    comp.attack.value = 0.004;
    comp.release.value = 0.18;

    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : this.vol;

    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 512;

    this.master.connect(comp);
    comp.connect(this.analyser);
    this.analyser.connect(this.ctx.destination);

    // Warm Castle Hall Reverb-Delay Bus
    this.echoSend = this.ctx.createGain();
    this.echoSend.gain.value = 0.24;
    const delay = this.ctx.createDelay(1.0);
    delay.delayTime.value = 0.24;
    const fb = this.ctx.createGain();
    fb.gain.value = 0.32;
    const dampLp = this.ctx.createBiquadFilter();
    dampLp.type = 'lowpass';
    dampLp.frequency.value = 2100;

    this.echoSend.connect(delay);
    delay.connect(dampLp);
    dampLp.connect(fb);
    fb.connect(delay);
    dampLp.connect(this.master);

    // 2s Pink/Ocean Surf & Black-Powder Noise Buffer
    const len = this.ctx.sampleRate * 2;
    this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const ch = this.noiseBuf.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      b0 = 0.997 * b0 + w * 0.029;
      b1 = 0.985 * b1 + w * 0.035;
      b2 = 0.950 * b2 + w * 0.048;
      ch[i] = (b0 + b1 + b2 + w * 0.14) * 0.88;
    }

    // Continuous Ocean Surf Generator
    const surfSrc = this.ctx.createBufferSource();
    surfSrc.buffer = this.noiseBuf;
    surfSrc.loop = true;

    this.surfFilter = this.ctx.createBiquadFilter();
    this.surfFilter.type = 'bandpass';
    this.surfFilter.frequency.value = 340;
    this.surfFilter.Q.value = 0.75;

    this.surfGain = this.ctx.createGain();
    this.surfGain.gain.value = 0.025;

    surfSrc.connect(this.surfFilter);
    this.surfFilter.connect(this.surfGain);
    this.surfGain.connect(this.master);
    surfSrc.start();

    // Warm Sovereign Harmonic Drone (D2 + A2)
    this.droneFilter = this.ctx.createBiquadFilter();
    this.droneFilter.type = 'lowpass';
    this.droneFilter.frequency.value = 260;

    this.droneGain = this.ctx.createGain();
    this.droneGain.gain.value = 0.025;

    [73.42, 110.0].forEach((hz, i) => {
      const osc = this.ctx.createOscillator();
      osc.type = i === 0 ? 'sine' : 'triangle';
      osc.frequency.value = hz;
      osc.detune.value = i === 0 ? -3 : 3;
      const g = this.ctx.createGain();
      g.gain.value = i === 0 ? 0.5 : 0.3;
      osc.connect(g);
      g.connect(this.droneFilter);
      osc.start();
    });
    this.droneFilter.connect(this.droneGain);
    this.droneGain.connect(this.master);
  }

  setVolume(v) {
    this.vol = Math.max(0, Math.min(1, v));
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(this.muted ? 0 : this.vol, this.ctx.currentTime, 0.03);
    }
  }

  toggleMute() {
    this.init();
    this.muted = !this.muted;
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(this.muted ? 0 : this.vol, this.ctx.currentTime, 0.03);
    }
    return this.muted;
  }

  // Tactile pitch-ascending construction pop for each typed character
  playCharBuild(charClass = 'lower', entropyBits = 20, isDelete = false) {
    this.init();
    if (!this.ctx) return;
    const now = this.ctx.currentTime;

    if (isDelete) {
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(280, now);
      osc.frequency.exponentialRampToValueAtTime(135, now + 0.08);
      g.gain.setValueAtTime(0.14, now);
      g.gain.exponentialRampToValueAtTime(0.001, now + 0.085);
      osc.connect(g);
      g.connect(this.master);
      osc.start(now);
      osc.stop(now + 0.09);
      return;
    }

    const scaleIdx = Math.min(
      KINGDOM_SCALE_HZ.length - 1,
      Math.max(0, Math.floor((entropyBits / 118) * (KINGDOM_SCALE_HZ.length - 1)))
    );
    const baseHz = KINGDOM_SCALE_HZ[scaleIdx];

    if (charClass === 'symbol') {
      // Forged Brass Cannon Anvil Clink!
      [1.0, 2.41, 3.86].forEach((mult, idx) => {
        const osc = this.ctx.createOscillator();
        const g = this.ctx.createGain();
        osc.type = idx === 0 ? 'triangle' : 'sine';
        osc.frequency.setValueAtTime(baseHz * mult * 1.25, now);
        g.gain.setValueAtTime(idx === 0 ? 0.18 : 0.09, now);
        g.gain.exponentialRampToValueAtTime(0.001, now + 0.24 - idx * 0.04);
        osc.connect(g);
        g.connect(this.master);
        g.connect(this.echoSend);
        osc.start(now);
        osc.stop(now + 0.26);
      });
    } else if (charClass === 'upper') {
      // Carved Stone Bastion Thud + Harmonic Overtones
      const sub = this.ctx.createOscillator();
      const subG = this.ctx.createGain();
      sub.type = 'sine';
      sub.frequency.setValueAtTime(145, now);
      sub.frequency.exponentialRampToValueAtTime(56, now + 0.11);
      subG.gain.setValueAtTime(0.24, now);
      subG.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
      sub.connect(subG);
      subG.connect(this.master);
      sub.start(now);
      sub.stop(now + 0.13);

      this.playPluckNote(baseHz, 0.18, 'triangle', 0.2);
    } else if (charClass === 'unicode') {
      // Sovereign Golden Obelisk Harp Shimmer Chord
      this.playPluckNote(baseHz, 0.2, 'triangle', 0.34);
      this.playPluckNote(baseHz * 1.5, 0.15, 'sine', 0.42, 0.035);
      this.playPluckNote(baseHz * 2.0, 0.12, 'sine', 0.48, 0.07);
    } else if (charClass === 'digit') {
      // Timber Watchtower Ratchet + Bell
      this.playNoiseBurst(0.045, 1100, 2.5, 0.12);
      this.playPluckNote(baseHz * 1.125, 0.16, 'triangle', 0.18);
    } else {
      // Cozy Timber Cottage Mallet Pop
      this.playNoiseBurst(0.035, 680, 2.2, 0.1);
      this.playPluckNote(baseHz, 0.18, 'sine', 0.15);
    }
  }

  playPluckNote(hz, peakGain = 0.14, type = 'triangle', dur = 0.28, delaySec = 0) {
    if (!this.ctx) return;
    const t0 = this.ctx.currentTime + delaySec;
    const osc = this.ctx.createOscillator();
    const flt = this.ctx.createBiquadFilter();
    const g = this.ctx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(hz * 0.985, t0);
    osc.frequency.exponentialRampToValueAtTime(hz, t0 + 0.025);

    flt.type = 'lowpass';
    flt.frequency.setValueAtTime(hz * 5.2, t0);
    flt.frequency.exponentialRampToValueAtTime(hz * 1.6, t0 + dur);

    g.gain.setValueAtTime(0.001, t0);
    g.gain.linearRampToValueAtTime(peakGain, t0 + 0.008);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);

    osc.connect(flt);
    flt.connect(g);
    g.connect(this.master);
    if (this.echoSend) g.connect(this.echoSend);

    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  playNoiseBurst(dur = 0.12, freq = 800, q = 1.2, peak = 0.18, delaySec = 0) {
    if (!this.ctx || !this.noiseBuf) return;
    const t0 = this.ctx.currentTime + delaySec;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;

    const flt = this.ctx.createBiquadFilter();
    flt.type = 'bandpass';
    flt.frequency.setValueAtTime(freq, t0);
    flt.Q.value = q;

    const g = this.ctx.createGain();
    g.gain.setValueAtTime(peak, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);

    src.connect(flt);
    flt.connect(g);
    g.connect(this.master);

    src.start(t0, Math.random() * 1.2);
    src.stop(t0 + dur + 0.02);
  }

  // Heroic Medieval Brass Horn Fanfare on Tier-Up!
  playTierFanfare(tier = 2) {
    this.init();
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const rootMult = 1 + tier * 0.08;
    const notes = [293.66 * rootMult, 440.0 * rootMult, 587.33 * rootMult];
    if (tier >= 4) notes.push(739.99 * rootMult);

    // Kettle-drum timpani strike
    const drum = this.ctx.createOscillator();
    const drumG = this.ctx.createGain();
    drum.type = 'sine';
    drum.frequency.setValueAtTime(118, now);
    drum.frequency.exponentialRampToValueAtTime(48, now + 0.35);
    drumG.gain.setValueAtTime(0.32, now);
    drumG.gain.exponentialRampToValueAtTime(0.001, now + 0.38);
    drum.connect(drumG);
    drumG.connect(this.master);
    drum.start(now);
    drum.stop(now + 0.4);

    notes.forEach((hz, idx) => {
      const t0 = now + idx * 0.09;
      const dur = idx === notes.length - 1 ? 0.62 : 0.28;
      [-4, 4].forEach((det) => {
        const osc = this.ctx.createOscillator();
        const flt = this.ctx.createBiquadFilter();
        const g = this.ctx.createGain();

        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(hz, t0);
        osc.detune.value = det;

        flt.type = 'lowpass';
        flt.frequency.setValueAtTime(320, t0);
        flt.frequency.linearRampToValueAtTime(1850, t0 + 0.06);
        flt.frequency.exponentialRampToValueAtTime(780, t0 + dur);
        flt.Q.value = 2.2;

        g.gain.setValueAtTime(0.001, t0);
        g.gain.linearRampToValueAtTime(0.095, t0 + 0.035);
        g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);

        osc.connect(flt);
        flt.connect(g);
        g.connect(this.master);
        g.connect(this.echoSend);

        osc.start(t0);
        osc.stop(t0 + dur + 0.02);
      });
    });
  }

  playCannonVolley() {
    this.init();
    if (!this.ctx) return;
    const now = this.ctx.currentTime;

    const sub = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    sub.type = 'sine';
    sub.frequency.setValueAtTime(155, now);
    sub.frequency.exponentialRampToValueAtTime(34, now + 0.24);
    g.gain.setValueAtTime(0.34, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.26);
    sub.connect(g);
    g.connect(this.master);
    sub.start(now);
    sub.stop(now + 0.28);

    this.playNoiseBurst(0.22, 420, 0.85, 0.28);
  }

  playShieldDeflect() {
    this.init();
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    [587.33, 880.0, 1174.66].forEach((hz, i) => {
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(hz, now + i * 0.015);
      osc.frequency.exponentialRampToValueAtTime(hz * 1.12, now + 0.28);
      g.gain.setValueAtTime(0.13, now + i * 0.015);
      g.gain.exponentialRampToValueAtTime(0.001, now + 0.30);
      osc.connect(g);
      g.connect(this.master);
      g.connect(this.echoSend);
      osc.start(now + i * 0.015);
      osc.stop(now + 0.32);
    });
  }

  playBreachAlarm() {
    this.init();
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    this.playNoiseBurst(0.28, 280, 0.9, 0.32);

    const horn = this.ctx.createOscillator();
    const flt = this.ctx.createBiquadFilter();
    const g = this.ctx.createGain();
    horn.type = 'sawtooth';
    horn.frequency.setValueAtTime(195, now);
    horn.frequency.linearRampToValueAtTime(142, now + 0.32);
    flt.type = 'lowpass';
    flt.frequency.value = 640;
    g.gain.setValueAtTime(0.18, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
    horn.connect(flt);
    flt.connect(g);
    g.connect(this.master);
    horn.start(now);
    horn.stop(now + 0.36);
  }

  playDragonRoar() {
    this.init();
    if (!this.ctx) return;
    const now = this.ctx.currentTime;

    // Mythic golden dragon formant roar + flame breath rush
    [-7, 7].forEach((det) => {
      const osc = this.ctx.createOscillator();
      const flt = this.ctx.createBiquadFilter();
      const g = this.ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(138, now);
      osc.frequency.linearRampToValueAtTime(185, now + 0.14);
      osc.frequency.exponentialRampToValueAtTime(82, now + 0.65);
      osc.detune.value = det;

      flt.type = 'bandpass';
      flt.frequency.setValueAtTime(480, now);
      flt.frequency.linearRampToValueAtTime(920, now + 0.18);
      flt.frequency.exponentialRampToValueAtTime(310, now + 0.65);
      flt.Q.value = 2.4;

      g.gain.setValueAtTime(0.001, now);
      g.gain.linearRampToValueAtTime(0.18, now + 0.05);
      g.gain.exponentialRampToValueAtTime(0.001, now + 0.68);

      osc.connect(flt);
      flt.connect(g);
      g.connect(this.master);
      g.connect(this.echoSend);
      osc.start(now);
      osc.stop(now + 0.7);
    });

    this.playNoiseBurst(0.55, 760, 0.7, 0.24, 0.05);
  }

  playFireworkPop() {
    this.init();
    if (!this.ctx) return;
    this.playNoiseBurst(0.16, 1850, 1.4, 0.12);
    this.playPluckNote(880, 0.09, 'sine', 0.24, 0.02);
  }

  triggerStudioSfx(kind) {
    this.init();
    if (kind === 'build') this.playCharBuild('symbol', 85, false);
    else if (kind === 'fanfare') this.playTierFanfare(5);
    else if (kind === 'cannon') this.playCannonVolley();
    else if (kind === 'shield') this.playShieldDeflect();
    else if (kind === 'dragon') this.playDragonRoar();
    else if (kind === 'lute') {
      this.playPluckNote(293.66, 0.18, 'triangle', 0.42, 0);
      this.playPluckNote(369.99, 0.15, 'triangle', 0.42, 0.09);
      this.playPluckNote(440.0, 0.15, 'triangle', 0.45, 0.18);
      this.playPluckNote(587.33, 0.18, 'sine', 0.55, 0.27);
    }
  }

  update(dt, tier = 0, entropyBits = 0, underSiege = false, active = true) {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime;

    // 1. Modulate Ocean Surf (Stormy roar in Tier 0 -> Gentle coastal lap in Tier 2+ -> High sky breeze in Tier 4-5)
    this.surfPhase += dt * (tier === 0 ? 1.55 : 0.75);
    const waveSwell = 0.5 + 0.5 * Math.sin(this.surfPhase);
    const baseSurf = tier === 0 ? 0.055 : tier <= 3 ? 0.024 : 0.015;
    const targetSurfGain = active ? baseSurf * (0.65 + 0.65 * waveSwell) : 0.008;
    const targetSurfFreq = tier === 0 ? 320 + waveSwell * 260 : 240 + waveSwell * 160;

    this.surfGain.gain.setTargetAtTime(targetSurfGain, now, 0.12);
    this.surfFilter.frequency.setTargetAtTime(targetSurfFreq, now, 0.12);

    // 2. Modulate Sovereign Drone
    const targetDrone = active ? 0.016 + tier * 0.006 + (underSiege ? 0.018 : 0) : 0.012;
    this.droneGain.gain.setTargetAtTime(targetDrone, now, 0.18);
    this.droneFilter.frequency.setTargetAtTime(210 + tier * 65, now, 0.18);

    if (!active) return;

    // 3. Cozy Campfire Hearth Crackle (Tier 1-3)
    if (tier >= 1 && tier <= 3) {
      this.crackleTimer -= dt;
      if (this.crackleTimer <= 0) {
        this.crackleTimer = 0.16 + Math.random() * 0.48;
        this.playNoiseBurst(0.018, 2400 + Math.random() * 1400, 3.5, 0.035);
      }
    }

    // 4. Dynamic Procedural Lute / Harp / Brass Kingdom Soundtrack
    this.stepTimer -= dt;
    const tempoSec = underSiege ? 0.24 : Math.max(0.30, 0.54 - tier * 0.035);
    if (this.stepTimer <= 0) {
      this.stepTimer = tempoSec;
      const mIdx = LUTE_MELODY_IDX[this.stepIdx % LUTE_MELODY_IDX.length];
      this.stepIdx++;

      if (tier >= 1 || underSiege) {
        const hz = KINGDOM_SCALE_HZ[mIdx];
        this.playPluckNote(hz, underSiege ? 0.065 : 0.052, 'triangle', 0.34);
        if (tier >= 3 && this.stepIdx % 4 === 0) {
          this.playPluckNote(hz * 1.5, 0.042, 'sine', 0.46, 0.04);
        }
      }
    }
  }
}
