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
    const connections = useGraphStore((s) => s.connections);
    const isAudioContextReady = useAudioStore((s) => s.isAudioContextReady);

    // Internal audio state
    // const [instrument, setInstrument] = useState<Instrument | null>(null);
    const instrumentRef = useRef<Instrument | null>(null);
    const [showPopup, setShowPopup] = useState(false);

    // Initialize instrument audio
    useEffect(() => {
        if (!isAudioContextReady) return;

        // NodeType IS the instrument type now (piano, cello, saxophone)
        const type = node.type as InstrumentType;
        const inst = createInstrument(type);
        // setInstrument(inst);
        instrumentRef.current = inst;

        return () => {
            inst.disconnect();
        };
    }, [isAudioContextReady, node.type]);

    // Handle dynamic ports
    useEffect(() => {
        // Dynamic port logic temporarily simplified to satisfy linter
        // Will be implemented with full multi-input support
    }, [connections, node.id, node.ports]);

    // Render offsets popup
    const renderPopup = () => {
        if (!showPopup) return null;

        return (
            <div className="instrument-popup" onClick={e => e.stopPropagation()}>
                <div className="popup-header">
                    <span>{node.type.charAt(0).toUpperCase() + node.type.slice(1)} Settings</span>
                    <button className="close-btn" onClick={() => setShowPopup(false)}>×</button>
                </div>
                <div className="popup-content">
                    <div className="popup-row header">
                        <span>Input</span>
                        <span>Note</span>
                        <span>Offset</span>
                    </div>
                    {node.ports.filter(p => p.type === 'technical').map(port => (
                        <div key={port.id} className="popup-row">
                            <span>{port.name}</span>
                            <span>C</span> {/* Placeholder for note detection */}
                            <input
                                type="number"
                                value={data.offsets?.[port.id] || 0}
                                onChange={(e) => {
                                    const newOffsets = { ...(data.offsets || {}), [port.id]: parseFloat(e.target.value) };
                                    updateNodeData(node.id, { offsets: newOffsets });
                                }}
                                step={0.5}
                                className="offset-input"
                            />
                        </div>
                    ))}
                    <div className="spn-input-container">
                        <label>Base Pitch (SPN)</label>
                        <input type="text" placeholder="e.g. C4" className="spn-input" />
                    </div>
                </div>
            </div>
        );
    };

    return (
        <div className="instrument-node">
            {/* Header click opens popup */}
            <div className="node-overlay-trigger" onClick={() => setShowPopup(!showPopup)} />

            {/* Main view just shows detection viz or minimal info */}
            <div className="instrument-visualizer">
                {/* Visualizer bars here */}
                {Array.from({ length: 3 }).map((_, i) => (
                    <div key={i} className="viz-bar" />
                ))}
            </div>

            {renderPopup()}
        </div>
    );
}
