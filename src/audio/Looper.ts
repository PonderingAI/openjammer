/**
 * Looper - Recording and playback of audio loops
 */

import { getAudioContext, getMasterGain } from './AudioEngine';

/**
 * Sentinel value for infinite duration.
 * Using -1 as it's clearly invalid for duration and serializes properly to JSON.
 * (Number.POSITIVE_INFINITY serializes to null)
 */
export const INFINITE_DURATION = -1;

/** Type guard to check if duration represents infinite */
export function isInfiniteDuration(duration: number): boolean {
    return duration < 0;
}

export interface Loop {
    id: string;
    buffer: AudioBuffer;
    startTime: number;
    isMuted: boolean;
    gainNode: GainNode | null;
    sourceNode: AudioBufferSourceNode | null;
    waveformData: number[];  // Amplitude values over time for visualization
}

/**
 * Looper class for recording and playing back loops
 *
 * Works like a traditional loop pedal:
 * - Recording happens in fixed cycles based on duration
 * - After each cycle, the recording becomes a loop and starts playing
 * - Recording continues, layering new audio on top of previous loops
 * - User manually stops recording when done
 */
export class Looper {
    private duration: number;
    private loops: Loop[] = [];
    private isRecording: boolean = false;
    private currentTime: number = 0;
    private cycleStartTime: number = 0;
    private outputNode: GainNode | null = null;

    // Recording
    private mediaRecorder: MediaRecorder | null = null;
    private recordedChunks: Blob[] = [];
    private inputStream: MediaStream | null = null;
    private inputNode: AudioNode | null = null;
    private mediaStreamDestination: MediaStreamAudioDestinationNode | null = null;
    private analyser: AnalyserNode | null = null;

    // Cycle timer
    private cycleTimerId: number | null = null;
    private animationFrameId: number | null = null;

    // Waveform history (builds during recording) - uses circular buffer for O(1) inserts
    private waveformHistory: Float32Array;
    private waveformIndex: number = 0;
    private waveformLength: number = 0; // Actual number of samples (may be less than MAX during initial recording)
    private lastWaveformSampleTime: number = 0;
    private readonly WAVEFORM_SAMPLE_INTERVAL = 50; // ms between samples
    private readonly MAX_WAVEFORM_SAMPLES = 2000; // Cap waveform data to prevent memory issues

    // Callbacks
    private onLoopAdded: ((loop: Loop) => void) | null = null;
    private onTimeUpdate: ((time: number) => void) | null = null;
    private onWaveformUpdate: ((bars: number[]) => void) | null = null;
    private onWaveformHistoryUpdate: ((history: number[], playheadPosition: number) => void) | null = null;

    constructor(duration: number = 10) {
        this.duration = duration;
        this.waveformHistory = new Float32Array(this.MAX_WAVEFORM_SAMPLES);
        this.initOutput();
    }

    private initOutput(): void {
        const ctx = getAudioContext();
        const master = getMasterGain();
        if (!ctx || !master) return;

        this.outputNode = ctx.createGain();
        this.outputNode.gain.value = 1;
        this.outputNode.connect(master);
    }

    setDuration(duration: number): void {
        this.duration = duration;
    }

    getDuration(): number {
        return this.duration;
    }

    getCurrentTime(): number {
        return this.currentTime;
    }

    getLoops(): Loop[] {
        return this.loops;
    }

    getOutput(): GainNode | null {
        return this.outputNode;
    }

    setOnLoopAdded(callback: (loop: Loop) => void): void {
        this.onLoopAdded = callback;
    }

    setOnTimeUpdate(callback: (time: number) => void): void {
        this.onTimeUpdate = callback;
    }

    setOnWaveformUpdate(callback: (bars: number[]) => void): void {
        this.onWaveformUpdate = callback;
    }

    setOnWaveformHistoryUpdate(callback: (history: number[], playheadPosition: number) => void): void {
        this.onWaveformHistoryUpdate = callback;
    }

    /**
     * Extract waveform history from circular buffer as a regular array.
     * Returns samples in chronological order (oldest to newest).
     */
    private getWaveformHistoryArray(): number[] {
        if (this.waveformLength === 0) return [];

        const result: number[] = new Array(this.waveformLength);

        if (this.waveformLength < this.MAX_WAVEFORM_SAMPLES) {
            // Buffer hasn't wrapped yet - simple copy from start
            for (let i = 0; i < this.waveformLength; i++) {
                result[i] = this.waveformHistory[i];
            }
        } else {
            // Buffer has wrapped - need to reorder
            // waveformIndex points to the next write position (oldest data)
            for (let i = 0; i < this.waveformLength; i++) {
                const srcIndex = (this.waveformIndex + i) % this.MAX_WAVEFORM_SAMPLES;
                result[i] = this.waveformHistory[srcIndex];
            }
        }

        return result;
    }

    /**
     * Get the input node for connecting upstream audio.
     * Returns an AnalyserNode which passes audio through while allowing
     * waveform analysis. Compatible with AudioNode interface for connections.
     */
    getInputNode(): AudioNode | null {
        const ctx = getAudioContext();
        if (!ctx) return null;

        if (!this.analyser) {
            // Create analyser for silence detection
            this.analyser = ctx.createAnalyser();
            this.analyser.fftSize = 256;

            // Create MediaStreamDestination for recording from AudioNode
            this.mediaStreamDestination = ctx.createMediaStreamDestination();

            // Connect analyser to destination for recording
            this.analyser.connect(this.mediaStreamDestination);

            // Also connect to output for passthrough (audio flows through even when not recording)
            if (this.outputNode) {
                this.analyser.connect(this.outputNode);
            }

            // Store the stream for MediaRecorder
            this.inputStream = this.mediaStreamDestination.stream;
        }

        // Return analyser as input (it passes audio through)
        return this.analyser;
    }

    /**
     * Connect an audio source to the looper input
     */
    async connectInput(source: AudioNode | MediaStream): Promise<void> {
        const ctx = getAudioContext();
        if (!ctx) return;

        // Create analyser for silence detection
        if (!this.analyser) {
            this.analyser = ctx.createAnalyser();
            this.analyser.fftSize = 256;

            // Connect to output for passthrough
            if (this.outputNode) {
                this.analyser.connect(this.outputNode);
            }
        }

        if (source instanceof MediaStream) {
            this.inputStream = source;
            const sourceNode = ctx.createMediaStreamSource(source);
            sourceNode.connect(this.analyser);
        } else {
            // For AudioNode input, create MediaStreamDestination for recording
            this.inputNode = source;
            source.connect(this.analyser);

            // Create MediaStreamDestination for recording
            if (!this.mediaStreamDestination) {
                this.mediaStreamDestination = ctx.createMediaStreamDestination();
                this.analyser.connect(this.mediaStreamDestination);
                this.inputStream = this.mediaStreamDestination.stream;
            }
        }
    }

    /**
     * Start recording - immediately begins recording in cycles
     * After each cycle (duration), the recording becomes a loop and plays
     * Recording continues until manually stopped
     */
    async startRecording(): Promise<void> {
        if (this.isRecording) return;

        const ctx = getAudioContext();
        if (!ctx || !this.inputStream) return;

        this.isRecording = true;
        this.cycleStartTime = ctx.currentTime;

        // Start the first recording cycle
        this.startRecordingCycle();

        // Start progress animation
        this.updateProgress();
    }

    /**
     * Start a single recording cycle
     */
    private startRecordingCycle(): void {
        if (!this.isRecording || !this.inputStream) return;

        const ctx = getAudioContext();
        if (!ctx) return;

        this.recordedChunks = [];
        // Reset circular buffer for new cycle (just reset indices, no allocation needed)
        this.waveformIndex = 0;
        this.waveformLength = 0;
        this.lastWaveformSampleTime = 0;
        this.cycleStartTime = ctx.currentTime;

        // Create new MediaRecorder for this cycle
        this.mediaRecorder = new MediaRecorder(this.inputStream, {
            mimeType: 'audio/webm;codecs=opus'
        });

        this.mediaRecorder.ondataavailable = (e) => {
            if (e.data.size > 0) {
                this.recordedChunks.push(e.data);
            }
        };

        this.mediaRecorder.onstop = () => this.processRecordingCycle();

        // Start recording immediately
        this.mediaRecorder.start();

        // Schedule end of cycle (for non-infinite duration)
        if (!isInfiniteDuration(this.duration)) {
            this.cycleTimerId = window.setTimeout(() => {
                this.endRecordingCycle();
            }, this.duration * 1000);
        }
    }

    /**
     * End current recording cycle and start next one
     */
    private endRecordingCycle(): void {
        if (!this.isRecording) return;

        // Stop current MediaRecorder (triggers onstop -> processRecordingCycle)
        // Wrap in try-catch: state could change between check and stop (race condition)
        if (this.mediaRecorder && this.mediaRecorder.state === 'recording') {
            try {
                this.mediaRecorder.stop();
            } catch (err) {
                // MediaRecorder may have already stopped
                if (import.meta.env.DEV) {
                    console.warn('MediaRecorder stop failed in endRecordingCycle:', err);
                }
            }
        }
    }

    /**
     * Process the recorded cycle into a loop, then start next cycle
     */
    private async processRecordingCycle(): Promise<void> {
        if (this.recordedChunks.length === 0) {
            // No audio recorded, but continue if still recording
            if (this.isRecording) {
                this.startRecordingCycle();
            }
            return;
        }

        const ctx = getAudioContext();
        if (!ctx) return;

        const blob = new Blob(this.recordedChunks, { type: 'audio/webm' });
        const arrayBuffer = await blob.arrayBuffer();

        try {
            const audioBuffer = await ctx.decodeAudioData(arrayBuffer);

            const loop: Loop = {
                id: `loop-${Date.now()}`,
                buffer: audioBuffer,
                startTime: 0,
                isMuted: false,
                gainNode: null,
                sourceNode: null,
                waveformData: this.getWaveformHistoryArray()  // Store waveform shape
            };

            this.loops.push(loop);
            this.onLoopAdded?.(loop);

            // Auto-start playing the loop
            this.playLoop(loop);
        } catch (err) {
            console.error('Failed to decode recorded audio:', err);
        }

        // Start next cycle if still recording
        if (this.isRecording) {
            this.startRecordingCycle();
        }
    }

    /**
     * Update progress bar animation and waveform data
     */
    private updateProgress(): void {
        if (!this.isRecording && this.loops.length === 0) {
            return;
        }

        const ctx = getAudioContext();
        if (!ctx) return;

        const now = performance.now();

        if (!isInfiniteDuration(this.duration)) {
            this.currentTime = (ctx.currentTime - this.cycleStartTime) % this.duration;
        } else {
            this.currentTime = 0;
        }
        this.onTimeUpdate?.(this.currentTime);

        // Sample amplitude for waveform history during recording
        if (this.isRecording && this.analyser) {
            // Sample at fixed intervals
            if (now - this.lastWaveformSampleTime >= this.WAVEFORM_SAMPLE_INTERVAL) {
                const dataArray = new Uint8Array(this.analyser.frequencyBinCount);
                this.analyser.getByteTimeDomainData(dataArray);

                // Calculate peak amplitude
                let peak = 0;
                for (let i = 0; i < dataArray.length; i++) {
                    const amplitude = Math.abs(dataArray[i] - 128) / 128;
                    if (amplitude > peak) peak = amplitude;
                }

                // Add to circular buffer - O(1) operation instead of O(n) shift
                this.waveformHistory[this.waveformIndex] = peak;
                this.waveformIndex = (this.waveformIndex + 1) % this.MAX_WAVEFORM_SAMPLES;
                if (this.waveformLength < this.MAX_WAVEFORM_SAMPLES) {
                    this.waveformLength++;
                }
                this.lastWaveformSampleTime = now;
            }

            // Skip UI updates when document is hidden (performance optimization)
            if (!document.hidden) {
                // Calculate playhead position (0-100)
                const playheadPosition = !isInfiniteDuration(this.duration)
                    ? (this.currentTime / this.duration) * 100
                    : 0;

                // Send waveform history update (extract ordered array from circular buffer)
                this.onWaveformHistoryUpdate?.(this.getWaveformHistoryArray(), playheadPosition);
            }
        }

        // Extract real-time waveform data from analyser (for live display)
        // Skip when document is hidden (performance optimization)
        if (this.analyser && this.onWaveformUpdate && !document.hidden) {
            const dataArray = new Uint8Array(this.analyser.frequencyBinCount);
            this.analyser.getByteFrequencyData(dataArray);

            const NUM_BARS = 32;
            const bars: number[] = [];
            const step = Math.floor(dataArray.length / NUM_BARS);
            for (let i = 0; i < NUM_BARS; i++) {
                bars.push(dataArray[i * step] / 255);
            }
            this.onWaveformUpdate(bars);
        }

        this.animationFrameId = requestAnimationFrame(() => this.updateProgress());
    }

    /**
     * Stop recording manually
     */
    stopRecording(): void {
        if (!this.isRecording) return;

        this.isRecording = false;

        // Clear cycle timer
        if (this.cycleTimerId !== null) {
            clearTimeout(this.cycleTimerId);
            this.cycleTimerId = null;
        }

        // Stop animation
        if (this.animationFrameId !== null) {
            cancelAnimationFrame(this.animationFrameId);
            this.animationFrameId = null;
        }

        // Stop current MediaRecorder
        // Wrap in try-catch: state could change between check and stop (race condition)
        if (this.mediaRecorder && this.mediaRecorder.state === 'recording') {
            try {
                this.mediaRecorder.stop();
            } catch (err) {
                // MediaRecorder may have already stopped
                if (import.meta.env.DEV) {
                    console.warn('MediaRecorder stop failed in stopRecording:', err);
                }
            }
        }
    }

    /**
     * Play a specific loop
     */
    playLoop(loop: Loop): void {
        if (loop.isMuted || loop.sourceNode) return;

        const ctx = getAudioContext();
        if (!ctx || !this.outputNode) return;

        // Create gain for this loop
        loop.gainNode = ctx.createGain();
        loop.gainNode.gain.value = loop.isMuted ? 0 : 1;
        loop.gainNode.connect(this.outputNode);

        // Create and start buffer source
        loop.sourceNode = ctx.createBufferSource();
        loop.sourceNode.buffer = loop.buffer;
        loop.sourceNode.loop = true;
        loop.sourceNode.connect(loop.gainNode);
        loop.sourceNode.start();
    }

    /**
     * Stop a specific loop
     */
    stopLoop(loop: Loop): void {
        if (loop.sourceNode) {
            loop.sourceNode.stop();
            loop.sourceNode.disconnect();
            loop.sourceNode = null;
        }
        if (loop.gainNode) {
            loop.gainNode.disconnect();
            loop.gainNode = null;
        }
    }

    /**
     * Toggle mute for a loop
     */
    toggleLoopMute(loopId: string): void {
        const loop = this.loops.find(l => l.id === loopId);
        if (!loop) return;

        loop.isMuted = !loop.isMuted;

        if (loop.gainNode) {
            loop.gainNode.gain.value = loop.isMuted ? 0 : 1;
        }
    }

    /**
     * Delete a loop
     */
    deleteLoop(loopId: string): void {
        const index = this.loops.findIndex(l => l.id === loopId);
        if (index === -1) return;

        const loop = this.loops[index];
        this.stopLoop(loop);
        this.loops.splice(index, 1);
    }

    /**
     * Play all loops
     */
    playAll(): void {
        this.loops.forEach(loop => {
            if (!loop.sourceNode) {
                this.playLoop(loop);
            }
        });
    }

    /**
     * Stop all loops
     */
    stopAll(): void {
        this.loops.forEach(loop => this.stopLoop(loop));
    }

    /**
     * Disconnect and cleanup
     */
    disconnect(): void {
        this.stopAll();
        this.stopRecording();

        // Clear timers
        if (this.cycleTimerId !== null) {
            clearTimeout(this.cycleTimerId);
            this.cycleTimerId = null;
        }

        if (this.animationFrameId !== null) {
            cancelAnimationFrame(this.animationFrameId);
            this.animationFrameId = null;
        }

        if (this.analyser) {
            this.analyser.disconnect();
            this.analyser = null;
        }

        if (this.mediaStreamDestination) {
            this.mediaStreamDestination.disconnect();
            this.mediaStreamDestination = null;
        }

        if (this.inputNode) {
            this.inputNode = null;
        }

        if (this.inputStream) {
            // Stop all tracks in the stream
            this.inputStream.getTracks().forEach(track => track.stop());
            this.inputStream = null;
        }

        if (this.outputNode) {
            this.outputNode.disconnect();
            this.outputNode = null;
        }
    }
}
