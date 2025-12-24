/**
 * Sampler Visual Node - INSIDE view with row-based layout
 *
 * Layout:
 * ┌────────────────────────────────────┐
 * │  [In]    Config          [Out]     │
 * ├────────────────────────────────────┤
 * │ Row 1: Gain 1.0  Spread 1.0        │
 * │ ⚪ ⚪ ⚪ ⚪ ⚪ ⚪ ⚪ ⚪ ⚪ ⚪ ⚪ ⚪   │
 * │ 0  1  2  3  4  5  6  7  8  9 10 11 │
 * └────────────────────────────────────┘
 */

import { useCallback, memo } from 'react';
import type { GraphNode, SamplerNodeData, SamplerRow } from '../../engine/types';
import { useGraphStore } from '../../store/graphStore';
import { isSamplerNodeData } from '../../engine/typeGuards';
import './SamplerVisual.css';

interface SamplerVisualNodeProps {
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

/** Row parameter value ranges */
const ROW_PARAM_RANGES = {
    GAIN: { min: 0, max: 2, step: 0.1 },
    SPREAD: { min: 0, max: 12, step: 0.5 },
} as const;

export const SamplerVisualNode = memo(function SamplerVisualNode({
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
    style
}: SamplerVisualNodeProps) {
    // Get parent node for data access
    const parentNodeId = node.parentId;
    const parentNode = useGraphStore((s) => parentNodeId ? s.nodes.get(parentNodeId) : null);
    const updateSamplerRow = useGraphStore((s) => s.updateSamplerRow);
    const updateNodeData = useGraphStore((s) => s.updateNodeData);

    const defaultData: SamplerNodeData = {
        sampleId: null,
        sampleName: null,
        rootNote: 60,
        attack: 0.01,
        decay: 0.1,
        sustain: 0.8,
        release: 0.3,
        rows: [],
        velocityCurve: 'exponential',
        triggerMode: 'gate',
        loopEnabled: false,
        loopStart: 0,
        loopEnd: 0,
        maxVoices: 16,
        defaultGain: 1.0,
        defaultSpread: 1.0,
    };

    // Get data from parent node (where the actual sampler data is stored)
    const parentData: SamplerNodeData = parentNode && isSamplerNodeData(parentNode.data)
        ? { ...defaultData, ...(parentNode.data as Partial<SamplerNodeData>) }
        : defaultData;

    // Get rows from parent data
    const rows: SamplerRow[] = parentData.rows || [];

    // Get output ports for audio out (no input ports - bundles connect via rows)
    const outputPorts = node.ports.filter(p => p.direction === 'output');

    // Handle row update
    const handleRowUpdate = useCallback((rowId: string, field: keyof SamplerRow, value: number) => {
        if (!parentNodeId) return;
        updateSamplerRow(parentNodeId, rowId, { [field]: value });
    }, [parentNodeId, updateSamplerRow]);

    // Handle default row wheel (when no rows connected yet)
    const handleDefaultRowWheel = useCallback((field: 'gain' | 'spread', e: React.WheelEvent) => {
        e.stopPropagation();
        if (!parentNodeId) return;
        const currentValue = field === 'gain' ? (parentData.defaultGain ?? 1.0) : (parentData.defaultSpread ?? 1.0);
        const delta = e.deltaY > 0 ? -1 : 1;
        const ranges = field === 'gain' ? ROW_PARAM_RANGES.GAIN : ROW_PARAM_RANGES.SPREAD;
        const newValue = Math.max(ranges.min, Math.min(ranges.max, currentValue + delta * ranges.step));
        updateNodeData(parentNodeId, {
            [field === 'gain' ? 'defaultGain' : 'defaultSpread']: parseFloat(newValue.toFixed(1))
        });
    }, [parentNodeId, parentData.defaultGain, parentData.defaultSpread, updateNodeData]);

    return (
        <div
            className={`sampler-visual-node ${isSelected ? 'selected' : ''} ${isDragging ? 'dragging' : ''}`}
            style={style}
            onMouseEnter={handleNodeMouseEnter}
            onMouseLeave={handleNodeMouseLeave}
        >
            {/* Header */}
            <div className="sampler-visual-header" onMouseDown={handleHeaderMouseDown}>
                <span className="sampler-visual-title">Config</span>
            </div>

            {/* Rows container */}
            <div className="sampler-visual-rows">
                {rows.length === 0 ? (
                    /* Default row with editable controls */
                    <div className="sampler-row-compact default-row">
                        <div className="sampler-row-header-compact">
                            <span className="sampler-row-label">Row 1</span>
                            <span
                                className="sampler-editable-value"
                                onWheel={(e) => handleDefaultRowWheel('gain', e)}
                                title="Gain (0-2) - scroll to change"
                            >
                                G:{(parentData.defaultGain ?? 1.0).toFixed(1)}
                            </span>
                            <span
                                className="sampler-editable-value"
                                onWheel={(e) => handleDefaultRowWheel('spread', e)}
                                title="Spread (semitones) - scroll to change"
                            >
                                S:{(parentData.defaultSpread ?? 1.0).toFixed(1)}
                            </span>
                        </div>
                        <div className="sampler-row-hint">
                            Connect a keyboard bundle to enable
                        </div>
                    </div>
                ) : (
                    <>
                        {rows.map((row) => (
                            <RowWithPorts
                                key={row.rowId}
                                row={row}
                                nodeId={node.id}
                                onUpdate={(field, value) => handleRowUpdate(row.rowId, field, value)}
                                handlePortMouseDown={handlePortMouseDown}
                                handlePortMouseUp={handlePortMouseUp}
                                handlePortMouseEnter={handlePortMouseEnter}
                                handlePortMouseLeave={handlePortMouseLeave}
                                hasConnection={hasConnection}
                                disabled={!parentNodeId}
                            />
                        ))}
                    </>
                )}
            </div>

            {/* Output port on right */}
            <div className="output-port-area">
                {outputPorts.map((port) => (
                    <div
                        key={port.id}
                        className={`sampler-visual-port output audio ${hasConnection?.(port.id) ? 'connected' : ''}`}
                        data-node-id={node.id}
                        data-port-id={port.id}
                        onMouseDown={(e) => handlePortMouseDown?.(port.id, e)}
                        onMouseUp={(e) => handlePortMouseUp?.(port.id, e)}
                        onMouseEnter={() => handlePortMouseEnter?.(port.id)}
                        onMouseLeave={handlePortMouseLeave}
                    />
                ))}
            </div>
        </div>
    );
});

// Row with individual key ports
function RowWithPorts({
    row,
    nodeId,
    onUpdate,
    handlePortMouseDown,
    handlePortMouseUp,
    handlePortMouseEnter,
    handlePortMouseLeave,
    hasConnection,
    disabled
}: {
    row: SamplerRow;
    nodeId: string;
    onUpdate: (field: keyof SamplerRow, value: number) => void;
    handlePortMouseDown?: (portId: string, e: React.MouseEvent) => void;
    handlePortMouseUp?: (portId: string, e: React.MouseEvent) => void;
    handlePortMouseEnter?: (portId: string) => void;
    handlePortMouseLeave?: () => void;
    hasConnection?: (portId: string) => boolean;
    disabled: boolean;
}) {
    // Generate key ports
    const keyCount = row.portCount;
    const keys = Array.from({ length: keyCount }, (_, i) => i);

    // Calculate pitch offset for each key (in semitones)
    const getKeyOffset = (index: number) => {
        return row.baseOffset + index * row.spread;
    };

    // Format offset for display
    const formatOffset = (offset: number) => {
        const rounded = Math.round(offset * 10) / 10;
        return rounded % 1 === 0 ? String(rounded) : rounded.toFixed(1);
    };

    // Handle wheel on controls
    const handleGainWheel = useCallback((e: React.WheelEvent) => {
        e.stopPropagation();
        if (disabled) return;
        const delta = e.deltaY > 0 ? -1 : 1;
        const newValue = Math.max(
            ROW_PARAM_RANGES.GAIN.min,
            Math.min(ROW_PARAM_RANGES.GAIN.max, row.gain + delta * ROW_PARAM_RANGES.GAIN.step)
        );
        onUpdate('gain', parseFloat(newValue.toFixed(1)));
    }, [disabled, row.gain, onUpdate]);

    const handleSpreadWheel = useCallback((e: React.WheelEvent) => {
        e.stopPropagation();
        if (disabled) return;
        const delta = e.deltaY > 0 ? -1 : 1;
        const newValue = Math.max(
            ROW_PARAM_RANGES.SPREAD.min,
            Math.min(ROW_PARAM_RANGES.SPREAD.max, row.spread + delta * ROW_PARAM_RANGES.SPREAD.step)
        );
        onUpdate('spread', parseFloat(newValue.toFixed(1)));
    }, [disabled, row.spread, onUpdate]);

    return (
        <div className="sampler-row-compact">
            {/* Row header with editable values */}
            <div className="sampler-row-header-compact">
                <span className="sampler-row-label">{row.label || `Row`}</span>
                <span
                    className={`sampler-editable-value ${disabled ? 'disabled' : ''}`}
                    onWheel={handleGainWheel}
                    title="Gain (0-2) - scroll to change"
                >
                    G:{row.gain.toFixed(1)}
                </span>
                <span
                    className={`sampler-editable-value ${disabled ? 'disabled' : ''}`}
                    onWheel={handleSpreadWheel}
                    title="Spread (semitones between keys) - scroll to change"
                >
                    S:{row.spread.toFixed(1)}
                </span>
            </div>

            {/* Key ports with offset labels */}
            <div className="sampler-row-keys-compact">
                {keys.map((index) => {
                    const portId = `${row.rowId}-key-${index}`;
                    const offset = getKeyOffset(index);
                    const isConnected = hasConnection?.(portId) ?? false;

                    return (
                        <div key={index} className="sampler-key-slot">
                            <div
                                className={`sampler-key-port ${isConnected ? 'connected' : ''}`}
                                data-node-id={nodeId}
                                data-port-id={portId}
                                onMouseDown={(e) => handlePortMouseDown?.(portId, e)}
                                onMouseUp={(e) => handlePortMouseUp?.(portId, e)}
                                onMouseEnter={() => handlePortMouseEnter?.(portId)}
                                onMouseLeave={handlePortMouseLeave}
                                title={`Key ${index + 1}: ${formatOffset(offset)} semitones`}
                            />
                            <span className="sampler-key-offset">{formatOffset(offset)}</span>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

export default SamplerVisualNode;
