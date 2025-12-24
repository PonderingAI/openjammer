/**
 * Audio Device Detection Utility
 * Detects professional/low-latency audio interfaces by label pattern matching
 */

// Professional audio interface brand patterns
// These devices typically bypass standard Windows audio processing for lower latency
const PRO_AUDIO_PATTERNS = [
    // Focusrite
    /focusrite/i, /scarlett/i, /clarett/i,
    // Universal Audio
    /universal audio/i, /apollo/i, /volt/i,
    // PreSonus
    /presonus/i, /audiobox/i, /studio 24/i, /studio 26/i,
    // MOTU
    /motu/i, /\bm2\b|\bm4\b/i, /ultralite/i,
    // RME
    /\brme\b/i, /babyface/i, /fireface/i,
    // Native Instruments
    /native instruments/i, /komplete audio/i,
    // Steinberg
    /steinberg/i, /ur\d{2}c?/i,
    // Behringer
    /behringer/i, /\bumc\b/i, /u-phoria/i,
    // Audient
    /audient/i, /\bevo\b/i, /\bid\d{1,2}\b/i,
    // SSL
    /\bssl\b/i,
    // Mackie
    /mackie/i, /onyx/i,
    // Tascam
    /tascam/i,
    // Zoom
    /zoom.*audio/i, /\buac-\d/i,
    // M-Audio
    /m-audio/i, /\bair\b.*192/i,
    // Roland
    /roland/i, /rubix/i,
    // Yamaha (AG series for streaming/music)
    /yamaha.*ag/i,
    // Arturia
    /arturia/i, /audiofuse/i,
    // IK Multimedia
    /ik multimedia/i, /axe i\/o/i,
    // Apogee
    /apogee/i, /duet/i, /symphony/i,
    // Solid State Logic
    /solid state logic/i,
    // Generic USB audio interface patterns
    /audio interface/i, /\basio\b/i
];

export interface EnhancedAudioDevice {
    deviceId: string;
    label: string;
    isLowLatency: boolean;
}

/**
 * Detects if a device label indicates a professional/low-latency audio interface
 */
export function detectLowLatencyDevice(label: string): boolean {
    if (!label) return false;
    return PRO_AUDIO_PATTERNS.some(pattern => pattern.test(label));
}

/**
 * Sorts devices by priority: low-latency first, then alphabetically
 * Keeps "Default Output" at the very top
 */
export function sortDevicesByPriority(devices: EnhancedAudioDevice[]): EnhancedAudioDevice[] {
    return [...devices].sort((a, b) => {
        // Default output always first (handled separately in UI)
        // Low-latency devices come before regular devices
        if (a.isLowLatency && !b.isLowLatency) return -1;
        if (!a.isLowLatency && b.isLowLatency) return 1;
        // Within same category, sort alphabetically
        return a.label.localeCompare(b.label);
    });
}

/**
 * Enhances a list of audio devices with low-latency detection
 */
export function enhanceAudioDevices(devices: MediaDeviceInfo[]): EnhancedAudioDevice[] {
    return devices.map(d => ({
        deviceId: d.deviceId,
        label: d.label || `Speaker ${d.deviceId.slice(0, 4)}`,
        isLowLatency: detectLowLatencyDevice(d.label)
    }));
}

/**
 * Gets the best audio output device (first low-latency device, or first available)
 */
export function getBestOutputDevice(devices: EnhancedAudioDevice[]): EnhancedAudioDevice | null {
    if (devices.length === 0) return null;

    // Prefer first low-latency device
    const lowLatencyDevice = devices.find(d => d.isLowLatency);
    if (lowLatencyDevice) return lowLatencyDevice;

    // Fall back to first device
    return devices[0];
}
