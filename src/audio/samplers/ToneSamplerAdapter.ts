/**
 * ToneSamplerAdapter - Adapter for Tone.js Sampler (Salamander piano, tonejs-instruments)
 */

import * as Tone from 'tone';
import { SampledInstrument } from './SampledInstrument';
import { getAudioContext } from '../AudioEngine';

interface SamplerUrls {
  [note: string]: string;
}

interface ToneSamplerConfig {
  urls: SamplerUrls;
  baseUrl: string;
  release?: number;
}

export class ToneSamplerInstrument extends SampledInstrument {
  private sampler: Tone.Sampler | null = null;
  private config: ToneSamplerConfig;
  private isContextSet: boolean = false;

  constructor(config: ToneSamplerConfig) {
    super();
    this.config = config;
  }

  protected async loadSamples(): Promise<void> {
    const ctx = getAudioContext();
    if (!ctx) throw new Error('AudioContext not available');

    // Set Tone.js to use our existing context (only once)
    if (!this.isContextSet) {
      Tone.setContext(ctx);
      this.isContextSet = true;
    }

    // Create sampler with onload callback for promise resolution
    return new Promise((resolve, reject) => {
      try {
        this.sampler = new Tone.Sampler({
          urls: this.config.urls,
          baseUrl: this.config.baseUrl,
          release: this.config.release ?? 1,
          onload: () => {
            // Connect to our output node
            if (this.outputNode && this.sampler) {
              this.sampler.disconnect();
              this.sampler.connect(this.outputNode);
            }
            resolve();
          },
          onerror: (err) => reject(err)
        });
      } catch (err) {
        reject(err);
      }
    });
  }

  protected playNoteImpl(note: string, velocity: number = 0.8): void {
    if (!this.sampler) return;

    this.sampler.triggerAttack(note, Tone.now(), velocity);
    this.activeNotes.set(note, true);
  }

  protected stopNoteImpl(note: string): void {
    if (!this.sampler) return;

    this.sampler.triggerRelease(note, Tone.now());
    this.activeNotes.delete(note);
  }
}

// Pre-configured Salamander Piano
export function createSalamanderPiano(): ToneSamplerInstrument {
  return new ToneSamplerInstrument({
    urls: {
      A0: 'A0.mp3', C1: 'C1.mp3', 'D#1': 'Ds1.mp3', 'F#1': 'Fs1.mp3',
      A1: 'A1.mp3', C2: 'C2.mp3', 'D#2': 'Ds2.mp3', 'F#2': 'Fs2.mp3',
      A2: 'A2.mp3', C3: 'C3.mp3', 'D#3': 'Ds3.mp3', 'F#3': 'Fs3.mp3',
      A3: 'A3.mp3', C4: 'C4.mp3', 'D#4': 'Ds4.mp3', 'F#4': 'Fs4.mp3',
      A4: 'A4.mp3', C5: 'C5.mp3', 'D#5': 'Ds5.mp3', 'F#5': 'Fs5.mp3',
      A5: 'A5.mp3', C6: 'C6.mp3', 'D#6': 'Ds6.mp3', 'F#6': 'Fs6.mp3',
      A6: 'A6.mp3', C7: 'C7.mp3', 'D#7': 'Ds7.mp3', 'F#7': 'Fs7.mp3',
      A7: 'A7.mp3', C8: 'C8.mp3'
    },
    baseUrl: 'https://tonejs.github.io/audio/salamander/',
    release: 1.5
  });
}
