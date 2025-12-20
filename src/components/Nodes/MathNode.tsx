/**
 * Math Node - Shared component for Add and Subtract nodes
 *
 * Features:
 * - 2 universal inputs, 1 universal output
 * - Rainbow ports that resolve to connected type
 * - Cannot be entered (E key flashes red)
 */

import type { GraphNode } from '../../engine/types';
import { useUIFeedbackStore } from '../../store/uiFeedbackStore';

interface MathNodeProps {
    node: GraphNode;
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

export function MathNode({
    node,
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
}: MathNodeProps) {
    const flashingNodes = useUIFeedbackStore(s => s.flashingNodes);
    const isFlashing = flashingNodes.has(node.id);
    const isAdd = node.type === 'add';

    // Get resolved type for port coloring (stored in node data)
    const resolvedType = node.data.resolvedType as 'audio' | 'control' | null;

    // Determine port class based on resolved type
    const getPortClass = (portId: string) => {
        const isConnected = hasConnection?.(portId);
        let classes = 'port-dot universal';

        if (resolvedType) {
            classes += ` resolved-${resolvedType}`;
        }
        if (isConnected) {
            classes += ' connected';
        }
        return classes;
    };

    // Get input and output ports
    const inputPorts = node.ports.filter(p => p.direction === 'input');
    const outputPorts = node.ports.filter(p => p.direction === 'output');

    return (
        <div
            className={`schematic-node math-node ${node.type} ${isFlashing ? 'deletion-attempted' : ''} ${isSelected ? 'selected' : ''} ${isDragging ? 'dragging' : ''}`}
            style={style}
            onMouseEnter={handleNodeMouseEnter}
            onMouseLeave={handleNodeMouseLeave}
        >
            {/* Header */}
            <div
                className="math-header"
                onMouseDown={handleHeaderMouseDown}
            >
                <span className="math-symbol">{isAdd ? '+' : '−'}</span>
                <span className="math-name">{isAdd ? 'Add' : 'Subtract'}</span>
            </div>

            {/* Body with ports - inputs left, output right */}
            <div className="math-body">
                {/* Input ports on left */}
                <div className="math-inputs">
                    {inputPorts.map((port, i) => (
                        <div key={port.id} className="math-port-row">
                            <div
                                className={getPortClass(port.id)}
                                data-node-id={node.id}
                                data-port-id={port.id}
                                onMouseDown={(e) => { e.stopPropagation(); handlePortMouseDown?.(port.id, e); }}
                                onMouseUp={(e) => { e.stopPropagation(); handlePortMouseUp?.(port.id, e); }}
                                onMouseEnter={() => handlePortMouseEnter?.(port.id)}
                                onMouseLeave={handlePortMouseLeave}
                            />
                            {!isAdd && i === 1 && <span className="subtract-indicator">(−)</span>}
                        </div>
                    ))}
                </div>

                {/* Output port on right */}
                <div className="math-outputs">
                    {outputPorts.map(port => (
                        <div key={port.id} className="math-port-row output">
                            <div
                                className={getPortClass(port.id)}
                                data-node-id={node.id}
                                data-port-id={port.id}
                                onMouseDown={(e) => { e.stopPropagation(); handlePortMouseDown?.(port.id, e); }}
                                onMouseUp={(e) => { e.stopPropagation(); handlePortMouseUp?.(port.id, e); }}
                                onMouseEnter={() => handlePortMouseEnter?.(port.id)}
                                onMouseLeave={handlePortMouseLeave}
                            />
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
