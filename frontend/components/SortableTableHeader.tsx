'use client';

import { SortDirection } from '@/hooks/useSortableTable';

export interface SortableTableHeaderProps {
    label: string;
    sortKey: string;
    currentDirection: SortDirection;
    onSort: (key: string) => void;
    className?: string;
    align?: 'left' | 'center' | 'right';
}

/**
 * A reusable sortable table header component.
 * Displays sort direction indicators and handles click to sort.
 */
export function SortableTableHeader({
    label,
    sortKey,
    currentDirection,
    onSort,
    className = '',
    align = 'left',
}: SortableTableHeaderProps) {
    const alignClass = {
        left: 'text-left',
        center: 'text-center',
        right: 'text-right',
    }[align];

    const getSortIcon = () => {
        if (currentDirection === 'asc') {
            return <span className="ml-1 text-blue-600">▲</span>;
        }
        if (currentDirection === 'desc') {
            return <span className="ml-1 text-blue-600">▼</span>;
        }
        return <span className="ml-1 text-slate-300 group-hover:text-slate-400">⇅</span>;
    };

    return (
        <th
            className={`px-6 py-4 cursor-pointer select-none group hover:bg-slate-100 transition ${alignClass} ${className}`}
            onClick={() => onSort(sortKey)}
        >
            <span className="inline-flex items-center">
                {label}
                {getSortIcon()}
            </span>
        </th>
    );
}

export default SortableTableHeader;
