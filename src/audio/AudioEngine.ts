/**
 * Audio Engine - Singleton managing Web Audio API
 */

let audioContext: AudioContext | null = null;
let masterGain: GainNode | null = null;

// ============================================================================
// Types
// ============================================================================

export interface AudioContextConfig {
    sampleRate?: number;
    latencyHint?: AudioContextLatencyCategory | number;
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
 */
export async function initAudioContext(config?: AudioContextConfig): Promise<AudioContext> {
    if (audioContext && audioContext.state !== 'closed') {
        if (audioContext.state === 'suspended') {
            await audioContext.resume();
        }
        return audioContext;
    }

    audioContext = new AudioContext({
        sampleRate: config?.sampleRate || 48000,
        latencyHint: config?.latencyHint !== undefined ? config.latencyHint : 'interactive'
    });
    masterGain = audioContext.createGain();
    masterGain.connect(audioContext.destination);
    masterGain.gain.value = 0.8;

    return audioContext;
}

/**
 * Reinitialize AudioContext with new configuration
 * Must be called after user gesture
 */
export async function reinitAudioContext(config: AudioContextConfig): Promise<AudioContext> {
    // Close existing context
    if (audioContext && audioContext.state !== 'closed') {
        await audioContext.close();
    }

    audioContext = null;
    masterGain = null;

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
