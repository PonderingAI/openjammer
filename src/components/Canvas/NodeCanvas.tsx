/**
 * Node Canvas - Main canvas with pan/zoom, box selection, and node rendering
 */

import { useCallback, useRef, useState, useEffect } from 'react';
import type { Position, NodeType, Connection } from '../../engine/types';
import { useGraphStore } from '../../store/graphStore';
import { useCanvasStore } from '../../store/canvasStore';
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

    const [mousePos, setMousePos] = useState<Position>({ x: 0, y: 0 });
    const lastPanPos = useRef<Position>({ x: 0, y: 0 });

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
        if (e.button === 0 && !(e.target as HTMLElement).closest('.node, .port')) {
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

    // Handle keyboard shortcuts
    useEffect(() => {
        function handleKeyDown(e: KeyboardEvent) {
            // Skip if typing in input
            if ((e.target as HTMLElement).tagName === 'INPUT') return;

            // Delete/Backspace - delete selected
            if (e.key === 'Delete' || e.key === 'Backspace') {
                e.preventDefault();
                deleteSelected();
            }

            // Ghost Mode toggle with W key
            if (e.key === 'w' || e.key === 'W') {
                e.preventDefault();
                toggleGhostMode();
            }

            // Ctrl+Z - Undo
            if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
                e.preventDefault();
                undo();
            }

            // Ctrl+Y or Ctrl+Shift+Z - Redo
            if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
                e.preventDefault();
                redo();
            }

            // 'A' Key - Multi-connect from selected node
            if ((e.key === 'a' || e.key === 'A') && !e.ctrlKey && !e.metaKey && !e.altKey) {
                // Get selected node
                const selectedIds = useGraphStore.getState().selectedNodeIds;
                if (selectedIds.size === 1) {
                    e.preventDefault();
                    const nodeId = Array.from(selectedIds)[0];
                    const node = useGraphStore.getState().nodes.get(nodeId);

                    if (node) {
                        // Get all output ports
                        const outputPorts = node.ports
                            .filter(p => p.direction === 'output' && p.type === 'technical') // Restrict to technical for now?
                            .map(p => p.id);

                        if (outputPorts.length > 0) {
                            startConnecting(nodeId, outputPorts);
                        }
                    }
                }
            }
        }

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [deleteSelected, toggleGhostMode, undo, redo, startConnecting]);

    // Get port position for connection rendering
    const getPortPosition = useCallback((nodeId: string, portId: string): Position | null => {
        const node = nodes.get(nodeId);
        if (!node) return null;

        const port = node.ports.find(p => p.id === portId);
        if (!port) return null;

        const portIndex = node.ports
            .filter(p => p.direction === port.direction)
            .indexOf(port);

        const x = port.direction === 'input' ? node.position.x : node.position.x + 200;
        const y = node.position.y + 36 + 24 + portIndex * 24;

        return { x, y };
    }, [nodes]);

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
