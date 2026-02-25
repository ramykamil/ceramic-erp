'use client';

import { useState, useEffect } from 'react';
import api from '@/lib/api';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

interface PageProps {
    params: {
        orderId: string;
    };
}

interface Vehicle {
    vehicleid: number;
    platenumber: string;
    model: string;
    status: string;
}

interface Driver {
    driverid: number;
    firstname: string;
    lastname: string;
    status: string;
}

export default function CreateDeliveryPage({ params }: PageProps) {
    const router = useRouter();
    const orderId = parseInt(params.orderId);

    const [vehicles, setVehicles] = useState<Vehicle[]>([]);
    const [drivers, setDrivers] = useState<Driver[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);

    const [formData, setFormData] = useState({
        vehicleId: '',
        driverId: '',
        deliveryDate: new Date().toISOString().split('T')[0],
        notes: ''
    });

    useEffect(() => {
        const loadData = async () => {
            setIsLoading(true);
            try {
                const [vehiclesRes, driversRes] = await Promise.all([
                    api.getVehicles(),
                    api.getDrivers()
                ]);

                if (vehiclesRes.success) setVehicles((vehiclesRes.data as Vehicle[]) || []);
                if (driversRes.success) setDrivers((driversRes.data as Driver[]) || []);
            } catch (error) {
                console.error('Failed to load resources', error);
            } finally {
                setIsLoading(false);
            }
        };
        loadData();
    }, []);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSaving(true);
        try {
            await api.createDelivery({
                orderId,
                vehicleId: parseInt(formData.vehicleId),
                driverId: parseInt(formData.driverId),
                deliveryDate: formData.deliveryDate,
                notes: formData.notes
            });
            alert('Livraison créée avec succès !');
            router.push('/logistics/deliveries');
        } catch (error) {
            console.error('Failed to create delivery', error);
            alert('Erreur lors de la création de la livraison');
        } finally {
            setIsSaving(false);
        }
    };

    if (isLoading) return <p className="text-center py-12 text-slate-500">Chargement...</p>;

    const availableVehicles = vehicles.filter(v => v.status === 'AVAILABLE');
    const availableDrivers = drivers.filter(d => d.status === 'AVAILABLE');

    return (
        <div className="p-6 max-w-2xl mx-auto">
            <div className="mb-6">
                <Link href="/orders" className="text-sm text-slate-500 hover:text-blue-600 mb-2 block">← Retour Commandes</Link>
                <h1 className="text-3xl font-bold text-blue-900">Planifier une Livraison</h1>
                <p className="text-slate-500">Pour la commande #{orderId}</p>
            </div>

            <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
                <form onSubmit={handleSubmit} className="space-y-6">

                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Date de Livraison</label>
                        <input
                            type="date"
                            required
                            value={formData.deliveryDate}
                            onChange={e => setFormData({ ...formData, deliveryDate: e.target.value })}
                            className="w-full p-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Véhicule</label>
                        <select
                            required
                            value={formData.vehicleId}
                            onChange={e => setFormData({ ...formData, vehicleId: e.target.value })}
                            className="w-full p-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                        >
                            <option value="">-- Sélectionner un véhicule --</option>
                            {availableVehicles.map(v => (
                                <option key={v.vehicleid} value={v.vehicleid}>
                                    {v.platenumber} - {v.model}
                                </option>
                            ))}
                            {availableVehicles.length === 0 && <option disabled>Aucun véhicule disponible</option>}
                        </select>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Chauffeur</label>
                        <select
                            required
                            value={formData.driverId}
                            onChange={e => setFormData({ ...formData, driverId: e.target.value })}
                            className="w-full p-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                        >
                            <option value="">-- Sélectionner un chauffeur --</option>
                            {availableDrivers.map(d => (
                                <option key={d.driverid} value={d.driverid}>
                                    {d.firstname} {d.lastname}
                                </option>
                            ))}
                            {availableDrivers.length === 0 && <option disabled>Aucun chauffeur disponible</option>}
                        </select>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Notes</label>
                        <textarea
                            rows={3}
                            value={formData.notes}
                            onChange={e => setFormData({ ...formData, notes: e.target.value })}
                            className="w-full p-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                            placeholder="Instructions spéciales..."
                        />
                    </div>

                    <div className="flex justify-end gap-4 pt-4 border-t border-slate-100">
                        <button
                            type="button"
                            onClick={() => router.back()}
                            className="px-5 py-2 text-slate-600 hover:bg-slate-100 rounded-lg font-medium"
                        >
                            Annuler
                        </button>
                        <button
                            type="submit"
                            disabled={isSaving}
                            className="px-5 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50"
                        >
                            {isSaving ? 'Création...' : 'Créer Livraison'}
                        </button>
                    </div>

                </form>
            </div>
        </div>
    );
}
