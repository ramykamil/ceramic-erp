'use client';

import { useState, useEffect } from 'react';
import api from '@/lib/api';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

// Interfaces
interface Order { orderid: number; ordernumber: string; customername: string; totalamount: number; }
interface Driver { driverid: number; firstname: string; lastname: string; }
interface Vehicle { vehicleid: number; vehiclenumber: string; vehicletype: string; }

export default function NewDeliveryPage() {
    const router = useRouter();
    const [orders, setOrders] = useState<Order[]>([]);
    const [drivers, setDrivers] = useState<Driver[]>([]);
    const [vehicles, setVehicles] = useState<Vehicle[]>([]);

    // Form State
    const [orderId, setOrderId] = useState<number | ''>('');
    const [driverId, setDriverId] = useState<number | ''>('');
    const [vehicleId, setVehicleId] = useState<number | ''>('');
    const [deliveryDate, setDeliveryDate] = useState(new Date().toISOString().split('T')[0]);
    const [destination, setDestination] = useState('');
    const [notes, setNotes] = useState('');

    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
        const loadData = async () => {
            try {
                // Fetch CONFIRMED orders ready for shipping
                const [ordersRes, driversRes, vehiclesRes] = await Promise.all([
                    api.getOrders({ status: 'CONFIRMED' }), // Only show confirmed orders
                    api.getDrivers(),
                    api.getVehicles()
                ]);

                if (ordersRes.success) setOrders((ordersRes.data as Order[]) || []);
                if (driversRes.success) setDrivers((driversRes.data as Driver[]) || []);
                if (vehiclesRes.success) setVehicles((vehiclesRes.data as Vehicle[]) || []);
            } catch (error) {
                console.error(error);
            } finally {
                setIsLoading(false);
            }
        };
        loadData();
    }, []);

    // Auto-fill destination if possible (simplified)
    useEffect(() => {
        if (orderId) {
            const selectedOrder = orders.find(o => o.orderid === Number(orderId));
            // In a real app, you'd fetch the full order details to get the address
            if (selectedOrder) setDestination(`Adresse du client: ${selectedOrder.customername}`);
        }
    }, [orderId, orders]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!orderId || !driverId || !vehicleId) return;

        setIsSaving(true);
        try {
            const response = await api.createDelivery({
                orderId: Number(orderId),
                driverId: Number(driverId),
                vehicleId: Number(vehicleId),
                deliveryDate,
                destination,
                notes
            });
            if (response.success) {
                alert("Livraison planifiée avec succès !");
                router.push('/logistics');
            }
        } catch (error: any) {
            alert(`Erreur: ${error.message}`);
        } finally {
            setIsSaving(false);
        }
    };

    if (isLoading) return <div className="p-8 text-center text-slate-500">Chargement...</div>;

    return (
        <div className="p-4 sm:p-6 lg:p-8 min-h-screen bg-slate-50 text-slate-800">
            <div className="max-w-3xl mx-auto">

                {/* Header */}
                <div className="mb-8 flex justify-between items-center">
                    <h1 className="text-3xl font-bold text-slate-800">Nouvelle Livraison</h1>
                    <Link href="/logistics" className="bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 px-4 py-2.5 rounded-lg font-medium text-sm transition shadow-sm">
                        Annuler
                    </Link>
                </div>

                <form onSubmit={handleSubmit} className="space-y-6">

                    {/* Card 1: Details */}
                    <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
                        <h2 className="text-lg font-semibold text-slate-700 mb-4 pb-2 border-b border-slate-100">Détails de l'Expédition</h2>

                        <div className="grid grid-cols-1 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-slate-600 mb-1">Commande à Livrer *</label>
                                <select value={orderId} onChange={e => setOrderId(Number(e.target.value))} required
                                    className="w-full p-2.5 border border-slate-300 rounded-lg text-slate-800 focus:ring-2 focus:ring-cyan-500 bg-white">
                                    <option value="">-- Sélectionner une commande confirmée --</option>
                                    {orders.map(o => (
                                        <option key={o.orderid} value={o.orderid}>
                                            {o.ordernumber} - {o.customername} ({o.totalamount} DZD)
                                        </option>
                                    ))}
                                </select>
                                {orders.length === 0 && <p className="text-xs text-amber-600 mt-1">Aucune commande confirmée en attente.</p>}
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-slate-600 mb-1">Date de Livraison *</label>
                                <input type="date" value={deliveryDate} onChange={e => setDeliveryDate(e.target.value)} required
                                    className="w-full p-2.5 border border-slate-300 rounded-lg text-slate-800 focus:ring-2 focus:ring-cyan-500" />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-slate-600 mb-1">Destination / Adresse *</label>
                                <textarea value={destination} onChange={e => setDestination(e.target.value)} required rows={2}
                                    className="w-full p-2.5 border border-slate-300 rounded-lg text-slate-800 focus:ring-2 focus:ring-cyan-500" />
                            </div>
                        </div>
                    </div>

                    {/* Card 2: Resources */}
                    <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
                        <h2 className="text-lg font-semibold text-slate-700 mb-4 pb-2 border-b border-slate-100">Ressources</h2>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-slate-600 mb-1">Chauffeur *</label>
                                <select value={driverId} onChange={e => setDriverId(Number(e.target.value))} required
                                    className="w-full p-2.5 border border-slate-300 rounded-lg text-slate-800 focus:ring-2 focus:ring-cyan-500 bg-white">
                                    <option value="">-- Sélectionner Chauffeur --</option>
                                    {drivers.map(d => (
                                        <option key={d.driverid} value={d.driverid}>{d.firstname} {d.lastname}</option>
                                    ))}
                                </select>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-slate-600 mb-1">Véhicule *</label>
                                <select value={vehicleId} onChange={e => setVehicleId(Number(e.target.value))} required
                                    className="w-full p-2.5 border border-slate-300 rounded-lg text-slate-800 focus:ring-2 focus:ring-cyan-500 bg-white">
                                    <option value="">-- Sélectionner Véhicule --</option>
                                    {vehicles.map(v => (
                                        <option key={v.vehicleid} value={v.vehicleid}>{v.vehiclenumber} ({v.vehicletype})</option>
                                    ))}
                                </select>
                            </div>

                            <div className="md:col-span-2">
                                <label className="block text-sm font-medium text-slate-600 mb-1">Notes (Optionnel)</label>
                                <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2}
                                    className="w-full p-2.5 border border-slate-300 rounded-lg text-slate-800 focus:ring-2 focus:ring-cyan-500" />
                            </div>
                        </div>
                    </div>

                    <div className="flex justify-end">
                        <button type="submit" disabled={isSaving}
                            className="bg-cyan-600 hover:bg-cyan-700 text-white px-6 py-3 rounded-lg font-bold shadow-md transition disabled:opacity-50 flex items-center gap-2">
                            <svg className="w-5 h-5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor"><path d="M8 16.5a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0zM15 16.5a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0z" /><path d="M3 4a1 1 0 00-1 1v10a1 1 0 001 1h1.05a2.5 2.5 0 014.9 0H10a1 1 0 001-1V5a1 1 0 00-1-1H3zM14 7a1 1 0 00-1 1v6.05A2.5 2.5 0 0115.95 16H17a1 1 0 001-1v-5a1 1 0 00-.293-.707l-2-2A1 1 0 0014 7z" /></svg>
                            {isSaving ? 'Planification...' : 'Planifier Livraison'}
                        </button>
                    </div>

                </form>
            </div>
        </div>
    );
}
