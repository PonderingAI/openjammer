/**
 * SmplrAdapter - Adapter for smplr library (Versilian strings)
 */

import { Versilian } from 'smplr';
import { SampledInstrument } from './SampledInstrument';
import { getAudioContext } from '../AudioEngine';

type VersilianInstrumentName = 'cello' | 'violin' | 'viola' | 'double-bass';

export class SmplrInstrument extends SampledInstrument {
  private sampler: Versilian | null = null;
  private instrumentName: VersilianInstrumentName;

  constructor(instrument: VersilianInstrumentName) {
    super();
    this.instrumentName = instrument;
  }

  protected async loadSamples(): Promise<void> {
    const ctx = getAudioContext();
    if (!ctx || !this.outputNode) throw new Error('AudioContext not available');

    // Create Versilian sampler with instrument name and destination
    this.sampler = new Versilian(ctx, {
      instrument: this.instrumentName,
      destination: this.outputNode
    });

    // Wait for samples to load
    await this.sampler.load;
  }

  protected playNoteImpl(note: string, velocity: number = 0.8): void {
    if (!this.sampler) return;

    this.sampler.start({ note, velocity });
    this.activeNotes.set(note, true);
  }

  protected stopNoteImpl(note: string): void {
    if (!this.sampler) return;

    this.sampler.stop(note);
    this.activeNotes.delete(note);
  }
}
