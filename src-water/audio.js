// 100% Procedural Impressionist Acoustic Web Audio Engine:
// Tactile Oar Water-Dip & Droplets, Brass Lantern Wind-Chime, Debussy Felt Piano, Celesta & Solo Cello across 8 Realms

const REALM_SCALES = [
  // 01 Dawn Water-Lilies: F Lydian (luminous Monet morning)
  { root: 174.61, notes: [261.63, 293.66, 349.23, 392.00, 440.00, 493.88, 523.25, 587.33] },
  // 02 Sunken Torii Lagoon: D Yo / Pentatonic (serene mirror turquoise)
  { root: 146.83, notes: [293.66, 329.63, 392.00, 440.00, 523.25, 587.33, 659.25, 783.99] },
  // 03 Floating Lantern Dusk: Bb Major 9 / Lydian (nostalgic warm sunset)
  { root: 116.54, notes: [233.08, 261.63, 293.66, 349.23, 392.00, 440.00, 523.25, 587.33] },
  // 04 Bioluminescent Jellyfish: C Lydian Augmented / Whole-Tone shimmer
  { root: 130.81, notes: [261.63, 293.66, 329.63, 369.99, 415.30, 493.88, 523.25, 659.25] },
  // 05 Drowned Cathedral: E Dorian (ancient sunken stone arches)
  { root: 164.81, notes: [246.94, 293.66, 329.63, 369.99, 392.00, 493.88, 587.33, 659.25] },
  // 06 Crimson Maple Fjord: A Add9 Pentatonic (crisp golden-red canyon breeze)
  { root: 110.00, notes: [220.00, 246.94, 277.18, 329.63, 369.99, 440.00, 493.88, 659.25] },
  // 07 Glacial Aurora Mirror: G Lydian Maj9 (crystalline polar aurora)
  { root: 196.00, notes: [293.66, 369.99, 392.00, 440.00, 493.88, 587.33, 739.99, 783.99] },
  // 08 Golden Horizon Sanctuary: C Lydian Maj9 (transcendent homecoming)
  { root: 130.81, notes: [261.63, 293.66, 329.63, 369.99, 392.00, 493.88, 523.25, 783.99] },
];

export class ImpressionistWaterAudio {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.analyser = null;
    this.reverbIn = null;
    this.noiseBuf = null;
    this.waterGain = null;
    this.waterFilter = null;
    this.vol = 0.8;
    this.noteTimer = 0.4;
    this.noteStep = 0;
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
    comp.threshold.value = -10;
    comp.knee.value = 14;
    comp.ratio.value = 6;
    comp.attack.value = 0.006;
    comp.release.value = 0.22;

    this.master = this.ctx.createGain();
    this.master.gain.value = this.vol;

    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 512;

    this.master.connect(comp);
    comp.connect(this.analyser);
    this.analyser.connect(this.ctx.destination);

    // Dual-Delay Lush Water-Reflection Reverb Bus
    this.reverbIn = this.ctx.createGain();
    this.reverbIn.gain.value = 0.34;

    const dlyA = this.ctx.createDelay(1.0);
    dlyA.delayTime.value = 0.23;
    const dlyB = this.ctx.createDelay(1.0);
    dlyB.delayTime.value = 0.37;

    const fbA = this.ctx.createGain();
    fbA.gain.value = 0.36;
    const fbB = this.ctx.createGain();
    fbB.gain.value = 0.33;

    const dampLP = this.ctx.createBiquadFilter();
    dampLP.type = 'lowpass';
    dampLP.frequency.value = 2100;

    this.reverbIn.connect(dlyA);
    this.reverbIn.connect(dlyB);
    dlyA.connect(fbA);
    fbA.connect(dlyB);
    dlyB.connect(fbB);
    fbB.connect(dlyA);
    dlyA.connect(dampLP);
    dlyB.connect(dampLP);
    dampLP.connect(this.master);

    // 2.5s Smooth Pink-Water Noise Buffer
    const len = Math.floor(this.ctx.sampleRate * 2.5);
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

    // Continuous Gentle Hull-Lapping Water Stream
    const waterSrc = this.ctx.createBufferSource();
    waterSrc.buffer = this.noiseBuf;
    waterSrc.loop = true;
    this.waterFilter = this.ctx.createBiquadFilter();
    this.waterFilter.type = 'bandpass';
    this.waterFilter.frequency.value = 460;
    this.waterFilter.Q.value = 0.85;
    this.waterGain = this.ctx.createGain();
    this.waterGain.gain.value = 0.022;

    waterSrc.connect(this.waterFilter);
    this.waterFilter.connect(this.waterGain);
    this.waterGain.connect(this.master);
    waterSrc.start();
  }

  setVolume(v) {
    this.vol = v;
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(v, this.ctx.currentTime, 0.05);
    }
  }

  // Tactile Wooden Oar Water-Dip Swish + Sparkling Bubble Droplets
  playOarStroke(intensity = 1.0) {
    if (!this.ctx || !this.noiseBuf) return;
    const t = this.ctx.currentTime;
    const amp = Math.min(1.25, Math.max(0.35, intensity));

    // 1. Warm wooden oarlock thud
    const wood = this.ctx.createOscillator();
    wood.type = 'triangle';
    wood.frequency.setValueAtTime(135, t);
    wood.frequency.exponentialRampToValueAtTime(68, t + 0.09);
    const wg = this.ctx.createGain();
    wg.gain.setValueAtTime(0.065 * amp, t);
    wg.gain.exponentialRampToValueAtTime(0.0008, t + 0.10);
    wood.connect(wg);
    wg.connect(this.master);
    wood.start(t);
    wood.stop(t + 0.11);

    // 2. Silky blade water-pull swish
    const swish = this.ctx.createBufferSource();
    swish.buffer = this.noiseBuf;
    swish.playbackRate.value = 0.92 + Math.random() * 0.16;
    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(340, t);
    bp.frequency.exponentialRampToValueAtTime(980, t + 0.18);
    bp.frequency.exponentialRampToValueAtTime(380, t + 0.52);
    bp.Q.value = 1.15;

    const sg = this.ctx.createGain();
    sg.gain.setValueAtTime(0.001, t);
    sg.gain.linearRampToValueAtTime(0.18 * amp, t + 0.10);
    sg.gain.exponentialRampToValueAtTime(0.001, t + 0.56);
    swish.connect(bp);
    bp.connect(sg);
    sg.connect(this.master);
    sg.connect(this.reverbIn);
    swish.start(t);
    swish.stop(t + 0.58);

    // 3. Liquid water droplets (upward pitch-chirp sine bubbles as blades lift)
    const drops = [
      { delay: 0.08, f0: 510 + Math.random() * 90 },
      { delay: 0.17, f0: 720 + Math.random() * 140 },
      { delay: 0.27, f0: 940 + Math.random() * 180 },
    ];
    for (const d of drops) {
      const o = this.ctx.createOscillator();
      o.type = 'sine';
      o.frequency.setValueAtTime(d.f0, t + d.delay);
      o.frequency.exponentialRampToValueAtTime(d.f0 * 1.48, t + d.delay + 0.065);
      const dg = this.ctx.createGain();
      dg.gain.setValueAtTime(0.0005, t + d.delay);
      dg.gain.linearRampToValueAtTime(0.042 * amp, t + d.delay + 0.012);
      dg.gain.exponentialRampToValueAtTime(0.0005, t + d.delay + 0.08);
      o.connect(dg);
      dg.connect(this.reverbIn);
      dg.connect(this.master);
      o.start(t + d.delay);
      o.stop(t + d.delay + 0.09);
    }
  }

  // Crystalline Brass Bow-Lantern Wind-Chime
  playLanternChime(realmIdx = 0) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const scale = REALM_SCALES[realmIdx % REALM_SCALES.length];
    const baseF = scale.notes[4] * 2.0; // Luminous high bell fundamental

    // Multi-partial brass wind-bell
    const partials = [
      { ratio: 1.0, gain: 0.13, dur: 2.3 },
      { ratio: 2.0, gain: 0.07, dur: 1.8 },
      { ratio: 2.756, gain: 0.048, dur: 1.4 },
      { ratio: 4.07, gain: 0.028, dur: 0.9 },
    ];
    for (const p of partials) {
      const o = this.ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = baseF * p.ratio;
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.0008, t);
      g.gain.linearRampToValueAtTime(p.gain, t + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0005, t + p.dur);
      o.connect(g);
      g.connect(this.master);
      g.connect(this.reverbIn);
      o.start(t);
      o.stop(t + p.dur + 0.04);
    }

    // Trailing wind-chime grace sparkles
    [0.09, 0.19, 0.31].forEach((dt, idx) => {
      const noteF = scale.notes[(idx * 2 + 2) % scale.notes.length] * 2.0;
      this.playCelesta(noteF, 1.35, 0.055, dt);
    });
  }

  // Sparkling Ascending Arpeggio when Collecting a Memory Light ("水之记忆")
  playMemoryCollect(realmIdx = 0) {
    if (!this.ctx) return;
    const scale = REALM_SCALES[realmIdx % REALM_SCALES.length];
    [0, 2, 4, 6, 7].forEach((ni, step) => {
      const f = scale.notes[ni % scale.notes.length] * (step >= 4 ? 2.0 : 1.0);
      this.playCelesta(f, 1.65, 0.075, step * 0.065);
    });
    this.playFeltPiano(scale.root * 2.0, 2.4, 0.095);
  }

  // Debussy-Inspired Intimate Felt Piano Note
  playFeltPiano(freq, dur = 1.9, vel = 0.09) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;

    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(freq * 4.2, t);
    lp.frequency.exponentialRampToValueAtTime(Math.max(280, freq * 1.35), t + dur * 0.85);

    const env = this.ctx.createGain();
    env.gain.setValueAtTime(0.0005, t);
    env.gain.linearRampToValueAtTime(vel, t + 0.018);
    env.gain.exponentialRampToValueAtTime(vel * 0.38, t + 0.35);
    env.gain.exponentialRampToValueAtTime(0.0005, t + dur);

    const o1 = this.ctx.createOscillator();
    o1.type = 'triangle';
    o1.frequency.value = freq;

    const o2 = this.ctx.createOscillator();
    o2.type = 'sine';
    o2.frequency.value = freq * 2.0;
    o2.detune.value = 3.5;
    const g2 = this.ctx.createGain();
    g2.gain.value = 0.26;

    o1.connect(lp);
    o2.connect(g2);
    g2.connect(lp);
    lp.connect(env);
    env.connect(this.master);
    env.connect(this.reverbIn);

    o1.start(t);
    o2.start(t);
    o1.stop(t + dur + 0.05);
    o2.stop(t + dur + 0.05);
  }

  // Crystalline Celesta Bell-Plate Note
  playCelesta(freq, dur = 1.4, vel = 0.065, delaySec = 0) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + delaySec;

    const o1 = this.ctx.createOscillator();
    o1.type = 'sine';
    o1.frequency.value = freq;

    const o2 = this.ctx.createOscillator();
    o2.type = 'sine';
    o2.frequency.value = freq * 4.0;
    const g2 = this.ctx.createGain();
    g2.gain.setValueAtTime(vel * 0.35, t);
    g2.gain.exponentialRampToValueAtTime(0.0004, t + 0.14);

    const env = this.ctx.createGain();
    env.gain.setValueAtTime(0.0004, t);
    env.gain.linearRampToValueAtTime(vel, t + 0.010);
    env.gain.exponentialRampToValueAtTime(0.0005, t + dur);

    o1.connect(env);
    o2.connect(g2);
    g2.connect(this.master);
    env.connect(this.master);
    env.connect(this.reverbIn);

    o1.start(t);
    o2.start(t);
    o1.stop(t + dur + 0.04);
    o2.stop(t + 0.18);
  }

  // Warm Solo Cello / Chamber Pad Swell
  playCelloPad(freq = 146.83, dur = 3.2, vel = 0.068) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.value = freq;

    const sub = this.ctx.createOscillator();
    sub.type = 'triangle';
    sub.frequency.value = freq * 0.5;
    const subG = this.ctx.createGain();
    subG.gain.value = 0.45;

    const vib = this.ctx.createOscillator();
    vib.frequency.value = 4.8;
    const vibG = this.ctx.createGain();
    vibG.gain.value = freq * 0.0065;
    vib.connect(vibG);
    vibG.connect(osc.frequency);

    const bodyLP = this.ctx.createBiquadFilter();
    bodyLP.type = 'lowpass';
    bodyLP.frequency.value = 640;
    bodyLP.Q.value = 1.4;

    const env = this.ctx.createGain();
    env.gain.setValueAtTime(0.0005, t);
    env.gain.linearRampToValueAtTime(vel, t + 0.55);
    env.gain.setValueAtTime(vel * 0.85, t + dur * 0.65);
    env.gain.exponentialRampToValueAtTime(0.0006, t + dur);

    osc.connect(bodyLP);
    sub.connect(subG);
    subG.connect(bodyLP);
    bodyLP.connect(env);
    env.connect(this.master);
    env.connect(this.reverbIn);

    osc.start(t);
    sub.start(t);
    vib.start(t);
    osc.stop(t + dur + 0.06);
    sub.stop(t + dur + 0.06);
    vib.stop(t + dur + 0.06);
  }

  // Deep Sunken Bronze Sea-Bell (Realm 05 Drowned Cathedral & Sanctuary Finale)
  playCathedralBell(freq = 164.81) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const ratios = [0.5, 1.0, 1.183, 1.506, 2.0, 2.514];
    ratios.forEach((r, idx) => {
      const o = this.ctx.createOscillator();
      o.type = idx === 0 ? 'triangle' : 'sine';
      o.frequency.value = freq * r;
      const dur = 3.6 - idx * 0.42;
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.0006, t);
      g.gain.linearRampToValueAtTime(0.11 / (1 + idx * 0.55), t + 0.015);
      g.gain.exponentialRampToValueAtTime(0.0005, t + dur);
      o.connect(g);
      g.connect(this.master);
      g.connect(this.reverbIn);
      o.start(t);
      o.stop(t + dur + 0.05);
    });
  }

  update(dt, speedNorm, realmIdx, active) {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;

    if (this.waterGain && this.waterFilter) {
      const targetGain = active ? 0.020 + speedNorm * 0.055 : 0.014;
      const targetFreq = 380 + speedNorm * 460;
      this.waterGain.gain.setTargetAtTime(targetGain, now, 0.12);
      this.waterFilter.frequency.setTargetAtTime(targetFreq, now, 0.12);
    }

    if (!active) return;

    // Generative Debussy / Ravel Impressionist Score shifting per Realm
    const scale = REALM_SCALES[realmIdx % REALM_SCALES.length];
    this.noteTimer -= dt;
    if (this.noteTimer <= 0) {
      // Gentle breathing rubato tempo
      const rubato = 0.62 + Math.sin(this.noteStep * 0.7) * 0.14 - speedNorm * 0.08;
      this.noteTimer = Math.max(0.42, rubato);

      const pattern = [0, 2, 4, 6, 5, 3, 4, 1];
      const deg = pattern[this.noteStep % pattern.length];
      const noteFreq = scale.notes[deg % scale.notes.length];

      // Felt Piano broken chord melody
      this.playFeltPiano(noteFreq, 2.1, 0.068);

      // Warm Solo Cello bass pedal every 8 notes
      if (this.noteStep % 8 === 0) {
        this.playCelloPad(scale.root, 3.8, 0.058);
      } else if (this.noteStep % 8 === 4) {
        this.playCelloPad(scale.root * 1.5, 3.2, 0.046);
      }

      // Shimmering high Celesta water reflection droplet every 3rd step
      if (this.noteStep % 3 === 1) {
        const hiFreq = scale.notes[(deg + 2) % scale.notes.length] * 2.0;
        this.playCelesta(hiFreq, 1.5, 0.040, 0.14);
      }

      // Subtle distant sea-bell in Realm 05 (Drowned Cathedral) or Realm 08 (Sanctuary)
      if ((realmIdx === 4 || realmIdx === 7) && this.noteStep % 12 === 2) {
        this.playCathedralBell(scale.root);
      }

      this.noteStep++;
    }
  }
}
