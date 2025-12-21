# Implementation Plan: Local Project Folders & Offline Mode

## Overview

Enable OpenJammer to work with local project folders on the user's device, supporting:
1. **Automatic recording saves** - Audio recorded in the app saves directly to disk
2. **Workflow persistence** - Project files saved locally with all references
3. **Offline PWA** - Full app works without internet after initial load
4. **Project folder structure** - Organized folders for workflows, recordings, samples

## Target Configuration

Based on user requirements:
- **Browsers**: Chrome/Edge only (File System Access API)
- **Recording behavior**: Auto-save to project folder when selected
- **Offline mode**: PWA with Service Worker (not Tauri desktop app)

---

## Architecture

### Storage Hierarchy

```
┌─────────────────────────────────────────────────────┐
│                   User's Device                      │
├─────────────────────────────────────────────────────┤
│  LOCAL PROJECT FOLDER (user-selected)               │
│  MyProject/                                          │
│  ├── project.openjammer    # Workflow JSON          │
│  ├── audio/                                          │
│  │   ├── recordings/       # Auto-saved recordings  │
│  │   └── samples/          # Imported samples       │
│  └── presets/              # Saved node settings    │
├─────────────────────────────────────────────────────┤
│  BROWSER STORAGE (fallback/temp)                    │
│  ├── OPFS        # Large audio files (temp)         │
│  ├── IndexedDB   # Project metadata, handles        │
│  └── Cache API   # Service Worker assets            │
└─────────────────────────────────────────────────────┘
```

### Data Flow

```
Recording → MediaRecorder → WAV Encoder → File System Access API → disk
                                       ↓
                              (fallback) → OPFS → manual export
```

---

## Implementation Phases

### Phase 1: Project Folder Foundation

**Files to create/modify:**

#### 1.1 Project Store (`src/store/projectStore.ts`)
```typescript
interface ProjectState {
  // Project metadata
  name: string;
  folderHandle: FileSystemDirectoryHandle | null;
  handleKey: string | null; // For IndexedDB persistence
  hasUnsavedChanges: boolean;

  // Auto-save settings
  autoSaveEnabled: boolean;
  autoSaveIntervalMs: number;
  lastSavedAt: number | null;

  // Actions
  selectProjectFolder: () => Promise<void>;
  createNewProject: (name: string) => Promise<void>;
  openProject: (handle: FileSystemDirectoryHandle) => Promise<void>;
  saveProject: () => Promise<void>;
  closeProject: () => void;
}
```

#### 1.2 Enhanced File System Utils (`src/utils/fileSystemAccess.ts`)
Add these functions to existing file:
- `createProjectFolder(name: string)` - Create folder structure
- `writeProjectFile(handle, workflow)` - Save .openjammer file
- `readProjectFile(handle)` - Load project
- `saveRecordingToProject(handle, audioBlob, timestamp)` - Auto-save recordings

#### 1.3 Project Folder Structure
```typescript
const PROJECT_STRUCTURE = {
  folders: ['audio/recordings', 'audio/samples', 'presets'],
  files: {
    'project.openjammer': (name) => ({
      version: '1.0.0',
      name,
      created: new Date().toISOString(),
      // ... workflow data
    }),
    'README.txt': (name) => `OpenJammer Project: ${name}\n...`
  }
};
```

### Phase 2: Auto-Save Recordings

**Files to modify:**

#### 2.1 Recorder Integration (`src/audio/Recorder.ts`)
- Add `setProjectFolder(handle)` method
- Implement WAV encoding (16-bit PCM)
- Auto-save on recording stop
- Generate timestamped filenames: `YYYY-MM-DD_HHmmss_recording.wav`

#### 2.2 RecorderNode Updates (`src/components/Nodes/RecorderNode.tsx`)
- Show save status indicator
- Display saved file path
- Handle errors (disk full, permissions revoked)

### Phase 3: Enhanced Serialization

**Files to modify:**

#### 3.1 Serialization (`src/engine/serialization.ts`)
Current workflow format + additions:
```typescript
interface SerializedWorkflow {
  version: string;
  name: string;
  createdAt: string;
  modifiedAt: string;

  // Existing
  nodes: SerializedNode[];
  connections: SerializedConnection[];

  // New: External file references
  assets: {
    samples: Array<{
      id: string;
      relativePath: string; // "./audio/samples/kick.wav"
      checksum?: string;
      missing?: boolean;
    }>;
    recordings: Array<{
      id: string;
      relativePath: string;
      duration: number;
      recordedAt: string;
    }>;
  };

  // New: UI state (optional)
  viewport?: { x: number; y: number; zoom: number };
}
```

#### 3.2 Missing File Handling
- On load, check if referenced files exist
- Show relink dialog for missing files
- Use existing `RelinkSamplesDialog.tsx` pattern

### Phase 4: PWA Setup

**Files to create:**

#### 4.1 Vite PWA Config (`vite.config.ts`)
```typescript
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        runtimeCaching: [
          {
            urlPattern: /\.(?:wav|mp3|ogg)$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'audio-samples',
              rangeRequests: true,
              expiration: { maxEntries: 100 }
            }
          }
        ]
      },
      manifest: {
        name: 'OpenJammer',
        short_name: 'OpenJammer',
        theme_color: '#1a1a2e',
        icons: [/* ... */],
        file_handlers: [{
          action: '/',
          accept: { 'application/json': ['.openjammer'] }
        }]
      }
    })
  ]
});
```

#### 4.2 Service Worker Registration (`src/main.tsx`)
- Register SW on load
- Handle updates with user prompt
- Show offline indicator

### Phase 5: UI Integration

**Files to modify/create:**

#### 5.1 Toolbar Updates (`src/components/Toolbar/Toolbar.tsx`)
New menu structure:
```
File ▼
├── New Project...
├── Open Project Folder...
├── Save (Ctrl+S)
├── Save As...
├── Close Project
└── Recent Projects >
```

#### 5.2 Project Dialog (`src/components/Dialogs/ProjectDialog.tsx`)
- New project wizard
- Folder selection
- Project name input

#### 5.3 Status Bar (`src/components/StatusBar/StatusBar.tsx`)
- Show project name
- Save status indicator
- Offline indicator

---

## Technical Decisions

### Why Chrome/Edge Only?
- File System Access API with persistent permissions only works in Chromium
- Safari/Firefox would require ZIP fallback (added complexity)
- Target audience likely uses Chrome for audio work anyway

### Why WAV for Recordings?
- Lossless audio (no re-encoding artifacts)
- Simple to encode in browser
- Universal compatibility
- Can convert to other formats later if needed

### Why .openjammer Extension?
- Unique to this app, avoids conflicts
- Can register as file handler in PWA
- Still JSON inside (human-readable)

### Why Not OPFS for Everything?
- OPFS is invisible to users (no file browser access)
- Users want to see their files, back them up, share them
- OPFS is good for cache/temp, not primary storage

---

## File Changes Summary

### New Files
- `src/store/projectStore.ts` - Project state management
- `src/components/Dialogs/ProjectDialog.tsx` - New project wizard
- `src/components/Dialogs/OpenProjectDialog.tsx` - Folder picker
- `src/components/StatusBar/StatusBar.tsx` - Save/offline status
- `public/manifest.json` - PWA manifest (via vite-plugin-pwa)

### Modified Files
- `src/utils/fileSystemAccess.ts` - Add project folder functions
- `src/engine/serialization.ts` - Add asset references
- `src/audio/Recorder.ts` - Add auto-save to folder
- `src/components/Nodes/RecorderNode.tsx` - Save status UI
- `src/components/Toolbar/Toolbar.tsx` - File menu
- `vite.config.ts` - PWA plugin
- `src/main.tsx` - SW registration

### Existing Code to Leverage
- `src/store/sampleLibraryStore.ts` - Handle persistence patterns
- `src/utils/fileSystemAccess.ts` - Already has 80% of needed utilities
- `src/components/Dialogs/RelinkSamplesDialog.tsx` - Pattern for missing files

---

## Decisions Made

| Question | Answer |
|----------|--------|
| Browser support | Chrome/Edge only (File System Access API) |
| Recording save | Auto-save to project folder when folder selected |
| Offline mode | PWA with Service Worker (not Tauri) |
| New project flow | Select existing folder, create subfolders inside |
| Multi-project | One project at a time (simpler UX) |
| File naming | Timestamps: `recording_YYYY-MM-DDTHH-MM-SS.wav` |
| Workflow auto-save | Periodic (every 30s) + on explicit save |

## Questions Still Open

1. **Migration**: How to handle users with existing browser-only projects?
   - Option A: Prompt to "export to folder" when they select a project folder
   - Option B: Keep browser storage as fallback, only use folder if selected

---

## Dependencies to Add

```bash
bun add vite-plugin-pwa workbox-window webm-to-wav-converter
```

### Package Details

**vite-plugin-pwa** - Zero-config PWA for Vite
- Source: [vite-pwa/vite-plugin-pwa](https://github.com/vite-pwa/vite-plugin-pwa)
- Docs: [vite-pwa-org.netlify.app](https://vite-pwa-org.netlify.app/)

**webm-to-wav-converter** - Convert MediaRecorder output to WAV
- Source: [npm: webm-to-wav-converter](https://www.npmjs.com/package/webm-to-wav-converter)
- Simple API: `getWaveBlob(webmBlob, { sampleRate: 44100 })`

---

## Detailed Implementation

### PWA Configuration (vite.config.ts)

```typescript
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'apple-touch-icon.png'],

      workbox: {
        // Precache static assets
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],

        // Audio files need runtime caching with range request support
        runtimeCaching: [
          {
            // Cache built-in samples
            urlPattern: /\/samples\/.*\.(?:wav|mp3|ogg)$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'audio-samples',
              expiration: {
                maxEntries: 200,
                maxAgeSeconds: 30 * 24 * 60 * 60, // 30 days
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
        ],

        // Increase max file size for audio
        maximumFileSizeToCacheInBytes: 50 * 1024 * 1024, // 50MB
      },

      manifest: {
        name: 'OpenJammer',
        short_name: 'OpenJammer',
        description: 'Web-based audio node editor',
        theme_color: '#1a1a2e',
        background_color: '#16213e',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
        ],
        file_handlers: [
          {
            action: '/',
            accept: { 'application/json': ['.openjammer'] },
          },
        ],
      },
    }),
  ],
});
```

### WAV Recording Implementation

```typescript
// src/audio/WavEncoder.ts
import { getWaveBlob } from 'webm-to-wav-converter';

export async function convertToWav(
  webmBlob: Blob,
  sampleRate = 44100
): Promise<Blob> {
  return getWaveBlob(webmBlob, { sampleRate });
}

// Alternative: Direct WAV recording using AudioWorklet
// (More complex but avoids WebM conversion overhead)
```

### Auto-Save Recording Flow

```typescript
// src/audio/Recorder.ts additions

class Recorder {
  private projectHandle: FileSystemDirectoryHandle | null = null;

  setProjectFolder(handle: FileSystemDirectoryHandle) {
    this.projectHandle = handle;
  }

  async stopAndSave(): Promise<{ blob: Blob; savedPath?: string }> {
    const webmBlob = await this.stopRecording();
    const wavBlob = await convertToWav(webmBlob);

    if (this.projectHandle) {
      const savedPath = await this.saveToProject(wavBlob);
      return { blob: wavBlob, savedPath };
    }

    return { blob: wavBlob };
  }

  private async saveToProject(wavBlob: Blob): Promise<string> {
    const timestamp = new Date().toISOString()
      .replace(/[:.]/g, '-')
      .slice(0, 19); // YYYY-MM-DDTHH-MM-SS

    const filename = `recording_${timestamp}.wav`;
    const recordingsDir = await this.projectHandle!
      .getDirectoryHandle('audio', { create: true })
      .then(h => h.getDirectoryHandle('recordings', { create: true }));

    const fileHandle = await recordingsDir.getFileHandle(filename, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(wavBlob);
    await writable.close();

    return `audio/recordings/${filename}`;
  }
}
```

### Project Store Implementation

```typescript
// src/store/projectStore.ts
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import {
  persistHandle,
  restoreHandle,
  verifyPermission
} from '../utils/fileSystemAccess';

interface ProjectStore {
  // State
  name: string | null;
  handleKey: string | null;
  hasUnsavedChanges: boolean;
  isOffline: boolean;

  // Computed (via getters)
  isProjectOpen: boolean;

  // Actions
  createNewProject: (name: string) => Promise<FileSystemDirectoryHandle>;
  openProject: () => Promise<void>;
  saveProject: () => Promise<void>;
  closeProject: () => void;
  markDirty: () => void;

  // Internal
  _restoreOnMount: () => Promise<void>;
}

export const useProjectStore = create<ProjectStore>()(
  persist(
    (set, get) => ({
      name: null,
      handleKey: null,
      hasUnsavedChanges: false,
      isOffline: !navigator.onLine,

      get isProjectOpen() {
        return get().handleKey !== null;
      },

      createNewProject: async (name: string) => {
        // Show folder picker
        const handle = await window.showDirectoryPicker({
          mode: 'readwrite',
          startIn: 'documents',
        });

        // Create folder structure
        await createProjectStructure(handle, name);

        // Persist handle
        const handleKey = `project-${crypto.randomUUID()}`;
        await persistHandle(handleKey, handle);

        set({
          name,
          handleKey,
          hasUnsavedChanges: false
        });

        return handle;
      },

      // ... other actions
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

async function createProjectStructure(
  handle: FileSystemDirectoryHandle,
  name: string
) {
  // Create folders
  const audio = await handle.getDirectoryHandle('audio', { create: true });
  await audio.getDirectoryHandle('recordings', { create: true });
  await audio.getDirectoryHandle('samples', { create: true });
  await handle.getDirectoryHandle('presets', { create: true });

  // Create project file
  const projectFile = await handle.getFileHandle('project.openjammer', { create: true });
  const writable = await projectFile.createWritable();
  await writable.write(JSON.stringify({
    version: '1.0.0',
    name,
    created: new Date().toISOString(),
    modified: new Date().toISOString(),
    nodes: [],
    connections: [],
    assets: { samples: [], recordings: [] },
  }, null, 2));
  await writable.close();

  // Create README
  const readme = await handle.getFileHandle('README.txt', { create: true });
  const readmeWritable = await readme.createWritable();
  await readmeWritable.write(`OpenJammer Project: ${name}
Created: ${new Date().toLocaleDateString()}

This folder contains:
- project.openjammer: Main workflow file
- audio/recordings/: Auto-saved recordings
- audio/samples/: Imported audio samples
- presets/: Saved node presets

Open this folder in OpenJammer to continue working on your project.
https://openjammer.app
`);
  await readmeWritable.close();
}
```

---

## Estimated Scope

| Phase | Description | Complexity |
|-------|-------------|------------|
| 1 | Project folder foundation | Medium |
| 2 | Auto-save recordings | Medium |
| 3 | Enhanced serialization | Low |
| 4 | PWA setup | Low |
| 5 | UI integration | Medium |

**Total**: ~3-5 days of focused work

---

## Success Criteria

- [ ] User can select a project folder on first use
- [ ] Recordings auto-save to `project/audio/recordings/`
- [ ] Workflow saves to `project/project.openjammer`
- [ ] Project loads on next visit (permission re-prompt if needed)
- [ ] App works offline after first load
- [ ] Missing files are detected and can be relinked
