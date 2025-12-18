/**
 * Instrument Node - Virtual instrument with dynamic inputs from Keyboard Node
 *
 * Design: Hand-drawn schematic with clickable instrument name to open selector dropdown
 * Shows note grid with editable scientific notation and offset values
 */

import { useState, useEffect, useRef, useMemo } from 'react';
import type { GraphNode, InstrumentNodeData } from '../../engine/types';
import { useGraphStore } from '../../store/graphStore';
import { useAudioStore } from '../../store/audioStore';
import { createInstrument, type Instrument, type InstrumentType } from '../../audio/Instruments';
import { nodeDefinitions } from '../../engine/registry';

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
const MAX_INPUT_PORTS = 7;
const DRAG_THRESHOLD_PX = 5;

// Instrument display names
const INSTRUMENT_LABELS: Record<string, string> = {
    piano: 'Classic Piano',
    cello: 'Cello',
    electricCello: 'Electric Cello',
    violin: 'Violin',
    saxophone: 'Saxophone',
    strings: 'Strings',
    keys: 'Keys',
    winds: 'Winds'
};

// Instrument categories with order
const CATEGORY_ORDER = ['Keys', 'String', 'Wind'];

// Sub-categories within each main category (for visual grouping with separators)
const INSTRUMENT_SUBCATEGORIES: Record<string, string[][]> = {
    'Keys': [['piano', 'keys']],
    'String': [['cello', 'electricCello'], ['violin'], ['strings']],
    'Wind': [['saxophone'], ['winds']]
};

// Flat list for filtering
const INSTRUMENT_CATEGORIES: Record<string, string[]> = {
    'Keys': ['piano', 'keys'],
    'String': ['cello', 'electricCello', 'violin', 'strings'],
    'Wind': ['saxophone', 'winds']
};

// Get category for an instrument type
const getInstrumentCategory = (type: string): string => {
    for (const [category, instruments] of Object.entries(INSTRUMENT_CATEGORIES)) {
        if (instruments.includes(type)) return category;
    }
    return CATEGORY_ORDER[0];
};

// SVG Icons for each instrument
const InstrumentIcons: Record<string, React.ReactNode> = {
    piano: (
        <svg viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="2">
            {/* Grand piano shape */}
            <path d="M8 48 L8 24 Q8 16 16 16 L48 16 Q56 16 56 24 L56 48" strokeLinecap="round" />
            <line x1="8" y1="48" x2="56" y2="48" />
            {/* Keys */}
            <rect x="12" y="32" width="6" height="16" fill="currentColor" opacity="0.1" />
            <rect x="20" y="32" width="6" height="16" fill="currentColor" opacity="0.1" />
            <rect x="28" y="32" width="6" height="16" fill="currentColor" opacity="0.1" />
            <rect x="36" y="32" width="6" height="16" fill="currentColor" opacity="0.1" />
            <rect x="44" y="32" width="6" height="16" fill="currentColor" opacity="0.1" />
            {/* Black keys */}
            <rect x="16" y="32" width="4" height="10" fill="currentColor" />
            <rect x="24" y="32" width="4" height="10" fill="currentColor" />
            <rect x="40" y="32" width="4" height="10" fill="currentColor" />
            <rect x="48" y="32" width="4" height="10" fill="currentColor" />
        </svg>
    ),
    keys: (
        <svg viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="2">
            {/* Keyboard/synth shape */}
            <rect x="8" y="20" width="48" height="28" rx="3" />
            {/* Keys */}
            <line x1="16" y1="28" x2="16" y2="44" />
            <line x1="24" y1="28" x2="24" y2="44" />
            <line x1="32" y1="28" x2="32" y2="44" />
            <line x1="40" y1="28" x2="40" y2="44" />
            <line x1="48" y1="28" x2="48" y2="44" />
            {/* Black keys */}
            <rect x="13" y="28" width="3" height="8" fill="currentColor" />
            <rect x="21" y="28" width="3" height="8" fill="currentColor" />
            <rect x="37" y="28" width="3" height="8" fill="currentColor" />
            <rect x="45" y="28" width="3" height="8" fill="currentColor" />
            {/* Control knobs */}
            <circle cx="20" cy="16" r="2" fill="currentColor" />
            <circle cx="32" cy="16" r="2" fill="currentColor" />
            <circle cx="44" cy="16" r="2" fill="currentColor" />
        </svg>
    ),
    cello: (
        <svg viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="2">
            {/* Body */}
            <path d="M24 52 Q16 48 16 40 Q14 32 20 28 Q16 24 20 18 Q24 12 32 12 Q40 12 44 18 Q48 24 44 28 Q50 32 48 40 Q48 48 40 52 Z" />
            {/* F-holes */}
            <path d="M26 30 Q24 34 26 38" />
            <path d="M38 30 Q40 34 38 38" />
            {/* Bridge */}
            <line x1="26" y1="42" x2="38" y2="42" />
            {/* Strings */}
            <line x1="28" y1="16" x2="28" y2="48" strokeWidth="1" />
            <line x1="32" y1="14" x2="32" y2="48" strokeWidth="1" />
            <line x1="36" y1="16" x2="36" y2="48" strokeWidth="1" />
            {/* Endpin */}
            <line x1="32" y1="52" x2="32" y2="58" strokeWidth="3" />
        </svg>
    ),
    electricCello: (
        <svg viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="2">
            {/* Solid body - more angular/modern */}
            <path d="M22 50 L18 38 L20 28 L24 20 L32 16 L40 20 L44 28 L46 38 L42 50 Z" />
            {/* Pickup */}
            <rect x="26" y="34" width="12" height="4" rx="1" fill="currentColor" opacity="0.4" />
            {/* Bridge */}
            <line x1="26" y1="42" x2="38" y2="42" />
            {/* Strings */}
            <line x1="28" y1="18" x2="28" y2="46" strokeWidth="1" />
            <line x1="32" y1="16" x2="32" y2="46" strokeWidth="1" />
            <line x1="36" y1="18" x2="36" y2="46" strokeWidth="1" />
            {/* Output jack */}
            <circle cx="42" cy="46" r="2" fill="currentColor" />
            {/* Cable */}
            <path d="M44 46 Q50 48 52 54 Q54 58 50 60" strokeWidth="1.5" />
            {/* Endpin */}
            <line x1="32" y1="50" x2="32" y2="56" strokeWidth="3" />
        </svg>
    ),
    violin: (
        <svg viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="2">
            {/* Body - smaller than cello */}
            <path d="M26 46 Q20 43 20 36 Q18 30 23 27 Q20 24 23 20 Q26 16 32 16 Q38 16 41 20 Q44 24 41 27 Q46 30 44 36 Q44 43 38 46 Z" />
            {/* F-holes */}
            <path d="M28 29 Q26 32 28 35" strokeWidth="1.5" />
            <path d="M36 29 Q38 32 36 35" strokeWidth="1.5" />
            {/* Bridge */}
            <line x1="28" y1="38" x2="36" y2="38" />
            {/* Neck */}
            <rect x="30" y="8" width="4" height="10" rx="1" />
            {/* Scroll */}
            <circle cx="32" cy="6" r="3" />
            {/* Strings */}
            <line x1="30" y1="10" x2="30" y2="44" strokeWidth="0.5" />
            <line x1="32" y1="8" x2="32" y2="44" strokeWidth="0.5" />
            <line x1="34" y1="10" x2="34" y2="44" strokeWidth="0.5" />
            {/* Bow */}
            <path d="M48 20 Q52 32 48 44" strokeWidth="1" />
            <line x1="48" y1="20" x2="50" y2="18" strokeWidth="3" />
        </svg>
    ),
    strings: (
        <svg viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="2">
            {/* Harp shape */}
            <path d="M16 52 L16 16 Q16 8 24 8 L44 8" strokeLinecap="round" />
            <path d="M44 8 Q52 8 52 16 L52 52" strokeLinecap="round" />
            <line x1="16" y1="52" x2="52" y2="52" />
            {/* Strings */}
            <line x1="22" y1="14" x2="22" y2="52" strokeWidth="1" />
            <line x1="28" y1="12" x2="28" y2="52" strokeWidth="1" />
            <line x1="34" y1="10" x2="34" y2="52" strokeWidth="1" />
            <line x1="40" y1="12" x2="40" y2="52" strokeWidth="1" />
            <line x1="46" y1="14" x2="46" y2="52" strokeWidth="1" />
        </svg>
    ),
    saxophone: (
        <svg viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="2">
            {/* Bell */}
            <path d="M20 52 Q12 48 16 40 L28 24" strokeLinecap="round" />
            <ellipse cx="18" cy="52" rx="6" ry="4" />
            {/* Body */}
            <path d="M28 24 L40 12 Q44 8 48 12" strokeLinecap="round" />
            {/* Mouthpiece */}
            <path d="M48 12 L52 8" strokeWidth="3" strokeLinecap="round" />
            {/* Keys */}
            <circle cx="24" cy="36" r="3" fill="currentColor" opacity="0.3" />
            <circle cx="28" cy="30" r="3" fill="currentColor" opacity="0.3" />
            <circle cx="34" cy="22" r="3" fill="currentColor" opacity="0.3" />
            <circle cx="40" cy="16" r="2" fill="currentColor" opacity="0.3" />
        </svg>
    ),
    winds: (
        <svg viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="2">
            {/* Flute/clarinet */}
            <rect x="8" y="28" width="48" height="8" rx="4" />
            {/* Tone holes */}
            <circle cx="18" cy="32" r="2" fill="currentColor" />
            <circle cx="28" cy="32" r="2" fill="currentColor" />
            <circle cx="38" cy="32" r="2" fill="currentColor" />
            <circle cx="48" cy="32" r="2" fill="currentColor" />
            {/* Keys */}
            <ellipse cx="23" cy="26" rx="3" ry="2" fill="currentColor" opacity="0.4" />
            <ellipse cx="33" cy="26" rx="3" ry="2" fill="currentColor" opacity="0.4" />
            <ellipse cx="43" cy="26" rx="3" ry="2" fill="currentColor" opacity="0.4" />
            {/* Mouthpiece */}
            <path d="M56 32 L60 30 L60 34 Z" fill="currentColor" />
        </svg>
    )
};

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
    incomingConnectionCount = 0,
    style
}: InstrumentNodeProps) {
    const data = node.data as unknown as InstrumentNodeData;
    const updateNodeData = useGraphStore((s) => s.updateNodeData);
    const connections = useGraphStore((s) => s.connections);
    const isAudioContextReady = useAudioStore((s) => s.isAudioContextReady);

    // Internal audio state
    const instrumentRef = useRef<Instrument | null>(null);
    const nodeRef = useRef<HTMLDivElement>(null);

    // Popup state
    const [showPopup, setShowPopup] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [dropdownStyle, setDropdownStyle] = useState<React.CSSProperties>({});
    const [activeCategory, setActiveCategory] = useState(() => getInstrumentCategory(node.type));

    // Drag state
    const [dragStartPos, setDragStartPos] = useState<{x: number, y: number} | null>(null);

    // Inline editing state
    const [editingPort, setEditingPort] = useState<string | null>(null);
    const [editingField, setEditingField] = useState<'note' | 'octave' | 'offset' | null>(null);
    const [editValue, setEditValue] = useState('');

    // Initialize instrument audio
    useEffect(() => {
        if (!isAudioContextReady) return;
        const type = node.type as InstrumentType;
        const inst = createInstrument(type);
        instrumentRef.current = inst;
        return () => inst.disconnect();
    }, [isAudioContextReady, node.type]);

    // Handle keyboard shortcuts for popup (Escape to close, Ctrl+Arrow to switch category)
    useEffect(() => {
        if (!showPopup) return;

        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                e.preventDefault();
                setShowPopup(false);
                setSearchQuery('');
            } else if (e.ctrlKey && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
                e.preventDefault();
                const currentIndex = CATEGORY_ORDER.indexOf(activeCategory);
                let newIndex: number;
                if (e.key === 'ArrowRight') {
                    newIndex = (currentIndex + 1) % CATEGORY_ORDER.length;
                } else {
                    newIndex = (currentIndex - 1 + CATEGORY_ORDER.length) % CATEGORY_ORDER.length;
                }
                setActiveCategory(CATEGORY_ORDER[newIndex]);
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [showPopup, activeCategory]);

    // Click outside to close popup (no overlay)
    useEffect(() => {
        if (!showPopup) return;

        const handleClickOutside = (e: MouseEvent) => {
            const dropdown = document.querySelector('.instrument-selector-dropdown');
            if (dropdown && !dropdown.contains(e.target as Node)) {
                setShowPopup(false);
                setSearchQuery('');
            }
        };

        // Delay to avoid immediate close
        setTimeout(() => {
            document.addEventListener('mousedown', handleClickOutside);
        }, 0);

        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [showPopup]);

    // Dynamic dropdown positioning - stays within viewport
    useEffect(() => {
        if (!showPopup || !nodeRef.current) return;

        const updateDropdownPosition = () => {
            if (!nodeRef.current) return;

            const nodeRect = nodeRef.current.getBoundingClientRect();
            const headerHeight = 36; // Header height in pixels
            const viewportHeight = window.innerHeight;
            const viewportWidth = window.innerWidth;

            // Available space below header to bottom of screen
            const spaceBelow = viewportHeight - (nodeRect.top + headerHeight);

            // Desired dimensions (50vw x 40vh, capped)
            const desiredWidth = Math.min(viewportWidth * 0.5, 800);
            const desiredHeight = Math.min(viewportHeight * 0.4, 600);

            // Minimum size threshold - hide if too small
            const minHeight = 150;
            const minWidth = 250;

            // Calculate actual height (constrained by viewport)
            const actualHeight = Math.max(0, Math.min(desiredHeight, spaceBelow - 10));

            if (actualHeight < minHeight) {
                setDropdownStyle({ display: 'none' });
                return;
            }

            // Calculate width and center it on the node
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

        // Initial position
        updateDropdownPosition();

        // Update on scroll/resize
        window.addEventListener('resize', updateDropdownPosition);

        // Use RAF to update on canvas transforms (panning/zooming)
        let rafId: number;
        const rafUpdate = () => {
            updateDropdownPosition();
            rafId = requestAnimationFrame(rafUpdate);
        };
        rafId = requestAnimationFrame(rafUpdate);

        return () => {
            window.removeEventListener('resize', updateDropdownPosition);
            cancelAnimationFrame(rafId);
        };
    }, [showPopup]);

    // Clear dragStartPos on mouseup to prevent stale state
    useEffect(() => {
        if (!dragStartPos) return;

        const handleMouseUp = () => {
            setDragStartPos(null);
        };

        window.addEventListener('mouseup', handleMouseUp);
        return () => window.removeEventListener('mouseup', handleMouseUp);
    }, [dragStartPos]);

    // Get persisted input ports
    const persistedInputPorts = node.ports.filter(p => p.direction === 'input' && p.type === 'technical');
    const outputPort = node.ports.find(p => p.direction === 'output' && p.type === 'audio');

    // Count connected ports
    const connectedCount = persistedInputPorts.filter(p =>
        Array.from(connections.values()).some(c => c.targetNodeId === node.id && c.targetPortId === p.id)
    ).length;

    // Calculate visible port count
    const baseVisible = Math.max(1, connectedCount + 1);
    const hoverVisible = isHoveredWithConnections ? connectedCount + incomingConnectionCount : 0;
    const visiblePortCount = Math.min(MAX_INPUT_PORTS, Math.max(baseVisible, hoverVisible));

    // Generate visible ports array (mix of persisted + ghost ports)
    const visibleInputPorts = [];
    for (let i = 0; i < visiblePortCount; i++) {
        if (i < persistedInputPorts.length) {
            visibleInputPorts.push({
                ...persistedInputPorts[i],
                isGhost: false
            });
        } else {
            visibleInputPorts.push({
                id: `ghost-input-${i}`,
                name: `In ${i + 1}`,
                type: 'technical' as const,
                direction: 'input' as const,
                isGhost: true
            });
        }
    }

    // Get display name
    const displayName = INSTRUMENT_LABELS[node.type] || nodeDefinitions[node.type]?.name || 'Instrument';

    // Filter instruments by search query within active category, preserving subcategories
    const filteredSubcategories = useMemo(() => {
        const subcategories = INSTRUMENT_SUBCATEGORIES[activeCategory] || [];
        const query = searchQuery.toLowerCase().trim();

        if (!query) return subcategories;

        // Filter each subcategory, keeping only non-empty ones
        return subcategories
            .map(group => group.filter(type =>
                INSTRUMENT_LABELS[type]?.toLowerCase().includes(query)
            ))
            .filter(group => group.length > 0);
    }, [activeCategory, searchQuery]);

    // Handle header mouse down - track drag start
    const handleHeaderMouseDownLocal = (e: React.MouseEvent) => {
        setDragStartPos({ x: e.clientX, y: e.clientY });
        handleHeaderMouseDown?.(e);
    };

    // Handle instrument name click to open popup (only if not dragging)
    const handleInstrumentNameClick = (e: React.MouseEvent) => {
        if (dragStartPos) {
            const distance = Math.sqrt(
                Math.pow(e.clientX - dragStartPos.x, 2) +
                Math.pow(e.clientY - dragStartPos.y, 2)
            );
            if (distance > DRAG_THRESHOLD_PX) {
                setDragStartPos(null);
                return; // Was a drag, don't open popup
            }
        }
        e.stopPropagation();
        setShowPopup(true);
        setSearchQuery('');
        setDragStartPos(null);
    };

    // Handle instrument selection from dropdown
    const updateNodeType = useGraphStore((s) => s.updateNodeType);
    const handleInstrumentSelect = (type: string) => {
        if (type !== node.type) {
            updateNodeType(node.id, type as import('../../engine/types').NodeType);
        }
        setShowPopup(false);
        setSearchQuery('');
    };

    // Get base note index for a port
    const getBaseNoteIndex = (index: number): number => {
        return index % NOTE_NAMES.length;
    };

    // Get display note (base + offset, wrapped 0-6)
    const getDisplayNoteIndex = (portId: string, index: number): number => {
        const noteOffset = data.noteOffsets?.[portId] ?? 0;
        const baseNote = getBaseNoteIndex(index);
        // Wrap around 0-6
        return ((baseNote + noteOffset) % 7 + 7) % 7;
    };

    // Get note name for display
    const getDisplayNoteName = (portId: string, index: number): string => {
        return NOTE_NAMES[getDisplayNoteIndex(portId, index)];
    };

    // Get base octave for display
    const getBaseOctave = (index: number): number => {
        return Math.floor(index / 7) + 4;
    };

    // Get display octave (base + offset)
    const getDisplayOctave = (portId: string, index: number): number => {
        const octaveOffset = data.octaveOffsets?.[portId] ?? 0;
        return getBaseOctave(index) + octaveOffset;
    };

    // Handle note wheel scroll
    const handleNoteWheel = (portId: string, _index: number, e: React.WheelEvent) => {
        e.stopPropagation();
        e.preventDefault();
        const currentNoteOffset = data.noteOffsets?.[portId] ?? 0;
        const delta = e.deltaY > 0 ? -1 : 1;
        const newNoteOffset = currentNoteOffset + delta;
        updateNodeData(node.id, {
            noteOffsets: { ...(data.noteOffsets || {}), [portId]: newNoteOffset }
        });
    };

    // Handle octave wheel scroll
    const handleOctaveWheel = (portId: string, index: number, e: React.WheelEvent) => {
        e.stopPropagation();
        e.preventDefault();
        const currentOctave = getDisplayOctave(portId, index);
        const delta = e.deltaY > 0 ? -1 : 1;
        const newOctave = Math.max(0, Math.min(8, currentOctave + delta));
        const octaveOffset = newOctave - getBaseOctave(index);
        updateNodeData(node.id, {
            octaveOffsets: { ...(data.octaveOffsets || {}), [portId]: octaveOffset }
        });
    };

    // Handle offset wheel scroll
    const handleOffsetWheel = (portId: string, e: React.WheelEvent) => {
        e.stopPropagation();
        e.preventDefault();
        const currentOffset = data.offsets?.[portId] ?? 0;
        const delta = e.deltaY > 0 ? -1 : 1;
        const newOffset = Math.max(-24, Math.min(24, currentOffset + delta));
        updateNodeData(node.id, {
            offsets: { ...(data.offsets || {}), [portId]: newOffset }
        });
    };

    // Handle click to start editing
    const handleValueClick = (e: React.MouseEvent, portId: string, field: 'note' | 'octave' | 'offset', currentValue: string) => {
        e.stopPropagation();
        setEditingPort(portId);
        setEditingField(field);
        setEditValue(currentValue);
    };

    // Handle blur to save edit
    const handleValueBlur = (portId: string, field: 'note' | 'octave' | 'offset', index: number) => {
        if (field === 'note') {
            // Find the note index from the entered letter
            const enteredNote = editValue.toUpperCase().trim();
            const noteIndex = NOTE_NAMES.indexOf(enteredNote);
            if (noteIndex !== -1) {
                const baseNote = getBaseNoteIndex(index);
                const noteOffset = noteIndex - baseNote;
                updateNodeData(node.id, {
                    noteOffsets: { ...(data.noteOffsets || {}), [portId]: noteOffset }
                });
            }
        } else if (field === 'octave') {
            const newOctave = parseInt(editValue) || 4;
            const octaveOffset = newOctave - getBaseOctave(index);
            updateNodeData(node.id, {
                octaveOffsets: { ...(data.octaveOffsets || {}), [portId]: octaveOffset }
            });
        } else {
            const newOffset = parseFloat(editValue) || 0;
            updateNodeData(node.id, {
                offsets: { ...(data.offsets || {}), [portId]: newOffset }
            });
        }
        setEditingPort(null);
        setEditingField(null);
    };

    // Handle keydown in edit input
    const handleValueKeyDown = (e: React.KeyboardEvent, portId: string, field: 'note' | 'octave' | 'offset', index: number) => {
        if (e.key === 'Enter') {
            handleValueBlur(portId, field, index);
        } else if (e.key === 'Escape') {
            setEditingPort(null);
            setEditingField(null);
        }
    };

    return (
        <div
            ref={nodeRef}
            className={`instrument-node schematic-node ${isSelected ? 'selected' : ''} ${isDragging ? 'dragging' : ''} ${isHoveredWithConnections ? 'hover-connecting' : ''}`}
            style={style}
            onMouseEnter={handleNodeMouseEnter}
            onMouseLeave={handleNodeMouseLeave}
        >
            {/* Header - Drag anywhere, but only name click opens popup */}
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

            {/* Note Grid */}
            <div className="instrument-schematic-body">
                <div className="note-grid">
                    {visibleInputPorts.map((port, index) => {
                        const offset = data.offsets?.[port.id] ?? 0;
                        const displayOctave = getDisplayOctave(port.id, index);
                        const displayNote = getDisplayNoteName(port.id, index);
                        const isConnected = !port.isGhost && (hasConnection?.(port.id) ?? false);
                        const isGhost = port.isGhost;
                        const isEditingThis = editingPort === port.id;

                        return (
                            <div key={port.id} className={`note-row ${isGhost ? 'ghost-port' : ''}`}>
                                {/* Input port circle */}
                                <div
                                    className={`note-input-port ${isConnected ? 'connected' : ''} ${isGhost ? 'ghost' : ''}`}
                                    data-node-id={node.id}
                                    data-port-id={port.id}
                                    onMouseDown={(e) => handlePortMouseDown?.(port.id, e)}
                                    onMouseUp={(e) => handlePortMouseUp?.(port.id, e)}
                                    onMouseEnter={() => handlePortMouseEnter?.(port.id)}
                                    onMouseLeave={handlePortMouseLeave}
                                    title={port.name}
                                />
                                {/* Note name (editable) */}
                                {isEditingThis && editingField === 'note' ? (
                                    <input
                                        className="inline-edit-input inline-edit-note"
                                        type="text"
                                        maxLength={1}
                                        value={editValue}
                                        onChange={(e) => setEditValue(e.target.value)}
                                        onBlur={() => handleValueBlur(port.id, 'note', index)}
                                        onKeyDown={(e) => handleValueKeyDown(e, port.id, 'note', index)}
                                        autoFocus
                                    />
                                ) : (
                                    <span
                                        className="note-name editable-value"
                                        onClick={(e) => handleValueClick(e, port.id, 'note', displayNote)}
                                        onWheel={(e) => handleNoteWheel(port.id, index, e)}
                                        title="Scroll or click to edit note"
                                    >
                                        {displayNote}
                                    </span>
                                )}
                                {/* Octave (editable) */}
                                {isEditingThis && editingField === 'octave' ? (
                                    <input
                                        className="inline-edit-input"
                                        type="number"
                                        value={editValue}
                                        onChange={(e) => setEditValue(e.target.value)}
                                        onBlur={() => handleValueBlur(port.id, 'octave', index)}
                                        onKeyDown={(e) => handleValueKeyDown(e, port.id, 'octave', index)}
                                        autoFocus
                                    />
                                ) : (
                                    <span
                                        className="note-octave editable-value"
                                        onClick={(e) => handleValueClick(e, port.id, 'octave', String(displayOctave))}
                                        onWheel={(e) => handleOctaveWheel(port.id, index, e)}
                                        title="Scroll or click to edit octave"
                                    >
                                        {displayOctave}
                                    </span>
                                )}
                                {/* Offset (editable) */}
                                {isEditingThis && editingField === 'offset' ? (
                                    <input
                                        className="inline-edit-input"
                                        type="number"
                                        step="1"
                                        value={editValue}
                                        onChange={(e) => setEditValue(e.target.value)}
                                        onBlur={() => handleValueBlur(port.id, 'offset', index)}
                                        onKeyDown={(e) => handleValueKeyDown(e, port.id, 'offset', index)}
                                        autoFocus
                                    />
                                ) : (
                                    <span
                                        className="note-offset editable-value"
                                        onClick={(e) => handleValueClick(e, port.id, 'offset', String(offset))}
                                        onWheel={(e) => handleOffsetWheel(port.id, e)}
                                        title="Scroll or click to edit offset"
                                    >
                                        {offset >= 0 ? `+${offset}` : offset}
                                    </span>
                                )}
                            </div>
                        );
                    })}
                </div>

                {/* Output port */}
                {outputPort && (
                    <div className="instrument-output">
                        <div
                            className={`output-port ${hasConnection?.(outputPort.id) ? 'connected' : ''}`}
                            data-node-id={node.id}
                            data-port-id={outputPort.id}
                            onMouseDown={(e) => handlePortMouseDown?.(outputPort.id, e)}
                            onMouseUp={(e) => handlePortMouseUp?.(outputPort.id, e)}
                            onMouseEnter={() => handlePortMouseEnter?.(outputPort.id)}
                            onMouseLeave={handlePortMouseLeave}
                            title={outputPort.name}
                        />
                    </div>
                )}
            </div>

            {/* Instrument Selector Dropdown - rendered inside node so it moves with canvas */}
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
                        {filteredSubcategories.map((group, groupIndex) => (
                            <div key={groupIndex} className="instrument-subcategory">
                                {groupIndex > 0 && <div className="subcategory-separator" />}
                                <div className="instrument-grid">
                                    {group.map(type => (
                                        <div
                                            key={type}
                                            className={`instrument-card ${node.type === type ? 'selected' : ''}`}
                                            onClick={() => handleInstrumentSelect(type)}
                                        >
                                            <div className="instrument-icon">
                                                {InstrumentIcons[type]}
                                            </div>
                                            <div className="instrument-name">
                                                {INSTRUMENT_LABELS[type]}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ))}
                        {filteredSubcategories.length === 0 && (
                            <div className="no-results">No instruments found</div>
                        )}
                    </div>
                    <div className="category-nav-hint">Ctrl + ← → to switch categories</div>
                </div>
            )}
        </div>
    );
}
