/**
 * Keyboard Node - Routes keyboard input to connected instruments
 *
 * Auto-assigns a number key (2-9) when created
 * Pressing that number key activates this keyboard's input mode
 * Q-M rows then send input to connected instruments
 *
 * Design: Compact pill-shaped node with row switching buttons
 */

import { useEffect, useState } from 'react';
import { useAudioStore } from '../../store/audioStore';
import { useGraphStore } from '../../store/graphStore';

interface KeyboardNodeProps {
    node: import('../../engine/types').GraphNode;
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

interface KeyboardNodeData {
    assignedKey: number; // 2-9
    activeRow: number; // Which row is currently active (1, 2, or 3)
    rowOctaves: number[];
}

export function KeyboardNode({
    node,
    handlePortClick,
    hasConnection,
    handleHeaderMouseDown,
    handleNodeMouseEnter,
    handleNodeMouseLeave,
    isSelected,
    isDragging,
    style
}: KeyboardNodeProps) {
    const data = node.data as unknown as KeyboardNodeData;
    const activeKeyboardId = useAudioStore((s) => s.activeKeyboardId);
    const updateNodeData = useGraphStore((s) => s.updateNodeData);

    const registerKeyboard = useAudioStore((s) => s.registerKeyboard);
    const unregisterKeyboard = useAudioStore((s) => s.unregisterKeyboard);

    const isActive = activeKeyboardId === node.id;
    const assignedKey = data.assignedKey ?? 2;
    const [activeRow, setActiveRow] = useState(data.activeRow ?? 1);

    // Register this keyboard with its assigned number
    useEffect(() => {
        registerKeyboard(assignedKey, node.id);
        return () => unregisterKeyboard(assignedKey);
    }, [assignedKey, node.id, registerKeyboard, unregisterKeyboard]);

    // Sync activeRow with external data changes (undo/redo)
    useEffect(() => {
        if (data.activeRow !== undefined && data.activeRow !== activeRow) {
            setActiveRow(data.activeRow);
        }
    }, [data.activeRow]);

    // Handle row switching
    const handleRowClick = (row: number) => {
        setActiveRow(row);
        updateNodeData(node.id, { activeRow: row });
    };

    // Output ports (should match default ports in registry)
    const outputPorts = node.ports.filter(p => p.direction === 'output');

    return (
        <div
            className={`keyboard-node schematic-node ${isActive ? 'active' : ''} ${isSelected ? 'selected' : ''} ${isDragging ? 'dragging' : ''}`}
            style={style}
            onMouseEnter={handleNodeMouseEnter}
            onMouseLeave={handleNodeMouseLeave}
        >
            {/* Header */}
            <div
                className="schematic-header"
                onMouseDown={handleHeaderMouseDown}
            >
                <span className="schematic-title">Keyboard</span>
                <span className="keyboard-octave">{assignedKey}</span>
            </div>

            {/* Body */}
            <div className="keyboard-schematic-body">
                {/* Row selector buttons: 1 2 3 */}
                <div className="keyboard-row-numbers">
                    {[1, 2, 3].map((row) => (
                        <button
                            key={row}
                            className={`row-number ${activeRow === row ? 'active' : ''}`}
                            onClick={() => handleRowClick(row)}
                            title={`Row ${row} (Octave ${row + 2})`}
                        >
                            {row}
                        </button>
                    ))}
                </div>

                {/* Output port circles */}
                <div className="keyboard-row-ports-marker">
                    {outputPorts.map((port) => (
                        <div
                            key={port.id}
                            className={`port-circle-marker ${hasConnection?.(port.id) ? 'connected' : ''}`}
                            data-node-id={node.id}
                            data-port-id={port.id}
                            onClick={(e) => handlePortClick?.(port.id, e)}
                            title={port.name}
                        />
                    ))}
                    {/* Ensure we always show 3 ports visually */}
                    {outputPorts.length < 3 && Array(3 - outputPorts.length).fill(null).map((_, i) => (
                        <div
                            key={`placeholder-${i}`}
                            className="port-circle-marker disabled"
                            title="No port"
                        />
                    ))}
                </div>
            </div>

            {/* Active indicator */}
            {isActive && (
                <div
                    className="keyboard-active-badge"
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
