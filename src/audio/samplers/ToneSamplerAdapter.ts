/**
 * ToneSamplerAdapter - Adapter for Tone.js Sampler (Salamander piano, tonejs-instruments)
 *
 * CRITICAL: Must use Tone.js patterns correctly:
 * 1. Call Tone.setContext() with our AudioContext BEFORE creating Sampler
 * 2. Call Tone.start() on user gesture before playback
 * 3. Use Tone.connect() to bridge to native Web Audio nodes
 * 4. Wait for Tone.loaded() after creating Sampler
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

// Module-level flag for Tone.js context initialization (global state)
let toneContextInitialized = false;

async function ensureToneContext(ctx: AudioContext): Promise<void> {
  if (!toneContextInitialized) {
    Tone.setContext(ctx);
    toneContextInitialized = true;
  }

  // Ensure Tone.js is started (requires user gesture)
  if (Tone.context.state !== 'running') {
    await Tone.start();
  }
}

export class ToneSamplerInstrument extends SampledInstrument<boolean> {
  private sampler: Tone.Sampler | null = null;
  private config: ToneSamplerConfig;

  constructor(config: ToneSamplerConfig) {
    super();
    this.config = config;
  }

  protected async loadSamples(): Promise<void> {
    const ctx = getAudioContext();
    if (!ctx) throw new Error('AudioContext not available');

    // CRITICAL: Ensure Tone.js is using our context BEFORE creating Sampler
    await ensureToneContext(ctx);

    // Create sampler with onload callback
    return new Promise((resolve, reject) => {
      try {
        let loadResolved = false;
        let timeoutId: ReturnType<typeof setTimeout> | null = null;

        // Cleanup function to clear timeout and prevent leaks
        const cleanup = () => {
          if (timeoutId !== null) {
            clearTimeout(timeoutId);
            timeoutId = null;
          }
        };

        this.sampler = new Tone.Sampler({
          urls: this.config.urls,
          baseUrl: this.config.baseUrl,
          release: this.config.release ?? 1,
          onload: () => {
            if (loadResolved) return;
            loadResolved = true;
            cleanup();

            // Connect to our output node using Tone.connect() for native nodes
            if (this.outputNode && this.sampler) {
              // Use Tone.connect() to bridge Tone.js node to native GainNode
              Tone.connect(this.sampler, this.outputNode);
            }
            resolve();
          },
          onerror: (err) => {
            if (loadResolved) return;
            loadResolved = true;
            cleanup();
            reject(err);
          }
        });

        // Add timeout to prevent hanging forever
        timeoutId = setTimeout(() => {
          if (!loadResolved) {
            loadResolved = true;
            timeoutId = null; // Already fired, no need to clear
            reject(new Error('Sampler loading timeout (30s)'));
          }
        }, 30000);

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

  disconnect(): void {
    if (this.sampler) {
      this.sampler.releaseAll();
      this.sampler.dispose();
      this.sampler = null;
    }
    super.disconnect();
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
