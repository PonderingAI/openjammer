/**
 * Microphone Node - Live audio input
 */

import { useState, useEffect, useCallback } from 'react';
import type { GraphNode, MicrophoneNodeData } from '../../engine/types';
import { useGraphStore } from '../../store/graphStore';
import { useAudioStore } from '../../store/audioStore';
import { getAudioContext, getMasterGain } from '../../audio/AudioEngine';

interface MicrophoneNodeProps {
    node: GraphNode;
}

export function MicrophoneNode({ node }: MicrophoneNodeProps) {
    const data = node.data as MicrophoneNodeData;
    const updateNodeData = useGraphStore((s) => s.updateNodeData);
    const isAudioContextReady = useAudioStore((s) => s.isAudioContextReady);

    const [stream, setStream] = useState<MediaStream | null>(null);
    const [sourceNode, setSourceNode] = useState<MediaStreamAudioSourceNode | null>(null);
    const [gainNode, setGainNode] = useState<GainNode | null>(null);
    const [analyser, setAnalyser] = useState<AnalyserNode | null>(null);
    const [level, setLevel] = useState(0);

    // Initialize microphone
    useEffect(() => {
        if (!isAudioContextReady) return;

        let mounted = true;

        const initMicrophone = async () => {
            try {
                const mediaStream = await navigator.mediaDevices.getUserMedia({
                    audio: {
                        echoCancellation: true,
                        noiseSuppression: true,
                        autoGainControl: true
                    }
                });

                if (!mounted) {
                    mediaStream.getTracks().forEach(track => track.stop());
                    return;
                }

                const ctx = getAudioContext();
                const master = getMasterGain();
                if (!ctx || !master) return;

                const source = ctx.createMediaStreamSource(mediaStream);
                const gain = ctx.createGain();
                gain.gain.value = data.isMuted ? 0 : 1;

                source.connect(gain);
                gain.connect(master);

                // Create analyser for level meter
                const analyserNode = ctx.createAnalyser();
                analyserNode.fftSize = 256;
                source.connect(analyserNode);

                setStream(mediaStream);
                setSourceNode(source);
                setGainNode(gain);
                setAnalyser(analyserNode);
            } catch (err) {
                console.error('Failed to access microphone:', err);
            }
        };

        initMicrophone();

        return () => {
            mounted = false;
        };
    }, [isAudioContextReady, data.isMuted]);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            stream?.getTracks().forEach(track => track.stop());
            sourceNode?.disconnect();
            gainNode?.disconnect();
            analyser?.disconnect();
        };
    }, [stream, sourceNode, gainNode, analyser]);

    // Level monitoring in separate effect
    useEffect(() => {
        if (!analyser) return;

        let animationFrameId: number;
        const dataArray = new Uint8Array(analyser.frequencyBinCount);

        const updateLevel = () => {
            analyser.getByteTimeDomainData(dataArray);

            let sum = 0;
            for (let i = 0; i < dataArray.length; i++) {
                const sample = (dataArray[i] - 128) / 128;
                sum += sample * sample;
            }
            const rms = Math.sqrt(sum / dataArray.length);
            setLevel(rms);

            animationFrameId = requestAnimationFrame(updateLevel);
        };

        updateLevel();

        return () => {
            if (animationFrameId) {
                cancelAnimationFrame(animationFrameId);
            }
        };
    }, [analyser]);

    // Update gain when muted changes
    useEffect(() => {
        if (gainNode) {
            gainNode.gain.value = data.isMuted ? 0 : 1;
        }
    }, [data.isMuted, gainNode]);

    // Toggle mute
    const handleMuteToggle = useCallback(() => {
        updateNodeData<MicrophoneNodeData>(node.id, {
            isMuted: !data.isMuted
        });
    }, [node.id, data.isMuted, updateNodeData]);

    return (
        <div className="microphone-node">
            {/* Status */}
            <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                marginBottom: '8px'
            }}>
                <div style={{
                    width: '10px',
                    height: '10px',
                    borderRadius: '50%',
                    background: stream ? 'var(--accent-success)' : 'var(--accent-danger)',
                    boxShadow: stream ? '0 0 8px var(--accent-success)' : 'none'
                }} />
                <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                    {stream ? 'Connected' : 'No microphone'}
                </span>
            </div>

            {/* Level Meter */}
            <div className="node-progress">
                <div
                    className="node-progress-bar"
                    style={{
                        width: `${Math.min(level * 300, 100)}%`,
                        background: level > 0.5 ? 'var(--accent-danger)' : 'var(--accent-success)'
                    }}
                />
            </div>

            {/* Controls */}
            <div className="node-controls">
                <button
                    className={`node-btn ${data.isMuted ? 'node-btn-danger' : 'node-btn-success'}`}
                    onClick={handleMuteToggle}
                    style={{ flex: 1 }}
                >
                    {data.isMuted ? '🔇 Muted' : '🎤 Live'}
                </button>
            </div>
        </div>
    );
}
