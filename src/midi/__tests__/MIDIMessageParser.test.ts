/**
 * MIDI Message Parser Tests
 *
 * Tests parsing of MIDI messages, edge cases, and utility functions.
 */

import { describe, it, expect } from 'vitest';
import {
  parseMIDIMessage,
  midiNoteToName,
  noteNameToMidi,
  getCCName,
  normalizeMIDIValue,
  denormalizeMIDIValue,
} from '../MIDIMessageParser';
import { MIDI_COMMANDS } from '../types';

describe('MIDIMessageParser', () => {
  describe('parseMIDIMessage', () => {
    const deviceId = 'test-device';
    const timestamp = 1000;

    describe('Note On messages', () => {
      it('should parse Note On message correctly', () => {
        // Note On, Channel 0, Note 60 (C4), Velocity 100
        const data = new Uint8Array([0x90, 60, 100]);
        const event = parseMIDIMessage(data, timestamp, deviceId);

        expect(event).not.toBeNull();
        expect(event?.type).toBe('noteOn');
        expect(event?.channel).toBe(0);
        if (event?.type === 'noteOn') {
          expect(event.note).toBe(60);
          expect(event.velocity).toBe(100);
          expect(event.normalizedVelocity).toBeCloseTo(100 / 127);
        }
      });

      it('should treat Note On with velocity 0 as Note Off', () => {
        const data = new Uint8Array([0x90, 60, 0]);
        const event = parseMIDIMessage(data, timestamp, deviceId);

        expect(event).not.toBeNull();
        expect(event?.type).toBe('noteOff');
      });

      it('should parse Note On on different channels', () => {
        // Channel 15 (0x9F)
        const data = new Uint8Array([0x9F, 60, 100]);
        const event = parseMIDIMessage(data, timestamp, deviceId);

        expect(event?.channel).toBe(15);
      });
    });

    describe('Note Off messages', () => {
      it('should parse Note Off message correctly', () => {
        // Note Off, Channel 0, Note 60, Velocity 64
        const data = new Uint8Array([0x80, 60, 64]);
        const event = parseMIDIMessage(data, timestamp, deviceId);

        expect(event).not.toBeNull();
        expect(event?.type).toBe('noteOff');
        if (event?.type === 'noteOff') {
          expect(event.note).toBe(60);
          expect(event.velocity).toBe(64);
        }
      });
    });

    describe('Control Change messages', () => {
      it('should parse CC message correctly', () => {
        // CC, Channel 0, Controller 1 (Mod Wheel), Value 127
        const data = new Uint8Array([0xB0, 1, 127]);
        const event = parseMIDIMessage(data, timestamp, deviceId);

        expect(event).not.toBeNull();
        expect(event?.type).toBe('cc');
        if (event?.type === 'cc') {
          expect(event.controller).toBe(1);
          expect(event.value).toBe(127);
          expect(event.normalizedValue).toBeCloseTo(1);
        }
      });

      it('should parse sustain pedal CC', () => {
        // CC 64 = Sustain pedal
        const data = new Uint8Array([0xB0, 64, 127]);
        const event = parseMIDIMessage(data, timestamp, deviceId);

        expect(event?.type).toBe('cc');
        if (event?.type === 'cc') {
          expect(event.controller).toBe(64);
        }
      });
    });

    describe('Pitch Bend messages', () => {
      it('should parse center pitch bend (no bend)', () => {
        // Pitch bend center = 8192 (0x2000)
        // LSB = 0, MSB = 64
        const data = new Uint8Array([0xE0, 0, 64]);
        const event = parseMIDIMessage(data, timestamp, deviceId);

        expect(event).not.toBeNull();
        expect(event?.type).toBe('pitchBend');
        if (event?.type === 'pitchBend') {
          expect(event.value).toBe(0); // Centered
          expect(event.normalizedValue).toBeCloseTo(0);
        }
      });

      it('should parse maximum pitch bend up', () => {
        // Max bend up = 16383 (0x3FFF)
        // LSB = 127, MSB = 127
        const data = new Uint8Array([0xE0, 127, 127]);
        const event = parseMIDIMessage(data, timestamp, deviceId);

        if (event?.type === 'pitchBend') {
          expect(event.value).toBe(8191); // Max positive
          expect(event.normalizedValue).toBeCloseTo(1, 1);
        }
      });

      it('should parse maximum pitch bend down', () => {
        // Min bend = 0 (0x0000)
        // LSB = 0, MSB = 0
        const data = new Uint8Array([0xE0, 0, 0]);
        const event = parseMIDIMessage(data, timestamp, deviceId);

        if (event?.type === 'pitchBend') {
          expect(event.value).toBe(-8192); // Max negative
          expect(event.normalizedValue).toBeCloseTo(-1);
        }
      });
    });

    describe('Aftertouch messages', () => {
      it('should parse channel aftertouch', () => {
        // Channel aftertouch, Channel 0, Pressure 100
        const data = new Uint8Array([0xD0, 100]);
        const event = parseMIDIMessage(data, timestamp, deviceId);

        expect(event).not.toBeNull();
        expect(event?.type).toBe('aftertouch');
        if (event?.type === 'aftertouch') {
          expect(event.pressure).toBe(100);
          expect(event.normalizedPressure).toBeCloseTo(100 / 127);
        }
      });

      it('should parse polyphonic aftertouch', () => {
        // Poly aftertouch, Channel 0, Note 60, Pressure 80
        const data = new Uint8Array([0xA0, 60, 80]);
        const event = parseMIDIMessage(data, timestamp, deviceId);

        expect(event?.type).toBe('aftertouch');
        if (event?.type === 'aftertouch') {
          expect(event.note).toBe(60);
          expect(event.pressure).toBe(80);
        }
      });
    });

    describe('Program Change messages', () => {
      it('should parse program change', () => {
        // Program change, Channel 0, Program 5
        const data = new Uint8Array([0xC0, 5]);
        const event = parseMIDIMessage(data, timestamp, deviceId);

        expect(event).not.toBeNull();
        expect(event?.type).toBe('programChange');
        if (event?.type === 'programChange') {
          expect(event.program).toBe(5);
        }
      });
    });

    describe('Edge cases', () => {
      it('should return null for empty data', () => {
        const event = parseMIDIMessage(new Uint8Array([]), timestamp, deviceId);
        expect(event).toBeNull();
      });

      it('should return null for truncated Note On (missing velocity)', () => {
        const data = new Uint8Array([0x90, 60]); // Missing velocity
        const event = parseMIDIMessage(data, timestamp, deviceId);
        expect(event).toBeNull();
      });

      it('should return null for system messages', () => {
        // System Exclusive
        const data = new Uint8Array([0xF0, 0x7E, 0x7F, 0x09, 0x01, 0xF7]);
        const event = parseMIDIMessage(data, timestamp, deviceId);
        expect(event).toBeNull();
      });

      it('should handle all 16 MIDI channels', () => {
        for (let channel = 0; channel < 16; channel++) {
          const statusByte = MIDI_COMMANDS.NOTE_ON | channel;
          const data = new Uint8Array([statusByte, 60, 100]);
          const event = parseMIDIMessage(data, timestamp, deviceId);
          expect(event?.channel).toBe(channel);
        }
      });
    });
  });

  describe('midiNoteToName', () => {
    it('should convert middle C (60) to C4', () => {
      expect(midiNoteToName(60)).toBe('C4');
    });

    it('should convert A4 (69) correctly', () => {
      expect(midiNoteToName(69)).toBe('A4');
    });

    it('should handle sharps', () => {
      expect(midiNoteToName(61)).toBe('C#4');
      expect(midiNoteToName(70)).toBe('A#4');
    });

    it('should handle octave boundaries', () => {
      expect(midiNoteToName(0)).toBe('C-1');
      expect(midiNoteToName(12)).toBe('C0');
      expect(midiNoteToName(127)).toBe('G9');
    });
  });

  describe('noteNameToMidi', () => {
    it('should convert C4 to 60', () => {
      expect(noteNameToMidi('C4')).toBe(60);
    });

    it('should convert A4 to 69', () => {
      expect(noteNameToMidi('A4')).toBe(69);
    });

    it('should handle sharps', () => {
      expect(noteNameToMidi('C#4')).toBe(61);
      expect(noteNameToMidi('F#5')).toBe(78);
    });

    it('should be case insensitive', () => {
      expect(noteNameToMidi('c4')).toBe(60);
      expect(noteNameToMidi('C#4')).toBe(61);
    });

    it('should return null for invalid note names', () => {
      expect(noteNameToMidi('X4')).toBeNull();
      expect(noteNameToMidi('invalid')).toBeNull();
      expect(noteNameToMidi('')).toBeNull();
    });

    it('should handle negative octaves', () => {
      expect(noteNameToMidi('C-1')).toBe(0);
    });
  });

  describe('getCCName', () => {
    it('should return names for standard CCs', () => {
      expect(getCCName(1)).toBe('Modulation');
      expect(getCCName(7)).toBe('Volume');
      expect(getCCName(64)).toBe('Sustain');
      expect(getCCName(74)).toBe('Cutoff');
    });

    it('should return generic name for unknown CCs', () => {
      expect(getCCName(50)).toBe('CC 50');
      expect(getCCName(99)).toBe('CC 99');
    });
  });

  describe('normalizeMIDIValue', () => {
    it('should normalize 0 to 0', () => {
      expect(normalizeMIDIValue(0)).toBe(0);
    });

    it('should normalize 127 to 1', () => {
      expect(normalizeMIDIValue(127)).toBeCloseTo(1);
    });

    it('should normalize 64 to approximately 0.5', () => {
      expect(normalizeMIDIValue(64)).toBeCloseTo(64 / 127);
    });

    it('should clamp values above 127', () => {
      expect(normalizeMIDIValue(200)).toBe(1);
    });

    it('should clamp values below 0', () => {
      expect(normalizeMIDIValue(-10)).toBe(0);
    });
  });

  describe('denormalizeMIDIValue', () => {
    it('should denormalize 0 to 0', () => {
      expect(denormalizeMIDIValue(0)).toBe(0);
    });

    it('should denormalize 1 to 127', () => {
      expect(denormalizeMIDIValue(1)).toBe(127);
    });

    it('should denormalize 0.5 to approximately 64', () => {
      expect(denormalizeMIDIValue(0.5)).toBe(64);
    });

    it('should clamp values above 1', () => {
      expect(denormalizeMIDIValue(1.5)).toBe(127);
    });

    it('should clamp values below 0', () => {
      expect(denormalizeMIDIValue(-0.5)).toBe(0);
    });

    it('should round to nearest integer', () => {
      expect(denormalizeMIDIValue(0.333)).toBe(42);
    });
  });

  describe('Round-trip conversion', () => {
    it('should preserve values through note name conversion', () => {
      for (let note = 0; note <= 127; note++) {
        const name = midiNoteToName(note);
        const converted = noteNameToMidi(name);
        expect(converted).toBe(note);
      }
    });

    it('should approximately preserve values through MIDI normalization', () => {
      for (let value = 0; value <= 127; value++) {
        const normalized = normalizeMIDIValue(value);
        const denormalized = denormalizeMIDIValue(normalized);
        expect(denormalized).toBe(value);
      }
    });
  });
});
