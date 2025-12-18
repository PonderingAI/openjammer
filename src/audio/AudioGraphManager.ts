/**
 * AudioGraphManager - Bridge between visual node graph and Web Audio API
 *
 * Watches graphStore for connection changes and creates corresponding Web Audio connections.
 * Handles hot-swapping during playback with gain ramping to prevent clicks.
 */

import { getAudioContext } from './AudioEngine';
import { createInstrument, Instrument } from './Instruments';
import type { InstrumentType } from './Instruments';
import { createEffect, Effect } from './Effects';
import { Looper } from './Looper';
import { Recorder } from './Recorder';
import type { GraphNode, Connection, NodeType, EffectNodeData, AmplifierNodeData, SpeakerNodeData } from '../engine/types';

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

        // Connect audio connections
        audioConnections.forEach(connection => {
            this.connectAudioNodes(
                connection.sourceNodeId,
                connection.targetNodeId
            );
        });
    }

    /**
     * Connect two audio nodes
     */
    private connectAudioNodes(sourceNodeId: string, targetNodeId: string): void {
        const ctx = getAudioContext();
        if (!ctx) return;

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

            // Disconnect after fade
            setTimeout(() => {
                try {
                    sourceAudioNode.outputNode?.disconnect(targetAudioNode.inputNode!);
                } catch {
                    // May not be connected
                }
            }, this.RAMP_TIME * 1000 + 10);
        } else {
            try {
                sourceAudioNode.outputNode.disconnect(targetAudioNode.inputNode);
            } catch {
                // May not be connected
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
}

// ============================================================================
// Singleton Export
// ============================================================================

export const audioGraphManager = new AudioGraphManager();
