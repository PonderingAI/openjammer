/**
 * KarplusStrongInstrument - Physical modeling synthesis for plucked strings
 *
 * Uses the Karplus-Strong algorithm:
 * Noise burst → delay line → low-pass filter → feedback loop
 */

import { SampledInstrument } from './SampledInstrument';
import { getAudioContext } from '../AudioEngine';

interface KarplusNote {
  delayNode: DelayNode;
  feedbackGain: GainNode;
  filterNode: BiquadFilterNode;
  outputGain: GainNode;
  decayTimeout?: ReturnType<typeof setTimeout>;
  cleanupTimeout?: ReturnType<typeof setTimeout>;
}

export class KarplusStrongInstrument extends SampledInstrument {
  private pluckBrightness: number;
  private dampening: number;

  constructor(brightness: number = 0.5, dampening: number = 0.99) {
    super();
    this.pluckBrightness = brightness;
    this.dampening = dampening;
  }

  // No async loading needed - it's pure synthesis
  protected async loadSamples(): Promise<void> {
    // Immediately ready - no samples to load
    return Promise.resolve();
  }

  private noteToFrequency(note: string): number {
    const noteMap: Record<string, number> = {
      'C': 0, 'C#': 1, 'Db': 1, 'D': 2, 'D#': 3, 'Eb': 3,
      'E': 4, 'F': 5, 'F#': 6, 'Gb': 6, 'G': 7, 'G#': 8,
      'Ab': 8, 'A': 9, 'A#': 10, 'Bb': 10, 'B': 11
    };

    const match = note.match(/^([A-G][#b]?)(\d+)$/i);
    if (!match) return 440;

    const [, noteName, octave] = match;
    const noteIndex = noteMap[noteName.toUpperCase()];
    const semitonesFromA4 = (parseInt(octave, 10) - 4) * 12 + (noteIndex - 9);
    return 440 * Math.pow(2, semitonesFromA4 / 12);
  }

  protected playNoteImpl(note: string, velocity: number = 0.8): void {
    const ctx = getAudioContext();
    if (!ctx || !this.outputNode) return;

    const frequency = this.noteToFrequency(note);
    const delayTime = 1 / frequency;

    // Create noise burst (pluck excitation)
    const bufferSize = ctx.sampleRate * 0.02; // 20ms noise
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);

    // Fill with noise, shaped by brightness
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * velocity;
      // Apply envelope to noise
      data[i] *= 1 - (i / bufferSize);
    }

    const noiseSource = ctx.createBufferSource();
    noiseSource.buffer = buffer;

    // Delay line (Karplus-Strong feedback delay)
    const delayNode = ctx.createDelay();
    delayNode.delayTime.value = delayTime;

    // Feedback gain (controls decay)
    const feedbackGain = ctx.createGain();
    feedbackGain.gain.value = this.dampening;

    // Low-pass filter (string dampening)
    const filterNode = ctx.createBiquadFilter();
    filterNode.type = 'lowpass';
    filterNode.frequency.value = 5000 * this.pluckBrightness + 1000;
    filterNode.Q.value = 0.5;

    // Output gain
    const outputGain = ctx.createGain();
    outputGain.gain.value = velocity * 0.5;

    // Connect: noise -> delay -> filter -> feedback -> delay
    noiseSource.connect(delayNode);
    delayNode.connect(filterNode);
    filterNode.connect(feedbackGain);
    feedbackGain.connect(delayNode);

    // Also connect filtered output to output
    filterNode.connect(outputGain);
    outputGain.connect(this.outputNode);

    // Start noise
    noiseSource.start();
    noiseSource.stop(ctx.currentTime + 0.02);

    // Store for stopping
    const noteData: KarplusNote = { delayNode, feedbackGain, filterNode, outputGain };
    this.activeNotes.set(note, noteData);

    // Natural decay (4 seconds for realistic plucked string behavior)
    noteData.decayTimeout = setTimeout(() => {
      if (this.activeNotes.get(note) === noteData) {
        this.stopNoteImpl(note);
      }
    }, 4000);
  }

  // Override: already loaded (no samples)
  isLoaded(): boolean {
    return true;
  }

  async load(): Promise<void> {
    this.loadingState = 'loaded';
    return Promise.resolve();
  }

  // Track cleanup timeouts separately since they persist after note deletion
  private cleanupTimeouts: Set<ReturnType<typeof setTimeout>> = new Set();

  // Override stopNoteImpl to track cleanup timeouts
  protected override stopNoteImpl(note: string): void {
    const ctx = getAudioContext();
    if (!ctx) return;

    const noteData = this.activeNotes.get(note) as KarplusNote | undefined;
    if (noteData) {
      // Clear decay timeout if note is stopped early
      if (noteData.decayTimeout) {
        clearTimeout(noteData.decayTimeout);
      }

      const now = ctx.currentTime;
      const timeConstant = 0.08;

      noteData.feedbackGain.gain.setValueAtTime(noteData.feedbackGain.gain.value, now);
      noteData.feedbackGain.gain.setTargetAtTime(0, now, timeConstant);

      noteData.outputGain.gain.setValueAtTime(noteData.outputGain.gain.value, now);
      noteData.outputGain.gain.setTargetAtTime(0, now, timeConstant);

      // Cleanup after 5x time constant - track timeout for cleanup on disconnect
      const cleanupTime = timeConstant * 5 * 1000;
      const cleanupTimeout = setTimeout(() => {
        noteData.delayNode.disconnect();
        noteData.filterNode.disconnect();
        noteData.feedbackGain.disconnect();
        noteData.outputGain.disconnect();
        this.cleanupTimeouts.delete(cleanupTimeout);
      }, cleanupTime);
      this.cleanupTimeouts.add(cleanupTimeout);

      this.activeNotes.delete(note);
    }
  }

  // Override disconnect to clean up all pending timeouts
  override disconnect(): void {
    // Clear all decay and cleanup timeouts
    this.activeNotes.forEach((noteData) => {
      const kNote = noteData as KarplusNote;
      if (kNote.decayTimeout) clearTimeout(kNote.decayTimeout);
    });
    this.cleanupTimeouts.forEach((timeout) => clearTimeout(timeout));
    this.cleanupTimeouts.clear();

    super.disconnect();
  }
}
