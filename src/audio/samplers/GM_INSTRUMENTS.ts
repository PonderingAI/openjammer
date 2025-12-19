/**
 * All 128 General MIDI Instruments for WebAudioFont
 * GM Program Numbers 0-127
 */

import type { InstrumentDefinition } from './types';

const gmInstrument = (
  id: string,
  name: string,
  category: 'piano' | 'strings' | 'guitar' | 'bass' | 'woodwinds' | 'brass' | 'synth' | 'percussion' | 'world',
  programNum: number,
  defaultOctave: number = 4
): InstrumentDefinition => ({
  id,
  name,
  category,
  library: 'webaudiofont',
  config: {
    presetUrl: `https://surikov.github.io/webaudiofontdata/sound/${String(programNum).padStart(4, '0')}_FluidR3_GM_sf2_file.js`,
    presetVar: `_tone_${String(programNum).padStart(4, '0')}_FluidR3_GM_sf2_file`
  },
  defaultOctave
});

export const GM_INSTRUMENTS: InstrumentDefinition[] = [
  // ============= PIANOS (0-7) =============
  gmInstrument('gm-acoustic-grand-piano', 'Acoustic Grand Piano', 'piano', 0, 4),
  gmInstrument('gm-bright-acoustic-piano', 'Bright Acoustic Piano', 'piano', 1, 4),
  gmInstrument('gm-electric-grand-piano', 'Electric Grand Piano', 'piano', 2, 4),
  gmInstrument('gm-honky-tonk-piano', 'Honky-tonk Piano', 'piano', 3, 4),
  gmInstrument('gm-electric-piano-1', 'Electric Piano 1', 'piano', 4, 4),
  gmInstrument('gm-electric-piano-2', 'Electric Piano 2', 'piano', 5, 4),
  gmInstrument('gm-harpsichord', 'Harpsichord', 'piano', 6, 4),
  gmInstrument('gm-clavinet', 'Clavinet', 'piano', 7, 4),

  // ============= CHROMATIC PERCUSSION (8-15) =============
  gmInstrument('gm-celesta', 'Celesta', 'percussion', 8, 5),
  gmInstrument('gm-glockenspiel', 'Glockenspiel', 'percussion', 9, 5),
  gmInstrument('gm-music-box', 'Music Box', 'percussion', 10, 5),
  gmInstrument('gm-vibraphone', 'Vibraphone', 'percussion', 11, 4),
  gmInstrument('gm-marimba', 'Marimba', 'percussion', 12, 4),
  gmInstrument('gm-xylophone', 'Xylophone', 'percussion', 13, 5),
  gmInstrument('gm-tubular-bells', 'Tubular Bells', 'percussion', 14, 4),
  gmInstrument('gm-dulcimer', 'Dulcimer', 'percussion', 15, 4),

  // ============= ORGANS (16-23) =============
  gmInstrument('gm-drawbar-organ', 'Drawbar Organ', 'piano', 16, 4),
  gmInstrument('gm-percussive-organ', 'Percussive Organ', 'piano', 17, 4),
  gmInstrument('gm-rock-organ', 'Rock Organ', 'piano', 18, 4),
  gmInstrument('gm-church-organ', 'Church Organ', 'piano', 19, 4),
  gmInstrument('gm-reed-organ', 'Reed Organ', 'piano', 20, 4),
  gmInstrument('gm-accordion', 'Accordion', 'world', 21, 4),
  gmInstrument('gm-harmonica', 'Harmonica', 'woodwinds', 22, 4),
  gmInstrument('gm-tango-accordion', 'Tango Accordion', 'world', 23, 4),

  // ============= GUITARS (24-31) =============
  gmInstrument('gm-acoustic-guitar-nylon', 'Nylon Acoustic Guitar', 'guitar', 24, 3),
  gmInstrument('gm-acoustic-guitar-steel', 'Steel Acoustic Guitar', 'guitar', 25, 3),
  gmInstrument('gm-electric-guitar-jazz', 'Jazz Electric Guitar', 'guitar', 26, 3),
  gmInstrument('gm-electric-guitar-clean', 'Clean Electric Guitar', 'guitar', 27, 3),
  gmInstrument('gm-electric-guitar-muted', 'Muted Electric Guitar', 'guitar', 28, 3),
  gmInstrument('gm-overdriven-guitar', 'Overdriven Guitar', 'guitar', 29, 3),
  gmInstrument('gm-distortion-guitar', 'Distortion Guitar', 'guitar', 30, 3),
  gmInstrument('gm-guitar-harmonics', 'Guitar Harmonics', 'guitar', 31, 3),

  // ============= BASS (32-39) =============
  gmInstrument('gm-acoustic-bass', 'Acoustic Bass', 'bass', 32, 2),
  gmInstrument('gm-electric-bass-finger', 'Electric Bass (finger)', 'bass', 33, 2),
  gmInstrument('gm-electric-bass-pick', 'Electric Bass (pick)', 'bass', 34, 2),
  gmInstrument('gm-fretless-bass', 'Fretless Bass', 'bass', 35, 2),
  gmInstrument('gm-slap-bass-1', 'Slap Bass 1', 'bass', 36, 2),
  gmInstrument('gm-slap-bass-2', 'Slap Bass 2', 'bass', 37, 2),
  gmInstrument('gm-synth-bass-1', 'Synth Bass 1', 'bass', 38, 2),
  gmInstrument('gm-synth-bass-2', 'Synth Bass 2', 'bass', 39, 2),

  // ============= STRINGS (40-47) =============
  gmInstrument('gm-violin', 'Violin', 'strings', 40, 4),
  gmInstrument('gm-viola', 'Viola', 'strings', 41, 3),
  gmInstrument('gm-cello', 'Cello', 'strings', 42, 3),
  gmInstrument('gm-contrabass', 'Contrabass', 'strings', 43, 2),
  gmInstrument('gm-tremolo-strings', 'Tremolo Strings', 'strings', 44, 4),
  gmInstrument('gm-pizzicato-strings', 'Pizzicato Strings', 'strings', 45, 4),
  gmInstrument('gm-orchestral-harp', 'Orchestral Harp', 'strings', 46, 4),
  gmInstrument('gm-timpani', 'Timpani', 'percussion', 47, 3),

  // ============= ENSEMBLE (48-55) =============
  gmInstrument('gm-string-ensemble-1', 'String Ensemble 1', 'strings', 48, 4),
  gmInstrument('gm-string-ensemble-2', 'String Ensemble 2', 'strings', 49, 4),
  gmInstrument('gm-synth-strings-1', 'Synth Strings 1', 'synth', 50, 4),
  gmInstrument('gm-synth-strings-2', 'Synth Strings 2', 'synth', 51, 4),
  gmInstrument('gm-choir-aahs', 'Choir Aahs', 'synth', 52, 4),
  gmInstrument('gm-voice-oohs', 'Voice Oohs', 'synth', 53, 4),
  gmInstrument('gm-synth-voice', 'Synth Voice', 'synth', 54, 4),
  gmInstrument('gm-orchestra-hit', 'Orchestra Hit', 'percussion', 55, 4),

  // ============= BRASS (56-63) =============
  gmInstrument('gm-trumpet', 'Trumpet', 'brass', 56, 4),
  gmInstrument('gm-trombone', 'Trombone', 'brass', 57, 3),
  gmInstrument('gm-tuba', 'Tuba', 'brass', 58, 2),
  gmInstrument('gm-muted-trumpet', 'Muted Trumpet', 'brass', 59, 4),
  gmInstrument('gm-french-horn', 'French Horn', 'brass', 60, 3),
  gmInstrument('gm-brass-section', 'Brass Section', 'brass', 61, 4),
  gmInstrument('gm-synth-brass-1', 'Synth Brass 1', 'brass', 62, 4),
  gmInstrument('gm-synth-brass-2', 'Synth Brass 2', 'brass', 63, 4),

  // ============= REED (64-71) =============
  gmInstrument('gm-soprano-sax', 'Soprano Sax', 'woodwinds', 64, 4),
  gmInstrument('gm-alto-sax', 'Alto Sax', 'woodwinds', 65, 4),
  gmInstrument('gm-tenor-sax', 'Tenor Sax', 'woodwinds', 66, 3),
  gmInstrument('gm-baritone-sax', 'Baritone Sax', 'woodwinds', 67, 3),
  gmInstrument('gm-oboe', 'Oboe', 'woodwinds', 68, 4),
  gmInstrument('gm-english-horn', 'English Horn', 'woodwinds', 69, 4),
  gmInstrument('gm-bassoon', 'Bassoon', 'woodwinds', 70, 3),
  gmInstrument('gm-clarinet', 'Clarinet', 'woodwinds', 71, 4),

  // ============= PIPE (72-79) =============
  gmInstrument('gm-piccolo', 'Piccolo', 'woodwinds', 72, 5),
  gmInstrument('gm-flute', 'Flute', 'woodwinds', 73, 5),
  gmInstrument('gm-recorder', 'Recorder', 'woodwinds', 74, 5),
  gmInstrument('gm-pan-flute', 'Pan Flute', 'woodwinds', 75, 4),
  gmInstrument('gm-blown-bottle', 'Blown Bottle', 'percussion', 76, 4),
  gmInstrument('gm-shakuhachi', 'Shakuhachi', 'world', 77, 4),
  gmInstrument('gm-whistle', 'Whistle', 'woodwinds', 78, 5),
  gmInstrument('gm-ocarina', 'Ocarina', 'woodwinds', 79, 5),

  // ============= SYNTH LEAD (80-87) =============
  gmInstrument('gm-lead-square', 'Lead 1 (square)', 'synth', 80, 4),
  gmInstrument('gm-lead-sawtooth', 'Lead 2 (sawtooth)', 'synth', 81, 4),
  gmInstrument('gm-lead-calliope', 'Lead 3 (calliope)', 'synth', 82, 4),
  gmInstrument('gm-lead-chiff', 'Lead 4 (chiff)', 'synth', 83, 4),
  gmInstrument('gm-lead-charang', 'Lead 5 (charang)', 'synth', 84, 4),
  gmInstrument('gm-lead-voice', 'Lead 6 (voice)', 'synth', 85, 4),
  gmInstrument('gm-lead-fifths', 'Lead 7 (fifths)', 'synth', 86, 4),
  gmInstrument('gm-lead-bass-lead', 'Lead 8 (bass + lead)', 'synth', 87, 3),

  // ============= SYNTH PAD (88-95) =============
  gmInstrument('gm-pad-new-age', 'Pad 1 (new age)', 'synth', 88, 4),
  gmInstrument('gm-pad-warm', 'Pad 2 (warm)', 'synth', 89, 4),
  gmInstrument('gm-pad-polysynth', 'Pad 3 (polysynth)', 'synth', 90, 4),
  gmInstrument('gm-pad-choir', 'Pad 4 (choir)', 'synth', 91, 4),
  gmInstrument('gm-pad-bowed', 'Pad 5 (bowed)', 'synth', 92, 4),
  gmInstrument('gm-pad-metallic', 'Pad 6 (metallic)', 'synth', 93, 4),
  gmInstrument('gm-pad-halo', 'Pad 7 (halo)', 'synth', 94, 4),
  gmInstrument('gm-pad-sweep', 'Pad 8 (sweep)', 'synth', 95, 4),

  // ============= SYNTH EFFECTS (96-103) =============
  gmInstrument('gm-fx-rain', 'FX 1 (rain)', 'synth', 96, 4),
  gmInstrument('gm-fx-soundtrack', 'FX 2 (soundtrack)', 'synth', 97, 4),
  gmInstrument('gm-fx-crystal', 'FX 3 (crystal)', 'synth', 98, 4),
  gmInstrument('gm-fx-atmosphere', 'FX 4 (atmosphere)', 'synth', 99, 4),
  gmInstrument('gm-fx-brightness', 'FX 5 (brightness)', 'synth', 100, 4),
  gmInstrument('gm-fx-goblins', 'FX 6 (goblins)', 'synth', 101, 4),
  gmInstrument('gm-fx-echoes', 'FX 7 (echoes)', 'synth', 102, 4),
  gmInstrument('gm-fx-sci-fi', 'FX 8 (sci-fi)', 'synth', 103, 4),

  // ============= ETHNIC (104-111) =============
  gmInstrument('gm-sitar', 'Sitar', 'world', 104, 4),
  gmInstrument('gm-banjo', 'Banjo', 'guitar', 105, 3),
  gmInstrument('gm-shamisen', 'Shamisen', 'world', 106, 4),
  gmInstrument('gm-koto', 'Koto', 'world', 107, 4),
  gmInstrument('gm-kalimba', 'Kalimba', 'percussion', 108, 5),
  gmInstrument('gm-bag-pipe', 'Bag Pipe', 'world', 109, 4),
  gmInstrument('gm-fiddle', 'Fiddle', 'strings', 110, 4),
  gmInstrument('gm-shanai', 'Shanai', 'world', 111, 4),

  // ============= PERCUSSIVE (112-119) =============
  gmInstrument('gm-tinkle-bell', 'Tinkle Bell', 'percussion', 112, 5),
  gmInstrument('gm-agogo', 'Agogo', 'percussion', 113, 4),
  gmInstrument('gm-steel-drums', 'Steel Drums', 'percussion', 114, 4),
  gmInstrument('gm-woodblock', 'Woodblock', 'percussion', 115, 4),
  gmInstrument('gm-taiko-drum', 'Taiko Drum', 'percussion', 116, 3),
  gmInstrument('gm-melodic-tom', 'Melodic Tom', 'percussion', 117, 4),
  gmInstrument('gm-synth-drum', 'Synth Drum', 'percussion', 118, 4),
  gmInstrument('gm-reverse-cymbal', 'Reverse Cymbal', 'percussion', 119, 4),

  // ============= SOUND EFFECTS (120-127) =============
  gmInstrument('gm-guitar-fret-noise', 'Guitar Fret Noise', 'percussion', 120, 4),
  gmInstrument('gm-breath-noise', 'Breath Noise', 'percussion', 121, 4),
  gmInstrument('gm-seashore', 'Seashore', 'percussion', 122, 4),
  gmInstrument('gm-bird-tweet', 'Bird Tweet', 'percussion', 123, 5),
  gmInstrument('gm-telephone-ring', 'Telephone Ring', 'percussion', 124, 4),
  gmInstrument('gm-helicopter', 'Helicopter', 'percussion', 125, 3),
  gmInstrument('gm-applause', 'Applause', 'percussion', 126, 4),
  gmInstrument('gm-gunshot', 'Gunshot', 'percussion', 127, 3)
];
