/**
 * Sampler Node - OUTSIDE view (simple schematic)
 *
 * Design: Compact schematic node similar to InstrumentNode
 * Shows sample name (clickable), bundle input rows, sample input port, and audio output port.
 *
 * The detailed controls (waveform, ADSR, root note, loop settings) are shown
 * in the INSIDE view when pressing E (SamplerVisualNode).
 */

import { useCallback, useRef, useState, useEffect, useMemo, memo } from 'react';
import type { GraphNode, SamplerNodeData, InstrumentRow } from '../../engine/types';
import { useGraphStore } from '../../store/graphStore';
import { useSampleLibraryStore, type LibrarySample } from '../../store/sampleLibraryStore';

interface SamplerNodeProps {
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
    isHoveredWithConnections?: boolean;
    incomingConnectionCount?: number;
    style?: React.CSSProperties;
}

// ============================================================================
// Constants
// ============================================================================

/** Musical note names for row display */
const ROW_NOTE_NAMES = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];

/** Row parameter value ranges */
const ROW_PARAM_RANGES = {
    NOTE: { min: 0, max: 6 },
    OCTAVE: { min: 0, max: 8 },
    OFFSET: { min: -24, max: 24 },
} as const;

/** Minimum mouse movement before treating interaction as drag */
const DRAG_THRESHOLD_PX = 5;

/** Dropdown positioning constraints */
const DROPDOWN_LAYOUT = {
    HEADER_HEIGHT: 36,
    MAX_WIDTH_RATIO: 0.5,    // 50% of viewport
    MAX_WIDTH_PX: 600,
    MAX_HEIGHT_RATIO: 0.4,   // 40% of viewport
    MAX_HEIGHT_PX: 400,
    MIN_HEIGHT_PX: 150,
    MIN_WIDTH_PX: 250,
    EDGE_PADDING_PX: 10,
} as const;

/**
 * Type guard for SamplerNodeData
 */
function isSamplerNodeData(data: unknown): data is SamplerNodeData {
    if (typeof data !== 'object' || data === null) return false;
    const d = data as Record<string, unknown>;
    return typeof d.rootNote === 'number' || d.rootNote === undefined;
}

export const SamplerNode = memo(function SamplerNode({
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
    isHoveredWithConnections,
    style
}: SamplerNodeProps) {
    const data: SamplerNodeData = isSamplerNodeData(node.data)
        ? node.data as SamplerNodeData
        : {
            sampleId: null,
            sampleName: 'No sample',
            rootNote: 60,
            attack: 0.01,
            decay: 0.1,
            sustain: 0.8,
            release: 0.3,
            velocityCurve: 'exponential',
            triggerMode: 'gate',
            loopEnabled: false,
            loopStart: 0,
            loopEnd: 0,
            maxVoices: 16,
            activePreset: 'chromatic'
        };

    const updateNodeData = useGraphStore((s) => s.updateNodeData);
    const nodeRef = useRef<HTMLDivElement>(null);

    // Drag state for click vs drag detection
    const [dragStartPos, setDragStartPos] = useState<{x: number, y: number} | null>(null);
    const [wasDragging, setWasDragging] = useState(false);

    // Sample picker popup state
    const [showPopup, setShowPopup] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [dropdownStyle, setDropdownStyle] = useState<React.CSSProperties>({});

    // Sample library access
    const samples = useSampleLibraryStore((s) => s.samples);

    // Get rows data (for keyboard bundle connections)
    const rows: InstrumentRow[] = data.rows || [];

    // Get ports
    const outputPort = node.ports.find(p => p.direction === 'output');
    const samplePort = node.ports.find(p => p.id === 'sample-in');
    const keyInputPort = node.ports.find(p => p.id === 'input-1');

    // Display name - show sample name or "Sampler"
    const displayName = data.sampleName && data.sampleName !== 'No sample'
        ? data.sampleName
        : 'Sampler';

    // Track mouse movement to detect dragging
    useEffect(() => {
        if (!dragStartPos) return;

        const handleMouseMove = (e: MouseEvent) => {
            const distance = Math.sqrt(
                Math.pow(e.clientX - dragStartPos.x, 2) +
                Math.pow(e.clientY - dragStartPos.y, 2)
            );
            if (distance > DRAG_THRESHOLD_PX) {
                setWasDragging(true);
            }
        };

        const handleMouseUp = () => {
            setDragStartPos(null);
        };

        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mouseup', handleMouseUp);
        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        };
    }, [dragStartPos]);

    // Handle header mouse down
    const handleHeaderMouseDownLocal = (e: React.MouseEvent) => {
        setDragStartPos({ x: e.clientX, y: e.clientY });
        setWasDragging(false);
        handleHeaderMouseDown?.(e);
    };

    // Handle sample name click - opens sample picker popup
    const handleSampleNameClick = (e: React.MouseEvent) => {
        if (isDragging || wasDragging) {
            setWasDragging(false);
            setDragStartPos(null);
            return;
        }

        if (dragStartPos) {
            const distance = Math.sqrt(
                Math.pow(e.clientX - dragStartPos.x, 2) +
                Math.pow(e.clientY - dragStartPos.y, 2)
            );
            if (distance > DRAG_THRESHOLD_PX) {
                setDragStartPos(null);
                setWasDragging(true);
                return;
            }
        }

        e.stopPropagation();
        setShowPopup(true);
        setSearchQuery('');
        setDragStartPos(null);
    };

    // Filter samples by search query
    const filteredSamples = useMemo(() => {
        const allSamples = Object.values(samples);
        if (!searchQuery.trim()) {
            // Return first 50 samples when no search
            return allSamples.slice(0, 50);
        }
        const query = searchQuery.toLowerCase();
        return allSamples
            .filter(s => s.fileName.toLowerCase().includes(query))
            .slice(0, 50);
    }, [samples, searchQuery]);

    // Handle keyboard shortcuts for popup
    useEffect(() => {
        if (!showPopup) return;

        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                e.preventDefault();
                setShowPopup(false);
                setSearchQuery('');
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [showPopup]);

    // Click outside to close popup
    useEffect(() => {
        if (!showPopup) return;

        const handleClickOutside = (e: MouseEvent) => {
            const dropdown = document.querySelector('.sampler-selector-dropdown');
            if (dropdown && !dropdown.contains(e.target as Node)) {
                setShowPopup(false);
                setSearchQuery('');
            }
        };

        const timeoutId = setTimeout(() => {
            document.addEventListener('mousedown', handleClickOutside);
        }, 0);

        return () => {
            clearTimeout(timeoutId);
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [showPopup]);

    // Dynamic dropdown positioning
    useEffect(() => {
        if (!showPopup || !nodeRef.current) return;

        const updateDropdownPosition = () => {
            if (!nodeRef.current) return;

            const nodeRect = nodeRef.current.getBoundingClientRect();
            const viewportHeight = window.innerHeight;
            const viewportWidth = window.innerWidth;

            const spaceBelow = viewportHeight - (nodeRect.top + DROPDOWN_LAYOUT.HEADER_HEIGHT);
            const desiredWidth = Math.min(
                viewportWidth * DROPDOWN_LAYOUT.MAX_WIDTH_RATIO,
                DROPDOWN_LAYOUT.MAX_WIDTH_PX
            );
            const desiredHeight = Math.min(
                viewportHeight * DROPDOWN_LAYOUT.MAX_HEIGHT_RATIO,
                DROPDOWN_LAYOUT.MAX_HEIGHT_PX
            );

            const actualHeight = Math.max(0, Math.min(
                desiredHeight,
                spaceBelow - DROPDOWN_LAYOUT.EDGE_PADDING_PX
            ));

            if (actualHeight < DROPDOWN_LAYOUT.MIN_HEIGHT_PX) {
                setDropdownStyle({ display: 'none' });
                return;
            }

            const actualWidth = Math.max(DROPDOWN_LAYOUT.MIN_WIDTH_PX, desiredWidth);
            const leftOffset = (nodeRect.width - actualWidth) / 2;

            setDropdownStyle({
                display: 'flex',
                top: DROPDOWN_LAYOUT.HEADER_HEIGHT,
                left: leftOffset,
                width: actualWidth,
                height: actualHeight,
            });
        };

        updateDropdownPosition();

        window.addEventListener('resize', updateDropdownPosition);
        const resizeObserver = new ResizeObserver(() => updateDropdownPosition());
        resizeObserver.observe(nodeRef.current);

        return () => {
            window.removeEventListener('resize', updateDropdownPosition);
            resizeObserver.disconnect();
        };
    }, [showPopup]);

    // Handle sample selection
    const handleSampleSelect = useCallback((sample: LibrarySample) => {
        updateNodeData(node.id, {
            sampleId: sample.id,
            sampleName: sample.fileName
        });
        setShowPopup(false);
        setSearchQuery('');
    }, [node.id, updateNodeData]);

    // Update row field - memoized
    const updateRowField = useCallback((rowId: string, field: keyof InstrumentRow, value: number) => {
        const currentRows = data.rows || [];
        const updatedRows = currentRows.map(row => {
            if (row.rowId === rowId) {
                return { ...row, [field]: value };
            }
            return row;
        });
        updateNodeData(node.id, { rows: updatedRows });
    }, [data.rows, node.id, updateNodeData]);

    // Handle wheel on row control
    const handleRowWheel = useCallback((rowId: string, field: keyof InstrumentRow, e: React.WheelEvent, min: number, max: number) => {
        e.stopPropagation();
        const row = rows.find(r => r.rowId === rowId);
        if (!row) return;

        const currentValue = row[field] as number;
        const delta = e.deltaY > 0 ? -1 : 1;
        const step = field === 'spread' ? 0.1 : 1;
        const newValue = Math.max(min, Math.min(max, currentValue + delta * step));
        updateRowField(rowId, field, newValue);
    }, [rows, updateRowField]);

    return (
        <div
            ref={nodeRef}
            className={`sampler-node schematic-node ${isSelected ? 'selected' : ''} ${isDragging ? 'dragging' : ''} ${isHoveredWithConnections ? 'hover-connecting' : ''}`}
            style={style}
            onMouseEnter={handleNodeMouseEnter}
            onMouseLeave={handleNodeMouseLeave}
        >
            {/* Header */}
            <div
                className="schematic-header"
                onMouseDown={handleHeaderMouseDownLocal}
            >
                <span
                    className="schematic-title sampler-name-clickable"
                    onClick={handleSampleNameClick}
                    title={data.sampleName || 'No sample loaded'}
                >
                    {displayName}
                </span>
            </div>

            {/* Main body - clean row layout matching InstrumentNode */}
            <div className="sampler-schematic-body simple">
                {/* Rows container */}
                <div className="sampler-rows-simple">
                    {rows.length === 0 ? (
                        /* Empty state - show available input port */
                        keyInputPort && (
                            <div className="sampler-row-simple empty-state">
                                <div
                                    className="bundle-input-port empty"
                                    data-node-id={node.id}
                                    data-port-id={keyInputPort.id}
                                    onMouseDown={(e) => handlePortMouseDown?.(keyInputPort.id, e)}
                                    onMouseUp={(e) => handlePortMouseUp?.(keyInputPort.id, e)}
                                    onMouseEnter={() => handlePortMouseEnter?.(keyInputPort.id)}
                                    onMouseLeave={handlePortMouseLeave}
                                    title="Connect keyboard bundle"
                                />
                            </div>
                        )
                    ) : (
                        /* Show rows with connections */
                        <>
                            {rows.map((row, index) => {
                                const rowPort = node.ports.find(p => p.id === row.targetPortId);
                                const isPedal = row.portCount === 1;

                                return (
                                    <div key={row.rowId} className={`sampler-row-simple ${index > 0 ? 'with-divider' : ''} ${isPedal ? 'pedal-row' : ''}`}>
                                        {/* Input port for this row's bundle */}
                                        <div
                                            className={`bundle-input-port ${isPedal ? 'pedal' : ''} ${rowPort && hasConnection?.(rowPort.id) ? 'connected' : ''}`}
                                            data-node-id={node.id}
                                            data-port-id={rowPort?.id || 'bundle-in'}
                                            onMouseDown={(e) => handlePortMouseDown?.(rowPort?.id || 'bundle-in', e)}
                                            onMouseUp={(e) => handlePortMouseUp?.(rowPort?.id || 'bundle-in', e)}
                                            onMouseEnter={() => handlePortMouseEnter?.(rowPort?.id || 'bundle-in')}
                                            onMouseLeave={handlePortMouseLeave}
                                            title={row.label || 'Bundle input'}
                                        />

                                        {isPedal ? (
                                            /* Pedal row - just show label */
                                            <span className="pedal-label">Pedal</span>
                                        ) : (
                                            /* Key row - show Note, Octave, Offset */
                                            <>
                                                <span
                                                    className="row-value note-value editable-value"
                                                    onWheel={(e) => handleRowWheel(row.rowId, 'baseNote', e, ROW_PARAM_RANGES.NOTE.min, ROW_PARAM_RANGES.NOTE.max)}
                                                    title="Note (C-B) - scroll to change"
                                                >
                                                    {ROW_NOTE_NAMES[row.baseNote] || 'C'}
                                                </span>
                                                <span
                                                    className="row-value octave-value editable-value"
                                                    onWheel={(e) => handleRowWheel(row.rowId, 'baseOctave', e, ROW_PARAM_RANGES.OCTAVE.min, ROW_PARAM_RANGES.OCTAVE.max)}
                                                    title="Octave - scroll to change"
                                                >
                                                    {row.baseOctave}
                                                </span>
                                                <span
                                                    className="row-value offset-value editable-value"
                                                    onWheel={(e) => handleRowWheel(row.rowId, 'baseOffset', e, ROW_PARAM_RANGES.OFFSET.min, ROW_PARAM_RANGES.OFFSET.max)}
                                                    title="Offset - scroll to change"
                                                >
                                                    {row.baseOffset >= 0 ? `+${row.baseOffset}` : row.baseOffset}
                                                </span>
                                            </>
                                        )}
                                    </div>
                                );
                            })}
                            {/* Empty row for adding new connections */}
                            {(() => {
                                const connectedPorts = new Set(rows.map(r => r.targetPortId));
                                const availablePort = node.ports.find(p =>
                                    p.direction === 'input' &&
                                    p.type === 'control' &&
                                    !connectedPorts.has(p.id)
                                );
                                if (!availablePort) return null;

                                return (
                                    <div className="sampler-row-simple empty-row with-divider">
                                        <div
                                            className="bundle-input-port empty"
                                            data-node-id={node.id}
                                            data-port-id={availablePort.id}
                                            onMouseDown={(e) => handlePortMouseDown?.(availablePort.id, e)}
                                            onMouseUp={(e) => handlePortMouseUp?.(availablePort.id, e)}
                                            onMouseEnter={() => handlePortMouseEnter?.(availablePort.id)}
                                            onMouseLeave={handlePortMouseLeave}
                                            title="Connect keyboard bundle"
                                        />
                                    </div>
                                );
                            })()}
                        </>
                    )}
                </div>

                {/* Sample input port */}
                {samplePort && (
                    <div
                        className={`sampler-sample-port ${hasConnection?.(samplePort.id) ? 'connected' : ''}`}
                        data-node-id={node.id}
                        data-port-id={samplePort.id}
                        onMouseDown={(e) => handlePortMouseDown?.(samplePort.id, e)}
                        onMouseUp={(e) => handlePortMouseUp?.(samplePort.id, e)}
                        onMouseEnter={() => handlePortMouseEnter?.(samplePort.id)}
                        onMouseLeave={handlePortMouseLeave}
                        title="Sample input (from Library or Looper)"
                    >
                        <span className="port-label">Sample</span>
                    </div>
                )}

                {/* Output port */}
                {outputPort && (
                    <div
                        className={`sampler-output-port ${hasConnection?.(outputPort.id) ? 'connected' : ''}`}
                        data-node-id={node.id}
                        data-port-id={outputPort.id}
                        onMouseDown={(e) => handlePortMouseDown?.(outputPort.id, e)}
                        onMouseUp={(e) => handlePortMouseUp?.(outputPort.id, e)}
                        onMouseEnter={() => handlePortMouseEnter?.(outputPort.id)}
                        onMouseLeave={handlePortMouseLeave}
                        title="Audio output"
                    />
                )}
            </div>

            {/* Sample Selector Dropdown */}
            {showPopup && (
                <div
                    className="sampler-selector-dropdown"
                    style={dropdownStyle}
                    onClick={(e) => e.stopPropagation()}
                    onWheel={(e) => e.stopPropagation()}
                >
                    <input
                        className="sampler-search"
                        type="text"
                        placeholder="Search samples..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        autoFocus
                    />
                    <div
                        className="sampler-grid-container"
                        onWheel={(e) => e.stopPropagation()}
                    >
                        {filteredSamples.length > 0 ? (
                            <div className="sampler-grid">
                                {filteredSamples.map(sample => (
                                    <div
                                        key={sample.id}
                                        className={`sampler-item ${data.sampleId === sample.id ? 'selected' : ''}`}
                                        onClick={() => handleSampleSelect(sample)}
                                        title={sample.relativePath}
                                    >
                                        <div className="sampler-item-name">{sample.fileName}</div>
                                        <div className="sampler-item-info">
                                            {sample.duration ? `${sample.duration.toFixed(1)}s` : ''}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="no-samples">
                                {Object.keys(samples).length === 0
                                    ? 'No sample libraries linked. Add a Library node first.'
                                    : 'No samples found'}
                            </div>
                        )}
                    </div>
                    <div className="sampler-dropdown-hint">
                        Click sample to load | Esc to close
                    </div>
                </div>
            )}
        </div>
    );
});

export default SamplerNode;
