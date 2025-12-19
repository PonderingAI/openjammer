/**
 * Shared types for sampled instruments
 */

export type LoadingState = 'idle' | 'loading' | 'loaded' | 'error';

export type VelocityCurve = 'linear' | 'exponential' | 'logarithmic';

export interface EnvelopeConfig {
  releaseTimeConstant?: number;
  releaseTimeConstantByRange?: Array<{
    minNote: string;
    maxNote: string;
    timeConstant: number;
  }>;
  attackTime?: number;
  attackCurve?: 'linear' | 'exponential';
}

export interface SamplerConfig {
  baseUrl?: string;
  release?: number;
  volume?: number;
}

export interface InstrumentDefinition {
  id: string;
  name: string;
  category: InstrumentCategory;
  subCategory?: string;
  library: 'smplr' | 'tone' | 'tonejs-piano' | 'webaudiofont' | 'karplus';
  config: Record<string, unknown>;
  icon?: string;
  defaultOctave?: number;
  noteRange?: { min: string; max: string };
  envelope?: EnvelopeConfig;
  velocityCurve?: VelocityCurve;
}

export type InstrumentCategory =
  | 'piano'
  | 'strings'
  | 'woodwinds'
  | 'brass'
  | 'guitar'
  | 'bass'
  | 'synth'
  | 'percussion'
  | 'world';
