'use client';

import { useState, useEffect, useRef } from 'react';
import api from '@/lib/api';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useReactToPrint } from 'react-to-print';
import { StandardDocument, DocumentData } from '@/components/print/StandardDocument';

interface QuickStockItem {
    itemid: number;
    itemname: string;
    quantity: number;
    unitprice: number;
    soldquantity: number;
    createdat: string;
    sqmpercarton?: number;
    cartonsperpalette?: number;
}

const formatCurrency = (amount: number) =>
    new Intl.NumberFormat('fr-DZ', { style: 'currency', currency: 'DZD' }).format(amount);

// Default packaging values for tiles
const DEFAULT_SQM_PER_CARTON = 1.44;
const DEFAULT_CTN_PER_PALETTE = 36;

export default function QuickStockPage() {
    const router = useRouter();
    const [items, setItems] = useState<QuickStockItem[]>([]);
    const [loading, setLoading] = useState(true);

    // Add form state with packaging
    const [newItemName, setNewItemName] = useState('');
    const [newPalettes, setNewPalettes] = useState(0);
    const [newCartons, setNewCartons] = useState(0);
    const [newQuantity, setNewQuantity] = useState(0);
    const [newUnitPrice, setNewUnitPrice] = useState(0);
    const [newSqmPerCarton, setNewSqmPerCarton] = useState(DEFAULT_SQM_PER_CARTON);
    const [newCtnPerPalette, setNewCtnPerPalette] = useState(DEFAULT_CTN_PER_PALETTE);
    const [adding, setAdding] = useState(false);

    // Sell modal state
    const [sellModalOpen, setSellModalOpen] = useState(false);
    const [selectedItem, setSelectedItem] = useState<QuickStockItem | null>(null);
    const [sellPalettes, setSellPalettes] = useState(0);
    const [sellCartons, setSellCartons] = useState(0);
    const [sellQuantity, setSellQuantity] = useState(0);
    const [customerName, setCustomerName] = useState('');
    const [customerPhone, setCustomerPhone] = useState('');
    const [customerAddress, setCustomerAddress] = useState('');
    const [selling, setSelling] = useState(false);
    const [saleCompleted, setSaleCompleted] = useState(false);
    const [saleNumber, setSaleNumber] = useState('');
    const [finalPrintData, setFinalPrintData] = useState<DocumentData | null>(null);

    // Print refs
    const blPrintRef = useRef<HTMLDivElement>(null);
    const bcPrintRef = useRef<HTMLDivElement>(null);

    const handlePrintBL = useReactToPrint({
        content: () => blPrintRef.current,
        documentTitle: saleNumber ? `BL_${saleNumber}` : 'BL_QuickStock',
    });

    const handlePrintBC = useReactToPrint({
        content: () => bcPrintRef.current,
        documentTitle: saleNumber ? `BC_${saleNumber}` : 'BC_QuickStock',
    });

    useEffect(() => {
        loadItems();
    }, []);

    const loadItems = async () => {
        setLoading(true);
        try {
            const res = await api.getQuickStockItems();
            if (res.success) {
                setItems(res.data as QuickStockItem[]);
            }
        } catch (error) {
            console.error('Error loading items:', error);
        } finally {
            setLoading(false);
        }
    };

    // Auto-calculate when NEW form packaging changes
    const handleNewPalettesChange = (val: number) => {
        setNewPalettes(val);
        const cartons = val * newCtnPerPalette;
        setNewCartons(cartons);
        setNewQuantity(cartons * newSqmPerCarton);
    };

    const handleNewCartonsChange = (val: number) => {
        setNewCartons(val);
        setNewPalettes(Math.floor(val / newCtnPerPalette));
        setNewQuantity(val * newSqmPerCarton);
    };

    const handleNewQuantityChange = (val: number) => {
        setNewQuantity(val);
        if (newSqmPerCarton > 0) {
            const cartons = Math.floor(val / newSqmPerCarton);
            setNewCartons(cartons);
            setNewPalettes(Math.floor(cartons / newCtnPerPalette));
        }
    };

    // Auto-calculate when SELL modal packaging changes
    const handleSellPalettesChange = (val: number) => {
        setSellPalettes(val);
        const sqmPerCarton = selectedItem?.sqmpercarton || DEFAULT_SQM_PER_CARTON;
        const ctnPerPalette = selectedItem?.cartonsperpalette || DEFAULT_CTN_PER_PALETTE;
        const cartons = val * ctnPerPalette;
        setSellCartons(cartons);
        setSellQuantity(cartons * sqmPerCarton);
    };

    const handleSellCartonsChange = (val: number) => {
        setSellCartons(val);
        const sqmPerCarton = selectedItem?.sqmpercarton || DEFAULT_SQM_PER_CARTON;
        const ctnPerPalette = selectedItem?.cartonsperpalette || DEFAULT_CTN_PER_PALETTE;
        setSellPalettes(Math.floor(val / ctnPerPalette));
        setSellQuantity(val * sqmPerCarton);
    };

    const handleSellQuantityChange = (val: number) => {
        setSellQuantity(val);
        const sqmPerCarton = selectedItem?.sqmpercarton || DEFAULT_SQM_PER_CARTON;
        const ctnPerPalette = selectedItem?.cartonsperpalette || DEFAULT_CTN_PER_PALETTE;
        if (sqmPerCarton > 0) {
            const cartons = Math.floor(val / sqmPerCarton);
            setSellCartons(cartons);
            setSellPalettes(Math.floor(cartons / ctnPerPalette));
        }
    };

    const handleAddItem = async () => {
        if (!newItemName.trim()) {
            alert('Veuillez saisir le nom du produit');
            return;
        }

        setAdding(true);
        try {
            const res = await api.addQuickStockItem({
                itemName: newItemName,
                quantity: newQuantity,
                unitPrice: newUnitPrice
            });
            if (res.success) {
                setNewItemName('');
                setNewPalettes(0);
                setNewCartons(0);
                setNewQuantity(0);
                setNewUnitPrice(0);
                loadItems();
            } else {
                alert(res.message || 'Erreur lors de l\'ajout');
            }
        } catch (error: any) {
            alert(error.message);
        } finally {
            setAdding(false);
        }
    };

    const handleDelete = async (id: number) => {
        if (!confirm('Supprimer cet article ?')) return;

        try {
            await api.deleteQuickStockItem(id);
            loadItems();
        } catch (error: any) {
            alert(error.message);
        }
    };

    const openSellModal = (item: QuickStockItem) => {
        setSelectedItem(item);
        setSellPalettes(0);
        setSellCartons(0);
        setSellQuantity(0);
        setCustomerName('');
        setCustomerPhone('');
        setCustomerAddress('');
        setSaleCompleted(false);
        setSaleNumber('');
        setSellModalOpen(true);
    };

    const handleSell = async () => {
        if (!selectedItem) return;
        if (sellQuantity <= 0) {
            alert('Quantité invalide');
            return;
        }

        const available = Number(selectedItem.quantity) - Number(selectedItem.soldquantity);
        if (sellQuantity > available) {
            alert(`Stock insuffisant. Disponible: ${available.toFixed(2)}`);
            return;
        }

        setSelling(true);
        try {
            const res = await api.sellQuickStockItem(selectedItem.itemid, {
                quantitySold: sellQuantity,
                customerName: customerName || undefined,
                customerPhone: customerPhone || undefined
            });
            if (res.success) {
                // Generate sale number
                const now = new Date();
                const saleNum = `QS-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}-${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}${String(now.getSeconds()).padStart(2, '0')}`;
                setSaleNumber(saleNum);

                // Store final print data with sold quantities
                setFinalPrintData({
                    number: saleNum,
                    date: new Date().toISOString(),
                    clientName: customerName || 'Client Comptant',
                    clientPhone: customerPhone,
                    clientAddress: customerAddress,
                    items: [{
                        productCode: `QS-${selectedItem.itemid}`,
                        productName: selectedItem.itemname,
                        palletCount: sellPalettes,
                        boxCount: sellCartons,
                        quantity: sellQuantity,
                        unitCode: 'M²',
                        unitPrice: Number(selectedItem.unitprice),
                        lineTotal: sellQuantity * Number(selectedItem.unitprice),
                    }],
                    totalHT: sellQuantity * Number(selectedItem.unitprice),
                });

                setSaleCompleted(true);
                loadItems();
            } else {
                alert(res.message || 'Erreur lors de la vente');
            }
        } catch (error: any) {
            alert(error.message);
        } finally {
            setSelling(false);
        }
    };

    // Build print data for BL/BC
    const getPrintData = (): DocumentData => {
        if (!selectedItem) return { number: '', date: '', items: [] };

        const sqmPerCarton = selectedItem.sqmpercarton || DEFAULT_SQM_PER_CARTON;
        const ctnPerPalette = selectedItem.cartonsperpalette || DEFAULT_CTN_PER_PALETTE;

        return {
            number: saleNumber,
            date: new Date().toISOString(),
            clientName: customerName || 'Client Comptant',
            clientPhone: customerPhone,
            clientAddress: customerAddress,
            items: [{
                productCode: `QS-${selectedItem.itemid}`,
                productName: selectedItem.itemname,
                palletCount: sellPalettes,
                boxCount: sellCartons,
                quantity: sellQuantity,
                unitCode: 'M²',
                unitPrice: Number(selectedItem.unitprice),
                lineTotal: sellQuantity * Number(selectedItem.unitprice),
            }],
            totalHT: sellQuantity * Number(selectedItem.unitprice),
        };
    };

    return (
        <div className="p-4 sm:p-6 lg:p-8 min-h-screen bg-slate-50 text-slate-800">
            <div className="max-w-6xl mx-auto">

                {/* Header */}
                <div className="mb-6 flex justify-between items-center">
                    <div>
                        <h1 className="text-2xl font-bold text-slate-800">📦 Entrée Stock Rapide</h1>
                        <p className="text-slate-500 text-sm">Ajoutez des produits anciens/divers et vendez directement</p>
                    </div>
                    <button
                        onClick={() => router.push('/inventory')}
                        className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 font-medium rounded-lg flex items-center gap-2"
                    >
                        ← Retour Inventaire
                    </button>
                </div>

                {/* Add Item Form - Enhanced with Pal/Ctn/Qty */}
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 mb-6">
                    <h2 className="text-lg font-bold text-slate-700 mb-4">➕ Ajouter un article</h2>

                    {/* Product Name & Price */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
                        <div className="sm:col-span-2">
                            <label className="block text-sm font-medium text-slate-600 mb-1">Nom du produit</label>
                            <input
                                type="text"
                                value={newItemName}
                                onChange={e => setNewItemName(e.target.value)}
                                placeholder="Ex: Ancien carrelage 60x60"
                                className="w-full p-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-slate-600 mb-1">Prix unitaire (DA/m²)</label>
                            <input
                                type="number"
                                min="0"
                                step="0.01"
                                value={newUnitPrice}
                                onChange={e => setNewUnitPrice(Number(e.target.value))}
                                className="w-full p-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                            />
                        </div>
                    </div>

                    {/* Packaging Config */}
                    <div className="bg-slate-50 p-3 rounded-lg mb-4">
                        <p className="text-xs text-slate-500 mb-2 font-medium">Configuration emballage</p>
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-xs text-slate-500 mb-1">m² / Carton</label>
                                <input
                                    type="number"
                                    min="0.01"
                                    step="0.01"
                                    value={newSqmPerCarton}
                                    onChange={e => setNewSqmPerCarton(Number(e.target.value))}
                                    className="w-full p-2 text-sm border border-slate-300 rounded-lg"
                                />
                            </div>
                            <div>
                                <label className="block text-xs text-slate-500 mb-1">Cartons / Palette</label>
                                <input
                                    type="number"
                                    min="1"
                                    value={newCtnPerPalette}
                                    onChange={e => setNewCtnPerPalette(Number(e.target.value))}
                                    className="w-full p-2 text-sm border border-slate-300 rounded-lg"
                                />
                            </div>
                        </div>
                    </div>

                    {/* Pal / Ctn / Qty with auto-calculation */}
                    <div className="grid grid-cols-3 gap-4 mb-4">
                        <div>
                            <label className="block text-sm font-medium text-purple-700 mb-1">🎨 Palettes</label>
                            <input
                                type="number"
                                min="0"
                                value={newPalettes}
                                onChange={e => handleNewPalettesChange(Number(e.target.value))}
                                className="w-full p-2 border-2 border-purple-300 rounded-lg text-center font-bold text-purple-700 bg-purple-50"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-cyan-700 mb-1">📦 Cartons</label>
                            <input
                                type="number"
                                min="0"
                                value={newCartons}
                                onChange={e => handleNewCartonsChange(Number(e.target.value))}
                                className="w-full p-2 border-2 border-cyan-300 rounded-lg text-center font-bold text-cyan-700 bg-cyan-50"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-blue-700 mb-1">📐 Quantité (m²)</label>
                            <input
                                type="number"
                                min="0"
                                step="0.01"
                                value={newQuantity}
                                onChange={e => handleNewQuantityChange(Number(e.target.value))}
                                className="w-full p-2 border-2 border-blue-400 rounded-lg text-center font-bold text-blue-700 bg-blue-50"
                            />
                        </div>
                    </div>

                    {/* Total Value Preview */}
                    {newQuantity > 0 && newUnitPrice > 0 && (
                        <div className="bg-green-50 border border-green-200 rounded-lg p-3 mb-4">
                            <p className="text-sm text-green-700">
                                Valeur totale: <span className="font-bold text-lg">{formatCurrency(newQuantity * newUnitPrice)}</span>
                            </p>
                        </div>
                    )}

                    <div className="flex justify-end">
                        <button
                            onClick={handleAddItem}
                            disabled={adding || !newItemName.trim() || newQuantity <= 0}
                            className="px-6 py-2 bg-green-600 text-white font-medium rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {adding ? 'Ajout...' : '✓ Ajouter au Stock'}
                        </button>
                    </div>
                </div>

                {/* Items List */}
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                    <div className="p-4 border-b border-slate-200 bg-slate-50">
                        <h2 className="text-lg font-bold text-slate-700">📋 Articles en Stock ({items.length})</h2>
                    </div>

                    {loading ? (
                        <p className="p-8 text-center text-slate-500">Chargement...</p>
                    ) : items.length === 0 ? (
                        <p className="p-8 text-center text-slate-500">Aucun article. Ajoutez-en un ci-dessus.</p>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead className="bg-slate-100 text-slate-600">
                                    <tr>
                                        <th className="px-4 py-3 text-left">Produit</th>
                                        <th className="px-4 py-3 text-center">Qté Total</th>
                                        <th className="px-4 py-3 text-center">Vendu</th>
                                        <th className="px-4 py-3 text-center">Disponible</th>
                                        <th className="px-4 py-3 text-right">Prix U.</th>
                                        <th className="px-4 py-3 text-right">Valeur Stock</th>
                                        <th className="px-4 py-3 text-center">Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {items.map(item => {
                                        const available = Number(item.quantity) - Number(item.soldquantity);
                                        const stockValue = available * Number(item.unitprice);
                                        return (
                                            <tr key={item.itemid} className="hover:bg-slate-50">
                                                <td className="px-4 py-3">
                                                    <div className="font-medium text-slate-800">{item.itemname}</div>
                                                    <div className="text-xs text-slate-400">
                                                        ID: QS-{item.itemid} • {new Date(item.createdat).toLocaleDateString('fr-DZ')}
                                                    </div>
                                                </td>
                                                <td className="px-4 py-3 text-center font-mono">{Number(item.quantity).toFixed(2)} m²</td>
                                                <td className="px-4 py-3 text-center font-mono text-orange-600">{Number(item.soldquantity).toFixed(2)} m²</td>
                                                <td className="px-4 py-3 text-center">
                                                    <span className={`font-bold ${available > 0 ? 'text-green-600' : 'text-red-600'}`}>
                                                        {available.toFixed(2)} m²
                                                    </span>
                                                </td>
                                                <td className="px-4 py-3 text-right font-mono">{formatCurrency(Number(item.unitprice))}</td>
                                                <td className="px-4 py-3 text-right font-mono font-bold text-blue-600">{formatCurrency(stockValue)}</td>
                                                <td className="px-4 py-3 text-center">
                                                    <div className="flex justify-center gap-2">
                                                        <button
                                                            onClick={() => openSellModal(item)}
                                                            disabled={available <= 0}
                                                            className="px-3 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                                                        >
                                                            💰 Vendre
                                                        </button>
                                                        <button
                                                            onClick={() => handleDelete(item.itemid)}
                                                            className="px-3 py-1 text-xs bg-red-100 text-red-600 rounded hover:bg-red-200"
                                                        >
                                                            🗑️
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>

            </div>

            {/* Enhanced Sell Modal with Pal/Ctn/Qty and Print */}
            {sellModalOpen && selectedItem && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
                        <div className="p-4 border-b border-slate-200 bg-blue-50 rounded-t-2xl flex justify-between items-center">
                            <div>
                                <h2 className="text-xl font-bold text-blue-800">💰 Vendre Article</h2>
                                <p className="text-sm text-blue-600">{selectedItem.itemname}</p>
                            </div>
                            <button onClick={() => setSellModalOpen(false)} className="text-slate-400 hover:text-slate-600 text-2xl">×</button>
                        </div>

                        {!saleCompleted ? (
                            <>
                                <div className="p-4 space-y-4">
                                    {/* Stock Info */}
                                    <div className="bg-slate-50 p-3 rounded-lg flex justify-between items-center">
                                        <div>
                                            <p className="text-sm text-slate-500">Stock disponible</p>
                                            <p className="text-2xl font-bold text-green-600">
                                                {(Number(selectedItem.quantity) - Number(selectedItem.soldquantity)).toFixed(2)} m²
                                            </p>
                                        </div>
                                        <div className="text-right">
                                            <p className="text-sm text-slate-500">Prix unitaire</p>
                                            <p className="text-xl font-bold text-slate-700">{formatCurrency(Number(selectedItem.unitprice))}/m²</p>
                                        </div>
                                    </div>

                                    {/* Pal/Ctn/Qty Inputs */}
                                    <div className="grid grid-cols-3 gap-4">
                                        <div>
                                            <label className="block text-sm font-medium text-purple-700 mb-1">🎨 Palettes</label>
                                            <input
                                                type="number"
                                                min="0"
                                                value={sellPalettes}
                                                onChange={e => handleSellPalettesChange(Number(e.target.value))}
                                                className="w-full p-2 border-2 border-purple-300 rounded-lg text-center font-bold text-purple-700 bg-purple-50"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-cyan-700 mb-1">📦 Cartons</label>
                                            <input
                                                type="number"
                                                min="0"
                                                value={sellCartons}
                                                onChange={e => handleSellCartonsChange(Number(e.target.value))}
                                                className="w-full p-2 border-2 border-cyan-300 rounded-lg text-center font-bold text-cyan-700 bg-cyan-50"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-blue-700 mb-1">📐 Quantité (m²)</label>
                                            <input
                                                type="number"
                                                min="0"
                                                step="0.01"
                                                value={sellQuantity}
                                                onChange={e => handleSellQuantityChange(Number(e.target.value))}
                                                className="w-full p-2 border-2 border-blue-400 rounded-lg text-center font-bold text-blue-700 bg-blue-50"
                                            />
                                        </div>
                                    </div>

                                    {/* Total */}
                                    {sellQuantity > 0 && (
                                        <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-center">
                                            <p className="text-sm text-green-600">Total à payer</p>
                                            <p className="text-3xl font-bold text-green-700">
                                                {formatCurrency(sellQuantity * Number(selectedItem.unitprice))}
                                            </p>
                                        </div>
                                    )}

                                    {/* Customer Info */}
                                    <div className="border-t pt-4 space-y-3">
                                        <p className="text-sm font-medium text-slate-600">Informations client (optionnel)</p>
                                        <div className="grid grid-cols-2 gap-3">
                                            <input
                                                type="text"
                                                value={customerName}
                                                onChange={e => setCustomerName(e.target.value)}
                                                placeholder="Nom du client"
                                                className="p-2 border border-slate-300 rounded-lg"
                                            />
                                            <input
                                                type="text"
                                                value={customerPhone}
                                                onChange={e => setCustomerPhone(e.target.value)}
                                                placeholder="Téléphone"
                                                className="p-2 border border-slate-300 rounded-lg"
                                            />
                                        </div>
                                        <input
                                            type="text"
                                            value={customerAddress}
                                            onChange={e => setCustomerAddress(e.target.value)}
                                            placeholder="Adresse"
                                            className="w-full p-2 border border-slate-300 rounded-lg"
                                        />
                                    </div>
                                </div>

                                <div className="p-4 border-t border-slate-200 flex justify-end gap-3">
                                    <button
                                        onClick={() => setSellModalOpen(false)}
                                        className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg"
                                    >
                                        Annuler
                                    </button>
                                    <button
                                        onClick={handleSell}
                                        disabled={selling || sellQuantity <= 0}
                                        className="px-6 py-2 bg-green-600 text-white font-medium rounded-lg hover:bg-green-700 disabled:opacity-50"
                                    >
                                        {selling ? 'Vente...' : '✓ Confirmer Vente'}
                                    </button>
                                </div>
                            </>
                        ) : (
                            /* Sale Completed - Show Print Options */
                            <div className="p-6">
                                <div className="text-center mb-6">
                                    <div className="text-6xl mb-4">✅</div>
                                    <h3 className="text-2xl font-bold text-green-700">Vente Effectuée !</h3>
                                    <p className="text-slate-500">N° {saleNumber}</p>
                                    <p className="text-lg font-bold text-blue-600 mt-2">
                                        {sellQuantity.toFixed(2)} m² × {formatCurrency(Number(selectedItem.unitprice))} = {formatCurrency(sellQuantity * Number(selectedItem.unitprice))}
                                    </p>
                                </div>

                                <div className="grid grid-cols-2 gap-4 mb-6">
                                    <button
                                        onClick={handlePrintBL}
                                        className="p-4 bg-blue-600 text-white rounded-xl hover:bg-blue-700 flex flex-col items-center gap-2"
                                    >
                                        <span className="text-2xl">📄</span>
                                        <span className="font-medium">Bon de Livraison</span>
                                    </button>
                                    <button
                                        onClick={handlePrintBC}
                                        className="p-4 bg-orange-600 text-white rounded-xl hover:bg-orange-700 flex flex-col items-center gap-2"
                                    >
                                        <span className="text-2xl">🚚</span>
                                        <span className="font-medium">Bon de Chargement</span>
                                    </button>
                                </div>

                                <button
                                    onClick={() => setSellModalOpen(false)}
                                    className="w-full py-3 bg-slate-200 text-slate-700 font-medium rounded-lg hover:bg-slate-300"
                                >
                                    Fermer
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Hidden Print Components */}
            {finalPrintData && (
                <div style={{ display: 'none' }}>
                    <StandardDocument ref={blPrintRef} type="DELIVERY_NOTE" data={finalPrintData} />
                    <StandardDocument ref={bcPrintRef} type="LOADING_SLIP" data={finalPrintData} />
                </div>
            )}
        </div>
    );
}
