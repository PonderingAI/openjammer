/**
 * WebAudioFontAdapter - Adapter for WebAudioFont (GM instruments)
 */

import { SampledInstrument } from './SampledInstrument';
import { getAudioContext } from '../AudioEngine';
import type { EnvelopeConfig } from './types';

// WebAudioFont types (from npm package)
interface WebAudioFontLoader {
  startLoad: (ctx: AudioContext, url: string, name: string) => void;
  waitLoad: (cb: () => void) => void;
  decodeAfterLoading: (ctx: AudioContext, name: string) => void;
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
  envelope?: EnvelopeConfig;
}

export class WebAudioFontInstrument extends SampledInstrument {
  private player: WebAudioFontPlayer | null = null;
  private preset: unknown = null;
  private config: WebAudioFontConfig;
  private noteHandles: Map<string, { cancel: () => void; gainNode: GainNode }> = new Map();
  // pendingCleanups is inherited from SampledInstrument base class

  constructor(config: WebAudioFontConfig) {
    super();
    this.config = config;
  }

  protected async loadSamples(): Promise<void> {
    const ctx = getAudioContext();
    if (!ctx) throw new Error('AudioContext not available');

    // webaudiofont doesn't have proper ES module exports - it defines classes as local vars
    // Load it via script tag to ensure globals are properly set
    await this.loadWebAudioFontScript();

    // Access the global variable created by the script
    const globalAny = (typeof window !== 'undefined' ? window : globalThis) as unknown as Record<string, unknown>;
    const PlayerClass = globalAny.WebAudioFontPlayer as typeof WebAudioFontPlayer | undefined;

    if (!PlayerClass) {
      throw new Error('WebAudioFontPlayer not found in global scope after script load');
    }

    this.player = new PlayerClass();

    // Now load the preset
    await this.loadPreset(ctx);
  }

  /**
   * Load webaudiofont via script tag to ensure global scope exposure
   */
  private loadWebAudioFontScript(): Promise<void> {
    return new Promise((resolve, reject) => {
      // Check if already loaded
      const globalAny = (typeof window !== 'undefined' ? window : globalThis) as unknown as Record<string, unknown>;
      if (typeof globalAny.WebAudioFontPlayer === 'function') {
        resolve();
        return;
      }

      // Load via script tag from CDN
      const script = document.createElement('script');
      script.src = 'https://surikov.github.io/webaudiofont/npm/dist/WebAudioFontPlayer.js';
      script.onload = () => resolve();
      script.onerror = () => reject(new Error('Failed to load WebAudioFont script from CDN'));
      document.head.appendChild(script);
    });
  }

  /**
   * Load the instrument preset
   */
  private loadPreset(ctx: AudioContext): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.player) {
        reject(new Error('Player not initialized'));
        return;
      }

      // Add loading timeout to prevent hanging forever
      let loadResolved = false;
      const timeoutId = window.setTimeout(() => {
        if (!loadResolved) {
          loadResolved = true;
          reject(new Error('WebAudioFont preset loading timeout (30s)'));
        }
      }, 30000);

      try {
        this.player.loader.startLoad(ctx, this.config.presetUrl, this.config.presetVar);
        this.player.loader.waitLoad(() => {
          if (loadResolved) return;

          // Access the loaded preset from window (WebAudioFont pattern)
          this.preset = (window as unknown as Record<string, unknown>)[this.config.presetVar];
          if (!this.preset) {
            loadResolved = true;
            clearTimeout(timeoutId);
            reject(new Error(`Preset ${this.config.presetVar} not found`));
            return;
          }

          // CRITICAL: Decode the preset after loading to ensure buffers are ready
          // Without this, first notes may be silent (empty buffer issue)
          this.player!.loader.decodeAfterLoading(ctx, this.config.presetVar);

          // Verify preset has zones (samples)
          const presetObj = this.preset as { zones?: unknown[] };
          if (!presetObj.zones || presetObj.zones.length === 0) {
            loadResolved = true;
            clearTimeout(timeoutId);
            reject(new Error(`Preset ${this.config.presetVar} has no zones/samples`));
            return;
          }

          loadResolved = true;
          clearTimeout(timeoutId);
          resolve();
        });
      } catch (err) {
        if (!loadResolved) {
          loadResolved = true;
          clearTimeout(timeoutId);
          reject(err);
        }
      }
    });
  }

  // noteToMidi is inherited from SampledInstrument base class

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
      // Time constant varies by note range (bass = longer, treble = shorter)
      const timeConstant = this.getTimeConstantForNote(note, this.config.envelope);
      handle.gainNode.gain.setValueAtTime(handle.gainNode.gain.value, now);
      handle.gainNode.gain.setTargetAtTime(0, now, timeConstant);

      // Cancel after 5x time constant (99% decay)
      const cleanupTime = timeConstant * 5 * 1000; // Convert to ms
      const timeoutId = window.setTimeout(() => {
        this.pendingCleanups.delete(timeoutId);
        handle.cancel();
        handle.gainNode.disconnect();
      }, cleanupTime);
      this.pendingCleanups.add(timeoutId);

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
    // Base class handles pendingCleanups cleanup via clearAllCleanups()
    super.disconnect();
  }
}
