'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import api from '@/lib/api';
import Link from 'next/link';
import { useRouter, useParams } from 'next/navigation';
import { useReactToPrint } from 'react-to-print';
import { Order, OrderItem } from '@/components/print/ReceiptTemplate';
import { StandardDocument, DocumentData } from '@/components/print/StandardDocument';

// Helpers & Interfaces
const formatCurrency = (amount: number) => new Intl.NumberFormat('fr-DZ', { style: 'currency', currency: 'DZD' }).format(amount);
const formatDate = (d: string) => {
    if (!d) return '-';
    const match = d.match(/^(\d{4})-\d{2}-\d{2}/);
    if (match && d.length <= 10) {
        const parts = d.split('-');
        return `${parts[2]}/${parts[1]}/${parts[0]}`;
    } else if (match) {
        const parts = match[0].split('-');
        return `${parts[2]}/${parts[1]}/${parts[0]}`;
    }
    return new Date(d).toLocaleDateString('fr-DZ');
};

interface FactureItem {
    productCode: string;
    productName: string;
    palettes: number;
    cartons: number;
    quantity: number;  // This is SQM for tiles
    unitCode: string;
    unitPrice: number;
    lineTotal: number;
    piecesPerCarton: number;
    cartonsPerPalette: number;
    sqmPerPiece: number;
}

export default function OrderDetailsPage() {
    const { id } = useParams();
    const router = useRouter();
    const [order, setOrder] = useState<Order | null>(null);
    const [loading, setLoading] = useState(true);

    // Facture Modal State
    const [isFactureModalOpen, setIsFactureModalOpen] = useState(false);
    const [factureItems, setFactureItems] = useState<FactureItem[]>([]);
    const [factureDiscount, setFactureDiscount] = useState(0);
    const [factureTVA, setFactureTVA] = useState(false); // 0% or 19%
    const [factureNumber, setFactureNumber] = useState('');

    // Print Refs
    const printRef = useRef<HTMLDivElement>(null);
    const facturePrintRef = useRef<HTMLDivElement>(null);

    const handlePrint = useReactToPrint({
        content: () => printRef.current,
        documentTitle: order ? `BL_${order.ordernumber}` : 'BonLivraison',
    });

    const handlePrintFacture = useReactToPrint({
        content: () => facturePrintRef.current,
        documentTitle: factureNumber || 'Facture',
    });

    useEffect(() => {
        if (id) loadOrder();
    }, [id]);

    const loadOrder = async () => {
        setLoading(true);
        try {
            const res = await api.getOrder(Number(id));
            if (res.success) setOrder(res.data as Order);
        } catch (error) {
            console.error(error);
        } finally {
            setLoading(false);
        }
    };

    const changeStatus = async (newStatus: string) => {
        if (!confirm(`Changer le statut en ${newStatus}?`)) return;
        try {
            const res = await api.updateOrderStatus(Number(id), newStatus);
            if (res.success) {
                alert("Statut mis à jour !");
                loadOrder(); // Refresh
            }
        } catch (error: any) {
            alert(`Erreur: ${error.message}`);
        }
    };

    // Open facture modal and initialize items from order
    const openFactureModal = () => {
        if (!order) return;

        // Generate facture number
        const now = new Date();
        const factureNum = `FAC-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}-${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}${String(now.getSeconds()).padStart(2, '0')}`;
        setFactureNumber(factureNum);

        // Copy items from order with packaging info
        const items: FactureItem[] = order.items.map(item => {
            // Get packaging values from order item (stored during POS)
            const cartons = item.coliscount || 0;

            // Calculate packaging ratios (stored in order or derived)
            // Use the stored values from POS - piecesPerCarton is SQM per carton
            const piecesPerCarton = cartons > 0 && item.quantity > 0 ? item.quantity / cartons : 0;

            // Use 36 as default cartons per palette (standard for tiles)
            const DEFAULT_CTN_PER_PAL = 36;
            const cartonsPerPalette = item.palletcount > 0 && cartons > 0
                ? cartons / item.palletcount
                : DEFAULT_CTN_PER_PAL;

            // Recalculate palettes based on cartons
            const palettes = cartonsPerPalette > 0 ? Math.floor(cartons / cartonsPerPalette) : 0;

            return {
                productCode: item.productcode,
                productName: item.productname,
                palettes,
                cartons,
                quantity: item.quantity,
                unitCode: item.unitcode,
                unitPrice: item.unitprice,
                lineTotal: item.linetotal,
                piecesPerCarton,
                cartonsPerPalette,
                sqmPerPiece: 0, // Not needed for facture display
            };
        });
        setFactureItems(items);
        setFactureDiscount(0);
        setFactureTVA(false);
        setIsFactureModalOpen(true);
    };

    // Update facture item with auto-calculation (like POS)
    const updateFactureItem = (index: number, field: string, value: number) => {
        const newItems = [...factureItems];
        const item = newItems[index];

        (item as any)[field] = value;

        // Auto-calculate when QUANTITY changes
        if (field === 'quantity') {
            const qty = value;
            if (item.piecesPerCarton > 0) {
                const calculatedCartons = Math.floor(qty / item.piecesPerCarton);
                item.cartons = calculatedCartons;
                if (item.cartonsPerPalette > 0) {
                    item.palettes = Math.floor(calculatedCartons / item.cartonsPerPalette);
                }
            }
        }

        // When CARTONS changes, recalculate quantity and palettes
        if (field === 'cartons') {
            const cartons = value;
            if (item.piecesPerCarton > 0) {
                item.quantity = cartons * item.piecesPerCarton;
            }
            if (item.cartonsPerPalette > 0) {
                item.palettes = Math.floor(cartons / item.cartonsPerPalette);
            }
        }

        // When PALETTES changes, recalculate cartons and quantity
        if (field === 'palettes') {
            const palettes = value;
            if (item.cartonsPerPalette > 0) {
                item.cartons = palettes * item.cartonsPerPalette;
                if (item.piecesPerCarton > 0) {
                    item.quantity = item.cartons * item.piecesPerCarton;
                }
            }
        }

        // Always recalculate lineTotal
        item.lineTotal = item.quantity * item.unitPrice;

        setFactureItems(newItems);
    };

    // Calculate facture totals
    const factureSubtotal = factureItems.reduce((sum, item) => sum + item.lineTotal, 0);
    const factureTVAAmount = factureTVA ? factureSubtotal * 0.19 : 0;
    const factureTotal = factureSubtotal + factureTVAAmount - factureDiscount;

    // Get facture print data (memoized to avoid re-render issues)
    const factureData: DocumentData = useMemo(() => {
        if (!order) return { number: '', date: '', items: [] };

        return {
            number: factureNumber,
            date: new Date().toISOString(),
            clientName: (order as any).retailclientname || order.customername,
            clientAddress: (order as any).customeraddress || '',
            clientPhone: (order as any).customerphone || '',
            items: factureItems.map(item => ({
                productCode: item.productCode,
                productName: item.productName,
                quantity: item.quantity || 0,
                unitCode: item.unitCode,
                unitPrice: item.unitPrice || 0,
                lineTotal: item.lineTotal || 0,
                palletCount: item.palettes || 0,
                boxCount: item.cartons || 0,
                piecesPerCarton: item.piecesPerCarton || undefined,
                cartonsPerPalette: item.cartonsPerPalette || undefined,
            })),
            totalHT: factureSubtotal,
            totalTVA: factureTVAAmount,
            discount: factureDiscount,
        };
    }, [order, factureNumber, factureItems, factureSubtotal, factureTVAAmount, factureDiscount]);

    // Get receipt/BL print data (memoized)
    const receiptData: DocumentData = useMemo(() => {
        if (!order) return { number: '', date: '', items: [] };

        return {
            number: order.ordernumber,
            date: order.orderdate,
            clientName: (order as any).retailclientname || order.customername,
            clientAddress: (order as any).customeraddress || '',
            clientPhone: (order as any).customerphone || '',
            createdBy: order.salespersonname || '',
            items: order.items.map(item => {
                // Derive packaging ratios from stored counts
                const qty = Number(item.quantity) || 0;
                const cartons = Number(item.coliscount) || 0;
                const pallets = Number(item.palletcount) || 0;
                const piecesPerCarton = cartons > 0 && qty > 0 ? qty / cartons : undefined;
                const cartonsPerPalette = pallets > 0 && cartons > 0 ? cartons / pallets : undefined;

                return {
                    productCode: item.productcode,
                    productName: item.productname,
                    quantity: qty,
                    unitCode: item.unitcode,
                    unitPrice: item.unitprice || 0,
                    lineTotal: item.linetotal || 0,
                    palletCount: pallets,
                    boxCount: cartons,
                    piecesPerCarton,
                    cartonsPerPalette,
                };
            }),
            totalHT: order.subtotal || order.totalamount,
            totalTVA: order.taxamount || 0,
            discount: 0,
            payment: (order as any).paymentamount || 0,
            oldBalance: (order as any).currentbalance || 0,
            deliveryCost: (order as any).deliverycost || 0, // NEW: Pass delivery cost
        };
    }, [order]);

    if (loading || !order) return <p className="p-10 text-center">Chargement...</p>;

    return (
        <div className="p-4 sm:p-6 lg:p-8 min-h-screen bg-slate-50 text-slate-800">
            <div className="max-w-5xl mx-auto">

                {/* Header */}
                <div className="mb-6 flex justify-between items-start">
                    <div>
                        <h1 className="text-3xl font-bold text-slate-800">Commande {order.ordernumber}</h1>
                        <p className="text-slate-500">Date: {formatDate(order.orderdate)}</p>
                    </div>
                    <div className="flex gap-2">
                        <button
                            onClick={openFactureModal}
                            className="bg-green-600 text-white px-4 py-2 rounded-lg shadow hover:bg-green-700 flex items-center gap-2"
                        >
                            📄 Générer Facture
                        </button>
                        <button onClick={handlePrint} className="bg-purple-600 text-white px-4 py-2 rounded-lg shadow hover:bg-purple-700 flex items-center gap-2">
                            🖨️ Imprimer Reçu
                        </button>
                        <Link href="/orders" className="bg-white border border-slate-300 text-slate-700 px-4 py-2 rounded-lg hover:bg-slate-50">
                            Retour
                        </Link>
                    </div>
                </div>

                {/* Status Bar */}
                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm mb-6 flex items-center justify-between">
                    <div>
                        <span className="text-slate-500 text-sm mr-2">Statut actuel:</span>
                        <span className="font-bold text-lg px-3 py-1 bg-slate-100 rounded">{order.status}</span>
                    </div>
                    <div className="flex gap-2">
                        {/* Workflow Buttons */}
                        {order.status === 'PENDING' && (
                            <>
                                <button onClick={() => changeStatus('CONFIRMED')} className="bg-blue-600 text-white px-3 py-1 rounded text-sm hover:bg-blue-700">Confirmer</button>
                                <button onClick={() => changeStatus('CANCELLED')} className="bg-red-50 text-red-600 px-3 py-1 rounded text-sm hover:bg-red-100 border border-red-200">Annuler</button>
                            </>
                        )}
                        {order.status === 'CONFIRMED' && (
                            <button onClick={() => changeStatus('DELIVERED')} className="bg-green-600 text-white px-3 py-1 rounded text-sm hover:bg-green-700">Marquer Livré</button>
                        )}
                    </div>
                </div>

                {/* Content Grid */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    {/* Client Info */}
                    <div className="md:col-span-1 bg-white p-6 rounded-xl border border-slate-200 shadow-sm h-fit">
                        <h3 className="font-bold text-slate-700 mb-4 border-b pb-2">Client</h3>
                        <p className="text-lg font-medium">{(order as any).retailclientname || order.customername}</p>
                        <p className="text-sm text-slate-500">{(order as any).retailclientname ? 'VENTE DÉTAIL' : order.customertype}</p>

                        {order.notes && (
                            <div className="mt-4 p-3 bg-yellow-50 border border-yellow-100 rounded text-sm text-yellow-800">
                                <strong>Notes:</strong><br />{order.notes}
                            </div>
                        )}
                    </div>

                    {/* Items Table */}
                    <div className="md:col-span-2 bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                        <table className="w-full text-sm text-left">
                            <thead className="bg-slate-50 text-slate-500 font-semibold border-b">
                                <tr>
                                    <th className="px-4 py-3">Produit</th>
                                    <th className="px-4 py-3 text-right">Qté</th>
                                    <th className="px-4 py-3 text-right">Prix U.</th>
                                    <th className="px-4 py-3 text-right">Total</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {order.items.map((item, i) => (
                                    <tr key={i}>
                                        <td className="px-4 py-3">
                                            <div className="font-medium">{item.productname}</div>
                                            <div className="text-xs text-slate-400">{item.productcode}</div>
                                        </td>
                                        <td className="px-4 py-3 text-right">{item.quantity} {item.unitcode}</td>
                                        <td className="px-4 py-3 text-right">{formatCurrency(item.unitprice)}</td>
                                        <td className="px-4 py-3 text-right font-bold">{formatCurrency(item.linetotal)}</td>
                                    </tr>
                                ))}
                            </tbody>
                            <tfoot className="bg-slate-50 border-t">
                                <tr>
                                    <td colSpan={3} className="px-4 py-3 text-right font-bold">TOTAL</td>
                                    <td className="px-4 py-3 text-right font-bold text-lg text-blue-600">{formatCurrency(order.totalamount)}</td>
                                </tr>
                            </tfoot>
                        </table>
                    </div>
                </div>

                {/* Hidden Receipt/BL Component for Printing */}
                <div style={{ display: 'none' }}>
                    <StandardDocument
                        ref={printRef}
                        type="DELIVERY_NOTE"
                        data={receiptData}
                    />
                </div>

                {/* Hidden Facture Component for Printing */}
                <div style={{ display: 'none' }}>
                    <StandardDocument
                        ref={facturePrintRef}
                        type="FACTURE"
                        data={factureData}
                    />
                </div>

            </div>

            {/* Facture Modal */}
            {isFactureModalOpen && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col">
                        {/* Modal Header */}
                        <div className="p-4 border-b border-slate-200 flex justify-between items-center bg-green-50 rounded-t-2xl">
                            <div>
                                <h2 className="text-xl font-bold text-green-800">📄 Générer Facture</h2>
                                <p className="text-sm text-green-600">{factureNumber}</p>
                            </div>
                            <button
                                onClick={() => setIsFactureModalOpen(false)}
                                className="text-slate-400 hover:text-slate-600 text-2xl"
                            >
                                ×
                            </button>
                        </div>

                        {/* Modal Body */}
                        <div className="p-4 overflow-y-auto flex-1 space-y-4">
                            {/* Client Info */}
                            <div className="bg-slate-50 p-3 rounded-lg">
                                <p className="text-sm text-slate-500">Client</p>
                                <p className="font-bold">{(order as any).retailclientname || order.customername}</p>
                            </div>

                            {/* Editable Items Table */}
                            <div className="border border-slate-200 rounded-lg overflow-hidden">
                                <table className="w-full text-sm">
                                    <thead className="bg-slate-100">
                                        <tr>
                                            <th className="px-3 py-2 text-left">Produit</th>
                                            <th className="px-3 py-2 text-center w-16">Pal</th>
                                            <th className="px-3 py-2 text-center w-16">Ctn</th>
                                            <th className="px-3 py-2 text-center w-24">Qté</th>
                                            <th className="px-3 py-2 text-right w-28">Prix U.</th>
                                            <th className="px-3 py-2 text-right w-28">Total</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                        {factureItems.map((item, idx) => (
                                            <tr key={idx}>
                                                <td className="px-3 py-2">
                                                    <div className="font-medium text-sm">{item.productName}</div>
                                                    <div className="text-xs text-slate-400">{item.productCode}</div>
                                                    {item.piecesPerCarton > 0 && (
                                                        <div className="text-xs text-blue-500 mt-0.5">
                                                            {item.piecesPerCarton.toFixed(2)} /ctn • {item.cartonsPerPalette.toFixed(0)} ctn/pal
                                                        </div>
                                                    )}
                                                </td>
                                                <td className="px-1 py-2">
                                                    <input
                                                        type="number"
                                                        min="0"
                                                        value={item.palettes}
                                                        onChange={(e) => updateFactureItem(idx, 'palettes', Number(e.target.value))}
                                                        className="w-full p-1 border border-slate-200 rounded text-center text-sm"
                                                        disabled={item.cartonsPerPalette === 0}
                                                    />
                                                </td>
                                                <td className="px-1 py-2">
                                                    <input
                                                        type="number"
                                                        min="0"
                                                        value={item.cartons}
                                                        onChange={(e) => updateFactureItem(idx, 'cartons', Number(e.target.value))}
                                                        className="w-full p-1 border border-slate-200 rounded text-center text-sm"
                                                        disabled={item.piecesPerCarton === 0}
                                                    />
                                                </td>
                                                <td className="px-1 py-2">
                                                    <input
                                                        type="number"
                                                        min="0"
                                                        step="0.01"
                                                        value={item.quantity}
                                                        onChange={(e) => updateFactureItem(idx, 'quantity', Number(e.target.value))}
                                                        className="w-full p-1 border border-blue-300 rounded text-center text-sm bg-blue-50 font-medium"
                                                    />
                                                </td>
                                                <td className="px-1 py-2">
                                                    <input
                                                        type="number"
                                                        min="0"
                                                        step="0.01"
                                                        value={item.unitPrice}
                                                        onChange={(e) => updateFactureItem(idx, 'unitPrice', Number(e.target.value))}
                                                        className="w-full p-1 border border-slate-200 rounded text-right text-sm"
                                                    />
                                                </td>
                                                <td className="px-3 py-2 text-right font-mono font-medium">
                                                    {formatCurrency(item.lineTotal)}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                    <tfoot className="bg-slate-50">
                                        <tr>
                                            <td className="px-3 py-2 text-right text-xs text-slate-500">Totaux:</td>
                                            <td className="px-1 py-2 text-center text-xs font-medium">
                                                {factureItems.reduce((sum, i) => sum + (Number(i.palettes) || 0), 0)} pal
                                            </td>
                                            <td className="px-1 py-2 text-center text-xs font-medium">
                                                {factureItems.reduce((sum, i) => sum + (Number(i.cartons) || 0), 0)} ctn
                                            </td>
                                            <td className="px-1 py-2 text-center text-xs font-medium">
                                                {(factureItems.reduce((sum, i) => sum + (Number(i.quantity) || 0), 0) || 0).toFixed(2)} m²
                                            </td>
                                            <td className="px-1 py-2"></td>
                                            <td className="px-3 py-2 text-right font-mono font-bold text-blue-600">
                                                {formatCurrency(factureSubtotal)}
                                            </td>
                                        </tr>
                                    </tfoot>
                                </table>
                            </div>

                            {/* Totals */}
                            <div className="bg-slate-50 rounded-lg p-4 space-y-3">
                                {/* TVA Toggle */}
                                <div className="flex items-center justify-between">
                                    <label className="flex items-center gap-2">
                                        <input
                                            type="checkbox"
                                            checked={factureTVA}
                                            onChange={(e) => setFactureTVA(e.target.checked)}
                                            className="w-4 h-4 text-green-600"
                                        />
                                        <span className="text-sm">Appliquer TVA (19%)</span>
                                    </label>
                                </div>

                                {/* Discount */}
                                <div className="flex items-center justify-between">
                                    <label className="text-sm">Remise</label>
                                    <input
                                        type="number"
                                        min="0"
                                        value={factureDiscount}
                                        onChange={(e) => setFactureDiscount(Number(e.target.value))}
                                        className="w-32 p-1 border border-slate-300 rounded text-right"
                                    />
                                </div>

                                <hr />

                                {/* Summary */}
                                <div className="space-y-1 text-sm">
                                    <div className="flex justify-between">
                                        <span>Sous-total HT</span>
                                        <span className="font-mono">{formatCurrency(factureSubtotal)}</span>
                                    </div>
                                    {factureTVA && (
                                        <div className="flex justify-between text-slate-600">
                                            <span>TVA (19%)</span>
                                            <span className="font-mono">{formatCurrency(factureTVAAmount)}</span>
                                        </div>
                                    )}
                                    {factureDiscount > 0 && (
                                        <div className="flex justify-between text-red-600">
                                            <span>Remise</span>
                                            <span className="font-mono">-{formatCurrency(factureDiscount)}</span>
                                        </div>
                                    )}
                                    <div className="flex justify-between text-lg font-bold pt-2 border-t">
                                        <span>TOTAL TTC</span>
                                        <span className="font-mono text-green-600">{formatCurrency(factureTotal)}</span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Modal Footer */}
                        <div className="p-4 border-t border-slate-200 bg-slate-50 rounded-b-2xl flex justify-end gap-2">
                            <button
                                onClick={() => setIsFactureModalOpen(false)}
                                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-sm font-medium"
                            >
                                Annuler
                            </button>
                            <button
                                onClick={handlePrintFacture}
                                className="px-6 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-medium flex items-center gap-2"
                            >
                                🖨️ Imprimer Facture
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

