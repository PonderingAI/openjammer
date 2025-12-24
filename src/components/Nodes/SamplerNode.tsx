/**
 * Sampler Node - Row-based design like Instrument Node
 *
 * Layout:
 * ┌─────────────────────────────┐
 * │        Sampler              │
 * ├─────────────────────────────┤
 * │  ┌─────────────────────┐    │
 * │  │   [Waveform/Drop]   │    │
 * │  └─────────────────────┘    │
 * ├─────────────────────────────┤
 * │ ⚪─ Row 1  G:1.0 S:1.0      │
 * │ ⚪─ Row 2  G:1.0 S:0.5   ─⚪ │ (audio out)
 * │ ⚪  (empty input)           │
 * └─────────────────────────────┘
 */

import { useCallback, useRef, useState, useEffect, memo, useMemo } from 'react';
import type { GraphNode, SamplerNodeData, SamplerRow, AudioClip, ClipDropTarget } from '../../engine/types';
import { useGraphStore } from '../../store/graphStore';
import { getItemFile } from '../../store/libraryStore';
import { getAudioContext } from '../../audio/AudioEngine';
import { audioGraphManager } from '../../audio/AudioGraphManager';
import { useAudioClipStore, getClipBuffer } from '../../store/audioClipStore';
import { loadClipAudio } from '../../utils/clipUtils';
import { isSamplerNodeData } from '../../engine/typeGuards';

interface SamplerNodeProps {
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
    isHoveredWithConnections?: boolean;
    style?: React.CSSProperties;
}

/** Row parameter value ranges */
const ROW_PARAM_RANGES = {
    GAIN: { min: 0, max: 2, step: 0.1 },
    SPREAD: { min: 0, max: 12, step: 0.5 },
    OFFSET: { min: -24, max: 24, step: 1 },
} as const;

export const SamplerNode = memo(function SamplerNode({
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
    style
}: SamplerNodeProps) {
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
        // Store default row values for when keyboard connects
        defaultGain: 1.0,
        defaultSpread: 1.0,
    };

    const data: SamplerNodeData = isSamplerNodeData(node.data)
        ? { ...defaultData, ...(node.data as Partial<SamplerNodeData>) }
        : defaultData;

    const updateNodeData = useGraphStore((s) => s.updateNodeData);
    const updateSamplerRow = useGraphStore((s) => s.updateSamplerRow);
    const nodeRef = useRef<HTMLDivElement>(null);
    const sampleAreaRef = useRef<HTMLDivElement>(null);

    // Audio clip store for accepting clip drops
    const registerDropTarget = useAudioClipStore((s) => s.registerDropTarget);
    const unregisterDropTarget = useAudioClipStore((s) => s.unregisterDropTarget);
    const clipDragState = useAudioClipStore((s) => s.dragState);

    const [isDragOver, setIsDragOver] = useState(false);
    const [waveformData, setWaveformData] = useState<number[]>([]);

    // Get rows from data
    const rows: SamplerRow[] = data.rows || [];

    // Get ports
    const audioOutPort = node.ports.find(p => p.id === 'audio-out');

    // Find empty port for new connections (bundle-in or any unconnected input port)
    const emptyStatePort = useMemo(() => {
        // If no rows, return the default bundle-in port
        if (rows.length === 0) {
            return node.ports.find(p => p.id === 'bundle-in' && p.direction === 'input');
        }
        return null;
    }, [rows.length, node.ports]);

    // Find available port for adding new rows
    const availableNewRowPort = useMemo(() => {
        if (rows.length === 0) return null;
        // Find any control input port not already used by a row
        const usedPortIds = new Set(rows.map(r => r.targetPortId));
        return node.ports.find(p =>
            p.direction === 'input' &&
            p.type === 'control' &&
            !usedPortIds.has(p.id) &&
            !p.id.includes(':') // Skip composite port IDs
        );
    }, [rows, node.ports]);

    // Generate waveform data from audio buffer
    useEffect(() => {
        if (!data.sampleId) {
            setWaveformData([]);
            return;
        }

        const sampler = audioGraphManager.getSamplerAdapter(node.id);
        if (sampler) {
            const buffer = sampler.getBuffer();
            if (buffer) {
                const channelData = buffer.getChannelData(0);
                const samples = 50;
                const samplesPerPoint = Math.floor(channelData.length / samples);
                const points: number[] = [];

                for (let i = 0; i < samples; i++) {
                    let max = 0;
                    const start = i * samplesPerPoint;
                    for (let j = 0; j < samplesPerPoint; j++) {
                        const val = Math.abs(channelData[start + j] || 0);
                        if (val > max) max = val;
                    }
                    points.push(max);
                }
                setWaveformData(points);
            }
        }
    }, [node.id, data.sampleId]);

    // Handle audio clip drop (from looper or canvas)
    const handleClipDrop = useCallback(async (clip: AudioClip) => {
        const ctx = getAudioContext();
        if (!ctx) {
            console.warn('[SamplerNode] AudioContext not available');
            return;
        }

        try {
            let buffer = getClipBuffer(clip.sampleId);
            if (!buffer) {
                buffer = await loadClipAudio(clip, ctx);
            }

            const sampler = audioGraphManager.getSamplerAdapter(node.id);
            if (sampler) {
                sampler.setBuffer(buffer);
            }

            updateNodeData(node.id, {
                sampleId: clip.sampleId,
                sampleName: clip.sampleName
            });

            // Update waveform display
            const channelData = buffer.getChannelData(0);
            const samples = 50;
            const samplesPerPoint = Math.floor(channelData.length / samples);
            const points: number[] = [];

            for (let i = 0; i < samples; i++) {
                let max = 0;
                const start = i * samplesPerPoint;
                for (let j = 0; j < samplesPerPoint; j++) {
                    const val = Math.abs(channelData[start + j] || 0);
                    if (val > max) max = val;
                }
                points.push(max);
            }
            setWaveformData(points);
        } catch (error) {
            console.error('[SamplerNode] Failed to load clip audio:', error);
        }
    }, [node.id, updateNodeData]);

    // Register as drop target for audio clips
    useEffect(() => {
        const dropTarget: ClipDropTarget = {
            nodeId: node.id,
            targetName: 'Sampler',
            onClipDrop: handleClipDrop,
            canAcceptClip: () => true,
            getDropZoneBounds: () => sampleAreaRef.current?.getBoundingClientRect() ?? null,
        };

        registerDropTarget(dropTarget);
        return () => unregisterDropTarget(node.id);
    }, [node.id, handleClipDrop, registerDropTarget, unregisterDropTarget]);

    const isClipDropTarget = clipDragState.hoveredTargetId === node.id;

    // Handle drag events for audio file drop zone
    const handleDragOver = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragOver(true);
    }, []);

    const handleDragLeave = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragOver(false);
    }, []);

    const handleDrop = useCallback(async (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragOver(false);

        const ctx = getAudioContext();

        // Handle file system files
        const files = e.dataTransfer.files;
        if (files.length > 0) {
            const file = files[0];
            if (file.type.startsWith('audio/') || file.name.match(/\.(wav|mp3|ogg|flac|aiff|m4a)$/i)) {
                try {
                    const arrayBuffer = await file.arrayBuffer();
                    if (ctx) {
                        const buffer = await ctx.decodeAudioData(arrayBuffer);
                        const sampler = audioGraphManager.getSamplerAdapter(node.id);
                        if (sampler) {
                            sampler.setBuffer(buffer);
                        }

                        // Update waveform
                        const channelData = buffer.getChannelData(0);
                        const samples = 50;
                        const samplesPerPoint = Math.floor(channelData.length / samples);
                        const points: number[] = [];
                        for (let i = 0; i < samples; i++) {
                            let max = 0;
                            const start = i * samplesPerPoint;
                            for (let j = 0; j < samplesPerPoint; j++) {
                                const val = Math.abs(channelData[start + j] || 0);
                                if (val > max) max = val;
                            }
                            points.push(max);
                        }
                        setWaveformData(points);
                    }
                    updateNodeData(node.id, {
                        sampleName: file.name,
                        sampleId: `file:${file.name}:${Date.now()}`
                    });
                } catch (err) {
                    console.error('[SamplerNode] Failed to decode audio file:', err);
                }
                return;
            }
        }

        // Handle library sample drop
        const sampleId = e.dataTransfer.getData('application/x-sample-id');
        if (sampleId) {
            try {
                const file = await getItemFile(sampleId);
                if (file && ctx) {
                    const arrayBuffer = await file.arrayBuffer();
                    const buffer = await ctx.decodeAudioData(arrayBuffer);
                    const sampler = audioGraphManager.getSamplerAdapter(node.id);
                    if (sampler) {
                        sampler.setBuffer(buffer);
                    }

                    // Update waveform
                    const channelData = buffer.getChannelData(0);
                    const samples = 50;
                    const samplesPerPoint = Math.floor(channelData.length / samples);
                    const points: number[] = [];
                    for (let i = 0; i < samples; i++) {
                        let max = 0;
                        const start = i * samplesPerPoint;
                        for (let j = 0; j < samplesPerPoint; j++) {
                            const val = Math.abs(channelData[start + j] || 0);
                            if (val > max) max = val;
                        }
                        points.push(max);
                    }
                    setWaveformData(points);

                    updateNodeData(node.id, {
                        sampleId,
                        sampleName: file.name
                    });
                }
            } catch (err) {
                console.error('[SamplerNode] Failed to load library sample:', err);
            }
        }
    }, [node.id, updateNodeData]);

    // Clear sample
    const handleClearSample = useCallback((e: React.MouseEvent) => {
        e.stopPropagation();
        updateNodeData(node.id, {
            sampleId: null,
            sampleName: null
        });
        setWaveformData([]);
        const sampler = audioGraphManager.getSamplerAdapter(node.id);
        if (sampler) {
            sampler.setBuffer(null as unknown as AudioBuffer);
        }
    }, [node.id, updateNodeData]);

    // Handle wheel on row control
    const handleRowWheel = useCallback((rowId: string, field: keyof SamplerRow, e: React.WheelEvent) => {
        e.stopPropagation();
        const row = rows.find(r => r.rowId === rowId);
        if (!row) return;

        const currentValue = row[field] as number;
        const delta = e.deltaY > 0 ? -1 : 1;

        let min: number, max: number, step: number;
        if (field === 'gain') {
            min = ROW_PARAM_RANGES.GAIN.min;
            max = ROW_PARAM_RANGES.GAIN.max;
            step = ROW_PARAM_RANGES.GAIN.step;
        } else if (field === 'spread') {
            min = ROW_PARAM_RANGES.SPREAD.min;
            max = ROW_PARAM_RANGES.SPREAD.max;
            step = ROW_PARAM_RANGES.SPREAD.step;
        } else {
            min = ROW_PARAM_RANGES.OFFSET.min;
            max = ROW_PARAM_RANGES.OFFSET.max;
            step = ROW_PARAM_RANGES.OFFSET.step;
        }

        const newValue = Math.max(min, Math.min(max, currentValue + delta * step));
        updateSamplerRow(node.id, rowId, { [field]: parseFloat(newValue.toFixed(1)) });
    }, [rows, node.id, updateSamplerRow]);

    // Handle wheel on default row controls (before any keyboard connected)
    const handleDefaultRowWheel = useCallback((field: 'gain' | 'spread', e: React.WheelEvent) => {
        e.stopPropagation();
        const currentValue = field === 'gain' ? (data.defaultGain ?? 1.0) : (data.defaultSpread ?? 1.0);
        const delta = e.deltaY > 0 ? -1 : 1;

        const ranges = field === 'gain' ? ROW_PARAM_RANGES.GAIN : ROW_PARAM_RANGES.SPREAD;
        const newValue = Math.max(ranges.min, Math.min(ranges.max, currentValue + delta * ranges.step));

        updateNodeData(node.id, {
            [field === 'gain' ? 'defaultGain' : 'defaultSpread']: parseFloat(newValue.toFixed(1))
        });
    }, [data.defaultGain, data.defaultSpread, node.id, updateNodeData]);

    const hasSample = !!data.sampleName;

    return (
        <div
            ref={nodeRef}
            className={`sampler-node schematic-node ${isSelected ? 'selected' : ''} ${isDragging ? 'dragging' : ''} ${isHoveredWithConnections ? 'hover-connecting' : ''}`}
            style={style}
            onMouseEnter={handleNodeMouseEnter}
            onMouseLeave={handleNodeMouseLeave}
        >
            {/* Header */}
            <div className="schematic-header" onMouseDown={handleHeaderMouseDown}>
                <span className="schematic-title">Sampler</span>
            </div>

            {/* Sample drop zone */}
            <div
                ref={sampleAreaRef}
                className={`sampler-sample-area ${isDragOver || isClipDropTarget ? 'drag-over' : ''} ${hasSample ? 'has-sample' : ''}`}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                title={data.sampleName || 'Drop audio file or clip here'}
            >
                {hasSample ? (
                    <>
                        <svg viewBox="0 0 100 20" preserveAspectRatio="none">
                            {waveformData.length > 1 ? (
                                <polyline
                                    className="sampler-waveform-path"
                                    fill="none"
                                    strokeWidth="2"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    points={waveformData.map((v, i) =>
                                        `${(i / (waveformData.length - 1)) * 100},${10 - v * 8}`
                                    ).join(' ')}
                                />
                            ) : (
                                <line x1="0" y1="10" x2="100" y2="10" className="sampler-waveform-path" />
                            )}
                        </svg>
                        <button
                            className="sampler-clear-btn"
                            onClick={handleClearSample}
                            title="Remove sample"
                        >
                            <svg viewBox="0 0 24 24" fill="currentColor" width="12" height="12">
                                <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
                            </svg>
                        </button>
                        <span className="sampler-sample-name">{data.sampleName}</span>
                    </>
                ) : (
                    <span className="sampler-drop-text">Drop audio</span>
                )}
            </div>

            {/* Main body - row layout like InstrumentNode */}
            <div className="sampler-schematic-body">
                {/* Rows container */}
                <div className="sampler-rows-simple">
                    {rows.length === 0 ? (
                        /* Default row - always visible with controls */
                        emptyStatePort && (
                            <div className="sampler-row-simple">
                                {/* Input port for keyboard bundle */}
                                <div
                                    className="bundle-input-port empty"
                                    data-node-id={node.id}
                                    data-port-id={emptyStatePort.id}
                                    onMouseDown={(e) => handlePortMouseDown?.(emptyStatePort.id, e)}
                                    onMouseUp={(e) => handlePortMouseUp?.(emptyStatePort.id, e)}
                                    onMouseEnter={() => handlePortMouseEnter?.(emptyStatePort.id)}
                                    onMouseLeave={handlePortMouseLeave}
                                    title="Connect keyboard bundle"
                                />

                                {/* Row controls: Gain and Spread - editable even before keyboard connected */}
                                <span
                                    className="row-value gain-value editable-value"
                                    onWheel={(e) => handleDefaultRowWheel('gain', e)}
                                    title="Gain (0-2) - scroll to change"
                                >
                                    G:{(data.defaultGain ?? 1.0).toFixed(1)}
                                </span>
                                <span
                                    className="row-value spread-value editable-value"
                                    onWheel={(e) => handleDefaultRowWheel('spread', e)}
                                    title="Spread (semitones between keys) - scroll to change"
                                >
                                    S:{(data.defaultSpread ?? 1.0).toFixed(1)}
                                </span>
                            </div>
                        )
                    ) : (
                        /* Show rows with connections */
                        <>
                            {rows.map((row, index) => {
                                const rowPort = node.ports.find(p => p.id === row.targetPortId);

                                return (
                                    <div key={row.rowId} className={`sampler-row-simple ${index > 0 ? 'with-divider' : ''}`}>
                                        {/* Input port for this row's bundle */}
                                        <div
                                            className={`bundle-input-port ${rowPort && hasConnection?.(rowPort.id) ? 'connected' : ''}`}
                                            data-node-id={node.id}
                                            data-port-id={rowPort?.id || 'bundle-in'}
                                            onMouseDown={(e) => handlePortMouseDown?.(rowPort?.id || 'bundle-in', e)}
                                            onMouseUp={(e) => handlePortMouseUp?.(rowPort?.id || 'bundle-in', e)}
                                            onMouseEnter={() => handlePortMouseEnter?.(rowPort?.id || 'bundle-in')}
                                            onMouseLeave={handlePortMouseLeave}
                                            title={row.label || 'Bundle input'}
                                        />

                                        {/* Row controls: Gain and Spread */}
                                        <span
                                            className="row-value gain-value editable-value"
                                            onWheel={(e) => handleRowWheel(row.rowId, 'gain', e)}
                                            title="Gain (0-2) - scroll to change"
                                        >
                                            G:{row.gain.toFixed(1)}
                                        </span>
                                        <span
                                            className="row-value spread-value editable-value"
                                            onWheel={(e) => handleRowWheel(row.rowId, 'spread', e)}
                                            title="Spread (semitones between keys) - scroll to change"
                                        >
                                            S:{row.spread.toFixed(1)}
                                        </span>
                                    </div>
                                );
                            })}
                            {/* Empty row for adding new connections */}
                            {availableNewRowPort && (
                                <div className="sampler-row-simple empty-row with-divider">
                                    <div
                                        className="bundle-input-port empty"
                                        data-node-id={node.id}
                                        data-port-id={availableNewRowPort.id}
                                        onMouseDown={(e) => handlePortMouseDown?.(availableNewRowPort.id, e)}
                                        onMouseUp={(e) => handlePortMouseUp?.(availableNewRowPort.id, e)}
                                        onMouseEnter={() => handlePortMouseEnter?.(availableNewRowPort.id)}
                                        onMouseLeave={handlePortMouseLeave}
                                        title="Connect keyboard bundle"
                                    />
                                </div>
                            )}
                        </>
                    )}
                </div>

                {/* Output port on right */}
                {audioOutPort && (
                    <div
                        className={`sampler-output-port ${hasConnection?.(audioOutPort.id) ? 'connected' : ''}`}
                        data-node-id={node.id}
                        data-port-id={audioOutPort.id}
                        onMouseDown={(e) => handlePortMouseDown?.(audioOutPort.id, e)}
                        onMouseUp={(e) => handlePortMouseUp?.(audioOutPort.id, e)}
                        onMouseEnter={() => handlePortMouseEnter?.(audioOutPort.id)}
                        onMouseLeave={handlePortMouseLeave}
                        title="Audio output"
                    />
                )}
            </div>
        </div>
    );
});

export default SamplerNode;
