/**
 * DropdownMenu - Photoshop-style dropdown menus for toolbar
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import './DropdownMenu.css';

export interface MenuItem {
    id: string;
    label: string;
    shortcut?: string;
    onClick: () => void;
    disabled?: boolean;
}

export interface MenuSeparator {
    type: 'separator';
}

export type MenuItemOrSeparator = MenuItem | MenuSeparator;

interface DropdownMenuProps {
    label: string;
    items: MenuItemOrSeparator[];
    disabled?: boolean;
}

function isSeparator(item: MenuItemOrSeparator): item is MenuSeparator {
    return 'type' in item && item.type === 'separator';
}

export function DropdownMenu({ label, items, disabled = false }: DropdownMenuProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [focusedIndex, setFocusedIndex] = useState(-1);
    const menuRef = useRef<HTMLDivElement>(null);
    const triggerRef = useRef<HTMLButtonElement>(null);
    const itemRefs = useRef<(HTMLDivElement | null)[]>([]);

    // Get only actionable items (not separators) for keyboard navigation
    const actionableItems = items.filter((item): item is MenuItem => !isSeparator(item));

    const close = useCallback(() => {
        setIsOpen(false);
        setFocusedIndex(-1);
    }, []);

    const open = useCallback(() => {
        if (!disabled) {
            setIsOpen(true);
            setFocusedIndex(0);
        }
    }, [disabled]);

    const toggle = useCallback(() => {
        if (isOpen) {
            close();
        } else {
            open();
        }
    }, [isOpen, close, open]);

    // Close on click outside
    useEffect(() => {
        if (!isOpen) return;

        function handleClickOutside(e: MouseEvent) {
            if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
                close();
            }
        }

        // Small delay to prevent immediate close when clicking trigger
        const timeoutId = setTimeout(() => {
            document.addEventListener('mousedown', handleClickOutside);
        }, 0);

        return () => {
            clearTimeout(timeoutId);
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [isOpen, close]);

    // Keyboard navigation
    useEffect(() => {
        if (!isOpen) return;

        function handleKeyDown(e: KeyboardEvent) {
            switch (e.key) {
                case 'Escape':
                    e.preventDefault();
                    close();
                    triggerRef.current?.focus();
                    break;

                case 'ArrowDown':
                    e.preventDefault();
                    setFocusedIndex((prev) => {
                        const next = prev + 1;
                        return next >= actionableItems.length ? 0 : next;
                    });
                    break;

                case 'ArrowUp':
                    e.preventDefault();
                    setFocusedIndex((prev) => {
                        const next = prev - 1;
                        return next < 0 ? actionableItems.length - 1 : next;
                    });
                    break;

                case 'Enter':
                case ' ':
                    e.preventDefault();
                    if (focusedIndex >= 0 && focusedIndex < actionableItems.length) {
                        const item = actionableItems[focusedIndex];
                        if (!item.disabled) {
                            item.onClick();
                            close();
                        }
                    }
                    break;

                case 'Tab':
                    close();
                    break;
            }
        }

        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, [isOpen, focusedIndex, actionableItems, close]);

    // Focus the current item when focused index changes
    useEffect(() => {
        if (isOpen && focusedIndex >= 0) {
            itemRefs.current[focusedIndex]?.focus();
        }
    }, [isOpen, focusedIndex]);

    const handleItemClick = (item: MenuItem) => {
        if (!item.disabled) {
            item.onClick();
            close();
        }
    };

    // Track which actionable item index corresponds to each menu item
    let actionableIndex = -1;

    return (
        <div className="dropdown-menu" ref={menuRef}>
            <button
                ref={triggerRef}
                className={`dropdown-trigger ${isOpen ? 'dropdown-trigger-open' : ''}`}
                onClick={toggle}
                disabled={disabled}
                aria-haspopup="true"
                aria-expanded={isOpen}
            >
                {label}
                <span className="dropdown-chevron">▾</span>
            </button>

            {isOpen && (
                <div
                    className="dropdown-content"
                    role="menu"
                    aria-label={label}
                >
                    {items.map((item, index) => {
                        if (isSeparator(item)) {
                            return <div key={`sep-${index}`} className="dropdown-separator" role="separator" />;
                        }

                        actionableIndex++;
                        const currentActionableIndex = actionableIndex;

                        return (
                            <div
                                key={item.id}
                                ref={(el) => { itemRefs.current[currentActionableIndex] = el; }}
                                className={`dropdown-item ${item.disabled ? 'dropdown-item-disabled' : ''} ${currentActionableIndex === focusedIndex ? 'dropdown-item-focused' : ''}`}
                                onClick={() => handleItemClick(item)}
                                onMouseEnter={() => setFocusedIndex(currentActionableIndex)}
                                role="menuitem"
                                tabIndex={-1}
                                aria-disabled={item.disabled}
                            >
                                <span className="dropdown-item-label">{item.label}</span>
                                {item.shortcut && (
                                    <span className="dropdown-item-shortcut">{item.shortcut}</span>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
