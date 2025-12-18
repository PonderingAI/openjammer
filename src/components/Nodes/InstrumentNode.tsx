/**
 * Instrument Node - Virtual instrument with dynamic inputs from Keyboard Node
 *
 * Design: Hand-drawn schematic with clickable header to open settings popup
 * Shows note grid with scientific notation and offset values
 */

import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import type { GraphNode, InstrumentNodeData } from '../../engine/types';
import { useGraphStore } from '../../store/graphStore';
import { useAudioStore } from '../../store/audioStore';
import { createInstrument, type Instrument, type InstrumentType } from '../../audio/Instruments';
import { nodeDefinitions } from '../../engine/registry';

interface InstrumentNodeProps {
    node: GraphNode;
    handlePortClick?: (portId: string, e: React.MouseEvent) => void;
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

// Constants
const NOTE_NAMES = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
const MAX_INPUT_PORTS = 7;
const DRAG_THRESHOLD_PX = 5;

// Instrument display names
const INSTRUMENT_LABELS: Record<string, string> = {
    piano: 'Classic Piano',
    cello: 'Cello',
    violin: 'Violin',
    saxophone: 'Saxophone',
    strings: 'Strings',
    keys: 'Keys',
    winds: 'Winds'
};

export function InstrumentNode({
    node,
    handlePortClick,
    hasConnection,
    handleHeaderMouseDown,
    handleNodeMouseEnter,
    handleNodeMouseLeave,
    isSelected,
    isDragging,
    isHoveredWithConnections,
    incomingConnectionCount = 0,
    style
}: InstrumentNodeProps) {
    const data = node.data as unknown as InstrumentNodeData;
    const updateNodeData = useGraphStore((s) => s.updateNodeData);
    const connections = useGraphStore((s) => s.connections);
    const isAudioContextReady = useAudioStore((s) => s.isAudioContextReady);

    // Internal audio state
    const instrumentRef = useRef<Instrument | null>(null);
    const [showPopup, setShowPopup] = useState(false);
    const [dragStartPos, setDragStartPos] = useState<{x: number, y: number} | null>(null);

    // Initialize instrument audio
    useEffect(() => {
        if (!isAudioContextReady) return;
        const type = node.type as InstrumentType;
        const inst = createInstrument(type);
        instrumentRef.current = inst;
        return () => inst.disconnect();
    }, [isAudioContextReady, node.type]);

    // Handle Escape key to close popup
    useEffect(() => {
        if (!showPopup) return;

        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                e.preventDefault();
                setShowPopup(false);
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [showPopup]);

    // Get persisted input ports
    const persistedInputPorts = node.ports.filter(p => p.direction === 'input' && p.type === 'technical');
    const outputPort = node.ports.find(p => p.direction === 'output' && p.type === 'audio');

    // Count connected ports
    const connectedCount = persistedInputPorts.filter(p =>
        Array.from(connections.values()).some(c => c.targetNodeId === node.id && c.targetPortId === p.id)
    ).length;

    // Calculate visible port count:
    // - Always show at least 1 port
    // - Show all connected ports + 1 empty one (if room)
    // - When hovering with connections, show enough for all incoming
    const baseVisible = Math.max(1, connectedCount + 1);
    const hoverVisible = isHoveredWithConnections ? connectedCount + incomingConnectionCount : 0;
    const visiblePortCount = Math.min(MAX_INPUT_PORTS, Math.max(baseVisible, hoverVisible));

    // Generate visible ports array (mix of persisted + ghost ports)
    const visibleInputPorts = [];
    for (let i = 0; i < visiblePortCount; i++) {
        if (i < persistedInputPorts.length) {
            // Use existing persisted port
            visibleInputPorts.push({
                ...persistedInputPorts[i],
                isGhost: false
            });
        } else {
            // Create a ghost port (temporary, not yet persisted)
            visibleInputPorts.push({
                id: `ghost-input-${i}`,
                name: `In ${i + 1}`,
                type: 'technical' as const,
                direction: 'input' as const,
                isGhost: true
            });
        }
    }

    // Get display name
    const displayName = INSTRUMENT_LABELS[node.type] || nodeDefinitions[node.type]?.name || 'Instrument';

    // Handle header mouse down - track drag start
    const handleHeaderMouseDownLocal = (e: React.MouseEvent) => {
        setDragStartPos({ x: e.clientX, y: e.clientY });
        handleHeaderMouseDown?.(e);
    };

    // Handle header click to open popup (only if not dragging)
    const handleHeaderClick = (e: React.MouseEvent) => {
        if (dragStartPos) {
            const distance = Math.sqrt(
                Math.pow(e.clientX - dragStartPos.x, 2) +
                Math.pow(e.clientY - dragStartPos.y, 2)
            );
            if (distance > DRAG_THRESHOLD_PX) {
                setDragStartPos(null);
                return; // Was a drag, don't open popup
            }
        }
        e.stopPropagation();
        setShowPopup(true);
        setDragStartPos(null);
    };

    // Get note name for a port index
    const getNoteName = (index: number): string => {
        return NOTE_NAMES[index % NOTE_NAMES.length];
    };

    // Get octave for display
    const getOctave = (index: number): number => {
        return Math.floor(index / 7) + 4;
    };

    return (
        <div
            className={`instrument-node schematic-node ${isSelected ? 'selected' : ''} ${isDragging ? 'dragging' : ''} ${isHoveredWithConnections ? 'hover-connecting' : ''}`}
            style={style}
            onMouseEnter={handleNodeMouseEnter}
            onMouseLeave={handleNodeMouseLeave}
        >
            {/* Header - Clickable to open popup */}
            <div
                className="schematic-header"
                onClick={handleHeaderClick}
                onMouseDown={handleHeaderMouseDownLocal}
            >
                <span className="schematic-title">{displayName}</span>
            </div>

            {/* Note Grid */}
            <div className="instrument-schematic-body">
                <div className="note-grid">
                    {visibleInputPorts.map((port, index) => {
                        const offset = data.offsets?.[port.id] ?? 0;
                        const isConnected = !port.isGhost && (hasConnection?.(port.id) ?? false);
                        const isGhost = port.isGhost;

                        return (
                            <div key={port.id} className={`note-row ${isGhost ? 'ghost-port' : ''}`}>
                                {/* Input port circle */}
                                <div
                                    className={`note-input-port ${isConnected ? 'connected' : ''} ${isGhost ? 'ghost' : ''}`}
                                    data-node-id={node.id}
                                    data-port-id={port.id}
                                    onClick={(e) => handlePortClick?.(port.id, e)}
                                    title={port.name}
                                />
                                {/* Note name */}
                                <span className="note-name">
                                    {getNoteName(index)}
                                </span>
                                {/* Octave indicator */}
                                <span className="note-offset">
                                    {getOctave(index)}
                                </span>
                                {/* Offset value */}
                                <span className="note-offset">
                                    {offset >= 0 ? `+${offset}` : offset}
                                </span>
                            </div>
                        );
                    })}
                </div>

                {/* Output port */}
                {outputPort && (
                    <div className="instrument-output">
                        <span className="output-label">output</span>
                        <div
                            className={`output-port ${hasConnection?.(outputPort.id) ? 'connected' : ''}`}
                            data-node-id={node.id}
                            data-port-id={outputPort.id}
                            onClick={(e) => handlePortClick?.(outputPort.id, e)}
                            title={outputPort.name}
                        />
                    </div>
                )}
            </div>

            {/* Settings Popup */}
            {showPopup && createPortal(
                <div
                    className="instrument-popup-overlay"
                    onClick={(e) => { e.stopPropagation(); setShowPopup(false); }}
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby={`instrument-popup-title-${node.id}`}
                >
                    <div
                        className="instrument-popup"
                        onClick={e => e.stopPropagation()}
                    >
                        <div className="instrument-popup-header">
                            <h3 id={`instrument-popup-title-${node.id}`}>{displayName}</h3>
                            <button
                                className="instrument-popup-close"
                                onClick={() => setShowPopup(false)}
                                aria-label="Close settings"
                            >
                                ×
                            </button>
                        </div>
                        <div className="instrument-popup-content">
                            {/* Instrument Type Selection */}
                            <div className="popup-section">
                                <label className="popup-label">Instrument Type</label>
                                <div className="instrument-options">
                                    {['piano', 'cello', 'violin', 'saxophone'].map((type) => (
                                        <div
                                            key={type}
                                            className={`instrument-option ${node.type === type ? 'selected' : ''}`}
                                            onClick={() => {
                                                // Note: Changing type requires node recreation
                                                // For now, show as disabled for current type
                                            }}
                                        >
                                            {INSTRUMENT_LABELS[type]}
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Input Offsets */}
                            <div className="popup-section">
                                <label className="popup-label">Note Offsets</label>
                                <div className="offset-grid">
                                    {persistedInputPorts.map((port, index) => (
                                        <div key={port.id} className="offset-row">
                                            <span className="offset-note">
                                                {getNoteName(index)}{getOctave(index)}
                                            </span>
                                            <input
                                                type="number"
                                                step="0.5"
                                                className="offset-input"
                                                value={data.offsets?.[port.id] ?? 0}
                                                onChange={(e) => {
                                                    const newOffsets = {
                                                        ...(data.offsets || {}),
                                                        [port.id]: parseFloat(e.target.value) || 0
                                                    };
                                                    updateNodeData(node.id, { offsets: newOffsets });
                                                }}
                                            />
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>,
                document.body
            )}
        </div>
    );
}
