/**
 * Type declarations for AudioWorklet processors
 * These types are available in the AudioWorklet global scope
 */

declare class AudioWorkletProcessor {
    readonly port: MessagePort;
    constructor();
    process(
        inputs: Float32Array[][],
        outputs: Float32Array[][],
        parameters: Record<string, Float32Array>
    ): boolean;
}

declare function registerProcessor(
    name: string,
    processorCtor: new () => AudioWorkletProcessor
): void;

// Current sample rate and frame info
declare const sampleRate: number;
declare const currentTime: number;
declare const currentFrame: number;
