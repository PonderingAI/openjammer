/**
 * SamplerAdapter - Pitch-shifting sampler instrument
 *
 * Takes an audio sample and plays it at different pitches based on
 * keyboard/MIDI input. Each key triggers the sample at a different pitch,
 * calculated relative to the root note.
 *
 * Features:
 * - Pitch shifting via playbackRate
 * - ADSR envelope with smooth automation
 * - Polyphonic playback with voice stealing
 * - Loop points support
 * - Velocity curve options
 */

import { getAudioContext } from '../AudioEngine';
import { SampledInstrument } from './SampledInstrument';
import type { VelocityCurve } from './types';

export interface SamplerConfig {
  /** Root note (MIDI number) - the pitch at which sample plays at original speed */
  rootNote: number;
  /** Attack time in seconds */
  attack: number;
  /** Decay time in seconds */
  decay: number;
  /** Sustain level (0-1) */
  sustain: number;
  /** Release time in seconds */
  release: number;
  /** Velocity response curve */
  velocityCurve: VelocityCurve;
  /** Maximum simultaneous voices */
  maxVoices: number;
  /** Enable sample looping */
  loopEnabled: boolean;
  /** Loop start point in seconds */
  loopStart: number;
  /** Loop end point in seconds (0 = end of sample) */
  loopEnd: number;
  /** Trigger mode */
  triggerMode: 'gate' | 'oneshot' | 'toggle';
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
  attack: 0.01,
  decay: 0.1,
  sustain: 0.8,
  release: 0.3,
  velocityCurve: 'exponential',
  maxVoices: 16,
  loopEnabled: false,
  loopStart: 0,
  loopEnd: 0,
  triggerMode: 'gate',
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
   * Set the audio buffer to use for playback
   */
  setBuffer(buffer: AudioBuffer): void {
    this.buffer = buffer;
    // Mark as loaded if we have a buffer
    if (buffer) {
      this.setLoadingState('loaded');
    }
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
   * Set ADSR envelope parameters
   */
  setADSR(attack: number, decay: number, sustain: number, release: number): void {
    this.config.attack = Math.max(0.001, attack);
    this.config.decay = Math.max(0.001, decay);
    this.config.sustain = Math.max(0, Math.min(1, sustain));
    this.config.release = Math.max(0.001, release);
  }

  getADSR(): { attack: number; decay: number; sustain: number; release: number } {
    return {
      attack: this.config.attack,
      decay: this.config.decay,
      sustain: this.config.sustain,
      release: this.config.release,
    };
  }

  /**
   * Set velocity curve
   */
  setVelocityCurve(curve: VelocityCurve): void {
    this.config.velocityCurve = curve;
  }

  /**
   * Set loop points
   */
  setLoopPoints(start: number, end: number): void {
    this.config.loopStart = Math.max(0, start);
    this.config.loopEnd = Math.max(0, end);
  }

  /**
   * Enable/disable looping
   */
  setLoopEnabled(enabled: boolean): void {
    this.config.loopEnabled = enabled;
  }

  /**
   * Set maximum polyphony
   */
  setPolyphony(maxVoices: number): void {
    this.config.maxVoices = Math.max(1, Math.min(64, maxVoices));
  }

  /**
   * Set trigger mode
   */
  setTriggerMode(mode: 'gate' | 'oneshot' | 'toggle'): void {
    this.config.triggerMode = mode;
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
    // This method is called by the base class but we handle loading differently
    if (this.buffer) {
      return Promise.resolve();
    }
    // If no buffer, we just resolve - the sampler will be silent until a buffer is set
    return Promise.resolve();
  }

  protected playNoteImpl(note: string, velocity: number = 0.8): void {
    if (!this.buffer || !this.outputNode) {
      return;
    }

    const ctx = getAudioContext();
    if (!ctx) return;

    // Handle toggle mode
    if (this.config.triggerMode === 'toggle' && this.voices.has(note)) {
      this.stopNoteImpl(note);
      return;
    }

    // Voice stealing if at max polyphony
    while (this.voices.size >= this.config.maxVoices) {
      this.stealOldestVoice();
    }

    // Calculate pitch
    const midiNote = this.noteToMidi(note);
    const playbackRate = this.calculatePlaybackRate(midiNote);

    // Apply velocity curve
    const adjustedVelocity = this.applyVelocityCurve(velocity, this.config.velocityCurve);

    // Create audio nodes
    const source = ctx.createBufferSource();
    source.buffer = this.buffer;
    source.playbackRate.value = playbackRate;

    // Configure looping
    if (this.config.loopEnabled) {
      source.loop = true;
      source.loopStart = this.config.loopStart;
      source.loopEnd = this.config.loopEnd > 0 ? this.config.loopEnd : this.buffer.duration;
    }

    // Create gain node for envelope
    const gainNode = ctx.createGain();
    gainNode.gain.value = 0;

    // Connect nodes
    source.connect(gainNode);
    gainNode.connect(this.outputNode);

    const now = ctx.currentTime;
    const { attack, decay, sustain } = this.config;

    // ADSR Attack phase
    gainNode.gain.setValueAtTime(0, now);
    gainNode.gain.linearRampToValueAtTime(adjustedVelocity, now + attack);

    // ADSR Decay phase (using setTargetAtTime for exponential decay)
    const sustainLevel = sustain * adjustedVelocity;
    gainNode.gain.setTargetAtTime(sustainLevel, now + attack, decay / 3);

    // Create voice record
    const voice: Voice = {
      source,
      gainNode,
      note,
      midiNote,
      startTime: now,
      isReleasing: false,
    };

    this.voices.set(note, voice);
    this.voiceOrder.push(note);
    this.activeNotes.set(note, voice);

    // Start playback
    source.start();

    // Handle oneshot mode - auto-stop when sample ends
    if (this.config.triggerMode === 'oneshot' && !this.config.loopEnabled) {
      source.onended = () => {
        this.cleanupVoice(note);
      };
    }
  }

  protected stopNoteImpl(note: string): void {
    const voice = this.voices.get(note);
    if (!voice || voice.isReleasing) return;

    // In oneshot mode, don't respond to stop
    if (this.config.triggerMode === 'oneshot') {
      return;
    }

    const ctx = getAudioContext();
    if (!ctx) return;

    voice.isReleasing = true;

    const now = ctx.currentTime;
    const { release } = this.config;

    // ADSR Release phase
    voice.gainNode.gain.cancelScheduledValues(now);
    voice.gainNode.gain.setValueAtTime(voice.gainNode.gain.value, now);
    voice.gainNode.gain.setTargetAtTime(0, now, release / 3);

    // Schedule cleanup after release
    const cleanupDelay = release * 5 * 1000; // 5 time constants in ms
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

    // Stop and cleanup
    try {
      voice.source.stop(now + 0.02);
    } catch {
      // Already stopped
    }

    this.cleanupVoice(note);
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
  // Public Overrides
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
