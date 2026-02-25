'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import api from '@/lib/api';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useReactToPrint } from 'react-to-print';
import { ResizableHeader, useColumnWidths } from '@/components/ResizableSortableHeader';
import { StandardDocument, DocumentType, DocumentData } from '@/components/print/StandardDocument';

// --- Interfaces ---
interface Brand { brandid: number; brandname: string; }
interface Factory { factoryid: number; factoryname: string; }
interface Warehouse { warehouseid: number; warehousename: string; }
interface Unit { unitid: number; unitcode: string; unitname: string; }

interface Product {
  productid: number;
  productcode: string;
  productname: string;
  baseprice: number;
  purchaseprice?: number; // From API (correct field)
  prixachat?: number;  // From mv_Catalogue view
  prixvente?: number;  // From mv_Catalogue view
  brandname?: string;
  famille?: string;
  totalqty?: number;
  nbpalette?: number;
  nbcolis?: number;
  derivedpiecespercolis?: number;
  derivedcolisperpalette?: number;
}

interface POItem {
  tempId: string;
  productId: number;
  productCode: string;
  productName: string;
  brandName: string;
  currentStock: number;
  currentPalettes: number;
  currentCartons: number;
  piecesPerCarton: number;
  cartonsPerPalette: number;
  sqmPerPiece: number;
  palettes: number;
  cartons: number;
  quantity: number;
  unitId: number;
  unitPrice: number;
  lineTotal: number;
}

// --- Helpers ---
const formatCurrencyDZD = (amount: number | null | undefined): string =>
  new Intl.NumberFormat('fr-DZ', { style: 'currency', currency: 'DZD', minimumFractionDigits: 2 })
    .format(Number(amount) || 0);

// Parse tile dimensions from product name (same as POS)
const parseSqmPerPiece = (productName: string): number => {
  // FICHE products (sample/technical sheets) are single items, not tiles
  if (productName.toLowerCase().startsWith('fiche')) return 0;
  const sizeMatch = productName.match(/(\d+)[x\/](\d+)/i);
  if (sizeMatch) {
    const dim1 = parseInt(sizeMatch[1]) / 100;
    const dim2 = parseInt(sizeMatch[2]) / 100;
    return dim1 * dim2;
  }
  return 0.36; // Default 60x60
};

// --- Unit Quantity Conversion (PCS <-> SQM <-> CARTON) ---
// Converts quantity between units, using PCS as the base unit
const convertQuantity = (
  value: number,
  fromUnit: string,
  toUnit: string,
  sqmPerPiece: number,
  piecesPerCarton: number
): number => {
  if (fromUnit === toUnit) return value;

  // Convert to PCS first (base unit)
  let pcs = value;
  if (fromUnit === 'SQM' && sqmPerPiece > 0) {
    pcs = value / sqmPerPiece;
  } else if (fromUnit === 'CARTON' || fromUnit === 'CRT') {
    pcs = value * piecesPerCarton;
  }

  // Convert from PCS to target unit
  if (toUnit === 'SQM' && sqmPerPiece > 0) {
    return pcs * sqmPerPiece;
  } else if (toUnit === 'CARTON' || toUnit === 'CRT') {
    return piecesPerCarton > 0 ? pcs / piecesPerCarton : pcs;
  }
  return pcs; // PCS
};

// --- Main Component ---
export default function CreatePurchaseOrderPage() {
  const router = useRouter();

  // --- Data Lists ---
  const [brands, setBrands] = useState<Brand[]>([]);
  const [factories, setFactories] = useState<Factory[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);

  // --- Header State (auto-set, simplified) ---
  const [supplierId, setSupplierId] = useState<string>(''); // Will be auto-detected from first product's brand
  const [warehouseId, setWarehouseId] = useState<number>(1); // Always Main Warehouse
  const [orderDate, setOrderDate] = useState(new Date().toISOString().split('T')[0]); // Today
  const [expectedDate, setExpectedDate] = useState('');
  const [ownershipType, setOwnershipType] = useState<'OWNED' | 'CONSIGNMENT'>('OWNED'); // Always OWNED
  const [notes, setNotes] = useState('');
  const [payment, setPayment] = useState<number>(0);  // Amount paid
  const [paymentMethod, setPaymentMethod] = useState<'ESPECE' | 'VIREMENT' | 'CHEQUE'>('ESPECE');
  const [transportCost, setTransportCost] = useState<number>(0);

  // --- Cart State ---
  const [searchQuery, setSearchQuery] = useState('');
  const [cart, setCart] = useState<POItem[]>([]);

  // --- Submission State ---
  const [isLoadingDropdowns, setIsLoadingDropdowns] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);

  // --- Resizable Columns ---
  const { widths, handleResize } = useColumnWidths('purchasing-pos-table', {
    designation: 200,
    marque: 80,
    stock: 70,
    palettes: 80,
    cartons: 80,
    quantity: 90,
    unite: 60,
    prixachat: 90,
    totalligne: 100,
  });

  // --- Print Refs ---
  const bcRef = useRef<HTMLDivElement>(null);
  const handlePrintBC = useReactToPrint({
    content: () => bcRef.current,
    documentTitle: `BC-${orderDate.replace(/-/g, '')}`,
  });

  // --- Initialize Date ---
  useEffect(() => {
    setOrderDate(new Date().toISOString().split('T')[0]);
  }, []);

  // --- Load Data ---
  useEffect(() => {
    setIsLoadingDropdowns(true);
    Promise.all([
      api.getBrands(),
      api.getFactories(),
      api.getWarehouses(),
      // api.getProducts({ limit: 1000 }), // REMOVED: Replaced with server-side search
      Promise.resolve({ data: [], success: true, message: '' }),
      api.getUnits()
    ]).then(([brandRes, factoryRes, warehouseRes, productRes, unitRes]) => {
      if ([brandRes, factoryRes, warehouseRes, productRes, unitRes].some(res => res.message?.includes('token'))) {
        router.push('/login');
        throw new Error('Session expirée');
      }
      const factoriesData = (factoryRes.data as Factory[]) || [];
      const brandsData = (brandRes.data as Brand[]) || [];

      // Filter out brands that have the same name as a factory (avoid duplicates)
      const factoryNamesLower = new Set(factoriesData.map(f => f.factoryname.toLowerCase()));
      const filteredBrands = brandsData.filter(b => !factoryNamesLower.has(b.brandname.toLowerCase()));

      setBrands(filteredBrands);
      setFactories(factoriesData);
      setWarehouses((warehouseRes.data as Warehouse[]) || []);
      setProducts((productRes.data as Product[]) || []);
      setUnits((unitRes.data as Unit[]) || []);
    }).catch((error: any) => {
      console.error("Erreur chargement données:", error);
      setApiError(error.message);
    }).finally(() => {
      setIsLoadingDropdowns(false);
    });
  }, [router]);

  // --- Server-Side Search Effect ---
  useEffect(() => {
    if (searchQuery.length < 2) {
      setProducts([]); // Clear results if query is short
      return;
    }

    const timer = setTimeout(() => {
      setIsSearching(true);
      api.getProducts({ search: searchQuery, limit: 20 }) // Fetch top 20 matches
        .then(res => {
          setProducts(res.data as Product[] || []);
        })
        .catch(err => console.error("Search error:", err))
        .finally(() => setIsSearching(false));
    }, 400); // Debounce 400ms

    return () => clearTimeout(timer);
  }, [searchQuery]);

  const filteredProducts = products; // Products state now holds search results directly

  // --- Add Product to Cart (Like POS) ---
  const addToCart = useCallback((product: Product) => {
    // Check if already in cart
    if (cart.some(item => item.productId === product.productid)) {
      setSearchQuery('');
      return;
    }
    // Determine default unit based on product name
    // 120/60 products are sold in PCS, other tiles in SQM
    let defaultUnit = units.find(u => u.unitcode === 'PCS')?.unitid || units[0]?.unitid || 0;
    const productNameLower = product.productname.toLowerCase();
    const has12060 = productNameLower.includes('120/60') || productNameLower.includes('120x60');
    const hasTileDimensions = /\d+[x\/]\d+/.test(product.productname);
    const isFicheProduct = productNameLower.startsWith('fiche');
    const isSingleItemPackaging = (product.derivedpiecespercolis === 1 && product.derivedcolisperpalette === 1);

    // Check if packaging is integer (approximate check to avoid float issues)
    // If derivedpiecespercolis is like 2.0 or 5.0 -> Integer -> Sell in PCS
    // If derivedpiecespercolis is like 1.44 -> Decimal -> Sell in SQM
    const derivedPieces = product.derivedpiecespercolis || 0;
    const isIntegerPackaging = Math.abs(derivedPieces - Math.round(derivedPieces)) < 0.01 && derivedPieces > 0;

    if (hasTileDimensions && !isFicheProduct && !isSingleItemPackaging) {
      if (has12060) {
        // Exception: 120/60 defaults to PCS (Requested by user) - overriding previous exception
        defaultUnit = units.find(u => u.unitcode === 'PCS')?.unitid || defaultUnit;
      } else if (!isIntegerPackaging) {
        // Non-integer packaging (e.g. 1.44 treated as pcs/ctn in backend?) or just decimal logic -> SQM
        defaultUnit = units.find(u => u.unitcode === 'SQM')?.unitid || defaultUnit;
      }
      // Else: Integer packaging -> Stays PCS
    }

    // Prioritize prices from the Products table (PurchasePrice > BasePrice) over the View (PrixAchat) which might be stale/zero
    const unitPrice =
      (Number(product.prixachat) > 0 ? Number(product.prixachat) : 0) ||
      (Number(product.purchaseprice) > 0 ? Number(product.purchaseprice) : 0) ||
      0;

    console.log(`[PO Debug] Adding ${product.productname}: Selected Price=${unitPrice} (Purch=${product.purchaseprice}, Base=${product.baseprice}, View=${product.prixachat})`);
    const sqmPerPiece = parseSqmPerPiece(product.productname);

    // Use derived packaging info from backend (same as POS)
    // derivedpiecespercolis = qty per carton (in the stock's unit - SQM if stock is in SQM)
    const rawPackaging = product.derivedpiecespercolis || 0;
    let piecesPerCarton = rawPackaging;

    // Recalculate sqmPerPiece if we normalize packaging (same as POS)
    // This fixes the issue where 1.44 becomes 1.44 M2 instead of correct pieces
    if (sqmPerPiece > 0 && rawPackaging > 0 && rawPackaging % 1 !== 0) {
      // Logic fix: If packaging > 0 is decimal (e.g. 1.44), it's likely M2. Convert to pieces count.
      const calculatedPieces = Math.round(rawPackaging / sqmPerPiece);
      if (Math.abs(calculatedPieces * sqmPerPiece - rawPackaging) < 0.05) {
        piecesPerCarton = calculatedPieces;
        // CRITICAL FIX: Update sqmPerPiece to match the normalized packaging
        // e.g. 1.42 / 7 = 0.2028... instead of fixed 0.2025
        // This ensures Total SQM = Cartons * Pieces * (Real SQM/Piece) matches the original 1.42 * Cartons
        /* 
           Why this matters:
           Selling POS calculates: 1056 ctn * 1.417... (real M2/ctn) = 1496.88
           Purchasing POS was calculating: 1056 ctn * 1.42 (fixed M2/ctn) = 1499.52
           WAIT - The user says Purchasing is WRONG (1496.88) and Selling is RIGHT (1499.52)
           Let's look at the user screenshot again. 
           Selling POS: 22 Palettes, 1056 Cartons, Qty 1499.52
           Purchasing POS: 22 Palettes, 1056 Cartons, Qty 1496.88
           
           Product: VENAS PLUS 45/45
           Size: 45x45 = 0.2025 m2/piece
           
           CASE A: Purchasing gives 1496.88
           1496.88 / 1056 = 1.4175 m2/carton
           1.4175 / 0.2025 = 7 pieces/carton EXACTLY.
           So Purchasing thinks it's 7 pieces * 0.2025 * 1056 = 1496.88.
           
           CASE B: Selling POS gives 1499.52
           1499.52 / 1056 = 1.42 m2/carton.
           1.42 / 0.2025 = 7.0123... pieces.
           
           So the Catalog probably has "1.42" in the "PiecesPerCarton" (actually M2/Carton) field.
           
           In Selling POS logic (lines 118-134 of sales/pos/page.tsx):
           - It detects 1.42 is decimal.
           - Calculates pieces = round(1.42 / 0.2025) = 7.
           - CHECKS: abs(7 * 0.2025 - 1.42) = abs(1.4175 - 1.42) = 0.0025 < 0.05. TRUE.
           - SETS piecesPerCarton = 7.
           - SETS sqmPerPiece = 1.42 / 7 = 0.202857...
           
           So Selling POS *changes* the sqmPerPiece to be "PackageM2 / Pieces".
           
           Purchasing POS (current code):
           - Detects 1.42 is decimal.
           - Calculates pieces = 7.
           - Sets piecesPerCarton = 7.
           - DOES NOT update sqmPerPiece. It stays 0.2025 (45x45).
           - Result: 1056 * 7 * 0.2025 = 1496.88.
           
           Selling POS Result: 1056 * 7 * (1.42/7) = 1056 * 1.42 = 1499.52.
           
           The user wants Purchasing (1496.88) to become Selling (1499.52).
           So I MUST apply the same logic: update sqmPerPiece.
        */
        // We must update the sqmPerPiece in the item to match the effective sqm per piece derived from the box size
        // However, sqmPerPiece is a const passed towards item. 
        // We can't change the const `sqmPerPiece` variable easily without changing let.
        // But we are passing it to the item.
      }
    }

    // We need to capture the *potentially modified* sqmPerPiece.
    // Let's refactor slightly to allow this.
    let effectiveSqmPerPiece = sqmPerPiece;

    if (sqmPerPiece > 0 && rawPackaging > 0 && rawPackaging % 1 !== 0) {
      const calculatedPieces = Math.round(rawPackaging / sqmPerPiece);
      if (Math.abs(calculatedPieces * sqmPerPiece - rawPackaging) < 0.05) {
        piecesPerCarton = calculatedPieces;
        // FIX: Match Selling POS logic
        effectiveSqmPerPiece = rawPackaging / calculatedPieces;
        console.log(`[PO Fix] Converted ${rawPackaging} M2/ctn to ${piecesPerCarton} Pcs/ctn. New SQM/Pc: ${effectiveSqmPerPiece}`);
      }
    }

    // Fallback if still 0
    if (piecesPerCarton === 0) {
      piecesPerCarton = effectiveSqmPerPiece * 4;
    }

    // cartonsPerPalette logic
    const cartonsPerPalette = product.derivedcolisperpalette || 36;

    const newItem: POItem = {
      tempId: `po-${Date.now()}-${Math.random()}`,
      productId: product.productid,
      productCode: product.productcode,
      productName: product.productname,
      brandName: product.brandname || product.famille || '',
      currentStock: product.totalqty || 0,
      currentPalettes: product.nbpalette || 0,
      currentCartons: product.nbcolis || 0,
      piecesPerCarton,  // This is qty per carton (SQM per carton if unit is SQM)
      cartonsPerPalette,
      sqmPerPiece: effectiveSqmPerPiece, // USE UPDATED VALUE
      palettes: 0,
      cartons: 0,
      quantity: 1,
      unitId: defaultUnit,
      unitPrice,
      lineTotal: unitPrice * 1,
    };

    setCart([...cart, newItem]);
    setSearchQuery('');

    // Auto-set supplier/brand from first product
    if (!supplierId && product.brandname) {
      const matchingBrand = brands.find(b => b.brandname === product.brandname);
      if (matchingBrand) {
        setSupplierId(`brand-${matchingBrand.brandid}`);
      }
    }
  }, [cart, units, supplierId, brands]);

  // --- Remove Item ---
  const removeFromCart = (tempId: string) => {
    setCart(cart.filter(item => item.tempId !== tempId));
  };

  // --- Update Cart Item (matches POS logic exactly) ---
  const updateCartItem = (index: number, field: keyof POItem, value: number) => {
    const updatedCart = [...cart];
    const item = { ...updatedCart[index] };

    // Get current unit code for conversions
    const currentUnitCode = units.find((u: Unit) => u.unitid === item.unitId)?.unitcode || 'PCS';

    // When UNIT changes, convert quantity (NOT price)
    if (field === 'unitId') {
      const newUnitId = Number(value);
      const oldUnitCode = units.find((u: Unit) => u.unitid === item.unitId)?.unitcode || 'PCS';
      const newUnitCode = units.find((u: Unit) => u.unitid === newUnitId)?.unitcode || 'PCS';

      // Convert quantity to new unit
      const convertedQty = convertQuantity(
        item.quantity,
        oldUnitCode,
        newUnitCode,
        item.sqmPerPiece,
        item.piecesPerCarton
      );

      item.quantity = parseFloat(convertedQty.toFixed(2));
      item.unitId = newUnitId;

      // Recalculate cartons and palettes based on new quantity
      if (newUnitCode === 'CARTON' || newUnitCode === 'CRT') {
        item.cartons = parseFloat(item.quantity.toFixed(2));
        if (item.cartonsPerPalette > 0) {
          item.palettes = parseFloat((item.cartons / item.cartonsPerPalette).toFixed(2));
        }
      } else if (item.piecesPerCarton > 0) {
        // For PCS or SQM, calculate cartons from pieces equivalent
        const piecesEquivalent = newUnitCode === 'SQM' && item.sqmPerPiece > 0
          ? item.quantity / item.sqmPerPiece
          : item.quantity;
        item.cartons = parseFloat((piecesEquivalent / item.piecesPerCarton).toFixed(2));
        if (item.cartonsPerPalette > 0) {
          item.palettes = parseFloat((item.cartons / item.cartonsPerPalette).toFixed(2));
        }
      }

      item.lineTotal = item.quantity * item.unitPrice;
      updatedCart[index] = item;
      setCart(updatedCart);
      return;
    }

    // Handle unitPrice changes
    if (field === 'unitPrice') {
      item.unitPrice = value;
      item.lineTotal = item.quantity * item.unitPrice;
      updatedCart[index] = item;
      setCart(updatedCart);
      return;
    }

    // Auto-calculate palettes and cartons when QUANTITY changes
    if (field === 'quantity') {
      const qty = parseFloat(String(value)) || 0;
      item.quantity = qty;

      // Convert quantity to pieces based on current unit
      let piecesQty: number;
      if (currentUnitCode === 'SQM' && item.sqmPerPiece > 0) {
        // Quantity is in SQM, convert to pieces: pieces = sqm / sqmPerPiece
        piecesQty = qty / item.sqmPerPiece;
      } else if (currentUnitCode === 'CARTON' || currentUnitCode === 'CRT') {
        // Quantity is in cartons, convert to pieces: pieces = cartons * piecesPerCarton
        piecesQty = item.piecesPerCarton > 0 ? qty * item.piecesPerCarton : qty;
      } else {
        // Quantity is already in pieces (PCS)
        piecesQty = qty;
      }

      // Only auto-calculate if piecesPerCarton is available
      if (item.piecesPerCarton > 0) {
        const calculatedCartons = parseFloat((piecesQty / item.piecesPerCarton).toFixed(2));
        item.cartons = calculatedCartons;

        if (item.cartonsPerPalette > 0) {
          item.palettes = parseFloat((calculatedCartons / item.cartonsPerPalette).toFixed(2));
        }
      }
    }

    // When CARTONS is manually edited, recalculate quantity and palettes
    if (field === 'cartons') {
      const cartons = parseFloat(String(value)) || 0;
      item.cartons = cartons;

      // Recalculate quantity from cartons (in pieces first, then convert to current unit)
      if (item.piecesPerCarton > 0) {
        const piecesQty = cartons * item.piecesPerCarton;

        // Convert pieces to the current unit
        if (currentUnitCode === 'SQM' && item.sqmPerPiece > 0) {
          item.quantity = parseFloat((piecesQty * item.sqmPerPiece).toFixed(2));
        } else if (currentUnitCode === 'CARTON' || currentUnitCode === 'CRT') {
          item.quantity = cartons; // If unit is CARTON, quantity = cartons
        } else {
          item.quantity = piecesQty; // PCS
        }
      }
      // Recalculate palettes from cartons
      if (item.cartonsPerPalette > 0) {
        item.palettes = parseFloat((cartons / item.cartonsPerPalette).toFixed(2));
      }
    }

    // When PALETTES is manually edited, recalculate cartons and quantity
    if (field === 'palettes') {
      const palettes = parseFloat(String(value)) || 0;
      item.palettes = palettes;

      // Recalculate cartons from palettes
      if (item.cartonsPerPalette > 0) {
        item.cartons = parseFloat((palettes * item.cartonsPerPalette).toFixed(2));
        // Recalculate quantity from cartons (in pieces first, then convert to current unit)
        if (item.piecesPerCarton > 0) {
          const piecesQty = item.cartons * item.piecesPerCarton;

          // Convert pieces to the current unit
          if (currentUnitCode === 'SQM' && item.sqmPerPiece > 0) {
            item.quantity = parseFloat((piecesQty * item.sqmPerPiece).toFixed(2));
          } else if (currentUnitCode === 'CARTON' || currentUnitCode === 'CRT') {
            item.quantity = item.cartons; // If unit is CARTON, quantity = cartons
          } else {
            item.quantity = piecesQty; // PCS
          }
        }
      }
    }

    item.lineTotal = item.quantity * item.unitPrice;
    updatedCart[index] = item;
    setCart(updatedCart);
  };

  // --- Totals ---
  const totalHT = cart.reduce((sum, item) => sum + item.lineTotal, 0);
  const totalPalettes = cart.reduce((sum, item) => sum + item.palettes, 0);
  const totalCartons = cart.reduce((sum, item) => sum + item.cartons, 0);
  const totalQty = cart.reduce((sum, item) => sum + item.quantity, 0);

  // --- Submit Order ---
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setApiError(null);

    if (cart.length === 0) {
      setApiError("Veuillez ajouter au moins un article.");
      return;
    }

    // Auto-detect supplier from first cart item's brand if not manually set
    let finalSupplierId = supplierId;
    if (!finalSupplierId && cart.length > 0) {
      const firstItemBrand = cart[0].brandName;
      if (firstItemBrand) {
        const matchingBrand = brands.find(b => b.brandname === firstItemBrand);
        if (matchingBrand) {
          finalSupplierId = `brand-${matchingBrand.brandid}`;
        }
      }
    }

    // Parse supplier ID (format: "brand-123" or "factory-456")
    let supplierIdParsed: number | null = null;
    let supplierType: 'BRAND' | 'FACTORY' | null = null;

    if (finalSupplierId && finalSupplierId.includes('-')) {
      const [type, idNum] = finalSupplierId.split('-');
      supplierIdParsed = parseInt(idNum, 10);
      supplierType = type.toUpperCase() as 'BRAND' | 'FACTORY';
    }

    setIsSaving(true);
    try {
      const payload = {
        supplierId: supplierIdParsed || undefined,
        supplierType: supplierType || undefined,
        warehouseId: Number(warehouseId),
        orderDate,
        expectedDeliveryDate: expectedDate || null,
        ownershipType,
        notes,
        payment: payment || 0,
        paymentMethod,
        deliveryCost: transportCost || 0,
        items: cart.map(item => ({
          productId: item.productId,
          quantity: item.quantity,
          unitId: item.unitId,
          unitPrice: item.unitPrice,
          palletCount: item.palettes,
          colisCount: item.cartons,
        })),
      };

      const response = await api.createPurchaseOrder(payload);
      if (response.success) {
        alert('Bon de commande créé avec succès!');
        router.push('/purchasing');
      } else {
        throw new Error(response.message || 'Erreur lors de la création');
      }
    } catch (error: any) {
      console.error('Erreur création BC:', error);
      setApiError(error.message);
    } finally {
      setIsSaving(false);
    }
  };

  // --- Prepare Print Data ---
  const prepareDocumentData = (): DocumentData => {
    // Parse supplier name from ID
    let supplierName = 'Fournisseur';
    if (supplierId) {
      const [type, idStr] = supplierId.split('-');
      const id = parseInt(idStr, 10);
      if (type === 'brand') {
        supplierName = brands.find(b => b.brandid === id)?.brandname || 'Fournisseur';
      } else {
        supplierName = factories.find(f => f.factoryid === id)?.factoryname || 'Fournisseur';
      }
    }
    return {
      number: `BC-${orderDate.replace(/-/g, '')}`,
      date: orderDate,
      clientName: supplierName,
      clientAddress: warehouses.find(w => w.warehouseid === warehouseId)?.warehousename || '',
      items: cart.map(item => ({
        productCode: item.productCode,
        productName: item.productName,
        brandName: item.brandName,
        quantity: item.quantity,
        unitCode: units.find(u => u.unitid === item.unitId)?.unitcode || 'PCS',
        unitPrice: item.unitPrice,
        lineTotal: item.lineTotal,
        palletCount: item.palettes,
        boxCount: item.cartons,
        piecesPerCarton: item.piecesPerCarton,
        cartonsPerPalette: item.cartonsPerPalette,
      })),
      totalHT,
      deliveryCost: transportCost,
      createdBy: typeof window !== 'undefined'
        ? (localStorage.getItem('user_name') || 'Achat')
        : 'Achat',
    };
  };

  // --- Loading State ---
  if (isLoadingDropdowns) {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block w-10 h-10 border-4 border-green-200 border-t-green-600 rounded-full animate-spin mb-4"></div>
          <p className="text-slate-500">Chargement...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 via-emerald-50 to-teal-50 p-2 md:p-4">
      {/* Hidden Print Template */}
      <div style={{ display: 'none' }}>
        <StandardDocument ref={bcRef} type="PURCHASE_ORDER" data={prepareDocumentData()} />
      </div>

      <div className="max-w-full mx-auto">
        {/* === HEADER BAR === */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 mb-4">
          <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-green-600 rounded-lg flex items-center justify-center">
                <span className="text-white text-xl">📦</span>
              </div>
              <div>
                <h1 className="text-xl font-bold text-slate-800">Nouveau Bon de Commande</h1>
                <p className="text-xs text-slate-500">Achat Fournisseur → Stock</p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Link
                href="/purchasing"
                className="bg-slate-100 hover:bg-slate-200 text-slate-700 px-3 py-2 rounded-lg text-sm font-medium transition flex items-center gap-1"
              >
                ← Retour
              </Link>
            </div>
          </div>
        </div>

        {/* === ERROR === */}
        {apiError && (
          <div className="mb-4 p-3 bg-red-50 text-red-700 border border-red-200 rounded-lg text-sm">
            <strong>Erreur:</strong> {apiError}
          </div>
        )}

        {/* === MAIN CONTENT === */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          {/* Search Bar */}
          <div className="p-4 border-b border-slate-100 bg-gradient-to-r from-green-50 to-emerald-50">
            <div className="relative max-w-2xl">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="🔍 Rechercher un produit (code ou nom)..."
                className="w-full p-3 pl-4 pr-10 text-sm border-2 border-green-300 rounded-xl bg-white focus:ring-2 focus:ring-green-500 focus:border-green-500"
              />
              {searchQuery && (
                <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-2">
                  {isSearching && <div className="w-4 h-4 border-2 border-green-500 border-t-transparent rounded-full animate-spin"></div>}
                  <button
                    onClick={() => setSearchQuery('')}
                    className="text-slate-400 hover:text-slate-600"
                  >
                    ✕
                  </button>
                </div>
              )}

              {/* Search Results Dropdown */}
              {filteredProducts.length > 0 && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-lg shadow-lg z-50 max-h-60 overflow-y-auto">
                  {filteredProducts.map(p => (
                    <button
                      key={p.productid}
                      type="button"
                      onClick={() => addToCart(p)}
                      className="w-full px-4 py-3 text-left hover:bg-green-50 border-b border-slate-100 last:border-b-0 flex justify-between items-center"
                    >
                      <div>
                        <div className="font-medium text-slate-800">
                          {p.productname}
                          <span className="text-slate-500 text-xs ml-2 font-normal">
                            ({p.brandname || p.famille || 'Sans marque'})
                          </span>
                        </div>
                        <div className="text-xs text-slate-500">
                          {p.productcode}
                        </div>
                      </div>
                      <div className="text-right">
                        {p.baseprice > 0 && <div className="text-xxs text-slate-400">Base: {formatCurrencyDZD(p.baseprice)}</div>}
                        <div className="text-sm font-bold text-green-600">
                          {formatCurrencyDZD(Number(p.purchaseprice) || Number(p.baseprice) || Number(p.prixachat))}
                        </div>
                        <div className="text-xs text-slate-400">Stock: {p.totalqty || 0}</div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Cart Table */}
          <div className="overflow-x-auto" style={{ maxHeight: 'calc(100vh - 400px)' }}>
            <table className="w-full text-sm" style={{ tableLayout: 'fixed' }}>
              <thead className="bg-slate-700 text-white text-xs uppercase sticky top-0">
                <tr>
                  <th className="px-2 py-2.5 text-left" style={{ width: 35 }}>#</th>
                  <ResizableHeader columnKey="designation" width={widths.designation} onResize={handleResize} className="px-2 py-2.5 text-left">Désignation</ResizableHeader>
                  <ResizableHeader columnKey="marque" width={widths.marque} onResize={handleResize} className="px-2 py-2.5 text-left">Marque</ResizableHeader>
                  <ResizableHeader columnKey="stock" width={widths.stock} onResize={handleResize} className="px-2 py-2.5 text-right">Stock Actuel</ResizableHeader>
                  <ResizableHeader columnKey="palettes" width={widths.palettes} onResize={handleResize} className="px-2 py-2.5 text-center" style={{ backgroundColor: '#3730a3' }}>Palettes</ResizableHeader>
                  <ResizableHeader columnKey="cartons" width={widths.cartons} onResize={handleResize} className="px-2 py-2.5 text-center" style={{ backgroundColor: '#3730a3' }}>Cartons</ResizableHeader>
                  <ResizableHeader columnKey="quantity" width={widths.quantity} onResize={handleResize} className="px-2 py-2.5 text-center" style={{ backgroundColor: '#166534' }}>Quantité</ResizableHeader>
                  <ResizableHeader columnKey="unite" width={widths.unite} onResize={handleResize} className="px-2 py-2.5 text-left">Unité</ResizableHeader>
                  <ResizableHeader columnKey="prixachat" width={widths.prixachat} onResize={handleResize} className="px-2 py-2.5 text-right">Prix Achat</ResizableHeader>
                  <ResizableHeader columnKey="totalligne" width={widths.totalligne} onResize={handleResize} className="px-2 py-2.5 text-right">Total</ResizableHeader>
                  <th className="px-2 py-2.5" style={{ width: 35 }}></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {cart.length === 0 ? (
                  <tr>
                    <td colSpan={11} className="px-4 py-16 text-center text-slate-400">
                      <div className="text-4xl mb-2">📦</div>
                      <div>Aucun article. Recherchez et ajoutez des produits ci-dessus.</div>
                    </td>
                  </tr>
                ) : (
                  cart.map((item, index) => (
                    <tr key={item.tempId} className="hover:bg-green-50">
                      <td className="px-2 py-2 text-slate-400">{index + 1}</td>
                      <td className="px-2 py-2">
                        <div className="font-medium text-slate-800 truncate">{item.productName}</div>
                        {item.piecesPerCarton > 0 && (
                          <div className="text-xs text-slate-400">{item.piecesPerCarton} pcs/ctn • {item.cartonsPerPalette} ctn/pal</div>
                        )}
                      </td>
                      <td className="px-2 py-2 text-slate-600 text-xs">{item.brandName || '-'}</td>
                      <td className="px-2 py-2 text-right text-slate-500 bg-slate-50 font-mono">{item.currentStock.toLocaleString()}</td>
                      <td className="px-2 py-2 bg-indigo-50">
                        <input
                          type="number"
                          min="0"
                          value={item.palettes}
                          onChange={(e) => updateCartItem(index, 'palettes', Number(e.target.value))}
                          className="w-full text-center p-1.5 border-2 border-indigo-300 rounded font-bold text-indigo-900 bg-white"
                        />
                      </td>
                      <td className="px-2 py-2 bg-indigo-50">
                        <input
                          type="number"
                          min="0"
                          value={item.cartons}
                          onChange={(e) => updateCartItem(index, 'cartons', Number(e.target.value))}
                          className="w-full text-center p-1.5 border-2 border-indigo-300 rounded font-bold text-indigo-900 bg-white"
                        />
                      </td>
                      <td className="px-2 py-2 bg-green-50">
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={item.quantity}
                          onChange={(e) => updateCartItem(index, 'quantity', Number(e.target.value))}
                          className="w-full text-center p-1.5 border-2 border-green-400 rounded font-bold text-green-900 bg-white"
                        />
                      </td>
                      <td className="px-2 py-2">
                        <select
                          value={item.unitId}
                          onChange={(e) => updateCartItem(index, 'unitId', Number(e.target.value))}
                          className="w-full p-1.5 text-xs border border-slate-200 rounded"
                        >
                          {units.filter(u => u.unitcode !== 'BOX').map(u => (
                            <option key={u.unitid} value={u.unitid}>{u.unitcode}</option>
                          ))}
                        </select>
                      </td>
                      <td className="px-2 py-2">
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={item.unitPrice}
                          onChange={(e) => updateCartItem(index, 'unitPrice', Number(e.target.value))}
                          className="w-full text-right p-1.5 border border-slate-200 rounded font-mono"
                        />
                      </td>
                      <td className="px-2 py-2 text-right font-bold text-green-700 bg-green-50">
                        {formatCurrencyDZD(item.lineTotal)}
                      </td>
                      <td className="px-2 py-2 text-center">
                        <button
                          type="button"
                          onClick={() => removeFromCart(item.tempId)}
                          className="text-red-500 hover:text-red-700 font-bold"
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

          {/* Footer / Totals */}
          <div className="p-4 bg-gradient-to-r from-slate-50 to-green-50 border-t border-slate-200">
            <div className="flex flex-wrap items-center justify-between gap-4">
              {/* Left: Summary Stats */}
              <div className="flex flex-wrap gap-4 text-sm">
                <div className="bg-white px-4 py-2 rounded-lg border border-slate-200">
                  <span className="text-slate-500">Articles:</span>
                  <span className="ml-2 font-bold text-slate-700">{cart.length}</span>
                </div>
                <div className="bg-indigo-50 px-4 py-2 rounded-lg border border-indigo-200">
                  <span className="text-indigo-600">Palettes:</span>
                  <span className="ml-2 font-bold text-indigo-800">{totalPalettes}</span>
                </div>
                <div className="bg-indigo-50 px-4 py-2 rounded-lg border border-indigo-200">
                  <span className="text-indigo-600">Cartons:</span>
                  <span className="ml-2 font-bold text-indigo-800">{totalCartons}</span>
                </div>
                <div className="bg-green-50 px-4 py-2 rounded-lg border border-green-200">
                  <span className="text-green-600">Qté Totale:</span>
                  <span className="ml-2 font-bold text-green-800">{totalQty.toFixed(2)}</span>
                </div>
              </div>

              {/* Center: Transport & Payment Input */}
              <div className="flex items-center gap-3">
                <div>
                  <label className="block text-xs text-slate-500 mb-1">Date Commande</label>
                  <input
                    type="date"
                    value={orderDate}
                    onChange={(e) => setOrderDate(e.target.value)}
                    className="w-36 p-2 text-sm border border-slate-200 rounded-lg bg-white"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-500 mb-1">Transport</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={transportCost}
                    onChange={(e) => setTransportCost(Number(e.target.value))}
                    className="w-28 p-2 text-sm border border-slate-200 rounded-lg bg-white text-right"
                    placeholder="0.00"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-500 mb-1">Versement</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={payment}
                    onChange={(e) => setPayment(Number(e.target.value))}
                    className="w-32 p-2 text-sm border-2 border-green-300 rounded-lg bg-white font-bold text-green-800 text-right"
                    placeholder="0.00"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-500 mb-1">Mode Paiement</label>
                  <select
                    value={paymentMethod}
                    onChange={(e) => setPaymentMethod(e.target.value as 'ESPECE' | 'VIREMENT' | 'CHEQUE')}
                    className="w-28 p-2 text-sm border border-slate-200 rounded-lg bg-white"
                  >
                    <option value="ESPECE">💵 Espèce</option>
                    <option value="VIREMENT">🏦 Virement</option>
                    <option value="CHEQUE">📝 Chèque</option>
                  </select>
                </div>
              </div>

              {/* Right: Total + Submit + Print */}
              <div className="flex items-center gap-4">
                <div className="text-right">
                  <div className="text-xs text-slate-500">Total Commande (HT)</div>
                  <div className="text-lg font-bold text-slate-700">{formatCurrencyDZD(totalHT)}</div>
                  {transportCost > 0 && <div className="text-xs text-slate-500">+ Transport: {formatCurrencyDZD(transportCost)}</div>}
                  <div className="text-2xl font-bold text-green-700">{formatCurrencyDZD(totalHT + transportCost)}</div>
                  {payment > 0 && (
                    <div className="text-xs text-orange-600">Reste: {formatCurrencyDZD((totalHT + transportCost) - payment)}</div>
                  )}
                </div>

                <button
                  type="button"
                  onClick={handlePrintBC}
                  disabled={cart.length === 0}
                  className="bg-slate-100 hover:bg-slate-200 text-slate-700 px-4 py-3 rounded-xl font-bold text-sm transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  🖨️ Imprimer
                </button>

                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={isSaving || cart.length === 0}
                  className="bg-green-600 hover:bg-green-700 text-white px-6 py-3 rounded-xl font-bold text-sm transition shadow-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  {isSaving ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                      Création...
                    </>
                  ) : (
                    <>✓ Créer Bon de Commande</>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div >
  );
}