# Creating Nodes in OpenJammer

This guide walks you through creating new node types in OpenJammer. Nodes are the building blocks of the audio/control graph, and can be hierarchical (containing other nodes inside).

## Table of Contents

1. [Node Architecture Overview](#node-architecture-overview)
2. [Port Visibility System](#port-visibility-system)
3. [Creating a Simple Node](#creating-a-simple-node)
4. [Creating a Hierarchical Node](#creating-a-hierarchical-node)
5. [Panel Nodes and Bundles](#panel-nodes-and-bundles)
6. [Utility Functions](#utility-functions)
7. [Complete Example](#complete-example)

---

## Node Architecture Overview

### Key Concepts

```
┌─────────────────────────────────────────────────────────────┐
│  Parent Node (keyboard, instrument, container, etc.)        │
│                                                             │
│  External Ports ←───synced from───→ Input/Output Panels    │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│  Internal Canvas (when you press E to enter)                │
│                                                             │
│  ┌──────────┐                              ┌──────────┐    │
│  │ Input    │  ─► internal nodes ─►        │ Output   │    │
│  │ Panel    │                              │ Panel    │    │
│  └──────────┘                              └──────────┘    │
│                                                             │
│  Panel ports = External ports (automatic sync)              │
└─────────────────────────────────────────────────────────────┘
```

### Core Types

```typescript
// From src/engine/types.ts

interface GraphNode {
    id: string;                    // Unique node ID
    type: NodeType;                // Node type (e.g., 'keyboard', 'piano')
    category: NodeCategory;        // Category for toolbox
    position: Position;            // Position in canvas
    data: NodeData;                // Custom data for the node
    ports: PortDefinition[];       // Ports on the node

    // Hierarchical structure
    parentId: string | null;       // null = root-level, otherwise parent ID
    childIds: string[];            // IDs of child nodes
    specialNodes?: string[];       // IDs of special nodes (panels) - synced to parent

    // Port visibility configuration
    showEmptyInputPorts?: boolean;   // Show input-panel ports even if not connected
    showEmptyOutputPorts?: boolean;  // Show output-panel ports even if not connected
}

interface PortDefinition {
    id: string;
    name: string;
    type: 'audio' | 'control' | 'universal';
    direction: 'input' | 'output';
    position?: { x: number; y: number };  // 0-1 normalized
    hideExternalLabel?: boolean;          // Hide label on parent node
}
```

---

## Port Visibility System

OpenJammer has a three-layer system for controlling port visibility:

### 1. Node-Level Flags

Set on the parent `GraphNode`:

```typescript
{
    showEmptyInputPorts: boolean,   // Show unconnected input-panel ports on parent
    showEmptyOutputPorts: boolean   // Show unconnected output-panel ports on parent
}
```

**Use Cases:**
- `false, false` - Keyboard/MiniLab3: Only show ports that have connections
- `true, true` - Container: Show all ports so users can connect to them
- `true, false` - Custom: Show inputs, hide unused outputs

### 2. Panel Data: `portHideExternalLabel`

Per-port flag stored in panel's `data`:

```typescript
data: {
    portLabels: {
        'port-1': 'Audio Out',
        'empty-abc123': ''  // Empty slot
    },
    portHideExternalLabel: {
        'empty-abc123': true  // Hide this port's label on parent
    }
}
```

### 3. Empty Port Pattern

Empty slots use the `empty-` prefix and are auto-detected:

```typescript
import { EMPTY_PORT_PREFIX } from '../utils/nodeInternals';
import { generateUniqueId } from '../utils/idGenerator';

const emptyPortId = generateUniqueId(EMPTY_PORT_PREFIX);  // "empty-abc123"
```

The `isEmptyPort()` function detects empty ports:

```typescript
// From src/utils/bundleManager.ts
function isEmptyPort(port: PortDefinition): boolean {
    return port.id.startsWith('empty-') || port.name === '';
}
```

---

## Creating a Simple Node

### Step 1: Register the Node Type

Add to `src/engine/types.ts`:

```typescript
export type NodeType =
    | 'keyboard'
    | 'piano'
    // ... existing types
    | 'my-new-node';  // Add your type
```

### Step 2: Register in Node Registry

Add to `src/engine/registry.ts`:

```typescript
const nodeDefinitions: Map<NodeType, NodeDefinition> = new Map([
    // ... existing nodes
    ['my-new-node', {
        type: 'my-new-node',
        name: 'My New Node',
        category: 'effects',  // or 'input', 'instruments', 'routing', 'output'
        description: 'A custom node that does something cool',
        defaultPorts: [
            { id: 'in', name: 'Input', type: 'audio', direction: 'input' },
            { id: 'out', name: 'Output', type: 'audio', direction: 'output' }
        ],
        isAtomic: true,  // true = no internal structure, false = has children
        defaultData: {
            // Custom data for this node type
            gain: 1.0
        }
    }]
]);
```

### Step 3: Create the Component

Create `src/components/Nodes/MyNewNode.tsx`:

```typescript
import { memo } from 'react';
import type { GraphNode } from '../../engine/types';
import './MyNewNode.css';

interface MyNewNodeProps {
    node: GraphNode;
    isSelected?: boolean;
    // Port handlers passed from NodeWrapper
    handlePortMouseDown?: (portId: string, e: React.MouseEvent) => void;
    handlePortMouseUp?: (portId: string, e: React.MouseEvent) => void;
}

export const MyNewNode = memo(function MyNewNode({
    node,
    isSelected
}: MyNewNodeProps) {
    const gain = (node.data.gain as number) ?? 1.0;

    return (
        <div className={`my-new-node ${isSelected ? 'selected' : ''}`}>
            <div className="node-header">My New Node</div>
            <div className="node-body">
                <label>Gain: {gain.toFixed(2)}</label>
            </div>
        </div>
    );
});
```

### Step 4: Register the Component

Add to `src/components/Nodes/index.ts`:

```typescript
export { MyNewNode } from './MyNewNode';
```

Update `src/components/Canvas/NodeCanvas.tsx` to render your node:

```typescript
import { MyNewNode } from '../Nodes';

// In the renderNode function:
case 'my-new-node':
    return <MyNewNode node={node} isSelected={isSelected} {...handlers} />;
```

---

## Creating a Hierarchical Node

Hierarchical nodes contain other nodes inside. When you press `E` on them, you enter an internal canvas.

### Step 1: Set `isAtomic: false` in Registry

```typescript
['my-container', {
    type: 'my-container',
    name: 'My Container',
    category: 'routing',
    isAtomic: false,  // ← This enables hierarchical behavior
    defaultPorts: []  // Ports come from internal panels
}]
```

### Step 2: Create Internal Structure

Add to `src/utils/nodeInternals.ts`:

```typescript
export function createDefaultInternalStructure(parentNode: GraphNode): InternalStructure {
    switch (parentNode.type) {
        // ... existing cases
        case 'my-container':
            return createMyContainerInternals();
        // ...
    }
}

function createMyContainerInternals(): InternalStructure {
    const internalNodes = new Map<string, GraphNode>();
    const internalConnections = new Map<string, Connection>();
    const specialNodes: string[] = [];

    // Use the standardized panel factory
    const { inputPanel, outputPanel, inputPanelId, outputPanelId } = createStandardPanels({
        outputLabels: ['Output 1', 'Output 2'],  // Labels for output ports
        inputLabels: ['Input 1'],                 // Labels for input ports
        outputPosition: { x: 700, y: 100 },
        inputPosition: { x: 50, y: 100 },
        includeEmptyOutputSlot: true,  // Add "+ Add output" slot
        includeEmptyInputSlot: true    // Add "+ Add input" slot
    });

    internalNodes.set(inputPanelId, inputPanel);
    internalNodes.set(outputPanelId, outputPanel);
    specialNodes.push(inputPanelId, outputPanelId);

    // Add your custom internal nodes here
    const myVisualId = generateUniqueId('my-visual-');
    const myVisual: GraphNode = {
        id: myVisualId,
        type: 'my-visual',
        category: 'routing',
        position: { x: 350, y: 100 },
        data: {},
        ports: [
            { id: 'in', name: 'In', type: 'audio', direction: 'input' },
            { id: 'out', name: 'Out', type: 'audio', direction: 'output' }
        ],
        parentId: null,  // Set by addNode
        childIds: []
    };
    internalNodes.set(myVisualId, myVisual);
    // NOT added to specialNodes - internal visualization only

    // Create internal connections
    const conn1 = generateUniqueId('conn-');
    internalConnections.set(conn1, {
        id: conn1,
        sourceNodeId: inputPanelId,
        sourcePortId: 'port-1',  // First input port
        targetNodeId: myVisualId,
        targetPortId: 'in',
        type: 'audio'
    });

    return {
        internalNodes,
        internalConnections,
        specialNodes,
        showEmptyInputPorts: true,   // Show input placeholder on parent
        showEmptyOutputPorts: true   // Show output ports on parent
    };
}
```

---

## Panel Nodes and Bundles

### Input Panel vs Output Panel

| Panel Type | Internal Port Direction | External Port Direction | Purpose |
|------------|------------------------|------------------------|---------|
| `input-panel` | `output` (sends inside) | `input` (receives from outside) | Receive signals from parent |
| `output-panel` | `input` (receives inside) | `output` (sends to outside) | Send signals to parent |

### The "Always One Empty Slot" Pattern

Every panel should have exactly one empty slot for adding new connections:

```typescript
const emptyPortId = generateUniqueId(EMPTY_PORT_PREFIX);

const panel: GraphNode = {
    // ...
    data: {
        portLabels: {
            'port-1': 'Existing Port',
            [emptyPortId]: ''  // Empty slot
        },
        portHideExternalLabel: {
            [emptyPortId]: true  // Hide on parent
        }
    },
    ports: [
        { id: 'port-1', name: 'Existing Port', type: 'control', direction: 'output' },
        { id: emptyPortId, name: '', type: 'control', direction: 'output', position: { x: 1, y: 0.9 } }
    ]
};
```

### Bundle Ports

When multiple signals are bundled together (e.g., 25 piano keys):

```typescript
import type { BundlePortDefinition, BundleInfo } from '../../engine/types';

const bundleInfo: BundleInfo = {
    bundleId: 'keys-bundle',
    bundleLabel: 'MiniLab3 Keys',
    sourceNodeName: 'MiniLab3',
    sourceNodeType: 'minilab-3',
    channels: [
        { id: 'ch-0', label: 'MiniLab3 Key 1', sourcePortId: 'key-48', sourceNodeId: 'visual-123' },
        { id: 'ch-1', label: 'MiniLab3 Key 2', sourcePortId: 'key-49', sourceNodeId: 'visual-123' },
        // ... more channels
    ],
    expanded: false  // Start collapsed
};

const bundlePort: BundlePortDefinition = {
    id: 'bundle-keys',
    name: 'Keys (25)',
    type: 'control',
    direction: 'output',
    bundleInfo
};
```

---

## Utility Functions

### From `src/utils/nodeInternals.ts`

```typescript
// Create standardized input/output panels
createStandardPanels(config: StandardPanelConfig): {
    inputPanel: GraphNode;
    outputPanel: GraphNode;
    inputPanelId: string;
    outputPanelId: string;
}

// Get default internal structure for a node type
createDefaultInternalStructure(parentNode: GraphNode): InternalStructure
```

### From `src/utils/bundleManager.ts`

```typescript
// Check if a port is an empty placeholder
isEmptyPort(port: PortDefinition): boolean

// Ensure panel has exactly one empty slot
ensureEmptySlot(panel: GraphNode, connections: Map, panelType: 'input' | 'output'): GraphNode

// Check if port is a bundle
isBundlePort(port: PortDefinition): port is BundlePortDefinition

// Get bundle info from source port
getBundleInfo(sourceNodeId, sourcePortId, nodes, connections): BundleInfo | null
```

### From `src/utils/portSync.ts`

```typescript
// Sync panel ports to parent node's external ports
syncPortsWithInternalNodes(node, childNodes, connections, onlyConnected): PortDefinition[]

// Detect if source port is a bundle
detectBundleInfo(sourceNodeId, sourcePortId, nodes, connections): BundleInfo | null

// Expand target panel for bundle connection
expandTargetForBundleWithInfo(targetNodeId, bundleInfo, nodes): ExpansionResult | null
```

### From `src/utils/idGenerator.ts`

```typescript
// Generate unique IDs
generateUniqueId(prefix?: string): string
```

---

## Scroll Capture (Preventing Canvas Scroll)

When your node has scrollable elements (dropdowns, lists) or uses scroll gestures for value adjustment (knobs, sliders), you must prevent scroll events from propagating to the canvas.

### The Problem

By default, scroll/wheel events bubble up to the canvas and trigger panning. React's `onWheel` with `stopPropagation()` doesn't work for trackpad gestures because React uses passive event listeners.

### The Solution: `useScrollCapture` and `ScrollContainer`

Import from `src/hooks/useScrollCapture` or `src/components/common/ScrollContainer`:

```typescript
import { useScrollCapture } from '../../hooks/useScrollCapture';
import type { ScrollData } from '../../hooks/useScrollCapture';
import { ScrollContainer } from '../common/ScrollContainer';
```

### Use Case 1: Scrollable Dropdowns/Lists

For elements with native scroll (`overflow: auto`), use `mode="dropdown"`:

```tsx
// Allows native scroll inside, blocks events from reaching canvas
<ScrollContainer mode="dropdown" className="my-dropdown">
    {items.map(item => <div key={item.id}>{item.label}</div>)}
</ScrollContainer>
```

### Use Case 2: Value Adjustment (Scroll to Change Number)

For scroll-to-adjust controls, use `useScrollCapture` with direction helpers:

```tsx
const handleScroll = useCallback((data: ScrollData) => {
    // Use direction helpers - they work correctly on all devices!
    if (data.scrollingUp) setValue(v => v + 1);
    if (data.scrollingDown) setValue(v => v - 1);
}, []);

const { ref } = useScrollCapture<HTMLSpanElement>({
    onScroll: handleScroll,
});

return (
    <span ref={ref} className="editable-value">
        {value}
    </span>
);
```

### Use Case 3: Zoom/Pan Controls

For custom zoom and pan with scroll:

```tsx
const handleScroll = useCallback((data: ScrollData) => {
    if (data.isVertical) {
        // Vertical scroll = zoom
        if (data.scrollingUp) setZoom(z => Math.min(20, z + 0.5));
        if (data.scrollingDown) setZoom(z => Math.max(1, z - 0.5));
    } else if (data.isHorizontal && zoom > 1) {
        // Horizontal scroll = pan (when zoomed)
        if (data.scrollingRight) setOffset(o => o + 0.1);
        if (data.scrollingLeft) setOffset(o => o - 0.1);
    }
}, [zoom]);

const { ref } = useScrollCapture<HTMLDivElement>({
    onScroll: handleScroll,
});
```

### ScrollData Properties

| Property | Type | Description |
|----------|------|-------------|
| `scrollingUp` | `boolean` | True when scrolling up (works on all devices) |
| `scrollingDown` | `boolean` | True when scrolling down |
| `scrollingLeft` | `boolean` | True when scrolling left |
| `scrollingRight` | `boolean` | True when scrolling right |
| `isVertical` | `boolean` | Primarily vertical scroll |
| `isHorizontal` | `boolean` | Primarily horizontal scroll |
| `isPinch` | `boolean` | Pinch gesture (Ctrl+scroll) |
| `deltaX`, `deltaY` | `number` | Raw scroll deltas |
| `shiftKey`, `ctrlKey` | `boolean` | Modifier keys held |

### Common Mistakes

1. **Using `capture={true}` on scrollable lists** - This blocks native scroll!
   ```tsx
   // WRONG - blocks scroll inside dropdown
   <ScrollContainer className="dropdown">...</ScrollContainer>

   // RIGHT - allows native scroll
   <ScrollContainer mode="dropdown" className="dropdown">...</ScrollContainer>
   ```

2. **Using raw `deltaY` for direction** - Signs differ between trackpad and mouse!
   ```tsx
   // WRONG - breaks on some devices
   const scrollingUp = e.deltaY < 0;

   // RIGHT - use the helper
   if (data.scrollingUp) { ... }
   ```

---

## Resizable Nodes

If your node needs to be resizable (user can drag edges/corners to change size), see the dedicated guide:

**[Creating Resizable Nodes](./creating-resizable-nodes.md)**

Key points:
- Use `useResize` hook for node-level resize
- Use `usePanelResize` hook for internal panel separators
- Store dimensions in `node.data.width` and `node.data.height`
- Always set `minWidth` and `minHeight` constraints
- Use flex/grid layouts that respond to size changes

Example node that uses resize: `LibraryNode.tsx`

---

## Complete Example

Here's a complete example of creating a "Mixer" node with multiple inputs and one output:

### 1. Types (`src/engine/types.ts`)

```typescript
export type NodeType =
    // ... existing
    | 'mixer';
```

### 2. Registry (`src/engine/registry.ts`)

```typescript
['mixer', {
    type: 'mixer',
    name: 'Mixer',
    category: 'effects',
    description: 'Mix multiple audio inputs into one output',
    isAtomic: false,
    defaultPorts: []  // Synced from panels
}]
```

### 3. Internal Structure (`src/utils/nodeInternals.ts`)

```typescript
case 'mixer':
    return createMixerInternals();

function createMixerInternals(): InternalStructure {
    const internalNodes = new Map<string, GraphNode>();
    const internalConnections = new Map<string, Connection>();
    const specialNodes: string[] = [];

    // Create panels with 4 inputs and 1 output
    const { inputPanel, outputPanel, inputPanelId, outputPanelId } = createStandardPanels({
        inputLabels: ['Ch 1', 'Ch 2', 'Ch 3', 'Ch 4'],
        outputLabels: ['Mix Out'],
        includeEmptyInputSlot: true,
        includeEmptyOutputSlot: false  // Only one output needed
    });

    internalNodes.set(inputPanelId, inputPanel);
    internalNodes.set(outputPanelId, outputPanel);
    specialNodes.push(inputPanelId, outputPanelId);

    // Create mixer visual node
    const mixerVisualId = generateUniqueId('mixer-visual-');
    const mixerVisual: GraphNode = {
        id: mixerVisualId,
        type: 'mixer-visual',
        category: 'effects',
        position: { x: 350, y: 100 },
        data: { channelGains: [1, 1, 1, 1] },
        ports: [
            { id: 'ch-1', name: 'Ch 1', type: 'audio', direction: 'input', position: { x: 0, y: 0.2 } },
            { id: 'ch-2', name: 'Ch 2', type: 'audio', direction: 'input', position: { x: 0, y: 0.4 } },
            { id: 'ch-3', name: 'Ch 3', type: 'audio', direction: 'input', position: { x: 0, y: 0.6 } },
            { id: 'ch-4', name: 'Ch 4', type: 'audio', direction: 'input', position: { x: 0, y: 0.8 } },
            { id: 'mix-out', name: 'Mix', type: 'audio', direction: 'output', position: { x: 1, y: 0.5 } }
        ],
        parentId: null,
        childIds: []
    };
    internalNodes.set(mixerVisualId, mixerVisual);

    // Wire input panel to mixer
    for (let i = 1; i <= 4; i++) {
        const connId = generateUniqueId('conn-');
        internalConnections.set(connId, {
            id: connId,
            sourceNodeId: inputPanelId,
            sourcePortId: `port-${i}`,
            targetNodeId: mixerVisualId,
            targetPortId: `ch-${i}`,
            type: 'audio'
        });
    }

    // Wire mixer to output panel
    const outConnId = generateUniqueId('conn-');
    internalConnections.set(outConnId, {
        id: outConnId,
        sourceNodeId: mixerVisualId,
        sourcePortId: 'mix-out',
        targetNodeId: outputPanelId,
        targetPortId: 'port-1',
        type: 'audio'
    });

    return {
        internalNodes,
        internalConnections,
        specialNodes,
        showEmptyInputPorts: true,
        showEmptyOutputPorts: true
    };
}
```

### 4. Visual Component (`src/components/Nodes/MixerVisualNode.tsx`)

```typescript
import { memo } from 'react';
import type { GraphNode } from '../../engine/types';
import { useGraphStore } from '../../store/graphStore';

interface MixerVisualNodeProps {
    node: GraphNode;
    isSelected?: boolean;
}

export const MixerVisualNode = memo(function MixerVisualNode({
    node,
    isSelected
}: MixerVisualNodeProps) {
    const updateNodeData = useGraphStore(s => s.updateNodeData);
    const gains = (node.data.channelGains as number[]) ?? [1, 1, 1, 1];

    const handleGainChange = (index: number, value: number) => {
        const newGains = [...gains];
        newGains[index] = value;
        updateNodeData(node.id, { channelGains: newGains });
    };

    return (
        <div className={`mixer-visual-node ${isSelected ? 'selected' : ''}`}>
            <div className="mixer-header">Mixer</div>
            <div className="mixer-faders">
                {gains.map((gain, i) => (
                    <div key={i} className="fader">
                        <input
                            type="range"
                            min="0"
                            max="1"
                            step="0.01"
                            value={gain}
                            onChange={e => handleGainChange(i, parseFloat(e.target.value))}
                            style={{ writingMode: 'vertical-lr' }}
                        />
                        <label>Ch {i + 1}</label>
                    </div>
                ))}
            </div>
        </div>
    );
});
```

---

## Summary

1. **Register the node type** in `types.ts` and `registry.ts`
2. **For hierarchical nodes**, create internal structure in `nodeInternals.ts`
3. **Use `createStandardPanels()`** for consistent panel creation
4. **Add empty slots** with `empty-` prefix and `portHideExternalLabel`
5. **Set visibility flags** (`showEmptyInputPorts`, `showEmptyOutputPorts`)
6. **Create the visual component** and register it in `NodeCanvas.tsx`

### Quick Reference: Port Direction Mapping

| Location | Input Panel Port | Output Panel Port |
|----------|-----------------|-------------------|
| **Inside panel** | `direction: 'output'` | `direction: 'input'` |
| **On parent** | `direction: 'input'` | `direction: 'output'` |
| **Data flow** | Parent → Inside | Inside → Parent |
