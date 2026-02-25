'use client';

import * as XLSX from 'xlsx';

export interface ExportColumn {
    key: string;
    label: string;
    format?: (value: any, row?: any) => string | number;
}

/**
 * Export data to Excel file
 * @param data - Array of objects to export
 * @param columns - Column definitions with key, label, and optional format function
 * @param filename - Name of the file (without extension)
 * @param sheetName - Name of the Excel sheet (default: 'Data')
 */
export function exportToExcel<T extends Record<string, any>>(
    data: T[],
    columns: ExportColumn[],
    filename: string,
    sheetName: string = 'Data'
): void {
    // Transform data using column definitions
    const exportData = data.map(row => {
        const exportRow: Record<string, any> = {};
        columns.forEach(col => {
            const value = row[col.key];
            exportRow[col.label] = col.format ? col.format(value, row) : value ?? '';
        });
        return exportRow;
    });

    // Create workbook and worksheet
    const worksheet = XLSX.utils.json_to_sheet(exportData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);

    // Auto-size columns
    const colWidths = columns.map(col => ({
        wch: Math.max(
            col.label.length,
            ...exportData.map(row => String(row[col.label] ?? '').length)
        ) + 2
    }));
    worksheet['!cols'] = colWidths;

    // Generate filename with date
    const dateStr = new Date().toISOString().split('T')[0];
    const fullFilename = `${filename}_${dateStr}.xlsx`;

    // Download file
    XLSX.writeFile(workbook, fullFilename);
}

/**
 * Format currency for export (removes currency symbol for Excel)
 */
export const formatCurrencyExport = (value: number | null | undefined): number => {
    return Number(value) || 0;
};

/**
 * Format date for export
 */
export const formatDateExport = (value: string | null | undefined): string => {
    if (!value) return '';
    try {
        return new Date(value).toLocaleDateString('fr-FR');
    } catch {
        return value;
    }
};

/**
 * Format quantity for export
 */
export const formatQuantityExport = (value: number | null | undefined): number => {
    return Number(value) || 0;
};

export default exportToExcel;
