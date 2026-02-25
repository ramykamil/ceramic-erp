'use client';

import { useState, useMemo } from 'react';

export type SortDirection = 'asc' | 'desc' | null;

export interface SortConfig<T> {
    key: keyof T | null;
    direction: SortDirection;
}

export interface UseSortableTableResult<T> {
    sortedData: T[];
    sortConfig: SortConfig<T>;
    handleSort: (key: keyof T) => void;
    getSortDirection: (key: keyof T) => SortDirection;
}

/**
 * A reusable hook for sorting table data.
 * 
 * @param data - The array of data to sort
 * @returns Sorted data and sort control functions
 * 
 * @example
 * const { sortedData, handleSort, getSortDirection } = useSortableTable(myData);
 */
export function useSortableTable<T extends Record<string, any>>(
    data: T[]
): UseSortableTableResult<T> {
    const [sortConfig, setSortConfig] = useState<SortConfig<T>>({
        key: null,
        direction: null,
    });

    const handleSort = (key: keyof T) => {
        setSortConfig((prev) => {
            if (prev.key === key) {
                // Cycle: null -> asc -> desc -> null
                if (prev.direction === null) return { key, direction: 'asc' };
                if (prev.direction === 'asc') return { key, direction: 'desc' };
                return { key: null, direction: null };
            }
            // New column: start with ascending
            return { key, direction: 'asc' };
        });
    };

    const getSortDirection = (key: keyof T): SortDirection => {
        if (sortConfig.key === key) return sortConfig.direction;
        return null;
    };

    const sortedData = useMemo(() => {
        if (!sortConfig.key || !sortConfig.direction) {
            return data;
        }

        const sorted = [...data].sort((a, b) => {
            const aVal = a[sortConfig.key as keyof T];
            const bVal = b[sortConfig.key as keyof T];

            // Handle null/undefined/empty string - push to end
            const aEmpty = aVal == null || aVal === '';
            const bEmpty = bVal == null || bVal === '';
            if (aEmpty && bEmpty) return 0;
            if (aEmpty) return 1;  // Empty values always go to the end
            if (bEmpty) return -1;

            // Try to parse as numbers first (handles numeric strings like "123.45")
            const aNum = typeof aVal === 'number' ? aVal : parseFloat(String(aVal));
            const bNum = typeof bVal === 'number' ? bVal : parseFloat(String(bVal));

            if (!isNaN(aNum) && !isNaN(bNum)) {
                // Both are valid numbers
                const diff = aNum - bNum;
                return sortConfig.direction === 'asc' ? diff : -diff;
            }

            // Try date comparison for ISO date strings (YYYY-MM-DD...)
            const aStr = String(aVal);
            const bStr = String(bVal);

            if (aStr.match(/^\d{4}-\d{2}-\d{2}/) && bStr.match(/^\d{4}-\d{2}-\d{2}/)) {
                const dateA = new Date(aStr).getTime();
                const dateB = new Date(bStr).getTime();
                if (!isNaN(dateA) && !isNaN(dateB)) {
                    const diff = dateA - dateB;
                    return sortConfig.direction === 'asc' ? diff : -diff;
                }
            }

            // Fallback: String comparison (case-insensitive, locale-aware)
            const strA = aStr.toLowerCase().trim();
            const strB = bStr.toLowerCase().trim();

            const comparison = strA.localeCompare(strB, 'fr', { numeric: true, sensitivity: 'base' });
            return sortConfig.direction === 'asc' ? comparison : -comparison;
        });

        return sorted;
    }, [data, sortConfig]);

    return {
        sortedData,
        sortConfig,
        handleSort,
        getSortDirection,
    };
}

export default useSortableTable;
