'use client';

import { useState, useEffect } from 'react';
import api from '@/lib/api';
import Link from 'next/link';

interface Driver {
    driverid: number;
    firstname: string;
    lastname: string;
    licensenumber: string;
    phone: string;
    status: 'AVAILABLE' | 'ON_DELIVERY' | 'OFF_DUTY';
}

export default function DriversPage() {
    const [drivers, setDrivers] = useState<Driver[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingDriver, setEditingDriver] = useState<Driver | null>(null);
    const [formData, setFormData] = useState({
        firstName: '',
        lastName: '',
        licenseNumber: '',
        phone: '',
        status: 'AVAILABLE'
    });

    useEffect(() => {
        loadDrivers();
    }, []);

    const loadDrivers = async () => {
        setIsLoading(true);
        try {
            const res = await api.getDrivers();
            if (res.success) {
                setDrivers((res.data as Driver[]) || []);
            }
        } catch (error) {
            console.error('Failed to load drivers', error);
        } finally {
            setIsLoading(false);
        }
    };

    const handleOpenModal = (driver?: Driver) => {
        if (driver) {
            setEditingDriver(driver);
            setFormData({
                firstName: driver.firstname,
                lastName: driver.lastname,
                licenseNumber: driver.licensenumber,
                phone: driver.phone,
                status: driver.status
            });
        } else {
            setEditingDriver(null);
            setFormData({
                firstName: '',
                lastName: '',
                licenseNumber: '',
                phone: '',
                status: 'AVAILABLE'
            });
        }
        setIsModalOpen(true);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            if (editingDriver) {
                await api.updateDriver(editingDriver.driverid, formData);
            } else {
                await api.createDriver(formData);
            }
            setIsModalOpen(false);
            loadDrivers();
        } catch (error) {
            console.error('Failed to save driver', error);
            alert('Erreur lors de la sauvegarde');
        }
    };

    const handleDelete = async (id: number) => {
        if (!confirm('Êtes-vous sûr de vouloir supprimer ce chauffeur ?')) return;
        try {
            await api.deleteDriver(id);
            loadDrivers();
        } catch (error) {
            console.error('Failed to delete driver', error);
            alert('Erreur lors de la suppression');
        }
    };

    return (
        <div className="p-6">
            <div className="flex justify-between items-center mb-6">
                <div>
                    <Link href="/logistics" className="text-sm text-blue-100 hover:text-white mb-2 block">← Retour Logistique</Link>
                    <h1 className="text-3xl font-bold text-white drop-shadow-md">Gestion des Chauffeurs</h1>
                </div>
                <button
                    onClick={() => handleOpenModal()}
                    className="bg-white/10 hover:bg-white/20 text-white border border-white/20 backdrop-blur-sm shadow-lg px-4 py-2 rounded-lg transition"
                >
                    + Nouveau Chauffeur
                </button>
            </div>

            {isLoading ? (
                <p className="text-center text-slate-500 py-8">Chargement...</p>
            ) : (
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                    <table className="w-full text-left">
                        <thead className="bg-slate-50 border-b border-slate-200">
                            <tr>
                                <th className="p-4 font-semibold text-slate-700">Nom Complet</th>
                                <th className="p-4 font-semibold text-slate-700">Permis</th>
                                <th className="p-4 font-semibold text-slate-700">Téléphone</th>
                                <th className="p-4 font-semibold text-slate-700">Statut</th>
                                <th className="p-4 font-semibold text-slate-700 text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {drivers.map((driver) => (
                                <tr key={driver.driverid} className="hover:bg-slate-50">
                                    <td className="p-4 font-medium text-slate-900">{driver.firstname} {driver.lastname}</td>
                                    <td className="p-4 text-slate-600">{driver.licensenumber}</td>
                                    <td className="p-4 text-slate-600">{driver.phone}</td>
                                    <td className="p-4">
                                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${driver.status === 'AVAILABLE' ? 'bg-green-100 text-green-700' :
                                            driver.status === 'ON_DELIVERY' ? 'bg-blue-100 text-blue-700' :
                                                'bg-slate-100 text-slate-700'
                                            }`}>
                                            {driver.status === 'AVAILABLE' ? 'DISPONIBLE' :
                                                driver.status === 'ON_DELIVERY' ? 'EN LIVRAISON' : 'HORS SERVICE'}
                                        </span>
                                    </td>
                                    <td className="p-4 text-right space-x-2">
                                        <button
                                            onClick={() => handleOpenModal(driver)}
                                            className="text-blue-600 hover:text-blue-800 text-sm font-medium"
                                        >
                                            Modifier
                                        </button>
                                        <button
                                            onClick={() => handleDelete(driver.driverid)}
                                            className="text-red-600 hover:text-red-800 text-sm font-medium"
                                        >
                                            Supprimer
                                        </button>
                                    </td>
                                </tr>
                            ))}
                            {drivers.length === 0 && (
                                <tr>
                                    <td colSpan={5} className="p-8 text-center text-slate-500">
                                        Aucun chauffeur trouvé.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            )}

            {isModalOpen && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
                        <h2 className="text-xl font-bold text-slate-800 mb-4">
                            {editingDriver ? 'Modifier Chauffeur' : 'Nouveau Chauffeur'}
                        </h2>
                        <form onSubmit={handleSubmit} className="space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Prénom</label>
                                    <input
                                        type="text"
                                        required
                                        value={formData.firstName}
                                        onChange={e => setFormData({ ...formData, firstName: e.target.value })}
                                        className="w-full p-2 border border-slate-300 rounded-lg"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Nom</label>
                                    <input
                                        type="text"
                                        required
                                        value={formData.lastName}
                                        onChange={e => setFormData({ ...formData, lastName: e.target.value })}
                                        className="w-full p-2 border border-slate-300 rounded-lg"
                                    />
                                </div>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">Numéro Permis</label>
                                <input
                                    type="text"
                                    required
                                    value={formData.licenseNumber}
                                    onChange={e => setFormData({ ...formData, licenseNumber: e.target.value })}
                                    className="w-full p-2 border border-slate-300 rounded-lg"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">Téléphone</label>
                                <input
                                    type="tel"
                                    required
                                    value={formData.phone}
                                    onChange={e => setFormData({ ...formData, phone: e.target.value })}
                                    className="w-full p-2 border border-slate-300 rounded-lg"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">Statut</label>
                                <select
                                    value={formData.status}
                                    onChange={e => setFormData({ ...formData, status: e.target.value })}
                                    className="w-full p-2 border border-slate-300 rounded-lg"
                                >
                                    <option value="AVAILABLE">Disponible</option>
                                    <option value="ON_DELIVERY">En Livraison</option>
                                    <option value="OFF_DUTY">Hors Service</option>
                                </select>
                            </div>
                            <div className="flex justify-end gap-3 mt-6">
                                <button
                                    type="button"
                                    onClick={() => setIsModalOpen(false)}
                                    className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg"
                                >
                                    Annuler
                                </button>
                                <button
                                    type="submit"
                                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                                >
                                    Enregistrer
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
