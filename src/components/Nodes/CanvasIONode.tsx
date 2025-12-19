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

interface CanvasIONodeProps {
    node: GraphNode;
    isGhost?: boolean;
}

export function CanvasIONode({ node, isGhost }: CanvasIONodeProps) {
    const updateNodeData = useGraphStore(s => s.updateNodeData);
    const [isEditing, setIsEditing] = useState(false);
    const [tempName, setTempName] = useState('');

    const portName = (node.data.portName as string) || '';
    const isInput = node.type === 'canvas-input';

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

    return (
        <div className={`schematic-node canvas-io-node ${node.type} ${isGhost ? 'ghost' : ''}`}>
            {/* Port indicator */}
            <div className="io-indicator">
                <div className={`port-dot ${isInput ? 'output' : 'input'}`} />
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
