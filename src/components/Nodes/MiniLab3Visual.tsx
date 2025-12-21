/**
 * MiniLab 3 Visual Component
 * Accurate visual representation of the Arturia MiniLab 3 controller
 * Based on actual device layout: 355mm x 220mm (1.61:1 aspect ratio)
 */

import React, { memo, useEffect, useState } from 'react';
import { subscribeMIDIMessages } from '../../store/midiStore';
import type { MIDIEvent } from '../../midi/types';
import './MiniLab3Visual.css';

interface MiniLab3VisualProps {
    deviceId: string | null;
    onNoteOutput?: (note: number, velocity: number, channel: number) => void;
    onPadOutput?: (padId: string, velocity: number, pressure: number) => void;
    onKnobOutput?: (knobId: string, value: number) => void;
    onFaderOutput?: (faderId: string, value: number) => void;
    onPitchBend?: (value: number) => void;
    onModWheel?: (value: number) => void;
}

// Control state types
interface ControlState {
    keys: Map<number, { velocity: number; active: boolean }>;
    pads: Map<number, { velocity: number; pressure: number; active: boolean }>;
    knobs: Map<number, number>; // CC -> value
    faders: Map<number, number>; // CC -> value
    pitchBend: number; // -8192 to 8191
    modWheel: number; // 0-127
}

// MiniLab 3 specific mappings
const MINILAB3_CONFIG = {
    // Keys: C3-C5 by default (MIDI notes 48-72)
    keyRange: { start: 48, end: 72 },
    keyChannel: 1,

    // Pads: Bank A, channel 10
    pads: [
        { id: 1, note: 36 }, { id: 2, note: 37 }, { id: 3, note: 38 }, { id: 4, note: 39 },
        { id: 5, note: 40 }, { id: 6, note: 41 }, { id: 7, note: 42 }, { id: 8, note: 43 },
    ],
    padChannel: 10,

    // Knobs: 8 endless encoders
    knobs: [
        { id: 1, cc: 74 }, { id: 2, cc: 71 }, { id: 3, cc: 76 }, { id: 4, cc: 77 },
        { id: 5, cc: 78 }, { id: 6, cc: 79 }, { id: 7, cc: 80 }, { id: 8, cc: 81 },
    ],

    // Faders: 4 sliders
    faders: [
        { id: 1, cc: 82 }, { id: 2, cc: 83 }, { id: 3, cc: 85 }, { id: 4, cc: 17 },
    ],

    // Mod wheel CC
    modWheelCC: 1,
};

// Pad colors (RGB capable, these are defaults)
const PAD_COLORS = [
    '#3B82F6', '#3B82F6', '#3B82F6', '#3B82F6', // Bottom row (blue)
    '#3B82F6', '#3B82F6', '#3B82F6', '#3B82F6', // Top row (blue)
];

export const MiniLab3Visual = memo(function MiniLab3Visual({
    deviceId,
    onNoteOutput,
    onPadOutput,
    onKnobOutput,
    onFaderOutput,
    onPitchBend,
    onModWheel,
}: MiniLab3VisualProps) {
    // Control state for visualization
    const [state, setState] = useState<ControlState>({
        keys: new Map(),
        pads: new Map(),
        knobs: new Map(MINILAB3_CONFIG.knobs.map(k => [k.cc, 64])),
        faders: new Map(MINILAB3_CONFIG.faders.map(f => [f.cc, 0])),
        pitchBend: 0,
        modWheel: 0,
    });

    // Subscribe to MIDI messages
    useEffect(() => {
        if (!deviceId) return;

        const unsubscribe = subscribeMIDIMessages((event: MIDIEvent) => {
            // Only process messages from our device
            if (event.deviceId !== deviceId) return;

            setState(prev => {
                const next = { ...prev };

                switch (event.type) {
                    case 'noteOn': {
                        // Check if it's a key or pad
                        if (event.channel === MINILAB3_CONFIG.padChannel) {
                            // It's a pad
                            const pad = MINILAB3_CONFIG.pads.find(p => p.note === event.note);
                            if (pad) {
                                next.pads = new Map(prev.pads);
                                next.pads.set(pad.id, { velocity: event.velocity, pressure: 0, active: true });
                                onPadOutput?.(pad.id.toString(), event.velocity, 0);
                            }
                        } else if (event.channel === MINILAB3_CONFIG.keyChannel) {
                            // It's a key
                            next.keys = new Map(prev.keys);
                            next.keys.set(event.note, { velocity: event.velocity, active: true });
                            onNoteOutput?.(event.note, event.velocity, event.channel);
                        }
                        break;
                    }

                    case 'noteOff': {
                        if (event.channel === MINILAB3_CONFIG.padChannel) {
                            const pad = MINILAB3_CONFIG.pads.find(p => p.note === event.note);
                            if (pad) {
                                next.pads = new Map(prev.pads);
                                next.pads.set(pad.id, { velocity: 0, pressure: 0, active: false });
                                onPadOutput?.(pad.id.toString(), 0, 0);
                            }
                        } else if (event.channel === MINILAB3_CONFIG.keyChannel) {
                            next.keys = new Map(prev.keys);
                            next.keys.set(event.note, { velocity: 0, active: false });
                            onNoteOutput?.(event.note, 0, event.channel);
                        }
                        break;
                    }

                    case 'cc': {
                        // Check if it's a knob
                        const knob = MINILAB3_CONFIG.knobs.find(k => k.cc === event.controller);
                        if (knob) {
                            next.knobs = new Map(prev.knobs);
                            next.knobs.set(event.controller, event.value);
                            onKnobOutput?.(knob.id.toString(), event.value);
                            break;
                        }

                        // Check if it's a fader
                        const fader = MINILAB3_CONFIG.faders.find(f => f.cc === event.controller);
                        if (fader) {
                            next.faders = new Map(prev.faders);
                            next.faders.set(event.controller, event.value);
                            onFaderOutput?.(fader.id.toString(), event.value);
                            break;
                        }

                        // Check if it's mod wheel
                        if (event.controller === MINILAB3_CONFIG.modWheelCC) {
                            next.modWheel = event.value;
                            onModWheel?.(event.value);
                        }
                        break;
                    }

                    case 'pitchBend': {
                        next.pitchBend = event.value;
                        onPitchBend?.(event.value);
                        break;
                    }

                    case 'aftertouch': {
                        // Channel aftertouch from pads
                        if (event.channel === MINILAB3_CONFIG.padChannel) {
                            // Update all active pads with pressure
                            next.pads = new Map(prev.pads);
                            prev.pads.forEach((padState, padId) => {
                                if (padState.active) {
                                    next.pads.set(padId, { ...padState, pressure: event.pressure });
                                }
                            });
                        }
                        break;
                    }
                }

                return next;
            });
        });

        return unsubscribe;
    }, [deviceId, onNoteOutput, onPadOutput, onKnobOutput, onFaderOutput, onPitchBend, onModWheel]);

    // Generate piano keys (25 keys: 15 white, 10 black)
    // Keys span full width, black keys positioned on top between white keys
    const renderKeyboard = () => {
        const keys: React.ReactElement[] = [];
        const { start, end } = MINILAB3_CONFIG.keyRange;

        // Key pattern: C=0, C#=1, D=2, D#=3, E=4, F=5, F#=6, G=7, G#=8, A=9, A#=10, B=11
        const isBlackKey = (note: number) => {
            const n = note % 12;
            return [1, 3, 6, 8, 10].includes(n);
        };

        // Count white keys for width calculation (15 white keys in 25-key range C3-C5)
        let totalWhiteKeys = 0;
        for (let n = start; n <= end; n++) {
            if (!isBlackKey(n)) totalWhiteKeys++;
        }

        // Each white key takes equal percentage of width
        const whiteKeyWidthPercent = 100 / totalWhiteKeys;

        let whiteKeyIndex = 0;
        for (let note = start; note <= end; note++) {
            const keyState = state.keys.get(note);
            const isActive = keyState?.active ?? false;
            const velocity = keyState?.velocity ?? 0;

            if (isBlackKey(note)) {
                // Black key - positioned overlapping between white keys
                // Position at the boundary between previous white key and next
                const blackKeyLeft = (whiteKeyIndex * whiteKeyWidthPercent) - (whiteKeyWidthPercent * 0.28);
                keys.push(
                    <div
                        key={note}
                        className={`minilab3-key minilab3-black-key ${isActive ? 'active' : ''}`}
                        style={{
                            left: `${blackKeyLeft}%`,
                            width: `${whiteKeyWidthPercent * 0.55}%`,
                            opacity: isActive ? 0.6 + (velocity / 127) * 0.4 : 1,
                        }}
                        data-note={note}
                    />
                );
            } else {
                keys.push(
                    <div
                        key={note}
                        className={`minilab3-key minilab3-white-key ${isActive ? 'active' : ''}`}
                        style={{
                            left: `${whiteKeyIndex * whiteKeyWidthPercent}%`,
                            width: `${whiteKeyWidthPercent}%`,
                            opacity: isActive ? 0.7 + (velocity / 127) * 0.3 : 1,
                        }}
                        data-note={note}
                    />
                );
                whiteKeyIndex++;
            }
        }

        return keys;
    };

    // Render pads (single horizontal row of 8)
    const renderPads = () => {
        return MINILAB3_CONFIG.pads.map((pad, index) => {
            const padState = state.pads.get(pad.id);
            const isActive = padState?.active ?? false;
            const velocity = padState?.velocity ?? 0;
            const pressure = padState?.pressure ?? 0;

            return (
                <div
                    key={pad.id}
                    className={`minilab3-pad ${isActive ? 'active' : ''}`}
                    style={{
                        '--pad-color': PAD_COLORS[index],
                        '--pad-brightness': isActive ? 0.5 + (velocity / 127) * 0.5 : 0.3,
                        '--pad-pressure': pressure / 127,
                    } as React.CSSProperties}
                    data-pad-id={pad.id}
                />
            );
        });
    };

    // Render knobs (2 rows of 4)
    const renderKnobs = () => {
        return MINILAB3_CONFIG.knobs.map((knob, index) => {
            const value = state.knobs.get(knob.cc) ?? 64;
            const rotation = ((value / 127) * 270) - 135; // -135 to +135 degrees

            const row = index < 4 ? 0 : 1;
            const col = index % 4;

            return (
                <div
                    key={knob.id}
                    className="minilab3-knob"
                    style={{
                        gridRow: row + 1,
                        gridColumn: col + 1,
                    }}
                    data-knob-id={knob.id}
                >
                    <div
                        className="minilab3-knob-cap"
                        style={{ transform: `rotate(${rotation}deg)` }}
                    >
                        <div className="minilab3-knob-indicator" />
                    </div>
                    <span className="minilab3-knob-label">{knob.id}</span>
                </div>
            );
        });
    };

    // Render faders (4 vertical sliders)
    const renderFaders = () => {
        return MINILAB3_CONFIG.faders.map((fader) => {
            const value = state.faders.get(fader.cc) ?? 0;
            const position = (value / 127) * 100;

            return (
                <div
                    key={fader.id}
                    className="minilab3-fader"
                    data-fader-id={fader.id}
                >
                    <div className="minilab3-fader-track">
                        <div
                            className="minilab3-fader-thumb"
                            style={{ bottom: `${position}%` }}
                        />
                    </div>
                    <span className="minilab3-fader-label">{fader.id}</span>
                </div>
            );
        });
    };

    // Render touch strips
    const renderTouchStrips = () => {
        const pitchPos = ((state.pitchBend + 8192) / 16383) * 100;
        const modPos = (state.modWheel / 127) * 100;

        return (
            <div className="minilab3-touch-strips">
                <div className="minilab3-touch-strip minilab3-pitch-strip">
                    <div
                        className="minilab3-strip-indicator"
                        style={{ bottom: `${pitchPos}%` }}
                    />
                </div>
                <div className="minilab3-touch-strip minilab3-mod-strip">
                    <div
                        className="minilab3-strip-indicator"
                        style={{ bottom: `${modPos}%` }}
                    />
                </div>
            </div>
        );
    };

    return (
        <div className="minilab3-visual">
            {/* Main body - no wood panels on MiniLab 3 */}
            <div className="minilab3-body">
                {/* Top section - controls row */}
                <div className="minilab3-controls">
                    {/* Left: Buttons (2x2 grid) + Touch strips below */}
                    <div className="minilab3-left-section">
                        <div className="minilab3-buttons">
                            <button className="minilab3-button minilab3-shift">Shift</button>
                            <button className="minilab3-button">Hold</button>
                            <button className="minilab3-button">Oct -</button>
                            <button className="minilab3-button">Oct +</button>
                        </div>
                        {renderTouchStrips()}
                    </div>

                    {/* Display + Encoder */}
                    <div className="minilab3-display-section">
                        <div className="minilab3-oled">
                            <span className="minilab3-oled-text">Arturia</span>
                        </div>
                        <div className="minilab3-main-encoder">
                            <div className="minilab3-encoder-cap">
                                <div className="minilab3-encoder-indicator" />
                            </div>
                        </div>
                    </div>

                    {/* 8 Knobs */}
                    <div className="minilab3-knobs-section">
                        {renderKnobs()}
                    </div>

                    {/* 4 Faders */}
                    <div className="minilab3-faders-section">
                        {renderFaders()}
                    </div>
                </div>

                {/* Middle row - 8 Pads positioned below knobs */}
                <div className="minilab3-middle-row">
                    <div className="minilab3-pads-section">
                        {renderPads()}
                    </div>
                </div>

                {/* Branding row - above keyboard */}
                <div className="minilab3-branding-row">
                    <span className="minilab3-logo">MINI<span className="minilab3-logo-lab">LAB</span> 3</span>
                    <div className="minilab3-midi-indicators">
                        <span className="minilab3-midi-label">MIDI CH</span>
                        {Array.from({ length: 16 }, (_, i) => (
                            <div key={i} className={`minilab3-midi-ch ${i === 0 ? 'active' : ''}`} />
                        ))}
                    </div>
                    <span className="minilab3-arturia">ARTURIA</span>
                </div>

                {/* Keyboard section */}
                <div className="minilab3-keyboard-section">
                    <div className="minilab3-keyboard">
                        {renderKeyboard()}
                    </div>
                </div>
            </div>
        </div>
    );
});

export default MiniLab3Visual;
