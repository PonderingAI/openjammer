/**
 * Sampler Node - OUTSIDE view (like Looper pattern)
 *
 * Layout:
 * [Control In] ─── [Sample waveform area] ─── [Audio Out]
 *              Offset: +0    Spread: 0.5
 *
 * The sample area shows waveform when loaded, accepts drops, and can be dragged out.
 */

import { useCallback, useRef, useState, useEffect, memo } from 'react';
import type { GraphNode, SamplerNodeData, AudioClip, ClipDropTarget } from '../../engine/types';
import { useGraphStore } from '../../store/graphStore';
import { getItemFile } from '../../store/libraryStore';
import { getAudioContext } from '../../audio/AudioEngine';
import { audioGraphManager } from '../../audio/AudioGraphManager';
import { useAudioClipStore, getClipBuffer } from '../../store/audioClipStore';
import { loadClipAudio } from '../../utils/clipUtils';

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

// Type guard imported from shared module
import { isSamplerNodeData } from '../../engine/typeGuards';

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
        baseNote: 0,
        baseOctave: 4,
        baseOffset: 0,
        spread: 0.5,
        velocityCurve: 'exponential',
        triggerMode: 'gate',
        loopEnabled: false,
        loopStart: 0,
        loopEnd: 0,
        maxVoices: 16,
    };

    const data: SamplerNodeData = isSamplerNodeData(node.data)
        ? { ...defaultData, ...(node.data as Partial<SamplerNodeData>) }
        : defaultData;

    const updateNodeData = useGraphStore((s) => s.updateNodeData);
    const nodeRef = useRef<HTMLDivElement>(null);
    const sampleAreaRef = useRef<HTMLDivElement>(null);
    const waveformRef = useRef<SVGSVGElement>(null);

    // Audio clip store for accepting clip drops
    const registerDropTarget = useAudioClipStore((s) => s.registerDropTarget);
    const unregisterDropTarget = useAudioClipStore((s) => s.unregisterDropTarget);
    const clipDragState = useAudioClipStore((s) => s.dragState);

    const [isDragOver, setIsDragOver] = useState(false);
    const [waveformData, setWaveformData] = useState<number[]>([]);

    // Get ports
    const controlInPort = node.ports.find(p => p.id === 'control-in');
    const audioOutPort = node.ports.find(p => p.id === 'audio-out');

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
                const samples = 50; // Number of points for waveform
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
            // First check if buffer is in cache (for looper-originated clips)
            let buffer = getClipBuffer(clip.sampleId);

            if (!buffer) {
                // Otherwise load from sample library (applies cropping too)
                buffer = await loadClipAudio(clip, ctx);
            }

            // Set the buffer on the sampler adapter
            const sampler = audioGraphManager.getSamplerAdapter(node.id);
            if (sampler) {
                sampler.setBuffer(buffer);
            }

            // Update node data with sample info
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
            canAcceptClip: () => true, // Accept any audio clip
            getDropZoneBounds: () => sampleAreaRef.current?.getBoundingClientRect() ?? null,
        };

        registerDropTarget(dropTarget);
        return () => unregisterDropTarget(node.id);
    }, [node.id, handleClipDrop, registerDropTarget, unregisterDropTarget]);

    // Visual feedback when being dragged over with a clip
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
                        await ctx.decodeAudioData(arrayBuffer);
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
                if (file) {
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

    // Handle drag-out of sample
    const handleSampleDragStart = useCallback((e: React.MouseEvent) => {
        if (!data.sampleId || !data.sampleName) return;
        // For now just prevent the drag - could implement clip export later
        e.preventDefault();
    }, [data.sampleId, data.sampleName]);

    // Clear sample
    const handleClearSample = useCallback((e: React.MouseEvent) => {
        e.stopPropagation();
        updateNodeData(node.id, {
            sampleId: null,
            sampleName: null
        });
        setWaveformData([]);
    }, [node.id, updateNodeData]);

    // Wheel handlers for offset and spread
    const handleOffsetWheel = useCallback((e: React.WheelEvent) => {
        e.stopPropagation();
        const delta = e.deltaY > 0 ? -1 : 1;
        const newOffset = Math.max(-24, Math.min(24, (data.baseOffset || 0) + delta));
        updateNodeData(node.id, { baseOffset: newOffset });
    }, [node.id, data.baseOffset, updateNodeData]);

    const handleSpreadWheel = useCallback((e: React.WheelEvent) => {
        e.stopPropagation();
        const delta = e.deltaY > 0 ? -0.1 : 0.1;
        const newSpread = Math.max(0, Math.min(1, (data.spread || 0.5) + delta));
        updateNodeData(node.id, { spread: parseFloat(newSpread.toFixed(1)) });
    }, [node.id, data.spread, updateNodeData]);

    const hasSample = !!data.sampleName;

    return (
        <div
            ref={nodeRef}
            className={`schematic-node sampler-node ${isSelected ? 'selected' : ''} ${isDragging ? 'dragging' : ''} ${isHoveredWithConnections ? 'hover-connecting' : ''}`}
            style={style}
            onMouseEnter={handleNodeMouseEnter}
            onMouseLeave={handleNodeMouseLeave}
        >
            {/* Header */}
            <div className="schematic-header" onMouseDown={handleHeaderMouseDown}>
                <span className="schematic-title">Sampler</span>
            </div>

            {/* Main row: Control In - Sample Area - Audio Out */}
            <div className="sampler-main-row">
                {/* Control input port */}
                {controlInPort && (
                    <div
                        className={`sampler-input-port ${hasConnection?.(controlInPort.id) ? 'connected' : ''}`}
                        data-node-id={node.id}
                        data-port-id={controlInPort.id}
                        onMouseDown={(e) => handlePortMouseDown?.(controlInPort.id, e)}
                        onMouseUp={(e) => handlePortMouseUp?.(controlInPort.id, e)}
                        onMouseEnter={() => handlePortMouseEnter?.(controlInPort.id)}
                        onMouseLeave={handlePortMouseLeave}
                        title="Control input (connect keyboard/MIDI)"
                    />
                )}

                {/* Sample area - like looper-loop-item */}
                <div
                    ref={sampleAreaRef}
                    className={`sampler-sample-area ${isDragOver || isClipDropTarget ? 'drag-over' : ''} ${hasSample ? 'has-sample' : ''}`}
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                    onMouseDown={hasSample ? handleSampleDragStart : undefined}
                    style={{ cursor: hasSample ? 'grab' : 'default' }}
                    title={data.sampleName || 'Drop audio file or clip here'}
                >
                    {hasSample ? (
                        <>
                            <svg ref={waveformRef} viewBox="0 0 100 20" preserveAspectRatio="none">
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
                            {/* Clear button on hover */}
                            <button
                                className="sampler-clear-btn"
                                onClick={handleClearSample}
                                title="Remove sample"
                            >
                                <svg viewBox="0 0 24 24" fill="currentColor" width="12" height="12">
                                    <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
                                </svg>
                            </button>
                        </>
                    ) : (
                        <span className="sampler-drop-text">Drop audio</span>
                    )}
                </div>

                {/* Audio output port */}
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

            {/* Controls row: Offset and Spread */}
            <div className="sampler-controls-row">
                <span
                    className="sampler-control-value"
                    onWheel={handleOffsetWheel}
                    title="Offset (semitones) - scroll to adjust"
                >
                    {(data.baseOffset || 0) >= 0 ? `+${data.baseOffset || 0}` : data.baseOffset}
                </span>
                <span
                    className="sampler-control-value"
                    onWheel={handleSpreadWheel}
                    title="Spread - scroll to adjust"
                >
                    {(data.spread ?? 0.5).toFixed(1)}
                </span>
            </div>
        </div>
    );
});

export default SamplerNode;
