/**
 * Node Wrapper - Handles node positioning, selection, and dragging
 */

import { useCallback, useRef, useState, useMemo } from 'react';
import type { GraphNode, Position } from '../../engine/types';
import { useGraphStore } from '../../store/graphStore';
import { useCanvasStore } from '../../store/canvasStore';
import { generateUniqueId } from '../../utils/idGenerator';
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
    const updateNodePorts = useGraphStore((s) => s.updateNodePorts);
    const nodes = useGraphStore((s) => s.nodes);
    const connections = useGraphStore((s) => s.connections);
    const addConnection = useGraphStore((s) => s.addConnection);

    const zoom = useCanvasStore((s) => s.zoom);
    const startConnecting = useCanvasStore((s) => s.startConnecting);
    const stopConnecting = useCanvasStore((s) => s.stopConnecting);
    const isConnecting = useCanvasStore((s) => s.isConnecting);
    const connectingFrom = useCanvasStore((s) => s.connectingFrom);
    const hoverTarget = useCanvasStore((s) => s.hoverTarget);
    const setHoverTarget = useCanvasStore((s) => s.setHoverTarget);

    const isSelected = selectedNodeIds.has(node.id);
    const isSchematic = SCHEMATIC_TYPES.includes(node.type);

    // Check if this node is being hovered while connections are active
    const isHoveredWithConnections = isConnecting && hoverTarget?.nodeId === node.id;

    // Count incoming connections (for dynamic port display)
    const incomingConnectionCount = useMemo(() => {
        if (!isConnecting || !connectingFrom) return 0;
        return connectingFrom.length;
    }, [isConnecting, connectingFrom]);

    // Hover handlers for connection drop targeting
    const handleNodeMouseEnter = useCallback(() => {
        if (isConnecting) {
            setHoverTarget(node.id);
        }
    }, [isConnecting, setHoverTarget, node.id]);

    const handleNodeMouseLeave = useCallback(() => {
        if (isConnecting) {
            setHoverTarget(null);
        }
    }, [isConnecting, setHoverTarget]);

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

        if (isConnecting && connectingFrom) {
            const sources = Array.isArray(connectingFrom) ? connectingFrom : [connectingFrom];
            const isInstrument = ['piano', 'cello', 'violin', 'saxophone', 'strings', 'keys', 'winds'].includes(node.type);

            // Check if clicking on a ghost port (not yet persisted)
            const isGhostPort = portId.startsWith('ghost-input-');
            let actualFirstPortId = portId;

            if (isGhostPort && isInstrument) {
                // Extract the ghost port index
                const ghostIndex = parseInt(portId.replace('ghost-input-', ''), 10);
                const currentInputs = node.ports.filter(p => p.direction === 'input' && p.type === 'technical');

                // Create all needed ports up to and including the ghost port index
                const newPorts = [...node.ports];
                const portsToAdd = (ghostIndex + 1) - currentInputs.length;

                const newPortIds: string[] = [];
                for (let i = 0; i < portsToAdd; i++) {
                    const nextIndex = currentInputs.length + i + 1;
                    const newPortId = generateUniqueId('input-');
                    newPortIds.push(newPortId);
                    newPorts.push({
                        id: newPortId,
                        name: `In ${nextIndex}`,
                        type: 'technical',
                        direction: 'input'
                    });
                }

                // Persist the new ports
                updateNodePorts(node.id, newPorts);

                // The clicked ghost port is now the last one we added
                actualFirstPortId = newPortIds[newPortIds.length - 1];
            }

            // Get target port (now that ghost ports are persisted if needed)
            const updatedNode = nodes.get(node.id) || node;
            const targetPort = isGhostPort
                ? updatedNode.ports.find(p => p.id === actualFirstPortId)
                : updatedNode.ports.find(p => p.id === portId);

            if (!targetPort) return;

            // Check if we need to auto-expand for multiple connections
            if (isInstrument && targetPort.direction === 'input' && sources.length > 1) {
                const currentInputs = updatedNode.ports.filter(p => p.direction === 'input' && p.type === 'technical');
                const clickedIndex = currentInputs.findIndex(p => p.id === actualFirstPortId);

                if (clickedIndex === -1) return;

                const neededCount = clickedIndex + sources.length;
                const availableCount = currentInputs.length;

                if (neededCount > availableCount) {
                    const newPorts = [...updatedNode.ports];
                    const portsToAdd = neededCount - availableCount;

                    for (let i = 0; i < portsToAdd; i++) {
                        const nextIndex = availableCount + i + 1;
                        newPorts.push({
                            id: generateUniqueId('input-'),
                            name: `In ${nextIndex}`,
                            type: 'technical',
                            direction: 'input'
                        });
                    }

                    updateNodePorts(node.id, newPorts);
                }
            }

            // Get final updated node and inputs after all port additions
            const finalNode = nodes.get(node.id) || updatedNode;
            const finalInputs = finalNode.ports.filter(p => p.direction === 'input' && p.type === 'technical');

            sources.forEach((source, index) => {
                let actualTargetPortId = actualFirstPortId;

                if (index > 0 && targetPort.direction === 'input' && isInstrument) {
                    const clickedIndex = finalInputs.findIndex(p => p.id === actualFirstPortId);
                    if (clickedIndex !== -1 && (clickedIndex + index) < finalInputs.length) {
                        actualTargetPortId = finalInputs[clickedIndex + index].id;
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
    }, [node, addConnection, startConnecting, stopConnecting, isConnecting, connectingFrom, updateNodePorts, nodes]);

    // Common props for schematic nodes
    const schematicProps = {
        node,
        handlePortClick,
        hasConnection,
        handleHeaderMouseDown,
        handleNodeMouseEnter,
        handleNodeMouseLeave,
        isSelected,
        isDragging,
        isHoveredWithConnections,
        incomingConnectionCount,
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
            onMouseEnter={handleNodeMouseEnter}
            onMouseLeave={handleNodeMouseLeave}
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
