// 100% Procedural Acoustic Nocturne Web Audio Synthesizer (Guitar, Cello, Harp, Celesta & Equine Foley)

export class NocturneAudio {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.analyser = null;
    this.echoIn = null;
    this.noiseBuf = null;
    this.vol = 0.8;
    this.stepTimer = 0;
    this.arpStep = 0;
    this.windGain = null;
    this.windFilter = null;
  }

  init() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();

    // Master brickwall limiter + warm compressor
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

    // Warm Provençal Valley Echo Bus
    this.echoIn = this.ctx.createGain();
    this.echoIn.gain.value = 0.28;
    const delay = this.ctx.createDelay(1.0);
    delay.delayTime.value = 0.31;
    const fb = this.ctx.createGain();
    fb.gain.value = 0.34;
    const dampLP = this.ctx.createBiquadFilter();
    dampLP.type = 'lowpass';
    dampLP.frequency.value = 2100;

    this.echoIn.connect(delay);
    delay.connect(dampLP);
    dampLP.connect(fb);
    fb.connect(delay);
    dampLP.connect(this.master);

    // Shared 2-second pink-ish noise buffer for breeze, brush & hoof splashes
    const len = this.ctx.sampleRate * 2;
    this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = this.noiseBuf.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      b0 = 0.997 * b0 + w * 0.029;
      b1 = 0.985 * b1 + w * 0.032;
      b2 = 0.950 * b2 + w * 0.048;
      data[i] = (b0 + b1 + b2 + w * 0.18) * 0.9;
    }

    // Gentle continuous Provençal night breeze
    const windSrc = this.ctx.createBufferSource();
    windSrc.buffer = this.noiseBuf;
    windSrc.loop = true;
    this.windFilter = this.ctx.createBiquadFilter();
    this.windFilter.type = 'bandpass';
    this.windFilter.frequency.value = 340;
    this.windFilter.Q.value = 1.6;
    this.windGain = this.ctx.createGain();
    this.windGain.gain.value = 0.035;
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

  // Warm plucked acoustic guitar / lute string
  playPluck(freq, dur = 1.1, vel = 0.14) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const osc1 = this.ctx.createOscillator();
    const osc2 = this.ctx.createOscillator();
    osc1.type = 'triangle';
    osc2.type = 'sawtooth';
    osc1.frequency.value = freq;
    osc2.frequency.value = freq * 1.0015;

    const flt = this.ctx.createBiquadFilter();
    flt.type = 'lowpass';
    flt.frequency.setValueAtTime(freq * 5.2, t);
    flt.frequency.exponentialRampToValueAtTime(Math.max(240, freq * 1.3), t + dur * 0.75);

    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vel, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0008, t + dur);

    const mix2 = this.ctx.createGain();
    mix2.gain.value = 0.28;

    osc1.connect(flt);
    osc2.connect(mix2);
    mix2.connect(flt);
    flt.connect(g);
    g.connect(this.master);
    g.connect(this.echoIn);

    osc1.start(t);
    osc2.start(t);
    osc1.stop(t + dur + 0.04);
    osc2.stop(t + dur + 0.04);
  }

  // Expressive bowed Solo Cello note with vibrato
  playCello(freq, dur = 1.9, vel = 0.11) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.value = freq;

    const lfo = this.ctx.createOscillator();
    const lfoGain = this.ctx.createGain();
    lfo.frequency.value = 5.1;
    lfoGain.gain.value = freq * 0.0075;
    lfo.connect(lfoGain);
    lfoGain.connect(osc.frequency);

    const body = this.ctx.createBiquadFilter();
    body.type = 'lowpass';
    body.frequency.value = 640;
    body.Q.value = 1.3;

    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vel, t + 0.26);
    g.gain.setValueAtTime(vel * 0.85, t + dur * 0.65);
    g.gain.exponentialRampToValueAtTime(0.0008, t + dur);

    osc.connect(body);
    body.connect(g);
    g.connect(this.master);
    g.connect(this.echoIn);

    osc.start(t);
    lfo.start(t);
    osc.stop(t + dur + 0.05);
    lfo.stop(t + dur + 0.05);
  }

  // Shimmering Celesta / Music-box chime when collecting a Star-Seed
  playStarChime(combo = 0) {
    if (!this.ctx) return;
    // D Lydian luminous intervals (D5, E5, F#5, G#5, A5, B5, C#6, D6, F#6)
    const scale = [587.33, 659.25, 739.99, 830.61, 880.0, 987.77, 1108.73, 1174.66, 1479.98];
    const f = scale[combo % scale.length];
    const t = this.ctx.currentTime;

    const o1 = this.ctx.createOscillator();
    const o2 = this.ctx.createOscillator();
    o1.type = 'sine';
    o2.type = 'triangle';
    o1.frequency.value = f;
    o2.frequency.value = f * 2.0;

    const g1 = this.ctx.createGain();
    const g2 = this.ctx.createGain();
    g1.gain.setValueAtTime(0.0001, t);
    g1.gain.linearRampToValueAtTime(0.18, t + 0.006);
    g1.gain.exponentialRampToValueAtTime(0.0008, t + 0.85);

    g2.gain.setValueAtTime(0.0001, t);
    g2.gain.linearRampToValueAtTime(0.05, t + 0.004);
    g2.gain.exponentialRampToValueAtTime(0.0005, t + 0.28);

    o1.connect(g1);
    o2.connect(g2);
    g1.connect(this.master);
    g1.connect(this.echoIn);
    g2.connect(this.master);

    o1.start(t);
    o2.start(t);
    o1.stop(t + 0.9);
    o2.stop(t + 0.32);
  }

  // Sweeping Orchestral Harp Glissando on Constellation Ignition!
  playConstellationHarp() {
    if (!this.ctx) return;
    const notes = [293.66, 329.63, 369.99, 440.0, 493.88, 587.33, 659.25, 739.99, 880.0, 1174.66];
    notes.forEach((f, idx) => {
      setTimeout(() => {
        this.playPluck(f, 1.65, 0.14);
      }, idx * 46);
    });
    this.playCello(146.83, 2.6, 0.14);
  }

  // Ascending triad chime when leaping through a Golden Sky-Hoop
  playHoopBoost() {
    if (!this.ctx) return;
    [587.33, 739.99, 880.0, 1174.66].forEach((f, i) => {
      setTimeout(() => this.playPluck(f, 0.95, 0.15), i * 38);
    });
    this.playDashBrush();
  }

  // Wide oil-paintbrush swoosh + starlight harmonic shimmer
  playDashBrush() {
    if (!this.ctx || !this.noiseBuf) return;
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(420, t);
    bp.frequency.exponentialRampToValueAtTime(1650, t + 0.24);
    bp.frequency.exponentialRampToValueAtTime(520, t + 0.52);
    bp.Q.value = 1.8;

    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.001, t);
    g.gain.linearRampToValueAtTime(0.22, t + 0.06);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.55);

    src.connect(bp);
    bp.connect(g);
    g.connect(this.master);
    g.connect(this.echoIn);
    src.start(t);
    src.stop(t + 0.58);

    this.playPluck(880, 0.65, 0.08);
  }

  // Cathartic paint-burst chord when shattering an Ink-Whirlwind
  playPurifyGloom() {
    if (!this.ctx) return;
    [440.0, 554.37, 659.25, 880.0].forEach((f, idx) => {
      setTimeout(() => this.playPluck(f, 1.1, 0.14), idx * 24);
    });
  }

  // Soft warning thud if grazing an Ink-Whirlwind without dashing
  playGloomBump() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(135, t);
    o.frequency.exponentialRampToValueAtTime(48, t + 0.32);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.24, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.34);
    o.connect(g);
    g.connect(this.master);
    o.start(t);
    o.stop(t + 0.36);
  }

  // 4-Beat Equine Hoofbeat Foley (Meadow, Wheat, Stone Bridge, Shallow River)
  playHoof(surface = 'meadow', speedNorm = 0.7, beatIdx = 0) {
    if (!this.ctx || !this.noiseBuf) return;
    const t = this.ctx.currentTime;
    const vol = (0.07 + speedNorm * 0.11) * (beatIdx === 0 || beatIdx === 2 ? 1.0 : 0.82);

    if (surface === 'bridge') {
      // Crisp cobblestone clip-clop resonance
      const o = this.ctx.createOscillator();
      o.type = 'triangle';
      const pitch = beatIdx % 2 === 0 ? 520 : 640;
      o.frequency.setValueAtTime(pitch, t);
      o.frequency.exponentialRampToValueAtTime(190, t + 0.055);
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(vol * 1.15, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.065);
      o.connect(g);
      g.connect(this.master);
      o.start(t);
      o.stop(t + 0.07);
      return;
    }

    if (surface === 'water') {
      // Shallow starlit river splash
      const src = this.ctx.createBufferSource();
      src.buffer = this.noiseBuf;
      const bp = this.ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 1150 + Math.random() * 350;
      bp.Q.value = 1.1;
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(vol * 1.25, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
      src.connect(bp);
      bp.connect(g);
      g.connect(this.master);
      src.start(t, Math.random() * 0.5, 0.18);
      return;
    }

    // Soft earthy Provençal turf thud (+ wheat stalk swish)
    const o = this.ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(125 + (beatIdx % 2) * 18, t);
    o.frequency.exponentialRampToValueAtTime(44, t + 0.075);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol * 1.1, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.085);
    o.connect(g);
    g.connect(this.master);
    o.start(t);
    o.stop(t + 0.09);

    if (surface === 'wheat') {
      const src = this.ctx.createBufferSource();
      src.buffer = this.noiseBuf;
      const hp = this.ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 2200;
      const wg = this.ctx.createGain();
      wg.gain.setValueAtTime(vol * 0.42, t);
      wg.gain.exponentialRampToValueAtTime(0.001, t + 0.11);
      src.connect(hp);
      hp.connect(wg);
      wg.connect(this.master);
      src.start(t, Math.random() * 0.5, 0.12);
    }
  }

  // Generative Nocturne Soundtrack that responds to gallop velocity & lit constellations
  update(dt, speedNorm, litCount, active) {
    if (!this.ctx) return;

    // Modulate night wind with horse gallop speed
    if (this.windGain && this.windFilter) {
      const targetGain = active ? 0.03 + speedNorm * 0.085 : 0.025;
      const targetFreq = 310 + speedNorm * 480;
      this.windGain.gain.setTargetAtTime(targetGain, this.ctx.currentTime, 0.12);
      this.windFilter.frequency.setTargetAtTime(targetFreq, this.ctx.currentTime, 0.12);
    }

    if (!active) return;

    const tempo = lerpTempo(0.36, 0.24, speedNorm);
    this.stepTimer -= dt;
    if (this.stepTimer <= 0) {
      this.stepTimer = tempo;
      // 4-chord Provençal nocturne progression: Dmaj9 -> Bm7 -> Gmaj7(#11) -> A6
      const chords = [
        [146.83, 220.0, 293.66, 369.99, 440.0, 659.25],
        [123.47, 185.0, 246.94, 329.63, 369.99, 587.33],
        [196.0, 246.94, 293.66, 369.99, 440.0, 659.25],
        [110.0, 220.0, 277.18, 329.63, 440.0, 554.37],
      ];
      const bar = Math.floor(this.arpStep / 6) % chords.length;
      const idx = this.arpStep % 6;
      const pattern = [0, 2, 3, 5, 3, 4];
      const note = chords[bar][pattern[idx]];
      this.playPluck(note, 1.05, 0.065 + speedNorm * 0.035);

      // Warm Solo Cello enters on downbeats when galloping or after lighting constellations!
      if (idx === 0 && (litCount >= 1 || speedNorm > 0.35)) {
        const celloLine = [293.66, 246.94, 196.0, 220.0];
        this.playCello(celloLine[bar] * 0.5, tempo * 5.6, 0.075 + litCount * 0.01);
      }
      this.arpStep++;
    }
  }
}

function lerpTempo(a, b, t) {
  return a + (b - a) * Math.max(0, Math.min(1, t));
}
