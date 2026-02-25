'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import api from '@/lib/api';
import { useRouter, useParams, useSearchParams } from 'next/navigation';
import { useReactToPrint } from 'react-to-print';
import { Order } from '@/components/print/ReceiptTemplate';
import { StandardDocument, DocumentData, DocumentType } from '@/components/print/StandardDocument';

// Helpers
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

export default function OrderPrintPage() {
    const { id } = useParams();
    const searchParams = useSearchParams();
    const type = (searchParams.get('type') as DocumentType) || 'DELIVERY_NOTE';

    const [order, setOrder] = useState<Order | null>(null);
    const [loading, setLoading] = useState(true);
    const printRef = useRef<HTMLDivElement>(null);
    const router = useRouter();

    const handlePrint = useReactToPrint({
        content: () => printRef.current,
        documentTitle: order ? `${type}_${order.ordernumber}` : 'Document',
        onAfterPrint: () => {
            // Optional: close window or go back after print
            // router.back(); 
        }
    });

    useEffect(() => {
        if (id) loadOrder();
    }, [id]);

    // Auto-trigger print when data is loaded
    useEffect(() => {
        if (!loading && order && printRef.current) {
            // Small timeout to ensure rendering is complete
            const timer = setTimeout(() => {
                handlePrint();
            }, 500);
            return () => clearTimeout(timer);
        }
    }, [loading, order, handlePrint]);

    const loadOrder = async () => {
        setLoading(true);
        try {
            const res = await api.getOrder(Number(id));
            if (res.success) setOrder(res.data as Order);
        } catch (error) {
            console.error(error);
            alert("Erreur lors du chargement de la commande");
        } finally {
            setLoading(false);
        }
    };

    const documentData: DocumentData = useMemo(() => {
        if (!order) return { number: '', date: '', items: [] };

        return {
            number: order.ordernumber,
            date: order.orderdate,
            clientName: (order as any).retailclientname || order.customername,
            clientAddress: (order as any).customeraddress || '',
            clientPhone: (order as any).customerphone || '',
            createdBy: (order as any).salespersonname || (order as any).createdby || '',
            items: order.items.map(item => {
                // Use static packaging data from product definition
                const qty = Number(item.quantity) || 0;
                const cartons = Number(item.coliscount) || 0;
                const pallets = Number(item.palletcount) || 0;

                // Fallback to calculation ONLY if static data is missing (backward compatibility)
                const piecesPerCarton = Number((item as any).qteparcolis) || (cartons > 0 && qty > 0 ? qty / cartons : undefined);
                const cartonsPerPalette = Number((item as any).qtecolisparpalette) || (pallets > 0 && cartons > 0 ? cartons / pallets : undefined);

                return {
                    productCode: item.productcode,
                    productName: item.productname,
                    brandName: (item as any).brandname,
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
        };
    }, [order]);

    // Calculate totals based on mapped items to ensure consistency
    const calculatedTotals = useMemo(() => {
        if (!documentData.items) return { totalHT: 0, totalTVA: 0 };

        const totalHT = documentData.items.reduce((sum, item) => sum + (item.lineTotal || 0), 0);
        // Assuming tax is included in lineTotal or calculated separately? 
        // POS `getPrintData` passes totalHT directly. 
        // Let's use the explicit tax amount from order if available, or 0.
        // But safer to rely on item sums if possible. 
        // However, item.lineTotal in backend usually includes tax? No, LineTotal is usually (Price * Qty) - Discount.
        // Let's check `order.controller.js`: LineTotal = (UnitPrice * Quantity) - DiscountAmount.
        // And FinalLineTotal (stored in DB?) `lineTotal + taxAmount`.
        // The `order.items` response from backend sends `linetotal`.

        return { totalHT };
    }, [documentData.items]);

    // Merge calculated totals and fix "Ancien Solde"
    const finalDocumentData: DocumentData = useMemo(() => {
        if (!order) return documentData;

        // "Ancien Solde" Fix:
        // The `order` object from API likely contains the *current* customer balance in `order.currentbalance`.
        // If the order is CONFIRMED or DELIVERED, this balance INCLUDES the order's debt.
        // We must subtract the order's debt to show the true "Ancien Solde" (balance before this order).
        // Debt added by this order = Total Amount - Payment Amount.

        let oldBalance = Number((order as any).currentbalance) || 0;

        // Check status to decide if we need to subtract the debt
        if (order.status === 'CONFIRMED' || order.status === 'DELIVERED') {
            const orderTotal = Number(order.totalamount) || 0;
            const orderPayment = Number((order as any).paymentamount) || 0; // Use paymentamount from order, not calculated payment
            const orderDebt = orderTotal - orderPayment;
            oldBalance = oldBalance - orderDebt;
        }

        return {
            ...documentData,
            totalHT: calculatedTotals.totalHT,
            totalTVA: (order as any).taxamount || 0,
            discount: (order as any).discount || 0,
            timbre: (order as any).timber || 0,
            deliveryCost: (order as any).deliverycost || 0,
            payment: (order as any).paymentamount || 0,
            oldBalance: oldBalance,
        };
    }, [documentData, calculatedTotals, order]);

    if (loading) return <div className="flex items-center justify-center min-h-screen"><p className="text-xl text-slate-500">Chargement...</p></div>;
    if (!order) return <div className="flex items-center justify-center min-h-screen"><p className="text-xl text-red-500">Commande non trouvée</p></div>;

    const titleMap: Record<string, string> = {
        'DELIVERY_NOTE': 'Bon de Livraison (BL)',
        'LOADING_SLIP': 'Bon de Sortie Stock (BSS)',
        'PURCHASE_ORDER': 'Bon de Commande (BC)',
        'TICKET': 'Ticket de Caisse',
    };

    return (
        <div className="min-h-screen bg-slate-100 p-8">
            <div className="max-w-5xl mx-auto mb-6 flex justify-between items-center no-print">
                <h1 className="text-2xl font-bold">{titleMap[type] || type} - {order.ordernumber}</h1>
                <div className="flex gap-2">
                    <button
                        onClick={handlePrint}
                        className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 font-medium flex items-center gap-2 shadow-sm"
                    >
                        🖨️ Imprimer
                    </button>
                    <button
                        onClick={() => window.close()}
                        className="bg-white border border-slate-300 text-slate-700 px-4 py-2 rounded-lg hover:bg-slate-50 font-medium shadow-sm"
                    >
                        Fermer
                    </button>
                </div>
            </div>

            <div className="flex justify-center">
                <div className="shadow-2xl">
                    <StandardDocument
                        ref={printRef}
                        type={type}
                        data={finalDocumentData}
                    />
                </div>
            </div>
        </div>
    );
}
