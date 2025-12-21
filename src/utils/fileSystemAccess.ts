/**
 * File System Access API utilities for local sample library management.
 *
 * Provides cross-browser file access with:
 * - File System Access API for Chrome/Edge (persistent handles)
 * - Fallback to <input webkitdirectory> for Firefox/Safari
 */

import { get, set, del } from 'idb-keyval';

// ============================================================================
// Type Declarations for File System Access API
// ============================================================================

// Extend Window interface for File System Access API
declare global {
  interface Window {
    showDirectoryPicker?: (options?: {
      mode?: 'read' | 'readwrite';
      startIn?: 'desktop' | 'documents' | 'downloads' | 'music' | 'pictures' | 'videos';
    }) => Promise<FileSystemDirectoryHandle>;
  }

  interface FileSystemHandle {
    queryPermission?: (descriptor?: { mode?: 'read' | 'readwrite' }) => Promise<PermissionState>;
    requestPermission?: (descriptor?: { mode?: 'read' | 'readwrite' }) => Promise<PermissionState>;
  }

  interface FileSystemDirectoryHandle {
    values(): AsyncIterableIterator<FileSystemDirectoryHandle | FileSystemFileHandle>;
  }
}

// Helper type for entry iteration
type FileSystemEntry = (FileSystemDirectoryHandle | FileSystemFileHandle) & { kind: 'file' | 'directory'; name: string };

// ============================================================================
// Types
// ============================================================================

export interface FileEntry {
  file: File;
  relativePath: string;
  handle: FileSystemFileHandle;
}

export interface DirectoryEntry {
  name: string;
  relativePath: string;
  handle: FileSystemDirectoryHandle;
}

export interface WalkOptions {
  /** File extensions to include (with dot, e.g., '.wav') */
  extensions?: string[];
  /** Skip directories matching these patterns */
  skipPatterns?: RegExp[];
  /** Progress callback */
  onProgress?: (current: number, total: number) => void;
}

// ============================================================================
// Feature Detection
// ============================================================================

/**
 * Check if File System Access API is supported
 */
export function isFileSystemAccessSupported(): boolean {
  return 'showDirectoryPicker' in window;
}

/**
 * Check if persistent permissions are likely supported (Chrome 122+)
 */
export function isPersistentPermissionsSupported(): boolean {
  // Heuristic: Chrome 122+ has persistent permissions
  const ua = navigator.userAgent;
  const chromeMatch = ua.match(/Chrome\/(\d+)/);
  if (chromeMatch) {
    const version = parseInt(chromeMatch[1], 10);
    return version >= 122;
  }
  return false;
}

// ============================================================================
// Handle Storage (IndexedDB)
// ============================================================================

const HANDLE_STORE_PREFIX = 'openjammer-fs-handle-';

/**
 * Store a FileSystemDirectoryHandle in IndexedDB for persistence
 */
export async function persistHandle(
  name: string,
  handle: FileSystemDirectoryHandle
): Promise<void> {
  const key = HANDLE_STORE_PREFIX + name;
  await set(key, handle);
}

/**
 * Restore a FileSystemDirectoryHandle from IndexedDB
 */
export async function restoreHandle(
  name: string
): Promise<FileSystemDirectoryHandle | null> {
  const key = HANDLE_STORE_PREFIX + name;
  try {
    const handle = await get<FileSystemDirectoryHandle>(key);
    return handle || null;
  } catch {
    return null;
  }
}

/**
 * Remove a stored handle
 */
export async function removeHandle(name: string): Promise<void> {
  const key = HANDLE_STORE_PREFIX + name;
  await del(key);
}

/**
 * List all stored handle names
 */
export async function listStoredHandles(): Promise<string[]> {
  // idb-keyval doesn't have keys() by default, use a workaround
  const { keys } = await import('idb-keyval');
  const allKeys = await keys();
  return allKeys
    .filter((k): k is string =>
      typeof k === 'string' && k.startsWith(HANDLE_STORE_PREFIX)
    )
    .map(k => k.slice(HANDLE_STORE_PREFIX.length));
}

// ============================================================================
// Permission Handling
// ============================================================================

/**
 * Verify and optionally request permission for a handle
 */
export async function verifyPermission(
  handle: FileSystemDirectoryHandle | FileSystemFileHandle,
  requestIfNeeded = true,
  mode: 'read' | 'readwrite' = 'read'
): Promise<boolean> {
  const options = { mode };

  // Check if we already have permission
  if (handle.queryPermission) {
    if ((await handle.queryPermission(options)) === 'granted') {
      return true;
    }
  }

  // Request permission if allowed (requires user gesture)
  if (requestIfNeeded && handle.requestPermission) {
    try {
      if ((await handle.requestPermission(options)) === 'granted') {
        return true;
      }
    } catch {
      // User cancelled or no user gesture
      return false;
    }
  }

  return false;
}

// ============================================================================
// Directory Selection
// ============================================================================

/**
 * Open directory picker and return the selected folder handle
 */
export async function selectLibraryFolder(): Promise<FileSystemDirectoryHandle> {
  if (!isFileSystemAccessSupported() || !window.showDirectoryPicker) {
    throw new Error('File System Access API not supported in this browser');
  }

  const handle = await window.showDirectoryPicker({
    mode: 'read',
    startIn: 'music', // Start in Music folder if possible
  });

  // Request persistent storage to prevent eviction
  if (navigator.storage?.persist) {
    await navigator.storage.persist();
  }

  return handle;
}

/**
 * Get a file handle from a directory by path
 */
export async function getFileByPath(
  rootHandle: FileSystemDirectoryHandle,
  relativePath: string
): Promise<FileSystemFileHandle | null> {
  const parts = relativePath.split('/').filter(Boolean);
  if (parts.length === 0) return null;

  try {
    let currentHandle: FileSystemDirectoryHandle = rootHandle;

    // Navigate to parent directories
    for (let i = 0; i < parts.length - 1; i++) {
      currentHandle = await currentHandle.getDirectoryHandle(parts[i]);
    }

    // Get the file
    const fileName = parts[parts.length - 1];
    return await currentHandle.getFileHandle(fileName);
  } catch {
    return null;
  }
}

/**
 * Check if a file exists at the given path
 */
export async function fileExists(
  rootHandle: FileSystemDirectoryHandle,
  relativePath: string
): Promise<boolean> {
  const handle = await getFileByPath(rootHandle, relativePath);
  return handle !== null;
}

// ============================================================================
// Directory Walking
// ============================================================================

const AUDIO_EXTENSIONS = ['.wav', '.mp3', '.flac', '.aiff', '.aif', '.ogg', '.m4a'];

/**
 * Recursively walk a directory and yield audio files
 */
export async function* walkDirectory(
  handle: FileSystemDirectoryHandle,
  options: WalkOptions = {},
  basePath = ''
): AsyncGenerator<FileEntry> {
  const {
    extensions = AUDIO_EXTENSIONS,
    skipPatterns = [/^\./, /^__/, /node_modules/],
  } = options;

  for await (const entry of handle.values()) {
    // Cast to include kind and name (standard FileSystemHandle properties)
    const fsEntry = entry as FileSystemEntry;
    const relativePath = basePath ? `${basePath}/${fsEntry.name}` : fsEntry.name;

    // Check skip patterns
    if (skipPatterns.some(pattern => pattern.test(fsEntry.name))) {
      continue;
    }

    if (fsEntry.kind === 'directory') {
      // Recursively walk subdirectories
      yield* walkDirectory(fsEntry as FileSystemDirectoryHandle, options, relativePath);
    } else if (fsEntry.kind === 'file') {
      // Check extension
      const fileHandle = fsEntry as FileSystemFileHandle;
      const ext = fsEntry.name.toLowerCase().slice(fsEntry.name.lastIndexOf('.'));
      if (extensions.includes(ext)) {
        const file = await fileHandle.getFile();
        yield { file, relativePath, handle: fileHandle };
      }
    }
  }
}

/**
 * Count audio files in a directory (for progress estimation)
 */
export async function countAudioFiles(
  handle: FileSystemDirectoryHandle,
  options: WalkOptions = {}
): Promise<number> {
  let count = 0;
  for await (const _ of walkDirectory(handle, options)) {
    count++;
  }
  return count;
}

/**
 * Walk directory with progress callback
 */
export async function walkDirectoryWithProgress(
  handle: FileSystemDirectoryHandle,
  onFile: (entry: FileEntry, index: number, total: number) => Promise<void>,
  options: WalkOptions = {}
): Promise<number> {
  // First pass: count files
  const total = await countAudioFiles(handle, options);

  if (options.onProgress) {
    options.onProgress(0, total);
  }

  // Second pass: process files
  let index = 0;
  for await (const entry of walkDirectory(handle, options)) {
    await onFile(entry, index, total);
    index++;
    if (options.onProgress) {
      options.onProgress(index, total);
    }
  }

  return total;
}

// ============================================================================
// Fallback for Firefox/Safari
// ============================================================================

/**
 * Create a file input for directory selection (fallback)
 */
export function createDirectoryInput(): HTMLInputElement {
  const input = document.createElement('input');
  input.type = 'file';
  input.webkitdirectory = true;
  input.multiple = true;
  return input;
}

/**
 * Get files from a fallback directory input
 */
export function getFilesFromInput(input: HTMLInputElement): File[] {
  if (!input.files) return [];

  return Array.from(input.files).filter(file => {
    const ext = file.name.toLowerCase().slice(file.name.lastIndexOf('.'));
    return AUDIO_EXTENSIONS.includes(ext);
  });
}

/**
 * Get relative path from a fallback file
 */
export function getRelativePath(file: File): string {
  // webkitRelativePath includes the root folder name
  // e.g., "samples/drums/kick.wav"
  return file.webkitRelativePath || file.name;
}

// ============================================================================
// Storage Quota
// ============================================================================

export interface StorageQuotaInfo {
  used: number;
  quota: number;
  percentUsed: number;
  fileSystem?: number;
}

/**
 * Check storage quota usage
 */
export async function getStorageQuota(): Promise<StorageQuotaInfo | null> {
  if (!navigator.storage?.estimate) return null;

  const estimate = await navigator.storage.estimate();
  const used = estimate.usage || 0;
  const quota = estimate.quota || 0;

  return {
    used,
    quota,
    percentUsed: quota > 0 ? (used / quota) * 100 : 0,
    fileSystem: (estimate as { usageDetails?: { fileSystem?: number } })
      .usageDetails?.fileSystem,
  };
}

/**
 * Request persistent storage
 */
export async function requestPersistentStorage(): Promise<boolean> {
  if (!navigator.storage?.persist) return false;
  return navigator.storage.persist();
}

/**
 * Check if storage is persistent
 */
export async function isStoragePersistent(): Promise<boolean> {
  if (!navigator.storage?.persisted) return false;
  return navigator.storage.persisted();
}
