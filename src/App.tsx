/**
 * OpenJammer - Node-based music generation tool
 */

import { useState, useCallback, useEffect } from 'react';
import { NodeCanvas } from './components/Canvas/NodeCanvas';
import { Toolbar } from './components/Toolbar/Toolbar';
import { HelpPanel } from './components/Toolbar/HelpPanel';
import { SettingsPanel } from './components/Settings/SettingsPanel';
import { initAudioContext, isAudioReady } from './audio/AudioEngine';
import { audioGraphManager } from './audio/AudioGraphManager';
import { useAudioStore } from './store/audioStore';
import { useGraphStore } from './store/graphStore';
import { applyTheme, getSavedThemeId, getThemeById } from './styles/themes';
import './styles/global.css';

function App() {
  const [showActivation, setShowActivation] = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  const setAudioContextReady = useAudioStore((s) => s.setAudioContextReady);

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

  // Initialize audio context on user gesture
  const handleActivate = useCallback(async () => {
    try {
      await initAudioContext();
      setAudioContextReady(true);
      setShowActivation(false);
    } catch (err) {
      console.error('Failed to initialize audio:', err);
      // alert('Failed to initialize audio. Please check your browser settings.');
    }
  }, [setAudioContextReady]);

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

      {/* Logo */}
      <div className="logo">
        <span className="logo-icon">🎹</span>
        <span onClick={() => setShowSettings(true)} style={{ cursor: 'pointer' }}>OpenJammer</span>
      </div>
    </>
  );
}

export default App;
