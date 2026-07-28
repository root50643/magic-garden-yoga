type SoundName = "tap" | "countdown" | "go" | "progress" | "success" | "finish";

const SOUND_PATTERNS: Record<
  SoundName,
  Array<{ frequency: number; delay: number; duration: number; gain: number }>
> = {
  tap: [{ frequency: 520, delay: 0, duration: 0.08, gain: 0.04 }],
  countdown: [{ frequency: 440, delay: 0, duration: 0.12, gain: 0.055 }],
  go: [
    { frequency: 660, delay: 0, duration: 0.1, gain: 0.055 },
    { frequency: 880, delay: 0.1, duration: 0.16, gain: 0.05 },
  ],
  progress: [{ frequency: 720, delay: 0, duration: 0.05, gain: 0.025 }],
  success: [
    { frequency: 523.25, delay: 0, duration: 0.12, gain: 0.055 },
    { frequency: 659.25, delay: 0.1, duration: 0.12, gain: 0.052 },
    { frequency: 783.99, delay: 0.2, duration: 0.22, gain: 0.05 },
  ],
  finish: [
    { frequency: 523.25, delay: 0, duration: 0.14, gain: 0.05 },
    { frequency: 659.25, delay: 0.12, duration: 0.14, gain: 0.05 },
    { frequency: 783.99, delay: 0.24, duration: 0.14, gain: 0.05 },
    { frequency: 1046.5, delay: 0.38, duration: 0.35, gain: 0.045 },
  ],
};

export class GardenAudio {
  private context: AudioContext | null = null;
  private muted = false;

  constructor(enabled = true) {
    this.muted = !enabled;
  }

  get isMuted(): boolean {
    return this.muted;
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
  }

  toggleMuted(): boolean {
    this.muted = !this.muted;
    if (!this.muted) {
      this.play("tap");
    }
    return this.muted;
  }

  play(name: SoundName): void {
    if (this.muted || typeof window === "undefined") return;

    this.context ??= new AudioContext();
    if (this.context.state === "suspended") {
      void this.context.resume();
    }

    const now = this.context.currentTime;
    for (const note of SOUND_PATTERNS[name]) {
      const oscillator = this.context.createOscillator();
      const gain = this.context.createGain();
      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(note.frequency, now + note.delay);
      oscillator.frequency.exponentialRampToValueAtTime(
        note.frequency * 1.015,
        now + note.delay + note.duration,
      );
      gain.gain.setValueAtTime(0.0001, now + note.delay);
      gain.gain.exponentialRampToValueAtTime(note.gain, now + note.delay + 0.012);
      gain.gain.exponentialRampToValueAtTime(
        0.0001,
        now + note.delay + note.duration,
      );
      oscillator.connect(gain);
      gain.connect(this.context.destination);
      oscillator.start(now + note.delay);
      oscillator.stop(now + note.delay + note.duration + 0.02);
    }
  }
}
