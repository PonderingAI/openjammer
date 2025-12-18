/**
 * Graph Store - Manages the node graph state with undo/redo history
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type {
    GraphNode,
    Connection,
    Position,
    NodeType
} from '../engine/types';
import { getNodeDefinition, canConnect } from '../engine/registry';

// ============================================================================
// Utility Functions
// ============================================================================

function generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

// ============================================================================
// History Types
// ============================================================================

interface HistoryState {
    nodes: [string, GraphNode][];
    connections: [string, Connection][];
}

const MAX_HISTORY_SIZE = 50;

// ============================================================================
// Store Interface
// ============================================================================

interface GraphStore {
    // State
    nodes: Map<string, GraphNode>;
    connections: Map<string, Connection>;
    selectedNodeIds: Set<string>;
    selectedConnectionIds: Set<string>;

    // History
    history: HistoryState[];
    historyIndex: number;

    // Node Actions
    addNode: (type: NodeType, position: Position) => string;
    removeNode: (nodeId: string) => void;
    updateNodePosition: (nodeId: string, position: Position) => void;
    updateNodeData: <T extends object>(nodeId: string, data: Partial<T>) => void;
    updateNodePorts: (nodeId: string, ports: import('../engine/types').PortDefinition[]) => void;

    // Connection Actions
    addConnection: (
        sourceNodeId: string,
        sourcePortId: string,
        targetNodeId: string,
        targetPortId: string
    ) => string | null;
    removeConnection: (connectionId: string) => void;
    getConnectionsForNode: (nodeId: string) => Connection[];
    getConnectionsForPort: (nodeId: string, portId: string) => Connection[];

    // Selection Actions
    selectNode: (nodeId: string, addToSelection?: boolean) => void;
    selectNodes: (nodeIds: string[]) => void;
    deselectNode: (nodeId: string) => void;
    clearSelection: () => void;
    selectConnection: (connectionId: string) => void;
    selectNodesInRect: (rect: { x: number; y: number; width: number; height: number }) => void;

    // Bulk Actions
    deleteSelected: () => void;
    clearGraph: () => void;
    loadGraph: (nodes: GraphNode[], connections: Connection[]) => void;

    // History Actions
    undo: () => void;
    redo: () => void;
    pushHistory: () => void;

    // Getters
    getNode: (nodeId: string) => GraphNode | undefined;
    getNodesByType: (type: NodeType) => GraphNode[];

    // Subscription helpers for AudioGraphManager
    getNodes: () => Map<string, GraphNode>;
    getConnections: () => Map<string, Connection>;
}

// ============================================================================
// Store Implementation
// ============================================================================

export const useGraphStore = create<GraphStore>()(
    persist(
        (set, get) => ({
            // Initial State
            nodes: new Map(),
            connections: new Map(),
            selectedNodeIds: new Set(),
            selectedConnectionIds: new Set(),
            history: [],
            historyIndex: -1,

            // Push current state to history (called before mutations)
            pushHistory: () => {
                const state = get();
                const historyState: HistoryState = {
                    nodes: Array.from(state.nodes.entries()),
                    connections: Array.from(state.connections.entries())
                };

                // Remove any future history if we're not at the end
                const newHistory = state.history.slice(0, state.historyIndex + 1);
                newHistory.push(historyState);

                // Limit history size
                if (newHistory.length > MAX_HISTORY_SIZE) {
                    newHistory.shift();
                }

                set({
                    history: newHistory,
                    historyIndex: newHistory.length - 1
                });
            },

            // Undo
            undo: () => {
                const state = get();
                if (state.historyIndex < 0) return;

                // Save current state if we're at the end
                if (state.historyIndex === state.history.length - 1) {
                    const currentState: HistoryState = {
                        nodes: Array.from(state.nodes.entries()),
                        connections: Array.from(state.connections.entries())
                    };
                    const newHistory = [...state.history, currentState];
                    set({ history: newHistory });
                }

                const prevState = state.history[state.historyIndex];
                if (!prevState) return;

                set({
                    nodes: new Map(prevState.nodes),
                    connections: new Map(prevState.connections),
                    historyIndex: state.historyIndex - 1,
                    selectedNodeIds: new Set(),
                    selectedConnectionIds: new Set()
                });
            },

            // Redo
            redo: () => {
                const state = get();
                if (state.historyIndex >= state.history.length - 1) return;

                const nextIndex = state.historyIndex + 2;
                const nextState = state.history[nextIndex];
                if (!nextState) return;

                set({
                    nodes: new Map(nextState.nodes),
                    connections: new Map(nextState.connections),
                    historyIndex: nextIndex - 1,
                    selectedNodeIds: new Set(),
                    selectedConnectionIds: new Set()
                });
            },

            // Node Actions
            addNode: (type, position) => {
                get().pushHistory();

                const definition = getNodeDefinition(type);
                const id = generateId();

                const node: GraphNode = {
                    id,
                    type,
                    category: definition.category,
                    position,
                    data: { ...definition.defaultData },
                    ports: [...definition.defaultPorts]
                };

                set((state) => {
                    const newNodes = new Map(state.nodes);
                    newNodes.set(id, node);
                    return { nodes: newNodes };
                });

                return id;
            },

            removeNode: (nodeId) => {
                get().pushHistory();

                set((state) => {
                    const newNodes = new Map(state.nodes);
                    const newConnections = new Map(state.connections);
                    const newSelectedNodes = new Set(state.selectedNodeIds);

                    // Remove all connections to/from this node
                    state.connections.forEach((conn, connId) => {
                        if (conn.sourceNodeId === nodeId || conn.targetNodeId === nodeId) {
                            newConnections.delete(connId);
                        }
                    });

                    newNodes.delete(nodeId);
                    newSelectedNodes.delete(nodeId);

                    return {
                        nodes: newNodes,
                        connections: newConnections,
                        selectedNodeIds: newSelectedNodes
                    };
                });
            },

            updateNodePosition: (nodeId, position) => {
                set((state) => {
                    const node = state.nodes.get(nodeId);
                    if (!node) return state;

                    const newNodes = new Map(state.nodes);
                    newNodes.set(nodeId, { ...node, position });
                    return { nodes: newNodes };
                });
            },

            updateNodeData: (nodeId, data) => {
                set((state) => {
                    const node = state.nodes.get(nodeId);
                    if (!node) return state;

                    const newNodes = new Map(state.nodes);
                    newNodes.set(nodeId, {
                        ...node,
                        data: { ...node.data, ...data }
                    });
                    return { nodes: newNodes };
                });
            },

            updateNodePorts: (nodeId, ports) => {
                set((state) => {
                    const node = state.nodes.get(nodeId);
                    if (!node) return state;

                    const newNodes = new Map(state.nodes);
                    newNodes.set(nodeId, { ...node, ports });
                    return { nodes: newNodes };
                });
            },

            // Connection Actions
            addConnection: (sourceNodeId, sourcePortId, targetNodeId, targetPortId) => {
                const state = get();
                const sourceNode = state.nodes.get(sourceNodeId);
                const targetNode = state.nodes.get(targetNodeId);

                if (!sourceNode || !targetNode) return null;

                const sourcePort = sourceNode.ports.find(p => p.id === sourcePortId);
                const targetPort = targetNode.ports.find(p => p.id === targetPortId);

                if (!sourcePort || !targetPort) return null;
                if (!canConnect(sourcePort, targetPort)) return null;

                // Check if connection already exists
                const existingConnection = Array.from(state.connections.values()).find(
                    conn =>
                        conn.sourceNodeId === sourceNodeId &&
                        conn.sourcePortId === sourcePortId &&
                        conn.targetNodeId === targetNodeId &&
                        conn.targetPortId === targetPortId
                );
                if (existingConnection) return existingConnection.id;

                get().pushHistory();

                // For audio inputs, remove existing connection (only one allowed)
                if (targetPort.type === 'audio' && targetPort.direction === 'input') {
                    const existingInput = Array.from(state.connections.values()).find(
                        conn =>
                            conn.targetNodeId === targetNodeId &&
                            conn.targetPortId === targetPortId
                    );
                    if (existingInput) {
                        get().removeConnection(existingInput.id);
                    }
                }

                const id = generateId();
                const connection: Connection = {
                    id,
                    sourceNodeId,
                    sourcePortId,
                    targetNodeId,
                    targetPortId,
                    type: sourcePort.type
                };

                set((state) => {
                    const newConnections = new Map(state.connections);
                    newConnections.set(id, connection);
                    return { connections: newConnections };
                });

                return id;
            },

            removeConnection: (connectionId) => {
                set((state) => {
                    const newConnections = new Map(state.connections);
                    const newSelectedConnections = new Set(state.selectedConnectionIds);
                    newConnections.delete(connectionId);
                    newSelectedConnections.delete(connectionId);
                    return {
                        connections: newConnections,
                        selectedConnectionIds: newSelectedConnections
                    };
                });
            },

            getConnectionsForNode: (nodeId) => {
                const state = get();
                return Array.from(state.connections.values()).filter(
                    conn => conn.sourceNodeId === nodeId || conn.targetNodeId === nodeId
                );
            },

            getConnectionsForPort: (nodeId, portId) => {
                const state = get();
                return Array.from(state.connections.values()).filter(
                    conn =>
                        (conn.sourceNodeId === nodeId && conn.sourcePortId === portId) ||
                        (conn.targetNodeId === nodeId && conn.targetPortId === portId)
                );
            },

            // Selection Actions
            selectNode: (nodeId, addToSelection = false) => {
                set((state) => {
                    const newSelectedNodes = addToSelection
                        ? new Set(state.selectedNodeIds)
                        : new Set<string>();
                    newSelectedNodes.add(nodeId);
                    return {
                        selectedNodeIds: newSelectedNodes,
                        selectedConnectionIds: new Set()
                    };
                });
            },

            selectNodes: (nodeIds) => {
                set({
                    selectedNodeIds: new Set(nodeIds),
                    selectedConnectionIds: new Set()
                });
            },

            deselectNode: (nodeId) => {
                set((state) => {
                    const newSelectedNodes = new Set(state.selectedNodeIds);
                    newSelectedNodes.delete(nodeId);
                    return { selectedNodeIds: newSelectedNodes };
                });
            },

            clearSelection: () => {
                set({
                    selectedNodeIds: new Set(),
                    selectedConnectionIds: new Set()
                });
            },

            selectConnection: (connectionId) => {
                set({
                    selectedNodeIds: new Set(),
                    selectedConnectionIds: new Set([connectionId])
                });
            },

            // Select nodes within a rectangle (for box selection)
            selectNodesInRect: (rect) => {
                const state = get();
                const selectedIds: string[] = [];

                state.nodes.forEach((node, id) => {
                    // Node dimensions (approximate)
                    const nodeWidth = 200;
                    const nodeHeight = 150;

                    // Check if node intersects with selection rect
                    const nodeRight = node.position.x + nodeWidth;
                    const nodeBottom = node.position.y + nodeHeight;
                    const rectRight = rect.x + rect.width;
                    const rectBottom = rect.y + rect.height;

                    // Normalize rect (handle negative width/height from dragging)
                    const minX = Math.min(rect.x, rectRight);
                    const maxX = Math.max(rect.x, rectRight);
                    const minY = Math.min(rect.y, rectBottom);
                    const maxY = Math.max(rect.y, rectBottom);

                    if (node.position.x < maxX &&
                        nodeRight > minX &&
                        node.position.y < maxY &&
                        nodeBottom > minY) {
                        selectedIds.push(id);
                    }
                });

                set({
                    selectedNodeIds: new Set(selectedIds),
                    selectedConnectionIds: new Set()
                });
            },

            // Bulk Actions
            deleteSelected: () => {
                const state = get();

                if (state.selectedNodeIds.size === 0 && state.selectedConnectionIds.size === 0) {
                    return;
                }

                get().pushHistory();

                // Delete selected connections
                state.selectedConnectionIds.forEach(connId => {
                    get().removeConnection(connId);
                });

                // Delete selected nodes
                state.selectedNodeIds.forEach(nodeId => {
                    get().removeNode(nodeId);
                });
            },

            clearGraph: () => {
                get().pushHistory();
                set({
                    nodes: new Map(),
                    connections: new Map(),
                    selectedNodeIds: new Set(),
                    selectedConnectionIds: new Set()
                });
            },

            loadGraph: (nodes, connections) => {
                get().pushHistory();
                const newNodes = new Map<string, GraphNode>();
                const newConnections = new Map<string, Connection>();

                nodes.forEach(node => newNodes.set(node.id, node));
                connections.forEach(conn => newConnections.set(conn.id, conn));

                set({
                    nodes: newNodes,
                    connections: newConnections,
                    selectedNodeIds: new Set(),
                    selectedConnectionIds: new Set()
                });
            },

            // Getters
            getNode: (nodeId) => get().nodes.get(nodeId),

            getNodesByType: (type) => {
                return Array.from(get().nodes.values()).filter(node => node.type === type);
            },

            // Subscription helpers for AudioGraphManager
            getNodes: () => get().nodes,
            getConnections: () => get().connections
        }),
        {
            name: 'openjammer-graph',
            // Custom serialization for Map and Set
            storage: {
                getItem: (name) => {
                    const str = localStorage.getItem(name);
                    if (!str) return null;

                    const parsed = JSON.parse(str);
                    return {
                        state: {
                            ...parsed.state,
                            nodes: new Map(parsed.state.nodes || []),
                            connections: new Map(parsed.state.connections || []),
                            selectedNodeIds: new Set(parsed.state.selectedNodeIds || []),
                            selectedConnectionIds: new Set(parsed.state.selectedConnectionIds || []),
                            history: parsed.state.history || [],
                            historyIndex: parsed.state.historyIndex ?? -1
                        }
                    };
                },
                setItem: (name, value) => {
                    const serialized = {
                        state: {
                            ...value.state,
                            nodes: Array.from(value.state.nodes.entries()),
                            connections: Array.from(value.state.connections.entries()),
                            selectedNodeIds: Array.from(value.state.selectedNodeIds),
                            selectedConnectionIds: Array.from(value.state.selectedConnectionIds),
                            history: value.state.history,
                            historyIndex: value.state.historyIndex
                        }
                    };
                    localStorage.setItem(name, JSON.stringify(serialized));
                },
                removeItem: (name) => localStorage.removeItem(name)
            }
        }
    )
);
