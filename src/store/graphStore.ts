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
import { createDefaultInternalStructure } from '../utils/nodeInternals';
import { syncPortsWithInternalNodes, checkDynamicPortAddition, checkDynamicPortRemoval } from '../utils/portSync';
import { useUIFeedbackStore } from './uiFeedbackStore';
import { useCanvasNavigationStore } from './canvasNavigationStore';

// ============================================================================
// Utility Functions
// ============================================================================

function generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Get approximate dimensions for a node based on its type
 */
export function getNodeDimensions(node: GraphNode): { width: number; height: number } {
    switch (node.type) {
        case 'keyboard':
            return { width: 160, height: 120 };
        case 'speaker':
            return { width: 140, height: 160 };
        case 'looper':
            return { width: 240, height: 120 }; // Updated for schematic looper
        case 'piano':
        case 'cello':
        case 'electricCello':
        case 'violin':
        case 'saxophone':
        case 'strings':
        case 'keys':
        case 'winds':
            // Instrument nodes: height varies by number of input ports
            const inputPorts = node.ports.filter(p => p.direction === 'input').length;
            return { width: 180, height: 60 + (inputPorts * 28) };
        default:
            // Standard nodes (microphone, effect, amplifier, recorder)
            return { width: 200, height: 150 };
    }
}

export interface NodeBounds {
    x: number;
    y: number;
    width: number;
    height: number;
    centerX: number;
    centerY: number;
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

interface ClipboardData {
    nodes: [string, GraphNode][];
    connections: Connection[];
}

interface GraphStore {
    // State (all nodes/connections at all levels, flat)
    nodes: Map<string, GraphNode>;
    connections: Map<string, Connection>;
    rootNodeIds: string[];  // IDs of nodes where parentId === null
    selectedNodeIds: Set<string>;
    selectedConnectionIds: Set<string>;

    // Clipboard
    clipboard: ClipboardData | null;

    // History
    history: HistoryState[];
    historyIndex: number;

    // Node Actions
    addNode: (type: NodeType, position: Position, parentId?: string | null) => string;
    removeNode: (nodeId: string) => void;
    updateNodePosition: (nodeId: string, position: Position) => void;
    updateNodeData: <T extends object>(nodeId: string, data: Partial<T>) => void;
    updateNodePorts: (nodeId: string, ports: import('../engine/types').PortDefinition[]) => void;
    updateNodeType: (nodeId: string, type: NodeType) => void;

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

    // Clipboard Actions
    copySelected: () => void;
    pasteClipboard: (position?: Position) => void;

    // History Actions
    undo: () => void;
    redo: () => void;
    pushHistory: () => void;

    // Getters
    getNode: (nodeId: string) => GraphNode | undefined;
    getNodesByType: (type: NodeType) => GraphNode[];
    getNodesBounds: () => NodeBounds | null;

    // Subscription helpers for AudioGraphManager
    getNodes: () => Map<string, GraphNode>;
    getConnections: () => Map<string, Connection>;

    // Hierarchy traversal helpers (flat normalized structure)
    getNodeChildren: (nodeId: string) => GraphNode[];
    getNodeParent: (nodeId: string) => GraphNode | null;
    getNodeDepth: (nodeId: string) => number;
    getRootNodes: () => GraphNode[];
    getNodesAtLevel: (parentId: string | null) => GraphNode[];  // null = root level
    getConnectionsAtLevel: (parentId: string | null) => Connection[];  // Connections between nodes at this level
}

// ============================================================================
// Store Implementation
// ============================================================================

export const useGraphStore = create<GraphStore>()(
    persist(
        (set, get) => ({
            // Initial State (flat normalized structure)
            nodes: new Map(),
            connections: new Map(),
            rootNodeIds: [],  // IDs of top-level nodes
            selectedNodeIds: new Set(),
            selectedConnectionIds: new Set(),
            clipboard: null,
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
            addNode: (type, position, parentId = null) => {
                get().pushHistory();

                const definition = getNodeDefinition(type);
                const id = generateId();

                // Create node with flat structure (parentId and childIds)
                const node: GraphNode = {
                    id,
                    type,
                    category: definition.category,
                    position,
                    data: { ...definition.defaultData },
                    ports: [...definition.defaultPorts],
                    parentId,
                    childIds: [],
                    specialNodes: []
                };

                // Auto-assign next available key for keyboard nodes
                if (type === 'keyboard') {
                    const state = get();
                    const existingKeyboards = Array.from(state.nodes.values())
                        .filter(n => n.type === 'keyboard');
                    const usedKeys = new Set(
                        existingKeyboards.map(kb => (kb.data as { assignedKey?: number }).assignedKey ?? 2)
                    );

                    // Find next available key (2-9)
                    let nextKey = 2;
                    while (usedKeys.has(nextKey) && nextKey <= 9) {
                        nextKey++;
                    }

                    // Assign the key (wrap to 2 if all 2-9 are used)
                    node.data = {
                        ...node.data,
                        assignedKey: nextKey <= 9 ? nextKey : 2
                    };
                }

                // Get default internal structure (returns flat arrays now)
                const internalStructure = createDefaultInternalStructure(node);

                // Add all internal nodes to flat structure with correct parentId
                const allNodesToAdd: GraphNode[] = [node];
                const allConnectionsToAdd: Connection[] = [];

                internalStructure.internalNodes.forEach((internalNode: GraphNode) => {
                    // Set parentId to point to this node
                    internalNode.parentId = id;
                    internalNode.childIds = [];
                    allNodesToAdd.push(internalNode);
                    node.childIds.push(internalNode.id);
                });

                // Store special node IDs
                node.specialNodes = internalStructure.specialNodes;

                // Copy port visibility configuration
                node.showEmptyInputPorts = internalStructure.showEmptyInputPorts;
                node.showEmptyOutputPorts = internalStructure.showEmptyOutputPorts;

                // Add internal connections to flat structure
                internalStructure.internalConnections.forEach((conn: Connection) => {
                    allConnectionsToAdd.push(conn);
                });

                // Sync ports from internal canvas-input/output nodes
                // Use onlyConnected: true so only ports with connections show on parent
                const syncedPorts = syncPortsWithInternalNodes(
                    node,
                    Array.from(internalStructure.internalNodes.values()),
                    internalStructure.internalConnections,
                    true  // onlyConnected: only show ports that have connections
                );
                if (syncedPorts.length > 0) {
                    node.ports = syncedPorts;
                }

                set((state) => {
                    const newNodes = new Map(state.nodes);
                    const newConnections = new Map(state.connections);
                    const newRootNodeIds = [...state.rootNodeIds];

                    // Add all nodes
                    allNodesToAdd.forEach(n => newNodes.set(n.id, n));

                    // Add all connections
                    allConnectionsToAdd.forEach(c => newConnections.set(c.id, c));

                    // Update parent's childIds if this is a child node
                    if (parentId) {
                        const parent = newNodes.get(parentId);
                        if (parent) {
                            newNodes.set(parentId, {
                                ...parent,
                                childIds: [...parent.childIds, id]
                            });
                        }
                    } else {
                        // Root level node
                        newRootNodeIds.push(id);
                    }

                    // Check for dynamic port addition (for pre-wired internal connections)
                    // This ensures empty ports appear on output-panel and input-panel
                    const { updatedNode } = checkDynamicPortAddition(id, newNodes, newConnections);
                    if (updatedNode) {
                        const existingNode = newNodes.get(updatedNode.id);
                        if (existingNode) {
                            newNodes.set(updatedNode.id, {
                                ...existingNode,
                                ports: updatedNode.ports,
                                data: updatedNode.data
                            });

                            // Re-sync parent's ports after adding dynamic port
                            const nodeToSync = newNodes.get(id);
                            if (nodeToSync) {
                                const childNodes = nodeToSync.childIds
                                    .map(cid => newNodes.get(cid))
                                    .filter((n): n is GraphNode => n !== undefined);

                                const syncedPorts = syncPortsWithInternalNodes(
                                    nodeToSync,
                                    childNodes,
                                    newConnections,
                                    true  // onlyConnected: only show ports that have connections
                                );
                                if (syncedPorts.length > 0) {
                                    newNodes.set(id, { ...nodeToSync, ports: syncedPorts });
                                }
                            }
                        }
                    }

                    return {
                        nodes: newNodes,
                        connections: newConnections,
                        rootNodeIds: newRootNodeIds
                    };
                });

                return id;
            },

            removeNode: (nodeId) => {
                get().pushHistory();

                set((state) => {
                    const node = state.nodes.get(nodeId);
                    if (!node) return state;

                    const newNodes = new Map(state.nodes);
                    const newConnections = new Map(state.connections);
                    const newSelectedNodes = new Set(state.selectedNodeIds);
                    let newRootNodeIds = [...state.rootNodeIds];

                    // Collect all node IDs to delete (this node + all descendants)
                    const nodesToDelete = new Set<string>();
                    const collectDescendants = (id: string) => {
                        nodesToDelete.add(id);
                        const n = newNodes.get(id);
                        if (n?.childIds) {
                            n.childIds.forEach(childId => collectDescendants(childId));
                        }
                    };
                    collectDescendants(nodeId);

                    // Remove all connections involving any deleted node
                    state.connections.forEach((conn, connId) => {
                        if (nodesToDelete.has(conn.sourceNodeId) || nodesToDelete.has(conn.targetNodeId)) {
                            newConnections.delete(connId);
                        }
                    });

                    // Remove all nodes
                    nodesToDelete.forEach(id => {
                        newNodes.delete(id);
                        newSelectedNodes.delete(id);
                    });

                    // Update parent's childIds if this node has a parent
                    if (node.parentId) {
                        const parent = newNodes.get(node.parentId);
                        if (parent) {
                            newNodes.set(node.parentId, {
                                ...parent,
                                childIds: parent.childIds.filter(id => id !== nodeId)
                            });
                        }
                    } else {
                        // Remove from rootNodeIds
                        newRootNodeIds = newRootNodeIds.filter(id => id !== nodeId);
                    }

                    return {
                        nodes: newNodes,
                        connections: newConnections,
                        selectedNodeIds: newSelectedNodes,
                        rootNodeIds: newRootNodeIds
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

            updateNodeType: (nodeId, type) => {
                const definition = getNodeDefinition(type);
                set((state) => {
                    const node = state.nodes.get(nodeId);
                    if (!node) return state;

                    const newNodes = new Map(state.nodes);
                    newNodes.set(nodeId, {
                        ...node,
                        type,
                        category: definition.category
                    });
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
                const isBundled = sourcePort.isBundled || targetPort.isBundled || false;
                const connection: Connection = {
                    id,
                    sourceNodeId,
                    sourcePortId,
                    targetNodeId,
                    targetPortId,
                    type: sourcePort.type,
                    isBundled
                };

                set((state) => {
                    const newConnections = new Map(state.connections);
                    newConnections.set(id, connection);

                    // Check if we need to add a dynamic port to the target's parent
                    const targetNodeInState = state.nodes.get(targetNodeId);
                    if (targetNodeInState?.parentId) {
                        const { newNode, updatedNode } = checkDynamicPortAddition(
                            targetNodeInState.parentId,
                            state.nodes,
                            newConnections
                        );

                        // Handle adding a new port to an existing output-panel
                        if (updatedNode) {
                            const newNodes = new Map(state.nodes);

                            // Update the output-panel with new port
                            const existingNode = newNodes.get(updatedNode.id);
                            if (existingNode) {
                                newNodes.set(updatedNode.id, {
                                    ...existingNode,
                                    ports: updatedNode.ports,
                                    data: updatedNode.data
                                });

                                // Re-sync parent's ports with onlyConnected: true
                                const parent = newNodes.get(targetNodeInState.parentId);
                                if (parent) {
                                    const childNodes = parent.childIds
                                        .map(cid => newNodes.get(cid))
                                        .filter((n): n is GraphNode => n !== undefined);

                                    const syncedPorts = syncPortsWithInternalNodes(
                                        parent,
                                        childNodes,
                                        newConnections,
                                        true  // onlyConnected: only show ports that have connections
                                    );
                                    newNodes.set(parent.id, { ...parent, ports: syncedPorts });
                                }
                            }

                            return { connections: newConnections, nodes: newNodes };
                        }

                        // Handle adding a new canvas-output node (legacy)
                        if (newNode) {
                            const newNodes = new Map(state.nodes);

                            // Add the new node
                            newNodes.set(newNode.id, newNode);

                            // Update parent's childIds and specialNodes
                            const parent = newNodes.get(targetNodeInState.parentId);
                            if (parent) {
                                newNodes.set(parent.id, {
                                    ...parent,
                                    childIds: [...parent.childIds, newNode.id],
                                    specialNodes: [...(parent.specialNodes || []), newNode.id]
                                });

                                // Re-sync parent's ports with onlyConnected: true
                                const childNodes = [...parent.childIds, newNode.id]
                                    .map(cid => newNodes.get(cid))
                                    .filter((n): n is GraphNode => n !== undefined);

                                const syncedPorts = syncPortsWithInternalNodes(
                                    { ...parent, specialNodes: [...(parent.specialNodes || []), newNode.id] },
                                    childNodes,
                                    newConnections,
                                    true  // onlyConnected: only show ports that have connections
                                );

                                const updatedParent = newNodes.get(parent.id);
                                if (updatedParent) {
                                    newNodes.set(parent.id, {
                                        ...updatedParent,
                                        ports: syncedPorts
                                    });
                                }
                            }

                            return { connections: newConnections, nodes: newNodes };
                        }
                    }

                    // Handle universal port type resolution for math nodes
                    const resolveUniversalPorts = () => {
                        if (sourcePort.type !== 'universal' && targetPort.type !== 'universal') {
                            return null;
                        }

                        // Determine the resolved type from the non-universal port
                        let resolvedType: 'audio' | 'control' = 'control';
                        if (sourcePort.type !== 'universal') {
                            resolvedType = sourcePort.type as 'audio' | 'control';
                        } else if (targetPort.type !== 'universal') {
                            resolvedType = targetPort.type as 'audio' | 'control';
                        }

                        const newNodes = new Map(state.nodes);

                        // Update source node if it has universal ports (add/subtract)
                        if ((sourceNode.type === 'add' || sourceNode.type === 'subtract') &&
                            sourcePort.type === 'universal') {
                            const updatedSource = {
                                ...sourceNode,
                                data: { ...sourceNode.data, resolvedType }
                            };
                            newNodes.set(sourceNodeId, updatedSource);
                        }

                        // Update target node if it has universal ports (add/subtract)
                        if ((targetNode.type === 'add' || targetNode.type === 'subtract') &&
                            targetPort.type === 'universal') {
                            const existingTarget = newNodes.get(targetNodeId) || targetNode;
                            const updatedTarget = {
                                ...existingTarget,
                                data: { ...existingTarget.data, resolvedType }
                            };
                            newNodes.set(targetNodeId, updatedTarget);
                        }

                        return newNodes;
                    };

                    const resolvedNodes = resolveUniversalPorts();
                    if (resolvedNodes) {
                        return { connections: newConnections, nodes: resolvedNodes };
                    }

                    return { connections: newConnections };
                });

                return id;
            },

            removeConnection: (connectionId) => {
                set((state) => {
                    const connection = state.connections.get(connectionId);
                    const newConnections = new Map(state.connections);
                    const newSelectedConnections = new Set(state.selectedConnectionIds);
                    newConnections.delete(connectionId);
                    newSelectedConnections.delete(connectionId);

                    // Check if we need to reset universal port type for math nodes
                    if (connection) {
                        const newNodes = new Map(state.nodes);
                        const nodesToCheck = [connection.sourceNodeId, connection.targetNodeId];
                        let nodesUpdated = false;

                        for (const nodeId of nodesToCheck) {
                            const node = newNodes.get(nodeId);
                            if (node && (node.type === 'add' || node.type === 'subtract')) {
                                // Check if node has any remaining connections
                                const remainingConnections = Array.from(newConnections.values()).some(
                                    conn => conn.sourceNodeId === nodeId || conn.targetNodeId === nodeId
                                );

                                if (!remainingConnections && node.data.resolvedType !== null) {
                                    // Reset resolvedType to null
                                    newNodes.set(nodeId, {
                                        ...node,
                                        data: { ...node.data, resolvedType: null }
                                    });
                                    nodesUpdated = true;
                                }
                            }
                        }

                        // Check for dynamic port removal in parent panels
                        const parentsToCheck = new Set<string>();
                        const targetNode = newNodes.get(connection.targetNodeId);
                        const sourceNode = newNodes.get(connection.sourceNodeId);

                        if (targetNode?.parentId) {
                            parentsToCheck.add(targetNode.parentId);
                        }
                        if (sourceNode?.parentId) {
                            parentsToCheck.add(sourceNode.parentId);
                        }

                        for (const parentId of parentsToCheck) {
                            const { updatedNode } = checkDynamicPortRemoval(parentId, newNodes, newConnections);

                            if (updatedNode) {
                                // Update the panel node with removed port
                                const panelNode = newNodes.get(updatedNode.id);
                                if (panelNode) {
                                    newNodes.set(updatedNode.id, {
                                        ...panelNode,
                                        ports: updatedNode.ports,
                                        data: updatedNode.data
                                    });
                                    nodesUpdated = true;
                                }
                            }

                            // Sync parent ports with onlyConnected: true
                            const parent = newNodes.get(parentId);
                            if (parent) {
                                const childNodes = parent.childIds
                                    .map(cid => newNodes.get(cid))
                                    .filter((n): n is GraphNode => n !== undefined);

                                const syncedPorts = syncPortsWithInternalNodes(
                                    parent,
                                    childNodes,
                                    newConnections,
                                    true  // onlyConnected: only show ports that have connections
                                );

                                newNodes.set(parentId, { ...parent, ports: syncedPorts });
                                nodesUpdated = true;
                            }
                        }

                        if (nodesUpdated) {
                            return {
                                connections: newConnections,
                                selectedConnectionIds: newSelectedConnections,
                                nodes: newNodes
                            };
                        }
                    }

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
            // Only selects nodes that are FULLY contained within the selection box
            selectNodesInRect: (rect) => {
                const navStore = useCanvasNavigationStore.getState();
                const selectedIds: string[] = [];

                // Get nodes at the current viewing level using flat structure
                const currentViewNodeId = navStore.currentViewNodeId;
                const nodesToCheck = get().getNodesAtLevel(currentViewNodeId);

                nodesToCheck.forEach((node) => {
                    const { width: nodeWidth, height: nodeHeight } = getNodeDimensions(node);

                    // Calculate node bounds
                    const nodeRight = node.position.x + nodeWidth;
                    const nodeBottom = node.position.y + nodeHeight;
                    const rectRight = rect.x + rect.width;
                    const rectBottom = rect.y + rect.height;

                    // Normalize rect (handle negative width/height from dragging)
                    const minX = Math.min(rect.x, rectRight);
                    const maxX = Math.max(rect.x, rectRight);
                    const minY = Math.min(rect.y, rectBottom);
                    const maxY = Math.max(rect.y, rectBottom);

                    // Check if node is FULLY contained within selection rect
                    if (node.position.x >= minX &&
                        nodeRight <= maxX &&
                        node.position.y >= minY &&
                        nodeBottom <= maxY) {
                        selectedIds.push(node.id);
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

                // Node types that cannot be deleted when inside an internal canvas
                const UNDELETABLE_INTERNAL_TYPES = ['keyboard-visual', 'output-panel', 'input-panel'];

                // With flat structure, we just use removeNode for all nodes
                // It handles all levels uniformly
                state.selectedNodeIds.forEach(nodeId => {
                    const node = state.nodes.get(nodeId);
                    if (!node) return;

                    // Check if this node is inside an internal canvas (has a parent)
                    if (node.parentId) {
                        const parent = state.nodes.get(node.parentId);

                        // Check if this is a special node (in specialNodes array)
                        if (parent?.specialNodes?.includes(nodeId)) {
                            console.warn(`Cannot delete special node ${nodeId}`);
                            useUIFeedbackStore.getState().flashNode(nodeId);
                            return;
                        }

                        // Check if this is an undeletable internal node type
                        if (UNDELETABLE_INTERNAL_TYPES.includes(node.type)) {
                            console.warn(`Cannot delete ${node.type} node ${nodeId}`);
                            useUIFeedbackStore.getState().flashNode(nodeId);
                            return;
                        }
                    }

                    get().removeNode(nodeId);
                });

                state.selectedConnectionIds.forEach(connectionId => {
                    get().removeConnection(connectionId);
                });

                // Clear selection after deletion
                get().clearSelection();
            },

            clearGraph: () => {
                get().pushHistory();
                set({
                    nodes: new Map(),
                    connections: new Map(),
                    rootNodeIds: [],
                    selectedNodeIds: new Set(),
                    selectedConnectionIds: new Set()
                });
            },

            loadGraph: (nodes, connections) => {
                get().pushHistory();
                const newNodes = new Map<string, GraphNode>();
                const newConnections = new Map<string, Connection>();
                const newRootNodeIds: string[] = [];

                nodes.forEach(node => {
                    newNodes.set(node.id, node);
                    // Collect root nodes
                    if (node.parentId === null || node.parentId === undefined) {
                        newRootNodeIds.push(node.id);
                    }
                });
                connections.forEach(conn => newConnections.set(conn.id, conn));

                set({
                    nodes: newNodes,
                    connections: newConnections,
                    rootNodeIds: newRootNodeIds,
                    selectedNodeIds: new Set(),
                    selectedConnectionIds: new Set()
                });
            },

            // Copy selected nodes and their connections to clipboard
            copySelected: () => {
                const state = get();
                if (state.selectedNodeIds.size === 0) return;

                const nodesToCopy: [string, GraphNode][] = [];
                const connectionsToCopy: Connection[] = [];

                // Copy selected nodes
                state.selectedNodeIds.forEach(nodeId => {
                    const node = state.nodes.get(nodeId);
                    if (node) {
                        nodesToCopy.push([nodeId, node]);
                    }
                });

                // Copy connections between selected nodes
                state.connections.forEach(conn => {
                    if (state.selectedNodeIds.has(conn.sourceNodeId) &&
                        state.selectedNodeIds.has(conn.targetNodeId)) {
                        connectionsToCopy.push(conn);
                    }
                });

                set({
                    clipboard: {
                        nodes: nodesToCopy,
                        connections: connectionsToCopy
                    }
                });
            },

            // Paste clipboard contents at specified position or offset from original
            pasteClipboard: (position?: Position) => {
                const state = get();
                if (!state.clipboard || state.clipboard.nodes.length === 0) return;

                get().pushHistory();

                const oldToNewIds = new Map<string, string>();
                const newNodes = new Map(state.nodes);

                // Calculate paste offset
                let offsetX = 50;
                let offsetY = 50;
                if (position && state.clipboard.nodes.length > 0) {
                    const firstNode = state.clipboard.nodes[0][1];
                    offsetX = position.x - firstNode.position.x;
                    offsetY = position.y - firstNode.position.y;
                }

                // Create new nodes with new IDs
                state.clipboard.nodes.forEach(([oldId, node]) => {
                    const newId = generateId();
                    oldToNewIds.set(oldId, newId);

                    const newNode: GraphNode = {
                        ...node,
                        id: newId,
                        position: {
                            x: node.position.x + offsetX,
                            y: node.position.y + offsetY
                        }
                    };

                    newNodes.set(newId, newNode);
                });

                // Create new connections with updated IDs
                const newConnections = new Map(state.connections);
                state.clipboard.connections.forEach(conn => {
                    const newSourceId = oldToNewIds.get(conn.sourceNodeId);
                    const newTargetId = oldToNewIds.get(conn.targetNodeId);

                    if (newSourceId && newTargetId) {
                        const newConnId = generateId();
                        newConnections.set(newConnId, {
                            ...conn,
                            id: newConnId,
                            sourceNodeId: newSourceId,
                            targetNodeId: newTargetId
                        });
                    }
                });

                // Select the newly pasted nodes
                const newSelectedIds = new Set(oldToNewIds.values());

                set({
                    nodes: newNodes,
                    connections: newConnections,
                    selectedNodeIds: newSelectedIds
                });
            },

            // Getters
            getNode: (nodeId) => get().nodes.get(nodeId),

            getNodesByType: (type) => {
                return Array.from(get().nodes.values()).filter(node => node.type === type);
            },

            getNodesBounds: () => {
                const { nodes } = get();
                if (nodes.size === 0) return null;

                let minX = Infinity, minY = Infinity;
                let maxX = -Infinity, maxY = -Infinity;

                nodes.forEach(node => {
                    const dims = getNodeDimensions(node);
                    minX = Math.min(minX, node.position.x);
                    minY = Math.min(minY, node.position.y);
                    maxX = Math.max(maxX, node.position.x + dims.width);
                    maxY = Math.max(maxY, node.position.y + dims.height);
                });

                return {
                    x: minX,
                    y: minY,
                    width: maxX - minX,
                    height: maxY - minY,
                    centerX: (minX + maxX) / 2,
                    centerY: (minY + maxY) / 2
                };
            },

            // Subscription helpers for AudioGraphManager
            getNodes: () => get().nodes,
            getConnections: () => get().connections,

            // Hierarchy traversal helpers (flat normalized structure)
            getNodeChildren: (nodeId) => {
                const state = get();
                const node = state.nodes.get(nodeId);
                if (!node?.childIds) return [];
                return node.childIds
                    .map(id => state.nodes.get(id))
                    .filter((n): n is GraphNode => n !== undefined);
            },

            getNodeParent: (nodeId) => {
                const state = get();
                const node = state.nodes.get(nodeId);
                if (!node?.parentId) return null;
                return state.nodes.get(node.parentId) || null;
            },

            getNodeDepth: (nodeId) => {
                const state = get();
                let depth = 0;
                let currentId: string | null = nodeId;

                while (currentId) {
                    const node = state.nodes.get(currentId);
                    if (!node?.parentId) break;
                    currentId = node.parentId;
                    depth++;
                }

                return depth;
            },

            getRootNodes: () => {
                const state = get();
                return state.rootNodeIds
                    .map(id => state.nodes.get(id))
                    .filter((n): n is GraphNode => n !== undefined);
            },

            getNodesAtLevel: (parentId) => {
                const state = get();
                if (parentId === null) {
                    // Root level: return nodes with no parent
                    return Array.from(state.nodes.values()).filter(n => n.parentId === null);
                } else {
                    // Inside a node: return its children
                    const parent = state.nodes.get(parentId);
                    if (!parent?.childIds) return [];
                    return parent.childIds
                        .map(id => state.nodes.get(id))
                        .filter((n): n is GraphNode => n !== undefined);
                }
            },

            getConnectionsAtLevel: (parentId) => {
                const state = get();
                const nodesAtLevel = get().getNodesAtLevel(parentId);
                const nodeIdsAtLevel = new Set(nodesAtLevel.map(n => n.id));

                // Return connections where both source and target are at this level
                return Array.from(state.connections.values()).filter(conn =>
                    nodeIdsAtLevel.has(conn.sourceNodeId) && nodeIdsAtLevel.has(conn.targetNodeId)
                );
            }
        }),
        {
            name: 'openjammer-graph-v2',  // New version to avoid loading old incompatible data
            // Custom serialization for Map and Set (flat normalized structure)
            storage: {
                getItem: (name) => {
                    try {
                        const str = localStorage.getItem(name);
                        if (!str) return null;

                        const parsed = JSON.parse(str);

                        // Validate data structure exists
                        if (!parsed?.state) {
                            console.warn('Invalid graph store data structure, resetting');
                            return null;
                        }

                        // Deserialize flat node structure
                        const nodesArray = Array.isArray(parsed.state.nodes) ? parsed.state.nodes : [];
                        const nodes = new Map<string, GraphNode>(
                            nodesArray.map(([id, node]: [string, GraphNode]) => {
                                // Ensure new flat structure fields exist
                                if (node.parentId === undefined) node.parentId = null;
                                if (!Array.isArray(node.childIds)) node.childIds = [];
                                if (!Array.isArray(node.specialNodes)) node.specialNodes = [];

                                // MIGRATION: Rename 'technical' port types to 'control'
                                if (Array.isArray(node.ports)) {
                                    node.ports = node.ports.map(port => ({
                                        ...port,
                                        type: (port.type as string) === 'technical' ? 'control' : port.type
                                    }));
                                }

                                return [id, node] as [string, GraphNode];
                            })
                        );

                        // MIGRATION: Rename 'technical' connection types to 'control'
                        const connectionsArray = Array.isArray(parsed.state.connections) ? parsed.state.connections : [];
                        const migratedConnections = connectionsArray.map(([id, conn]: [string, Connection]) => {
                            if ((conn.type as string) === 'technical') {
                                conn.type = 'control';
                            }
                            return [id, conn] as [string, Connection];
                        });

                        // Deserialize rootNodeIds (or compute from nodes if missing)
                        let rootNodeIds = parsed.state.rootNodeIds;
                        if (!Array.isArray(rootNodeIds)) {
                            // Compute from nodes
                            rootNodeIds = Array.from(nodes.values())
                                .filter((n: GraphNode) => n.parentId === null)
                                .map((n: GraphNode) => n.id);
                        }

                        return {
                            state: {
                                ...parsed.state,
                                nodes,
                                connections: new Map(migratedConnections),
                                rootNodeIds,
                                selectedNodeIds: new Set(Array.isArray(parsed.state.selectedNodeIds) ? parsed.state.selectedNodeIds : []),
                                selectedConnectionIds: new Set(Array.isArray(parsed.state.selectedConnectionIds) ? parsed.state.selectedConnectionIds : []),
                                history: Array.isArray(parsed.state.history) ? parsed.state.history : [],
                                historyIndex: typeof parsed.state.historyIndex === 'number' ? parsed.state.historyIndex : -1
                            }
                        };
                    } catch (error) {
                        console.error('Failed to load graph store from localStorage:', error);
                        return null; // Graceful reset on any error
                    }
                },
                setItem: (name, value) => {
                    // Serialize flat node structure (no nested Maps)
                    const nodesArray = Array.from(value.state.nodes.entries() as Iterable<[string, GraphNode]>);

                    try {
                        const serialized = {
                            state: {
                                ...value.state,
                                nodes: nodesArray,
                                connections: Array.from(value.state.connections.entries()),
                                rootNodeIds: value.state.rootNodeIds,
                                selectedNodeIds: Array.from(value.state.selectedNodeIds),
                                selectedConnectionIds: Array.from(value.state.selectedConnectionIds),
                                history: value.state.history,
                                historyIndex: value.state.historyIndex
                            }
                        };
                        localStorage.setItem(name, JSON.stringify(serialized));
                    } catch (error) {
                        // Handle QuotaExceededError by clearing history and retrying
                        if (error instanceof DOMException && error.name === 'QuotaExceededError') {
                            console.warn('localStorage quota exceeded, clearing history');
                            try {
                                const serializedWithoutHistory = {
                                    state: {
                                        ...value.state,
                                        nodes: nodesArray,
                                        connections: Array.from(value.state.connections.entries()),
                                        rootNodeIds: value.state.rootNodeIds,
                                        selectedNodeIds: Array.from(value.state.selectedNodeIds),
                                        selectedConnectionIds: Array.from(value.state.selectedConnectionIds),
                                        history: [],
                                        historyIndex: -1
                                    }
                                };
                                localStorage.setItem(name, JSON.stringify(serializedWithoutHistory));
                            } catch (retryError) {
                                console.error('Failed to save graph store even after clearing history:', retryError);
                            }
                        } else {
                            console.error('Failed to save graph store to localStorage:', error);
                        }
                    }
                },
                removeItem: (name) => {
                    try {
                        localStorage.removeItem(name);
                    } catch (error) {
                        console.error('Failed to remove graph store from localStorage:', error);
                    }
                }
            }
        }
    )
);
