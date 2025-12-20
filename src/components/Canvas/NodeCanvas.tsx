/**
 * Node Canvas - Main canvas with pan/zoom, box selection, and node rendering
 */

import { useCallback, useRef, useState, useEffect, useMemo } from 'react';
import type { Position, NodeType, Connection } from '../../engine/types';
import { useGraphStore, getNodeDimensions, type NodeBounds } from '../../store/graphStore';
import { useCanvasStore } from '../../store/canvasStore';
import { useAudioStore } from '../../store/audioStore';
import { useKeybindingsStore } from '../../store/keybindingsStore';
import { useCanvasNavigationStore } from '../../store/canvasNavigationStore';
import { useUIFeedbackStore } from '../../store/uiFeedbackStore';
import { getNodeDefinition } from '../../engine/registry';
import { getPortPosition as calculatePortPosition } from '../../utils/portPositions';
import { getConnectionBundleCount } from '../../utils/portSync';
import { audioGraphManager } from '../../audio/AudioGraphManager';
import { ContextMenu } from './ContextMenu';
import { NodeWrapper } from '../Nodes/NodeWrapper';
import { LevelBreadcrumb } from '../UI/LevelBreadcrumb';
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

    // Signal levels for audio visualization (connection key -> 0-1 level)
    const [signalLevels, setSignalLevels] = useState<Map<string, number>>(new Map());

    // Subscribe to signal level updates from AudioGraphManager
    useEffect(() => {
        const unsubscribe = audioGraphManager.subscribeToSignalLevels((levels) => {
            setSignalLevels(new Map(levels));
        });
        return unsubscribe;
    }, []);

    // Canvas navigation store (simplified - just track which node we're viewing)
    const currentViewNodeId = useCanvasNavigationStore((s) => s.currentViewNodeId);
    const enterNode = useCanvasNavigationStore((s) => s.enterNode);
    const exitToParent = useCanvasNavigationStore((s) => s.exitToParent);

    // Graph store - use flat structure helpers to get nodes/connections at current view level
    const getNodesAtLevel = useGraphStore((s) => s.getNodesAtLevel);
    const getConnectionsAtLevel = useGraphStore((s) => s.getConnectionsAtLevel);
    const allNodes = useGraphStore((s) => s.nodes);
    const allConnections = useGraphStore((s) => s.connections);

    // Determine which nodes/connections to render based on current view
    const nodes = useMemo(() => {
        const nodeArray = getNodesAtLevel(currentViewNodeId);
        return new Map(nodeArray.map(n => [n.id, n]));
    }, [currentViewNodeId, getNodesAtLevel, allNodes]);

    const connections = useMemo(() => {
        const connArray = getConnectionsAtLevel(currentViewNodeId);
        return new Map(connArray.map(c => [c.id, c]));
    }, [currentViewNodeId, getConnectionsAtLevel, allConnections]);
    const addNode = useGraphStore((s) => s.addNode);
    const selectedConnectionIds = useGraphStore((s) => s.selectedConnectionIds);
    const selectConnection = useGraphStore((s) => s.selectConnection);
    const clearSelection = useGraphStore((s) => s.clearSelection);
    const deleteSelected = useGraphStore((s) => s.deleteSelected);
    const selectNodesInRect = useGraphStore((s) => s.selectNodesInRect);
    const undo = useGraphStore((s) => s.undo);
    const redo = useGraphStore((s) => s.redo);
    const copySelected = useGraphStore((s) => s.copySelected);
    const pasteClipboard = useGraphStore((s) => s.pasteClipboard);

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

    // Audio store for mode switching
    const setCurrentMode = useAudioStore((s) => s.setCurrentMode);

    const [mousePos, setMousePos] = useState<Position>({ x: 0, y: 0 });
    const lastPanPos = useRef<Position>({ x: 0, y: 0 });

    // Handle right-click context menu - just prevent default
    // Menu is shown on mouseup if no drag occurred
    const handleContextMenu = useCallback((e: React.MouseEvent) => {
        e.preventDefault();
    }, []);

    // Handle adding a node (works at all levels - just pass parentId)
    const handleAddNode = useCallback((type: NodeType, screenPos: Position) => {
        const canvasPos = screenToCanvas(screenPos);
        // With flat structure, addNode accepts parentId directly
        // null = root level, nodeId = inside that node
        addNode(type, canvasPos, currentViewNodeId);
    }, [screenToCanvas, addNode, currentViewNodeId]);

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

    // Handle wheel for zoom and two-finger trackpad pan
    const handleWheel = useCallback((e: React.WheelEvent) => {
        e.preventDefault();

        // Pinch-to-zoom gesture (ctrlKey is set by browser for pinch gestures)
        if (e.ctrlKey) {
            const delta = e.deltaY > 0 ? 0.9 : 1.1;
            const newZoom = zoom * delta;
            zoomTo(newZoom, { x: e.clientX, y: e.clientY });
            return;
        }

        // Two-finger trackpad pan - pans in all directions (horizontal, vertical, diagonal)
        // This allows natural panning with two fingers on laptop trackpads
        panBy({ x: -e.deltaX, y: -e.deltaY });
    }, [zoom, zoomTo, panBy]);

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
                // Q key - Go back up one level in hierarchical canvas (only in mode 1)
                if (e.key === 'q' || e.key === 'Q') {
                    if (currentViewNodeId !== null) {
                        e.preventDefault();
                        exitToParent();
                        return;
                    }
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

                // Ctrl+C / Cmd+C - Copy
                if ((e.ctrlKey || e.metaKey) && e.key === 'c') {
                    e.preventDefault();
                    copySelected();
                    return;
                }

                // Ctrl+V / Cmd+V - Paste
                if ((e.ctrlKey || e.metaKey) && e.key === 'v') {
                    e.preventDefault();
                    pasteClipboard();
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

                            // Get all output ports (both audio and control)
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

                // E key - Dive into selected node's internal canvas
                if (e.key === 'e' || e.key === 'E') {
                    const selectedIds = Array.from(useGraphStore.getState().selectedNodeIds);
                    if (selectedIds.length === 1) {
                        const selectedNode = allNodes.get(selectedIds[0]);
                        if (selectedNode) {
                            // Check if node can be entered via definition
                            const definition = getNodeDefinition(selectedNode.type);
                            if (definition.canEnter === false) {
                                // Flash red and reject entry
                                e.preventDefault();
                                useUIFeedbackStore.getState().flashNode(selectedNode.id);
                                return;
                            }

                            // Only enter if node has children (has internal structure)
                            if (selectedNode.childIds && selectedNode.childIds.length > 0) {
                                e.preventDefault();
                                enterNode(selectedNode.id);
                            }
                        }
                    }
                    return;
                }
            }

            // Keyboard input mode (modes 2-9)
            if (currentMode > 1) {
                const activeKeyboardId = useAudioStore.getState().activeKeyboardId;
                if (activeKeyboardId) {
                    // Handle spacebar for control signal (prevent repeat)
                    if (e.code === 'Space' && !e.repeat) {
                        e.preventDefault();
                        const emitControlDown = useAudioStore.getState().emitControlDown;
                        emitControlDown(activeKeyboardId);
                        return;
                    }

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

            // Keyboard input mode (modes 2-9) - release notes and control
            if (currentMode > 1) {
                const activeKeyboardId = useAudioStore.getState().activeKeyboardId;
                if (activeKeyboardId) {
                    // Handle spacebar for control signal
                    if (e.code === 'Space') {
                        e.preventDefault();
                        const emitControlUp = useAudioStore.getState().emitControlUp;
                        emitControlUp(activeKeyboardId);
                        return;
                    }

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
    }, [deleteSelected, toggleGhostMode, undo, redo, startConnecting, setCurrentMode, enterNode, exitToParent, allNodes, currentViewNodeId]);

    // Get port position for connection rendering
    // Uses DOM query for accurate positions, falls back to math calculation
    const getPortPosition = useCallback((nodeId: string, portId: string): Position | null => {
        // First try DOM query for actual port position (more accurate for schematic nodes)
        const portElement = document.querySelector(
            `[data-node-id="${nodeId}"][data-port-id="${portId}"]`
        ) as HTMLElement | null;

        if (portElement && canvasRef.current) {
            const canvasRect = canvasRef.current.getBoundingClientRect();
            const portRect = portElement.getBoundingClientRect();

            // Convert screen position to canvas coordinates (accounting for pan/zoom)
            const screenX = portRect.left + portRect.width / 2;
            const screenY = portRect.top + portRect.height / 2;

            // Reverse the canvas transform to get canvas coordinates
            const canvasX = (screenX - canvasRect.left - pan.x) / zoom;
            const canvasY = (screenY - canvasRect.top - pan.y) / zoom;

            return { x: canvasX, y: canvasY };
        }

        // Fall back to math-based calculation
        const node = allNodes.get(nodeId);
        if (!node) return null;
        return calculatePortPosition(node, portId);
    }, [allNodes, pan, zoom]);

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

        // Auto-detect bundle status from internal wiring
        const bundleCount = getConnectionBundleCount(conn, allNodes, allConnections);
        const isBundled = bundleCount > 1;

        // Get signal level for audio connections (for visualization)
        const connectionKey = `${conn.sourceNodeId}->${conn.targetNodeId}`;
        const signalLevel = conn.type === 'audio' ? (signalLevels.get(connectionKey) ?? 0) : 0;

        // Apply signal-based styling for audio connections
        const signalStyle = conn.type === 'audio' ? {
            '--signal-strength': signalLevel.toFixed(3)
        } as React.CSSProperties : undefined;

        return (
            <g key={conn.id}>
                <path
                    d={path}
                    className={`connection-line ${conn.type} ${isSelected ? 'selected' : ''} ${isBundled ? 'bundled' : ''}`}
                    style={signalStyle}
                    onClick={(e) => {
                        e.stopPropagation();
                        selectConnection(conn.id);
                    }}
                />
                {isBundled && (
                    <title>{`Bundle (${bundleCount} connections)`}</title>
                )}
            </g>
        );
    }, [getPortPosition, selectedConnectionIds, selectConnection, allNodes, allConnections, signalLevels]);

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
                            className={`connection-line control connection-temp`}
                        />
                    );
                })}
            </>
        );
    }, [isConnecting, connectingFrom, getPortPosition, screenToCanvas, mousePos]);

    // Calculate bounds for current level's nodes (not root)
    const getCurrentLevelBounds = useCallback((): NodeBounds | null => {
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
    }, [nodes]);

    // Visibility detection for BackToAction button
    const nodesVisibility = useMemo(() => {
        if (nodes.size === 0) return { visible: true, direction: null };

        const bounds = getCurrentLevelBounds();
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
    }, [nodes.size, pan.x, pan.y, zoom, getCurrentLevelBounds]);

    // Handle back to action navigation
    const handleBackToAction = useCallback(() => {
        const bounds = getCurrentLevelBounds();
        if (bounds) {
            fitToNodes(bounds, window.innerWidth, window.innerHeight);
        }
    }, [getCurrentLevelBounds, fitToNodes]);

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
            className={`node-canvas ${ghostMode ? 'ghost-mode' : ''} ${isConnecting ? 'is-connecting' : ''}`}
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

            {/* Level Breadcrumb - shows navigation path when inside nodes */}
            <LevelBreadcrumb />

            {/* Back to Action button - appears when nodes are not visible on any level */}
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
