/**
 * MIDI Auto-Detect Toast - Popup notification when MIDI device is connected
 *
 * Appears in top-left corner with options to:
 * - Add the detected device directly
 * - Open the full device browser
 * - Dismiss
 */

import { useCallback } from 'react';
import { useMIDIStore } from '../../store/midiStore';
import './MIDIAutoDetectToast.css';

interface MIDIAutoDetectToastProps {
    onAddDevice: (deviceId: string, presetId: string) => void;
}

export function MIDIAutoDetectToast({ onAddDevice }: MIDIAutoDetectToastProps) {
    const pendingDevice = useMIDIStore((s) => s.pendingDevice);
    const detectedPreset = useMIDIStore((s) => s.detectedPreset);
    const dismissPendingDevice = useMIDIStore((s) => s.dismissPendingDevice);
    const openBrowser = useMIDIStore((s) => s.openBrowser);

    // Handle adding the device
    const handleAdd = useCallback(() => {
        if (pendingDevice) {
            const presetId = detectedPreset?.id || 'generic';
            onAddDevice(pendingDevice.id, presetId);
            dismissPendingDevice();
        }
    }, [pendingDevice, detectedPreset, onAddDevice, dismissPendingDevice]);

    // Handle opening browser
    const handleBrowse = useCallback(() => {
        dismissPendingDevice();
        openBrowser();
    }, [dismissPendingDevice, openBrowser]);

    // Handle dismiss
    const handleDismiss = useCallback(() => {
        dismissPendingDevice();
    }, [dismissPendingDevice]);

    if (!pendingDevice) return null;

    const presetName = detectedPreset?.name || 'Generic MIDI Device';
    const deviceName = pendingDevice.name;

    return (
        <div className="midi-toast">
            <div className="midi-toast-content">
                {/* Icon */}
                <div className="midi-toast-icon">
                    {'\u{1F3B9}'}
                </div>

                {/* Text */}
                <div className="midi-toast-text">
                    <span className="midi-toast-title">MIDI Device Detected</span>
                    <span className="midi-toast-device">{deviceName}</span>
                    {detectedPreset && (
                        <span className="midi-toast-preset">
                            Preset: {presetName}
                        </span>
                    )}
                </div>
            </div>

            {/* Actions */}
            <div className="midi-toast-actions">
                <button
                    className="midi-toast-btn midi-toast-btn-primary"
                    onClick={handleAdd}
                    title="Add this device to the canvas"
                >
                    Add {detectedPreset ? presetName : 'Device'}
                </button>
                <button
                    className="midi-toast-btn midi-toast-btn-secondary"
                    onClick={handleBrowse}
                    title="Browse all MIDI presets"
                >
                    Browse
                </button>
                <button
                    className="midi-toast-btn midi-toast-btn-dismiss"
                    onClick={handleDismiss}
                    title="Dismiss"
                >
                    &times;
                </button>
            </div>
        </div>
    );
}
