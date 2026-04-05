'use client';

import { useState, useCallback, useEffect } from 'react';

interface UseTableNavigationProps {
    rowCount: number;
    onAction?: (index: number) => void;
    selectionKey?: string; // Optional: unique identifier for selection persistence if needed
}

/**
 * A hook for controlling keyboard navigation and selection in standard tables.
 * 
 * @param rowCount - Number of rows currently in the table
 * @param onAction - Callback triggered when Enter/Space is pressed on a selected row
 * @returns - selectedIndex, setSelectedIndex, handleKeyDown, selectedStyle
 */
export function useTableNavigation({ rowCount, onAction }: UseTableNavigationProps) {
    const [selectedIndex, setSelectedIndex] = useState<number>(-1);

    // Reset selected index if rowCount changes (e.g., search/filter)
    useEffect(() => {
        if (selectedIndex >= rowCount) {
            setSelectedIndex(rowCount > 0 ? 0 : -1);
        }
    }, [rowCount, selectedIndex]);

    const handleKeyDown = useCallback((e: KeyboardEvent | React.KeyboardEvent) => {
        if (rowCount === 0) return;

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

    // Helper to determine tailwind classes for the row
    const getRowClass = (index: number, baseClass: string = "hover:bg-slate-50 transition-colors") => {
        const isSelected = selectedIndex === index;
        return `${baseClass} ${isSelected ? 'bg-red-50/50 ring-1 ring-inset ring-brand-primary/20 shadow-sm z-10' : ''}`;
    };

    return {
        selectedIndex,
        setSelectedIndex,
        handleKeyDown,
        getRowClass,
        isSelected: (index: number) => selectedIndex === index
    };
}

export default useTableNavigation;
