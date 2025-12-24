/**
 * ClipDragLayer - Portal overlay for dragged audio clips
 *
 * Renders the currently dragged clip at the cursor position,
 * above all other content. Shows visual feedback for valid drop zones.
 */

import { createPortal } from 'react-dom';
import { memo } from 'react';
import { useAudioClipStore } from '../../store/audioClipStore';
import { AudioClipVisual } from './AudioClipVisual';
import './ClipDragLayer.css';

export const ClipDragLayer = memo(function ClipDragLayer() {
    const dragState = useAudioClipStore((s) => s.dragState);
    const clips = useAudioClipStore((s) => s.clips);
    const registeredDropTargets = useAudioClipStore((s) => s.registeredDropTargets);

    // Don't render if not dragging
    if (!dragState.isDragging || !dragState.draggedClipId) {
        return null;
    }

    const clip = clips.get(dragState.draggedClipId);
    if (!clip) {
        return null;
    }

    // Calculate position for the dragged clip (follow cursor with offset)
    const dragPosition = {
        x: dragState.currentPosition.x - dragState.dragOffset.x,
        y: dragState.currentPosition.y - dragState.dragOffset.y,
    };

    // Get the hovered target for visual feedback
    const hoveredTarget = dragState.hoveredTargetId
        ? registeredDropTargets.get(dragState.hoveredTargetId)
        : null;

    return createPortal(
        <div className="clip-drag-layer">
            {/* Drop zone highlights */}
            {Array.from(registeredDropTargets.values()).map((target) => {
                const bounds = target.getDropZoneBounds();
                if (!bounds) return null;

                const isHovered = target.nodeId === dragState.hoveredTargetId;
                const canAccept = target.canAcceptClip(clip);

                return (
                    <div
                        key={target.nodeId}
                        className={`clip-drop-zone ${isHovered ? 'hovered' : ''} ${canAccept ? 'valid' : 'invalid'}`}
                        style={{
                            left: bounds.left,
                            top: bounds.top,
                            width: bounds.width,
                            height: bounds.height,
                        }}
                    >
                        {isHovered && canAccept && (
                            <span className="clip-drop-zone-label">
                                Drop into {target.targetName}
                            </span>
                        )}
                    </div>
                );
            })}

            {/* Dragged clip visual */}
            <div
                className="clip-drag-preview"
                style={{
                    left: dragPosition.x,
                    top: dragPosition.y,
                }}
            >
                <AudioClipVisual
                    clip={clip}
                    isDragging={true}
                    isDropTarget={!!hoveredTarget}
                />
            </div>

            {/* Cursor hint */}
            {hoveredTarget && (
                <div
                    className="clip-drag-hint"
                    style={{
                        left: dragState.currentPosition.x + 16,
                        top: dragState.currentPosition.y + 16,
                    }}
                >
                    {hoveredTarget.targetName}
                </div>
            )}
        </div>,
        document.body
    );
});

export default ClipDragLayer;
