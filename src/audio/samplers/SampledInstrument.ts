/**
 * SampledInstrument - Abstract base class for sample-based instruments
 *
 * Handles async loading with a synchronous playNote() API by queuing notes
 * until samples are loaded.
 */

import { getAudioContext, getMasterGain } from '../AudioEngine';
import type { LoadingState, VelocityCurve, EnvelopeConfig } from './types';

export abstract class SampledInstrument {
  protected loadingState: LoadingState = 'idle';
  protected outputNode: GainNode | null = null;
  protected pendingNotes: Array<{ note: string; velocity?: number }> = [];
  protected activeNotes: Map<string, unknown> = new Map();
  protected loadPromise: Promise<void> | null = null;
  protected onLoadingStateChange: ((state: LoadingState) => void) | null = null;

  constructor() {
    this.initOutput();
  }

  protected initOutput(): void {
    const ctx = getAudioContext();
    const master = getMasterGain();
    if (!ctx || !master) return;

    this.outputNode = ctx.createGain();
    this.outputNode.gain.value = 0.3;
    this.outputNode.connect(master);
  }

  // State accessors
  isLoaded(): boolean {
    return this.loadingState === 'loaded';
  }

  isLoading(): boolean {
    return this.loadingState === 'loading';
  }

  getLoadingState(): LoadingState {
    return this.loadingState;
  }

  setOnLoadingStateChange(cb: (state: LoadingState) => void): void {
    this.onLoadingStateChange = cb;
  }

  protected setLoadingState(state: LoadingState): void {
    this.loadingState = state;
    this.onLoadingStateChange?.(state);
  }

  // Abstract methods to implement
  protected abstract loadSamples(): Promise<void>;
  protected abstract playNoteImpl(note: string, velocity?: number): void;
  protected abstract stopNoteImpl(note: string): void;

  // Public async load
  async load(): Promise<void> {
    if (this.loadingState === 'loaded') return;
    if (this.loadPromise) return this.loadPromise;

    this.setLoadingState('loading');
    this.loadPromise = this.loadSamples()
      .then(() => {
        this.setLoadingState('loaded');
        // Play any pending notes
        this.pendingNotes.forEach(({ note, velocity }) => {
          this.playNoteImpl(note, velocity);
        });
        this.pendingNotes = [];
      })
      .catch((err) => {
        console.error('Failed to load instrument:', err);
        this.setLoadingState('error');
        this.pendingNotes = [];
      });

    return this.loadPromise;
  }

  // Synchronous public API - queues if not loaded
  playNote(note: string, velocity: number = 0.8): void {
    if (this.activeNotes.has(note)) return;

    if (this.loadingState === 'loaded') {
      this.triggerHaptic(velocity);
      this.playNoteImpl(note, velocity);
    } else if (this.loadingState === 'idle' || this.loadingState === 'loading') {
      // Queue note and trigger load
      this.pendingNotes.push({ note, velocity });
      if (this.loadingState === 'idle') {
        this.load(); // Fire and forget
      }
    }
    // If error state, silently ignore
  }

  stopNote(note: string): void {
    // Remove from pending if present
    this.pendingNotes = this.pendingNotes.filter(p => p.note !== note);

    if (this.activeNotes.has(note)) {
      this.triggerReleaseHaptic();
      this.stopNoteImpl(note);
    }
  }

  stopAllNotes(): void {
    this.pendingNotes = [];
    this.activeNotes.forEach((_, note) => this.stopNoteImpl(note));
  }

  getOutput(): GainNode | null {
    return this.outputNode;
  }

  // Helper methods for realistic instrument behavior

  protected applyVelocityCurve(velocity: number, curve: VelocityCurve = 'linear'): number {
    switch (curve) {
      case 'exponential':
        return Math.pow(velocity, 2); // More dynamic range
      case 'logarithmic':
        return Math.sqrt(velocity); // Compressed dynamics
      case 'linear':
      default:
        return velocity;
    }
  }

  protected getTimeConstantForNote(note: string, config?: EnvelopeConfig): number {
    if (!config) return 0.08; // Default medium release

    // Check if note falls within any defined range
    if (config.releaseTimeConstantByRange) {
      for (const range of config.releaseTimeConstantByRange) {
        if (this.isNoteInRange(note, range.minNote, range.maxNote)) {
          return range.timeConstant;
        }
      }
    }

    // Fall back to single time constant or default
    return config.releaseTimeConstant ?? 0.08;
  }

  private isNoteInRange(note: string, min: string, max: string): boolean {
    const midi = this.noteToMidi(note);
    const minMidi = this.noteToMidi(min);
    const maxMidi = this.noteToMidi(max);
    return midi >= minMidi && midi <= maxMidi;
  }

  protected noteToMidi(note: string): number {
    const noteMap: Record<string, number> = {
      'C': 0, 'C#': 1, 'Db': 1, 'D': 2, 'D#': 3, 'Eb': 3,
      'E': 4, 'F': 5, 'F#': 6, 'Gb': 6, 'G': 7, 'G#': 8,
      'Ab': 8, 'A': 9, 'A#': 10, 'Bb': 10, 'B': 11
    };

    const match = note.match(/^([A-G][#b]?)(\d+)$/i);
    if (!match) return 60; // Middle C fallback

    const [, noteName, octave] = match;
    return noteMap[noteName.toUpperCase()] + (parseInt(octave, 10) + 1) * 12;
  }

  // Haptic feedback for mobile devices
  private triggerHaptic(velocity: number): void {
    if (!('vibrate' in navigator)) return;

    // Intensity based on velocity (10-30ms)
    const duration = Math.floor(10 + velocity * 20);
    navigator.vibrate(duration);
  }

  private triggerReleaseHaptic(): void {
    if (!('vibrate' in navigator)) return;

    // Short tap-pause-tap for damper feel
    navigator.vibrate([3, 10, 3]);
  }

  disconnect(): void {
    this.stopAllNotes();
    if (this.outputNode) {
      this.outputNode.disconnect();
      this.outputNode = null;
    }
  }
}
