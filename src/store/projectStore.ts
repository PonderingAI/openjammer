/**
 * Project Store - Manages local project folders and persistence
 *
 * Features:
 * - Create/open project folders
 * - Auto-save workflow to disk
 * - Track recent projects
 * - Persist directory handles across sessions
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { get as idbGet, set as idbSet } from 'idb-keyval';
import {
  persistHandle,
  restoreHandle,
  removeHandle,
  verifyPermission,
  isFileSystemAccessSupported,
} from '../utils/fileSystemAccess';
import { useSampleLibraryStore } from './sampleLibraryStore';

// ============================================================================
// Types
// ============================================================================

export interface ProjectManifest {
  name: string;
  version: string;
  engine: 'openjammer';
  engineVersion: string;
  created: string;
  modified: string;
  transport?: {
    bpm: number;
    timeSignature: [number, number];
    loop: boolean;
    loopStart: number;
    loopEnd: number;
  };
  audioFiles?: Record<string, {
    path: string;
    duration?: number;
    sampleRate?: number;
  }>;
  graph?: {
    nodes: unknown[];
    edges: unknown[];
    viewport?: { x: number; y: number; zoom: number };
  };
}

export interface RecentProject {
  name: string;
  handleKey: string;
  lastOpened: string;
}

export interface ProjectState {
  // Current project
  name: string | null;
  handleKey: string | null;
  hasUnsavedChanges: boolean;
  isLoading: boolean;
  isSaving: boolean;
  error: string | null;

  // Feature detection
  isSupported: boolean;

  // Recent projects (persisted separately in localStorage)
  recentProjects: RecentProject[];

  // Actions
  createProject: (name?: string) => Promise<FileSystemDirectoryHandle>;
  openProject: () => Promise<{ handle: FileSystemDirectoryHandle; manifest: ProjectManifest }>;
  openRecentProject: (project: RecentProject) => Promise<{ handle: FileSystemDirectoryHandle; manifest: ProjectManifest }>;
  saveProject: (graphData: { nodes: unknown[]; edges: unknown[]; viewport?: { x: number; y: number; zoom: number } }) => Promise<void>;
  closeProject: () => void;
  markDirty: () => void;
  markClean: () => void;
  clearError: () => void;

  // Internal
  getProjectHandle: () => Promise<FileSystemDirectoryHandle | null>;
  addAudioFile: (fileId: string, fileInfo: { path: string; duration?: number; sampleRate?: number }) => Promise<void>;
  loadRecentProjects: () => Promise<void>;
}

// ============================================================================
// Constants
// ============================================================================

const ENGINE_VERSION = '0.1.0';
const PROJECT_FILE_NAME = 'project.openjammer';
const RECENT_PROJECTS_KEY = 'openjammer-recent-projects';

/**
 * Generate a unique ID with fallback for non-secure contexts
 */
function generateId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  // Fallback for non-secure contexts
  return `${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
}

// ============================================================================
// Helper Functions
// ============================================================================

async function createProjectStructure(
  handle: FileSystemDirectoryHandle,
  name: string
): Promise<ProjectManifest> {
  // Create folder structure
  const audio = await handle.getDirectoryHandle('audio', { create: true });
  await audio.getDirectoryHandle('recordings', { create: true });
  await audio.getDirectoryHandle('samples', { create: true });
  await handle.getDirectoryHandle('presets', { create: true });

  // Create manifest
  const manifest: ProjectManifest = {
    name,
    version: '1.0.0',
    engine: 'openjammer',
    engineVersion: ENGINE_VERSION,
    created: new Date().toISOString(),
    modified: new Date().toISOString(),
    transport: {
      bpm: 120,
      timeSignature: [4, 4],
      loop: false,
      loopStart: 0,
      loopEnd: 16,
    },
    audioFiles: {},
    graph: {
      nodes: [],
      edges: [],
      viewport: { x: 0, y: 0, zoom: 1 },
    },
  };

  // Write project file
  const projectFile = await handle.getFileHandle(PROJECT_FILE_NAME, { create: true });
  const writable = await projectFile.createWritable();
  await writable.write(JSON.stringify(manifest, null, 2));
  await writable.close();

  // Create README
  const readme = await handle.getFileHandle('README.txt', { create: true });
  const readmeWritable = await readme.createWritable();
  await readmeWritable.write(`OpenJammer Project: ${name}
Created: ${new Date().toLocaleDateString()}

This folder contains:
- ${PROJECT_FILE_NAME}: Main workflow file
- audio/recordings/: Auto-saved recordings
- audio/samples/: Imported audio samples
- presets/: Saved node presets

Open this folder in OpenJammer to continue working on your project.
https://github.com/PonderingBGI/openjammer
`);
  await readmeWritable.close();

  return manifest;
}

async function readProjectManifest(
  handle: FileSystemDirectoryHandle
): Promise<ProjectManifest> {
  try {
    const fileHandle = await handle.getFileHandle(PROJECT_FILE_NAME);
    const file = await fileHandle.getFile();
    const content = await file.text();
    const manifest = JSON.parse(content) as ProjectManifest;

    // Validate
    if (manifest.engine !== 'openjammer') {
      throw new Error('Not an OpenJammer project');
    }

    return manifest;
  } catch (err) {
    if ((err as DOMException).name === 'NotFoundError') {
      throw new Error(`No ${PROJECT_FILE_NAME} found in this folder`);
    }
    throw err;
  }
}

async function writeProjectManifest(
  handle: FileSystemDirectoryHandle,
  manifest: ProjectManifest
): Promise<void> {
  const fileHandle = await handle.getFileHandle(PROJECT_FILE_NAME, { create: true });
  const writable = await fileHandle.createWritable();
  try {
    await writable.write(JSON.stringify(manifest, null, 2));
    await writable.close();
  } catch (err) {
    // Abort the writable stream on error to prevent corruption
    await writable.abort().catch(() => {});
    throw err;
  }
}

async function saveRecentProjects(projects: RecentProject[]): Promise<void> {
  await idbSet(RECENT_PROJECTS_KEY, projects);
}

async function loadRecentProjectsFromStorage(): Promise<RecentProject[]> {
  try {
    const projects = await idbGet<RecentProject[]>(RECENT_PROJECTS_KEY);
    return projects || [];
  } catch {
    return [];
  }
}

// ============================================================================
// Store
// ============================================================================

export const useProjectStore = create<ProjectState>()(
  persist(
    (set, get) => ({
      // Initial state
      name: null,
      handleKey: null,
      hasUnsavedChanges: false,
      isLoading: false,
      isSaving: false,
      error: null,
      isSupported: isFileSystemAccessSupported(),
      recentProjects: [],

      // ========================================
      // Create New Project
      // ========================================
      createProject: async (name?: string) => {
        if (!isFileSystemAccessSupported()) {
          throw new Error('File System Access API not supported in this browser');
        }

        // Prevent concurrent operations
        if (get().isLoading) {
          throw new Error('Another operation is in progress');
        }

        set({ isLoading: true, error: null });

        try {
          // User picks a folder FIRST (must be direct user gesture)
          const handle = await window.showDirectoryPicker!({
            mode: 'readwrite',
            startIn: 'documents',
          });

          // Now prompt for name (after folder is selected)
          const folderName = handle.name;
          const projectName = name || prompt('Enter project name:', folderName);
          if (!projectName) {
            set({ isLoading: false });
            throw new Error('Cancelled');
          }

          // Check if folder already has a project
          try {
            await handle.getFileHandle(PROJECT_FILE_NAME);
            // Project file exists - ask if they want to overwrite
            const overwrite = confirm(
              `This folder already contains a project. Overwrite?`
            );
            if (!overwrite) {
              set({ isLoading: false });
              throw new Error('Cancelled - folder already contains a project');
            }
          } catch (err) {
            // NotFoundError means no existing project - that's good
            if ((err as DOMException).name !== 'NotFoundError') {
              throw err;
            }
          }

          // Create project structure
          await createProjectStructure(handle, projectName);

          // Persist handle
          const handleKey = `project-${generateId()}`;
          await persistHandle(handleKey, handle);

          // Update recent projects and clean up orphaned handles
          const recent = await loadRecentProjectsFromStorage();
          const filtered = recent.filter((p) => p.name !== projectName);
          const updated = [
            { name: projectName, handleKey, lastOpened: new Date().toISOString() },
            ...filtered,
          ].slice(0, 10);

          // Clean up handles for projects being removed from recent list
          const removed = recent.filter((p) => !updated.some(u => u.handleKey === p.handleKey));
          for (const p of removed) {
            await removeHandle(p.handleKey);
          }

          await saveRecentProjects(updated);

          set({
            name: projectName,
            handleKey,
            hasUnsavedChanges: false,
            isLoading: false,
            recentProjects: updated,
          });

          // Auto-connect sample library
          useSampleLibraryStore.getState().addProjectSamplesLibrary(handle, projectName);

          return handle;
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Failed to create project';
          set({ isLoading: false, error: message });
          throw err;
        }
      },

      // ========================================
      // Open Project
      // ========================================
      openProject: async () => {
        if (!isFileSystemAccessSupported()) {
          throw new Error('File System Access API not supported');
        }

        // Prevent concurrent operations
        if (get().isLoading) {
          throw new Error('Another operation is in progress');
        }

        set({ isLoading: true, error: null });

        try {
          const handle = await window.showDirectoryPicker!({
            mode: 'readwrite',
          });

          // Validate project
          const manifest = await readProjectManifest(handle);

          // Persist handle
          const handleKey = `project-${generateId()}`;
          await persistHandle(handleKey, handle);

          // Update recent projects and clean up orphaned handles
          const recent = await loadRecentProjectsFromStorage();
          const filtered = recent.filter((p) => p.name !== manifest.name);
          const updated = [
            { name: manifest.name, handleKey, lastOpened: new Date().toISOString() },
            ...filtered,
          ].slice(0, 10);

          // Clean up handles for projects being removed from recent list
          const removed = recent.filter((p) => !updated.some(u => u.handleKey === p.handleKey));
          for (const p of removed) {
            await removeHandle(p.handleKey);
          }

          await saveRecentProjects(updated);

          set({
            name: manifest.name,
            handleKey,
            hasUnsavedChanges: false,
            isLoading: false,
            recentProjects: updated,
          });

          // Auto-connect sample library
          useSampleLibraryStore.getState().addProjectSamplesLibrary(handle, manifest.name);

          return { handle, manifest };
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Failed to open project';
          set({ isLoading: false, error: message });
          throw err;
        }
      },

      // ========================================
      // Open Recent Project
      // ========================================
      openRecentProject: async (project: RecentProject) => {
        // Prevent concurrent operations
        if (get().isLoading) {
          throw new Error('Another operation is in progress');
        }

        set({ isLoading: true, error: null });

        try {
          const handle = await restoreHandle(project.handleKey);
          if (!handle) {
            // Clean up invalid handle
            await removeHandle(project.handleKey);
            throw new Error('Project folder not found - it may have been moved or deleted');
          }

          // Validate handle is still valid (folder still exists)
          try {
            await handle.getDirectoryHandle('.', { create: false });
          } catch {
            // Handle is stale - clean it up
            await removeHandle(project.handleKey);
            throw new Error('Project folder no longer exists or was moved');
          }

          // Verify/request permission
          const hasPermission = await verifyPermission(handle, true, 'readwrite');
          if (!hasPermission) {
            throw new Error('Permission denied. Please click the project button again to grant folder access.');
          }

          // Read manifest
          const manifest = await readProjectManifest(handle);

          // Update recent projects (move to top)
          const recent = await loadRecentProjectsFromStorage();
          const filtered = recent.filter((p) => p.handleKey !== project.handleKey);
          const updated = [
            { ...project, lastOpened: new Date().toISOString() },
            ...filtered,
          ].slice(0, 10);
          await saveRecentProjects(updated);

          set({
            name: manifest.name,
            handleKey: project.handleKey,
            hasUnsavedChanges: false,
            isLoading: false,
            recentProjects: updated,
          });

          // Auto-connect sample library
          useSampleLibraryStore.getState().addProjectSamplesLibrary(handle, manifest.name);

          return { handle, manifest };
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Failed to open project';
          set({ isLoading: false, error: message });
          throw err;
        }
      },

      // ========================================
      // Save Project
      // ========================================
      saveProject: async (graphData) => {
        const { handleKey, isSaving } = get();

        // Prevent concurrent saves
        if (isSaving) {
          return;
        }

        if (!handleKey) {
          throw new Error('No project open');
        }

        set({ isSaving: true });

        try {
          const handle = await restoreHandle(handleKey);
          if (!handle) {
            throw new Error('Project folder not found');
          }

          const hasPermission = await verifyPermission(handle, true, 'readwrite');
          if (!hasPermission) {
            throw new Error('Permission denied. Please click save again to grant folder access.');
          }

          // Read current manifest
          const manifest = await readProjectManifest(handle);

          // Update with new data
          manifest.modified = new Date().toISOString();
          manifest.graph = graphData;

          // Write back
          await writeProjectManifest(handle, manifest);

          set({ hasUnsavedChanges: false, isSaving: false });
        } catch (err) {
          set({ isSaving: false });
          throw err;
        }
      },

      // ========================================
      // Close Project
      // ========================================
      closeProject: () => {
        const { name } = get();

        // Disconnect sample library
        if (name) {
          useSampleLibraryStore.getState().removeProjectLibrary(name);
        }

        set({
          name: null,
          handleKey: null,
          hasUnsavedChanges: false,
          error: null,
        });
      },

      // ========================================
      // Dirty State
      // ========================================
      markDirty: () => set({ hasUnsavedChanges: true }),
      markClean: () => set({ hasUnsavedChanges: false }),
      clearError: () => set({ error: null }),

      // ========================================
      // Get Handle
      // ========================================
      getProjectHandle: async () => {
        const { handleKey } = get();
        if (!handleKey) return null;

        const handle = await restoreHandle(handleKey);
        if (!handle) return null;

        const hasPermission = await verifyPermission(handle, false, 'readwrite');
        if (!hasPermission) return null;

        return handle;
      },

      // ========================================
      // Add Audio File to Manifest
      // ========================================
      addAudioFile: async (fileId: string, fileInfo: { path: string; duration?: number; sampleRate?: number }) => {
        const { handleKey } = get();
        if (!handleKey) {
          throw new Error('No project open');
        }

        const handle = await restoreHandle(handleKey);
        if (!handle) {
          throw new Error('Project folder not found');
        }

        const hasPermission = await verifyPermission(handle, true, 'readwrite');
        if (!hasPermission) {
          throw new Error('Permission denied');
        }

        // Read current manifest
        const manifest = await readProjectManifest(handle);

        // Update audioFiles
        manifest.audioFiles = manifest.audioFiles || {};
        manifest.audioFiles[fileId] = fileInfo;
        manifest.modified = new Date().toISOString();

        // Write back
        await writeProjectManifest(handle, manifest);
      },

      // ========================================
      // Load Recent Projects
      // ========================================
      loadRecentProjects: async () => {
        const projects = await loadRecentProjectsFromStorage();
        set({ recentProjects: projects });
      },
    }),
    {
      name: 'openjammer-project',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        name: state.name,
        handleKey: state.handleKey,
      }),
    }
  )
);

// ============================================================================
// Initialize on module load
// ============================================================================

// Load recent projects and reconnect sample library when store is first accessed
if (typeof window !== 'undefined') {
  const initializeProject = async () => {
    const state = useProjectStore.getState();

    // Load recent projects
    await state.loadRecentProjects();

    // If a project was open, reconnect the sample library
    if (state.name && state.handleKey) {
      try {
        const handle = await restoreHandle(state.handleKey);
        if (handle) {
          const hasPermission = await verifyPermission(handle, false);
          if (hasPermission) {
            // Reconnect sample library silently
            useSampleLibraryStore.getState().addProjectSamplesLibrary(handle, state.name);
          }
        }
      } catch (err) {
        console.warn('Failed to reconnect project sample library:', err);
      }
    }
  };

  initializeProject();
}
