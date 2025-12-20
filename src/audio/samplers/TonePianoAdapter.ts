/**
 * TonePianoAdapter - Adapter for @tonejs/piano (professional piano with 16 velocity layers)
 *
 * CRITICAL: @tonejs/piano uses Tone.js internally. We MUST:
 * 1. Call Tone.setContext() with our AudioContext BEFORE creating Piano
 * 2. Use Tone.js nodes for connections (not native GainNode)
 * 3. Use Tone.connect() to bridge to native Web Audio nodes
 */

import * as Tone from 'tone';
import { SampledInstrument } from './SampledInstrument';
import { getAudioContext } from '../AudioEngine';
import { ConvolutionReverb } from '../ConvolutionReverb';
import type { EnvelopeConfig } from './types';

// Module-level flag to ensure Tone context is set only once
let toneContextInitialized = false;

async function ensureToneContext(ctx: AudioContext): Promise<void> {
  if (toneContextInitialized) return;

  // Set Tone.js to use our AudioContext
  Tone.setContext(ctx);
  toneContextInitialized = true;

  // Ensure Tone.js is started (requires user gesture)
  if (Tone.context.state !== 'running') {
    await Tone.start();
  }
}

// Interface for @tonejs/piano (dynamically imported)
interface PianoInstance {
  load(): Promise<void>;
  keyDown(options: { note: string; velocity?: number; time?: number }): void;
  keyUp(options: { note: string; time?: number }): void;
  pedalDown(time?: number): void;
  pedalUp(time?: number): void;
  connect(dest: Tone.ToneAudioNode): this;
  disconnect(): this;
  dispose(): void;
  toDestination(): this;
}

interface TonePianoConfig {
  velocities?: 1 | 4 | 5 | 16;
  envelope?: EnvelopeConfig;
}

export class TonePianoInstrument extends SampledInstrument {
  private piano: PianoInstance | null = null;
  private config: TonePianoConfig;
  private toneGain: Tone.Gain | null = null; // Use Tone.Gain instead of native GainNode
  private resonance: ConvolutionReverb | null = null;
  private isPedalDown: boolean = false;

  constructor(config: TonePianoConfig = {}) {
    super();
    this.config = {
      velocities: config.velocities ?? 5, // Default to 5 layers (good balance)
      envelope: config.envelope
    };
  }

  protected async loadSamples(): Promise<void> {
    const ctx = getAudioContext();
    if (!ctx) throw new Error('AudioContext not available');

    try {
      // CRITICAL: Set Tone.js context BEFORE creating Piano
      await ensureToneContext(ctx);

      // Dynamic import to avoid module loading errors
      const { Piano } = await import('@tonejs/piano').catch((importErr) => {
        console.error('[TonePiano] Failed to load @tonejs/piano module:', importErr);
        throw new Error('Piano library failed to load. Check network connection or dependencies.');
      });

      // Create Piano instance (now uses our AudioContext via Tone.setContext)
      this.piano = new Piano({
        velocities: this.config.velocities
      }) as PianoInstance;

      // Wait for samples to load with timeout
      const loadPromise = this.piano.load();
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Piano sample loading timeout (30s)')), 30000)
      );
      await Promise.race([loadPromise, timeoutPromise]);

      // Create Tone.Gain for piano output (Tone.js nodes work with Piano)
      this.toneGain = new Tone.Gain(1);

      // Create convolution reverb for sympathetic resonance
      this.resonance = new ConvolutionReverb(ctx);

      // Connect piano to our chain using Tone.js patterns
      // Route: piano → toneGain → resonance → outputNode
      if (this.outputNode) {
        // Connect Piano to Tone.Gain
        this.piano.connect(this.toneGain);

        // Bridge from Tone.js to native Web Audio using Tone.connect()
        // toneGain → resonance input (native GainNode)
        Tone.connect(this.toneGain, this.resonance.getInput());

        // resonance output → our outputNode (native GainNode)
        this.resonance.getOutput().connect(this.outputNode);
      }
    } catch (error) {
      console.error('[TonePiano] Error during initialization:', error);
      throw error;
    }
  }

  protected playNoteImpl(note: string, velocity: number = 0.8): void {
    const ctx = getAudioContext();
    if (!this.piano || !ctx) return;

    // Trigger piano note (time omitted for immediate playback)
    this.piano.keyDown({
      note,
      velocity
    });

    this.activeNotes.set(note, true);
  }

  protected stopNoteImpl(note: string): void {
    const ctx = getAudioContext();
    if (!this.piano || !ctx) return;

    // Trigger piano key up (time omitted for immediate release)
    // @tonejs/piano has built-in release handling
    this.piano.keyUp({
      note
    });

    this.activeNotes.delete(note);
  }

  // Pedal control for sympathetic resonance
  setPedal(down: boolean): void {
    if (!this.piano) return;

    this.isPedalDown = down;

    // Use @tonejs/piano's built-in pedal support
    if (down) {
      this.piano.pedalDown();
    } else {
      this.piano.pedalUp();
    }

    // Also control convolution reverb for sympathetic resonance
    this.resonance?.setPedalDown(down);
  }

  getPedalState(): boolean {
    return this.isPedalDown;
  }

  disconnect(): void {
    // Release all playing notes first
    this.stopAllNotes();

    // Disconnect resonance
    if (this.resonance) {
      this.resonance.disconnect();
      this.resonance = null;
    }

    // Disconnect and dispose Tone.Gain
    if (this.toneGain) {
      this.toneGain.dispose();
      this.toneGain = null;
    }

    // Disconnect and dispose piano
    if (this.piano) {
      this.piano.disconnect();
      this.piano.dispose();
      this.piano = null;
    }

    super.disconnect();
  }
}
