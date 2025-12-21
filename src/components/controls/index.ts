/**
 * MIDI Controls Module
 *
 * Reusable components and utilities for building MIDI device visualizations.
 *
 * Key concepts:
 * - PortMarker: Universal port positioning via DOM data attributes
 * - MIDIControls: Pre-built control components (keys, knobs, faders, pads, strips)
 * - MIDIDeviceConfig: Declarative device configuration for easy device creation
 *
 * The DOM-based port positioning (using data-node-id and data-port-id)
 * is the source of truth for connection line endpoints. This eliminates
 * the need for manual position calculations in the registry.
 */

// Port marker component
export { PortMarker, type PortMarkerProps, type WithPortMarkerProps } from './PortMarker';

// MIDI control components
export {
    PianoKey,
    Knob,
    Fader,
    Pad,
    TouchStrip,
    Button,
    type PianoKeyProps,
    type KnobProps,
    type FaderProps,
    type PadProps,
    type TouchStripProps,
    type ButtonProps
} from './MIDIControls';

// Device configuration types and utilities
export {
    type ControlType,
    type BaseControl,
    type KeyControl,
    type KnobControl,
    type FaderControl,
    type PadControl,
    type StripControl,
    type EncoderControl,
    type ButtonControl,
    type MIDIControl,
    type MIDIDeviceConfig,
    generatePortsFromConfig,
    generateKeyPortIds,
    generateKeyControls,
    generateNumberedControls,
    MINILAB3_CONFIG
} from './MIDIDeviceConfig';
