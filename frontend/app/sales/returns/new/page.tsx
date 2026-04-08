'use client';

import { useState, useEffect } from 'react';
import api from '@/lib/api';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

// --- Interfaces ---
interface Customer {
    customerid: number;
    customername: string;
}

interface Product {
    productid: number;
    productcode: string;
    productname: string;
    baseprice: number;
    primaryunitid?: number;
    prixvente?: number;
    derivedpiecespercolis?: number;
    derivedcolisperpalette?: number;
}

interface ReturnFormItem {
    productId: number;
    productCode: string;
    productName: string;
    unitId?: number;
    palettes: number;
    cartons: number;
    quantity: number;  // pieces
    piecesPerCarton: number;
    cartonsPerPalette: number;
    sqmPerPiece: number;
    sqmTotal: number;
    unitPrice: number;
    lineTotal: number;
}

// --- Helper ---
const formatCurrency = (amount: number) =>
    new Intl.NumberFormat('fr-DZ', { style: 'currency', currency: 'DZD' }).format(amount);

const parseSqmPerPiece = (productName: string): number => {
    const sizeMatch = productName.match(/(\d+)[\/x](\d+)/i);
    if (sizeMatch) {
        const dim1 = parseInt(sizeMatch[1]);
        const dim2 = parseInt(sizeMatch[2]);
        return (dim1 * dim2) / 10000; // cm² to m²
    }
    return 0;
};

export default function NewReturnPage() {
    const router = useRouter();
    const [customers, setCustomers] = useState<Customer[]>([]);
    const [products, setProducts] = useState<Product[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // --- Form State ---
    const [formCustomerId, setFormCustomerId] = useState<number | ''>('');
    const [isManualClient, setIsManualClient] = useState(false);
    const [manualClientName, setManualClientName] = useState('');
    const [manualClientPhone, setManualClientPhone] = useState('');
    const [manualClientAddress, setManualClientAddress] = useState('');
    const [formDate, setFormDate] = useState(new Date().toISOString().split('T')[0]);
    const [formReason, setFormReason] = useState('');
    const [formNotes, setFormNotes] = useState('');
    const [formItems, setFormItems] = useState<ReturnFormItem[]>([]);
    const [productSearch, setProductSearch] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [customerSearch, setCustomerSearch] = useState('');
    const [isCustomerDropdownOpen, setIsCustomerDropdownOpen] = useState(false);

    useEffect(() => {
        const loadData = async () => {
            try {
                setLoading(true);
                const [customersRes, productsRes] = await Promise.all([
                    api.getCustomers({ limit: 5000 }),
                    api.getProducts({ limit: 5000 }),
                ]);

                if (customersRes.success) setCustomers((customersRes.data || []) as Customer[]);
                if (productsRes.success) setProducts((productsRes.data || []) as Product[]);
            } catch (err: any) {
                setError(err.message);
            } finally {
                setLoading(false);
            }
        };
        loadData();
    }, []);

    const filteredCustomers = customerSearch.length > 0
        ? customers.filter(c => c.customername.toLowerCase().includes(customerSearch.toLowerCase())).slice(0, 10)
        : [];

    const filteredProducts = productSearch.length > 1
        ? products.filter(p =>
            p.productname?.toLowerCase().includes(productSearch.toLowerCase()) ||
            p.productcode?.toLowerCase().includes(productSearch.toLowerCase())
        ).slice(0, 20)
        : [];

    const addProductToForm = (product: Product) => {
        if (formItems.find(i => i.productId === product.productid)) return;

        const piecesPerCarton = product.derivedpiecespercolis || 0;
        const cartonsPerPalette = product.derivedcolisperpalette || 0;
        const sqmPerPiece = parseSqmPerPiece(product.productname);
        const unitPrice = product.prixvente || product.baseprice || 0;

        const newItem: ReturnFormItem = {
            productId: product.productid,
            productCode: product.productcode,
            productName: product.productname,
            unitId: product.primaryunitid,
            palettes: 0,
            cartons: 0,
            quantity: 1,
            piecesPerCarton,
            cartonsPerPalette,
            sqmPerPiece,
            sqmTotal: sqmPerPiece * 1,
            unitPrice,
            lineTotal: unitPrice * 1,
        };

        setFormItems([...formItems, newItem]);
        setProductSearch('');
    };

    const updateFormItem = (index: number, field: string, value: any) => {
        const newItems = [...formItems];
        const item = newItems[index];
        (item as any)[field] = value;

        if (field === 'quantity') {
            const qty = Number(value);
            if (item.piecesPerCarton > 0) {
                item.cartons = Math.floor(qty / item.piecesPerCarton);
                if (item.cartonsPerPalette > 0) {
                    item.palettes = Math.floor(item.cartons / item.cartonsPerPalette);
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

        item.sqmTotal = item.quantity * item.sqmPerPiece;
        item.lineTotal = item.quantity * item.unitPrice;
        setFormItems(newItems);
    };

    const removeFormItem = (index: number) => {
        setFormItems(formItems.filter((_, i) => i !== index));
    };

    const handleSubmit = async () => {
        if (isManualClient ? !manualClientName.trim() : !formCustomerId) {
            alert('Veuillez sélectionner un client');
            return;
        }
        if (formItems.length === 0) {
            alert('Veuillez ajouter au moins un produit');
            return;
        }

        setIsSubmitting(true);
        try {
            const returnData: any = {
                returnDate: formDate,
                reason: formReason,
                notes: formNotes,
                items: formItems.map(item => ({
                    productId: item.productId,
                    quantity: item.quantity,
                    unitId: item.unitId,
                    unitPrice: item.unitPrice,
                })),
            };

            if (isManualClient) {
                returnData.clientName = manualClientName.trim();
                returnData.clientPhone = manualClientPhone.trim();
                returnData.clientAddress = manualClientAddress.trim();
            } else {
                returnData.customerId = formCustomerId as number;
            }

            const res = await api.createReturn(returnData);
            if (res.success) {
                alert(`✅ Retour créé avec succès!`);
                router.push('/orders?filter=RETURN');
            } else {
                throw new Error(res.message);
            }
        } catch (err: any) {
            alert('❌ Erreur: ' + err.message);
        } finally {
            setIsSubmitting(false);
        }
    };

    if (loading) return <div className="p-10 text-center">Chargement...</div>;

    return (
        <div className="min-h-screen bg-slate-50 p-4 sm:p-8">
            <div className="max-w-4xl mx-auto">
                <div className="flex justify-between items-center mb-8">
                    <div>
                        <h1 className="text-2xl font-bold text-slate-800">Nouveau Retour de Vente</h1>
                        <p className="text-slate-500">Saisir les articles retournés par le client.</p>
                    </div>
                    <Link href="/orders" className="text-slate-600 hover:text-slate-900 font-medium">← Retour aux Commandes</Link>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                    {/* Left: Client & Info */}
                    <div className="md:col-span-1 space-y-6">
                        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
                            <h2 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
                                <span className="p-1.5 bg-blue-100 text-blue-600 rounded">👤</span> Client
                            </h2>

                            <div className="flex bg-slate-100 p-1 rounded-lg mb-4">
                                <button onClick={() => setIsManualClient(false)} className={`flex-1 py-1.5 text-xs font-bold rounded-md transition ${!isManualClient ? 'bg-white shadow-sm' : 'text-slate-500'}`}>EXISTANT</button>
                                <button onClick={() => setIsManualClient(true)} className={`flex-1 py-1.5 text-xs font-bold rounded-md transition ${isManualClient ? 'bg-white shadow-sm' : 'text-slate-500'}`}>MANUEL</button>
                            </div>

                            {!isManualClient ? (
                                <div className="relative">
                                    <input
                                        type="text"
                                        value={customerSearch}
                                        onChange={(e) => { setCustomerSearch(e.target.value); setIsCustomerDropdownOpen(true); }}
                                        placeholder="Rechercher client..."
                                        className="w-full p-2 border border-slate-300 rounded-lg text-sm"
                                    />
                                    {isCustomerDropdownOpen && filteredCustomers.length > 0 && (
                                        <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-300 rounded-lg shadow-lg z-20 max-h-48 overflow-y-auto">
                                            {filteredCustomers.map(c => (
                                                <div key={c.customerid} onClick={() => { setFormCustomerId(c.customerid); setCustomerSearch(c.customername); setIsCustomerDropdownOpen(false); }} className="p-2 hover:bg-blue-50 cursor-pointer text-sm border-b last:border-0">{c.customername}</div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            ) : (
                                <div className="space-y-3">
                                    <input type="text" value={manualClientName} onChange={(e) => setManualClientName(e.target.value)} placeholder="Nom du client *" className="w-full p-2 border border-slate-300 rounded-lg text-sm" />
                                    <input type="text" value={manualClientPhone} onChange={(e) => setManualClientPhone(e.target.value)} placeholder="Téléphone" className="w-full p-2 border border-slate-300 rounded-lg text-sm" />
                                </div>
                            )}

                            <div className="mt-4">
                                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Date du retour</label>
                                <input
                                    type="date"
                                    value={formDate}
                                    onChange={(e) => setFormDate(e.target.value)}
                                    className="w-full p-2 border border-slate-300 rounded-lg text-sm font-bold text-blue-600"
                                />
                            </div>

                            <div className="mt-6">
                                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Raison du retour</label>
                                <textarea value={formReason} onChange={(e) => setFormReason(e.target.value)} className="w-full p-2 border border-slate-300 rounded-lg text-sm h-20" placeholder="Ex: Casse, Surplus, Erreur..."></textarea>
                            </div>
                        </div>

                        <div className="bg-blue-600 p-6 rounded-xl shadow-lg text-white">
                            <p className="text-blue-100 text-xs font-bold uppercase mb-1">Total à Rembourser</p>
                            <h2 className="text-3xl font-black">{formatCurrency(formItems.reduce((s, i) => s + i.lineTotal, 0))}</h2>
                            <button
                                onClick={handleSubmit}
                                disabled={isSubmitting}
                                className="w-full mt-6 bg-white text-blue-600 font-bold py-3 rounded-lg hover:bg-blue-50 transition shadow-md disabled:opacity-50"
                            >
                                {isSubmitting ? 'Traitement...' : 'VALIDER LE RETOUR'}
                            </button>
                        </div>
                    </div>

                    {/* Right: Articles */}
                    <div className="md:col-span-2 space-y-6">
                        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
                            <h2 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
                                <span className="p-1.5 bg-orange-100 text-orange-600 rounded">📦</span> Articles Retournés
                            </h2>

                            <div className="relative mb-6">
                                <input
                                    type="text"
                                    value={productSearch}
                                    onChange={(e) => setProductSearch(e.target.value)}
                                    placeholder="🔍 Ajouter un produit (Code ou Nom)..."
                                    className="w-full p-3 border-2 border-slate-100 rounded-xl bg-slate-50 focus:bg-white focus:border-blue-400 transition"
                                />
                                {filteredProducts.length > 0 && (
                                    <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-300 rounded-xl shadow-xl z-30 max-h-60 overflow-y-auto">
                                        {filteredProducts.map(p => (
                                            <div key={p.productid} onClick={() => addProductToForm(p)} className="p-3 hover:bg-blue-50 cursor-pointer border-b last:border-0 flex justify-between items-center">
                                                <div>
                                                    <p className="font-bold text-slate-800">{p.productname}</p>
                                                    <p className="text-xs text-slate-500">{p.productcode}</p>
                                                </div>
                                                <span className="text-blue-600 font-bold">+</span>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>

                            <div className="space-y-3">
                                {formItems.length === 0 ? (
                                    <div className="py-12 text-center border-2 border-dashed border-slate-100 rounded-xl">
                                        <p className="text-slate-400 italic">Aucun article ajouté</p>
                                    </div>
                                ) : (
                                    formItems.map((item, idx) => (
                                        <div key={idx} className="flex flex-col sm:flex-row gap-4 p-4 bg-slate-50 rounded-xl border border-slate-200 relative group">
                                            <button onClick={() => removeFormItem(idx)} className="absolute -top-2 -right-2 w-6 h-6 bg-red-500 text-white rounded-full text-xs font-bold shadow-md opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">×</button>

                                            <div className="flex-1">
                                                <p className="font-bold text-slate-800 text-sm">{item.productName}</p>
                                                <p className="text-[10px] text-slate-400 font-mono">{item.productCode}</p>
                                                <p className="text-[10px] text-blue-500 mt-1 font-bold">{item.piecesPerCarton} PCS/CTN • {item.cartonsPerPalette} CTN/PAL</p>
                                            </div>

                                            <div className="flex gap-2 items-center">
                                                <div className="w-16">
                                                    <label className="block text-[8px] font-black text-slate-400 uppercase text-center">Pal</label>
                                                    <input type="number" value={item.palettes} onChange={(e) => updateFormItem(idx, 'palettes', Number(e.target.value))} className="w-full p-1 border border-slate-300 rounded text-center text-xs font-bold" />
                                                </div>
                                                <div className="w-16">
                                                    <label className="block text-[8px] font-black text-slate-400 uppercase text-center">Ctn</label>
                                                    <input type="number" value={item.cartons} onChange={(e) => updateFormItem(idx, 'cartons', Number(e.target.value))} className="w-full p-1 border border-slate-300 rounded text-center text-xs font-bold" />
                                                </div>
                                                <div className="w-20">
                                                    <label className="block text-[8px] font-black text-slate-400 uppercase text-center">Pcs</label>
                                                    <input type="number" value={item.quantity} onChange={(e) => updateFormItem(idx, 'quantity', Number(e.target.value))} className="w-full p-1 border border-blue-300 rounded text-center text-xs font-black text-blue-600" />
                                                </div>
                                                <div className="w-24">
                                                    <label className="block text-[8px] font-black text-slate-400 uppercase text-center">Prix U.</label>
                                                    <input 
                                                        type="number" 
                                                        value={item.unitPrice} 
                                                        onChange={(e) => updateFormItem(idx, 'unitPrice', Number(e.target.value))} 
                                                        className="w-full p-1 border border-slate-300 rounded text-center text-xs font-bold text-emerald-600" 
                                                    />
                                                </div>
                                            </div>

                                            <div className="w-24 text-right self-center">
                                                <p className="text-[10px] text-slate-400">Total</p>
                                                <p className="text-sm font-bold text-slate-800">{formatCurrency(item.lineTotal)}</p>
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
