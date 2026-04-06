'use client';

import { useState, useCallback, useEffect } from 'react';

interface UseTableNavigationProps {
    rowCount: number;
    onAction?: (index: number) => void;
    selectionKey?: string; // Optional: unique identifier for selection persistence if needed
    enabled?: boolean; // Whether keyboard navigation is currently active
}

/**
 * A hook for controlling keyboard navigation and selection in standard tables.
 * 
 * @param rowCount - Number of rows currently in the table
 * @param onAction - Callback triggered when Enter/Space is pressed on a selected row
 * @returns - selectedIndex, setSelectedIndex, handleKeyDown, selectedStyle
 */
export function useTableNavigation({ rowCount, onAction, enabled = true }: UseTableNavigationProps) {
    const [selectedIndex, setSelectedIndex] = useState<number>(-1);

    // Reset selected index if rowCount changes (e.g., search/filter) or if disabled
    useEffect(() => {
        if (!enabled || rowCount === 0) {
            setSelectedIndex(-1);
            return;
        }
        if (selectedIndex >= rowCount) {
            setSelectedIndex(0);
        }
    }, [rowCount, selectedIndex]);

    // Selection-into-view logic to make navigation feel 'less stiff'
    useEffect(() => {
        if (selectedIndex >= 0) {
            // We use a small timeout to ensure the DOM has updated
            const timer = setTimeout(() => {
                const element = document.querySelector(`[data-row-index="${selectedIndex}"]`);
                if (element) {
                    element.scrollIntoView({
                        behavior: 'smooth',
                        block: 'nearest',
                    });
                }
            }, 50);
            return () => clearTimeout(timer);
        }
    }, [selectedIndex]);

    const handleKeyDown = useCallback((e: KeyboardEvent | React.KeyboardEvent) => {
        if (!enabled || rowCount === 0) return;

        // Skip if user is actively typing in an input, textarea, or contenteditable
        const activeEl = document.activeElement;
        const tagName = activeEl?.tagName.toLowerCase();
        if (tagName === 'input' || tagName === 'textarea' || tagName === 'select' || (activeEl as HTMLElement)?.isContentEditable) {
            return;
        }

        switch (e.key) {
            case 'ArrowDown':
                e.preventDefault();
                setSelectedIndex(prev => (prev < rowCount - 1 ? prev + 1 : 0));
                break;
            case 'ArrowUp':
                e.preventDefault();
                setSelectedIndex(prev => (prev > 0 ? prev - 1 : rowCount - 1));
                break;
            case 'Enter':
            case ' ': // Space
                if (selectedIndex >= 0 && selectedIndex < rowCount) {
                    e.preventDefault();
                    if (onAction) onAction(selectedIndex);
                }
                break;
            case 'Escape':
                setSelectedIndex(-1);
                break;
            default:
                break;
        }
    }, [rowCount, selectedIndex, onAction]);

    // Attach listener globally to window so user doesn't have to manually focus the wrapping div
    useEffect(() => {
        const globalListener = (e: KeyboardEvent) => handleKeyDown(e);
        window.addEventListener('keydown', globalListener);
        return () => window.removeEventListener('keydown', globalListener);
    }, [handleKeyDown]);

    // Helper to determine tailwind classes for the row
    const getRowClass = (index: number, baseClass: string = "hover:bg-slate-50 transition-colors") => {
        const isSelected = selectedIndex === index;
        return `${baseClass} ${isSelected ? 'table-row-selected' : ''}`;
    };

    // Props to apply to each row
    const getRowProps = (index: number) => ({
        'data-row-index': index,
        className: getRowClass(index),
        onClick: () => setSelectedIndex(index),
    });

    return {
        selectedIndex,
        setSelectedIndex,
        handleKeyDown,
        getRowClass,
        getRowProps,
        isSelected: (index: number) => selectedIndex === index
    };
}

export default useTableNavigation;
