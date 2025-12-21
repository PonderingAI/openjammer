/**
 * MIDI Device Browser - Full-screen modal for selecting MIDI devices/presets
 *
 * Features:
 * - Search/filter by device name or manufacturer
 * - Card grid layout for device presets
 * - "Generic Device" option always visible
 * - ESC to close
 */

import { useCallback, useMemo } from 'react';
import { useMIDIStore } from '../../store/midiStore';
import { getPresetRegistry } from '../../midi';
import { MIDIDeviceCard } from './MIDIDeviceCard';
import './MIDIDeviceBrowser.css';

interface MIDIDeviceBrowserProps {
    onSelectDevice: (deviceId: string | null, presetId: string) => void;
}

export function MIDIDeviceBrowser({ onSelectDevice }: MIDIDeviceBrowserProps) {
    const isOpen = useMIDIStore((s) => s.isBrowserOpen);
    const searchQuery = useMIDIStore((s) => s.browserSearchQuery);
    const setSearchQuery = useMIDIStore((s) => s.setSearchQuery);
    const closeBrowser = useMIDIStore((s) => s.closeBrowser);
    const inputs = useMIDIStore((s) => s.inputs);

    // Get all presets
    const registry = getPresetRegistry();
    const allPresets = useMemo(() => registry.getAllPresets(), []);

    // Filter presets based on search query
    const filteredPresets = useMemo(() => {
        if (!searchQuery.trim()) return allPresets;

        const query = searchQuery.toLowerCase();
        return allPresets.filter(
            (preset) =>
                preset.name.toLowerCase().includes(query) ||
                preset.manufacturer.toLowerCase().includes(query)
        );
    }, [allPresets, searchQuery]);

    // Get connected devices with matched presets
    const connectedDevices = useMemo(() => {
        const devices: Array<{
            deviceId: string;
            name: string;
            presetId: string;
            isConnected: boolean;
        }> = [];

        inputs.forEach((device) => {
            const matchedPreset = registry.matchDevice(device.name);
            devices.push({
                deviceId: device.id,
                name: device.name,
                presetId: matchedPreset?.id || 'generic',
                isConnected: device.state === 'connected'
            });
        });

        return devices;
    }, [inputs]);

    // Handle selecting a preset
    const handleSelectPreset = useCallback(
        (presetId: string, deviceId: string | null = null) => {
            onSelectDevice(deviceId, presetId);
            closeBrowser();
        },
        [onSelectDevice, closeBrowser]
    );

    // Handle selecting a connected device
    const handleSelectDevice = useCallback(
        (deviceId: string, presetId: string) => {
            onSelectDevice(deviceId, presetId);
            closeBrowser();
        },
        [onSelectDevice, closeBrowser]
    );

    // Handle keyboard shortcuts
    const handleKeyDown = useCallback(
        (e: React.KeyboardEvent) => {
            if (e.key === 'Escape') {
                closeBrowser();
            }
        },
        [closeBrowser]
    );

    // Handle backdrop click
    const handleBackdropClick = useCallback(
        (e: React.MouseEvent) => {
            if (e.target === e.currentTarget) {
                closeBrowser();
            }
        },
        [closeBrowser]
    );

    if (!isOpen) return null;

    return (
        <div
            className="midi-browser-overlay"
            onClick={handleBackdropClick}
            onKeyDown={handleKeyDown}
            tabIndex={-1}
        >
            <div className="midi-browser-container">
                {/* Header */}
                <div className="midi-browser-header">
                    <h2>Select MIDI Device</h2>
                    <button
                        className="midi-browser-close"
                        onClick={closeBrowser}
                        title="Close (ESC)"
                    >
                        &times;
                    </button>
                </div>

                {/* Search bar */}
                <div className="midi-browser-search">
                    <input
                        type="text"
                        placeholder="Search devices..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        autoFocus
                    />
                </div>

                {/* Connected Devices Section */}
                {connectedDevices.length > 0 && (
                    <div className="midi-browser-section">
                        <h3>Connected Devices</h3>
                        <div className="midi-device-grid">
                            {connectedDevices.map((device) => (
                                <MIDIDeviceCard
                                    key={device.deviceId}
                                    name={device.name}
                                    presetId={device.presetId}
                                    isConnected={device.isConnected}
                                    onClick={() =>
                                        handleSelectDevice(device.deviceId, device.presetId)
                                    }
                                />
                            ))}
                        </div>
                    </div>
                )}

                {/* All Presets Section */}
                <div className="midi-browser-section">
                    <h3>Device Presets</h3>
                    <div className="midi-device-grid">
                        {filteredPresets.map((preset) => (
                            <MIDIDeviceCard
                                key={preset.id}
                                name={preset.name}
                                presetId={preset.id}
                                manufacturer={preset.manufacturer}
                                isConnected={false}
                                onClick={() => handleSelectPreset(preset.id)}
                            />
                        ))}
                    </div>
                    {filteredPresets.length === 0 && (
                        <div className="midi-browser-empty">
                            No presets match your search
                        </div>
                    )}
                </div>

                {/* Footer hint */}
                <div className="midi-browser-footer">
                    <span>Press ESC to close</span>
                </div>
            </div>
        </div>
    );
}
