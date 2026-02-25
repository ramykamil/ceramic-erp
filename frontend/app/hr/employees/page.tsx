'use client';

import { useState, useEffect } from 'react';
import api from '@/lib/api';
import Link from 'next/link';

interface Employee {
    employeeid: number;
    employeecode: string;
    firstname: string;
    lastname: string;
    position: string;
    department: string;
    email: string;
    phone?: string;
    basicsalary: number;
    hiredate?: string;
    isactive?: boolean;
}

// Format salary
const formatMoney = (amount: number) => new Intl.NumberFormat('fr-DZ', { style: 'currency', currency: 'DZD', minimumFractionDigits: 0 }).format(amount || 0);

export default function EmployeesPage() {
    const [employees, setEmployees] = useState<Employee[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [showForm, setShowForm] = useState(false);
    const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [formData, setFormData] = useState({
        EmployeeCode: '',
        FirstName: '',
        LastName: '',
        Position: '',
        Department: '',
        Email: '',
        Phone: '',
        BasicSalary: 0,
    });

    useEffect(() => {
        fetchEmployees();
    }, []);

    const fetchEmployees = async () => {
        setIsLoading(true);
        try {
            const res = await api.getEmployees();
            if (res.success) {
                setEmployees(res.data || []);
            }
        } catch (error) {
            console.error('Failed to fetch employees', error);
        } finally {
            setIsLoading(false);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            if (editingEmployee) {
                await api.updateEmployee(editingEmployee.employeeid, formData);
                alert('✅ Employé mis à jour avec succès');
            } else {
                await api.createEmployee(formData);
                alert('✅ Employé créé avec succès');
            }
            setShowForm(false);
            setEditingEmployee(null);
            resetForm();
            fetchEmployees();
        } catch (error) {
            console.error('Failed to save employee', error);
            alert('❌ Erreur lors de l\'enregistrement');
        }
    };

    const resetForm = () => {
        setFormData({
            EmployeeCode: '',
            FirstName: '',
            LastName: '',
            Position: '',
            Department: '',
            Email: '',
            Phone: '',
            BasicSalary: 0,
        });
    };

    const handleEdit = (employee: Employee) => {
        setEditingEmployee(employee);
        setFormData({
            EmployeeCode: employee.employeecode,
            FirstName: employee.firstname,
            LastName: employee.lastname,
            Position: employee.position || '',
            Department: employee.department || '',
            Email: employee.email || '',
            Phone: employee.phone || '',
            BasicSalary: employee.basicsalary || 0,
        });
        setShowForm(true);
    };

    const openNewForm = () => {
        setEditingEmployee(null);
        resetForm();
        setShowForm(true);
    };

    // Filter employees
    const filteredEmployees = employees.filter(emp => {
        const search = searchQuery.toLowerCase();
        return (
            emp.firstname?.toLowerCase().includes(search) ||
            emp.lastname?.toLowerCase().includes(search) ||
            emp.employeecode?.toLowerCase().includes(search) ||
            emp.department?.toLowerCase().includes(search) ||
            emp.position?.toLowerCase().includes(search)
        );
    });

    // Stats
    const totalSalary = employees.reduce((sum, emp) => sum + (emp.basicsalary || 0), 0);
    const departments = Array.from(new Set(employees.map(e => e.department).filter(Boolean)));

    return (
        <div className="h-screen flex flex-col bg-slate-50 text-slate-800 overflow-hidden">
            <div className="flex flex-col h-full max-w-[1600px] mx-auto w-full p-4">

                {/* HEADER */}
                <div className="mb-4 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 flex-shrink-0">
                    <div>
                        <h1 className="text-2xl md:text-3xl font-bold text-slate-800">👨‍💼 Gestion des Employés</h1>
                        <p className="text-slate-500 text-sm mt-1">
                            {employees.length} employés • {departments.length} départements
                        </p>
                    </div>
                    <div className="flex gap-3">
                        <Link href="/" className="bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 px-4 py-2.5 rounded-lg text-sm font-medium transition shadow-sm">
                            ← Retour
                        </Link>
                        <button
                            onClick={openNewForm}
                            className="bg-green-600 hover:bg-green-700 text-white px-4 py-2.5 rounded-lg font-medium shadow-sm flex items-center gap-2"
                        >
                            + Nouvel Employé
                        </button>
                    </div>
                </div>

                {/* STATS CARDS */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4 flex-shrink-0">
                    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
                        <div className="text-sm text-slate-500">Total Employés</div>
                        <div className="text-2xl font-bold text-slate-800">{employees.length}</div>
                    </div>
                    <div className="bg-blue-50 rounded-xl border border-blue-200 shadow-sm p-4">
                        <div className="text-sm text-blue-600">Départements</div>
                        <div className="text-2xl font-bold text-blue-700">{departments.length}</div>
                    </div>
                    <div className="bg-green-50 rounded-xl border border-green-200 shadow-sm p-4">
                        <div className="text-sm text-green-600">Masse Salariale</div>
                        <div className="text-xl font-bold text-green-700">{formatMoney(totalSalary)}</div>
                    </div>
                    <div className="bg-purple-50 rounded-xl border border-purple-200 shadow-sm p-4">
                        <div className="text-sm text-purple-600">Salaire Moyen</div>
                        <div className="text-xl font-bold text-purple-700">
                            {employees.length > 0 ? formatMoney(totalSalary / employees.length) : '-'}
                        </div>
                    </div>
                </div>

                {/* SEARCH BAR */}
                <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-3 mb-4 flex-shrink-0">
                    <input
                        type="text"
                        placeholder="🔍 Rechercher (Nom, Code, Département, Poste)..."
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                        className="w-full p-2.5 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                </div>

                {/* TABLE */}
                <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex-1 flex flex-col min-h-0">
                    <div className="overflow-auto flex-1">
                        <table className="w-full text-sm">
                            <thead className="bg-slate-700 text-white text-xs uppercase sticky top-0">
                                <tr>
                                    <th className="p-3 text-left">Code</th>
                                    <th className="p-3 text-left">Nom Complet</th>
                                    <th className="p-3 text-left">Poste</th>
                                    <th className="p-3 text-left">Département</th>
                                    <th className="p-3 text-left">Email</th>
                                    <th className="p-3 text-right bg-green-800">Salaire</th>
                                    <th className="p-3 text-center w-24">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {isLoading ? (
                                    <tr>
                                        <td colSpan={7} className="p-8 text-center text-slate-400">
                                            Chargement...
                                        </td>
                                    </tr>
                                ) : filteredEmployees.length === 0 ? (
                                    <tr>
                                        <td colSpan={7} className="p-8 text-center text-slate-400 italic">
                                            Aucun employé trouvé.
                                        </td>
                                    </tr>
                                ) : (
                                    filteredEmployees.map((emp, i) => (
                                        <tr key={emp.employeeid} className={`hover:bg-blue-50 transition ${i % 2 === 0 ? 'bg-white' : 'bg-slate-50'}`}>
                                            <td className="p-3 font-mono text-slate-600">{emp.employeecode}</td>
                                            <td className="p-3 font-medium text-slate-800">
                                                {emp.firstname} {emp.lastname}
                                            </td>
                                            <td className="p-3 text-slate-600">{emp.position || '-'}</td>
                                            <td className="p-3">
                                                {emp.department ? (
                                                    <span className="px-2 py-1 text-xs font-medium rounded-full bg-blue-100 text-blue-800">
                                                        {emp.department}
                                                    </span>
                                                ) : '-'}
                                            </td>
                                            <td className="p-3 text-slate-600">{emp.email || '-'}</td>
                                            <td className="p-3 text-right font-mono font-bold text-green-700 bg-green-50/50">
                                                {formatMoney(emp.basicsalary)}
                                            </td>
                                            <td className="p-3 text-center">
                                                <button
                                                    onClick={() => handleEdit(emp)}
                                                    className="text-blue-600 hover:text-blue-800 hover:bg-blue-100 p-1.5 rounded transition"
                                                    title="Modifier"
                                                >
                                                    ✏️
                                                </button>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* FORM MODAL */}
                {showForm && (
                    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                        <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
                            <div className="p-5 border-b border-slate-100 flex justify-between items-center sticky top-0 bg-white">
                                <h2 className="text-lg font-bold text-slate-800">
                                    {editingEmployee ? '✏️ Modifier Employé' : '➕ Nouvel Employé'}
                                </h2>
                                <button onClick={() => setShowForm(false)} className="text-slate-400 hover:text-slate-600 text-2xl">&times;</button>
                            </div>
                            <form onSubmit={handleSubmit} className="p-6 space-y-4">
                                <div>
                                    <label className="block text-xs font-medium text-slate-500 uppercase mb-1">Code Employé *</label>
                                    <input
                                        type="text"
                                        required
                                        className="w-full p-2.5 border border-slate-300 rounded-lg text-sm"
                                        placeholder="EMP-001"
                                        value={formData.EmployeeCode}
                                        onChange={(e) => setFormData({ ...formData, EmployeeCode: e.target.value })}
                                        disabled={!!editingEmployee}
                                    />
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-xs font-medium text-slate-500 uppercase mb-1">Prénom *</label>
                                        <input
                                            type="text"
                                            required
                                            className="w-full p-2.5 border border-slate-300 rounded-lg text-sm"
                                            value={formData.FirstName}
                                            onChange={(e) => setFormData({ ...formData, FirstName: e.target.value })}
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-medium text-slate-500 uppercase mb-1">Nom *</label>
                                        <input
                                            type="text"
                                            required
                                            className="w-full p-2.5 border border-slate-300 rounded-lg text-sm"
                                            value={formData.LastName}
                                            onChange={(e) => setFormData({ ...formData, LastName: e.target.value })}
                                        />
                                    </div>
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-xs font-medium text-slate-500 uppercase mb-1">Poste</label>
                                        <input
                                            type="text"
                                            className="w-full p-2.5 border border-slate-300 rounded-lg text-sm"
                                            placeholder="Vendeur, Chauffeur..."
                                            value={formData.Position}
                                            onChange={(e) => setFormData({ ...formData, Position: e.target.value })}
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-medium text-slate-500 uppercase mb-1">Département</label>
                                        <input
                                            type="text"
                                            className="w-full p-2.5 border border-slate-300 rounded-lg text-sm"
                                            placeholder="Ventes, Logistique..."
                                            value={formData.Department}
                                            onChange={(e) => setFormData({ ...formData, Department: e.target.value })}
                                        />
                                    </div>
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-xs font-medium text-slate-500 uppercase mb-1">Email</label>
                                        <input
                                            type="email"
                                            className="w-full p-2.5 border border-slate-300 rounded-lg text-sm"
                                            value={formData.Email}
                                            onChange={(e) => setFormData({ ...formData, Email: e.target.value })}
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-medium text-slate-500 uppercase mb-1">Téléphone</label>
                                        <input
                                            type="tel"
                                            className="w-full p-2.5 border border-slate-300 rounded-lg text-sm"
                                            placeholder="07XXXXXXXX"
                                            value={formData.Phone}
                                            onChange={(e) => setFormData({ ...formData, Phone: e.target.value })}
                                        />
                                    </div>
                                </div>
                                <div>
                                    <label className="block text-xs font-medium text-slate-500 uppercase mb-1">Salaire de Base (DZD)</label>
                                    <input
                                        type="number"
                                        step="1000"
                                        className="w-full p-2.5 border border-slate-300 rounded-lg text-sm"
                                        placeholder="45000"
                                        value={formData.BasicSalary || ''}
                                        onChange={(e) => setFormData({ ...formData, BasicSalary: parseFloat(e.target.value) || 0 })}
                                    />
                                </div>
                                <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
                                    <button
                                        type="button"
                                        onClick={() => setShowForm(false)}
                                        className="bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 px-4 py-2 rounded-lg font-medium text-sm"
                                    >
                                        Annuler
                                    </button>
                                    <button
                                        type="submit"
                                        className="bg-blue-600 text-white hover:bg-blue-700 px-4 py-2 rounded-lg font-medium text-sm"
                                    >
                                        {editingEmployee ? 'Mettre à jour' : 'Créer'}
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
