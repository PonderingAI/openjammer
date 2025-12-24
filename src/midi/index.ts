/**
 * MIDI Module
 * Exports all MIDI-related functionality
 */

// Types
export * from './types';

// Manager
export { getMIDIManager, MIDIManager } from './MIDIManager';

// Parser
export {
  parseMIDIMessage,
  midiNoteToName,
  noteNameToMidi,
  getCCName,
  normalizeMIDIValue,
  denormalizeMIDIValue,
} from './MIDIMessageParser';

// Presets
export { getPresetRegistry, MIDIPresetRegistry, type MIDIBundleConfig } from './MIDIDevicePresets';
export { genericPreset } from './presets/generic';
export { arturiaMinilab3Preset } from './presets/arturia-minilab-3';

// Port Generation
export {
  generateMIDIPorts,
  getMIDICCMapping,
  getMIDINoteMapping,
  createCCLookupTable,
  createNoteLookupTable,
} from './MIDIPortGenerator';
