import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useReactToPrint } from 'react-to-print';
import api from '@/lib/api';
import Link from 'next/link';
import { ResizableHeader, useColumnWidths } from '@/components/ResizableSortableHeader';
import { StandardDocument, DocumentData } from '@/components/print/StandardDocument';

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
  purchaseprice?: number;
  prixachat?: number;
  prixvente?: number;
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
  poItemId?: number;
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

interface PurchaseOrderFormProps {
  mode: 'create' | 'edit';
  poId?: number;
}

const formatCurrencyDZD = (amount: number | null | undefined): string =>
  new Intl.NumberFormat('fr-DZ', { style: 'currency', currency: 'DZD', minimumFractionDigits: 2 })
    .format(Number(amount) || 0);

const parseSqmPerPiece = (productName: string): number => {
  if (productName.toLowerCase().startsWith('fiche')) return 0;
  const sizeMatch = productName.match(/(\d+)[x\/](\d+)/i);
  if (sizeMatch) {
    const dim1 = parseInt(sizeMatch[1]) / 100;
    const dim2 = parseInt(sizeMatch[2]) / 100;
    return dim1 * dim2;
  }
  return 0.36;
};

const convertQuantity = (
  value: number,
  fromUnit: string,
  toUnit: string,
  sqmPerPiece: number,
  piecesPerCarton: number
): number => {
  if (fromUnit === toUnit) return value;

  let pcs = value;
  if (fromUnit === 'SQM' && sqmPerPiece > 0) {
    pcs = value / sqmPerPiece;
  } else if (fromUnit === 'CARTON' || fromUnit === 'CRT') {
    pcs = value * piecesPerCarton;
  }

  if (toUnit === 'SQM' && sqmPerPiece > 0) {
    return pcs * sqmPerPiece;
  } else if (toUnit === 'CARTON' || toUnit === 'CRT') {
    return piecesPerCarton > 0 ? pcs / piecesPerCarton : pcs;
  }
  return pcs;
};

export function PurchaseOrderForm({ mode, poId }: PurchaseOrderFormProps) {
  const router = useRouter();

  // --- Data Lists ---
  const [brands, setBrands] = useState<Brand[]>([]);
  const [factories, setFactories] = useState<Factory[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);

  // --- Header State ---
  const [supplierId, setSupplierId] = useState<string>('');
  const [warehouseId, setWarehouseId] = useState<number>(1);
  const [orderDate, setOrderDate] = useState('');
  const [expectedDate, setExpectedDate] = useState('');
  const [ownershipType, setOwnershipType] = useState<'OWNED' | 'CONSIGNMENT'>('OWNED');
  const [notes, setNotes] = useState('');
  const [payment, setPayment] = useState<number>(0);
  const [paymentMethod, setPaymentMethod] = useState<'ESPECE' | 'VIREMENT' | 'CHEQUE'>('ESPECE');
  const [transportCost, setTransportCost] = useState<number>(0);
  const [poNumber, setPoNumber] = useState('');

  // --- Cart State ---
  const [searchQuery, setSearchQuery] = useState('');
  const [cart, setCart] = useState<POItem[]>([]);

  // --- Submission State ---
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);

  // --- Column Widths ---
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

  const bcRef = useRef<HTMLDivElement>(null);
  const handlePrintBC = useReactToPrint({
    content: () => bcRef.current,
    documentTitle: poNumber || `BC-${orderDate.replace(/-/g, '')}`,
  });

  // --- Load Initial Data ---
  useEffect(() => {
    const init = async () => {
      setIsLoading(true);
      try {
        const [brandRes, factoryRes, warehouseRes, unitRes] = await Promise.all([
          api.getBrands(),
          api.getFactories(),
          api.getWarehouses(),
          api.getUnits(),
        ]);

        if ([brandRes, factoryRes, warehouseRes, unitRes].some(res => res.message?.includes('token'))) {
          router.push('/login');
          return;
        }

        const factoriesData = (factoryRes.data as Factory[]) || [];
        const brandsData = (brandRes.data as Brand[]) || [];
        const unitsList = (unitRes.data as Unit[]) || [];

        const factoryNamesLower = new Set(factoriesData.map(f => f.factoryname.toLowerCase()));
        const filteredBrands = brandsData.filter(b => !factoryNamesLower.has(b.brandname.toLowerCase()));

        setBrands(filteredBrands);
        setFactories(factoriesData);
        setWarehouses((warehouseRes.data as Warehouse[]) || []);
        setUnits(unitsList);

        if (mode === 'edit' && poId) {
          const poRes = await api.getPurchaseOrder(poId);
          if (!poRes.success || !poRes.data) {
            throw new Error(poRes.message || 'Bon de commande introuvable');
          }
          const po = poRes.data;

          if (po.status !== 'PENDING' && po.status !== 'RECEIVED' && po.status !== 'PARTIAL') {
            alert('Seules les commandes en attente ou reçues peuvent être modifiées.');
            router.push('/purchasing');
            return;
          }

          setPoNumber(po.ponumber);
          setWarehouseId(po.warehouseid);
          const formatDateForInput = (dateString: string | null | undefined) => {
            if (!dateString) return '';
            return typeof dateString === 'string' ? dateString.split('T')[0] : '';
          };

          setOrderDate(formatDateForInput(po.orderdate));
          setExpectedDate(formatDateForInput(po.expecteddeliverydate));
          setOwnershipType(po.ownershiptype as 'OWNED' | 'CONSIGNMENT');
          setNotes(po.notes || '');

          if (po.notes && po.notes.includes('[MARQUE]')) {
            const brand = brandsData.find(b => b.brandid === po.factoryid);
            if (brand) setSupplierId(`brand-${brand.brandid}`);
            else setSupplierId(`factory-${po.factoryid}`);
          } else {
            setSupplierId(`factory-${po.factoryid}`);
          }

          const poProductIds = po.items?.map((item: any) => item.productid) || [];
          const specificProductsRes = poProductIds.length > 0
            ? await api.getProducts({ ids: poProductIds.join(','), limit: poProductIds.length })
            : { data: [] };

          const specificProducts = (specificProductsRes.data as Product[]) || [];
          const productMap = new Map<number, Product>();
          specificProducts.forEach(p => productMap.set(p.productid, p));

          if (po.items && Array.isArray(po.items)) {
            const loadedItems: POItem[] = po.items.map((item: any) => {
              let product = productMap.get(item.productid);

              if (!product) {
                product = {
                  productid: item.productid,
                  productcode: item.productcode || 'UNKNOWN',
                  productname: item.productname || 'Unknown Product',
                  baseprice: Number(item.unitprice) || 0,
                  totalqty: 0,
                  nbpalette: 0,
                  nbcolis: 0,
                  derivedpiecespercolis: item.qteparcolis,
                  derivedcolisperpalette: item.qtecolisparpalette,
                } as Product;
              }

              const unitPrice = parseFloat(item.unitprice);
              const quantity = parseFloat(item.quantity);
              const sqmPerPiece = parseSqmPerPiece(product.productname);

              const rawPackaging = item.qteparcolis || product.derivedpiecespercolis || 0;
              let piecesPerCarton = rawPackaging;

              if (sqmPerPiece > 0 && rawPackaging > 0 && rawPackaging % 1 !== 0) {
                const calculatedPieces = Math.round(rawPackaging / sqmPerPiece);
                if (Math.abs(calculatedPieces * sqmPerPiece - rawPackaging) < 0.05) piecesPerCarton = calculatedPieces;
              }
              if (piecesPerCarton === 0 && sqmPerPiece > 0) piecesPerCarton = sqmPerPiece * 4;

              const cartonsPerPalette = item.qtecolisparpalette || product.derivedcolisperpalette || 36;
              let cartons = 0;
              let palettes = 0;

              if (piecesPerCarton > 0) {
                const pieces = (item.unitcode === 'SQM' && sqmPerPiece > 0)
                  ? quantity / sqmPerPiece
                  : quantity;
                cartons = Math.round(pieces / piecesPerCarton * 100) / 100;
                if (cartonsPerPalette > 0) {
                  palettes = Math.round(cartons / cartonsPerPalette * 100) / 100;
                }
              }

              return {
                tempId: `po-${item.poitemid}`,
                poItemId: item.poitemid,
                productId: product.productid,
                productCode: product.productcode,
                productName: product.productname,
                brandName: product.brandname || product.famille || '',
                currentStock: product.totalqty || 0,
                currentPalettes: product.nbpalette || 0,
                currentCartons: product.nbcolis || 0,
                piecesPerCarton,
                cartonsPerPalette,
                sqmPerPiece,
                palettes,
                cartons,
                quantity,
                unitId: item.unitid,
                unitPrice,
                lineTotal: quantity * unitPrice,
              };
            });
            setCart(loadedItems);
          }
        } else {
          setOrderDate(new Date().toISOString().split('T')[0]);
        }
      } catch (err: any) {
        console.error(err);
        setApiError(err.message || 'Error initializing PO data');
      } finally {
        setIsLoading(false);
      }
    };
    init();
  }, [mode, poId, router]);

  // --- Server-Side Search Effect ---
  useEffect(() => {
    if (searchQuery.length < 2) {
      setProducts([]);
      return;
    }
    const timer = setTimeout(() => {
      setIsSearching(true);
      api.getProducts({ search: searchQuery, limit: 20 })
        .then(res => setProducts(res.data as Product[] || []))
        .catch(err => console.error(err))
        .finally(() => setIsSearching(false));
    }, 400);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  const filteredProducts = products;

  // --- Add Product to Cart ---
  const addToCart = useCallback((product: Product) => {
    if (cart.some(item => item.productId === product.productid)) {
      setSearchQuery('');
      return;
    }
    let defaultUnit = units.find(u => u.unitcode === 'PCS')?.unitid || units[0]?.unitid || 0;
    const productNameLower = product.productname.toLowerCase();
    const has12060 = productNameLower.includes('120/60') || productNameLower.includes('120x60');
    const hasTileDimensions = /\d+[x\/]\d+/.test(product.productname);
    const isFicheProduct = productNameLower.startsWith('fiche');
    const isSingleItemPackaging = (product.derivedpiecespercolis === 1 && product.derivedcolisperpalette === 1);

    const derivedPieces = product.derivedpiecespercolis || 0;
    const isIntegerPackaging = Math.abs(derivedPieces - Math.round(derivedPieces)) < 0.01 && derivedPieces > 0;

    if (hasTileDimensions && !isFicheProduct && !isSingleItemPackaging) {
      if (has12060) {
        defaultUnit = units.find(u => u.unitcode === 'PCS')?.unitid || defaultUnit;
      } else if (!isIntegerPackaging) {
        defaultUnit = units.find(u => u.unitid === 1 || u.unitcode === 'SQM')?.unitid || defaultUnit;
      }
    }

    const unitPrice =
      (Number(product.prixachat) > 0 ? Number(product.prixachat) : 0) ||
      (Number(product.purchaseprice) > 0 ? Number(product.purchaseprice) : 0) ||
      0;

    const sqmPerPiece = parseSqmPerPiece(product.productname);
    const rawPackaging = product.derivedpiecespercolis || 0;
    let piecesPerCarton = rawPackaging;
    let effectiveSqmPerPiece = sqmPerPiece;

    if (sqmPerPiece > 0 && rawPackaging > 0 && rawPackaging % 1 !== 0) {
      const calculatedPieces = Math.round(rawPackaging / sqmPerPiece);
      if (Math.abs(calculatedPieces * sqmPerPiece - rawPackaging) < 0.05) {
        piecesPerCarton = calculatedPieces;
        effectiveSqmPerPiece = rawPackaging / calculatedPieces;
      }
    }

    if (piecesPerCarton === 0) {
      piecesPerCarton = effectiveSqmPerPiece * 4;
    }

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
      piecesPerCarton,
      cartonsPerPalette,
      sqmPerPiece: effectiveSqmPerPiece,
      palettes: 0,
      cartons: 0,
      quantity: 1,
      unitId: defaultUnit,
      unitPrice,
      lineTotal: unitPrice * 1,
    };

    setCart([...cart, newItem]);
    setSearchQuery('');

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

  // --- Update Cart Item ---
  const updateCartItem = (index: number, field: keyof POItem, value: number) => {
    const updatedCart = [...cart];
    const item = { ...updatedCart[index] };

    const currentUnitCode = units.find((u: Unit) => u.unitid === item.unitId)?.unitcode || 'PCS';

    if (field === 'unitId') {
      const newUnitId = Number(value);
      const oldUnitCode = units.find((u: Unit) => u.unitid === item.unitId)?.unitcode || 'PCS';
      const newUnitCode = units.find((u: Unit) => u.unitid === newUnitId)?.unitcode || 'PCS';

      const convertedQty = convertQuantity(
        item.quantity,
        oldUnitCode,
        newUnitCode,
        item.sqmPerPiece,
        item.piecesPerCarton
      );

      item.quantity = parseFloat(convertedQty.toFixed(2));
      item.unitId = newUnitId;

      if (newUnitCode === 'CARTON' || newUnitCode === 'CRT') {
        item.cartons = parseFloat(item.quantity.toFixed(2));
        if (item.cartonsPerPalette > 0) {
          item.palettes = parseFloat((item.cartons / item.cartonsPerPalette).toFixed(2));
        }
      } else if (item.piecesPerCarton > 0) {
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

    if (field === 'unitPrice') {
      item.unitPrice = value;
      item.lineTotal = item.quantity * item.unitPrice;
      updatedCart[index] = item;
      setCart(updatedCart);
      return;
    }

    if (field === 'quantity') {
      const qty = parseFloat(String(value)) || 0;
      item.quantity = qty;

      let piecesQty: number;
      if (currentUnitCode === 'SQM' && item.sqmPerPiece > 0) {
        piecesQty = qty / item.sqmPerPiece;
      } else if (currentUnitCode === 'CARTON' || currentUnitCode === 'CRT') {
        piecesQty = item.piecesPerCarton > 0 ? qty * item.piecesPerCarton : qty;
      } else {
        piecesQty = qty;
      }

      if (item.piecesPerCarton > 0) {
        const calculatedCartons = parseFloat((piecesQty / item.piecesPerCarton).toFixed(2));
        item.cartons = calculatedCartons;

        if (item.cartonsPerPalette > 0) {
          item.palettes = parseFloat((calculatedCartons / item.cartonsPerPalette).toFixed(2));
        }
      }
    }

    if (field === 'cartons') {
      const cartons = parseFloat(String(value)) || 0;
      item.cartons = cartons;

      if (item.piecesPerCarton > 0) {
        const piecesQty = cartons * item.piecesPerCarton;
        if (currentUnitCode === 'SQM' && item.sqmPerPiece > 0) {
          item.quantity = parseFloat((piecesQty * item.sqmPerPiece).toFixed(2));
        } else if (currentUnitCode === 'CARTON' || currentUnitCode === 'CRT') {
          item.quantity = cartons;
        } else {
          item.quantity = piecesQty;
        }
      }
      if (item.cartonsPerPalette > 0) {
        item.palettes = parseFloat((cartons / item.cartonsPerPalette).toFixed(2));
      }
    }

    if (field === 'palettes') {
      const palettes = parseFloat(String(value)) || 0;
      item.palettes = palettes;

      if (item.cartonsPerPalette > 0) {
        item.cartons = parseFloat((palettes * item.cartonsPerPalette).toFixed(2));
        if (item.piecesPerCarton > 0) {
          const piecesQty = item.cartons * item.piecesPerCarton;
          if (currentUnitCode === 'SQM' && item.sqmPerPiece > 0) {
            item.quantity = parseFloat((piecesQty * item.sqmPerPiece).toFixed(2));
          } else if (currentUnitCode === 'CARTON' || currentUnitCode === 'CRT') {
            item.quantity = item.cartons;
          } else {
            item.quantity = piecesQty;
          }
        }
      }
    }

    item.lineTotal = item.quantity * item.unitPrice;
    updatedCart[index] = item;
    setCart(updatedCart);
  };

  const totalHT = cart.reduce((sum, item) => sum + item.lineTotal, 0);
  const totalPalettes = cart.reduce((sum, item) => sum + item.palettes, 0);
  const totalCartons = cart.reduce((sum, item) => sum + item.cartons, 0);
  const totalQty = cart.reduce((sum, item) => sum + item.quantity, 0);

  // --- Submit form handler ---
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setApiError(null);

    if (cart.length === 0) {
      setApiError('Veuillez ajouter au moins un article.');
      return;
    }

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
          poItemId: item.poItemId,
          productId: item.productId,
          quantity: item.quantity,
          unitId: item.unitId,
          unitPrice: item.unitPrice,
          palletCount: item.palettes,
          colisCount: item.cartons,
        })),
      };

      const res = mode === 'edit' && poId
        ? await api.updatePurchaseOrder(poId, payload)
        : await api.createPurchaseOrder(payload);

      if (res.success) {
        alert(mode === 'edit' ? 'Bon de commande mis à jour avec succès!' : 'Bon de commande créé avec succès!');
        router.push('/purchasing');
      } else {
        throw new Error(res.message || 'Une erreur est survenue.');
      }
    } catch (err: any) {
      console.error(err);
      setApiError(err.message);
    } finally {
      setIsSaving(false);
    }
  };

  const prepareDocumentData = (): DocumentData => {
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
      number: poNumber || `BC-${orderDate.replace(/-/g, '')}`,
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

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-800/50 flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block w-10 h-10 border-4 border-emerald-200 border-t-emerald-600 rounded-full animate-spin mb-4"></div>
          <p className="text-slate-500">Chargement...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 via-emerald-50 to-teal-50 p-2 md:p-4">
      <div style={{ display: 'none' }}>
        <StandardDocument ref={bcRef} type="PURCHASE_ORDER" data={prepareDocumentData()} />
      </div>

      <div className="max-w-full mx-auto">
        <div className="bg-slate-900/60 rounded-xl shadow-sm shadow-black/10 border border-white/[0.06] p-4 mb-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-emerald-600 rounded-lg flex items-center justify-center text-white text-xl">
                {mode === 'edit' ? '✏️' : '📦'}
              </div>
              <div>
                <h1 className="text-xl font-bold text-slate-100">
                  {mode === 'edit' ? 'Modifier Bon de Commande' : 'Nouveau Bon de Commande'}
                </h1>
                <p className="text-xs text-slate-500">
                  {mode === 'edit' ? `${poNumber} • ${orderDate}` : 'Achat Fournisseur → Stock'}
                </p>
              </div>
            </div>
            <Link
              href="/purchasing"
              className="bg-slate-800/50 hover:bg-slate-200 text-slate-200 px-3 py-2 rounded-lg text-sm font-medium transition"
            >
              ← Retour
            </Link>
          </div>
        </div>

        {apiError && (
          <div className="mb-4 p-3 bg-sky-500/10 text-sky-300 border border-sky-500/20 rounded-lg text-sm">
            <strong>Erreur:</strong> {apiError}
          </div>
        )}

        <div className="bg-slate-900/60 rounded-xl shadow-sm shadow-black/10 border border-white/[0.06] overflow-hidden">
          <div className="p-4 border-b border-slate-100 bg-gradient-to-r from-green-50 to-emerald-50">
            <div className="relative max-w-2xl">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="🔍 Rechercher un produit à ajouter..."
                className="w-full p-3 pl-4 pr-10 text-sm border-2 border-green-300 rounded-xl bg-slate-900/60 focus:ring-2 focus:ring-green-500 focus:border-green-500"
              />
              {searchQuery && (
                <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-2">
                  {isSearching && <div className="w-4 h-4 border-2 border-green-500 border-t-transparent rounded-full animate-spin"></div>}
                  <button onClick={() => setSearchQuery('')} className="text-slate-400 hover:text-slate-400">
                    ✕
                  </button>
                </div>
              )}
              {filteredProducts.length > 0 && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-slate-900/60 border border-white/[0.06] rounded-lg shadow-lg shadow-black/20 z-50 max-h-60 overflow-y-auto">
                  {filteredProducts.map(p => (
                    <button
                      key={p.productid}
                      type="button"
                      onClick={() => addToCart(p)}
                      className="w-full px-4 py-3 text-left hover:bg-emerald-500/10 border-b border-slate-100 last:border-b-0 flex justify-between items-center"
                    >
                      <div>
                        <div className="font-medium text-slate-100">
                          {p.productname}
                          <span className="text-slate-500 text-xs ml-2 font-normal">
                            ({p.brandname || p.famille || 'Sans marque'})
                          </span>
                        </div>
                        <div className="text-xs text-slate-500">{p.productcode}</div>
                      </div>
                      <div className="text-right">
                        {p.baseprice > 0 && <div className="text-xxs text-slate-400">Base: {formatCurrencyDZD(p.baseprice)}</div>}
                        <div className="text-sm font-bold text-emerald-400">
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

          <div className="overflow-x-auto" style={{ maxHeight: 'calc(100vh - 400px)' }}>
            <table className="w-full text-sm" style={{ tableLayout: 'fixed' }}>
              <thead className="bg-slate-700 text-white text-xs uppercase sticky top-0">
                <tr>
                  <th className="px-2 py-2.5 text-left" style={{ width: 35 }}>#</th>
                  <ResizableHeader columnKey="designation" width={widths.designation} onResize={handleResize} className="px-2 py-2.5 text-left">
                    Désignation
                  </ResizableHeader>
                  <ResizableHeader columnKey="marque" width={widths.marque} onResize={handleResize} className="px-2 py-2.5 text-left">
                    Marque
                  </ResizableHeader>
                  <ResizableHeader columnKey="stock" width={widths.stock} onResize={handleResize} className="px-2 py-2.5 text-right">
                    Stock
                  </ResizableHeader>
                  <ResizableHeader columnKey="palettes" width={widths.palettes} onResize={handleResize} className="px-2 py-2.5 text-center bg-indigo-900/30">
                    Palettes
                  </ResizableHeader>
                  <ResizableHeader columnKey="cartons" width={widths.cartons} onResize={handleResize} className="px-2 py-2.5 text-center bg-indigo-900/30">
                    Cartons
                  </ResizableHeader>
                  <ResizableHeader columnKey="quantity" width={widths.quantity} onResize={handleResize} className="px-2 py-2.5 text-center bg-green-900/30">
                    Quantité
                  </ResizableHeader>
                  <ResizableHeader columnKey="unite" width={widths.unite} onResize={handleResize} className="px-2 py-2.5 text-left">
                    Unité
                  </ResizableHeader>
                  <ResizableHeader columnKey="prixachat" width={widths.prixachat} onResize={handleResize} className="px-2 py-2.5 text-right">
                    Prix Achat
                  </ResizableHeader>
                  <ResizableHeader columnKey="totalligne" width={widths.totalligne} onResize={handleResize} className="px-2 py-2.5 text-right">
                    Total
                  </ResizableHeader>
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
                    <tr key={item.tempId} className="hover:bg-emerald-500/10">
                      <td className="px-2 py-2 text-slate-400">{index + 1}</td>
                      <td className="px-2 py-2">
                        <div className="font-medium text-slate-100 truncate">{item.productName}</div>
                        {item.piecesPerCarton > 0 && (
                          <div className="text-xs text-slate-400">
                            {item.piecesPerCarton} pcs/ctn • {item.cartonsPerPalette} ctn/pal
                          </div>
                        )}
                      </td>
                      <td className="px-2 py-2 text-slate-400 text-xs">{item.brandName || '-'}</td>
                      <td className="px-2 py-2 text-right text-slate-500 bg-slate-900/40 font-mono">
                        {item.currentStock.toLocaleString()}
                      </td>
                      <td className="px-2 py-2 bg-indigo-500/100/10">
                        <input
                          type="number"
                          min="0"
                          value={item.palettes}
                          onChange={(e) => updateCartItem(index, 'palettes', Number(e.target.value))}
                          className="w-full text-center p-1.5 border-2 border-indigo-300 rounded font-bold text-indigo-900 bg-slate-900/60"
                        />
                      </td>
                      <td className="px-2 py-2 bg-indigo-500/100/10">
                        <input
                          type="number"
                          min="0"
                          value={item.cartons}
                          onChange={(e) => updateCartItem(index, 'cartons', Number(e.target.value))}
                          className="w-full text-center p-1.5 border-2 border-indigo-300 rounded font-bold text-indigo-900 bg-slate-900/60"
                        />
                      </td>
                      <td className="px-2 py-2 bg-emerald-500/10">
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={item.quantity}
                          onChange={(e) => updateCartItem(index, 'quantity', Number(e.target.value))}
                          className="w-full text-center p-1.5 border-2 border-green-400 rounded font-bold text-green-900 bg-slate-900/60"
                        />
                      </td>
                      <td className="px-2 py-2">
                        <select
                          value={item.unitId}
                          onChange={(e) => updateCartItem(index, 'unitId', Number(e.target.value))}
                          className="w-full p-1.5 text-xs border border-white/[0.06] rounded"
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
                          className="w-full text-right p-1.5 border border-white/[0.06] rounded font-mono"
                        />
                      </td>
                      <td className="px-2 py-2 text-right font-bold text-emerald-400 bg-emerald-500/10">
                        {formatCurrencyDZD(item.lineTotal)}
                      </td>
                      <td className="px-2 py-2 text-center">
                        <button
                          type="button"
                          onClick={() => removeFromCart(item.tempId)}
                          className="text-sky-400 hover:text-sky-300 font-bold"
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

          <div className="p-4 bg-gradient-to-r from-slate-50 to-green-50 border-t border-white/[0.06]">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex flex-wrap gap-4 text-sm">
                <div className="bg-slate-900/60 px-4 py-2 rounded-lg border border-white/[0.06]">
                  <span className="text-slate-500">Articles:</span>
                  <span className="ml-2 font-bold text-slate-200">{cart.length}</span>
                </div>
                <div className="bg-indigo-500/100/10 px-4 py-2 rounded-lg border border-indigo-200">
                  <span className="text-indigo-400">Palettes:</span>
                  <span className="ml-2 font-bold text-indigo-800">{totalPalettes}</span>
                </div>
                <div className="bg-indigo-500/100/10 px-4 py-2 rounded-lg border border-indigo-200">
                  <span className="text-indigo-400">Cartons:</span>
                  <span className="ml-2 font-bold text-indigo-800">{totalCartons}</span>
                </div>
                <div className="bg-emerald-500/10 px-4 py-2 rounded-lg border border-emerald-500/20">
                  <span className="text-emerald-400">Qté Totale:</span>
                  <span className="ml-2 font-bold text-emerald-300">{totalQty.toFixed(2)}</span>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <div>
                  <label className="block text-xs text-slate-500 mb-1">Date Commande</label>
                  <input
                    type="date"
                    value={orderDate}
                    onChange={(e) => setOrderDate(e.target.value)}
                    className="w-36 p-2 text-sm border border-white/[0.06] rounded-lg bg-slate-900/60"
                  />
                </div>
                {mode === 'create' && (
                  <div>
                    <label className="block text-xs text-slate-500 mb-1">Transport</label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={transportCost}
                      onChange={(e) => setTransportCost(Number(e.target.value))}
                      className="w-28 p-2 text-sm border border-white/[0.06] rounded-lg bg-slate-900/60 text-right"
                      placeholder="0.00"
                    />
                  </div>
                )}
                {mode === 'create' && (
                  <div>
                    <label className="block text-xs text-slate-500 mb-1">Versement</label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={payment}
                      onChange={(e) => setPayment(Number(e.target.value))}
                      className="w-32 p-2 text-sm border-2 border-green-300 rounded-lg bg-slate-900/60 font-bold text-emerald-300 text-right"
                      placeholder="0.00"
                    />
                  </div>
                )}
                {mode === 'create' && (
                  <div>
                    <label className="block text-xs text-slate-500 mb-1">Mode Paiement</label>
                    <select
                      value={paymentMethod}
                      onChange={(e) => setPaymentMethod(e.target.value as any)}
                      className="w-28 p-2 text-sm border border-white/[0.06] rounded-lg bg-slate-900/60"
                    >
                      <option value="ESPECE">💵 Espèce</option>
                      <option value="VIREMENT">🏦 Virement</option>
                      <option value="CHEQUE">📝 Chèque</option>
                    </select>
                  </div>
                )}
              </div>

              <div className="flex items-center gap-4">
                <div className="text-right">
                  <div className="text-xs text-slate-500">Total Commande (HT)</div>
                  <div className="text-lg font-bold text-slate-200">{formatCurrencyDZD(totalHT)}</div>
                  {transportCost > 0 && <div className="text-xs text-slate-500">+ Transport: {formatCurrencyDZD(transportCost)}</div>}
                  <div className="text-2xl font-bold text-emerald-400">{formatCurrencyDZD(totalHT + transportCost)}</div>
                  {payment > 0 && (
                    <div className="text-xs text-orange-400">Reste: {formatCurrencyDZD((totalHT + transportCost) - payment)}</div>
                  )}
                </div>

                <button
                  type="button"
                  onClick={handlePrintBC}
                  disabled={cart.length === 0}
                  className="bg-slate-800/50 hover:bg-slate-200 text-slate-200 px-4 py-3 rounded-xl font-bold text-sm transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  🖨️ Imprimer
                </button>

                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={isSaving || cart.length === 0}
                  className="bg-emerald-600 hover:bg-green-700 text-white px-6 py-3 rounded-xl font-bold text-sm transition shadow-lg shadow-black/20 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  {isSaving ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                      Enregistrement...
                    </>
                  ) : (
                    <>{mode === 'edit' ? '✓ Mettre à jour' : '✓ Créer Bon de Commande'}</>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
