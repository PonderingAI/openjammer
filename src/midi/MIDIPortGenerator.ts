/**
 * MIDI Port Generator
 *
 * Generates port definitions for MIDI devices based on their presets.
 * This allows any MIDI device to automatically have the correct ports
 * for all its controls (keys, pads, knobs, faders, touch strips).
 *
 * Usage:
 *   const ports = generateMIDIPorts(preset);
 *   // Returns array of PortDefinition objects
 */

import type { PortDefinition } from '../engine/types';
import type { MIDIDevicePreset } from './types';

/**
 * Generate all output ports for a MIDI device based on its preset
 */
export function generateMIDIPorts(preset: MIDIDevicePreset): PortDefinition[] {
    const ports: PortDefinition[] = [];

    // Generate keyboard ports
    if (preset.controls.keys) {
        const keyPorts = generateKeyboardPorts(preset);
        ports.push(...keyPorts);
    }

    // Generate pad ports
    if (preset.controls.pads) {
        const padPorts = generatePadPorts(preset);
        ports.push(...padPorts);
    }

    // Generate knob ports
    if (preset.controls.knobs) {
        const knobPorts = generateKnobPorts(preset);
        ports.push(...knobPorts);
    }

    // Generate fader ports
    if (preset.controls.faders) {
        const faderPorts = generateFaderPorts(preset);
        ports.push(...faderPorts);
    }

    // Generate pitch bend port
    if (preset.controls.pitchBend) {
        ports.push({
            id: 'pitch-bend',
            name: 'Pitch',
            type: 'control',
            direction: 'output',
            // Position will be set by the visual component
        });
    }

    // Generate mod wheel port
    if (preset.controls.modWheel) {
        ports.push({
            id: 'mod-wheel',
            name: 'Mod',
            type: 'control',
            direction: 'output',
        });
    }

    return ports;
}

/**
 * Generate port definitions for keyboard keys
 * Each key gets its own output port (note number as ID)
 */
function generateKeyboardPorts(preset: MIDIDevicePreset): PortDefinition[] {
    const ports: PortDefinition[] = [];
    const keys = preset.controls.keys;
    if (!keys) return ports;

    const range = keys.noteRange || keys.range || [48, 72];
    const [startNote, endNote] = range;

    for (let note = startNote; note <= endNote; note++) {
        ports.push({
            id: `key-${note}`,
            name: getNoteLabel(note),
            type: 'control',
            direction: 'output',
        });
    }

    return ports;
}

/**
 * Generate port definitions for pads
 * Each pad gets its own output port
 */
function generatePadPorts(preset: MIDIDevicePreset): PortDefinition[] {
    const ports: PortDefinition[] = [];
    const pads = preset.controls.pads;
    if (!pads) return ports;

    for (const pad of pads) {
        ports.push({
            id: pad.id,
            name: pad.name,
            type: 'control',
            direction: 'output',
        });
    }

    return ports;
}

/**
 * Generate port definitions for knobs
 * Each knob gets its own output port (0-1 normalized value)
 */
function generateKnobPorts(preset: MIDIDevicePreset): PortDefinition[] {
    const ports: PortDefinition[] = [];
    const knobs = preset.controls.knobs;
    if (!knobs) return ports;

    for (const knob of knobs) {
        ports.push({
            id: knob.id,
            name: knob.name,
            type: 'control',
            direction: 'output',
        });
    }

    return ports;
}

/**
 * Generate port definitions for faders
 * Each fader gets its own output port (0-1 normalized value)
 */
function generateFaderPorts(preset: MIDIDevicePreset): PortDefinition[] {
    const ports: PortDefinition[] = [];
    const faders = preset.controls.faders;
    if (!faders) return ports;

    for (const fader of faders) {
        ports.push({
            id: fader.id,
            name: fader.name,
            type: 'control',
            direction: 'output',
        });
    }

    return ports;
}

/**
 * Convert MIDI note number to note label (e.g., 60 -> "C4")
 */
function getNoteLabel(note: number): string {
    const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
    const octave = Math.floor(note / 12) - 1;
    const noteName = noteNames[note % 12];
    return `${noteName}${octave}`;
}

/**
 * Get MIDI CC mapping for a control
 * Returns the CC number for knobs/faders based on preset
 */
export function getMIDICCMapping(preset: MIDIDevicePreset, controlId: string): number | null {
    // Check knobs
    const knob = preset.controls.knobs?.find(k => k.id === controlId);
    if (knob) return knob.cc;

    // Check faders
    const fader = preset.controls.faders?.find(f => f.id === controlId);
    if (fader) return fader.cc;

    // Mod wheel
    if (controlId === 'mod-wheel' && preset.controls.modWheel) {
        return preset.controls.modWheel.cc;
    }

    return null;
}

/**
 * Get MIDI note mapping for a control (pad or key)
 * Returns the note number for pads/keys based on preset
 */
export function getMIDINoteMapping(preset: MIDIDevicePreset, controlId: string): { note: number; channel: number } | null {
    // Check if it's a key
    if (controlId.startsWith('key-')) {
        const noteNum = parseInt(controlId.replace('key-', ''));
        if (!isNaN(noteNum) && preset.controls.keys) {
            return { note: noteNum, channel: preset.controls.keys.channel };
        }
    }

    // Check pads
    const pad = preset.controls.pads?.find(p => p.id === controlId);
    if (pad) {
        return { note: pad.note, channel: pad.channel };
    }

    return null;
}

/**
 * Create a lookup table for quick CC -> control ID mapping
 */
export function createCCLookupTable(preset: MIDIDevicePreset): Map<string, string> {
    const lookup = new Map<string, string>();

    // Knobs
    preset.controls.knobs?.forEach(knob => {
        const key = `${knob.channel}:${knob.cc}`;
        lookup.set(key, knob.id);
    });

    // Faders
    preset.controls.faders?.forEach(fader => {
        const key = `${fader.channel}:${fader.cc}`;
        lookup.set(key, fader.id);
    });

    // Mod wheel
    if (preset.controls.modWheel) {
        const key = `${preset.controls.modWheel.channel}:${preset.controls.modWheel.cc}`;
        lookup.set(key, 'mod-wheel');
    }

    return lookup;
}

/**
 * Create a lookup table for quick note -> control ID mapping
 */
export function createNoteLookupTable(preset: MIDIDevicePreset): Map<string, string> {
    const lookup = new Map<string, string>();

    // Keys
    if (preset.controls.keys) {
        const range = preset.controls.keys.noteRange || preset.controls.keys.range || [48, 72];
        const channel = preset.controls.keys.channel;
        for (let note = range[0]; note <= range[1]; note++) {
            const key = `${channel}:${note}`;
            lookup.set(key, `key-${note}`);
        }
    }

    // Pads
    preset.controls.pads?.forEach(pad => {
        const key = `${pad.channel}:${pad.note}`;
        lookup.set(key, pad.id);
    });

    return lookup;
}
