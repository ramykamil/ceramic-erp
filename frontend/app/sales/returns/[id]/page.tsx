'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import { formatDate, cn } from '@/lib/utils';
import api from '@/lib/api';
import Link from 'next/link';
import { useRouter, useParams } from 'next/navigation';
import { useReactToPrint } from 'react-to-print';
import { StandardDocument, DocumentData } from '@/components/print/StandardDocument';

// Helpers
const formatCurrency = (amount: number) => new Intl.NumberFormat('fr-DZ', { style: 'currency', currency: 'DZD' }).format(amount);

interface ReturnItem {
    returnitemid: number;
    productid: number;
    productcode: string;
    productname: string;
    derivedpiecespercolis: number;
    derivedcolisperpalette: number;
    quantity: number;
    unitid: number;
    unitcode: string;
    unitprice: number;
    linetotal: number;
    reason: string;
}

interface ReturnHeader {
    returnid: number;
    returnnumber: string;
    ordernumber?: string;
    customername: string;
    customerphone?: string;
    customeraddress?: string;
    returndate: string;
    reason: string;
    status: string;
    totalamount: number;
    notes?: string;
    createdat: string;
    items: ReturnItem[];
}

export default function ReturnDetailsPage() {
    const { id } = useParams();
    const router = useRouter();
    const [returnData, setReturnData] = useState<ReturnHeader | null>(null);
    const [loading, setLoading] = useState(true);
    const [isUpdating, setIsUpdating] = useState(false);

    // Print Ref
    const printRef = useRef<HTMLDivElement>(null);

    const handlePrint = useReactToPrint({
        content: () => printRef.current,
        documentTitle: returnData ? `RET_${returnData.returnnumber}` : 'Retour',
    });

    useEffect(() => {
        if (id) loadReturn();
    }, [id]);

    const loadReturn = async () => {
        setLoading(true);
        try {
            const res = await api.getReturnById(Number(id));
            if (res.success) setReturnData(res.data as ReturnHeader);
            else throw new Error(res.message);
        } catch (error: any) {
            console.error(error);
            alert("Erreur lors du chargement: " + error.message);
        } finally {
            setLoading(false);
        }
    };

    const changeStatus = async (newStatus: 'APPROVED' | 'REJECTED') => {
        const action = newStatus === 'APPROVED' ? 'APPROUVER' : 'REJETER';
        const msg = newStatus === 'APPROVED' 
            ? "Approuver ce retour ? Le stock sera réintégré et le solde client ajusté." 
            : "Rejeter ce retour ?";
            
        if (!confirm(msg)) return;
        
        setIsUpdating(true);
        try {
            const res = await api.updateReturnStatus(Number(id), newStatus);
            if (res.success) {
                alert(`Retour ${newStatus === 'APPROVED' ? 'approuvé' : 'rejeté'} avec succès!`);
                loadReturn(); // Refresh
            } else {
                throw new Error(res.message);
            }
        } catch (error: any) {
            alert(`Erreur: ${error.message}`);
        } finally {
            setIsUpdating(false);
        }
    };

    const handleDelete = async () => {
        if (!confirm("Supprimer ce retour en attente ?")) return;
        try {
            const res = await api.deleteReturn(Number(id));
            if (res.success) {
                alert("Retour supprimé.");
                router.push('/orders?filter=RETURN');
            } else {
                throw new Error(res.message);
            }
        } catch (error: any) {
            alert(`Erreur: ${error.message}`);
        }
    };

    // Printing Data Mapping
    const printData: DocumentData = useMemo(() => {
        if (!returnData) return { number: '', date: '', items: [] };

        return {
            number: returnData.returnnumber,
            date: returnData.returndate || returnData.createdat,
            clientName: returnData.customername,
            clientAddress: returnData.customeraddress || '',
            clientPhone: returnData.customerphone || '',
            items: returnData.items.map(item => {
                const qty = Number(item.quantity) || 0;
                const piecesPerCarton = Number(item.derivedpiecespercolis) || 0;
                const cartonsPerPalette = Number(item.derivedcolisperpalette) || 0;
                
                // Calculate breakdown for printing
                const cartons = piecesPerCarton > 0 ? Math.floor(qty / piecesPerCarton) : 0;
                const palettes = (cartonsPerPalette > 0 && cartons > 0) ? Math.floor(cartons / cartonsPerPalette) : 0;

                return {
                    productCode: item.productcode,
                    productName: item.productname,
                    quantity: qty,
                    unitCode: item.unitcode,
                    unitPrice: item.unitprice || 0,
                    lineTotal: item.linetotal || 0,
                    palletCount: palettes,
                    boxCount: cartons,
                    piecesPerCarton: piecesPerCarton || undefined,
                    cartonsPerPalette: cartonsPerPalette || undefined,
                };
            }),
            totalHT: returnData.totalamount,
            totalTVA: 0,
            discount: 0,
            payment: 0,
            notes: returnData.notes || returnData.reason,
        };
    }, [returnData]);

    if (loading) return <div className="p-10 text-center">Chargement des détails du retour...</div>;
    if (!returnData) return <div className="p-10 text-center text-red-500 font-bold">Retour introuvable.</div>;

    const statusColors: any = {
        PENDING: 'bg-amber-100 text-amber-800 border-amber-200',
        APPROVED: 'bg-emerald-100 text-emerald-800 border-emerald-200',
        REJECTED: 'bg-rose-100 text-rose-800 border-rose-200',
        PROCESSED: 'bg-blue-100 text-blue-800 border-blue-200',
    };

    return (
        <div className="p-4 sm:p-6 lg:p-8 min-h-screen bg-slate-50 text-slate-800">
            <div className="max-w-5xl mx-auto">
                {/* Header */}
                <div className="mb-8 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                    <div>
                        <div className="flex items-center gap-3 mb-1">
                            <h1 className="text-3xl font-black text-slate-800 uppercase tracking-tight">Retour {returnData.returnnumber}</h1>
                            <span className={`text-xs font-black px-3 py-1 rounded-full border shadow-sm ${statusColors[returnData.status] || 'bg-slate-100'}`}>
                                {returnData.status === 'PENDING' ? 'EN ATTENTE' : 
                                 returnData.status === 'APPROVED' ? 'APPROUVÉ' : 
                                 returnData.status === 'REJECTED' ? 'REJETÉ' : returnData.status}
                            </span>
                        </div>
                        <p className="text-slate-500 font-medium">Créé le : {formatDate(returnData.createdat)}</p>
                    </div>
                    <div className="flex gap-3">
                        <button 
                            onClick={handlePrint} 
                            className="bg-white border-2 border-slate-200 text-slate-700 px-5 py-2.5 rounded-xl font-bold hover:bg-slate-50 transition-all flex items-center gap-2 shadow-sm"
                        >
                            🖨️ Bon de Retour
                        </button>
                        <Link href="/orders?filter=RETURN" className="bg-slate-800 text-white px-5 py-2.5 rounded-xl font-bold hover:bg-slate-900 transition-all shadow-md">
                            Fermer
                        </Link>
                    </div>
                </div>

                {/* Main Content Grid */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                    
                    {/* Left Column: Client & Status Controls */}
                    <div className="lg:col-span-1 space-y-6">
                        
                        {/* Status Actions Card */}
                        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                             <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-4">Actions de Flux</h3>
                             
                             {returnData.status === 'PENDING' ? (
                                <div className="space-y-3">
                                    <button 
                                        disabled={isUpdating}
                                        onClick={() => changeStatus('APPROVED')} 
                                        className="w-full bg-emerald-600 text-white py-3 rounded-xl font-bold hover:bg-emerald-700 transition shadow-lg shadow-emerald-100 disabled:opacity-50"
                                    >
                                        ✅ APPROUVER LE RETOUR
                                    </button>
                                    <button 
                                        disabled={isUpdating}
                                        onClick={() => changeStatus('REJECTED')} 
                                        className="w-full bg-white border-2 border-rose-100 text-rose-600 py-3 rounded-xl font-bold hover:bg-rose-50 transition disabled:opacity-50"
                                    >
                                        ❌ REJETER
                                    </button>
                                    <div className="pt-4 mt-4 border-t border-slate-100">
                                        <button 
                                            onClick={handleDelete}
                                            className="w-full text-slate-400 hover:text-rose-500 text-xs font-bold transition flex items-center justify-center gap-1"
                                        >
                                            🗑️ Supprimer Brouillon
                                        </button>
                                    </div>
                                </div>
                             ) : (
                                <div className="p-4 bg-slate-50 rounded-xl border border-slate-100 text-center">
                                    <p className="text-slate-500 text-sm font-medium">Ce retour est déjà finalisé.</p>
                                    <p className="text-xs text-slate-400 mt-1">Statut final : <span className="font-bold">{returnData.status}</span></p>
                                </div>
                             )}
                        </div>

                        {/* Client Info Card */}
                        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm relative overflow-hidden">
                            <div className="absolute top-0 right-0 p-4 opacity-5">
                                <span className="text-6xl">👤</span>
                            </div>
                            <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-4">Client / Émetteur</h3>
                            <p className="text-xl font-black text-slate-800">{returnData.customername}</p>
                            
                            <div className="mt-4 space-y-2">
                                <div className="flex items-center gap-2 text-sm text-slate-600 font-medium">
                                    <span className="w-5 text-center opacity-70">📞</span>
                                    {returnData.customerphone || 'Non renseigné'}
                                </div>
                                <div className="flex items-start gap-2 text-sm text-slate-600 font-medium">
                                    <span className="w-5 text-center opacity-70 mt-0.5">📍</span>
                                    <span className="flex-1">{returnData.customeraddress || 'Adresse inconnue'}</span>
                                </div>
                            </div>
                        </div>

                        {/* Notes / Reason */}
                        <div className="bg-orange-50 p-6 rounded-2xl border border-orange-100 shadow-sm">
                            <h3 className="text-xs font-black text-orange-400 uppercase tracking-widest mb-2">Motif du Retour</h3>
                            <p className="text-orange-900 font-medium whitespace-pre-wrap">{returnData.reason || 'Aucune raison spécifiée.'}</p>
                            {returnData.notes && (
                                <div className="mt-4">
                                    <h3 className="text-[10px] font-black text-orange-300 uppercase tracking-widest mb-1">Notes Internes</h3>
                                    <p className="text-orange-800 text-sm">{returnData.notes}</p>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Right Column: Items Table */}
                    <div className="lg:col-span-2 space-y-6">
                        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                            <div className="bg-slate-50 p-6 border-b border-slate-100 flex items-center justify-between">
                                <h3 className="text-xs font-black text-slate-500 uppercase tracking-widest">Articles Concernés</h3>
                                <span className="bg-white px-3 py-1 rounded-full border border-slate-200 text-xs font-bold text-slate-600 shadow-sm">
                                    {returnData.items.length} produit{returnData.items.length > 1 ? 's' : ''}
                                </span>
                            </div>
                            
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="text-slate-400 text-[10px] font-black uppercase tracking-wider">
                                        <th className="px-6 py-4 text-left">Description</th>
                                        <th className="px-6 py-4 text-center">Breakdown</th>
                                        <th className="px-6 py-4 text-right">Quantité</th>
                                        <th className="px-6 py-4 text-right">Prix Unit.</th>
                                        <th className="px-6 py-4 text-right">Total</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-50">
                                    {returnData.items.map((item, idx) => {
                                        const qty = Number(item.quantity) || 0;
                                        const pps = Number(item.derivedpiecespercolis) || 0;
                                        const cpp = Number(item.derivedcolisperpalette) || 0;
                                        
                                        const cartons = pps > 0 ? Math.floor(qty / pps) : 0;
                                        const palettes = (cpp > 0 && cartons > 0) ? Math.floor(cartons / cpp) : 0;

                                        return (
                                            <tr key={idx} className="hover:bg-slate-50/50 transition-all">
                                                <td className="px-6 py-5">
                                                    <p className="font-bold text-slate-800 leading-tight">{item.productname}</p>
                                                    <p className="text-[10px] text-slate-400 font-mono mt-1">{item.productcode}</p>
                                                </td>
                                                <td className="px-6 py-5 text-center">
                                                    <div className="flex items-center justify-center gap-2">
                                                        <div className="flex flex-col items-center">
                                                            <span className="text-[9px] font-black text-slate-300 uppercase">Pal</span>
                                                            <span className="text-xs font-bold text-slate-600">{palettes}</span>
                                                        </div>
                                                        <div className="h-4 w-px bg-slate-100"></div>
                                                        <div className="flex flex-col items-center">
                                                            <span className="text-[9px] font-black text-slate-300 uppercase">Ctn</span>
                                                            <span className="text-xs font-bold text-slate-600">{cartons}</span>
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="px-6 py-5 text-right font-black text-blue-600">
                                                    {item.quantity} <span className="text-[10px] text-slate-400 font-bold uppercase">{item.unitcode}</span>
                                                </td>
                                                <td className="px-6 py-5 text-right font-medium text-slate-500">
                                                    {formatCurrency(item.unitprice)}
                                                </td>
                                                <td className="px-6 py-5 text-right font-black text-slate-800">
                                                    {formatCurrency(item.linetotal)}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                                <tfoot className="bg-slate-50/50 border-t border-slate-100">
                                    <tr>
                                        <td colSpan={4} className="px-6 py-6 text-right text-xs font-black text-slate-400 uppercase tracking-widest">
                                            Total à Rembourser
                                        </td>
                                        <td className="px-6 py-6 text-right">
                                            <span className="text-2xl font-black text-brand-primary tracking-tighter">
                                                {formatCurrency(returnData.totalamount)}
                                            </span>
                                        </td>
                                    </tr>
                                </tfoot>
                            </table>
                        </div>
                    </div>
                </div>

                {/* Hidden Document for Printing */}
                <div style={{ display: 'none' }}>
                    <StandardDocument
                        ref={printRef}
                        type="DELIVERY_NOTE" // We use Delivery Note template for Return Note
                        data={printData}
                    />
                </div>
            </div>
        </div>
    );
}
