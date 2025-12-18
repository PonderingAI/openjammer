# Openjammer

A browser-based, node-driven live music generation tool for performing with other musicians. Built entirely client-side with offline capability after first visit.

## Quick Start

```bash
bun install
bun dev
```

## Vision

Openjammer is a visual node-based audio workstation inspired by ComfyUI's interface paradigm. Right-click on empty canvas space to open the context menu with all node categories. The tool prioritizes screen real estate (laptop-first design) and live editability—all parameters remain editable while audio plays without dropouts. Every transformation is lossless.

## Design Aesthetic

**Scribble/hand-drawn style** with cream/beige backgrounds, black hand-drawn outlines, and rounded organic shapes (see design mockups). Theming is user-customizable via a settings panel inspired by Cyberpunk 2077's in-game menu.

## Node System

### Connections
- **Blue (Audio)**: Light blue = input, dark blue = output. Directional only.
- **Grey (Data)**: Bidirectional, for passing numbers/parameters.

Ports are color-coded on each node. Same-color connections are interchangeable respecting directionality.

### Multi-Select & Undo
- Drag to select multiple nodes → Backspace/Delete removes them
- Ctrl+Z = Undo, Ctrl+Y = Redo

### Batch Connecting
Select a node and press **A** to grab all free output ports at once. They follow your cursor as a bundle and can be connected to a target node, which dynamically expands its inputs to receive them all.

---

## Node Categories

### 1. Keyboard Node
Routes physical keyboard input to instruments.

- **3 outputs** (one per keyboard row: upper Q-P, middle A-L, lower Z-M)
- **Number row (1-9)** switches the active bank:
  - Bank **1** = reserved for global shortcuts/building mode
  - Banks **2-9** = assignable to Keyboard nodes
- When spawned, auto-claims the next free bank number (displayed in node header)
- When a bank is active, the three keyboard rows trigger notes on connected instruments

### 2. Instruments
Sound generators. Access via right-click menu categories: *Strings*, *Keyboard*, *Drums*, etc. Click the node header to open a popup with specific instrument options (Classic Piano, Cello, Saxophone, etc.).

**Structure:**
- Dynamic inputs: starts with 1, grows as connections arrive (if holding multiple connections, that many inputs appear)
- Each input row displays: Note letter (SPN) + Offset value
- Use +/- buttons or type directly to adjust pitch
- 1 audio output

**Special: Microphone**
- Active by default with Mute button
- Under Instruments category

### 3. Looper
The live performance core. Stacks layers rather than overdubbing.

- **Default duration**: 10 seconds (customizable)
- **Auto-start**: Recording begins when input signal exceeds threshold
- **Auto-stop**: Stops if no input detected for one full loop cycle; empty loops are discarded
- **Progress bar**: Shows current position in loop
- **Stacking**: Each cycle creates a new row/layer
  - Rows can be individually muted, deleted, have effects applied
  - Rows can be dragged to other Loopers
- **Global sync**: Loopers at same BPM/duration align perfectly regardless of start time
- **Beat correction**: Snaps loop end to nearest beat to prevent drift

### 4. Effects
Modify audio signals. Place between Instruments→Looper or apply to specific Looper rows.

Types: Distortion, Pitch Shift, Reverb, etc.

Hot-swappable during playback without audio engine interruption.

### 5. Amplifier
Linear volume control.
- 1.0 = original, 2.0 = double, 0.5 = half, 0.0 = mute

### 6. Speaker
Final output node.
- Click "output device" label to open dropdown for selecting system audio devices
- Speaker symbol in node body

### 7. Recorder
Captures session for post-production.
- Records final mix or individual stems
- Exports as .wav
- Allows separate export of loops/instruments for DAW editing

---

## Ghost Mode (W key)
Toggle for live performance view:
- All nodes fade to 10% opacity
- Node interactions disabled (buttons/sliders)
- Connections remain fully visible and editable
- Input ports "glow" for easy rerouting during play

---

## Technical

- **Runtime**: Bun 
- **Audio**: Web Audio API
- **Storage**: Local browser storage + JSON import/export
- **Hosting**: Vercel (cost-minimized, fully static)
- **Offline**: Full functionality after first visit (PWA/Service Worker)

## Architecture Goals

- Clean, well-documented codebase
- Easy community contributions
- Scalable for future MIDI and custom node integration
- Theming system for user-created themes

## Export/Import

Workflows saved as JSON files for sharing and backup.

---

## Contributing

See [AGENTS.md](./AGENTS.md) for development guidelines.

## License

Open source—details TBD.