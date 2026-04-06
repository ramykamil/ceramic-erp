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

            const aStr = String(aVal);
            const bStr = String(bVal);

            // 1. Try Date comparison first (prevents dates being parsed as partial numbers)
            // Support ISO: YYYY-MM-DD and EU: DD/MM/YYYY
            const isoRegex = /^\d{4}-\d{2}-\d{2}/;
            const euRegex = /^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/;

            let dateA: number | null = null;
            let dateB: number | null = null;

            if (isoRegex.test(aStr) && isoRegex.test(bStr)) {
                dateA = new Date(aStr).getTime();
                dateB = new Date(bStr).getTime();
            } else {
                const matchA = aStr.match(euRegex);
                const matchB = bStr.match(euRegex);
                if (matchA && matchB) {
                    dateA = new Date(`${matchA[3]}-${matchA[2]}-${matchA[1]}`).getTime();
                    dateB = new Date(`${matchB[3]}-${matchB[2]}-${matchB[1]}`).getTime();
                }
            }

            if (dateA !== null && dateB !== null && !isNaN(dateA) && !isNaN(dateB)) {
                const diff = dateA - dateB;
                return sortConfig.direction === 'asc' ? diff : -diff;
            }

            // 2. Try Numeric comparison (only for pure numbers or numeric strings)
            // We use a stricter check to avoid years in dates being parsed as numbers
            const isNumeric = (s: string) => /^-?\d*\.?\d+$/.test(s.trim());
            
            if (typeof aVal === 'number' && typeof bVal === 'number') {
                const diff = (aVal as number) - (bVal as number);
                return sortConfig.direction === 'asc' ? diff : -diff;
            }

            if (isNumeric(aStr) && isNumeric(bStr)) {
                const aNum = parseFloat(aStr);
                const bNum = parseFloat(bStr);
                const diff = aNum - bNum;
                return sortConfig.direction === 'asc' ? diff : -diff;
            }

            // 3. Fallback: String comparison (case-insensitive, locale-aware)
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
