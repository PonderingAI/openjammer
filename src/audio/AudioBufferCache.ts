/**
 * LRU Cache for AudioBuffers
 *
 * Manages memory efficiently for large sample libraries by:
 * - Limiting total memory usage to a configurable budget
 * - Evicting least-recently-used samples when budget exceeded
 * - Tracking memory usage accurately
 */

import { LRUCache } from 'lru-cache';

// ============================================================================
// Types
// ============================================================================

export interface CachedSample {
  buffer: AudioBuffer;
  sampleId: string;
  loadedAt: number;
}

export interface CacheStats {
  used: number; // bytes
  max: number; // bytes
  entries: number;
  hitRate: number;
}

export interface LoadOptions {
  /** Priority for cache ordering */
  priority?: 'high' | 'normal' | 'low';
}

// ============================================================================
// AudioBuffer Size Calculation
// ============================================================================

/**
 * Calculate the memory size of an AudioBuffer in bytes
 * AudioBuffers store 32-bit floats (4 bytes per sample)
 */
export function calculateAudioBufferSize(buffer: AudioBuffer): number {
  return buffer.length * buffer.numberOfChannels * 4;
}

/**
 * Estimate memory size for audio with given parameters
 */
export function estimateAudioSize(
  durationSeconds: number,
  sampleRate: number,
  channels: number
): number {
  const samples = Math.ceil(durationSeconds * sampleRate);
  return samples * channels * 4;
}

// ============================================================================
// AudioBuffer Cache
// ============================================================================

const DEFAULT_MAX_BYTES = 100 * 1024 * 1024; // 100 MB
const DEFAULT_MAX_ENTRIES = 500;
const DEFAULT_TTL = 30 * 60 * 1000; // 30 minutes

export class AudioBufferCache {
  private cache: LRUCache<string, CachedSample>;
  private loadingPromises = new Map<string, Promise<AudioBuffer>>();
  private hits = 0;
  private misses = 0;

  constructor(options: { maxBytes?: number; maxEntries?: number; ttl?: number } = {}) {
    const { maxBytes = DEFAULT_MAX_BYTES, maxEntries = DEFAULT_MAX_ENTRIES, ttl = DEFAULT_TTL } = options;

    this.cache = new LRUCache<string, CachedSample>({
      max: maxEntries,
      maxSize: maxBytes,

      // Calculate size of each cached sample
      sizeCalculation: (sample: CachedSample) => {
        return calculateAudioBufferSize(sample.buffer);
      },

      // Optional TTL for entries
      ttl,

      // Cleanup callback when samples are evicted
      dispose: (sample: CachedSample, key: string, reason: string) => {
        if (process.env.NODE_ENV === 'development') {
          console.debug(
            `[AudioBufferCache] Evicting ${key} (${reason}), ` +
              `freeing ${formatBytes(calculateAudioBufferSize(sample.buffer))}`
          );
        }
      },
    });
  }

  /**
   * Get a cached AudioBuffer
   */
  get(sampleId: string): AudioBuffer | undefined {
    const sample = this.cache.get(sampleId);
    if (sample) {
      this.hits++;
      return sample.buffer;
    }
    this.misses++;
    return undefined;
  }

  /**
   * Check if a sample is cached
   */
  has(sampleId: string): boolean {
    return this.cache.has(sampleId);
  }

  /**
   * Store an AudioBuffer in the cache
   */
  set(sampleId: string, buffer: AudioBuffer): void {
    this.cache.set(sampleId, {
      buffer,
      sampleId,
      loadedAt: Date.now(),
    });
  }

  /**
   * Remove a sample from the cache
   */
  delete(sampleId: string): boolean {
    return this.cache.delete(sampleId);
  }

  /**
   * Load a sample, using cache if available
   */
  async load(
    sampleId: string,
    loader: () => Promise<AudioBuffer>,
    _options: LoadOptions = {}
  ): Promise<AudioBuffer> {
    // Check cache first
    const cached = this.get(sampleId);
    if (cached) {
      return cached;
    }

    // Check if already loading (deduplicate concurrent requests)
    const existing = this.loadingPromises.get(sampleId);
    if (existing) {
      return existing;
    }

    // Load the sample
    const promise = loader()
      .then(buffer => {
        this.set(sampleId, buffer);
        this.loadingPromises.delete(sampleId);
        return buffer;
      })
      .catch(error => {
        this.loadingPromises.delete(sampleId);
        throw error;
      });

    this.loadingPromises.set(sampleId, promise);
    return promise;
  }

  /**
   * Preload multiple samples without blocking
   */
  preload(
    sampleIds: string[],
    loaderFactory: (sampleId: string) => () => Promise<AudioBuffer>
  ): void {
    for (const sampleId of sampleIds) {
      if (!this.has(sampleId) && !this.loadingPromises.has(sampleId)) {
        this.load(sampleId, loaderFactory(sampleId)).catch(() => {
          // Ignore preload errors
        });
      }
    }
  }

  /**
   * Get cache statistics
   */
  getStats(): CacheStats {
    const totalRequests = this.hits + this.misses;
    return {
      used: this.cache.calculatedSize || 0,
      max: this.cache.maxSize || DEFAULT_MAX_BYTES,
      entries: this.cache.size,
      hitRate: totalRequests > 0 ? this.hits / totalRequests : 0,
    };
  }

  /**
   * Get memory usage in bytes
   */
  getMemoryUsage(): { used: number; max: number } {
    return {
      used: this.cache.calculatedSize || 0,
      max: this.cache.maxSize || DEFAULT_MAX_BYTES,
    };
  }

  /**
   * Clear all cached samples
   */
  clear(): void {
    this.cache.clear();
    this.loadingPromises.clear();
    this.hits = 0;
    this.misses = 0;
  }

  /**
   * Get all cached sample IDs
   */
  keys(): string[] {
    return [...this.cache.keys()];
  }

  /**
   * Iterate over all cached samples
   */
  *entries(): IterableIterator<[string, AudioBuffer]> {
    for (const [key, sample] of this.cache.entries()) {
      yield [key, sample.buffer];
    }
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let globalCache: AudioBufferCache | null = null;

/**
 * Get the global AudioBuffer cache instance
 */
export function getAudioBufferCache(): AudioBufferCache {
  if (!globalCache) {
    globalCache = new AudioBufferCache();
  }
  return globalCache;
}

/**
 * Reset the global cache (for testing)
 */
export function resetAudioBufferCache(): void {
  if (globalCache) {
    globalCache.clear();
  }
  globalCache = null;
}

// ============================================================================
// Utilities
// ============================================================================

/**
 * Format bytes as human-readable string
 */
function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}
