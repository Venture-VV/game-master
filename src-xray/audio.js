// 100% Procedural Bio-Acoustic & Medical Fluoroscopy Web Audio Synthesizer
// Includes Lub-Dub Cardiac Heartbeat, ECG Monitor Ping, X-Ray Electromagnetic Hum,
// TMJ Bone Articulation Click, 3-Formant Vocal Choir ("Oh/Ah" synced to Jaw!) & Neural Chimes.

import { clamp, lerp } from './math.js';

export class XRayMirrorAudio {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.analyser = null;
    this.echoSend = null;
    this.noiseBuf = null;

    // Continuous Fluoroscopy Hum nodes
    this.humGain = null;
    this.humFilter = null;

    // Continuous 3-Formant Vocal Choir Synth nodes (synced to live jaw opening!)
    this.vocalGain = null;
    this.formants = [];

    this.vol = 0.8;
    this.ecgMuted = false;
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
    comp.threshold.value = -11;
    comp.knee.value = 12;
    comp.ratio.value = 7;
    comp.attack.value = 0.004;
    comp.release.value = 0.16;

    this.master = this.ctx.createGain();
    this.master.gain.value = this.vol;

    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 512;

    this.master.connect(comp);
    comp.connect(this.analyser);
    this.analyser.connect(this.ctx.destination);

    // Diagnostic Shimmer Delay Bus for Neural Synapses & Vocal Resonance
    this.echoSend = this.ctx.createGain();
    this.echoSend.gain.value = 0.26;
    const dly = this.ctx.createDelay(1.0);
    dly.delayTime.value = 0.24;
    const fb = this.ctx.createGain();
    fb.gain.value = 0.34;
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 2400;

    this.echoSend.connect(dly);
    dly.connect(lp);
    lp.connect(fb);
    fb.connect(dly);
    lp.connect(this.master);

    // 1.5s Pink/Tissue Noise Buffer
    const len = Math.floor(this.ctx.sampleRate * 1.5);
    this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const ch = this.noiseBuf.getChannelData(0);
    let b0 = 0;
    let b1 = 0;
    let b2 = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      b0 = 0.996 * b0 + w * 0.032;
      b1 = 0.982 * b1 + w * 0.038;
      b2 = 0.945 * b2 + w * 0.055;
      ch[i] = (b0 + b1 + b2 + w * 0.12) * 0.85;
    }

    // 1. Continuous X-Ray Fluoroscopy Electromagnetic Hum (110 Hz + 165 Hz + 220 Hz)
    this.humFilter = this.ctx.createBiquadFilter();
    this.humFilter.type = 'lowpass';
    this.humFilter.frequency.value = 260;
    this.humFilter.Q.value = 1.8;

    this.humGain = this.ctx.createGain();
    this.humGain.gain.value = 0.025;

    [110.0, 164.81, 220.0].forEach((hz, idx) => {
      const osc = this.ctx.createOscillator();
      osc.type = idx === 0 ? 'sine' : 'triangle';
      osc.frequency.value = hz;
      osc.detune.value = (idx - 1) * 4;
      const og = this.ctx.createGain();
      og.gain.value = idx === 0 ? 0.45 : 0.20;
      osc.connect(og);
      og.connect(this.humFilter);
      osc.start();
    });
    this.humFilter.connect(this.humGain);
    this.humGain.connect(this.master);

    // 2. Continuous 3-Formant Vocal Choir Synth ("Oh -> Ahhh!" driven by Jaw Angle!)
    const glottalBus = this.ctx.createGain();
    glottalBus.gain.value = 0.55;

    // Warm C3 + G3 + C4 vocal cord harmonics
    [130.81, 196.0, 261.63].forEach((hz, idx) => {
      const osc = this.ctx.createOscillator();
      osc.type = idx === 2 ? 'triangle' : 'sawtooth';
      osc.frequency.value = hz;
      osc.detune.value = (idx - 1) * 6.5;
      const og = this.ctx.createGain();
      og.gain.value = idx === 0 ? 0.48 : idx === 1 ? 0.30 : 0.22;
      osc.connect(og);
      og.connect(glottalBus);
      osc.start();
    });

    this.vocalGain = this.ctx.createGain();
    this.vocalGain.gain.value = 0.0001;

    const baseFormants = [
      { f: 380, q: 5.5, gain: 0.95 }, // F1 (jaw height formant!)
      { f: 780, q: 6.5, gain: 0.65 }, // F2 (oral cavity resonance)
      { f: 2450, q: 7.5, gain: 0.28 }, // F3 (singer's clarity formant)
    ];

    this.formants = baseFormants.map((cfg) => {
      const bp = this.ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = cfg.f;
      bp.Q.value = cfg.q;
      const fg = this.ctx.createGain();
      fg.gain.value = cfg.gain;
      glottalBus.connect(bp);
      bp.connect(fg);
      fg.connect(this.vocalGain);
      return bp;
    });

    this.vocalGain.connect(this.master);
    this.vocalGain.connect(this.echoSend);
  }

  setVolume(v) {
    this.vol = clamp(v, 0, 1);
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(this.vol, this.ctx.currentTime, 0.04);
    }
  }

  // Updates live continuous Fluoroscopy Hum & Vocal Choir Formants every frame
  updateContinuous(jawOpen, scannerVel, fullScanMix, activeMode) {
    if (!this.ctx || !this.humGain || !this.vocalGain) return;
    const now = this.ctx.currentTime;

    if (!activeMode) {
      this.humGain.gain.setTargetAtTime(0.008, now, 0.12);
      this.vocalGain.gain.setTargetAtTime(0.0001, now, 0.08);
      return;
    }

    // Modulate electromagnetic scanner hum with cursor sweep velocity & full-scan state
    const targetHum = 0.024 + clamp(scannerVel * 0.022, 0, 0.045) + fullScanMix * 0.018;
    const targetCutoff = 250 + clamp(scannerVel * 280, 0, 560) + fullScanMix * 220;
    this.humGain.gain.setTargetAtTime(targetHum, now, 0.06);
    this.humFilter.frequency.setTargetAtTime(targetCutoff, now, 0.06);

    // Modulate 3-Formant Vocal Choir ("Mmm/Oh" -> wide open "Ahhhh!") when jaw opens!
    const open = clamp(jawOpen, 0, 1);
    const vAmp = open > 0.08 ? clamp((open - 0.08) * 0.24, 0, 0.20) : 0.0001;
    this.vocalGain.gain.setTargetAtTime(vAmp, now, 0.05);

    if (this.formants.length === 3) {
      this.formants[0].frequency.setTargetAtTime(lerp(350, 780, open), now, 0.05);
      this.formants[1].frequency.setTargetAtTime(lerp(760, 1240, open), now, 0.05);
      this.formants[2].frequency.setTargetAtTime(lerp(2380, 2760, open), now, 0.05);
    }
  }

  // Realistic Low-Frequency Lub-Dub Cardiac Heartbeat (S1 + S2 Valve Closures)
  playHeartbeat(bpm = 72, playEcg = false) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const beatScale = clamp((bpm - 68) / 85, 0, 1);
    const s2Delay = clamp(0.25 * (74 / Math.max(60, bpm)), 0.13, 0.27);

    // S1 ("Lub" — Mitral/Tricuspid closure)
    this._triggerHeartThump(t, 78 + beatScale * 14, 36, 0.11, 0.26 + beatScale * 0.08);
    // S2 ("Dub" — Aortic/Pulmonic closure)
    this._triggerHeartThump(t + s2Delay, 98 + beatScale * 16, 46, 0.085, 0.19 + beatScale * 0.06);

    if (playEcg && !this.ecgMuted) {
      this.playEcgPing(bpm > 110);
    }
  }

  _triggerHeartThump(startTime, fStart, fEnd, dur, peakGain) {
    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(fStart, startTime);
    osc.frequency.exponentialRampToValueAtTime(fEnd, startTime + dur);

    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, startTime);
    g.gain.linearRampToValueAtTime(peakGain, startTime + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0008, startTime + dur + 0.03);

    osc.connect(g);
    g.connect(this.master);
    osc.start(startTime);
    osc.stop(startTime + dur + 0.04);

    // Subtle chest-cavity tissue thud
    if (this.noiseBuf) {
      const ns = this.ctx.createBufferSource();
      ns.buffer = this.noiseBuf;
      const lp = this.ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 145;
      const ng = this.ctx.createGain();
      ng.gain.setValueAtTime(peakGain * 0.35, startTime);
      ng.gain.exponentialRampToValueAtTime(0.0008, startTime + 0.065);
      ns.connect(lp);
      lp.connect(ng);
      ng.connect(this.master);
      ns.start(startTime);
      ns.stop(startTime + 0.075);
    }
  }

  // Hospital ECG Monitor R-Wave Telemetry Ping
  playEcgPing(highAlert = false) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(highAlert ? 1046.5 : 880.0, t);

    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(highAlert ? 0.055 : 0.032, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0005, t + 0.095);

    osc.connect(g);
    g.connect(this.master);
    osc.start(t);
    osc.stop(t + 0.105);
  }

  // Crisp Organic TMJ Jaw / Osteology Bone Articulation Click
  playBoneClick(opening = true) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(opening ? 480 : 310, t);
    osc.frequency.exponentialRampToValueAtTime(opening ? 195 : 440, t + 0.045);

    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.001, t);
    g.gain.linearRampToValueAtTime(0.14, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0008, t + 0.055);

    osc.connect(g);
    g.connect(this.master);
    osc.start(t);
    osc.stop(t + 0.065);
  }

  // Sparkling Golden Cortical Action-Potential Neural Cascade Chimes!
  playNeuralStorm() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const notes = [523.25, 587.33, 659.25, 783.99, 880.0, 1046.5, 1174.66, 1567.98];
    notes.forEach((hz, idx) => {
      const st = t + idx * 0.048;
      const osc = this.ctx.createOscillator();
      osc.type = idx % 2 === 0 ? 'sine' : 'triangle';
      osc.frequency.setValueAtTime(hz, st);
      osc.frequency.exponentialRampToValueAtTime(hz * 1.006, st + 0.42);

      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.0001, st);
      g.gain.linearRampToValueAtTime(0.11, st + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0006, st + 0.52);

      osc.connect(g);
      g.connect(this.master);
      g.connect(this.echoSend);
      osc.start(st);
      osc.stop(st + 0.56);
    });
  }

  // Studio Demo: Standalone Formant Vocal Choir Swell ("Oh -> Ahhh -> Oh")
  playVocalDemo() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const srcBus = this.ctx.createGain();
    srcBus.gain.value = 0.5;

    [130.81, 196.0, 261.63].forEach((hz, idx) => {
      const o = this.ctx.createOscillator();
      o.type = idx === 2 ? 'triangle' : 'sawtooth';
      o.frequency.value = hz;
      o.detune.value = (idx - 1) * 6;
      const og = this.ctx.createGain();
      og.gain.value = 0.34;
      o.connect(og);
      og.connect(srcBus);
      o.start(t);
      o.stop(t + 1.35);
    });

    const env = this.ctx.createGain();
    env.gain.setValueAtTime(0.0001, t);
    env.gain.linearRampToValueAtTime(0.22, t + 0.22);
    env.gain.exponentialRampToValueAtTime(0.0008, t + 1.30);

    [
      [360, 770, 5.5, 0.95],
      [760, 1230, 6.5, 0.65],
      [2400, 2720, 7.5, 0.30],
    ].forEach(([f0, f1, q, w]) => {
      const bp = this.ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.Q.value = q;
      bp.frequency.setValueAtTime(f0, t);
      bp.frequency.linearRampToValueAtTime(f1, t + 0.55);
      bp.frequency.linearRampToValueAtTime(f0, t + 1.25);
      const fg = this.ctx.createGain();
      fg.gain.value = w;
      srcBus.connect(bp);
      bp.connect(fg);
      fg.connect(env);
    });

    env.connect(this.master);
    env.connect(this.echoSend);
  }

  // Studio Demo: X-Ray Fluoroscopy Electromagnetic Aperture Sweep
  playFluoroscopySweep() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const flt = this.ctx.createBiquadFilter();
    flt.type = 'bandpass';
    flt.Q.value = 3.5;
    flt.frequency.setValueAtTime(180, t);
    flt.frequency.exponentialRampToValueAtTime(1180, t + 0.42);
    flt.frequency.exponentialRampToValueAtTime(220, t + 0.95);

    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.18, t + 0.14);
    g.gain.exponentialRampToValueAtTime(0.0008, t + 0.98);

    [110.0, 220.0, 329.63].forEach((hz, idx) => {
      const o = this.ctx.createOscillator();
      o.type = idx === 0 ? 'sawtooth' : 'triangle';
      o.frequency.value = hz;
      o.connect(flt);
      o.start(t);
      o.stop(t + 1.02);
    });

    flt.connect(g);
    g.connect(this.master);
    g.connect(this.echoSend);
  }
}
