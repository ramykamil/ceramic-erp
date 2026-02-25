'use client';

import { useState, useEffect, useRef } from 'react';
import api from '@/lib/api';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useReactToPrint } from 'react-to-print';

const formatCurrency = (amount: number) =>
    new Intl.NumberFormat('fr-DZ', { style: 'currency', currency: 'DZD' }).format(amount);

export default function PurchaseReturnDetailsPage() {
    const params = useParams();
    const router = useRouter();
    const id = Number(params.id);

    const [returnData, setReturnData] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [approving, setApproving] = useState(false);

    // Print ref
    const componentRef = useRef<HTMLDivElement>(null);
    const handlePrint = useReactToPrint({
        content: () => componentRef.current,
        documentTitle: `Bon_Retour_${id}`,
    });

    useEffect(() => {
        const load = async () => {
            if (isNaN(id)) return;
            try {
                const res = await api.getPurchaseReturnById(id);
                if (res.success) {
                    setReturnData(res.data);
                } else {
                    alert(res.message);
                    router.push('/purchasing/returns');
                }
            } catch (err) {
                console.error(err);
            } finally {
                setLoading(false);
            }
        };
        load();
    }, [id, router]);

    const handleApprove = async () => {
        if (!window.confirm('Confirmer le retour ? Cela déduira les quantités du stock.')) return;

        setApproving(true);
        try {
            const res = await api.updatePurchaseReturnStatus(id, 'APPROVED');
            if (res.success) {
                alert('Retour approuvé avec succès.');
                // Reload
                const updatedRes = await api.getPurchaseReturnById(id);
                if (updatedRes.success) setReturnData(updatedRes.data);
            } else {
                alert(res.message);
            }
        } catch (err) {
            console.error(err);
            alert('Erreur lors de l\'approbation');
        } finally {
            setApproving(false);
        }
    };

    if (loading) return <div className="p-8 text-center text-slate-500">Chargement...</div>;
    if (!returnData) return <div className="p-8 text-center text-red-500">Retour introuvable</div>;

    const { returnnumber, returndate, factoryname, status, items, notes, ponumber, createdbyname } = returnData;

    return (
        <div className="min-h-screen bg-slate-50 p-6">
            <div className="max-w-4xl mx-auto space-y-6">

                {/* Header Actions */}
                <div className="flex items-center justify-between bg-white p-4 rounded-xl shadow-sm border border-slate-200">
                    <div className="flex items-center gap-4">
                        <Link href="/purchasing/returns" className="p-2 hover:bg-slate-100 rounded-lg text-slate-500 transition">
                            ← Retour
                        </Link>
                        <h1 className="text-xl font-bold text-slate-800">{returnnumber}</h1>
                        <span className={`px-2 py-1 rounded-full text-xs font-bold ${status === 'APPROVED' ? 'bg-green-100 text-green-700' :
                            status === 'PENDING' ? 'bg-yellow-100 text-yellow-700' : 'bg-slate-100 text-slate-700'
                            }`}>
                            {status === 'APPROVED' ? 'VALIDÉ' : 'EN ATTENTE'}
                        </span>
                    </div>
                    <div className="flex gap-3">
                        <button
                            onClick={() => handlePrint()}
                            className="flex items-center gap-2 px-4 py-2 border border-slate-300 rounded-lg text-slate-700 hover:bg-slate-50 transition font-medium"
                        >
                            <span>🖨️</span> Imprimer
                        </button>

                        {status === 'PENDING' && (
                            <button
                                onClick={handleApprove}
                                disabled={approving}
                                className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg font-medium shadow-sm transition disabled:opacity-50"
                            >
                                {approving ? 'Validation...' : 'Valider le Retour'}
                            </button>
                        )}
                    </div>
                </div>

                {/* Printable Content */}
                <div className="bg-white shadow-lg rounded-xl overflow-hidden print:shadow-none print:rounded-none">
                    <div ref={componentRef} className="p-8 min-h-[in] relative print:p-0">

                        {/* Print Only Header (Logo etc) */}
                        <div className="hidden print:block mb-8 border-b border-slate-900 pb-4">
                            <div className="flex justify-between items-start">
                                <div>
                                    <h1 className="text-3xl font-bold text-slate-900 uppercase tracking-widest">Bon de Retour</h1>
                                    <p className="text-sm text-slate-500 mt-1">Retour Marchandise Fournisseur</p>
                                </div>
                                <div className="text-right">
                                    <div className="font-bold text-lg">{returnnumber}</div>
                                    <div className="text-slate-500 text-sm">{new Date(returndate).toLocaleDateString('fr-FR')}</div>
                                </div>
                            </div>
                        </div>

                        {/* Screen Header */}
                        <div className="print:hidden border-b border-slate-100 pb-6 mb-6">
                            <div className="flex justify-between items-start">
                                <div>
                                    <h2 className="text-2xl font-bold text-slate-800">Bon de Retour</h2>
                                    <p className="text-slate-500">{returnnumber}</p>
                                </div>
                                <div className="text-right text-sm text-slate-500">
                                    <p>Date: <span className="font-medium text-slate-900">{new Date(returndate).toLocaleDateString('fr-FR')}</span></p>
                                    <p>Créé par: <span className="font-medium text-slate-900">{createdbyname || 'Système'}</span></p>
                                </div>
                            </div>
                        </div>

                        {/* Info Grid */}
                        <div className="grid grid-cols-2 gap-8 mb-8 text-sm">
                            <div>
                                <h3 className="text-slate-400 uppercase text-xs font-bold tracking-wider mb-2">Fournisseur</h3>
                                <div className="p-3 bg-slate-50 rounded-lg border border-slate-100 print:bg-transparent print:border-slate-300 print:border">
                                    <p className="font-bold text-lg text-slate-900">{factoryname}</p>
                                    {ponumber && (
                                        <p className="text-slate-500 mt-1">
                                            Réf. Commande: <span className="font-medium text-slate-700">{ponumber}</span>
                                        </p>
                                    )}
                                </div>
                            </div>
                            <div>
                                <h3 className="text-slate-400 uppercase text-xs font-bold tracking-wider mb-2">Notes</h3>
                                <div className="p-3 bg-slate-50 rounded-lg border border-slate-100 print:bg-transparent print:border-slate-300 print:border min-h-[80px]">
                                    <p className="text-slate-700 whitespace-pre-wrap">{notes || 'Aucune note.'}</p>
                                </div>
                            </div>
                        </div>

                        {/* Items Table */}
                        <table className="w-full text-sm mb-8">
                            <thead className="bg-slate-50 text-slate-500 font-bold uppercase text-xs border-y border-slate-200 print:bg-slate-100 print:text-black">
                                <tr>
                                    <th className="py-3 px-4 text-left">Produit</th>
                                    <th className="py-3 px-4 text-left">Motif</th>
                                    <th className="py-3 px-4 text-center">Qté</th>
                                    <th className="py-3 px-4 text-right">Prix U.</th>
                                    <th className="py-3 px-4 text-right">Total</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 border-b border-slate-200">
                                {items.map((item: any, idx: number) => (
                                    <tr key={idx} className="print:border-b print:border-slate-300">
                                        <td className="py-3 px-4">
                                            <div className="font-bold text-slate-800">{item.productname}</div>
                                            <div className="text-xs text-slate-500">{item.productcode}</div>
                                        </td>
                                        <td className="py-3 px-4 text-slate-600 italic">
                                            {item.reason || '-'}
                                        </td>
                                        <td className="py-3 px-4 text-center font-medium">
                                            {item.quantity} {item.unitcode || 'PCS'}
                                        </td>
                                        <td className="py-3 px-4 text-right text-slate-600">
                                            {formatCurrency(item.unitprice)}
                                        </td>
                                        <td className="py-3 px-4 text-right font-bold text-slate-900">
                                            {formatCurrency(item.total)}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                            <tfoot className="bg-slate-50 print:bg-transparent">
                                <tr>
                                    <td colSpan={4} className="py-4 px-4 text-right font-bold text-slate-700 uppercase">Total ht</td>
                                    <td className="py-4 px-4 text-right font-bold text-xl text-slate-900 border-t-2 border-slate-300">
                                        {formatCurrency(returnData.totalamount)}
                                    </td>
                                </tr>
                            </tfoot>
                        </table>

                        {/* Signature Section (Print Only) */}
                        <div className="hidden print:flex mt-12 pt-8 border-t border-slate-200 justify-between">
                            <div className="text-center w-1/3">
                                <p className="font-bold text-slate-900 uppercase text-xs mb-16">Signature Responsable Achat</p>
                                <div className="border-b border-slate-400 w-3/4 mx-auto"></div>
                            </div>
                            <div className="text-center w-1/3">
                                <p className="font-bold text-slate-900 uppercase text-xs mb-16">Signature Fournisseur / Livreur</p>
                                <div className="border-b border-slate-400 w-3/4 mx-auto"></div>
                            </div>
                        </div>

                        {/* Footer (Print Only) */}
                        <div className="hidden print:block fixed bottom-4 left-0 right-0 text-center text-xs text-slate-400">
                            <p>Document généré le {new Date().toLocaleString('fr-FR')} - Ceramic ERP Platform</p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
