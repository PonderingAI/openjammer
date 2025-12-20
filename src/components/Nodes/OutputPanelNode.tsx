/**
 * Output Panel Node - Multi-port output panel with editable labels
 *
 * Used inside hierarchical nodes to provide multiple named output ports
 * Each port can be renamed by clicking on the label
 */

import { useState, useCallback } from 'react';
import type { GraphNode } from '../../engine/types';
import { useGraphStore } from '../../store/graphStore';
import { useUIFeedbackStore } from '../../store/uiFeedbackStore';
import './SchematicNodes.css';

interface OutputPanelNodeProps {
    node: GraphNode;
    handlePortMouseDown?: (portId: string, e: React.MouseEvent) => void;
    handlePortMouseUp?: (portId: string, e: React.MouseEvent) => void;
    handlePortMouseEnter?: (portId: string) => void;
    handlePortMouseLeave?: () => void;
    hasConnection?: (portId: string) => boolean;
    handleHeaderMouseDown?: (e: React.MouseEvent) => void;
    handleNodeMouseEnter?: () => void;
    handleNodeMouseLeave?: () => void;
    isSelected?: boolean;
    isDragging?: boolean;
    style?: React.CSSProperties;
}

export function OutputPanelNode({
    node,
    handlePortMouseDown,
    handlePortMouseUp,
    handlePortMouseEnter,
    handlePortMouseLeave,
    hasConnection,
    handleHeaderMouseDown,
    handleNodeMouseEnter,
    handleNodeMouseLeave,
    isSelected,
    isDragging,
    style
}: OutputPanelNodeProps) {
    const [editingPort, setEditingPort] = useState<string | null>(null);
    const [editValue, setEditValue] = useState('');

    const updateNodeData = useGraphStore((s) => s.updateNodeData);
    const updateNodePorts = useGraphStore((s) => s.updateNodePorts);
    const flashingNodes = useUIFeedbackStore((s) => s.flashingNodes);
    const isFlashing = flashingNodes.has(node.id);

    // Get port labels from node data
    const portLabels = (node.data.portLabels as Record<string, string>) || {};

    // Get input ports (these become output ports on the parent)
    const inputPorts = node.ports.filter(p => p.direction === 'input');

    // Start editing a port label
    const handleLabelClick = useCallback((portId: string, currentLabel: string, e: React.MouseEvent) => {
        e.stopPropagation();
        setEditingPort(portId);
        setEditValue(currentLabel);
    }, []);

    // Save the edited label
    const handleLabelSave = useCallback((portId: string) => {
        const newLabels = { ...portLabels, [portId]: editValue || `Port ${portId}` };

        // Update node data with new labels
        updateNodeData(node.id, { portLabels: newLabels });

        // Also update the port name in the ports array
        const newPorts = node.ports.map(p =>
            p.id === portId ? { ...p, name: editValue || p.name } : p
        );
        updateNodePorts(node.id, newPorts);

        setEditingPort(null);
        setEditValue('');
    }, [node.id, node.ports, portLabels, editValue, updateNodeData, updateNodePorts]);

    // Handle keyboard events in edit mode
    const handleKeyDown = useCallback((portId: string, e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            handleLabelSave(portId);
        } else if (e.key === 'Escape') {
            setEditingPort(null);
            setEditValue('');
        }
    }, [handleLabelSave]);

    return (
        <div
            className={`output-panel-node schematic-node ${isSelected ? 'selected' : ''} ${isDragging ? 'dragging' : ''} ${isFlashing ? 'flashing' : ''}`}
            style={style}
            onMouseEnter={handleNodeMouseEnter}
            onMouseLeave={handleNodeMouseLeave}
        >
            {/* Header */}
            <div
                className="schematic-header output-panel-header"
                onMouseDown={handleHeaderMouseDown}
            >
                <span className="schematic-title">Outputs</span>
            </div>

            {/* Port List */}
            <div className="output-panel-body">
                {inputPorts.map((port) => {
                    const label = portLabels[port.id] || port.name;
                    const isEditing = editingPort === port.id;
                    const isConnected = hasConnection?.(port.id);

                    return (
                        <div key={port.id} className="output-panel-port-row">
                            {/* Port marker on left */}
                            <div
                                className={`output-panel-port-marker control-port input-port ${isConnected ? 'connected' : ''}`}
                                data-node-id={node.id}
                                data-port-id={port.id}
                                data-port-type="control"
                                onMouseDown={(e) => handlePortMouseDown?.(port.id, e)}
                                onMouseUp={(e) => handlePortMouseUp?.(port.id, e)}
                                onMouseEnter={() => handlePortMouseEnter?.(port.id)}
                                onMouseLeave={handlePortMouseLeave}
                            />

                            {/* Label (editable) */}
                            {isEditing ? (
                                <input
                                    type="text"
                                    className="output-panel-label-input"
                                    value={editValue}
                                    onChange={(e) => setEditValue(e.target.value)}
                                    onBlur={() => handleLabelSave(port.id)}
                                    onKeyDown={(e) => handleKeyDown(port.id, e)}
                                    autoFocus
                                />
                            ) : (
                                <span
                                    className="output-panel-label"
                                    onClick={(e) => handleLabelClick(port.id, label, e)}
                                    title="Click to rename"
                                >
                                    {label}
                                </span>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
