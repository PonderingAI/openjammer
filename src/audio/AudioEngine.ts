/**
 * Audio Engine - Singleton managing Web Audio API
 */

let audioContext: AudioContext | null = null;
let masterGain: GainNode | null = null;

/**
 * Initialize the audio context (must be called after user gesture)
 */
export async function initAudioContext(): Promise<AudioContext> {
    if (audioContext && audioContext.state !== 'closed') {
        if (audioContext.state === 'suspended') {
            await audioContext.resume();
        }
        return audioContext;
    }

    audioContext = new AudioContext();
    masterGain = audioContext.createGain();
    masterGain.connect(audioContext.destination);
    masterGain.gain.value = 0.8;

    return audioContext;
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
