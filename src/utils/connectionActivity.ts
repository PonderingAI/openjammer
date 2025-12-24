/**
 * Connection Activity Utilities
 *
 * Maps keyboard rows and pedal actions to their corresponding connection IDs
 * for visual signal feedback on cables.
 */

import { useGraphStore } from '../store/graphStore';
import type { GraphNode } from '../engine/types';

/**
 * Get the source port ID for a keyboard row
 * Handles both bundled output mode and individual row ports
 */
function getKeyboardRowPortId(keyboardNode: GraphNode, row: number): string | undefined {
    // Check if keyboard is using bundled output (simple mode)
    const bundlePort = keyboardNode.ports.find(p => p.id === 'bundle-out');
    if (bundlePort) {
        return 'bundle-out';
    }

    // Advanced mode or legacy: find the specific row port
    let sourcePortId = keyboardNode.ports.find(
        p => p.direction === 'output' && p.name.toLowerCase().includes(`row ${row}`)
    )?.id;

    // If no row-specific port found, try to use first available output port
    if (!sourcePortId) {
        sourcePortId = keyboardNode.ports.find(p => p.direction === 'output')?.id;
    }

    return sourcePortId;
}

/**
 * Get the pedal/control port ID for a keyboard
 * Exported for use in AudioGraphManager and other modules
 */
export function getKeyboardControlPortId(keyboardNode: GraphNode): string | undefined {
    // Look for pedal or control output port
    const pedalPort = keyboardNode.ports.find(
        p => p.direction === 'output' &&
            (p.id === 'pedal' || p.id === 'control' || p.name.toLowerCase().includes('pedal'))
    );
    return pedalPort?.id;
}

// Alias for backwards compatibility
const getKeyboardPedalPortId = getKeyboardControlPortId;

/**
 * Get all connection IDs that originate from a keyboard's row output port
 *
 * @param keyboardId - The keyboard node ID
 * @param row - The keyboard row (1, 2, or 3)
 * @returns Array of connection IDs that should be visually activated
 */
export function getConnectionsForRow(keyboardId: string, row: number): string[] {
    const { connections, nodes } = useGraphStore.getState();
    const keyboardNode = nodes.get(keyboardId);
    if (!keyboardNode) return [];

    const portId = getKeyboardRowPortId(keyboardNode, row);
    if (!portId) return [];

    // Find all connections from this keyboard's row port
    const result: string[] = [];
    for (const [connId, conn] of connections) {
        if (conn.sourceNodeId === keyboardId && conn.sourcePortId === portId) {
            result.push(connId);
        }
    }

    return result;
}

/**
 * Get all connection IDs that originate from a keyboard's pedal output port
 *
 * @param keyboardId - The keyboard node ID
 * @returns Array of connection IDs that should be visually activated
 */
export function getConnectionsForPedal(keyboardId: string): string[] {
    const { connections, nodes } = useGraphStore.getState();
    const keyboardNode = nodes.get(keyboardId);
    if (!keyboardNode) return [];

    const portId = getKeyboardPedalPortId(keyboardNode);
    if (!portId) return [];

    // Find all connections from this keyboard's pedal port
    const result: string[] = [];
    for (const [connId, conn] of connections) {
        if (conn.sourceNodeId === keyboardId && conn.sourcePortId === portId) {
            result.push(connId);
        }
    }

    return result;
}

/**
 * Get all connections from a specific node's output port
 * Generic version for any node type
 *
 * @param nodeId - The source node ID
 * @param portId - The source port ID
 * @returns Array of connection IDs
 */
export function getConnectionsFromPort(nodeId: string, portId: string): string[] {
    const { connections } = useGraphStore.getState();

    const result: string[] = [];
    for (const [connId, conn] of connections) {
        if (conn.sourceNodeId === nodeId && conn.sourcePortId === portId) {
            result.push(connId);
        }
    }

    return result;
}
