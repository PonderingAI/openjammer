/**
 * Audio Engine - Singleton managing Web Audio API
 */

import * as Tone from 'tone';

let audioContext: AudioContext | null = null;
let masterGain: GainNode | null = null;
let toneInitialized = false;

/** Promise to track ongoing initialization (prevents race condition) */
let initializationPromise: Promise<AudioContext> | null = null;

// ============================================================================
// Types
// ============================================================================

export interface AudioContextConfig {
    sampleRate?: number;
    latencyHint?: AudioContextLatencyCategory | number;
    lowLatencyMode?: boolean; // When true, requests 5ms latency for USB interfaces
}

export interface LatencyMetrics {
    baseLatency: number; // ms
    outputLatency: number; // ms
    totalLatency: number; // ms
}

// ============================================================================
// Audio Context Initialization
// ============================================================================

/**
 * Initialize the audio context (must be called after user gesture)
 * Uses a promise guard to prevent race conditions from concurrent calls
 */
export async function initAudioContext(config?: AudioContextConfig): Promise<AudioContext> {
    // Return existing context if available and running
    if (audioContext && audioContext.state !== 'closed') {
        if (audioContext.state === 'suspended') {
            await audioContext.resume();
        }
        // Ensure Tone.js is also started
        await ensureToneStarted();
        return audioContext;
    }

    // If initialization is already in progress, wait for it (race condition fix)
    if (initializationPromise) {
        return initializationPromise;
    }

    // Start initialization and store the promise
    initializationPromise = (async () => {
        try {
            // LOW LATENCY OPTIMIZATION:
            // When lowLatencyMode is enabled, request 5ms latency (0.005s)
            // This works better with USB audio interfaces than 'interactive'
            const latencyHint = config?.lowLatencyMode
                ? 0.005 // 5ms target for USB interfaces
                : (config?.latencyHint !== undefined ? config.latencyHint : 'interactive');

            audioContext = new AudioContext({
                sampleRate: config?.sampleRate || 48000,
                latencyHint
            });
            masterGain = audioContext.createGain();
            masterGain.connect(audioContext.destination);
            masterGain.gain.value = 0.8;

            // Initialize Tone.js with our AudioContext
            await ensureToneStarted();

            return audioContext;
        } catch (error) {
            // Reset on error so retry is possible
            initializationPromise = null;
            throw error;
        }
    })();

    // Don't clear the promise - resolved promises can be awaited multiple times
    // This prevents race conditions where a 3rd caller comes in during resolution
    return initializationPromise;
}

/**
 * Ensure Tone.js is initialized and started with our AudioContext
 * MUST be called after user gesture for audio to work
 *
 * This is the SINGLE SOURCE OF TRUTH for Tone.js initialization.
 * All code that needs Tone.js should call this function rather than
 * managing their own initialization state.
 *
 * @returns Promise that resolves when Tone.js is ready, or rejects if no AudioContext
 */
export async function ensureToneStarted(): Promise<void> {
    if (!audioContext) {
        throw new Error('AudioContext not initialized. Call initAudioContext() first.');
    }

    // Set Tone.js to use our context (only once)
    if (!toneInitialized) {
        try {
            Tone.setContext(audioContext);
            // Start Tone.js if not running
            if (Tone.context.state !== 'running') {
                await Tone.start();
            }
            toneInitialized = true;
        } catch (error) {
            // Reset flag on error so retry is possible
            toneInitialized = false;
            throw error;
        }
    } else {
        // Already initialized, just ensure it's running
        if (Tone.context.state !== 'running') {
            await Tone.start();
        }
    }
}

/**
 * Check if Tone.js has been initialized with our AudioContext
 */
export function isToneInitialized(): boolean {
    return toneInitialized;
}

/**
 * Reinitialize AudioContext with new configuration
 * Must be called after user gesture
 *
 * Safely waits for any ongoing initialization before closing the context.
 */
export async function reinitAudioContext(config: AudioContextConfig): Promise<AudioContext> {
    // Wait for any ongoing initialization to complete first (race condition fix)
    if (initializationPromise) {
        try {
            await initializationPromise;
        } catch {
            // Ignore errors from previous initialization - we're reinitializing anyway
        }
    }

    // Close existing context
    if (audioContext && audioContext.state !== 'closed') {
        await audioContext.close();
    }

    audioContext = null;
    masterGain = null;
    initializationPromise = null; // Reset initialization promise
    toneInitialized = false; // Reset Tone.js state for reinit

    // Create new context with config
    return initAudioContext(config);
}

/**
 * Get the current audio context
 */
export function getAudioContext(): AudioContext | null {
    return audioContext;
}

/**
 * Get the master gain node
 */
export function getMasterGain(): GainNode | null {
    return masterGain;
}

/**
 * Check if audio is ready
 */
export function isAudioReady(): boolean {
    return audioContext !== null && audioContext.state === 'running';
}

/**
 * Suspend audio context (save power)
 */
export async function suspendAudio(): Promise<void> {
    if (audioContext && audioContext.state === 'running') {
        await audioContext.suspend();
    }
}

/**
 * Resume audio context
 */
export async function resumeAudio(): Promise<void> {
    if (audioContext && audioContext.state === 'suspended') {
        await audioContext.resume();
    }
    // Also ensure Tone.js is started
    await ensureToneStarted();
}

/**
 * Ensure audio is ready for playback
 * Call this before any audio operations to guarantee context is running
 * Returns true if audio is ready, false if no context exists
 */
export async function ensureAudioReady(): Promise<boolean> {
    if (!audioContext) {
        return false;
    }

    // Resume if suspended
    if (audioContext.state === 'suspended') {
        try {
            await audioContext.resume();
        } catch (err) {
            console.error('[AudioEngine] Failed to resume context:', err);
            return false;
        }
    }

    // Ensure Tone.js is started
    await ensureToneStarted();

    return audioContext.state === 'running';
}

/**
 * Set master volume (0-1)
 */
export function setMasterVolume(volume: number): void {
    if (masterGain) {
        masterGain.gain.value = Math.max(0, Math.min(1, volume));
    }
}

/**
 * Create a gain node connected to master
 */
export function createGainNode(gain: number = 1): GainNode | null {
    if (!audioContext || !masterGain) return null;

    const gainNode = audioContext.createGain();
    gainNode.gain.value = gain;
    gainNode.connect(masterGain);

    return gainNode;
}

// ============================================================================
// Latency Monitoring
// ============================================================================

/**
 * Get current latency metrics from AudioContext
 */
export function getLatencyMetrics(): LatencyMetrics | null {
    if (!audioContext) return null;

    const baseLatency = audioContext.baseLatency * 1000; // Convert to ms
    const outputLatency = audioContext.outputLatency * 1000;

    return {
        baseLatency,
        outputLatency,
        totalLatency: baseLatency + outputLatency
    };
}

/**
 * Start periodic latency monitoring
 * @param callback Function to call with latency metrics
 * @param intervalMs Update interval in milliseconds (default 1000ms)
 * @returns Cleanup function to stop monitoring
 */
export function startLatencyMonitoring(
    callback: (metrics: LatencyMetrics) => void,
    intervalMs: number = 1000
): () => void {
    const intervalId = setInterval(() => {
        const metrics = getLatencyMetrics();
        if (metrics) {
            callback(metrics);
        }
    }, intervalMs);

    return () => clearInterval(intervalId);
}
