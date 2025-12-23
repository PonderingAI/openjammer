/**
 * Library Store - Manages local audio libraries
 *
 * Provides:
 * - Library registration and management
 * - Item metadata storage with IndexedDB persistence
 * - Tag management with pinned tags support
 * - Search and filtering
 * - Missing file detection and relinking
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
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
import { audioBufferToWAV, generateRecordingFilename } from '../audio/WavEncoder';

// ============================================================================
// Types
// ============================================================================

export interface Library {
  id: string;
  name: string;
  rootPath: string;
  handleKey: string; // Key for IndexedDB handle storage
  lastScanAt: number;
  itemCount: number;
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

export interface LibraryItem extends SampleMetadata {
  /** Status for this item */
  status: 'available' | 'missing' | 'loading';
  /** Handle for direct file access */
  handleKey?: string;
}

// Storage prefixes for IndexedDB keys
const WAVEFORM_PREFIX = 'openjammer-waveform-';
const ITEM_HANDLE_PREFIX = 'openjammer-sample-handle-';

// Helper for logging IndexedDB errors in development (I10)
function logIdbError(operation: string, error: unknown): void {
  if (process.env.NODE_ENV === 'development') {
    console.warn(`[Library] IndexedDB ${operation} failed:`, error);
  }
}

async function storeWaveform(itemId: string, peaks: Float32Array): Promise<void> {
  await idbSet(WAVEFORM_PREFIX + itemId, peaksToBase64(peaks));
}

async function storeItemHandle(itemId: string, handle: FileSystemFileHandle): Promise<string> {
  const key = ITEM_HANDLE_PREFIX + itemId;
  await idbSet(key, handle);
  return key;
}

export async function getWaveform(itemId: string): Promise<string | null> {
  try {
    return await idbGet<string>(WAVEFORM_PREFIX + itemId) || null;
  } catch {
    return null;
  }
}

// ============================================================================
// Tag Color Generation
// ============================================================================

export function getTagColor(tagName: string): string {
  // Hash string to number
  let hash = 0;
  for (let i = 0; i < tagName.length; i++) {
    hash = tagName.charCodeAt(i) + ((hash << 5) - hash);
  }
  // Convert to hue (0-360)
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue}, 60%, 70%)`;
}

export function getTagColorDark(tagName: string): string {
  // Hash string to number
  let hash = 0;
  for (let i = 0; i < tagName.length; i++) {
    hash = tagName.charCodeAt(i) + ((hash << 5) - hash);
  }
  // Convert to hue (0-360)
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue}, 50%, 25%)`;
}

// ============================================================================
// Store Interface
// ============================================================================

interface LibraryStore {
  // Libraries
  libraries: Record<string, Library>;
  items: Record<string, LibraryItem>;

  // Tag Management
  pinnedTags: string[];
  allTags: string[];

  // Scan progress
  scanProgress: ScanProgress | null;

  // UI State
  selectedLibraryId: string | null;
  searchQuery: string;
  filterTags: string[];
  activeFilterTag: string | null;
  filterBpmRange: [number, number] | null;

  // Actions - Library Management
  addLibrary: (handle: FileSystemDirectoryHandle) => Promise<string>;
  removeLibrary: (libraryId: string) => Promise<void>;
  scanLibrary: (libraryId: string, generateWaveforms?: boolean) => Promise<void>;
  rescanLibrary: (libraryId: string) => Promise<void>;
  verifyLibraryAccess: (libraryId: string) => Promise<boolean>;

  // Actions - Item Management
  updateItem: (itemId: string, updates: Partial<LibraryItem>) => void;
  toggleFavorite: (itemId: string) => void;
  setRating: (itemId: string, rating: number) => void;

  // Actions - Tag Management (enhanced)
  createTag: (name: string) => void;
  deleteTag: (name: string) => void;
  renameTag: (oldName: string, newName: string) => void;
  pinTag: (tag: string) => void;
  unpinTag: (tag: string) => void;
  reorderPinnedTags: (tags: string[]) => void;
  addTagToItem: (itemId: string, tag: string) => void;
  removeTagFromItem: (itemId: string, tag: string) => void;
  setActiveFilterTag: (tag: string | null) => void;
  computeAllTags: () => void;

  // Actions - Missing Files
  checkMissingItems: (libraryId: string) => Promise<string[]>;
  relinkItem: (itemId: string, newHandle: FileSystemFileHandle) => Promise<void>;
  relinkLibrary: (libraryId: string, newRootHandle: FileSystemDirectoryHandle) => Promise<void>;

  // Queries
  getItemsByLibrary: (libraryId: string) => LibraryItem[];
  searchItems: (query: string) => LibraryItem[];
  filterItems: (options: {
    tags?: string[];
    bpmRange?: [number, number];
    favorite?: boolean;
    libraryId?: string;
  }) => LibraryItem[];

  // UI Actions
  setSelectedLibrary: (libraryId: string | null) => void;
  setSearchQuery: (query: string) => void;
  setFilterTags: (tags: string[]) => void;
  setFilterBpmRange: (range: [number, number] | null) => void;

  // Restore libraries on startup
  restoreLibraries: () => Promise<void>;

  // Project integration
  addProjectLibrary: (projectHandle: FileSystemDirectoryHandle, projectName: string) => Promise<string | null>;
  removeProjectLibrary: (projectName: string) => Promise<void>;
  projectLibraryId: string | null;

  // Audio saving
  saveAudioToLibrary: (buffer: AudioBuffer, name: string, tags?: string[]) => Promise<string | null>;

  // Trash management
  trashItem: (itemId: string) => void;
  restoreItem: (itemId: string) => void;
  emptyTrash: () => Promise<void>;
  getTrashedItems: () => LibraryItem[];
}

// ============================================================================
// Store Implementation
// ============================================================================

export const useLibraryStore = create<LibraryStore>()(
  persist(
    (set, get) => ({
      // Initial state
      libraries: {},
      items: {},
      pinnedTags: [],
      allTags: [],
      scanProgress: null,
      selectedLibraryId: null,
      searchQuery: '',
      filterTags: [],
      activeFilterTag: null,
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

        const library: Library = {
          id,
          name: handle.name,
          rootPath: handle.name, // Just the folder name (no full path for security)
          handleKey,
          lastScanAt: 0,
          itemCount: 0,
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

        // Remove library handle (ignore errors - handle may already be removed)
        await removeHandle(library.handleKey).catch(e => logIdbError('removeHandle', e));

        // Get items to remove
        const itemsToRemove = Object.values(get().items)
          .filter(s => s.libraryId === libraryId);

        // Remove waveforms and item handles - batch with error handling (I10)
        // Continue even if some deletions fail to avoid orphaned state
        await Promise.all(
          itemsToRemove.flatMap(item => [
            idbDel(WAVEFORM_PREFIX + item.id).catch(e => logIdbError('deleteWaveform', e)),
            ...(item.handleKey ? [idbDel(item.handleKey).catch(e => logIdbError('deleteHandle', e))] : []),
          ])
        );

        const itemIdsToRemove = itemsToRemove.map(s => s.id);

        set(state => {
          const newLibraries = { ...state.libraries };
          delete newLibraries[libraryId];

          const newItems = { ...state.items };
          for (const itemId of itemIdsToRemove) {
            delete newItems[itemId];
          }

          return {
            libraries: newLibraries,
            items: newItems,
            selectedLibraryId:
              state.selectedLibraryId === libraryId ? null : state.selectedLibraryId,
          };
        });

        // Recompute all tags after removal
        get().computeAllTags();
      },

      scanLibrary: async (libraryId: string, generateWaveforms = true) => {
        // Atomically check and set scanning status to prevent race conditions
        let shouldProceed = false;
        set(state => {
          const library = state.libraries[libraryId];
          if (!library) {
            return state;
          }
          if (library.status === 'scanning') {
            console.warn(`[Library] Library ${libraryId} is already being scanned`);
            return state;
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

        // Restore handle
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

        // Initialize scan progress
        set({
          scanProgress: {
            libraryId,
            current: 0,
            total: 0,
            phase: 'counting',
          },
        });

        const newItems: Record<string, LibraryItem> = {};
        let audioContext: AudioContext | null = null;

        // Track written data for cleanup on error
        const writtenHandleKeys: string[] = [];
        const writtenWaveformIds: string[] = [];
        const itemErrors: Array<{ file: string; error: string }> = [];

        try {
          if (generateWaveforms) {
            audioContext = getAudioContext();
          }

          await walkDirectoryWithProgress(
            handle,
            async (entry: FileEntry, index: number, total: number) => {
              set({
                scanProgress: {
                  libraryId,
                  current: index + 1,
                  total,
                  currentFile: entry.relativePath,
                  phase: 'scanning',
                },
              });

              try {
                const itemId = crypto.randomUUID();
                const metadata = await createSampleMetadata(
                  itemId,
                  entry.file,
                  entry.relativePath,
                  libraryId
                );

                const handleKey = await storeItemHandle(itemId, entry.handle);
                writtenHandleKeys.push(handleKey);

                if (generateWaveforms && audioContext) {
                  try {
                    const peaks = await generateWaveformFromFile(entry.file, audioContext, 100);
                    if (peaks) {
                      await storeWaveform(itemId, peaks);
                      writtenWaveformIds.push(itemId);
                      metadata.hasWaveform = true;
                    }
                  } catch (waveformError) {
                    console.warn(`[Library] Waveform failed for ${entry.relativePath}:`, waveformError);
                  }
                }

                newItems[itemId] = {
                  ...metadata,
                  status: 'available',
                  handleKey,
                };
              } catch (itemError) {
                const errorMessage = itemError instanceof Error ? itemError.message : 'Unknown error';
                itemErrors.push({ file: entry.relativePath, error: errorMessage });
                console.warn(`[Library] Failed to process ${entry.relativePath}:`, itemError);
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

          if (itemErrors.length > 0) {
            console.warn(`[Library] ${itemErrors.length} files failed to process:`, itemErrors);
          }

          set(state => ({
            libraries: {
              ...state.libraries,
              [libraryId]: {
                ...state.libraries[libraryId],
                status: 'ready',
                lastScanAt: Date.now(),
                itemCount: Object.keys(newItems).length,
                errorMessage: undefined,
              },
            },
            items: { ...state.items, ...newItems },
            scanProgress: null,
          }));

          // Recompute all tags after scan
          get().computeAllTags();
        } catch (error) {
          console.error('Scan failed:', error);

          // Cleanup written data on error (I10: with error logging)
          await Promise.all([
            ...writtenHandleKeys.map(k => idbDel(k).catch(e => logIdbError('cleanupHandle', e))),
            ...writtenWaveformIds.map(id => idbDel(WAVEFORM_PREFIX + id).catch(e => logIdbError('cleanupWaveform', e))),
          ]);

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
        if (!get().libraries[libraryId]) {
          console.warn(`[Library] Cannot rescan: library ${libraryId} not found`);
          return;
        }

        const itemsToRemove = Object.values(get().items)
          .filter(s => s.libraryId === libraryId);

        try {
          await Promise.all(
            itemsToRemove.flatMap(item => [
              idbDel(WAVEFORM_PREFIX + item.id).catch(() => {}),
              ...(item.handleKey ? [idbDel(item.handleKey).catch(() => {})] : []),
            ])
          );
        } catch (cleanupError) {
          console.warn('[Library] Error during cleanup, continuing with rescan:', cleanupError);
        }

        set(state => {
          const newItems = { ...state.items };
          for (const item of itemsToRemove) {
            delete newItems[item.id];
          }
          return { items: newItems };
        });

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
      // Item Management
      // ========================================

      updateItem: (itemId: string, updates: Partial<LibraryItem>) => {
        set(state => {
          // Validate item exists before updating
          const existingItem = state.items[itemId];
          if (!existingItem) {
            console.warn(`[Library] updateItem: item ${itemId} not found`);
            return state;
          }
          return {
            items: {
              ...state.items,
              [itemId]: { ...existingItem, ...updates },
            },
          };
        });
      },

      toggleFavorite: (itemId: string) => {
        const item = get().items[itemId];
        if (item) {
          get().updateItem(itemId, { favorite: !item.favorite });
        }
      },

      setRating: (itemId: string, rating: number) => {
        get().updateItem(itemId, { rating: Math.max(1, Math.min(5, rating)) });
      },

      // ========================================
      // Tag Management (Enhanced)
      // ========================================

      createTag: (name: string) => {
        const trimmedName = name.trim();
        if (!trimmedName) return;

        set(state => {
          if (state.allTags.includes(trimmedName)) {
            return state; // Tag already exists
          }
          return {
            allTags: [...state.allTags, trimmedName].sort(),
          };
        });
      },

      deleteTag: (name: string) => {
        // Remove tag from all items
        const items = get().items;
        const updates: Record<string, LibraryItem> = {};

        for (const [id, item] of Object.entries(items)) {
          if (item.tags.includes(name)) {
            updates[id] = {
              ...item,
              tags: item.tags.filter(t => t !== name),
            };
          }
        }

        set(state => ({
          items: { ...state.items, ...updates },
          allTags: state.allTags.filter(t => t !== name),
          pinnedTags: state.pinnedTags.filter(t => t !== name),
          activeFilterTag: state.activeFilterTag === name ? null : state.activeFilterTag,
        }));
      },

      renameTag: (oldName: string, newName: string) => {
        const trimmedNew = newName.trim();
        if (!trimmedNew || oldName === trimmedNew) return;

        // Update tag in all items
        const items = get().items;
        const updates: Record<string, LibraryItem> = {};

        for (const [id, item] of Object.entries(items)) {
          if (item.tags.includes(oldName)) {
            updates[id] = {
              ...item,
              tags: item.tags.map(t => t === oldName ? trimmedNew : t),
            };
          }
        }

        set(state => ({
          items: { ...state.items, ...updates },
          allTags: state.allTags.map(t => t === oldName ? trimmedNew : t).sort(),
          pinnedTags: state.pinnedTags.map(t => t === oldName ? trimmedNew : t),
          activeFilterTag: state.activeFilterTag === oldName ? trimmedNew : state.activeFilterTag,
        }));
      },

      pinTag: (tag: string) => {
        set(state => {
          if (state.pinnedTags.includes(tag)) {
            return state; // Already pinned
          }
          return {
            pinnedTags: [...state.pinnedTags, tag],
          };
        });
      },

      unpinTag: (tag: string) => {
        set(state => ({
          pinnedTags: state.pinnedTags.filter(t => t !== tag),
        }));
      },

      reorderPinnedTags: (tags: string[]) => {
        set({ pinnedTags: tags });
      },

      addTagToItem: (itemId: string, tag: string) => {
        const item = get().items[itemId];
        if (item && !item.tags.includes(tag)) {
          get().updateItem(itemId, { tags: [...item.tags, tag] });

          // Add to allTags if new
          set(state => {
            if (!state.allTags.includes(tag)) {
              return { allTags: [...state.allTags, tag].sort() };
            }
            return state;
          });
        }
      },

      removeTagFromItem: (itemId: string, tag: string) => {
        const item = get().items[itemId];
        if (item) {
          get().updateItem(itemId, { tags: item.tags.filter(t => t !== tag) });
        }
      },

      setActiveFilterTag: (tag: string | null) => {
        set({ activeFilterTag: tag });
      },

      computeAllTags: () => {
        const items = get().items;
        const tagSet = new Set<string>();

        for (const item of Object.values(items)) {
          for (const tag of item.tags) {
            tagSet.add(tag);
          }
        }

        set({ allTags: Array.from(tagSet).sort() });
      },

      // ========================================
      // Missing Files
      // ========================================

      checkMissingItems: async (libraryId: string) => {
        const library = get().libraries[libraryId];
        if (!library) return [];

        const handle = await restoreHandle(library.handleKey);
        if (!handle) {
          const missingItemIds = Object.values(get().items)
            .filter(s => s.libraryId === libraryId)
            .map(s => s.id);

          set(state => {
            const newItems = { ...state.items };
            for (const id of missingItemIds) {
              newItems[id] = { ...newItems[id], status: 'missing' };
            }
            return { items: newItems };
          });

          return missingItemIds;
        }

        const items = Object.values(get().items).filter(s => s.libraryId === libraryId);
        const BATCH_SIZE = 50;

        const checkItem = async (item: LibraryItem): Promise<string | null> => {
          try {
            const parts = item.relativePath.split('/').filter(Boolean);
            let current: FileSystemDirectoryHandle = handle;

            for (let i = 0; i < parts.length - 1; i++) {
              current = await current.getDirectoryHandle(parts[i]);
            }

            await current.getFileHandle(parts[parts.length - 1]);
            return null;
          } catch {
            return item.id;
          }
        };

        const missingItemIds: string[] = [];
        for (let i = 0; i < items.length; i += BATCH_SIZE) {
          const batch = items.slice(i, i + BATCH_SIZE);
          const results = await Promise.all(batch.map(checkItem));
          missingItemIds.push(...results.filter((id): id is string => id !== null));
        }

        set(state => {
          const newItems = { ...state.items };
          for (const id of Object.keys(newItems)) {
            if (newItems[id].libraryId === libraryId) {
              newItems[id] = {
                ...newItems[id],
                status: missingItemIds.includes(id) ? 'missing' : 'available',
              };
            }
          }
          return { items: newItems };
        });

        return missingItemIds;
      },

      relinkItem: async (itemId: string, newHandle: FileSystemFileHandle) => {
        const item = get().items[itemId];
        if (!item) {
          console.warn(`[Library] Cannot relink non-existent item: ${itemId}`);
          return;
        }

        try {
          const file = await newHandle.getFile();
          const oldHandleKey = item.handleKey;
          const handleKey = await storeItemHandle(itemId, newHandle);

          if (oldHandleKey && oldHandleKey !== handleKey) {
            await idbDel(oldHandleKey).catch(() => {});
          }

          get().updateItem(itemId, {
            fileName: file.name,
            fileSize: file.size,
            lastModified: file.lastModified,
            status: 'available',
            handleKey,
          });
        } catch (err) {
          console.error(`[Library] Failed to relink item ${itemId}:`, err);
          get().updateItem(itemId, { status: 'missing' });
        }
      },

      relinkLibrary: async (libraryId: string, newRootHandle: FileSystemDirectoryHandle) => {
        const library = get().libraries[libraryId];
        if (!library) return;

        await persistHandle(library.handleKey, newRootHandle);

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

        await get().checkMissingItems(libraryId);
      },

      // ========================================
      // Queries
      // ========================================

      getItemsByLibrary: (libraryId: string) => {
        return Object.values(get().items).filter(s => s.libraryId === libraryId);
      },

      searchItems: (query: string) => {
        if (!query.trim()) return Object.values(get().items);

        const lowerQuery = query.toLowerCase();
        return Object.values(get().items).filter(
          s =>
            s.fileName.toLowerCase().includes(lowerQuery) ||
            s.relativePath.toLowerCase().includes(lowerQuery) ||
            s.tags.some(t => t.toLowerCase().includes(lowerQuery))
        );
      },

      filterItems: (options) => {
        let items = Object.values(get().items);

        if (options.libraryId) {
          items = items.filter(s => s.libraryId === options.libraryId);
        }

        if (options.tags && options.tags.length > 0) {
          items = items.filter(s => options.tags!.every(t => s.tags.includes(t)));
        }

        if (options.bpmRange) {
          const [min, max] = options.bpmRange;
          items = items.filter(s => s.bpm !== undefined && s.bpm >= min && s.bpm <= max);
        }

        if (options.favorite) {
          items = items.filter(s => s.favorite);
        }

        return items;
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

        // Compute all tags on startup
        get().computeAllTags();
      },

      // ========================================
      // Project Integration
      // ========================================

      addProjectLibrary: async (projectHandle: FileSystemDirectoryHandle, projectName: string) => {
        try {
          // Get or create library directory (new simplified structure)
          const libraryDir = await projectHandle.getDirectoryHandle('library', { create: true });

          // Check if we already have this project's library
          const existingLibrary = Object.values(get().libraries).find(
            lib => lib.name === `${projectName} (Library)`
          );

          if (existingLibrary) {
            await persistHandle(existingLibrary.handleKey, libraryDir);
            set({
              projectLibraryId: existingLibrary.id,
              selectedLibraryId: existingLibrary.id,
            });
            return existingLibrary.id;
          }

          // Create new library for project
          const id = crypto.randomUUID();
          const handleKey = `library-project-${id}`;

          await persistHandle(handleKey, libraryDir);

          const library: Library = {
            id,
            name: `${projectName} (Library)`,
            rootPath: `${projectName}/library`,
            handleKey,
            lastScanAt: 0,
            itemCount: 0,
            status: 'ready',
          };

          set(state => ({
            libraries: { ...state.libraries, [id]: library },
            projectLibraryId: id,
            selectedLibraryId: id,
          }));

          try {
            await get().scanLibrary(id, true);
          } catch (scanError) {
            console.warn('[Library] Project library scan failed:', scanError);
          }

          return id;
        } catch (error) {
          console.error('Failed to add project library:', error);
          return null;
        }
      },

      removeProjectLibrary: async (projectName: string) => {
        const library = Object.values(get().libraries).find(
          lib => lib.name === `${projectName} (Library)`
        );

        if (library) {
          set(state => ({
            projectLibraryId: null,
            selectedLibraryId: state.selectedLibraryId === library.id ? null : state.selectedLibraryId,
          }));
        } else {
          set({ projectLibraryId: null });
        }
      },

      // ========================================
      // Audio Saving
      // ========================================

      saveAudioToLibrary: async (buffer: AudioBuffer, name: string, tags: string[] = []) => {
        const projectLibraryId = get().projectLibraryId;
        if (!projectLibraryId) {
          console.warn('[Library] No project library available for saving audio');
          return null;
        }

        const library = get().libraries[projectLibraryId];
        if (!library) {
          console.warn('[Library] Project library not found');
          return null;
        }

        try {
          // Get directory handle
          const dirHandle = await restoreHandle(library.handleKey);
          if (!dirHandle || dirHandle.kind !== 'directory') {
            console.warn('[Library] Could not restore library directory handle');
            return null;
          }
          const libraryDir = dirHandle as FileSystemDirectoryHandle;

          // Verify permission
          const hasPermission = await verifyPermission(libraryDir);
          if (!hasPermission) {
            console.warn('[Library] No permission to write to library');
            return null;
          }

          // Generate filename with timestamp
          const filename = generateRecordingFilename(name.replace(/\s+/g, '_'));

          // Convert to WAV blob
          const wavBlob = audioBufferToWAV(buffer);

          // Create and write file
          const fileHandle = await libraryDir.getFileHandle(filename, { create: true });
          const writable = await fileHandle.createWritable();
          try {
            await writable.write(wavBlob);
            await writable.close();
          } catch (err) {
            await writable.abort().catch(() => {});
            throw err;
          }

          // Create library item
          const itemId = crypto.randomUUID();
          const handleKey = await storeItemHandle(itemId, fileHandle);

          // Get file info
          const file = await fileHandle.getFile();

          // Generate waveform
          const audioContext = getAudioContext();
          let hasWaveform = false;
          if (audioContext) {
            try {
              const peaks = await generateWaveformFromFile(file, audioContext, 100);
              if (peaks) {
                await storeWaveform(itemId, peaks);
                hasWaveform = true;
              }
            } catch (e) {
              console.warn('[Library] Failed to generate waveform:', e);
            }
          }

          const item: LibraryItem = {
            id: itemId,
            libraryId: projectLibraryId,
            fileName: filename,
            relativePath: filename,
            fileSize: file.size,
            lastModified: file.lastModified,
            format: 'wav',
            duration: buffer.duration,
            sampleRate: buffer.sampleRate,
            channels: buffer.numberOfChannels,
            bitDepth: 16,
            tags: tags,
            favorite: false,
            rating: 0,
            hasWaveform,
            addedAt: Date.now(),
            status: 'available',
            handleKey,
          };

          // Add to store
          set(state => ({
            items: { ...state.items, [itemId]: item },
            libraries: {
              ...state.libraries,
              [projectLibraryId]: {
                ...state.libraries[projectLibraryId],
                itemCount: state.libraries[projectLibraryId].itemCount + 1,
              },
            },
          }));

          // Add tags to allTags if new
          for (const tag of tags) {
            if (!get().allTags.includes(tag)) {
              set(state => ({
                allTags: [...state.allTags, tag].sort(),
              }));
            }
          }

          return itemId;
        } catch (error) {
          console.error('[Library] Failed to save audio to library:', error);
          return null;
        }
      },

      // ========================================
      // Trash Management
      // ========================================

      trashItem: (itemId: string) => {
        const item = get().items[itemId];
        if (!item) return;

        // Add 'trash' tag if not already present
        if (!item.tags.includes('trash')) {
          get().addTagToItem(itemId, 'trash');
        }
      },

      restoreItem: (itemId: string) => {
        const item = get().items[itemId];
        if (!item) return;

        // Remove 'trash' tag
        get().removeTagFromItem(itemId, 'trash');
      },

      getTrashedItems: () => {
        return Object.values(get().items).filter(item => item.tags.includes('trash'));
      },

      emptyTrash: async () => {
        const trashedItems = get().getTrashedItems();
        if (trashedItems.length === 0) return;

        // Remove all trashed items from IndexedDB (waveforms and handles)
        await Promise.all(
          trashedItems.flatMap(item => [
            idbDel(WAVEFORM_PREFIX + item.id).catch(() => {}),
            ...(item.handleKey ? [idbDel(item.handleKey).catch(() => {})] : []),
          ])
        );

        // Remove from store
        set(state => {
          const newItems = { ...state.items };
          for (const item of trashedItems) {
            delete newItems[item.id];
          }
          return { items: newItems };
        });

        // Recompute tags
        get().computeAllTags();
      },
    }),
    {
      name: 'openjammer-library',
      // Custom storage with error handling for quota exceeded (I8)
      storage: {
        getItem: (name: string) => {
          try {
            const value = localStorage.getItem(name);
            return value ? JSON.parse(value) : null;
          } catch (e) {
            console.error('[Library] Storage read failed:', e);
            return null;
          }
        },
        setItem: (name: string, value: unknown) => {
          try {
            localStorage.setItem(name, JSON.stringify(value));
          } catch (e) {
            if (e instanceof DOMException && e.name === 'QuotaExceededError') {
              console.error('[Library] Storage quota exceeded - library data may not persist');
              // Note: toast is not available here, but console error is logged
            } else {
              console.error('[Library] Storage write failed:', e);
            }
          }
        },
        removeItem: (name: string) => {
          try {
            localStorage.removeItem(name);
          } catch (e) {
            console.error('[Library] Storage remove failed:', e);
          }
        },
      },
      partialize: state => ({
        libraries: state.libraries,
        items: state.items,
        pinnedTags: state.pinnedTags,
      }),
      onRehydrateStorage: () => (state) => {
        // Recompute allTags from persisted items after rehydration
        if (state) {
          state.computeAllTags();
        }
      },
    }
  )
);

// ============================================================================
// Helper: Get item file for playback
// ============================================================================

export async function getItemFile(itemId: string): Promise<File | null> {
  const item = useLibraryStore.getState().items[itemId];
  if (!item || !item.handleKey) return null;

  try {
    const handle = await idbGet<FileSystemFileHandle>(item.handleKey);
    if (!handle) return null;

    const hasPermission = await verifyPermission(handle, false);
    if (!hasPermission) return null;

    return handle.getFile();
  } catch {
    return null;
  }
}

// ============================================================================
// Backwards Compatibility Aliases
// ============================================================================

// Keep old names as aliases for easier migration
export type SampleLibrary = Library;
export type LibrarySample = LibraryItem;
export const useSampleLibraryStore = useLibraryStore;
export const getSampleFile = getItemFile;
