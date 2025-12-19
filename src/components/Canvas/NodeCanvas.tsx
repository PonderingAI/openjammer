/**
 * Node Canvas - Main canvas with pan/zoom, box selection, and node rendering
 */

import { useCallback, useRef, useState, useEffect, useMemo } from 'react';
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

    // Right-click drag state (for pan vs context menu)
    const [rightClickStart, setRightClickStart] = useState<Position | null>(null);
    const rightClickMoved = useRef(false);
    const rightClickOnCanvas = useRef(false);

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
    const fitToNodes = useCanvasStore((s) => s.fitToNodes);
    const getNodesBounds = useGraphStore((s) => s.getNodesBounds);

    // Audio store for mode switching
    const setCurrentMode = useAudioStore((s) => s.setCurrentMode);

    const [mousePos, setMousePos] = useState<Position>({ x: 0, y: 0 });
    const lastPanPos = useRef<Position>({ x: 0, y: 0 });

    // Port position cache with TTL
    const portPositionCache = useRef<Map<string, { position: Position; timestamp: number }>>(new Map());
    const CACHE_TTL_MS = 200; // Cache valid for 200ms (increased for animation smoothness)
    const CACHE_PAN_THRESHOLD = 5; // Clear cache when pan changes by more than 5px
    const CACHE_ZOOM_THRESHOLD = 0.05; // Clear cache when zoom changes by more than 5%
    const lastPanZoom = useRef({ pan: { x: 0, y: 0 }, zoom: 1 });

    // Clear cache when pan/zoom changes significantly (in useEffect to avoid render-phase side effects)
    useEffect(() => {
        if (Math.abs(pan.x - lastPanZoom.current.pan.x) > CACHE_PAN_THRESHOLD ||
            Math.abs(pan.y - lastPanZoom.current.pan.y) > CACHE_PAN_THRESHOLD ||
            Math.abs(zoom - lastPanZoom.current.zoom) > CACHE_ZOOM_THRESHOLD) {
            portPositionCache.current.clear();
            lastPanZoom.current = { pan: { x: pan.x, y: pan.y }, zoom };
        }
    }, [pan.x, pan.y, zoom]);

    // Handle right-click context menu - just prevent default
    // Menu is shown on mouseup if no drag occurred
    const handleContextMenu = useCallback((e: React.MouseEvent) => {
        e.preventDefault();
    }, []);

    // Handle adding a node
    const handleAddNode = useCallback((type: NodeType, screenPos: Position) => {
        const canvasPos = screenToCanvas(screenPos);
        addNode(type, canvasPos);
    }, [screenToCanvas, addNode]);

    // Handle mouse down (start panning or box selection)
    const handleMouseDown = useCallback((e: React.MouseEvent) => {
        // Right mouse button - start potential pan or context menu
        if (e.button === 2) {
            e.preventDefault();
            setRightClickStart({ x: e.clientX, y: e.clientY });
            rightClickMoved.current = false;
            // Check if clicking on empty canvas (not on a node)
            const isOnNode = (e.target as HTMLElement).closest('.node, .schematic-node');
            rightClickOnCanvas.current = !isOnNode;
            return;
        }

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

        // Right-click drag panning
        if (rightClickStart) {
            const dx = e.clientX - rightClickStart.x;
            const dy = e.clientY - rightClickStart.y;

            // If moved more than threshold, it's a drag (pan the canvas)
            if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
                rightClickMoved.current = true;
                panBy({ x: dx, y: dy });
                setRightClickStart({ x: e.clientX, y: e.clientY });
            }
        }

        if (isPanning) {
            const dx = e.clientX - lastPanPos.current.x;
            const dy = e.clientY - lastPanPos.current.y;
            panBy({ x: dx, y: dy });
            lastPanPos.current = { x: e.clientX, y: e.clientY };
        }

        // Update box selection and select nodes in real-time
        if (selectionBox) {
            const canvasPos = screenToCanvas({ x: e.clientX, y: e.clientY });
            const newBox = {
                ...selectionBox,
                currentX: canvasPos.x,
                currentY: canvasPos.y
            };
            setSelectionBox(newBox);

            // Live selection - select nodes as the box changes
            const width = newBox.currentX - newBox.startX;
            const height = newBox.currentY - newBox.startY;
            if (Math.abs(width) > 5 || Math.abs(height) > 5) {
                selectNodesInRect({
                    x: Math.min(newBox.startX, newBox.currentX),
                    y: Math.min(newBox.startY, newBox.currentY),
                    width: Math.abs(width),
                    height: Math.abs(height)
                });
            }
        }
    }, [isPanning, panBy, selectionBox, screenToCanvas, rightClickStart, selectNodesInRect]);

    // Handle mouse up
    const handleMouseUp = useCallback(() => {
        setPanning(false);

        // Right-click release - show context menu if no drag
        if (rightClickStart) {
            if (!rightClickMoved.current && rightClickOnCanvas.current) {
                // Didn't drag and was on empty canvas - show context menu
                setContextMenu({ x: rightClickStart.x, y: rightClickStart.y });
            }
            setRightClickStart(null);
            rightClickMoved.current = false;
            rightClickOnCanvas.current = false;
        }

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

        // Cancel connection if mouseup happens on empty canvas (not on a valid port)
        // This runs after port mouseup handlers, so if isConnecting is still true,
        // it means the connection wasn't completed on a port
        if (isConnecting) {
            // Small delay to allow port mouseup to fire first
            setTimeout(() => {
                if (useCanvasStore.getState().isConnecting) {
                    stopConnecting();
                }
            }, 0);
        }
    }, [setPanning, selectionBox, selectNodesInRect, rightClickStart, isConnecting, stopConnecting]);

    // Handle wheel for zoom
    const handleWheel = useCallback((e: React.WheelEvent) => {
        e.preventDefault();

        const delta = e.deltaY > 0 ? 0.9 : 1.1;
        const newZoom = zoom * delta;

        zoomTo(newZoom, { x: e.clientX, y: e.clientY });
    }, [zoom, zoomTo]);

    // Keyboard row key mappings
    const ROW_KEYS: Record<number, string[]> = {
        1: ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p'],
        2: ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l'],
        3: ['z', 'x', 'c', 'v', 'b', 'n', 'm', ',', '.', '/']
    };

    // Handle keyboard shortcuts using keybindings store
    useEffect(() => {
        const { matchesAction } = useKeybindingsStore.getState();
        const { emitKeyboardSignal, releaseKeyboardSignal } = useAudioStore.getState();

        function handleKeyDown(e: KeyboardEvent) {
            // Skip if typing in input
            if ((e.target as HTMLElement).tagName === 'INPUT') return;

            // Get current mode from audio store
            const currentMode = useAudioStore.getState().currentMode;

            // 1-9 Keys - Mode switching (always works)
            const keyNum = parseInt(e.key, 10);
            if (!isNaN(keyNum) && keyNum >= 1 && keyNum <= 9) {
                e.preventDefault();
                setCurrentMode(keyNum);
                return;
            }

            // Delete/Backspace always works
            if (matchesAction(e, 'edit.delete') || e.key === 'Backspace') {
                e.preventDefault();
                deleteSelected();
                return;
            }

            // Mode 1 only shortcuts (config mode)
            if (currentMode === 1) {
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
            }

            // Keyboard input mode (modes 2-9)
            if (currentMode > 1) {
                const activeKeyboardId = useAudioStore.getState().activeKeyboardId;
                if (activeKeyboardId) {
                    // Check all three rows for the pressed key
                    const key = e.key.toLowerCase();
                    for (let row = 1; row <= 3; row++) {
                        const rowKeys = ROW_KEYS[row];
                        const keyIndex = rowKeys?.indexOf(key);

                        if (keyIndex !== -1) {
                            e.preventDefault();
                            emitKeyboardSignal(activeKeyboardId, row, keyIndex);
                            break; // Only one row can match per key
                        }
                    }
                }
            }
        }

        function handleKeyUp(e: KeyboardEvent) {
            // Skip if typing in input
            if ((e.target as HTMLElement).tagName === 'INPUT') return;

            const currentMode = useAudioStore.getState().currentMode;

            // Keyboard input mode (modes 2-9) - release notes
            if (currentMode > 1) {
                const activeKeyboardId = useAudioStore.getState().activeKeyboardId;
                if (activeKeyboardId) {
                    // Check all three rows for the released key
                    const key = e.key.toLowerCase();
                    for (let row = 1; row <= 3; row++) {
                        const rowKeys = ROW_KEYS[row];
                        const keyIndex = rowKeys?.indexOf(key);

                        if (keyIndex !== -1) {
                            e.preventDefault();
                            releaseKeyboardSignal(activeKeyboardId, row, keyIndex);
                            break; // Only one row can match per key
                        }
                    }
                }
            }
        }

        window.addEventListener('keydown', handleKeyDown);
        window.addEventListener('keyup', handleKeyUp);
        return () => {
            window.removeEventListener('keydown', handleKeyDown);
            window.removeEventListener('keyup', handleKeyUp);
        };
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

    // Visibility detection for BackToAction button
    const nodesVisibility = useMemo(() => {
        if (nodes.size === 0) return { visible: true, direction: null };

        const bounds = getNodesBounds();
        if (!bounds) return { visible: true, direction: null };

        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;

        // Convert bounds to screen coordinates
        const screenLeft = bounds.x * zoom + pan.x;
        const screenTop = bounds.y * zoom + pan.y;
        const screenRight = (bounds.x + bounds.width) * zoom + pan.x;
        const screenBottom = (bounds.y + bounds.height) * zoom + pan.y;

        // Check if any part of bounds is visible
        const visible = !(
            screenRight < 0 ||           // All nodes to the left
            screenLeft > viewportWidth || // All nodes to the right
            screenBottom < 0 ||          // All nodes above
            screenTop > viewportHeight   // All nodes below
        );

        // Check if zoomed out too far (nodes too small to see)
        const nodeScreenSize = Math.max(bounds.width, bounds.height) * zoom;
        const tooSmall = nodeScreenSize < 20;

        // Calculate direction to nodes
        let direction: number | null = null;
        if (!visible || tooSmall) {
            const centerScreenX = bounds.centerX * zoom + pan.x;
            const centerScreenY = bounds.centerY * zoom + pan.y;
            const viewCenterX = viewportWidth / 2;
            const viewCenterY = viewportHeight / 2;

            direction = Math.atan2(
                centerScreenY - viewCenterY,
                centerScreenX - viewCenterX
            ) * (180 / Math.PI);
        }

        return {
            visible: visible && !tooSmall,
            direction
        };
    }, [nodes.size, pan.x, pan.y, zoom, getNodesBounds]);

    // Handle back to action navigation
    const handleBackToAction = useCallback(() => {
        const bounds = getNodesBounds();
        if (bounds) {
            fitToNodes(bounds, window.innerWidth, window.innerHeight);
        }
    }, [getNodesBounds, fitToNodes]);

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
            style={{ cursor: isPanning || (rightClickStart && rightClickMoved.current) ? 'grabbing' : selectionBox ? 'crosshair' : 'default' }}
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

            {/* Back to Action button - appears when nodes are not visible */}
            {nodes.size > 0 && !nodesVisibility.visible && nodesVisibility.direction !== null && (
                <button
                    className="back-to-action"
                    onClick={handleBackToAction}
                    style={{ '--arrow-rotation': `${nodesVisibility.direction}deg` } as React.CSSProperties}
                >
                    <span className="back-to-action-arrow">→</span>
                    <span className="back-to-action-label">Back to nodes</span>
                </button>
            )}
        </div>
    );
}
