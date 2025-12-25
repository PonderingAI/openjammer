/**
 * Audio Engine - Singleton managing Web Audio API
 *
 * IMPORTANT: Tone.js is dynamically imported to avoid AudioContext creation
 * before user gesture. This prevents browser autoplay warnings.
 */

// Tone.js types (imported dynamically to avoid eager AudioContext creation)
type ToneType = typeof import('tone');

let audioContext: AudioContext | null = null;
let masterGain: GainNode | null = null;
let toneInitialized = false;
let cachedTone: ToneType | null = null;

/** Promise to track ongoing initialization (prevents race condition) */
let initializationPromise: Promise<AudioContext> | null = null;

/** Promise guard for Tone.js dynamic import (prevents duplicate imports from concurrent calls) */
let toneImportPromise: Promise<ToneType> | null = null;

/** Configured Tone.js lookAhead in seconds (default 0.01 = 10ms for low latency) */
let configuredLookAhead: number = 0.01;

// ============================================================================
// Types
// ============================================================================

export interface AudioContextConfig {
    sampleRate?: number;
    latencyHint?: AudioContextLatencyCategory | number;
    lowLatencyMode?: boolean; // When true, requests 5ms latency for USB interfaces
    toneJsLookAhead?: number; // Tone.js scheduling buffer in seconds (default 0.01 = 10ms)
}

export type LatencyClassification = 'excellent' | 'good' | 'acceptable' | 'poor' | 'bad';

export interface LatencyMetrics {
    baseLatency: number;           // ms - browser processing overhead
    outputLatency: number;         // ms - output device delay
    totalLatency: number;          // ms - combined one-way latency
    toneJsLookAhead: number;       // ms - Tone.js scheduling buffer
    estimatedRoundTrip: number;    // ms - total perceived latency for live playing
    classification: LatencyClassification;
    isBluetoothSuspected: boolean; // true if outputLatency > 100ms
    sampleRate: number;            // Hz - current sample rate
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
            // When lowLatencyMode is enabled, request absolute minimum latency (0)
            // This tells the browser to use the smallest possible buffer size
            // Research shows 0 achieves ~10ms lower latency than 'interactive' on Chrome
            const latencyHint = config?.lowLatencyMode
                ? 0 // Absolute minimum latency - best for live MIDI performance
                : (config?.latencyHint !== undefined ? config.latencyHint : 'interactive');

            // Store configured lookAhead for Tone.js (default 10ms for low latency)
            configuredLookAhead = config?.toneJsLookAhead ?? 0.01;

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

    // Dynamically import Tone.js to avoid AudioContext creation before user gesture
    // Use promise guard to prevent duplicate imports from concurrent calls
    if (!cachedTone) {
        if (!toneImportPromise) {
            toneImportPromise = import('tone');
        }
        cachedTone = await toneImportPromise;
        // Keep the promise around - it's resolved and can be awaited multiple times
    }
    const Tone = cachedTone;

    // Set Tone.js to use our context (only once)
    if (!toneInitialized) {
        try {
            Tone.setContext(audioContext);

            // LOW LATENCY OPTIMIZATION:
            // Tone.js defaults lookAhead to 0.1s (100ms) for scheduled playback
            // For live MIDI performance, we need near-zero lookAhead
            // Use configured value (default 0.01s = 10ms) for balance
            Tone.context.lookAhead = configuredLookAhead;
            // Note: updateInterval is set via Draw.setExpiration, not directly settable

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
 * Classify latency based on professional audio standards
 * @param roundTripMs - Estimated round-trip latency in milliseconds
 */
function classifyLatency(roundTripMs: number): LatencyClassification {
    if (roundTripMs <= 10) return 'excellent';  // Professional quality
    if (roundTripMs <= 20) return 'good';       // Acceptable for most musicians
    if (roundTripMs <= 30) return 'acceptable'; // Passable for monitoring
    if (roundTripMs <= 50) return 'poor';       // Noticeable delay
    return 'bad';                               // Unusable for real-time
}

/**
 * Get current latency metrics from AudioContext
 * Includes comprehensive breakdown for debugging and user feedback
 */
export function getLatencyMetrics(): LatencyMetrics | null {
    if (!audioContext) return null;

    // Convert to ms
    const baseLatency = (audioContext.baseLatency ?? 0) * 1000;
    const outputLatency = (audioContext.outputLatency ?? 0) * 1000;
    const totalLatency = baseLatency + outputLatency;

    // Get Tone.js lookAhead (may not be initialized yet)
    const toneJsLookAhead = cachedTone
        ? (cachedTone.context?.lookAhead ?? 0.1) * 1000
        : 100; // Default assumption before Tone.js is loaded

    // Estimate round-trip latency for live playing:
    // Input delay + processing + output delay + Tone.js scheduling buffer
    // We use totalLatency * 2 for round-trip, plus lookAhead for scheduling
    const estimatedRoundTrip = (totalLatency * 2) + toneJsLookAhead;

    // Detect likely Bluetooth audio (typically adds 100-200ms)
    const isBluetoothSuspected = outputLatency > 100;

    return {
        baseLatency,
        outputLatency,
        totalLatency,
        toneJsLookAhead,
        estimatedRoundTrip,
        classification: classifyLatency(estimatedRoundTrip),
        isBluetoothSuspected,
        sampleRate: audioContext.sampleRate
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
