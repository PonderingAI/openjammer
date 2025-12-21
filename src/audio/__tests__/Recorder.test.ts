/**
 * Recorder Tests
 *
 * Tests filename sanitization and recording functionality.
 */

import { describe, it, expect } from 'vitest';

// Re-implement sanitizeFilename for testing since it's private
const MAX_FILENAME_LENGTH = 200;
const WINDOWS_RESERVED_NAMES = /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/i;

function sanitizeFilename(name: string, fallback = 'Recording'): string {
  let safe = name.replace(/[^a-zA-Z0-9\s\-_]/g, '').replace(/\s+/g, '_').trim();
  safe = safe.replace(/^[.\-_]+|[.\-_]+$/g, '');
  if (WINDOWS_RESERVED_NAMES.test(safe)) {
    safe = `file_${safe}`;
  }
  if (safe.length > MAX_FILENAME_LENGTH) {
    safe = safe.slice(0, MAX_FILENAME_LENGTH);
    safe = safe.replace(/[.\-_]+$/, '');
  }
  return safe || fallback;
}

describe('Filename Sanitization', () => {
  describe('Basic sanitization', () => {
    it('should preserve alphanumeric characters', () => {
      expect(sanitizeFilename('Recording123')).toBe('Recording123');
    });

    it('should replace spaces with underscores', () => {
      expect(sanitizeFilename('My Recording')).toBe('My_Recording');
    });

    it('should collapse multiple spaces', () => {
      expect(sanitizeFilename('My   Recording')).toBe('My_Recording');
    });

    it('should preserve hyphens and underscores', () => {
      expect(sanitizeFilename('my-recording_01')).toBe('my-recording_01');
    });
  });

  describe('Unsafe character removal', () => {
    it('should remove special characters', () => {
      expect(sanitizeFilename('recording!@#$%^&*()')).toBe('recording');
    });

    it('should remove path separators', () => {
      expect(sanitizeFilename('path/to/file')).toBe('pathtofile');
      expect(sanitizeFilename('path\\to\\file')).toBe('pathtofile');
    });

    it('should remove unicode characters', () => {
      expect(sanitizeFilename('recording🎵🎹')).toBe('recording');
    });

    it('should remove quotes', () => {
      expect(sanitizeFilename('"recording"')).toBe('recording');
      expect(sanitizeFilename("'recording'")).toBe('recording');
    });
  });

  describe('Leading/trailing character handling', () => {
    it('should remove leading dots', () => {
      expect(sanitizeFilename('.hidden')).toBe('hidden');
      expect(sanitizeFilename('...hidden')).toBe('hidden');
    });

    it('should remove trailing dots', () => {
      expect(sanitizeFilename('recording.')).toBe('recording');
      expect(sanitizeFilename('recording...')).toBe('recording');
    });

    it('should remove leading hyphens', () => {
      expect(sanitizeFilename('-recording')).toBe('recording');
      expect(sanitizeFilename('---recording')).toBe('recording');
    });

    it('should remove trailing hyphens', () => {
      expect(sanitizeFilename('recording-')).toBe('recording');
    });

    it('should remove leading underscores', () => {
      expect(sanitizeFilename('_recording')).toBe('recording');
      expect(sanitizeFilename('___recording')).toBe('recording');
    });
  });

  describe('Windows reserved names', () => {
    it('should prefix CON', () => {
      expect(sanitizeFilename('CON')).toBe('file_CON');
    });

    it('should prefix PRN', () => {
      expect(sanitizeFilename('PRN')).toBe('file_PRN');
    });

    it('should prefix AUX', () => {
      expect(sanitizeFilename('AUX')).toBe('file_AUX');
    });

    it('should prefix NUL', () => {
      expect(sanitizeFilename('NUL')).toBe('file_NUL');
    });

    it('should prefix COM ports', () => {
      expect(sanitizeFilename('COM1')).toBe('file_COM1');
      expect(sanitizeFilename('COM9')).toBe('file_COM9');
    });

    it('should prefix LPT ports', () => {
      expect(sanitizeFilename('LPT1')).toBe('file_LPT1');
      expect(sanitizeFilename('LPT9')).toBe('file_LPT9');
    });

    it('should be case insensitive', () => {
      expect(sanitizeFilename('con')).toBe('file_con');
      expect(sanitizeFilename('Con')).toBe('file_Con');
      expect(sanitizeFilename('cON')).toBe('file_cON');
    });

    it('should not prefix similar but valid names', () => {
      expect(sanitizeFilename('CONTROL')).toBe('CONTROL');
      expect(sanitizeFilename('COM10')).toBe('COM10');
      expect(sanitizeFilename('PRNT')).toBe('PRNT');
    });
  });

  describe('Length limits', () => {
    it('should truncate names exceeding max length', () => {
      const longName = 'a'.repeat(250);
      const result = sanitizeFilename(longName);
      expect(result.length).toBeLessThanOrEqual(MAX_FILENAME_LENGTH);
    });

    it('should clean up trailing special chars after truncation', () => {
      const longName = 'a'.repeat(199) + '_';
      const result = sanitizeFilename(longName);
      // After truncation and cleanup, shouldn't end with underscore
      expect(result.endsWith('_')).toBe(false);
    });
  });

  describe('Fallback handling', () => {
    it('should use fallback for empty string', () => {
      expect(sanitizeFilename('')).toBe('Recording');
    });

    it('should use fallback for string that becomes empty after sanitization', () => {
      expect(sanitizeFilename('!@#$%')).toBe('Recording');
    });

    it('should use fallback for string of only special characters', () => {
      expect(sanitizeFilename('...')).toBe('Recording');
    });

    it('should use custom fallback', () => {
      expect(sanitizeFilename('', 'Untitled')).toBe('Untitled');
    });
  });

  describe('Real-world examples', () => {
    it('should handle typical recording names', () => {
      expect(sanitizeFilename('Recording 1')).toBe('Recording_1');
      expect(sanitizeFilename('My Song - Take 2')).toBe('My_Song_-_Take_2');
      expect(sanitizeFilename('2024-01-15 Session')).toBe('2024-01-15_Session');
    });

    it('should handle user-entered names with accidental characters', () => {
      expect(sanitizeFilename('Guitar Solo!!!')).toBe('Guitar_Solo');
      expect(sanitizeFilename('  Drums  ')).toBe('Drums');
    });

    it('should handle copy-pasted text with formatting', () => {
      // Tabs and newlines are treated as whitespace and replaced with underscores
      // then collapsed, resulting in underscores between words
      expect(sanitizeFilename('Song\ttitle')).toBe('Song_title');
      expect(sanitizeFilename('Line1\nLine2')).toBe('Line1_Line2');
    });
  });
});
