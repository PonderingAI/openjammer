/**
 * RecordingWorklet - Main Thread Wrapper for AudioWorklet Recording
 *
 * Provides a high-level API for low-latency PCM recording using AudioWorklet.
 * Handles worklet loading, message passing, and buffer assembly.
 *
 * Usage:
 *   const recorder = new RecordingWorklet(audioContext);
 *   await recorder.initialize();
 *   const node = recorder.getNode();
 *   sourceNode.connect(node);
 *   recorder.start((buffer) => { ... });
 *   // Later...
 *   recorder.stop();
 */

export interface RecordingWorkletOptions {
    channels?: 1 | 2;
}

export class RecordingWorklet {
    private context: AudioContext;
    private workletNode: AudioWorkletNode | null = null;
    private buffers: Float32Array[] = [];
    private onComplete: ((buffer: AudioBuffer) => void) | null = null;
    private isInitialized = false;
    private isRecording = false;
    private channels: 1 | 2 = 1;

    constructor(context: AudioContext) {
        this.context = context;
    }

    /**
     * Check if AudioWorklet is supported in this browser
     */
    static isSupported(): boolean {
        return typeof AudioWorkletNode !== 'undefined' &&
               typeof AudioContext !== 'undefined' &&
               'audioWorklet' in AudioContext.prototype;
    }

    /**
     * Initialize the worklet module (must be called before use)
     */
    async initialize(): Promise<void> {
        if (this.isInitialized) return;

        try {
            // Load the worklet module
            // Vite handles the URL transformation for worklet modules
            await this.context.audioWorklet.addModule(
                new URL('./worklets/recording-processor.ts', import.meta.url)
            );
            this.isInitialized = true;
        } catch (error) {
            console.error('[RecordingWorklet] Failed to load worklet module:', error);
            throw error;
        }
    }

    /**
     * Get the AudioWorkletNode for connecting to audio graph
     */
    getNode(): AudioWorkletNode {
        if (!this.isInitialized) {
            throw new Error('RecordingWorklet not initialized. Call initialize() first.');
        }

        if (!this.workletNode) {
            this.workletNode = new AudioWorkletNode(
                this.context,
                'recording-processor',
                {
                    numberOfInputs: 1,
                    numberOfOutputs: 0, // Recording only, no output
                    channelCount: this.channels,
                    channelCountMode: 'explicit'
                }
            );

            this.workletNode.port.onmessage = this.handleMessage.bind(this);
            this.workletNode.port.onmessageerror = (e) => {
                console.error('[RecordingWorklet] Message error:', e);
            };
        }

        return this.workletNode;
    }

    /**
     * Start recording
     * @param onComplete Callback when recording is complete (after stop())
     * @param options Recording options
     */
    start(onComplete: (buffer: AudioBuffer) => void, options?: RecordingWorkletOptions): void {
        if (!this.workletNode) {
            throw new Error('Worklet node not created. Call getNode() first.');
        }

        if (this.isRecording) {
            console.warn('[RecordingWorklet] Already recording');
            return;
        }

        this.buffers = [];
        this.onComplete = onComplete;
        this.channels = options?.channels || 1;
        this.isRecording = true;

        this.workletNode.port.postMessage({
            command: 'start',
            channels: this.channels
        });
    }

    /**
     * Stop recording and trigger callback with assembled AudioBuffer
     */
    stop(): void {
        if (!this.workletNode || !this.isRecording) {
            return;
        }

        this.isRecording = false;
        this.workletNode.port.postMessage({ command: 'stop' });
    }

    /**
     * Check if currently recording
     */
    get recording(): boolean {
        return this.isRecording;
    }

    /**
     * Handle messages from the worklet processor
     */
    private handleMessage(e: MessageEvent): void {
        const { type, data } = e.data;

        switch (type) {
            case 'buffer':
                // Received a chunk of PCM data
                this.buffers.push(data as Float32Array);
                break;

            case 'complete':
                // Recording finished, assemble the AudioBuffer
                this.assembleBuffer();
                break;
        }
    }

    /**
     * Assemble all received buffers into a single AudioBuffer
     */
    private assembleBuffer(): void {
        if (this.buffers.length === 0) {
            console.warn('[RecordingWorklet] No audio data recorded');
            this.onComplete?.(this.context.createBuffer(1, 1, this.context.sampleRate));
            return;
        }

        // Calculate total length
        const totalLength = this.buffers.reduce((sum, b) => sum + b.length, 0);

        if (totalLength === 0) {
            console.warn('[RecordingWorklet] Empty recording');
            this.onComplete?.(this.context.createBuffer(1, 1, this.context.sampleRate));
            return;
        }

        // Create AudioBuffer
        const audioBuffer = this.context.createBuffer(
            this.channels,
            totalLength,
            this.context.sampleRate
        );

        // Copy all buffers into the AudioBuffer
        const channelData = audioBuffer.getChannelData(0);
        let offset = 0;

        for (const buffer of this.buffers) {
            channelData.set(buffer, offset);
            offset += buffer.length;
        }

        // Clear buffers to free memory
        this.buffers = [];

        // Invoke callback
        this.onComplete?.(audioBuffer);
        this.onComplete = null;
    }

    /**
     * Disconnect and cleanup
     */
    disconnect(): void {
        if (this.workletNode) {
            this.workletNode.port.postMessage({ command: 'stop' });
            this.workletNode.disconnect();
            this.workletNode = null;
        }
        this.buffers = [];
        this.onComplete = null;
        this.isRecording = false;
    }
}
