'use client';

import { useState, useEffect, useCallback, useRef, Suspense, useMemo } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import api from '@/lib/api';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useReactToPrint } from 'react-to-print';
import { ReceiptTemplate, Order as ReceiptOrder } from '@/components/print/ReceiptTemplate';
import { StandardDocument, DocumentType, DocumentData } from '@/components/print/StandardDocument';
import { ResizableHeader, useColumnWidths } from '@/components/ResizableSortableHeader';
import { useTableNavigation } from '@/hooks/useTableNavigation';
import { useSortableTable } from '@/hooks/useSortableTable';
import { StandardDateInput } from '@/components/DateQuickFilter';

// --- Interfaces ---
interface Product {
  productid: number;
  productcode: string;
  productname: string;
  baseprice: number;
  prixvente?: number;
  prixachat?: number;
  brandname: string;
  famille?: string;
  totalqty: number;
  nbpalette: number;
  nbcolis: number;
  derivedpiecespercolis: number;
  derivedcolisperpalette: number;
  primaryunitid?: number;
  primaryunitcode?: string;
}

interface Customer {
  customerid: number;
  customercode?: string;
  customername: string;
  customertype: string;
  currentbalance: number;
  address?: string;
  phone?: string;
}

interface InventoryItem {
  productid: number;
  palletcount: number;
  coliscount: number;
  quantityonhand: number;
}

interface OrderItem {
  rowId: string; // Unique ID for duplicate line-item support
  productId: number;
  productCode: string;
  productName: string;
  brandName: string;
  stockQty: number;
  stockPalettes: number;
  stockCartons: number;
  piecesPerCarton: number;
  cartonsPerPalette: number;
  sqmPerPiece: number;
  palettes: number;
  cartons: number;
  quantity: number;
  unitId: number;
  unitPrice: number;
  priceSource: string;
  lineTotal: number;
  purchasePrice?: number;
}

// --- Helper ---
const formatCurrency = (amount: number) => new Intl.NumberFormat('fr-DZ', { style: 'currency', currency: 'DZD' }).format(amount);

// --- Price Source Badge ---
const getPriceSourceBadge = (source: string) => {
  const badges: Record<string, string> = {
    HISTORY: 'bg-purple-100 text-purple-700',
    CUSTOM: 'bg-green-100 text-green-700',
    CONTRACT: 'bg-green-100 text-green-700',
    PRICELIST: 'bg-blue-100 text-brand-primary-dark',
    BASE: 'bg-slate-100 text-slate-600',
    MARGE_DETAIL: 'bg-emerald-100 text-emerald-700',
    MARGE_GROS: 'bg-cyan-100 text-cyan-700',
    NOT_FOUND: 'bg-red-100 text-red-700',
  };
  return badges[source] || badges.BASE;
};

// --- Tile Dimension Parser ---
const parseSqmPerPiece = (productName: string): number => {
  const match = productName.match(/(\d+)\s*[\/xX×]\s*(\d+)/);
  if (match) {
    const width = parseInt(match[1]) / 100;
    const height = parseInt(match[2]) / 100;
    return width * height;
  }
  return 0;
};

const convertToSqm = (pieces: number, sqmPerPiece: number): number => {
  if (sqmPerPiece <= 0) return 0;
  return pieces * sqmPerPiece;
};

const convertToPieces = (sqm: number, sqmPerPiece: number): number => {
  if (sqmPerPiece <= 0) return 0;
  return sqm / sqmPerPiece;
};

const normalizePackaging = (productName: string, rawPiecesPerCarton: number, initialSqmPerPiece: number) => {
  let piecesPerCarton = rawPiecesPerCarton;
  let sqmPerPiece = initialSqmPerPiece;

  if (sqmPerPiece > 0 && rawPiecesPerCarton > 0 && rawPiecesPerCarton % 1 !== 0) {
    const calculatedPieces = Math.round(rawPiecesPerCarton / sqmPerPiece);
    if (Math.abs(calculatedPieces * sqmPerPiece - rawPiecesPerCarton) < 0.05) {
      piecesPerCarton = calculatedPieces;
      sqmPerPiece = rawPiecesPerCarton / calculatedPieces;
    }
  }
  return { piecesPerCarton, sqmPerPiece };
};

const convertQuantity = (
  value: number,
  fromUnit: string,
  toUnit: string,
  sqmPerPiece: number,
  piecesPerCarton: number
): number => {
  if (fromUnit === toUnit) return value;
  let pcsQty: number;
  if (fromUnit === 'PCS') {
    pcsQty = value;
  } else if (fromUnit === 'SQM') {
    pcsQty = sqmPerPiece > 0 ? value / sqmPerPiece : value;
  } else if (fromUnit === 'CARTON' || fromUnit === 'CRT') {
    pcsQty = piecesPerCarton > 0 ? value * piecesPerCarton : value;
  } else {
    pcsQty = value;
  }

  if (toUnit === 'PCS') {
    return pcsQty;
  } else if (toUnit === 'SQM') {
    return sqmPerPiece > 0 ? pcsQty * sqmPerPiece : pcsQty;
  } else if (toUnit === 'CARTON' || toUnit === 'CRT') {
    return piecesPerCarton > 0 ? pcsQty / piecesPerCarton : pcsQty;
  }
  return value;
};

// --- Smart Number Input ---
interface SmartInputProps {
  value: number;
  onChange: (val: number) => void;
  min?: number;
  step?: string | number;
  className?: string;
  placeholder?: string;
}

const SmartNumberInput = ({ value, onChange, min = 0, step = "any", className, placeholder }: SmartInputProps) => {
  const [localValue, setLocalValue] = useState(value.toString());
  useEffect(() => {
    const parsedLocal = parseFloat(localValue);
    if (!isNaN(parsedLocal) && parsedLocal !== value) {
      setLocalValue(value.toString());
    } else if (localValue === '' && value === 0) {}
  }, [value]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newVal = e.target.value;
    setLocalValue(newVal);
    if (newVal === '') {
      onChange(0);
      return;
    }
    const parsed = parseFloat(newVal);
    if (!isNaN(parsed)) {
      onChange(parsed);
    }
  };
  const handleBlur = () => setLocalValue(value.toString());

  return (
    <input
      type="number"
      inputMode="decimal"
      value={localValue}
      onChange={handleChange}
      onBlur={handleBlur}
      onWheel={(e) => e.currentTarget.blur()}
      min={min}
      step={step}
      className={className}
      placeholder={placeholder}
      onClick={(e) => e.currentTarget.select()}
    />
  );
};

function POSContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const editOrderId = searchParams.get('editOrderId');
  const [loadedEditId, setLoadedEditId] = useState<number | null>(null);

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [drivers, setDrivers] = useState<any[]>([]);
  const [vehicles, setVehicles] = useState<any[]>([]);
  const [units, setUnits] = useState<any[]>([]);
  const [brands, setBrands] = useState<{ brandid: number; brandname: string }[]>([]);
  const [appSettings, setAppSettings] = useState<{
    retailmargin?: number;
    wholesalemargin?: number;
    retailmargintype?: 'PERCENT' | 'AMOUNT';
    wholesalemargintype?: 'PERCENT' | 'AMOUNT';
  }>({});

  const [manualProductId, setManualProductId] = useState<number | null>(null);

  const { widths: cartWidths, handleResize: handleCartResize } = useColumnWidths('pos-cart-v3', {
    designation: 130,
    marque: 70,
    stock: 55,
    palettes: 55,
    cartons: 55,
    quantity: 70,
    unite: 65,
    prixunit: 100,
    src: 45,
    totalligne: 95,
  });

  const [selectedCustomerId, setSelectedCustomerId] = useState<number | ''>('');
  const [clientBalance, setClientBalance] = useState(0);
  const [orderDate, setOrderDate] = useState('');
  const [observation, setObservation] = useState('');
  const [shippingAddress, setShippingAddress] = useState('');
  const [clientPhone, setClientPhone] = useState('');
  const [originalOrderState, setOriginalOrderState] = useState<{ status: string, totalAmount: number, paymentAmount: number } | null>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [cart, setCart] = useState<OrderItem[]>([]);

  const [driverId, setDriverId] = useState<string>('');
  const [vehicleId, setVehicleId] = useState<string>('');
  const [deliveryCost, setDeliveryCost] = useState<number>(0);
  const [discount, setDiscount] = useState<number>(0);
  const [timber, setTimber] = useState<number>(0);
  const [payment, setPayment] = useState<number>(0);
  const [paymentMethod, setPaymentMethod] = useState<'ESPECE' | 'VIREMENT' | 'CHEQUE'>('ESPECE');

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);
  const [printingOrder, setPrintingOrder] = useState<ReceiptOrder | null>(null);
  const printRef = useRef<HTMLDivElement>(null);
  const blRef = useRef<HTMLDivElement>(null);
  const bcRef = useRef<HTMLDivElement>(null);
  const bssRef = useRef<HTMLDivElement>(null);
  const ticketRef = useRef<any>(null);
  const isCreatingManual = useRef(false);

  const [isCustomerModalOpen, setIsCustomerModalOpen] = useState(false);
  const [newCustomerName, setNewCustomerName] = useState('');
  const [newCustomerType, setNewCustomerType] = useState<'RETAIL' | 'WHOLESALE'>('WHOLESALE');
  const [newCustomerPhone, setNewCustomerPhone] = useState('');
  const [newCustomerAddress, setNewCustomerAddress] = useState('');
  const [isCreatingCustomer, setIsCreatingCustomer] = useState(false);

  const [isProductBrowserOpen, setIsProductBrowserOpen] = useState(false);
  const [browserSearch, setBrowserSearch] = useState('');

  const [isManualProductOpen, setIsManualProductOpen] = useState(false);
  const [manualProductName, setManualProductName] = useState('');
  const [manualProductQty, setManualProductQty] = useState(1);
  const [manualProductPrice, setManualProductPrice] = useState(0);
  const [manualProductBrand, setManualProductBrand] = useState('');
  const [manualProductColis, setManualProductColis] = useState(0);
  const [manualProductPalettes, setManualProductPalettes] = useState(0);

  // Table Navigation for Product Browser
  const filteredBrowserProducts = useMemo(() => {
    return products.filter(p => 
      !browserSearch || 
      p.productname.toLowerCase().includes(browserSearch.toLowerCase()) || 
      p.productcode.toLowerCase().includes(browserSearch.toLowerCase()) || 
      p.famille?.toLowerCase().includes(browserSearch.toLowerCase())
    ).slice(0, 100);
  }, [products, browserSearch]);

  const { 
    selectedIndex, 
    getRowClass, 
    getRowProps, 
    setSelectedIndex 
  } = useTableNavigation({
    rowCount: filteredBrowserProducts.length,
    enabled: isProductBrowserOpen,
    onAction: (idx) => {
      const p = filteredBrowserProducts[idx];
      if (p) {
        addToCart(p);
      }
    }
  });

  // Table Navigation for Cart
  const { sortedData: sortedCart, handleSort: handleCartSort, sortConfig: cartSortConfig } = useSortableTable(cart);

  const { 
    selectedIndex: cartSelectedIndex, 
    getRowClass: getCartRowClass, 
    getRowProps: getCartRowProps, 
    setSelectedIndex: setCartSelectedIndex 
  } = useTableNavigation({
    rowCount: sortedCart.length,
    enabled: !isProductBrowserOpen && !isManualProductOpen && !isCustomerModalOpen,
    onAction: (idx) => {
      const item = sortedCart[idx];
      console.log('Action on cart item:', item);
    }
  });

  const getSortIcon = (config: any, key: string) => {
    if (config.key !== key) return <span className="opacity-30 ml-1 text-[8px]">↕</span>;
    return config.direction === 'asc' ? <span className="ml-1 text-blue-400">▲</span> : <span className="ml-1 text-blue-400">▼</span>;
  };

  const [userName, setUserName] = useState<string>('');
  const [userRole, setUserRole] = useState<string>('');
  const [isRetailMode, setIsRetailMode] = useState(false);
  const [retailClientName, setRetailClientName] = useState('');
  const [employerName, setEmployerName] = useState('');
  const [customerSearchQuery, setCustomerSearchQuery] = useState('');
  const [activeMobileTab, setActiveMobileTab] = useState<'CLIENT' | 'CART' | 'PAYMENT'>('CART');

  const handlePrint = useReactToPrint({
    content: () => printRef.current,
    documentTitle: printingOrder ? `Recu_${printingOrder.ordernumber}` : 'Recu',
    onAfterPrint: () => setPrintingOrder(null),
  });

  const handlePrintBL = useReactToPrint({ content: () => blRef.current, documentTitle: 'BonDeLivraison' });
  const handlePrintBC = useReactToPrint({ content: () => bcRef.current, documentTitle: 'BonDeChargement' });
  const handlePrintBSS = useReactToPrint({ content: () => bssRef.current, documentTitle: 'BonSansSolde' });
  const handlePrintTicket = useReactToPrint({ content: () => ticketRef.current, documentTitle: 'Ticket' });

  const isMobile = useCallback((): boolean => {
    if (typeof window === 'undefined') return false;
    return /iPhone|iPad|iPod|Android/i.test(navigator.userAgent) || window.innerWidth < 768;
  }, []);

  const handleMobilePrint = (shortType: 'BL' | 'BC' | 'BSS' | 'TICKET') => {
    const data = getPrintData();
    const typeMap: Record<string, DocumentType> = { 'BL': 'DELIVERY_NOTE', 'BC': 'LOADING_SLIP', 'BSS': 'NO_BALANCE_SLIP', 'TICKET': 'TICKET' };
    const docType = typeMap[shortType] || 'DELIVERY_NOTE';
    const componentHtml = renderToStaticMarkup(<StandardDocument type={docType} data={data} />);
    const printWindow = window.open('', '_blank');
    if (!printWindow) { alert('Popup bloqué!'); return; }
    printWindow.document.write(`<!DOCTYPE html><html><head><title>${shortType}</title><meta charset="UTF-8"><style>@media print{@page{margin:0;}body{margin:0;}}</style></head><body>${componentHtml}<script>window.onload=function(){setTimeout(function(){window.print();},500);};</script></body></html>`);
    printWindow.document.close();
  };

  const handlePrintBLMobile = () => isMobile() ? handleMobilePrint('BL') : handlePrintBL();
  const handlePrintBCMobile = () => isMobile() ? handleMobilePrint('BC') : handlePrintBC();
  const handlePrintBSSMobile = () => isMobile() ? handleMobilePrint('BSS') : handlePrintBSS();
  const handlePrintTicketMobile = () => isMobile() ? handleMobilePrint('TICKET') : handlePrintTicket();

  const getPrintData = (): DocumentData => {
    const selectedCustomer = customers.find(c => c.customerid === selectedCustomerId);
    const selectedDriver = drivers.find(d => d.driverid === parseInt(driverId));
    const selectedVehicle = vehicles.find(v => v.vehicleid === parseInt(vehicleId));
    const docNumber = `BL-${orderDate.replace(/-/g, '')}`;
    const isRetailClient = isRetailMode || selectedCustomer?.customertype === 'RETAIL' || selectedCustomer?.customercode === 'COMPTOIR';
    let correctedOldBalance = isRetailClient ? 0 : clientBalance;
    if (editOrderId && originalOrderState?.status === 'CONFIRMED' && !isRetailClient) {
      correctedOldBalance = clientBalance - (originalOrderState.totalAmount - originalOrderState.paymentAmount);
    }

    return {
      number: docNumber, date: orderDate, time: '',
      clientName: isRetailMode ? (retailClientName || 'Client Comptoir') : (selectedCustomer?.customername || customerSearchQuery || 'Client Passager'),
      clientAddress: shippingAddress || selectedCustomer?.address || '',
      clientPhone: clientPhone || selectedCustomer?.phone || '',
      items: cart.map(item => ({
        productCode: item.productCode, productName: item.productName, brandName: item.brandName,
        quantity: item.quantity, unitCode: units.find(u => u.unitid === item.unitId)?.unitcode || 'PCS',
        unitPrice: item.unitPrice, lineTotal: item.lineTotal, palletCount: item.palettes, boxCount: item.cartons,
        sqmPerPiece: item.sqmPerPiece, piecesPerCarton: item.piecesPerCarton, cartonsPerPalette: item.cartonsPerPalette,
      })),
      totalHT, totalTVA: 0, timbre: timber, discount, deliveryCost, payment,
      oldBalance: correctedOldBalance, createdBy: (employerName.trim() || userName) || 'Vendeur',
      driverName: selectedDriver ? `${selectedDriver.firstname} ${selectedDriver.lastname}` : undefined,
      vehiclePlate: selectedVehicle?.vehiclenumber,
    };
  };

  useEffect(() => {
    const role = localStorage.getItem('user_role') || '';
    const name = localStorage.getItem('user_name') || '';
    setUserRole(role); setUserName(name); setIsRetailMode(role === 'SALES_RETAIL');
    if (!editOrderId) {
      const now = new Date();
      setOrderDate(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`);
    }
  }, []);

  useEffect(() => {
    const init = async () => {
      try {
        const [cust, prod, driv, veh, unit, settings, brandsRes] = await Promise.all([
          api.getCustomers({ limit: 5000 }), api.getProducts({ limit: 5000 }),
          api.getDrivers(), api.getVehicles(), api.getUnits(), api.getSettings(), api.getBrands()
        ]);
        if (cust.success) setCustomers(cust.data as Customer[]);
        if (prod.success) setProducts(prod.data as Product[]);
        if (driv.success) setDrivers(driv.data as any[]);
        if (veh.success) setVehicles(veh.data as any[]);
        if (unit.success) setUnits(unit.data as any[]);
        if (settings.success) setAppSettings(settings.data as any);
        if (brandsRes.success) setBrands(brandsRes.data as any[]);
      } catch (error: any) { console.error(error); setApiError(`Erreur: ${error.message}`); }
    };
    init();
  }, []);

  useEffect(() => {
    // 1. Ensure "MANUAL" product exists or create it (Self-healing)
    if (!manualProductId && !isCreatingManual.current && units.length > 0) {
      isCreatingManual.current = true;
      (async () => {
        try {
          console.log("POS: Initializing Manual Product...");
          const res = await api.createProduct({
            productcode: 'MANUAL',
            productname: 'Produit Manuel',
            primaryunitid: units[0].unitid,
            baseprice: 0,
            description: 'Product for custom manual entries'
          });
          if (res.success && res.data) {
            console.log("POS: Manual Product Ready ID:", (res.data as any).productid);
            setManualProductId((res.data as any).productid);
          }
        } catch (e: any) {
           console.error("POS: Manual Product Init Failed", e);
           // Fallback: Try one more search in case backend response was weird
           const searchRes = await api.getProducts({ search: 'MANUAL' });
           const found = (searchRes.data as any[]).find((p: any) => p.productcode?.toUpperCase() === 'MANUAL');
           if (found) setManualProductId(found.productid);
        } finally {
          isCreatingManual.current = false;
        }
      })();
    }
  }, [products, units, manualProductId]);

  useEffect(() => {
    const load = async () => {
      if (editOrderId && products.length > 0 && customers.length > 0 && loadedEditId !== Number(editOrderId)) {
        try {
          const res = await api.getOrder(Number(editOrderId));
          if (res.success && res.data) {
            const order = res.data as any;
            const items: OrderItem[] = order.items.map((item: any) => {
              const p = products.find(x => x.productid === item.productid);
              const { piecesPerCarton, sqmPerPiece } = normalizePackaging(item.productname, p?.derivedpiecespercolis || 0, parseSqmPerPiece(item.productname));
              return {
                rowId: crypto.randomUUID(), productId: item.productid, productCode: item.productcode, productName: item.productname,
                brandName: p?.famille || p?.brandname || '', stockQty: p?.totalqty || 0, stockPalettes: p?.nbpalette || 0, stockCartons: p?.nbcolis || 0,
                piecesPerCarton, cartonsPerPalette: p?.derivedcolisperpalette || 0, sqmPerPiece,
                palettes: Number(item.palletcount), cartons: Number(item.coliscount), quantity: Number(item.quantity),
                unitId: item.unitid, unitPrice: Number(item.unitprice), lineTotal: Number(item.linetotal),
                purchasePrice: Number(p?.prixachat) || 0
              };
            });
            setCart(items);
            const comptoir = customers.find(c => c.customercode === 'COMPTOIR');
            if (order.customerid === comptoir?.customerid && order.retailclientname) {
              setSelectedCustomerId(''); setCustomerSearchQuery(order.retailclientname);
            } else {
              setSelectedCustomerId(order.customerid); setCustomerSearchQuery('');
            }
            setPayment(order.paymentamount || 0); setPaymentMethod(order.paymentmethod || 'ESPECE');
            setDeliveryCost(Number(order.deliverycost || 0)); setObservation(order.notes || '');
            setRetailClientName(order.retailclientname || ''); setEmployerName(order.salespersonname || '');
            setShippingAddress(order.shippingaddress || ''); setClientPhone(order.clientphone || '');
            if (order.orderdate) setOrderDate(order.orderdate.split('T')[0]);
            setOriginalOrderState({ status: order.status, totalAmount: Number(order.totalamount), paymentAmount: Number(order.paymentamount || 0) });
            setLoadedEditId(Number(editOrderId));
          }
        } catch (e) { console.error(e); }
      }
    };
    load();
  }, [editOrderId, products, customers, loadedEditId]);

  useEffect(() => {
    if (selectedCustomerId) {
      const c = customers.find(c => c.customerid === selectedCustomerId);
      setClientBalance(c?.currentbalance || 0);
    } else setClientBalance(0);
  }, [selectedCustomerId, customers]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'F1') { e.preventDefault(); handleValidateSale(); }
      if (e.key === 'Escape') { e.preventDefault(); isCustomerModalOpen ? setIsCustomerModalOpen(false) : router.push('/'); }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [cart, selectedCustomerId, isSubmitting, isCustomerModalOpen]);

  const addToCart = async (product: Product) => {
    let defaultUnit = units.find(u => u.unitcode === 'PCS')?.unitid || units[0]?.unitid;
    const isInteger = Math.abs(product.derivedpiecespercolis - Math.round(product.derivedpiecespercolis)) < 0.01;
    if (product.derivedpiecespercolis > 0) {
      defaultUnit = isInteger ? units.find(u => u.unitcode === 'PCS')?.unitid || defaultUnit : units.find(u => u.unitid === 1 /* SQM ID? */ || u.unitcode === 'SQM')?.unitid || defaultUnit;
    }
    const { piecesPerCarton, sqmPerPiece } = normalizePackaging(product.productname, product.derivedpiecespercolis || 0, parseSqmPerPiece(product.productname));
    let unitPrice = Number(product.prixvente) || Number(product.baseprice) || 0;
    let priceSource = 'BASE';

    if (selectedCustomerId) {
      try {
        const pRes = await api.getCustomerProductPrice(selectedCustomerId as number, product.productid);
        if (pRes.success && pRes.data) {
          unitPrice = (pRes.data as any).recommendedPrice || unitPrice;
          priceSource = (pRes.data as any).priceSource || 'BASE';
        }
      } catch (e) { console.error(e); }
    }

    if (priceSource === 'BASE') {
      const purchase = Number(product.prixachat) || 0;
      const margin = isRetailMode ? Number(appSettings.retailmargin) : Number(appSettings.wholesalemargin);
      const type = isRetailMode ? appSettings.retailmargintype : appSettings.wholesalemargintype;
      if (purchase > 0 && margin > 0) {
        unitPrice = type === 'AMOUNT' ? purchase + margin : purchase * (1 + margin / 100);
        priceSource = isRetailMode ? 'MARGE_DETAIL' : 'MARGE_GROS';
      }
    }

    setCart([...cart, {
      rowId: crypto.randomUUID(), productId: product.productid, productCode: product.productcode, productName: product.productname,
      brandName: product.famille || product.brandname || '', stockQty: product.totalqty || 0, stockPalettes: product.nbpalette || 0, stockCartons: product.nbcolis || 0,
      piecesPerCarton, cartonsPerPalette: product.derivedcolisperpalette || 0, sqmPerPiece,
      palettes: 0, cartons: 0, quantity: 1, unitId: defaultUnit, unitPrice, priceSource, lineTotal: unitPrice,
      purchasePrice: Number(product.prixachat) || 0
    }]);
    setSearchQuery('');
  };

  const updateItem = (rowId: string, field: keyof OrderItem, value: any) => {
    const newCart = [...cart];
    const idx = newCart.findIndex(i => i.rowId === rowId);
    if (idx === -1) return;
    const item = newCart[idx];

    if (field === 'unitId') {
      const oldCode = units.find(u => u.unitid === item.unitId)?.unitcode || 'PCS';
      const newCode = units.find(u => u.unitid === Number(value))?.unitcode || 'PCS';
      item.quantity = Number(convertQuantity(item.quantity, oldCode, newCode, item.sqmPerPiece, item.piecesPerCarton).toFixed(2));
      item.unitId = Number(value);
    } else {
      (item as any)[field] = value;
    }

    const currentUnit = units.find(u => u.unitid === item.unitId)?.unitcode || 'PCS';
    if (field === 'quantity' || field === 'unitId') {
      let pieces = item.quantity;
      if (currentUnit === 'SQM' && item.sqmPerPiece > 0) pieces = item.quantity / item.sqmPerPiece;
      else if ((currentUnit === 'CARTON' || currentUnit === 'CRT') && item.piecesPerCarton > 0) pieces = item.quantity * item.piecesPerCarton;
      item.cartons = Number((item.piecesPerCarton > 0 ? pieces / item.piecesPerCarton : pieces).toFixed(2));
      item.palettes = Number((item.cartonsPerPalette > 0 ? item.cartons / item.cartonsPerPalette : 0).toFixed(2));
    } else if (field === 'cartons') {
      let pieces = item.cartons * item.piecesPerCarton;
      if (currentUnit === 'SQM' && item.sqmPerPiece > 0) item.quantity = pieces * item.sqmPerPiece;
      else if (currentUnit === 'CARTON' || currentUnit === 'CRT') item.quantity = item.cartons;
      else item.quantity = pieces;
      item.palettes = Number((item.cartonsPerPalette > 0 ? item.cartons / item.cartonsPerPalette : 0).toFixed(2));
    } else if (field === 'palettes') {
      item.cartons = item.palettes * item.cartonsPerPalette;
      let pieces = item.cartons * item.piecesPerCarton;
      if (currentUnit === 'SQM' && item.sqmPerPiece > 0) item.quantity = pieces * item.sqmPerPiece;
      else if (currentUnit === 'CARTON' || currentUnit === 'CRT') item.quantity = item.cartons;
      else item.quantity = pieces;
    }
    item.lineTotal = item.quantity * item.unitPrice;
    setCart(newCart);
  };

  const removeItem = (rowId: string) => setCart(cart.filter(i => i.rowId !== rowId));

  const totalHT = cart.reduce((sum, i) => sum + Number(i.lineTotal), 0);
  const totalNet = totalHT + Number(deliveryCost) - Number(discount) + Number(timber);
  const reste = totalNet - payment;

  const filteredProducts = searchQuery.length > 1 ? products.filter(p =>
    p.productname?.toLowerCase().includes(searchQuery.toLowerCase()) || p.productcode?.toLowerCase().includes(searchQuery.toLowerCase()) || p.brandname?.toLowerCase().includes(searchQuery.toLowerCase())
  ).slice(0, 50) : [];

  const filteredCustomers = customerSearchQuery.length > 1 ? customers.filter(c =>
    c.customertype !== 'RETAIL' && (c.customername?.toLowerCase().includes(customerSearchQuery.toLowerCase()))
  ).slice(0, 30) : [];

  const handleCreateCustomer = async () => {
    setIsCreatingCustomer(true);
    try {
      const res = await api.createCustomer({ customerCode: `C$-${Date.now()}`, customerName: newCustomerName, customerType: newCustomerType, phone: newCustomerPhone, address: newCustomerAddress, ancienSolde: 0 });
      if (res.success) {
        setCustomers([...customers, res.data as Customer]);
        setSelectedCustomerId((res.data as Customer).customerid); setIsCustomerModalOpen(false);
      }
    } catch (e) { console.error(e); } finally { setIsCreatingCustomer(false); }
  };

  const handleAddManualProduct = async () => {
    if (!manualProductId) {
      alert("Erreur: Le produit manuel n'est pas encore initialisé. Veuillez patienter une seconde ou rafraîchir la page.");
      return;
    }

    const defaultUnit = units.find(u => u.unitcode === 'PCS') || units[0];

    // Add to cart
    setCart([...cart, {
      rowId: crypto.randomUUID(), 
      productId: manualProductId, 
      productCode: 'MANUAL', 
      productName: manualProductName || 'Produit Manuel',
      brandName: manualProductBrand || 'Manual', 
      stockQty: 0, 
      stockPalettes: 0, 
      stockCartons: 0, 
      piecesPerCarton: 0, 
      cartonsPerPalette: 0,
      sqmPerPiece: parseSqmPerPiece(manualProductName), 
      palettes: Number(manualProductPalettes) || 0, 
      cartons: Number(manualProductColis) || 0, 
      quantity: Number(manualProductQty) || 1, 
      unitId: defaultUnit?.unitid || 1,
      unitPrice: Number(manualProductPrice) || 0, 
      priceSource: 'MANUEL', 
      lineTotal: (Number(manualProductQty) || 1) * (Number(manualProductPrice) || 0)
    }]);

    // 4. Reset and close
    setIsManualProductOpen(false);
    setManualProductName('');
    setManualProductQty(1);
    setManualProductPrice(0);
    setManualProductColis(0);
    setManualProductPalettes(0);
  };

  const handleValidateSale = async () => {
    if (isSubmitting || cart.length === 0) return;
    setIsSubmitting(true);
    try {
      const effectiveId = selectedCustomerId || customers.find(c => c.customercode === 'COMPTOIR')?.customerid || 0;
      const data = {
        customerId: Number(effectiveId), orderType: isRetailMode ? 'RETAIL' : 'WHOLESALE', warehouseId: 1, orderDate,
        notes: observation, retailClientName: isRetailMode ? retailClientName : customerSearchQuery, shippingAddress, clientPhone,
        paymentAmount: payment, paymentMethod, deliveryCost, discount, timber,
        items: cart.map(i => ({ 
          productId: i.productId, 
          quantity: i.quantity, 
          unitId: i.unitId, 
          unitPrice: i.unitPrice, 
          colisCount: i.cartons, 
          palletCount: i.palettes, 
          productName: (i.productCode?.toUpperCase() === 'MANUAL' || i.productCode?.toUpperCase() === 'MANUEL') ? i.productName : undefined 
        }))
      };
      const res = editOrderId ? await api.updateOrder(Number(editOrderId), data) : await api.createOrder(data);
      if (res.success) { alert('Vente validée!'); router.push('/orders'); }
      else alert(res.message);
    } catch (e) { console.error(e); } finally { setIsSubmitting(false); }
  };

  return (
    <div className="flex flex-col bg-slate-50 overflow-hidden text-slate-800" style={{ zoom: 0.88, height: '113.6vh' }}>
      {/* Header */}
      <div className="flex-none p-3 border-b bg-white flex justify-between items-center shadow-sm z-10">
        <div className="flex items-center gap-4">
          <h1 className="text-xl font-bold text-slate-800">Point de Vente</h1>
          <div className="hidden lg:flex items-center gap-2 text-xs text-slate-500">
            <span className="bg-blue-50 text-blue-700 px-2 py-0.5 rounded border border-blue-100 uppercase tracking-wider font-bold">F1</span> Valider
            <span className="bg-slate-50 text-slate-700 px-2 py-0.5 rounded border border-slate-200 uppercase tracking-wider font-bold ml-2">ESC</span> Retour
          </div>
        </div>
        <Link href="/" className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-sm font-medium transition-colors">← Tableau de Bord</Link>
      </div>

      <div className="flex-1 flex overflow-hidden relative">
        {/* Left Panel: Customer & Logistics */}
        <div className={`w-full lg:w-60 flex-none bg-white border-r overflow-y-auto p-3 space-y-3 custom-scrollbar ${activeMobileTab === 'CLIENT' ? 'block' : 'hidden lg:block'}`}>
          <section>
            <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-brand-primary"></span> Client & Header
            </h3>
            <div className="space-y-3">
              <div>
                <StandardDateInput
                  value={orderDate}
                  onChange={(val) => setOrderDate(val)}
                />
              </div>

              {isRetailMode ? (
                <>
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 mb-1">Client <span className="text-orange-500">(Détail)</span></label>
                    <input type="text" value={retailClientName} onChange={e => setRetailClientName(e.target.value)} placeholder="Nom client..." className="w-full p-2 border rounded-lg text-sm" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 mb-1">Vendeur</label>
                    <input type="text" value={employerName || userName} onChange={e => setEmployerName(e.target.value)} className="w-full p-2 border rounded-lg text-sm bg-slate-50" />
                  </div>
                </>
              ) : (
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1">Client Wholesale</label>
                  <div className="relative">
                    {selectedCustomerId ? (
                      <div className="p-2 border border-green-200 bg-green-50 rounded-lg flex items-center justify-between">
                        <span className="text-sm font-medium text-green-800 truncate">{customers.find(c => c.customerid === selectedCustomerId)?.customername}</span>
                        <button onClick={() => setSelectedCustomerId('')} className="text-red-500 text-xl font-bold px-2">&times;</button>
                      </div>
                    ) : (
                      <>
                        <input type="text" value={customerSearchQuery} onChange={e => setCustomerSearchQuery(e.target.value)} placeholder="Rechercher..." className="w-full p-2 border rounded-lg text-sm" />
                        {customerSearchQuery.length > 1 && filteredCustomers.length > 0 && (
                          <div className="absolute top-full inset-x-0 mt-1 bg-white border shadow-xl rounded-lg z-50 max-h-60 overflow-y-auto">
                            {filteredCustomers.map(c => (
                              <div key={c.customerid} onClick={() => { setSelectedCustomerId(c.customerid); setCustomerSearchQuery(''); }} className="p-3 hover:bg-red-50 cursor-pointer border-b last:border-0">
                                <div className="text-sm font-bold">{c.customername}</div>
                                <div className="text-[10px] text-slate-500">{formatCurrency(c.currentbalance)}</div>
                              </div>
                            ))}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                  <button onClick={() => setIsCustomerModalOpen(true)} className="mt-2 w-full py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg text-xs font-bold border border-dashed border-slate-300">+ Nouveau Client</button>
                </div>
              )}
              
              <div className="grid grid-cols-2 gap-2 pt-2">
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1">Solde Actuel</label>
                  <div className={`p-2 rounded-lg text-xs font-bold text-right border ${clientBalance > 0 ? 'bg-red-50 border-red-100 text-red-600' : 'bg-green-50 border-green-100 text-green-600'}`}>
                    {formatCurrency(clientBalance)}
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1">Téléphone</label>
                  <input type="text" value={clientPhone} onChange={e => setClientPhone(e.target.value)} placeholder="05..." className="w-full p-2 border rounded-lg text-sm" />
                </div>
              </div>
            </div>
          </section>

          <section className="pt-4 border-t">
            <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3">Expédition & Notes</h3>
            <div className="space-y-3">
              <input type="text" value={shippingAddress} onChange={e => setShippingAddress(e.target.value)} placeholder="Adresse de livraison..." className="w-full p-2 border rounded-lg text-sm" />
              <textarea value={observation} onChange={e => setObservation(e.target.value)} rows={2} placeholder="Observations..." className="w-full p-2 border rounded-lg text-sm resize-none" />
              <div className="grid grid-cols-2 gap-2">
                <select value={driverId} onChange={e => setDriverId(e.target.value)} className="p-2 border rounded-lg text-xs bg-white">
                  <option value="">Chauffeur</option>
                  {drivers.map(d => <option key={d.driverid} value={d.driverid}>{d.firstname}</option>)}
                </select>
                <select value={vehicleId} onChange={e => setVehicleId(e.target.value)} className="p-2 border rounded-lg text-xs bg-white">
                  <option value="">Véhicule</option>
                  {vehicles.map(v => <option key={v.vehicleid} value={v.vehicleid}>{v.vehiclenumber}</option>)}
                </select>
              </div>
            </div>
          </section>
        </div>

        {/* Middle Panel: Shopping Cart */}
        <div className={`flex-1 flex flex-col min-w-0 bg-slate-50 relative ${activeMobileTab === 'CART' ? 'flex' : 'hidden lg:flex'}`}>
          {/* Internal Search / Browser */}
          <div className="flex-none p-4 pb-2 flex flex-col lg:flex-row gap-2">
            <div className="flex-1 relative">
              <input 
                type="text" 
                value={searchQuery} 
                onChange={e => setSearchQuery(e.target.value)} 
                placeholder="🔍 Scanner ou rechercher..." 
                className="w-full p-4 lg:p-3 pl-12 lg:pl-10 border-2 border-slate-200 rounded-2xl lg:rounded-xl bg-white shadow-sm focus:border-brand-primary/40 outline-none transition-all font-medium text-lg lg:text-base"
              />
              <div className="absolute left-4 lg:left-3 top-4.5 lg:top-3.5 text-slate-400">🔍</div>
              {searchQuery.length > 2 && filteredProducts.length > 0 && (
                <div className="absolute top-full left-0 right-0 mt-2 bg-white border shadow-2xl rounded-2xl z-[60] overflow-hidden">
                  {filteredProducts.map(p => (
                    <div key={p.productid} onClick={() => addToCart(p)} className="p-4 lg:p-3 hover:bg-red-50 cursor-pointer flex items-center justify-between border-b last:border-0 border-slate-100">
                      <div className="flex-1 min-w-0">
                        <div className="font-bold text-slate-800 truncate">{p.productname}</div>
                        <div className="text-[10px] text-slate-500 uppercase truncate">{p.famille || p.brandname} • {p.productcode}</div>
                      </div>
                      <div className="text-right flex-none ml-2">
                        <div className="text-sm font-bold text-brand-primary">{formatCurrency(p.prixvente || p.baseprice)}</div>
                        <div className="text-[10px] text-slate-400">Stock: {p.totalqty}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="flex gap-2">
              <button onClick={() => setIsProductBrowserOpen(true)} className="flex-1 lg:flex-none px-5 py-3 lg:py-0 bg-white border border-slate-200 text-slate-600 rounded-xl font-bold text-xs shadow-sm hover:bg-slate-50 flex items-center justify-center gap-2">📋 Catalogue</button>
              <button onClick={() => setIsManualProductOpen(true)} className="flex-1 lg:flex-none px-5 py-3 lg:py-0 bg-amber-500 hover:bg-amber-600 text-white rounded-xl font-bold text-xs shadow-sm flex items-center justify-center gap-2">✏️ Manuel</button>
            </div>
          </div>

          {/* Table Container - This is the dynamic scaling part */}
          <div className="flex-1 p-4 overflow-hidden flex flex-col">
            <div className={`flex-1 bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col ${cart.length > 10 ? 'pos-zero-scroll-container' : ''}`}>
              <div className="flex-1 flex flex-col min-h-0">
                {/* Desktop Table View */}
                <div className="hidden lg:block overflow-auto flex-1 custom-scrollbar">
                  <table className="border-separate border-spacing-0" style={{ minWidth: '680px', width: '100%' }}> 
                    <thead className="sticky top-0 bg-slate-800 text-white z-20">
                      <tr className="text-[10px] font-bold uppercase tracking-wider">
                        <ResizableHeader columnKey="designation" width={cartWidths.designation} onResize={handleCartResize} onClick={() => handleCartSort('productName')} className="px-2 py-2 text-left cursor-pointer hover:bg-slate-700">Désignation {getSortIcon(cartSortConfig, 'productName')}</ResizableHeader>
                        <ResizableHeader columnKey="marque" width={cartWidths.marque} onResize={handleCartResize} onClick={() => handleCartSort('brandName')} className="px-1.5 py-2 text-left cursor-pointer hover:bg-slate-700">Marque {getSortIcon(cartSortConfig, 'brandName')}</ResizableHeader>
                        <ResizableHeader columnKey="stock" width={cartWidths.stock} onResize={handleCartResize} onClick={() => handleCartSort('stockQty')} className="px-1.5 py-2 text-right cursor-pointer hover:bg-slate-700">Stock {getSortIcon(cartSortConfig, 'stockQty')}</ResizableHeader>
                        <ResizableHeader columnKey="palettes" width={cartWidths.palettes} onResize={handleCartResize} onClick={() => handleCartSort('palettes')} className="px-1.5 py-2 text-center bg-indigo-900/30 cursor-pointer hover:bg-indigo-900/50">Pals {getSortIcon(cartSortConfig, 'palettes')}</ResizableHeader>
                        <ResizableHeader columnKey="cartons" width={cartWidths.cartons} onResize={handleCartResize} onClick={() => handleCartSort('cartons')} className="px-1.5 py-2 text-center bg-indigo-900/30 cursor-pointer hover:bg-indigo-900/50">Ctns {getSortIcon(cartSortConfig, 'cartons')}</ResizableHeader>
                        <ResizableHeader columnKey="quantity" width={cartWidths.quantity} onResize={handleCartResize} onClick={() => handleCartSort('quantity')} className="px-2 py-2 text-center bg-red-900/30 cursor-pointer hover:bg-red-900/50">Quantité {getSortIcon(cartSortConfig, 'quantity')}</ResizableHeader>
                        <ResizableHeader columnKey="unite" width={cartWidths.unite} onResize={handleCartResize} className="px-1.5 py-2 text-center">Unité</ResizableHeader>
                        <ResizableHeader columnKey="prixunit" width={cartWidths.prixunit} onResize={handleCartResize} onClick={() => handleCartSort('unitPrice')} className="px-1.5 py-2 text-right cursor-pointer hover:bg-slate-700">Prix Unit {getSortIcon(cartSortConfig, 'unitPrice')}</ResizableHeader>
                        <ResizableHeader columnKey="src" width={cartWidths.src} onResize={handleCartResize} className="px-1.5 py-2 text-center">Src</ResizableHeader>
                        <ResizableHeader columnKey="totalligne" width={cartWidths.totalligne} onResize={handleCartResize} onClick={() => handleCartSort('lineTotal')} className="px-2 py-2 text-right cursor-pointer hover:bg-slate-700">Total {getSortIcon(cartSortConfig, 'lineTotal')}</ResizableHeader>
                        <th className="w-10 px-1 py-2"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-xs">
                      {sortedCart.map((item, idx) => {
                        const isTransport = item.productName.toUpperCase().includes('TRANSPORT');
                        return (
                        <tr 
                          key={item.rowId} 
                          {...getCartRowProps(idx)}
                          className={getCartRowClass(idx, `group transition-colors pos-row-compact cursor-pointer ${isTransport ? 'bg-slate-300 hover:bg-slate-400 shadow-[inset_0_2px_8px_rgba(0,0,0,0.1)] border-y border-slate-400/50' : 'hover:bg-slate-50'}`)}
                          onClick={() => setCartSelectedIndex(idx)}
                        >
                          <td className="px-2 py-1.5 truncate text-slate-700">
                            <div className="font-bold text-xs">{item.productName}</div>
                            {(item.piecesPerCarton > 0 || item.cartonsPerPalette > 0) && (
                              <div className="text-[9px] text-slate-400 font-medium tracking-tight">
                                {Number(item.piecesPerCarton) > 0 && `${Number(item.piecesPerCarton).toFixed(2)} / Colis`}
                                {Number(item.cartonsPerPalette) > 0 && ` • ${Number(item.cartonsPerPalette).toFixed(0)} Colis / Pal`}
                              </div>
                            )}
                          </td>
                          <td className="px-1.5 py-1.5 truncate text-slate-500 text-[10px] uppercase">{item.brandName}</td>
                          <td className="px-1.5 py-1.5 text-right font-mono text-[10px] text-slate-400">{parseFloat(item.stockQty.toString()).toLocaleString()}</td>
                          <td className="px-1.5 py-1.5 text-center">
                            <SmartNumberInput value={item.palettes} onChange={val => updateItem(item.rowId, 'palettes', val)} className="w-full text-center p-1 border border-slate-200 rounded font-bold text-indigo-700 bg-indigo-50/30 text-xs" />
                          </td>
                          <td className="px-1.5 py-1.5 text-center">
                            <SmartNumberInput value={item.cartons} onChange={val => updateItem(item.rowId, 'cartons', val)} className="w-full text-center p-1 border border-slate-200 rounded font-bold text-indigo-700 bg-indigo-50/30 text-xs" />
                          </td>
                          <td className="px-2 py-1.5 text-center">
                            <SmartNumberInput value={item.quantity} onChange={val => updateItem(item.rowId, 'quantity', val)} className="w-full text-center p-1 border-2 border-red-200 rounded font-bold text-red-700 bg-red-50 text-sm" />
                          </td>
                          <td className="px-1.5 py-1.5 text-center">
                            <select value={item.unitId} onChange={e => updateItem(item.rowId, 'unitId', Number(e.target.value))} className="w-full p-0.5 border border-slate-200 rounded text-[10px] bg-white">
                              {units.filter(u => u.unitcode !== 'BOX').map(u => <option key={u.unitid} value={u.unitid}>{u.unitcode}</option>)}
                            </select>
                          </td>
                          <td className="px-1.5 py-1.5 text-right">
                            <SmartNumberInput value={item.unitPrice} onChange={val => updateItem(item.rowId, 'unitPrice', val)} className={`w-full text-right p-1 border rounded font-mono text-xs ${item.purchasePrice && item.unitPrice < item.purchasePrice ? 'border-red-500 text-red-600 bg-red-50' : 'border-slate-200'}`} />
                          </td>
                          <td className="px-1.5 py-1.5 text-center">
                            <span className={`text-[9px] px-1 py-0.5 rounded-full font-bold ${getPriceSourceBadge(item.priceSource)}`}>{item.priceSource}</span>
                          </td>
                          <td className="px-2 py-1.5 text-right font-bold text-slate-800 text-xs">{formatCurrency(item.lineTotal)}</td>
                          <td className="px-1 py-1.5 text-center">
                            <button onClick={() => removeItem(item.rowId)} className="opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-600 transition-opacity text-lg">&times;</button>
                          </td>
                        </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Cart Totals Strip */}
                {cart.length > 0 && (
                  <div className="hidden lg:flex flex-none bg-slate-800 text-white px-3 py-2 gap-4 items-center justify-end text-[11px] font-bold">
                    <div className="flex items-center gap-1.5">
                      <span className="text-slate-400 uppercase tracking-wider">Palettes:</span>
                      <span className="text-indigo-300 font-mono text-sm">{cart.reduce((sum, i) => sum + (Number(i.palettes) || 0), 0).toFixed(1)}</span>
                    </div>
                    <div className="w-px h-4 bg-slate-600"></div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-slate-400 uppercase tracking-wider">Colis:</span>
                      <span className="text-indigo-300 font-mono text-sm">{cart.reduce((sum, i) => sum + (Number(i.cartons) || 0), 0).toFixed(1)}</span>
                    </div>
                    <div className="w-px h-4 bg-slate-600"></div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-slate-400 uppercase tracking-wider">Qté:</span>
                      <span className="text-red-300 font-mono text-sm">{cart.reduce((sum, i) => sum + (Number(i.quantity) || 0), 0).toFixed(2)}</span>
                    </div>
                    <div className="w-px h-4 bg-slate-600"></div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-slate-400 uppercase tracking-wider">Total:</span>
                      <span className="text-green-300 font-mono text-sm">{formatCurrency(totalHT)}</span>
                    </div>
                    <div className="flex items-center gap-1.5 ml-2 bg-slate-700 px-2 py-1 rounded-lg">
                      <span className="text-slate-400 uppercase tracking-wider">Lignes:</span>
                      <span className="text-white font-mono">{cart.length}</span>
                    </div>
                  </div>
                )}

                {/* Mobile Cards View */}
                <div className="lg:hidden flex-1 overflow-auto p-2 space-y-3 custom-scrollbar bg-slate-50">
                  {cart.map((item) => {
                    const isTransport = item.productName.toUpperCase().includes('TRANSPORT');
                    return (
                    <div key={item.rowId} className={`rounded-2xl border p-4 space-y-4 ${isTransport ? 'bg-slate-300 border-2 border-slate-500 shadow-[inset_0_2px_8px_rgba(0,0,0,0.1)]' : 'bg-white border-slate-200 shadow-sm'}`}>
                      <div className="flex justify-between items-start">
                        <div className="flex-1 min-w-0">
                          <h4 className="font-black text-slate-800 leading-tight truncate">{item.productName}</h4>
                          <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">{item.brandName || 'SANS MARQUE'}</p>
                        </div>
                        <button onClick={() => removeItem(item.rowId)} className="p-2 text-red-400 hover:bg-red-50 rounded-full transition-colors">&times;</button>
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1">
                          <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Quantité</label>
                          <div className="flex items-center gap-2">
                             <SmartNumberInput 
                               value={item.quantity} 
                               onChange={val => updateItem(item.rowId, 'quantity', val)} 
                               className="w-full text-center p-3 border-2 border-red-200 rounded-xl font-black text-red-700 bg-red-50 text-xl" 
                             />
                             <select value={item.unitId} onChange={e => updateItem(item.rowId, 'unitId', Number(e.target.value))} className="p-3 border border-slate-200 rounded-xl text-xs bg-slate-50 font-bold">
                                {units.filter(u => u.unitcode !== 'BOX').map(u => <option key={u.unitid} value={u.unitid}>{u.unitcode}</option>)}
                             </select>
                          </div>
                        </div>
                        <div className="space-y-1">
                           <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Prix Unitaire</label>
                           <SmartNumberInput 
                             value={item.unitPrice} 
                             onChange={val => updateItem(item.rowId, 'unitPrice', val)} 
                             className="w-full text-right p-3 border border-slate-200 rounded-xl font-bold bg-slate-50 text-lg" 
                           />
                        </div>
                      </div>

                      {(item.piecesPerCarton > 0 || item.cartonsPerPalette > 0) && (
                        <div className="bg-indigo-50/50 rounded-xl p-3 grid grid-cols-2 gap-4">
                          <div className="space-y-1">
                            <label className="text-[9px] font-bold text-indigo-400 uppercase tracking-wider">Cartons (Ctns)</label>
                            <SmartNumberInput value={item.cartons} onChange={val => updateItem(item.rowId, 'cartons', val)} className="w-full text-center p-2 border border-indigo-100 rounded-lg font-bold text-indigo-700 bg-white" />
                          </div>
                          <div className="space-y-1">
                            <label className="text-[9px] font-bold text-indigo-400 uppercase tracking-wider">Palettes (Pals)</label>
                            <SmartNumberInput value={item.palettes} onChange={val => updateItem(item.rowId, 'palettes', val)} className="w-full text-center p-2 border border-indigo-100 rounded-lg font-bold text-indigo-700 bg-white" />
                          </div>
                        </div>
                      )}

                      <div className="pt-3 border-t border-slate-100 flex justify-between items-center">
                        <span className={`text-[10px] px-2 py-1 rounded-full font-bold ${getPriceSourceBadge(item.priceSource)}`}>{item.priceSource}</span>
                        <div className="text-right">
                          <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Total Ligne</p>
                          <p className="text-xl font-black text-slate-900 leading-none">{formatCurrency(item.lineTotal)}</p>
                        </div>
                      </div>
                    </div>
                    );
                  })}
                  {cart.length === 0 && (
                    <div className="py-20 text-center text-slate-300">
                      <div className="text-6xl mb-4">🛒</div>
                      <p className="font-bold uppercase tracking-widest">Le panier est vide</p>
                    </div>
                  )}
                </div>

                {/* Mobile Mini-Summary Bar (sticky inside Middle Panel) */}
                <div className="lg:hidden flex-none bg-slate-800 text-white p-4 flex justify-between items-center">
                   <div>
                     <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest leading-none">Total Net</p>
                     <p className="text-2xl font-black">{formatCurrency(totalNet)}</p>
                   </div>
                   <button 
                     onClick={() => setActiveMobileTab('PAYMENT')}
                     className="bg-green-600 hover:bg-green-500 text-white px-6 py-3 rounded-xl font-black text-sm shadow-lg shadow-green-900/40"
                   >
                     CAISSE →
                   </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Right Panel: Summary & Buttons */}
        <div className={`w-full lg:w-72 flex-none bg-slate-800 text-white p-4 flex flex-col shadow-2xl z-20 overflow-y-auto ${activeMobileTab === 'PAYMENT' ? 'flex' : 'hidden lg:flex'}`}>
          <h2 className="text-sm font-bold text-slate-400 uppercase tracking-widest mb-4">Récapitulatif & Paiement</h2>
          
          <div className="flex-1 space-y-3 min-h-0">
            <div className="space-y-2 pb-4 border-b border-slate-700">
              <div className="flex justify-between text-slate-300 text-sm">
                <span>Total Brut HT</span>
                <span className="font-mono">{formatCurrency(totalHT)}</span>
              </div>
              <div className="flex justify-between text-slate-300 text-sm">
                <span>Frais de Livraison</span>
                <span className="text-brand-primary">+{formatCurrency(deliveryCost)}</span>
              </div>
              <div className="flex justify-between text-slate-300 text-sm">
                <span>Taxe de Timbre</span>
                <span>+{formatCurrency(timber)}</span>
              </div>
              <div className="flex justify-between text-red-400 text-sm">
                <span>Remise Commerciale</span>
                <span className="font-bold">-{formatCurrency(discount)}</span>
              </div>
            </div>

            <div className="py-4">
              <div className="text-[10px] text-slate-500 uppercase tracking-tighter mb-1">Net à Payer (P.A.C)</div>
              <div className="text-3xl font-black text-white font-mono leading-none tracking-tight">
                {formatCurrency(totalNet).replace('DZD', '')} <span className="text-xs font-normal text-slate-400">DA</span>
              </div>
            </div>

            <div className="space-y-3 pt-3 border-t border-slate-700/50">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] text-slate-400 font-bold uppercase mb-1.5">Méthode</label>
                  <select value={paymentMethod} onChange={e => setPaymentMethod(e.target.value as any)} className="w-full bg-slate-900 border border-slate-700 text-white p-3 rounded-xl text-xs font-bold appearance-none">
                    <option value="ESPECE">💶 ESPÈCE</option>
                    <option value="VIREMENT">🏦 VIREMENT</option>
                    <option value="CHEQUE">📝 CHÈQUE</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] text-slate-400 font-bold uppercase mb-1.5">Versement</label>
                  <SmartNumberInput value={payment} onChange={val => setPayment(val)} className="w-full bg-slate-900 border border-slate-700 text-white p-3 rounded-xl text-base font-bold font-mono text-right focus:border-brand-primary outline-none" />
                </div>
              </div>
              <div className={`p-3 rounded-xl flex justify-between items-center ${reste > 0 ? 'bg-red-950/30 border border-red-900/50' : 'bg-green-950/30 border border-green-900/50'}`}>
                <span className="text-[11px] font-bold uppercase text-slate-400">Reste à payer</span>
                <span className={`text-xl font-black font-mono ${reste > 0 ? 'text-red-400' : 'text-green-400'}`}>{formatCurrency(reste)}</span>
              </div>
            </div>
          </div>

          <div className="flex-none pt-4 space-y-2">
            <div className="grid grid-cols-4 gap-2">
              <button onClick={handlePrintBCMobile} disabled={cart.length === 0} className="py-2.5 bg-slate-700 hover:bg-slate-600 rounded-xl text-lg disabled:opacity-30" title="Bon de Chargement">🚚</button>
              <button onClick={handlePrintBLMobile} disabled={cart.length === 0} className="py-2.5 bg-slate-700 hover:bg-slate-600 rounded-xl text-lg disabled:opacity-30" title="Bon de Livraison">📄</button>
              <button onClick={handlePrintBSSMobile} disabled={cart.length === 0} className="py-2.5 bg-slate-700 hover:bg-slate-600 rounded-xl text-lg disabled:opacity-30" title="Bon Sans Solde">🚫</button>
              <button onClick={handlePrintTicketMobile} disabled={cart.length === 0} className="py-2.5 bg-slate-700 hover:bg-slate-600 rounded-xl text-lg disabled:opacity-30" title="Ticket">🎫</button>
            </div>
            
            <button 
              onClick={handleValidateSale} 
              disabled={isSubmitting || cart.length === 0 || (isRetailMode ? !retailClientName.trim() : (!selectedCustomerId && !customerSearchQuery.trim()))}
              className="w-full py-4 bg-green-600 hover:bg-green-500 text-white rounded-2xl font-black text-lg shadow-lg shadow-green-900/50 flex justify-center items-center gap-3 transition-all active:scale-95 disabled:opacity-40 disabled:grayscale"
            >
              {isSubmitting ? <><div className="w-5 h-5 border-4 border-white border-t-transparent rounded-full animate-spin"></div> EN COURS</> : <>VALIDER LA VENTE</>}
            </button>
          </div>
        </div>
      </div>

      {/* Modals & Hidden Elements */}
      <Suspense fallback={null}>
        {isCustomerModalOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm">
            <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl overflow-hidden p-6 scale-in">
              <h2 className="text-xl font-bold mb-6 text-slate-800 border-b pb-4">Nouveau Client</h2>
              <div className="space-y-4">
                <input type="text" placeholder="Nom complet..." value={newCustomerName} onChange={e => setNewCustomerName(e.target.value)} className="w-full p-4 bg-slate-50 border rounded-xl" />
                <select value={newCustomerType} onChange={e => setNewCustomerType(e.target.value as any)} className="w-full p-4 bg-slate-50 border rounded-xl">
                  <option value="WHOLESALE">Grossiste / Revendeur</option>
                  <option value="RETAIL">Détaillant / Client de passage</option>
                </select>
                <input type="tel" placeholder="Téléphone..." value={newCustomerPhone} onChange={e => setNewCustomerPhone(e.target.value)} className="w-full p-4 bg-slate-50 border rounded-xl" />
                <div className="flex gap-3 pt-4">
                  <button onClick={() => setIsCustomerModalOpen(false)} className="flex-1 py-4 text-slate-500 font-bold">Annuler</button>
                  <button onClick={handleCreateCustomer} disabled={isCreatingCustomer} className="flex-1 py-4 bg-brand-primary text-white rounded-xl font-bold">CRÉER</button>
                </div>
              </div>
            </div>
          </div>
        )}

        {isManualProductOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm">
             <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl overflow-hidden p-6">
              <h2 className="text-xl font-bold mb-6 text-orange-600 border-b pb-4">Produit Manuel</h2>
              <div className="space-y-4">
                <input type="text" placeholder="Désignation..." value={manualProductName} onChange={e => setManualProductName(e.target.value)} className="w-full p-4 bg-slate-50 border rounded-xl" />
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-400 uppercase ml-1">Qté</label>
                    <input type="number" placeholder="Qté" value={manualProductQty} onChange={e => setManualProductQty(Number(e.target.value))} className="w-full p-4 bg-slate-50 border rounded-xl" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-400 uppercase ml-1">Prix</label>
                    <input type="number" placeholder="Prix" value={manualProductPrice} onChange={e => setManualProductPrice(Number(e.target.value))} className="w-full p-4 bg-slate-50 border rounded-xl" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-400 uppercase ml-1">Colis</label>
                    <input type="number" placeholder="Colis" value={manualProductColis} onChange={e => setManualProductColis(Number(e.target.value))} className="w-full p-4 bg-slate-50 border rounded-xl" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-400 uppercase ml-1">Palettes</label>
                    <input type="number" placeholder="Palettes" value={manualProductPalettes} onChange={e => setManualProductPalettes(Number(e.target.value))} className="w-full p-4 bg-slate-50 border rounded-xl" />
                  </div>
                </div>
                <div className="flex gap-3 pt-4">
                  <button onClick={() => setIsManualProductOpen(false)} className="flex-1 py-4 text-slate-500 font-bold">Annuler</button>
                  <button onClick={handleAddManualProduct} className="flex-1 py-4 bg-amber-500 text-white rounded-xl font-bold uppercase tracking-wider">Ajouter</button>
                </div>
              </div>
            </div>
          </div>
        )}

        {isProductBrowserOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 backdrop-blur-md p-6">
            <div className="w-full max-w-5xl h-full max-h-[85vh] bg-white rounded-3xl shadow-2xl flex flex-col overflow-hidden">
              <div className="p-6 border-b flex justify-between items-center bg-slate-50">
                <h2 className="text-2xl font-black text-slate-800">Catalogue Produits</h2>
                <button onClick={() => setIsProductBrowserOpen(false)} className="text-3xl text-slate-400 hover:text-slate-600">&times;</button>
              </div>
              <div className="p-6 border-b">
                <input type="text" placeholder="🔍 Rechercher par nom, code, marque..." value={browserSearch} onChange={e => setBrowserSearch(e.target.value)} className="w-full p-5 bg-slate-50 border-2 border-slate-200 rounded-2xl text-lg font-bold" autoFocus />
              </div>
              <div className="flex-1 overflow-auto p-4">
                <table className="w-full text-left">
                  <thead className="sticky top-0 bg-white border-b py-4">
                    <tr className="text-[10px] text-slate-400 font-black uppercase tracking-widest">
                      <th className="px-4 py-3">Produit</th>
                      <th className="px-4 py-3">Famille / Marque</th>
                      <th className="px-4 py-3 text-right">Prix</th>
                      <th className="px-4 py-3 text-right">Dispo</th>
                      <th className="px-4 py-3 text-center">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {filteredBrowserProducts.map((p, idx) => (
                      <tr 
                        key={p.productid} 
                        {...getRowProps(idx)}
                        className={getRowClass(idx, "hover:bg-slate-50 transition-colors group cursor-pointer")}
                        onClick={() => setSelectedIndex(idx)}
                      >
                        <td className="px-4 py-4">
                          <div className="font-bold text-slate-800">{p.productname}</div>
                          <div className="text-[10px] text-slate-500">{p.productcode}</div>
                        </td>
                        <td className="px-4 py-4 text-xs font-bold text-slate-400 uppercase">{p.famille || p.brandname}</td>
                        <td className="px-4 py-4 text-right font-black text-green-600">{formatCurrency(p.prixvente || p.baseprice)}</td>
                        <td className="px-4 py-4 text-right font-mono font-bold text-slate-500">{p.totalqty}</td>
                        <td className="px-4 py-4 text-center">
                          <button 
                            onClick={(e) => { e.stopPropagation(); addToCart(p); }} 
                            className="px-6 py-2 bg-slate-800 text-white rounded-full text-[10px] font-black hover:bg-brand-primary transition-colors"
                          >
                            AJOUTER
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </Suspense>

      <div style={{ position: 'absolute', left: '-9999px', top: 0 }}>
        <StandardDocument ref={blRef} type="DELIVERY_NOTE" data={getPrintData()} />
        <StandardDocument ref={bcRef} type="LOADING_SLIP" data={getPrintData()} />
        <StandardDocument ref={bssRef} type="NO_BALANCE_SLIP" data={getPrintData()} />
        <StandardDocument ref={ticketRef} type="TICKET" data={getPrintData()} />
      </div>
      {/* Mobile Navigation Bar */}
      <div className="lg:hidden flex-none bg-white border-t p-2 flex justify-around items-center h-20 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.1)] z-50">
        <button 
          onClick={() => setActiveMobileTab('CLIENT')}
          className={`flex flex-col items-center gap-1 transition-all ${activeMobileTab === 'CLIENT' ? 'text-brand-primary' : 'text-slate-400'}`}
        >
          <span className="text-2xl">{selectedCustomerId ? '✅' : '👤'}</span>
          <span className="text-[10px] font-black uppercase tracking-widest">Client</span>
        </button>
        <button 
          onClick={() => setActiveMobileTab('CART')}
          className={`relative flex flex-col items-center gap-1 transition-all ${activeMobileTab === 'CART' ? 'text-brand-primary' : 'text-slate-400'}`}
        >
          <span className="text-2xl">🛒</span>
          {cart.length > 0 && (
            <span className="absolute -top-1 -right-2 bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full border-2 border-white">{cart.length}</span>
          )}
          <span className="text-[10px] font-black uppercase tracking-widest">Panier</span>
        </button>
        <button 
          onClick={() => setActiveMobileTab('PAYMENT')}
          className={`flex flex-col items-center gap-1 transition-all ${activeMobileTab === 'PAYMENT' ? 'text-brand-primary' : 'text-slate-400'}`}
        >
          <span className="text-2xl">💰</span>
          <span className="text-[10px] font-black uppercase tracking-widest">Paiement</span>
        </button>
      </div>
    </div>
  );
}

export default function POSPage() {
  return (
    <Suspense fallback={<div className="h-screen flex items-center justify-center bg-slate-900 text-white font-black text-2xl uppercase tracking-widest animate-pulse">Chargement POS...</div>}>
      <POSContent />
    </Suspense>
  );
}
