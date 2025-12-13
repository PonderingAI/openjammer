/**
 * Recorder Node - Record audio to WAV
 */

import { useState, useCallback, useRef } from 'react';
import type { GraphNode } from '../../engine/types';
import { useAudioStore } from '../../store/audioStore';

interface RecorderNodeProps {
    node: GraphNode;
}

interface Recording {
    id: string;
    blob: Blob;
    duration: number;
    timestamp: Date;
}

export function RecorderNode({ node: _node }: RecorderNodeProps) {
    const isAudioContextReady = useAudioStore((s) => s.isAudioContextReady);

    const [isRecording, setIsRecording] = useState(false);
    const [recordings, setRecordings] = useState<Recording[]>([]);
    const [recordingTime, setRecordingTime] = useState(0);
    const startTimeRef = useRef<number>(0);
    const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

    // Start recording
    const handleStartRecording = useCallback(() => {
        setIsRecording(true);
        startTimeRef.current = Date.now();

        // Update recording time
        intervalRef.current = setInterval(() => {
            setRecordingTime((Date.now() - startTimeRef.current) / 1000);
        }, 100);
    }, []);

    // Stop recording
    const handleStopRecording = useCallback(() => {
        setIsRecording(false);
        if (intervalRef.current) {
            clearInterval(intervalRef.current);
        }

        const duration = recordingTime;

        // Create dummy recording (in real implementation, this would use MediaRecorder)
        const newRecording: Recording = {
            id: `rec-${Date.now()}`,
            blob: new Blob([], { type: 'audio/wav' }),
            duration,
            timestamp: new Date()
        };

        setRecordings(prev => [...prev, newRecording]);
        setRecordingTime(0);
    }, [recordingTime]);

    // Download recording
    const handleDownload = useCallback((recording: Recording) => {
        // In real implementation, would download actual audio
        const url = URL.createObjectURL(recording.blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `recording-${recording.timestamp.toISOString().slice(0, 19)}.wav`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }, []);

    // Delete recording
    const handleDelete = useCallback((recordingId: string) => {
        setRecordings(prev => prev.filter(r => r.id !== recordingId));
    }, []);

    // Format time
    const formatTime = (seconds: number) => {
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

    return (
        <div className="recorder-node">
            {/* Recording Status */}
            <div style={{
                textAlign: 'center',
                marginBottom: '8px',
                padding: '12px',
                background: isRecording ? 'var(--accent-danger)' : 'var(--bg-tertiary)',
                borderRadius: 'var(--radius-sm)',
                transition: 'background 0.2s'
            }}>
                <div style={{
                    fontSize: '28px',
                    animation: isRecording ? 'pulse 1s infinite' : 'none'
                }}>
                    {isRecording ? '⏺' : '⏹'}
                </div>
                <div style={{
                    fontSize: '18px',
                    fontFamily: 'var(--font-mono)',
                    fontWeight: 600,
                    marginTop: '4px'
                }}>
                    {formatTime(recordingTime)}
                </div>
            </div>

            {/* Record Button */}
            <div className="node-controls">
                {!isRecording ? (
                    <button
                        className="node-btn node-btn-danger"
                        onClick={handleStartRecording}
                        disabled={!isAudioContextReady}
                        style={{ flex: 1 }}
                    >
                        ⏺ Start Recording
                    </button>
                ) : (
                    <button
                        className="node-btn node-btn-secondary"
                        onClick={handleStopRecording}
                        style={{ flex: 1 }}
                    >
                        ⏹ Stop Recording
                    </button>
                )}
            </div>

            {/* Recordings List */}
            {recordings.length > 0 && (
                <div className="loop-list" style={{ marginTop: '8px' }}>
                    {recordings.map((recording, index) => (
                        <div key={recording.id} className="loop-item">
                            <span>
                                Recording {index + 1} ({formatTime(recording.duration)})
                            </span>
                            <div className="loop-actions">
                                <button
                                    className="node-btn node-btn-primary"
                                    onClick={() => handleDownload(recording)}
                                    style={{ padding: '2px 6px', fontSize: '10px' }}
                                >
                                    💾
                                </button>
                                <button
                                    className="node-btn node-btn-danger"
                                    onClick={() => handleDelete(recording.id)}
                                    style={{ padding: '2px 6px', fontSize: '10px' }}
                                >
                                    ✕
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {recordings.length === 0 && !isRecording && (
                <div style={{
                    fontSize: '11px',
                    color: 'var(--text-muted)',
                    textAlign: 'center',
                    marginTop: '8px'
                }}>
                    Recordings will appear here
                </div>
            )}

            <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
      `}</style>
        </div>
    );
}
