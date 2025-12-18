/**
 * Unique ID Generator
 *
 * Generates collision-resistant IDs for ports and other elements.
 * Uses a combination of timestamp, counter, and random string to ensure uniqueness
 * even when multiple IDs are generated in rapid succession.
 */

let counter = 0;

/**
 * Generate a unique ID with optional prefix
 * @param prefix - Optional prefix for the ID (e.g., 'input-', 'port-')
 * @returns A unique string ID
 */
export function generateUniqueId(prefix = ''): string {
    const timestamp = Date.now();
    const count = ++counter;
    const random = Math.random().toString(36).substring(2, 11);
    return `${prefix}${timestamp}-${count}-${random}`;
}

/**
 * Reset the counter (primarily for testing)
 */
export function resetIdCounter(): void {
    counter = 0;
}
