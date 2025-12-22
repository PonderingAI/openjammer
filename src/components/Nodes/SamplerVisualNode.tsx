/**
 * Sampler Visual Node - INSIDE view (detailed controls)
 *
 * Shown when entering a Sampler node with E key.
 * Provides full access to all sampler parameters:
 * - Waveform display
 * - Root note selector
 * - ADSR envelope controls
 * - Loop settings
 * - Velocity curve
 */

import { useRef, useEffect, useCallback, useState, useMemo, memo } from 'react';
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

// ============================================================================
// Constants
// ============================================================================

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

const VELOCITY_CURVES = [
    { value: 'linear', label: 'Linear' },
    { value: 'exponential', label: 'Exponential' },
    { value: 'logarithmic', label: 'Logarithmic' }
] as const;

const TRIGGER_MODES = [
    { value: 'gate', label: 'Gate', description: 'Note plays while held' },
    { value: 'oneshot', label: 'One-Shot', description: 'Full sample plays on trigger' },
    { value: 'toggle', label: 'Toggle', description: 'Press to start, press to stop' }
] as const;

/**
 * Convert MIDI note number to display string (e.g., 60 -> "C4")
 */
function midiToNoteName(midi: number): string {
    const octave = Math.floor(midi / 12) - 1;
    const note = midi % 12;
    return `${NOTE_NAMES[note]}${octave}`;
}

/**
 * Type guard for SamplerNodeData
 */
function isSamplerNodeData(data: unknown): data is SamplerNodeData {
    if (typeof data !== 'object' || data === null) return false;
    const d = data as Record<string, unknown>;
    return typeof d.rootNote === 'number' || d.rootNote === undefined;
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
    // Default values for sampler data
    const defaultData: SamplerNodeData = {
        sampleId: null,
        sampleName: 'No sample',
        rootNote: 60,
        attack: 0.01,
        decay: 0.1,
        sustain: 0.8,
        release: 0.3,
        velocityCurve: 'exponential',
        triggerMode: 'gate',
        loopEnabled: false,
        loopStart: 0,
        loopEnd: 0,
        maxVoices: 16,
        activePreset: 'chromatic'
    };

    // Merge node data with defaults to ensure all properties exist
    const data: SamplerNodeData = {
        ...defaultData,
        ...(isSamplerNodeData(node.data) ? node.data as SamplerNodeData : {})
    };

    const updateNodeData = useGraphStore((s) => s.updateNodeData);
    const waveformCanvasRef = useRef<HTMLCanvasElement>(null);
    const waveformContainerRef = useRef<HTMLDivElement>(null);
    const [showRootNoteDropdown, setShowRootNoteDropdown] = useState(false);
    const [audioBuffer, setAudioBuffer] = useState<AudioBuffer | null>(null);

    // Waveform interaction state
    const [isDraggingLoop, setIsDraggingLoop] = useState<'start' | 'end' | null>(null);
    const [waveformZoom, setWaveformZoom] = useState(1);
    // Reserved for future pan/scroll functionality
    const [waveformOffset, _setWaveformOffset] = useState(0);
    void _setWaveformOffset;

    // ADSR envelope drag state
    const adsrSvgRef = useRef<SVGSVGElement>(null);
    const [isDraggingADSR, setIsDraggingADSR] = useState<'attack' | 'decay' | 'sustain' | 'release' | null>(null);

    // Get ports
    const inputPorts = node.ports.filter(p => p.direction === 'input');
    const outputPorts = node.ports.filter(p => p.direction === 'output');

    // Root note as display string
    const rootNoteDisplay = midiToNoteName(data.rootNote);

    // Try to get the audio buffer from the sampler adapter
    useEffect(() => {
        const sampler = audioGraphManager.getSamplerAdapter(node.id);
        if (sampler) {
            const buffer = sampler.getBuffer();
            setAudioBuffer(buffer);
        }
    }, [node.id, data.sampleId]);

    // Draw waveform
    useEffect(() => {
        const canvas = waveformCanvasRef.current;
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const { width, height } = canvas;
        ctx.clearRect(0, 0, width, height);

        // Background
        ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
        ctx.fillRect(0, 0, width, height);

        // Draw grid lines
        ctx.strokeStyle = 'rgba(100, 100, 100, 0.3)';
        ctx.lineWidth = 0.5;
        const gridLines = 4;
        for (let i = 1; i < gridLines; i++) {
            const y = (height / gridLines) * i;
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(width, y);
            ctx.stroke();
        }

        // Center line
        ctx.strokeStyle = 'rgba(100, 150, 200, 0.5)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, height / 2);
        ctx.lineTo(width, height / 2);
        ctx.stroke();

        if (audioBuffer) {
            // Draw actual waveform
            const channelData = audioBuffer.getChannelData(0);
            const samplesPerPixel = Math.floor(channelData.length / width);

            ctx.strokeStyle = 'rgba(100, 200, 255, 0.9)';
            ctx.lineWidth = 1.5;
            ctx.beginPath();

            const midY = height / 2;
            const amplitude = height * 0.4;

            for (let x = 0; x < width; x++) {
                const startSample = x * samplesPerPixel;
                let min = 1;
                let max = -1;

                for (let i = 0; i < samplesPerPixel; i++) {
                    const sample = channelData[startSample + i] || 0;
                    if (sample < min) min = sample;
                    if (sample > max) max = sample;
                }

                const yMin = midY - max * amplitude;
                const yMax = midY - min * amplitude;

                if (x === 0) {
                    ctx.moveTo(x, (yMin + yMax) / 2);
                } else {
                    ctx.lineTo(x, yMin);
                    ctx.lineTo(x, yMax);
                }
            }
            ctx.stroke();

            // Draw loop region if enabled
            if (data.loopEnabled && data.loopEnd > data.loopStart) {
                const startX = (data.loopStart / audioBuffer.duration) * width;
                const endX = (data.loopEnd / audioBuffer.duration) * width;

                ctx.fillStyle = 'rgba(100, 255, 100, 0.15)';
                ctx.fillRect(startX, 0, endX - startX, height);

                ctx.strokeStyle = 'rgba(100, 255, 100, 0.8)';
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.moveTo(startX, 0);
                ctx.lineTo(startX, height);
                ctx.stroke();
                ctx.beginPath();
                ctx.moveTo(endX, 0);
                ctx.lineTo(endX, height);
                ctx.stroke();
            }
        } else {
            // Draw placeholder waveform
            ctx.strokeStyle = 'rgba(100, 100, 100, 0.5)';
            ctx.lineWidth = 1.5;
            ctx.beginPath();

            const midY = height / 2;
            const amplitude = height * 0.25;

            for (let x = 0; x < width; x++) {
                const t = (x / width) * Math.PI * 8;
                const y = midY + Math.sin(t) * amplitude * Math.sin(t * 0.1);
                if (x === 0) {
                    ctx.moveTo(x, y);
                } else {
                    ctx.lineTo(x, y);
                }
            }
            ctx.stroke();

            // "No sample" text
            ctx.fillStyle = 'rgba(150, 150, 150, 0.7)';
            ctx.font = '14px monospace';
            ctx.textAlign = 'center';
            ctx.fillText('No sample loaded', width / 2, height / 2 + 5);
        }
    }, [audioBuffer, data.loopEnabled, data.loopStart, data.loopEnd]);

    // Handle root note change
    const handleRootNoteSelect = useCallback((midiNote: number) => {
        updateNodeData(node.id, { rootNote: midiNote });
        setShowRootNoteDropdown(false);

        // Update the sampler adapter
        const sampler = audioGraphManager.getSamplerAdapter(node.id);
        if (sampler) {
            sampler.setRootNote(midiNote);
        }
    }, [node.id, updateNodeData]);

    // Handle ADSR changes
    const handleADSRChange = useCallback((param: 'attack' | 'decay' | 'sustain' | 'release', value: number) => {
        updateNodeData(node.id, { [param]: value });

        // Update the sampler adapter
        const sampler = audioGraphManager.getSamplerAdapter(node.id);
        if (sampler) {
            const newADSR = {
                attack: param === 'attack' ? value : data.attack,
                decay: param === 'decay' ? value : data.decay,
                sustain: param === 'sustain' ? value : data.sustain,
                release: param === 'release' ? value : data.release
            };
            sampler.setADSR(newADSR.attack, newADSR.decay, newADSR.sustain, newADSR.release);
        }
    }, [node.id, data, updateNodeData]);

    // Handle ADSR wheel
    const handleADSRWheel = useCallback((param: 'attack' | 'decay' | 'sustain' | 'release', e: React.WheelEvent) => {
        e.stopPropagation();
        const delta = e.deltaY > 0 ? -0.01 : 0.01;
        const current = data[param];
        let newValue: number;

        if (param === 'sustain') {
            newValue = Math.max(0, Math.min(1, current + delta * 10));
        } else {
            newValue = Math.max(0.001, Math.min(5, current + delta * (param === 'attack' ? 1 : 2)));
        }

        handleADSRChange(param, newValue);
    }, [data, handleADSRChange]);

    // ADSR envelope SVG dimensions and calculations
    const ADSR_WIDTH = 380;
    const ADSR_HEIGHT = 80;
    const ADSR_PADDING = 10;

    // Calculate ADSR envelope points for SVG path
    const adsrPath = useMemo(() => {
        const maxTime = 5; // Max time scale in seconds
        const usableWidth = ADSR_WIDTH - ADSR_PADDING * 2;
        const usableHeight = ADSR_HEIGHT - ADSR_PADDING * 2;

        // Time proportions (attack + decay + sustain hold + release)
        const attackProp = Math.min(data.attack, maxTime) / maxTime * 0.25;
        const decayProp = Math.min(data.decay, maxTime) / maxTime * 0.25;
        const sustainHoldProp = 0.3; // Fixed sustain hold duration
        const releaseProp = Math.min(data.release, maxTime) / maxTime * 0.2;

        // X positions
        const startX = ADSR_PADDING;
        const attackX = startX + attackProp * usableWidth;
        const decayX = attackX + decayProp * usableWidth;
        const sustainEndX = decayX + sustainHoldProp * usableWidth;
        const releaseX = sustainEndX + releaseProp * usableWidth;

        // Y positions (inverted because SVG y=0 is top)
        const bottomY = ADSR_HEIGHT - ADSR_PADDING;
        const topY = ADSR_PADDING;
        const sustainY = topY + (1 - data.sustain) * usableHeight;

        return {
            path: `M ${startX} ${bottomY}
                   L ${attackX} ${topY}
                   L ${decayX} ${sustainY}
                   L ${sustainEndX} ${sustainY}
                   L ${releaseX} ${bottomY}`,
            points: {
                start: { x: startX, y: bottomY },
                attack: { x: attackX, y: topY },
                decay: { x: decayX, y: sustainY },
                sustainEnd: { x: sustainEndX, y: sustainY },
                release: { x: releaseX, y: bottomY }
            }
        };
    }, [data.attack, data.decay, data.sustain, data.release]);

    // Velocity curve SVG path
    const velocityCurvePath = useMemo(() => {
        const width = 120;
        const height = 50;
        const padding = 4;
        const usableWidth = width - padding * 2;
        const usableHeight = height - padding * 2;

        // Generate curve points
        const points: string[] = [];
        const steps = 30;

        for (let i = 0; i <= steps; i++) {
            const x = i / steps;
            let y: number;

            switch (data.velocityCurve) {
                case 'linear':
                    y = x;
                    break;
                case 'exponential':
                    y = x * x; // Quadratic for visual clarity
                    break;
                case 'logarithmic':
                    y = Math.sqrt(x); // Square root for visual clarity
                    break;
                default:
                    y = x;
            }

            const px = padding + x * usableWidth;
            const py = height - padding - y * usableHeight;

            if (i === 0) {
                points.push(`M ${px} ${py}`);
            } else {
                points.push(`L ${px} ${py}`);
            }
        }

        return {
            path: points.join(' '),
            width,
            height,
            padding
        };
    }, [data.velocityCurve]);

    // Handle ADSR point drag start
    const handleADSRPointMouseDown = useCallback((point: 'attack' | 'decay' | 'sustain' | 'release', e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDraggingADSR(point);
    }, []);

    // Handle ADSR drag
    useEffect(() => {
        if (!isDraggingADSR || !adsrSvgRef.current) return;

        const handleMouseMove = (e: MouseEvent) => {
            const rect = adsrSvgRef.current!.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;

            const usableWidth = ADSR_WIDTH - ADSR_PADDING * 2;
            const usableHeight = ADSR_HEIGHT - ADSR_PADDING * 2;
            const maxTime = 5;

            // Normalize Y to 0-1 (inverted)
            const normalizedY = 1 - Math.max(0, Math.min(1, (y - ADSR_PADDING) / usableHeight));

            switch (isDraggingADSR) {
                case 'attack': {
                    // Attack: X position determines attack time
                    const attackProp = Math.max(0, Math.min(0.25, (x - ADSR_PADDING) / usableWidth));
                    const attackTime = Math.max(0.001, attackProp * 4 * maxTime);
                    handleADSRChange('attack', attackTime);
                    break;
                }
                case 'decay': {
                    // Decay: X position determines decay time, Y determines sustain level
                    const decayStartX = adsrPath.points.attack.x;
                    const decayProp = Math.max(0, Math.min(0.25, (x - decayStartX) / usableWidth));
                    const decayTime = Math.max(0.001, decayProp * 4 * maxTime);
                    const sustainLevel = Math.max(0, Math.min(1, normalizedY));
                    handleADSRChange('decay', decayTime);
                    handleADSRChange('sustain', sustainLevel);
                    break;
                }
                case 'sustain': {
                    // Sustain: Y position only
                    const sustainLevel = Math.max(0, Math.min(1, normalizedY));
                    handleADSRChange('sustain', sustainLevel);
                    break;
                }
                case 'release': {
                    // Release: X position determines release time
                    const releaseStartX = adsrPath.points.sustainEnd.x;
                    const releaseProp = Math.max(0, Math.min(0.2, (x - releaseStartX) / usableWidth));
                    const releaseTime = Math.max(0.001, releaseProp * 5 * maxTime);
                    handleADSRChange('release', releaseTime);
                    break;
                }
            }
        };

        const handleMouseUp = () => {
            setIsDraggingADSR(null);
        };

        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mouseup', handleMouseUp);
        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        };
    }, [isDraggingADSR, adsrPath.points, handleADSRChange]);

    // Handle loop toggle
    const handleLoopToggle = useCallback(() => {
        const newLoopEnabled = !data.loopEnabled;
        updateNodeData(node.id, { loopEnabled: newLoopEnabled });

        const sampler = audioGraphManager.getSamplerAdapter(node.id);
        if (sampler && audioBuffer) {
            if (newLoopEnabled) {
                sampler.setLoopPoints(data.loopStart || 0, data.loopEnd || audioBuffer.duration);
            }
        }
    }, [node.id, data.loopEnabled, data.loopStart, data.loopEnd, audioBuffer, updateNodeData]);

    // Convert click position to time in seconds
    const positionToTime = useCallback((clientX: number): number => {
        if (!waveformContainerRef.current || !audioBuffer) return 0;
        const rect = waveformContainerRef.current.getBoundingClientRect();
        const x = clientX - rect.left;
        const normalizedX = x / rect.width;
        const visibleDuration = audioBuffer.duration / waveformZoom;
        const startTime = waveformOffset * audioBuffer.duration;
        return startTime + normalizedX * visibleDuration;
    }, [audioBuffer, waveformZoom, waveformOffset]);

    // Handle loop marker drag start
    const handleLoopMarkerMouseDown = useCallback((marker: 'start' | 'end', e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDraggingLoop(marker);
    }, []);

    // Handle loop marker drag
    useEffect(() => {
        if (!isDraggingLoop || !audioBuffer) return;

        const handleMouseMove = (e: MouseEvent) => {
            const time = Math.max(0, Math.min(audioBuffer.duration, positionToTime(e.clientX)));

            if (isDraggingLoop === 'start') {
                const newStart = Math.min(time, data.loopEnd - 0.01);
                updateNodeData(node.id, { loopStart: Math.max(0, newStart) });
            } else {
                const newEnd = Math.max(time, data.loopStart + 0.01);
                updateNodeData(node.id, { loopEnd: Math.min(audioBuffer.duration, newEnd) });
            }
        };

        const handleMouseUp = () => {
            setIsDraggingLoop(null);

            // Update sampler with new loop points
            const sampler = audioGraphManager.getSamplerAdapter(node.id);
            if (sampler && data.loopEnabled) {
                sampler.setLoopPoints(data.loopStart, data.loopEnd);
            }
        };

        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mouseup', handleMouseUp);
        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        };
    }, [isDraggingLoop, audioBuffer, positionToTime, data.loopStart, data.loopEnd, data.loopEnabled, node.id, updateNodeData]);

    // Handle waveform click to set loop points
    const handleWaveformClick = useCallback((e: React.MouseEvent) => {
        if (!audioBuffer || !data.loopEnabled) return;

        const time = positionToTime(e.clientX);

        // Determine which marker to move based on proximity
        const distToStart = Math.abs(time - data.loopStart);
        const distToEnd = Math.abs(time - data.loopEnd);

        if (distToStart < distToEnd) {
            updateNodeData(node.id, { loopStart: Math.min(time, data.loopEnd - 0.01) });
        } else {
            updateNodeData(node.id, { loopEnd: Math.max(time, data.loopStart + 0.01) });
        }
    }, [audioBuffer, data.loopEnabled, data.loopStart, data.loopEnd, positionToTime, node.id, updateNodeData]);

    // Handle zoom wheel
    const handleZoomWheel = useCallback((e: React.WheelEvent) => {
        e.stopPropagation();
        const delta = e.deltaY > 0 ? -0.2 : 0.2;
        setWaveformZoom(z => Math.max(1, Math.min(10, z + delta)));
    }, []);

    // Handle velocity curve change
    const handleVelocityCurveChange = useCallback((curve: 'linear' | 'exponential' | 'logarithmic') => {
        updateNodeData(node.id, { velocityCurve: curve });

        const sampler = audioGraphManager.getSamplerAdapter(node.id);
        if (sampler) {
            sampler.setVelocityCurve(curve);
        }
    }, [node.id, updateNodeData]);

    // Handle trigger mode change
    const handleTriggerModeChange = useCallback((mode: 'gate' | 'oneshot' | 'toggle') => {
        updateNodeData(node.id, { triggerMode: mode });
    }, [node.id, updateNodeData]);

    // Handle max voices change
    const handleMaxVoicesWheel = useCallback((e: React.WheelEvent) => {
        e.stopPropagation();
        const delta = e.deltaY > 0 ? -1 : 1;
        const newValue = Math.max(1, Math.min(32, data.maxVoices + delta));
        updateNodeData(node.id, { maxVoices: newValue });

        const sampler = audioGraphManager.getSamplerAdapter(node.id);
        if (sampler) {
            sampler.setPolyphony(newValue);
        }
    }, [node.id, data.maxVoices, updateNodeData]);

    // Generate root note options (C0 to C8)
    const rootNoteOptions = useMemo(() => {
        const options: { midi: number; label: string }[] = [];
        for (let octave = 0; octave <= 8; octave++) {
            for (let note = 0; note < 12; note++) {
                const midi = (octave + 1) * 12 + note;
                if (midi >= 12 && midi <= 108) {
                    options.push({
                        midi,
                        label: midiToNoteName(midi)
                    });
                }
            }
        }
        return options;
    }, []);

    // Close dropdown on click outside
    useEffect(() => {
        if (!showRootNoteDropdown) return;

        const handleClickOutside = (e: MouseEvent) => {
            const dropdown = document.querySelector('.sampler-visual-root-dropdown');
            if (dropdown && !dropdown.contains(e.target as Node)) {
                setShowRootNoteDropdown(false);
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [showRootNoteDropdown]);

    return (
        <div
            className={`sampler-visual-node ${isSelected ? 'selected' : ''} ${isDragging ? 'dragging' : ''}`}
            style={style}
            onMouseEnter={handleNodeMouseEnter}
            onMouseLeave={handleNodeMouseLeave}
        >
            {/* Header */}
            <div className="sampler-visual-header">
                <span className="sampler-visual-title">
                    {data.sampleName || 'Sampler'}
                </span>
            </div>

            {/* Main content */}
            <div className="sampler-visual-content">
                {/* Waveform section */}
                <div
                    className="sampler-visual-waveform-section"
                    ref={waveformContainerRef}
                    onClick={handleWaveformClick}
                    onWheel={handleZoomWheel}
                >
                    <canvas
                        ref={waveformCanvasRef}
                        className="sampler-visual-waveform"
                        width={400}
                        height={120}
                    />

                    {/* Loop markers overlay (only when loop enabled and buffer exists) */}
                    {audioBuffer && data.loopEnabled && (
                        <div className="sampler-visual-loop-markers">
                            {/* Loop start marker */}
                            <div
                                className={`sampler-visual-loop-marker start ${isDraggingLoop === 'start' ? 'dragging' : ''}`}
                                style={{
                                    left: `${((data.loopStart / audioBuffer.duration) * 100) / waveformZoom + waveformOffset * 100}%`
                                }}
                                onMouseDown={(e) => handleLoopMarkerMouseDown('start', e)}
                                title={`Loop Start: ${data.loopStart.toFixed(3)}s`}
                            >
                                <div className="marker-handle" />
                                <div className="marker-line" />
                            </div>

                            {/* Loop end marker */}
                            <div
                                className={`sampler-visual-loop-marker end ${isDraggingLoop === 'end' ? 'dragging' : ''}`}
                                style={{
                                    left: `${((data.loopEnd / audioBuffer.duration) * 100) / waveformZoom + waveformOffset * 100}%`
                                }}
                                onMouseDown={(e) => handleLoopMarkerMouseDown('end', e)}
                                title={`Loop End: ${data.loopEnd.toFixed(3)}s`}
                            >
                                <div className="marker-handle" />
                                <div className="marker-line" />
                            </div>

                            {/* Loop region overlay */}
                            <div
                                className="sampler-visual-loop-region"
                                style={{
                                    left: `${((data.loopStart / audioBuffer.duration) * 100) / waveformZoom + waveformOffset * 100}%`,
                                    width: `${((data.loopEnd - data.loopStart) / audioBuffer.duration) * 100 / waveformZoom}%`
                                }}
                            />
                        </div>
                    )}

                    {/* Sample info bar */}
                    {audioBuffer && (
                        <div className="sampler-visual-waveform-info">
                            <span className="info-item">{audioBuffer.duration.toFixed(2)}s</span>
                            <span className="info-item">{audioBuffer.sampleRate}Hz</span>
                            <span className="info-item">{audioBuffer.numberOfChannels === 1 ? 'Mono' : 'Stereo'}</span>
                            {waveformZoom > 1 && (
                                <span className="info-item zoom">Zoom: {waveformZoom.toFixed(1)}x</span>
                            )}
                        </div>
                    )}

                    {/* Zoom slider */}
                    {audioBuffer && (
                        <div className="sampler-visual-zoom-control">
                            <span className="zoom-label">Zoom</span>
                            <input
                                type="range"
                                min="1"
                                max="10"
                                step="0.1"
                                value={waveformZoom}
                                onChange={(e) => setWaveformZoom(parseFloat(e.target.value))}
                                className="zoom-slider"
                                onClick={(e) => e.stopPropagation()}
                            />
                        </div>
                    )}
                </div>

                {/* Root Note Section with Mini Keyboard */}
                <div className="sampler-visual-root-section">
                    <div className="sampler-visual-section-label">Root Note</div>
                    <div className="sampler-visual-mini-keyboard">
                        {/* Two-octave mini keyboard centered around root note */}
                        {(() => {
                            const rootOctave = Math.floor(data.rootNote / 12) - 1;
                            const startNote = Math.max(0, (rootOctave) * 12); // One octave below
                            const endNote = Math.min(127, (rootOctave + 2) * 12 + 11); // One octave above

                            return Array.from({ length: endNote - startNote + 1 }, (_, i) => {
                                const midiNote = startNote + i;
                                const noteInOctave = midiNote % 12;
                                const isBlackKey = [1, 3, 6, 8, 10].includes(noteInOctave);
                                const isRootNote = midiNote === data.rootNote;
                                const isActive = midiNote >= data.rootNote - 12 && midiNote <= data.rootNote + 12;

                                return (
                                    <div
                                        key={midiNote}
                                        className={`mini-key ${isBlackKey ? 'black' : 'white'} ${isRootNote ? 'root' : ''} ${isActive ? 'active' : ''}`}
                                        onClick={() => handleRootNoteSelect(midiNote)}
                                        title={midiToNoteName(midiNote)}
                                    >
                                        {isRootNote && <span className="root-marker">{midiToNoteName(midiNote)}</span>}
                                    </div>
                                );
                            });
                        })()}
                    </div>
                    <div className="sampler-visual-root-display">
                        <button
                            className="sampler-visual-root-btn"
                            onClick={(e) => {
                                e.stopPropagation();
                                setShowRootNoteDropdown(!showRootNoteDropdown);
                            }}
                        >
                            {rootNoteDisplay}
                        </button>
                        {showRootNoteDropdown && (
                            <div className="sampler-visual-root-dropdown">
                                <div className="sampler-visual-root-grid">
                                    {rootNoteOptions.map(opt => (
                                        <button
                                            key={opt.midi}
                                            className={`sampler-visual-root-option ${opt.midi === data.rootNote ? 'selected' : ''}`}
                                            onClick={() => handleRootNoteSelect(opt.midi)}
                                        >
                                            {opt.label}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {/* Controls grid */}
                <div className="sampler-visual-controls">

                    {/* Polyphony */}
                    <div className="sampler-visual-control-group">
                        <label>Voices</label>
                        <div
                            className="sampler-visual-value"
                            onWheel={handleMaxVoicesWheel}
                            title="Max polyphony - scroll to change"
                        >
                            {data.maxVoices}
                        </div>
                    </div>

                    {/* Loop toggle */}
                    <div className="sampler-visual-control-group">
                        <label>Loop</label>
                        <button
                            className={`sampler-visual-toggle ${data.loopEnabled ? 'active' : ''}`}
                            onClick={handleLoopToggle}
                        >
                            {data.loopEnabled ? 'ON' : 'OFF'}
                        </button>
                    </div>
                </div>

                {/* ADSR Section */}
                <div className="sampler-visual-adsr-section">
                    <div className="sampler-visual-adsr-label">ADSR Envelope</div>

                    {/* Interactive ADSR envelope visualization */}
                    <div className="sampler-visual-adsr-graph">
                        <svg
                            ref={adsrSvgRef}
                            width={ADSR_WIDTH}
                            height={ADSR_HEIGHT}
                            className="sampler-visual-adsr-svg"
                        >
                            {/* Grid lines */}
                            <line x1={ADSR_PADDING} y1={ADSR_HEIGHT / 2} x2={ADSR_WIDTH - ADSR_PADDING} y2={ADSR_HEIGHT / 2} className="adsr-grid" />
                            <line x1={ADSR_PADDING} y1={ADSR_PADDING} x2={ADSR_WIDTH - ADSR_PADDING} y2={ADSR_PADDING} className="adsr-grid" />
                            <line x1={ADSR_PADDING} y1={ADSR_HEIGHT - ADSR_PADDING} x2={ADSR_WIDTH - ADSR_PADDING} y2={ADSR_HEIGHT - ADSR_PADDING} className="adsr-grid" />

                            {/* Filled area */}
                            <path
                                d={`${adsrPath.path} L ${adsrPath.points.release.x} ${ADSR_HEIGHT - ADSR_PADDING} L ${ADSR_PADDING} ${ADSR_HEIGHT - ADSR_PADDING} Z`}
                                className="adsr-fill"
                            />

                            {/* Envelope line */}
                            <path d={adsrPath.path} className="adsr-line" />

                            {/* Attack point */}
                            <circle
                                cx={adsrPath.points.attack.x}
                                cy={adsrPath.points.attack.y}
                                r={7}
                                className={`adsr-point attack ${isDraggingADSR === 'attack' ? 'dragging' : ''}`}
                                onMouseDown={(e) => handleADSRPointMouseDown('attack', e)}
                            />

                            {/* Decay point (controls decay time and sustain level) */}
                            <circle
                                cx={adsrPath.points.decay.x}
                                cy={adsrPath.points.decay.y}
                                r={7}
                                className={`adsr-point decay ${isDraggingADSR === 'decay' ? 'dragging' : ''}`}
                                onMouseDown={(e) => handleADSRPointMouseDown('decay', e)}
                            />

                            {/* Sustain end point (vertical only) */}
                            <circle
                                cx={adsrPath.points.sustainEnd.x}
                                cy={adsrPath.points.sustainEnd.y}
                                r={7}
                                className={`adsr-point sustain ${isDraggingADSR === 'sustain' ? 'dragging' : ''}`}
                                onMouseDown={(e) => handleADSRPointMouseDown('sustain', e)}
                            />

                            {/* Release point */}
                            <circle
                                cx={adsrPath.points.release.x}
                                cy={adsrPath.points.release.y}
                                r={7}
                                className={`adsr-point release ${isDraggingADSR === 'release' ? 'dragging' : ''}`}
                                onMouseDown={(e) => handleADSRPointMouseDown('release', e)}
                            />

                            {/* Phase labels */}
                            <text x={adsrPath.points.attack.x} y={ADSR_HEIGHT - 2} className="adsr-phase-label">A</text>
                            <text x={adsrPath.points.decay.x} y={ADSR_HEIGHT - 2} className="adsr-phase-label">D</text>
                            <text x={(adsrPath.points.decay.x + adsrPath.points.sustainEnd.x) / 2} y={ADSR_HEIGHT - 2} className="adsr-phase-label">S</text>
                            <text x={adsrPath.points.release.x} y={ADSR_HEIGHT - 2} className="adsr-phase-label">R</text>
                        </svg>
                    </div>

                    <div className="sampler-visual-adsr-controls">
                        <div className="sampler-visual-adsr-knob">
                            <div
                                className="sampler-visual-adsr-value"
                                onWheel={(e) => handleADSRWheel('attack', e)}
                                title="Attack time - scroll to change"
                            >
                                {data.attack.toFixed(2)}s
                            </div>
                            <span className="sampler-visual-adsr-name">A</span>
                        </div>
                        <div className="sampler-visual-adsr-knob">
                            <div
                                className="sampler-visual-adsr-value"
                                onWheel={(e) => handleADSRWheel('decay', e)}
                                title="Decay time - scroll to change"
                            >
                                {data.decay.toFixed(2)}s
                            </div>
                            <span className="sampler-visual-adsr-name">D</span>
                        </div>
                        <div className="sampler-visual-adsr-knob">
                            <div
                                className="sampler-visual-adsr-value"
                                onWheel={(e) => handleADSRWheel('sustain', e)}
                                title="Sustain level - scroll to change"
                            >
                                {(data.sustain * 100).toFixed(0)}%
                            </div>
                            <span className="sampler-visual-adsr-name">S</span>
                        </div>
                        <div className="sampler-visual-adsr-knob">
                            <div
                                className="sampler-visual-adsr-value"
                                onWheel={(e) => handleADSRWheel('release', e)}
                                title="Release time - scroll to change"
                            >
                                {data.release.toFixed(2)}s
                            </div>
                            <span className="sampler-visual-adsr-name">R</span>
                        </div>
                    </div>
                </div>

                {/* Velocity curve */}
                <div className="sampler-visual-section velocity-section">
                    <div className="sampler-visual-section-label">Velocity Curve</div>
                    <div className="velocity-content">
                        {/* Velocity curve graph */}
                        <div className="velocity-graph">
                            <svg
                                width={velocityCurvePath.width}
                                height={velocityCurvePath.height}
                                className="velocity-svg"
                            >
                                {/* Grid */}
                                <line
                                    x1={velocityCurvePath.padding}
                                    y1={velocityCurvePath.height - velocityCurvePath.padding}
                                    x2={velocityCurvePath.width - velocityCurvePath.padding}
                                    y2={velocityCurvePath.height - velocityCurvePath.padding}
                                    className="velocity-grid"
                                />
                                <line
                                    x1={velocityCurvePath.padding}
                                    y1={velocityCurvePath.padding}
                                    x2={velocityCurvePath.padding}
                                    y2={velocityCurvePath.height - velocityCurvePath.padding}
                                    className="velocity-grid"
                                />
                                {/* Linear reference line */}
                                <line
                                    x1={velocityCurvePath.padding}
                                    y1={velocityCurvePath.height - velocityCurvePath.padding}
                                    x2={velocityCurvePath.width - velocityCurvePath.padding}
                                    y2={velocityCurvePath.padding}
                                    className="velocity-reference"
                                />
                                {/* Curve path */}
                                <path d={velocityCurvePath.path} className="velocity-curve" />
                            </svg>
                            <div className="velocity-labels">
                                <span className="velocity-axis-label y">Out</span>
                                <span className="velocity-axis-label x">In</span>
                            </div>
                        </div>
                        {/* Velocity curve buttons */}
                        <div className="sampler-visual-button-group vertical">
                            {VELOCITY_CURVES.map(curve => (
                                <button
                                    key={curve.value}
                                    className={`sampler-visual-option-btn ${data.velocityCurve === curve.value ? 'active' : ''}`}
                                    onClick={() => handleVelocityCurveChange(curve.value)}
                                >
                                    {curve.label}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Trigger mode */}
                <div className="sampler-visual-section">
                    <div className="sampler-visual-section-label">Trigger Mode</div>
                    <div className="sampler-visual-button-group">
                        {TRIGGER_MODES.map(mode => (
                            <button
                                key={mode.value}
                                className={`sampler-visual-option-btn ${data.triggerMode === mode.value ? 'active' : ''}`}
                                onClick={() => handleTriggerModeChange(mode.value)}
                                title={mode.description}
                            >
                                {mode.label}
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            {/* Ports section */}
            <div className="sampler-visual-ports">
                <div className="sampler-visual-ports-column inputs">
                    <div className="sampler-visual-ports-label">Inputs</div>
                    {inputPorts.map(port => (
                        <div
                            key={port.id}
                            className={`sampler-visual-port input ${hasConnection?.(port.id) ? 'connected' : ''}`}
                            data-node-id={node.id}
                            data-port-id={port.id}
                            onMouseDown={(e) => handlePortMouseDown?.(port.id, e)}
                            onMouseUp={(e) => handlePortMouseUp?.(port.id, e)}
                            onMouseEnter={() => handlePortMouseEnter?.(port.id)}
                            onMouseLeave={handlePortMouseLeave}
                            title={port.name}
                        >
                            <span className="port-name">{port.name}</span>
                        </div>
                    ))}
                </div>
                <div className="sampler-visual-ports-column outputs">
                    <div className="sampler-visual-ports-label">Outputs</div>
                    {outputPorts.map(port => (
                        <div
                            key={port.id}
                            className={`sampler-visual-port output ${hasConnection?.(port.id) ? 'connected' : ''}`}
                            data-node-id={node.id}
                            data-port-id={port.id}
                            onMouseDown={(e) => handlePortMouseDown?.(port.id, e)}
                            onMouseUp={(e) => handlePortMouseUp?.(port.id, e)}
                            onMouseEnter={() => handlePortMouseEnter?.(port.id)}
                            onMouseLeave={handlePortMouseLeave}
                            title={port.name}
                        >
                            <span className="port-name">{port.name}</span>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
});

export default SamplerVisualNode;
