/**
 * PanelSeparator - Draggable separator between panels
 *
 * Use with usePanelResize hook for internal panel resizing.
 *
 * @example
 * ```tsx
 * const { handleSeparatorMouseDown, isDragging } = usePanelResize({ ... });
 *
 * <PanelSeparator
 *   direction="horizontal"
 *   onMouseDown={handleSeparatorMouseDown}
 *   isDragging={isDragging}
 * />
 * ```
 */

import React, { memo } from 'react';
import type { SeparatorDirection } from '../../hooks/usePanelResize';
import './PanelSeparator.css';

export interface PanelSeparatorProps {
  /** Direction: 'horizontal' creates a vertical separator, 'vertical' creates a horizontal one */
  direction: SeparatorDirection;
  /** Mouse down handler from usePanelResize */
  onMouseDown: (e: React.MouseEvent) => void;
  /** Whether currently dragging */
  isDragging?: boolean;
  /** Additional class name */
  className?: string;
}

function PanelSeparatorComponent({
  direction,
  onMouseDown,
  isDragging = false,
  className = '',
}: PanelSeparatorProps) {
  // 'vertical' direction = horizontal bar (separates top/bottom)
  // 'horizontal' direction = vertical bar (separates left/right)
  const orientationClass = direction === 'vertical' ? 'horizontal' : 'vertical';

  return (
    <div
      className={`panel-separator panel-separator-${orientationClass} ${isDragging ? 'dragging' : ''} ${className}`}
      onMouseDown={onMouseDown}
    />
  );
}

export const PanelSeparator = memo(PanelSeparatorComponent);
