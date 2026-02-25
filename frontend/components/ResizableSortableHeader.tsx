'use client';

import React, { useState, useEffect, useRef } from 'react';

type SortDirection = 'asc' | 'desc' | null;

interface ResizableSortableHeaderProps {
    label: string;
    sortKey: string;
    currentDirection: SortDirection;
    onSort: (key: string) => void;
    width: number;
    minWidth?: number;
    onResize: (key: string, newWidth: number) => void;
    align?: 'left' | 'center' | 'right';
    className?: string;
}

export function ResizableSortableHeader({
    label,
    sortKey,
    currentDirection,
    onSort,
    width,
    minWidth = 80,
    onResize,
    align = 'left',
    className = '',
}: ResizableSortableHeaderProps) {
    const [isResizing, setIsResizing] = useState(false);
    const startXRef = useRef(0);
    const startWidthRef = useRef(0);

    const alignClass = {
        left: 'text-left justify-start',
        center: 'text-center justify-center',
        right: 'text-right justify-end',
    }[align];

    const handleMouseDown = (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsResizing(true);
        startXRef.current = e.clientX;
        startWidthRef.current = width;
    };

    useEffect(() => {
        if (!isResizing) return;

        const handleMouseMove = (e: MouseEvent) => {
            const delta = e.clientX - startXRef.current;
            const newWidth = Math.max(minWidth, startWidthRef.current + delta);
            onResize(sortKey, newWidth);
        };

        const handleMouseUp = () => {
            setIsResizing(false);
        };

        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);

        return () => {
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
        };
    }, [isResizing, sortKey, minWidth, onResize]);

    const getSortIcon = () => {
        if (currentDirection === 'asc') return '↑';
        if (currentDirection === 'desc') return '↓';
        return '⇅';
    };

    return (
        <th
            className={`px-4 py-3 relative select-none ${className}`}
            style={{ width, minWidth }}
        >
            <button
                onClick={() => onSort(sortKey)}
                className={`flex items-center gap-1 hover:text-slate-800 transition-colors w-full ${alignClass}`}
            >
                <span className="truncate">{label}</span>
                <span className={`text-xs ${currentDirection ? 'text-blue-600' : 'text-slate-300'}`}>
                    {getSortIcon()}
                </span>
            </button>
            {/* Resize handle */}
            <div
                onMouseDown={handleMouseDown}
                className={`absolute right-0 top-0 bottom-0 w-1.5 cursor-col-resize transition-colors ${isResizing ? 'bg-blue-500' : 'hover:bg-blue-300 bg-transparent'
                    }`}
                style={{ zIndex: 10 }}
                title="Glisser pour redimensionner"
            />
        </th>
    );
}

// Simple hook for column width management with localStorage
export function useColumnWidths(storageKey: string, defaultWidths: Record<string, number>) {
    // Use ref to store defaultWidths to avoid dependency issues
    const defaultWidthsRef = useRef(defaultWidths);

    // Always start with defaultWidths to avoid hydration mismatch
    const [widths, setWidths] = useState<Record<string, number>>(defaultWidths);
    const [isInitialized, setIsInitialized] = useState(false);

    // Load saved widths from localStorage after hydration (run only once on mount)
    useEffect(() => {
        const saved = localStorage.getItem(`col-widths-${storageKey}`);
        if (saved) {
            try {
                setWidths({ ...defaultWidthsRef.current, ...JSON.parse(saved) });
            } catch {
                // Ignore parse errors
            }
        }
        setIsInitialized(true);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [storageKey]); // Only depend on storageKey, not defaultWidths

    // Save to localStorage when widths change (but not on initial load)
    useEffect(() => {
        if (isInitialized) {
            localStorage.setItem(`col-widths-${storageKey}`, JSON.stringify(widths));
        }
    }, [widths, storageKey, isInitialized]);

    const handleResize = (key: string, newWidth: number) => {
        setWidths(prev => ({ ...prev, [key]: newWidth }));
    };

    const resetWidths = () => setWidths(defaultWidthsRef.current);

    return { widths, handleResize, resetWidths };
}

// Simple Resizable Header (for tables with custom sorting)
interface ResizableHeaderProps {
    columnKey: string;
    width: number;
    minWidth?: number;
    onResize: (key: string, newWidth: number) => void;
    onClick?: () => void;
    children: React.ReactNode;
    className?: string;
    style?: React.CSSProperties;
}

export function ResizableHeader({
    columnKey,
    width,
    minWidth = 50,
    onResize,
    onClick,
    children,
    className = '',
    style = {},
}: ResizableHeaderProps) {
    const [isResizing, setIsResizing] = useState(false);
    const startXRef = useRef(0);
    const startWidthRef = useRef(0);

    const handleMouseDown = (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsResizing(true);
        startXRef.current = e.clientX;
        startWidthRef.current = width;
    };

    useEffect(() => {
        if (!isResizing) return;

        const handleMouseMove = (e: MouseEvent) => {
            const delta = e.clientX - startXRef.current;
            const newWidth = Math.max(minWidth, startWidthRef.current + delta);
            onResize(columnKey, newWidth);
        };

        const handleMouseUp = () => {
            setIsResizing(false);
        };

        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);

        return () => {
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
        };
    }, [isResizing, columnKey, minWidth, onResize]);

    return (
        <th
            className={`relative select-none ${className}`}
            style={{ ...style, width, minWidth }}
            onClick={onClick}
        >
            {children}
            {/* Resize handle */}
            <div
                onMouseDown={handleMouseDown}
                onClick={(e) => e.stopPropagation()}
                className={`absolute right-0 top-0 bottom-0 w-1.5 cursor-col-resize transition-colors ${isResizing ? 'bg-blue-500' : 'hover:bg-blue-300 bg-transparent'
                    }`}
                style={{ zIndex: 10 }}
            />
        </th>
    );
}
