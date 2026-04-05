'use client';

import { useState } from 'react';

export type DateFilterPreset =
    | 'TODAY'
    | 'YESTERDAY'
    | 'THIS_WEEK'
    | 'THIS_MONTH'
    | 'LAST_6_MONTHS'
    | 'THIS_YEAR'
    | 'ALL';

export interface DateRange {
    startDate: string | null;
    endDate: string | null;
}

export interface DateQuickFilterProps {
    onFilterChange: (range: DateRange, preset: DateFilterPreset) => void;
    defaultPreset?: DateFilterPreset;
    showCustom?: boolean;
    className?: string;
}

// Helper to format date as YYYY-MM-DD using Local Time
const formatDate = (date: Date): string => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};

// Get date range for a preset
export const getDateRange = (preset: DateFilterPreset): DateRange => {
    const today = new Date();
    today.setHours(23, 59, 59, 999);

    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    switch (preset) {
        case 'TODAY':
            return { startDate: formatDate(startOfDay), endDate: formatDate(today) };

        case 'YESTERDAY': {
            const yesterday = new Date(startOfDay);
            yesterday.setDate(yesterday.getDate() - 1);
            const yesterdayEnd = new Date(yesterday);
            yesterdayEnd.setHours(23, 59, 59, 999);
            return { startDate: formatDate(yesterday), endDate: formatDate(yesterdayEnd) };
        }

        case 'THIS_WEEK': {
            const startOfWeek = new Date(startOfDay);
            const day = startOfWeek.getDay();
            const diff = startOfWeek.getDate() - day + (day === 0 ? -6 : 1); // Monday start
            startOfWeek.setDate(diff);
            return { startDate: formatDate(startOfWeek), endDate: formatDate(today) };
        }

        case 'THIS_MONTH': {
            const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
            return { startDate: formatDate(startOfMonth), endDate: formatDate(today) };
        }

        case 'LAST_6_MONTHS': {
            const sixMonthsAgo = new Date(today);
            sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
            return { startDate: formatDate(sixMonthsAgo), endDate: formatDate(today) };
        }

        case 'THIS_YEAR': {
            const startOfYear = new Date(today.getFullYear(), 0, 1);
            return { startDate: formatDate(startOfYear), endDate: formatDate(today) };
        }

        case 'ALL':
        default:
            return { startDate: null, endDate: null };
    }
};

const presetLabels: Record<DateFilterPreset, string> = {
    TODAY: "Aujourd'hui",
    YESTERDAY: 'Hier',
    THIS_WEEK: 'Cette semaine',
    THIS_MONTH: 'Ce mois',
    LAST_6_MONTHS: '6 derniers mois',
    THIS_YEAR: 'Cette année',
    ALL: 'Tout',
};

export function DateQuickFilter({
    onFilterChange,
    defaultPreset = 'ALL',
    showCustom = false,
    className = ''
}: DateQuickFilterProps) {
    const [activePreset, setActivePreset] = useState<DateFilterPreset>(defaultPreset);
    const [customStart, setCustomStart] = useState('');
    const [customEnd, setCustomEnd] = useState('');

    const handlePresetClick = (preset: DateFilterPreset) => {
        setActivePreset(preset);
        const range = getDateRange(preset);
        onFilterChange(range, preset);
    };

    const handleCustomApply = () => {
        if (customStart && customEnd) {
            setActivePreset('ALL'); // Clear preset highlight
            onFilterChange({ startDate: customStart, endDate: customEnd }, 'ALL');
        }
    };

    const presets: DateFilterPreset[] = [
        'TODAY',
        'YESTERDAY',
        'THIS_WEEK',
        'THIS_MONTH',
        'LAST_6_MONTHS',
        'THIS_YEAR',
        'ALL',
    ];

    return (
        <div className={`flex flex-wrap items-center gap-2 ${className}`}>
            {presets.map(preset => (
                <button
                    key={preset}
                    onClick={() => handlePresetClick(preset)}
                    className={`px-3 py-1.5 text-xs font-medium rounded-full transition ${activePreset === preset
                        ? 'bg-blue-600 text-white shadow-sm'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                        }`}
                >
                    {presetLabels[preset]}
                </button>
            ))}

            {showCustom && (
                <div className="flex items-center gap-2 ml-2 pl-2 border-l border-slate-200">
                    <input
                        type="date"
                        value={customStart}
                        onChange={e => setCustomStart(e.target.value)}
                        className="px-2 py-1 text-xs border border-slate-300 rounded-lg"
                    />
                    <span className="text-slate-400 text-xs">→</span>
                    <input
                        type="date"
                        value={customEnd}
                        onChange={e => setCustomEnd(e.target.value)}
                        className="px-2 py-1 text-xs border border-slate-300 rounded-lg"
                    />
                    <button
                        onClick={handleCustomApply}
                        disabled={!customStart || !customEnd}
                        className="px-2 py-1 text-xs bg-slate-600 text-white rounded-lg disabled:opacity-50"
                    >
                        OK
                    </button>
                </div>
            )}
        </div>
    );
}

export default DateQuickFilter;
