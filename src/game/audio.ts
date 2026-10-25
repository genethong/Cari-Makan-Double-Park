export class AudioBus {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private sfx: GainNode | null = null;
  private music: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private drone = false;
  muted = false;
  private blip = 0;

  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AC({ latencyHint: "interactive" });
      this.master = this.ctx.createGain();
      this.sfx = this.ctx.createGain();
      this.music = this.ctx.createGain();
      this.sfx.gain.value = 0.9;
      this.music.gain.value = 0.8;
      this.master.gain.value = this.muted ? 0 : 1;
      this.sfx.connect(this.master);
      this.music.connect(this.master);
      this.master.connect(this.ctx.destination);
      const n = this.ctx.createBuffer(1, this.ctx.sampleRate * 0.4, this.ctx.sampleRate);
      const data = n.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
      this.noise = n;
    }
    if (this.ctx.state === "suspended") void this.ctx.resume();
    this.ensureDrone();
  }

  setMuted(muted: boolean) {
    this.muted = muted;
    if (!this.ctx || !this.master) return;
    this.master.gain.setTargetAtTime(muted ? 0 : 1, this.ctx.currentTime, 0.03);
  }

  tick(dt: number) {
    if (!this.ctx || this.muted) return;
    this.blip += dt;
    if (this.blip > 2.4) {
      this.blip = 0;
      const notes = [196, 247, 294, 330, 392];
      this.tone(notes[Math.floor(Math.random() * notes.length)] ?? 294, 0.22, "triangle", 0.012, true);
    }
  }

  private ensureDrone() {
    if (this.drone || !this.ctx || !this.music) return;
    this.drone = true;
    for (const freq of [82, 164]) {
      const o = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      o.type = "sine";
      o.frequency.value = freq;
      g.gain.value = freq < 100 ? 0.018 : 0.01;
      o.connect(g);
      g.connect(this.music);
      o.start();
    }
  }

  private tone(freq: number, dur: number, type: OscillatorType, gain: number, musical = false) {
    if (!this.ctx || !this.sfx || !this.music) return;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.value = freq * (musical ? 1 : 1 + (Math.random() - 0.5) * 0.03);
    const now = this.ctx.currentTime;
    g.gain.setValueAtTime(Math.max(0.0001, gain), now);
    g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
    o.connect(g);
    g.connect(musical ? this.music : this.sfx);
    o.start(now);
    o.stop(now + dur + 0.02);
  }

  private burst(dur: number, gain: number, rate = 1) {
    if (!this.ctx || !this.sfx || !this.noise) return;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    src.playbackRate.value = rate;
    const filter = this.ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 420;
    const g = this.ctx.createGain();
    const now = this.ctx.currentTime;
    g.gain.setValueAtTime(gain, now);
    g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
    src.connect(filter);
    filter.connect(g);
    g.connect(this.sfx);
    src.start(now);
    src.stop(now + dur + 0.02);
  }

  slide(heavy: boolean) {
    this.burst(heavy ? 0.18 : 0.1, heavy ? 0.08 : 0.05, heavy ? 0.45 : 0.8);
    this.tone(heavy ? 90 : 140, 0.08, "sine", 0.03);
  }

  bump(heavy: boolean) {
    this.burst(0.14, heavy ? 0.16 : 0.1, 0.35);
    this.tone(heavy ? 70 : 96, 0.12, "square", 0.04);
  }

  honk(id: string) {
    if (id === "horn-woi") {
      this.tone(210, 0.13, "sawtooth", 0.06);
      window.setTimeout(() => this.tone(150, 0.16, "square", 0.045), 90);
      return;
    }
    if (id === "horn-mamak") {
      this.tone(392, 0.09, "square", 0.05);
      window.setTimeout(() => this.tone(523, 0.1, "square", 0.045), 110);
      window.setTimeout(() => this.tone(392, 0.14, "triangle", 0.04), 220);
      return;
    }
    if (id === "horn-chime") {
      [784, 659, 587, 523].forEach((f, i) => {
        window.setTimeout(() => this.tone(f, 0.14, "sine", 0.04), i * 95);
      });
      return;
    }
    this.tone(466, 0.09, "square", 0.05);
    window.setTimeout(() => this.tone(440, 0.12, "square", 0.04), 130);
  }

  digit() {
    this.tone(880, 0.06, "sine", 0.03);
  }

  wrong() {
    this.tone(140, 0.16, "sawtooth", 0.04);
  }

  unlockCar() {
    this.tone(523, 0.08, "triangle", 0.04);
    window.setTimeout(() => this.tone(659, 0.1, "triangle", 0.04), 80);
    window.setTimeout(() => this.tone(784, 0.16, "sine", 0.04), 160);
  }

  kopi() {
    [660, 880, 1175].forEach((f, i) => {
      window.setTimeout(() => this.tone(f, 0.12, "sine", 0.035), i * 70);
    });
  }

  ping() {
    this.tone(784, 0.07, "sine", 0.03);
    window.setTimeout(() => this.tone(1046, 0.1, "sine", 0.028), 90);
  }

  saman() {
    this.tone(90, 0.22, "sawtooth", 0.06);
    this.burst(0.2, 0.08, 0.3);
  }

  win() {
    [523, 659, 784, 1046].forEach((f, i) => {
      window.setTimeout(() => this.tone(f, 0.16, "triangle", 0.04, true), i * 110);
    });
  }

  fail() {
    [392, 330, 262, 196].forEach((f, i) => {
      window.setTimeout(() => this.tone(f, 0.16, "sine", 0.035, true), i * 120);
    });
  }
}

export const audio = new AudioBus();
