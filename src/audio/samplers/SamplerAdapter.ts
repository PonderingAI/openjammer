/**
 * SamplerAdapter - Simplified pitch-shifting sampler instrument
 *
 * Takes an audio sample and plays it at different pitches based on
 * keyboard/MIDI input. Each key triggers the sample at a different pitch,
 * calculated relative to the root note.
 *
 * Features:
 * - Pitch shifting via playbackRate
 * - Simple attack/release envelope
 * - Polyphonic playback with voice stealing
 */

import { getAudioContext } from '../AudioEngine';
import { SampledInstrument } from './SampledInstrument';

export interface SamplerConfig {
  /** Root note (MIDI number) - the pitch at which sample plays at original speed */
  rootNote: number;
  /** Overall gain multiplier (0-2) */
  gain: number;
  /** Attack time in seconds (0.001-1) */
  attack: number;
  /** Release time in seconds (0.01-2) */
  release: number;
  /** Maximum simultaneous voices */
  maxVoices: number;
}

interface Voice {
  source: AudioBufferSourceNode;
  gainNode: GainNode;
  note: string;
  midiNote: number;
  startTime: number;
  isReleasing: boolean;
}

const DEFAULT_CONFIG: SamplerConfig = {
  rootNote: 60, // C4
  gain: 1.0,
  attack: 0.01,
  release: 0.1,
  maxVoices: 16,
};

export class SamplerAdapter extends SampledInstrument<Voice> {
  private buffer: AudioBuffer | null = null;
  private config: SamplerConfig;
  private voices: Map<string, Voice> = new Map();
  private voiceOrder: string[] = []; // For voice stealing (oldest first)

  constructor(initialConfig: Partial<SamplerConfig> = {}) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...initialConfig };
  }

  // ============================================================
  // Buffer Management
  // ============================================================

  /**
   * Set the audio buffer to use for playback.
   * Pass null to clear the buffer.
   */
  setBuffer(buffer: AudioBuffer | null): void {
    // Stop all playing voices before changing buffer (fixes memory leak I5)
    if (this.buffer !== buffer) {
      this.stopAllNotes();
    }
    this.buffer = buffer;
    this.setLoadingState(buffer ? 'loaded' : 'idle');
  }

  /**
   * Get the current buffer
   */
  getBuffer(): AudioBuffer | null {
    return this.buffer;
  }

  /**
   * Check if a sample is loaded
   */
  hasSample(): boolean {
    return this.buffer !== null;
  }

  /**
   * Get buffer duration in seconds
   */
  getDuration(): number {
    return this.buffer?.duration ?? 0;
  }

  // ============================================================
  // Configuration
  // ============================================================

  /**
   * Set the root note (the pitch at which sample plays at original speed)
   */
  setRootNote(midiNote: number): void {
    this.config.rootNote = Math.max(0, Math.min(127, midiNote));
  }

  getRootNote(): number {
    return this.config.rootNote;
  }

  /**
   * Set overall gain
   */
  setGain(gain: number): void {
    this.config.gain = Math.max(0, Math.min(2, gain));
  }

  getGain(): number {
    return this.config.gain;
  }

  /**
   * Set attack time
   */
  setAttack(attack: number): void {
    this.config.attack = Math.max(0.001, Math.min(1, attack));
  }

  getAttack(): number {
    return this.config.attack;
  }

  /**
   * Set release time
   */
  setRelease(release: number): void {
    this.config.release = Math.max(0.01, Math.min(2, release));
  }

  getRelease(): number {
    return this.config.release;
  }

  /**
   * Set maximum polyphony
   */
  setPolyphony(maxVoices: number): void {
    this.config.maxVoices = Math.max(1, Math.min(64, maxVoices));
  }

  /**
   * Get full config
   */
  getConfig(): SamplerConfig {
    return { ...this.config };
  }

  /**
   * Update config
   */
  updateConfig(updates: Partial<SamplerConfig>): void {
    this.config = { ...this.config, ...updates };
  }

  // ============================================================
  // SampledInstrument Implementation
  // ============================================================

  protected async loadSamples(): Promise<void> {
    // SamplerAdapter loads samples externally via setBuffer()
    if (this.buffer) {
      return Promise.resolve();
    }
    return Promise.resolve();
  }

  protected playNoteImpl(note: string, velocity: number = 0.8): void {
    if (!this.buffer) {
      console.warn('[SamplerAdapter] playNote called but no buffer loaded - drop a sample first');
      return;
    }
    if (!this.outputNode) {
      console.warn('[SamplerAdapter] playNote called but outputNode not initialized');
      return;
    }

    const ctx = getAudioContext();
    if (!ctx) {
      console.warn('[SamplerAdapter] playNote called but AudioContext not available');
      return;
    }

    // Voice stealing if at max polyphony
    while (this.voices.size >= this.config.maxVoices) {
      this.stealOldestVoice();
    }

    // Calculate pitch
    const midiNote = this.noteToMidi(note);
    const playbackRate = this.calculatePlaybackRate(midiNote);

    // Create audio nodes
    const source = ctx.createBufferSource();
    source.buffer = this.buffer;
    source.playbackRate.value = playbackRate;

    // Create gain node for envelope
    const gainNode = ctx.createGain();
    gainNode.gain.value = 0;

    // Connect nodes
    source.connect(gainNode);
    gainNode.connect(this.outputNode);

    const now = ctx.currentTime;
    const targetGain = velocity * this.config.gain;

    // Attack: ramp from near-zero to target (avoid click from true zero start)
    gainNode.gain.setValueAtTime(0.001, now);
    gainNode.gain.linearRampToValueAtTime(targetGain, now + this.config.attack);

    // Create voice record
    const voice: Voice = {
      source,
      gainNode,
      note,
      midiNote,
      startTime: now,
      isReleasing: false,
    };

    // Register voice BEFORE starting playback to prevent race condition
    // where playNoteImpl could be called again before registration
    this.voices.set(note, voice);
    this.voiceOrder.push(note);
    this.activeNotes.set(note, voice);

    // Auto-stop when sample ends (set before start)
    source.onended = () => {
      this.cleanupVoice(note);
    };

    // Start playback (after registration)
    source.start();
  }

  protected stopNoteImpl(note: string): void {
    const voice = this.voices.get(note);
    if (!voice || voice.isReleasing) return;

    const ctx = getAudioContext();
    if (!ctx) return;

    voice.isReleasing = true;

    const now = ctx.currentTime;
    const { release } = this.config;

    // Release: exponential decay to 0
    voice.gainNode.gain.cancelScheduledValues(now);
    voice.gainNode.gain.setValueAtTime(voice.gainNode.gain.value, now);
    voice.gainNode.gain.setTargetAtTime(0, now, release / 3);

    // Schedule cleanup after release (5 time constants)
    const cleanupDelay = release * 5 * 1000;
    this.scheduleCleanup(() => {
      this.cleanupVoice(note);
    }, cleanupDelay);
  }

  // ============================================================
  // Private Helpers
  // ============================================================

  /**
   * Calculate playback rate for pitch shifting
   * Formula: rate = 2^((targetNote - rootNote) / 12)
   */
  private calculatePlaybackRate(targetMidiNote: number): number {
    return Math.pow(2, (targetMidiNote - this.config.rootNote) / 12);
  }

  /**
   * Steal the oldest playing voice
   */
  private stealOldestVoice(): void {
    if (this.voiceOrder.length === 0) return;

    const oldestNote = this.voiceOrder.shift();
    if (oldestNote) {
      this.forceStopVoice(oldestNote);
    }
  }

  /**
   * Force stop a voice immediately (for voice stealing)
   */
  private forceStopVoice(note: string): void {
    const voice = this.voices.get(note);
    if (!voice) return;

    const ctx = getAudioContext();
    if (!ctx) return;

    // Quick fade out to avoid clicks
    const now = ctx.currentTime;
    voice.gainNode.gain.cancelScheduledValues(now);
    voice.gainNode.gain.setValueAtTime(voice.gainNode.gain.value, now);
    voice.gainNode.gain.linearRampToValueAtTime(0, now + 0.01);

    // Stop after fade
    try {
      voice.source.stop(now + 0.02);
    } catch {
      // Already stopped
    }

    // Schedule cleanup
    this.scheduleCleanup(() => {
      this.cleanupVoice(note);
    }, 30);
  }

  /**
   * Clean up a voice after it's done
   */
  private cleanupVoice(note: string): void {
    const voice = this.voices.get(note);
    if (!voice) return;

    try {
      voice.source.disconnect();
      voice.gainNode.disconnect();
    } catch {
      // Already disconnected
    }

    this.voices.delete(note);
    this.activeNotes.delete(note);
    this.voiceOrder = this.voiceOrder.filter(n => n !== note);
  }

  // ============================================================
  // Public Methods
  // ============================================================

  /**
   * Stop all voices
   */
  stopAllNotes(): void {
    const notes = Array.from(this.voices.keys());
    notes.forEach(note => this.forceStopVoice(note));
    this.voices.clear();
    this.voiceOrder = [];
    super.stopAllNotes();
  }

  /**
   * Disconnect and cleanup
   */
  disconnect(): void {
    this.stopAllNotes();
    this.buffer = null;
    super.disconnect();
  }

  /**
   * Get active voice count
   */
  getActiveVoiceCount(): number {
    return this.voices.size;
  }

  /**
   * Check if a specific note is playing
   */
  isNotePlaying(note: string): boolean {
    return this.voices.has(note) && !this.voices.get(note)!.isReleasing;
  }
}

// Factory function
export function createSamplerAdapter(config?: Partial<SamplerConfig>): SamplerAdapter {
  return new SamplerAdapter(config);
}
