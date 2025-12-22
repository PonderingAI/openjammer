/**
 * Sample Library Store - Manages local audio sample libraries
 *
 * Provides:
 * - Library registration and management
 * - Sample metadata storage with IndexedDB persistence
 * - Search and filtering
 * - Missing file detection and relinking
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { get as idbGet, set as idbSet, del as idbDel } from 'idb-keyval';
import type { SampleMetadata } from '../utils/audioMetadata';
import {
  persistHandle,
  restoreHandle,
  removeHandle,
  verifyPermission,
  walkDirectoryWithProgress,
  type FileEntry,
} from '../utils/fileSystemAccess';
import { createSampleMetadata, generateWaveformFromFile, peaksToBase64 } from '../utils/audioMetadata';
import { getAudioContext } from '../audio/AudioEngine';

// ============================================================================
// Types
// ============================================================================

export interface SampleLibrary {
  id: string;
  name: string;
  rootPath: string;
  handleKey: string; // Key for IndexedDB handle storage
  lastScanAt: number;
  sampleCount: number;
  status: 'ready' | 'scanning' | 'permission_needed' | 'error';
  errorMessage?: string;
}

export interface ScanProgress {
  libraryId: string;
  current: number;
  total: number;
  currentFile?: string;
  phase: 'counting' | 'scanning' | 'waveforms' | 'complete';
}

export interface LibrarySample extends SampleMetadata {
  /** Status for this sample */
  status: 'available' | 'missing' | 'loading';
  /** Handle for direct file access */
  handleKey?: string;
}

// Storage prefixes for IndexedDB keys
const WAVEFORM_PREFIX = 'openjammer-waveform-';
const SAMPLE_HANDLE_PREFIX = 'openjammer-sample-handle-';

async function storeWaveform(sampleId: string, peaks: Float32Array): Promise<void> {
  await idbSet(WAVEFORM_PREFIX + sampleId, peaksToBase64(peaks));
}

async function storeSampleHandle(sampleId: string, handle: FileSystemFileHandle): Promise<string> {
  const key = SAMPLE_HANDLE_PREFIX + sampleId;
  await idbSet(key, handle);
  return key;
}

export async function getWaveform(sampleId: string): Promise<string | null> {
  try {
    return await idbGet<string>(WAVEFORM_PREFIX + sampleId) || null;
  } catch {
    return null;
  }
}

// ============================================================================
// Store Interface
// ============================================================================

interface SampleLibraryStore {
  // Libraries
  libraries: Record<string, SampleLibrary>;
  samples: Record<string, LibrarySample>;

  // Scan progress
  scanProgress: ScanProgress | null;

  // UI State
  selectedLibraryId: string | null;
  searchQuery: string;
  filterTags: string[];
  filterBpmRange: [number, number] | null;

  // Actions - Library Management
  addLibrary: (handle: FileSystemDirectoryHandle) => Promise<string>;
  removeLibrary: (libraryId: string) => Promise<void>;
  scanLibrary: (libraryId: string, generateWaveforms?: boolean) => Promise<void>;
  rescanLibrary: (libraryId: string) => Promise<void>;
  verifyLibraryAccess: (libraryId: string) => Promise<boolean>;

  // Actions - Sample Management
  updateSample: (sampleId: string, updates: Partial<LibrarySample>) => void;
  toggleFavorite: (sampleId: string) => void;
  setRating: (sampleId: string, rating: number) => void;
  addTag: (sampleId: string, tag: string) => void;
  removeTag: (sampleId: string, tag: string) => void;

  // Actions - Missing Files
  checkMissingSamples: (libraryId: string) => Promise<string[]>;
  relinkSample: (sampleId: string, newHandle: FileSystemFileHandle) => Promise<void>;
  relinkLibrary: (libraryId: string, newRootHandle: FileSystemDirectoryHandle) => Promise<void>;

  // Queries
  getSamplesByLibrary: (libraryId: string) => LibrarySample[];
  searchSamples: (query: string) => LibrarySample[];
  filterSamples: (options: {
    tags?: string[];
    bpmRange?: [number, number];
    favorite?: boolean;
    libraryId?: string;
  }) => LibrarySample[];

  // UI Actions
  setSelectedLibrary: (libraryId: string | null) => void;
  setSearchQuery: (query: string) => void;
  setFilterTags: (tags: string[]) => void;
  setFilterBpmRange: (range: [number, number] | null) => void;

  // Restore libraries on startup
  restoreLibraries: () => Promise<void>;

  // Project integration
  addProjectSamplesLibrary: (projectHandle: FileSystemDirectoryHandle, projectName: string) => Promise<string | null>;
  removeProjectLibrary: (projectName: string) => Promise<void>;
  projectLibraryId: string | null;
}

// ============================================================================
// Store Implementation
// ============================================================================

export const useSampleLibraryStore = create<SampleLibraryStore>()(
  persist(
    (set, get) => ({
      // Initial state
      libraries: {},
      samples: {},
      scanProgress: null,
      selectedLibraryId: null,
      searchQuery: '',
      filterTags: [],
      filterBpmRange: null,
      projectLibraryId: null,

      // ========================================
      // Library Management
      // ========================================

      addLibrary: async (handle: FileSystemDirectoryHandle) => {
        const id = crypto.randomUUID();
        const handleKey = `library-${id}`;

        // Store handle in IndexedDB
        await persistHandle(handleKey, handle);

        const library: SampleLibrary = {
          id,
          name: handle.name,
          rootPath: handle.name, // Just the folder name (no full path for security)
          handleKey,
          lastScanAt: 0,
          sampleCount: 0,
          status: 'ready',
        };

        set(state => ({
          libraries: { ...state.libraries, [id]: library },
          selectedLibraryId: id,
        }));

        return id;
      },

      removeLibrary: async (libraryId: string) => {
        const library = get().libraries[libraryId];
        if (!library) return;

        // Remove library handle
        await removeHandle(library.handleKey);

        // Get samples to remove
        const samplesToRemove = Object.values(get().samples)
          .filter(s => s.libraryId === libraryId);

        // Remove waveforms and sample handles
        for (const sample of samplesToRemove) {
          await idbDel(WAVEFORM_PREFIX + sample.id);
          if (sample.handleKey) {
            await idbDel(sample.handleKey);
          }
        }

        const sampleIdsToRemove = samplesToRemove.map(s => s.id);

        set(state => {
          const newLibraries = { ...state.libraries };
          delete newLibraries[libraryId];

          const newSamples = { ...state.samples };
          for (const sampleId of sampleIdsToRemove) {
            delete newSamples[sampleId];
          }

          return {
            libraries: newLibraries,
            samples: newSamples,
            selectedLibraryId:
              state.selectedLibraryId === libraryId ? null : state.selectedLibraryId,
          };
        });
      },

      scanLibrary: async (libraryId: string, generateWaveforms = true) => {
        // Atomically check and set scanning status to prevent race conditions
        // This closes the TOCTOU race window by doing check-and-set in a single set() call
        let shouldProceed = false;
        set(state => {
          const library = state.libraries[libraryId];
          if (!library) {
            return state; // Library doesn't exist, no change
          }
          if (library.status === 'scanning') {
            console.warn(`[SampleLibrary] Library ${libraryId} is already being scanned`);
            return state; // Already scanning, no change
          }
          shouldProceed = true;
          return {
            libraries: {
              ...state.libraries,
              [libraryId]: { ...library, status: 'scanning' },
            },
          };
        });

        if (!shouldProceed) {
          return;
        }
        // Note: From here on, always use state.libraries[libraryId] in set() callbacks
        // to get the fresh library reference and avoid stale data

        // Restore handle - use fresh library reference to get handleKey
        const handleKey = get().libraries[libraryId]?.handleKey;
        if (!handleKey) {
          set(state => ({
            libraries: {
              ...state.libraries,
              [libraryId]: { ...state.libraries[libraryId], status: 'error', errorMessage: 'Library not found' },
            },
          }));
          return;
        }
        const handle = await restoreHandle(handleKey);
        if (!handle) {
          set(state => ({
            libraries: {
              ...state.libraries,
              [libraryId]: { ...state.libraries[libraryId], status: 'error', errorMessage: 'Handle not found' },
            },
          }));
          return;
        }

        // Verify permission
        const hasPermission = await verifyPermission(handle);
        if (!hasPermission) {
          set(state => ({
            libraries: {
              ...state.libraries,
              [libraryId]: { ...state.libraries[libraryId], status: 'permission_needed' },
            },
          }));
          return;
        }

        // Initialize scan progress (status already set to 'scanning' above)
        set({
          scanProgress: {
            libraryId,
            current: 0,
            total: 0,
            phase: 'counting',
          },
        });

        const newSamples: Record<string, LibrarySample> = {};
        let audioContext: AudioContext | null = null;

        // Track written data for cleanup on error
        const writtenHandleKeys: string[] = [];
        const writtenWaveformIds: string[] = [];

        // Track per-sample errors for debugging
        const sampleErrors: Array<{ file: string; error: string }> = [];

        try {
          // Get audio context for waveform generation
          if (generateWaveforms) {
            audioContext = getAudioContext();
          }

          await walkDirectoryWithProgress(
            handle,
            async (entry: FileEntry, index: number, total: number) => {
              // Update progress
              set({
                scanProgress: {
                  libraryId,
                  current: index + 1,
                  total,
                  currentFile: entry.relativePath,
                  phase: 'scanning',
                },
              });

              // Wrap per-sample processing to continue on individual errors
              try {
                // Create sample metadata
                const sampleId = crypto.randomUUID();
                const metadata = await createSampleMetadata(
                  sampleId,
                  entry.file,
                  entry.relativePath,
                  libraryId
                );

                // Store file handle for later access (using consistent prefix)
                const handleKey = await storeSampleHandle(sampleId, entry.handle);
                writtenHandleKeys.push(handleKey);

                // Generate waveform
                if (generateWaveforms && audioContext) {
                  try {
                    const peaks = await generateWaveformFromFile(entry.file, audioContext, 100);
                    if (peaks) {
                      await storeWaveform(sampleId, peaks);
                      writtenWaveformIds.push(sampleId);
                      metadata.hasWaveform = true;
                    }
                  } catch (waveformError) {
                    // Waveform generation failed - continue without waveform
                    console.warn(`[SampleLibrary] Waveform failed for ${entry.relativePath}:`, waveformError);
                  }
                }

                newSamples[sampleId] = {
                  ...metadata,
                  status: 'available',
                  handleKey,
                };
              } catch (sampleError) {
                // Log error but continue scanning
                const errorMessage = sampleError instanceof Error ? sampleError.message : 'Unknown error';
                sampleErrors.push({ file: entry.relativePath, error: errorMessage });
                console.warn(`[SampleLibrary] Failed to process ${entry.relativePath}:`, sampleError);
              }
            },
            {
              onProgress: (current, total) => {
                set({
                  scanProgress: {
                    libraryId,
                    current,
                    total,
                    phase: current === total ? 'complete' : 'scanning',
                  },
                });
              },
            }
          );

          // Log summary of errors if any
          if (sampleErrors.length > 0) {
            console.warn(`[SampleLibrary] ${sampleErrors.length} files failed to process:`, sampleErrors);
          }

          // Update state with all new samples - use fresh library reference
          set(state => ({
            libraries: {
              ...state.libraries,
              [libraryId]: {
                ...state.libraries[libraryId],
                status: 'ready',
                lastScanAt: Date.now(),
                sampleCount: Object.keys(newSamples).length,
                errorMessage: undefined, // Clear any previous error
              },
            },
            samples: { ...state.samples, ...newSamples },
            scanProgress: null,
          }));
        } catch (error) {
          console.error('Scan failed:', error);

          // Clean up orphaned handles and waveforms
          await Promise.all([
            ...writtenHandleKeys.map(k => idbDel(k).catch(() => {})),
            ...writtenWaveformIds.map(id => idbDel(WAVEFORM_PREFIX + id).catch(() => {})),
          ]);

          // Use fresh library reference in set() callback
          set(state => ({
            libraries: {
              ...state.libraries,
              [libraryId]: {
                ...state.libraries[libraryId],
                status: 'error',
                errorMessage: error instanceof Error ? error.message : 'Scan failed',
              },
            },
            scanProgress: null,
          }));
        }
      },

      rescanLibrary: async (libraryId: string) => {
        // Check library exists first
        if (!get().libraries[libraryId]) {
          console.warn(`[SampleLibrary] Cannot rescan: library ${libraryId} not found`);
          return;
        }

        // Remove existing samples for this library
        const samplesToRemove = Object.values(get().samples)
          .filter(s => s.libraryId === libraryId);

        // Clean up waveforms and handles from IndexedDB before rescanning
        // Wrap in try/catch so cleanup errors don't prevent rescan
        try {
          await Promise.all(
            samplesToRemove.flatMap(sample => [
              idbDel(WAVEFORM_PREFIX + sample.id).catch(() => {}),
              ...(sample.handleKey ? [idbDel(sample.handleKey).catch(() => {})] : []),
            ])
          );
        } catch (cleanupError) {
          console.warn('[SampleLibrary] Error during cleanup, continuing with rescan:', cleanupError);
        }

        set(state => {
          const newSamples = { ...state.samples };
          for (const sample of samplesToRemove) {
            delete newSamples[sample.id];
          }
          return { samples: newSamples };
        });

        // Scan again - scanLibrary handles its own errors
        await get().scanLibrary(libraryId);
      },

      verifyLibraryAccess: async (libraryId: string) => {
        const library = get().libraries[libraryId];
        if (!library) return false;

        const handle = await restoreHandle(library.handleKey);
        if (!handle) return false;

        return verifyPermission(handle, false);
      },

      // ========================================
      // Sample Management
      // ========================================

      updateSample: (sampleId: string, updates: Partial<LibrarySample>) => {
        set(state => ({
          samples: {
            ...state.samples,
            [sampleId]: { ...state.samples[sampleId], ...updates },
          },
        }));
      },

      toggleFavorite: (sampleId: string) => {
        const sample = get().samples[sampleId];
        if (sample) {
          get().updateSample(sampleId, { favorite: !sample.favorite });
        }
      },

      setRating: (sampleId: string, rating: number) => {
        get().updateSample(sampleId, { rating: Math.max(1, Math.min(5, rating)) });
      },

      addTag: (sampleId: string, tag: string) => {
        const sample = get().samples[sampleId];
        if (sample && !sample.tags.includes(tag)) {
          get().updateSample(sampleId, { tags: [...sample.tags, tag] });
        }
      },

      removeTag: (sampleId: string, tag: string) => {
        const sample = get().samples[sampleId];
        if (sample) {
          get().updateSample(sampleId, { tags: sample.tags.filter(t => t !== tag) });
        }
      },

      // ========================================
      // Missing Files
      // ========================================

      checkMissingSamples: async (libraryId: string) => {
        const library = get().libraries[libraryId];
        if (!library) return [];

        const handle = await restoreHandle(library.handleKey);
        if (!handle) {
          // Mark all samples as missing
          const missingSampleIds = Object.values(get().samples)
            .filter(s => s.libraryId === libraryId)
            .map(s => s.id);

          set(state => {
            const newSamples = { ...state.samples };
            for (const id of missingSampleIds) {
              newSamples[id] = { ...newSamples[id], status: 'missing' };
            }
            return { samples: newSamples };
          });

          return missingSampleIds;
        }

        // Check each sample in parallel (batched to avoid overwhelming the file system)
        const samples = Object.values(get().samples).filter(s => s.libraryId === libraryId);
        const BATCH_SIZE = 50;

        const checkSample = async (sample: LibrarySample): Promise<string | null> => {
          try {
            const parts = sample.relativePath.split('/').filter(Boolean);
            let current: FileSystemDirectoryHandle = handle;

            // Navigate directories
            for (let i = 0; i < parts.length - 1; i++) {
              current = await current.getDirectoryHandle(parts[i]);
            }

            // Try to get file
            await current.getFileHandle(parts[parts.length - 1]);
            return null; // File exists
          } catch {
            return sample.id; // File missing
          }
        };

        // Process in batches to avoid overwhelming the file system
        const missingSampleIds: string[] = [];
        for (let i = 0; i < samples.length; i += BATCH_SIZE) {
          const batch = samples.slice(i, i + BATCH_SIZE);
          const results = await Promise.all(batch.map(checkSample));
          missingSampleIds.push(...results.filter((id): id is string => id !== null));
        }

        // Update sample statuses
        set(state => {
          const newSamples = { ...state.samples };
          for (const id of Object.keys(newSamples)) {
            if (newSamples[id].libraryId === libraryId) {
              newSamples[id] = {
                ...newSamples[id],
                status: missingSampleIds.includes(id) ? 'missing' : 'available',
              };
            }
          }
          return { samples: newSamples };
        });

        return missingSampleIds;
      },

      relinkSample: async (sampleId: string, newHandle: FileSystemFileHandle) => {
        // Check if sample exists first
        const sample = get().samples[sampleId];
        if (!sample) {
          console.warn(`[SampleLibrary] Cannot relink non-existent sample: ${sampleId}`);
          return;
        }

        try {
          const file = await newHandle.getFile();

          // Get the old handle key to clean up orphaned data
          const oldHandleKey = sample.handleKey;

          // Update handle in IndexedDB (using consistent prefix)
          const handleKey = await storeSampleHandle(sampleId, newHandle);

          // Clean up old handle if it's different from the new one
          if (oldHandleKey && oldHandleKey !== handleKey) {
            await idbDel(oldHandleKey).catch(() => {});
          }

          // Update sample metadata
          get().updateSample(sampleId, {
            fileName: file.name,
            fileSize: file.size,
            lastModified: file.lastModified,
            status: 'available',
            handleKey,
          });
        } catch (err) {
          console.error(`[SampleLibrary] Failed to relink sample ${sampleId}:`, err);
          // Mark sample as missing since we couldn't access the file
          get().updateSample(sampleId, {
            status: 'missing',
          });
        }
      },

      relinkLibrary: async (libraryId: string, newRootHandle: FileSystemDirectoryHandle) => {
        const library = get().libraries[libraryId];
        if (!library) return;

        // Update handle
        await persistHandle(library.handleKey, newRootHandle);

        // Update library
        set(state => ({
          libraries: {
            ...state.libraries,
            [libraryId]: {
              ...library,
              name: newRootHandle.name,
              rootPath: newRootHandle.name,
              status: 'ready',
              errorMessage: undefined,
            },
          },
        }));

        // Check for missing samples
        await get().checkMissingSamples(libraryId);
      },

      // ========================================
      // Queries
      // ========================================

      getSamplesByLibrary: (libraryId: string) => {
        return Object.values(get().samples).filter(s => s.libraryId === libraryId);
      },

      searchSamples: (query: string) => {
        if (!query.trim()) return Object.values(get().samples);

        const lowerQuery = query.toLowerCase();
        return Object.values(get().samples).filter(
          s =>
            s.fileName.toLowerCase().includes(lowerQuery) ||
            s.relativePath.toLowerCase().includes(lowerQuery) ||
            s.tags.some(t => t.toLowerCase().includes(lowerQuery))
        );
      },

      filterSamples: (options) => {
        let samples = Object.values(get().samples);

        if (options.libraryId) {
          samples = samples.filter(s => s.libraryId === options.libraryId);
        }

        if (options.tags && options.tags.length > 0) {
          samples = samples.filter(s => options.tags!.every(t => s.tags.includes(t)));
        }

        if (options.bpmRange) {
          const [min, max] = options.bpmRange;
          samples = samples.filter(s => s.bpm !== undefined && s.bpm >= min && s.bpm <= max);
        }

        if (options.favorite) {
          samples = samples.filter(s => s.favorite);
        }

        return samples;
      },

      // ========================================
      // UI Actions
      // ========================================

      setSelectedLibrary: (libraryId) => set({ selectedLibraryId: libraryId }),
      setSearchQuery: (query) => set({ searchQuery: query }),
      setFilterTags: (tags) => set({ filterTags: tags }),
      setFilterBpmRange: (range) => set({ filterBpmRange: range }),

      // ========================================
      // Restore on Startup
      // ========================================

      restoreLibraries: async () => {
        const libraries = get().libraries;

        for (const library of Object.values(libraries)) {
          // Check if handle still exists
          const handle = await restoreHandle(library.handleKey);
          if (!handle) {
            set(state => ({
              libraries: {
                ...state.libraries,
                [library.id]: { ...library, status: 'error', errorMessage: 'Handle not found' },
              },
            }));
            continue;
          }

          // Check permission without requesting
          const hasPermission = await verifyPermission(handle, false);
          if (!hasPermission) {
            set(state => ({
              libraries: {
                ...state.libraries,
                [library.id]: { ...library, status: 'permission_needed' },
              },
            }));
          }
        }
      },

      // ========================================
      // Project Integration
      // ========================================

      addProjectSamplesLibrary: async (projectHandle: FileSystemDirectoryHandle, projectName: string) => {
        try {
          // Get or create audio/samples directory
          const audioDir = await projectHandle.getDirectoryHandle('audio', { create: true });
          const samplesDir = await audioDir.getDirectoryHandle('samples', { create: true });

          // Check if we already have this project's library
          const existingLibrary = Object.values(get().libraries).find(
            lib => lib.name === `${projectName} (Samples)`
          );

          if (existingLibrary) {
            // Update the existing library's handle
            await persistHandle(existingLibrary.handleKey, samplesDir);
            set({
              projectLibraryId: existingLibrary.id,
              selectedLibraryId: existingLibrary.id,
            });
            return existingLibrary.id;
          }

          // Create new library for project samples
          const id = crypto.randomUUID();
          const handleKey = `library-project-${id}`;

          await persistHandle(handleKey, samplesDir);

          const library: SampleLibrary = {
            id,
            name: `${projectName} (Samples)`,
            rootPath: `${projectName}/audio/samples`,
            handleKey,
            lastScanAt: 0,
            sampleCount: 0,
            status: 'ready',
          };

          set(state => ({
            libraries: { ...state.libraries, [id]: library },
            projectLibraryId: id,
            selectedLibraryId: id,
          }));

          // Auto-scan the library and await completion
          // This allows callers to know when scan is done
          try {
            await get().scanLibrary(id, true);
          } catch (scanError) {
            console.warn('[SampleLibrary] Project library scan failed:', scanError);
            // Don't fail the whole operation - library is still registered
          }

          return id;
        } catch (error) {
          console.error('Failed to add project samples library:', error);
          return null;
        }
      },

      removeProjectLibrary: async (projectName: string) => {
        const library = Object.values(get().libraries).find(
          lib => lib.name === `${projectName} (Samples)`
        );

        if (library) {
          // Don't fully remove - just clear the project reference
          // The library stays for when the project is reopened
          set(state => ({
            projectLibraryId: null,
            selectedLibraryId: state.selectedLibraryId === library.id ? null : state.selectedLibraryId,
          }));
        } else {
          set({ projectLibraryId: null });
        }
      },
    }),
    {
      name: 'openjammer-sample-library',
      storage: createJSONStorage(() => localStorage),
      partialize: state => ({
        libraries: state.libraries,
        samples: state.samples,
      }),
    }
  )
);

// ============================================================================
// Helper: Get sample file for playback
// ============================================================================

export async function getSampleFile(sampleId: string): Promise<File | null> {
  const sample = useSampleLibraryStore.getState().samples[sampleId];
  if (!sample || !sample.handleKey) return null;

  try {
    const handle = await idbGet<FileSystemFileHandle>(sample.handleKey);
    if (!handle) return null;

    // Verify permission
    const hasPermission = await verifyPermission(handle, false);
    if (!hasPermission) return null;

    return handle.getFile();
  } catch {
    return null;
  }
}
