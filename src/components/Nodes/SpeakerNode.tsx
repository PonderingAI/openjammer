/**
 * Speaker Node - Audio output to device
 */

import { useState, useEffect } from 'react';
import type { GraphNode, SpeakerNodeData } from '../../engine/types';
import { useGraphStore } from '../../store/graphStore';

interface SpeakerNodeProps {
    node: GraphNode;
    handlePortClick?: (portId: string, e: React.MouseEvent) => void;
    hasConnection?: (portId: string) => boolean;
    handleHeaderMouseDown?: (e: React.MouseEvent) => void;
    isSelected?: boolean;
    isDragging?: boolean;
    style?: React.CSSProperties;
}

interface AudioDevice {
    deviceId: string;
    label: string;
}

export function SpeakerNode({ node, handlePortClick, hasConnection, handleHeaderMouseDown, isSelected, isDragging, style }: SpeakerNodeProps) {
    const data = node.data as SpeakerNodeData;
    const updateNodeData = useGraphStore((s) => s.updateNodeData);

    const [devices, setDevices] = useState<AudioDevice[]>([]);
    const [showDevices, setShowDevices] = useState(false);

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

    const currentDeviceId = data.deviceId || 'default';
    const currentLabel = devices.find(d => d.deviceId === currentDeviceId)?.label || 'output device';

    // Handle device selection
    const handleDeviceSelect = (deviceId: string) => {
        updateNodeData<SpeakerNodeData>(node.id, { deviceId });
        setShowDevices(false);
    };

    // Get input port for the speaker
    const inputPort = node.ports.find(p => p.direction === 'input' && p.type === 'audio');

    return (
        <div
            className={`speaker-node schematic-node ${isSelected ? 'selected' : ''} ${isDragging ? 'dragging' : ''}`}
            style={style}
        >
            {/* Header */}
            <div
                className="schematic-header"
                onMouseDown={handleHeaderMouseDown}
            >
                <span className="schematic-title">Speaker</span>
            </div>

            {/* Visual Container */}
            <div className="schematic-container">
                {/* Input Port */}
                {inputPort && (
                    <div
                        className={`speaker-input-port ${hasConnection?.(inputPort.id) ? 'connected' : ''}`}
                        data-node-id={node.id}
                        data-port-id={inputPort.id}
                        onClick={(e) => handlePortClick?.(inputPort.id, e)}
                        title={inputPort.name}
                    />
                )}

                {/* Speaker Symbol */}
                <div className="speaker-symbol">
                    <svg viewBox="0 0 24 24" fill="currentColor" width="48" height="48">
                        <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z" />
                    </svg>
                </div>
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
                    <div className="device-dropdown schematic-dropdown">
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
    );
}
