/**
 * MIDI Node - MIDI controller input
 *
 * Connects to MIDI devices via Web MIDI API
 * Supports device presets for known controllers (MiniLab 3, etc.)
 * Falls back to generic mode for unknown devices
 *
 * Design: Hierarchical node with internal canvas structure
 * Press E to dive into internal canvas and see MIDI routing
 */

import { useEffect, useCallback } from 'react';
import type { GraphNode, MIDIInputNodeData } from '../../engine/types';
import { useMIDIStore } from '../../store/midiStore';
import { getPresetRegistry } from '../../midi';

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
    const presetName = preset?.name ?? 'Generic MIDI';

    // Get connected device info
    const connectedDevice = data.deviceId ? inputs.get(data.deviceId) : null;
    const isConnected = data.isConnected && connectedDevice?.state === 'connected';

    // Initialize MIDI on mount
    useEffect(() => {
        if (isSupported && !isInitialized) {
            initialize();
        }
    }, [isSupported, isInitialized, initialize]);

    // Handle clicking on the device area to open browser
    const handleDeviceClick = useCallback((e: React.MouseEvent) => {
        e.stopPropagation();
        openBrowser();
    }, [openBrowser]);

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
                    <span className="schematic-title">MIDI Input</span>
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
            className={`midi-node schematic-node ${isConnected ? 'connected' : ''} ${isSelected ? 'selected' : ''} ${isDragging ? 'dragging' : ''}`}
            style={style}
            onMouseEnter={handleNodeMouseEnter}
            onMouseLeave={handleNodeMouseLeave}
        >
            {/* Header */}
            <div
                className="schematic-header"
                onMouseDown={handleHeaderMouseDown}
            >
                <span className="schematic-title">MIDI</span>
                {/* Connection status indicator */}
                <div
                    className={`midi-status-dot ${isConnected ? 'connected' : 'disconnected'}`}
                    title={isConnected ? 'Device connected' : 'No device connected'}
                />
            </div>

            {/* Device selector area */}
            <div
                className="midi-device-area"
                onClick={handleDeviceClick}
                title="Click to select MIDI device"
            >
                {connectedDevice ? (
                    <>
                        <span className="midi-device-name">{connectedDevice.name}</span>
                        <span className="midi-preset-name">{presetName}</span>
                    </>
                ) : (
                    <span className="midi-no-device">Click to select device</span>
                )}
            </div>

            {/* Body - Show auto-generated ports from internal canvas */}
            <div className="midi-schematic-body">
                {node.ports.length === 0 ? (
                    <div className="midi-no-ports">
                        <span>No outputs configured</span>
                    </div>
                ) : (
                    node.ports.map((port) => (
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
                    ))
                )}
            </div>

            {/* Connected indicator badge */}
            {isConnected && (
                <div
                    className="midi-connected-badge"
                    style={{
                        position: 'absolute',
                        top: -8,
                        right: -8,
                        width: 16,
                        height: 16,
                        borderRadius: '50%',
                        background: 'var(--accent-success)',
                        border: '2px solid var(--sketch-black)',
                        boxShadow: '0 0 8px var(--accent-success)'
                    }}
                />
            )}

            {/* MIDI Learn mode indicator */}
            {data.midiLearnMode && (
                <div
                    className="midi-learn-badge"
                    style={{
                        position: 'absolute',
                        top: -8,
                        left: -8,
                        padding: '2px 6px',
                        borderRadius: '4px',
                        background: 'var(--accent-primary)',
                        border: '2px solid var(--sketch-black)',
                        fontSize: '10px',
                        fontWeight: 'bold',
                        color: 'white'
                    }}
                >
                    LEARN
                </div>
            )}
        </div>
    );
}
