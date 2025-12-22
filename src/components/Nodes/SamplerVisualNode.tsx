/**
 * Sampler Visual Node - INSIDE view (compact horizontal layout)
 *
 * Layout: [Input port] | [Waveform + Controls] | [Output port]
 * Input panel on left, output panel on right, like MiniLab3Visual.
 */

import { useRef, useEffect, useCallback, useState, memo } from 'react';
import type { GraphNode, SamplerNodeData } from '../../engine/types';
import { useGraphStore } from '../../store/graphStore';
import { audioGraphManager } from '../../audio/AudioGraphManager';
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

// Convert MIDI note to display string
function midiToNote(midi: number): string {
    const notes = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
    const octave = Math.floor(midi / 12) - 1;
    const note = notes[midi % 12];
    return `${note}${octave}`;
}

function isSamplerNodeData(data: unknown): data is SamplerNodeData {
    return typeof data === 'object' && data !== null;
}

export const SamplerVisualNode = memo(function SamplerVisualNode({
    node,
    handlePortMouseDown,
    handlePortMouseUp,
    handlePortMouseEnter,
    handlePortMouseLeave,
    hasConnection,
    handleNodeMouseEnter,
    handleNodeMouseLeave,
    isSelected,
    isDragging,
    style
}: SamplerVisualNodeProps) {
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
    const waveformCanvasRef = useRef<HTMLCanvasElement>(null);
    const [audioBuffer, setAudioBuffer] = useState<AudioBuffer | null>(null);

    // Get ports - look for control-in and audio-out
    const controlInPort = node.ports.find(p => p.id === 'control-in' || (p.direction === 'input' && p.type === 'control'));
    const audioOutPort = node.ports.find(p => p.id === 'audio-out' || (p.direction === 'output' && p.type === 'audio'));

    // Try to get the audio buffer
    useEffect(() => {
        const parentId = node.parentId;
        if (parentId) {
            const sampler = audioGraphManager.getSamplerAdapter(parentId);
            if (sampler) {
                const buffer = sampler.getBuffer();
                setAudioBuffer(buffer);
            }
        }
    }, [node.id, node.parentId, data.sampleId]);

    // Draw compact waveform using themed colors
    useEffect(() => {
        const canvas = waveformCanvasRef.current;
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const { width, height } = canvas;
        ctx.clearRect(0, 0, width, height);

        // Get computed style for themed colors
        const computedStyle = getComputedStyle(document.documentElement);
        const borderColor = computedStyle.getPropertyValue('--border-subtle').trim() || '#e0e0e0';
        const accentColor = computedStyle.getPropertyValue('--accent-primary').trim() || '#3b82f6';
        const mutedColor = computedStyle.getPropertyValue('--text-muted').trim() || '#888';

        // Center line
        ctx.strokeStyle = borderColor;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, height / 2);
        ctx.lineTo(width, height / 2);
        ctx.stroke();

        if (audioBuffer) {
            const channelData = audioBuffer.getChannelData(0);
            const samplesPerPixel = Math.floor(channelData.length / width);

            ctx.strokeStyle = accentColor;
            ctx.lineWidth = 1.5;
            ctx.beginPath();

            const midY = height / 2;
            const amplitude = height * 0.4;

            for (let x = 0; x < width; x++) {
                const startSample = x * samplesPerPixel;
                let min = 1, max = -1;

                for (let i = 0; i < samplesPerPixel; i++) {
                    const sample = channelData[startSample + i] || 0;
                    if (sample < min) min = sample;
                    if (sample > max) max = sample;
                }

                const yMin = midY - max * amplitude;
                const yMax = midY - min * amplitude;

                if (x === 0) ctx.moveTo(x, (yMin + yMax) / 2);
                else { ctx.lineTo(x, yMin); ctx.lineTo(x, yMax); }
            }
            ctx.stroke();
        } else {
            ctx.fillStyle = mutedColor;
            ctx.font = '11px sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('No sample', width / 2, height / 2);
        }
    }, [audioBuffer]);

    // Wheel handlers
    const handleRootNoteWheel = useCallback((e: React.WheelEvent) => {
        e.stopPropagation();
        const delta = e.deltaY > 0 ? -1 : 1;
        const newRootNote = Math.max(0, Math.min(127, data.rootNote + delta));
        updateNodeData(node.id, { rootNote: newRootNote });
    }, [node.id, data.rootNote, updateNodeData]);

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

    return (
        <div
            className={`sampler-visual-node horizontal ${isSelected ? 'selected' : ''} ${isDragging ? 'dragging' : ''}`}
            style={style}
            onMouseEnter={handleNodeMouseEnter}
            onMouseLeave={handleNodeMouseLeave}
        >
            {/* Left: Input port panel */}
            <div className="sampler-visual-input-panel">
                {controlInPort && (
                    <div
                        className={`sampler-visual-port input ${hasConnection?.(controlInPort.id) ? 'connected' : ''}`}
                        data-node-id={node.id}
                        data-port-id={controlInPort.id}
                        onMouseDown={(e) => handlePortMouseDown?.(controlInPort.id, e)}
                        onMouseUp={(e) => handlePortMouseUp?.(controlInPort.id, e)}
                        onMouseEnter={() => handlePortMouseEnter?.(controlInPort.id)}
                        onMouseLeave={handlePortMouseLeave}
                        title="Control input"
                    />
                )}
                <span className="sampler-panel-label">In</span>
            </div>

            {/* Center: Waveform and controls */}
            <div className="sampler-visual-content">
                {/* Waveform */}
                <div className="sampler-visual-waveform-container">
                    <canvas
                        ref={waveformCanvasRef}
                        className="sampler-visual-waveform"
                        width={200}
                        height={50}
                    />
                </div>

                {/* Controls row */}
                <div className="sampler-visual-controls">
                    <span
                        className="sampler-ctrl"
                        onWheel={handleRootNoteWheel}
                        title="Root note - scroll to change"
                    >
                        {midiToNote(data.rootNote)}
                    </span>
                    <span
                        className="sampler-ctrl"
                        onWheel={handleOffsetWheel}
                        title="Offset - scroll to change"
                    >
                        {(data.baseOffset || 0) >= 0 ? `+${data.baseOffset || 0}` : data.baseOffset}
                    </span>
                    <span
                        className="sampler-ctrl"
                        onWheel={handleSpreadWheel}
                        title="Spread - scroll to change"
                    >
                        {(data.spread ?? 0.5).toFixed(1)}
                    </span>
                </div>
            </div>

            {/* Right: Output port panel */}
            <div className="sampler-visual-output-panel">
                <span className="sampler-panel-label">Out</span>
                {audioOutPort && (
                    <div
                        className={`sampler-visual-port output ${hasConnection?.(audioOutPort.id) ? 'connected' : ''}`}
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

export default SamplerVisualNode;
