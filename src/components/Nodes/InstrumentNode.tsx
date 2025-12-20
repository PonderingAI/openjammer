/**
 * Instrument Node - Virtual instrument with row-based bundle inputs
 *
 * Design: Hand-drawn schematic with clickable instrument name to open selector dropdown
 * Shows row-based note grid with spread control - each bundle connection creates a row
 */

import { useState, useEffect, useRef, useMemo } from 'react';
import type { GraphNode, InstrumentNodeData, InstrumentRow } from '../../engine/types';
import { useGraphStore } from '../../store/graphStore';
import { useAudioStore } from '../../store/audioStore';
import { nodeDefinitions } from '../../engine/registry';
import { InstrumentLoader } from '../../audio/Instruments';

interface InstrumentNodeProps {
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

// Constants
const NOTE_NAMES = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
const DRAG_THRESHOLD_PX = 5;

// Build instrument labels from loader
const INSTRUMENT_LABELS: Record<string, string> = {};
InstrumentLoader.getAllDefinitions().forEach(def => {
    INSTRUMENT_LABELS[def.id] = def.name;
});
// Add legacy labels for backwards compatibility
INSTRUMENT_LABELS['piano'] = 'Grand Piano';
INSTRUMENT_LABELS['cello'] = 'Cello';
INSTRUMENT_LABELS['electricCello'] = 'Cello';
INSTRUMENT_LABELS['violin'] = 'Violin';
INSTRUMENT_LABELS['saxophone'] = 'Alto Saxophone';
INSTRUMENT_LABELS['strings'] = 'Strings';
INSTRUMENT_LABELS['keys'] = 'Keys';
INSTRUMENT_LABELS['winds'] = 'Winds';

// Map node types to allowed instrument categories
const NODE_TYPE_TO_CATEGORIES: Record<string, string[]> = {
    'strings': ['strings', 'bass'],
    'cello': ['strings'],
    'violin': ['strings'],
    'keys': ['piano'],
    'piano': ['piano'],
    'winds': ['woodwinds', 'brass', 'world'],
    'saxophone': ['woodwinds', 'brass'],
    'guitar': ['guitar', 'bass'],
    'instrument': ['piano', 'strings', 'guitar', 'bass', 'woodwinds', 'brass', 'synth', 'percussion', 'world']
};

// Get allowed categories for current node type
function getAllowedCategories(nodeType: string): string[] {
    return NODE_TYPE_TO_CATEGORIES[nodeType] || ['piano'];
}

// Main instrument node types to cycle through
const INSTRUMENT_NODE_TYPES = ['strings', 'keys', 'winds'] as const;

// SVG Icons - keeping the icon definitions (abbreviated for brevity)
const InstrumentIcons: Record<string, React.ReactNode> = {
    piano: (
        <svg viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M8 48 L8 24 Q8 16 16 16 L48 16 Q56 16 56 24 L56 48" strokeLinecap="round" />
            <line x1="8" y1="48" x2="56" y2="48" />
            <rect x="12" y="32" width="6" height="16" fill="currentColor" opacity="0.1" />
            <rect x="20" y="32" width="6" height="16" fill="currentColor" opacity="0.1" />
            <rect x="28" y="32" width="6" height="16" fill="currentColor" opacity="0.1" />
            <rect x="36" y="32" width="6" height="16" fill="currentColor" opacity="0.1" />
            <rect x="44" y="32" width="6" height="16" fill="currentColor" opacity="0.1" />
            <rect x="16" y="32" width="4" height="10" fill="currentColor" />
            <rect x="24" y="32" width="4" height="10" fill="currentColor" />
            <rect x="40" y="32" width="4" height="10" fill="currentColor" />
            <rect x="48" y="32" width="4" height="10" fill="currentColor" />
        </svg>
    ),
    keys: (
        <svg viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="8" y="20" width="48" height="28" rx="3" />
            <line x1="16" y1="28" x2="16" y2="44" />
            <line x1="24" y1="28" x2="24" y2="44" />
            <line x1="32" y1="28" x2="32" y2="44" />
            <line x1="40" y1="28" x2="40" y2="44" />
            <line x1="48" y1="28" x2="48" y2="44" />
            <rect x="13" y="28" width="3" height="8" fill="currentColor" />
            <rect x="21" y="28" width="3" height="8" fill="currentColor" />
            <rect x="37" y="28" width="3" height="8" fill="currentColor" />
            <rect x="45" y="28" width="3" height="8" fill="currentColor" />
            <circle cx="20" cy="16" r="2" fill="currentColor" />
            <circle cx="32" cy="16" r="2" fill="currentColor" />
            <circle cx="44" cy="16" r="2" fill="currentColor" />
        </svg>
    ),
    strings: (
        <svg viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M16 52 L16 16 Q16 8 24 8 L44 8" strokeLinecap="round" />
            <path d="M44 8 Q52 8 52 16 L52 52" strokeLinecap="round" />
            <line x1="16" y1="52" x2="52" y2="52" />
            <line x1="22" y1="14" x2="22" y2="52" strokeWidth="1" />
            <line x1="28" y1="12" x2="28" y2="52" strokeWidth="1" />
            <line x1="34" y1="10" x2="34" y2="52" strokeWidth="1" />
            <line x1="40" y1="12" x2="40" y2="52" strokeWidth="1" />
            <line x1="46" y1="14" x2="46" y2="52" strokeWidth="1" />
        </svg>
    ),
    winds: (
        <svg viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="8" y="28" width="48" height="8" rx="4" />
            <circle cx="18" cy="32" r="2" fill="currentColor" />
            <circle cx="28" cy="32" r="2" fill="currentColor" />
            <circle cx="38" cy="32" r="2" fill="currentColor" />
            <circle cx="48" cy="32" r="2" fill="currentColor" />
            <path d="M56 32 L60 30 L60 34 Z" fill="currentColor" />
        </svg>
    ),
};

// Helper function to get the appropriate icon for an instrument
function getInstrumentIcon(instrumentId: string): React.ReactNode {
    if (InstrumentIcons[instrumentId]) {
        return InstrumentIcons[instrumentId];
    }
    const definition = InstrumentLoader.getDefinition(instrumentId);
    if (definition?.category && InstrumentIcons[definition.category]) {
        return InstrumentIcons[definition.category];
    }
    return InstrumentIcons.piano;
}

export function InstrumentNode({
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
}: InstrumentNodeProps) {
    const data = node.data as unknown as InstrumentNodeData;
    const updateNodeData = useGraphStore((s) => s.updateNodeData);
    const updateNodeType = useGraphStore((s) => s.updateNodeType);
    const isAudioContextReady = useAudioStore((s) => s.isAudioContextReady);

    // Refs
    const nodeRef = useRef<HTMLDivElement>(null);

    // Popup state
    const [showPopup, setShowPopup] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [dropdownStyle, setDropdownStyle] = useState<React.CSSProperties>({});

    // Drag state
    const [dragStartPos, setDragStartPos] = useState<{x: number, y: number} | null>(null);
    const [wasDragging, setWasDragging] = useState(false);

    // Get available categories for this node type
    const availableCategories = useMemo(() => {
        return getAllowedCategories(node.type);
    }, [node.type]);

    // Initialize instrument audio - managed by AudioGraphManager
    useEffect(() => {
        // AudioGraphManager handles instrument creation
    }, [isAudioContextReady, node.type]);

    // Handle keyboard shortcuts for popup
    useEffect(() => {
        if (!showPopup) return;

        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                e.preventDefault();
                setShowPopup(false);
                setSearchQuery('');
            } else if (e.ctrlKey && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
                e.preventDefault();
                const currentIndex = INSTRUMENT_NODE_TYPES.indexOf(node.type as typeof INSTRUMENT_NODE_TYPES[number]);
                const validIndex = currentIndex >= 0 ? currentIndex : 0;
                let newIndex: number;
                if (e.key === 'ArrowRight') {
                    newIndex = (validIndex + 1) % INSTRUMENT_NODE_TYPES.length;
                } else {
                    newIndex = (validIndex - 1 + INSTRUMENT_NODE_TYPES.length) % INSTRUMENT_NODE_TYPES.length;
                }
                const newType = INSTRUMENT_NODE_TYPES[newIndex];
                updateNodeType(node.id, newType);
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [showPopup, node.type, node.id, updateNodeType]);

    // Click outside to close popup
    useEffect(() => {
        if (!showPopup) return;

        const handleClickOutside = (e: MouseEvent) => {
            const dropdown = document.querySelector('.instrument-selector-dropdown');
            if (dropdown && !dropdown.contains(e.target as Node)) {
                setShowPopup(false);
                setSearchQuery('');
            }
        };

        setTimeout(() => {
            document.addEventListener('mousedown', handleClickOutside);
        }, 0);

        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [showPopup]);

    // Dynamic dropdown positioning
    useEffect(() => {
        if (!showPopup || !nodeRef.current) return;

        const updateDropdownPosition = () => {
            if (!nodeRef.current) return;

            const nodeRect = nodeRef.current.getBoundingClientRect();
            const headerHeight = 36;
            const viewportHeight = window.innerHeight;
            const viewportWidth = window.innerWidth;

            const spaceBelow = viewportHeight - (nodeRect.top + headerHeight);
            const desiredWidth = Math.min(viewportWidth * 0.5, 800);
            const desiredHeight = Math.min(viewportHeight * 0.4, 600);
            const minHeight = 150;
            const minWidth = 250;

            const actualHeight = Math.max(0, Math.min(desiredHeight, spaceBelow - 10));

            if (actualHeight < minHeight) {
                setDropdownStyle({ display: 'none' });
                return;
            }

            const actualWidth = Math.max(minWidth, desiredWidth);
            const leftOffset = (nodeRect.width - actualWidth) / 2;

            setDropdownStyle({
                display: 'flex',
                top: headerHeight,
                left: leftOffset,
                width: actualWidth,
                height: actualHeight,
            });
        };

        updateDropdownPosition();

        window.addEventListener('resize', updateDropdownPosition);
        const resizeObserver = new ResizeObserver(() => updateDropdownPosition());
        resizeObserver.observe(nodeRef.current);

        const intervalId = window.setInterval(updateDropdownPosition, 100);

        return () => {
            window.removeEventListener('resize', updateDropdownPosition);
            resizeObserver.disconnect();
            clearInterval(intervalId);
        };
    }, [showPopup]);

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

    // Get rows data
    const rows: InstrumentRow[] = data.rows || [];

    // Get output port from the node
    const outputPort = node.ports.find(p => p.direction === 'output' && p.type === 'audio');

    // Get display name
    const instrumentData = node.data as InstrumentNodeData;
    const instrumentId = instrumentData.instrumentId || node.type;
    const displayName = INSTRUMENT_LABELS[instrumentId] || nodeDefinitions[node.type]?.name || 'Instrument';

    // Filter instruments by node type
    const filteredInstruments = useMemo(() => {
        let instruments: string[] = [];
        availableCategories.forEach(category => {
            const categoryInstruments = InstrumentLoader.getDefinitionsByCategory(category as Parameters<typeof InstrumentLoader.getDefinitionsByCategory>[0]);
            instruments.push(...categoryInstruments.map(def => def.id));
        });

        const query = searchQuery.toLowerCase().trim();
        if (query) {
            instruments = instruments.filter(id =>
                INSTRUMENT_LABELS[id]?.toLowerCase().includes(query)
            );
        }

        return instruments;
    }, [searchQuery, availableCategories]);

    // Group instruments by their base name
    const groupedInstruments = useMemo(() => {
        const groups = new Map<string, string[]>();

        filteredInstruments.forEach(id => {
            const def = InstrumentLoader.getDefinition(id);
            if (!def) return;
            const baseName = def.name;

            if (!groups.has(baseName)) {
                groups.set(baseName, []);
            }
            groups.get(baseName)!.push(id);
        });

        return Array.from(groups.entries())
            .map(([baseName, instruments]) => ({ baseName, instruments }))
            .sort((a, b) => a.baseName.localeCompare(b.baseName));
    }, [filteredInstruments]);

    // Handle header mouse down
    const handleHeaderMouseDownLocal = (e: React.MouseEvent) => {
        setDragStartPos({ x: e.clientX, y: e.clientY });
        setWasDragging(false);
        handleHeaderMouseDown?.(e);
    };

    // Handle instrument name click
    const handleInstrumentNameClick = (e: React.MouseEvent) => {
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

    // Handle instrument selection
    const handleInstrumentSelect = (instId: string) => {
        const currentData = node.data as InstrumentNodeData;
        updateNodeData(node.id, {
            ...currentData,
            instrumentId: instId
        });
        setShowPopup(false);
        setSearchQuery('');
    };

    // Update row field
    const updateRowField = (rowId: string, field: keyof InstrumentRow, value: number) => {
        const currentRows = data.rows || [];
        const updatedRows = currentRows.map(row => {
            if (row.rowId === rowId) {
                return { ...row, [field]: value };
            }
            return row;
        });
        updateNodeData(node.id, { rows: updatedRows });
    };

    // Handle wheel on row control
    const handleRowWheel = (rowId: string, field: keyof InstrumentRow, e: React.WheelEvent, min: number, max: number) => {
        e.stopPropagation();
        e.preventDefault();
        const row = rows.find(r => r.rowId === rowId);
        if (!row) return;

        const currentValue = row[field] as number;
        const delta = e.deltaY > 0 ? -1 : 1;
        const step = field === 'spread' ? 0.1 : 1;
        const newValue = Math.max(min, Math.min(max, currentValue + delta * step));
        updateRowField(rowId, field, newValue);
    };

    return (
        <div
            ref={nodeRef}
            className={`instrument-node schematic-node ${isSelected ? 'selected' : ''} ${isDragging ? 'dragging' : ''} ${isHoveredWithConnections ? 'hover-connecting' : ''}`}
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
                    className="schematic-title instrument-name-clickable"
                    onClick={handleInstrumentNameClick}
                >
                    {displayName}
                </span>
            </div>

            {/* Main body - clean row layout matching mockup */}
            <div className="instrument-schematic-body simple">
                {/* Rows container */}
                <div className="instrument-rows-simple">
                    {rows.length === 0 ? (
                        /* Empty state - find first available input port */
                        (() => {
                            const availablePort = node.ports.find(p =>
                                p.direction === 'input' &&
                                p.type === 'control'
                            );
                            if (!availablePort) return null;

                            return (
                                <div className="instrument-row-simple empty-state">
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
                        })()
                    ) : (
                        /* Show rows with connections */
                        <>
                            {rows.map((row, index) => {
                                const rowPort = node.ports.find(p => p.id === row.targetPortId);
                                const isPedal = row.portCount === 1;  // Pedal is a size-1 bundle

                                return (
                                    <div key={row.rowId} className={`instrument-row-simple ${index > 0 ? 'with-divider' : ''} ${isPedal ? 'pedal-row' : ''}`}>
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
                                            /* Pedal row - just show label (Note/Octave/Offset don't apply) */
                                            <span className="pedal-label">Pedal</span>
                                        ) : (
                                            /* Key row - show Note, Octave, Offset */
                                            <>
                                                <span
                                                    className="row-value note-value editable-value"
                                                    onWheel={(e) => handleRowWheel(row.rowId, 'baseNote', e, 0, 6)}
                                                    title="Note (C-B) - scroll to change"
                                                >
                                                    {NOTE_NAMES[row.baseNote] || 'C'}
                                                </span>
                                                <span
                                                    className="row-value octave-value editable-value"
                                                    onWheel={(e) => handleRowWheel(row.rowId, 'baseOctave', e, 0, 8)}
                                                    title="Octave (0-8) - scroll to change"
                                                >
                                                    {row.baseOctave}
                                                </span>
                                                <span
                                                    className="row-value offset-value editable-value"
                                                    onWheel={(e) => handleRowWheel(row.rowId, 'baseOffset', e, -24, 24)}
                                                    title="Offset (-24 to +24) - scroll to change"
                                                >
                                                    {row.baseOffset >= 0 ? `+${row.baseOffset}` : row.baseOffset}
                                                </span>
                                            </>
                                        )}
                                    </div>
                                );
                            })}
                            {/* Empty row for adding new connections - find first available input port */}
                            {(() => {
                                const connectedPorts = new Set(rows.map(r => r.targetPortId));
                                const availablePort = node.ports.find(p =>
                                    p.direction === 'input' &&
                                    p.type === 'control' &&
                                    !connectedPorts.has(p.id)
                                );
                                if (!availablePort) return null;

                                return (
                                    <div className="instrument-row-simple empty-row with-divider">
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

                {/* Output port on right bottom */}
                {outputPort && (
                    <div
                        className={`instrument-output-port ${hasConnection?.(outputPort.id) ? 'connected' : ''}`}
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

            {/* Instrument Selector Dropdown */}
            {showPopup && (
                <div
                    className="instrument-selector-dropdown"
                    style={dropdownStyle}
                    onClick={(e) => e.stopPropagation()}
                    onWheel={(e) => e.stopPropagation()}
                >
                    <input
                        className="instrument-search"
                        type="text"
                        placeholder="Search instruments..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        autoFocus
                    />
                    <div className="instrument-grid-container">
                        <div className="instrument-grid-grouped">
                            {groupedInstruments.map((group, groupIndex) => (
                                <div key={group.baseName} className="instrument-group">
                                    {groupIndex > 0 && <div className="instrument-group-separator" />}
                                    {groupedInstruments.length > 1 && (
                                        <div className="instrument-group-label">{group.baseName}</div>
                                    )}
                                    <div className="instrument-group-items">
                                        {group.instruments.map(instId => {
                                            const currentInstrumentId = (node.data as InstrumentNodeData).instrumentId || node.type;
                                            return (
                                                <div
                                                    key={instId}
                                                    className={`instrument-card ${currentInstrumentId === instId ? 'selected' : ''}`}
                                                    onClick={() => handleInstrumentSelect(instId)}
                                                >
                                                    <div className="instrument-icon">
                                                        {getInstrumentIcon(instId)}
                                                    </div>
                                                    <div className="instrument-name">
                                                        {INSTRUMENT_LABELS[instId]}
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            ))}
                        </div>
                        {filteredInstruments.length === 0 && (
                            <div className="no-results">No instruments found</div>
                        )}
                    </div>
                    <div className="category-nav-hint">
                        {node.type.charAt(0).toUpperCase() + node.type.slice(1)} | Ctrl + ← → to switch type
                    </div>
                </div>
            )}
        </div>
    );
}
