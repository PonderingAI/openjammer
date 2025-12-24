/// <reference path="./worklet-types.d.ts" />
/**
 * AudioWorkletProcessor for Low-Latency PCM Recording
 *
 * Runs in the audio rendering thread for minimal latency.
 * Captures raw PCM Float32Array data and posts to main thread.
 *
 * This replaces MediaRecorder for loop recording, eliminating:
 * - WebM/Opus encoding latency (50-100ms)
 * - Decoding step on playback
 *
 * Message protocol:
 * - Main → Worklet: { command: 'start' | 'stop' }
 * - Worklet → Main: { type: 'buffer', data: Float32Array } | { type: 'complete' }
 */

// Buffer size for batching samples before sending to main thread
// Smaller = lower latency but more message overhead
// 2048 samples = ~43ms at 48kHz (good balance)
const BUFFER_SIZE = 2048;

class RecordingProcessor extends AudioWorkletProcessor {
    private isRecording = false;
    private buffer: Float32Array;
    private bufferIndex = 0;
    private channelCount = 1; // Start mono, can expand to stereo

    constructor() {
        super();

        this.buffer = new Float32Array(BUFFER_SIZE);

        this.port.onmessage = (e: MessageEvent) => {
            const { command, channels } = e.data;

            switch (command) {
                case 'start':
                    this.isRecording = true;
                    this.bufferIndex = 0;
                    this.channelCount = channels || 1;
                    this.buffer = new Float32Array(BUFFER_SIZE * this.channelCount);
                    break;

                case 'stop':
                    this.isRecording = false;
                    this.flush();
                    this.port.postMessage({ type: 'complete' });
                    break;
            }
        };
    }

    process(
        inputs: Float32Array[][],
        _outputs: Float32Array[][],
        _parameters: Record<string, Float32Array>
    ): boolean {
        // Always return true to keep processor alive
        if (!this.isRecording) {
            return true;
        }

        const input = inputs[0];
        if (!input || input.length === 0) {
            return true;
        }

        // Get the first channel (mono recording)
        // For stereo, we'd interleave channels
        const channelData = input[0];
        if (!channelData) {
            return true;
        }

        // Copy samples to buffer
        for (let i = 0; i < channelData.length; i++) {
            this.buffer[this.bufferIndex++] = channelData[i];

            // Buffer full - send to main thread
            if (this.bufferIndex >= this.buffer.length) {
                this.sendBuffer();
            }
        }

        return true;
    }

    private sendBuffer(): void {
        // Create a copy to transfer (original buffer will be reused)
        const bufferCopy = this.buffer.slice(0, this.bufferIndex);

        this.port.postMessage(
            { type: 'buffer', data: bufferCopy },
            { transfer: [bufferCopy.buffer] }
        );

        // Reset for next batch
        this.bufferIndex = 0;
    }

    private flush(): void {
        // Send any remaining samples
        if (this.bufferIndex > 0) {
            const partial = this.buffer.slice(0, this.bufferIndex);
            this.port.postMessage(
                { type: 'buffer', data: partial },
                { transfer: [partial.buffer] }
            );
            this.bufferIndex = 0;
        }
    }
}

registerProcessor('recording-processor', RecordingProcessor);
