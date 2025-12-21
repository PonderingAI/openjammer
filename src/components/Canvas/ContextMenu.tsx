/**
 * Context Menu - ComfyUI-style right-click menu
 */

import { useEffect, useRef } from 'react';
import type { Position, NodeType } from '../../engine/types';
import { menuCategories, nodeDefinitions } from '../../engine/registry';
import './ContextMenu.css';

interface ContextMenuProps {
    position: Position;
    onClose: () => void;
    onAddNode: (type: NodeType, position: Position) => void;
    onOpenMIDIBrowser?: (position: Position) => void;
}

export function ContextMenu({ position, onClose, onAddNode, onOpenMIDIBrowser }: ContextMenuProps) {
    const menuRef = useRef<HTMLDivElement>(null);

    // Close on click outside
    useEffect(() => {
        function handleClickOutside(e: MouseEvent) {
            if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
                onClose();
            }
        }

        function handleKeyDown(e: KeyboardEvent) {
            if (e.key === 'Escape') {
                onClose();
            }
        }

        document.addEventListener('mousedown', handleClickOutside);
        document.addEventListener('keydown', handleKeyDown);

        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
            document.removeEventListener('keydown', handleKeyDown);
        };
    }, [onClose]);

    // Adjust position to keep menu in viewport
    useEffect(() => {
        if (!menuRef.current) return;

        const menu = menuRef.current;
        const rect = menu.getBoundingClientRect();

        if (rect.right > window.innerWidth) {
            menu.style.left = `${window.innerWidth - rect.width - 10}px`;
        }
        if (rect.bottom > window.innerHeight) {
            menu.style.top = `${window.innerHeight - rect.height - 10}px`;
        }
    }, [position]);

    const handleAddNode = (type: NodeType) => {
        // For MIDI, open the device browser instead of creating node directly
        if (type === 'midi' && onOpenMIDIBrowser) {
            onOpenMIDIBrowser(position);
            onClose();
            return;
        }
        onAddNode(type, position);
        onClose();
    };

    const handleKeyDown = (e: React.KeyboardEvent, action: () => void) => {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            action();
        }
    };

    return (
        <div
            ref={menuRef}
            className="context-menu"
            style={{ left: position.x, top: position.y }}
            role="menu"
            aria-label="Add node menu"
        >
            <div className="context-menu-header" id="context-menu-title">Add Node</div>

            {menuCategories.map((category) => (
                <div
                    key={category.name}
                    className="context-menu-category"
                    role="group"
                    aria-label={category.name}
                >
                    <div className="context-menu-category-header">
                        <span>
                            <span className="context-menu-category-icon" aria-hidden="true">{category.icon}</span>
                            {category.name}
                        </span>
                        <span className="context-menu-category-arrow" aria-hidden="true">▶</span>
                    </div>

                    <div className="context-menu-submenu" role="group">
                        {category.items.map((nodeType) => {
                            const definition = nodeDefinitions[nodeType];
                            return (
                                <div
                                    key={nodeType}
                                    className="context-menu-item"
                                    role="menuitem"
                                    tabIndex={0}
                                    onClick={() => handleAddNode(nodeType)}
                                    onKeyDown={(e) => handleKeyDown(e, () => handleAddNode(nodeType))}
                                >
                                    {definition.name}
                                </div>
                            );
                        })}
                    </div>
                </div>
            ))}

            <div className="context-menu-separator" role="separator" />

            <div
                className="context-menu-item"
                role="menuitem"
                tabIndex={0}
                onClick={onClose}
                onKeyDown={(e) => handleKeyDown(e, onClose)}
            >
                Cancel
            </div>
        </div>
    );
}
