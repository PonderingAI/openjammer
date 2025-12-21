/**
 * MIDI Control Components
 *
 * Reusable control components for building MIDI device visualizations.
 * Each component includes a PortMarker with proper data attributes
 * for DOM-based position lookup.
 *
 * Usage pattern:
 * 1. Use these components in your device visual
 * 2. Pass the nodeId from the parent node
 * 3. Pass port interaction handlers from NodeCanvas
 * 4. The DOM lookup will automatically find exact port positions
 */

import React from 'react';
import { PortMarker, type WithPortMarkerProps } from './PortMarker';
import './MIDIControls.css';

// ============================================================================
// Common Props
// ============================================================================

interface BaseControlProps extends WithPortMarkerProps {
    /** Visual active state */
    active?: boolean;
    /** Value 0-1 for display */
    value?: number;
    /** Custom className */
    className?: string;
}

// ============================================================================
// Piano Key Component
// ============================================================================

export interface PianoKeyProps extends BaseControlProps {
    /** MIDI note number */
    note: number;
    /** Whether this is a black key */
    isBlack: boolean;
    /** Key label (e.g., "C4") */
    label?: string;
    /** Position style (for dynamic layout) */
    style?: React.CSSProperties;
}

export function PianoKey({
    nodeId,
    portId,
    connected,
    active = false,
    value = 0,
    note,
    isBlack,
    label,
    style,
    className = '',
    onPortMouseDown,
    onPortMouseUp,
    onPortMouseEnter,
    onPortMouseLeave
}: PianoKeyProps) {
    const keyClass = isBlack ? 'midi-key midi-key--black' : 'midi-key midi-key--white';

    return (
        <div
            className={`${keyClass} ${active ? 'midi-key--active' : ''} ${className}`}
            style={{
                ...style,
                '--key-velocity': value
            } as React.CSSProperties}
            data-note={note}
            title={label || `Note ${note}`}
        >
            <PortMarker
                nodeId={nodeId}
                portId={portId}
                connected={connected}
                size={isBlack ? 'small' : 'medium'}
                className="port-marker--bottom-inside"
                onMouseDown={onPortMouseDown}
                onMouseUp={onPortMouseUp}
                onMouseEnter={onPortMouseEnter}
                onMouseLeave={onPortMouseLeave}
            />
        </div>
    );
}

// ============================================================================
// Knob Component
// ============================================================================

export interface KnobProps extends Omit<BaseControlProps, 'active'> {
    /** Knob label/number */
    label?: string;
}

export function Knob({
    nodeId,
    portId,
    connected,
    value,
    label,
    className = '',
    onPortMouseDown,
    onPortMouseUp,
    onPortMouseEnter,
    onPortMouseLeave
}: KnobProps) {
    const hasValue = value !== undefined;
    // Full 360 degree rotation
    const rotation = hasValue ? value * 360 : 0;

    return (
        <div className={`midi-knob ${className}`}>
            <div
                className="midi-knob__cap"
                style={{ transform: `rotate(${rotation}deg)` }}
            >
                <div
                    className="midi-knob__indicator"
                    style={{ opacity: hasValue ? 1 : 0.3 }}
                />
            </div>
            {label && <span className="midi-knob__label">{label}</span>}
            <PortMarker
                nodeId={nodeId}
                portId={portId}
                connected={connected}
                className="port-marker--bottom-center"
                onMouseDown={onPortMouseDown}
                onMouseUp={onPortMouseUp}
                onMouseEnter={onPortMouseEnter}
                onMouseLeave={onPortMouseLeave}
            />
        </div>
    );
}

// ============================================================================
// Fader Component
// ============================================================================

export interface FaderProps extends BaseControlProps {
    /** Fader label/number */
    label?: string;
    /** Orientation */
    orientation?: 'vertical' | 'horizontal';
}

export function Fader({
    nodeId,
    portId,
    connected,
    value = 0,
    label,
    orientation = 'vertical',
    className = '',
    onPortMouseDown,
    onPortMouseUp,
    onPortMouseEnter,
    onPortMouseLeave
}: FaderProps) {
    const position = value * 100;

    return (
        <div className={`midi-fader midi-fader--${orientation} ${className}`}>
            <div className="midi-fader__track">
                <div
                    className="midi-fader__thumb"
                    style={orientation === 'vertical'
                        ? { bottom: `${position}%` }
                        : { left: `${position}%` }
                    }
                />
            </div>
            {label && <span className="midi-fader__label">{label}</span>}
            <PortMarker
                nodeId={nodeId}
                portId={portId}
                connected={connected}
                className="port-marker--bottom-center"
                onMouseDown={onPortMouseDown}
                onMouseUp={onPortMouseUp}
                onMouseEnter={onPortMouseEnter}
                onMouseLeave={onPortMouseLeave}
            />
        </div>
    );
}

// ============================================================================
// Pad Component
// ============================================================================

export interface PadProps extends BaseControlProps {
    /** Pad color */
    color?: string;
    /** Pressure/aftertouch value 0-1 */
    pressure?: number;
    /** Pad label/number */
    label?: string;
}

export function Pad({
    nodeId,
    portId,
    connected,
    active = false,
    value = 0,
    pressure = 0,
    color = '#3B82F6',
    label,
    className = '',
    onPortMouseDown,
    onPortMouseUp,
    onPortMouseEnter,
    onPortMouseLeave
}: PadProps) {
    const intensity = Math.max(value, pressure);

    return (
        <div
            className={`midi-pad ${active ? 'midi-pad--active' : ''} ${className}`}
            style={{
                '--pad-color': color,
                '--pad-brightness': active ? 0.3 + intensity * 0.7 : 0.2,
                '--pad-pressure': pressure
            } as React.CSSProperties}
            title={label}
        >
            <PortMarker
                nodeId={nodeId}
                portId={portId}
                connected={connected}
                className="port-marker--bottom-right"
                onMouseDown={onPortMouseDown}
                onMouseUp={onPortMouseUp}
                onMouseEnter={onPortMouseEnter}
                onMouseLeave={onPortMouseLeave}
            />
        </div>
    );
}

// ============================================================================
// Touch Strip Component
// ============================================================================

export interface TouchStripProps extends BaseControlProps {
    /** Label for the strip */
    label?: string;
    /** Is this a pitch bend strip? (bipolar -1 to 1) */
    isPitchBend?: boolean;
}

export function TouchStrip({
    nodeId,
    portId,
    connected,
    value = 0,
    label,
    isPitchBend = false,
    className = '',
    onPortMouseDown,
    onPortMouseUp,
    onPortMouseEnter,
    onPortMouseLeave
}: TouchStripProps) {
    // For pitch bend: -1 to 1 → 0 to 100%
    // For mod wheel: 0 to 1 → 0 to 100%
    const position = isPitchBend ? ((value + 1) / 2) * 100 : value * 100;
    // Clamp and account for indicator height
    const clampedPosition = Math.max(0, Math.min(92, position * 0.92));

    return (
        <div className={`midi-strip ${className}`} title={label}>
            <div
                className="midi-strip__indicator"
                style={{ bottom: `${clampedPosition}%` }}
            />
            <PortMarker
                nodeId={nodeId}
                portId={portId}
                connected={connected}
                className="port-marker--bottom-center"
                onMouseDown={onPortMouseDown}
                onMouseUp={onPortMouseUp}
                onMouseEnter={onPortMouseEnter}
                onMouseLeave={onPortMouseLeave}
            />
        </div>
    );
}

// ============================================================================
// Button Component
// ============================================================================

export interface ButtonProps extends BaseControlProps {
    /** Button label */
    label: string;
    /** Is this a toggle or momentary button? */
    toggle?: boolean;
}

export function Button({
    nodeId,
    portId,
    connected,
    active = false,
    label,
    toggle = false,
    className = '',
    onPortMouseDown,
    onPortMouseUp,
    onPortMouseEnter,
    onPortMouseLeave
}: ButtonProps) {
    return (
        <button
            className={`midi-button ${active ? 'midi-button--active' : ''} ${toggle ? 'midi-button--toggle' : ''} ${className}`}
        >
            {label}
            <PortMarker
                nodeId={nodeId}
                portId={portId}
                connected={connected}
                size="small"
                className="port-marker--right-center"
                onMouseDown={onPortMouseDown}
                onMouseUp={onPortMouseUp}
                onMouseEnter={onPortMouseEnter}
                onMouseLeave={onPortMouseLeave}
            />
        </button>
    );
}

export default {
    PianoKey,
    Knob,
    Fader,
    Pad,
    TouchStrip,
    Button
};
