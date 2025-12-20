/**
 * Port ID Validation Tests
 *
 * Tests for port ID validation to prevent path traversal,
 * XSS, and injection attacks.
 */

import { describe, it, expect } from 'vitest';
import {
    isValidPortId,
    isValidCompositePortId,
    sanitizePortId
} from '../portSync';

describe('Port ID Validation', () => {
    describe('isValidPortId', () => {
        describe('valid port IDs', () => {
            it('should accept simple port IDs', () => {
                expect(isValidPortId('port')).toBe(true);
                expect(isValidPortId('input')).toBe(true);
                expect(isValidPortId('output')).toBe(true);
            });

            it('should accept port IDs with numbers', () => {
                expect(isValidPortId('port1')).toBe(true);
                expect(isValidPortId('input123')).toBe(true);
                expect(isValidPortId('audio2')).toBe(true);
            });

            it('should accept port IDs with hyphens', () => {
                expect(isValidPortId('audio-out')).toBe(true);
                expect(isValidPortId('port-1')).toBe(true);
                expect(isValidPortId('bundle-1234567890-1-abc123def')).toBe(true);
            });

            it('should accept port IDs with underscores', () => {
                expect(isValidPortId('audio_out')).toBe(true);
                expect(isValidPortId('port_input_1')).toBe(true);
            });

            it('should accept mixed valid characters', () => {
                expect(isValidPortId('port_1-test')).toBe(true);
                expect(isValidPortId('output-panel-1734802500123-1-xyz789')).toBe(true);
            });
        });

        describe('invalid port IDs', () => {
            it('should reject empty strings', () => {
                expect(isValidPortId('')).toBe(false);
            });

            it('should reject null/undefined', () => {
                expect(isValidPortId(null as unknown as string)).toBe(false);
                expect(isValidPortId(undefined as unknown as string)).toBe(false);
            });

            it('should reject IDs starting with numbers', () => {
                expect(isValidPortId('1port')).toBe(false);
                expect(isValidPortId('123')).toBe(false);
            });

            it('should reject path traversal attempts', () => {
                expect(isValidPortId('../etc/passwd')).toBe(false);
                expect(isValidPortId('..\\windows\\system32')).toBe(false);
                expect(isValidPortId('port/../secret')).toBe(false);
                expect(isValidPortId('/etc/passwd')).toBe(false);
            });

            it('should reject XSS attempts', () => {
                expect(isValidPortId('<script>alert(1)</script>')).toBe(false);
                expect(isValidPortId('port<img src=x onerror=alert(1)>')).toBe(false);
                expect(isValidPortId('port"onclick="evil()"')).toBe(false);
                expect(isValidPortId("port'onclick='evil()'")).toBe(false);
            });

            it('should reject SQL injection attempts', () => {
                expect(isValidPortId("port'; DROP TABLE--")).toBe(false);
                expect(isValidPortId('port" OR 1=1--')).toBe(false);
                expect(isValidPortId('port; DELETE FROM')).toBe(false);
            });

            it('should reject command injection attempts', () => {
                expect(isValidPortId('port; rm -rf /')).toBe(false);
                expect(isValidPortId('port$(whoami)')).toBe(false);
                expect(isValidPortId('port`id`')).toBe(false);
                expect(isValidPortId('port|cat /etc/passwd')).toBe(false);
            });

            it('should reject IDs with special characters', () => {
                expect(isValidPortId('port@test')).toBe(false);
                expect(isValidPortId('port#1')).toBe(false);
                expect(isValidPortId('port%20')).toBe(false);
                expect(isValidPortId('port&test')).toBe(false);
                expect(isValidPortId('port=value')).toBe(false);
            });

            it('should reject excessively long IDs (DoS prevention)', () => {
                const longId = 'a' + 'b'.repeat(300);
                expect(isValidPortId(longId)).toBe(false);
            });

            it('should reject IDs with colons (reserved for composite)', () => {
                expect(isValidPortId('port:1')).toBe(false);
            });
        });
    });

    describe('isValidCompositePortId', () => {
        describe('valid composite port IDs', () => {
            it('should accept simple port IDs (no colon)', () => {
                expect(isValidCompositePortId('port')).toBe(true);
                expect(isValidCompositePortId('audio-out')).toBe(true);
            });

            it('should accept valid composite IDs', () => {
                expect(isValidCompositePortId('output-panel-123:port-1')).toBe(true);
                expect(isValidCompositePortId('panelA:portB')).toBe(true);
            });

            it('should accept generated composite IDs', () => {
                expect(isValidCompositePortId('output-panel-1734802500123-1-xyz:port-1')).toBe(true);
                expect(isValidCompositePortId('input-panel-1234567890-42-abc:bundle-99')).toBe(true);
            });
        });

        describe('invalid composite port IDs', () => {
            it('should reject empty strings', () => {
                expect(isValidCompositePortId('')).toBe(false);
            });

            it('should reject multiple colons', () => {
                expect(isValidCompositePortId('panel:port:extra')).toBe(false);
                expect(isValidCompositePortId('a:b:c:d')).toBe(false);
            });

            it('should reject invalid panel IDs', () => {
                expect(isValidCompositePortId('../evil:port')).toBe(false);
                expect(isValidCompositePortId('<script>:port')).toBe(false);
            });

            it('should reject invalid port IDs after colon', () => {
                expect(isValidCompositePortId('panel:../evil')).toBe(false);
                expect(isValidCompositePortId('panel:<script>')).toBe(false);
            });

            it('should reject excessively long composite IDs', () => {
                const longId = 'a'.repeat(300) + ':' + 'b'.repeat(300);
                expect(isValidCompositePortId(longId)).toBe(false);
            });
        });
    });

    describe('sanitizePortId', () => {
        it('should return valid IDs unchanged', () => {
            expect(sanitizePortId('port')).toBe('port');
            expect(sanitizePortId('audio-out')).toBe('audio-out');
            expect(sanitizePortId('port_1')).toBe('port_1');
        });

        it('should handle empty/null input', () => {
            expect(sanitizePortId('')).toBe('invalid-port');
            expect(sanitizePortId(null as unknown as string)).toBe('invalid-port');
            expect(sanitizePortId(undefined as unknown as string)).toBe('invalid-port');
        });

        it('should remove invalid characters', () => {
            expect(sanitizePortId('port<script>')).toBe('portscript');
            expect(sanitizePortId('port/../test')).toBe('porttest');
            expect(sanitizePortId('port@#$test')).toBe('porttest');
        });

        it('should prefix IDs starting with numbers', () => {
            expect(sanitizePortId('123port')).toBe('port-123port');
        });

        it('should truncate very long IDs', () => {
            const longId = 'a'.repeat(500);
            const sanitized = sanitizePortId(longId);
            expect(sanitized.length).toBeLessThanOrEqual(256);
        });
    });
});
