/**
 * SmplrAdapter - Adapter for smplr library (Versilian strings)
 */

import { Versilian } from 'smplr';
import { SampledInstrument } from './SampledInstrument';
import { getAudioContext } from '../AudioEngine';

type VersilianInstrumentName = 'cello' | 'violin' | 'viola' | 'double-bass';

interface NoteHandle {
  stopTimeout?: number;
}

export class SmplrInstrument extends SampledInstrument<boolean> {
  private sampler: Versilian | null = null;
  private instrumentName: VersilianInstrumentName;
  private noteHandles: Map<string, NoteHandle> = new Map();
  private smplrOutput: GainNode | null = null;
  private isDisconnected: boolean = false; // Prevent operations after disconnect

  constructor(instrument: VersilianInstrumentName) {
    super();
    this.instrumentName = instrument;
  }

  protected async loadSamples(): Promise<void> {
    const ctx = getAudioContext();
    if (!ctx || !this.outputNode) throw new Error('AudioContext not available');

    // Create intermediate gain node for smplr output
    this.smplrOutput = ctx.createGain();
    this.smplrOutput.gain.value = 1;
    this.smplrOutput.connect(this.outputNode);

    // Create Versilian sampler with intermediate destination
    this.sampler = new Versilian(ctx, {
      instrument: this.instrumentName,
      destination: this.smplrOutput
    });

    // Wait for samples to load
    await this.sampler.load;
  }

  protected playNoteImpl(note: string, velocity: number = 0.8): void {
    if (!this.sampler || !this.smplrOutput) return;

    // Stop existing note if playing
    const existingHandle = this.noteHandles.get(note);
    if (existingHandle?.stopTimeout) {
      clearTimeout(existingHandle.stopTimeout);
    }
    this.sampler.stop(note);

    // Start the note through smplr
    // smplr routes audio internally to smplrOutput (set in constructor)
    this.sampler.start({ note, velocity });

    // Store handle for release tracking
    this.noteHandles.set(note, {});
    this.activeNotes.set(note, true);
  }

  protected stopNoteImpl(note: string): void {
    if (!this.sampler || this.isDisconnected) return;

    const handle = this.noteHandles.get(note);
    if (!handle) {
      // No handle, just stop immediately
      this.sampler.stop(note);
      this.activeNotes.delete(note);
      return;
    }

    // Already scheduled stop? Skip
    if (handle.stopTimeout) {
      this.activeNotes.delete(note);
      return;
    }

    // Schedule stop with small delay to allow natural release
    // smplr's Versilian instruments have built-in release samples
    const releaseDelay = 100; // ms - short delay to trigger release sample
    handle.stopTimeout = window.setTimeout(() => {
      // Guard against operations after disconnect
      if (this.isDisconnected) return;
      this.sampler?.stop(note);
      this.noteHandles.delete(note);
    }, releaseDelay);

    this.activeNotes.delete(note);
  }

  disconnect(): void {
    // Mark as disconnected to prevent pending timeout operations
    this.isDisconnected = true;

    // Stop all notes and clear handles
    this.noteHandles.forEach(handle => {
      if (handle.stopTimeout) {
        clearTimeout(handle.stopTimeout);
      }
    });
    this.noteHandles.clear();

    if (this.smplrOutput) {
      this.smplrOutput.disconnect();
      this.smplrOutput = null;
    }

    super.disconnect();
  }
}
