'use client';

import { useState, useEffect } from 'react';
import api from '@/lib/api';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';

interface EmployeeStats {
    employee: {
        employeeid: number;
        firstname: string;
        lastname: string;
        position: string;
        department: string;
        userid: number | null;
    };
    sales: {
        ordercount: number;
        totalsales: number;
    };
    attendance: {
        totaldays: number;
        presentdays: number;
        absentdays: number;
        latedays: number;
        totalhours: number;
    };
}

interface SessionLog {
    auditid: number;
    userid: number;
    username: string;
    action: string;
    ipaddress: string;
    useragent: string;
    createdat: string;
}

export default function EmployeeReportPage() {
    const params = useParams();
    const router = useRouter();
    const employeeId = Number(params.id);

    const [stats, setStats] = useState<EmployeeStats | null>(null);
    const [sessions, setSessions] = useState<SessionLog[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (employeeId) {
            fetchData();
        }
    }, [employeeId]);

    const fetchData = async () => {
        setIsLoading(true);
        setError(null);
        try {
            // 1. Fetch Stats
            const statsRes = await api.getEmployeeStats(employeeId);
            if (statsRes.success) {
                setStats(statsRes.data);

                // 2. Fetch Sessions if user exists
                if (statsRes.data.employee.userid) {
                    const sessionsRes = await api.getSessionHistory({ userId: statsRes.data.employee.userid, limit: 10 });
                    if (sessionsRes.success && sessionsRes.data) {
                        setSessions(sessionsRes.data as SessionLog[]);
                    }
                }
            } else {
                throw new Error(statsRes.message || 'Failed to load stats');
            }
        } catch (err: any) {
            console.error('Error loading employee report:', err);
            setError(err.message);
        } finally {
            setIsLoading(false);
        }
    };

    if (isLoading) return <div className="p-8 text-center text-slate-500">Chargement du rapport...</div>;
    if (error) return <div className="p-8 text-center text-red-500">Erreur: {error}</div>;
    if (!stats) return <div className="p-8 text-center text-slate-500">Employé non trouvé.</div>;

    return (
        <div className="p-6 max-w-7xl mx-auto min-h-screen">
            {/* Header */}
            <div className="mb-8 flex justify-between items-start">
                <div>
                    <h1 className="text-3xl font-bold text-slate-800 mb-2">
                        {stats.employee.firstname} {stats.employee.lastname}
                    </h1>
                    <div className="flex gap-3 text-sm text-slate-500">
                        <span className="bg-blue-100 text-blue-800 px-2 py-1 rounded">{stats.employee.position}</span>
                        <span className="bg-slate-100 text-slate-700 px-2 py-1 rounded">{stats.employee.department}</span>
                    </div>
                </div>
                <Link href="/hr/employees" className="text-blue-600 hover:text-blue-800 font-medium">
                    ← Retour aux Employés
                </Link>
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
                {/* Sales Card */}
                <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
                    <h3 className="text-sm font-medium text-slate-500 mb-1">Ventes Totales</h3>
                    <div className="text-2xl font-bold text-green-600">
                        {Number(stats.sales.totalsales).toLocaleString('fr-DZ', { style: 'currency', currency: 'DZD' })}
                    </div>
                    <div className="text-xs text-slate-400 mt-2">{stats.sales.ordercount} commandes</div>
                </div>

                {/* Attendance Card */}
                <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
                    <h3 className="text-sm font-medium text-slate-500 mb-1">Présence</h3>
                    <div className="text-2xl font-bold text-blue-600">
                        {stats.attendance.presentdays} <span className="text-sm font-normal text-slate-400">/ {stats.attendance.totaldays} jours</span>
                    </div>
                    <div className="text-xs text-slate-400 mt-2">
                        {stats.attendance.latedays} retards • {stats.attendance.absentdays} absences
                    </div>
                </div>

                {/* Hours Card */}
                <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
                    <h3 className="text-sm font-medium text-slate-500 mb-1">Heures Travaillées</h3>
                    <div className="text-2xl font-bold text-purple-600">
                        {stats.attendance.totalhours} h
                    </div>
                    <div className="text-xs text-slate-400 mt-2">Total cumulé</div>
                </div>

                {/* Status Card */}
                <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
                    <h3 className="text-sm font-medium text-slate-500 mb-1">Compte Utilisateur</h3>
                    <div className={`text-lg font-semibold ${stats.employee.userid ? 'text-green-600' : 'text-slate-400'}`}>
                        {stats.employee.userid ? 'Actif' : 'Non lié'}
                    </div>
                    <div className="text-xs text-slate-400 mt-2">
                        ID: {stats.employee.userid || 'N/A'}
                    </div>
                </div>
            </div>

            {/* Session History */}
            {stats.employee.userid && (
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                    <div className="p-6 border-b border-slate-100">
                        <h2 className="text-lg font-semibold text-slate-800">Historique de Connexion Récent</h2>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm text-left text-slate-600">
                            <thead className="bg-slate-50 text-xs uppercase font-semibold text-slate-500">
                                <tr>
                                    <th className="px-6 py-3">Date/Heure</th>
                                    <th className="px-6 py-3">Action</th>
                                    <th className="px-6 py-3">IP Address</th>
                                    <th className="px-6 py-3">User Agent</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {sessions.length === 0 ? (
                                    <tr>
                                        <td colSpan={4} className="px-6 py-4 text-center text-slate-400">Aucune activité récente.</td>
                                    </tr>
                                ) : (
                                    sessions.map((log) => (
                                        <tr key={log.auditid} className="hover:bg-slate-50">
                                            <td className="px-6 py-3 font-medium">
                                                {new Date(log.createdat).toLocaleString('fr-FR')}
                                            </td>
                                            <td className="px-6 py-3">
                                                <span className={`px-2 py-1 rounded-full text-xs font-semibold ${log.action === 'LOGIN' ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-700'
                                                    }`}>
                                                    {log.action}
                                                </span>
                                            </td>
                                            <td className="px-6 py-3 font-mono text-xs">{log.ipaddress}</td>
                                            <td className="px-6 py-3 text-xs text-slate-400 truncate max-w-xs" title={log.useragent}>
                                                {log.useragent}
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    );
}
