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
}

export function ContextMenu({ position, onClose, onAddNode }: ContextMenuProps) {
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
        onAddNode(type, position);
        onClose();
    };

    return (
        <div
            ref={menuRef}
            className="context-menu"
            style={{ left: position.x, top: position.y }}
        >
            <div className="context-menu-header">Add Node</div>

            {menuCategories.map((category) => (
                <div key={category.name} className="context-menu-category">
                    <div className="context-menu-category-header">
                        <span>
                            <span className="context-menu-category-icon">{category.icon}</span>
                            {category.name}
                        </span>
                        <span className="context-menu-category-arrow">▶</span>
                    </div>

                    <div className="context-menu-submenu">
                        {category.items.map((nodeType) => {
                            const definition = nodeDefinitions[nodeType];
                            return (
                                <div
                                    key={nodeType}
                                    className="context-menu-item"
                                    onClick={() => handleAddNode(nodeType)}
                                >
                                    {definition.name}
                                </div>
                            );
                        })}
                    </div>
                </div>
            ))}

            <div className="context-menu-separator" />

            <div
                className="context-menu-item"
                onClick={onClose}
            >
                Cancel
            </div>
        </div>
    );
}
