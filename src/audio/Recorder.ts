/**
 * Recorder - Record audio and export as WAV
 *
 * Records audio from an input node and exports as WAV file.
 * Uses MediaRecorder for capturing and AudioBuffer for WAV conversion.
 */

import { getAudioContext } from './AudioEngine';

// ============================================================================
// Types
// ============================================================================

export interface Recording {
    id: string;
    blob: Blob;
    duration: number;
    timestamp: number;
    name: string;
}

type RecordingCallback = (recording: Recording) => void;
type TimeUpdateCallback = (time: number) => void;

// ============================================================================
// Recorder Class
// ============================================================================

export class Recorder {
    private inputNode: GainNode | null = null;
    private mediaStreamDestination: MediaStreamAudioDestinationNode | null = null;
    private mediaRecorder: MediaRecorder | null = null;
    private recordedChunks: Blob[] = [];
    private isRecording: boolean = false;
    private startTime: number = 0;
    private recordings: Recording[] = [];

    // Callbacks
    private onRecordingComplete: RecordingCallback | null = null;
    private onTimeUpdate: TimeUpdateCallback | null = null;

    // Time tracking
    private timeUpdateInterval: number | null = null;

    constructor() {
        this.initInput();
    }

    /**
     * Initialize input node and media stream destination
     */
    private initInput(): void {
        const ctx = getAudioContext();
        if (!ctx) return;

        // Create input gain node
        this.inputNode = ctx.createGain();
        this.inputNode.gain.value = 1;

        // Create MediaStreamDestination for recording
        this.mediaStreamDestination = ctx.createMediaStreamDestination();
        this.inputNode.connect(this.mediaStreamDestination);
    }

    /**
     * Get input node for connecting upstream audio
     */
    getInput(): GainNode | null {
        return this.inputNode;
    }

    /**
     * Set callback for when recording completes
     */
    setOnRecordingComplete(callback: RecordingCallback): void {
        this.onRecordingComplete = callback;
    }

    /**
     * Set callback for time updates during recording
     */
    setOnTimeUpdate(callback: TimeUpdateCallback): void {
        this.onTimeUpdate = callback;
    }

    /**
     * Check if currently recording
     */
    getIsRecording(): boolean {
        return this.isRecording;
    }

    /**
     * Get all recordings
     */
    getRecordings(): Recording[] {
        return [...this.recordings];
    }

    /**
     * Start recording
     */
    startRecording(): void {
        if (this.isRecording || !this.mediaStreamDestination) return;

        this.recordedChunks = [];
        this.isRecording = true;
        this.startTime = Date.now();

        // Create MediaRecorder
        try {
            this.mediaRecorder = new MediaRecorder(this.mediaStreamDestination.stream, {
                mimeType: 'audio/webm;codecs=opus'
            });
        } catch {
            // Fallback for browsers that don't support opus
            this.mediaRecorder = new MediaRecorder(this.mediaStreamDestination.stream);
        }

        this.mediaRecorder.ondataavailable = (e) => {
            if (e.data.size > 0) {
                this.recordedChunks.push(e.data);
            }
        };

        this.mediaRecorder.onstop = () => {
            this.processRecording();
        };

        this.mediaRecorder.start(100); // Collect data every 100ms

        // Start time update interval
        this.timeUpdateInterval = window.setInterval(() => {
            if (this.isRecording) {
                const elapsed = (Date.now() - this.startTime) / 1000;
                this.onTimeUpdate?.(elapsed);
            }
        }, 100);
    }

    /**
     * Stop recording
     */
    stopRecording(): void {
        if (!this.isRecording || !this.mediaRecorder) return;

        this.isRecording = false;
        this.mediaRecorder.stop();

        if (this.timeUpdateInterval) {
            clearInterval(this.timeUpdateInterval);
            this.timeUpdateInterval = null;
        }
    }

    /**
     * Process the recorded audio
     */
    private async processRecording(): Promise<void> {
        if (this.recordedChunks.length === 0) return;

        const duration = (Date.now() - this.startTime) / 1000;
        const webmBlob = new Blob(this.recordedChunks, { type: 'audio/webm' });

        // Convert WebM to WAV
        const wavBlob = await this.convertToWav(webmBlob);

        const recording: Recording = {
            id: `rec-${Date.now()}`,
            blob: wavBlob,
            duration,
            timestamp: this.startTime,
            name: `Recording ${this.recordings.length + 1}`
        };

        this.recordings.push(recording);
        this.onRecordingComplete?.(recording);
    }

    /**
     * Convert audio blob to WAV format
     */
    private async convertToWav(blob: Blob): Promise<Blob> {
        const ctx = getAudioContext();
        if (!ctx) return blob;

        try {
            const arrayBuffer = await blob.arrayBuffer();
            const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
            return this.audioBufferToWav(audioBuffer);
        } catch (e) {
            console.error('Failed to convert to WAV:', e);
            return blob; // Return original if conversion fails
        }
    }

    /**
     * Convert AudioBuffer to WAV Blob
     */
    private audioBufferToWav(buffer: AudioBuffer): Blob {
        const numChannels = buffer.numberOfChannels;
        const sampleRate = buffer.sampleRate;
        const format = 1; // PCM
        const bitDepth = 16;

        const bytesPerSample = bitDepth / 8;
        const blockAlign = numChannels * bytesPerSample;

        // Interleave channels
        const length = buffer.length;
        const interleaved = new Float32Array(length * numChannels);

        for (let i = 0; i < length; i++) {
            for (let channel = 0; channel < numChannels; channel++) {
                const channelData = buffer.getChannelData(channel);
                interleaved[i * numChannels + channel] = channelData[i];
            }
        }

        // Convert to 16-bit PCM
        const dataLength = interleaved.length * bytesPerSample;
        const wavBuffer = new ArrayBuffer(44 + dataLength);
        const view = new DataView(wavBuffer);

        // WAV header
        this.writeString(view, 0, 'RIFF');
        view.setUint32(4, 36 + dataLength, true);
        this.writeString(view, 8, 'WAVE');
        this.writeString(view, 12, 'fmt ');
        view.setUint32(16, 16, true); // Subchunk1Size
        view.setUint16(20, format, true);
        view.setUint16(22, numChannels, true);
        view.setUint32(24, sampleRate, true);
        view.setUint32(28, sampleRate * blockAlign, true);
        view.setUint16(32, blockAlign, true);
        view.setUint16(34, bitDepth, true);
        this.writeString(view, 36, 'data');
        view.setUint32(40, dataLength, true);

        // Write audio data
        const offset = 44;
        for (let i = 0; i < interleaved.length; i++) {
            const sample = Math.max(-1, Math.min(1, interleaved[i]));
            const intSample = sample < 0 ? sample * 0x8000 : sample * 0x7FFF;
            view.setInt16(offset + i * bytesPerSample, intSample, true);
        }

        return new Blob([wavBuffer], { type: 'audio/wav' });
    }

    /**
     * Write string to DataView
     */
    private writeString(view: DataView, offset: number, str: string): void {
        for (let i = 0; i < str.length; i++) {
            view.setUint8(offset + i, str.charCodeAt(i));
        }
    }

    /**
     * Download a recording as WAV file
     */
    downloadRecording(recordingId: string): void {
        const recording = this.recordings.find(r => r.id === recordingId);
        if (!recording) return;

        const url = URL.createObjectURL(recording.blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${recording.name.replace(/\s+/g, '_')}.wav`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    /**
     * Delete a recording
     */
    deleteRecording(recordingId: string): void {
        const index = this.recordings.findIndex(r => r.id === recordingId);
        if (index !== -1) {
            this.recordings.splice(index, 1);
        }
    }

    /**
     * Rename a recording
     */
    renameRecording(recordingId: string, newName: string): void {
        const recording = this.recordings.find(r => r.id === recordingId);
        if (recording) {
            recording.name = newName;
        }
    }

    /**
     * Disconnect and cleanup
     */
    disconnect(): void {
        this.stopRecording();

        if (this.inputNode) {
            this.inputNode.disconnect();
            this.inputNode = null;
        }

        if (this.mediaStreamDestination) {
            this.mediaStreamDestination.disconnect();
            this.mediaStreamDestination = null;
        }

        this.mediaRecorder = null;
        this.recordings = [];
    }
}
