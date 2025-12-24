/**
 * MIDI Type Definitions
 * Core types for Web MIDI API integration in OpenJammer
 */

// ============================================================================
// MIDI Message Events
// ============================================================================

export interface MIDINoteEvent {
  type: 'noteOn' | 'noteOff';
  note: number;           // 0-127
  velocity: number;       // 0-127 (0 = note off for noteOn)
  normalizedVelocity: number; // 0-1
  channel: number;        // 0-15
  timestamp: number;      // DOMHighResTimeStamp
  deviceId: string;
}

export interface MIDICCEvent {
  type: 'cc';
  controller: number;     // CC number 0-127
  value: number;          // 0-127
  normalizedValue: number; // 0-1
  channel: number;        // 0-15
  timestamp: number;
  deviceId: string;
}

export interface MIDIPitchBendEvent {
  type: 'pitchBend';
  value: number;          // -8192 to +8191 (0 = center)
  normalizedValue: number; // -1 to +1
  channel: number;        // 0-15
  timestamp: number;
  deviceId: string;
}

export interface MIDIAftertouchEvent {
  type: 'aftertouch';
  pressure: number;       // 0-127
  normalizedPressure: number; // 0-1
  note?: number;          // For polyphonic aftertouch
  channel: number;
  timestamp: number;
  deviceId: string;
}

export interface MIDIProgramChangeEvent {
  type: 'programChange';
  program: number;        // 0-127
  channel: number;
  timestamp: number;
  deviceId: string;
}

export type MIDIEvent =
  | MIDINoteEvent
  | MIDICCEvent
  | MIDIPitchBendEvent
  | MIDIAftertouchEvent
  | MIDIProgramChangeEvent;

// ============================================================================
// Device Information
// ============================================================================

export interface MIDIDeviceInfo {
  id: string;
  name: string;
  manufacturer: string;
  state: 'connected' | 'disconnected';
  type: 'input' | 'output';
  version?: string;
}

// ============================================================================
// Device Presets
// ============================================================================

export interface MIDIKeyboardLayout {
  noteRange: [number, number]; // [startNote, endNote]
  range?: [number, number];    // Alias for noteRange (for compatibility)
  channel: number;
  hasVelocity: boolean;
  hasAftertouch: boolean;
}

export interface MIDIPadLayout {
  id: string;
  name: string;
  note: number;
  channel: number;
  hasVelocity: boolean;
  hasAftertouch: boolean;
  color?: string; // RGB hex for visualization
}

export interface MIDIKnobLayout {
  id: string;
  name: string;
  cc: number;
  channel: number;
  mode: 'absolute' | 'relative';
  defaultValue?: number;
  minValue?: number;
  maxValue?: number;
}

export interface MIDIFaderLayout {
  id: string;
  name: string;
  cc: number;
  channel: number;
  defaultValue?: number;
}

export interface MIDIButtonLayout {
  id: string;
  name: string;
  note?: number;
  cc?: number;
  channel: number;
  isToggle: boolean;
}

export interface MIDIDeviceVisualization {
  svgPath?: string;           // Path to SVG file for device image
  width: number;              // Visualization width
  height: number;             // Visualization height
  controlPositions: Record<string, { x: number; y: number; width?: number; height?: number }>;
}

export interface MIDIDevicePreset {
  id: string;                 // Unique preset ID (e.g., "arturia-minilab-3")
  name: string;               // Display name
  manufacturer: string;       // Manufacturer name
  matchPatterns: string[];    // USB device name patterns for auto-detection

  controls: {
    keys?: MIDIKeyboardLayout;
    pads?: MIDIPadLayout[];
    knobs?: MIDIKnobLayout[];
    faders?: MIDIFaderLayout[];
    buttons?: MIDIButtonLayout[];
    pitchBend?: { channel: number };
    modWheel?: { cc: number; channel: number };
  };

  // Port configuration for known multi-port devices
  preferredPort?: string;     // Port name pattern to use (e.g., "MiniLab 3 MIDI")
  ignorePorts?: string[];     // Port patterns to ignore (e.g., ["MCU", "DIN Thru"])

  visualization: MIDIDeviceVisualization;
}

// ============================================================================
// MIDI Manager Types
// ============================================================================

export interface MIDIManagerConfig {
  sysex?: boolean;           // Request SysEx access (requires more permissions)
  software?: boolean;        // Include software synths
}

export type MIDIEventCallback = (event: MIDIEvent) => void;
export type MIDIDeviceCallback = (device: MIDIDeviceInfo) => void;

export interface MIDISubscription {
  unsubscribe: () => void;
}

// ============================================================================
// MIDI Store Types (for Zustand)
// ============================================================================

export interface MIDIStoreState {
  // Initialization state
  isSupported: boolean;
  isInitialized: boolean;
  error: string | null;

  // Connected devices
  inputs: Map<string, MIDIDeviceInfo>;
  outputs: Map<string, MIDIDeviceInfo>;

  // Active device for monitoring
  activeInputId: string | null;

  // Real-time data (use transient updates for these)
  lastMessage: MIDIEvent | null;
  controlValues: Map<string, number>; // "deviceId:channel:cc" -> value
  activeNotes: Map<string, Set<number>>; // "deviceId:channel" -> Set of notes

  // Device browser state
  isBrowserOpen: boolean;
  browserSearchQuery: string;

  // Auto-detect toast state
  pendingDevice: MIDIDeviceInfo | null;
  detectedPreset: MIDIDevicePreset | null;
}

export interface MIDIStoreActions {
  // Initialization
  initialize: () => Promise<void>;

  // Device management
  selectInput: (deviceId: string) => void;

  // Browser
  openBrowser: () => void;
  closeBrowser: () => void;
  setSearchQuery: (query: string) => void;

  // Auto-detect
  dismissPendingDevice: () => void;

  // Internal
  handleDeviceConnected: (device: MIDIDeviceInfo) => void;
  handleDeviceDisconnected: (device: MIDIDeviceInfo) => void;
  handleMIDIMessage: (event: MIDIEvent) => void;
}

export type MIDIStore = MIDIStoreState & MIDIStoreActions;

// ============================================================================
// Node Data Types
// ============================================================================

export interface MIDINodeData {
  deviceId: string | null;       // Selected MIDI input device ID
  presetId: string;              // Preset ID (e.g., "arturia-minilab-3" or "generic")
  isConnected: boolean;          // Whether device is currently connected
  activeChannel: number;         // 0 = omni (all channels), 1-16 for specific

  // MIDI Learn state
  midiLearnMode: boolean;
  learnTarget: string | null;    // Port ID being learned
  learnedMappings: Record<string, MIDILearnedMapping>;
}

export interface MIDILearnedMapping {
  type: 'note' | 'cc' | 'pitchBend';
  channel: number;
  noteOrCC: number;              // Note number or CC number
}

// ============================================================================
// Constants
// ============================================================================

// MIDI command bytes (upper nibble)
export const MIDI_COMMANDS = {
  NOTE_OFF: 0x80,
  NOTE_ON: 0x90,
  POLY_AFTERTOUCH: 0xA0,
  CONTROL_CHANGE: 0xB0,
  PROGRAM_CHANGE: 0xC0,
  CHANNEL_AFTERTOUCH: 0xD0,
  PITCH_BEND: 0xE0,
  SYSTEM: 0xF0,
} as const;

// Common CC numbers
export const MIDI_CC = {
  MODULATION: 1,
  BREATH: 2,
  VOLUME: 7,
  PAN: 10,
  EXPRESSION: 11,
  SUSTAIN: 64,
  PORTAMENTO: 65,
  SOSTENUTO: 66,
  SOFT_PEDAL: 67,
  LEGATO: 68,
  ALL_SOUND_OFF: 120,
  RESET_ALL: 121,
  ALL_NOTES_OFF: 123,
} as const;
