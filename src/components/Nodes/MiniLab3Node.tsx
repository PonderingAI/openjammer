/**
 * MiniLab 3 Node - Arturia MiniLab 3 MIDI Controller
 *
 * Full visual representation with per-control output ports.
 * Each key, pad, knob, fader, and touch strip is directly connectable.
 *
 * Output signals are normalized:
 * - Keys/Pads: 0 (released) to 1 (pressed with full velocity)
 * - Knobs/Faders/ModWheel: 0 to 1
 * - Pitch Bend: -1 to 1 (center = 0)
 */

import { useEffect, useCallback } from 'react';
import type { GraphNode, MIDIInputNodeData } from '../../engine/types';
import { useMIDIStore } from '../../store/midiStore';
import { MiniLab3Visual } from './MiniLab3Visual';
import './MIDIVisualNode.css';

interface MiniLab3NodeProps {
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

export function MiniLab3Node({
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
}: MiniLab3NodeProps) {
    const data = node.data as MIDIInputNodeData;

    // MIDI store state
    const isSupported = useMIDIStore((s) => s.isSupported);
    const isInitialized = useMIDIStore((s) => s.isInitialized);
    const inputs = useMIDIStore((s) => s.inputs);
    const initialize = useMIDIStore((s) => s.initialize);
    const openBrowser = useMIDIStore((s) => s.openBrowser);

    // Get connected device info
    const connectedDevice = data.deviceId ? inputs.get(data.deviceId) : null;
    const isConnected = data.isConnected && connectedDevice?.state === 'connected';

    // Initialize MIDI on mount
    useEffect(() => {
        if (isSupported && !isInitialized) {
            initialize();
        }
    }, [isSupported, isInitialized, initialize]);

    // Handle clicking on the header to open MIDI device browser
    const handleDeviceClick = useCallback((e: React.MouseEvent) => {
        e.stopPropagation();
        openBrowser();
    }, [openBrowser]);

    // Don't render if Web MIDI not supported
    if (!isSupported) {
        return (
            <div
                className={`minilab3-node schematic-node midi-unsupported ${isSelected ? 'selected' : ''}`}
                style={style}
                onMouseEnter={handleNodeMouseEnter}
                onMouseLeave={handleNodeMouseLeave}
            >
                <div className="schematic-header" onMouseDown={handleHeaderMouseDown}>
                    <span className="schematic-title">MiniLab 3</span>
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
            className={`minilab3-node schematic-node ${isConnected ? 'connected' : ''} ${isSelected ? 'selected' : ''} ${isDragging ? 'dragging' : ''}`}
            style={style}
            onMouseEnter={handleNodeMouseEnter}
            onMouseLeave={handleNodeMouseLeave}
        >
            {/* Header - draggable */}
            <div
                className="minilab3-header"
                onMouseDown={handleHeaderMouseDown}
            >
                <span className="schematic-title">MiniLab 3</span>
                {isConnected && (
                    <div
                        className="midi-status-dot connected"
                        title={`Connected: ${connectedDevice?.name || 'Unknown device'}`}
                    />
                )}
            </div>

            {/* Connect button overlay - only shows when not connected */}
            {!isConnected && (
                <div className="minilab3-connect-overlay">
                    <button
                        className="minilab3-connect-btn"
                        onClick={handleDeviceClick}
                        title="Connect MIDI device"
                    >
                        Connect Device
                    </button>
                </div>
            )}

            {/* Visual representation with per-control ports */}
            <MiniLab3Visual
                deviceId={data.deviceId}
                handlePortMouseDown={handlePortMouseDown}
                handlePortMouseUp={handlePortMouseUp}
                handlePortMouseEnter={handlePortMouseEnter}
                handlePortMouseLeave={handlePortMouseLeave}
                hasConnection={hasConnection}
            />

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
        </div>
    );
}

export default MiniLab3Node;
