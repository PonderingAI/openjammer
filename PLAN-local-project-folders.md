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

---

## Round 2 Research - Detailed Implementation

### PWA: Custom Service Worker for Audio (src/sw.ts)

Use `injectManifest` strategy for audio streaming support:

```typescript
// src/sw.ts
import { cleanupOutdatedCaches, precacheAndRoute } from 'workbox-precaching'
import { registerRoute, setCatchHandler } from 'workbox-routing'
import { CacheFirst, NetworkFirst, StaleWhileRevalidate } from 'workbox-strategies'
import { CacheableResponsePlugin } from 'workbox-cacheable-response'
import { ExpirationPlugin } from 'workbox-expiration'
import { RangeRequestsPlugin } from 'workbox-range-requests'

declare let self: ServiceWorkerGlobalScope

cleanupOutdatedCaches()
precacheAndRoute(self.__WB_MANIFEST)

// CRITICAL: Audio caching with Range Requests support
const audioStrategy = new CacheFirst({
  cacheName: 'audio-samples',
  plugins: [
    new CacheableResponsePlugin({ statuses: [200] }),
    new RangeRequestsPlugin(), // Handle streaming Range requests
    new ExpirationPlugin({
      maxEntries: 200,
      maxAgeSeconds: 30 * 24 * 60 * 60 // 30 days
    })
  ]
})

registerRoute(
  ({ url }) => /\.(mp3|wav|ogg|m4a|flac)$/i.test(url.pathname),
  audioStrategy
)

// Offline fallback
setCatchHandler(({ event }) => {
  if (event.request.destination === 'document') {
    return caches.match('/offline.html')
  }
  return Response.error()
})

self.skipWaiting()
```

**Source:** [Workbox Range Requests](https://developer.chrome.com/docs/workbox/modules/workbox-range-requests)

### PWA: Update Prompt Component

```tsx
// src/components/ReloadPrompt.tsx
import { useRegisterSW } from 'virtual:pwa-register/react'

export function ReloadPrompt() {
  const {
    offlineReady: [offlineReady, setOfflineReady],
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker
  } = useRegisterSW()

  if (!offlineReady && !needRefresh) return null

  return (
    <div className="fixed bottom-4 right-4 bg-gray-800 text-white p-4 rounded-lg shadow-lg z-50">
      <div className="mb-2">
        {offlineReady ? 'App ready to work offline' : 'New version available!'}
      </div>
      {needRefresh && (
        <button
          onClick={() => updateServiceWorker(true)}
          className="bg-blue-500 px-4 py-2 rounded mr-2"
        >
          Update Now
        </button>
      )}
      <button onClick={() => { setOfflineReady(false); setNeedRefresh(false) }}>
        Later
      </button>
    </div>
  )
}
```

### PWA: Install Prompt Hook

```tsx
// src/hooks/useInstallPrompt.ts
import { useState, useEffect } from 'react'

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

export function useInstallPrompt() {
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [isInstalled, setIsInstalled] = useState(false)

  useEffect(() => {
    if (window.matchMedia('(display-mode: standalone)').matches) {
      setIsInstalled(true)
      return
    }

    const handler = (e: Event) => {
      e.preventDefault()
      setInstallPrompt(e as BeforeInstallPromptEvent)
    }

    window.addEventListener('beforeinstallprompt', handler)
    window.addEventListener('appinstalled', () => setIsInstalled(true))
    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])

  return {
    canInstall: !!installPrompt && !isInstalled,
    isInstalled,
    promptInstall: async () => {
      if (!installPrompt) return false
      await installPrompt.prompt()
      const { outcome } = await installPrompt.userChoice
      if (outcome === 'accepted') setInstallPrompt(null)
      return outcome === 'accepted'
    }
  }
}
```

### WAV Encoding: Pure JS (No Dependencies)

```typescript
// src/audio/WavEncoder.ts
export async function decodeWebMToAudioBuffer(webmBlob: Blob): Promise<AudioBuffer> {
  const audioContext = new AudioContext()
  const arrayBuffer = await webmBlob.arrayBuffer()
  const audioBuffer = await audioContext.decodeAudioData(arrayBuffer)
  await audioContext.close()
  return audioBuffer
}

export function encodeWAV(audioBuffer: AudioBuffer): ArrayBuffer {
  const numChannels = audioBuffer.numberOfChannels
  const sampleRate = audioBuffer.sampleRate
  const bitDepth = 16

  // Interleave channels
  const length = audioBuffer.length * numChannels
  const interleaved = new Float32Array(length)

  for (let ch = 0; ch < numChannels; ch++) {
    const channelData = audioBuffer.getChannelData(ch)
    for (let i = 0; i < audioBuffer.length; i++) {
      interleaved[i * numChannels + ch] = channelData[i]
    }
  }

  // Build WAV file
  const dataLength = length * 2
  const buffer = new ArrayBuffer(44 + dataLength)
  const view = new DataView(buffer)

  // WAV Header
  const writeString = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i))
    }
  }

  writeString(0, 'RIFF')
  view.setUint32(4, 36 + dataLength, true)
  writeString(8, 'WAVE')
  writeString(12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true) // PCM
  view.setUint16(22, numChannels, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * numChannels * 2, true)
  view.setUint16(32, numChannels * 2, true)
  view.setUint16(34, bitDepth, true)
  writeString(36, 'data')
  view.setUint32(40, dataLength, true)

  // Write samples
  let offset = 44
  for (let i = 0; i < interleaved.length; i++) {
    const s = Math.max(-1, Math.min(1, interleaved[i]))
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true)
    offset += 2
  }

  return buffer
}

export async function convertWebMToWAV(webmBlob: Blob): Promise<Blob> {
  const audioBuffer = await decodeWebMToAudioBuffer(webmBlob)
  const wavBuffer = encodeWAV(audioBuffer)
  return new Blob([wavBuffer], { type: 'audio/wav' })
}
```

### Complete Project Manager Class

```typescript
// src/store/projectManager.ts
import { get, set } from 'idb-keyval'
import { persistHandle, restoreHandle, verifyPermission } from '../utils/fileSystemAccess'

interface ProjectManifest {
  name: string
  version: string
  engine: 'openjammer'
  engineVersion: string
  created: string
  modified: string
}

interface RecentProject {
  name: string
  handleKey: string
  lastOpened: string
}

export class ProjectManager {
  private currentHandle: FileSystemDirectoryHandle | null = null
  private currentManifest: ProjectManifest | null = null

  async createNewProject(name: string): Promise<FileSystemDirectoryHandle> {
    const handle = await window.showDirectoryPicker({ mode: 'readwrite' })

    // Create folder structure
    const audio = await handle.getDirectoryHandle('audio', { create: true })
    await audio.getDirectoryHandle('recordings', { create: true })
    await audio.getDirectoryHandle('samples', { create: true })
    await handle.getDirectoryHandle('presets', { create: true })

    // Create manifest
    const manifest: ProjectManifest = {
      name,
      version: '1.0.0',
      engine: 'openjammer',
      engineVersion: '0.1.0',
      created: new Date().toISOString(),
      modified: new Date().toISOString()
    }

    await this.writeJSON(handle, 'project.openjammer', manifest)

    this.currentHandle = handle
    this.currentManifest = manifest
    await this.addToRecent(handle, manifest)

    return handle
  }

  async openProject(): Promise<{ handle: FileSystemDirectoryHandle; manifest: ProjectManifest }> {
    const handle = await window.showDirectoryPicker({ mode: 'readwrite' })
    const manifest = await this.validateAndLoad(handle)

    this.currentHandle = handle
    this.currentManifest = manifest
    await this.addToRecent(handle, manifest)

    return { handle, manifest }
  }

  async openRecent(project: RecentProject): Promise<{ handle: FileSystemDirectoryHandle; manifest: ProjectManifest }> {
    const handle = await restoreHandle(project.handleKey)
    if (!handle) throw new Error('Project folder not found')

    const hasPermission = await verifyPermission(handle, true, 'readwrite')
    if (!hasPermission) throw new Error('Permission denied')

    const manifest = await this.validateAndLoad(handle)

    this.currentHandle = handle
    this.currentManifest = manifest

    return { handle, manifest }
  }

  private async validateAndLoad(handle: FileSystemDirectoryHandle): Promise<ProjectManifest> {
    try {
      const manifest = await this.readJSON<ProjectManifest>(handle, 'project.openjammer')
      if (manifest.engine !== 'openjammer') {
        throw new Error('Not an OpenJammer project')
      }
      return manifest
    } catch {
      throw new Error('Invalid project folder - no project.openjammer found')
    }
  }

  private async writeJSON(handle: FileSystemDirectoryHandle, name: string, data: unknown) {
    const fileHandle = await handle.getFileHandle(name, { create: true })
    const writable = await fileHandle.createWritable()
    await writable.write(JSON.stringify(data, null, 2))
    await writable.close()
  }

  private async readJSON<T>(handle: FileSystemDirectoryHandle, name: string): Promise<T> {
    const fileHandle = await handle.getFileHandle(name)
    const file = await fileHandle.getFile()
    return JSON.parse(await file.text())
  }

  private async addToRecent(handle: FileSystemDirectoryHandle, manifest: ProjectManifest) {
    const handleKey = `project-${crypto.randomUUID()}`
    await persistHandle(handleKey, handle)

    const recent = (await get<RecentProject[]>('recentProjects')) || []
    const filtered = recent.filter(p => p.name !== manifest.name)
    filtered.unshift({ name: manifest.name, handleKey, lastOpened: new Date().toISOString() })
    await set('recentProjects', filtered.slice(0, 10))
  }

  async getRecentProjects(): Promise<RecentProject[]> {
    return (await get<RecentProject[]>('recentProjects')) || []
  }

  get isProjectOpen() { return this.currentHandle !== null }
  get projectName() { return this.currentManifest?.name || null }
  get projectHandle() { return this.currentHandle }
}

export const projectManager = new ProjectManager()
```

### Autosave Hook with Debouncing

```typescript
// src/hooks/useAutosave.ts
import { useEffect, useRef } from 'react'
import { useDebouncedCallback } from 'use-debounce'
import { useGraphStore } from '../store/graphStore'
import { projectManager } from '../store/projectManager'

export function useAutosave(intervalMs = 30000) {
  const isDirtyRef = useRef(false)
  const lastHashRef = useRef('')

  const { nodes, edges } = useGraphStore()

  const saveProject = async () => {
    if (!isDirtyRef.current || !projectManager.isProjectOpen) return

    const handle = projectManager.projectHandle!
    const manifest = await handle.getFileHandle('project.openjammer')
    const file = await manifest.getFile()
    const data = JSON.parse(await file.text())

    data.modified = new Date().toISOString()
    data.graph = { nodes, edges }

    const writable = await manifest.createWritable()
    await writable.write(JSON.stringify(data, null, 2))
    await writable.close()

    isDirtyRef.current = false
    console.log('[Autosave] Saved at', new Date().toLocaleTimeString())
  }

  const debouncedSave = useDebouncedCallback(saveProject, 2000)

  // Mark dirty on changes
  useEffect(() => {
    const hash = JSON.stringify({ nodes, edges })
    if (hash !== lastHashRef.current) {
      isDirtyRef.current = true
      lastHashRef.current = hash
      debouncedSave()
    }
  }, [nodes, edges])

  // Save on visibility change
  useEffect(() => {
    const handler = () => {
      if (document.hidden && isDirtyRef.current) {
        saveProject()
      }
    }
    document.addEventListener('visibilitychange', handler)
    return () => document.removeEventListener('visibilitychange', handler)
  }, [])

  // Periodic backup save
  useEffect(() => {
    const interval = setInterval(saveProject, intervalMs)
    return () => clearInterval(interval)
  }, [intervalMs])

  return { isDirty: isDirtyRef.current, save: saveProject }
}
```

### Complete Project Schema

```json
{
  "$schema": "https://openjammer.io/schemas/project/v1.0.0.json",
  "version": "1.0.0",
  "name": "My Project",
  "engine": "openjammer",
  "engineVersion": "0.1.0",
  "created": "2025-12-21T10:00:00Z",
  "modified": "2025-12-21T14:30:00Z",

  "transport": {
    "bpm": 120,
    "timeSignature": [4, 4],
    "loop": false,
    "loopStart": 0,
    "loopEnd": 16
  },

  "audioFiles": {
    "recording_1": {
      "path": "audio/recordings/recording_2025-12-21_14-30-00.wav",
      "duration": 5.2,
      "sampleRate": 44100
    }
  },

  "graph": {
    "nodes": [],
    "edges": [],
    "viewport": { "x": 0, "y": 0, "zoom": 1 }
  }
}
```

---

## Research Sources - Round 2

**PWA & Workbox:**
- [Vite PWA Official Guide](https://vite-pwa-org.netlify.app/guide/)
- [Workbox Range Requests](https://developer.chrome.com/docs/workbox/modules/workbox-range-requests)
- [Serving Cached Audio/Video](https://developer.chrome.com/docs/workbox/serving-cached-audio-and-video)

**File System Access:**
- [MDN File System API](https://developer.mozilla.org/en-US/docs/Web/API/File_System_API)
- [Chrome Persistent Permissions](https://developer.chrome.com/blog/persistent-permissions-for-the-file-system-access-api)

**Audio Recording:**
- [webm-to-wav-converter npm](https://www.npmjs.com/package/webm-to-wav-converter)
- [audiobuffer-to-wav](https://github.com/Jam3/audiobuffer-to-wav)
- [MDN MediaStream Recording](https://developer.mozilla.org/en-US/docs/Web/API/MediaStream_Recording_API)

**Serialization:**
- [React Flow Save/Restore](https://reactflow.dev/examples/interaction/save-and-restore)
- [DAWproject Format](https://github.com/bitwig/dawproject)
- [Schema Versioning Best Practices](https://www.creekservice.org/articles/2024/01/08/json-schema-evolution-part-1.html)
