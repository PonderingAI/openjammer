/**
 * ResizeHandles - Render resize handles for a node
 *
 * Supports all 8 handles: 4 corners (nw, ne, sw, se) and 4 edges (n, s, e, w).
 * Follows the sketch aesthetic with diagonal border marks for corners.
 *
 * @example
 * ```tsx
 * <div style={{ position: 'relative' }}>
 *   {content}
 *   <ResizeHandles
 *     handles={['se']}  // Only show SE corner
 *     onResizeStart={handleResizeStart}
 *     isResizing={isResizing}
 *   />
 * </div>
 * ```
 */

import React, { memo } from 'react';
import type { ResizeHandle } from '../../hooks/useResize';
import './ResizeHandles.css';

// All available handles
const ALL_HANDLES: ResizeHandle[] = ['n', 's', 'e', 'w', 'nw', 'ne', 'sw', 'se'];

export interface ResizeHandlesProps {
  /** Which handles to show. Defaults to all 8. */
  handles?: ResizeHandle[];
  /** Called when user starts dragging a handle */
  onResizeStart: (handle: ResizeHandle, e: React.MouseEvent) => void;
  /** Whether currently resizing (affects cursor) */
  isResizing?: boolean;
  /** Which handle is active (for visual feedback) */
  activeHandle?: ResizeHandle | null;
  /** Additional class name */
  className?: string;
}

// Cursor mapping for each handle
const CURSORS: Record<ResizeHandle, string> = {
  n: 'ns-resize',
  s: 'ns-resize',
  e: 'ew-resize',
  w: 'ew-resize',
  nw: 'nwse-resize',
  se: 'nwse-resize',
  ne: 'nesw-resize',
  sw: 'nesw-resize',
};

function ResizeHandlesComponent({
  handles = ALL_HANDLES,
  onResizeStart,
  isResizing = false,
  activeHandle = null,
  className = '',
}: ResizeHandlesProps) {
  return (
    <div className={`resize-handles ${isResizing ? 'resizing' : ''} ${className}`}>
      {handles.map(handle => {
        const isCorner = handle.length === 2;
        const isActive = activeHandle === handle;

        return (
          <div
            key={handle}
            className={`resize-handle resize-handle-${handle} ${isCorner ? 'corner' : 'edge'} ${isActive ? 'active' : ''}`}
            style={{ cursor: CURSORS[handle] }}
            onMouseDown={(e) => onResizeStart(handle, e)}
          />
        );
      })}
    </div>
  );
}

export const ResizeHandles = memo(ResizeHandlesComponent);
