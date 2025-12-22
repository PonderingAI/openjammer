/**
 * Library Node - Local audio sample library browser
 *
 * Features:
 * - Link local folders containing audio samples
 * - Browse and preview samples
 * - Search and filter by tags/BPM
 * - Virtualized list for large libraries
 * - Missing file detection and relinking
 */

import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import type { GraphNode, LibraryNodeData } from '../../engine/types';
import { useGraphStore } from '../../store/graphStore';
import {
  useSampleLibraryStore,
  getSampleFile,
  type LibrarySample,
} from '../../store/sampleLibraryStore';
import { useAudioClipStore } from '../../store/audioClipStore';
import { isFileSystemAccessSupported, selectLibraryFolder } from '../../utils/fileSystemAccess';
import { formatDuration } from '../../utils/audioMetadata';
import { getAudioContext } from '../../audio/AudioEngine';
import { audioGraphManager } from '../../audio/AudioGraphManager';
import { createClipFromSample, generateWaveformPeaks } from '../../utils/clipUtils';

interface LibraryNodeProps {
  node: GraphNode;
  handlePortMouseDown?: (portId: string, e: React.MouseEvent) => void;
  handlePortMouseUp?: (portId: string, e: React.MouseEvent) => void;
  handlePortMouseEnter?: (portId: string) => void;
  handlePortMouseLeave?: () => void;
  hasConnection: (portId: string) => boolean;
  handleHeaderMouseDown: (e: React.MouseEvent) => void;
  handleNodeMouseEnter: () => void;
  handleNodeMouseLeave: () => void;
  isSelected: boolean;
  isDragging: boolean;
  isHoveredWithConnections: boolean;
  incomingConnectionCount: number;
  style: React.CSSProperties;
}

// Maximum samples to show without scrolling
const MAX_VISIBLE_SAMPLES = 5;

export function LibraryNode({
  node,
  handlePortMouseDown,
  handlePortMouseUp,
  handlePortMouseEnter,
  handlePortMouseLeave,
  hasConnection,
  handleHeaderMouseDown,
  handleNodeMouseEnter,
  handleNodeMouseLeave,
  isSelected,
  isDragging,
  style,
}: LibraryNodeProps) {
  const data = node.data as LibraryNodeData;
  const updateNodeData = useGraphStore(s => s.updateNodeData);

  // Audio clip store for drag-out
  const addClip = useAudioClipStore(s => s.addClip);
  const startClipDrag = useAudioClipStore(s => s.startDrag);
  const getClipById = useAudioClipStore(s => s.getClipById);

  // Sample library store
  const libraries = useSampleLibraryStore(s => s.libraries);
  const samples = useSampleLibraryStore(s => s.samples);
  const scanProgress = useSampleLibraryStore(s => s.scanProgress);
  const addLibrary = useSampleLibraryStore(s => s.addLibrary);
  const scanLibrary = useSampleLibraryStore(s => s.scanLibrary);
  const getSamplesByLibrary = useSampleLibraryStore(s => s.getSamplesByLibrary);
  const projectLibraryId = useSampleLibraryStore(s => s.projectLibraryId);

  // Auto-connect to project library if available and no library set
  const effectiveLibraryId = data.libraryId || projectLibraryId;

  // Auto-set the library ID if project library is available
  useEffect(() => {
    if (!data.libraryId && projectLibraryId) {
      updateNodeData<LibraryNodeData>(node.id, { libraryId: projectLibraryId });
    }
  }, [data.libraryId, projectLibraryId, node.id, updateNodeData]);

  // Local state
  const [searchQuery, setSearchQuery] = useState('');
  const [previewingSampleId, setPreviewingSampleId] = useState<string | null>(null);
  const [isLinking, setIsLinking] = useState(false);

  // Audio preview
  const audioSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const audioBufferRef = useRef<AudioBuffer | null>(null);

  // Get ports
  const triggerPort = node.ports.find(p => p.id === 'trigger');
  const audioOutPort = node.ports.find(p => p.id === 'audio-out');
  const sampleOutPort = node.ports.find(p => p.id === 'sample-out');

  // Get current library (use effective library ID which falls back to project library)
  const currentLibrary = effectiveLibraryId ? libraries[effectiveLibraryId] : null;

  // Get filtered samples
  const librarySamples = useMemo(() => {
    if (!effectiveLibraryId) return [];
    const allSamples = getSamplesByLibrary(effectiveLibraryId);

    if (!searchQuery.trim()) return allSamples;

    const query = searchQuery.toLowerCase();
    return allSamples.filter(
      s =>
        s.fileName.toLowerCase().includes(query) ||
        s.tags.some(t => t.toLowerCase().includes(query))
    );
  }, [effectiveLibraryId, getSamplesByLibrary, searchQuery, samples]);

  // Handle linking a new folder
  const handleLinkFolder = useCallback(async () => {
    if (!isFileSystemAccessSupported()) {
      alert('File System Access API not supported. Please use Chrome or Edge.');
      return;
    }

    setIsLinking(true);
    try {
      const handle = await selectLibraryFolder();
      const libraryId = await addLibrary(handle);

      // Update node data
      updateNodeData<LibraryNodeData>(node.id, { libraryId });

      // Start scanning
      await scanLibrary(libraryId, true);
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        console.error('Failed to link folder:', err);
      }
    } finally {
      setIsLinking(false);
    }
  }, [node.id, addLibrary, scanLibrary, updateNodeData]);

  // Handle sample selection
  const handleSelectSample = useCallback(
    async (sampleId: string) => {
      const sample = samples[sampleId];
      if (!sample) return;

      updateNodeData<LibraryNodeData>(node.id, {
        currentSampleId: sampleId,
        sampleRefs: [
          ...data.sampleRefs.filter(r => r.id !== sampleId),
          {
            id: sampleId,
            relativePath: sample.relativePath,
            displayName: sample.fileName,
            libraryId: sample.libraryId,
          },
        ],
      });

      // Load and send buffer to connected samplers via sample-out port
      try {
        const file = await getSampleFile(sampleId);
        if (!file) return;

        const ctx = getAudioContext();
        if (!ctx) return;

        const arrayBuffer = await file.arrayBuffer();
        const audioBuffer = await ctx.decodeAudioData(arrayBuffer);

        // Send to connected samplers
        audioGraphManager.sendSampleBuffer(node.id, audioBuffer);
      } catch (err) {
        console.error('Failed to load sample for sampler:', err);
      }
    },
    [node.id, samples, data.sampleRefs, updateNodeData]
  );

  // Handle sample preview
  const handlePreviewSample = useCallback(
    async (sampleId: string) => {
      // Stop current preview
      if (audioSourceRef.current) {
        try {
          audioSourceRef.current.stop();
        } catch {
          // Already stopped
        }
        audioSourceRef.current = null;
      }

      if (previewingSampleId === sampleId) {
        setPreviewingSampleId(null);
        return;
      }

      setPreviewingSampleId(sampleId);

      try {
        const file = await getSampleFile(sampleId);
        if (!file) {
          setPreviewingSampleId(null);
          return;
        }

        const ctx = getAudioContext();
        if (!ctx) {
          setPreviewingSampleId(null);
          return;
        }

        const arrayBuffer = await file.arrayBuffer();
        const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
        audioBufferRef.current = audioBuffer;

        const source = ctx.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(ctx.destination);
        source.onended = () => {
          setPreviewingSampleId(null);
          audioSourceRef.current = null;
        };
        source.start();

        audioSourceRef.current = source;
      } catch (err) {
        console.error('Preview failed:', err);
        setPreviewingSampleId(null);
      }
    },
    [previewingSampleId]
  );

  // Cleanup preview on unmount
  useEffect(() => {
    return () => {
      if (audioSourceRef.current) {
        try {
          audioSourceRef.current.stop();
        } catch {
          // Already stopped
        }
      }
    };
  }, []);

  // Handle playback mode change
  const handlePlaybackModeChange = useCallback(
    (mode: 'oneshot' | 'loop' | 'hold') => {
      updateNodeData<LibraryNodeData>(node.id, { playbackMode: mode });
    },
    [node.id, updateNodeData]
  );

  // Handle drag start for sample (drag-out to canvas)
  const handleSampleDragStart = useCallback(
    async (e: React.MouseEvent, sample: LibrarySample) => {
      e.stopPropagation();
      e.preventDefault();

      try {
        // Load audio to generate waveform
        const file = await getSampleFile(sample.id);
        if (!file) return;

        const ctx = getAudioContext();
        if (!ctx) return;

        const arrayBuffer = await file.arrayBuffer();
        const audioBuffer = await ctx.decodeAudioData(arrayBuffer);

        // Generate waveform peaks
        const waveformPeaks = generateWaveformPeaks(audioBuffer, 64);

        // Create clip from sample
        const clipData = createClipFromSample(sample, waveformPeaks, node.id);

        // Add clip to store (without id/timestamps - store will add them)
        const { id: _id, createdAt: _ca, lastModifiedAt: _lm, ...clipWithoutMeta } = clipData;
        const clipId = addClip(clipWithoutMeta);

        // Get the created clip to pass to startDrag
        const clip = getClipById(clipId);
        if (!clip) return;

        // Create a temporary bounds for the drag origin
        const bounds = new DOMRect(e.clientX - 60, e.clientY - 20, 120, 40);

        // Start dragging
        startClipDrag(clipId, { x: e.clientX, y: e.clientY }, bounds);
      } catch (err) {
        console.error('Failed to create clip from sample:', err);
      }
    },
    [node.id, addClip, startClipDrag, getClipById]
  );

  // Render sample row
  const renderSampleRow = (sample: LibrarySample) => {
    const isSelected = data.currentSampleId === sample.id;
    const isPreviewing = previewingSampleId === sample.id;
    const isMissing = sample.status === 'missing';

    return (
      <div
        key={sample.id}
        className={`library-sample-row ${isSelected ? 'selected' : ''} ${isMissing ? 'missing' : ''}`}
        onClick={() => handleSelectSample(sample.id)}
        onDoubleClick={() => handlePreviewSample(sample.id)}
      >
        {/* Drag handle */}
        <div
          className="sample-drag-handle"
          onMouseDown={(e) => handleSampleDragStart(e, sample)}
          title="Drag to canvas"
        >
          <svg viewBox="0 0 24 24" width="10" height="10">
            <circle cx="8" cy="7" r="1.5" fill="currentColor" />
            <circle cx="8" cy="12" r="1.5" fill="currentColor" />
            <circle cx="8" cy="17" r="1.5" fill="currentColor" />
            <circle cx="14" cy="7" r="1.5" fill="currentColor" />
            <circle cx="14" cy="12" r="1.5" fill="currentColor" />
            <circle cx="14" cy="17" r="1.5" fill="currentColor" />
          </svg>
        </div>

        {/* Play/Stop button */}
        <button
          className={`sample-preview-btn ${isPreviewing ? 'playing' : ''}`}
          onClick={e => {
            e.stopPropagation();
            handlePreviewSample(sample.id);
          }}
          title={isPreviewing ? 'Stop preview' : 'Preview sample'}
        >
          {isPreviewing ? (
            <svg viewBox="0 0 24 24" width="12" height="12">
              <rect x="6" y="6" width="12" height="12" fill="currentColor" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" width="12" height="12">
              <path d="M8 5v14l11-7z" fill="currentColor" />
            </svg>
          )}
        </button>

        {/* Sample info */}
        <div className="sample-info">
          <span className="sample-name" title={sample.relativePath}>
            {sample.fileName}
          </span>
          <span className="sample-meta">
            {formatDuration(sample.duration)}
            {sample.bpm && ` • ${sample.bpm} BPM`}
          </span>
        </div>

        {/* Missing indicator */}
        {isMissing && (
          <span className="sample-missing-badge" title="File not found">
            !
          </span>
        )}

        {/* Favorite star */}
        <button
          className={`sample-favorite-btn ${sample.favorite ? 'active' : ''}`}
          onClick={e => {
            e.stopPropagation();
            useSampleLibraryStore.getState().toggleFavorite(sample.id);
          }}
          title={sample.favorite ? 'Remove from favorites' : 'Add to favorites'}
        >
          ★
        </button>
      </div>
    );
  };

  // Check if scanning
  const isScanning =
    scanProgress !== null && scanProgress.libraryId === effectiveLibraryId && scanProgress.phase !== 'complete';

  return (
    <div
      className={`schematic-node library-node ${isSelected ? 'selected' : ''} ${isDragging ? 'dragging' : ''}`}
      style={style}
      onMouseEnter={handleNodeMouseEnter}
      onMouseLeave={handleNodeMouseLeave}
    >
      {/* Header */}
      <div className="schematic-header" onMouseDown={handleHeaderMouseDown}>
        <span className="schematic-title">
          {currentLibrary ? currentLibrary.name : 'Sample Library'}
        </span>
        {currentLibrary && (
          <span className="library-count">{currentLibrary.sampleCount}</span>
        )}
      </div>

      {/* Content */}
      <div className="library-content">
        {!currentLibrary ? (
          // No library linked - show link button
          <div className="library-empty">
            <button
              className="library-link-btn"
              onClick={handleLinkFolder}
              disabled={isLinking}
            >
              {isLinking ? (
                'Linking...'
              ) : (
                <>
                  <svg viewBox="0 0 24 24" width="16" height="16">
                    <path
                      d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"
                      fill="currentColor"
                    />
                  </svg>
                  Link Folder
                </>
              )}
            </button>
            <p className="library-hint">
              Select a folder containing audio samples
            </p>
          </div>
        ) : isScanning ? (
          // Scanning progress
          <div className="library-scanning">
            <div className="scan-progress">
              <div
                className="scan-progress-bar"
                style={{
                  width: `${
                    scanProgress && scanProgress.total > 0
                      ? (scanProgress.current / scanProgress.total) * 100
                      : 0
                  }%`,
                }}
              />
            </div>
            <span className="scan-status">
              Scanning: {scanProgress?.current || 0} / {scanProgress?.total || '?'}
            </span>
          </div>
        ) : (
          // Sample browser
          <>
            {/* Search */}
            <div className="library-search">
              <input
                type="text"
                placeholder="Search samples..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                onMouseDown={e => e.stopPropagation()}
              />
            </div>

            {/* Sample list */}
            <div
              className="library-samples"
              onWheel={e => e.stopPropagation()}
            >
              {librarySamples.length === 0 ? (
                <div className="library-no-samples">
                  {searchQuery ? 'No matching samples' : 'No samples found'}
                </div>
              ) : (
                librarySamples.slice(0, MAX_VISIBLE_SAMPLES).map(renderSampleRow)
              )}
              {librarySamples.length > MAX_VISIBLE_SAMPLES && (
                <div className="library-more">
                  +{librarySamples.length - MAX_VISIBLE_SAMPLES} more
                </div>
              )}
            </div>

            {/* Playback mode */}
            <div className="library-playback-mode">
              {(['oneshot', 'loop', 'hold'] as const).map(mode => (
                <button
                  key={mode}
                  className={`mode-btn ${data.playbackMode === mode ? 'active' : ''}`}
                  onClick={() => handlePlaybackModeChange(mode)}
                  title={
                    mode === 'oneshot'
                      ? 'Play once'
                      : mode === 'loop'
                        ? 'Loop continuously'
                        : 'Play while triggered'
                  }
                >
                  {mode === 'oneshot' ? '1x' : mode === 'loop' ? '∞' : '⏵'}
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Ports */}
      {triggerPort && (
        <div
          className={`library-port input ${hasConnection(triggerPort.id) ? 'connected' : ''}`}
          style={{
            left: `${(triggerPort.position?.x || 0) * 100}%`,
            top: `${(triggerPort.position?.y || 0.3) * 100}%`,
          }}
          data-node-id={node.id}
          data-port-id={triggerPort.id}
          onMouseDown={e => handlePortMouseDown?.(triggerPort.id, e)}
          onMouseUp={e => handlePortMouseUp?.(triggerPort.id, e)}
          onMouseEnter={() => handlePortMouseEnter?.(triggerPort.id)}
          onMouseLeave={handlePortMouseLeave}
        />
      )}

      {audioOutPort && (
        <div
          className={`library-port output ${hasConnection(audioOutPort.id) ? 'connected' : ''}`}
          style={{
            left: `${(audioOutPort.position?.x || 1) * 100}%`,
            top: `${(audioOutPort.position?.y || 0.5) * 100}%`,
          }}
          data-node-id={node.id}
          data-port-id={audioOutPort.id}
          onMouseDown={e => handlePortMouseDown?.(audioOutPort.id, e)}
          onMouseUp={e => handlePortMouseUp?.(audioOutPort.id, e)}
          onMouseEnter={() => handlePortMouseEnter?.(audioOutPort.id)}
          onMouseLeave={handlePortMouseLeave}
        />
      )}

      {sampleOutPort && (
        <div
          className={`library-port output sample-out ${hasConnection(sampleOutPort.id) ? 'connected' : ''}`}
          style={{
            left: `${(sampleOutPort.position?.x || 1) * 100}%`,
            top: `${(sampleOutPort.position?.y || 0.7) * 100}%`,
          }}
          data-node-id={node.id}
          data-port-id={sampleOutPort.id}
          onMouseDown={e => handlePortMouseDown?.(sampleOutPort.id, e)}
          onMouseUp={e => handlePortMouseUp?.(sampleOutPort.id, e)}
          onMouseEnter={() => handlePortMouseEnter?.(sampleOutPort.id)}
          onMouseLeave={handlePortMouseLeave}
          title="Sample buffer output - connect to Sampler"
        />
      )}
    </div>
  );
}
