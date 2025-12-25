/**
 * TonePianoAdapter - Professional piano using Tone.Sampler with Salamander samples
 *
 * Uses Salamander Grand Piano samples (same as @tonejs/piano) but loaded directly
 * via Tone.Sampler for compatibility with Tone.js 15.x
 *
 * IMPORTANT: Tone.js is dynamically imported to avoid AudioContext creation
 * before user gesture. This prevents browser autoplay warnings.
 */

import { SampledInstrument } from './SampledInstrument';
import { getAudioContext, ensureToneStarted } from '../AudioEngine';
import { ConvolutionReverb } from '../ConvolutionReverb';
import type { EnvelopeConfig } from './types';

// Tone.js types (imported dynamically to avoid eager AudioContext creation)
type ToneType = typeof import('tone');
type ToneSampler = import('tone').Sampler;
type ToneGain = import('tone').Gain;

// ============================================================================
// Constants
// ============================================================================

/** Base URL for Salamander piano samples */
const SALAMANDER_BASE_URL = 'https://tambien.github.io/Piano/audio/';

/** Timeout for sample loading (30 seconds) */
const SAMPLE_LOAD_TIMEOUT_MS = 30000;

/**
 * Salamander sample mapping
 * Keys: Standard note names for Tone.Sampler (D#1, F#1)
 * Values: Salamander file names (Ds1, Fs1) - they use 's' instead of '#'
 */
const SAMPLE_MAP: Record<string, string> = {
  'A0': 'A0', 'C1': 'C1', 'D#1': 'Ds1', 'F#1': 'Fs1', 'A1': 'A1',
  'C2': 'C2', 'D#2': 'Ds2', 'F#2': 'Fs2', 'A2': 'A2',
  'C3': 'C3', 'D#3': 'Ds3', 'F#3': 'Fs3', 'A3': 'A3',
  'C4': 'C4', 'D#4': 'Ds4', 'F#4': 'Fs4', 'A4': 'A4',
  'C5': 'C5', 'D#5': 'Ds5', 'F#5': 'Fs5', 'A5': 'A5',
  'C6': 'C6', 'D#6': 'Ds6', 'F#6': 'Fs6', 'A6': 'A6',
  'C7': 'C7', 'D#7': 'Ds7', 'F#7': 'Fs7', 'A7': 'A7',
  'C8': 'C8'
};

interface TonePianoConfig {
  velocities?: 1 | 4 | 5 | 16;
  envelope?: EnvelopeConfig;
}

export class TonePianoInstrument extends SampledInstrument<ToneSampler> {
  private sampler: ToneSampler | null = null;
  private config: TonePianoConfig;
  private toneGain: ToneGain | null = null;
  private Tone: ToneType | null = null; // Dynamically imported
  private resonance: ConvolutionReverb | null = null;
  private isPedalDown: boolean = false;
  private sustainedNotes: Set<string> = new Set();

  constructor(config: TonePianoConfig = {}) {
    super();
    this.config = {
      velocities: config.velocities ?? 5,
      envelope: config.envelope
    };
  }

  protected async loadSamples(): Promise<void> {
    const ctx = getAudioContext();
    if (!ctx) throw new Error('AudioContext not available');

    try {
      await ensureToneStarted();

      // Dynamically import Tone.js to avoid AudioContext creation before user gesture
      this.Tone = await import('tone');

      // Build sample map: note -> URL
      // Use velocity layer based on config (higher = more dynamic range but larger download)
      const velocityLayer = Math.min(this.config.velocities ?? 5, 16);
      const urls: Record<string, string> = {};

      for (const [toneNote, fileNote] of Object.entries(SAMPLE_MAP)) {
        // Salamander naming: A0v1.mp3, C4v5.mp3, Ds1v5.mp3, etc.
        urls[toneNote] = `${fileNote}v${velocityLayer}.mp3`;
      }

      // Create sampler with timeout
      const Tone = this.Tone;
      const loadPromise = new Promise<ToneSampler>((resolve, reject) => {
        const sampler = new Tone.Sampler({
          urls,
          baseUrl: SALAMANDER_BASE_URL,
          onload: () => resolve(sampler),
          onerror: (err) => reject(err),
          // Piano-like release
          release: 1.5
        });
      });

      let timeoutId: ReturnType<typeof setTimeout> | null = null;
      const timeoutPromise = new Promise<never>((_, reject) => {
        timeoutId = setTimeout(
          () => reject(new Error(`Piano sample loading timeout (${SAMPLE_LOAD_TIMEOUT_MS / 1000}s)`)),
          SAMPLE_LOAD_TIMEOUT_MS
        );
      });

      try {
        this.sampler = await Promise.race([loadPromise, timeoutPromise]);
      } finally {
        if (timeoutId !== null) {
          clearTimeout(timeoutId);
        }
      }

      // Create output chain
      this.toneGain = new Tone.Gain(1);
      this.resonance = new ConvolutionReverb(ctx);

      // Connect: sampler → toneGain → resonance → outputNode
      if (this.outputNode) {
        this.sampler.connect(this.toneGain);
        Tone.connect(this.toneGain, this.resonance.getInput());
        this.resonance.getOutput().connect(this.outputNode);
      }

      console.log('[TonePiano] Salamander piano loaded successfully');
    } catch (error) {
      console.error('[TonePiano] Error during initialization:', error);
      throw error;
    }
  }

  protected playNoteImpl(note: string, velocity: number = 0.8): void {
    if (!this.sampler || !this.Tone) return;

    // Tone.Sampler uses attack velocity
    this.sampler.triggerAttack(note, this.Tone.now(), velocity);
    this.activeNotes.set(note, this.sampler);
  }

  protected stopNoteImpl(note: string): void {
    if (!this.sampler || !this.Tone) return;

    // If pedal is down, add to sustained notes instead of releasing
    if (this.isPedalDown) {
      this.sustainedNotes.add(note);
    } else {
      this.sampler.triggerRelease(note, this.Tone.now());
    }

    this.activeNotes.delete(note);
  }

  setPedal(down: boolean): void {
    this.isPedalDown = down;

    if (!down && this.sampler && this.Tone) {
      // Release all sustained notes when pedal comes up
      for (const note of this.sustainedNotes) {
        this.sampler.triggerRelease(note, this.Tone.now());
      }
      this.sustainedNotes.clear();
    }

    // Control convolution reverb for sympathetic resonance
    this.resonance?.setPedalDown(down);
  }

  getPedalState(): boolean {
    return this.isPedalDown;
  }

  disconnect(): void {
    this.stopAllNotes();
    this.sustainedNotes.clear();

    if (this.resonance) {
      this.resonance.disconnect();
      this.resonance = null;
    }

    if (this.toneGain) {
      this.toneGain.dispose();
      this.toneGain = null;
    }

    if (this.sampler) {
      this.sampler.dispose();
      this.sampler = null;
    }

    super.disconnect();
  }
}
