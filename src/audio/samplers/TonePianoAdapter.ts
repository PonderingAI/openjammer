/**
 * TonePianoAdapter - Adapter for @tonejs/piano (professional piano with 16 velocity layers)
 */

import { SampledInstrument } from './SampledInstrument';
import { getAudioContext } from '../AudioEngine';
import { ConvolutionReverb } from '../ConvolutionReverb';
import type { EnvelopeConfig } from './types';

// Interface for @tonejs/piano (dynamically imported)
interface PianoInstance {
  load(): Promise<void>;
  keyDown(options: { note: string; velocity?: number }): void;
  keyUp(options: { note: string }): void;
  pedalDown(): void;
  pedalUp(): void;
  connect(dest: AudioNode): void;
  disconnect(): void;
  dispose(): void;
}

interface TonePianoConfig {
  velocities?: 1 | 4 | 5 | 16;
  envelope?: EnvelopeConfig;
}

export class TonePianoInstrument extends SampledInstrument {
  private piano: PianoInstance | null = null;
  private config: TonePianoConfig;
  private pianoOutput: GainNode | null = null;
  private resonance: ConvolutionReverb | null = null;
  private pedalDown: boolean = false;

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
      // Dynamic import to avoid module loading errors
      const { Piano } = await import('@tonejs/piano').catch((importErr) => {
        console.error('[TonePiano] Failed to load @tonejs/piano module:', importErr);
        throw new Error('Piano library failed to load. Check network connection or dependencies.');
      });

      // Create Piano instance
      this.piano = new Piano({
        velocities: this.config.velocities
      }) as PianoInstance;

      // Wait for samples to load
      await this.piano.load();

      // Create intermediate gain node to route piano output
      this.pianoOutput = ctx.createGain();
      this.pianoOutput.gain.value = 1;

      // Create convolution reverb for sympathetic resonance
      this.resonance = new ConvolutionReverb(ctx);

      // Connect piano to our chain
      // Route: piano → pianoOutput → resonance → outputNode
      if (this.outputNode) {
        // Connect piano output to our intermediate gain node
        this.piano.connect(this.pianoOutput);
        this.pianoOutput.connect(this.resonance.getInput());
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

    this.pedalDown = down;

    // Use @tonejs/piano's built-in pedal support
    if (down) {
      this.piano.pedalDown();
    } else {
      this.piano.pedalUp();
    }

    // Also control convolution reverb for sympathetic resonance
    this.resonance?.setPedalDown(down);
  }

  isPedalDown(): boolean {
    return this.pedalDown;
  }

  disconnect(): void {
    // Disconnect resonance
    if (this.resonance) {
      this.resonance.disconnect();
      this.resonance = null;
    }

    // Disconnect piano
    if (this.piano) {
      this.piano.disconnect();
      this.piano.dispose();
      this.piano = null;
    }

    if (this.pianoOutput) {
      this.pianoOutput.disconnect();
      this.pianoOutput = null;
    }

    super.disconnect();
  }
}
