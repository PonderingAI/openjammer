# Creating Resizable Nodes

This guide explains how to make nodes resizable using the resize toolset. The toolset provides:

- **`useResize`** - Hook for node-level resizing (drag edges/corners)
- **`usePanelResize`** - Hook for internal panel separators
- **`ResizeHandles`** - Component rendering resize handles
- **`PanelSeparator`** - Component for internal panel dividers

## Quick Start - Node Resize

### Step 1: Add width/height to your node data

```typescript
// In engine/types.ts
interface MyNodeData extends NodeData {
  width?: number;
  height?: number;
}
```

### Step 2: Import the hook and component

```typescript
import { useResize } from '../../hooks/useResize';
import { ResizeHandles } from '../common/ResizeHandles';
```

### Step 3: Use the hook in your component

```typescript
const MIN_WIDTH = 200;
const MIN_HEIGHT = 150;

export function MyNode({ node, ... }) {
  const data = node.data as MyNodeData;
  const updateNodeData = useGraphStore(s => s.updateNodeData);

  const {
    width,
    height,
    handleResizeStart,
    nodeRef,
    isResizing,
  } = useResize({
    nodeId: node.id,
    initialWidth: data.width ?? 300,
    initialHeight: data.height ?? 200,
    minWidth: MIN_WIDTH,
    minHeight: MIN_HEIGHT,
    onDimensionsChange: (w, h) => updateNodeData<MyNodeData>(node.id, { width: w, height: h }),
  });

  return (
    <div
      ref={nodeRef}
      className="my-node"
      style={{ width, height, ...style }}
    >
      {/* Node content */}
      <ResizeHandles
        handles={['se', 'e', 's']}  // Corner + edges
        onResizeStart={handleResizeStart}
        isResizing={isResizing}
      />
    </div>
  );
}
```

## Handle Configuration

| Handle | Direction | Use Case |
|--------|-----------|----------|
| `se`   | Southeast corner | Most common - diagonal resize |
| `nw`   | Northwest corner | Top-left resize |
| `ne`   | Northeast corner | Top-right resize |
| `sw`   | Southwest corner | Bottom-left resize |
| `n`    | North edge | Height only (from top) |
| `s`    | South edge | Height only (from bottom) |
| `e`    | East edge | Width only (from right) |
| `w`    | West edge | Width only (from left) |

### Common configurations:

```typescript
// Just SE corner (minimal)
handles={['se']}

// SE corner + edges (recommended for most nodes)
handles={['se', 'e', 's']}

// All corners (full flexibility)
handles={['nw', 'ne', 'sw', 'se']}

// All 8 handles (power users)
handles={['n', 's', 'e', 'w', 'nw', 'ne', 'sw', 'se']}
```

## Internal Panel Resize

For resizable sections inside a node (like a split view):

```typescript
import { usePanelResize } from '../../hooks/usePanelResize';
import { PanelSeparator } from '../common/PanelSeparator';

// In your component:
const {
  position: separatorPos,
  isDragging,
  handleSeparatorMouseDown,
  containerRef,
} = usePanelResize({
  nodeId: node.id,
  initialPosition: data.separatorPosition ?? 0.5,
  mode: 'percentage',  // 0-1 range
  min: 0.2,
  max: 0.8,
  direction: 'vertical',  // Top/bottom split
  onPositionChange: (pos) => updateNodeData(node.id, { separatorPosition: pos }),
});

return (
  <div ref={containerRef} style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
    <div style={{ height: `${separatorPos * 100}%` }}>
      Top panel
    </div>
    <PanelSeparator
      direction="vertical"
      onMouseDown={handleSeparatorMouseDown}
      isDragging={isDragging}
    />
    <div style={{ flex: 1 }}>
      Bottom panel
    </div>
  </div>
);
```

## useResize Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `nodeId` | `string` | required | Node ID for debugging |
| `initialWidth` | `number` | required | Starting width |
| `initialHeight` | `number` | required | Starting height |
| `minWidth` | `number` | `100` | Minimum width |
| `maxWidth` | `number` | `Infinity` | Maximum width |
| `minHeight` | `number` | `100` | Minimum height |
| `maxHeight` | `number` | `Infinity` | Maximum height |
| `aspectRatio` | `number \| null` | `null` | Lock aspect ratio (width/height) |
| `onDimensionsChange` | `function` | required | Callback to persist dimensions |
| `debugMode` | `boolean` | `false` | Enable dev warnings |
| `enabled` | `boolean` | `true` | Enable/disable resize |

## usePanelResize Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `nodeId` | `string` | required | Node ID for debugging |
| `initialPosition` | `number` | required | Starting position |
| `mode` | `'percentage' \| 'pixels'` | required | Position mode |
| `min` | `number` | `0.1` / `50` | Minimum position |
| `max` | `number` | `0.9` / `Infinity` | Maximum position |
| `direction` | `'horizontal' \| 'vertical'` | required | Split direction |
| `onPositionChange` | `function` | required | Callback to persist position |
| `debugMode` | `boolean` | `false` | Enable dev warnings |

## Debug Mode

Enable debug warnings to catch common mistakes:

```typescript
const { ... } = useResize({
  nodeId: node.id,
  initialWidth: data.width ?? 300,
  initialHeight: data.height ?? 200,
  minWidth: 200,
  minHeight: 150,
  onDimensionsChange: (w, h) => updateNodeData(node.id, { width: w, height: h }),
  debugMode: true,  // Enable warnings
});
```

Warnings will appear in the console for:
- Missing `minWidth` or `minHeight`
- `initialWidth` < `minWidth`
- `initialHeight` < `minHeight`

## Responsive Layout Best Practices

### Use flex/grid for internal layouts

```css
.my-node-content {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.my-node-panel {
  flex: 1;
  min-height: 50px;  /* Prevent collapse */
  overflow: auto;    /* Handle overflow */
}
```

### Set minimum dimensions

Always define `minWidth` and `minHeight` to prevent content from collapsing:

```typescript
const MIN_WIDTH = 200;   // Enough for your smallest content
const MIN_HEIGHT = 150;  // Enough for header + minimal content
```

### Test at minimum and maximum sizes

Before shipping a resizable node:
1. Resize to minimum dimensions - does content still work?
2. Resize to very large - does layout scale well?
3. Test with different content amounts

## Example: Complete Resizable Node

See `src/components/Nodes/LibraryNode.tsx` for a complete example that uses both `useResize` (node resize) and `usePanelResize` (internal separator).

Key patterns from LibraryNode:
- Store dimensions in `node.data.width` and `node.data.height`
- Use percentage-based internal panel positioning
- Apply `style={{ width, height }}` to container
- Place `ResizeHandles` inside the node container
