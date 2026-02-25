'use client';

import { useState, useEffect } from 'react';
import api from '@/lib/api';
import Link from 'next/link';

interface Vehicle {
    vehicleid: number;
    vehiclenumber: string;
    registrationnumber: string;
    vehicletype: string;
    make: string;
    model: string;
    capacity: number;
    isactive: boolean;
}

export default function VehiclesPage() {
    const [vehicles, setVehicles] = useState<Vehicle[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingVehicle, setEditingVehicle] = useState<Vehicle | null>(null);
    const [formData, setFormData] = useState({
        vehicleNumber: '',
        registrationNumber: '',
        vehicleType: 'TRUCK',
        make: '',
        model: '',
        capacity: ''
    });

    useEffect(() => {
        loadVehicles();
    }, []);

    const loadVehicles = async () => {
        setIsLoading(true);
        try {
            const res = await api.getVehicles();
            if (res.success) {
                setVehicles((res.data as Vehicle[]) || []);
            }
        } catch (error) {
            console.error('Failed to load vehicles', error);
        } finally {
            setIsLoading(false);
        }
    };

    const handleOpenModal = (vehicle?: Vehicle) => {
        if (vehicle) {
            setEditingVehicle(vehicle);
            setFormData({
                vehicleNumber: vehicle.vehiclenumber,
                registrationNumber: vehicle.registrationnumber,
                vehicleType: vehicle.vehicletype,
                make: vehicle.make,
                model: vehicle.model,
                capacity: vehicle.capacity.toString()
            });
        } else {
            setEditingVehicle(null);
            setFormData({
                vehicleNumber: '',
                registrationNumber: '',
                vehicleType: 'TRUCK',
                make: '',
                model: '',
                capacity: ''
            });
        }
        setIsModalOpen(true);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            const payload = {
                ...formData,
                capacity: Number(formData.capacity)
            };

            if (editingVehicle) {
                await api.updateVehicle(editingVehicle.vehicleid, payload);
            } else {
                await api.createVehicle(payload);
            }
            setIsModalOpen(false);
            loadVehicles();
        } catch (error) {
            console.error('Failed to save vehicle', error);
            alert('Erreur lors de la sauvegarde');
        }
    };

    const handleDelete = async (id: number) => {
        if (!confirm('Êtes-vous sûr de vouloir supprimer ce véhicule ?')) return;
        try {
            await api.deleteVehicle(id);
            loadVehicles();
        } catch (error) {
            console.error('Failed to delete vehicle', error);
            alert('Erreur lors de la suppression');
        }
    };

    return (
        <div className="p-6">
            <div className="flex justify-between items-center mb-6">
                <div>
                    <Link href="/logistics" className="text-sm text-blue-100 hover:text-white mb-2 block">← Retour Logistique</Link>
                    <h1 className="text-3xl font-bold text-white drop-shadow-md">Gestion des Véhicules</h1>
                </div>
                <button
                    onClick={() => handleOpenModal()}
                    className="bg-white/10 hover:bg-white/20 text-white border border-white/20 backdrop-blur-sm shadow-lg px-4 py-2 rounded-lg transition"
                >
                    + Nouveau Véhicule
                </button>
            </div>

            {isLoading ? (
                <p className="text-center text-slate-500 py-8">Chargement...</p>
            ) : (
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                    <table className="w-full text-left">
                        <thead className="bg-slate-50 border-b border-slate-200">
                            <tr>
                                <th className="p-4 font-semibold text-slate-700">N° Véhicule</th>
                                <th className="p-4 font-semibold text-slate-700">Immatriculation</th>
                                <th className="p-4 font-semibold text-slate-700">Type</th>
                                <th className="p-4 font-semibold text-slate-700">Marque</th>
                                <th className="p-4 font-semibold text-slate-700">Modèle</th>
                                <th className="p-4 font-semibold text-slate-700">Capacité (kg)</th>
                                <th className="p-4 font-semibold text-slate-700 text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {vehicles.map((vehicle) => (
                                <tr key={vehicle.vehicleid} className="hover:bg-slate-50">
                                    <td className="p-4 font-medium text-slate-900">{vehicle.vehiclenumber}</td>
                                    <td className="p-4 text-slate-600">{vehicle.registrationnumber}</td>
                                    <td className="p-4 text-slate-600">{vehicle.vehicletype}</td>
                                    <td className="p-4 text-slate-600">{vehicle.make}</td>
                                    <td className="p-4 text-slate-600">{vehicle.model}</td>
                                    <td className="p-4 text-slate-600">{vehicle.capacity}</td>
                                    <td className="p-4 text-right space-x-2">
                                        <button
                                            onClick={() => handleOpenModal(vehicle)}
                                            className="text-blue-600 hover:text-blue-800 text-sm font-medium"
                                        >
                                            Modifier
                                        </button>
                                        <button
                                            onClick={() => handleDelete(vehicle.vehicleid)}
                                            className="text-red-600 hover:text-red-800 text-sm font-medium"
                                        >
                                            Supprimer
                                        </button>
                                    </td>
                                </tr>
                            ))}
                            {vehicles.length === 0 && (
                                <tr>
                                    <td colSpan={7} className="p-8 text-center text-slate-500">
                                        Aucun véhicule trouvé.
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
                            {editingVehicle ? 'Modifier Véhicule' : 'Nouveau Véhicule'}
                        </h2>
                        <form onSubmit={handleSubmit} className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">N° Véhicule</label>
                                <input
                                    type="text"
                                    required
                                    value={formData.vehicleNumber}
                                    onChange={e => setFormData({ ...formData, vehicleNumber: e.target.value })}
                                    className="w-full p-2 border border-slate-300 rounded-lg"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">Immatriculation</label>
                                <input
                                    type="text"
                                    required
                                    value={formData.registrationNumber}
                                    onChange={e => setFormData({ ...formData, registrationNumber: e.target.value })}
                                    className="w-full p-2 border border-slate-300 rounded-lg"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">Type</label>
                                <select
                                    value={formData.vehicleType}
                                    onChange={e => setFormData({ ...formData, vehicleType: e.target.value })}
                                    className="w-full p-2 border border-slate-300 rounded-lg"
                                >
                                    <option value="TRUCK">Camion</option>
                                    <option value="VAN">Fourgon</option>
                                    <option value="PICKUP">Pickup</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">Marque</label>
                                <input
                                    type="text"
                                    required
                                    value={formData.make}
                                    onChange={e => setFormData({ ...formData, make: e.target.value })}
                                    className="w-full p-2 border border-slate-300 rounded-lg"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">Modèle</label>
                                <input
                                    type="text"
                                    required
                                    value={formData.model}
                                    onChange={e => setFormData({ ...formData, model: e.target.value })}
                                    className="w-full p-2 border border-slate-300 rounded-lg"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">Capacité (kg)</label>
                                <input
                                    type="number"
                                    required
                                    value={formData.capacity}
                                    onChange={e => setFormData({ ...formData, capacity: e.target.value })}
                                    className="w-full p-2 border border-slate-300 rounded-lg"
                                />
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
