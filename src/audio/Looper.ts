/**
 * Looper - Recording and playback of audio loops
 */

import { getAudioContext, getMasterGain } from './AudioEngine';

export interface Loop {
    id: string;
    buffer: AudioBuffer;
    startTime: number;
    isMuted: boolean;
    gainNode: GainNode | null;
    sourceNode: AudioBufferSourceNode | null;
}

/**
 * Looper class for recording and playing back loops
 */
export class Looper {
    private duration: number;
    private loops: Loop[] = [];
    private isRecording: boolean = false;
    private currentTime: number = 0;
    private startTime: number = 0;
    private outputNode: GainNode | null = null;

    // Recording
    private mediaRecorder: MediaRecorder | null = null;
    private recordedChunks: Blob[] = [];
    private inputStream: MediaStream | null = null;
    private inputNode: AudioNode | null = null;
    private mediaStreamDestination: MediaStreamAudioDestinationNode | null = null;
    private analyser: AnalyserNode | null = null;
    private silenceThreshold: number = 0.01;
    private silenceStartTime: number = 0;
    private hasDetectedSound: boolean = false;

    // Callbacks
    private onLoopAdded: ((loop: Loop) => void) | null = null;
    private onTimeUpdate: ((time: number) => void) | null = null;

    constructor(duration: number = 10) {
        this.duration = duration;
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

    /**
     * Get the input node for connecting upstream audio
     */
    getInputNode(): GainNode | null {
        const ctx = getAudioContext();
        if (!ctx) return null;

        if (!this.analyser) {
            // Create analyser for silence detection
            this.analyser = ctx.createAnalyser();
            this.analyser.fftSize = 256;

            // Create MediaStreamDestination for recording from AudioNode
            this.mediaStreamDestination = ctx.createMediaStreamDestination();

            // Connect analyser to destination
            this.analyser.connect(this.mediaStreamDestination);

            // Store the stream for MediaRecorder
            this.inputStream = this.mediaStreamDestination.stream;
        }

        // Return analyser as input (it passes audio through)
        return this.analyser as unknown as GainNode;
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
     * Start recording (auto-starts when sound detected)
     */
    async startRecording(): Promise<void> {
        if (this.isRecording) return;

        const ctx = getAudioContext();
        if (!ctx || !this.analyser) return;

        this.isRecording = true;
        this.hasDetectedSound = false;
        this.recordedChunks = [];

        // Set up MediaRecorder if we have an input stream
        if (this.inputStream) {
            this.mediaRecorder = new MediaRecorder(this.inputStream, {
                mimeType: 'audio/webm;codecs=opus'
            });

            this.mediaRecorder.ondataavailable = (e) => {
                if (e.data.size > 0) {
                    this.recordedChunks.push(e.data);
                }
            };

            this.mediaRecorder.onstop = () => this.processRecording();
        }

        // Start monitoring for sound
        this.monitorForSound();
    }

    /**
     * Monitor audio level and auto-start/stop recording
     */
    private monitorForSound(): void {
        if (!this.isRecording || !this.analyser) return;

        const dataArray = new Uint8Array(this.analyser.frequencyBinCount);
        this.analyser.getByteTimeDomainData(dataArray);

        // Calculate RMS level
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) {
            const sample = (dataArray[i] - 128) / 128;
            sum += sample * sample;
        }
        const rms = Math.sqrt(sum / dataArray.length);

        const ctx = getAudioContext();
        if (!ctx) return;

        if (rms > this.silenceThreshold) {
            if (!this.hasDetectedSound) {
                // First sound detected - start actual recording
                this.hasDetectedSound = true;
                this.startTime = ctx.currentTime;
                this.mediaRecorder?.start();
            }
            this.silenceStartTime = ctx.currentTime;
        } else if (this.hasDetectedSound) {
            // Check if we've had a full loop of silence
            const silenceDuration = ctx.currentTime - this.silenceStartTime;
            if (silenceDuration >= this.duration) {
                this.stopRecording();
                return;
            }
        }

        // Update current time
        if (this.hasDetectedSound) {
            this.currentTime = (ctx.currentTime - this.startTime) % this.duration;
            this.onTimeUpdate?.(this.currentTime);
        }

        requestAnimationFrame(() => this.monitorForSound());
    }

    /**
     * Stop recording manually
     */
    stopRecording(): void {
        if (!this.isRecording) return;

        this.isRecording = false;

        // Safely stop MediaRecorder - state could change between check and stop
        if (this.mediaRecorder) {
            try {
                // Only stop if in recording or paused state
                if (this.mediaRecorder.state === 'recording' || this.mediaRecorder.state === 'paused') {
                    this.mediaRecorder.stop();
                }
            } catch (err) {
                console.debug('MediaRecorder.stop() failed:', err);
            }
        }
    }

    /**
     * Process the recorded audio into a loop
     */
    private async processRecording(): Promise<void> {
        if (this.recordedChunks.length === 0) return;

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
                sourceNode: null
            };

            this.loops.push(loop);
            this.onLoopAdded?.(loop);

            // Auto-start playing the loop
            this.playLoop(loop);
        } catch (err) {
            console.error('Failed to decode recorded audio:', err);
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
