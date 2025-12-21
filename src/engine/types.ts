/**
 * OpenJammer - Core Type Definitions
 * 
 * This file defines all the core types for the node graph system.
 * Connection types are color-coded and directional/bidirectional.
 */

// ============================================================================
// Connection Types
// ============================================================================

export type ConnectionType = 'audio' | 'control' | 'universal';

export interface PortDefinition {
    id: string;
    name: string;
    type: ConnectionType;
    direction: 'input' | 'output';
    isBundled?: boolean; // True if this port represents multiple bundled signals

    // Fixed position (0-1 normalized, relative to node bounds)
    // If not specified, position is calculated from portLayout
    position?: { x: number; y: number };

    // For universal ports: what type they resolved to after connection
    resolvedType?: 'audio' | 'control' | null;

    // Hide label on parent node's external port (label still shows inside panel)
    // Default: false (labels are shown on parent)
    hideExternalLabel?: boolean;
}

// Port layout configuration for dynamic port positioning
export interface PortLayoutConfig {
    direction?: 'vertical' | 'horizontal';  // Default: 'vertical'

    // Spawn areas for dynamic ports (0-1 normalized coordinates)
    inputArea?: {
        x: number;       // X position (0 = left, 1 = right)
        startY: number;  // Start of vertical range
        endY: number;    // End of vertical range
    };
    outputArea?: {
        x: number;       // X position (0 = left, 1 = right)
        startY: number;  // Start of vertical range
        endY: number;    // End of vertical range
    };
}

export interface KeyMapping {
    keyId: string;             // 'key-q', 'key-w', etc.
    sourcePort: string;        // which key port it comes from
    note?: string;             // 'C4', 'D4', etc. (for custom mapping)
    targetChannel?: number;    // which channel in the bundle (0-29)
    enabled: boolean;          // can disable individual keys
}

export interface Connection {
    id: string;
    sourceNodeId: string;
    sourcePortId: string;
    targetNodeId: string;
    targetPortId: string;
    type: ConnectionType;

    // Bundled connection support
    isBundled?: boolean;        // true if this represents multiple signals
    bundleMapping?: KeyMapping[]; // only if isBundled=true
    signalValue?: number;       // 0-1 normalized value
}

// ============================================================================
// Node Types
// ============================================================================

export type NodeCategory =
    | 'instruments'
    | 'input'
    | 'effects'
    | 'routing'
    | 'output'
    | 'utility';

export type NodeType =
    | 'keyboard'
    | 'keyboard-key'    // Individual keyboard key (signal generator)
    | 'keyboard-visual' // Visual keyboard with per-key outputs (internal node)
    | 'instrument-visual' // Visual instrument with row configuration (internal node)
    | 'microphone'
    | 'midi'            // MIDI input device (generic)
    | 'midi-visual'     // Visual MIDI device representation (internal node)
    | 'minilab-3'       // Arturia MiniLab 3 with per-control outputs
    | 'piano'
    | 'cello'
    | 'electricCello'
    | 'violin'
    | 'saxophone'
    | 'strings'
    | 'keys'
    | 'winds'
    | 'instrument' // Generic instrument node (uses instrumentId in data)
    | 'looper'
    | 'effect'
    | 'amplifier'
    | 'speaker'
    | 'recorder'
    | 'canvas-input'   // Input node (receives from parent level)
    | 'canvas-output'  // Output node (sends to parent level)
    | 'output-panel'   // Multi-port output panel with editable labels
    | 'input-panel'    // Multi-port input panel with editable labels
    | 'container'      // Empty container node for grouping
    | 'add'            // Addition node (mixes signals)
    | 'subtract'       // Subtraction node (phase cancellation)
    | 'library';       // Sample library node for local audio files

export interface Position {
    x: number;
    y: number;
}

export interface NodeData {
    // Common fields
    [key: string]: unknown;
}

/**
 * Instrument row configuration - represents a connected bundle from keyboard
 */
export interface InstrumentRow {
    rowId: string;           // Unique row identifier
    sourceNodeId: string;    // Which keyboard node this came from
    sourcePortId: string;    // Which keyboard port this came from (composite ID)
    targetPortId: string;    // Which instrument input port receives this bundle
    label: string;           // Auto-pulled from source ("Row 1", "Pedal", etc.)
    spread: number;          // Offset increment between ports (default 0.5)
    baseNote: number;        // 0-6 (C-B)
    baseOctave: number;      // 0-8
    baseOffset: number;      // -24 to +24 semitones
    portCount: number;       // Number of ports in this row
    keyGains: number[];      // Per-key gain values (length = portCount)
}

export interface InstrumentNodeData extends NodeData {
    instrumentId?: string; // ID from InstrumentDefinitions (optional, falls back to legacy type mapping)

    // NEW: Row-based structure for bundle connections
    rows?: InstrumentRow[];

    // Legacy fields (kept for backwards compatibility)
    offsets?: { [portId: string]: number }; // Per-input pitch offset (semitones)
    octaveOffsets?: { [portId: string]: number }; // Per-input octave adjustment
    noteOffsets?: { [portId: string]: number }; // Per-input note adjustment (0-6 for C-B)
    activeInputs?: string[]; // List of active input port IDs
    isLoading?: boolean; // For UI loading indicator
}

export interface KeyConfig {
    keyCode: string;           // 'q', 'w', 'KeyA', etc.
    note?: string;             // 'C4', 'D4', etc. (for custom mapping)
    octaveOffset?: number;     // octave adjustment
    velocity?: number;         // fixed velocity (0-1) for this key
    enabled: boolean;          // can disable individual keys
}

export interface KeyboardNodeData extends NodeData {
    assignedKey: number; // 2-9
    activeRow: number | null;
    rowOctaves: [number, number, number];
}

export interface MicrophoneNodeData extends NodeData {
    isMuted: boolean;
    isActive: boolean;
    deviceId?: string;
    lowLatencyMode?: boolean; // Override global setting per node
}

export interface LooperNodeData extends NodeData {
    duration: number; // in seconds, default 10
    isRecording: boolean;
    loops: LoopData[];
    currentTime: number;
}

export interface LoopData {
    id: string;
    buffer: ArrayBuffer | null;
    startTime: number;
    duration: number;
    isMuted: boolean;
    effects: string[]; // Effect node IDs applied to this loop
}

export interface EffectNodeData extends NodeData {
    effectType: 'distortion' | 'pitch' | 'reverb' | 'delay';
    params: Record<string, number>;
}

export interface AmplifierNodeData extends NodeData {
    gain: number; // Multiplier: 2 = double, -2 = half
}

export interface SpeakerNodeData extends NodeData {
    volume: number; // 0-1
    isMuted: boolean;
    deviceId: string; // ID of selected output device
    sinkIdApplied?: boolean; // Track if setSinkId succeeded
}

export interface RecorderNodeData extends NodeData {
    isRecording: boolean;
    recordings: RecordingData[];
}

export interface RecordingData {
    id: string;
    buffer: ArrayBuffer | null;
    duration: number;
    timestamp: number;
}

export interface LibrarySampleRef {
    id: string;
    relativePath: string;
    displayName: string;
    libraryId: string;
}

export interface LibraryNodeData extends NodeData {
    // Library reference
    libraryId?: string;

    // Current sample selection
    currentSampleId?: string;

    // Samples used in this node (for workflow persistence)
    sampleRefs: LibrarySampleRef[];

    // Playback mode
    playbackMode: 'oneshot' | 'loop' | 'hold';

    // Volume (0-1)
    volume: number;

    // Missing samples detected on load
    missingSampleIds?: string[];
}

export interface MIDILearnedMapping {
    type: 'note' | 'cc' | 'pitchBend';
    channel: number;
    noteOrCC: number;  // Note number or CC number
}

export interface MIDIInputNodeData extends NodeData {
    // Device configuration
    deviceId: string | null;           // Selected MIDI input device ID
    presetId: string;                  // Preset ID (e.g., "arturia-minilab-3" or "generic")
    isConnected: boolean;              // Whether device is currently connected
    activeChannel: number;             // 0 = omni (all channels), 1-16 for specific

    // MIDI Learn state
    midiLearnMode: boolean;
    learnTarget: string | null;        // Port ID being learned
    learnedMappings: Record<string, MIDILearnedMapping>;
}

// ============================================================================
// Node Definition
// ============================================================================

export interface GraphNode {
    id: string;
    type: NodeType;
    category: NodeCategory;
    position: Position;  // Position relative to parent's coordinate space
    data: NodeData;
    ports: PortDefinition[];

    // Normalized hierarchical structure (flat with references)
    parentId: string | null;  // null = root-level node, otherwise ID of parent node
    childIds: string[];       // IDs of child nodes (empty array if leaf node)
    specialNodes?: string[];  // IDs of special child nodes (canvas-input/output, undeletable)

    // Port visibility configuration (for hierarchical nodes)
    showEmptyInputPorts?: boolean;   // Show input-panel ports even if not connected
    showEmptyOutputPorts?: boolean;  // Show output-panel ports even if not connected

    // Per-node viewport state (preserved when navigating)
    internalViewport?: {
        pan: Position;
        zoom: number;
    };
}

// ============================================================================
// Graph State
// ============================================================================

export interface GraphState {
    nodes: Map<string, GraphNode>;           // ALL nodes at all levels (flat)
    connections: Map<string, Connection>;    // ALL connections at all levels (flat)
    rootNodeIds: string[];                   // IDs of top-level nodes (parentId === null)
    selectedNodeIds: Set<string>;
    selectedConnectionIds: Set<string>;
}

// ============================================================================
// Canvas State
// ============================================================================

export interface CanvasState {
    pan: Position;
    zoom: number;
    isDragging: boolean;
    isPanning: boolean;
    dragStart: Position | null;
}

// ============================================================================
// Workflow Serialization
// ============================================================================

export interface SerializedWorkflow {
    version: string;
    name: string;
    createdAt: string;
    nodes: SerializedNode[];
    connections: SerializedConnection[];
}

export interface SerializedNode {
    id: string;
    type: NodeType;
    category: NodeCategory;
    position: Position;
    data: NodeData;
}

export interface SerializedConnection {
    id: string;
    sourceNodeId: string;
    sourcePortId: string;
    targetNodeId: string;
    targetPortId: string;
    type: ConnectionType;

    // Bundled connection support (for serialization)
    isBundled?: boolean;
    bundleMapping?: KeyMapping[];
    signalValue?: number;
}

// ============================================================================
// Node Registry
// ============================================================================

export interface NodeDefinition {
    type: NodeType;
    category: NodeCategory;
    name: string;
    description: string;
    defaultPorts: PortDefinition[];
    defaultData: NodeData;

    // Port layout configuration for this node type
    portLayout?: PortLayoutConfig;

    // Fixed dimensions (optional - for math-based port positioning)
    dimensions?: { width: number; height: number };

    // Whether this node can be entered with E key (default: true)
    // If false, pressing E will flash red instead of entering
    canEnter?: boolean;
}

// ============================================================================
// Audio Engine Types
// ============================================================================

export interface AudioNodeWrapper {
    nodeId: string;
    inputNode: AudioNode | null;
    outputNode: AudioNode | null;
    internalNodes: AudioNode[];
}
