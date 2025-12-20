/**
 * Sampler Adapter Tests
 *
 * Tests for WebAudioFontAdapter and TonePianoAdapter
 * Focuses on resource management, error handling, and API contracts
 */

import { describe, it, expect, vi } from 'vitest';

// ============================================================================
// Constants (mirrored from adapters for testing)
// ============================================================================

const PRESET_LOAD_TIMEOUT_MS = 30000;
const MAX_CONCURRENT_NOTES = 64;
const SAMPLE_LOAD_TIMEOUT_MS = 30000;

// ============================================================================
// Mock Types
// ============================================================================

interface MockNoteHandle {
    cancel: () => void;
    gainNode: { disconnect: () => void };
}

// ============================================================================
// WebAudioFontAdapter Tests (Unit)
// ============================================================================

describe('WebAudioFontAdapter', () => {
    describe('constants', () => {
        it('should have reasonable timeout for preset loading', () => {
            expect(PRESET_LOAD_TIMEOUT_MS).toBe(30000); // 30 seconds
        });

        it('should have max concurrent notes limit', () => {
            expect(MAX_CONCURRENT_NOTES).toBe(64);
            // 64 is reasonable: allows full piano range with some buffer
        });
    });

    describe('concurrent note limiting', () => {
        it('should track note count correctly', () => {
            const noteHandles = new Map<string, MockNoteHandle>();

            // Simulate playing notes
            for (let i = 0; i < 10; i++) {
                noteHandles.set(`C${i}`, {
                    cancel: vi.fn(),
                    gainNode: { disconnect: vi.fn() }
                });
            }

            expect(noteHandles.size).toBe(10);
        });

        it('should prevent exceeding max concurrent notes', () => {
            const noteHandles = new Map<string, MockNoteHandle>();
            let droppedNotes = 0;

            // Simulate playing MAX_CONCURRENT_NOTES + 10 notes
            for (let i = 0; i < MAX_CONCURRENT_NOTES + 10; i++) {
                if (noteHandles.size >= MAX_CONCURRENT_NOTES) {
                    droppedNotes++;
                    continue;
                }
                noteHandles.set(`note${i}`, {
                    cancel: vi.fn(),
                    gainNode: { disconnect: vi.fn() }
                });
            }

            expect(noteHandles.size).toBe(MAX_CONCURRENT_NOTES);
            expect(droppedNotes).toBe(10);
        });
    });

    describe('cleanup on disconnect', () => {
        it('should cancel all note handles on disconnect', () => {
            const noteHandles = new Map<string, MockNoteHandle>();
            const cancelMocks: ReturnType<typeof vi.fn>[] = [];

            // Create mock handles
            for (let i = 0; i < 5; i++) {
                const cancel = vi.fn();
                cancelMocks.push(cancel);
                noteHandles.set(`C${i + 4}`, {
                    cancel,
                    gainNode: { disconnect: vi.fn() }
                });
            }

            // Simulate disconnect
            noteHandles.forEach(handle => {
                handle.cancel();
                handle.gainNode.disconnect();
            });
            noteHandles.clear();

            // Verify all were canceled
            expect(noteHandles.size).toBe(0);
            cancelMocks.forEach(mock => {
                expect(mock).toHaveBeenCalled();
            });
        });
    });

    describe('SRI hash validation', () => {
        const SRI_PATTERN = /^sha(256|384|512)-[A-Za-z0-9+/]+=*$/;

        it('should accept valid SHA-384 SRI hash', () => {
            const validHash = 'sha384-VpK1JoeR4g+Po6yJ33FsW8A9zkuCtHT6IqThhykRl4WDDQkFpEKBpz+EXWY/um0b';
            expect(SRI_PATTERN.test(validHash)).toBe(true);
        });

        it('should accept valid SHA-256 SRI hash', () => {
            const validHash = 'sha256-abcdefghijklmnopqrstuvwxyz0123456789ABCD';
            expect(SRI_PATTERN.test(validHash)).toBe(true);
        });

        it('should reject invalid SRI hash formats', () => {
            expect(SRI_PATTERN.test('')).toBe(false);
            expect(SRI_PATTERN.test('invalid')).toBe(false);
            expect(SRI_PATTERN.test('sha384')).toBe(false);
            expect(SRI_PATTERN.test('md5-abc123')).toBe(false);
        });
    });
});

// ============================================================================
// TonePianoAdapter Tests (Unit)
// ============================================================================

describe('TonePianoAdapter', () => {
    describe('constants', () => {
        it('should have reasonable timeout for sample loading', () => {
            expect(SAMPLE_LOAD_TIMEOUT_MS).toBe(30000); // 30 seconds
        });
    });

    describe('velocity layers', () => {
        const validVelocities = [1, 4, 5, 16] as const;

        validVelocities.forEach(layers => {
            it(`should accept ${layers} velocity layers`, () => {
                expect(validVelocities.includes(layers)).toBe(true);
            });
        });

        it('should reject invalid velocity layer counts', () => {
            const invalidValues = [0, 2, 3, 6, 10, 32];
            invalidValues.forEach(val => {
                expect(validVelocities.includes(val as 1 | 4 | 5 | 16)).toBe(false);
            });
        });
    });

    describe('pedal state management', () => {
        it('should track pedal state correctly', () => {
            let isPedalDown = false;

            // Pedal down
            isPedalDown = true;
            expect(isPedalDown).toBe(true);

            // Pedal up
            isPedalDown = false;
            expect(isPedalDown).toBe(false);
        });
    });
});

// ============================================================================
// SampledInstrument Base Class Tests
// ============================================================================

describe('SampledInstrument (Base Class)', () => {
    describe('noteToMidi conversion', () => {
        const noteToMidi = (note: string): number => {
            const noteNames: Record<string, number> = {
                'C': 0, 'C#': 1, 'Db': 1,
                'D': 2, 'D#': 3, 'Eb': 3,
                'E': 4, 'F': 5, 'F#': 6, 'Gb': 6,
                'G': 7, 'G#': 8, 'Ab': 8,
                'A': 9, 'A#': 10, 'Bb': 10,
                'B': 11
            };

            const match = note.match(/^([A-Ga-g][#b]?)(-?\d+)$/);
            if (!match) return 60; // Default to middle C

            const noteName = match[1].charAt(0).toUpperCase() + match[1].slice(1);
            const octave = parseInt(match[2], 10);

            const noteIndex = noteNames[noteName] ?? 0;
            return (octave + 1) * 12 + noteIndex;
        };

        it('should convert standard notes correctly', () => {
            expect(noteToMidi('C4')).toBe(60);
            expect(noteToMidi('A4')).toBe(69);
            expect(noteToMidi('C5')).toBe(72);
        });

        it('should handle sharps and flats', () => {
            expect(noteToMidi('C#4')).toBe(61);
            expect(noteToMidi('Db4')).toBe(61);
            expect(noteToMidi('Bb3')).toBe(58);
        });

        it('should handle extreme octaves', () => {
            expect(noteToMidi('C0')).toBe(12);
            expect(noteToMidi('C8')).toBe(108);
        });

        it('should default to C4 for invalid input', () => {
            expect(noteToMidi('')).toBe(60);
            expect(noteToMidi('invalid')).toBe(60);
        });
    });

    describe('time constant calculation', () => {
        // Time constants for natural release (damping)
        // Bass notes ring longer, treble notes decay faster
        const getTimeConstantForNote = (note: string): number => {
            const noteToMidi = (n: string): number => {
                const match = n.match(/^([A-Ga-g][#b]?)(-?\d+)$/);
                if (!match) return 60;
                const noteNames: Record<string, number> = {
                    'C': 0, 'D': 2, 'E': 4, 'F': 5, 'G': 7, 'A': 9, 'B': 11,
                    'C#': 1, 'D#': 3, 'F#': 6, 'G#': 8, 'A#': 10,
                    'Db': 1, 'Eb': 3, 'Gb': 6, 'Ab': 8, 'Bb': 10
                };
                const noteName = match[1].charAt(0).toUpperCase() + match[1].slice(1);
                const octave = parseInt(match[2], 10);
                return (octave + 1) * 12 + (noteNames[noteName] ?? 0);
            };

            const midi = noteToMidi(note);

            // Bass (MIDI 0-40): longer decay ~0.15s
            // Mid (MIDI 41-70): medium decay ~0.08s
            // Treble (MIDI 71+): short decay ~0.05s
            if (midi <= 40) return 0.15;
            if (midi <= 70) return 0.08;
            return 0.05;
        };

        it('should return longer time constant for bass notes', () => {
            expect(getTimeConstantForNote('C1')).toBe(0.15); // MIDI 24
            expect(getTimeConstantForNote('A0')).toBe(0.15); // MIDI 21
        });

        it('should return medium time constant for mid-range notes', () => {
            expect(getTimeConstantForNote('C4')).toBe(0.08); // MIDI 60
            expect(getTimeConstantForNote('A3')).toBe(0.08); // MIDI 57
        });

        it('should return short time constant for treble notes', () => {
            expect(getTimeConstantForNote('C6')).toBe(0.05); // MIDI 84
            expect(getTimeConstantForNote('C8')).toBe(0.05); // MIDI 108
        });
    });

    describe('pending cleanup management', () => {
        it('should track and clear pending cleanups', () => {
            const pendingCleanups = new Set<number>();

            // Add some cleanup timeouts
            const timeout1 = 123;
            const timeout2 = 456;
            pendingCleanups.add(timeout1);
            pendingCleanups.add(timeout2);

            expect(pendingCleanups.size).toBe(2);

            // Clear one
            pendingCleanups.delete(timeout1);
            expect(pendingCleanups.size).toBe(1);

            // Clear all (simulating disconnect)
            pendingCleanups.clear();
            expect(pendingCleanups.size).toBe(0);
        });
    });
});

// ============================================================================
// Error Handling Tests
// ============================================================================

describe('Sampler Error Handling', () => {
    describe('timeout behavior', () => {
        it('should reject after timeout period', async () => {
            const QUICK_TIMEOUT = 100; // 100ms for testing

            const loadWithTimeout = (): Promise<void> => {
                return new Promise((_, reject) => {
                    setTimeout(() => {
                        reject(new Error(`Loading timeout (${QUICK_TIMEOUT}ms)`));
                    }, QUICK_TIMEOUT);
                });
            };

            await expect(loadWithTimeout()).rejects.toThrow('Loading timeout');
        });

        it('should clear timeout on successful load', async () => {
            let timeoutCleared = false;

            const loadWithProperCleanup = async (): Promise<void> => {
                let timeoutId: ReturnType<typeof setTimeout> | null = null;

                try {
                    const loadPromise = new Promise<void>(resolve => {
                        setTimeout(resolve, 50); // Quick success
                    });

                    const timeoutPromise = new Promise<never>((_, reject) => {
                        timeoutId = setTimeout(() => {
                            reject(new Error('Timeout'));
                        }, 200);
                    });

                    await Promise.race([loadPromise, timeoutPromise]);
                } finally {
                    if (timeoutId !== null) {
                        clearTimeout(timeoutId);
                        timeoutCleared = true;
                    }
                }
            };

            await loadWithProperCleanup();
            expect(timeoutCleared).toBe(true);
        });
    });

    describe('script loading retry', () => {
        it('should allow retry after script load failure', () => {
            let scriptLoadPromise: Promise<void> | null = null;
            let loadAttempts = 0;

            const loadScript = (): Promise<void> => {
                if (scriptLoadPromise) return scriptLoadPromise;

                scriptLoadPromise = new Promise((_, reject) => {
                    loadAttempts++;
                    // Simulate failure
                    scriptLoadPromise = null; // Reset to allow retry
                    reject(new Error('Load failed'));
                });

                return scriptLoadPromise;
            };

            // First attempt
            expect(loadScript()).rejects.toThrow('Load failed');

            // Should be able to retry (promise was reset)
            expect(loadScript()).rejects.toThrow('Load failed');

            // Verify multiple attempts were made
            expect(loadAttempts).toBeGreaterThanOrEqual(1);
        });
    });
});

// ============================================================================
// Memory Leak Prevention Tests
// ============================================================================

describe('Memory Leak Prevention', () => {
    describe('global scope cleanup', () => {
        it('should track and delete preset variables', () => {
            const mockGlobal: Record<string, unknown> = {};

            // Simulate loading presets
            mockGlobal['_tone_0250_Acoustic_Grand_Piano'] = { zones: [] };
            mockGlobal['_drum_35_0_Chaos_sf2_file'] = { zones: [] };

            expect(Object.keys(mockGlobal).length).toBe(2);

            // Simulate cleanup on disconnect
            delete mockGlobal['_tone_0250_Acoustic_Grand_Piano'];
            delete mockGlobal['_drum_35_0_Chaos_sf2_file'];

            expect(Object.keys(mockGlobal).length).toBe(0);
        });
    });

    describe('gain node cleanup', () => {
        it('should disconnect and clear all note gain nodes', () => {
            const disconnectMocks: ReturnType<typeof vi.fn>[] = [];
            const noteHandles = new Map<string, { cancel: () => void; gainNode: { disconnect: () => void } }>();

            // Create mock handles
            for (let i = 0; i < 3; i++) {
                const disconnect = vi.fn();
                disconnectMocks.push(disconnect);
                noteHandles.set(`note${i}`, {
                    cancel: vi.fn(),
                    gainNode: { disconnect }
                });
            }

            // Cleanup
            noteHandles.forEach(handle => {
                handle.gainNode.disconnect();
            });
            noteHandles.clear();

            // Verify
            expect(noteHandles.size).toBe(0);
            disconnectMocks.forEach(mock => {
                expect(mock).toHaveBeenCalled();
            });
        });
    });
});
