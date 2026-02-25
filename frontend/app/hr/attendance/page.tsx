'use client';

import { useState, useEffect } from 'react';
import api from '@/lib/api';
import Link from 'next/link';

interface AttendanceRecord {
    attendanceid: number;
    employeeid: number;
    checkintime: string;
    checkouttime: string | null;
    date: string;
    status: string;
    firstname: string;
    lastname: string;
}

interface Employee {
    employeeid: number;
    employeecode: string;
    firstname: string;
    lastname: string;
}

export default function AttendancePage() {
    const [employees, setEmployees] = useState<Employee[]>([]);
    const [attendanceHistory, setAttendanceHistory] = useState<AttendanceRecord[]>([]);
    const [selectedEmployeeId, setSelectedEmployeeId] = useState<string>('');
    const [isLoading, setIsLoading] = useState(false);
    const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

    // Client-side clock
    const [currentTime, setCurrentTime] = useState<string>('--:--');

    useEffect(() => {
        fetchEmployees();
        fetchHistory();

        const updateClock = () => {
            setCurrentTime(new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }));
        };
        updateClock();
        const interval = setInterval(updateClock, 1000);
        return () => clearInterval(interval);
    }, []);

    const fetchEmployees = async () => {
        try {
            const res = await api.getEmployees();
            if (res.success) setEmployees(res.data || []);
        } catch (error) {
            console.error('Erreur chargement employés', error);
        }
    };

    const fetchHistory = async () => {
        try {
            const res = await api.getAttendanceHistory();
            if (res.success) setAttendanceHistory(res.data || []);
        } catch (error) {
            console.error('Erreur chargement historique', error);
        }
    };

    const translateError = (error: string) => {
        const translations: Record<string, string> = {
            'Already clocked in': 'Déjà pointé en entrée',
            'Not clocked in': 'Pas encore pointé son entrée',
            'Employee ID is required': 'Sélectionnez un employé',
        };
        return translations[error] || error;
    };

    const handleClockIn = async () => {
        if (!selectedEmployeeId) {
            setMessage({ type: 'error', text: 'Sélectionnez un employé' });
            return;
        }
        setIsLoading(true);
        setMessage(null);
        try {
            const res = await api.clockIn(parseInt(selectedEmployeeId));
            if (res.success) {
                setMessage({ type: 'success', text: '✅ Entrée enregistrée' });
                fetchHistory();
            } else {
                setMessage({ type: 'error', text: translateError(res.message || 'Erreur') });
            }
        } catch (error: any) {
            setMessage({ type: 'error', text: translateError(error.message || 'Erreur') });
        } finally {
            setIsLoading(false);
        }
    };

    const handleClockOut = async () => {
        if (!selectedEmployeeId) {
            setMessage({ type: 'error', text: 'Sélectionnez un employé' });
            return;
        }
        setIsLoading(true);
        setMessage(null);
        try {
            const res = await api.clockOut(parseInt(selectedEmployeeId));
            if (res.success) {
                setMessage({ type: 'success', text: '✅ Sortie enregistrée' });
                fetchHistory();
            } else {
                setMessage({ type: 'error', text: translateError(res.message || 'Erreur') });
            }
        } catch (error: any) {
            setMessage({ type: 'error', text: translateError(error.message || 'Erreur') });
        } finally {
            setIsLoading(false);
        }
    };

    // Format time from TIME column (HH:MM:SS or HH:MM:SS.xxx)
    const formatTime = (timeStr: string | null) => {
        if (!timeStr) return '-';
        try {
            // TIME columns return format like "14:30:00" or "14:30:00.123"
            const parts = timeStr.split(':');
            if (parts.length >= 2) {
                return `${parts[0]}:${parts[1]}`;
            }
            return timeStr;
        } catch {
            return '-';
        }
    };

    // Format date
    const formatDate = (dateStr: string | null) => {
        if (!dateStr) return '-';
        try {
            const date = new Date(dateStr);
            if (isNaN(date.getTime())) return '-';
            return date.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' });
        } catch {
            return '-';
        }
    };

    // Today's records - parse UTC dates and compare as LOCAL dates
    const now = new Date();
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

    const todayRecords = attendanceHistory.filter(r => {
        if (!r.date) return false;
        // Parse the UTC date and get the LOCAL date components
        const d = new Date(r.date);
        const localDateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        return localDateStr === todayStr;
    });

    return (
        <div className="min-h-screen bg-slate-50 p-4">
            <div className="max-w-4xl mx-auto">

                {/* HEADER */}
                <div className="flex justify-between items-center mb-6">
                    <div>
                        <h1 className="text-2xl font-bold text-slate-800">⏰ Pointage</h1>
                        <p className="text-sm text-slate-500">{employees.length} employés</p>
                    </div>
                    <Link href="/" className="bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 px-4 py-2 rounded-lg text-sm font-medium shadow-sm">
                        ← Retour
                    </Link>
                </div>

                {/* CLOCK PANEL */}
                <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 mb-6">
                    <div className="flex flex-col md:flex-row gap-6 items-center">

                        {/* Time Display */}
                        <div className="bg-slate-900 text-white rounded-lg px-8 py-4 text-center" suppressHydrationWarning>
                            <div className="text-4xl font-mono font-bold">{currentTime}</div>
                        </div>

                        {/* Employee Select */}
                        <div className="flex-1 w-full md:w-auto">
                            <label className="block text-xs font-medium text-slate-500 uppercase mb-2">Employé</label>
                            <select
                                className="w-full p-3 border border-slate-300 rounded-lg text-sm"
                                value={selectedEmployeeId}
                                onChange={(e) => setSelectedEmployeeId(e.target.value)}
                            >
                                <option value="">-- Choisir --</option>
                                {employees.map((emp) => (
                                    <option key={emp.employeeid} value={emp.employeeid}>
                                        {emp.firstname} {emp.lastname}
                                    </option>
                                ))}
                            </select>
                        </div>

                        {/* Buttons */}
                        <div className="flex gap-3">
                            <button
                                onClick={handleClockIn}
                                disabled={!selectedEmployeeId || isLoading}
                                className="bg-green-600 text-white py-3 px-6 rounded-lg font-bold hover:bg-green-700 disabled:opacity-50 text-lg"
                            >
                                ▶ Entrée
                            </button>
                            <button
                                onClick={handleClockOut}
                                disabled={!selectedEmployeeId || isLoading}
                                className="bg-red-600 text-white py-3 px-6 rounded-lg font-bold hover:bg-red-700 disabled:opacity-50 text-lg"
                            >
                                ⏹ Sortie
                            </button>
                        </div>
                    </div>

                    {/* Message */}
                    {message && (
                        <div className={`mt-4 p-3 rounded-lg text-sm font-medium text-center ${message.type === 'success' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                            }`}>
                            {message.text}
                        </div>
                    )}
                </div>

                {/* TODAY'S RECORDS */}
                <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                    <div className="p-4 border-b border-slate-100 bg-slate-50">
                        <h2 className="font-bold text-slate-800">📋 Pointages du Jour ({todayRecords.length})</h2>
                    </div>

                    {todayRecords.length === 0 ? (
                        <div className="p-8 text-center text-slate-400">
                            Aucun pointage aujourd'hui
                        </div>
                    ) : (
                        <table className="w-full text-sm">
                            <thead className="bg-slate-100 text-slate-600 text-xs uppercase">
                                <tr>
                                    <th className="p-3 text-left">Employé</th>
                                    <th className="p-3 text-center">Entrée</th>
                                    <th className="p-3 text-center">Sortie</th>
                                    <th className="p-3 text-center">Statut</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {todayRecords.map((record) => (
                                    <tr key={record.attendanceid} className="hover:bg-blue-50">
                                        <td className="p-3 font-medium">{record.firstname} {record.lastname}</td>
                                        <td className="p-3 text-center font-mono text-green-600 font-bold">
                                            {formatTime(record.checkintime)}
                                        </td>
                                        <td className="p-3 text-center font-mono text-red-600 font-bold">
                                            {formatTime(record.checkouttime)}
                                        </td>
                                        <td className="p-3 text-center">
                                            <span className="px-2 py-1 text-xs font-bold rounded-full bg-green-100 text-green-800">
                                                {record.status === 'PRESENT' ? 'PRÉSENT' : record.status}
                                            </span>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>

                {/* HISTORY (Last 10) */}
                {attendanceHistory.length > todayRecords.length && (
                    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden mt-6">
                        <div className="p-4 border-b border-slate-100 bg-slate-50">
                            <h2 className="font-bold text-slate-800">📜 Historique Récent</h2>
                        </div>
                        <table className="w-full text-sm">
                            <thead className="bg-slate-100 text-slate-600 text-xs uppercase">
                                <tr>
                                    <th className="p-3 text-left">Date</th>
                                    <th className="p-3 text-left">Employé</th>
                                    <th className="p-3 text-center">Entrée</th>
                                    <th className="p-3 text-center">Sortie</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {attendanceHistory.filter(r => {
                                    if (!r.date) return true;
                                    const d = new Date(r.date);
                                    const localDateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
                                    return localDateStr !== todayStr;
                                }).slice(0, 10).map((record) => (
                                    <tr key={record.attendanceid} className="hover:bg-slate-50">
                                        <td className="p-3 font-mono text-slate-600">{formatDate(record.date)}</td>
                                        <td className="p-3">{record.firstname} {record.lastname}</td>
                                        <td className="p-3 text-center font-mono text-green-600">{formatTime(record.checkintime)}</td>
                                        <td className="p-3 text-center font-mono text-red-600">{formatTime(record.checkouttime)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
}
