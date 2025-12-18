/**
 * Node Canvas - Main canvas with pan/zoom, box selection, and node rendering
 */

import { useCallback, useRef, useState, useEffect } from 'react';
import type { Position, NodeType, Connection } from '../../engine/types';
import { useGraphStore } from '../../store/graphStore';
import { useCanvasStore } from '../../store/canvasStore';
import { useAudioStore } from '../../store/audioStore';
import { useKeybindingsStore } from '../../store/keybindingsStore';
import { ContextMenu } from './ContextMenu';
import { NodeWrapper } from '../Nodes/NodeWrapper';
import './NodeCanvas.css';

interface SelectionBox {
    startX: number;
    startY: number;
    currentX: number;
    currentY: number;
}

export function NodeCanvas() {
    const canvasRef = useRef<HTMLDivElement>(null);
    const [contextMenu, setContextMenu] = useState<Position | null>(null);
    const [selectionBox, setSelectionBox] = useState<SelectionBox | null>(null);

    // Graph store
    const nodes = useGraphStore((s) => s.nodes);
    const connections = useGraphStore((s) => s.connections);
    const addNode = useGraphStore((s) => s.addNode);
    const selectedConnectionIds = useGraphStore((s) => s.selectedConnectionIds);
    const selectConnection = useGraphStore((s) => s.selectConnection);
    const clearSelection = useGraphStore((s) => s.clearSelection);
    const deleteSelected = useGraphStore((s) => s.deleteSelected);
    const selectNodesInRect = useGraphStore((s) => s.selectNodesInRect);
    const undo = useGraphStore((s) => s.undo);
    const redo = useGraphStore((s) => s.redo);

    // Canvas store
    const pan = useCanvasStore((s) => s.pan);
    const zoom = useCanvasStore((s) => s.zoom);
    const isPanning = useCanvasStore((s) => s.isPanning);
    const setPanning = useCanvasStore((s) => s.setPanning);
    const panBy = useCanvasStore((s) => s.panBy);
    const zoomTo = useCanvasStore((s) => s.zoomTo);
    const screenToCanvas = useCanvasStore((s) => s.screenToCanvas);
    const isConnecting = useCanvasStore((s) => s.isConnecting);
    const connectingFrom = useCanvasStore((s) => s.connectingFrom);
    const startConnecting = useCanvasStore((s) => s.startConnecting);
    const stopConnecting = useCanvasStore((s) => s.stopConnecting);
    const ghostMode = useCanvasStore((s) => s.ghostMode);
    const toggleGhostMode = useCanvasStore((s) => s.toggleGhostMode);

    // Audio store for mode switching
    const setCurrentMode = useAudioStore((s) => s.setCurrentMode);

    const [mousePos, setMousePos] = useState<Position>({ x: 0, y: 0 });
    const lastPanPos = useRef<Position>({ x: 0, y: 0 });

    // Port position cache with TTL
    const portPositionCache = useRef<Map<string, { position: Position; timestamp: number }>>(new Map());
    const CACHE_TTL_MS = 100; // Cache valid for 100ms
    const lastPanZoom = useRef({ pan: { x: 0, y: 0 }, zoom: 1 });

    // Clear cache when pan/zoom changes significantly
    if (Math.abs(pan.x - lastPanZoom.current.pan.x) > 5 ||
        Math.abs(pan.y - lastPanZoom.current.pan.y) > 5 ||
        Math.abs(zoom - lastPanZoom.current.zoom) > 0.05) {
        portPositionCache.current.clear();
        lastPanZoom.current = { pan: { x: pan.x, y: pan.y }, zoom };
    }

    // Handle right-click context menu
    const handleContextMenu = useCallback((e: React.MouseEvent) => {
        e.preventDefault();

        // Only show menu if clicking on empty canvas
        if ((e.target as HTMLElement).closest('.node')) {
            return;
        }

        setContextMenu({ x: e.clientX, y: e.clientY });
    }, []);

    // Handle adding a node
    const handleAddNode = useCallback((type: NodeType, screenPos: Position) => {
        const canvasPos = screenToCanvas(screenPos);
        addNode(type, canvasPos);
    }, [screenToCanvas, addNode]);

    // Handle mouse down (start panning or box selection)
    const handleMouseDown = useCallback((e: React.MouseEvent) => {
        // Middle mouse button or Alt + left click for panning
        if (e.button === 1 || (e.button === 0 && e.altKey)) {
            e.preventDefault();
            setPanning(true);
            lastPanPos.current = { x: e.clientX, y: e.clientY };
            return;
        }

        // Left click on empty canvas - start box selection
        // Check for all node and port classes (standard and schematic)
        const isNodeOrPort = (e.target as HTMLElement).closest(
            '.node, .schematic-node, .port, .port-dot, .port-circle-marker, .note-input-port, .output-port, .speaker-input-port'
        );
        if (e.button === 0 && !isNodeOrPort) {
            clearSelection();
            stopConnecting();

            // Start box selection
            const canvasPos = screenToCanvas({ x: e.clientX, y: e.clientY });
            setSelectionBox({
                startX: canvasPos.x,
                startY: canvasPos.y,
                currentX: canvasPos.x,
                currentY: canvasPos.y
            });
        }
    }, [setPanning, clearSelection, stopConnecting, screenToCanvas]);

    // Handle mouse move
    const handleMouseMove = useCallback((e: React.MouseEvent) => {
        setMousePos({ x: e.clientX, y: e.clientY });

        if (isPanning) {
            const dx = e.clientX - lastPanPos.current.x;
            const dy = e.clientY - lastPanPos.current.y;
            panBy({ x: dx, y: dy });
            lastPanPos.current = { x: e.clientX, y: e.clientY };
        }

        // Update box selection
        if (selectionBox) {
            const canvasPos = screenToCanvas({ x: e.clientX, y: e.clientY });
            setSelectionBox(prev => prev ? {
                ...prev,
                currentX: canvasPos.x,
                currentY: canvasPos.y
            } : null);
        }
    }, [isPanning, panBy, selectionBox, screenToCanvas]);

    // Handle mouse up
    const handleMouseUp = useCallback(() => {
        setPanning(false);

        // Complete box selection
        if (selectionBox) {
            const width = selectionBox.currentX - selectionBox.startX;
            const height = selectionBox.currentY - selectionBox.startY;

            // Only select if dragged more than 5 pixels
            if (Math.abs(width) > 5 || Math.abs(height) > 5) {
                selectNodesInRect({
                    x: Math.min(selectionBox.startX, selectionBox.currentX),
                    y: Math.min(selectionBox.startY, selectionBox.currentY),
                    width: Math.abs(width),
                    height: Math.abs(height)
                });
            }

            setSelectionBox(null);
        }
    }, [setPanning, selectionBox, selectNodesInRect]);

    // Handle wheel for zoom
    const handleWheel = useCallback((e: React.WheelEvent) => {
        e.preventDefault();

        const delta = e.deltaY > 0 ? 0.9 : 1.1;
        const newZoom = zoom * delta;

        zoomTo(newZoom, { x: e.clientX, y: e.clientY });
    }, [zoom, zoomTo]);

    // Handle keyboard shortcuts using keybindings store
    useEffect(() => {
        const { matchesAction } = useKeybindingsStore.getState();

        function handleKeyDown(e: KeyboardEvent) {
            // Skip if typing in input
            if ((e.target as HTMLElement).tagName === 'INPUT') return;

            // Check keybinding actions
            if (matchesAction(e, 'edit.delete') || e.key === 'Backspace') {
                e.preventDefault();
                deleteSelected();
                return;
            }

            if (matchesAction(e, 'view.ghostMode')) {
                e.preventDefault();
                toggleGhostMode();
                return;
            }

            if (matchesAction(e, 'edit.undo')) {
                e.preventDefault();
                undo();
                return;
            }

            if (matchesAction(e, 'edit.redo')) {
                e.preventDefault();
                redo();
                return;
            }

            if (matchesAction(e, 'canvas.multiConnect')) {
                // Get all selected nodes
                const selectedIds = useGraphStore.getState().selectedNodeIds;
                const graphNodes = useGraphStore.getState().nodes;
                const graphConnections = useGraphStore.getState().connections;

                if (selectedIds.size >= 1) {
                    e.preventDefault();

                    // Build array of all empty output ports from all selected nodes
                    const allSources: { nodeId: string; portId: string }[] = [];

                    for (const nodeId of selectedIds) {
                        const node = graphNodes.get(nodeId);
                        if (!node) continue;

                        // Get all output ports (both audio and technical)
                        const outputPorts = node.ports.filter(p => p.direction === 'output');

                        // Filter to only empty (unconnected) ports
                        const emptyOutputs = outputPorts.filter(port => {
                            const hasConnection = Array.from(graphConnections.values()).some(
                                conn => conn.sourceNodeId === nodeId && conn.sourcePortId === port.id
                            );
                            return !hasConnection;
                        });

                        for (const port of emptyOutputs) {
                            allSources.push({ nodeId, portId: port.id });
                        }
                    }

                    if (allSources.length > 0) {
                        startConnecting(allSources);
                    }
                }
                return;
            }

            // 1-9 Keys - Mode switching (not customizable for now)
            const keyNum = parseInt(e.key, 10);
            if (!isNaN(keyNum) && keyNum >= 1 && keyNum <= 9) {
                e.preventDefault();
                setCurrentMode(keyNum);
                return;
            }
        }

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [deleteSelected, toggleGhostMode, undo, redo, startConnecting, setCurrentMode]);

    // Get port position for connection rendering using DOM measurement
    const getPortPosition = useCallback((nodeId: string, portId: string): Position | null => {
        const cacheKey = `${nodeId}:${portId}`;
        const now = Date.now();

        // Check cache first
        const cached = portPositionCache.current.get(cacheKey);
        if (cached && (now - cached.timestamp) < CACHE_TTL_MS) {
            return cached.position;
        }

        // Query port element by data attributes
        const portElement = document.querySelector(
            `[data-node-id="${nodeId}"][data-port-id="${portId}"]`
        );

        // Fallback: If DOM element not found, calculate approximate position from node position
        if (!portElement) {
            const node = nodes.get(nodeId);
            if (node) {
                // Approximate position: node center + small offset for ports
                const fallbackPos = {
                    x: node.position.x + 80, // Approximate half-width
                    y: node.position.y + 40  // Approximate half-height
                };
                return fallbackPos;
            }
            return null;
        }

        const canvasElement = canvasRef.current;
        if (!canvasElement) return null;

        const portRect = portElement.getBoundingClientRect();
        const canvasRect = canvasElement.getBoundingClientRect();

        // Convert screen coordinates to canvas coordinates
        // Account for pan and zoom
        const centerX = portRect.left + portRect.width / 2 - canvasRect.left;
        const centerY = portRect.top + portRect.height / 2 - canvasRect.top;

        // Inverse transform to get canvas-space coordinates
        const canvasX = (centerX - pan.x) / zoom;
        const canvasY = (centerY - pan.y) / zoom;

        const position = { x: canvasX, y: canvasY };

        // Cache the result
        portPositionCache.current.set(cacheKey, { position, timestamp: now });

        return position;
    }, [pan, zoom, nodes]);

    // Render connection path
    const renderConnection = useCallback((conn: Connection) => {
        const startPos = getPortPosition(conn.sourceNodeId, conn.sourcePortId);
        const endPos = getPortPosition(conn.targetNodeId, conn.targetPortId);

        if (!startPos || !endPos) return null;

        const dx = endPos.x - startPos.x;
        const controlOffset = Math.min(Math.abs(dx) / 2, 100);

        const path = `M ${startPos.x} ${startPos.y} 
                  C ${startPos.x + controlOffset} ${startPos.y},
                    ${endPos.x - controlOffset} ${endPos.y},
                    ${endPos.x} ${endPos.y}`;

        const isSelected = selectedConnectionIds.has(conn.id);

        return (
            <path
                key={conn.id}
                d={path}
                className={`connection-line ${conn.type} ${isSelected ? 'selected' : ''}`}
                onClick={(e) => {
                    e.stopPropagation();
                    selectConnection(conn.id);
                }}
            />
        );
    }, [getPortPosition, selectedConnectionIds, selectConnection]);

    // Render temporary connection while dragging
    const renderTempConnection = useCallback(() => {
        if (!isConnecting || !connectingFrom) return null;

        const sources = Array.isArray(connectingFrom) ? connectingFrom : [connectingFrom];
        const endPos = screenToCanvas(mousePos);

        return (
            <>
                {sources.map((source, index) => {
                    const startPos = getPortPosition(source.nodeId, source.portId);
                    if (!startPos) return null;

                    const targetX = endPos.x;
                    const targetY = endPos.y + (index * 10);

                    const dx = targetX - startPos.x;
                    const controlOffset = Math.min(Math.abs(dx) / 2, 100);

                    const path = `M ${startPos.x} ${startPos.y} 
                              C ${startPos.x + controlOffset} ${startPos.y},
                                ${targetX - controlOffset} ${targetY},
                                ${targetX} ${targetY}`;

                    return (
                        <path
                            key={`${source.nodeId}-${source.portId}`}
                            d={path}
                            className={`connection-line technical connection-temp`}
                        />
                    );
                })}
            </>
        );
    }, [isConnecting, connectingFrom, getPortPosition, screenToCanvas, mousePos]);

    // Render selection box
    const renderSelectionBox = () => {
        if (!selectionBox) return null;

        const x = Math.min(selectionBox.startX, selectionBox.currentX);
        const y = Math.min(selectionBox.startY, selectionBox.currentY);
        const width = Math.abs(selectionBox.currentX - selectionBox.startX);
        const height = Math.abs(selectionBox.currentY - selectionBox.startY);

        return (
            <div
                className="selection-box"
                style={{
                    left: x,
                    top: y,
                    width,
                    height
                }}
            />
        );
    };

    return (
        <div
            ref={canvasRef}
            className={`node-canvas ${ghostMode ? 'ghost-mode' : ''}`}
            onContextMenu={handleContextMenu}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            onWheel={handleWheel}
            style={{ cursor: isPanning ? 'grabbing' : selectionBox ? 'crosshair' : 'default' }}
        >
            <div className="node-canvas-grid" style={{
                backgroundPosition: `${pan.x}px ${pan.y}px`,
                backgroundSize: `${20 * zoom}px ${20 * zoom}px`
            }} />

            <div
                className="node-canvas-content"
                style={{
                    transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`
                }}
            >
                {/* Connections Layer */}
                <div className="connections-layer">
                    <svg>
                        {Array.from(connections.values()).map(renderConnection)}
                        {renderTempConnection()}
                    </svg>
                </div>

                {/* Nodes Layer */}
                <div className="nodes-layer">
                    {Array.from(nodes.values()).map((node) => (
                        <NodeWrapper key={node.id} node={node} />
                    ))}
                </div>

                {/* Selection Box */}
                {renderSelectionBox()}
            </div>

            {/* Context Menu */}
            {contextMenu && (
                <ContextMenu
                    position={contextMenu}
                    onClose={() => setContextMenu(null)}
                    onAddNode={handleAddNode}
                />
            )}
        </div>
    );
}
