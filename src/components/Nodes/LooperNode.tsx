/**
 * Looper Node - Record and loop audio (Schematic Style)
 *
 * Compact horizontal layout with inline ports, waveform visualization,
 * and a minimal record button.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import type { GraphNode, LooperNodeData } from '../../engine/types';
import { useGraphStore } from '../../store/graphStore';
import { useAudioStore } from '../../store/audioStore';
import { audioGraphManager } from '../../audio/AudioGraphManager';
import type { Loop } from '../../audio/Looper';

interface LooperNodeProps {
    node: GraphNode;
    handlePortMouseDown?: (portId: string, e: React.MouseEvent) => void;
    handlePortMouseUp?: (portId: string, e: React.MouseEvent) => void;
    handlePortMouseEnter?: (portId: string) => void;
    handlePortMouseLeave?: () => void;
    hasConnection: (portId: string) => boolean;
    handleHeaderMouseDown: (e: React.MouseEvent) => void;
    handleNodeMouseEnter: () => void;
    handleNodeMouseLeave: () => void;
    isSelected: boolean;
    isDragging: boolean;
    isHoveredWithConnections: boolean;
    incomingConnectionCount: number;
    style: React.CSSProperties;
}

interface LoopState {
    id: string;
    waveformData: number[];  // The recorded waveform shape
    isMuted: boolean;
}

export function LooperNode({
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
}: LooperNodeProps) {
    const data = node.data as LooperNodeData;
    const updateNodeData = useGraphStore((s) => s.updateNodeData);
    const isAudioContextReady = useAudioStore((s) => s.isAudioContextReady);

    const [loops, setLoops] = useState<LoopState[]>([]);
    const [isRecording, setIsRecording] = useState(false);
    const [duration, setDuration] = useState(data.duration || 10);
    const [isEditingDuration, setIsEditingDuration] = useState(false);
    const [editValue, setEditValue] = useState('');

    // Active recording waveform
    const [waveformHistory, setWaveformHistory] = useState<number[]>([]);
    const [playheadPosition, setPlayheadPosition] = useState(0);
    const [currentLevel, setCurrentLevel] = useState(0); // For infinite mode bouncing line

    // Ref for auto-scrolling loops list
    const loopsContainerRef = useRef<HTMLDivElement>(null);

    // Get port IDs from node.ports
    const inputPort = node.ports.find(p => p.direction === 'input' && p.type === 'audio');
    const outputPort = node.ports.find(p => p.direction === 'output' && p.type === 'audio');
    const inputPortId = inputPort?.id || 'audio-in';
    const outputPortId = outputPort?.id || 'audio-out';

    // Get the Looper instance from AudioGraphManager
    const getLooper = useCallback(() => {
        return audioGraphManager.getLooper(node.id);
    }, [node.id]);

    // Set up Looper callbacks when component mounts or audio context becomes ready
    useEffect(() => {
        if (!isAudioContextReady) return;

        let looper = getLooper();
        let pollIntervalId: number | null = null;
        let isSetup = false;

        const setupCallbacks = (l: ReturnType<typeof getLooper>) => {
            if (!l || isSetup) return;
            isSetup = true;

            l.setOnLoopAdded((audioLoop: Loop) => {
                const newLoop: LoopState = {
                    id: audioLoop.id,
                    waveformData: audioLoop.waveformData || [],
                    isMuted: audioLoop.isMuted
                };
                setLoops(prev => [...prev, newLoop]);
                // Reset active waveform history for next recording
                setWaveformHistory([]);
                setPlayheadPosition(0);
            });

            l.setOnWaveformHistoryUpdate((history: number[], playhead: number) => {
                setWaveformHistory(history);
                setPlayheadPosition(playhead);
                // Track current level for infinite mode visualization
                if (history.length > 0) {
                    setCurrentLevel(history[history.length - 1]);
                }
            });

            l.setDuration(duration);

            const existingLoops = l.getLoops();
            if (existingLoops.length > 0) {
                setLoops(existingLoops.map(loop => ({
                    id: loop.id,
                    waveformData: loop.waveformData || [],
                    isMuted: loop.isMuted
                })));
            }
        };

        // If looper is available, set up immediately
        if (looper) {
            setupCallbacks(looper);
        } else {
            // Poll for looper availability (created by AudioGraphManager)
            pollIntervalId = window.setInterval(() => {
                looper = getLooper();
                if (looper) {
                    setupCallbacks(looper);
                    if (pollIntervalId !== null) {
                        clearInterval(pollIntervalId);
                        pollIntervalId = null;
                    }
                }
            }, 100);
        }

        return () => {
            if (pollIntervalId !== null) {
                clearInterval(pollIntervalId);
            }
            const l = getLooper();
            if (l) {
                l.setOnLoopAdded(() => {});
                l.setOnWaveformHistoryUpdate(() => {});
            }
        };
    }, [isAudioContextReady, node.id, duration, getLooper]);

    // Auto-scroll to show newest loops when new loop is added
    useEffect(() => {
        if (loopsContainerRef.current && loops.length > 0) {
            // With column-reverse, scroll to top to see newest
            loopsContainerRef.current.scrollTop = 0;
        }
    }, [loops.length]);

    const handleRecord = useCallback(async () => {
        const looper = getLooper();
        if (!looper) {
            console.warn('No looper instance available');
            return;
        }

        await looper.startRecording();
        setIsRecording(true);
    }, [getLooper]);

    const handleStopRecord = useCallback(() => {
        const looper = getLooper();
        if (looper) {
            looper.stopRecording();
        }
        setIsRecording(false);
    }, [getLooper]);

    const handleToggleMute = useCallback((loopId: string) => {
        const looper = getLooper();
        if (looper) {
            looper.toggleLoopMute(loopId);
        }
        setLoops(prev => prev.map(loop =>
            loop.id === loopId ? { ...loop, isMuted: !loop.isMuted } : loop
        ));
    }, [getLooper]);

    const handleDeleteLoop = useCallback((loopId: string) => {
        const looper = getLooper();
        if (looper) {
            looper.deleteLoop(loopId);
        }
        setLoops(prev => prev.filter(loop => loop.id !== loopId));
    }, [getLooper]);

    // Use Infinity (stored as 9999) for unlimited duration
    const INFINITE_DURATION = 9999;
    const isInfinite = duration >= INFINITE_DURATION;

    const handleDurationChange = useCallback((newDuration: number) => {
        let finalDuration: number;
        if (newDuration > 60) {
            finalDuration = INFINITE_DURATION;
        } else {
            finalDuration = Math.max(1, newDuration);
        }
        setDuration(finalDuration);
        updateNodeData<LooperNodeData>(node.id, { duration: finalDuration });

        const looper = getLooper();
        if (looper) {
            looper.setDuration(finalDuration);
        }
    }, [node.id, updateNodeData, getLooper]);

    const handleDurationWheel = useCallback((e: React.WheelEvent) => {
        if (isRecording || isEditingDuration) return;
        e.stopPropagation();
        e.preventDefault();
        const scrollingUp = e.deltaY < 0;

        if (isInfinite && !scrollingUp) {
            // Scrolling down from infinite goes to 60
            handleDurationChange(60);
        } else if (duration === 60 && scrollingUp) {
            // Scrolling up from 60 goes to infinite
            handleDurationChange(61); // Will be converted to INFINITE_DURATION
        } else if (!isInfinite) {
            const delta = scrollingUp ? 1 : -1;
            handleDurationChange(duration + delta);
        }
    }, [duration, isInfinite, isRecording, isEditingDuration, handleDurationChange]);

    const handleDurationClick = useCallback((e: React.MouseEvent) => {
        if (isRecording) return;
        e.stopPropagation();
        setEditValue(isInfinite ? '' : String(duration));
        setIsEditingDuration(true);
    }, [isRecording, duration, isInfinite]);

    const handleDurationBlur = useCallback(() => {
        const newDuration = parseInt(editValue, 10);
        if (!isNaN(newDuration) && newDuration > 0) {
            handleDurationChange(newDuration);
        } else if (editValue === '' && isInfinite) {
            // Keep infinite if input was cleared while infinite
        } else if (editValue === '') {
            // Empty input defaults to 10
            handleDurationChange(10);
        }
        setIsEditingDuration(false);
    }, [editValue, isInfinite, handleDurationChange]);

    const handleDurationKeyDown = useCallback((e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            handleDurationBlur();
        } else if (e.key === 'Escape') {
            setIsEditingDuration(false);
        }
    }, [handleDurationBlur]);

    return (
        <div
            className={`schematic-node looper-node ${isSelected ? 'selected' : ''} ${isDragging ? 'dragging' : ''}`}
            style={style}
            onMouseEnter={handleNodeMouseEnter}
            onMouseLeave={handleNodeMouseLeave}
        >
            {/* Header - only "Looper" text */}
            <div className="schematic-header" onMouseDown={handleHeaderMouseDown}>
                <span>Looper</span>
            </div>

            {/* Main row: Audio In - Duration - Audio Out */}
            <div className="looper-main-row">
                <div
                    className={`looper-input-port ${hasConnection(inputPortId) ? 'connected' : ''}`}
                    onMouseDown={(e) => handlePortMouseDown?.(inputPortId, e)}
                    onMouseUp={(e) => handlePortMouseUp?.(inputPortId, e)}
                    onMouseEnter={() => handlePortMouseEnter?.(inputPortId)}
                    onMouseLeave={handlePortMouseLeave}
                    data-node-id={node.id}
                    data-port-id={inputPortId}
                />
                <div className="looper-duration-container">
                    {isEditingDuration ? (
                        <input
                            className="looper-duration-input"
                            type="number"
                            min="1"
                            max="60"
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            onBlur={handleDurationBlur}
                            onKeyDown={handleDurationKeyDown}
                            autoFocus
                        />
                    ) : (
                        <span
                            className={`looper-duration editable-value ${isRecording ? 'disabled' : ''}`}
                            onClick={handleDurationClick}
                            onWheel={handleDurationWheel}
                            title="Click to edit, scroll to adjust"
                        >
                            {isInfinite ? '∞' : duration}
                        </span>
                    )}
                    {!isInfinite && <span className="looper-duration-unit">s</span>}
                </div>
                <div
                    className={`looper-output-port ${hasConnection(outputPortId) ? 'connected' : ''}`}
                    onMouseDown={(e) => handlePortMouseDown?.(outputPortId, e)}
                    onMouseUp={(e) => handlePortMouseUp?.(outputPortId, e)}
                    onMouseEnter={() => handlePortMouseEnter?.(outputPortId)}
                    onMouseLeave={handlePortMouseLeave}
                    data-node-id={node.id}
                    data-port-id={outputPortId}
                />
            </div>

            {/* Active recording waveform with playhead */}
            {isRecording && (
                <div className="looper-active-waveform">
                    <svg viewBox="0 0 100 20" preserveAspectRatio="none">
                        {isInfinite ? (
                            /* Infinite mode: bouncing horizontal line */
                            <line
                                x1="0"
                                y1={10 - currentLevel * 8}
                                x2="100"
                                y2={10 - currentLevel * 8}
                                className="looper-waveform-path recording"
                                strokeWidth="2"
                            />
                        ) : (
                            <>
                                {/* Waveform line building up */}
                                {waveformHistory.length > 1 && (
                                    <polyline
                                        className="looper-waveform-path recording"
                                        fill="none"
                                        strokeWidth="2"
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        points={waveformHistory.map((v, i) =>
                                            `${(i / (waveformHistory.length - 1)) * playheadPosition},${10 - v * 8}`
                                        ).join(' ')}
                                    />
                                )}
                                {/* Playhead vertical line */}
                                <line
                                    x1={playheadPosition}
                                    y1="0"
                                    x2={playheadPosition}
                                    y2="20"
                                    className="looper-playhead"
                                />
                            </>
                        )}
                    </svg>
                </div>
            )}

            {/* Completed loops as line waveforms */}
            {loops.length > 0 && (
                <div
                    className="looper-loops"
                    ref={loopsContainerRef}
                    onWheel={(e) => e.stopPropagation()}
                >
                    {loops.map((loop) => (
                        <div key={loop.id} className={`looper-loop-item ${loop.isMuted ? 'muted' : ''}`}>
                            <svg viewBox="0 0 100 20" preserveAspectRatio="none">
                                {loop.waveformData.length > 1 ? (
                                    <polyline
                                        className="looper-waveform-path"
                                        fill="none"
                                        strokeWidth="2"
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        points={loop.waveformData.map((v, i) =>
                                            `${(i / (loop.waveformData.length - 1)) * 100},${10 - v * 8}`
                                        ).join(' ')}
                                    />
                                ) : (
                                    <line x1="0" y1="10" x2="100" y2="10" className="looper-waveform-path" />
                                )}
                            </svg>
                            <div className="looper-loop-controls">
                                <button
                                    className={`looper-loop-btn ${loop.isMuted ? 'muted' : ''}`}
                                    onClick={() => handleToggleMute(loop.id)}
                                    title={loop.isMuted ? 'Unmute' : 'Mute'}
                                >
                                    <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14">
                                        {loop.isMuted ? (
                                            <path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z"/>
                                        ) : (
                                            <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/>
                                        )}
                                    </svg>
                                </button>
                                <button
                                    className="looper-loop-btn delete"
                                    onClick={() => handleDeleteLoop(loop.id)}
                                    title="Delete"
                                >
                                    <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14">
                                        <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
                                    </svg>
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Record button - centered red circle with white center */}
            <div className="looper-record-container">
                <button
                    className={`looper-record-btn ${isRecording ? 'recording' : ''}`}
                    onClick={isRecording ? handleStopRecord : handleRecord}
                    disabled={!isAudioContextReady}
                />
            </div>
        </div>
    );
}
