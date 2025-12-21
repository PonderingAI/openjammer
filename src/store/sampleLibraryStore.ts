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

// Waveform storage (separate from metadata for efficiency)
const WAVEFORM_PREFIX = 'openjammer-waveform-';

async function storeWaveform(sampleId: string, peaks: Float32Array): Promise<void> {
  await idbSet(WAVEFORM_PREFIX + sampleId, peaksToBase64(peaks));
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

        // Remove handle
        await removeHandle(library.handleKey);

        // Remove samples
        const samplesToRemove = Object.values(get().samples)
          .filter(s => s.libraryId === libraryId)
          .map(s => s.id);

        // Remove waveforms
        for (const sampleId of samplesToRemove) {
          await idbDel(WAVEFORM_PREFIX + sampleId);
        }

        set(state => {
          const newLibraries = { ...state.libraries };
          delete newLibraries[libraryId];

          const newSamples = { ...state.samples };
          for (const sampleId of samplesToRemove) {
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
        const library = get().libraries[libraryId];
        if (!library) return;

        // Restore handle
        const handle = await restoreHandle(library.handleKey);
        if (!handle) {
          set(state => ({
            libraries: {
              ...state.libraries,
              [libraryId]: { ...library, status: 'error', errorMessage: 'Handle not found' },
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
              [libraryId]: { ...library, status: 'permission_needed' },
            },
          }));
          return;
        }

        // Start scanning
        set(state => ({
          libraries: {
            ...state.libraries,
            [libraryId]: { ...library, status: 'scanning' },
          },
          scanProgress: {
            libraryId,
            current: 0,
            total: 0,
            phase: 'counting',
          },
        }));

        const newSamples: Record<string, LibrarySample> = {};
        let audioContext: AudioContext | null = null;

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

              // Create sample metadata
              const sampleId = crypto.randomUUID();
              const metadata = await createSampleMetadata(
                sampleId,
                entry.file,
                entry.relativePath,
                libraryId
              );

              // Store file handle for later access
              const handleKey = `sample-${sampleId}`;
              await idbSet(handleKey, entry.handle);

              // Generate waveform
              if (generateWaveforms && audioContext) {
                const peaks = await generateWaveformFromFile(entry.file, audioContext, 100);
                if (peaks) {
                  await storeWaveform(sampleId, peaks);
                  metadata.hasWaveform = true;
                }
              }

              newSamples[sampleId] = {
                ...metadata,
                status: 'available',
                handleKey,
              };
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

          // Update state with all new samples
          set(state => ({
            libraries: {
              ...state.libraries,
              [libraryId]: {
                ...library,
                status: 'ready',
                lastScanAt: Date.now(),
                sampleCount: Object.keys(newSamples).length,
              },
            },
            samples: { ...state.samples, ...newSamples },
            scanProgress: null,
          }));
        } catch (error) {
          console.error('Scan failed:', error);
          set(state => ({
            libraries: {
              ...state.libraries,
              [libraryId]: {
                ...library,
                status: 'error',
                errorMessage: error instanceof Error ? error.message : 'Scan failed',
              },
            },
            scanProgress: null,
          }));
        }
      },

      rescanLibrary: async (libraryId: string) => {
        // Remove existing samples for this library
        const samplesToRemove = Object.values(get().samples)
          .filter(s => s.libraryId === libraryId)
          .map(s => s.id);

        set(state => {
          const newSamples = { ...state.samples };
          for (const sampleId of samplesToRemove) {
            delete newSamples[sampleId];
          }
          return { samples: newSamples };
        });

        // Scan again
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

        // Check each sample
        const missingSampleIds: string[] = [];
        const samples = Object.values(get().samples).filter(s => s.libraryId === libraryId);

        for (const sample of samples) {
          try {
            // Try to access the file
            const parts = sample.relativePath.split('/').filter(Boolean);
            let current: FileSystemDirectoryHandle = handle;

            // Navigate directories
            for (let i = 0; i < parts.length - 1; i++) {
              current = await current.getDirectoryHandle(parts[i]);
            }

            // Try to get file
            await current.getFileHandle(parts[parts.length - 1]);
          } catch {
            missingSampleIds.push(sample.id);
          }
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
        const file = await newHandle.getFile();

        // Update handle in IndexedDB
        const handleKey = `sample-${sampleId}`;
        await idbSet(handleKey, newHandle);

        // Update sample metadata
        const sample = get().samples[sampleId];
        if (sample) {
          get().updateSample(sampleId, {
            fileName: file.name,
            fileSize: file.size,
            lastModified: file.lastModified,
            status: 'available',
            handleKey,
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
