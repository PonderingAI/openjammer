/**
 * MiniLab 3 Visual Node - Internal visual representation
 *
 * Shown when entering a MiniLab 3 node with E key.
 * Each control has its own output port visible on the visual.
 * Ports are positioned at the black markers on each control.
 */

import type { GraphNode, MIDIInputNodeData } from '../../engine/types';
import { MiniLab3Visual } from './MiniLab3Visual';
import './MiniLab3Visual.css';

interface MiniLab3VisualNodeProps {
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
    style?: React.CSSProperties;
}

export function MiniLab3VisualNode({
    node,
    handlePortMouseDown,
    handlePortMouseUp,
    handlePortMouseEnter,
    handlePortMouseLeave,
    hasConnection,
    handleNodeMouseEnter,
    handleNodeMouseLeave,
    isSelected,
    isDragging,
    style
}: MiniLab3VisualNodeProps) {
    const data = node.data as MIDIInputNodeData;

    return (
        <div
            className={`minilab3-visual-node schematic-node ${isSelected ? 'selected' : ''} ${isDragging ? 'dragging' : ''}`}
            style={style}
            onMouseEnter={handleNodeMouseEnter}
            onMouseLeave={handleNodeMouseLeave}
        >
            {/* Visual representation with per-control ports */}
            <MiniLab3Visual
                nodeId={node.id}
                deviceId={data.deviceId}
                handlePortMouseDown={handlePortMouseDown}
                handlePortMouseUp={handlePortMouseUp}
                handlePortMouseEnter={handlePortMouseEnter}
                handlePortMouseLeave={handlePortMouseLeave}
                hasConnection={hasConnection}
            />
        </div>
    );
}

export default MiniLab3VisualNode;
