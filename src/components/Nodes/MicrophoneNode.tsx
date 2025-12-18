/**
 * Microphone Node - Live audio input (Schematic Style)
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import type { GraphNode, MicrophoneNodeData } from '../../engine/types';
import { useGraphStore } from '../../store/graphStore';
import { useAudioStore } from '../../store/audioStore';
import { getAudioContext } from '../../audio/AudioEngine';
import { audioGraphManager } from '../../audio/AudioGraphManager';

interface MicrophoneNodeProps {
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

interface AudioDevice {
    deviceId: string;
    label: string;
}

const NUM_WAVEFORM_BARS = 16;

export function MicrophoneNode({
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
}: MicrophoneNodeProps) {
    const data = node.data as MicrophoneNodeData;
    const updateNodeData = useGraphStore((s) => s.updateNodeData);
    const isAudioContextReady = useAudioStore((s) => s.isAudioContextReady);

    const [stream, setStream] = useState<MediaStream | null>(null);
    const [, setSourceNode] = useState<MediaStreamAudioSourceNode | null>(null);
    const [gainNode, setGainNode] = useState<GainNode | null>(null);
    const [analyserNode, setAnalyserNode] = useState<AnalyserNode | null>(null);
    const [waveformBars, setWaveformBars] = useState<number[]>(Array(NUM_WAVEFORM_BARS).fill(0));
    const [devices, setDevices] = useState<AudioDevice[]>([]);
    const [showDevices, setShowDevices] = useState(false);
    const [selectedDeviceId, setSelectedDeviceId] = useState<string>(data.deviceId || 'default');

    const animationRef = useRef<number | null>(null);

    // Use refs for cleanup to avoid stale closures
    const streamRef = useRef<MediaStream | null>(null);
    const sourceNodeRef = useRef<MediaStreamAudioSourceNode | null>(null);
    const gainNodeRef = useRef<GainNode | null>(null);
    const analyserNodeRef = useRef<AnalyserNode | null>(null);

    // Get output port
    const outputPort = node.ports.find(p => p.direction === 'output' && p.type === 'audio');
    const outputPortId = outputPort?.id || 'audio-out';

    // Fetch input devices
    useEffect(() => {
        if (!navigator.mediaDevices?.enumerateDevices) return;

        navigator.mediaDevices.enumerateDevices().then(devs => {
            const inputs = devs
                .filter(d => d.kind === 'audioinput')
                .map(d => ({
                    deviceId: d.deviceId,
                    label: d.label || `Microphone ${d.deviceId.slice(0, 4)}`
                }));
            setDevices(inputs);
        });
    }, []);

    // Click outside to close device dropdown
    useEffect(() => {
        if (!showDevices) return;

        const handleClickOutside = (e: MouseEvent) => {
            const dropdown = document.querySelector('.mic-device-selector .device-dropdown');
            const button = document.querySelector('.mic-device-selector .mic-source-btn');
            if (dropdown && !dropdown.contains(e.target as Node) &&
                button && !button.contains(e.target as Node)) {
                setShowDevices(false);
            }
        };

        setTimeout(() => {
            document.addEventListener('mousedown', handleClickOutside);
        }, 0);

        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [showDevices]);

    // Initialize microphone
    const initMicrophone = useCallback(async (deviceId?: string) => {
        if (!isAudioContextReady) return;

        // Clean up existing resources using refs (avoids stale closures)
        if (streamRef.current) {
            streamRef.current.getTracks().forEach(track => track.stop());
        }
        if (sourceNodeRef.current) {
            sourceNodeRef.current.disconnect();
        }
        if (gainNodeRef.current) {
            gainNodeRef.current.disconnect();
        }
        if (analyserNodeRef.current) {
            analyserNodeRef.current.disconnect();
        }

        try {
            const mediaStream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    deviceId: deviceId && deviceId !== 'default' ? { exact: deviceId } : undefined,
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true
                }
            });

            const ctx = getAudioContext();
            if (!ctx) return;

            const source = ctx.createMediaStreamSource(mediaStream);
            const gain = ctx.createGain();
            gain.gain.value = data.isMuted ? 0 : 1;

            // Create analyser for waveform (after gain so it reflects mute state)
            const analyser = ctx.createAnalyser();
            analyser.fftSize = 64;

            // Connect: source -> gain -> analyser
            // Analyser is after gain so waveform shows 0 when muted
            source.connect(gain);
            gain.connect(analyser);

            // Register the analyser as output (it passes audio through)
            // This way the waveform reflects what's actually being sent out
            audioGraphManager.setMicrophoneOutput(node.id, analyser as unknown as GainNode);

            // Update refs for cleanup
            streamRef.current = mediaStream;
            sourceNodeRef.current = source;
            gainNodeRef.current = gain;
            analyserNodeRef.current = analyser;

            // Update state for rendering
            setStream(mediaStream);
            setSourceNode(source);
            setGainNode(gain);
            setAnalyserNode(analyser);
        } catch (err) {
            console.error('Failed to access microphone:', err);
        }
    }, [isAudioContextReady, node.id, data.isMuted]);

    // Initialize on mount
    useEffect(() => {
        if (isAudioContextReady && !streamRef.current) {
            initMicrophone(selectedDeviceId);
        }
    }, [isAudioContextReady, initMicrophone, selectedDeviceId]);

    // Cleanup on unmount (separate effect with refs to avoid stale closures)
    useEffect(() => {
        return () => {
            if (animationRef.current) {
                cancelAnimationFrame(animationRef.current);
            }
            if (streamRef.current) {
                streamRef.current.getTracks().forEach(track => track.stop());
            }
            if (sourceNodeRef.current) {
                sourceNodeRef.current.disconnect();
            }
            if (gainNodeRef.current) {
                gainNodeRef.current.disconnect();
            }
            if (analyserNodeRef.current) {
                analyserNodeRef.current.disconnect();
            }
        };
    }, []);

    // Update waveform
    useEffect(() => {
        if (!analyserNode) return;

        const dataArray = new Uint8Array(analyserNode.frequencyBinCount);

        const updateWaveform = () => {
            // Skip updates when document is hidden (performance optimization)
            if (!document.hidden) {
                analyserNode.getByteFrequencyData(dataArray);

                // Sample bars from frequency data
                const bars: number[] = [];
                const step = Math.floor(dataArray.length / NUM_WAVEFORM_BARS);
                for (let i = 0; i < NUM_WAVEFORM_BARS; i++) {
                    const value = dataArray[i * step] / 255;
                    bars.push(value);
                }
                setWaveformBars(bars);
            }

            animationRef.current = requestAnimationFrame(updateWaveform);
        };

        updateWaveform();

        return () => {
            if (animationRef.current) {
                cancelAnimationFrame(animationRef.current);
            }
        };
    }, [analyserNode]);

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

    // Handle device selection
    const handleDeviceSelect = useCallback((deviceId: string) => {
        setSelectedDeviceId(deviceId);
        updateNodeData<MicrophoneNodeData>(node.id, { deviceId });
        setShowDevices(false);
        initMicrophone(deviceId);
    }, [node.id, updateNodeData, initMicrophone]);

    const currentLabel = devices.find(d => d.deviceId === selectedDeviceId)?.label || 'Select source';

    return (
        <div
            className={`schematic-node microphone-node ${isSelected ? 'selected' : ''} ${isDragging ? 'dragging' : ''}`}
            style={style}
            onMouseEnter={handleNodeMouseEnter}
            onMouseLeave={handleNodeMouseLeave}
        >
            {/* Header */}
            <div className="schematic-header" onMouseDown={handleHeaderMouseDown}>
                <span className="schematic-title">Microphone</span>
            </div>

            {/* Content Container */}
            <div className="mic-content">
                {/* Top row: Mute button + Source selector */}
                <div className="mic-controls-row">
                    {/* Mute Button */}
                    <button
                        className={`mic-mute-btn ${data.isMuted ? 'muted' : 'live'}`}
                        onClick={handleMuteToggle}
                        disabled={!stream}
                    >
                        <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20">
                            <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z" />
                        </svg>
                    </button>

                    {/* Device Selector */}
                    <div className="mic-device-selector">
                        <button
                            className="mic-source-btn"
                            onClick={(e) => {
                                e.stopPropagation();
                                setShowDevices(!showDevices);
                            }}
                            title={currentLabel}
                        >
                            <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20">
                                <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm-1-9c0-.55.45-1 1-1s1 .45 1 1v6c0 .55-.45 1-1 1s-1-.45-1-1V5z"/>
                                <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/>
                            </svg>
                        </button>

                        {showDevices && (
                            <div
                                className="device-dropdown schematic-dropdown"
                                onWheel={(e) => e.stopPropagation()}
                            >
                                <div
                                    className="device-item"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        handleDeviceSelect('default');
                                    }}
                                >
                                    Default Input
                                </div>
                                {devices.map(d => (
                                    <div
                                        key={d.deviceId}
                                        className="device-item"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            handleDeviceSelect(d.deviceId);
                                        }}
                                    >
                                        {d.label}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Output Port */}
                    <div
                        className={`mic-output-port ${hasConnection(outputPortId) ? 'connected' : ''}`}
                        data-node-id={node.id}
                        data-port-id={outputPortId}
                        onMouseDown={(e) => handlePortMouseDown?.(outputPortId, e)}
                        onMouseUp={(e) => handlePortMouseUp?.(outputPortId, e)}
                        onMouseEnter={() => handlePortMouseEnter?.(outputPortId)}
                        onMouseLeave={handlePortMouseLeave}
                    />
                </div>

                {/* Waveform Line */}
                <svg className="mic-waveform-line" viewBox="0 0 100 20" preserveAspectRatio="none">
                    <polyline
                        className="mic-waveform-path"
                        fill="none"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        points={waveformBars.map((v, i) => `${(i / (NUM_WAVEFORM_BARS - 1)) * 100},${10 - v * 8}`).join(' ')}
                    />
                </svg>
            </div>
        </div>
    );
}
