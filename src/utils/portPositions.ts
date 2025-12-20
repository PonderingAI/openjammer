/**
 * Port Position Calculator
 *
 * Calculates port positions using a hybrid approach:
 * 1. Fixed positions - ports with explicit position defined
 * 2. Dynamic positions - calculated from portLayout config
 *
 * All positions are in canvas coordinates (not screen coordinates).
 */

import type { GraphNode, PortDefinition, PortLayoutConfig, Position } from '../engine/types';
import { getNodeDefinition } from '../engine/registry';
import { getNodeDimensions } from '../store/graphStore';

// Default port layout when none specified
const DEFAULT_PORT_LAYOUT: Required<PortLayoutConfig> = {
    direction: 'vertical',
    inputArea: { x: 0, startY: 0.2, endY: 0.8 },
    outputArea: { x: 1, startY: 0.2, endY: 0.8 }
};

/**
 * Get the canvas-space position for a specific port on a node
 */
export function getPortPosition(node: GraphNode, portId: string): Position | null {
    const port = node.ports.find(p => p.id === portId);
    if (!port) return null;

    const definition = getNodeDefinition(node.type);
    const dimensions = definition.dimensions ?? getNodeDimensions(node);
    const portLayout = definition.portLayout ?? {};

    // Merge with defaults
    const layout: Required<PortLayoutConfig> = {
        direction: portLayout.direction ?? DEFAULT_PORT_LAYOUT.direction,
        inputArea: portLayout.inputArea ?? DEFAULT_PORT_LAYOUT.inputArea,
        outputArea: portLayout.outputArea ?? DEFAULT_PORT_LAYOUT.outputArea
    };

    // If port has explicit position, use it
    if (port.position) {
        return {
            x: node.position.x + port.position.x * dimensions.width,
            y: node.position.y + port.position.y * dimensions.height
        };
    }

    // Calculate dynamic position based on layout
    return calculateDynamicPortPosition(node, port, layout, dimensions);
}

/**
 * Calculate position for a port without explicit position
 */
function calculateDynamicPortPosition(
    node: GraphNode,
    port: PortDefinition,
    layout: Required<PortLayoutConfig>,
    dimensions: { width: number; height: number }
): Position {
    const isInput = port.direction === 'input';
    const area = isInput ? layout.inputArea : layout.outputArea;

    // Get all ports of same direction without explicit position
    const dynamicPorts = node.ports.filter(p =>
        p.direction === port.direction && !p.position
    );

    const portIndex = dynamicPorts.findIndex(p => p.id === port.id);
    const totalPorts = dynamicPorts.length;

    // Calculate position within the spawn area
    let normalizedX: number;
    let normalizedY: number;

    if (layout.direction === 'vertical') {
        normalizedX = area.x;

        if (totalPorts === 1) {
            // Single port: center in area
            normalizedY = (area.startY + area.endY) / 2;
        } else {
            // Multiple ports: evenly distributed
            const range = area.endY - area.startY;
            const step = range / (totalPorts - 1);
            normalizedY = area.startY + portIndex * step;
        }
    } else {
        // Horizontal layout
        normalizedY = (area.startY + area.endY) / 2;

        if (totalPorts === 1) {
            normalizedX = area.x;
        } else {
            // For horizontal, we need startX/endX - use x as center and spread
            const spread = 0.3; // 30% of width for horizontal spread
            const startX = Math.max(0, area.x - spread / 2);
            const endX = Math.min(1, area.x + spread / 2);
            const range = endX - startX;
            const step = range / (totalPorts - 1);
            normalizedX = startX + portIndex * step;
        }
    }

    return {
        x: node.position.x + normalizedX * dimensions.width,
        y: node.position.y + normalizedY * dimensions.height
    };
}

/**
 * Get all port positions for a node
 * Returns a Map of portId -> Position
 */
export function getAllPortPositions(node: GraphNode): Map<string, Position> {
    const positions = new Map<string, Position>();

    for (const port of node.ports) {
        const pos = getPortPosition(node, port.id);
        if (pos) {
            positions.set(port.id, pos);
        }
    }

    return positions;
}

/**
 * Check if a click position is near a port
 * Returns the port ID if within threshold, null otherwise
 */
export function findPortAtPosition(
    node: GraphNode,
    clickPos: Position,
    threshold: number = 15
): string | null {
    for (const port of node.ports) {
        const portPos = getPortPosition(node, port.id);
        if (!portPos) continue;

        const dx = clickPos.x - portPos.x;
        const dy = clickPos.y - portPos.y;
        const distance = Math.sqrt(dx * dx + dy * dy);

        if (distance <= threshold) {
            return port.id;
        }
    }

    return null;
}
