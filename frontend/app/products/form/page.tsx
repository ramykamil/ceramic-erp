'use client';

import { useState, useEffect, Suspense } from 'react';
import api from '@/lib/api';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';

// Interfaces for dropdown data
interface Category { categoryid: number; categoryname: string; }
interface Brand { brandid: number; brandname: string; }
interface Unit { unitid: number; unitname: string; unitcode: string; }
interface Warehouse { warehouseid: number; warehousename: string; }

// Interface for product data (matching form and API)
interface ProductFormData {
    productcode: string;
    productname: string;
    categoryid: number | '';
    brandid: number | '';
    primaryunitid: number | '';
    description: string;
    baseprice: number | '';
    imageUrl: string;
    warehouseid: number | '';
}

// Add a more specific type for the product data from the API
interface Product {
    productid: number;
    productcode: string;
    productname: string;
    categoryid: number | null;
    brandid: number | null;
    primaryunitid: number | null;
    description: string | null;
    baseprice: number;
    ImageUrl?: string | null; // Match DB column case
}

// Helper component to read search params
function ProductFormContent() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const productId = searchParams.get('id'); // Check URL for "?id=..."
    const isEditing = Boolean(productId);

    // Form state
    const [formData, setFormData] = useState<ProductFormData>({
        productcode: '',
        productname: '',
        categoryid: '',
        brandid: '',
        primaryunitid: '',
        description: '',
        baseprice: '',
        imageUrl: '',
        warehouseid: '',
    });

    // Dropdown options state
    const [categories, setCategories] = useState<Category[]>([]);
    const [brands, setBrands] = useState<Brand[]>([]);
    const [units, setUnits] = useState<Unit[]>([]);
    const [warehouses, setWarehouses] = useState<Warehouse[]>([]);

    // Loading/Error state
    const [isLoading, setIsLoading] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [apiError, setApiError] = useState<string | null>(null);

    // Fetch dropdown data and existing product data (if editing) on mount
    useEffect(() => {
        setIsLoading(true);
        Promise.all([
            api.getCategories(),
            api.getBrands(),
            api.getUnits(),
            api.getWarehouses(),
            isEditing ? api.getProduct(Number(productId)) : Promise.resolve(null)
        ]).then(([catRes, brandRes, unitRes, whRes, prodRes]) => {
            if (catRes.success) setCategories(catRes.data || []); else throw new Error(catRes.message || 'Categories fetch failed');
            if (brandRes.success) setBrands(brandRes.data || []); else throw new Error(brandRes.message || 'Brands fetch failed');
            if (unitRes.success) setUnits(unitRes.data || []); else throw new Error(unitRes.message || 'Units fetch failed');
            if (whRes.success) setWarehouses((whRes.data as Warehouse[]) || []); else throw new Error(whRes.message || 'Warehouses fetch failed');

            if (isEditing && prodRes?.success && prodRes.data) {
                const productData = prodRes.data as Product;
                // Pre-fill form for editing
                setFormData({
                    productcode: productData.productcode || '',
                    productname: productData.productname || '',
                    categoryid: productData.categoryid || '',
                    brandid: productData.brandid || '',
                    primaryunitid: productData.primaryunitid || '',
                    description: productData.description || '',
                    baseprice: productData.baseprice || '',
                    imageUrl: productData.ImageUrl || '', // Use ImageUrl from DB
                    warehouseid: '', // Not used for editing
                });
            } else if (isEditing) {
                throw new Error(prodRes?.message || 'Product fetch failed');
            }
        }).catch((error: any) => {
            console.error("Error loading form data:", error);
            setApiError(`Erreur chargement données: ${error.message}`);
            if (error.message?.includes('token')) router.push('/login');
        }).finally(() => {
            if (!isEditing) {
                setFormData(prev => ({ ...prev, productcode: `PROD-${Date.now()}` }));
            }
            setIsLoading(false);
        });
    }, [productId, isEditing, router]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
        const { name, value } = e.target;
        setFormData(prev => ({
            ...prev,
            // Convert specific fields back to numbers if they are selects or number inputs
            [name]: (name === 'categoryid' || name === 'brandid' || name === 'primaryunitid' || name === 'baseprice' || name === 'warehouseid') && value !== ''
                ? Number(value)
                : value
        }));
    };

    const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        setIsSaving(true);
        setApiError(null);

        const dataToSend = {
            ...formData,
            // Ensure number fields are numbers or null if empty/invalid
            categoryid: formData.categoryid === '' ? null : Number(formData.categoryid),
            brandid: formData.brandid === '' ? null : Number(formData.brandid),
            primaryunitid: formData.primaryunitid === '' ? null : Number(formData.primaryunitid),
            baseprice: formData.baseprice === '' ? 0 : Number(formData.baseprice),
            imageUrl: formData.imageUrl || null,
            warehouseid: formData.warehouseid === '' ? null : Number(formData.warehouseid),
        };

        console.log("Data being sent to API:", dataToSend);

        try {
            let response;

            if (isEditing) {
                response = await api.updateProduct(Number(productId), dataToSend);
            } else {
                response = await api.createProduct(dataToSend);
            }

            if (response.success) {
                alert(`Produit ${isEditing ? 'modifié' : 'ajouté'} avec succès !`);
                router.push('/products');
            } else {
                if (response.message?.includes('token')) router.push('/login');
                if (response.message?.includes('already exists')) {
                    throw new Error(`Le code produit '${formData.productcode}' existe déjà.`);
                }
                throw new Error(response.message || `Échec ${isEditing ? 'modification' : 'ajout'}`);
            }
        } catch (error: any) {
            console.error("Save error:", error);
            setApiError(`Erreur: ${error.message}`);
        } finally {
            setIsSaving(false);
        }
    };

    if (isLoading) {
        return <p className="text-center py-12 text-slate-500">Chargement du formulaire...</p>;
    }

    return (
        <>
            {apiError && (
                <div className="mb-4 p-4 bg-red-100 text-red-700 border border-red-200 rounded-lg">
                    <strong>Erreur:</strong> {apiError}
                </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-6">
                {/* Code & Nom */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                        <label htmlFor="productcode" className="block text-sm font-medium text-slate-700 mb-1">Code Produit *</label>
                        <input type="text" id="productcode" name="productcode" value={formData.productcode} onChange={handleChange} required disabled={isEditing}
                            className="w-full p-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition bg-white bg-opacity-80 disabled:bg-slate-100" />
                        {isEditing && <p className="text-xs text-slate-500 mt-1">Le code produit ne peut pas être modifié.</p>}
                    </div>
                    <div>
                        <label htmlFor="productname" className="block text-sm font-medium text-slate-700 mb-1">Nom Produit *</label>
                        <input type="text" id="productname" name="productname" value={formData.productname} onChange={handleChange} required
                            className="w-full p-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition bg-white bg-opacity-80" />
                    </div>
                </div>

                {/* Catégorie, Marque, Unité */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div>
                        <label htmlFor="categoryid" className="block text-sm font-medium text-slate-700 mb-1">Catégorie</label>
                        <select id="categoryid" name="categoryid" value={formData.categoryid} onChange={handleChange}
                            className="w-full p-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition bg-white bg-opacity-80">
                            <option value="">-- Sélectionner --</option>
                            {categories.map(cat => <option key={cat.categoryid} value={cat.categoryid}>{cat.categoryname}</option>)}
                        </select>
                    </div>
                    <div>
                        <label htmlFor="brandid" className="block text-sm font-medium text-slate-700 mb-1">Marque</label>
                        <select id="brandid" name="brandid" value={formData.brandid} onChange={handleChange}
                            className="w-full p-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition bg-white bg-opacity-80">
                            <option value="">-- Sélectionner --</option>
                            {brands.map(brand => <option key={brand.brandid} value={brand.brandid}>{brand.brandname}</option>)}
                        </select>
                    </div>
                    <div>
                        <label htmlFor="primaryunitid" className="block text-sm font-medium text-slate-700 mb-1">Unité Primaire *</label>
                        <select id="primaryunitid" name="primaryunitid" value={formData.primaryunitid} onChange={handleChange} required
                            className="w-full p-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition bg-white bg-opacity-80">
                            <option value="">-- Sélectionner --</option>
                            {units.map(unit => <option key={unit.unitid} value={unit.unitid}>{unit.unitname} ({unit.unitcode})</option>)}
                        </select>
                    </div>
                </div>

                {/* Entrepôt - only show when creating new product */}
                {!isEditing && (
                    <div>
                        <label htmlFor="warehouseid" className="block text-sm font-medium text-slate-700 mb-1">Entrepôt Initial *</label>
                        <select id="warehouseid" name="warehouseid" value={formData.warehouseid} onChange={handleChange} required
                            className="w-full p-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition bg-white bg-opacity-80">
                            <option value="">-- Sélectionner l'entrepôt --</option>
                            {warehouses.map(wh => <option key={wh.warehouseid} value={wh.warehouseid}>{wh.warehousename}</option>)}
                        </select>
                        <p className="text-xs text-slate-500 mt-1">Le produit sera créé dans cet entrepôt uniquement.</p>
                    </div>
                )}

                {/* Description */}
                <div>
                    <label htmlFor="description" className="block text-sm font-medium text-slate-700 mb-1">Description</label>
                    <textarea id="description" name="description" value={formData.description} onChange={handleChange} rows={3}
                        className="w-full p-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition bg-white bg-opacity-80" />
                </div>

                {/* Image URL */}
                <div>
                    <label htmlFor="imageUrl" className="block text-sm font-medium text-slate-700 mb-1">Lien Image (URL)</label>
                    <input type="url" id="imageUrl" name="imageUrl" value={formData.imageUrl} onChange={handleChange} placeholder="https://example.com/image.jpg"
                        className="w-full p-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition bg-white bg-opacity-80" />
                </div>

                {/* Prix de Base */}
                <div>
                    <label htmlFor="baseprice" className="block text-sm font-medium text-slate-700 mb-1">Prix de Base (DZD) *</label>
                    <input type="number" id="baseprice" name="baseprice" value={formData.baseprice} onChange={handleChange} required min="0" step="0.01"
                        className="w-full p-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition bg-white bg-opacity-80" />
                </div>

                {/* Submit Buttons */}
                <div className="flex justify-end gap-4 border-t border-slate-200 pt-6">
                    <Link href="/products" className="bg-slate-200 text-slate-700 hover:bg-slate-300 px-5 py-2 rounded-lg font-medium text-sm transition">
                        Annuler
                    </Link>
                    <button type="submit" disabled={isSaving}
                        className="bg-blue-600 text-white hover:bg-blue-700 px-5 py-2 rounded-lg font-medium text-sm transition disabled:opacity-50">
                        {isSaving ? 'Sauvegarde...' : (isEditing ? 'Mettre à Jour Produit' : 'Ajouter Produit')}
                    </button>
                </div>
            </form>
        </>
    );
}

// Main page component using Suspense for searchParams
export default function ProductFormPage() {
    return (
        <div className="p-4 sm:p-6 lg:p-8 min-h-screen">
            <div className="max-w-3xl mx-auto">
                {/* En-tête */}
                <div className="mb-6 flex justify-between items-center">
                    <h1 className="text-3xl font-bold text-blue-800">
                        <Suspense fallback={<span>Chargement...</span>}>
                            <DynamicTitle />
                        </Suspense>
                    </h1>
                    <Link href="/products" className="text-blue-600 hover:text-blue-800 text-sm font-medium">
                        ← Retour à la Liste
                    </Link>
                </div>
                <div className="glassy-container p-6 sm:p-8">
                    <Suspense fallback={<p className="text-center py-12 text-slate-500">Chargement du formulaire...</p>}>
                        <ProductFormContent />
                    </Suspense>
                </div>
            </div>
        </div>
    );
}

// Helper to dynamically set title based on searchParams
function DynamicTitle() {
    const searchParams = useSearchParams();
    const productId = searchParams.get('id');
    return <>{productId ? 'Modifier Produit' : 'Ajouter Nouveau Produit'}</>;
}