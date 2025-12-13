/**
 * Instrument Node - Virtual instrument with dynamic inputs from Keyboard Node
 */

import { useState, useEffect, useRef } from 'react';
import type { GraphNode, InstrumentNodeData } from '../../engine/types';
import { useGraphStore } from '../../store/graphStore';
import { useAudioStore } from '../../store/audioStore';
import { createInstrument, type Instrument, type InstrumentType } from '../../audio/Instruments';

interface InstrumentNodeProps {
    node: GraphNode;
}

export function InstrumentNode({ node }: InstrumentNodeProps) {
    const data = node.data as unknown as InstrumentNodeData;
    const updateNodeData = useGraphStore((s) => s.updateNodeData);
    const updateNodePorts = useGraphStore((s) => s.updateNodePorts);
    const connections = useGraphStore((s) => s.connections);
    const isAudioContextReady = useAudioStore((s) => s.isAudioContextReady);

    // Internal audio state
    const instrumentRef = useRef<Instrument | null>(null);
    const [showPopup, setShowPopup] = useState(false);

    // Initialize instrument audio
    useEffect(() => {
        if (!isAudioContextReady) return;
        const type = node.type as InstrumentType;
        const inst = createInstrument(type);
        instrumentRef.current = inst;
        return () => inst.disconnect();
    }, [isAudioContextReady, node.type]);

    // Dynamic Ports Logic
    useEffect(() => {
        const inputPorts = node.ports.filter(p => p.direction === 'input' && p.type === 'technical');
        const connectedPorts1 = inputPorts.filter(p =>
            Array.from(connections.values()).some(c => c.targetNodeId === node.id && c.targetPortId === p.id)
        );

        // If all inputs are connected, add a new one
        if (connectedPorts1.length === inputPorts.length) {
            const nextIndex = inputPorts.length + 1;
            const newPort = {
                id: `input-${Date.now()}`, // Unique ID for new port
                name: `In ${nextIndex}`,
                type: 'technical' as const,
                direction: 'input' as const
            };

            // Should probably use a more stable ID scheme if possible, but timestamp works for now
            // Better: Find max index

            updateNodePorts(node.id, [...node.ports, newPort]);
        }
    }, [connections, node.id, node.ports, updateNodePorts]);

    // Render schematic table row
    const renderRow = (port: any) => {
        const offset = data.offsets?.[port.id] || 0;
        return (
            <div key={port.id} className="connection-row">
                <span className="port-name-schematic" title={port.name}>○</span> {/* Minimal circle indicator */}
                <span className="connection-note">C</span> {/* Placeholder note */}
                <span className="connection-offset">{offset}</span>
            </div>
        );
    };

    return (
        <div className="instrument-node schematic-node">
            {/* Header */}
            <div
                className="schematic-header"
                onClick={(e) => { e.stopPropagation(); setShowPopup(true); }}
                style={{ cursor: 'pointer' }}
            >
                <span className="schematic-title">{node.name}</span>
                <span className="schematic-header-icon">▼</span>
            </div>

            {/* Main Table View */}
            <div className="schematic-body">
                {node.ports.filter(p => p.type === 'technical' && p.direction === 'input').map(renderRow)}
            </div>

            {/* Config Popup */}
            {showPopup && (
                <div className="instrument-popup-overlay" onClick={(e) => { e.stopPropagation(); setShowPopup(false); }}>
                    <div className="instrument-popup-content" onClick={e => e.stopPropagation()}>
                        <div className="popup-header">
                            <h3>{node.name} Settings</h3>
                            <button onClick={() => setShowPopup(false)}>Close</button>
                        </div>
                        <div className="popup-body">
                            <label>Instrument Type</label>
                            <select
                                value={node.type}
                                onChange={(e) => {
                                    // Logic to change instrument type? 
                                    // Would need to update Node Type in GraphStore... 
                                    // GraphStore doesn't support changing type easily without re-creating?
                                    // Hack: updateNodeData can't change type. 
                                    // Maybe just handle offsets here.
                                    alert("Changing instrument type requires re-creating node for now.");
                                }}
                            >
                                <option value="piano">Piano</option>
                                <option value="cello">Cello</option>
                                <option value="violin">Violin</option>
                                <option value="saxophone">Saxophone</option>
                            </select>

                            <h4>Input Offsets</h4>
                            {node.ports.filter(p => p.type === 'technical' && p.direction === 'input').map(port => (
                                <div key={port.id} className="popup-setting-row">
                                    <span>{port.name}</span>
                                    <input
                                        type="number"
                                        step="0.5"
                                        value={data.offsets?.[port.id] || 0}
                                        onChange={(e) => {
                                            const newOffsets = { ...(data.offsets || {}), [port.id]: parseFloat(e.target.value) };
                                            updateNodeData(node.id, { offsets: newOffsets });
                                        }}
                                    />
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
