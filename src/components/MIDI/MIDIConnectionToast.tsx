/**
 * MIDI Connection Toast - Sonner-compatible custom toast for MIDI device detection
 *
 * Features:
 * - Progress bar countdown
 * - Device recognition badge
 * - Add Device / Browse actions
 * - Accessibility (role="alert", aria-live)
 */

import type { MIDIDeviceInfo, MIDIDevicePreset } from '../../midi/types';
import './MIDIConnectionToast.css';

/** Auto-dismiss timeout in seconds */
export const AUTO_DISMISS_SECONDS = 10;

interface MIDIConnectionToastProps {
    device: MIDIDeviceInfo;
    preset: MIDIDevicePreset | null;
    previewDeviceName: string;
    countdown: number;
    onAdd: () => void;
    onBrowse: () => void;
    onDismiss: () => void;
}

export function MIDIConnectionToast({
    device,
    preset,
    previewDeviceName,
    countdown,
    onAdd,
    onBrowse,
    onDismiss,
}: MIDIConnectionToastProps) {
    const isRecognized = preset !== null;
    const presetName = preset?.name || 'Generic MIDI Device';
    const rawDeviceName = device.name;

    return (
        <div
            className="midi-connection-toast"
            role="alert"
            aria-live="polite"
            aria-atomic="true"
        >
            {/* Progress bar for auto-dismiss countdown */}
            <div
                className="midi-connection-toast-progress"
                style={{ width: `${(countdown / AUTO_DISMISS_SECONDS) * 100}%` }}
                aria-hidden="true"
            />

            {/* Header with dismiss button */}
            <div className="midi-connection-toast-header">
                <div className="midi-connection-toast-header-left" />
                <button
                    className="midi-connection-toast-dismiss"
                    onClick={onDismiss}
                    aria-label="Dismiss notification"
                    type="button"
                >
                    &times;
                </button>
            </div>

            {/* Content area */}
            <div className="midi-connection-toast-content">
                {/* Icon - different for recognized vs generic */}
                <div
                    className={`midi-connection-toast-icon ${isRecognized ? 'recognized' : 'generic'}`}
                    aria-hidden="true"
                >
                    {isRecognized ? '\u{1F3B9}' : '\u{1F3B5}'}
                </div>

                {/* Text */}
                <div className="midi-connection-toast-text">
                    <span className="midi-connection-toast-title">{rawDeviceName}</span>
                    <span className="midi-connection-toast-device">
                        {isRecognized
                            ? `Matched preset: ${presetName}`
                            : 'Unknown device type'}
                    </span>
                    <span className="midi-connection-toast-assign">
                        Add as: <span className="midi-connection-toast-assign-name">{previewDeviceName}</span>
                    </span>
                </div>
            </div>

            {/* Actions */}
            <div className="midi-connection-toast-actions">
                <button
                    className="midi-connection-toast-btn midi-connection-toast-btn-primary"
                    onClick={onAdd}
                    type="button"
                >
                    Add Device
                </button>
                <button
                    className="midi-connection-toast-btn midi-connection-toast-btn-secondary"
                    onClick={onBrowse}
                    type="button"
                >
                    Browse
                </button>
            </div>
        </div>
    );
}
