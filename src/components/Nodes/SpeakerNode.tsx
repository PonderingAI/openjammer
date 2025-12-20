/**
 * Speaker Node - Audio output to device
 */

import { useState, useEffect } from 'react';
import type { GraphNode, SpeakerNodeData } from '../../engine/types';
import { useGraphStore } from '../../store/graphStore';
import { audioGraphManager } from '../../audio/AudioGraphManager';

interface SpeakerNodeProps {
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

interface AudioDevice {
    deviceId: string;
    label: string;
}

export function SpeakerNode({
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
}: SpeakerNodeProps) {
    const data = node.data as SpeakerNodeData;
    const updateNodeData = useGraphStore((s) => s.updateNodeData);

    const [devices, setDevices] = useState<AudioDevice[]>([]);
    const [showDevices, setShowDevices] = useState(false);
    const [supportsSinkId] = useState(() => {
        const audio = document.createElement('audio');
        return typeof (audio as any).setSinkId === 'function';
    });
    const isMuted = data.isMuted ?? false;

    // Fetch output devices
    useEffect(() => {
        if (!navigator.mediaDevices?.enumerateDevices) return;

        navigator.mediaDevices.enumerateDevices().then(devs => {
            const outputs = devs
                .filter(d => d.kind === 'audiooutput')
                .map(d => ({
                    deviceId: d.deviceId,
                    label: d.label || `Speaker ${d.deviceId.slice(0, 4)}`
                }));
            setDevices(outputs);
        });
    }, []);

    // Click outside to close device dropdown
    useEffect(() => {
        if (!showDevices) return;

        const handleClickOutside = (e: MouseEvent) => {
            const dropdown = document.querySelector('.speaker-node .device-dropdown');
            const trigger = document.querySelector('.speaker-node .device-select-trigger');
            if (dropdown && !dropdown.contains(e.target as Node) &&
                trigger && !trigger.contains(e.target as Node)) {
                setShowDevices(false);
            }
        };

        setTimeout(() => {
            document.addEventListener('mousedown', handleClickOutside);
        }, 0);

        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [showDevices]);

    const currentDeviceId = data.deviceId || 'default';
    const currentLabel = devices.find(d => d.deviceId === currentDeviceId)?.label || 'Default Output';

    // Handle device selection
    const handleDeviceSelect = (deviceId: string) => {
        updateNodeData<SpeakerNodeData>(node.id, { deviceId });
        setShowDevices(false);

        // Apply device change immediately
        audioGraphManager.updateSpeakerDevice(node.id, deviceId);
    };

    // Handle mute toggle
    const handleMuteToggle = () => {
        const newMuted = !isMuted;
        updateNodeData<SpeakerNodeData>(node.id, { isMuted: newMuted });
        // Update the actual audio node
        audioGraphManager.updateSpeakerVolume(node.id, data.volume ?? 1, newMuted);
    };

    // Get input port for the speaker
    const inputPort = node.ports.find(p => p.direction === 'input' && p.type === 'audio');

    return (
        <div
            className={`speaker-node schematic-node ${isSelected ? 'selected' : ''} ${isDragging ? 'dragging' : ''} ${isHoveredWithConnections ? 'hover-connecting' : ''}`}
            style={style}
            onMouseEnter={handleNodeMouseEnter}
            onMouseLeave={handleNodeMouseLeave}
        >
            {/* Header */}
            <div
                className="schematic-header"
                onMouseDown={handleHeaderMouseDown}
            >
                <span className="schematic-title">Speaker</span>
                {/* Warning badge if browser doesn't support setSinkId and non-default device selected */}
                {!supportsSinkId && currentDeviceId !== 'default' && (
                    <div className="speaker-warning" title="Browser doesn't support output device selection">
                        ⚠️
                    </div>
                )}
            </div>

            {/* Visual Container */}
            <div className="speaker-body">
                {/* Input Port - positioned in top left corner under header */}
                {inputPort && (
                    <div
                        className={`speaker-input-port ${hasConnection?.(inputPort.id) ? 'connected' : ''}`}
                        data-node-id={node.id}
                        data-port-id={inputPort.id}
                        data-port-type={inputPort.type}
                        onMouseDown={(e) => handlePortMouseDown?.(inputPort.id, e)}
                        onMouseUp={(e) => handlePortMouseUp?.(inputPort.id, e)}
                        onMouseEnter={() => handlePortMouseEnter?.(inputPort.id)}
                        onMouseLeave={handlePortMouseLeave}
                        title={inputPort.name}
                    />
                )}

                {/* Speaker Symbol with Mute Button */}
                <div className="speaker-symbol-container">
                    <button
                        className={`speaker-mute-btn ${isMuted ? 'muted' : 'live'}`}
                        onClick={handleMuteToggle}
                        title={isMuted ? 'Unmute' : 'Mute'}
                    >
                        <svg viewBox="0 0 24 24" fill="currentColor" width="32" height="32">
                            {isMuted ? (
                                <path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z" />
                            ) : (
                                <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z" />
                            )}
                        </svg>
                    </button>
                </div>

                {/* Output Device Selector */}
                <div className="device-selector-container">
                    <button
                        className="device-select-trigger"
                        onClick={(e) => {
                            e.stopPropagation();
                            setShowDevices(!showDevices);
                        }}
                    >
                        {currentLabel}
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
                                Default Output
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
            </div>
        </div>
    );
}
