/**
 * Graph Safety Tests
 *
 * Tests for cycle detection and safe graph traversal
 * in hierarchical audio routing.
 */

import { describe, it, expect } from 'vitest';

// ============================================================================
// Cycle Detection Logic (mirrored from AudioGraphManager)
// ============================================================================

/**
 * Detect cycles during hierarchical graph traversal
 * Uses a Set to track visited nodes and detect if we've visited a node twice
 *
 * @param nodeId - Current node being visited
 * @param visited - Set of already visited node IDs
 * @returns true if a cycle is detected (node already visited)
 */
function detectCycle(nodeId: string, visited: Set<string>): boolean {
    if (visited.has(nodeId)) {
        return true; // Cycle detected
    }
    visited.add(nodeId);
    return false;
}

/**
 * Safe recursive graph traversal with cycle detection
 * Returns the path of visited nodes, stopping at cycle
 */
function traverseGraph(
    graph: Map<string, string[]>,
    startNode: string,
    maxDepth: number = 100
): { path: string[]; hasCycle: boolean; cycleAt?: string } {
    const visited = new Set<string>();
    const path: string[] = [];
    let currentNode = startNode;
    let depth = 0;

    while (depth < maxDepth) {
        if (detectCycle(currentNode, visited)) {
            return { path, hasCycle: true, cycleAt: currentNode };
        }

        path.push(currentNode);

        const children = graph.get(currentNode);
        if (!children || children.length === 0) {
            break; // Leaf node
        }

        // Follow first child (simplified - real traversal would be recursive)
        currentNode = children[0];
        depth++;
    }

    return { path, hasCycle: depth >= maxDepth };
}

/**
 * Breadth-first search for detecting any cycle in graph
 */
function hasAnyCycle(graph: Map<string, string[]>): boolean {
    const allNodes = new Set<string>();

    // Collect all nodes
    for (const [node, children] of graph) {
        allNodes.add(node);
        for (const child of children) {
            allNodes.add(child);
        }
    }

    // Check each node as potential start
    for (const startNode of allNodes) {
        const result = traverseGraph(graph, startNode);
        if (result.hasCycle) {
            return true;
        }
    }

    return false;
}

// ============================================================================
// Tests
// ============================================================================

describe('Graph Safety', () => {
    describe('detectCycle', () => {
        it('should return false for first visit', () => {
            const visited = new Set<string>();
            expect(detectCycle('node1', visited)).toBe(false);
        });

        it('should return true for second visit to same node', () => {
            const visited = new Set<string>();
            detectCycle('node1', visited);
            expect(detectCycle('node1', visited)).toBe(true);
        });

        it('should track multiple unique nodes without false positives', () => {
            const visited = new Set<string>();
            expect(detectCycle('node1', visited)).toBe(false);
            expect(detectCycle('node2', visited)).toBe(false);
            expect(detectCycle('node3', visited)).toBe(false);
            // Now revisit
            expect(detectCycle('node1', visited)).toBe(true);
            expect(detectCycle('node2', visited)).toBe(true);
        });
    });

    describe('traverseGraph', () => {
        it('should traverse linear graph without cycle', () => {
            const graph = new Map<string, string[]>([
                ['A', ['B']],
                ['B', ['C']],
                ['C', []],
            ]);

            const result = traverseGraph(graph, 'A');
            expect(result.hasCycle).toBe(false);
            expect(result.path).toEqual(['A', 'B', 'C']);
        });

        it('should detect simple cycle (A -> B -> A)', () => {
            const graph = new Map<string, string[]>([
                ['A', ['B']],
                ['B', ['A']],
            ]);

            const result = traverseGraph(graph, 'A');
            expect(result.hasCycle).toBe(true);
            expect(result.cycleAt).toBe('A');
            expect(result.path).toEqual(['A', 'B']);
        });

        it('should detect longer cycle (A -> B -> C -> A)', () => {
            const graph = new Map<string, string[]>([
                ['A', ['B']],
                ['B', ['C']],
                ['C', ['A']],
            ]);

            const result = traverseGraph(graph, 'A');
            expect(result.hasCycle).toBe(true);
            expect(result.cycleAt).toBe('A');
            expect(result.path).toEqual(['A', 'B', 'C']);
        });

        it('should detect self-loop (A -> A)', () => {
            const graph = new Map<string, string[]>([
                ['A', ['A']],
            ]);

            const result = traverseGraph(graph, 'A');
            expect(result.hasCycle).toBe(true);
            expect(result.cycleAt).toBe('A');
            expect(result.path).toEqual(['A']);
        });

        it('should handle disconnected node', () => {
            const graph = new Map<string, string[]>();

            const result = traverseGraph(graph, 'orphan');
            expect(result.hasCycle).toBe(false);
            expect(result.path).toEqual(['orphan']);
        });

        it('should respect maxDepth to prevent infinite loops', () => {
            // Very long chain
            const graph = new Map<string, string[]>();
            for (let i = 0; i < 200; i++) {
                graph.set(`node${i}`, [`node${i + 1}`]);
            }

            const result = traverseGraph(graph, 'node0', 50);
            expect(result.hasCycle).toBe(true); // Hits depth limit
            expect(result.path.length).toBe(50);
        });
    });

    describe('hasAnyCycle', () => {
        it('should return false for acyclic graph', () => {
            const graph = new Map<string, string[]>([
                ['A', ['B', 'C']],
                ['B', ['D']],
                ['C', ['D']],
                ['D', []],
            ]);

            expect(hasAnyCycle(graph)).toBe(false);
        });

        it('should return true for graph with cycle', () => {
            const graph = new Map<string, string[]>([
                ['A', ['B']],
                ['B', ['C']],
                ['C', ['A']],
            ]);

            expect(hasAnyCycle(graph)).toBe(true);
        });

        it('should return false for empty graph', () => {
            const graph = new Map<string, string[]>();
            expect(hasAnyCycle(graph)).toBe(false);
        });

        it('should handle multiple disconnected components', () => {
            // Two separate linear chains - no cycles
            const graph = new Map<string, string[]>([
                ['A', ['B']],
                ['B', []],
                ['X', ['Y']],
                ['Y', []],
            ]);

            expect(hasAnyCycle(graph)).toBe(false);
        });
    });

    describe('audio routing scenarios', () => {
        it('should allow keyboard -> instrument -> effect -> speaker', () => {
            const graph = new Map<string, string[]>([
                ['keyboard-1', ['piano-1']],
                ['piano-1', ['reverb-1']],
                ['reverb-1', ['speaker-1']],
                ['speaker-1', []],
            ]);

            const result = traverseGraph(graph, 'keyboard-1');
            expect(result.hasCycle).toBe(false);
            expect(result.path).toEqual(['keyboard-1', 'piano-1', 'reverb-1', 'speaker-1']);
        });

        it('should detect feedback loop (effect -> itself)', () => {
            const graph = new Map<string, string[]>([
                ['keyboard-1', ['synth-1']],
                ['synth-1', ['delay-1']],
                ['delay-1', ['delay-1']], // Feedback!
            ]);

            expect(hasAnyCycle(graph)).toBe(true);
        });

        it('should detect cross-instrument feedback', () => {
            // Piano output goes to synth, synth output goes back to piano
            const graph = new Map<string, string[]>([
                ['keyboard-1', ['piano-1', 'synth-1']],
                ['piano-1', ['synth-1']],
                ['synth-1', ['piano-1']], // Cycle!
            ]);

            expect(hasAnyCycle(graph)).toBe(true);
        });

        it('should allow parallel routing (no cycle)', () => {
            // One keyboard to multiple instruments in parallel
            const graph = new Map<string, string[]>([
                ['keyboard-1', ['piano-1', 'synth-1', 'strings-1']],
                ['piano-1', ['speaker-1']],
                ['synth-1', ['speaker-1']],
                ['strings-1', ['speaker-1']],
                ['speaker-1', []],
            ]);

            expect(hasAnyCycle(graph)).toBe(false);
        });
    });
});

describe('Connection Validation', () => {
    describe('node ID validation', () => {
        const isValidNodeId = (id: unknown): id is string => {
            if (typeof id !== 'string') return false;
            if (id.length === 0) return false;
            if (id.length > 100) return false; // Reasonable limit
            // Only allow alphanumeric, dash, underscore
            return /^[a-zA-Z0-9_-]+$/.test(id);
        };

        it('should accept valid node IDs', () => {
            expect(isValidNodeId('keyboard-1')).toBe(true);
            expect(isValidNodeId('piano_001')).toBe(true);
            expect(isValidNodeId('node123')).toBe(true);
        });

        it('should reject empty string', () => {
            expect(isValidNodeId('')).toBe(false);
        });

        it('should reject non-string types', () => {
            expect(isValidNodeId(123)).toBe(false);
            expect(isValidNodeId(null)).toBe(false);
            expect(isValidNodeId(undefined)).toBe(false);
            expect(isValidNodeId({})).toBe(false);
        });

        it('should reject IDs with invalid characters', () => {
            expect(isValidNodeId('node 1')).toBe(false); // Space
            expect(isValidNodeId('node.1')).toBe(false); // Dot
            expect(isValidNodeId('node/1')).toBe(false); // Slash
            expect(isValidNodeId('node<script>')).toBe(false); // XSS attempt
        });

        it('should reject excessively long IDs', () => {
            const longId = 'a'.repeat(101);
            expect(isValidNodeId(longId)).toBe(false);
        });
    });

    describe('port ID validation', () => {
        const isValidPortId = (id: unknown): id is string => {
            if (typeof id !== 'string') return false;
            if (id.length === 0) return false;
            // Ports are like 'bundle-out', 'input-1', 'output-main'
            return /^[a-zA-Z][a-zA-Z0-9_-]*$/.test(id);
        };

        it('should accept valid port IDs', () => {
            expect(isValidPortId('bundle-out')).toBe(true);
            expect(isValidPortId('input-1')).toBe(true);
            expect(isValidPortId('output_main')).toBe(true);
        });

        it('should reject IDs starting with numbers', () => {
            expect(isValidPortId('1-input')).toBe(false);
        });

        it('should reject empty string', () => {
            expect(isValidPortId('')).toBe(false);
        });
    });
});
