'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import { formatDate } from '@/lib/utils';
import api from '@/lib/api';
import { useParams, useSearchParams } from 'next/navigation';
import { useReactToPrint } from 'react-to-print';
import { StandardDocument, DocumentData, DocumentType } from '@/components/print/StandardDocument';

export default function ReturnPrintPage() {
    const { id } = useParams();
    const searchParams = useSearchParams();
    const type = 'RETURN_SLIP'; // Enforce Return Slip type

    const [returnData, setReturnData] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const printRef = useRef<HTMLDivElement>(null);

    const handlePrint = useReactToPrint({
        content: () => printRef.current,
        documentTitle: returnData ? `RET_${returnData.returnnumber}` : 'Retour',
    });

    useEffect(() => {
        if (id) loadReturn();
    }, [id]);

    // Auto-trigger print when data is loaded
    useEffect(() => {
        if (!loading && returnData && printRef.current) {
            const timer = setTimeout(() => {
                handlePrint();
            }, 500);
            return () => clearTimeout(timer);
        }
    }, [loading, returnData, handlePrint]);

    const loadReturn = async () => {
        setLoading(true);
        try {
            const res = await api.getReturnById(Number(id));
            if (res.success) setReturnData(res.data);
            else throw new Error(res.message);
        } catch (error) {
            console.error(error);
            alert("Erreur lors du chargement du retour");
        } finally {
            setLoading(false);
        }
    };

    const documentData: DocumentData = useMemo(() => {
        if (!returnData) return { number: '', date: '', items: [] };

        return {
            number: returnData.returnnumber,
            date: returnData.returndate || returnData.createdat,
            clientName: returnData.customername,
            clientAddress: returnData.customeraddress || '',
            clientPhone: returnData.customerphone || '',
            createdBy: returnData.username || '',
            items: returnData.items.map((item: any) => {
                const qty = Number(item.quantity) || 0;
                // Pieces per carton and cartons per palette come from our Backend fix with correct aliases
                const piecesPerCarton = Number(item.derivedpiecespercolis) || undefined;
                const cartonsPerPalette = Number(item.derivedcolisperpalette) || undefined;

                return {
                    productCode: item.productcode,
                    productName: item.productname,
                    brandName: item.brandname,
                    quantity: qty,
                    unitCode: item.unitcode,
                    unitPrice: item.unitprice || 0,
                    lineTotal: item.linetotal || 0,
                    piecesPerCarton,
                    cartonsPerPalette,
                };
            }),
            totalHT: returnData.totalamount,
            totalTVA: 0,
            discount: 0,
            payment: 0,
        };
    }, [returnData]);

    if (loading) return <div className="flex items-center justify-center min-h-screen"><p className="text-xl text-slate-500 font-bold animate-pulse">Chargement du document...</p></div>;
    if (!returnData) return <div className="flex items-center justify-center min-h-screen"><p className="text-xl text-red-500 font-bold">Retour non trouvé</p></div>;

    return (
        <div className="min-h-screen bg-slate-100 p-8">
            <div className="max-w-5xl mx-auto mb-6 flex justify-between items-center no-print">
                <div className="flex items-center gap-4">
                    <span className="text-4xl">↩️</span>
                    <div>
                        <h1 className="text-2xl font-black text-slate-800 uppercase tracking-tight">Bon de Retour</h1>
                        <p className="text-slate-500 font-medium">{returnData.returnnumber}</p>
                    </div>
                </div>
                <div className="flex gap-2">
                    <button
                        onClick={handlePrint}
                        className="bg-orange-600 text-white px-6 py-2.5 rounded-xl hover:bg-orange-700 font-bold flex items-center gap-2 shadow-lg transition-all"
                    >
                        🖨️ Imprimer
                    </button>
                    <button
                        onClick={() => window.close()}
                        className="bg-white border-2 border-slate-200 text-slate-700 px-6 py-2.5 rounded-xl hover:bg-slate-50 font-bold shadow-sm transition-all"
                    >
                        Fermer
                    </button>
                </div>
            </div>

            <div className="flex justify-center">
                <div className="shadow-2xl rounded-xl overflow-hidden bg-white">
                    <StandardDocument
                        ref={printRef}
                        type={type as any}
                        data={documentData}
                    />
                </div>
            </div>
            
            {/* Aesthetics: Add a subtle overlay for professional look */}
            <div className="fixed inset-0 pointer-events-none border-[16px] border-slate-200/20 z-50 no-print"></div>
        </div>
    );
}
