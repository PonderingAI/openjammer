/**
 * AudioGraphManager - Bridge between visual node graph and Web Audio API
 *
 * Watches graphStore for connection changes and creates corresponding Web Audio connections.
 * Handles hot-swapping during playback with gain ramping to prevent clicks.
 */

import { getAudioContext } from './AudioEngine';
import { createInstrument, Instrument, getNoteName } from './Instruments';
import type { InstrumentType } from './Instruments';
import { createEffect, Effect } from './Effects';
import { Looper } from './Looper';
import { Recorder } from './Recorder';
import type { GraphNode, Connection, NodeType, EffectNodeData, AmplifierNodeData, SpeakerNodeData, InstrumentNodeData, NodeData } from '../engine/types';

// Type guard for instrument node data
function isInstrumentNodeData(data: NodeData): data is InstrumentNodeData {
    return typeof data === 'object' && data !== null && 'offsets' in data;
}
import { useGraphStore } from '../store/graphStore';

// ============================================================================
// Types
// ============================================================================

export interface AudioNodeInstance {
    nodeId: string;
    type: NodeType;
    inputNode: AudioNode | null;
    outputNode: AudioNode | null;
    instance: Instrument | Effect | Looper | Recorder | GainNode | MediaStreamAudioSourceNode | null;
    gainEnvelope: GainNode | null; // For smooth connect/disconnect
}

type ConnectionChangeCallback = (connections: Map<string, Connection>) => void;
type NodeChangeCallback = (nodes: Map<string, GraphNode>) => void;

// ============================================================================
// AudioGraphManager
// ============================================================================

class AudioGraphManager {
    private audioNodes: Map<string, AudioNodeInstance> = new Map();
    private activeAudioConnections: Set<string> = new Set(); // Track "sourceId->targetId" pairs
    private pendingDisconnects: Map<string, number> = new Map(); // Track pending disconnect timeouts
    private isInitialized: boolean = false;
    private unsubscribeGraph: (() => void) | null = null;

    // Ramp time for smooth transitions (10ms)
    private readonly RAMP_TIME = 0.01;

    /**
     * Initialize the manager and subscribe to graph changes
     */
    initialize(
        subscribeToConnections: (callback: ConnectionChangeCallback) => () => void,
        subscribeToNodes: (callback: NodeChangeCallback) => () => void,
        getNodes: () => Map<string, GraphNode>,
        getConnections: () => Map<string, Connection>
    ): void {
        if (this.isInitialized) return;

        // Subscribe to node changes
        const unsubNodes = subscribeToNodes((nodes) => {
            this.syncNodes(nodes);
        });

        // Subscribe to connection changes
        const unsubConns = subscribeToConnections((connections) => {
            this.syncConnections(connections, getNodes());
        });

        // Initial sync
        this.syncNodes(getNodes());
        this.syncConnections(getConnections(), getNodes());

        this.unsubscribeGraph = () => {
            unsubNodes();
            unsubConns();
        };

        this.isInitialized = true;
    }

    /**
     * Cleanup and disconnect all audio nodes
     */
    dispose(): void {
        this.audioNodes.forEach((nodeInstance) => {
            this.destroyAudioNode(nodeInstance);
        });
        this.audioNodes.clear();
        this.activeAudioConnections.clear();

        if (this.unsubscribeGraph) {
            this.unsubscribeGraph();
            this.unsubscribeGraph = null;
        }

        this.isInitialized = false;
    }

    /**
     * Get audio node instance by node ID
     */
    getAudioNode(nodeId: string): AudioNodeInstance | undefined {
        return this.audioNodes.get(nodeId);
    }

    /**
     * Get all audio node instances
     */
    getAllAudioNodes(): Map<string, AudioNodeInstance> {
        return new Map(this.audioNodes);
    }

    // ============================================================================
    // Node Sync
    // ============================================================================

    /**
     * Sync audio nodes with graph nodes
     */
    private syncNodes(graphNodes: Map<string, GraphNode>): void {
        // Remove audio nodes that no longer exist in graph
        this.audioNodes.forEach((audioNode, nodeId) => {
            if (!graphNodes.has(nodeId)) {
                this.destroyAudioNode(audioNode);
                this.audioNodes.delete(nodeId);
            }
        });

        // Create audio nodes for new graph nodes
        graphNodes.forEach((graphNode, nodeId) => {
            if (!this.audioNodes.has(nodeId)) {
                const audioNode = this.createAudioNode(graphNode);
                if (audioNode) {
                    this.audioNodes.set(nodeId, audioNode);
                }
            }
        });
    }

    /**
     * Create an audio node instance for a graph node
     */
    private createAudioNode(graphNode: GraphNode): AudioNodeInstance | null {
        const ctx = getAudioContext();
        if (!ctx) return null;

        const baseInstance: AudioNodeInstance = {
            nodeId: graphNode.id,
            type: graphNode.type,
            inputNode: null,
            outputNode: null,
            instance: null,
            gainEnvelope: null
        };

        // Create gain envelope for smooth transitions
        const gainEnvelope = ctx.createGain();
        gainEnvelope.gain.value = 1;
        baseInstance.gainEnvelope = gainEnvelope;

        switch (graphNode.type) {
            // Instruments - output only
            case 'piano':
            case 'cello':
            case 'violin':
            case 'saxophone':
            case 'strings':
            case 'keys':
            case 'winds': {
                const instrumentType = this.mapToInstrumentType(graphNode.type);
                const instrument = createInstrument(instrumentType);
                const output = instrument.getOutput();
                if (output) {
                    output.disconnect(); // Disconnect from master
                    output.connect(gainEnvelope);
                }
                baseInstance.instance = instrument;
                baseInstance.outputNode = gainEnvelope;
                break;
            }

            // Microphone - output only
            case 'microphone': {
                // Microphone creates its own source node when activated
                // We just set up the output routing
                baseInstance.outputNode = gainEnvelope;
                break;
            }

            // Keyboard - no audio, just control signals
            case 'keyboard': {
                // Keyboards don't process audio, they send control signals
                return null;
            }

            // Looper - input and output
            case 'looper': {
                const looper = new Looper(graphNode.data.duration as number || 10);
                const looperOutput = looper.getOutput();
                if (looperOutput) {
                    looperOutput.disconnect(); // Disconnect from master
                    looperOutput.connect(gainEnvelope);
                }

                // Get input node from looper (creates analyser + MediaStreamDestination)
                const looperInput = looper.getInputNode();

                baseInstance.instance = looper;
                baseInstance.inputNode = looperInput;
                baseInstance.outputNode = gainEnvelope;
                break;
            }

            // Effects - input and output
            case 'effect': {
                const effectData = graphNode.data as EffectNodeData;
                const effect = createEffect(effectData.effectType, effectData.params);
                const effectInput = effect.getInput();
                const effectOutput = effect.getOutput();

                if (effectOutput) {
                    effectOutput.connect(gainEnvelope);
                }

                baseInstance.instance = effect;
                baseInstance.inputNode = effectInput;
                baseInstance.outputNode = gainEnvelope;
                break;
            }

            // Amplifier - input and output
            case 'amplifier': {
                const ampData = graphNode.data as AmplifierNodeData;
                const ampGain = ctx.createGain();
                ampGain.gain.value = ampData.gain ?? 1;
                ampGain.connect(gainEnvelope);

                baseInstance.instance = ampGain;
                baseInstance.inputNode = ampGain;
                baseInstance.outputNode = gainEnvelope;
                break;
            }

            // Speaker - input only, connects to destination
            case 'speaker': {
                const speakerData = graphNode.data as SpeakerNodeData;
                const speakerGain = ctx.createGain();
                speakerGain.gain.value = speakerData.isMuted ? 0 : (speakerData.volume ?? 1);

                // Connect to audio destination (or selected device)
                speakerGain.connect(ctx.destination);

                baseInstance.instance = speakerGain;
                baseInstance.inputNode = speakerGain;
                baseInstance.outputNode = speakerGain; // Also output for chaining to recorder
                break;
            }

            // Recorder - input only
            case 'recorder': {
                const recorder = new Recorder();
                const recorderInput = recorder.getInput();

                baseInstance.instance = recorder;
                baseInstance.inputNode = recorderInput;
                break;
            }

            default:
                return null;
        }

        return baseInstance;
    }

    /**
     * Destroy an audio node instance
     */
    private destroyAudioNode(audioNode: AudioNodeInstance): void {
        const ctx = getAudioContext();
        if (!ctx) return;

        // Fade out before disconnecting
        if (audioNode.gainEnvelope) {
            const now = ctx.currentTime;
            audioNode.gainEnvelope.gain.setValueAtTime(
                audioNode.gainEnvelope.gain.value,
                now
            );
            audioNode.gainEnvelope.gain.linearRampToValueAtTime(0, now + this.RAMP_TIME);

            // Disconnect after fade
            setTimeout(() => {
                audioNode.gainEnvelope?.disconnect();
            }, this.RAMP_TIME * 1000 + 10);
        }

        // Cleanup specific instance types
        if (audioNode.instance instanceof Instrument) {
            audioNode.instance.disconnect();
        } else if (audioNode.instance instanceof Effect) {
            audioNode.instance.disconnect();
        } else if (audioNode.instance instanceof Looper) {
            audioNode.instance.disconnect();
        } else if (audioNode.instance instanceof Recorder) {
            audioNode.instance.disconnect();
        } else if (audioNode.instance instanceof GainNode) {
            audioNode.instance.disconnect();
        }

        // Disconnect nodes
        audioNode.inputNode?.disconnect();
        audioNode.outputNode?.disconnect();
    }

    /**
     * Map node type to instrument type
     */
    private mapToInstrumentType(nodeType: NodeType): InstrumentType {
        switch (nodeType) {
            case 'piano':
            case 'keys':
                return 'piano';
            case 'cello':
            case 'strings':
                return 'cello';
            case 'violin':
                return 'violin';
            case 'saxophone':
            case 'winds':
                return 'saxophone';
            default:
                return 'piano';
        }
    }

    // ============================================================================
    // Connection Sync
    // ============================================================================

    /**
     * Sync audio connections with graph connections
     */
    private syncConnections(
        graphConnections: Map<string, Connection>,
        _graphNodes: Map<string, GraphNode>
    ): void {
        // Only handle audio connections, not technical/control connections
        const audioConnections = Array.from(graphConnections.values())
            .filter(conn => conn.type === 'audio');

        // Build set of current connection keys
        const currentConnectionKeys = new Set<string>();
        audioConnections.forEach(connection => {
            const key = `${connection.sourceNodeId}->${connection.targetNodeId}`;
            currentConnectionKeys.add(key);
        });

        // Find and disconnect removed connections
        this.activeAudioConnections.forEach(key => {
            if (!currentConnectionKeys.has(key)) {
                const [sourceNodeId, targetNodeId] = key.split('->');
                this.disconnectAudioNodes(sourceNodeId, targetNodeId);
            }
        });

        // Connect new audio connections
        audioConnections.forEach(connection => {
            const key = `${connection.sourceNodeId}->${connection.targetNodeId}`;
            if (!this.activeAudioConnections.has(key)) {
                this.connectAudioNodes(
                    connection.sourceNodeId,
                    connection.targetNodeId
                );
            }
        });

        // Update tracked connections
        this.activeAudioConnections = currentConnectionKeys;
    }

    /**
     * Connect two audio nodes
     */
    private connectAudioNodes(sourceNodeId: string, targetNodeId: string): void {
        const ctx = getAudioContext();
        if (!ctx) return;

        const connectionKey = `${sourceNodeId}->${targetNodeId}`;

        // Cancel any pending disconnect for this connection (race condition fix)
        const pendingTimeout = this.pendingDisconnects.get(connectionKey);
        if (pendingTimeout !== undefined) {
            clearTimeout(pendingTimeout);
            this.pendingDisconnects.delete(connectionKey);
        }

        const sourceAudioNode = this.audioNodes.get(sourceNodeId);
        const targetAudioNode = this.audioNodes.get(targetNodeId);

        if (!sourceAudioNode?.outputNode || !targetAudioNode?.inputNode) {
            return;
        }

        // Check if already connected (Web Audio doesn't track this, so we manage it)
        try {
            // Fade in the connection smoothly
            if (sourceAudioNode.gainEnvelope) {
                const now = ctx.currentTime;
                sourceAudioNode.gainEnvelope.gain.setValueAtTime(0, now);
                sourceAudioNode.gainEnvelope.gain.linearRampToValueAtTime(1, now + this.RAMP_TIME);
            }

            // Connect output to input
            sourceAudioNode.outputNode.connect(targetAudioNode.inputNode);
        } catch (e) {
            // Connection may already exist, that's fine
            console.debug('Connection already exists or failed:', e);
        }
    }

    /**
     * Disconnect two audio nodes
     */
    disconnectAudioNodes(sourceNodeId: string, targetNodeId: string): void {
        const ctx = getAudioContext();
        if (!ctx) return;

        const connectionKey = `${sourceNodeId}->${targetNodeId}`;
        const sourceAudioNode = this.audioNodes.get(sourceNodeId);
        const targetAudioNode = this.audioNodes.get(targetNodeId);

        if (!sourceAudioNode?.outputNode || !targetAudioNode?.inputNode) {
            return;
        }

        // Fade out before disconnecting
        if (sourceAudioNode.gainEnvelope) {
            const now = ctx.currentTime;
            sourceAudioNode.gainEnvelope.gain.setValueAtTime(
                sourceAudioNode.gainEnvelope.gain.value,
                now
            );
            sourceAudioNode.gainEnvelope.gain.linearRampToValueAtTime(0, now + this.RAMP_TIME);

            // Track and disconnect after fade (can be canceled if reconnected)
            const timeoutId = window.setTimeout(() => {
                // Verify key still exists - callback may fire after reconnection canceled it
                if (this.pendingDisconnects.has(connectionKey)) {
                    this.pendingDisconnects.delete(connectionKey);
                    if (sourceAudioNode.outputNode && targetAudioNode.inputNode) {
                        try {
                            sourceAudioNode.outputNode.disconnect(targetAudioNode.inputNode);
                        } catch {
                            // May not be connected
                        }
                    }
                }
            }, this.RAMP_TIME * 1000 + 10);

            this.pendingDisconnects.set(connectionKey, timeoutId);
        } else {
            if (sourceAudioNode.outputNode && targetAudioNode.inputNode) {
                try {
                    sourceAudioNode.outputNode.disconnect(targetAudioNode.inputNode);
                } catch {
                    // May not be connected
                }
            }
        }
    }

    // ============================================================================
    // Public API for Node Components
    // ============================================================================

    /**
     * Get instrument instance for a node
     */
    getInstrument(nodeId: string): Instrument | null {
        const audioNode = this.audioNodes.get(nodeId);
        if (audioNode?.instance instanceof Instrument) {
            return audioNode.instance;
        }
        return null;
    }

    /**
     * Get effect instance for a node
     */
    getEffect(nodeId: string): Effect | null {
        const audioNode = this.audioNodes.get(nodeId);
        if (audioNode?.instance instanceof Effect) {
            return audioNode.instance;
        }
        return null;
    }

    /**
     * Get looper instance for a node
     */
    getLooper(nodeId: string): Looper | null {
        const audioNode = this.audioNodes.get(nodeId);
        if (audioNode?.instance instanceof Looper) {
            return audioNode.instance;
        }
        return null;
    }

    /**
     * Get recorder instance for a node
     */
    getRecorder(nodeId: string): Recorder | null {
        const audioNode = this.audioNodes.get(nodeId);
        if (audioNode?.instance instanceof Recorder) {
            return audioNode.instance;
        }
        return null;
    }

    /**
     * Update amplifier gain
     */
    updateAmplifierGain(nodeId: string, gain: number): void {
        const audioNode = this.audioNodes.get(nodeId);
        if (audioNode?.instance instanceof GainNode) {
            const ctx = getAudioContext();
            if (ctx) {
                const now = ctx.currentTime;
                audioNode.instance.gain.setValueAtTime(audioNode.instance.gain.value, now);
                audioNode.instance.gain.linearRampToValueAtTime(gain, now + this.RAMP_TIME);
            }
        }
    }

    /**
     * Update speaker volume/mute
     */
    updateSpeakerVolume(nodeId: string, volume: number, isMuted: boolean): void {
        const audioNode = this.audioNodes.get(nodeId);
        if (audioNode?.instance instanceof GainNode) {
            const ctx = getAudioContext();
            if (ctx) {
                const targetGain = isMuted ? 0 : volume;
                const now = ctx.currentTime;
                audioNode.instance.gain.setValueAtTime(audioNode.instance.gain.value, now);
                audioNode.instance.gain.linearRampToValueAtTime(targetGain, now + this.RAMP_TIME);
            }
        }
    }

    /**
     * Connect microphone stream to a node
     */
    async connectMicrophone(nodeId: string): Promise<MediaStreamAudioSourceNode | null> {
        const ctx = getAudioContext();
        if (!ctx) return null;

        const audioNode = this.audioNodes.get(nodeId);
        if (!audioNode) return null;

        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true
                }
            });

            const micSource = ctx.createMediaStreamSource(stream);

            if (audioNode.gainEnvelope) {
                micSource.connect(audioNode.gainEnvelope);
            }

            audioNode.instance = micSource;
            return micSource;
        } catch (e) {
            console.error('Failed to get microphone:', e);
            return null;
        }
    }

    /**
     * Disconnect microphone from a node
     */
    disconnectMicrophone(nodeId: string): void {
        const audioNode = this.audioNodes.get(nodeId);
        if (audioNode?.instance instanceof MediaStreamAudioSourceNode) {
            audioNode.instance.disconnect();
            // Stop the media stream tracks
            const mediaStream = audioNode.instance.mediaStream;
            mediaStream.getTracks().forEach(track => track.stop());
            audioNode.instance = null;
        }
    }

    /**
     * Set the output node for a microphone (called from MicrophoneNode component)
     * This allows the component to manage its own audio stream while routing through connections
     */
    setMicrophoneOutput(nodeId: string, outputNode: GainNode): void {
        const audioNode = this.audioNodes.get(nodeId);
        if (audioNode) {
            // Disconnect old output if exists
            if (audioNode.outputNode) {
                audioNode.outputNode.disconnect();
            }
            audioNode.outputNode = outputNode;

            // Re-establish any existing connections from this node
            this.reconnectNodeOutputs(nodeId);
        }
    }

    /**
     * Reconnect all outputs from a node (used when output node changes)
     */
    private reconnectNodeOutputs(nodeId: string): void {
        const audioNode = this.audioNodes.get(nodeId);
        if (!audioNode?.outputNode) return;

        // Get connections from graphStore
        const graphConnections = useGraphStore.getState().connections;

        // Find all audio connections from this node and reconnect
        for (const [, connection] of graphConnections) {
            if (connection.sourceNodeId === nodeId && connection.type === 'audio') {
                const targetAudioNode = this.audioNodes.get(connection.targetNodeId);
                if (targetAudioNode?.inputNode) {
                    try {
                        audioNode.outputNode.connect(targetAudioNode.inputNode);
                    } catch (e) {
                        // Connection might already exist
                    }
                }
            }
        }
    }

    // ============================================================================
    // Keyboard Note Triggering
    // ============================================================================

    /**
     * Trigger a note from keyboard input
     * @param keyboardId - The keyboard node ID
     * @param row - The active row (1, 2, or 3)
     * @param keyIndex - The key index within the row (0-9 for row 1/3, 0-8 for row 2)
     */
    triggerKeyboardNote(keyboardId: string, row: number, keyIndex: number): void {
        const graphConnections = useGraphStore.getState().connections;
        const graphNodes = useGraphStore.getState().nodes;

        // Get the keyboard node
        const keyboardNode = graphNodes.get(keyboardId);
        if (!keyboardNode) return;

        // Find the output port for this row (e.g., "row-1", "row-2", "row-3")
        const rowPortId = keyboardNode.ports.find(
            p => p.direction === 'output' && p.name.toLowerCase().includes(`row ${row}`)
        )?.id;

        if (!rowPortId) return;

        // Get keyboard's row octave settings
        const keyboardData = keyboardNode.data as { rowOctaves?: number[] };
        const rowOctaves = keyboardData.rowOctaves ?? [4, 3, 2]; // Default octaves for rows 1, 2, 3
        const baseOctave = rowOctaves[row - 1] ?? 4;

        // Find all connections from this port (technical connections to instruments)
        for (const [, connection] of graphConnections) {
            if (connection.sourceNodeId === keyboardId && connection.sourcePortId === rowPortId) {
                const targetNodeId = connection.targetNodeId;
                const targetNode = graphNodes.get(targetNodeId);

                if (!targetNode) continue;

                // Check if target is an instrument
                const instrumentTypes = ['piano', 'cello', 'electricCello', 'violin', 'saxophone', 'strings', 'keys', 'winds'];
                if (!instrumentTypes.includes(targetNode.type)) continue;

                // Validate instrument data with type guard
                if (!isInstrumentNodeData(targetNode.data)) continue;
                const instrumentData = targetNode.data;

                const targetPortId = connection.targetPortId;
                const semitoneOffset = instrumentData.offsets[targetPortId] ?? 0;
                const octaveOffset = instrumentData.octaveOffsets?.[targetPortId] ?? 0;
                const noteOffset = instrumentData.noteOffsets?.[targetPortId] ?? 0;

                // Calculate final note
                // keyIndex is 0-9, maps to chromatic notes
                // baseOctave is the octave from the keyboard row
                // Add instrument's offsets
                const finalOctave = baseOctave + octaveOffset;
                const finalNoteIndex = keyIndex + noteOffset + semitoneOffset;

                // Convert to note name string (e.g., "C4", "D#4")
                const noteName = getNoteName(finalNoteIndex, finalOctave);

                // Get the instrument and play the note
                const instrument = this.getInstrument(targetNodeId);
                if (instrument) {
                    instrument.playNote(noteName);
                }
            }
        }
    }

    /**
     * Release a note from keyboard input
     * @param keyboardId - The keyboard node ID
     * @param row - The active row (1, 2, or 3)
     * @param keyIndex - The key index within the row
     */
    releaseKeyboardNote(keyboardId: string, row: number, keyIndex: number): void {
        const graphConnections = useGraphStore.getState().connections;
        const graphNodes = useGraphStore.getState().nodes;

        // Get the keyboard node
        const keyboardNode = graphNodes.get(keyboardId);
        if (!keyboardNode) return;

        // Find the output port for this row
        const rowPortId = keyboardNode.ports.find(
            p => p.direction === 'output' && p.name.toLowerCase().includes(`row ${row}`)
        )?.id;

        if (!rowPortId) return;

        // Get keyboard's row octave settings
        const keyboardData = keyboardNode.data as { rowOctaves?: number[] };
        const rowOctaves = keyboardData.rowOctaves ?? [4, 3, 2];
        const baseOctave = rowOctaves[row - 1] ?? 4;

        // Find all connections from this port
        for (const [, connection] of graphConnections) {
            if (connection.sourceNodeId === keyboardId && connection.sourcePortId === rowPortId) {
                const targetNodeId = connection.targetNodeId;
                const targetNode = graphNodes.get(targetNodeId);

                if (!targetNode) continue;

                // Check if target is an instrument
                const instrumentTypes = ['piano', 'cello', 'electricCello', 'violin', 'saxophone', 'strings', 'keys', 'winds'];
                if (!instrumentTypes.includes(targetNode.type)) continue;

                // Validate instrument data with type guard
                if (!isInstrumentNodeData(targetNode.data)) continue;
                const instrumentData = targetNode.data;

                const targetPortId = connection.targetPortId;
                const semitoneOffset = instrumentData.offsets[targetPortId] ?? 0;
                const octaveOffset = instrumentData.octaveOffsets?.[targetPortId] ?? 0;
                const noteOffset = instrumentData.noteOffsets?.[targetPortId] ?? 0;

                // Calculate final note (same as trigger)
                const finalOctave = baseOctave + octaveOffset;
                const finalNoteIndex = keyIndex + noteOffset + semitoneOffset;

                // Convert to note name string
                const noteName = getNoteName(finalNoteIndex, finalOctave);

                // Get the instrument and stop the note
                const instrument = this.getInstrument(targetNodeId);
                if (instrument) {
                    instrument.stopNote(noteName);
                }
            }
        }
    }
}

// ============================================================================
// Singleton Export
// ============================================================================

export const audioGraphManager = new AudioGraphManager();
