'use client';

import { useState, useEffect } from 'react';
import api from '@/lib/api';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

interface Order {
    orderid: number;
    ordernumber: string;
    customername: string;
    status: string;
}

interface Vehicle {
    vehicleid: number;
    vehiclenumber: string;
    registrationnumber: string;
    vehicletype: string;
}

interface Driver {
    driverid: number;
    firstname: string;
    lastname: string;
    licensenumber: string;
}

export default function NewDeliveryPage() {
    const router = useRouter();
    const [orders, setOrders] = useState<Order[]>([]);
    const [vehicles, setVehicles] = useState<Vehicle[]>([]);
    const [drivers, setDrivers] = useState<Driver[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);

    const [formData, setFormData] = useState({
        orderId: '',
        vehicleId: '',
        driverId: '',
        deliveryDate: new Date().toISOString().split('T')[0], // Today's date
        notes: '',
    });

    useEffect(() => {
        loadFormData();
    }, []);

    const loadFormData = async () => {
        setIsLoading(true);
        try {
            const [ordersRes, vehiclesRes, driversRes] = await Promise.all([
                api.getOrders({ status: 'CONFIRMED' }), // Only confirmed orders
                api.getVehicles(),
                api.getDrivers(),
            ]);

            if (ordersRes.success) setOrders((ordersRes.data as Order[]) || []);
            if (vehiclesRes.success) setVehicles((vehiclesRes.data as Vehicle[]) || []);
            if (driversRes.success) setDrivers((driversRes.data as Driver[]) || []);
        } catch (error) {
            console.error('Failed to load form data', error);
            alert('Erreur lors du chargement des données du formulaire');
        } finally {
            setIsLoading(false);
        }
    };

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!formData.orderId || !formData.deliveryDate) {
            alert('Veuillez renseigner au minimum la commande et la date de livraison');
            return;
        }

        setIsSaving(true);
        try {
            const payload = {
                orderId: parseInt(formData.orderId),
                vehicleId: formData.vehicleId ? parseInt(formData.vehicleId) : null,
                driverId: formData.driverId ? parseInt(formData.driverId) : null,
                deliveryDate: formData.deliveryDate,
                notes: formData.notes || null,
            };

            const response = await api.createDelivery(payload as any);

            if (response.success) {
                alert('Livraison créée avec succès !');
                router.push('/logistics/deliveries');
            } else {
                throw new Error(response.message || 'Échec de la création');
            }
        } catch (error: any) {
            console.error('Failed to create delivery', error);
            alert(`Erreur: ${error.message}`);
        } finally {
            setIsSaving(false);
        }
    };

    if (isLoading) {
        return (
            <div className="min-h-screen bg-slate-50 flex items-center justify-center">
                <div className="text-center">
                    <div className="inline-block w-8 h-8 border-4 border-cyan-200 border-t-cyan-600 rounded-full animate-spin mb-4"></div>
                    <p className="text-slate-500 font-medium">Chargement du formulaire...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="p-4 sm:p-6 lg:p-8 min-h-screen bg-slate-50 text-slate-800">
            <div className="max-w-4xl mx-auto">

                {/* --- Header --- */}
                <div className="mb-8">
                    <Link
                        href="/logistics/deliveries"
                        className="text-sm text-cyan-600 hover:text-cyan-700 font-medium mb-3 inline-flex items-center gap-1"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
                        </svg>
                        Retour aux livraisons
                    </Link>
                    <h1 className="text-3xl font-bold text-slate-800">Nouvelle Livraison</h1>
                    <p className="text-slate-500 text-sm mt-1">Planifier une nouvelle livraison client</p>
                </div>

                {/* --- Form --- */}
                <form onSubmit={handleSubmit} className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                    <div className="p-6 space-y-6">

                        {/* Order Selection */}
                        <div>
                            <label htmlFor="orderId" className="block text-sm font-medium text-slate-700 mb-1.5">
                                Commande <span className="text-red-500">*</span>
                            </label>
                            <select
                                id="orderId"
                                name="orderId"
                                value={formData.orderId}
                                onChange={handleChange}
                                required
                                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500 outline-none transition"
                            >
                                <option value="">Sélectionner une commande</option>
                                {orders.map((order) => (
                                    <option key={order.orderid} value={order.orderid}>
                                        {order.ordernumber} - {order.customername} ({order.status})
                                    </option>
                                ))}
                            </select>
                            {orders.length === 0 && (
                                <p className="text-xs text-amber-600 mt-1">⚠️ Aucune commande confirmée disponible</p>
                            )}
                        </div>

                        {/* Delivery Date */}
                        <div>
                            <label htmlFor="deliveryDate" className="block text-sm font-medium text-slate-700 mb-1.5">
                                Date de livraison prévue <span className="text-red-500">*</span>
                            </label>
                            <input
                                type="date"
                                id="deliveryDate"
                                name="deliveryDate"
                                value={formData.deliveryDate}
                                onChange={handleChange}
                                required
                                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500 outline-none transition"
                            />
                        </div>

                        {/* Vehicle Selection */}
                        <div>
                            <label htmlFor="vehicleId" className="block text-sm font-medium text-slate-700 mb-1.5">
                                Véhicule (Optionnel)
                            </label>
                            <select
                                id="vehicleId"
                                name="vehicleId"
                                value={formData.vehicleId}
                                onChange={handleChange}
                                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500 outline-none transition"
                            >
                                <option value="">Non assigné</option>
                                {vehicles.map((vehicle) => (
                                    <option key={vehicle.vehicleid} value={vehicle.vehicleid}>
                                        {vehicle.vehiclenumber} - {vehicle.registrationnumber} ({vehicle.vehicletype})
                                    </option>
                                ))}
                            </select>
                        </div>

                        {/* Driver Selection */}
                        <div>
                            <label htmlFor="driverId" className="block text-sm font-medium text-slate-700 mb-1.5">
                                Chauffeur (Optionnel)
                            </label>
                            <select
                                id="driverId"
                                name="driverId"
                                value={formData.driverId}
                                onChange={handleChange}
                                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500 outline-none transition"
                            >
                                <option value="">Non assigné</option>
                                {drivers.map((driver) => (
                                    <option key={driver.driverid} value={driver.driverid}>
                                        {driver.firstname} {driver.lastname} - Permis: {driver.licensenumber}
                                    </option>
                                ))}
                            </select>
                        </div>

                        {/* Notes */}
                        <div>
                            <label htmlFor="notes" className="block text-sm font-medium text-slate-700 mb-1.5">
                                Notes / Instructions
                            </label>
                            <textarea
                                id="notes"
                                name="notes"
                                value={formData.notes}
                                onChange={handleChange}
                                rows={4}
                                placeholder="Remarques, instructions spéciales, adresse de livraison..."
                                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500 outline-none transition resize-none"
                            />
                        </div>

                    </div>

                    {/* Form Footer */}
                    <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex justify-end gap-3">
                        <Link
                            href="/logistics/deliveries"
                            className="px-4 py-2 rounded-lg text-sm font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 transition shadow-sm"
                        >
                            Annuler
                        </Link>
                        <button
                            type="submit"
                            disabled={isSaving}
                            className="px-4 py-2 rounded-lg text-sm font-medium text-white bg-cyan-600 hover:bg-cyan-700 transition shadow-sm disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                        >
                            {isSaving && <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
                            {isSaving ? 'Création...' : 'Créer la Livraison'}
                        </button>
                    </div>
                </form>

            </div>
        </div>
    );
}
