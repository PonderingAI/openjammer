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
const MAX_INPUT_PORTS = 7;
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
    'instrument': ['piano', 'strings', 'guitar', 'bass', 'woodwinds', 'brass', 'synth', 'percussion', 'world'] // Generic type shows all
};

// Get allowed categories for current node type
function getAllowedCategories(nodeType: string): string[] {
    return NODE_TYPE_TO_CATEGORIES[nodeType] || ['piano'];
}

// Main instrument node types to cycle through
const INSTRUMENT_NODE_TYPES = ['strings', 'keys', 'winds'] as const;

// SVG Icons - organized by: Node Types → Categories → Specific Instruments
const InstrumentIcons: Record<string, React.ReactNode> = {
    // ============= NODE TYPE DEFAULTS =============
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
            <ellipse cx="23" cy="26" rx="3" ry="2" fill="currentColor" opacity="0.4" />
            <ellipse cx="33" cy="26" rx="3" ry="2" fill="currentColor" opacity="0.4" />
            <ellipse cx="43" cy="26" rx="3" ry="2" fill="currentColor" opacity="0.4" />
            <path d="M56 32 L60 30 L60 34 Z" fill="currentColor" />
        </svg>
    ),

    // ============= CATEGORY: STRINGS =============
    cello: (
        <svg viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M24 52 Q16 48 16 40 Q14 32 20 28 Q16 24 20 18 Q24 12 32 12 Q40 12 44 18 Q48 24 44 28 Q50 32 48 40 Q48 48 40 52 Z" />
            <path d="M26 30 Q24 34 26 38" />
            <path d="M38 30 Q40 34 38 38" />
            <line x1="26" y1="42" x2="38" y2="42" />
            <line x1="28" y1="16" x2="28" y2="48" strokeWidth="1" />
            <line x1="32" y1="14" x2="32" y2="48" strokeWidth="1" />
            <line x1="36" y1="16" x2="36" y2="48" strokeWidth="1" />
            <line x1="32" y1="52" x2="32" y2="58" strokeWidth="3" />
        </svg>
    ),
    'versilian-cello': (
        <svg viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M24 52 Q16 48 16 40 Q14 32 20 28 Q16 24 20 18 Q24 12 32 12 Q40 12 44 18 Q48 24 44 28 Q50 32 48 40 Q48 48 40 52 Z" />
            <path d="M26 30 Q24 34 26 38" />
            <path d="M38 30 Q40 34 38 38" />
            <line x1="26" y1="42" x2="38" y2="42" />
            <line x1="28" y1="16" x2="28" y2="48" strokeWidth="1" />
            <line x1="32" y1="14" x2="32" y2="48" strokeWidth="1" />
            <line x1="36" y1="16" x2="36" y2="48" strokeWidth="1" />
            <line x1="32" y1="52" x2="32" y2="58" strokeWidth="3" />
        </svg>
    ),
    'gm-cello': (
        <svg viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M24 52 Q16 48 16 40 Q14 32 20 28 Q16 24 20 18 Q24 12 32 12 Q40 12 44 18 Q48 24 44 28 Q50 32 48 40 Q48 48 40 52 Z" />
            <path d="M26 30 Q24 34 26 38" />
            <path d="M38 30 Q40 34 38 38" />
            <line x1="26" y1="42" x2="38" y2="42" />
            <line x1="28" y1="16" x2="28" y2="48" strokeWidth="1" />
            <line x1="32" y1="14" x2="32" y2="48" strokeWidth="1" />
            <line x1="36" y1="16" x2="36" y2="48" strokeWidth="1" />
            <line x1="32" y1="52" x2="32" y2="58" strokeWidth="3" />
        </svg>
    ),
    electricCello: (
        <svg viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M22 50 L18 38 L20 28 L24 20 L32 16 L40 20 L44 28 L46 38 L42 50 Z" />
            <rect x="26" y="34" width="12" height="4" rx="1" fill="currentColor" opacity="0.4" />
            <line x1="26" y1="42" x2="38" y2="42" />
            <line x1="28" y1="18" x2="28" y2="46" strokeWidth="1" />
            <line x1="32" y1="16" x2="32" y2="46" strokeWidth="1" />
            <line x1="36" y1="18" x2="36" y2="46" strokeWidth="1" />
            <circle cx="42" cy="46" r="2" fill="currentColor" />
            <path d="M44 46 Q50 48 52 54 Q54 58 50 60" strokeWidth="1.5" />
            <line x1="32" y1="50" x2="32" y2="56" strokeWidth="3" />
        </svg>
    ),
    violin: (
        <svg viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M26 46 Q20 43 20 36 Q18 30 23 27 Q20 24 23 20 Q26 16 32 16 Q38 16 41 20 Q44 24 41 27 Q46 30 44 36 Q44 43 38 46 Z" />
            <path d="M28 29 Q26 32 28 35" strokeWidth="1.5" />
            <path d="M36 29 Q38 32 36 35" strokeWidth="1.5" />
            <line x1="28" y1="38" x2="36" y2="38" />
            <rect x="30" y="8" width="4" height="10" rx="1" />
            <circle cx="32" cy="6" r="3" />
            <line x1="30" y1="10" x2="30" y2="44" strokeWidth="0.5" />
            <line x1="32" y1="8" x2="32" y2="44" strokeWidth="0.5" />
            <line x1="34" y1="10" x2="34" y2="44" strokeWidth="0.5" />
            <path d="M48 20 Q52 32 48 44" strokeWidth="1" />
            <line x1="48" y1="20" x2="50" y2="18" strokeWidth="3" />
        </svg>
    ),
    'versilian-violin': (
        <svg viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M26 46 Q20 43 20 36 Q18 30 23 27 Q20 24 23 20 Q26 16 32 16 Q38 16 41 20 Q44 24 41 27 Q46 30 44 36 Q44 43 38 46 Z" />
            <path d="M28 29 Q26 32 28 35" strokeWidth="1.5" />
            <path d="M36 29 Q38 32 36 35" strokeWidth="1.5" />
            <line x1="28" y1="38" x2="36" y2="38" />
            <rect x="30" y="8" width="4" height="10" rx="1" />
            <circle cx="32" cy="6" r="3" />
            <line x1="30" y1="10" x2="30" y2="44" strokeWidth="0.5" />
            <line x1="32" y1="8" x2="32" y2="44" strokeWidth="0.5" />
            <line x1="34" y1="10" x2="34" y2="44" strokeWidth="0.5" />
            <path d="M48 20 Q52 32 48 44" strokeWidth="1" />
            <line x1="48" y1="20" x2="50" y2="18" strokeWidth="3" />
        </svg>
    ),
    'gm-violin': (
        <svg viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M26 46 Q20 43 20 36 Q18 30 23 27 Q20 24 23 20 Q26 16 32 16 Q38 16 41 20 Q44 24 41 27 Q46 30 44 36 Q44 43 38 46 Z" />
            <path d="M28 29 Q26 32 28 35" strokeWidth="1.5" />
            <path d="M36 29 Q38 32 36 35" strokeWidth="1.5" />
            <line x1="28" y1="38" x2="36" y2="38" />
            <rect x="30" y="8" width="4" height="10" rx="1" />
            <circle cx="32" cy="6" r="3" />
            <line x1="30" y1="10" x2="30" y2="44" strokeWidth="0.5" />
            <line x1="32" y1="8" x2="32" y2="44" strokeWidth="0.5" />
            <line x1="34" y1="10" x2="34" y2="44" strokeWidth="0.5" />
        </svg>
    ),
    'versilian-viola': (
        <svg viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M25 48 Q18 45 18 38 Q16 32 21 28 Q18 24 21 20 Q25 15 32 15 Q39 15 43 20 Q46 24 43 28 Q48 32 46 38 Q46 45 39 48 Z" />
            <path d="M27 30 Q25 33 27 36" strokeWidth="1.5" />
            <path d="M37 30 Q39 33 37 36" strokeWidth="1.5" />
            <line x1="27" y1="39" x2="37" y2="39" />
            <rect x="30" y="8" width="4" height="9" rx="1" />
            <circle cx="32" cy="6" r="2.5" />
            <line x1="30" y1="11" x2="30" y2="46" strokeWidth="0.5" />
            <line x1="32" y1="9" x2="32" y2="46" strokeWidth="0.5" />
            <line x1="34" y1="11" x2="34" y2="46" strokeWidth="0.5" />
        </svg>
    ),
    'gm-viola': (
        <svg viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M25 48 Q18 45 18 38 Q16 32 21 28 Q18 24 21 20 Q25 15 32 15 Q39 15 43 20 Q46 24 43 28 Q48 32 46 38 Q46 45 39 48 Z" />
            <path d="M27 30 Q25 33 27 36" strokeWidth="1.5" />
            <path d="M37 30 Q39 33 37 36" strokeWidth="1.5" />
            <line x1="27" y1="39" x2="37" y2="39" />
            <rect x="30" y="8" width="4" height="9" rx="1" />
            <circle cx="32" cy="6" r="2.5" />
        </svg>
    ),
    'versilian-double-bass': (
        <svg viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M22 54 Q12 50 12 42 Q10 32 18 26 Q12 20 18 14 Q22 8 32 8 Q42 8 46 14 Q52 20 46 26 Q54 32 52 42 Q52 50 42 54 Z" />
            <path d="M24 28 Q22 34 24 40" />
            <path d="M40 28 Q42 34 40 40" />
            <line x1="24" y1="44" x2="40" y2="44" />
            <line x1="28" y1="14" x2="28" y2="50" strokeWidth="1" />
            <line x1="32" y1="12" x2="32" y2="50" strokeWidth="1" />
            <line x1="36" y1="14" x2="36" y2="50" strokeWidth="1" />
            <line x1="32" y1="54" x2="32" y2="60" strokeWidth="4" />
        </svg>
    ),
    'gm-contrabass': (
        <svg viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M22 54 Q12 50 12 42 Q10 32 18 26 Q12 20 18 14 Q22 8 32 8 Q42 8 46 14 Q52 20 46 26 Q54 32 52 42 Q52 50 42 54 Z" />
            <path d="M24 28 Q22 34 24 40" />
            <path d="M40 28 Q42 34 40 40" />
            <line x1="24" y1="44" x2="40" y2="44" />
            <line x1="28" y1="14" x2="28" y2="50" strokeWidth="1" />
            <line x1="32" y1="12" x2="32" y2="50" strokeWidth="1" />
            <line x1="36" y1="14" x2="36" y2="50" strokeWidth="1" />
            <line x1="32" y1="54" x2="32" y2="60" strokeWidth="4" />
        </svg>
    ),
    'karplus-harp': (
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
    'gm-orchestral-harp': (
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

    // ============= CATEGORY: GUITAR =============
    guitar: (
        <svg viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="2">
            <ellipse cx="22" cy="40" rx="10" ry="12" />
            <path d="M28 32 L42 18" strokeWidth="3" />
            <ellipse cx="44" cy="16" rx="4" ry="6" />
            <line x1="18" y1="32" x2="18" y2="48" strokeWidth="0.5" />
            <line x1="20" y1="31" x2="20" y2="49" strokeWidth="0.5" />
            <line x1="24" y1="31" x2="24" y2="49" strokeWidth="0.5" />
            <line x1="26" y1="32" x2="26" y2="48" strokeWidth="0.5" />
            <circle cx="22" cy="38" r="4" fill="currentColor" opacity="0.1" />
        </svg>
    ),
    'karplus-acoustic': (
        <svg viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="2">
            <ellipse cx="22" cy="40" rx="10" ry="12" />
            <path d="M28 32 L42 18" strokeWidth="3" />
            <ellipse cx="44" cy="16" rx="4" ry="6" />
            <line x1="18" y1="32" x2="18" y2="48" strokeWidth="0.5" />
            <line x1="20" y1="31" x2="20" y2="49" strokeWidth="0.5" />
            <line x1="24" y1="31" x2="24" y2="49" strokeWidth="0.5" />
            <line x1="26" y1="32" x2="26" y2="48" strokeWidth="0.5" />
            <circle cx="22" cy="38" r="4" fill="currentColor" opacity="0.1" />
        </svg>
    ),
    'karplus-electric': (
        <svg viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 36 L12 44 L32 44 L32 36 Z" />
            <path d="M32 40 L50 26" strokeWidth="3" />
            <path d="M48 24 L52 20 L54 24 L50 28 Z" />
            <line x1="16" y1="37" x2="16" y2="43" strokeWidth="0.5" />
            <line x1="20" y1="37" x2="20" y2="43" strokeWidth="0.5" />
            <line x1="24" y1="37" x2="24" y2="43" strokeWidth="0.5" />
            <line x1="28" y1="37" x2="28" y2="43" strokeWidth="0.5" />
            <rect x="18" y="38" width="8" height="3" fill="currentColor" opacity="0.3" />
            <circle cx="10" cy="42" r="2" fill="currentColor" />
        </svg>
    ),
    'karplus-nylon': (
        <svg viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="2">
            <ellipse cx="22" cy="40" rx="9" ry="11" />
            <path d="M28 33 L40 21" strokeWidth="3" />
            <rect x="38" y="16" width="6" height="8" rx="1" />
            <line x1="18" y1="33" x2="18" y2="47" strokeWidth="0.5" />
            <line x1="20" y1="32" x2="20" y2="48" strokeWidth="0.5" />
            <line x1="24" y1="32" x2="24" y2="48" strokeWidth="0.5" />
            <line x1="26" y1="33" x2="26" y2="47" strokeWidth="0.5" />
            <circle cx="22" cy="38" r="3.5" fill="currentColor" opacity="0.1" />
        </svg>
    ),

    // ============= CATEGORY: BASS =============
    bass: (
        <svg viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M10 38 L10 42 L28 42 L28 38 Z" />
            <path d="M28 40 L48 28" strokeWidth="3.5" />
            <path d="M46 26 L50 22 L54 26 L50 30 Z" />
            <line x1="14" y1="39" x2="14" y2="41" strokeWidth="1" />
            <line x1="18" y1="39" x2="18" y2="41" strokeWidth="1" />
            <line x1="22" y1="39" x2="22" y2="41" strokeWidth="1" />
            <line x1="26" y1="39" x2="26" y2="41" strokeWidth="1" />
            <rect x="16" y="39" width="8" height="2" fill="currentColor" opacity="0.3" />
            <circle cx="8" cy="40" r="2" fill="currentColor" />
        </svg>
    ),
    'gm-acoustic-bass': (
        <svg viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="2">
            <ellipse cx="22" cy="42" rx="11" ry="14" />
            <path d="M28 32 L42 18" strokeWidth="4" />
            <ellipse cx="44" cy="16" rx="4" ry="7" />
            <line x1="17" y1="34" x2="17" y2="50" strokeWidth="1" />
            <line x1="20" y1="33" x2="20" y2="51" strokeWidth="1" />
            <line x1="24" y1="33" x2="24" y2="51" strokeWidth="1" />
            <line x1="27" y1="34" x2="27" y2="50" strokeWidth="1" />
            <circle cx="22" cy="40" r="5" fill="currentColor" opacity="0.1" />
        </svg>
    ),
    'gm-electric-bass-finger': (
        <svg viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M10 38 L10 42 L28 42 L28 38 Z" />
            <path d="M28 40 L48 28" strokeWidth="3.5" />
            <path d="M46 26 L50 22 L54 26 L50 30 Z" />
            <line x1="14" y1="39" x2="14" y2="41" strokeWidth="1" />
            <line x1="18" y1="39" x2="18" y2="41" strokeWidth="1" />
            <line x1="22" y1="39" x2="22" y2="41" strokeWidth="1" />
            <line x1="26" y1="39" x2="26" y2="41" strokeWidth="1" />
            <rect x="16" y="39" width="8" height="2" fill="currentColor" opacity="0.3" />
            <circle cx="8" cy="40" r="2" fill="currentColor" />
        </svg>
    ),

    // ============= CATEGORY: WOODWINDS =============
    woodwinds: (
        <svg viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="8" y="28" width="48" height="8" rx="4" />
            <circle cx="18" cy="32" r="2" fill="currentColor" />
            <circle cx="28" cy="32" r="2" fill="currentColor" />
            <circle cx="38" cy="32" r="2" fill="currentColor" />
            <circle cx="48" cy="32" r="2" fill="currentColor" />
            <ellipse cx="23" cy="26" rx="3" ry="2" fill="currentColor" opacity="0.4" />
            <ellipse cx="33" cy="26" rx="3" ry="2" fill="currentColor" opacity="0.4" />
            <ellipse cx="43" cy="26" rx="3" ry="2" fill="currentColor" opacity="0.4" />
            <path d="M56 32 L60 30 L60 34 Z" fill="currentColor" />
        </svg>
    ),
    'gm-flute': (
        <svg viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="8" y="28" width="48" height="8" rx="4" />
            <circle cx="16" cy="32" r="2" fill="currentColor" />
            <circle cx="24" cy="32" r="2" fill="currentColor" />
            <circle cx="32" cy="32" r="2" fill="currentColor" />
            <circle cx="40" cy="32" r="2" fill="currentColor" />
            <circle cx="48" cy="32" r="2" fill="currentColor" />
            <ellipse cx="20" cy="26" rx="2" ry="1.5" fill="currentColor" opacity="0.4" />
            <ellipse cx="28" cy="26" rx="2" ry="1.5" fill="currentColor" opacity="0.4" />
            <path d="M56 32 L60 30 L60 34 Z" fill="currentColor" />
        </svg>
    ),
    'gm-clarinet': (
        <svg viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="12" y="26" width="40" height="12" rx="6" />
            <circle cx="20" cy="32" r="2.5" fill="currentColor" />
            <circle cx="28" cy="32" r="2.5" fill="currentColor" />
            <circle cx="36" cy="32" r="2.5" fill="currentColor" />
            <circle cx="44" cy="32" r="2.5" fill="currentColor" />
            <ellipse cx="24" cy="25" rx="3" ry="2" fill="currentColor" opacity="0.4" />
            <ellipse cx="32" cy="25" rx="3" ry="2" fill="currentColor" opacity="0.4" />
            <ellipse cx="40" cy="25" rx="3" ry="2" fill="currentColor" opacity="0.4" />
            <path d="M52 32 Q54 28 58 28 L58 36 Q54 36 52 32 Z" fill="currentColor" opacity="0.3" />
        </svg>
    ),
    saxophone: (
        <svg viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M20 52 Q12 48 16 40 L28 24" strokeLinecap="round" />
            <ellipse cx="18" cy="52" rx="6" ry="4" />
            <path d="M28 24 L40 12 Q44 8 48 12" strokeLinecap="round" />
            <path d="M48 12 L52 8" strokeWidth="3" strokeLinecap="round" />
            <circle cx="24" cy="36" r="3" fill="currentColor" opacity="0.3" />
            <circle cx="28" cy="30" r="3" fill="currentColor" opacity="0.3" />
            <circle cx="34" cy="22" r="3" fill="currentColor" opacity="0.3" />
            <circle cx="40" cy="16" r="2" fill="currentColor" opacity="0.3" />
        </svg>
    ),
    'gm-alto-sax': (
        <svg viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M20 52 Q12 48 16 40 L28 24" strokeLinecap="round" />
            <ellipse cx="18" cy="52" rx="6" ry="4" />
            <path d="M28 24 L40 12 Q44 8 48 12" strokeLinecap="round" />
            <path d="M48 12 L52 8" strokeWidth="3" strokeLinecap="round" />
            <circle cx="24" cy="36" r="3" fill="currentColor" opacity="0.3" />
            <circle cx="28" cy="30" r="3" fill="currentColor" opacity="0.3" />
            <circle cx="34" cy="22" r="3" fill="currentColor" opacity="0.3" />
        </svg>
    ),

    // ============= CATEGORY: BRASS =============
    brass: (
        <svg viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M8 32 L28 32 L28 24 L40 16" strokeWidth="2.5" />
            <path d="M40 16 Q48 16 52 24 Q56 32 48 32 L44 32" strokeLinecap="round" />
            <ellipse cx="46" cy="32" rx="6" ry="5" />
            <circle cx="14" cy="32" r="3" fill="currentColor" opacity="0.3" />
            <circle cx="22" cy="32" r="3" fill="currentColor" opacity="0.3" />
            <circle cx="30" cy="27" r="2" fill="currentColor" opacity="0.3" />
        </svg>
    ),
    'gm-trumpet': (
        <svg viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M8 32 L32 32 L32 28 L44 22" strokeWidth="2.5" />
            <path d="M44 22 Q52 22 56 28 Q58 32 52 34 L48 34" strokeLinecap="round" />
            <ellipse cx="50" cy="33" rx="6" ry="5" />
            <rect x="14" y="30" width="4" height="6" rx="2" fill="currentColor" opacity="0.3" />
            <rect x="22" y="30" width="4" height="6" rx="2" fill="currentColor" opacity="0.3" />
            <rect x="30" y="26" width="3" height="4" rx="1.5" fill="currentColor" opacity="0.3" />
            <circle cx="10" cy="32" r="2.5" fill="currentColor" />
        </svg>
    ),
    'gm-trombone': (
        <svg viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M8 32 L24 32" />
            <path d="M24 28 L24 36 L32 36 L32 28 L38 28" />
            <path d="M38 28 Q46 28 50 34 Q54 40 46 42 L42 42" strokeLinecap="round" />
            <ellipse cx="44" cy="42" rx="7" ry="6" />
            <circle cx="10" cy="32" r="2.5" fill="currentColor" />
        </svg>
    ),
    'gm-french-horn': (
        <svg viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="32" cy="32" r="16" />
            <circle cx="32" cy="32" r="10" />
            <circle cx="32" cy="32" r="6" fill="currentColor" opacity="0.2" />
            <path d="M48 32 Q52 32 54 36 Q56 40 52 42 L48 42" strokeLinecap="round" />
            <ellipse cx="50" cy="42" rx="4" ry="3" />
            <path d="M20 24 L16 20 Q14 18 12 20" strokeWidth="1.5" />
            <circle cx="26" cy="26" r="2" fill="currentColor" opacity="0.3" />
            <circle cx="38" cy="26" r="2" fill="currentColor" opacity="0.3" />
            <circle cx="38" cy="38" r="2" fill="currentColor" opacity="0.3" />
        </svg>
    ),
    'gm-tuba': (
        <svg viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M24 12 L24 32 Q24 44 32 50 Q40 44 40 32 L40 12" strokeLinecap="round" />
            <ellipse cx="32" cy="50" rx="12" ry="8" />
            <path d="M18 16 L18 28 Q18 32 22 32" />
            <circle cx="20" cy="20" r="2" fill="currentColor" opacity="0.3" />
            <circle cx="28" cy="16" r="2" fill="currentColor" opacity="0.3" />
            <circle cx="36" cy="16" r="2" fill="currentColor" opacity="0.3" />
        </svg>
    ),

    // ============= CATEGORY: SYNTH =============
    synth: (
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

    // ============= CATEGORY: PERCUSSION =============
    percussion: (
        <svg viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="2">
            <ellipse cx="32" cy="24" rx="16" ry="4" />
            <line x1="16" y1="24" x2="16" y2="42" />
            <line x1="48" y1="24" x2="48" y2="42" />
            <ellipse cx="32" cy="42" rx="16" ry="4" />
            <path d="M20 12 L28 22" strokeWidth="2" strokeLinecap="round" />
            <path d="M44 12 L36 22" strokeWidth="2" strokeLinecap="round" />
            <circle cx="18" cy="10" r="3" fill="currentColor" opacity="0.3" />
            <circle cx="46" cy="10" r="3" fill="currentColor" opacity="0.3" />
        </svg>
    ),
    'gm-vibraphone': (
        <svg viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="12" y="24" width="6" height="16" rx="1" />
            <rect x="20" y="20" width="6" height="20" rx="1" />
            <rect x="28" y="18" width="6" height="22" rx="1" />
            <rect x="36" y="20" width="6" height="20" rx="1" />
            <rect x="44" y="24" width="6" height="16" rx="1" />
            <line x1="10" y1="44" x2="54" y2="44" strokeWidth="3" />
            <circle cx="16" cy="14" r="2" fill="currentColor" />
            <circle cx="24" cy="10" r="2" fill="currentColor" />
            <circle cx="32" cy="8" r="2" fill="currentColor" />
        </svg>
    ),
    'gm-marimba': (
        <svg viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="10" y="26" width="5" height="14" rx="1" fill="currentColor" opacity="0.2" />
            <rect x="17" y="24" width="5" height="16" rx="1" fill="currentColor" opacity="0.2" />
            <rect x="24" y="22" width="5" height="18" rx="1" fill="currentColor" opacity="0.2" />
            <rect x="31" y="20" width="5" height="20" rx="1" fill="currentColor" opacity="0.2" />
            <rect x="38" y="22" width="5" height="18" rx="1" fill="currentColor" opacity="0.2" />
            <rect x="45" y="24" width="5" height="16" rx="1" fill="currentColor" opacity="0.2" />
            <line x1="8" y1="44" x2="56" y2="44" strokeWidth="3" />
        </svg>
    ),

    // ============= CATEGORY: WORLD =============
    world: (
        <svg viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="2">
            <ellipse cx="24" cy="36" rx="8" ry="14" />
            <path d="M28 26 L32 14 L36 26" />
            <circle cx="32" cy="10" r="4" />
            <line x1="20" y1="30" x2="20" y2="42" strokeWidth="0.5" />
            <line x1="22" y1="28" x2="22" y2="44" strokeWidth="0.5" />
            <line x1="26" y1="28" x2="26" y2="44" strokeWidth="0.5" />
            <line x1="28" y1="30" x2="28" y2="42" strokeWidth="0.5" />
            <path d="M42 24 L50 24 L50 48 L42 48" strokeWidth="1.5" />
        </svg>
    ),
    'gm-sitar': (
        <svg viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="2">
            <ellipse cx="24" cy="36" rx="8" ry="14" />
            <path d="M28 26 L32 14 L36 26" />
            <circle cx="32" cy="10" r="4" />
            <line x1="20" y1="30" x2="20" y2="42" strokeWidth="0.5" />
            <line x1="22" y1="28" x2="22" y2="44" strokeWidth="0.5" />
            <line x1="26" y1="28" x2="26" y2="44" strokeWidth="0.5" />
            <line x1="28" y1="30" x2="28" y2="42" strokeWidth="0.5" />
            <path d="M42 24 L50 24 L50 48 L42 48" strokeWidth="1.5" />
        </svg>
    ),
    'gm-banjo': (
        <svg viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="24" cy="40" r="10" />
            <circle cx="24" cy="40" r="6" fill="currentColor" opacity="0.1" />
            <path d="M30 34 L44 20" strokeWidth="3" />
            <ellipse cx="46" cy="18" rx="3" ry="5" />
            <line x1="19" y1="35" x2="19" y2="45" strokeWidth="0.5" />
            <line x1="22" y1="34" x2="22" y2="46" strokeWidth="0.5" />
            <line x1="26" y1="34" x2="26" y2="46" strokeWidth="0.5" />
            <line x1="29" y1="35" x2="29" y2="45" strokeWidth="0.5" />
        </svg>
    ),

    // ============= PREMIUM INSTRUMENTS =============
    'salamander-piano': (
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
            <circle cx="32" cy="20" r="1.5" fill="currentColor" />
        </svg>
    )
};

// Helper function to get the appropriate icon for an instrument
// Hierarchy: Specific ID → Category → Node Type → Default (piano)
function getInstrumentIcon(instrumentId: string): React.ReactNode {
    // 1. Try exact instrument ID match
    if (InstrumentIcons[instrumentId]) {
        return InstrumentIcons[instrumentId];
    }

    // 2. Try category match (get category from instrument definition)
    const definition = InstrumentLoader.getDefinition(instrumentId);
    if (definition?.category && InstrumentIcons[definition.category]) {
        return InstrumentIcons[definition.category];
    }

    // 3. Fallback to piano
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
    incomingConnectionCount = 0,
    style
}: InstrumentNodeProps) {
    const data = node.data as unknown as InstrumentNodeData;
    const updateNodeData = useGraphStore((s) => s.updateNodeData);
    const updateNodeType = useGraphStore((s) => s.updateNodeType);
    const connections = useGraphStore((s) => s.connections);
    const isAudioContextReady = useAudioStore((s) => s.isAudioContextReady);

    // Internal audio state
    const nodeRef = useRef<HTMLDivElement>(null);

    // Popup state
    const [showPopup, setShowPopup] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [dropdownStyle, setDropdownStyle] = useState<React.CSSProperties>({});

    // Drag state
    const [dragStartPos, setDragStartPos] = useState<{x: number, y: number} | null>(null);

    // Inline editing state
    const [editingPort, setEditingPort] = useState<string | null>(null);
    const [editingField, setEditingField] = useState<'note' | 'octave' | 'offset' | null>(null);
    const [editValue, setEditValue] = useState('');

    // Get available categories for this node type
    const availableCategories = useMemo(() => {
        return getAllowedCategories(node.type);
    }, [node.type]);

    // Initialize instrument audio - managed by AudioGraphManager
    useEffect(() => {
        // AudioGraphManager handles instrument creation
        // This effect is kept for future enhancements like loading state UI
    }, [isAudioContextReady, node.type]);

    // Handle keyboard shortcuts for popup (Escape to close, Ctrl+Arrow to switch node type)
    useEffect(() => {
        if (!showPopup) return;

        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                e.preventDefault();
                setShowPopup(false);
                setSearchQuery('');
            } else if (e.ctrlKey && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
                e.preventDefault();

                // Get current node type index
                const currentIndex = INSTRUMENT_NODE_TYPES.indexOf(node.type as any);
                const validIndex = currentIndex >= 0 ? currentIndex : 0;

                // Calculate new index
                let newIndex: number;
                if (e.key === 'ArrowRight') {
                    newIndex = (validIndex + 1) % INSTRUMENT_NODE_TYPES.length;
                } else {
                    newIndex = (validIndex - 1 + INSTRUMENT_NODE_TYPES.length) % INSTRUMENT_NODE_TYPES.length;
                }

                // Update node type
                const newType = INSTRUMENT_NODE_TYPES[newIndex];
                updateNodeType(node.id, newType);
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [showPopup, node.type, node.id, updateNodeType]);

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

        // Use ResizeObserver to detect node size/position changes
        // This is more efficient than RAF loop - only fires when actual changes occur
        const resizeObserver = new ResizeObserver(() => {
            updateDropdownPosition();
        });
        resizeObserver.observe(nodeRef.current);

        // Also observe the canvas container for transform changes (pan/zoom)
        const canvasContainer = nodeRef.current.closest('.node-canvas-container');
        if (canvasContainer) {
            resizeObserver.observe(canvasContainer);
        }

        // Fallback: throttled interval check for transforms (only if needed)
        // Much more efficient than RAF - 100ms interval vs 16ms
        const intervalId = window.setInterval(updateDropdownPosition, 100);

        return () => {
            window.removeEventListener('resize', updateDropdownPosition);
            resizeObserver.disconnect();
            clearInterval(intervalId);
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

    // Get display name - prioritize instrumentId from data, fall back to node type
    const instrumentData = node.data as InstrumentNodeData;
    const instrumentId = instrumentData.instrumentId || node.type;
    const displayName = INSTRUMENT_LABELS[instrumentId] || nodeDefinitions[node.type]?.name || 'Instrument';

    // Filter instruments by node type
    const filteredInstruments = useMemo(() => {
        // Get all instruments from allowed categories
        let instruments: string[] = [];
        availableCategories.forEach(category => {
            const categoryInstruments = InstrumentLoader.getDefinitionsByCategory(category as any);
            instruments.push(...categoryInstruments.map(def => def.id));
        });

        // Apply search filter
        const query = searchQuery.toLowerCase().trim();
        if (query) {
            instruments = instruments.filter(id =>
                INSTRUMENT_LABELS[id]?.toLowerCase().includes(query)
            );
        }

        return instruments;
    }, [node.type, searchQuery, availableCategories]);

    // Group instruments by their base name
    const groupedInstruments = useMemo(() => {
        const groups = new Map<string, string[]>();

        filteredInstruments.forEach(id => {
            const def = InstrumentLoader.getDefinition(id);
            if (!def) return;

            // Extract base name (e.g., "Cello" from "Cello" or "Electric Cello")
            const baseName = def.name;

            if (!groups.has(baseName)) {
                groups.set(baseName, []);
            }
            groups.get(baseName)!.push(id);
        });

        // Convert to sorted array
        return Array.from(groups.entries())
            .map(([baseName, instruments]) => ({ baseName, instruments }))
            .sort((a, b) => a.baseName.localeCompare(b.baseName));
    }, [filteredInstruments]);

    // Handle header mouse down - track drag start
    const handleHeaderMouseDownLocal = (e: React.MouseEvent) => {
        setDragStartPos({ x: e.clientX, y: e.clientY });
        handleHeaderMouseDown?.(e);
    };

    // Handle instrument name click to open popup (only if not dragging)
    const handleInstrumentNameClick = (e: React.MouseEvent) => {
        // Don't open if node is being dragged
        if (isDragging) {
            return;
        }

        // Don't open if mouse moved significantly from initial click
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
    const handleInstrumentSelect = (instrumentId: string) => {
        // Update node data with the new instrumentId
        const currentData = node.data as InstrumentNodeData;
        updateNodeData(node.id, {
            ...currentData,
            instrumentId: instrumentId
        });
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
                        <div className="instrument-grid-grouped">
                            {groupedInstruments.map((group, groupIndex) => (
                                <div key={group.baseName} className="instrument-group">
                                    {/* Group separator (except for first group) */}
                                    {groupIndex > 0 && <div className="instrument-group-separator" />}

                                    {/* Group label (if multiple groups) */}
                                    {groupedInstruments.length > 1 && (
                                        <div className="instrument-group-label">{group.baseName}</div>
                                    )}

                                    {/* Instruments in group */}
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
