type SoundEffect =
  | "ui"
  | "copy"
  | "guess"
  | "ai_guess"
  | "round_start"
  | "humans_win"
  | "ai_win";

type AudioPreferenceKey = "music" | "sfx";

const AUDIO_STORAGE_PREFIX = "skribbl-ai:audio";
const MUSIC_LOOP: Array<{ note: number; harmony?: number; bass?: number }> = [
  { note: 392.0, harmony: 523.25, bass: 130.81 },
  { note: 440.0 },
  { note: 523.25, harmony: 659.25, bass: 146.83 },
  { note: 440.0 },
  { note: 392.0, harmony: 523.25, bass: 130.81 },
  { note: 349.23 },
  { note: 329.63, harmony: 493.88, bass: 123.47 },
  { note: 293.66 }
];

class AudioEngine {
  private context: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private musicGain: GainNode | null = null;
  private sfxGain: GainNode | null = null;
  private musicTimer: number | null = null;
  private musicStep = 0;
  private musicEnabled: boolean;
  private sfxEnabled: boolean;

  constructor() {
    this.musicEnabled = readPreference("music", true);
    this.sfxEnabled = readPreference("sfx", true);
  }

  getMusicEnabled(): boolean {
    return this.musicEnabled;
  }

  getSfxEnabled(): boolean {
    return this.sfxEnabled;
  }

  async unlock(): Promise<void> {
    const context = this.ensureContext();
    if (!context) {
      return;
    }

    if (context.state === "suspended") {
      await context.resume();
    }

    if (this.musicEnabled) {
      this.startMusic();
    }
  }

  setMusicEnabled(enabled: boolean): boolean {
    this.musicEnabled = enabled;
    writePreference("music", enabled);
    if (!enabled) {
      this.stopMusic();
      return this.musicEnabled;
    }

    void this.unlock();
    return this.musicEnabled;
  }

  setSfxEnabled(enabled: boolean): boolean {
    this.sfxEnabled = enabled;
    writePreference("sfx", enabled);
    return this.sfxEnabled;
  }

  play(effect: SoundEffect): void {
    if (!this.sfxEnabled) {
      return;
    }

    const context = this.ensureContext();
    if (!context || context.state !== "running" || !this.sfxGain) {
      return;
    }

    switch (effect) {
      case "ui":
        this.playTone(context.currentTime, 660, 0.1, "triangle", 0.08, this.sfxGain);
        this.playTone(context.currentTime + 0.06, 880, 0.1, "sine", 0.05, this.sfxGain);
        break;
      case "copy":
        this.playTone(context.currentTime, 740, 0.12, "triangle", 0.08, this.sfxGain);
        this.playTone(context.currentTime + 0.08, 988, 0.12, "triangle", 0.06, this.sfxGain);
        break;
      case "guess":
        this.playTone(context.currentTime, 415.3, 0.11, "triangle", 0.08, this.sfxGain);
        this.playTone(context.currentTime + 0.08, 554.37, 0.12, "sine", 0.06, this.sfxGain);
        break;
      case "ai_guess":
        this.playTone(context.currentTime, 220, 0.12, "square", 0.06, this.sfxGain);
        this.playTone(context.currentTime + 0.08, 277.18, 0.12, "square", 0.05, this.sfxGain);
        break;
      case "round_start":
        this.playTone(context.currentTime, 523.25, 0.1, "triangle", 0.08, this.sfxGain);
        this.playTone(context.currentTime + 0.07, 659.25, 0.1, "triangle", 0.07, this.sfxGain);
        this.playTone(context.currentTime + 0.14, 783.99, 0.14, "triangle", 0.08, this.sfxGain);
        break;
      case "humans_win":
        this.playTone(context.currentTime, 523.25, 0.12, "triangle", 0.09, this.sfxGain);
        this.playTone(context.currentTime + 0.08, 659.25, 0.12, "triangle", 0.08, this.sfxGain);
        this.playTone(context.currentTime + 0.16, 783.99, 0.18, "triangle", 0.09, this.sfxGain);
        this.playTone(context.currentTime + 0.26, 1046.5, 0.2, "sine", 0.07, this.sfxGain);
        break;
      case "ai_win":
        this.playTone(context.currentTime, 466.16, 0.16, "sawtooth", 0.06, this.sfxGain);
        this.playTone(context.currentTime + 0.1, 392.0, 0.16, "sawtooth", 0.05, this.sfxGain);
        this.playTone(context.currentTime + 0.2, 311.13, 0.2, "square", 0.05, this.sfxGain);
        break;
      default:
        break;
    }
  }

  private ensureContext(): AudioContext | null {
    if (typeof window === "undefined") {
      return null;
    }

    if (this.context) {
      return this.context;
    }

    const AudioContextConstructor =
      window.AudioContext ??
      (window as Window & typeof globalThis & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;

    if (!AudioContextConstructor) {
      return null;
    }

    this.context = new AudioContextConstructor();
    this.masterGain = this.context.createGain();
    this.musicGain = this.context.createGain();
    this.sfxGain = this.context.createGain();
    this.masterGain.gain.value = 0.78;
    this.musicGain.gain.value = 0.04;
    this.sfxGain.gain.value = 0.18;
    this.musicGain.connect(this.masterGain);
    this.sfxGain.connect(this.masterGain);
    this.masterGain.connect(this.context.destination);
    return this.context;
  }

  private startMusic(): void {
    if (this.musicTimer !== null || !this.context || !this.musicGain) {
      return;
    }

    this.musicGain.gain.cancelScheduledValues(this.context.currentTime);
    this.musicGain.gain.setTargetAtTime(0.04, this.context.currentTime, 0.2);
    this.scheduleMusicBeat();
    this.musicTimer = window.setInterval(() => this.scheduleMusicBeat(), 720);
  }

  private stopMusic(): void {
    if (this.musicTimer !== null) {
      window.clearInterval(this.musicTimer);
      this.musicTimer = null;
    }

    if (this.context && this.musicGain) {
      this.musicGain.gain.cancelScheduledValues(this.context.currentTime);
      this.musicGain.gain.setTargetAtTime(0.0001, this.context.currentTime, 0.08);
    }
  }

  private scheduleMusicBeat(): void {
    if (!this.context || !this.musicGain) {
      return;
    }

    const step = MUSIC_LOOP[this.musicStep % MUSIC_LOOP.length]!;
    const now = this.context.currentTime;
    this.playTone(now, step.note, 0.34, "triangle", 0.28, this.musicGain);

    if (step.harmony) {
      this.playTone(now + 0.02, step.harmony, 0.28, "sine", 0.12, this.musicGain);
    }

    if (step.bass) {
      this.playTone(now, step.bass, 0.52, "sine", 0.12, this.musicGain);
    }

    this.musicStep += 1;
  }

  private playTone(
    startAt: number,
    frequency: number,
    duration: number,
    type: OscillatorType,
    volume: number,
    destination: GainNode
  ): void {
    if (!this.context) {
      return;
    }

    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, startAt);
    gain.gain.setValueAtTime(0.0001, startAt);
    gain.gain.linearRampToValueAtTime(volume, startAt + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, startAt + duration);
    oscillator.connect(gain);
    gain.connect(destination);
    oscillator.start(startAt);
    oscillator.stop(startAt + duration + 0.02);
  }
}

function readPreference(key: AudioPreferenceKey, fallback: boolean): boolean {
  if (typeof window === "undefined") {
    return fallback;
  }

  const stored = window.localStorage.getItem(`${AUDIO_STORAGE_PREFIX}:${key}`);
  if (stored === null) {
    return fallback;
  }

  return stored === "true";
}

function writePreference(key: AudioPreferenceKey, value: boolean): void {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(`${AUDIO_STORAGE_PREFIX}:${key}`, String(value));
}

export const audioEngine = new AudioEngine();
