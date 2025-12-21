/**
 * OpenJammer - Node-based music generation tool
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { Toaster } from 'sonner';
import { NodeCanvas } from './components/Canvas/NodeCanvas';
import { Toolbar } from './components/Toolbar/Toolbar';
import { HelpPanel } from './components/Toolbar/HelpPanel';
import { SettingsPanel } from './components/Settings/SettingsPanel';
import { initAudioContext, isAudioReady, getLatencyMetrics } from './audio/AudioEngine';
import { audioGraphManager } from './audio/AudioGraphManager';
import { useAudioStore } from './store/audioStore';
import { useGraphStore } from './store/graphStore';
import { useProjectStore } from './store/projectStore';
import { useCanvasStore } from './store/canvasStore';
import { applyTheme, getSavedThemeId, getThemeById } from './styles/themes';
import './styles/global.css';

function App() {
  const [showActivation, setShowActivation] = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  const setAudioContextReady = useAudioStore((s) => s.setAudioContextReady);
  const audioConfig = useAudioStore((s) => s.audioConfig);
  const updateAudioMetrics = useAudioStore((s) => s.updateAudioMetrics);

  // Initialize theme
  useEffect(() => {
    const savedId = getSavedThemeId();
    const theme = getThemeById(savedId);
    if (theme) applyTheme(theme);
  }, []);

  // Check if audio is already ready
  useEffect(() => {
    if (isAudioReady()) {
      setShowActivation(false);
      setAudioContextReady(true);
    }
  }, [setAudioContextReady]);

  // Listen for settings toggle event (custom event)
  useEffect(() => {
    const handleToggleSettings = () => setShowSettings(prev => !prev);
    window.addEventListener('openjammer:toggle-settings', handleToggleSettings);
    return () => window.removeEventListener('openjammer:toggle-settings', handleToggleSettings);
  }, []);

  // Initialize AudioGraphManager when audio context is ready
  const isAudioContextReady = useAudioStore((s) => s.isAudioContextReady);
  useEffect(() => {
    if (!isAudioContextReady) return;

    // Create subscription wrappers for graph store
    // Zustand's subscribe returns an unsubscribe function
    const subscribeToNodes = (callback: (nodes: Map<string, any>) => void) => {
      let prevNodes = useGraphStore.getState().nodes;
      return useGraphStore.subscribe((state) => {
        if (state.nodes !== prevNodes) {
          prevNodes = state.nodes;
          callback(state.nodes);
        }
      });
    };

    const subscribeToConnections = (callback: (connections: Map<string, any>) => void) => {
      let prevConnections = useGraphStore.getState().connections;
      return useGraphStore.subscribe((state) => {
        if (state.connections !== prevConnections) {
          prevConnections = state.connections;
          callback(state.connections);
        }
      });
    };

    const getNodes = useGraphStore.getState().getNodes;
    const getConnections = useGraphStore.getState().getConnections;

    audioGraphManager.initialize(
      subscribeToConnections,
      subscribeToNodes,
      getNodes,
      getConnections
    );

    return () => {
      audioGraphManager.dispose();
    };
  }, [isAudioContextReady]);

  // ========================================
  // Autosave - watches graph changes and saves to project folder
  // ========================================
  const projectName = useProjectStore((s) => s.name);
  const projectHandleKey = useProjectStore((s) => s.handleKey);
  const saveProject = useProjectStore((s) => s.saveProject);

  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastVersionRef = useRef<number>(useGraphStore.getState().version);
  const isSavingRef = useRef(false);

  // Autosave when graph changes (debounced) - using version counter for efficient change detection
  useEffect(() => {
    // Only autosave if a project is open
    if (!projectName || !projectHandleKey) return;

    // Initialize version ref with current state
    lastVersionRef.current = useGraphStore.getState().version;

    // Subscribe to graph changes
    const unsubscribe = useGraphStore.subscribe((state) => {
      // Skip if version hasn't changed (efficient O(1) check vs O(n) JSON.stringify)
      if (state.version === lastVersionRef.current) return;

      // Clear existing timeout
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }

      // Debounced save (3 seconds after last change)
      saveTimeoutRef.current = setTimeout(async () => {
        if (isSavingRef.current) return;

        const currentVersion = useGraphStore.getState().version;
        if (currentVersion === lastVersionRef.current) return;

        isSavingRef.current = true;
        try {
          const graphData = {
            nodes: Array.from(useGraphStore.getState().nodes.values()),
            edges: Array.from(useGraphStore.getState().connections.values()),
            viewport: {
              x: useCanvasStore.getState().pan.x,
              y: useCanvasStore.getState().pan.y,
              zoom: useCanvasStore.getState().zoom,
            },
          };
          await saveProject(graphData);
          lastVersionRef.current = currentVersion;
          console.log('[Autosave] Project saved');
        } catch (err) {
          console.error('[Autosave] Failed:', err);
        } finally {
          isSavingRef.current = false;
        }
      }, 3000);
    });

    return () => {
      unsubscribe();
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [projectName, projectHandleKey, saveProject]);

  // Periodic backup save every 30 seconds (checks if version changed)
  useEffect(() => {
    if (!projectName || !projectHandleKey) return;

    const interval = setInterval(async () => {
      if (isSavingRef.current) return;

      const currentVersion = useGraphStore.getState().version;

      // Skip if nothing changed since last save
      if (currentVersion === lastVersionRef.current) return;

      isSavingRef.current = true;
      try {
        const graphData = {
          nodes: Array.from(useGraphStore.getState().nodes.values()),
          edges: Array.from(useGraphStore.getState().connections.values()),
          viewport: {
            x: useCanvasStore.getState().pan.x,
            y: useCanvasStore.getState().pan.y,
            zoom: useCanvasStore.getState().zoom,
          },
        };
        await saveProject(graphData);
        lastVersionRef.current = currentVersion;
        console.log('[Autosave] Periodic backup saved');
      } catch (err) {
        console.error('[Autosave] Periodic backup failed:', err);
      } finally {
        isSavingRef.current = false;
      }
    }, 30000);

    return () => clearInterval(interval);
  }, [projectName, projectHandleKey, saveProject]);

  // Save on tab close/switch
  useEffect(() => {
    if (!projectName || !projectHandleKey) return;

    const handleVisibilityChange = async () => {
      if (document.hidden && !isSavingRef.current) {
        // Set flag immediately to prevent race conditions
        isSavingRef.current = true;

        const currentVersion = useGraphStore.getState().version;

        // Skip if nothing changed since last save
        if (currentVersion === lastVersionRef.current) {
          isSavingRef.current = false;
          return;
        }

        // Save immediately when tab is hidden
        try {
          const graphData = {
            nodes: Array.from(useGraphStore.getState().nodes.values()),
            edges: Array.from(useGraphStore.getState().connections.values()),
            viewport: {
              x: useCanvasStore.getState().pan.x,
              y: useCanvasStore.getState().pan.y,
              zoom: useCanvasStore.getState().zoom,
            },
          };
          await saveProject(graphData);
          lastVersionRef.current = currentVersion;
          console.log('[Autosave] Saved on tab switch');
        } catch (err) {
          console.error('[Autosave] Failed on tab switch:', err);
        } finally {
          isSavingRef.current = false;
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [projectName, projectHandleKey, saveProject]);

  // Emergency backup on beforeunload (tab close/refresh)
  useEffect(() => {
    if (!projectName || !projectHandleKey) return;

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      const currentVersion = useGraphStore.getState().version;
      if (currentVersion !== lastVersionRef.current) {
        // Emergency backup to localStorage
        try {
          localStorage.setItem('openjammer-emergency-backup', JSON.stringify({
            timestamp: Date.now(),
            projectName,
            nodes: Array.from(useGraphStore.getState().nodes.values()),
            edges: Array.from(useGraphStore.getState().connections.values()),
          }));
        } catch {
          // Ignore storage errors
        }
        e.preventDefault();
        e.returnValue = '';
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [projectName, projectHandleKey]);

  // Initialize audio context on user gesture
  const handleActivate = useCallback(async () => {
    try {
      await initAudioContext({
        sampleRate: audioConfig.sampleRate,
        latencyHint: audioConfig.latencyHint
      });
      setAudioContextReady(true);
      setShowActivation(false);

      // Get initial latency metrics
      const metrics = getLatencyMetrics();
      if (metrics) {
        updateAudioMetrics({
          ...metrics,
          lastUpdated: Date.now()
        });
      }
    } catch (err) {
      console.error('Failed to initialize audio:', err);
      // alert('Failed to initialize audio. Please check your browser settings.');
    }
  }, [setAudioContextReady, audioConfig, updateAudioMetrics]);

  return (
    <>
      {/* Audio Activation Overlay */}
      {showActivation && (
        <div className="audio-activate-overlay">
          <button className="audio-activate-btn" onClick={handleActivate}>
            🎵 Start OpenJammer
          </button>
          <p>Click to enable audio (required by browsers)</p>
        </div>
      )}

      {/* Main Canvas */}
      <NodeCanvas />

      {/* Toolbar */}
      <Toolbar />

      {/* Settings Panel */}
      {showSettings && <SettingsPanel onClose={() => setShowSettings(false)} />}

      {/* Help Panel */}
      <HelpPanel />

      {/* Toast Notifications */}
      <Toaster position="bottom-right" richColors />
    </>
  );
}

export default App;
