/**
 * Audio Effects - Distortion, Pitch Shift, etc.
 */

import { getAudioContext } from './AudioEngine';

export type EffectType = 'distortion' | 'pitch' | 'reverb' | 'delay';

export interface EffectParams {
    [key: string]: number;
}

/**
 * Base Effect class
 */
export abstract class Effect {
    protected type: EffectType;
    protected inputNode: GainNode | null = null;
    protected outputNode: GainNode | null = null;
    protected params: EffectParams;

    constructor(type: EffectType, params: EffectParams = {}) {
        this.type = type;
        this.params = params;
        this.init();
    }

    protected abstract init(): void;

    abstract setParam(key: string, value: number): void;

    getInput(): GainNode | null {
        return this.inputNode;
    }

    getOutput(): GainNode | null {
        return this.outputNode;
    }

    connect(destination: AudioNode): void {
        this.outputNode?.connect(destination);
    }

    disconnect(): void {
        this.outputNode?.disconnect();
        this.inputNode?.disconnect();
    }
}

/**
 * Distortion Effect
 */
export class DistortionEffect extends Effect {
    private waveShaperNode: WaveShaperNode | null = null;

    constructor(amount: number = 0.5) {
        super('distortion', { amount });
    }

    protected init(): void {
        const ctx = getAudioContext();
        if (!ctx) return;

        this.inputNode = ctx.createGain();
        this.outputNode = ctx.createGain();
        this.waveShaperNode = ctx.createWaveShaper();

        this.updateCurve();

        this.inputNode.connect(this.waveShaperNode);
        this.waveShaperNode.connect(this.outputNode);
    }

    private updateCurve(): void {
        if (!this.waveShaperNode) return;

        const amount = Math.max(0, Math.min(1, this.params.amount || 0.5));
        const k = amount * 100;
        const samples = 44100;
        const curve = new Float32Array(samples);

        for (let i = 0; i < samples; i++) {
            const x = (i * 2) / samples - 1;
            curve[i] = ((3 + k) * x * 20 * (Math.PI / 180)) /
                (Math.PI + k * Math.abs(x));
        }

        this.waveShaperNode.curve = curve;
        this.waveShaperNode.oversample = '4x';
    }

    setParam(key: string, value: number): void {
        if (key === 'amount') {
            this.params.amount = value;
            this.updateCurve();
        }
    }
}

/**
 * Pitch Shift Effect (using playback rate)
 */
export class PitchShiftEffect extends Effect {
    private delayNode: DelayNode | null = null;

    constructor(semitones: number = 0) {
        super('pitch', { semitones });
    }

    protected init(): void {
        const ctx = getAudioContext();
        if (!ctx) return;

        // Simple pitch shift using delay modulation
        // Note: This is a simplified version; true pitch shifting is more complex
        this.inputNode = ctx.createGain();
        this.outputNode = ctx.createGain();
        this.delayNode = ctx.createDelay();

        this.inputNode.connect(this.delayNode);
        this.delayNode.connect(this.outputNode);

        this.updatePitch();
    }

    private updatePitch(): void {
        // Simple pitch visualization (actual pitch shifting would need more complex DSP)
        const semitones = this.params.semitones || 0;
        const ratio = Math.pow(2, semitones / 12);

        if (this.delayNode) {
            // Adjust delay for pitch effect (simplified)
            this.delayNode.delayTime.value = Math.abs(1 - ratio) * 0.01;
        }
    }

    setParam(key: string, value: number): void {
        if (key === 'semitones') {
            this.params.semitones = value;
            this.updatePitch();
        }
    }
}

/**
 * Reverb Effect
 */
export class ReverbEffect extends Effect {
    private convolverNode: ConvolverNode | null = null;
    private dryNode: GainNode | null = null;
    private wetNode: GainNode | null = null;

    constructor(mix: number = 0.3, decay: number = 2) {
        super('reverb', { mix, decay });
    }

    protected init(): void {
        const ctx = getAudioContext();
        if (!ctx) return;

        this.inputNode = ctx.createGain();
        this.outputNode = ctx.createGain();
        this.convolverNode = ctx.createConvolver();
        this.dryNode = ctx.createGain();
        this.wetNode = ctx.createGain();

        // Generate impulse response
        this.generateImpulseResponse();

        // Dry path
        this.inputNode.connect(this.dryNode);
        this.dryNode.connect(this.outputNode);

        // Wet path
        this.inputNode.connect(this.convolverNode);
        this.convolverNode.connect(this.wetNode);
        this.wetNode.connect(this.outputNode);

        this.updateMix();
    }

    private generateImpulseResponse(): void {
        const ctx = getAudioContext();
        if (!ctx || !this.convolverNode) return;

        const decay = this.params.decay || 2;
        const sampleRate = ctx.sampleRate;
        const length = sampleRate * decay;
        const impulse = ctx.createBuffer(2, length, sampleRate);

        for (let channel = 0; channel < 2; channel++) {
            const data = impulse.getChannelData(channel);
            for (let i = 0; i < length; i++) {
                data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, decay);
            }
        }

        this.convolverNode.buffer = impulse;
    }

    private updateMix(): void {
        const mix = Math.max(0, Math.min(1, this.params.mix || 0.3));

        if (this.dryNode) this.dryNode.gain.value = 1 - mix;
        if (this.wetNode) this.wetNode.gain.value = mix;
    }

    setParam(key: string, value: number): void {
        this.params[key] = value;

        if (key === 'mix') {
            this.updateMix();
        } else if (key === 'decay') {
            this.generateImpulseResponse();
        }
    }
}

/**
 * Delay Effect
 */
export class DelayEffect extends Effect {
    private delayNode: DelayNode | null = null;
    private feedbackNode: GainNode | null = null;
    private dryNode: GainNode | null = null;
    private wetNode: GainNode | null = null;

    constructor(time: number = 0.3, feedback: number = 0.4, mix: number = 0.3) {
        super('delay', { time, feedback, mix });
    }

    protected init(): void {
        const ctx = getAudioContext();
        if (!ctx) return;

        this.inputNode = ctx.createGain();
        this.outputNode = ctx.createGain();
        this.delayNode = ctx.createDelay(5);
        this.feedbackNode = ctx.createGain();
        this.dryNode = ctx.createGain();
        this.wetNode = ctx.createGain();

        // Set initial values
        this.delayNode.delayTime.value = this.params.time || 0.3;
        this.feedbackNode.gain.value = this.params.feedback || 0.4;

        // Dry path
        this.inputNode.connect(this.dryNode);
        this.dryNode.connect(this.outputNode);

        // Wet path with feedback
        this.inputNode.connect(this.delayNode);
        this.delayNode.connect(this.feedbackNode);
        this.feedbackNode.connect(this.delayNode);
        this.delayNode.connect(this.wetNode);
        this.wetNode.connect(this.outputNode);

        this.updateMix();
    }

    private updateMix(): void {
        const mix = Math.max(0, Math.min(1, this.params.mix || 0.3));

        if (this.dryNode) this.dryNode.gain.value = 1 - mix * 0.5;
        if (this.wetNode) this.wetNode.gain.value = mix;
    }

    setParam(key: string, value: number): void {
        this.params[key] = value;

        if (key === 'time' && this.delayNode) {
            this.delayNode.delayTime.value = value;
        } else if (key === 'feedback' && this.feedbackNode) {
            this.feedbackNode.gain.value = Math.min(0.95, value);
        } else if (key === 'mix') {
            this.updateMix();
        }
    }
}

/**
 * Create an effect by type
 */
export function createEffect(type: EffectType, params?: EffectParams): Effect {
    switch (type) {
        case 'distortion':
            return new DistortionEffect(params?.amount);
        case 'pitch':
            return new PitchShiftEffect(params?.semitones);
        case 'reverb':
            return new ReverbEffect(params?.mix, params?.decay);
        case 'delay':
            return new DelayEffect(params?.time, params?.feedback, params?.mix);
        default:
            return new DistortionEffect();
    }
}
