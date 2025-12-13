/**
 * Looper Node - Record and loop audio
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import type { GraphNode, LooperNodeData } from '../../engine/types';
import { useGraphStore } from '../../store/graphStore';
import { useAudioStore } from '../../store/audioStore';

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
    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(data.duration || 10);
    const animationRef = useRef<number | null>(null);
    const startTimeRef = useRef<number>(0);

    // Simulate loop progress
    useEffect(() => {
        if (!isRecording && loops.length === 0) return;

        const updateTime = () => {
            const elapsed = (Date.now() - startTimeRef.current) / 1000;
            setCurrentTime(elapsed % duration);
            animationRef.current = requestAnimationFrame(updateTime);
        };

        if (loops.length > 0 || isRecording) {
            startTimeRef.current = Date.now();
            updateTime();
        }

        return () => {
            if (animationRef.current) {
                cancelAnimationFrame(animationRef.current);
            }
        };
    }, [isRecording, loops.length, duration]);

    // Start recording
    const handleRecord = useCallback(() => {
        setIsRecording(true);
        startTimeRef.current = Date.now();

        // Auto-stop after duration
        setTimeout(() => {
            setIsRecording(false);

            // Add new loop
            const newLoop: LoopState = {
                id: `loop-${Date.now()}`,
                duration: duration,
                isMuted: false,
                isPlaying: true
            };

            setLoops(prev => [...prev, newLoop]);
        }, duration * 1000);
    }, [duration]);

    // Stop recording
    const handleStopRecord = useCallback(() => {
        setIsRecording(false);
    }, []);

    // Toggle loop mute
    const handleToggleMute = useCallback((loopId: string) => {
        setLoops(prev => prev.map(loop =>
            loop.id === loopId ? { ...loop, isMuted: !loop.isMuted } : loop
        ));
    }, []);

    // Delete loop
    const handleDeleteLoop = useCallback((loopId: string) => {
        setLoops(prev => prev.filter(loop => loop.id !== loopId));
    }, []);

    // Change duration
    const handleDurationChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const newDuration = parseFloat(e.target.value) || 10;
        setDuration(newDuration);
        updateNodeData<LooperNodeData>(node.id, { duration: newDuration });
    }, [node.id, updateNodeData]);

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

            {/* Controls */}
            <div className="node-controls">
                {!isRecording ? (
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

            {loops.length === 0 && !isRecording && (
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
