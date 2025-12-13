/**
 * Amplifier Node - Gain control
 */

import { useCallback } from 'react';
import type { GraphNode, AmplifierNodeData } from '../../engine/types';
import { useGraphStore } from '../../store/graphStore';

interface AmplifierNodeProps {
    node: GraphNode;
}

export function AmplifierNode({ node }: AmplifierNodeProps) {
    const data = node.data as AmplifierNodeData;
    const updateNodeData = useGraphStore((s) => s.updateNodeData);

    const gain = data.gain ?? 1;

    // Convert gain to dB for display
    const gainDb = gain > 0 ? 20 * Math.log10(Math.abs(gain)) : -Infinity;
    const displayDb = isFinite(gainDb) ? gainDb.toFixed(1) : '-∞';

    // Update gain
    const handleGainChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const newGain = parseFloat(e.target.value);
        updateNodeData<AmplifierNodeData>(node.id, { gain: newGain });
    }, [node.id, updateNodeData]);

    // Preset buttons
    const handlePreset = useCallback((value: number) => {
        updateNodeData<AmplifierNodeData>(node.id, { gain: value });
    }, [node.id, updateNodeData]);

    return (
        <div className="amplifier-node">
            {/* Gain Display */}
            <div style={{
                textAlign: 'center',
                marginBottom: '8px',
                padding: '8px',
                background: 'var(--bg-tertiary)',
                borderRadius: 'var(--radius-sm)'
            }}>
                <div style={{
                    fontSize: '24px',
                    fontFamily: 'var(--font-mono)',
                    fontWeight: 600
                }}>
                    {gain.toFixed(2)}x
                </div>
                <div style={{
                    fontSize: '11px',
                    color: 'var(--text-muted)'
                }}>
                    {displayDb} dB
                </div>
            </div>

            {/* Gain Slider */}
            <div className="node-row" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
                <input
                    type="range"
                    min="-2"
                    max="4"
                    step="0.1"
                    value={gain}
                    onChange={handleGainChange}
                    style={{ width: '100%' }}
                />
                <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    fontSize: '10px',
                    color: 'var(--text-muted)',
                    marginTop: '4px'
                }}>
                    <span>-2x (half)</span>
                    <span>4x</span>
                </div>
            </div>

            {/* Preset Buttons */}
            <div className="node-controls" style={{ flexWrap: 'wrap' }}>
                <button
                    className={`node-btn ${gain === 0.5 ? 'active' : 'node-btn-secondary'}`}
                    onClick={() => handlePreset(0.5)}
                    style={{ flex: '1 0 45%' }}
                >
                    0.5x
                </button>
                <button
                    className={`node-btn ${gain === 1 ? 'active' : 'node-btn-secondary'}`}
                    onClick={() => handlePreset(1)}
                    style={{ flex: '1 0 45%' }}
                >
                    1x
                </button>
                <button
                    className={`node-btn ${gain === 2 ? 'active' : 'node-btn-secondary'}`}
                    onClick={() => handlePreset(2)}
                    style={{ flex: '1 0 45%' }}
                >
                    2x
                </button>
                <button
                    className={`node-btn ${gain === 0 ? 'active' : 'node-btn-secondary'}`}
                    onClick={() => handlePreset(0)}
                    style={{ flex: '1 0 45%' }}
                >
                    Mute
                </button>
            </div>
        </div>
    );
}
