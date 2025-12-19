/**
 * ConvolutionReverb - Sympathetic resonance simulation for piano
 *
 * Simulates the effect of all piano strings resonating together when the
 * sustain pedal is pressed, creating a richer, more "alive" sound.
 */

export class ConvolutionReverb {
  // Constants for impulse response generation
  private static readonly IMPULSE_DURATION_SECONDS = 4;
  private static readonly DECAY_TIME_CONSTANT = 1.5;
  private static readonly LOW_PASS_COEFFICIENT = 0.7;
  private static readonly IMPULSE_LEVEL = 0.2;

  private ctx: AudioContext;
  private convolver: ConvolverNode;
  private wet: GainNode;
  private dry: GainNode;
  private input: GainNode;
  private output: GainNode;
  private isPedalDown: boolean = false;
  private isDisposed: boolean = false;

  constructor(ctx: AudioContext, impulseUrl?: string) {
    try {
      this.ctx = ctx;

      // Create nodes
      this.convolver = ctx.createConvolver();
      this.wet = ctx.createGain();
      this.dry = ctx.createGain();
      this.input = ctx.createGain();
      this.output = ctx.createGain();

      // Default: dry only (pedal up)
      this.wet.gain.value = 0;
      this.dry.gain.value = 1;

      // Route: input → [dry path, convolver → wet path] → output
      this.input.connect(this.dry);
      this.input.connect(this.convolver);
      this.convolver.connect(this.wet);
      this.dry.connect(this.output);
      this.wet.connect(this.output);

      // Load or generate impulse response
      if (impulseUrl) {
        this.loadImpulse(impulseUrl).catch(err => {
          console.warn('Failed to load impulse response, using synthetic:', err);
          this.generateSyntheticImpulse();
        });
      } else {
        this.generateSyntheticImpulse();
      }
    } catch (error) {
      console.error('[ConvolutionReverb] Error during initialization:', error);
      throw error;
    }
  }

  private async loadImpulse(url: string): Promise<void> {
    const response = await fetch(url);
    const arrayBuffer = await response.arrayBuffer();
    const buffer = await this.ctx.decodeAudioData(arrayBuffer);

    // Don't set buffer if already disposed
    if (this.isDisposed) return;

    this.convolver.buffer = buffer;
  }

  /**
   * Generate a synthetic impulse response for piano resonance
   * Uses filtered noise with exponential decay to simulate string resonance
   */
  private generateSyntheticImpulse(): void {
    const sampleRate = this.ctx.sampleRate;
    const length = sampleRate * ConvolutionReverb.IMPULSE_DURATION_SECONDS;
    const buffer = this.ctx.createBuffer(2, length, sampleRate);

    for (let channel = 0; channel < 2; channel++) {
      const channelData = buffer.getChannelData(channel);

      for (let i = 0; i < length; i++) {
        // Generate white noise
        let sample = (Math.random() * 2 - 1);

        // Apply exponential decay envelope (simulates string damping)
        const decay = Math.exp(-i / (sampleRate * ConvolutionReverb.DECAY_TIME_CONSTANT));

        // Add some low-frequency emphasis (piano body resonance)
        // Simple rolling average for low-pass effect
        if (i > 10) {
          sample = (sample + channelData[i - 1] * ConvolutionReverb.LOW_PASS_COEFFICIENT) /
                   (1 + ConvolutionReverb.LOW_PASS_COEFFICIENT);
        }

        channelData[i] = sample * decay * ConvolutionReverb.IMPULSE_LEVEL;
      }
    }

    this.convolver.buffer = buffer;
  }

  /**
   * Set sustain pedal state
   * @param down - true when pedal is pressed, false when released
   * @param rampTime - crossfade duration in seconds (default: 50ms)
   */
  setPedalDown(down: boolean, rampTime: number = 0.05): void {
    if (this.isPedalDown === down) return; // No change

    this.isPedalDown = down;
    const now = this.ctx.currentTime;

    if (down) {
      // Pedal down: blend in wet signal (sympathetic resonance)
      this.wet.gain.setTargetAtTime(0.3, now, rampTime);
      this.dry.gain.setTargetAtTime(0.7, now, rampTime);
    } else {
      // Pedal up: back to dry only
      this.wet.gain.setTargetAtTime(0, now, rampTime);
      this.dry.gain.setTargetAtTime(1, now, rampTime);
    }
  }

  /**
   * Get the current pedal state
   */
  getPedalState(): boolean {
    return this.isPedalDown;
  }

  /**
   * Get the input node to connect sources to
   */
  getInput(): GainNode {
    return this.input;
  }

  /**
   * Get the output node to connect to destination
   */
  getOutput(): GainNode {
    return this.output;
  }

  /**
   * Disconnect and cleanup
   */
  disconnect(): void {
    this.isDisposed = true;
    this.input.disconnect();
    this.dry.disconnect();
    this.convolver.disconnect();
    this.wet.disconnect();
    this.output.disconnect();
  }
}
