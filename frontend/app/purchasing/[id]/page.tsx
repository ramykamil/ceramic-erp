'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import api from '@/lib/api';
import Link from 'next/link';
import { useRouter, useParams } from 'next/navigation';
import { useReactToPrint } from 'react-to-print';
import { StandardDocument, DocumentData } from '@/components/print/StandardDocument';

// Interfaces for detailed PO data
interface PurchaseOrderItem {
  poitemid: number;
  productcode: string;
  productname: string;
  quantity: number;
  unitcode: string;
  unitprice: number;
  linetotal: number;
  qteparcolis?: number;  // Pieces per carton
  qtecolisparpalette?: number;  // Cartons per palette
  brandname?: string;
}

interface PurchaseOrderDetail {
  purchaseorderid: number;
  ponumber: string;
  factoryname: string;
  warehousename: string;
  orderdate: string;
  expecteddeliverydate: string | null;
  status: string;
  totalamount: number;
  subtotal: number;
  notes: string | null;
  ownershiptype: 'OWNED' | 'CONSIGNMENT';
  deliverycost?: number;
  items: PurchaseOrderItem[]; // Array of items
}

// Helper functions (can be moved to a utils file later)
const formatCurrencyDZD = (amount: number | null | undefined): string => {
  const numericAmount = Number(amount);
  if (isNaN(numericAmount)) return new Intl.NumberFormat('fr-DZ', { style: 'currency', currency: 'DZD' }).format(0);
  return new Intl.NumberFormat('fr-DZ', { style: 'currency', currency: 'DZD' }).format(numericAmount);
};

const formatDate = (dateString: string | null | undefined): string => {
  if (!dateString) return '—';
  try {
    const match = dateString.match(/^(\d{4})-\d{2}-\d{2}/);
    if (match && dateString.length <= 10) {
      const parts = dateString.split('-');
      return `${parts[2]}/${parts[1]}/${parts[0]}`;
    } else if (match) {
      const parts = match[0].split('-');
      return `${parts[2]}/${parts[1]}/${parts[0]}`;
    }
    return new Date(dateString).toLocaleDateString('fr-DZ', { year: 'numeric', month: '2-digit', day: '2-digit' });
  } catch (e) { return dateString; }
};

const getStatusBadge = (status: string): string => {
  const statusClasses = {
    PENDING: 'bg-yellow-100 text-yellow-800 border border-yellow-200',
    APPROVED: 'bg-blue-100 text-blue-800 border border-blue-200',
    RECEIVED: 'bg-green-100 text-green-800 border border-green-200',
    PARTIAL: 'bg-purple-100 text-purple-800 border border-purple-200',
    CANCELLED: 'bg-red-100 text-red-800 border border-red-200',
  };
  return statusClasses[status as keyof typeof statusClasses] || 'bg-gray-100 text-gray-800';
};

// --- Composant Page ---
// Helper to parse dimensions
const parseSqmPerPiece = (productName: string): number => {
  if (productName.toLowerCase().startsWith('fiche')) return 0;
  const sizeMatch = productName.match(/(\d+)\s*[\/xX×]\s*(\d+)/i);
  if (sizeMatch) {
    const dim1 = parseInt(sizeMatch[1]) / 100;
    const dim2 = parseInt(sizeMatch[2]) / 100;
    return dim1 * dim2;
  }
  return 0.36; // Default 60x60
};

export default function PurchaseOrderDetailPage() {
  const [po, setPo] = useState<PurchaseOrderDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [apiError, setApiError] = useState<string | null>(null);
  const router = useRouter();
  const params = useParams(); // Hook to get URL parameters
  const { id } = params;

  // Print ref
  const bcPrintRef = useRef<HTMLDivElement>(null);

  // Print handler
  const handlePrintBC = useReactToPrint({
    content: () => bcPrintRef.current,
    documentTitle: po ? `BC_${po.ponumber}` : 'BonCommande',
  });

  // BC print data
  const bcData: DocumentData = useMemo(() => {
    if (!po) return { number: '', date: '', items: [] };
    return {
      number: po.ponumber,
      date: po.orderdate,
      clientName: 'STOCK GROS',
      deliveryCost: po.deliverycost,
      items: po.items.map(item => {
        const qty = Number(item.quantity) || 0;
        let piecesPerCarton = Number(item.qteparcolis) || 0;
        const cartonsPerPalette = Number(item.qtecolisparpalette) || 0;

        // Smart Packaging Detection (Match Edit Page Logic)
        const sqmPerPiece = parseSqmPerPiece(item.productname);
        if (sqmPerPiece > 0 && piecesPerCarton > 0 && piecesPerCarton % 1 !== 0) {
          const calculatedPieces = Math.round(piecesPerCarton / sqmPerPiece);
          if (Math.abs(calculatedPieces * sqmPerPiece - piecesPerCarton) < 0.05) {
            piecesPerCarton = calculatedPieces;
          }
        }

        // Convert quantity to Pieces first
        let pieces = qty;

        if (item.unitcode === 'SQM' && sqmPerPiece > 0) {
          pieces = qty / sqmPerPiece;
        } else if (item.unitcode === 'CARTON' || item.unitcode === 'CRT') {
          pieces = qty * piecesPerCarton;
        }

        const boxCount = piecesPerCarton > 0 ? parseFloat((pieces / piecesPerCarton).toFixed(2)) : 0;
        const palletCount = cartonsPerPalette > 0 ? parseFloat((boxCount / cartonsPerPalette).toFixed(2)) : 0;

        return {
          productCode: item.productcode,
          productName: item.productname,
          brandName: item.brandname || '',
          quantity: qty,
          unitCode: item.unitcode,
          unitPrice: Number(item.unitprice) || 0,
          lineTotal: Number(item.linetotal) || 0,
          palletCount: boxCount > 0 ? palletCount : undefined, // Hide fractional pallets if 0
          boxCount: boxCount > 0 ? boxCount : undefined,       // Hide fractional cartons if 0
          piecesPerCarton: piecesPerCarton || undefined,
          cartonsPerPalette: cartonsPerPalette || undefined,
        };
      }),
    };
  }, [po]);

  useEffect(() => {
    if (!id) return; // Don't fetch if ID is not available yet

    const fetchPurchaseOrder = async () => {
      setIsLoading(true);
      setApiError(null);
      try {
        const response = await api.getPurchaseOrder(Number(id));
        if (response.success && response.data) {
          setPo(response.data as unknown as PurchaseOrderDetail);
        } else {
          if (response.message?.includes('token')) router.push('/login');
          throw new Error(response.message || 'Bon de commande non trouvé');
        }
      } catch (error: any) {
        console.error('Erreur chargement PO:', error);
        setApiError(`Impossible de charger le bon de commande: ${error.message}`);
      } finally {
        setIsLoading(false);
      }
    };

    fetchPurchaseOrder();
  }, [id, router]);

  if (isLoading) {
    return <p className="p-6 text-center text-slate-500">Chargement du bon de commande...</p>;
  }

  if (apiError) {
    return (
      <div className="p-6">
        <div className="max-w-xl mx-auto p-4 bg-red-100 text-red-700 border border-red-200 rounded-lg">
          <strong>Erreur:</strong> {apiError}
          <div className="mt-4">
            <Link href="/purchasing" className="text-blue-600 hover:text-blue-800 text-sm font-medium">
              ← Retour à la Liste
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (!po) {
    return <p className="p-6 text-center text-slate-500">Bon de commande non trouvé.</p>;
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 min-h-screen">
      <div className="max-w-4xl mx-auto">
        {/* En-tête */}
        <div className="mb-6 flex flex-wrap justify-between items-center gap-4">
          <div>
            <h1 className="text-3xl font-bold text-blue-800">Détails du Bon de Commande</h1>
            <p className="font-mono text-slate-500">{po.ponumber}</p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={handlePrintBC}
              className="bg-purple-600 text-white px-4 py-2 rounded-lg shadow hover:bg-purple-700 flex items-center gap-2 text-sm"
            >
              🖨️ Imprimer BC
            </button>
            <Link href="/purchasing" className="bg-white border border-slate-300 text-slate-700 px-4 py-2 rounded-lg hover:bg-slate-50 text-sm font-medium">
              ← Retour
            </Link>
          </div>
        </div>

        {/* Section Infos Générales */}
        <div className="glassy-container p-6 mb-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-4 text-sm">
            <div>
              <label className="block text-slate-500 font-medium">Statut</label>
              <span className={`px-2.5 py-1 rounded-full font-semibold text-xs inline-block mt-1 ${getStatusBadge(po.status)}`}>
                {po.status}
              </span>
            </div>
            <div>
              <label className="block text-slate-500 font-medium">Usine (Fournisseur)</label>
              <p className="text-slate-800 font-semibold">{po.factoryname}</p>
            </div>
            <div>
              <label className="block text-slate-500 font-medium">Entrepôt de Livraison</label>
              <p className="text-slate-800 font-semibold">{po.warehousename}</p>
            </div>
            <div>
              <label className="block text-slate-500 font-medium">Type de Stock</label>
              <p className="text-slate-800 font-semibold">{po.ownershiptype === 'OWNED' ? 'Propre' : 'Consignation'}</p>
            </div>
            <div>
              <label className="block text-slate-500 font-medium">Date de Commande</label>
              <p className="text-slate-800 font-semibold">{formatDate(po.orderdate)}</p>
            </div>
            <div>
              <label className="block text-slate-500 font-medium">Date de Livraison Attendue</label>
              <p className="text-slate-800 font-semibold">{formatDate(po.expecteddeliverydate)}</p>
            </div>
            {po.notes && (
              <div className="col-span-2 md:col-span-4">
                <label className="block text-slate-500 font-medium">Notes</label>
                <p className="text-slate-800 bg-slate-50 p-2 rounded-md whitespace-pre-wrap">{po.notes}</p>
              </div>
            )}
          </div>
        </div>

        {/* Section Articles */}
        <div className="glassy-container overflow-hidden">
          <h2 className="text-xl font-semibold text-slate-700 p-5 border-b border-slate-200">Articles Commandés</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left text-slate-600">
              <thead className="text-xs text-slate-700 uppercase bg-slate-100 font-semibold">
                <tr>
                  <th scope="col" className="px-4 py-3">Produit</th>
                  <th scope="col" className="px-3 py-3 text-center">Pal</th>
                  <th scope="col" className="px-3 py-3 text-center">Ctn</th>
                  <th scope="col" className="px-3 py-3 text-right">Quantité</th>
                  <th scope="col" className="px-3 py-3">Unité</th>
                  <th scope="col" className="px-4 py-3 text-right">Prix Unitaire</th>
                  <th scope="col" className="px-4 py-3 text-right">Total Ligne</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {po.items.map((item) => {
                  const qty = Number(item.quantity) || 0;
                  let piecesPerCarton = Number(item.qteparcolis) || 0;
                  const cartonsPerPalette = Number(item.qtecolisparpalette) || 0;

                  // Smart Packaging Detection (Match Edit Page Logic)
                  const sqmPerPiece = parseSqmPerPiece(item.productname);
                  if (sqmPerPiece > 0 && piecesPerCarton > 0 && piecesPerCarton % 1 !== 0) {
                    const calculatedPieces = Math.round(piecesPerCarton / sqmPerPiece);
                    if (Math.abs(calculatedPieces * sqmPerPiece - piecesPerCarton) < 0.05) {
                      piecesPerCarton = calculatedPieces;
                    }
                  }

                  // Calculate pieces, cartons, palettes correctly based on unit
                  let pieces = qty;
                  // sqmPerPiece already defined above

                  if (item.unitcode === 'SQM' && sqmPerPiece > 0) {
                    pieces = qty / sqmPerPiece;
                  } else if (item.unitcode === 'CARTON' || item.unitcode === 'CRT') {
                    pieces = qty * piecesPerCarton;
                  }

                  // Calculate cartons from pieces
                  const cartonsNum = piecesPerCarton > 0 ? pieces / piecesPerCarton : 0;
                  const cartonsDisplay = (piecesPerCarton > 0 && cartonsNum > 0) ? parseFloat(cartonsNum.toFixed(2)) : '-';

                  // Calculate palettes from cartons
                  const palettesNum = cartonsPerPalette > 0 ? cartonsNum / cartonsPerPalette : 0;
                  const palettesDisplay = (cartonsPerPalette > 0 && cartonsNum > 0) ? parseFloat(palettesNum.toFixed(2)) : '-';

                  return (
                    <tr key={item.poitemid} className="hover:bg-blue-50/50">
                      <td className="px-4 py-3">
                        <div className="font-medium text-slate-900">{item.productname}</div>
                        <div className="text-xs text-slate-500 font-mono">{item.productcode}</div>
                        {(piecesPerCarton > 0 || cartonsPerPalette > 0) && (
                          <div className="text-[10px] text-slate-400 mt-0.5">
                            {piecesPerCarton > 0 && <span>{piecesPerCarton} pcs/ctn</span>}
                            {piecesPerCarton > 0 && cartonsPerPalette > 0 && <span> • </span>}
                            {cartonsPerPalette > 0 && <span>{cartonsPerPalette} ctn/pal</span>}
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-3 text-center text-sm">{palettesDisplay}</td>
                      <td className="px-3 py-3 text-center text-sm">{cartonsDisplay}</td>
                      <td className="px-3 py-3 text-right">{qty.toFixed(2)}</td>
                      <td className="px-3 py-3">{item.unitcode}</td>
                      <td className="px-4 py-3 text-right">{formatCurrencyDZD(item.unitprice)}</td>
                      <td className="px-4 py-3 text-right font-medium">{formatCurrencyDZD(item.linetotal)}</td>
                    </tr>
                  );
                })}
              </tbody>
              {/* Pied de tableau avec le total */}
              <tfoot className="bg-slate-50 border-t-2 border-slate-300">
                <tr>
                  <td colSpan={6} className="px-6 py-3 text-right font-bold text-slate-700 text-base">
                    Total
                  </td>
                  <td className="px-6 py-3 text-right font-bold text-blue-800 text-base">
                    {formatCurrencyDZD(po.totalamount)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

        {/* Hidden BC Print Component */}
        <div style={{ display: 'none' }}>
          <StandardDocument
            ref={bcPrintRef}
            type="PURCHASE_ORDER"
            data={bcData}
          />
        </div>

      </div>
    </div>
  );
}