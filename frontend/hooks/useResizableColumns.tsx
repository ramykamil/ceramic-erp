'use client';

import { useState, useCallback, useRef, useEffect } from 'react';

export interface ColumnConfig {
    key: string;
    label: string;
    minWidth?: number;
    defaultWidth?: number;
    resizable?: boolean;
}

export interface UseResizableColumnsOptions {
    columns: ColumnConfig[];
    storageKey?: string; // For persisting column widths to localStorage
}

export function useResizableColumns({ columns, storageKey }: UseResizableColumnsOptions) {
    // Initialize column widths
    const [columnWidths, setColumnWidths] = useState<Record<string, number>>(() => {
        // Try to load from localStorage if storageKey is provided
        if (storageKey && typeof window !== 'undefined') {
            const saved = localStorage.getItem(`table-columns-${storageKey}`);
            if (saved) {
                try {
                    return JSON.parse(saved);
                } catch (e) {
                    console.error('Failed to parse saved column widths:', e);
                }
            }
        }

        // Default widths
        const widths: Record<string, number> = {};
        columns.forEach(col => {
            widths[col.key] = col.defaultWidth || 150;
        });
        return widths;
    });

    // Save to localStorage when widths change
    useEffect(() => {
        if (storageKey && typeof window !== 'undefined') {
            localStorage.setItem(`table-columns-${storageKey}`, JSON.stringify(columnWidths));
        }
    }, [columnWidths, storageKey]);

    // Resize handler
    const handleResize = useCallback((columnKey: string, newWidth: number) => {
        const column = columns.find(c => c.key === columnKey);
        const minWidth = column?.minWidth || 50;
        const clampedWidth = Math.max(minWidth, newWidth);

        setColumnWidths(prev => ({
            ...prev,
            [columnKey]: clampedWidth
        }));
    }, [columns]);

    // Reset to defaults
    const resetWidths = useCallback(() => {
        const widths: Record<string, number> = {};
        columns.forEach(col => {
            widths[col.key] = col.defaultWidth || 150;
        });
        setColumnWidths(widths);
    }, [columns]);

    return {
        columnWidths,
        handleResize,
        resetWidths,
        getColumnStyle: (key: string) => ({
            width: columnWidths[key] || 150,
            minWidth: columns.find(c => c.key === key)?.minWidth || 50,
        }),
    };
}

// Resizable Header Cell Component
interface ResizableHeaderProps {
    columnKey: string;
    width: number;
    minWidth?: number;
    onResize: (key: string, newWidth: number) => void;
    children: React.ReactNode;
    className?: string;
}

export function ResizableHeader({ columnKey, width, minWidth = 50, onResize, children, className = '' }: ResizableHeaderProps) {
    const headerRef = useRef<HTMLTableCellElement>(null);
    const [isResizing, setIsResizing] = useState(false);
    const startXRef = useRef(0);
    const startWidthRef = useRef(0);

    const handleMouseDown = (e: React.MouseEvent) => {
        e.preventDefault();
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
            ref={headerRef}
            className={`relative select-none ${className}`}
            style={{ width, minWidth }}
        >
            <div className="flex items-center justify-between gap-1">
                <span className="truncate">{children}</span>
            </div>
            {/* Resize handle */}
            <div
                onMouseDown={handleMouseDown}
                className={`absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-blue-400 transition-colors ${isResizing ? 'bg-blue-500' : 'bg-transparent'}`}
                style={{ zIndex: 10 }}
            />
        </th>
    );
}
