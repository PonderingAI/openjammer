/**
 * SampledInstrument - Abstract base class for sample-based instruments
 *
 * Handles async loading with a synchronous playNote() API by queuing notes
 * until samples are loaded.
 */

import { getAudioContext, getMasterGain } from '../AudioEngine';
import type { LoadingState } from './types';

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

  disconnect(): void {
    this.stopAllNotes();
    if (this.outputNode) {
      this.outputNode.disconnect();
      this.outputNode = null;
    }
  }
}
