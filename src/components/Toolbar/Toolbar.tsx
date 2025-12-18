/**
 * Toolbar - Top toolbar with workflow actions
 */

import { useCallback, useRef, useState, useEffect } from 'react';
import { useGraphStore } from '../../store/graphStore';
import { useCanvasStore } from '../../store/canvasStore';
import { useAudioStore } from '../../store/audioStore';
import { beatClock } from '../../audio/BeatClock';
import type { BeatClockState } from '../../audio/BeatClock';
import { exportWorkflow, downloadWorkflow, loadWorkflowFromFile, importWorkflow } from '../../engine/serialization';
import './Toolbar.css';

export function Toolbar() {
    const fileInputRef = useRef<HTMLInputElement>(null);

    const nodes = useGraphStore((s) => s.nodes);
    const connections = useGraphStore((s) => s.connections);
    const clearGraph = useGraphStore((s) => s.clearGraph);
    const loadGraph = useGraphStore((s) => s.loadGraph);
    const deleteSelected = useGraphStore((s) => s.deleteSelected);

    const zoom = useCanvasStore((s) => s.zoom);
    const resetView = useCanvasStore((s) => s.resetView);
    const zoomTo = useCanvasStore((s) => s.zoomTo);

    const isAudioContextReady = useAudioStore((s) => s.isAudioContextReady);

    // Beat clock state
    const [clockState, setClockState] = useState<BeatClockState>(beatClock.getState());
    const [bpmInput, setBpmInput] = useState(String(clockState.bpm));

    // Subscribe to beat clock state changes
    useEffect(() => {
        const unsubscribe = beatClock.onStateChange((state) => {
            setClockState(state);
            setBpmInput(String(state.bpm));
        });
        return unsubscribe;
    }, []);

    // Handle BPM change
    const handleBpmChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        setBpmInput(e.target.value);
    }, []);

    const handleBpmBlur = useCallback(() => {
        const bpm = parseInt(bpmInput, 10);
        if (!isNaN(bpm) && bpm >= 20 && bpm <= 300) {
            beatClock.setBPM(bpm);
        } else {
            setBpmInput(String(clockState.bpm));
        }
    }, [bpmInput, clockState.bpm]);

    const handleBpmKeyDown = useCallback((e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            handleBpmBlur();
        }
    }, [handleBpmBlur]);

    // Transport controls
    const handlePlayStop = useCallback(() => {
        beatClock.toggle();
    }, []);

    // Export workflow
    const handleExport = useCallback(() => {
        const workflow = exportWorkflow(nodes, connections, 'OpenJammer Workflow');
        downloadWorkflow(workflow);
    }, [nodes, connections]);

    // Import workflow
    const handleImport = useCallback(() => {
        fileInputRef.current?.click();
    }, []);

    const handleFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        try {
            const workflow = await loadWorkflowFromFile(file);
            const { nodes: importedNodes, connections: importedConnections } = importWorkflow(workflow);
            loadGraph(importedNodes, importedConnections);
        } catch (err) {
            console.error('Failed to import workflow:', err);
            alert('Failed to import workflow. Please check the file format.');
        }

        // Reset file input
        e.target.value = '';
    }, [loadGraph]);

    // New workflow
    const handleNew = useCallback(() => {
        if (nodes.size > 0) {
            if (!confirm('Clear current workflow? This cannot be undone.')) {
                return;
            }
        }
        clearGraph();
        resetView();
    }, [nodes.size, clearGraph, resetView]);

    // Zoom controls
    const handleZoomIn = useCallback(() => {
        zoomTo(zoom * 1.2);
    }, [zoom, zoomTo]);

    const handleZoomOut = useCallback(() => {
        zoomTo(zoom / 1.2);
    }, [zoom, zoomTo]);

    const handleResetView = useCallback(() => {
        resetView();
    }, [resetView]);

    return (
        <div className="toolbar">
            {/* File Actions */}
            <button className="toolbar-btn" onClick={handleNew} title="New Workflow">
                📄 New
            </button>
            <button className="toolbar-btn" onClick={handleImport} title="Import Workflow">
                📂 Import
            </button>
            <button className="toolbar-btn" onClick={handleExport} title="Export Workflow">
                💾 Export
            </button>

            <div className="toolbar-separator" />

            {/* Edit Actions */}
            <button className="toolbar-btn" onClick={deleteSelected} title="Delete Selected (Del)">
                🗑️ Delete
            </button>

            <div className="toolbar-separator" />

            {/* Zoom Controls */}
            <button className="toolbar-btn" onClick={handleZoomOut} title="Zoom Out">
                −
            </button>
            <div className="toolbar-zoom">
                {Math.round(zoom * 100)}%
            </div>
            <button className="toolbar-btn" onClick={handleZoomIn} title="Zoom In">
                +
            </button>
            <button className="toolbar-btn" onClick={handleResetView} title="Reset View">
                ⌂
            </button>

            <div className="toolbar-separator" />

            {/* Transport & BPM Controls */}
            <button
                className={`toolbar-btn ${clockState.isPlaying ? 'toolbar-btn-active' : ''}`}
                onClick={handlePlayStop}
                disabled={!isAudioContextReady}
                title={clockState.isPlaying ? 'Stop Clock' : 'Start Clock'}
            >
                {clockState.isPlaying ? '⏹' : '▶'}
            </button>
            <div className="toolbar-bpm">
                <input
                    type="number"
                    value={bpmInput}
                    onChange={handleBpmChange}
                    onBlur={handleBpmBlur}
                    onKeyDown={handleBpmKeyDown}
                    min="20"
                    max="300"
                    className="toolbar-bpm-input"
                    title="BPM (20-300)"
                />
                <span className="toolbar-bpm-label">BPM</span>
            </div>
            {clockState.isPlaying && (
                <div className="toolbar-beat-indicator">
                    Beat {(clockState.currentBeat % clockState.beatsPerBar) + 1}
                </div>
            )}

            <div className="toolbar-separator" />

            {/* Settings */}
            <button
                className="toolbar-btn"
                onClick={() => window.dispatchEvent(new CustomEvent('openjammer:toggle-settings'))}
                title="Settings"
            >
                ⚙️ Settings
            </button>

            {/* Hidden File Input */}
            <input
                ref={fileInputRef}
                type="file"
                accept=".json"
                onChange={handleFileChange}
                className="file-input-hidden"
            />
        </div>
    );
}
