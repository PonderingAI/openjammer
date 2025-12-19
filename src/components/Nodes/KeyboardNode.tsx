/**
 * Keyboard Node - Routes keyboard input to connected instruments
 *
 * Auto-assigns a number key (2-9) when created
 * Pressing that number key activates this keyboard's input mode
 * Q-M rows then send input to connected instruments
 *
 * Design: Compact pill-shaped node with bundled connection support
 * Simple mode: Single bundle port (default)
 * Advanced mode: Individual port per key (30 ports)
 */

import { useEffect } from 'react';
import { useAudioStore } from '../../store/audioStore';
import { useGraphStore } from '../../store/graphStore';
import type { GraphNode, KeyboardNodeData, PortDefinition } from '../../engine/types';

interface KeyboardNodeProps {
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

// Key layout constants
const KEY_ROWS = {
    row1: ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p'],
    row2: ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l'],
    row3: ['z', 'x', 'c', 'v', 'b', 'n', 'm', ',', '.', '/']
};

const ROW_LABELS = {
    row1: 'Row 1 (Q-P)',
    row2: 'Row 2 (A-L)',
    row3: 'Row 3 (Z-/)'
};

// Generate individual key ports for advanced mode
function generateKeyPorts(): PortDefinition[] {
    const ports: PortDefinition[] = [];

    Object.values(KEY_ROWS).forEach((keys) => {
        keys.forEach(key => {
            ports.push({
                id: `key-${key}`,
                name: key.toUpperCase(),
                type: 'technical',
                direction: 'output'
            });
        });
    });

    // Add control port
    ports.push({
        id: 'control',
        name: 'Control (Space)',
        type: 'technical',
        direction: 'output'
    });

    return ports;
}

export function KeyboardNode({
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
}: KeyboardNodeProps) {
    const data = node.data as KeyboardNodeData;
    const activeKeyboardId = useAudioStore((s) => s.activeKeyboardId);
    const controlDown = useAudioStore((s) => s.controlDown);

    const registerKeyboard = useAudioStore((s) => s.registerKeyboard);
    const unregisterKeyboard = useAudioStore((s) => s.unregisterKeyboard);

    const updateNodeData = useGraphStore((s) => s.updateNodeData);
    const updateNodePorts = useGraphStore((s) => s.updateNodePorts);

    const isActive = activeKeyboardId === node.id;
    const assignedKey = data.assignedKey ?? 2;
    const viewMode = data.viewMode ?? 'simple';

    // Register this keyboard with its assigned number
    useEffect(() => {
        registerKeyboard(assignedKey, node.id);
        return () => unregisterKeyboard(assignedKey);
    }, [assignedKey, node.id, registerKeyboard, unregisterKeyboard]);

    // Handle mode switching
    const switchToAdvanced = () => {
        // Update view mode
        updateNodeData<KeyboardNodeData>(node.id, { viewMode: 'advanced' });

        // Generate and set individual key ports
        const advancedPorts = generateKeyPorts();
        updateNodePorts(node.id, advancedPorts);
    };

    const switchToSimple = () => {
        // Update view mode
        updateNodeData<KeyboardNodeData>(node.id, { viewMode: 'simple' });

        // Restore simple mode ports (bundle + control)
        const simplePorts: PortDefinition[] = [
            { id: 'bundle-out', name: 'Keys Bundle', type: 'technical', direction: 'output', isBundled: true },
            { id: 'control', name: 'Control (Space)', type: 'technical', direction: 'output' }
        ];
        updateNodePorts(node.id, simplePorts);
    };

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

            {/* Body - Simple Mode */}
            {viewMode === 'simple' && (
                <div className="keyboard-schematic-body">
                    {/* Bundle port */}
                    <div className="bundle-port-row">
                        <span className="port-label">
                            <span className="bundle-icon">🎹</span>
                            <span>Keys Bundle</span>
                        </span>
                        <div
                            className={`port-circle-marker bundle-port ${hasConnection?.('bundle-out') ? 'connected' : ''}`}
                            data-node-id={node.id}
                            data-port-id="bundle-out"
                            onMouseDown={(e) => handlePortMouseDown?.('bundle-out', e)}
                            onMouseUp={(e) => handlePortMouseUp?.('bundle-out', e)}
                            onMouseEnter={() => handlePortMouseEnter?.('bundle-out')}
                            onMouseLeave={handlePortMouseLeave}
                            title="Keys Bundle (30 keys)"
                        />
                    </div>

                    {/* Control port */}
                    <div className="control-port-row">
                        <span className="port-label">
                            <span className="binary-label">0/1</span>
                            <span>Control</span>
                        </span>
                        <div
                            className={`port-circle-marker control-port ${hasConnection?.('control') ? 'connected' : ''} ${isActive && controlDown ? 'control-active' : ''}`}
                            data-node-id={node.id}
                            data-port-id="control"
                            onMouseDown={(e) => handlePortMouseDown?.('control', e)}
                            onMouseUp={(e) => handlePortMouseUp?.('control', e)}
                            onMouseEnter={() => handlePortMouseEnter?.('control')}
                            onMouseLeave={handlePortMouseLeave}
                            title="Control (Space)"
                        />
                    </div>

                    {/* Expand button */}
                    <button
                        className="expand-btn"
                        onClick={switchToAdvanced}
                        title="Switch to advanced mode for per-key control"
                    >
                        ⚙️ Advanced
                    </button>
                </div>
            )}

            {/* Body - Advanced Mode */}
            {viewMode === 'advanced' && (
                <div className="keyboard-schematic-body advanced-mode">
                    {/* Row 1: Q-P */}
                    <div className="key-row-section">
                        <div className="key-row-label">{ROW_LABELS.row1}</div>
                        <div className="key-ports-grid">
                            {KEY_ROWS.row1.map((key) => {
                                const portId = `key-${key}`;
                                return (
                                    <div key={portId} className="key-port-item">
                                        <span className="key-label">{key.toUpperCase()}</span>
                                        <div
                                            className={`port-circle-marker key-port ${hasConnection?.(portId) ? 'connected' : ''}`}
                                            data-node-id={node.id}
                                            data-port-id={portId}
                                            onMouseDown={(e) => handlePortMouseDown?.(portId, e)}
                                            onMouseUp={(e) => handlePortMouseUp?.(portId, e)}
                                            onMouseEnter={() => handlePortMouseEnter?.(portId)}
                                            onMouseLeave={handlePortMouseLeave}
                                            title={`Key ${key.toUpperCase()}`}
                                        />
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    {/* Row 2: A-L */}
                    <div className="key-row-section">
                        <div className="key-row-label">{ROW_LABELS.row2}</div>
                        <div className="key-ports-grid">
                            {KEY_ROWS.row2.map((key) => {
                                const portId = `key-${key}`;
                                return (
                                    <div key={portId} className="key-port-item">
                                        <span className="key-label">{key.toUpperCase()}</span>
                                        <div
                                            className={`port-circle-marker key-port ${hasConnection?.(portId) ? 'connected' : ''}`}
                                            data-node-id={node.id}
                                            data-port-id={portId}
                                            onMouseDown={(e) => handlePortMouseDown?.(portId, e)}
                                            onMouseUp={(e) => handlePortMouseUp?.(portId, e)}
                                            onMouseEnter={() => handlePortMouseEnter?.(portId)}
                                            onMouseLeave={handlePortMouseLeave}
                                            title={`Key ${key.toUpperCase()}`}
                                        />
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    {/* Row 3: Z-/ */}
                    <div className="key-row-section">
                        <div className="key-row-label">{ROW_LABELS.row3}</div>
                        <div className="key-ports-grid">
                            {KEY_ROWS.row3.map((key) => {
                                const portId = `key-${key}`;
                                return (
                                    <div key={portId} className="key-port-item">
                                        <span className="key-label">{key.toUpperCase()}</span>
                                        <div
                                            className={`port-circle-marker key-port ${hasConnection?.(portId) ? 'connected' : ''}`}
                                            data-node-id={node.id}
                                            data-port-id={portId}
                                            onMouseDown={(e) => handlePortMouseDown?.(portId, e)}
                                            onMouseUp={(e) => handlePortMouseUp?.(portId, e)}
                                            onMouseEnter={() => handlePortMouseEnter?.(portId)}
                                            onMouseLeave={handlePortMouseLeave}
                                            title={`Key ${key.toUpperCase()}`}
                                        />
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    {/* Control port */}
                    <div className="control-port-row">
                        <span className="port-label">
                            <span className="binary-label">0/1</span>
                            <span>Control</span>
                        </span>
                        <div
                            className={`port-circle-marker control-port ${hasConnection?.('control') ? 'connected' : ''} ${isActive && controlDown ? 'control-active' : ''}`}
                            data-node-id={node.id}
                            data-port-id="control"
                            onMouseDown={(e) => handlePortMouseDown?.('control', e)}
                            onMouseUp={(e) => handlePortMouseUp?.('control', e)}
                            onMouseEnter={() => handlePortMouseEnter?.('control')}
                            onMouseLeave={handlePortMouseLeave}
                            title="Control (Space)"
                        />
                    </div>

                    {/* Collapse button */}
                    <button
                        className="collapse-btn"
                        onClick={switchToSimple}
                        title="Switch to simple mode"
                    >
                        ⊗ Collapse
                    </button>
                </div>
            )}

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
