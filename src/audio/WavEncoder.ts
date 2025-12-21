/**
 * WAV Encoder - Convert audio data to WAV format
 *
 * Features:
 * - Decode WebM blobs from MediaRecorder to AudioBuffer
 * - Encode AudioBuffer to 16-bit PCM WAV
 * - Pure JavaScript, no dependencies
 */

// ============================================================================
// Types
// ============================================================================

export interface WavEncoderOptions {
  sampleRate?: number;
  bitDepth?: 16 | 24 | 32;
  channels?: 1 | 2;
}

// ============================================================================
// Decoder: WebM/Opus -> AudioBuffer
// ============================================================================

/**
 * Decode a WebM blob (from MediaRecorder) to an AudioBuffer
 */
export async function decodeWebMToAudioBuffer(webmBlob: Blob): Promise<AudioBuffer> {
  const audioContext = new AudioContext();

  try {
    const arrayBuffer = await webmBlob.arrayBuffer();
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
    return audioBuffer;
  } finally {
    await audioContext.close();
  }
}

// ============================================================================
// Encoder: AudioBuffer -> WAV
// ============================================================================

/**
 * Write a string to a DataView at the given offset
 */
function writeString(view: DataView, offset: number, str: string): void {
  for (let i = 0; i < str.length; i++) {
    view.setUint8(offset + i, str.charCodeAt(i));
  }
}

/**
 * Encode an AudioBuffer to WAV format (16-bit PCM)
 */
export function encodeWAV(
  audioBuffer: AudioBuffer,
  options: WavEncoderOptions = {}
): ArrayBuffer {
  const {
    bitDepth = 16,
  } = options;

  const numChannels = audioBuffer.numberOfChannels;
  const sampleRate = audioBuffer.sampleRate;
  const bytesPerSample = bitDepth / 8;
  const blockAlign = numChannels * bytesPerSample;

  // Interleave channels
  const length = audioBuffer.length * numChannels;
  const interleaved = new Float32Array(length);

  for (let channel = 0; channel < numChannels; channel++) {
    const channelData = audioBuffer.getChannelData(channel);
    for (let i = 0; i < audioBuffer.length; i++) {
      interleaved[i * numChannels + channel] = channelData[i];
    }
  }

  // Calculate sizes
  const dataLength = length * bytesPerSample;
  const headerSize = 44;
  const fileSize = headerSize + dataLength;

  // Create buffer
  const buffer = new ArrayBuffer(fileSize);
  const view = new DataView(buffer);

  // ========================================
  // WAV Header (44 bytes)
  // ========================================

  // RIFF chunk descriptor
  writeString(view, 0, 'RIFF');
  view.setUint32(4, fileSize - 8, true); // File size - 8
  writeString(view, 8, 'WAVE');

  // fmt sub-chunk
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true); // Sub-chunk size (16 for PCM)
  view.setUint16(20, 1, true); // Audio format (1 = PCM)
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true); // Byte rate
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitDepth, true);

  // data sub-chunk
  writeString(view, 36, 'data');
  view.setUint32(40, dataLength, true);

  // ========================================
  // Write PCM samples
  // ========================================

  let offset = headerSize;

  if (bitDepth === 16) {
    for (let i = 0; i < interleaved.length; i++) {
      // Clamp to -1...1 range
      const sample = Math.max(-1, Math.min(1, interleaved[i]));
      // Convert to 16-bit signed integer
      const int16 = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
      view.setInt16(offset, int16, true);
      offset += 2;
    }
  } else if (bitDepth === 24) {
    for (let i = 0; i < interleaved.length; i++) {
      const sample = Math.max(-1, Math.min(1, interleaved[i]));
      const int24 = sample < 0 ? sample * 0x800000 : sample * 0x7fffff;
      // 24-bit is written as 3 bytes
      view.setUint8(offset, int24 & 0xff);
      view.setUint8(offset + 1, (int24 >> 8) & 0xff);
      view.setUint8(offset + 2, (int24 >> 16) & 0xff);
      offset += 3;
    }
  } else if (bitDepth === 32) {
    for (let i = 0; i < interleaved.length; i++) {
      const sample = Math.max(-1, Math.min(1, interleaved[i]));
      const int32 = sample < 0 ? sample * 0x80000000 : sample * 0x7fffffff;
      view.setInt32(offset, int32, true);
      offset += 4;
    }
  }

  return buffer;
}

// ============================================================================
// High-Level API
// ============================================================================

/**
 * Convert a WebM blob (from MediaRecorder) to a WAV blob
 */
export async function convertWebMToWAV(
  webmBlob: Blob,
  options: WavEncoderOptions = {}
): Promise<Blob> {
  const audioBuffer = await decodeWebMToAudioBuffer(webmBlob);
  const wavBuffer = encodeWAV(audioBuffer, options);
  return new Blob([wavBuffer], { type: 'audio/wav' });
}

/**
 * Convert an AudioBuffer directly to a WAV blob
 */
export function audioBufferToWAV(
  audioBuffer: AudioBuffer,
  options: WavEncoderOptions = {}
): Blob {
  const wavBuffer = encodeWAV(audioBuffer, options);
  return new Blob([wavBuffer], { type: 'audio/wav' });
}

// ============================================================================
// Utilities
// ============================================================================

/**
 * Generate a timestamped filename for recordings
 */
export function generateRecordingFilename(prefix = 'recording'): string {
  const now = new Date();
  const timestamp = now
    .toISOString()
    .replace(/:/g, '-') // Windows-safe
    .replace(/\./g, '-')
    .replace('T', '_')
    .replace('Z', '');

  return `${prefix}_${timestamp}.wav`;
}

/**
 * Get audio duration from a blob
 */
export async function getAudioDuration(blob: Blob): Promise<number> {
  const audioBuffer = await decodeWebMToAudioBuffer(blob);
  return audioBuffer.duration;
}
