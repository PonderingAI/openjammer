/**
 * MIDI Auto-Detect Toast - Popup notification when MIDI device is connected
 *
 * Appears in top-left corner with options to:
 * - Add the detected device directly
 * - Open the full device browser (More button)
 * - Dismiss
 *
 * Shows the auto-generated name that will be assigned (e.g., "MiniLab 3", "MiniLab 3 2")
 */

import { useCallback, useEffect, useRef, useState, useMemo } from 'react';
import { useMIDIStore } from '../../store/midiStore';
import './MIDIAutoDetectToast.css';

interface MIDIAutoDetectToastProps {
    onAddDevice: (deviceId: string, presetId: string) => void;
}

/** Auto-dismiss timeout in seconds */
const AUTO_DISMISS_SECONDS = 10;

export function MIDIAutoDetectToast({ onAddDevice }: MIDIAutoDetectToastProps) {
    const pendingDevice = useMIDIStore((s) => s.pendingDevice);
    const detectedPreset = useMIDIStore((s) => s.detectedPreset);
    const dismissPendingDevice = useMIDIStore((s) => s.dismissPendingDevice);
    const openBrowser = useMIDIStore((s) => s.openBrowser);
    const usedDeviceNames = useMIDIStore((s) => s.usedDeviceNames);
    const deviceSignatures = useMIDIStore((s) => s.deviceSignatures);

    // Countdown for auto-dismiss
    const [countdown, setCountdown] = useState(AUTO_DISMISS_SECONDS);

    // Track which device the countdown is for to handle rapid device changes
    const lastDeviceIdRef = useRef<string | null>(null);

    // Countdown timer - handles reset on new device
    useEffect(() => {
        if (!pendingDevice) {
            lastDeviceIdRef.current = null;
            return;
        }

        // Reset countdown when a new device is detected
        if (pendingDevice.id !== lastDeviceIdRef.current) {
            lastDeviceIdRef.current = pendingDevice.id;
            setCountdown(AUTO_DISMISS_SECONDS);
        }

        const interval = setInterval(() => {
            setCountdown((prev) => (prev <= 1 ? 0 : prev - 1));
        }, 1000);

        return () => clearInterval(interval);
    }, [pendingDevice]);

    // Auto-dismiss when countdown reaches 0 (separate effect to avoid race condition)
    useEffect(() => {
        if (countdown === 0 && pendingDevice) {
            dismissPendingDevice();
        }
    }, [countdown, pendingDevice, dismissPendingDevice]);

    // Handle adding the device
    const handleAdd = useCallback(() => {
        if (pendingDevice) {
            const presetId = detectedPreset?.id || 'generic';
            onAddDevice(pendingDevice.id, presetId);
            dismissPendingDevice();
        }
    }, [pendingDevice, detectedPreset, onAddDevice, dismissPendingDevice]);

    // Handle opening browser (More button)
    const handleMore = useCallback(() => {
        dismissPendingDevice();
        openBrowser();
    }, [dismissPendingDevice, openBrowser]);

    // Handle dismiss
    const handleDismiss = useCallback(() => {
        dismissPendingDevice();
    }, [dismissPendingDevice]);

    // Preview what name will be auto-generated
    const previewDeviceName = useMemo(() => {
        if (!pendingDevice) return null;

        const presetId = detectedPreset?.id || 'generic';
        const presetName = detectedPreset?.name || 'MIDI Device';

        // Check if this device already has a signature
        const existingSig = deviceSignatures[pendingDevice.id];
        if (existingSig) {
            return existingSig.deviceName;
        }

        // Calculate what name would be generated
        let suffix = 1;
        let candidateName = presetName;
        while (usedDeviceNames[`${presetId}:${candidateName}`]) {
            suffix++;
            candidateName = `${presetName} ${suffix}`;
        }
        return candidateName;
    }, [pendingDevice, detectedPreset, usedDeviceNames, deviceSignatures]);

    if (!pendingDevice) return null;

    const presetName = detectedPreset?.name || 'Generic MIDI Device';
    const rawDeviceName = pendingDevice.name; // Original Web MIDI device name
    const displayName = previewDeviceName || presetName; // Name that will be assigned
    const isRecognized = detectedPreset !== null;

    return (
        <div className="midi-toast">
            {/* Progress bar for auto-dismiss */}
            <div
                className="midi-toast-progress"
                style={{ width: `${(countdown / AUTO_DISMISS_SECONDS) * 100}%` }}
            />

            <div className="midi-toast-content">
                {/* Icon - different for recognized vs generic */}
                <div className={`midi-toast-icon ${isRecognized ? 'recognized' : 'generic'}`}>
                    {isRecognized ? '\u{1F3B9}' : '\u{1F3B5}'}
                </div>

                {/* Text */}
                <div className="midi-toast-text">
                    <span className="midi-toast-title">
                        {isRecognized ? 'MIDI Device Detected' : 'New MIDI Device'}
                    </span>
                    <span className="midi-toast-device">{rawDeviceName}</span>
                    {isRecognized && (
                        <span className="midi-toast-preset">
                            Will be named: <strong>{displayName}</strong>
                        </span>
                    )}
                    {!isRecognized && (
                        <span className="midi-toast-preset">
                            Add as: <strong>{displayName}</strong>
                        </span>
                    )}
                </div>
            </div>

            {/* Actions */}
            <div className="midi-toast-actions">
                <button
                    className="midi-toast-btn midi-toast-btn-primary"
                    onClick={handleAdd}
                    title={`Add ${displayName} to canvas`}
                >
                    Add {displayName}
                </button>
                <button
                    className="midi-toast-btn midi-toast-btn-secondary"
                    onClick={handleMore}
                    title="Browse all MIDI devices and presets"
                >
                    More...
                </button>
                <button
                    className="midi-toast-btn midi-toast-btn-dismiss"
                    onClick={handleDismiss}
                    title="Dismiss (auto-dismisses in a few seconds)"
                >
                    &times;
                </button>
            </div>
        </div>
    );
}
