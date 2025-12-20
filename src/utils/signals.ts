/**
 * Signal Normalization Utilities
 *
 * OpenJammer uses normalized 0-1 ranges for all control signals:
 * - Control signals (grey wires): 0.0 to 1.0
 * - Audio signals (blue wires): -1.0 to +1.0 (Web Audio standard)
 *
 * This file provides conversion helpers for different signal standards.
 */

// ============================================================================
// MIDI Conversions (0-127 <-> 0-1)
// ============================================================================

/**
 * Convert MIDI value (0-127) to normalized (0-1)
 * Uses division by 127 so that 0->0 and 127->1 exactly
 */
export function midiToNormalized(midiValue: number): number {
    return Math.max(0, Math.min(127, midiValue)) / 127;
}

/**
 * Convert normalized (0-1) to MIDI value (0-127)
 */
export function normalizedToMidi(normalizedValue: number): number {
    return Math.round(Math.max(0, Math.min(1, normalizedValue)) * 127);
}

/**
 * Convert MIDI velocity to normalized with optional curve
 * Curves: 'linear' | 'exponential' | 'logarithmic'
 */
export function midiVelocityToNormalized(
    velocity: number,
    curve: 'linear' | 'exponential' | 'logarithmic' = 'linear'
): number {
    const normalized = midiToNormalized(velocity);

    switch (curve) {
        case 'exponential':
            return normalized * normalized; // More dynamic range
        case 'logarithmic':
            return Math.sqrt(normalized); // Compressed dynamics
        default:
            return normalized;
    }
}

// ============================================================================
// Control Signal Helpers (0-1)
// ============================================================================

/**
 * Clamp a value to the normalized control range [0, 1]
 */
export function clampControl(value: number): number {
    return Math.max(0, Math.min(1, value));
}

/**
 * Soft clamp with gradual saturation near boundaries
 * Prevents hard clipping artifacts
 */
export function softClampControl(value: number): number {
    if (value <= 0) return 0;
    if (value >= 1) return 1;
    // Apply soft saturation in the 0.9-1.0 and 0-0.1 ranges
    if (value > 0.9) {
        return 0.9 + (value - 0.9) * 0.5;
    }
    if (value < 0.1) {
        return value * 0.5 + 0.05;
    }
    return value;
}

/**
 * Scale a normalized value to a target range
 * @param value - Input value (0-1)
 * @param min - Target minimum
 * @param max - Target maximum
 */
export function scaleControl(value: number, min: number, max: number): number {
    return min + clampControl(value) * (max - min);
}

/**
 * Invert a control value (0->1, 1->0)
 */
export function invertControl(value: number): number {
    return 1 - clampControl(value);
}

// ============================================================================
// Audio Signal Helpers (-1 to +1)
// ============================================================================

/**
 * Clamp audio signal to [-1, 1] range
 */
export function clampAudio(value: number): number {
    return Math.max(-1, Math.min(1, value));
}

/**
 * Convert control signal (0-1) to bipolar audio (-1 to +1)
 */
export function controlToAudioBipolar(controlValue: number): number {
    return clampControl(controlValue) * 2 - 1;
}

/**
 * Convert audio signal (-1 to +1) to control (0-1)
 */
export function audioToControl(audioValue: number): number {
    return (clampAudio(audioValue) + 1) / 2;
}

// ============================================================================
// Precision Constants
// ============================================================================

/**
 * Minimum step for control signals (0.001 = 1000 steps)
 * This matches 10-bit precision, sufficient for smooth controls
 */
export const CONTROL_PRECISION = 0.001;

/**
 * Round a control value to the standard precision
 */
export function roundToControlPrecision(value: number): number {
    return Math.round(value / CONTROL_PRECISION) * CONTROL_PRECISION;
}
