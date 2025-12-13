/**
 * Toolbar - Top toolbar with workflow actions
 */

import { useCallback, useRef } from 'react';
import { useGraphStore } from '../../store/graphStore';
import { useCanvasStore } from '../../store/canvasStore';
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
