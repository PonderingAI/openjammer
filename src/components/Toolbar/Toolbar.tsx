/**
 * Toolbar - Photoshop-style menu bar with dropdown menus
 */

import { useCallback, useRef, useState, useEffect } from 'react';
import { useGraphStore } from '../../store/graphStore';
import { useCanvasStore } from '../../store/canvasStore';
import { useAudioStore } from '../../store/audioStore';
import { beatClock } from '../../audio/BeatClock';
import type { BeatClockState } from '../../audio/BeatClock';
import { exportWorkflow, downloadWorkflow, loadWorkflowFromFile, importWorkflow } from '../../engine/serialization';
import { DropdownMenu, type MenuItemOrSeparator } from './DropdownMenu';
import './Toolbar.css';

export function Toolbar() {
    const fileInputRef = useRef<HTMLInputElement>(null);

    const nodes = useGraphStore((s) => s.nodes);
    const connections = useGraphStore((s) => s.connections);
    const clearGraph = useGraphStore((s) => s.clearGraph);
    const loadGraph = useGraphStore((s) => s.loadGraph);
    const deleteSelected = useGraphStore((s) => s.deleteSelected);
    const undo = useGraphStore((s) => s.undo);
    const redo = useGraphStore((s) => s.redo);

    const zoom = useCanvasStore((s) => s.zoom);
    const resetView = useCanvasStore((s) => s.resetView);
    const zoomTo = useCanvasStore((s) => s.zoomTo);
    const ghostMode = useCanvasStore((s) => s.ghostMode);
    const toggleGhostMode = useCanvasStore((s) => s.toggleGhostMode);

    const isAudioContextReady = useAudioStore((s) => s.isAudioContextReady);
    const currentMode = useAudioStore((s) => s.currentMode);
    const isToolbarFocused = currentMode === 1;

    // Beat clock state for play/stop
    const [clockState, setClockState] = useState<BeatClockState>(beatClock.getState());

    useEffect(() => {
        const unsubscribe = beatClock.onStateChange((state) => {
            setClockState(state);
        });
        return unsubscribe;
    }, []);

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

    // Detect platform for shortcut display
    const isMac = typeof navigator !== 'undefined' && navigator.platform.toUpperCase().indexOf('MAC') >= 0;
    const cmdKey = isMac ? '⌘' : 'Ctrl';

    // Menu definitions
    const fileMenuItems: MenuItemOrSeparator[] = [
        {
            id: 'new',
            label: 'New',
            shortcut: `${cmdKey}+N`,
            onClick: handleNew,
        },
        {
            id: 'import',
            label: 'Import...',
            shortcut: `${cmdKey}+O`,
            onClick: handleImport,
        },
        {
            id: 'export',
            label: 'Export...',
            shortcut: `${cmdKey}+S`,
            onClick: handleExport,
        },
    ];

    const editMenuItems: MenuItemOrSeparator[] = [
        {
            id: 'delete',
            label: 'Delete Selected',
            shortcut: 'Del',
            onClick: deleteSelected,
        },
    ];

    const viewMenuItems: MenuItemOrSeparator[] = [
        {
            id: 'zoom-in',
            label: 'Zoom In',
            shortcut: `${cmdKey}+=`,
            onClick: handleZoomIn,
        },
        {
            id: 'zoom-out',
            label: 'Zoom Out',
            shortcut: `${cmdKey}+-`,
            onClick: handleZoomOut,
        },
        {
            id: 'reset-view',
            label: 'Reset View',
            shortcut: `${cmdKey}+0`,
            onClick: handleResetView,
        },
        { type: 'separator' },
        {
            id: 'ghost-mode',
            label: ghostMode ? '✓ Ghost Mode' : 'Ghost Mode',
            shortcut: 'W',
            onClick: toggleGhostMode,
        },
    ];

    return (
        <div className={`toolbar ${isToolbarFocused ? 'toolbar-focused' : ''}`}>
            {/* Menu Bar */}
            <div className="toolbar-menus">
                <DropdownMenu label="File" items={fileMenuItems} />
                <DropdownMenu label="Edit" items={editMenuItems} />
                <DropdownMenu label="View" items={viewMenuItems} />
            </div>

            <div className="toolbar-separator" />

            {/* Undo/Redo Buttons */}
            <button
                className="toolbar-btn toolbar-btn-icon"
                onClick={undo}
                title="Undo (Ctrl+Z)"
            >
                ↶
            </button>
            <button
                className="toolbar-btn toolbar-btn-icon"
                onClick={redo}
                title="Redo (Ctrl+Shift+Z)"
            >
                ↷
            </button>

            <div className="toolbar-separator" />

            {/* Play/Stop */}
            <button
                className={`toolbar-btn toolbar-btn-icon ${clockState.isPlaying ? 'toolbar-btn-active' : ''}`}
                onClick={handlePlayStop}
                disabled={!isAudioContextReady}
                title={clockState.isPlaying ? 'Stop Clock' : 'Start Clock'}
            >
                {clockState.isPlaying ? '⏹' : '▶'}
            </button>

            <div className="toolbar-separator" />

            {/* Settings */}
            <button
                className="toolbar-btn toolbar-btn-icon"
                onClick={() => window.dispatchEvent(new CustomEvent('openjammer:toggle-settings'))}
                title="Settings"
            >
                ⚙️
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
