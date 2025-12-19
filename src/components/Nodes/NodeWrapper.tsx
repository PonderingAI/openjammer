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
import { CanvasIONode } from './CanvasIONode';
import './BaseNode.css';

interface NodeWrapperProps {
    node: GraphNode;
}

// Schematic nodes render their own container - no wrapper needed
const SCHEMATIC_TYPES = [
    'keyboard',
    'piano', 'cello', 'electricCello', 'violin', 'saxophone', 'strings', 'keys', 'winds',
    'speaker',
    'looper',
    'microphone',
    'canvas-input',
    'canvas-output'
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

    // Handle port mouse down - start connection dragging
    const handlePortMouseDown = useCallback((portId: string, e: React.MouseEvent) => {
        if (e.button !== 0) return; // Only left click
        e.stopPropagation();

        // If not already connecting, start a new connection
        const currentIsConnecting = useCanvasStore.getState().isConnecting;
        if (!currentIsConnecting) {
            startConnecting(node.id, portId);
        }
    }, [node.id, startConnecting]);

    // Handle port mouse up - complete connection if dragging to a different port
    const handlePortMouseUp = useCallback((portId: string, e: React.MouseEvent) => {
        e.stopPropagation();

        // Read current connecting state directly from store to avoid stale closure
        const currentIsConnecting = useCanvasStore.getState().isConnecting;
        const currentConnectingFrom = useCanvasStore.getState().connectingFrom;

        if (currentIsConnecting && currentConnectingFrom) {
            const sources = Array.isArray(currentConnectingFrom) ? currentConnectingFrom : [currentConnectingFrom];

            // If releasing on the same port we started from, do nothing (allow click-to-connect)
            if (sources.length === 1 && sources[0].nodeId === node.id && sources[0].portId === portId) {
                // Don't stop connecting - user clicked a port to start, they'll click another to finish
                return;
            }

            const updateNodePorts = useGraphStore.getState().updateNodePorts;
            const isInstrument = ['piano', 'cello', 'electricCello', 'violin', 'saxophone', 'strings', 'keys', 'winds'].includes(node.type);

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
            const updatedNode = useGraphStore.getState().nodes.get(node.id) || node;
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
            const finalNode = useGraphStore.getState().nodes.get(node.id) || updatedNode;
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
        }
    }, [node, addConnection, stopConnecting]);

    // Handle port hover for connection targeting
    const handlePortMouseEnter = useCallback((portId: string) => {
        if (useCanvasStore.getState().isConnecting) {
            setHoverTarget(node.id, portId);
        }
    }, [node.id, setHoverTarget]);

    const handlePortMouseLeave = useCallback(() => {
        if (useCanvasStore.getState().isConnecting) {
            // Only clear the port, keep hovering over node
            setHoverTarget(node.id);
        }
    }, [node.id, setHoverTarget]);

    // Common props for schematic nodes
    const schematicProps = {
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
            case 'electricCello':
            case 'violin':
            case 'saxophone':
            case 'strings':
            case 'keys':
            case 'winds':
                return <InstrumentNode {...schematicProps} />;
            case 'speaker':
                return <SpeakerNode {...schematicProps} />;
            case 'looper':
                return <LooperNode {...schematicProps} />;
            case 'microphone':
                return <MicrophoneNode {...schematicProps} />;
            case 'canvas-input':
            case 'canvas-output':
                return <CanvasIONode node={node} />;
        }
    }

    // Standard nodes with wrapper
    const inputPorts = node.ports.filter(p => p.direction === 'input');
    const outputPorts = node.ports.filter(p => p.direction === 'output');

    const renderNodeContent = () => {
        switch (node.type) {
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
                            onMouseDown={(e) => handlePortMouseDown(port.id, e)}
                            onMouseUp={(e) => handlePortMouseUp(port.id, e)}
                            onMouseEnter={() => handlePortMouseEnter(port.id)}
                            onMouseLeave={handlePortMouseLeave}
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
                            onMouseDown={(e) => handlePortMouseDown(port.id, e)}
                            onMouseUp={(e) => handlePortMouseUp(port.id, e)}
                            onMouseEnter={() => handlePortMouseEnter(port.id)}
                            onMouseLeave={handlePortMouseLeave}
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
