import { describe, it, expect, beforeEach } from 'vitest';
import { generateUniqueId, resetIdCounter } from '../idGenerator';

describe('idGenerator', () => {
    beforeEach(() => {
        resetIdCounter();
    });

    describe('generateUniqueId', () => {
        it('should generate a string ID', () => {
            const id = generateUniqueId();
            expect(typeof id).toBe('string');
            expect(id.length).toBeGreaterThan(0);
        });

        it('should include prefix when provided', () => {
            const id = generateUniqueId('input-');
            expect(id.startsWith('input-')).toBe(true);
        });

        it('should work without prefix', () => {
            const id = generateUniqueId();
            expect(id).toBeTruthy();
        });

        it('should generate unique IDs on successive calls', () => {
            const ids = new Set<string>();
            for (let i = 0; i < 100; i++) {
                ids.add(generateUniqueId('test-'));
            }
            // All 100 IDs should be unique
            expect(ids.size).toBe(100);
        });

        it('should generate unique IDs even when called rapidly', () => {
            const ids = new Set<string>();
            // Generate many IDs as fast as possible
            for (let i = 0; i < 1000; i++) {
                ids.add(generateUniqueId());
            }
            // All IDs should be unique
            expect(ids.size).toBe(1000);
        });

        it('should include timestamp component', () => {
            const before = Date.now();
            const id = generateUniqueId('prefix-');
            const after = Date.now();

            // Extract timestamp from ID (after prefix)
            const withoutPrefix = id.replace('prefix-', '');
            const timestampStr = withoutPrefix.split('-')[0];
            const timestamp = parseInt(timestampStr, 10);

            expect(timestamp).toBeGreaterThanOrEqual(before);
            expect(timestamp).toBeLessThanOrEqual(after);
        });

        it('should include counter component that increments', () => {
            resetIdCounter();

            const id1 = generateUniqueId('test-');
            const id2 = generateUniqueId('test-');

            // Extract counter from both IDs
            const parts1 = id1.replace('test-', '').split('-');
            const parts2 = id2.replace('test-', '').split('-');

            const counter1 = parseInt(parts1[1], 10);
            const counter2 = parseInt(parts2[1], 10);

            expect(counter2).toBe(counter1 + 1);
        });

        it('should include random component', () => {
            const id = generateUniqueId();
            const parts = id.split('-');

            // Should have at least 3 parts: timestamp, counter, random
            expect(parts.length).toBeGreaterThanOrEqual(3);

            // Random part should be alphanumeric
            const randomPart = parts[parts.length - 1];
            expect(/^[a-z0-9]+$/.test(randomPart)).toBe(true);
        });
    });

    describe('resetIdCounter', () => {
        it('should reset the counter', () => {
            // Generate some IDs
            generateUniqueId();
            generateUniqueId();
            generateUniqueId();

            // Reset
            resetIdCounter();

            // Next ID should have counter = 1
            const id = generateUniqueId('test-');
            const parts = id.replace('test-', '').split('-');
            const counter = parseInt(parts[1], 10);

            expect(counter).toBe(1);
        });
    });
});
