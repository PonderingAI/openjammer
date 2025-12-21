/**
 * LocalSampleAdapter - Plays audio samples from the local sample library
 *
 * Unlike other SampledInstruments that are MIDI-triggered, this adapter
 * plays full audio files from the user's local library when triggered.
 *
 * Supports playback modes:
 * - oneshot: Play once when triggered
 * - loop: Loop continuously until stopped
 * - hold: Play while trigger is held, stop on release
 */

import { getAudioContext } from '../AudioEngine';
import { getAudioBufferCache } from '../AudioBufferCache';
import { getSampleFile } from '../../store/sampleLibraryStore';

export type PlaybackMode = 'oneshot' | 'loop' | 'hold';

export interface LocalSampleAdapterOptions {
  playbackMode?: PlaybackMode;
  volume?: number;
}

interface ActivePlayback {
  source: AudioBufferSourceNode;
  gainNode: GainNode;
  sampleId: string;
}

export class LocalSampleAdapter {
  private outputNode: GainNode | null = null;
  private activePlaybacks: Map<string, ActivePlayback> = new Map();
  private currentSampleId: string | null = null;
  private playbackMode: PlaybackMode = 'oneshot';
  private isLoading = false;
  private loadPromise: Promise<void> | null = null;

  constructor(options: LocalSampleAdapterOptions = {}) {
    this.playbackMode = options.playbackMode ?? 'oneshot';
    this.initOutput();
    if (this.outputNode && options.volume !== undefined) {
      this.outputNode.gain.value = options.volume;
    }
  }

  private initOutput(): void {
    const ctx = getAudioContext();
    if (!ctx) return;

    this.outputNode = ctx.createGain();
    this.outputNode.gain.value = 0.8;
  }

  getOutput(): GainNode | null {
    return this.outputNode;
  }

  setVolume(volume: number): void {
    if (this.outputNode) {
      this.outputNode.gain.value = Math.max(0, Math.min(1, volume));
    }
  }

  setPlaybackMode(mode: PlaybackMode): void {
    this.playbackMode = mode;
  }

  /**
   * Load a sample from the library into the cache
   */
  async loadSample(sampleId: string): Promise<void> {
    if (this.isLoading && this.currentSampleId === sampleId) {
      return this.loadPromise!;
    }

    this.currentSampleId = sampleId;
    this.isLoading = true;

    const cache = getAudioBufferCache();

    this.loadPromise = (async () => {
      try {
        // Use cache's load method with a loader function
        await cache.load(sampleId, async () => {
          // Load from file system
          const file = await getSampleFile(sampleId);
          if (!file) {
            throw new Error(`Sample file not found: ${sampleId}`);
          }

          const ctx = getAudioContext();
          if (!ctx) {
            throw new Error('AudioContext not available');
          }

          const arrayBuffer = await file.arrayBuffer();
          return await ctx.decodeAudioData(arrayBuffer);
        });

        this.isLoading = false;
      } catch (err) {
        this.isLoading = false;
        console.error('Failed to load sample:', err);
        throw err;
      }
    })();

    return this.loadPromise;
  }

  /**
   * Trigger sample playback
   */
  async trigger(velocity: number = 1.0): Promise<void> {
    if (!this.currentSampleId) {
      console.warn('No sample loaded');
      return;
    }

    const ctx = getAudioContext();
    if (!ctx || !this.outputNode) {
      return;
    }

    const cache = getAudioBufferCache();

    // Ensure sample is loaded
    let audioBuffer = cache.get(this.currentSampleId);
    if (!audioBuffer) {
      try {
        await this.loadSample(this.currentSampleId);
        audioBuffer = cache.get(this.currentSampleId);
      } catch {
        console.error('Failed to load sample for playback');
        return;
      }
    }

    if (!audioBuffer) {
      console.error('AudioBuffer still null after load');
      return;
    }

    // Stop any existing playback of the same sample (in hold mode)
    if (this.playbackMode === 'hold') {
      this.stopPlayback(this.currentSampleId);
    }

    // Create playback nodes
    const source = ctx.createBufferSource();
    source.buffer = audioBuffer;
    source.loop = this.playbackMode === 'loop';

    const gainNode = ctx.createGain();
    gainNode.gain.value = velocity;

    source.connect(gainNode);
    gainNode.connect(this.outputNode);

    // Track active playback
    const playbackId = this.currentSampleId + '-' + Date.now();
    const playback: ActivePlayback = {
      source,
      gainNode,
      sampleId: this.currentSampleId,
    };

    this.activePlaybacks.set(playbackId, playback);

    // Handle playback end
    source.onended = () => {
      this.activePlaybacks.delete(playbackId);
      gainNode.disconnect();
    };

    source.start();
  }

  /**
   * Stop playback (for hold mode)
   */
  release(): void {
    if (this.playbackMode !== 'hold' && this.playbackMode !== 'loop') {
      return;
    }

    if (this.currentSampleId) {
      this.stopPlayback(this.currentSampleId);
    }
  }

  /**
   * Stop all playback of a specific sample
   */
  private stopPlayback(sampleId: string): void {
    const ctx = getAudioContext();
    if (!ctx) return;

    this.activePlaybacks.forEach((playback, id) => {
      if (playback.sampleId === sampleId) {
        // Fade out to avoid clicks
        const now = ctx.currentTime;
        playback.gainNode.gain.setTargetAtTime(0, now, 0.02);

        // Stop after fade
        try {
          playback.source.stop(now + 0.1);
        } catch {
          // Already stopped
        }

        this.activePlaybacks.delete(id);
      }
    });
  }

  /**
   * Stop all playback immediately
   */
  stopAll(): void {
    const ctx = getAudioContext();
    if (!ctx) return;

    this.activePlaybacks.forEach((playback, id) => {
      try {
        playback.source.stop();
      } catch {
        // Already stopped
      }
      playback.gainNode.disconnect();
      this.activePlaybacks.delete(id);
    });
  }

  /**
   * Check if currently playing
   */
  isPlaying(): boolean {
    return this.activePlaybacks.size > 0;
  }

  /**
   * Get current sample ID
   */
  getCurrentSampleId(): string | null {
    return this.currentSampleId;
  }

  /**
   * Disconnect and cleanup
   */
  disconnect(): void {
    this.stopAll();

    if (this.outputNode) {
      this.outputNode.disconnect();
      this.outputNode = null;
    }

    this.currentSampleId = null;
    this.loadPromise = null;
  }
}

// Factory function for creating adapters
export function createLocalSampleAdapter(options?: LocalSampleAdapterOptions): LocalSampleAdapter {
  return new LocalSampleAdapter(options);
}
