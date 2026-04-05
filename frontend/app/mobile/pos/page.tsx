'use client';

import { useState, useEffect } from 'react';
import api from '@/lib/api';
import { useToast } from '@/components/ui/Toast';
import { useRouter } from 'next/navigation';

interface Product {
    productid: number;
    productcode: string;
    productname: string;
    baseprice: number;
}

interface CartItem {
    product: Product;
    quantity: number;
}

export default function MobilePOS() {
    const [products, setProducts] = useState<Product[]>([]);
    const [search, setSearch] = useState('');
    const [cart, setCart] = useState<CartItem[]>([]);
    const [isCheckout, setIsCheckout] = useState(false);
    const { showToast } = useToast();
    const router = useRouter();

    useEffect(() => {
        loadProducts();
    }, []);

    const loadProducts = async () => {
        try {
            const res = await api.getProducts({ limit: 50 }); // Load initial batch
            if (res.success) {
                setProducts(res.data as Product[]);
            }
        } catch (error) {
            showToast('Erreur chargement produits', 'error');
        }
    };

    const addToCart = (product: Product) => {
        setCart(prev => {
            const existing = prev.find(item => item.product.productid === product.productid);
            if (existing) {
                return prev.map(item =>
                    item.product.productid === product.productid
                        ? { ...item, quantity: item.quantity + 1 }
                        : item
                );
            }
            return [...prev, { product, quantity: 1 }];
        });
        showToast(`${product.productname} ajouté`, 'success');
    };

    const updateQuantity = (productId: number, delta: number) => {
        setCart(prev => prev.map(item => {
            if (item.product.productid === productId) {
                const newQty = Math.max(0, item.quantity + delta);
                return { ...item, quantity: newQty };
            }
            return item;
        }).filter(item => item.quantity > 0));
    };

    const totalAmount = cart.reduce((sum, item) => sum + (item.product.baseprice * item.quantity), 0);

    const filteredProducts = products.filter(p =>
        p.productname.toLowerCase().includes(search.toLowerCase()) ||
        p.productcode.toLowerCase().includes(search.toLowerCase())
    );

    const handleCheckout = async () => {
        // Placeholder for checkout logic - would reuse existing order creation logic
        showToast('Commande créée ! (Simulation)', 'success');
        setCart([]);
        setIsCheckout(false);
    };

    if (isCheckout) {
        return (
            <div className="min-h-screen bg-slate-50 p-4 flex flex-col">
                <div className="flex items-center gap-4 mb-6">
                    <button onClick={() => setIsCheckout(false)} className="p-2 bg-white rounded-lg shadow-sm">
                        ←
                    </button>
                    <h1 className="text-xl font-bold">Panier ({cart.length})</h1>
                </div>

                <div className="flex-1 overflow-y-auto space-y-4">
                    {cart.map(item => (
                        <div key={item.product.productid} className="bg-white p-4 rounded-xl shadow-sm flex justify-between items-center">
                            <div>
                                <div className="font-medium">{item.product.productname}</div>
                                <div className="text-sm text-slate-500">{item.product.baseprice} DZD</div>
                            </div>
                            <div className="flex items-center gap-3">
                                <button onClick={() => updateQuantity(item.product.productid, -1)} className="w-8 h-8 bg-slate-100 rounded-full flex items-center justify-center font-bold">-</button>
                                <span className="w-6 text-center font-medium">{item.quantity}</span>
                                <button onClick={() => updateQuantity(item.product.productid, 1)} className="w-8 h-8 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center font-bold">+</button>
                            </div>
                        </div>
                    ))}
                </div>

                <div className="mt-4 bg-white p-4 rounded-xl shadow-lg border border-slate-100">
                    <div className="flex justify-between items-center mb-4">
                        <span className="text-slate-500">Total</span>
                        <span className="text-2xl font-bold text-blue-600">{totalAmount.toLocaleString()} DZD</span>
                    </div>
                    <button onClick={handleCheckout} className="w-full bg-green-600 text-white py-4 rounded-xl font-bold text-lg shadow-lg active:scale-95 transition-transform">
                        Valider la Commande
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-slate-50 p-4 pb-24">
            {/* Header & Search */}
            <div className="sticky top-0 bg-slate-50 pt-2 pb-4 z-10">
                <div className="flex justify-between items-center mb-4">
                    <h1 className="text-2xl font-bold text-slate-800">Mobile POS</h1>
                    <button onClick={() => router.push('/mobile/dashboard')} className="text-sm text-blue-600 font-medium">Quitter</button>
                </div>
                <input
                    type="text"
                    placeholder="Rechercher produit..."
                    className="w-full p-4 rounded-xl border-none shadow-sm bg-white focus:ring-2 focus:ring-blue-500"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                />
            </div>

            {/* Product Grid */}
            <div className="grid grid-cols-2 gap-4">
                {filteredProducts.map(product => (
                    <button
                        key={product.productid}
                        onClick={() => addToCart(product)}
                        className="bg-white p-4 rounded-xl shadow-sm border border-slate-100 text-left active:scale-95 transition-transform flex flex-col justify-between h-32"
                    >
                        <div className="font-medium text-slate-800 line-clamp-2">{product.productname}</div>
                        <div>
                            <div className="text-xs text-slate-400">{product.productcode}</div>
                            <div className="font-bold text-blue-600 mt-1">{product.baseprice} DZD</div>
                        </div>
                    </button>
                ))}
            </div>

            {/* Cart Summary Bar */}
            {cart.length > 0 && (
                <div className="fixed bottom-4 left-4 right-4 bg-slate-900 text-white p-4 rounded-2xl shadow-2xl flex justify-between items-center z-20" onClick={() => setIsCheckout(true)}>
                    <div className="flex items-center gap-3">
                        <div className="bg-slate-700 w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold">
                            {cart.reduce((s, i) => s + i.quantity, 0)}
                        </div>
                        <span className="font-medium">Voir Panier</span>
                    </div>
                    <span className="font-bold text-lg">{totalAmount.toLocaleString()} DZD</span>
                </div>
            )}
        </div>
    );
}
