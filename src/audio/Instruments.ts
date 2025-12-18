/**
 * Instruments - Virtual instrument synthesizers using Web Audio API
 */

import { getAudioContext, getMasterGain } from './AudioEngine';

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
// Instrument Synthesizers
// ============================================================================

export type InstrumentType = 'piano' | 'cello' | 'electricCello' | 'violin' | 'saxophone';

interface ActiveNote {
    oscillators: OscillatorNode[];
    gainNode: GainNode;
    filterNode?: BiquadFilterNode;
}

/**
 * Base Instrument class
 */
export class Instrument {
    protected type: InstrumentType;
    protected outputNode: GainNode | null = null;
    protected activeNotes: Map<string, ActiveNote> = new Map();
    protected baseOctave: number = 4;

    constructor(type: InstrumentType) {
        this.type = type;
        this.initOutput();
    }

    protected initOutput(): void {
        const ctx = getAudioContext();
        const master = getMasterGain();
        if (!ctx || !master) return;

        this.outputNode = ctx.createGain();
        this.outputNode.gain.value = 0.3;
        this.outputNode.connect(master);
    }

    setBaseOctave(octave: number): void {
        this.baseOctave = octave;
    }

    getOutput(): GainNode | null {
        return this.outputNode;
    }

    playNote(_note: string): void {
        // Override in subclasses
    }

    stopNote(note: string): void {
        const activeNote = this.activeNotes.get(note);
        if (!activeNote) return;

        const ctx = getAudioContext();
        if (!ctx) return;

        const now = ctx.currentTime;

        // Quick fade out
        activeNote.gainNode.gain.setValueAtTime(activeNote.gainNode.gain.value, now);
        activeNote.gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.1);

        // Stop oscillators after fade
        setTimeout(() => {
            activeNote.oscillators.forEach(osc => {
                try { osc.stop(); } catch { }
            });
            activeNote.gainNode.disconnect();
            if (activeNote.filterNode) activeNote.filterNode.disconnect();
        }, 150);

        this.activeNotes.delete(note);
    }

    stopAllNotes(): void {
        this.activeNotes.forEach((_, note) => this.stopNote(note));
    }

    disconnect(): void {
        this.stopAllNotes();
        if (this.outputNode) {
            this.outputNode.disconnect();
            this.outputNode = null;
        }
    }
}

/**
 * Piano - Bright, percussive sound using multiple oscillators
 */
export class Piano extends Instrument {
    constructor() {
        super('piano');
    }

    playNote(note: string): void {
        if (this.activeNotes.has(note)) return;

        const ctx = getAudioContext();
        if (!ctx || !this.outputNode) return;

        const freq = noteToFrequency(note);
        const now = ctx.currentTime;

        // Create gain envelope
        const gainNode = ctx.createGain();
        gainNode.gain.setValueAtTime(0, now);
        gainNode.gain.linearRampToValueAtTime(0.5, now + 0.01);
        gainNode.gain.exponentialRampToValueAtTime(0.3, now + 0.1);
        gainNode.gain.exponentialRampToValueAtTime(0.01, now + 2);
        gainNode.connect(this.outputNode);

        // Create oscillators (fundamental + harmonics for rich sound)
        const oscillators: OscillatorNode[] = [];

        // Fundamental
        const osc1 = ctx.createOscillator();
        osc1.type = 'triangle';
        osc1.frequency.value = freq;
        osc1.connect(gainNode);
        osc1.start(now);
        osc1.stop(now + 2.5);
        oscillators.push(osc1);

        // 2nd harmonic (softer)
        const osc2Gain = ctx.createGain();
        osc2Gain.gain.value = 0.3;
        osc2Gain.connect(gainNode);

        const osc2 = ctx.createOscillator();
        osc2.type = 'sine';
        osc2.frequency.value = freq * 2;
        osc2.connect(osc2Gain);
        osc2.start(now);
        osc2.stop(now + 2);
        oscillators.push(osc2);

        // 3rd harmonic (very soft)
        const osc3Gain = ctx.createGain();
        osc3Gain.gain.value = 0.1;
        osc3Gain.connect(gainNode);

        const osc3 = ctx.createOscillator();
        osc3.type = 'sine';
        osc3.frequency.value = freq * 3;
        osc3.connect(osc3Gain);
        osc3.start(now);
        osc3.stop(now + 1.5);
        oscillators.push(osc3);

        this.activeNotes.set(note, { oscillators, gainNode });
    }
}

/**
 * Cello - Warm, sustained string sound
 */
export class Cello extends Instrument {
    constructor() {
        super('cello');
    }

    playNote(note: string): void {
        if (this.activeNotes.has(note)) return;

        const ctx = getAudioContext();
        if (!ctx || !this.outputNode) return;

        const freq = noteToFrequency(note);
        const now = ctx.currentTime;

        // Low-pass filter for warmth
        const filterNode = ctx.createBiquadFilter();
        filterNode.type = 'lowpass';
        filterNode.frequency.value = 2000;
        filterNode.Q.value = 1;
        filterNode.connect(this.outputNode);

        // Gain envelope - slow attack for bowed sound
        const gainNode = ctx.createGain();
        gainNode.gain.setValueAtTime(0, now);
        gainNode.gain.linearRampToValueAtTime(0.4, now + 0.15);
        gainNode.gain.linearRampToValueAtTime(0.35, now + 0.3);
        gainNode.connect(filterNode);

        const oscillators: OscillatorNode[] = [];

        // Sawtooth for rich harmonics
        const osc1 = ctx.createOscillator();
        osc1.type = 'sawtooth';
        osc1.frequency.value = freq;
        osc1.connect(gainNode);
        osc1.start(now);
        oscillators.push(osc1);

        // Add slight vibrato
        const lfo = ctx.createOscillator();
        lfo.type = 'sine';
        lfo.frequency.value = 5;

        const lfoGain = ctx.createGain();
        lfoGain.gain.value = freq * 0.01;

        lfo.connect(lfoGain);
        lfoGain.connect(osc1.frequency);
        lfo.start(now);
        oscillators.push(lfo);

        this.activeNotes.set(note, { oscillators, gainNode, filterNode });
    }
}

/**
 * Electric Cello - Modern, processed string sound with saturation and chorus
 *
 * Sound design:
 * - Warm sawtooth base with soft saturation (waveshaper)
 * - Chorus effect via detuned oscillators for stereo width
 * - Expressive slow attack with sustain
 * - Rich harmonics with resonant low-pass filter
 * - Deeper, more expressive vibrato than acoustic
 */
export class ElectricCello extends Instrument {
    private waveShaperCurve: Float32Array | null = null;

    // Sound design constants
    private static readonly FILTER_RESONANCE = 2;
    private static readonly FILTER_CUTOFF_START = 800;
    private static readonly FILTER_CUTOFF_END = 2500;
    private static readonly VIBRATO_FREQUENCY = 4.5;
    private static readonly VIBRATO_DEPTH = 0.015; // As fraction of note frequency
    private static readonly VIBRATO_ONSET_TIME = 0.4;
    private static readonly ATTACK_TIME = 0.2;
    private static readonly ATTACK_PEAK = 0.45;
    private static readonly SUSTAIN_LEVEL = 0.38;
    private static readonly SUSTAIN_TIME = 0.5;
    private static readonly CHORUS_DETUNE_CENTS = 7;
    private static readonly CHORUS_GAIN = 0.35;
    private static readonly SUB_OSC_GAIN = 0.2;
    private static readonly SATURATION_AMOUNT = 1.5;

    constructor() {
        super('cello'); // Base type for compatibility
    }

    private getSaturationCurve(): Float32Array {
        if (!this.waveShaperCurve) {
            const samples = 256;
            const curve = new Float32Array(samples);
            for (let i = 0; i < samples; i++) {
                const x = (i * 2) / samples - 1;
                // Soft clipping curve
                curve[i] = Math.tanh(x * ElectricCello.SATURATION_AMOUNT);
            }
            this.waveShaperCurve = curve;
        }
        return this.waveShaperCurve;
    }

    playNote(note: string): void {
        if (this.activeNotes.has(note)) return;

        const ctx = getAudioContext();
        if (!ctx || !this.outputNode) return;

        const freq = noteToFrequency(note);
        const now = ctx.currentTime;

        // Resonant low-pass filter for warmth with slight resonance
        const filterNode = ctx.createBiquadFilter();
        filterNode.type = 'lowpass';
        filterNode.frequency.setValueAtTime(ElectricCello.FILTER_CUTOFF_START, now);
        filterNode.frequency.linearRampToValueAtTime(ElectricCello.FILTER_CUTOFF_END, now + ElectricCello.ATTACK_TIME + 0.1);
        filterNode.Q.value = ElectricCello.FILTER_RESONANCE;
        filterNode.connect(this.outputNode);

        // Waveshaper for soft saturation
        const waveshaper = ctx.createWaveShaper();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        waveshaper.curve = this.getSaturationCurve() as any;
        waveshaper.oversample = '2x';
        waveshaper.connect(filterNode);

        // Main gain envelope - slow, expressive attack
        const gainNode = ctx.createGain();
        gainNode.gain.setValueAtTime(0, now);
        gainNode.gain.linearRampToValueAtTime(ElectricCello.ATTACK_PEAK, now + ElectricCello.ATTACK_TIME);
        gainNode.gain.linearRampToValueAtTime(ElectricCello.SUSTAIN_LEVEL, now + ElectricCello.SUSTAIN_TIME);
        gainNode.connect(waveshaper);

        const oscillators: OscillatorNode[] = [];

        // Main oscillator - sawtooth for rich harmonics
        const osc1 = ctx.createOscillator();
        osc1.type = 'sawtooth';
        osc1.frequency.value = freq;
        osc1.connect(gainNode);
        osc1.start(now);
        oscillators.push(osc1);

        // Detuned oscillator +N cents for chorus width
        const osc2Gain = ctx.createGain();
        osc2Gain.gain.value = ElectricCello.CHORUS_GAIN;
        osc2Gain.connect(gainNode);

        const osc2 = ctx.createOscillator();
        osc2.type = 'sawtooth';
        osc2.frequency.value = freq * Math.pow(2, ElectricCello.CHORUS_DETUNE_CENTS / 1200);
        osc2.connect(osc2Gain);
        osc2.start(now);
        oscillators.push(osc2);

        // Detuned oscillator -N cents for chorus width
        const osc3Gain = ctx.createGain();
        osc3Gain.gain.value = ElectricCello.CHORUS_GAIN;
        osc3Gain.connect(gainNode);

        const osc3 = ctx.createOscillator();
        osc3.type = 'sawtooth';
        osc3.frequency.value = freq * Math.pow(2, -ElectricCello.CHORUS_DETUNE_CENTS / 1200);
        osc3.connect(osc3Gain);
        osc3.start(now);
        oscillators.push(osc3);

        // Sub oscillator one octave down for depth
        const subGain = ctx.createGain();
        subGain.gain.value = ElectricCello.SUB_OSC_GAIN;
        subGain.connect(gainNode);

        const subOsc = ctx.createOscillator();
        subOsc.type = 'sine';
        subOsc.frequency.value = freq / 2;
        subOsc.connect(subGain);
        subOsc.start(now);
        oscillators.push(subOsc);

        // Deep, expressive vibrato
        const lfo = ctx.createOscillator();
        lfo.type = 'sine';
        lfo.frequency.value = ElectricCello.VIBRATO_FREQUENCY;

        const lfoGain = ctx.createGain();
        lfoGain.gain.setValueAtTime(0, now);
        lfoGain.gain.linearRampToValueAtTime(freq * ElectricCello.VIBRATO_DEPTH, now + ElectricCello.VIBRATO_ONSET_TIME);

        lfo.connect(lfoGain);
        // Apply vibrato to all tuned oscillators
        lfoGain.connect(osc1.frequency);
        lfoGain.connect(osc2.frequency);
        lfoGain.connect(osc3.frequency);
        lfo.start(now);
        oscillators.push(lfo);

        // Slight filter modulation for movement
        const filterLfo = ctx.createOscillator();
        filterLfo.type = 'sine';
        filterLfo.frequency.value = 0.5;

        const filterLfoGain = ctx.createGain();
        filterLfoGain.gain.value = 500;

        filterLfo.connect(filterLfoGain);
        filterLfoGain.connect(filterNode.frequency);
        filterLfo.start(now);
        oscillators.push(filterLfo);

        this.activeNotes.set(note, { oscillators, gainNode, filterNode });
    }
}

/**
 * Violin - Bright, agile string sound
 */
export class Violin extends Instrument {
    constructor() {
        super('violin');
    }

    playNote(note: string): void {
        if (this.activeNotes.has(note)) return;

        const ctx = getAudioContext();
        if (!ctx || !this.outputNode) return;

        const freq = noteToFrequency(note);
        const now = ctx.currentTime;

        // High-pass filter to remove low frequencies, emphasizing brightness
        const filterNode = ctx.createBiquadFilter();
        filterNode.type = 'highpass';
        filterNode.frequency.value = 200;
        filterNode.Q.value = 0.7;
        filterNode.connect(this.outputNode);

        // Gain envelope - faster attack than cello for agility
        const gainNode = ctx.createGain();
        gainNode.gain.setValueAtTime(0, now);
        gainNode.gain.linearRampToValueAtTime(0.45, now + 0.08);
        gainNode.gain.linearRampToValueAtTime(0.4, now + 0.2);
        gainNode.connect(filterNode);

        const oscillators: OscillatorNode[] = [];

        // Triangle wave for clarity
        const osc1 = ctx.createOscillator();
        osc1.type = 'triangle';
        osc1.frequency.value = freq;
        osc1.connect(gainNode);
        osc1.start(now);
        oscillators.push(osc1);

        // 2nd harmonic for richness
        const osc2Gain = ctx.createGain();
        osc2Gain.gain.value = 0.25;
        osc2Gain.connect(gainNode);

        const osc2 = ctx.createOscillator();
        osc2.type = 'sine';
        osc2.frequency.value = freq * 2;
        osc2.connect(osc2Gain);
        osc2.start(now);
        oscillators.push(osc2);

        // Faster vibrato than cello
        const lfo = ctx.createOscillator();
        lfo.type = 'sine';
        lfo.frequency.value = 7; // Faster vibrato

        const lfoGain = ctx.createGain();
        lfoGain.gain.value = freq * 0.008; // Smaller vibrato depth

        lfo.connect(lfoGain);
        lfoGain.connect(osc1.frequency);
        lfo.start(now);
        oscillators.push(lfo);

        this.activeNotes.set(note, { oscillators, gainNode, filterNode });
    }
}

/**
 * Saxophone - Warm, reedy sound
 */
export class Saxophone extends Instrument {
    constructor() {
        super('saxophone');
    }

    playNote(note: string): void {
        if (this.activeNotes.has(note)) return;

        const ctx = getAudioContext();
        if (!ctx || !this.outputNode) return;

        const freq = noteToFrequency(note);
        const now = ctx.currentTime;

        // Band-pass filter for reedy sound
        const filterNode = ctx.createBiquadFilter();
        filterNode.type = 'bandpass';
        filterNode.frequency.value = freq * 2;
        filterNode.Q.value = 2;
        filterNode.connect(this.outputNode);

        // Gain envelope
        const gainNode = ctx.createGain();
        gainNode.gain.setValueAtTime(0, now);
        gainNode.gain.linearRampToValueAtTime(0.35, now + 0.05);
        gainNode.gain.linearRampToValueAtTime(0.3, now + 0.2);
        gainNode.connect(filterNode);

        const oscillators: OscillatorNode[] = [];

        // Square wave for reedy harmonics
        const osc1 = ctx.createOscillator();
        osc1.type = 'square';
        osc1.frequency.value = freq;
        osc1.connect(gainNode);
        osc1.start(now);
        oscillators.push(osc1);

        // Add formant for more realistic sound
        const formantGain = ctx.createGain();
        formantGain.gain.value = 0.15;
        formantGain.connect(gainNode);

        const osc2 = ctx.createOscillator();
        osc2.type = 'sine';
        osc2.frequency.value = freq * 3;
        osc2.connect(formantGain);
        osc2.start(now);
        oscillators.push(osc2);

        // Vibrato
        const lfo = ctx.createOscillator();
        lfo.type = 'sine';
        lfo.frequency.value = 6;

        const lfoGain = ctx.createGain();
        lfoGain.gain.value = freq * 0.015;

        lfo.connect(lfoGain);
        lfoGain.connect(osc1.frequency);
        lfo.start(now);
        oscillators.push(lfo);

        this.activeNotes.set(note, { oscillators, gainNode, filterNode });
    }
}

/**
 * Factory function to create instruments
 */
export function createInstrument(type: InstrumentType): Instrument {
    switch (type) {
        case 'piano':
            return new Piano();
        case 'cello':
            return new Cello();
        case 'electricCello':
            return new ElectricCello();
        case 'violin':
            return new Violin();
        case 'saxophone':
            return new Saxophone();
        default:
            return new Piano();
    }
}
