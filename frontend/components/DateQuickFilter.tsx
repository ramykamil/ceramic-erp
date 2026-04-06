'use client';

import { useState } from 'react';
import { formatDate as formatDisplayDate } from '@/lib/utils';

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

/**
 * Standard Date Input that ensures DD/MM/YYYY display
 */
export function StandardDateInput({ value, onChange, placeholder, id, className }: { 
  value: string; 
  onChange: (val: string) => void; 
  placeholder?: string;
  id?: string;
  className?: string;
}) {
    // value is YYYY-MM-DD
    const displayValue = value ? formatDisplayDate(value) : placeholder;

    return (
        <div className={`relative group inline-block min-w-[130px] ${className || ''}`}>
            {/* Custom display overlay - forcing DD/MM/YYYY */}
            <div className="absolute inset-0 flex items-center px-3 py-2 border border-slate-300 rounded-lg bg-white group-focus-within:ring-2 group-focus-within:ring-brand-primary/20 group-focus-within:border-brand-primary pointer-events-none z-10 transition-all duration-200">
                <span className={`text-sm ${value ? 'text-slate-800 font-medium' : 'text-slate-400'}`}>
                    {value ? formatDisplayDate(value) : (placeholder || 'JJ/MM/AAAA')}
                </span>
                <span className="ml-auto text-slate-400 text-xs">📅</span>
            </div>

            {/* Hidden native input that still controls the state and provides the picker */}
            <input
                id={id}
                type="date"
                value={value}
                onChange={(e) => onChange(e.target.value)}
                className="w-full p-2 opacity-0 focus:opacity-0 cursor-pointer relative z-20"
            />
        </div>
    );
}

// Helper to format date as YYYY-MM-DD using Local Time for internal state
const formatDateInternal = (date: Date): string => {
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
            return { startDate: formatDateInternal(startOfDay), endDate: formatDateInternal(today) };

        case 'YESTERDAY': {
            const yesterday = new Date(startOfDay);
            yesterday.setDate(yesterday.getDate() - 1);
            const yesterdayEnd = new Date(yesterday);
            yesterdayEnd.setHours(23, 59, 59, 999);
            return { startDate: formatDateInternal(yesterday), endDate: formatDateInternal(yesterdayEnd) };
        }

        case 'THIS_WEEK': {
            const startOfWeek = new Date(startOfDay);
            const day = startOfWeek.getDay();
            const diff = startOfWeek.getDate() - day + (day === 0 ? -6 : 1); // Monday start
            startOfWeek.setDate(diff);
            return { startDate: formatDateInternal(startOfWeek), endDate: formatDateInternal(today) };
        }

        case 'THIS_MONTH': {
            const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
            return { startDate: formatDateInternal(startOfMonth), endDate: formatDateInternal(today) };
        }

        case 'LAST_6_MONTHS': {
            const sixMonthsAgo = new Date(today);
            sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
            return { startDate: formatDateInternal(sixMonthsAgo), endDate: formatDateInternal(today) };
        }

        case 'THIS_YEAR': {
            const startOfYear = new Date(today.getFullYear(), 0, 1);
            return { startDate: formatDateInternal(startOfYear), endDate: formatDateInternal(today) };
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
                        ? 'bg-brand-primary text-white shadow-sm'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                        }`}
                >
                    {presetLabels[preset]}
                </button>
            ))}

            {showCustom && (
                <div className="flex items-center gap-2 ml-2 pl-2 border-l border-slate-200 animate-in fade-in slide-in-from-left-2 duration-300">
                    <StandardDateInput 
                        value={customStart} 
                        onChange={setCustomStart} 
                        placeholder="Du..." 
                    />
                    <span className="text-slate-400 text-xs">→</span>
                    <StandardDateInput 
                        value={customEnd} 
                        onChange={setCustomEnd} 
                        placeholder="Au..." 
                    />
                    <button
                        onClick={handleCustomApply}
                        disabled={!customStart || !customEnd}
                        className="px-3 py-1.5 text-xs bg-slate-800 text-white rounded-lg disabled:opacity-50 hover:bg-slate-900 transition-colors shadow-sm font-bold"
                    >
                        OK
                    </button>
                </div>
            )}
        </div>
    );
}

export default DateQuickFilter;
