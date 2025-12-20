/**
 * Canvas I/O Node - Input/Output nodes for hierarchical canvas system
 *
 * These nodes represent ports on the parent canvas:
 * - canvas-input: Receives signal from parent level
 * - canvas-output: Sends signal to parent level
 */

import { useState } from 'react';
import type { GraphNode } from '../../engine/types';
import { useGraphStore } from '../../store/graphStore';
import { useUIFeedbackStore } from '../../store/uiFeedbackStore';

interface CanvasIONodeProps {
    node: GraphNode;
    isGhost?: boolean;
    style?: React.CSSProperties;
    handleHeaderMouseDown?: (e: React.MouseEvent) => void;
    handleNodeMouseEnter?: () => void;
    handleNodeMouseLeave?: () => void;
    handlePortMouseDown?: (portId: string, e: React.MouseEvent) => void;
    handlePortMouseUp?: (portId: string, e: React.MouseEvent) => void;
    handlePortMouseEnter?: (portId: string) => void;
    handlePortMouseLeave?: () => void;
    isSelected?: boolean;
    isDragging?: boolean;
    hasConnection?: (portId: string) => boolean;
}

export function CanvasIONode({
    node,
    isGhost,
    style,
    handleHeaderMouseDown,
    handleNodeMouseEnter,
    handleNodeMouseLeave,
    handlePortMouseDown,
    handlePortMouseUp,
    handlePortMouseEnter,
    handlePortMouseLeave,
    isSelected,
    isDragging,
    hasConnection
}: CanvasIONodeProps) {
    const updateNodeData = useGraphStore(s => s.updateNodeData);
    const flashingNodes = useUIFeedbackStore(s => s.flashingNodes);
    const [isEditing, setIsEditing] = useState(false);
    const [tempName, setTempName] = useState('');

    const portName = (node.data.portName as string) || '';
    const isInput = node.type === 'canvas-input';
    const isFlashing = flashingNodes.has(node.id);

    const handleNameClick = () => {
        setTempName(portName);
        setIsEditing(true);
    };

    const handleNameSave = () => {
        if (tempName.trim()) {
            updateNodeData(node.id, { portName: tempName.trim() });
        }
        setIsEditing(false);
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            handleNameSave();
        } else if (e.key === 'Escape') {
            setIsEditing(false);
        }
    };

    // Get the port ID for connections
    const portId = node.ports[0]?.id || (isInput ? 'out' : 'in');
    const isConnected = hasConnection?.(portId) || false;

    return (
        <div
            className={`schematic-node canvas-io-node ${node.type} ${isGhost ? 'ghost' : ''} ${isFlashing ? 'deletion-attempted' : ''} ${isSelected ? 'selected' : ''} ${isDragging ? 'dragging' : ''}`}
            style={style}
            onMouseDown={handleHeaderMouseDown}
            onMouseEnter={handleNodeMouseEnter}
            onMouseLeave={handleNodeMouseLeave}
        >
            {/* Port indicator */}
            <div className="io-indicator">
                <div
                    className={`port-dot ${isInput ? 'output' : 'input'} ${isConnected ? 'connected' : ''}`}
                    data-node-id={node.id}
                    data-port-id={portId}
                    onMouseDown={(e) => {
                        e.stopPropagation();
                        handlePortMouseDown?.(portId, e);
                    }}
                    onMouseUp={(e) => {
                        e.stopPropagation();
                        handlePortMouseUp?.(portId, e);
                    }}
                    onMouseEnter={() => handlePortMouseEnter?.(portId)}
                    onMouseLeave={handlePortMouseLeave}
                />
            </div>

            {/* Name field */}
            <div className="io-name-field" onClick={handleNameClick}>
                {isEditing ? (
                    <input
                        type="text"
                        value={tempName}
                        onChange={(e) => setTempName(e.target.value)}
                        onBlur={handleNameSave}
                        onKeyDown={handleKeyDown}
                        autoFocus
                        placeholder="Port name..."
                        className="name-input"
                        onClick={(e) => e.stopPropagation()}
                    />
                ) : (
                    <span className="name-text">
                        {portName || `${isInput ? 'Input' : 'Output'} (click to name)`}
                    </span>
                )}
            </div>

            {/* Type label */}
            <div className="io-type-label">
                {isInput ? '← From Parent' : 'To Parent →'}
            </div>
        </div>
    );
}
