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
            const sources = Array.isArray(connectingFrom) ? connectingFrom : [connectingFrom];
            const targetPort = node.ports.find(p => p.id === portId);
            if (!targetPort) return;

            // Check if we need to auto-expand an instrument node
            const isInstrument = ['piano', 'cello', 'violin', 'saxophone'].includes(node.type);
            const updateNodePorts = useGraphStore.getState().updateNodePorts; // Access direct from store to avoid stale closure if needed? Actually hook is fine.

            if (isInstrument && targetPort.direction === 'input' && sources.length > 1) {
                // Determine starting index. 
                // We want to connect Source[0] -> ClickedPort
                // Source[1] -> ClickedPort + 1 (create if needed)
                // ...

                // Get all current input ports
                const currentInputs = node.ports.filter(p => p.direction === 'input' && p.type === 'technical');
                const clickedIndex = currentInputs.findIndex(p => p.id === portId);

                if (clickedIndex === -1) return;

                // We need enough ports for (clickedIndex + sources.length)
                const neededCount = clickedIndex + sources.length;
                const availableCount = currentInputs.length;

                if (neededCount > availableCount) {
                    const newPorts = [...node.ports];
                    const portsToAdd = neededCount - availableCount;

                    for (let i = 0; i < portsToAdd; i++) {
                        const nextIndex = availableCount + i + 1;
                        newPorts.push({
                            id: `input-${Date.now()}-${i}`, // Unique ID
                            name: `In ${nextIndex}`,
                            type: 'technical',
                            direction: 'input'
                        });
                    }

                    // Update ports IMMEDIATELY so addConnection sees them?
                    // addConnection uses store state. We must update store first.
                    updateNodePorts(node.id, newPorts);

                    // Re-fetch node from store or use local logic? 
                    // We can proceed assuming we know the IDs we just created.
                    // But `addConnection` checks validations against STORE state.
                    // So `updateNodePorts` must be processed. 
                    // Zustand upgrades are synchronous usually.
                }

                // Now iterate and connect
                // We need to fetch the LATEST node ports to get IDs if we just added them?
                // Or we can predict them if we used deterministic IDs.
                // But we used random IDs.
                // BETTER STRATEGY: Generate IDs locally, update store, use local IDs.
            }

            // Refined Loop
            // Re-access current ports from store to be safe if we just updated?
            const updatedNode = useGraphStore.getState().nodes.get(node.id) || node;
            const updatedInputs = updatedNode.ports.filter(p => p.direction === 'input' && p.type === 'technical');
            // If it's not instrument, `updatedNode` is just `node`.

            sources.forEach((source, index) => {
                let actualTargetPortId = portId;

                if (index > 0 && targetPort.direction === 'input' && isInstrument) {
                    // Find the port at clickedIndex + index
                    const clickedIndex = updatedInputs.findIndex(p => p.id === portId);
                    if (clickedIndex !== -1 && (clickedIndex + index) < updatedInputs.length) {
                        actualTargetPortId = updatedInputs[clickedIndex + index].id;
                    } else {
                        // Fallback: don't connect or connect to same?
                        // If we logic above worked, it SHOULD exist.
                        // But if clickedIndex + index >= updatedInputs.length (maybe creation failed or race?), skip
                        return;
                    }
                }

                if (targetPort.direction === 'input') {
                    addConnection(source.nodeId, source.portId, node.id, actualTargetPortId);
                } else {
                    // Output -> Input (reverse drag) - not primary case for 'A' key but robust
                    addConnection(node.id, actualTargetPortId, source.nodeId, source.portId);
                }
            });

            stopConnecting();
        } else {
            startConnecting(node.id, portId);
        }
    }, [isConnecting, connectingFrom, node, addConnection, startConnecting, stopConnecting]);


    // Render the appropriate node content based on type
    const renderNodeContent = () => {
        const props = { node, handlePortClick, hasConnection };

        switch (node.type) {
            case 'keyboard':
                return <KeyboardNode {...props} />;
            case 'piano':
            case 'cello':
            case 'violin':
            case 'saxophone':
            case 'strings':
            case 'keys':
            case 'winds':
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

    // Custom nodes that handle their own ports
    const hasCustomPorts = node.type === 'keyboard';

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
            {/* Header - generic header is hidden for schematic nodes usually, or we integrate it?
                The generic header (Title/Category) is styling from BaseNode.css.
                Schematic nodes (Keyboard, Speaker) have their own header inside the component.
                We should probably hide the default header for these types OR update BaseNode.css to hide it for them.
                Let's hide it if it's a schematic node type.
            */}
            {!['keyboard', 'speaker', 'piano', 'cello', 'violin', 'saxophone', 'strings', 'keys', 'winds'].includes(node.type) && (
                <div className="node-header" onMouseDown={handleHeaderMouseDown}>
                    <span className="node-title">{node.type.charAt(0).toUpperCase() + node.type.slice(1)}</span>
                    <span className="node-type">{node.category}</span>
                </div>
            )}

            {/* For schematic nodes, we wrap the content in a handler for dragging if the content header handles it?
                Actually, the schematic components have their own headers. 
                They need to trigger `handleHeaderMouseDown`.
                We can pass `handleHeaderMouseDown` to them or wrap them?
                Passing it is cleaner.
            */}

            {/* Ports - Only render if not custom */}
            {!hasCustomPorts && (
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
            )}

            {/* Content */}
            <div className="node-content">
                {/* We need to pass handleHeaderMouseDown to children if they want to use it as a drag handle */}
                {(() => {
                    const props = { node, handlePortClick, hasConnection, handleHeaderMouseDown };
                    switch (node.type) {
                        case 'keyboard':
                            return <KeyboardNode {...props} />;
                        case 'piano':
                        case 'cello':
                        case 'violin':
                        case 'saxophone':
                        case 'strings':
                        case 'keys':
                        case 'winds':
                            return <InstrumentNode node={node} />; // Instrument defaults might be fine without custom ports for now? User didn't complain about Instrument ports.
                        // ... other cases fallback to standard renderNodeContent logic or we duplicate slightly?
                        // Let's rely on the switch above but passed updated props.
                        default:
                            return renderNodeContent();
                    }
                })()}
            </div>
        </div>
    );
}
