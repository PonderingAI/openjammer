import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useGraphStore } from '../graphStore';

describe('graphStore', () => {
    beforeEach(() => {
        // Reset store to initial state
        useGraphStore.setState({
            nodes: new Map(),
            connections: new Map(),
            selectedNodeIds: new Set(),
            selectedConnectionIds: new Set(),
            history: [],
            historyIndex: -1,
        });
        vi.clearAllMocks();
    });

    describe('localStorage persistence', () => {
        it('should handle corrupted JSON in localStorage gracefully', () => {
            // Simulate corrupted data
            localStorage.setItem('openjammer-graph', 'not valid json');

            // The store should handle this gracefully and return null (reset state)
            const storage = (useGraphStore as unknown as { persist: { getOptions: () => { storage: { getItem: (name: string) => unknown } } } }).persist?.getOptions?.()?.storage;

            if (storage) {
                const result = storage.getItem('openjammer-graph');
                // Should return null on parse error
                expect(result).toBeNull();
            }
        });

        it('should handle missing state property gracefully', () => {
            // Set data without state property
            localStorage.setItem('openjammer-graph', JSON.stringify({ version: 1 }));

            const storage = (useGraphStore as unknown as { persist: { getOptions: () => { storage: { getItem: (name: string) => unknown } } } }).persist?.getOptions?.()?.storage;

            if (storage) {
                const result = storage.getItem('openjammer-graph');
                // Should return null when state is missing
                expect(result).toBeNull();
            }
        });

        it('should handle invalid arrays in state gracefully', () => {
            // Set data with non-array nodes
            localStorage.setItem('openjammer-graph', JSON.stringify({
                state: {
                    nodes: 'not an array',
                    connections: null,
                    selectedNodeIds: {},
                    selectedConnectionIds: undefined,
                }
            }));

            const storage = (useGraphStore as unknown as { persist: { getOptions: () => { storage: { getItem: (name: string) => unknown } } } }).persist?.getOptions?.()?.storage;

            if (storage) {
                const result = storage.getItem('openjammer-graph') as { state: { nodes: Map<string, unknown> } } | null;
                // Should handle gracefully - convert to empty Maps/Sets
                if (result) {
                    expect(result.state.nodes).toBeInstanceOf(Map);
                    expect(result.state.nodes.size).toBe(0);
                }
            }
        });
    });

    describe('node operations', () => {
        it('should add a node', () => {
            const { addNode, nodes } = useGraphStore.getState();

            addNode('piano', { x: 100, y: 100 });

            expect(nodes.size).toBe(0); // State is stale, need to get fresh
            expect(useGraphStore.getState().nodes.size).toBe(1);
        });

        it('should generate unique node IDs', () => {
            const { addNode } = useGraphStore.getState();

            addNode('piano', { x: 0, y: 0 });
            addNode('piano', { x: 100, y: 100 });

            const nodes = useGraphStore.getState().nodes;
            const ids = Array.from(nodes.keys());

            expect(ids[0]).not.toBe(ids[1]);
        });

        it('should update node position', () => {
            const { addNode } = useGraphStore.getState();

            addNode('piano', { x: 0, y: 0 });
            const nodeId = Array.from(useGraphStore.getState().nodes.keys())[0];

            useGraphStore.getState().updateNodePosition(nodeId, { x: 200, y: 300 });

            const node = useGraphStore.getState().nodes.get(nodeId);
            expect(node?.position).toEqual({ x: 200, y: 300 });
        });

        it('should delete selected nodes', () => {
            const { addNode } = useGraphStore.getState();

            addNode('piano', { x: 0, y: 0 });
            const nodeId = Array.from(useGraphStore.getState().nodes.keys())[0];

            useGraphStore.getState().selectNode(nodeId, false);
            useGraphStore.getState().deleteSelected();

            expect(useGraphStore.getState().nodes.size).toBe(0);
        });
    });

    describe('selection', () => {
        it('should select a node', () => {
            const { addNode } = useGraphStore.getState();

            addNode('piano', { x: 0, y: 0 });
            const nodeId = Array.from(useGraphStore.getState().nodes.keys())[0];

            useGraphStore.getState().selectNode(nodeId, false);

            expect(useGraphStore.getState().selectedNodeIds.has(nodeId)).toBe(true);
        });

        it('should support multi-select with additive flag', () => {
            const { addNode } = useGraphStore.getState();

            addNode('piano', { x: 0, y: 0 });
            addNode('speaker', { x: 100, y: 100 });

            const nodes = useGraphStore.getState().nodes;
            const nodeIds = Array.from(nodes.keys());

            useGraphStore.getState().selectNode(nodeIds[0], false);
            useGraphStore.getState().selectNode(nodeIds[1], true); // Additive

            expect(useGraphStore.getState().selectedNodeIds.size).toBe(2);
        });

        it('should clear selection', () => {
            const { addNode } = useGraphStore.getState();

            addNode('piano', { x: 0, y: 0 });
            const nodeId = Array.from(useGraphStore.getState().nodes.keys())[0];

            useGraphStore.getState().selectNode(nodeId, false);
            useGraphStore.getState().clearSelection();

            expect(useGraphStore.getState().selectedNodeIds.size).toBe(0);
        });
    });

    describe('connections', () => {
        it('should add a connection between nodes', () => {
            const { addNode } = useGraphStore.getState();

            addNode('keyboard', { x: 0, y: 0 });
            addNode('piano', { x: 200, y: 0 });

            const nodes = Array.from(useGraphStore.getState().nodes.values());
            const keyboardNode = nodes.find(n => n.type === 'keyboard');
            const pianoNode = nodes.find(n => n.type === 'piano');

            if (keyboardNode && pianoNode) {
                const outputPort = keyboardNode.ports.find(p => p.direction === 'output');
                const inputPort = pianoNode.ports.find(p => p.direction === 'input');

                if (outputPort && inputPort) {
                    useGraphStore.getState().addConnection(
                        keyboardNode.id,
                        outputPort.id,
                        pianoNode.id,
                        inputPort.id
                    );

                    expect(useGraphStore.getState().connections.size).toBe(1);
                }
            }
        });

        it('should delete connections when deleting connected nodes', () => {
            const { addNode } = useGraphStore.getState();

            addNode('keyboard', { x: 0, y: 0 });
            addNode('piano', { x: 200, y: 0 });

            const nodes = Array.from(useGraphStore.getState().nodes.values());
            const keyboardNode = nodes.find(n => n.type === 'keyboard');
            const pianoNode = nodes.find(n => n.type === 'piano');

            if (keyboardNode && pianoNode) {
                const outputPort = keyboardNode.ports.find(p => p.direction === 'output');
                const inputPort = pianoNode.ports.find(p => p.direction === 'input');

                if (outputPort && inputPort) {
                    useGraphStore.getState().addConnection(
                        keyboardNode.id,
                        outputPort.id,
                        pianoNode.id,
                        inputPort.id
                    );

                    // Delete the keyboard node
                    useGraphStore.getState().selectNode(keyboardNode.id, false);
                    useGraphStore.getState().deleteSelected();

                    // Connection should also be deleted
                    expect(useGraphStore.getState().connections.size).toBe(0);
                }
            }
        });
    });

    describe('undo/redo', () => {
        it('should undo node addition', () => {
            const { addNode } = useGraphStore.getState();

            addNode('piano', { x: 0, y: 0 });
            expect(useGraphStore.getState().nodes.size).toBe(1);

            useGraphStore.getState().undo();
            expect(useGraphStore.getState().nodes.size).toBe(0);
        });

        it('should redo undone action', () => {
            const { addNode } = useGraphStore.getState();

            addNode('piano', { x: 0, y: 0 });
            useGraphStore.getState().undo();
            expect(useGraphStore.getState().nodes.size).toBe(0);

            useGraphStore.getState().redo();
            expect(useGraphStore.getState().nodes.size).toBe(1);
        });

        it('should not undo when at beginning of history', () => {
            // Fresh state, nothing to undo
            const initialSize = useGraphStore.getState().nodes.size;
            useGraphStore.getState().undo();
            expect(useGraphStore.getState().nodes.size).toBe(initialSize);
        });

        it('should not redo when at end of history', () => {
            const { addNode } = useGraphStore.getState();

            addNode('piano', { x: 0, y: 0 });
            const currentSize = useGraphStore.getState().nodes.size;

            useGraphStore.getState().redo(); // Should do nothing
            expect(useGraphStore.getState().nodes.size).toBe(currentSize);
        });
    });
});
