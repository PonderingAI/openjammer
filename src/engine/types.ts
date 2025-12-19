/**
 * OpenJammer - Core Type Definitions
 * 
 * This file defines all the core types for the node graph system.
 * Connection types are color-coded and directional/bidirectional.
 */

// ============================================================================
// Connection Types
// ============================================================================

export type ConnectionType = 'audio' | 'technical';

export interface PortDefinition {
    id: string;
    name: string;
    type: ConnectionType;
    direction: 'input' | 'output';
    isBundled?: boolean; // True if this port represents multiple bundled signals
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
    | 'output';

export type NodeType =
    | 'keyboard'
    | 'microphone'
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
    | 'canvas-output';  // Output node (sends to parent level)

export interface Position {
    x: number;
    y: number;
}

export interface NodeData {
    // Common fields
    [key: string]: unknown;

    // Bundle configuration (for advanced mode modal)
    bundleConfig?: BundleConfig;
}

export interface InstrumentNodeData extends NodeData {
    instrumentId?: string; // ID from InstrumentDefinitions (optional, falls back to legacy type mapping)
    offsets: { [portId: string]: number }; // Per-input pitch offset (semitones)
    octaveOffsets?: { [portId: string]: number }; // Per-input octave adjustment
    noteOffsets?: { [portId: string]: number }; // Per-input note adjustment (0-6 for C-B)
    activeInputs: string[]; // List of active input port IDs
    isLoading?: boolean; // For UI loading indicator
}

export interface KeyConfig {
    keyCode: string;           // 'q', 'w', 'KeyA', etc.
    note?: string;             // 'C4', 'D4', etc. (for custom mapping)
    octaveOffset?: number;     // octave adjustment
    velocity?: number;         // fixed velocity (0-1) for this key
    enabled: boolean;          // can disable individual keys
}

// ============================================================================
// Bundle Configuration (Advanced Mode Modal)
// ============================================================================

export interface BundlePort {
    id: string;              // 'bundle-0', 'bundle-1', ...
    name: string;            // User-defined name or default "Bundle 1"
    type: 'input' | 'output';
    portIds: string[];       // Internal port IDs connected to this bundle
}

export interface BundleConfig {
    inputBundles: BundlePort[];   // Bundles that receive from main canvas
    outputBundles: BundlePort[];  // Bundles that send to main canvas

    // Mapping from internal ports to bundles
    internalToBundle: Record<string, string>;  // 'key-q' → 'bundle-0'
    bundleToInternal: Record<string, string[]>; // 'bundle-0' → ['key-q', 'key-w', 'key-e']
}

export interface KeyboardNodeData extends NodeData {
    assignedKey: number; // 2-9
    activeRow: number | null;
    rowOctaves: [number, number, number];

    // New bundled connection support
    viewMode?: 'simple' | 'advanced'; // toggle between bundled vs individual ports
    keyConfigs?: Record<string, KeyConfig>; // 'q' → KeyConfig (for advanced mode)
    bundleDefaults?: {
        velocity: number;        // default velocity for computer keyboard (0-1)
        noteMapping: 'chromatic' | 'custom';
    };
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

// ============================================================================
// Node Definition
// ============================================================================

export interface GraphNode {
    id: string;
    type: NodeType;
    category: NodeCategory;
    position: Position;
    data: NodeData;
    ports: PortDefinition[];

    // Hierarchical canvas support
    internalNodes?: Map<string, GraphNode>;       // Nodes inside this node
    internalConnections?: Connection[];           // Connections inside this node
    specialNodes?: string[];                      // IDs of undeletable nodes (keyboard viz, default I/O)
}

// ============================================================================
// Graph State
// ============================================================================

export interface GraphState {
    nodes: Map<string, GraphNode>;
    connections: Map<string, Connection>;
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
