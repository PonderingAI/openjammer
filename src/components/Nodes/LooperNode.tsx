/**
 * Looper Node - Record and loop audio
 * Connected to the real Looper audio class via AudioGraphManager
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import type { GraphNode, LooperNodeData } from '../../engine/types';
import { useGraphStore } from '../../store/graphStore';
import { useAudioStore } from '../../store/audioStore';
import { audioGraphManager } from '../../audio/AudioGraphManager';
import type { Loop } from '../../audio/Looper';

interface LooperNodeProps {
    node: GraphNode;
}

interface LoopState {
    id: string;
    duration: number;
    isMuted: boolean;
    isPlaying: boolean;
}

export function LooperNode({ node }: LooperNodeProps) {
    const data = node.data as LooperNodeData;
    const updateNodeData = useGraphStore((s) => s.updateNodeData);
    const isAudioContextReady = useAudioStore((s) => s.isAudioContextReady);

    const [loops, setLoops] = useState<LoopState[]>([]);
    const [isRecording, setIsRecording] = useState(false);
    const [isArmed, setIsArmed] = useState(false); // Waiting for signal
    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(data.duration || 10);
    const animationRef = useRef<number | null>(null);
    const startTimeRef = useRef<number>(0);

    // Get the Looper instance from AudioGraphManager
    const getLooper = useCallback(() => {
        return audioGraphManager.getLooper(node.id);
    }, [node.id]);

    // Set up Looper callbacks when component mounts or audio context becomes ready
    useEffect(() => {
        if (!isAudioContextReady) return;

        const looper = getLooper();
        if (!looper) return;

        // Set up callbacks
        looper.setOnLoopAdded((audioLoop: Loop) => {
            const newLoop: LoopState = {
                id: audioLoop.id,
                duration: audioLoop.buffer?.duration || duration,
                isMuted: audioLoop.isMuted,
                isPlaying: true
            };
            setLoops(prev => [...prev, newLoop]);
            setIsRecording(false);
            setIsArmed(false);
        });

        looper.setOnTimeUpdate((time: number) => {
            setCurrentTime(time);
        });

        // Sync duration
        looper.setDuration(duration);

        // Initial sync of loops from looper
        const existingLoops = looper.getLoops();
        if (existingLoops.length > 0) {
            setLoops(existingLoops.map(l => ({
                id: l.id,
                duration: l.buffer?.duration || duration,
                isMuted: l.isMuted,
                isPlaying: l.sourceNode !== null
            })));
        }

        return () => {
            // Cleanup callbacks
            looper.setOnLoopAdded(() => {});
            looper.setOnTimeUpdate(() => {});
        };
    }, [isAudioContextReady, node.id, duration, getLooper]);

    // Progress animation for when recording or playing
    useEffect(() => {
        if (!isRecording && loops.length === 0) {
            if (animationRef.current) {
                cancelAnimationFrame(animationRef.current);
            }
            return;
        }

        const looper = getLooper();
        if (!looper) {
            // Fallback to simulated progress if no looper
            const updateTime = () => {
                const elapsed = (Date.now() - startTimeRef.current) / 1000;
                setCurrentTime(elapsed % duration);
                animationRef.current = requestAnimationFrame(updateTime);
            };

            if (loops.length > 0 || isRecording) {
                startTimeRef.current = Date.now();
                updateTime();
            }
        }

        return () => {
            if (animationRef.current) {
                cancelAnimationFrame(animationRef.current);
            }
        };
    }, [isRecording, loops.length, duration, getLooper]);

    // Start recording - arms the looper to start on first signal
    const handleRecord = useCallback(async () => {
        const looper = getLooper();
        if (!looper) {
            // Fallback: simulate if no looper instance
            setIsRecording(true);
            setIsArmed(true);
            startTimeRef.current = Date.now();

            setTimeout(() => {
                setIsRecording(false);
                setIsArmed(false);
                const newLoop: LoopState = {
                    id: `loop-${Date.now()}`,
                    duration: duration,
                    isMuted: false,
                    isPlaying: true
                };
                setLoops(prev => [...prev, newLoop]);
            }, duration * 1000);
            return;
        }

        setIsArmed(true);
        await looper.startRecording();
        setIsRecording(true);
    }, [duration, getLooper]);

    // Stop recording
    const handleStopRecord = useCallback(() => {
        const looper = getLooper();
        if (looper) {
            looper.stopRecording();
        }
        setIsRecording(false);
        setIsArmed(false);
    }, [getLooper]);

    // Toggle loop mute
    const handleToggleMute = useCallback((loopId: string) => {
        const looper = getLooper();
        if (looper) {
            looper.toggleLoopMute(loopId);
        }

        setLoops(prev => prev.map(loop =>
            loop.id === loopId ? { ...loop, isMuted: !loop.isMuted } : loop
        ));
    }, [getLooper]);

    // Delete loop
    const handleDeleteLoop = useCallback((loopId: string) => {
        const looper = getLooper();
        if (looper) {
            looper.deleteLoop(loopId);
        }

        setLoops(prev => prev.filter(loop => loop.id !== loopId));
    }, [getLooper]);

    // Change duration
    const handleDurationChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const newDuration = parseFloat(e.target.value) || 10;
        setDuration(newDuration);
        updateNodeData<LooperNodeData>(node.id, { duration: newDuration });

        // Update looper duration
        const looper = getLooper();
        if (looper) {
            looper.setDuration(newDuration);
        }
    }, [node.id, updateNodeData, getLooper]);

    const progress = (currentTime / duration) * 100;

    return (
        <div className="looper-node">
            {/* Duration Setting */}
            <div className="node-row">
                <span className="node-label" style={{ marginBottom: 0 }}>Duration</span>
                <input
                    type="number"
                    className="node-input"
                    value={duration}
                    onChange={handleDurationChange}
                    min="1"
                    max="60"
                    step="1"
                    style={{ width: '60px', textAlign: 'center' }}
                    disabled={isRecording}
                />
                <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>sec</span>
            </div>

            {/* Progress Bar */}
            <div className="node-progress" style={{ marginTop: '8px' }}>
                <div
                    className="node-progress-bar"
                    style={{
                        width: `${progress}%`,
                        background: isRecording
                            ? 'var(--accent-danger)'
                            : 'linear-gradient(90deg, var(--accent-primary), var(--accent-secondary))'
                    }}
                />
            </div>
            <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                fontSize: '10px',
                color: 'var(--text-muted)',
                marginTop: '2px'
            }}>
                <span>{currentTime.toFixed(1)}s</span>
                <span>{duration}s</span>
            </div>

            {/* Status Indicator */}
            {isArmed && !isRecording && (
                <div style={{
                    fontSize: '10px',
                    color: 'var(--accent-warning)',
                    textAlign: 'center',
                    marginTop: '4px'
                }}>
                    Waiting for signal...
                </div>
            )}

            {/* Controls */}
            <div className="node-controls">
                {!isRecording && !isArmed ? (
                    <button
                        className="node-btn node-btn-danger"
                        onClick={handleRecord}
                        disabled={!isAudioContextReady}
                        style={{ flex: 1 }}
                    >
                        ⏺ Record
                    </button>
                ) : (
                    <button
                        className="node-btn node-btn-secondary"
                        onClick={handleStopRecord}
                        style={{ flex: 1 }}
                    >
                        ⏹ Stop
                    </button>
                )}
            </div>

            {/* Loops List */}
            {loops.length > 0 && (
                <div className="loop-list">
                    {loops.map((loop, index) => (
                        <div
                            key={loop.id}
                            className={`loop-item ${loop.isMuted ? 'muted' : ''}`}
                        >
                            <span>Loop {index + 1}</span>
                            <div className="loop-actions">
                                <button
                                    className={`node-btn ${loop.isMuted ? 'node-btn-secondary' : 'node-btn-success'}`}
                                    onClick={() => handleToggleMute(loop.id)}
                                    style={{ padding: '2px 6px', fontSize: '10px' }}
                                >
                                    {loop.isMuted ? '🔇' : '🔊'}
                                </button>
                                <button
                                    className="node-btn node-btn-danger"
                                    onClick={() => handleDeleteLoop(loop.id)}
                                    style={{ padding: '2px 6px', fontSize: '10px' }}
                                >
                                    ✕
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {loops.length === 0 && !isRecording && !isArmed && (
                <div style={{
                    fontSize: '11px',
                    color: 'var(--text-muted)',
                    textAlign: 'center',
                    marginTop: '8px'
                }}>
                    Press Record to start looping
                </div>
            )}
        </div>
    );
}
