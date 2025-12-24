/**
 * Audio Latency Testing Utilities
 *
 * Provides functions for:
 * - Platform detection (Windows, Mac, Linux)
 * - Audio device detection and analysis
 * - Latency measurement
 * - Audio system testing
 */

// ============================================
// Types
// ============================================

export type Platform = 'windows' | 'mac' | 'linux' | 'unknown';

export interface AudioDeviceInfo {
  deviceId: string;
  label: string;
  kind: 'audioinput' | 'audiooutput';
  isDefault: boolean;
  isExternal: boolean;
  manufacturer?: string;
}

export interface LatencyInfo {
  baseLatency: number;
  outputLatency: number;
  totalLatency: number;
  sampleRate: number;
}

export interface AudioTestResult {
  success: boolean;
  message: string;
  data?: unknown;
}

// ============================================
// Platform Detection
// ============================================

/**
 * Detect the user's operating system
 */
export function detectPlatform(): Platform {
  const userAgent = navigator.userAgent.toLowerCase();
  const platform = navigator.platform?.toLowerCase() || '';

  if (platform.includes('win') || userAgent.includes('windows')) {
    return 'windows';
  }

  if (
    platform.includes('mac') ||
    userAgent.includes('macintosh') ||
    userAgent.includes('mac os')
  ) {
    return 'mac';
  }

  if (platform.includes('linux') || userAgent.includes('linux')) {
    return 'linux';
  }

  return 'unknown';
}

/**
 * Get human-readable platform name
 */
export function getPlatformName(platform: Platform): string {
  switch (platform) {
    case 'windows':
      return 'Windows';
    case 'mac':
      return 'macOS';
    case 'linux':
      return 'Linux';
    default:
      return 'Unknown OS';
  }
}

// ============================================
// Audio Device Detection
// ============================================

/**
 * Check if the browser supports audio device enumeration
 */
export function supportsDeviceEnumeration(): boolean {
  return !!(
    navigator.mediaDevices &&
    typeof navigator.mediaDevices.enumerateDevices === 'function'
  );
}

/**
 * Request microphone permission (needed to get device labels)
 */
export async function requestMicrophonePermission(): Promise<boolean> {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    // Stop all tracks immediately - we just needed the permission
    stream.getTracks().forEach((track) => track.stop());
    return true;
  } catch {
    return false;
  }
}

/**
 * Get all audio devices with detailed info
 */
export async function getAudioDevices(): Promise<AudioDeviceInfo[]> {
  if (!supportsDeviceEnumeration()) {
    return [];
  }

  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const audioDevices: AudioDeviceInfo[] = [];

    for (const device of devices) {
      if (device.kind === 'audioinput' || device.kind === 'audiooutput') {
        audioDevices.push({
          deviceId: device.deviceId,
          label: device.label || `${device.kind} (${device.deviceId.slice(0, 8)})`,
          kind: device.kind,
          isDefault: device.deviceId === 'default',
          isExternal: isExternalDevice(device.label),
          manufacturer: extractManufacturer(device.label),
        });
      }
    }

    return audioDevices;
  } catch {
    return [];
  }
}

/**
 * Check if a device appears to be an external audio interface
 */
export function isExternalDevice(label: string): boolean {
  if (!label) return false;

  const lowerLabel = label.toLowerCase();

  // Common USB audio interface brands
  const externalIndicators = [
    'focusrite',
    'scarlett',
    'usb',
    'external',
    'interface',
    'motu',
    'presonus',
    'steinberg',
    'universal audio',
    'ua',
    'apollo',
    'audient',
    'ssl',
    'rme',
    'behringer',
    'tascam',
    'zoom',
    'native instruments',
    'komplete audio',
    'm-audio',
    'arturia',
    'minifuse',
    'audiofuse',
    'clarett',
    '2i2',
    '4i4',
    '18i8',
    '18i20',
    'solo',
  ];

  // Exclude built-in devices
  const builtInIndicators = [
    'built-in',
    'internal',
    'speakers',
    'headphone',
    'macbook',
    'realtek',
    'conexant',
    'intel',
    'cirrus',
  ];

  // Check for built-in indicators first
  if (builtInIndicators.some((indicator) => lowerLabel.includes(indicator))) {
    return false;
  }

  // Check for external indicators
  return externalIndicators.some((indicator) => lowerLabel.includes(indicator));
}

/**
 * Extract manufacturer name from device label
 */
function extractManufacturer(label: string): string | undefined {
  if (!label) return undefined;

  const lowerLabel = label.toLowerCase();

  const manufacturers: Record<string, string> = {
    focusrite: 'Focusrite',
    scarlett: 'Focusrite',
    motu: 'MOTU',
    presonus: 'PreSonus',
    steinberg: 'Steinberg',
    'universal audio': 'Universal Audio',
    apollo: 'Universal Audio',
    audient: 'Audient',
    ssl: 'SSL',
    rme: 'RME',
    behringer: 'Behringer',
    tascam: 'Tascam',
    zoom: 'Zoom',
    'native instruments': 'Native Instruments',
    'm-audio': 'M-Audio',
    arturia: 'Arturia',
  };

  for (const [key, value] of Object.entries(manufacturers)) {
    if (lowerLabel.includes(key)) {
      return value;
    }
  }

  return undefined;
}

/**
 * Check if any external audio device is connected
 */
export async function hasExternalAudioDevice(): Promise<boolean> {
  const devices = await getAudioDevices();
  return devices.some((d) => d.isExternal);
}

/**
 * Get external audio devices only
 */
export async function getExternalAudioDevices(): Promise<AudioDeviceInfo[]> {
  const devices = await getAudioDevices();
  return devices.filter((d) => d.isExternal);
}

// ============================================
// Latency Measurement
// ============================================

/**
 * Get current AudioContext latency information
 */
export function getLatencyInfo(audioContext?: AudioContext): LatencyInfo {
  const ctx = audioContext || new AudioContext();

  const baseLatency = ctx.baseLatency || 0;
  const outputLatency =
    'outputLatency' in ctx ? (ctx as AudioContext).outputLatency : 0;

  const info: LatencyInfo = {
    baseLatency: baseLatency * 1000, // Convert to ms
    outputLatency: outputLatency * 1000, // Convert to ms
    totalLatency: (baseLatency + outputLatency) * 1000,
    sampleRate: ctx.sampleRate,
  };

  // Close the context if we created it
  if (!audioContext && ctx.state !== 'closed') {
    ctx.close();
  }

  return info;
}

/**
 * Get latency quality rating
 */
export function getLatencyRating(
  totalLatencyMs: number
): 'good' | 'okay' | 'bad' {
  if (totalLatencyMs < 10) return 'good';
  if (totalLatencyMs < 20) return 'okay';
  return 'bad';
}

/**
 * Format latency for display
 */
export function formatLatency(ms: number): string {
  if (ms === 0) return '0 ms';
  if (ms < 1) return `${(ms * 1000).toFixed(1)} µs`;
  return `${ms.toFixed(1)} ms`;
}

// ============================================
// Audio System Tests
// ============================================

/**
 * Test if AudioContext can be created and started
 */
export async function testAudioContextCreation(): Promise<AudioTestResult> {
  try {
    const ctx = new AudioContext();

    // Resume if suspended (browser autoplay policy)
    if (ctx.state === 'suspended') {
      await ctx.resume();
    }

    const result: AudioTestResult = {
      success: ctx.state === 'running',
      message:
        ctx.state === 'running'
          ? `Audio system ready (${ctx.sampleRate} Hz)`
          : `AudioContext state: ${ctx.state}`,
      data: {
        state: ctx.state,
        sampleRate: ctx.sampleRate,
      },
    };

    await ctx.close();
    return result;
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Failed to create AudioContext',
    };
  }
}

/**
 * Test audio playback by generating a short beep
 */
export async function testAudioPlayback(): Promise<AudioTestResult> {
  try {
    const ctx = new AudioContext();

    if (ctx.state === 'suspended') {
      await ctx.resume();
    }

    // Create a short beep (440Hz for 100ms)
    const oscillator = ctx.createOscillator();
    const gainNode = ctx.createGain();

    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(440, ctx.currentTime);

    gainNode.gain.setValueAtTime(0.1, ctx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.1);

    oscillator.connect(gainNode);
    gainNode.connect(ctx.destination);

    oscillator.start(ctx.currentTime);
    oscillator.stop(ctx.currentTime + 0.1);

    // Wait for the beep to finish
    await new Promise((resolve) => setTimeout(resolve, 150));

    await ctx.close();

    return {
      success: true,
      message: 'Audio playback working',
    };
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Audio playback failed',
    };
  }
}

/**
 * Test microphone input availability
 */
export async function testMicrophoneInput(): Promise<AudioTestResult> {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
      },
    });

    // Get audio level from stream
    const ctx = new AudioContext();
    const source = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    source.connect(analyser);

    const dataArray = new Uint8Array(analyser.frequencyBinCount);
    analyser.getByteFrequencyData(dataArray);

    // Check if any audio is being received
    const hasAudio = dataArray.some((value) => value > 0);

    // Cleanup
    stream.getTracks().forEach((track) => track.stop());
    await ctx.close();

    return {
      success: true,
      message: hasAudio ? 'Microphone receiving audio' : 'Microphone connected (no audio detected)',
      data: { hasAudio },
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Microphone access failed';
    return {
      success: false,
      message: errorMessage.includes('Permission')
        ? 'Microphone permission denied'
        : errorMessage,
    };
  }
}

/**
 * Comprehensive audio system test
 */
export async function runFullAudioTest(): Promise<{
  platform: Platform;
  devices: AudioDeviceInfo[];
  latency: LatencyInfo;
  tests: {
    context: AudioTestResult;
    playback: AudioTestResult;
    microphone: AudioTestResult;
  };
}> {
  const platform = detectPlatform();
  const devices = await getAudioDevices();
  const latency = getLatencyInfo();

  const context = await testAudioContextCreation();
  const playback = await testAudioPlayback();
  const microphone = await testMicrophoneInput();

  return {
    platform,
    devices,
    latency,
    tests: {
      context,
      playback,
      microphone,
    },
  };
}

// ============================================
// Power Settings Detection (Best Effort)
// ============================================

/**
 * Check if device is likely on battery (affects performance)
 */
export async function checkBatteryStatus(): Promise<{
  onBattery: boolean;
  level: number | null;
}> {
  try {
    if ('getBattery' in navigator) {
      // @ts-expect-error - getBattery is not in TypeScript types
      const battery = await navigator.getBattery();
      return {
        onBattery: !battery.charging,
        level: battery.level * 100,
      };
    }
  } catch {
    // Battery API not available
  }

  return {
    onBattery: false,
    level: null,
  };
}

// ============================================
// Sample Rate Recommendations
// ============================================

/**
 * Get recommended sample rate based on platform
 */
export function getRecommendedSampleRate(_platform: Platform): number {
  // 48kHz is generally recommended for slightly lower latency
  // and is the default for most professional audio work
  return 48000;
}

/**
 * Get recommended buffer size based on platform
 */
export function getRecommendedBufferSize(platform: Platform): number {
  switch (platform) {
    case 'mac':
      // Mac can typically handle lower buffer sizes
      return 128;
    case 'windows':
      // Windows often needs larger buffers for stability
      return 256;
    default:
      return 256;
  }
}

/**
 * Calculate latency from buffer size and sample rate
 */
export function calculateBufferLatency(
  bufferSize: number,
  sampleRate: number
): number {
  return (bufferSize / sampleRate) * 1000; // ms
}
