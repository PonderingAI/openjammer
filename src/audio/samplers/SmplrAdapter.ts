/**
 * SmplrAdapter - Adapter for smplr library (Versilian strings)
 */

import { Versilian } from 'smplr';
import { SampledInstrument } from './SampledInstrument';
import { getAudioContext } from '../AudioEngine';

type VersilianInstrumentName = 'cello' | 'violin' | 'viola' | 'double-bass';

interface NoteHandle {
  gainNode: GainNode;
  scheduledStop?: number;
}

export class SmplrInstrument extends SampledInstrument {
  private sampler: Versilian | null = null;
  private instrumentName: VersilianInstrumentName;
  private noteHandles: Map<string, NoteHandle> = new Map();
  private smplrOutput: GainNode | null = null;

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
    const ctx = getAudioContext();
    if (!this.sampler || !ctx || !this.smplrOutput) return;

    // Stop existing note if playing
    if (this.noteHandles.has(note)) {
      this.stopNoteImpl(note);
    }

    // Create per-note gain envelope for manual release control
    const noteGain = ctx.createGain();
    noteGain.gain.value = 1;
    noteGain.connect(this.smplrOutput);

    // Start the note through smplr
    this.sampler.start({ note, velocity });

    // Store handle for release
    this.noteHandles.set(note, { gainNode: noteGain });
    this.activeNotes.set(note, true);
  }

  protected stopNoteImpl(note: string): void {
    const ctx = getAudioContext();
    if (!this.sampler || !ctx) return;

    const handle = this.noteHandles.get(note);

    if (handle && !handle.scheduledStop) {
      const now = ctx.currentTime;

      // Use setTargetAtTime for natural bowed string release
      // Time constant of 0.10s for strings
      const timeConstant = 0.10;
      handle.gainNode.gain.setValueAtTime(handle.gainNode.gain.value, now);
      handle.gainNode.gain.setTargetAtTime(0, now, timeConstant);

      // Stop smplr note after 5x time constant (99% decay)
      const cleanupTime = timeConstant * 5 * 1000; // Convert to ms
      handle.scheduledStop = window.setTimeout(() => {
        this.sampler?.stop(note);
        handle.gainNode.disconnect();
        this.noteHandles.delete(note);
      }, cleanupTime);
    }

    this.activeNotes.delete(note);
  }

  disconnect(): void {
    // Stop all notes and clear handles
    this.noteHandles.forEach(handle => {
      if (handle.scheduledStop) {
        clearTimeout(handle.scheduledStop);
      }
      handle.gainNode.disconnect();
    });
    this.noteHandles.clear();

    if (this.smplrOutput) {
      this.smplrOutput.disconnect();
      this.smplrOutput = null;
    }

    super.disconnect();
  }
}
