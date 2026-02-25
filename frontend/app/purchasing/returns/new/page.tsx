'use client';

import { useState, useEffect } from 'react';
import api from '@/lib/api';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

// Interfaces
interface Supplier {
    id: number;
    name: string;
    type: 'FACTORY' | 'BRAND';
}

interface PurchaseOrderSelect {
    purchaseorderid: number;
    ponumber: string;
    orderdate: string;
}

interface Product {
    productid: number;
    productcode: string;
    productname: string;
    baseprice: number; // Purchase Price
    derivedpiecespercolis?: number;
    derivedcolisperpalette?: number;
}

interface ReturnFormItem {
    productId: number;
    productCode: string;
    productName: string;
    palettes: number;
    cartons: number;
    quantity: number;
    piecesPerCarton: number;
    cartonsPerPalette: number;
    sqmPerPiece: number;
    sqmTotal: number;
    unitPrice: number;
    lineTotal: number;
    reason: string;
}

const formatCurrency = (amount: number) =>
    new Intl.NumberFormat('fr-DZ', { style: 'currency', currency: 'DZD' }).format(amount);

const parseSqmPerPiece = (productName: string): number => {
    const sizeMatch = productName.match(/(\d+)[\/x](\d+)/i);
    if (sizeMatch) {
        const dim1 = parseInt(sizeMatch[1]);
        const dim2 = parseInt(sizeMatch[2]);
        return (dim1 * dim2) / 10000;
    }
    return 0;
};

export default function NewPurchaseReturnPage() {
    const router = useRouter();

    // Data Sources
    const [suppliers, setSuppliers] = useState<Supplier[]>([]);
    const [products, setProducts] = useState<Product[]>([]);
    const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrderSelect[]>([]);

    // Form State
    const [supplierId, setSupplierId] = useState<string>(''); // Combined ID-Type
    const [purchaseOrderId, setPurchaseOrderId] = useState<string>('');
    const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
    const [notes, setNotes] = useState('');
    const [items, setItems] = useState<ReturnFormItem[]>([]);

    // UI State
    const [productSearch, setProductSearch] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [loadingInit, setLoadingInit] = useState(true);
    const [loadingPOs, setLoadingPOs] = useState(false);

    // Initial Load
    useEffect(() => {
        const load = async () => {
            try {
                const [factoriesRes, brandsRes, productsRes] = await Promise.all([
                    api.getFactories(),
                    api.getBrands(),
                    api.getProducts({ limit: 5000 })
                ]);

                const allSuppliers: Supplier[] = [];
                if (factoriesRes.success && Array.isArray(factoriesRes.data)) {
                    allSuppliers.push(...factoriesRes.data.map((f: any) => ({
                        id: f.factoryid,
                        name: f.factoryname,
                        type: 'FACTORY' as const
                    })));
                }
                if (brandsRes.success && Array.isArray(brandsRes.data)) {
                    allSuppliers.push(...brandsRes.data.map((b: any) => ({
                        id: b.brandid,
                        name: b.brandname,
                        type: 'BRAND' as const
                    })));
                }
                setSuppliers(allSuppliers);

                if (productsRes.success) setProducts(productsRes.data as any[]);
            } catch (err) {
                console.error(err);
                alert('Erreur chargement données initiales');
            } finally {
                setLoadingInit(false);
            }
        };
        load();
    }, []);

    // Load POs when Supplier changes
    useEffect(() => {
        if (!supplierId) {
            setPurchaseOrders([]);
            setPurchaseOrderId('');
            return;
        }

        const [id, type] = supplierId.split('-');
        const fetchPOs = async () => {
            setLoadingPOs(true);
            try {
                // Determine params based on type
                // Backend controller seems to map factoryId to both depending on column?
                // Actually need to check if backend supports brandId filtering for POs.
                // Assuming standard `getPurchaseOrders` has optional factoryId/brandId or general filter.
                // If backend only has factoryId, we might need to adjust.
                // For now, let's try passing the ID based on type if API supports it, 
                // OR fetch all and filter client side if API is limited.
                // Looking at typical implementations, usually it's one ID field or separate.

                // Let's assume we pass { factoryId: id } or { brandId: id } if API supports.
                // If API only has factoryId param, we might have issues with Brands if they are stored differently.
                // Checking previous view_file of api.ts, getPurchaseOrders takes { factoryId, status, ... }
                // It does NOT explicitly take brandId.
                // However, PurchaseOrders table has FactoryID AND BrandID.
                // We might need to handle this.

                const params: any = { limit: 100 };
                if (type === 'FACTORY') params.factoryId = id;
                else if (type === 'BRAND') params.brandId = id; // Try this, if fails we might need backend update 

                const res = await api.getPurchaseOrders(params);
                if (res.success) {
                    setPurchaseOrders(res.data as any[]);
                }
            } catch (err) {
                console.error("Failed to load POs", err);
            } finally {
                setLoadingPOs(false);
            }
        };
        fetchPOs();
    }, [supplierId]);

    const filteredProducts = productSearch.length > 1
        ? products.filter(p =>
            p.productname?.toLowerCase().includes(productSearch.toLowerCase()) ||
            p.productcode?.toLowerCase().includes(productSearch.toLowerCase())
        ).slice(0, 20)
        : [];

    const addProduct = (product: Product) => {
        if (items.find(i => i.productId === product.productid)) return;

        const piecesPerCarton = product.derivedpiecespercolis || 0;
        const cartonsPerPalette = product.derivedcolisperpalette || 0;
        const sqmPerPiece = parseSqmPerPiece(product.productname);
        // Default to BasePrice (Purchase Price)
        const unitPrice = product.baseprice || 0;

        const newItem: ReturnFormItem = {
            productId: product.productid,
            productCode: product.productcode,
            productName: product.productname,
            palettes: 0,
            cartons: 0,
            quantity: 1,
            piecesPerCarton,
            cartonsPerPalette,
            sqmPerPiece,
            sqmTotal: sqmPerPiece * 1,
            unitPrice,
            lineTotal: unitPrice * 1,
            reason: '',
        };

        setItems([...items, newItem]);
        setProductSearch('');
    };

    const updateItem = (index: number, field: string, value: any) => {
        const newItems = [...items];
        const item = newItems[index];
        (item as any)[field] = value;

        // Auto-calc logic
        if (field === 'quantity') {
            const qty = Number(value);
            if (item.piecesPerCarton > 0) {
                const calculatedCartons = Math.floor(qty / item.piecesPerCarton);
                item.cartons = calculatedCartons;
                if (item.cartonsPerPalette > 0) {
                    item.palettes = Math.floor(calculatedCartons / item.cartonsPerPalette);
                }
            }
        }
        if (field === 'cartons') {
            const cartons = Number(value);
            if (item.piecesPerCarton > 0) item.quantity = cartons * item.piecesPerCarton;
            if (item.cartonsPerPalette > 0) item.palettes = Math.floor(cartons / item.cartonsPerPalette);
        }
        if (field === 'palettes') {
            const palettes = Number(value);
            if (item.cartonsPerPalette > 0) {
                item.cartons = palettes * item.cartonsPerPalette;
                if (item.piecesPerCarton > 0) item.quantity = item.cartons * item.piecesPerCarton;
            }
        }

        // Totals
        item.sqmTotal = item.quantity * item.sqmPerPiece;
        item.lineTotal = item.quantity * item.unitPrice;

        setItems(newItems);
    };

    const removeItem = (index: number) => {
        const newItems = [...items];
        newItems.splice(index, 1);
        setItems(newItems);
    };

    const handleSubmit = async () => {
        if (!supplierId) return alert('Veuillez sélectionner un fournisseur');
        if (items.length === 0) return alert('Veuillez ajouter des produits');

        const [id, type] = supplierId.split('-');

        setIsSubmitting(true);
        try {
            const payload = {
                factoryId: type === 'FACTORY' ? Number(id) : null,
                brandId: type === 'BRAND' ? Number(id) : null,
                purchaseOrderId: purchaseOrderId ? Number(purchaseOrderId) : null,
                date,
                notes,
                items: items.map(i => ({
                    productId: i.productId,
                    quantity: i.quantity,
                    unitPrice: i.unitPrice,
                    reason: i.reason
                }))
            };

            const res = await api.createPurchaseReturn(payload);
            if (res.success) {
                alert('Retour créé avec succès');
                router.push('/purchasing/returns');
            } else {
                throw new Error(res.message);
            }
        } catch (err: any) {
            alert('Erreur: ' + err.message);
        } finally {
            setIsSubmitting(false);
        }
    };

    if (loadingInit) return (
        <div className="min-h-screen bg-slate-50 flex items-center justify-center">
            <div className="flex flex-col items-center gap-2">
                <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                <p className="text-slate-500 font-medium">Chargement des données...</p>
            </div>
        </div>
    );

    const totalAmount = items.reduce((sum, i) => sum + i.lineTotal, 0);

    return (
        <div className="min-h-screen bg-slate-50 p-6">
            <div className="max-w-7xl mx-auto space-y-6">
                {/* Header & Actions */}
                <div className="flex items-center justify-between bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                    <div className="flex items-center gap-4">
                        <Link href="/purchasing/returns" className="p-2 hover:bg-slate-100 rounded-lg text-slate-500 transition">
                            <span className="text-xl">←</span>
                        </Link>
                        <div>
                            <h1 className="text-2xl font-bold text-slate-800">Nouveau Retour</h1>
                            <p className="text-sm text-slate-500">Créer un bon de retour fournisseur</p>
                        </div>
                    </div>
                    <div className="flex gap-3">
                        <button
                            onClick={handleSubmit}
                            disabled={isSubmitting}
                            className={`px-6 py-2.5 rounded-lg font-medium text-white shadow-sm transition-all flex items-center gap-2
                                ${isSubmitting ? 'bg-blue-400 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700 hover:shadow-md'}`}
                        >
                            {isSubmitting ? (
                                <>
                                    <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                                    <span>Enregistrement...</span>
                                </>
                            ) : (
                                <>
                                    <span>💾</span>
                                    <span>Enregistrer le Retour</span>
                                </>
                            )}
                        </button>
                    </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    {/* Left Column: Context (Updates based on selection) */}
                    <div className="lg:col-span-1 space-y-6">

                        {/* 1. Supplier Selection */}
                        <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-200">
                            <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wide mb-4 flex items-center gap-2">
                                🏭 Fournisseur
                            </h3>

                            <div className="space-y-4">
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Fournisseur (Usine / Marque) <span className="text-red-500">*</span></label>
                                    <select
                                        value={supplierId}
                                        onChange={e => setSupplierId(e.target.value)}
                                        className="w-full border-slate-300 rounded-lg text-sm focus:ring-blue-500 focus:border-blue-500 shadow-sm py-2.5"
                                    >
                                        <option value="">-- Sélectionner --</option>
                                        <optgroup label="Usines">
                                            {suppliers.filter(s => s.type === 'FACTORY').map(s => (
                                                <option key={`${s.id}-FACTORY`} value={`${s.id}-FACTORY`}>{s.name}</option>
                                            ))}
                                        </optgroup>
                                        <optgroup label="Marques">
                                            {suppliers.filter(s => s.type === 'BRAND').map(s => (
                                                <option key={`${s.id}-BRAND`} value={`${s.id}-BRAND`}>{s.name}</option>
                                            ))}
                                        </optgroup>
                                    </select>
                                </div>

                                {/* PO Selection (Dependent) */}
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">
                                        Lier au Bon de Commande
                                        {loadingPOs && <span className="ml-2 text-xs text-blue-500 animate-pulse">Chargement...</span>}
                                    </label>
                                    <select
                                        value={purchaseOrderId}
                                        onChange={e => setPurchaseOrderId(e.target.value)}
                                        disabled={!supplierId}
                                        className="w-full border-slate-300 rounded-lg text-sm focus:ring-blue-500 focus:border-blue-500 shadow-sm py-2.5 disabled:bg-slate-50 disabled:text-slate-400"
                                    >
                                        <option value="">-- Aucun (Retour libre) --</option>
                                        {purchaseOrders.map(po => (
                                            <option key={po.purchaseorderid} value={po.purchaseorderid}>
                                                {po.ponumber} ({new Date(po.orderdate).toLocaleDateString()})
                                            </option>
                                        ))}
                                    </select>
                                    <p className="text-xs text-slate-500 mt-1">Optionnel. Permet de lier ce retour à une commande spécifique.</p>
                                </div>
                            </div>
                        </div>

                        {/* 2. Details */}
                        <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-200">
                            <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wide mb-4 flex items-center gap-2">
                                ℹ️ Détails
                            </h3>
                            <div className="space-y-4">
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Date du retour</label>
                                    <input
                                        type="date"
                                        value={date}
                                        onChange={e => setDate(e.target.value)}
                                        className="w-full border-slate-300 rounded-lg text-sm shadow-sm focus:ring-blue-500 focus:border-blue-500"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Notes / Motif global</label>
                                    <textarea
                                        rows={4}
                                        value={notes}
                                        onChange={e => setNotes(e.target.value)}
                                        className="w-full border-slate-300 rounded-lg text-sm shadow-sm focus:ring-blue-500 focus:border-blue-500"
                                        placeholder="Numéro de bon de livraison, raison principale..."
                                    />
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Right Column: Items */}
                    <div className="lg:col-span-2 space-y-4">

                        {/* Product Search Bar */}
                        <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 z-30 relative">
                            <div className="relative">
                                <label className="block text-sm font-medium text-slate-700 mb-1">Ajouter des articles</label>
                                <div className="flex items-center relative">
                                    <span className="absolute left-3 text-slate-400">🔍</span>
                                    <input
                                        type="text"
                                        value={productSearch}
                                        onChange={e => setProductSearch(e.target.value)}
                                        placeholder="Rechercher par nom, code, dimension..."
                                        className="w-full border-slate-300 rounded-lg pl-10 py-2.5 focus:ring-blue-500 focus:border-blue-500 shadow-sm text-sm"
                                        autoComplete="off"
                                    />
                                </div>

                                {/* Dropdown Results */}
                                {filteredProducts.length > 0 && (
                                    <div className="absolute top-full left-0 right-0 mt-2 bg-white border border-slate-200 rounded-xl shadow-xl z-50 max-h-80 overflow-y-auto ring-1 ring-black ring-opacity-5">
                                        <div className="p-2 grid grid-cols-1 gap-1">
                                            {filteredProducts.map(p => (
                                                <button
                                                    key={p.productid}
                                                    onClick={() => addProduct(p)}
                                                    className="flex justify-between items-center p-3 hover:bg-blue-50 rounded-lg transition-colors group text-left"
                                                >
                                                    <div>
                                                        <div className="font-semibold text-slate-800">{p.productname}</div>
                                                        <div className="text-xs text-slate-500 font-mono">{p.productcode}</div>
                                                    </div>
                                                    <div className="text-sm font-bold text-slate-600 bg-slate-100 px-2 py-1 rounded group-hover:bg-white transition-colors">
                                                        {formatCurrency(p.baseprice)}
                                                    </div>
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Items Table */}
                        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden min-h-[400px] flex flex-col">
                            <div className="overflow-x-auto flex-1">
                                <table className="w-full text-sm">
                                    <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 uppercase text-xs font-semibold">
                                        <tr>
                                            <th className="px-4 py-3 text-left w-1/3">Produit</th>
                                            <th className="px-2 py-3 text-center w-16 bg-slate-100 hidden sm:table-cell">Pal</th>
                                            <th className="px-2 py-3 text-center w-16 bg-slate-100 hidden sm:table-cell">Ctn</th>
                                            <th className="px-2 py-3 text-center w-24 bg-blue-50 text-blue-800">Qté (pcs)</th>
                                            <th className="px-4 py-3 text-right w-32">Prix Achat</th>
                                            <th className="px-4 py-3 text-right w-32">Total</th>
                                            <th className="px-2 py-3 w-10"></th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                        {items.length === 0 ? (
                                            <tr>
                                                <td colSpan={7} className="px-4 py-12 text-center text-slate-400">
                                                    <div className="flex flex-col items-center justify-center gap-2">
                                                        <span className="text-4xl opacity-50">📦</span>
                                                        <p>Aucun article ajouté.</p>
                                                        <p className="text-xs">Utilisez la barre de recherche ci-dessus pour ajouter des produits.</p>
                                                    </div>
                                                </td>
                                            </tr>
                                        ) : (
                                            items.map((item, idx) => (
                                                <tr key={idx} className="hover:bg-slate-50 transition-colors group">
                                                    <td className="px-4 py-3">
                                                        <div className="font-semibold text-slate-900">{item.productName}</div>
                                                        <div className="text-xs text-slate-500 mb-1">{item.productCode}</div>
                                                        <input
                                                            type="text"
                                                            placeholder="Motif (ex: Cassé, Erreur...)"
                                                            value={item.reason}
                                                            onChange={e => updateItem(idx, 'reason', e.target.value)}
                                                            className="w-full text-xs border-slate-200 rounded px-2 py-1 placeholder-slate-400 focus:border-blue-400 focus:ring-1 focus:ring-blue-400 transition-shadow"
                                                        />
                                                    </td>
                                                    <td className="px-2 py-3 hidden sm:table-cell">
                                                        <input
                                                            type="number" min="0"
                                                            value={item.palettes}
                                                            onChange={e => updateItem(idx, 'palettes', e.target.value)}
                                                            disabled={!item.cartonsPerPalette}
                                                            className="w-full text-center border-slate-200 rounded py-1.5 focus:ring-blue-500 focus:border-blue-500 disabled:bg-slate-50 disabled:text-slate-300"
                                                        />
                                                    </td>
                                                    <td className="px-2 py-3 hidden sm:table-cell">
                                                        <input
                                                            type="number" min="0"
                                                            value={item.cartons}
                                                            onChange={e => updateItem(idx, 'cartons', e.target.value)}
                                                            disabled={!item.piecesPerCarton}
                                                            className="w-full text-center border-slate-200 rounded py-1.5 focus:ring-blue-500 focus:border-blue-500 disabled:bg-slate-50 disabled:text-slate-300"
                                                        />
                                                    </td>
                                                    <td className="px-2 py-3 bg-blue-50/30">
                                                        <input
                                                            type="number" min="0" step="0.01"
                                                            value={item.quantity}
                                                            onChange={e => updateItem(idx, 'quantity', e.target.value)}
                                                            className="w-full text-center border-blue-300 bg-white font-bold text-blue-700 rounded py-1.5 shadow-sm focus:ring-blue-500 focus:border-blue-500"
                                                        />
                                                        {item.sqmPerPiece > 0 && (
                                                            <div className="text-[10px] text-center text-slate-500 mt-1 font-mono">
                                                                {(item.quantity * item.sqmPerPiece).toFixed(2)} m²
                                                            </div>
                                                        )}
                                                    </td>
                                                    <td className="px-4 py-3">
                                                        <input
                                                            type="number" min="0" step="0.01"
                                                            value={item.unitPrice}
                                                            onChange={e => updateItem(idx, 'unitPrice', e.target.value)}
                                                            className="w-full text-right border-slate-200 rounded py-1.5 focus:ring-blue-500 focus:border-blue-500 text-slate-600"
                                                        />
                                                    </td>
                                                    <td className="px-4 py-3 text-right font-bold text-slate-900 font-mono">
                                                        {formatCurrency(item.lineTotal)}
                                                    </td>
                                                    <td className="px-2 py-3 text-center">
                                                        <button
                                                            onClick={() => removeItem(idx)}
                                                            className="w-8 h-8 flex items-center justify-center rounded-full text-slate-400 hover:bg-red-50 hover:text-red-600 transition-colors"
                                                            title="Supprimer la ligne"
                                                        >
                                                            ✕
                                                        </button>
                                                    </td>
                                                </tr>
                                            ))
                                        )}
                                    </tbody>
                                </table>
                            </div>

                            {/* Footer Totals */}
                            <div className="bg-slate-50 border-t border-slate-200 p-4 lg:p-6 flex flex-col sm:flex-row justify-end items-center gap-4 sm:gap-8">
                                <div className="text-slate-500 text-sm">
                                    {items.length} produit(s)
                                </div>
                                <div className="flex items-center gap-4 bg-white px-6 py-3 rounded-lg border border-slate-200 shadow-sm">
                                    <span className="text-slate-600 font-medium uppercase text-sm tracking-wide">Total Estimé</span>
                                    <span className="text-2xl font-bold text-slate-900">{formatCurrency(totalAmount)}</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
