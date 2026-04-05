'use client';

import { useState, useEffect } from 'react';
import api from '@/lib/api';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

// Interfaces
interface Delivery { deliveryid: number; deliverynumber: string; customername: string; status: string; deliverydate: string; drivername?: string; vehiclenumber?: string; }
interface Driver { driverid: number; firstname: string; lastname: string; licensenumber: string; }
interface Vehicle { vehicleid: number; vehiclenumber: string; vehicletype: string; make: string; model: string; }
interface Employee { employeeid: number; firstname: string; lastname: string; }

export default function LogisticsPage() {
    const [activeTab, setActiveTab] = useState<'DELIVERIES' | 'DRIVERS' | 'VEHICLES'>('DELIVERIES');
    const [data, setData] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    // Modal States
    const [isDriverModalOpen, setIsDriverModalOpen] = useState(false);
    const [isVehicleModalOpen, setIsVehicleModalOpen] = useState(false);

    // Form Data
    const [potentialDrivers, setPotentialDrivers] = useState<Employee[]>([]);
    const [newDriver, setNewDriver] = useState({ employeeId: '', licenseNumber: '' });
    const [newVehicle, setNewVehicle] = useState({ vehicleNumber: '', vehicleType: 'TRUCK', make: '', model: '' });

    useEffect(() => {
        fetchData();
    }, [activeTab]);

    const fetchData = async () => {
        setLoading(true);
        try {
            if (activeTab === 'DELIVERIES') {
                const res = await api.getDeliveries();
                if (res.success) setData((res.data as Delivery[]) || []);
            } else if (activeTab === 'DRIVERS') {
                const res = await api.getDrivers();
                if (res.success) setData((res.data as Driver[]) || []);
            } else if (activeTab === 'VEHICLES') {
                const res = await api.getVehicles();
                if (res.success) setData((res.data as Vehicle[]) || []);
            }
        } catch (error) {
            console.error(error);
        } finally {
            setLoading(false);
        }
    };

    const handleOpenDriverModal = async () => {
        const res = await api.getPotentialDrivers();
        if (res.success) setPotentialDrivers((res.data as Employee[]) || []);
        setIsDriverModalOpen(true);
    };

    const handleCreateDriver = async (e: React.FormEvent) => {
        e.preventDefault();
        await api.createDriver(newDriver);
        setIsDriverModalOpen(false);
        fetchData();
    };

    const handleCreateVehicle = async (e: React.FormEvent) => {
        e.preventDefault();
        await api.createVehicle(newVehicle);
        setIsVehicleModalOpen(false);
        fetchData();
    };

    return (
        <div className="p-4 sm:p-6 lg:p-8 min-h-screen bg-slate-50 text-slate-800">
            <div className="max-w-7xl mx-auto">
                {/* Header & Tabs */}
                <div className="mb-6 flex flex-col sm:flex-row justify-between items-center gap-4">
                    <h1 className="text-3xl font-bold text-slate-800">Logistique</h1>
                    <div className="flex bg-white rounded-lg p-1 border border-slate-200 shadow-sm">
                        {['DELIVERIES', 'DRIVERS', 'VEHICLES'].map((tab) => (
                            <button
                                key={tab}
                                onClick={() => setActiveTab(tab as any)}
                                className={`px-4 py-2 text-sm font-medium rounded-md transition ${activeTab === tab ? 'bg-cyan-100 text-cyan-700' : 'text-slate-500 hover:text-slate-700'}`}
                            >
                                {tab === 'DELIVERIES' ? 'Livraisons' : tab === 'DRIVERS' ? 'Chauffeurs' : 'Véhicules'}
                            </button>
                        ))}
                    </div>
                    <Link href="/" className="bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 px-4 py-2 rounded-lg text-sm font-medium shadow-sm">
                        Retour
                    </Link>
                </div>

                {/* Actions Bar */}
                <div className="mb-6 flex justify-end">
                    {activeTab === 'DELIVERIES' && (
                        <Link href="/logistics/new" className="bg-cyan-600 hover:bg-cyan-700 text-white px-4 py-2 rounded-lg text-sm font-medium shadow-sm">
                            + Nouvelle Livraison
                        </Link>
                    )}
                    {activeTab === 'DRIVERS' && (
                        <button onClick={handleOpenDriverModal} className="bg-cyan-600 hover:bg-cyan-700 text-white px-4 py-2 rounded-lg text-sm font-medium shadow-sm">
                            + Nouveau Chauffeur
                        </button>
                    )}
                    {activeTab === 'VEHICLES' && (
                        <button onClick={() => setIsVehicleModalOpen(true)} className="bg-cyan-600 hover:bg-cyan-700 text-white px-4 py-2 rounded-lg text-sm font-medium shadow-sm">
                            + Nouveau Véhicule
                        </button>
                    )}
                </div>

                {/* Table Content */}
                <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                    {loading ? (
                        <p className="p-10 text-center text-slate-400">Chargement...</p>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm text-left">
                                <thead className="bg-slate-50 text-slate-500 uppercase text-xs font-semibold border-b border-slate-100">
                                    {activeTab === 'DELIVERIES' && (
                                        <tr><th className="px-6 py-3">N°</th><th className="px-6 py-3">Client</th><th className="px-6 py-3">Date</th><th className="px-6 py-3">Statut</th></tr>
                                    )}
                                    {activeTab === 'DRIVERS' && (
                                        <tr><th className="px-6 py-3">Nom</th><th className="px-6 py-3">Permis</th></tr>
                                    )}
                                    {activeTab === 'VEHICLES' && (
                                        <tr><th className="px-6 py-3">Matricule</th><th className="px-6 py-3">Type</th><th className="px-6 py-3">Marque</th></tr>
                                    )}
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {data.map((row: any, i) => (
                                        <tr key={i} className="hover:bg-slate-50">
                                            {activeTab === 'DELIVERIES' && (
                                                <>
                                                    <td className="px-6 py-4 font-mono">{row.deliverynumber}</td>
                                                    <td className="px-6 py-4 font-medium">{row.customername}</td>
                                                    <td className="px-6 py-4">{new Date(row.deliverydate).toLocaleDateString()}</td>
                                                    <td className="px-6 py-4"><span className="bg-blue-50 text-blue-700 px-2 py-1 rounded text-xs">{row.status}</span></td>
                                                </>
                                            )}
                                            {activeTab === 'DRIVERS' && (
                                                <>
                                                    <td className="px-6 py-4 font-medium">{row.firstname} {row.lastname}</td>
                                                    <td className="px-6 py-4 font-mono">{row.licensenumber}</td>
                                                </>
                                            )}
                                            {activeTab === 'VEHICLES' && (
                                                <>
                                                    <td className="px-6 py-4 font-mono font-bold">{row.vehiclenumber}</td>
                                                    <td className="px-6 py-4">{row.vehicletype}</td>
                                                    <td className="px-6 py-4">{row.make} {row.model}</td>
                                                </>
                                            )}
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>

                {/* Modals would go here (simplified for brevity) */}
                {/* Vehicle Modal */}
                {isVehicleModalOpen && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
                        <div className="bg-white rounded-xl p-6 w-full max-w-md shadow-xl">
                            <h2 className="text-lg font-bold mb-4">Ajouter Véhicule</h2>
                            <form onSubmit={handleCreateVehicle} className="space-y-4">
                                <input placeholder="Matricule" className="w-full p-2 border rounded" required value={newVehicle.vehicleNumber} onChange={e => setNewVehicle({ ...newVehicle, vehicleNumber: e.target.value })} />
                                <select className="w-full p-2 border rounded" value={newVehicle.vehicleType} onChange={e => setNewVehicle({ ...newVehicle, vehicleType: e.target.value })}>
                                    <option value="TRUCK">Camion</option><option value="VAN">Fourgon</option><option value="PICKUP">Pickup</option>
                                </select>
                                <input placeholder="Marque" className="w-full p-2 border rounded" value={newVehicle.make} onChange={e => setNewVehicle({ ...newVehicle, make: e.target.value })} />
                                <div className="flex justify-end gap-2 pt-4">
                                    <button type="button" onClick={() => setIsVehicleModalOpen(false)} className="px-4 py-2 text-slate-600">Annuler</button>
                                    <button type="submit" className="px-4 py-2 bg-cyan-600 text-white rounded">Ajouter</button>
                                </div>
                            </form>
                        </div>
                    </div>
                )}

                {/* Driver Modal */}
                {isDriverModalOpen && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
                        <div className="bg-white rounded-xl p-6 w-full max-w-md shadow-xl">
                            <h2 className="text-lg font-bold mb-4">Ajouter Chauffeur</h2>
                            <p className="text-sm text-slate-500 mb-4">Sélectionnez un employé existant.</p>
                            <form onSubmit={handleCreateDriver} className="space-y-4">
                                <select className="w-full p-2 border rounded" required value={newDriver.employeeId} onChange={e => setNewDriver({ ...newDriver, employeeId: e.target.value })}>
                                    <option value="">-- Choisir Employé --</option>
                                    {potentialDrivers.map(e => <option key={e.employeeid} value={e.employeeid}>{e.firstname} {e.lastname}</option>)}
                                </select>
                                <input placeholder="Numéro de Permis" className="w-full p-2 border rounded" required value={newDriver.licenseNumber} onChange={e => setNewDriver({ ...newDriver, licenseNumber: e.target.value })} />
                                <div className="flex justify-end gap-2 pt-4">
                                    <button type="button" onClick={() => setIsDriverModalOpen(false)} className="px-4 py-2 text-slate-600">Annuler</button>
                                    <button type="submit" className="px-4 py-2 bg-cyan-600 text-white rounded">Ajouter</button>
                                </div>
                            </form>
                        </div>
                    </div>
                )}

            </div>
        </div>
    );
}
