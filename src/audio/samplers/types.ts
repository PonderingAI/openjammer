/**
 * Shared types for sampled instruments
 */

export type LoadingState = 'idle' | 'loading' | 'loaded' | 'error';

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
  library: 'smplr' | 'tone' | 'webaudiofont' | 'karplus';
  config: Record<string, unknown>;
  icon?: string;
  defaultOctave?: number;
  noteRange?: { min: string; max: string };
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
