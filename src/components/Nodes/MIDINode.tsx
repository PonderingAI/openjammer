/**
 * MIDI Node - MIDI controller input
 *
 * Connects to MIDI devices via Web MIDI API
 * Supports device presets for known controllers (MiniLab 3, etc.)
 * Falls back to generic mode for unknown devices
 *
 * Design: Hierarchical node with internal canvas structure
 * Press E to dive into internal canvas and see per-control routing
 *
 * Outer view: Shows preset name, connect button, and bundle outputs
 * Inner view: Shows full visual with per-control ports
 */

import { useEffect, useCallback, useRef } from 'react';
import type { GraphNode, MIDIInputNodeData } from '../../engine/types';
import { useMIDIStore } from '../../store/midiStore';
import { useGraphStore } from '../../store/graphStore';
import { getPresetRegistry } from '../../midi';
import './MIDINode.css';

interface MIDINodeProps {
    node: GraphNode;
    handlePortMouseDown?: (portId: string, e: React.MouseEvent) => void;
    handlePortMouseUp?: (portId: string, e: React.MouseEvent) => void;
    handlePortMouseEnter?: (portId: string) => void;
    handlePortMouseLeave?: () => void;
    hasConnection?: (portId: string) => boolean;
    handleHeaderMouseDown?: (e: React.MouseEvent) => void;
    handleNodeMouseEnter?: () => void;
    handleNodeMouseLeave?: () => void;
    isSelected?: boolean;
    isDragging?: boolean;
    isHoveredWithConnections?: boolean;
    incomingConnectionCount?: number;
    style?: React.CSSProperties;
}

export function MIDINode({
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
    style
}: MIDINodeProps) {
    const data = node.data as MIDIInputNodeData;

    // MIDI store state
    const isSupported = useMIDIStore((s) => s.isSupported);
    const isInitialized = useMIDIStore((s) => s.isInitialized);
    const inputs = useMIDIStore((s) => s.inputs);
    const initialize = useMIDIStore((s) => s.initialize);
    const openBrowser = useMIDIStore((s) => s.openBrowser);

    // Get preset info
    const registry = getPresetRegistry();
    const preset = data.presetId ? registry.getPreset(data.presetId) : null;
    const presetName = preset?.name ?? 'MIDI';

    // Get connected device info
    const connectedDevice = data.deviceId ? inputs.get(data.deviceId) : null;
    const isConnected = data.isConnected && connectedDevice?.state === 'connected';

    // Initialize MIDI on mount
    useEffect(() => {
        if (isSupported && !isInitialized) {
            initialize();
        }
    }, [isSupported, isInitialized, initialize]);

    // Track if we've propagated the deviceId on mount
    const hasPropagedOnMount = useRef(false);

    // Re-propagate deviceId to children on mount (handles page reload case)
    // This ensures internal midi-visual nodes get the deviceId even if it wasn't saved
    useEffect(() => {
        if (hasPropagedOnMount.current) return;
        if (!data.deviceId || !node.childIds.length) return;

        // Trigger updateNodeData to propagate deviceId to children
        const updateNodeData = useGraphStore.getState().updateNodeData;
        updateNodeData(node.id, {
            deviceId: data.deviceId,
            presetId: data.presetId
        });
        hasPropagedOnMount.current = true;
    }, [node.id, node.childIds.length, data.deviceId, data.presetId]);

    // Handle clicking connect button to open browser
    const handleConnectClick = useCallback((e: React.MouseEvent) => {
        e.stopPropagation();
        openBrowser(node.id);  // Pass node ID so browser knows which node to update
    }, [openBrowser, node.id]);

    // Don't render if Web MIDI not supported
    if (!isSupported) {
        return (
            <div
                className={`midi-node schematic-node midi-unsupported ${isSelected ? 'selected' : ''}`}
                style={style}
                onMouseEnter={handleNodeMouseEnter}
                onMouseLeave={handleNodeMouseLeave}
            >
                <div className="schematic-header" onMouseDown={handleHeaderMouseDown}>
                    <span className="schematic-title">{presetName}</span>
                </div>
                <div className="midi-unsupported-message">
                    <span>Web MIDI not supported</span>
                    <span className="midi-browser-hint">Use Chrome, Edge, or Firefox</span>
                </div>
            </div>
        );
    }

    return (
        <div
            className={`midi-node schematic-node ${isSelected ? 'selected' : ''} ${isDragging ? 'dragging' : ''}`}
            style={style}
            onMouseEnter={handleNodeMouseEnter}
            onMouseLeave={handleNodeMouseLeave}
        >
            {/* Header with preset name */}
            <div
                className="schematic-header"
                onMouseDown={handleHeaderMouseDown}
            >
                <span className="schematic-title">{presetName}</span>
            </div>

            {/* Body - matches keyboard node style */}
            <div className="keyboard-schematic-body">
                {/* Connect button - only shows when not connected */}
                {!isConnected && (
                    <button
                        className="midi-connect-btn"
                        onClick={handleConnectClick}
                        title="Connect MIDI device"
                    >
                        Connect
                    </button>
                )}

                {/* Render ports dynamically (auto-synced from internal canvas-input/output nodes) */}
                {node.ports.map((port) => (
                    <div key={port.id} className={`port-row ${port.direction}`}>
                        <span className="port-label">{port.name}</span>
                        <div
                            className={`port-circle-marker ${port.type}-port ${port.direction}-port ${hasConnection?.(port.id) ? 'connected' : ''}`}
                            data-node-id={node.id}
                            data-port-id={port.id}
                            data-port-type={port.type}
                            onMouseDown={(e) => handlePortMouseDown?.(port.id, e)}
                            onMouseUp={(e) => handlePortMouseUp?.(port.id, e)}
                            onMouseEnter={() => handlePortMouseEnter?.(port.id)}
                            onMouseLeave={handlePortMouseLeave}
                            title={port.name}
                        />
                    </div>
                ))}
            </div>
        </div>
    );
}
