/**
 * InstrumentDefinitions - Configuration for all available instruments
 */

import type { InstrumentDefinition } from './types';
import { GM_INSTRUMENTS } from './GM_INSTRUMENTS';

export const INSTRUMENT_DEFINITIONS: InstrumentDefinition[] = [
  // ============= PIANO (Tone.js Salamander) =============
  {
    id: 'salamander-piano',
    name: 'Grand Piano',
    category: 'piano',
    subCategory: 'Acoustic',
    library: 'tone',
    config: { type: 'salamander' },
    defaultOctave: 4,
    noteRange: { min: 'A0', max: 'C8' }
  },

  // ============= STRINGS (smplr Versilian) =============
  {
    id: 'versilian-cello',
    name: 'Cello',
    category: 'strings',
    subCategory: 'Orchestral',
    library: 'smplr',
    config: { instrument: 'cello' },
    defaultOctave: 3,
    noteRange: { min: 'C2', max: 'A5' }
  },
  {
    id: 'versilian-violin',
    name: 'Violin',
    category: 'strings',
    subCategory: 'Orchestral',
    library: 'smplr',
    config: { instrument: 'violin' },
    defaultOctave: 4,
    noteRange: { min: 'G3', max: 'E7' }
  },
  {
    id: 'versilian-viola',
    name: 'Viola',
    category: 'strings',
    subCategory: 'Orchestral',
    library: 'smplr',
    config: { instrument: 'viola' },
    defaultOctave: 3,
    noteRange: { min: 'C3', max: 'E6' }
  },
  {
    id: 'versilian-double-bass',
    name: 'Double Bass',
    category: 'strings',
    subCategory: 'Orchestral',
    library: 'smplr',
    config: { instrument: 'double-bass' },
    defaultOctave: 2,
    noteRange: { min: 'E1', max: 'G4' }
  },

  // ============= GUITAR (Karplus-Strong + WebAudioFont) =============
  {
    id: 'karplus-acoustic',
    name: 'Acoustic Guitar',
    category: 'guitar',
    subCategory: 'Acoustic',
    library: 'karplus',
    config: { brightness: 0.6, dampening: 0.995 },
    defaultOctave: 3
  },
  {
    id: 'karplus-electric',
    name: 'Electric Guitar',
    category: 'guitar',
    subCategory: 'Electric',
    library: 'karplus',
    config: { brightness: 0.8, dampening: 0.98 },
    defaultOctave: 3
  },
  {
    id: 'karplus-nylon',
    name: 'Nylon Guitar',
    category: 'guitar',
    subCategory: 'Acoustic',
    library: 'karplus',
    config: { brightness: 0.4, dampening: 0.997 },
    defaultOctave: 3
  },
  {
    id: 'karplus-harp',
    name: 'Harp',
    category: 'strings',
    subCategory: 'Plucked',
    library: 'karplus',
    config: { brightness: 0.7, dampening: 0.996 },
    defaultOctave: 4
  },

  // ============= GENERAL MIDI (WebAudioFont - 128 instruments) =============
  // All 128 GM instruments imported from GM_INSTRUMENTS
  ...GM_INSTRUMENTS
];
