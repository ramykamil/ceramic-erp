'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import api from '@/lib/api';
import Link from 'next/link';
import { useRouter, useParams } from 'next/navigation';
import { useReactToPrint } from 'react-to-print';
import { StandardDocument, DocumentData } from '@/components/print/StandardDocument';

// Interface pour les articles du PO (détails)
interface POItemDetails {
  poitemid: number;
  productid: number;
  unitid: number;
  productcode: string;
  productname: string;
  unitcode: string;
  brandname?: string;  // Brand from product
  qteparcolis?: number;  // Pieces per carton
  qtecolisparpalette?: number;  // Cartons per palette
  quantity: number; // Qté commandée
  receivedquantity: number; // Qté déjà reçue
  unitprice?: number;
  linetotal?: number;
}

// Interface pour les détails complets du PO
interface PurchaseOrderDetails {
  purchaseorderid: number;
  ponumber: string;
  factoryid: number;
  factoryname: string;
  warehouseid: number;
  warehousename: string;
  orderdate: string;
  status: string;
  ownershiptype: 'OWNED' | 'CONSIGNMENT';
  notes: string | null;
  totalamount: number;
  deliverycost: number;
  items: POItemDetails[];
}

// Interface pour la saisie de réception
interface ReceiptItemInput {
  poItemId: number;
  productId: number;
  unitId: number;
  quantityReceived: number | ''; // Permet une chaîne vide pour la saisie
  quantityRemaining: number; // Pour l'affichage
}

// Interface pour les données envoyées à l'API pour créer un bon de réception
interface GoodsReceiptItem {
  poItemId: number;
  productId: number;
  unitId: number;
  quantityReceived: number;
  ownershipType: 'OWNED' | 'CONSIGNMENT';
  factoryId: number;
}

interface GoodsReceiptData {
  purchaseOrderId: number;
  warehouseId: number;
  factoryId: number;
  ownershipType: 'OWNED' | 'CONSIGNMENT';
  receiptDate: string;
  notes: string | undefined;
  items: GoodsReceiptItem[];
}

// Interface pour la facture
interface FactureItem {
  productCode: string;
  productName: string;
  palettes: number;
  cartons: number;
  quantity: number;
  unitCode: string;
  unitPrice: number;
  lineTotal: number;
}

// Fonction pour formater la devise en DZD
const formatCurrencyDZD = (amount: number | null | undefined): string => {
  const numericAmount = Number(amount);
  if (isNaN(numericAmount)) {
    return new Intl.NumberFormat('fr-DZ', { style: 'currency', currency: 'DZD' }).format(0);
  }
  return new Intl.NumberFormat('fr-DZ', { style: 'currency', currency: 'DZD' }).format(numericAmount);
};

// Fonction pour obtenir les classes de badge de statut
const getStatusBadge = (status: string): string => {
  const statusClasses = {
    PENDING: 'bg-yellow-100 text-yellow-800 border border-yellow-200',
    APPROVED: 'bg-blue-100 text-blue-800 border border-blue-200',
    RECEIVED: 'bg-green-100 text-green-800 border border-green-200',
    PARTIAL: 'bg-purple-100 text-purple-800 border border-purple-200',
    CANCELLED: 'bg-red-100 text-red-800 border border-red-200',
  };
  return statusClasses[status as keyof typeof statusClasses] || 'bg-gray-100 text-gray-800 border border-gray-200';
};

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

// --- Composant Page ---
export default function ReceivePurchaseOrderPage() {
  const [po, setPo] = useState<PurchaseOrderDetails | null>(null);
  const [itemInputs, setItemInputs] = useState<ReceiptItemInput[]>([]);
  const [receiptDate, setReceiptDate] = useState(new Date().toISOString().split('T')[0]);
  const [receiptNotes, setReceiptNotes] = useState('');

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);

  const router = useRouter();
  const params = useParams();
  const poId = parseInt(params.id as string);

  // Print refs
  const bcPrintRef = useRef<HTMLDivElement>(null);
  const facturePrintRef = useRef<HTMLDivElement>(null);

  // Facture modal state
  const [isFactureModalOpen, setIsFactureModalOpen] = useState(false);
  const [factureItems, setFactureItems] = useState<FactureItem[]>([]);
  const [factureDiscount, setFactureDiscount] = useState(0);
  const [factureTVA, setFactureTVA] = useState(false);
  const [factureNumber, setFactureNumber] = useState('');

  // Print handlers
  const handlePrintBC = useReactToPrint({
    content: () => bcPrintRef.current,
    documentTitle: po ? `BC_${po.ponumber}` : 'BonCommande',
  });

  const handlePrintFacture = useReactToPrint({
    content: () => facturePrintRef.current,
    documentTitle: factureNumber || 'Facture',
  });

  useEffect(() => {
    if (!poId) return;

    const fetchPO = async () => {
      setIsLoading(true);
      setApiError(null);
      try {
        const response = await api.getPurchaseOrder(poId);
        if (response.success && response.data) {
          const poData = (response.data as unknown) as PurchaseOrderDetails;
          setPo(poData);
          // Initialise le formulaire de réception basé sur les articles du PO
          const inputs: ReceiptItemInput[] = poData.items.map(item => {
            const qtyOrdered = Number(item.quantity) || 0;
            const qtyReceived = Number(item.receivedquantity) || 0;
            const qtyRemaining = qtyOrdered - qtyReceived;

            return {
              poItemId: item.poitemid,
              productId: item.productid,
              unitId: item.unitid,
              quantityReceived: '', // Par défaut vide
              quantityRemaining: qtyRemaining > 0 ? qtyRemaining : 0, // Ne pas afficher négatif
            };
          });
          setItemInputs(inputs);
        } else {
          if (response.message?.includes('token')) router.push('/login');
          throw new Error(response.message || 'Bon de commande non trouvé');
        }
      } catch (error: any) {
        console.error('Erreur chargement PO:', error);
        setApiError(error.message);
      } finally {
        setIsLoading(false);
      }
    };
    fetchPO();
  }, [poId, router]);

  const handleQuantityChange = (poItemId: number, value: string) => {
    const qty = parseFloat(value);
    setItemInputs(itemInputs.map(item => {
      if (item.poItemId === poItemId) {
        // Validation : ne pas autoriser plus que ce qui reste
        if (!isNaN(qty) && qty > item.quantityRemaining) {
          alert(`Quantité invalide. Il ne reste que ${item.quantityRemaining} à réceptionner.`);
          return { ...item, quantityReceived: item.quantityRemaining };
        }
        return { ...item, quantityReceived: value === '' ? '' : qty };
      }
      return item;
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!po) return;

    // Filtre les articles où une quantité a été saisie
    const itemsToReceive = itemInputs
      .filter(item => Number(item.quantityReceived) > 0)
      .map(item => {
        const qtyReceived = Number(item.quantityReceived);
        // Find the corresponding PO item to get packaging info
        const poItem = po.items.find(i => i.poitemid === item.poItemId);
        let piecesPerCarton = Number(poItem?.qteparcolis) || 0;
        const cartonsPerPalette = Number(poItem?.qtecolisparpalette) || 0;

        // Smart Packaging Detection (Match Edit/View Page Logic)
        const sqmPerPiece = parseSqmPerPiece(poItem?.productname || '');
        if (sqmPerPiece > 0 && piecesPerCarton > 0 && piecesPerCarton % 1 !== 0) {
          const calculatedPieces = Math.round(piecesPerCarton / sqmPerPiece);
          if (Math.abs(calculatedPieces * sqmPerPiece - piecesPerCarton) < 0.05) {
            piecesPerCarton = calculatedPieces;
          }
        }

        // Convert quantity to Pieces first
        let pieces = qtyReceived;

        if (poItem?.unitcode === 'SQM' && sqmPerPiece > 0) {
          pieces = qtyReceived / sqmPerPiece;
        } else if (poItem?.unitcode === 'CARTON' || poItem?.unitcode === 'CRT') {
          pieces = qtyReceived * piecesPerCarton;
        }

        const colisCount = piecesPerCarton > 0 ? parseFloat((pieces / piecesPerCarton).toFixed(2)) : 0;
        const palletCount = cartonsPerPalette > 0 ? parseFloat((colisCount / cartonsPerPalette).toFixed(2)) : 0;

        return {
          poItemId: item.poItemId,
          productId: item.productId,
          unitId: item.unitId,
          quantityReceived: qtyReceived,
          palletCount,
          colisCount,
          // Ajout des infos nécessaires pour la transaction d'inventaire
          ownershipType: po.ownershiptype,
          factoryId: po.factoryid,
        };
      });

    if (itemsToReceive.length === 0) {
      alert("Veuillez saisir une quantité à réceptionner pour au moins un article.");
      return;
    }

    setIsSaving(true);
    setApiError(null);

    const receiptData: GoodsReceiptData = {
      purchaseOrderId: po.purchaseorderid,
      warehouseId: po.warehouseid,
      factoryId: po.factoryid,
      ownershipType: po.ownershiptype,
      receiptDate: receiptDate,
      notes: receiptNotes || undefined,
      items: itemsToReceive,
    };

    try {
      const response = await api.createGoodsReceipt(receiptData);
      if (response.success && response.data) {
        const responseData = response.data as { receiptNumber: string };
        alert(`Bon de réception ${responseData.receiptNumber} enregistré avec succès ! L'inventaire a été mis à jour.`);
        router.push('/purchasing'); // Retour à la liste
      } else {
        if (response.message?.includes('token')) router.push('/login');
        throw new Error(response.message || 'La création a échoué');
      }
    } catch (error: any) {
      console.error("Erreur enregistrement BR:", error);
      setApiError(`Erreur: ${error.message}`);
      alert(`Erreur: ${error.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  // Open facture modal
  const openFactureModal = () => {
    if (!po) return;

    const now = new Date();
    const factureNum = `FAC-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}-${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}${String(now.getSeconds()).padStart(2, '0')}`;
    setFactureNumber(factureNum);

    // Use PO items for facture with palettes/cartons
    const items: FactureItem[] = po.items.map(item => ({
      productCode: item.productcode,
      productName: item.productname,
      palettes: 0,
      cartons: 0,
      quantity: item.quantity,
      unitCode: item.unitcode,
      unitPrice: 0,
      lineTotal: 0,
    }));
    setFactureItems(items);
    setFactureDiscount(0);
    setFactureTVA(false);
    setIsFactureModalOpen(true);
  };

  // Update facture item
  const updateFactureItem = (index: number, field: string, value: number) => {
    const newItems = [...factureItems];
    const item = newItems[index];
    (item as any)[field] = value;
    item.lineTotal = item.quantity * item.unitPrice;
    setFactureItems(newItems);
  };

  // Calculate facture totals
  const factureSubtotal = factureItems.reduce((sum, item) => sum + item.lineTotal, 0);
  const factureTVAAmount = factureTVA ? factureSubtotal * 0.19 : 0;
  const factureTotal = factureSubtotal + factureTVAAmount - factureDiscount;

  // BC print data - Calculate packaging from product info
  const bcData: DocumentData = useMemo(() => {
    if (!po) return { number: '', date: '', items: [] };
    return {
      number: po.ponumber,
      date: po.orderdate,
      clientName: 'STOCK GROS',  // Default for purchase orders
      deliveryCost: po.deliverycost,
      items: po.items.map(item => {
        const qty = Number(item.quantity) || 0;
        const piecesPerCarton = Number(item.qteparcolis) || 0;
        const cartonsPerPalette = Number(item.qtecolisparpalette) || 0;

        // Calculate cartons (colis) from quantity
        const boxCount = piecesPerCarton > 0 ? parseFloat((qty / piecesPerCarton).toFixed(2)) : 0;
        // Calculate palettes from cartons
        const palletCount = cartonsPerPalette > 0 ? parseFloat((boxCount / cartonsPerPalette).toFixed(2)) : 0;

        return {
          productCode: item.productcode,
          productName: item.productname,
          brandName: item.brandname || '',  // Brand from product
          quantity: qty,
          unitCode: item.unitcode,
          unitPrice: Number(item.unitprice) || 0,
          lineTotal: Number(item.linetotal) || 0,
          palletCount,
          boxCount,
        };
      }),
    };
  }, [po]);

  // Facture print data
  const factureData: DocumentData = useMemo(() => {
    if (!po) return { number: '', date: '', items: [] };
    return {
      number: factureNumber,
      date: new Date().toISOString(),
      clientName: po.factoryname,
      items: factureItems.map(item => ({
        productCode: item.productCode,
        productName: item.productName,
        brandName: po.factoryname,
        quantity: item.quantity,
        unitCode: item.unitCode,
        unitPrice: item.unitPrice,
        lineTotal: item.lineTotal,
        palletCount: item.palettes,
        boxCount: item.cartons,
      })),
      totalHT: factureSubtotal,
      totalTVA: factureTVAAmount,
      discount: factureDiscount,
    };
  }, [po, factureNumber, factureItems, factureSubtotal, factureTVAAmount, factureDiscount]);


  if (isLoading) {
    return <p className="p-8 text-center text-slate-500">Chargement du bon de commande...</p>;
  }
  if (apiError) {
    return (
      <div className="p-8">
        <div className="max-w-xl mx-auto p-4 bg-red-100 text-red-700 border border-red-200 rounded-lg">
          <strong>Erreur:</strong> {apiError}
          <div className="mt-4">
            <Link href="/purchasing" className="text-blue-600 hover:text-blue-800 text-sm font-medium">
              ← Retour à la liste
            </Link>
          </div>
        </div>
      </div>
    );
  }
  if (!po) {
    return <p className="p-8 text-center text-slate-500">Bon de commande non trouvé.</p>;
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 min-h-screen">
      <div className="max-w-4xl mx-auto">
        {/* En-tête */}
        <div className="mb-6 flex justify-between items-start">
          <div>
            <h1 className="text-3xl font-bold text-blue-800">Réceptionner Bon de Commande</h1>
            <p className="font-mono text-slate-500">{po.ponumber}</p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={openFactureModal}
              className="bg-green-600 text-white px-4 py-2 rounded-lg shadow hover:bg-green-700 flex items-center gap-2 text-sm"
            >
              📄 Générer Facture
            </button>
            <button
              onClick={handlePrintBC}
              className="bg-purple-600 text-white px-4 py-2 rounded-lg shadow hover:bg-purple-700 flex items-center gap-2 text-sm"
            >
              🖨️ Imprimer BC
            </button>
            <Link href="/purchasing" className="bg-white border border-slate-300 text-slate-700 px-4 py-2 rounded-lg hover:bg-slate-50 text-sm">
              Retour
            </Link>
          </div>
        </div>

        {/* Infos PO */}
        <div className="glassy-container p-6 mb-6 text-sm">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="flex items-center gap-4">
              <span className="text-xs text-slate-500 font-medium">Fournisseur:</span>
              <span className="font-bold text-slate-800 text-base">
                {po.factoryname || 'Fournisseur Inconnu'}
              </span>
            </div>
            <div className="flex items-center gap-4">
              <span className="text-xs text-slate-500 font-medium">Date Commande:</span>
              <span className="font-bold text-slate-800">
                {new Date(po.orderdate).toLocaleDateString('fr-DZ')}
              </span>
            </div>
            <div className="flex items-center gap-4">
              <span className="text-xs text-slate-500 font-medium">Statut:</span>
              <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${getStatusBadge(po.status)}`}>
                {po.status}
              </span>
            </div>
            <div className="flex flex-col gap-1 items-end">
              <div className="flex items-center gap-4">
                <span className="text-xs text-slate-500 font-medium">Transport:</span>
                <span className="font-bold text-slate-700">
                  {formatCurrencyDZD(po.deliverycost)}
                </span>
              </div>
              <div className="flex items-center gap-4">
                <span className="text-xs text-slate-500 font-medium">Total:</span>
                <span className="font-bold text-green-700 text-lg">
                  {formatCurrencyDZD(po.totalamount)}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Formulaire de Réception */}
        <form onSubmit={handleSubmit}>
          {/* Tableau des Articles */}
          <div className="glassy-container overflow-hidden mb-6">
            <h2 className="text-xl font-semibold text-slate-700 p-5">Articles à Réceptionner</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left text-slate-600">
                <thead className="text-xs text-slate-700 uppercase bg-slate-100 font-semibold">
                  <tr>
                    <th scope="col" className="px-4 py-3">Produit</th>
                    <th scope="col" className="px-2 py-3 text-center">Pal</th>
                    <th scope="col" className="px-2 py-3 text-center">Ctn</th>
                    <th scope="col" className="px-4 py-3 text-right">Commandé</th>
                    <th scope="col" className="px-4 py-3 text-right">Déjà Reçu</th>
                    <th scope="col" className="px-4 py-3 text-right">Restant</th>
                    <th scope="col" className="px-4 py-3 text-center w-1/5">Qté à Réceptionner *</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {po.items.map((item, index) => {
                    const itemInput = itemInputs.find(i => i.poItemId === item.poitemid);
                    const qtyRemaining = itemInput?.quantityRemaining || 0;
                    const qty = Number(item.quantity) || 0;
                    const isFullyReceived = qtyRemaining <= 0;

                    let piecesPerCarton = Number(item.qteparcolis) || 0;
                    const cartonsPerPalette = Number(item.qtecolisparpalette) || 0;

                    // Smart Packaging Detection (Match Edit/View Page Logic)
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

                    // Calculate cartons and palettes
                    const cartonsNum = piecesPerCarton > 0 ? pieces / piecesPerCarton : 0;
                    const cartons = (piecesPerCarton > 0 && cartonsNum > 0) ? cartonsNum.toFixed(2) : '-';
                    const palettes = (cartonsPerPalette > 0 && cartonsNum > 0) ? (cartonsNum / cartonsPerPalette).toFixed(2) : '-';

                    return (
                      <tr key={item.poitemid} className={isFullyReceived ? 'bg-green-50/50 opacity-60' : 'hover:bg-blue-50/50'}>
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
                        <td className="px-2 py-3 text-center text-sm">{palettes}</td>
                        <td className="px-2 py-3 text-center text-sm">{cartons}</td>
                        <td className="px-4 py-3 text-right">{Number(item.quantity)} {item.unitcode}</td>
                        <td className="px-4 py-3 text-right">{Number(item.receivedquantity)} {item.unitcode}</td>
                        <td className="px-4 py-3 text-right font-medium">{qtyRemaining} {item.unitcode}</td>
                        <td className="px-4 py-3 text-center">
                          {isFullyReceived ? (
                            <span className="text-sm font-medium text-green-600">Complet</span>
                          ) : (
                            <input
                              type="number"
                              value={itemInput?.quantityReceived || ''}
                              onChange={(e) => handleQuantityChange(item.poitemid, e.target.value)}
                              min="0"
                              max={qtyRemaining}
                              step="any"
                              className="w-full p-2 border border-slate-300 rounded-lg text-right"
                              placeholder="0"
                            />
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Détails Réception & Soumission */}
          <div className="glassy-container p-6 flex flex-col md:flex-row justify-between items-start gap-6">
            <div className="w-full md:w-1/2 space-y-4">
              <div>
                <label htmlFor="receiptDate" className="block text-sm font-medium text-slate-700 mb-1">Date de Réception *</label>
                <input type="date" id="receiptDate" value={receiptDate} onChange={(e) => setReceiptDate(e.target.value)} required
                  className="w-full p-2 border border-slate-300 rounded-lg bg-white bg-opacity-80" />
              </div>
              <div>
                <label htmlFor="receiptNotes" className="block text-sm font-medium text-slate-700 mb-1">Notes (N° BL, etc.)</label>
                <textarea id="receiptNotes" value={receiptNotes} onChange={(e) => setReceiptNotes(e.target.value)} rows={3}
                  className="w-full p-2 border border-slate-300 rounded-lg bg-white bg-opacity-80" />
              </div>
            </div>
            <div className="w-full md:w-1/2 flex flex-col items-end gap-4">
              {/* TODO: Afficher un résumé des totaux réceptionnés si nécessaire */}
              <div className="flex gap-4">
                <Link href="/purchasing" className="bg-slate-200 text-slate-700 hover:bg-slate-300 px-5 py-2 rounded-lg font-medium text-sm transition">
                  Annuler
                </Link>
                <button type="submit" disabled={isSaving || isLoading}
                  className="bg-green-600 text-white hover:bg-green-700 px-5 py-2 rounded-lg font-medium text-sm transition disabled:opacity-50 inline-flex items-center gap-2">
                  <svg className="w-5 h-5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor"><path d="M10.75 4.75a.75.75 0 00-1.5 0v4.5h-4.5a.75.75 0 000 1.5h4.5v4.5a.75.75 0 001.5 0v-4.5h4.5a.75.75 0 000-1.5h-4.5v-4.5z" /><path fillRule="evenodd" d="M3 10a.75.75 0 01.75-.75h12.5a.75.75 0 010 1.5H3.75A.75.75 0 013 10z" clipRule="evenodd" /></svg>
                  {isSaving ? 'Enregistrement...' : 'Enregistrer la Réception'}
                </button>
              </div>
            </div>
          </div>
        </form>

        {/* Hidden BC Print Component */}
        <div style={{ display: 'none' }}>
          <StandardDocument
            ref={bcPrintRef}
            type="PURCHASE_ORDER"
            data={bcData}
          />
        </div>

        {/* Hidden Facture Print Component */}
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
              {/* Supplier Info */}
              <div className="bg-slate-50 p-3 rounded-lg">
                <p className="text-sm text-slate-500">Fournisseur</p>
                <p className="font-bold">{po.factoryname}</p>
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
                        </td>
                        <td className="px-1 py-2">
                          <input
                            type="number"
                            min="0"
                            value={item.palettes}
                            onChange={(e) => updateFactureItem(idx, 'palettes', Number(e.target.value))}
                            className="w-full p-1 border border-slate-200 rounded text-center text-sm"
                          />
                        </td>
                        <td className="px-1 py-2">
                          <input
                            type="number"
                            min="0"
                            value={item.cartons}
                            onChange={(e) => updateFactureItem(idx, 'cartons', Number(e.target.value))}
                            className="w-full p-1 border border-slate-200 rounded text-center text-sm"
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
                          {formatCurrencyDZD(item.lineTotal)}
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
                        {formatCurrencyDZD(factureSubtotal)}
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
                    <span className="font-mono">{formatCurrencyDZD(factureSubtotal)}</span>
                  </div>
                  {factureTVA && (
                    <div className="flex justify-between text-slate-600">
                      <span>TVA (19%)</span>
                      <span className="font-mono">{formatCurrencyDZD(factureTVAAmount)}</span>
                    </div>
                  )}
                  {factureDiscount > 0 && (
                    <div className="flex justify-between text-red-600">
                      <span>Remise</span>
                      <span className="font-mono">-{formatCurrencyDZD(factureDiscount)}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-lg font-bold pt-2 border-t">
                    <span>TOTAL TTC</span>
                    <span className="font-mono text-green-600">{formatCurrencyDZD(factureTotal)}</span>
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