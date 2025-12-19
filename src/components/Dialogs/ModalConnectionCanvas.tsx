/**
 * Modal Connection Canvas - SVG canvas for drawing connections between internal ports and bundles
 *
 * Features:
 * - Click-and-follow or drag-to-connect connection drawing
 * - Multi-select connections with drag-box
 * - Batch move selected connections to new bundle
 */

import { useRef, useState, useEffect, useCallback } from 'react';
import type { GraphNode, BundleConfig } from '../../engine/types';
import { useGraphStore } from '../../store/graphStore';

interface ModalConnectionCanvasProps {
    node: GraphNode;
}

interface Position {
    x: number;
    y: number;
}

interface SelectionBox {
    startX: number;
    startY: number;
    currentX: number;
    currentY: number;
}

export function ModalConnectionCanvas({ node }: ModalConnectionCanvasProps) {
    const svgRef = useRef<SVGSVGElement>(null);
    const [isConnecting, setIsConnecting] = useState(false);
    const [connectingFrom, setConnectingFrom] = useState<string | null>(null);
    const [mousePos, setMousePos] = useState<Position>({ x: 0, y: 0 });
    const [selectedConnections, setSelectedConnections] = useState<Set<string>>(new Set());
    const [selectionBox, setSelectionBox] = useState<SelectionBox | null>(null);

    const updateNodeData = useGraphStore((s) => s.updateNodeData);

    const bundleConfig: BundleConfig = node.data.bundleConfig || {
        inputBundles: [],
        outputBundles: [],
        internalToBundle: {},
        bundleToInternal: {}
    };

    // Get port position from DOM
    const getPortPosition = useCallback((portId: string): Position | null => {
        const portElement = document.querySelector(`[data-port-id="${portId}"]`);
        if (!portElement) return null;

        const rect = portElement.getBoundingClientRect();
        const svgRect = svgRef.current?.getBoundingClientRect();
        if (!svgRect) return null;

        return {
            x: rect.left + rect.width / 2 - svgRect.left,
            y: rect.top + rect.height / 2 - svgRect.top
        };
    }, []);

    // Create bezier path between two points
    const createBezierPath = useCallback((from: Position, to: Position): string => {
        const midX = (from.x + to.x) / 2;
        return `M ${from.x} ${from.y} C ${midX} ${from.y}, ${midX} ${to.y}, ${to.x} ${to.y}`;
    }, []);

    // Check if line intersects rectangle (for selection)
    const lineIntersectsRect = useCallback((p1: Position, p2: Position, rect: { minX: number; minY: number; maxX: number; maxY: number }): boolean => {
        const p1In = rect.minX <= p1.x && p1.x <= rect.maxX && rect.minY <= p1.y && p1.y <= rect.maxY;
        const p2In = rect.minX <= p2.x && p2.x <= rect.maxX && rect.minY <= p2.y && p2.y <= rect.maxY;
        return p1In || p2In;
    }, []);

    // Select connections within drag box
    const selectConnectionsInRect = useCallback((box: SelectionBox) => {
        const minX = Math.min(box.startX, box.currentX);
        const maxX = Math.max(box.startX, box.currentX);
        const minY = Math.min(box.startY, box.currentY);
        const maxY = Math.max(box.startY, box.currentY);

        const selectedIds = new Set<string>();

        Object.entries(bundleConfig.internalToBundle).forEach(([internal, bundle]) => {
            const fromPos = getPortPosition(`internal-${internal}`);
            const toPos = getPortPosition(bundle);

            if (!fromPos || !toPos) return;

            if (lineIntersectsRect(fromPos, toPos, { minX, minY, maxX, maxY })) {
                selectedIds.add(`${internal}-${bundle}`);
            }
        });

        setSelectedConnections(selectedIds);
    }, [bundleConfig.internalToBundle, getPortPosition, lineIntersectsRect]);

    // Create or update connection
    const handleCreateConnection = useCallback((fromPortId: string, toPortId: string) => {
        // Determine which is internal and which is bundle
        let internalId: string;
        let bundleId: string;

        if (fromPortId.startsWith('internal-')) {
            internalId = fromPortId.replace('internal-', '');
            bundleId = toPortId;
        } else if (toPortId.startsWith('internal-')) {
            internalId = toPortId.replace('internal-', '');
            bundleId = fromPortId;
        } else {
            return; // Invalid connection (must have one internal and one bundle)
        }

        // Don't connect to empty ports
        if (bundleId.startsWith('empty-')) return;

        const newConfig: BundleConfig = { ...bundleConfig };

        // Remove old connection if exists
        const oldBundle = newConfig.internalToBundle[internalId];
        if (oldBundle) {
            newConfig.bundleToInternal[oldBundle] = newConfig.bundleToInternal[oldBundle]?.filter(id => id !== internalId) || [];
        }

        // Add new connection
        newConfig.internalToBundle[internalId] = bundleId;
        if (!newConfig.bundleToInternal[bundleId]) {
            newConfig.bundleToInternal[bundleId] = [];
        }
        if (!newConfig.bundleToInternal[bundleId].includes(internalId)) {
            newConfig.bundleToInternal[bundleId].push(internalId);
        }

        updateNodeData(node.id, { bundleConfig: newConfig });
    }, [bundleConfig, node.id, updateNodeData]);

    // Handle connection click (toggle selection)
    const handleConnectionClick = useCallback((connId: string, e: React.MouseEvent) => {
        e.stopPropagation();
        setSelectedConnections(prev => {
            const newSet = new Set(prev);
            if (newSet.has(connId)) {
                newSet.delete(connId);
            } else {
                newSet.add(connId);
            }
            return newSet;
        });
    }, []);

    // Batch move selected connections to a new bundle
    const handleBatchMove = useCallback((targetBundleId: string) => {
        if (selectedConnections.size === 0) return;

        const newConfig: BundleConfig = { ...bundleConfig };

        selectedConnections.forEach(connId => {
            const [internalId, oldBundleId] = connId.split('-');

            // Update internal-to-bundle mapping
            newConfig.internalToBundle[internalId] = targetBundleId;

            // Update bundle-to-internal mappings
            // Remove from old bundle
            if (newConfig.bundleToInternal[oldBundleId]) {
                newConfig.bundleToInternal[oldBundleId] =
                    newConfig.bundleToInternal[oldBundleId].filter(id => id !== internalId);
            }

            // Add to new bundle
            if (!newConfig.bundleToInternal[targetBundleId]) {
                newConfig.bundleToInternal[targetBundleId] = [];
            }
            if (!newConfig.bundleToInternal[targetBundleId].includes(internalId)) {
                newConfig.bundleToInternal[targetBundleId].push(internalId);
            }
        });

        updateNodeData(node.id, { bundleConfig: newConfig });
        setSelectedConnections(new Set());
    }, [selectedConnections, bundleConfig, node.id, updateNodeData]);

    // Mouse handlers
    const handleMouseDown = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
        const target = e.target as HTMLElement;
        const portId = target.getAttribute('data-port-id');

        if (portId && portId !== 'connection-canvas') {
            // Start connecting from this port
            setIsConnecting(true);
            setConnectingFrom(portId);
        } else {
            // Start selection box
            const svgRect = svgRef.current?.getBoundingClientRect();
            if (svgRect) {
                setSelectionBox({
                    startX: e.clientX - svgRect.left,
                    startY: e.clientY - svgRect.top,
                    currentX: e.clientX - svgRect.left,
                    currentY: e.clientY - svgRect.top
                });
            }
        }
    }, []);

    const handleMouseMove = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
        const svgRect = svgRef.current?.getBoundingClientRect();
        if (!svgRect) return;

        if (isConnecting) {
            setMousePos({
                x: e.clientX - svgRect.left,
                y: e.clientY - svgRect.top
            });
        } else if (selectionBox) {
            const newBox = {
                ...selectionBox,
                currentX: e.clientX - svgRect.left,
                currentY: e.clientY - svgRect.top
            };
            setSelectionBox(newBox);
            selectConnectionsInRect(newBox);
        }
    }, [isConnecting, selectionBox, selectConnectionsInRect]);

    const handleMouseUp = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
        const target = e.target as HTMLElement;
        const toPortId = target.getAttribute('data-port-id');

        // Check for batch move first (if connections are selected and clicking on a bundle)
        if (selectedConnections.size > 0 && toPortId &&
            toPortId.startsWith('bundle-') && !toPortId.startsWith('empty-')) {
            handleBatchMove(toPortId);
            return;
        }

        if (isConnecting && connectingFrom) {
            if (toPortId && toPortId !== connectingFrom) {
                handleCreateConnection(connectingFrom, toPortId);
            }

            setIsConnecting(false);
            setConnectingFrom(null);
        } else if (selectionBox) {
            setSelectionBox(null);
        }
    }, [isConnecting, connectingFrom, selectionBox, selectedConnections, handleCreateConnection, handleBatchMove]);

    // Render connection path
    const renderConnection = useCallback((internalId: string, bundleId: string) => {
        const fromPos = getPortPosition(`internal-${internalId}`);
        const toPos = getPortPosition(bundleId);

        if (!fromPos || !toPos) return null;

        const connId = `${internalId}-${bundleId}`;
        const isSelected = selectedConnections.has(connId);

        const path = createBezierPath(fromPos, toPos);

        return (
            <path
                key={connId}
                d={path}
                className={`modal-connection ${isSelected ? 'selected' : ''}`}
                stroke="var(--accent-primary)"
                strokeWidth="2"
                fill="none"
                onClick={(e) => handleConnectionClick(connId, e)}
                style={{ cursor: 'pointer' }}
            />
        );
    }, [getPortPosition, createBezierPath, selectedConnections, handleConnectionClick]);

    // Re-render when bundle config changes
    useEffect(() => {
        // Force re-render of connections when config changes
    }, [bundleConfig]);

    return (
        <svg
            ref={svgRef}
            className="modal-connection-canvas"
            data-port-id="connection-canvas"
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            style={{
                width: '100%',
                height: '100%',
                cursor: isConnecting ? 'crosshair' : 'default'
            }}
        >
            {/* Render existing connections */}
            {Object.entries(bundleConfig.internalToBundle).map(([internal, bundle]) =>
                renderConnection(internal, bundle)
            )}

            {/* Temporary connection while dragging */}
            {isConnecting && connectingFrom && (
                <path
                    d={createBezierPath(
                        getPortPosition(connectingFrom) || { x: 0, y: 0 },
                        mousePos
                    )}
                    className="modal-connection temporary"
                    stroke="var(--accent-primary)"
                    strokeWidth="2"
                    strokeDasharray="5,5"
                    fill="none"
                    opacity="0.5"
                    pointerEvents="none"
                />
            )}

            {/* Selection box */}
            {selectionBox && (
                <rect
                    x={Math.min(selectionBox.startX, selectionBox.currentX)}
                    y={Math.min(selectionBox.startY, selectionBox.currentY)}
                    width={Math.abs(selectionBox.currentX - selectionBox.startX)}
                    height={Math.abs(selectionBox.currentY - selectionBox.startY)}
                    className="selection-box"
                    fill="rgba(100, 150, 255, 0.1)"
                    stroke="rgba(100, 150, 255, 0.5)"
                    strokeWidth="1"
                    pointerEvents="none"
                />
            )}
        </svg>
    );
}
