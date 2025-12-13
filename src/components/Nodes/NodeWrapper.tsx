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
    const nodes = useGraphStore((s) => s.nodes);

    const zoom = useCanvasStore((s) => s.zoom);
    const isConnecting = useCanvasStore((s) => s.isConnecting);
    const connectingFrom = useCanvasStore((s) => s.connectingFrom);
    const startConnecting = useCanvasStore((s) => s.startConnecting);
    const stopConnecting = useCanvasStore((s) => s.stopConnecting);

    const isSelected = selectedNodeIds.has(node.id);

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
            // connectingFrom is now an array
            const sources = Array.isArray(connectingFrom) ? connectingFrom : [connectingFrom];

            // For each source, try to connect to this node
            const targetPort = node.ports.find(p => p.id === portId);
            if (!targetPort) return;

            // If multiple sources, we need multiple target ports if target is input
            // But for now, let's just connect the first one to the clicked port, 
            // and if there are more sources and target is instrument, it should have auto-expanded?
            // Actually, the user requirement says "when that one is occupied... the second input appears".
            // So we should try to connect the first source to the clicked port.
            // And subsequent sources to subsequent ports if available, or just the first one?
            // "if im holdong more then one like what happens when i press a for all that many new inptuts appear."

            // Strategy:
            // 1. Connect first source to clicked port.
            // 2. If there are more sources, find next available ports or let the node handle it?
            // Since we can't easily auto-create ports here without node logic, let's just connect what we can.

            sources.forEach((source, index) => {
                const sourceNode = nodes.get(source.nodeId);
                const sourcePort = sourceNode?.ports.find(p => p.id === source.portId);

                if (!sourcePort) return;

                // If index > 0, we need to find or create a new port on the target node if it's an input
                let actualTargetPortId = portId;

                if (index > 0 && targetPort.direction === 'input') {
                    // Look for a subsequent port or assume one will be created?
                    // The dynamic port logic is in the node component, which reacts to connections.
                    // But we are adding connection NOW.
                    // We need to predict the port ID. 
                    // If the node type is instrument, ports are input-1, input-2...

                    if (['piano', 'cello', 'saxophone'].includes(node.type)) {
                        // Hack: Assume subsequent ports will be named consecutively
                        // This relies on the InstrumentNode logic creating them consistently
                        // But we can't connect to a port that doesn't exist in the store yet...
                        // Wait, addConnection doesn't validate port existence strictly if we don't enforce it?
                        // Actually, types.ts defines Connection with portIds.
                        // If we add a connection to a non-existent port, it might break rendering until the port appears.
                        // But InstrumentNode adds ports based on CONNECTIONS. So if we add the connection, the port will appear!

                        // Let's parse current port number
                        const match = portId.match(/input-(\d+)/);
                        if (match) {
                            const currentNum = parseInt(match[1]);
                            actualTargetPortId = `input-${currentNum + index}`;
                        }
                    }
                }

                if (sourcePort.direction === 'output' && targetPort.direction === 'input') {
                    addConnection(source.nodeId, source.portId, node.id, actualTargetPortId);
                } else if (sourcePort.direction === 'input' && targetPort.direction === 'output') {
                    // This direction (dragging from input to output) is less likely for "A" key logic but valid
                    addConnection(node.id, actualTargetPortId, source.nodeId, source.portId);
                }
            });

            stopConnecting();
        } else {
            // Start connecting (single)
            startConnecting(node.id, portId);
        }
    }, [isConnecting, connectingFrom, node, addConnection, startConnecting, stopConnecting, nodes]);


    // Render the appropriate node content based on type
    const renderNodeContent = () => {
        switch (node.type) {
            case 'keyboard':
                return <KeyboardNode node={node} />;
            case 'piano':
            case 'cello':
            case 'saxophone':
                return <InstrumentNode node={node} />;
            case 'microphone':
                return <MicrophoneNode node={node} />;
            case 'looper':
                return <LooperNode node={node} />;
            case 'effect':
                return <EffectNode node={node} />;
            case 'amplifier':
                return <AmplifierNode node={node} />;
            case 'speaker':
                return <SpeakerNode node={node} />;
            case 'recorder':
                return <RecorderNode node={node} />;
            default:
                return <div>Unknown node type</div>;
        }
    };

    const inputPorts = node.ports.filter(p => p.direction === 'input');
    const outputPorts = node.ports.filter(p => p.direction === 'output');

    return (
        <div
            ref={nodeRef}
            className={`node ${isSelected ? 'selected' : ''} ${isDragging ? 'dragging' : ''}`}
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
