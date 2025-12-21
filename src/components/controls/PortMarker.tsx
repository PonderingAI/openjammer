/**
 * PortMarker - Universal port connection point for MIDI controls
 *
 * This component renders a connectable port marker that:
 * - Automatically adds data attributes for DOM-based position lookup
 * - Handles mouse events for connection interactions
 * - Provides consistent styling across all control types
 *
 * The DOM-based position lookup (using data-node-id and data-port-id)
 * is the source of truth for port positions. This eliminates the need
 * for manual position calculations in the registry.
 */

import React from 'react';
import './PortMarker.css';

export interface PortMarkerProps {
    /** The node ID this port belongs to */
    nodeId: string;
    /** The unique port ID within the node */
    portId: string;
    /** Whether this port has an active connection */
    connected?: boolean;
    /** Size variant of the port marker */
    size?: 'small' | 'medium' | 'large';
    /** CSS class name for positioning (applied to wrapper) */
    className?: string;
    /** Event handlers for connection interactions */
    onMouseDown?: (portId: string, e: React.MouseEvent) => void;
    onMouseUp?: (portId: string, e: React.MouseEvent) => void;
    onMouseEnter?: (portId: string) => void;
    onMouseLeave?: () => void;
}

export function PortMarker({
    nodeId,
    portId,
    connected = false,
    size = 'medium',
    className = '',
    onMouseDown,
    onMouseUp,
    onMouseEnter,
    onMouseLeave
}: PortMarkerProps) {
    return (
        <div
            className={`port-marker port-marker--${size} ${connected ? 'port-marker--connected' : ''} ${className}`}
            data-node-id={nodeId}
            data-port-id={portId}
            data-port-type="control"
            onMouseDown={(e) => onMouseDown?.(portId, e)}
            onMouseUp={(e) => onMouseUp?.(portId, e)}
            onMouseEnter={() => onMouseEnter?.(portId)}
            onMouseLeave={onMouseLeave}
        />
    );
}

/**
 * Props for controls that contain a port marker
 * Use this to create consistent control components
 */
export interface WithPortMarkerProps {
    nodeId: string;
    portId: string;
    connected?: boolean;
    onPortMouseDown?: (portId: string, e: React.MouseEvent) => void;
    onPortMouseUp?: (portId: string, e: React.MouseEvent) => void;
    onPortMouseEnter?: (portId: string) => void;
    onPortMouseLeave?: () => void;
}

export default PortMarker;
