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
import { getSampleFile } from '../../store/libraryStore';

export type PlaybackMode = 'oneshot' | 'loop' | 'hold';

// Error types for better error handling and UI feedback
export type SampleLoadErrorCode = 'FILE_NOT_FOUND' | 'PERMISSION_DENIED' | 'DECODE_ERROR' | 'CONTEXT_UNAVAILABLE';

export class SampleLoadError extends Error {
  readonly code: SampleLoadErrorCode;
  readonly sampleId: string;

  constructor(code: SampleLoadErrorCode, sampleId: string, message?: string) {
    super(message ?? `Sample load failed [${code}]: ${sampleId}`);
    this.name = 'SampleLoadError';
    this.code = code;
    this.sampleId = sampleId;
  }
}

export interface LocalSampleAdapterOptions {
  playbackMode?: PlaybackMode;
  volume?: number;
  maxConcurrentPlaybacks?: number;
}

interface ActivePlayback {
  source: AudioBufferSourceNode;
  gainNode: GainNode;
  sampleId: string;
}

export class LocalSampleAdapter {
  private outputNode: GainNode | null = null;
  private activePlaybacks: Map<string, ActivePlayback> = new Map();
  private _playbackOrder: string[] = []; // FIFO tracking for voice stealing
  private currentSampleId: string | null = null;
  private playbackMode: PlaybackMode = 'oneshot';
  private _maxConcurrentPlaybacks: number = 16;
  // Track loading promises per sampleId to prevent race conditions when switching samples
  private loadingPromises: Map<string, Promise<void>> = new Map();

  constructor(options: LocalSampleAdapterOptions = {}) {
    this.playbackMode = options.playbackMode ?? 'oneshot';
    this._maxConcurrentPlaybacks = options.maxConcurrentPlaybacks ?? 16;
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
    // If already loading this specific sample, return the existing promise
    const existingPromise = this.loadingPromises.get(sampleId);
    if (existingPromise) {
      this.currentSampleId = sampleId;
      return existingPromise;
    }

    this.currentSampleId = sampleId;
    const cache = getAudioBufferCache();

    const loadPromise = (async () => {
      try {
        // Use cache's load method with a loader function
        await cache.load(sampleId, async () => {
          // Load from file system
          let file: File | null;
          try {
            file = await getSampleFile(sampleId);
          } catch (err) {
            // Check for permission errors (File System Access API)
            if (err instanceof DOMException && err.name === 'NotAllowedError') {
              throw new SampleLoadError('PERMISSION_DENIED', sampleId,
                'Permission denied - please grant file access when prompted');
            }
            if (err instanceof DOMException && err.name === 'NotFoundError') {
              throw new SampleLoadError('FILE_NOT_FOUND', sampleId,
                'File not found - it may have been moved or deleted');
            }
            // Re-throw unknown errors with context
            throw new SampleLoadError('FILE_NOT_FOUND', sampleId,
              `Failed to access file: ${err instanceof Error ? err.message : 'Unknown error'}`);
          }

          if (!file) {
            throw new SampleLoadError('FILE_NOT_FOUND', sampleId,
              'Sample file not found in library');
          }

          const ctx = getAudioContext();
          if (!ctx) {
            throw new SampleLoadError('CONTEXT_UNAVAILABLE', sampleId,
              'Audio context not available - click anywhere to enable audio');
          }

          let arrayBuffer: ArrayBuffer;
          try {
            arrayBuffer = await file.arrayBuffer();
          } catch (err) {
            throw new SampleLoadError('FILE_NOT_FOUND', sampleId,
              `Failed to read file: ${err instanceof Error ? err.message : 'Unknown error'}`);
          }

          try {
            return await ctx.decodeAudioData(arrayBuffer);
          } catch (err) {
            throw new SampleLoadError('DECODE_ERROR', sampleId,
              'Failed to decode audio - file may be corrupted or unsupported format');
          }
        });
      } finally {
        // Clean up the loading promise when done (success or failure)
        this.loadingPromises.delete(sampleId);
      }
    })();

    this.loadingPromises.set(sampleId, loadPromise);
    return loadPromise;
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

    // Voice stealing: stop oldest playback if at limit
    if (this.activePlaybacks.size >= this._maxConcurrentPlaybacks) {
      this.stealOldestPlayback();
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
    this._playbackOrder.push(playbackId);

    // Handle playback end
    source.onended = () => {
      this.activePlaybacks.delete(playbackId);
      this._playbackOrder = this._playbackOrder.filter(id => id !== playbackId);
      gainNode.disconnect();
    };

    source.start();
  }

  /**
   * Steal the oldest playback to make room for a new one
   */
  private stealOldestPlayback(): void {
    const ctx = getAudioContext();
    if (!ctx || this._playbackOrder.length === 0) return;

    const oldestId = this._playbackOrder.shift();
    if (!oldestId) return;

    const playback = this.activePlaybacks.get(oldestId);
    if (playback) {
      // Quick fade out to avoid clicks
      const now = ctx.currentTime;
      playback.gainNode.gain.setTargetAtTime(0, now, 0.01);
      try {
        playback.source.stop(now + 0.05);
      } catch {
        // Already stopped
      }
      this.activePlaybacks.delete(oldestId);
    }
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

    const idsToRemove: string[] = [];
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
        idsToRemove.push(id);
      }
    });
    // Clean up playback order
    this._playbackOrder = this._playbackOrder.filter(id => !idsToRemove.includes(id));
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
    this._playbackOrder = [];
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
    this.loadingPromises.clear();
  }
}

// Factory function for creating adapters
export function createLocalSampleAdapter(options?: LocalSampleAdapterOptions): LocalSampleAdapter {
  return new LocalSampleAdapter(options);
}
