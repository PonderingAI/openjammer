/**
 * Instruments - Now using sample-based instruments
 */

// ============================================================================
// Note Frequency Calculation
// ============================================================================

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

/**
 * Convert Scientific Pitch Notation to frequency
 * e.g., "A4" -> 440, "C4" -> 261.63
 */
export function noteToFrequency(note: string): number {
    const match = note.match(/^([A-G]#?)(\d+)$/i);
    if (!match) return 440;

    const noteName = match[1].toUpperCase();
    const octave = parseInt(match[2], 10);

    const noteIndex = NOTE_NAMES.indexOf(noteName);
    if (noteIndex === -1) return 440;

    // A4 = 440Hz, calculate semitones from A4
    const semitonesFromA4 = (octave - 4) * 12 + (noteIndex - 9);
    return 440 * Math.pow(2, semitonesFromA4 / 12);
}

/**
 * Get note name from key index and octave
 */
export function getNoteName(keyIndex: number, baseOctave: number): string {
    const octaveOffset = Math.floor(keyIndex / 12);
    const noteIndex = keyIndex % 12;
    return `${NOTE_NAMES[noteIndex]}${baseOctave + octaveOffset}`;
}

// ============================================================================
// Keyboard Mapping
// ============================================================================

// Row 1 (numbers): High notes
const ROW1_KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0', '-', '='];
// Row 2 (qwerty): Mid-high notes
const ROW2_KEYS = ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p', '[', ']'];
// Row 3 (asdf): Mid notes (main row)
const ROW3_KEYS = ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l', ';', "'"];
// Row 4 (zxcv): Low notes
const ROW4_KEYS = ['z', 'x', 'c', 'v', 'b', 'n', 'm', ',', '.', '/'];

export const KEYBOARD_ROWS = [ROW1_KEYS, ROW2_KEYS, ROW3_KEYS, ROW4_KEYS];

/**
 * Get the note for a key press in full keyboard mode
 */
export function getKeyNote(key: string, baseOctave: number): string | null {
    const lowerKey = key.toLowerCase();

    // Check each row
    for (let rowIndex = 0; rowIndex < KEYBOARD_ROWS.length; rowIndex++) {
        const keyIndex = KEYBOARD_ROWS[rowIndex].indexOf(lowerKey);
        if (keyIndex !== -1) {
            // Map row to octave offset: row 0 = +2, row 1 = +1, row 2 = 0, row 3 = -1
            const octaveOffset = 2 - rowIndex;
            const noteIndex = keyIndex % 12;
            const extraOctave = Math.floor(keyIndex / 12);
            return `${NOTE_NAMES[noteIndex]}${baseOctave + octaveOffset + extraOctave}`;
        }
    }

    return null;
}

/**
 * Get note for a specific row in split mode
 */
export function getRowNote(key: string, row: number, baseOctave: number): string | null {
    const lowerKey = key.toLowerCase();
    const targetRow = KEYBOARD_ROWS[row];

    if (!targetRow) return null;

    const keyIndex = targetRow.indexOf(lowerKey);
    if (keyIndex === -1) return null;

    const noteIndex = keyIndex % 12;
    const extraOctave = Math.floor(keyIndex / 12);
    return `${NOTE_NAMES[noteIndex]}${baseOctave + extraOctave}`;
}

// ============================================================================
// Sample-Based Instruments
// ============================================================================

// Import and re-export sampler types and loader
import { InstrumentLoader } from './samplers/InstrumentLoader';

export type { SampledInstrument } from './samplers/SampledInstrument';
export { InstrumentLoader };

// InstrumentType now uses instrument definition IDs
export type InstrumentType = string;

// Legacy type mapping for backwards compatibility
const LEGACY_TYPE_MAP: Record<string, string> = {
    'piano': 'salamander-piano',
    'cello': 'versilian-cello',
    'electricCello': 'versilian-cello',
    'violin': 'versilian-violin',
    'saxophone': 'waf-saxophone',
    'strings': 'versilian-cello',
    'keys': 'salamander-piano',
    'winds': 'waf-saxophone'
};

/**
 * Map legacy instrument type to new instrument ID
 */
export function getLegacyInstrumentId(legacyType: string): string {
    return LEGACY_TYPE_MAP[legacyType] ?? 'salamander-piano';
}

/**
 * Factory function to create instruments
 * Now uses sample-based instruments via InstrumentLoader
 */
export function createInstrument(instrumentId: string) {
    return InstrumentLoader.create(instrumentId);
}
