/**
 * Recorder - Record audio and export as WAV
 *
 * Records audio from an input node and exports as WAV file.
 * Uses MediaRecorder for capturing and AudioBuffer for WAV conversion.
 */

import { getAudioContext } from './AudioEngine';
import { convertWebMToWAV } from './WavEncoder';

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

// Maximum number of recordings to keep in memory to prevent memory leaks
const MAX_RECORDINGS = 50;

// Interval in ms for collecting recording data chunks
// Lower values = more responsive but higher overhead, higher values = more latency but efficient
const RECORDING_CHUNK_INTERVAL_MS = 100;

// Interval in ms for updating the recording time display
const TIME_UPDATE_INTERVAL_MS = 100;

// Maximum suffix attempts when checking for duplicate filenames
const MAX_FILENAME_SUFFIX = 100;

// Maximum filename length (Windows has 255 char limit for path components)
const MAX_FILENAME_LENGTH = 200;

// Windows reserved filenames that cannot be used
const WINDOWS_RESERVED_NAMES = /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/i;

/**
 * Sanitize a filename for safe filesystem usage
 * Handles:
 * - Unsafe characters removal
 * - Leading/trailing dots and special chars
 * - Windows reserved names
 * - Length limits
 */
function sanitizeFilename(name: string, fallback = 'Recording'): string {
    // Remove unsafe characters, keep alphanumeric, spaces, hyphens, underscores
    let safe = name.replace(/[^a-zA-Z0-9\s\-_]/g, '').replace(/\s+/g, '_').trim();

    // Remove leading/trailing dots, hyphens, and underscores
    safe = safe.replace(/^[.\-_]+|[.\-_]+$/g, '');

    // Handle Windows reserved names
    if (WINDOWS_RESERVED_NAMES.test(safe)) {
        safe = `file_${safe}`;
    }

    // Enforce length limit
    if (safe.length > MAX_FILENAME_LENGTH) {
        safe = safe.slice(0, MAX_FILENAME_LENGTH);
        // Ensure we don't cut in the middle of a multi-byte sequence
        // by trimming any trailing incomplete chars
        safe = safe.replace(/[.\-_]+$/, '');
    }

    // Return fallback if empty after sanitization
    return safe || fallback;
}

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

        this.mediaRecorder.start(RECORDING_CHUNK_INTERVAL_MS);

        // Start time update interval
        this.timeUpdateInterval = window.setInterval(() => {
            if (this.isRecording) {
                const elapsed = (Date.now() - this.startTime) / 1000;
                this.onTimeUpdate?.(elapsed);
            }
        }, TIME_UPDATE_INTERVAL_MS);
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

        // Enforce memory limit - remove oldest recordings if we exceed the limit
        while (this.recordings.length > MAX_RECORDINGS) {
            const removed = this.recordings.shift();
            if (removed) {
                console.warn(`[Recorder] Removed old recording "${removed.name}" to stay under memory limit`);
            }
        }

        this.onRecordingComplete?.(recording);
    }

    /**
     * Convert audio blob to WAV format
     * Uses shared WavEncoder utility to avoid code duplication
     */
    private async convertToWav(blob: Blob): Promise<Blob> {
        try {
            return await convertWebMToWAV(blob);
        } catch (e) {
            console.error('Failed to convert to WAV:', e);
            return blob; // Return original if conversion fails
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
     * Save a recording to the project folder
     * Returns the relative path of the saved file, or null on failure
     */
    async saveRecordingToProject(
        recordingId: string,
        projectHandle: FileSystemDirectoryHandle
    ): Promise<{ path: string; duration: number; sampleRate: number } | null> {
        const recording = this.recordings.find(r => r.id === recordingId);
        if (!recording) return null;

        try {
            // Navigate to audio/recordings folder
            const audioDir = await projectHandle.getDirectoryHandle('audio', { create: true });
            const recordingsDir = await audioDir.getDirectoryHandle('recordings', { create: true });

            // Generate filename with timestamp
            const timestamp = new Date(recording.timestamp).toISOString()
                .replace(/[:.]/g, '-')
                .replace('T', '_')
                .slice(0, 19);
            // Sanitize name using comprehensive sanitization function
            const safeName = sanitizeFilename(recording.name);

            // Generate unique filename - check for duplicates and add suffix if needed
            let filename = `${safeName}_${timestamp}.wav`;
            let suffix = 1;
            while (suffix < MAX_FILENAME_SUFFIX) {
                try {
                    // Check if file already exists
                    await recordingsDir.getFileHandle(filename, { create: false });
                    // File exists, try with suffix
                    suffix++;
                    filename = `${safeName}_${timestamp}_${suffix}.wav`;
                } catch {
                    // File doesn't exist, we can use this name
                    break;
                }
            }

            // Create and write file
            const fileHandle = await recordingsDir.getFileHandle(filename, { create: true });
            const writable = await fileHandle.createWritable();
            try {
                await writable.write(recording.blob);
                await writable.close();
            } catch (err) {
                await writable.abort().catch(() => {});
                throw err;
            }

            // Get audio info for manifest
            const ctx = getAudioContext();
            const sampleRate = ctx?.sampleRate ?? 44100;

            return {
                path: `audio/recordings/${filename}`,
                duration: recording.duration,
                sampleRate
            };
        } catch (err) {
            console.error('[Recorder] Failed to save to project:', err);
            return null;
        }
    }

    /**
     * Get a recording blob by ID (for external save operations)
     */
    getRecordingBlob(recordingId: string): Blob | null {
        const recording = this.recordings.find(r => r.id === recordingId);
        return recording?.blob ?? null;
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
