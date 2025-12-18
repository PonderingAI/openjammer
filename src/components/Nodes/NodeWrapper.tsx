/**
 * Node Wrapper - Handles node positioning, selection, and dragging
 */

import { useCallback, useRef, useState } from 'react';
import type { GraphNode, Position } from '../../engine/types';
import { useGraphStore } from '../../store/graphStore';
import { useCanvasStore } from '../../store/canvasStore';
import { InstrumentNode } from './InstrumentNode';
import { MicrophoneNode } from './MicrophoneNode';
import { KeyboardNode } from './KeyboardNode';
import { LooperNode } from './LooperNode';
import { EffectNode } from './EffectNode';
import { AmplifierNode } from './AmplifierNode';
import { SpeakerNode } from './SpeakerNode';
import { RecorderNode } from './RecorderNode';
import './BaseNode.css';

interface NodeWrapperProps {
    node: GraphNode;
}

// Schematic nodes render their own container - no wrapper needed
const SCHEMATIC_TYPES = [
    'keyboard',
    'piano', 'cello', 'violin', 'saxophone', 'strings', 'keys', 'winds',
    'speaker'
];

export function NodeWrapper({ node }: NodeWrapperProps) {
    const nodeRef = useRef<HTMLDivElement>(null);
    const [isDragging, setIsDragging] = useState(false);
    const dragStart = useRef<Position>({ x: 0, y: 0 });
    const nodeStart = useRef<Position>({ x: 0, y: 0 });

    const selectedNodeIds = useGraphStore((s) => s.selectedNodeIds);
    const selectNode = useGraphStore((s) => s.selectNode);
    const updateNodePosition = useGraphStore((s) => s.updateNodePosition);
    const connections = useGraphStore((s) => s.connections);
    const addConnection = useGraphStore((s) => s.addConnection);

    const zoom = useCanvasStore((s) => s.zoom);
    const startConnecting = useCanvasStore((s) => s.startConnecting);
    const stopConnecting = useCanvasStore((s) => s.stopConnecting);

    const isSelected = selectedNodeIds.has(node.id);
    const isSchematic = SCHEMATIC_TYPES.includes(node.type);

    // Check if a port has connections
    const hasConnection = useCallback((portId: string) => {
        return Array.from(connections.values()).some(
            conn =>
                (conn.sourceNodeId === node.id && conn.sourcePortId === portId) ||
                (conn.targetNodeId === node.id && conn.targetPortId === portId)
        );
    }, [connections, node.id]);

    // Handle node header drag
    const handleHeaderMouseDown = useCallback((e: React.MouseEvent) => {
        if (e.button !== 0) return;
        e.stopPropagation();

        selectNode(node.id, e.shiftKey);
        setIsDragging(true);
        dragStart.current = { x: e.clientX, y: e.clientY };
        nodeStart.current = { ...node.position };

        const handleMouseMove = (e: MouseEvent) => {
            const dx = (e.clientX - dragStart.current.x) / zoom;
            const dy = (e.clientY - dragStart.current.y) / zoom;

            updateNodePosition(node.id, {
                x: nodeStart.current.x + dx,
                y: nodeStart.current.y + dy
            });
        };

        const handleMouseUp = () => {
            setIsDragging(false);
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        };

        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mouseup', handleMouseUp);
    }, [node.id, node.position, zoom, selectNode, updateNodePosition]);

    // Handle port click for connections
    const handlePortClick = useCallback((portId: string, e: React.MouseEvent) => {
        e.stopPropagation();

        // Read current connecting state directly from store to avoid stale closure
        const currentIsConnecting = useCanvasStore.getState().isConnecting;
        const currentConnectingFrom = useCanvasStore.getState().connectingFrom;

        if (currentIsConnecting && currentConnectingFrom) {
            const sources = Array.isArray(currentConnectingFrom) ? currentConnectingFrom : [currentConnectingFrom];
            const targetPort = node.ports.find(p => p.id === portId);
            if (!targetPort) return;

            // Check if we need to auto-expand an instrument node
            const isInstrument = ['piano', 'cello', 'violin', 'saxophone'].includes(node.type);
            const updateNodePorts = useGraphStore.getState().updateNodePorts;

            if (isInstrument && targetPort.direction === 'input' && sources.length > 1) {
                const currentInputs = node.ports.filter(p => p.direction === 'input' && p.type === 'technical');
                const clickedIndex = currentInputs.findIndex(p => p.id === portId);

                if (clickedIndex === -1) return;

                const neededCount = clickedIndex + sources.length;
                const availableCount = currentInputs.length;

                if (neededCount > availableCount) {
                    const newPorts = [...node.ports];
                    const portsToAdd = neededCount - availableCount;

                    for (let i = 0; i < portsToAdd; i++) {
                        const nextIndex = availableCount + i + 1;
                        newPorts.push({
                            id: `input-${Date.now()}-${i}`,
                            name: `In ${nextIndex}`,
                            type: 'technical',
                            direction: 'input'
                        });
                    }

                    updateNodePorts(node.id, newPorts);
                }
            }

            const updatedNode = useGraphStore.getState().nodes.get(node.id) || node;
            const updatedInputs = updatedNode.ports.filter(p => p.direction === 'input' && p.type === 'technical');

            sources.forEach((source, index) => {
                let actualTargetPortId = portId;

                if (index > 0 && targetPort.direction === 'input' && isInstrument) {
                    const clickedIndex = updatedInputs.findIndex(p => p.id === portId);
                    if (clickedIndex !== -1 && (clickedIndex + index) < updatedInputs.length) {
                        actualTargetPortId = updatedInputs[clickedIndex + index].id;
                    } else {
                        return;
                    }
                }

                if (targetPort.direction === 'input') {
                    addConnection(source.nodeId, source.portId, node.id, actualTargetPortId);
                } else {
                    addConnection(node.id, actualTargetPortId, source.nodeId, source.portId);
                }
            });

            stopConnecting();
        } else {
            startConnecting(node.id, portId);
        }
    }, [node, addConnection, startConnecting, stopConnecting]);

    // Common props for schematic nodes
    const schematicProps = {
        node,
        handlePortClick,
        hasConnection,
        handleHeaderMouseDown,
        isSelected,
        isDragging,
        style: {
            left: node.position.x,
            top: node.position.y
        }
    };

    // For schematic nodes, render the component directly without wrapper
    if (isSchematic) {
        switch (node.type) {
            case 'keyboard':
                return <KeyboardNode {...schematicProps} />;
            case 'piano':
            case 'cello':
            case 'violin':
            case 'saxophone':
            case 'strings':
            case 'keys':
            case 'winds':
                return <InstrumentNode {...schematicProps} />;
            case 'speaker':
                return <SpeakerNode {...schematicProps} />;
        }
    }

    // Standard nodes with wrapper
    const inputPorts = node.ports.filter(p => p.direction === 'input');
    const outputPorts = node.ports.filter(p => p.direction === 'output');

    const renderNodeContent = () => {
        switch (node.type) {
            case 'microphone':
                return <MicrophoneNode node={node} />;
            case 'looper':
                return <LooperNode node={node} />;
            case 'effect':
                return <EffectNode node={node} />;
            case 'amplifier':
                return <AmplifierNode node={node} />;
            case 'recorder':
                return <RecorderNode node={node} />;
            default:
                return <div>Unknown node type</div>;
        }
    };

    return (
        <div
            ref={nodeRef}
            className={`node ${node.type} ${isSelected ? 'selected' : ''} ${isDragging ? 'dragging' : ''}`}
            style={{
                left: node.position.x,
                top: node.position.y
            }}
            onClick={(e) => e.stopPropagation()}
        >
            {/* Header */}
            <div className="node-header" onMouseDown={handleHeaderMouseDown}>
                <span className="node-title">{node.type.charAt(0).toUpperCase() + node.type.slice(1)}</span>
                <span className="node-type">{node.category}</span>
            </div>

            {/* Ports */}
            <div className="node-ports">
                <div className="node-ports-left">
                    {inputPorts.map((port) => (
                        <div
                            key={port.id}
                            className={`port port-input`}
                            onClick={(e) => handlePortClick(port.id, e)}
                        >
                            <div
                                className={`port-dot ${port.type === 'audio' ? 'audio-input' : 'technical'} ${hasConnection(port.id) ? 'connected' : ''}`}
                                data-node-id={node.id}
                                data-port-id={port.id}
                            />
                            <span className="port-label">{port.name}</span>
                        </div>
                    ))}
                </div>

                <div className="node-ports-right">
                    {outputPorts.map((port) => (
                        <div
                            key={port.id}
                            className={`port port-output`}
                            onClick={(e) => handlePortClick(port.id, e)}
                        >
                            <span className="port-label">{port.name}</span>
                            <div
                                className={`port-dot ${port.type === 'audio' ? 'audio-output' : 'technical'} ${hasConnection(port.id) ? 'connected' : ''}`}
                                data-node-id={node.id}
                                data-port-id={port.id}
                            />
                        </div>
                    ))}
                </div>
            </div>

            {/* Content */}
            <div className="node-content">
                {renderNodeContent()}
            </div>
        </div>
    );
}
