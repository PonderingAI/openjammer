/**
 * Speaker Node - Audio output to device
 */

import { useCallback, useState, useEffect } from 'react';
import type { GraphNode, SpeakerNodeData } from '../../engine/types';
import { useGraphStore } from '../../store/graphStore';

interface SpeakerNodeProps {
    node: GraphNode;
}

interface AudioDevice {
    deviceId: string;
    label: string;
}

export function SpeakerNode({ node }: SpeakerNodeProps) {
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

    const volume = data.volume ?? 1;
    // const isMuted = data.isMuted ?? false;
    const currentDeviceId = data.deviceId || 'default';
    const currentLabel = devices.find(d => d.deviceId === currentDeviceId)?.label || 'Default Output';

    // Update volume
    const handleVolumeChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const newVolume = parseFloat(e.target.value);
        updateNodeData<SpeakerNodeData>(node.id, { volume: newVolume });
    }, [node.id, updateNodeData]);

    // Handle device selection
    const handleDeviceSelect = (deviceId: string) => {
        updateNodeData<SpeakerNodeData>(node.id, { deviceId });
        setShowDevices(false);
    };

    return (
        <div className="speaker-node">
            {/* Main Icon */}
            <div className="speaker-icon-display">
                <span style={{ fontSize: '48px' }}>🔊</span>
            </div>

            {/* Device Selector */}
            <div className="device-selector">
                <button
                    className="device-btn"
                    onClick={() => setShowDevices(!showDevices)}
                >
                    {currentLabel} ▼
                </button>

                {showDevices && (
                    <div className="device-dropdown">
                        <div
                            className="device-item"
                            onClick={() => handleDeviceSelect('default')}
                        >
                            Default Output
                        </div>
                        {devices.map(d => (
                            <div
                                key={d.deviceId}
                                className="device-item"
                                onClick={() => handleDeviceSelect(d.deviceId)}
                            >
                                {d.label}
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Volume Control */}
            <div className="volume-control">
                <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.01"
                    value={volume}
                    onChange={handleVolumeChange}
                    className="volume-slider"
                />
            </div>
        </div>
    );
}
