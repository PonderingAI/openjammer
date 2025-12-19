/**
 * WebAudioFontAdapter - Adapter for WebAudioFont (GM instruments)
 */

import { SampledInstrument } from './SampledInstrument';
import { getAudioContext } from '../AudioEngine';

// WebAudioFont types (from npm package)
interface WebAudioFontLoader {
  startLoad: (ctx: AudioContext, url: string, name: string) => void;
  waitLoad: (cb: () => void) => void;
}

declare class WebAudioFontPlayer {
  loader: WebAudioFontLoader;
  queueWaveTable(
    ctx: AudioContext,
    destination: AudioNode,
    preset: unknown,
    when: number,
    pitch: number,
    duration: number,
    volume: number,
    slides?: unknown[]
  ): { cancel: () => void };
  cancelQueue(ctx: AudioContext): void;
}

interface WebAudioFontConfig {
  presetUrl: string;
  presetVar: string;
}

export class WebAudioFontInstrument extends SampledInstrument {
  private player: WebAudioFontPlayer | null = null;
  private preset: unknown = null;
  private config: WebAudioFontConfig;
  private noteHandles: Map<string, { cancel: () => void; gainNode: GainNode }> = new Map();

  constructor(config: WebAudioFontConfig) {
    super();
    this.config = config;
  }

  protected async loadSamples(): Promise<void> {
    const ctx = getAudioContext();
    if (!ctx) throw new Error('AudioContext not available');

    // Dynamic import of webaudiofont
    const { WebAudioFontPlayer } = await import('webaudiofont');
    this.player = new WebAudioFontPlayer();

    return new Promise((resolve, reject) => {
      try {
        this.player!.loader.startLoad(ctx, this.config.presetUrl, this.config.presetVar);
        this.player!.loader.waitLoad(() => {
          // Access the loaded preset from window (WebAudioFont pattern)
          this.preset = (window as unknown as Record<string, unknown>)[this.config.presetVar];
          if (!this.preset) {
            reject(new Error(`Preset ${this.config.presetVar} not found`));
          } else {
            resolve();
          }
        });
      } catch (err) {
        reject(err);
      }
    });
  }

  protected noteToMidi(note: string): number {
    const noteMap: Record<string, number> = {
      'C': 0, 'C#': 1, 'Db': 1, 'D': 2, 'D#': 3, 'Eb': 3,
      'E': 4, 'F': 5, 'F#': 6, 'Gb': 6, 'G': 7, 'G#': 8,
      'Ab': 8, 'A': 9, 'A#': 10, 'Bb': 10, 'B': 11
    };

    const match = note.match(/^([A-G][#b]?)(\d+)$/i);
    if (!match) return 60; // Middle C fallback

    const [, noteName, octave] = match;
    return noteMap[noteName.toUpperCase()] + (parseInt(octave, 10) + 1) * 12;
  }

  protected playNoteImpl(note: string, velocity: number = 0.8): void {
    const ctx = getAudioContext();
    if (!this.player || !this.preset || !ctx || !this.outputNode) return;

    const midi = this.noteToMidi(note);

    // Create a gain node for this note (allows individual fade-out)
    const noteGain = ctx.createGain();
    noteGain.gain.value = 1;
    noteGain.connect(this.outputNode);

    // Queue a long duration - we'll stop it manually
    const handle = this.player.queueWaveTable(
      ctx, noteGain, this.preset, ctx.currentTime, midi, 10, velocity
    );

    this.noteHandles.set(note, { cancel: handle.cancel, gainNode: noteGain });
    this.activeNotes.set(note, true);
  }

  protected stopNoteImpl(note: string): void {
    const ctx = getAudioContext();
    if (!ctx) return;

    const handle = this.noteHandles.get(note);
    if (handle) {
      const now = ctx.currentTime;

      // Use setTargetAtTime for natural exponential decay
      // Time constant of 0.04s for winds (quick release)
      const timeConstant = 0.04;
      handle.gainNode.gain.setValueAtTime(handle.gainNode.gain.value, now);
      handle.gainNode.gain.setTargetAtTime(0, now, timeConstant);

      // Cancel after 5x time constant (99% decay)
      const cleanupTime = timeConstant * 5 * 1000; // Convert to ms
      setTimeout(() => {
        handle.cancel();
        handle.gainNode.disconnect();
      }, cleanupTime);

      this.noteHandles.delete(note);
    }
    this.activeNotes.delete(note);
  }

  disconnect(): void {
    // Cancel all queued notes
    this.noteHandles.forEach(handle => {
      handle.cancel();
      handle.gainNode.disconnect();
    });
    this.noteHandles.clear();
    super.disconnect();
  }
}
