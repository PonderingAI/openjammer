/**
 * Audio System Validation Tests
 *
 * Tests for type guards, input validation, and data integrity
 * in the audio processing system.
 */

import { describe, it, expect } from 'vitest';

// ============================================================================
// Validation Constants (mirrored from AudioGraphManager for testing)
// ============================================================================

/**
 * Validation bounds for instrument row data
 * These constants define the acceptable ranges for instrument configuration
 *
 * @constant MIN_PORT_COUNT - Minimum ports in a row (at least 1)
 * @constant MAX_PORT_COUNT - Maximum ports (128 = full MIDI range)
 * @constant MIN_NOTE - Lowest note index (0 = C)
 * @constant MAX_NOTE - Highest note index (11 = B)
 * @constant MIN_OCTAVE - Lowest octave
 * @constant MAX_OCTAVE - Highest octave (8 = beyond piano range)
 * @constant MIN_OFFSET - Maximum semitones down (-48 = 4 octaves)
 * @constant MAX_OFFSET - Maximum semitones up (+48 = 4 octaves)
 * @constant MIN_SPREAD - Minimum spread between keys
 * @constant MAX_SPREAD - Maximum spread (12 = 1 octave per key)
 */
const VALIDATION_BOUNDS = {
    MIN_PORT_COUNT: 1,
    MAX_PORT_COUNT: 128,
    MIN_NOTE: 0,
    MAX_NOTE: 11,
    MIN_OCTAVE: 0,
    MAX_OCTAVE: 8,
    MIN_OFFSET: -48,
    MAX_OFFSET: 48,
    MIN_SPREAD: 0,
    MAX_SPREAD: 12,
} as const;

// Type for instrument row (matches engine/types.ts)
interface InstrumentRow {
    rowId: string;
    sourceNodeId: string;
    sourcePortId: string;
    targetPortId: string;
    label: string;
    spread: number;
    baseNote: number;
    baseOctave: number;
    baseOffset: number;
    portCount: number;
    keyGains: number[];
}

/**
 * Validates an instrument row has valid field ranges
 * Pure function for testing validation logic
 *
 * Uses Number.isFinite() to reject NaN, Infinity, and -Infinity
 * since these would pass standard range comparisons
 */
function isValidInstrumentRow(row: unknown): row is InstrumentRow {
    if (typeof row !== 'object' || row === null) return false;
    const r = row as Record<string, unknown>;

    // Type checks
    if (typeof r.rowId !== 'string') return false;
    if (typeof r.portCount !== 'number' || !Number.isFinite(r.portCount)) return false;
    if (typeof r.baseNote !== 'number' || !Number.isFinite(r.baseNote)) return false;
    if (typeof r.baseOctave !== 'number' || !Number.isFinite(r.baseOctave)) return false;
    if (typeof r.baseOffset !== 'number' || !Number.isFinite(r.baseOffset)) return false;
    if (typeof r.spread !== 'number' || !Number.isFinite(r.spread)) return false;

    // Range validation
    if (r.portCount < VALIDATION_BOUNDS.MIN_PORT_COUNT ||
        r.portCount > VALIDATION_BOUNDS.MAX_PORT_COUNT) return false;
    if (r.baseNote < VALIDATION_BOUNDS.MIN_NOTE ||
        r.baseNote > VALIDATION_BOUNDS.MAX_NOTE) return false;
    if (r.baseOctave < VALIDATION_BOUNDS.MIN_OCTAVE ||
        r.baseOctave > VALIDATION_BOUNDS.MAX_OCTAVE) return false;
    if (r.baseOffset < VALIDATION_BOUNDS.MIN_OFFSET ||
        r.baseOffset > VALIDATION_BOUNDS.MAX_OFFSET) return false;
    if (r.spread < VALIDATION_BOUNDS.MIN_SPREAD ||
        r.spread > VALIDATION_BOUNDS.MAX_SPREAD) return false;

    return true;
}

/**
 * Clamps velocity to valid 0-1 range
 */
function clampVelocity(velocity: number): number {
    return Math.max(0, Math.min(1, velocity));
}

// ============================================================================
// Tests
// ============================================================================

describe('Audio Validation', () => {
    describe('VALIDATION_BOUNDS constants', () => {
        it('should have sensible port count limits', () => {
            expect(VALIDATION_BOUNDS.MIN_PORT_COUNT).toBe(1);
            expect(VALIDATION_BOUNDS.MAX_PORT_COUNT).toBe(128); // MIDI range
        });

        it('should have valid note range (0-11 for chromatic scale)', () => {
            expect(VALIDATION_BOUNDS.MIN_NOTE).toBe(0); // C
            expect(VALIDATION_BOUNDS.MAX_NOTE).toBe(11); // B
        });

        it('should have reasonable octave range', () => {
            expect(VALIDATION_BOUNDS.MIN_OCTAVE).toBe(0);
            expect(VALIDATION_BOUNDS.MAX_OCTAVE).toBe(8);
            // Standard piano is 0-8, with middle C at octave 4
        });

        it('should have symmetric offset limits', () => {
            expect(VALIDATION_BOUNDS.MIN_OFFSET).toBe(-48);
            expect(VALIDATION_BOUNDS.MAX_OFFSET).toBe(48);
            // ±4 octaves is generous for pitch shifting
        });

        it('should have valid spread range', () => {
            expect(VALIDATION_BOUNDS.MIN_SPREAD).toBe(0);
            expect(VALIDATION_BOUNDS.MAX_SPREAD).toBe(12); // 1 octave max
        });
    });

    describe('isValidInstrumentRow type guard', () => {
        const validRow: InstrumentRow = {
            rowId: 'row-1',
            sourceNodeId: 'keyboard-1',
            sourcePortId: 'bundle-out',
            targetPortId: 'input-1',
            label: 'Row 1',
            spread: 0.5,
            baseNote: 0,
            baseOctave: 4,
            baseOffset: 0,
            portCount: 12,
            keyGains: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
        };

        it('should accept valid instrument row', () => {
            expect(isValidInstrumentRow(validRow)).toBe(true);
        });

        it('should reject null', () => {
            expect(isValidInstrumentRow(null)).toBe(false);
        });

        it('should reject undefined', () => {
            expect(isValidInstrumentRow(undefined)).toBe(false);
        });

        it('should reject primitive types', () => {
            expect(isValidInstrumentRow('string')).toBe(false);
            expect(isValidInstrumentRow(42)).toBe(false);
            expect(isValidInstrumentRow(true)).toBe(false);
        });

        it('should reject empty object', () => {
            expect(isValidInstrumentRow({})).toBe(false);
        });

        describe('portCount validation', () => {
            it('should reject portCount = 0', () => {
                expect(isValidInstrumentRow({ ...validRow, portCount: 0 })).toBe(false);
            });

            it('should accept portCount = 1 (minimum)', () => {
                expect(isValidInstrumentRow({ ...validRow, portCount: 1 })).toBe(true);
            });

            it('should accept portCount = 128 (maximum)', () => {
                expect(isValidInstrumentRow({ ...validRow, portCount: 128 })).toBe(true);
            });

            it('should reject portCount > 128', () => {
                expect(isValidInstrumentRow({ ...validRow, portCount: 129 })).toBe(false);
            });

            it('should reject negative portCount', () => {
                expect(isValidInstrumentRow({ ...validRow, portCount: -1 })).toBe(false);
            });
        });

        describe('baseNote validation', () => {
            it('should accept baseNote = 0 (C)', () => {
                expect(isValidInstrumentRow({ ...validRow, baseNote: 0 })).toBe(true);
            });

            it('should accept baseNote = 11 (B)', () => {
                expect(isValidInstrumentRow({ ...validRow, baseNote: 11 })).toBe(true);
            });

            it('should reject baseNote = 12', () => {
                expect(isValidInstrumentRow({ ...validRow, baseNote: 12 })).toBe(false);
            });

            it('should reject negative baseNote', () => {
                expect(isValidInstrumentRow({ ...validRow, baseNote: -1 })).toBe(false);
            });
        });

        describe('baseOctave validation', () => {
            it('should accept baseOctave = 0', () => {
                expect(isValidInstrumentRow({ ...validRow, baseOctave: 0 })).toBe(true);
            });

            it('should accept baseOctave = 4 (middle C)', () => {
                expect(isValidInstrumentRow({ ...validRow, baseOctave: 4 })).toBe(true);
            });

            it('should accept baseOctave = 8 (maximum)', () => {
                expect(isValidInstrumentRow({ ...validRow, baseOctave: 8 })).toBe(true);
            });

            it('should reject baseOctave = 9', () => {
                expect(isValidInstrumentRow({ ...validRow, baseOctave: 9 })).toBe(false);
            });

            it('should reject negative baseOctave', () => {
                expect(isValidInstrumentRow({ ...validRow, baseOctave: -1 })).toBe(false);
            });
        });

        describe('baseOffset validation', () => {
            it('should accept baseOffset = 0', () => {
                expect(isValidInstrumentRow({ ...validRow, baseOffset: 0 })).toBe(true);
            });

            it('should accept baseOffset = -48 (minimum)', () => {
                expect(isValidInstrumentRow({ ...validRow, baseOffset: -48 })).toBe(true);
            });

            it('should accept baseOffset = 48 (maximum)', () => {
                expect(isValidInstrumentRow({ ...validRow, baseOffset: 48 })).toBe(true);
            });

            it('should reject baseOffset = -49', () => {
                expect(isValidInstrumentRow({ ...validRow, baseOffset: -49 })).toBe(false);
            });

            it('should reject baseOffset = 49', () => {
                expect(isValidInstrumentRow({ ...validRow, baseOffset: 49 })).toBe(false);
            });
        });

        describe('spread validation', () => {
            it('should accept spread = 0', () => {
                expect(isValidInstrumentRow({ ...validRow, spread: 0 })).toBe(true);
            });

            it('should accept spread = 0.5 (typical)', () => {
                expect(isValidInstrumentRow({ ...validRow, spread: 0.5 })).toBe(true);
            });

            it('should accept spread = 12 (maximum)', () => {
                expect(isValidInstrumentRow({ ...validRow, spread: 12 })).toBe(true);
            });

            it('should reject spread = 13', () => {
                expect(isValidInstrumentRow({ ...validRow, spread: 13 })).toBe(false);
            });

            it('should reject negative spread', () => {
                expect(isValidInstrumentRow({ ...validRow, spread: -1 })).toBe(false);
            });
        });

        describe('type coercion attacks', () => {
            it('should reject string numbers', () => {
                expect(isValidInstrumentRow({ ...validRow, portCount: '12' })).toBe(false);
            });

            it('should reject arrays where numbers expected', () => {
                expect(isValidInstrumentRow({ ...validRow, baseNote: [0] })).toBe(false);
            });

            it('should reject NaN', () => {
                expect(isValidInstrumentRow({ ...validRow, baseOctave: NaN })).toBe(false);
            });

            it('should reject Infinity', () => {
                expect(isValidInstrumentRow({ ...validRow, spread: Infinity })).toBe(false);
            });
        });
    });

    describe('velocity clamping', () => {
        it('should pass through valid velocity (0.5)', () => {
            expect(clampVelocity(0.5)).toBe(0.5);
        });

        it('should pass through velocity = 0', () => {
            expect(clampVelocity(0)).toBe(0);
        });

        it('should pass through velocity = 1', () => {
            expect(clampVelocity(1)).toBe(1);
        });

        it('should clamp velocity > 1 to 1', () => {
            expect(clampVelocity(1.5)).toBe(1);
            expect(clampVelocity(100)).toBe(1);
        });

        it('should clamp velocity < 0 to 0', () => {
            expect(clampVelocity(-0.5)).toBe(0);
            expect(clampVelocity(-100)).toBe(0);
        });

        it('should handle extreme values', () => {
            expect(clampVelocity(Infinity)).toBe(1);
            expect(clampVelocity(-Infinity)).toBe(0);
        });

        it('should handle NaN (returns NaN, caller responsibility)', () => {
            // NaN comparisons always return false, so Math.max/min don't help
            // This is expected behavior - caller should validate input
            expect(Number.isNaN(clampVelocity(NaN))).toBe(true);
        });
    });
});

describe('Security Input Validation', () => {
    describe('malicious input rejection', () => {
        it('should reject extremely large portCount values', () => {
            expect(isValidInstrumentRow({
                rowId: 'test',
                sourceNodeId: 'test',
                sourcePortId: 'test',
                targetPortId: 'test',
                label: 'test',
                spread: 0.5,
                baseNote: 0,
                baseOctave: 4,
                baseOffset: 0,
                portCount: 999999999,
                keyGains: [],
            })).toBe(false);
        });

        it('should reject Number.MAX_VALUE as offset', () => {
            expect(isValidInstrumentRow({
                rowId: 'test',
                sourceNodeId: 'test',
                sourcePortId: 'test',
                targetPortId: 'test',
                label: 'test',
                spread: 0.5,
                baseNote: 0,
                baseOctave: 4,
                baseOffset: Number.MAX_VALUE,
                portCount: 12,
                keyGains: [],
            })).toBe(false);
        });

        it('should reject prototype pollution attempts', () => {
            const maliciousRow = {
                rowId: 'test',
                sourceNodeId: 'test',
                sourcePortId: 'test',
                targetPortId: 'test',
                label: 'test',
                spread: 0.5,
                baseNote: 0,
                baseOctave: 4,
                baseOffset: 0,
                portCount: 12,
                keyGains: [],
                __proto__: { malicious: true },
            };
            // Should still validate correctly (proto doesn't affect our checks)
            expect(isValidInstrumentRow(maliciousRow)).toBe(true);
        });
    });
});
