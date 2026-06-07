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
import { POSCustomerModal } from '@/components/POSCustomerModal';
import { POSManualProductModal } from '@/components/POSManualProductModal';
import { POSProductBrowser } from '@/components/POSProductBrowser';
import { POSCartTable } from '@/components/POSCartTable';

// Hook and shared helpers
import {
  usePOSCart,
  Product,
  OrderItem,
  parseSqmPerPiece,
  normalizePackaging,
} from '@/hooks/usePOSCart';

// --- Interfaces ---
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

// --- Helper ---
const formatCurrency = (amount: number) => new Intl.NumberFormat('fr-DZ', { style: 'currency', currency: 'DZD' }).format(amount);

// --- Price Source Badge ---
const getPriceSourceBadge = (source: string) => {
  const badges: Record<string, string> = {
    HISTORY: 'bg-violet-500/10 text-violet-400',
    CUSTOM: 'bg-emerald-500/10 text-emerald-400',
    CONTRACT: 'bg-emerald-500/10 text-emerald-400',
    PRICELIST: 'bg-sky-500/10 text-brand-primary-dark',
    BASE: 'bg-slate-800/50 text-slate-400',
    MARGE_DETAIL: 'bg-emerald-100 text-emerald-700',
    MARGE_GROS: 'bg-cyan-100 text-cyan-700',
    NOT_FOUND: 'bg-sky-500/10 text-sky-300',
  };
  return badges[source] || badges.BASE;
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

  const { widths: cartWidths, handleResize: handleCartResize } = useColumnWidths('pos-cart-v4', {
    designation: 500,
    marque: 120,
    stock: 65,
    palettes: 65,
    cartons: 65,
    quantity: 85,
    unite: 80,
    prixunit: 120,
    src: 60,
    totalligne: 120,
  });

  const [selectedCustomerId, setSelectedCustomerId] = useState<number | ''>('');
  const [clientBalance, setClientBalance] = useState(0);
  const [orderDate, setOrderDate] = useState('');
  const [observation, setObservation] = useState('');
  const [shippingAddress, setShippingAddress] = useState('');
  const [clientPhone, setClientPhone] = useState('');
  const [originalOrderState, setOriginalOrderState] = useState<{ status: string, totalAmount: number, paymentAmount: number } | null>(null);

  const [searchQuery, setSearchQuery] = useState('');

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

  // --- Server-side search state (bandwidth optimization) ---
  const [searchResults, setSearchResults] = useState<Product[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const searchTimerRef = useRef<NodeJS.Timeout | null>(null);

  const [customerSearchResults, setCustomerSearchResults] = useState<Customer[]>([]);
  const [isSearchingCustomer, setIsSearchingCustomer] = useState(false);
  const customerSearchTimerRef = useRef<NodeJS.Timeout | null>(null);

  const [browserSearchResults, setBrowserSearchResults] = useState<Product[]>([]);
  const [isSearchingBrowser, setIsSearchingBrowser] = useState(false);
  const browserSearchTimerRef = useRef<NodeJS.Timeout | null>(null);
  // --- End server-side search state ---

  const [isCustomerModalOpen, setIsCustomerModalOpen] = useState(false);
  const [isProductBrowserOpen, setIsProductBrowserOpen] = useState(false);
  const [browserSearch, setBrowserSearch] = useState('');
  const [isManualProductOpen, setIsManualProductOpen] = useState(false);

  const [userName, setUserName] = useState<string>('');
  const [userRole, setUserRole] = useState<string>('');
  const [isRetailMode, setIsRetailMode] = useState(false);
  const [retailClientName, setRetailClientName] = useState('');
  const [employerName, setEmployerName] = useState('');
  const [customerSearchQuery, setCustomerSearchQuery] = useState('');
  const [activeMobileTab, setActiveMobileTab] = useState<'CLIENT' | 'CART' | 'PAYMENT'>('CART');

  const {
    cart,
    setCart,
    addToCart: originalAddToCart,
    updateItem,
    removeItem,
    loadOrder,
    totalHT,
    totalNet,
    reste,
  } = usePOSCart({
    selectedCustomerId,
    isRetailMode,
    appSettings,
    units,
    deliveryCost,
    discount,
    timber,
    payment,
  });

  const addToCart = async (product: Product) => {
    await originalAddToCart(product);
    setSearchQuery('');
  };

  const selectedCustomer = useMemo(() => customers.find(c => c.customerid === selectedCustomerId), [selectedCustomerId, customers]);

  const filteredBrowserProducts = useMemo(() => {
    if (browserSearch && browserSearch.length >= 2 && browserSearchResults.length > 0) {
      return browserSearchResults;
    }
    return products.filter(p => 
      !browserSearch || 
      p.productname.toLowerCase().includes(browserSearch.toLowerCase()) || 
      p.productcode.toLowerCase().includes(browserSearch.toLowerCase()) || 
      p.famille?.toLowerCase().includes(browserSearch.toLowerCase())
    ).slice(0, 100);
  }, [products, browserSearch, browserSearchResults]);

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
          api.getCustomers({ limit: 200 }), api.getProducts({ limit: 200 }),
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
    // Ensure "MANUAL" product exists or create it (Self-healing)
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
      if (editOrderId && products.length > 0 && customers.length > 0 && units.length > 0 && loadedEditId !== Number(editOrderId)) {
        try {
          const res = await api.getOrder(Number(editOrderId));
          if (res.success && res.data) {
            const order = res.data as any;

            const missingIds = order.items
              .map((item: any) => Number(item.productid))
              .filter((id: number) => !products.find(x => Number(x.productid) === id));
            
            let allProducts = products;
            if (missingIds.length > 0) {
              try {
                const missingRes = await api.getProducts({ ids: missingIds.join(','), limit: missingIds.length });
                if (missingRes.success && missingRes.data) {
                  allProducts = [...products, ...(missingRes.data as Product[])];
                }
              } catch (e) { console.error('Failed to fetch missing products:', e); }
            }

            loadOrder(order.items, allProducts);

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
  }, [editOrderId, products, customers, units, loadedEditId, loadOrder]);

  useEffect(() => {
    if (selectedCustomerId) {
      const c = customers.find(c => c.customerid === selectedCustomerId);
      setClientBalance(c?.currentbalance || 0);
      setClientPhone(c?.phone || '');
    } else {
      setClientBalance(0);
      if (!isRetailMode) setClientPhone('');
    }
  }, [selectedCustomerId, customers, isRetailMode]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'F1') { e.preventDefault(); handleValidateSale(); }
      if (e.key === 'Escape') { e.preventDefault(); isCustomerModalOpen ? setIsCustomerModalOpen(false) : router.push('/'); }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [cart, selectedCustomerId, isSubmitting, isCustomerModalOpen]);

  // --- Server-side product search with debounce ---
  useEffect(() => {
    if (searchQuery.length < 2) { setSearchResults([]); return; }
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(async () => {
      setIsSearching(true);
      try {
        const res = await api.getProducts({ search: searchQuery, limit: 50 });
        if (res.success) setSearchResults(res.data as Product[]);
      } catch (e) { console.error(e); }
      setIsSearching(false);
    }, 300);
    return () => { if (searchTimerRef.current) clearTimeout(searchTimerRef.current); };
  }, [searchQuery]);

  const filteredProducts = searchResults;

  // --- Server-side customer search with debounce ---
  useEffect(() => {
    if (customerSearchQuery.length < 2) { setCustomerSearchResults([]); return; }
    if (customerSearchTimerRef.current) clearTimeout(customerSearchTimerRef.current);
    customerSearchTimerRef.current = setTimeout(async () => {
      setIsSearchingCustomer(true);
      try {
        const res = await api.getCustomers({ search: customerSearchQuery });
        if (res.success) setCustomerSearchResults(
          (res.data as Customer[]).filter(c => c.customertype !== 'RETAIL').slice(0, 30)
        );
      } catch (e) { console.error(e); }
      setIsSearchingCustomer(false);
    }, 300);
    return () => { if (customerSearchTimerRef.current) clearTimeout(customerSearchTimerRef.current); };
  }, [customerSearchQuery]);

  const filteredCustomers = customerSearchResults;

  // --- Server-side browser modal search with debounce ---
  useEffect(() => {
    if (!browserSearch || browserSearch.length < 2) { setBrowserSearchResults([]); return; }
    if (browserSearchTimerRef.current) clearTimeout(browserSearchTimerRef.current);
    browserSearchTimerRef.current = setTimeout(async () => {
      setIsSearchingBrowser(true);
      try {
        const res = await api.getProducts({ search: browserSearch, limit: 100 });
        if (res.success) setBrowserSearchResults(res.data as Product[]);
      } catch (e) { console.error(e); }
      setIsSearchingBrowser(false);
    }, 300);
    return () => { if (browserSearchTimerRef.current) clearTimeout(browserSearchTimerRef.current); };
  }, [browserSearch]);

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
    <div className="flex flex-col bg-slate-900/40 overflow-hidden text-slate-100 min-h-screen">
      {/* Header */}
      <div className="flex-none p-1 px-3 border-b bg-slate-900/60 flex justify-between items-center shadow-sm shadow-black/10 z-10">
        <div className="flex items-center gap-4">
          <h1 className="text-lg font-bold text-slate-100">Point de Vente</h1>
          <div className="hidden lg:flex items-center gap-2 text-xs text-slate-500">
            <span className="bg-sky-500/10 text-sky-300 px-2 py-0.5 rounded border border-blue-100 uppercase tracking-wider font-bold">F1</span> Valider
            <span className="bg-slate-900/40 text-slate-200 px-2 py-0.5 rounded border border-white/[0.06] uppercase tracking-wider font-bold ml-2">ESC</span> Retour
          </div>
        </div>
        <Link href="/" className="px-4 py-2 bg-slate-800/50 hover:bg-slate-200 text-slate-200 rounded-lg text-sm font-medium transition-colors">← Tableau de Bord</Link>
      </div>

        <div className={`p-1 px-3 bg-slate-900/60 border-b shadow-sm shadow-black/10 ${activeMobileTab === 'CLIENT' ? 'block' : 'hidden lg:block'}`}>
          <div className="flex flex-col gap-1.5">
            {/* ROW 1: Client & Logistics */}
            <div className="flex flex-col lg:flex-row gap-6 items-end">
              {/* 1. Client Info */}
              <div className="flex-none w-full lg:w-[450px] space-y-1.5">
                <div className="flex justify-between items-center mb-0.5">
                  <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5 font-bold">
                    <span className="w-1.5 h-1.5 rounded-full bg-brand-primary"></span> Infos Client
                  </h3>
                  <StandardDateInput value={orderDate} onChange={val => setOrderDate(val)} />
                </div>
                
                {isRetailMode ? (
                  <div className="flex gap-2">
                    <input type="text" value={retailClientName} onChange={e => setRetailClientName(e.target.value)} placeholder="Nom client passage..." className="flex-1 p-1.5 border border-slate-600/40 rounded-xl text-sm shadow-sm shadow-black/10 focus:ring-2 focus:ring-brand-primary/20 transition-all" />
                    <input type="text" value={clientPhone} onChange={e => setClientPhone(e.target.value)} placeholder="Tél (Optionnel)..." className="w-40 p-1.5 border border-slate-600/40 rounded-xl text-sm shadow-sm shadow-black/10 font-mono focus:ring-2 focus:ring-brand-primary/20 transition-all" />
                  </div>
                ) : (
                  <div className="relative">
                    {selectedCustomerId && selectedCustomer ? (
                      <div className="p-1 border border-emerald-500/20 bg-emerald-500/10 rounded-xl flex items-center justify-between shadow-sm shadow-black/10">
                        <div className="min-w-0 pr-2">
                          <div className="text-xs font-bold text-emerald-300 truncate">{selectedCustomer.customername}</div>
                          <div className="flex gap-3 items-center">
                            <div className="text-[10px] text-emerald-400 font-bold uppercase tracking-tight">Solde: {formatCurrency(clientBalance)}</div>
                            {selectedCustomer.phone && <div className="text-[10px] text-indigo-400 font-bold uppercase tracking-tight bg-indigo-500/100/100/10/80 px-2 py-0.5 rounded-lg border border-indigo-200">📞 {selectedCustomer.phone}</div>}
                          </div>
                        </div>
                        <button onClick={() => setSelectedCustomerId('')} className="text-sky-400 text-xl font-bold px-2">&times;</button>
                      </div>
                    ) : (
                      <div className="flex gap-2">
                        <input type="text" value={customerSearchQuery} onChange={e => setCustomerSearchQuery(e.target.value)} placeholder="Rechercher client..." className="flex-1 p-1.5 border border-slate-600/40 rounded-xl text-sm shadow-sm shadow-black/10" />
                        <button onClick={() => setIsCustomerModalOpen(true)} className="p-1.5 bg-slate-800/50 border border-slate-600/40 rounded-xl" title="Nouveau Client">+</button>
                      </div>
                    )}
                    {customerSearchQuery.length > 1 && filteredCustomers.length > 0 && (
                      <div className="absolute top-full inset-x-0 mt-1 bg-slate-900/60 border shadow-2xl rounded-xl z-50 max-h-48 overflow-y-auto ring-4 ring-black/5">
                        {filteredCustomers.map(c => (
                          <div key={c.customerid} onClick={() => { setSelectedCustomerId(c.customerid); setCustomerSearchQuery(''); setCustomers(prev => prev.find(x => x.customerid === c.customerid) ? prev : [...prev, c]); }} className="p-3 hover:bg-slate-900/40 cursor-pointer border-b last:border-0 transition-colors flex justify-between items-center">
                            <div>
                               <div className="text-sm font-bold text-slate-100">{c.customername}</div>
                               <div className="text-[10px] text-slate-500 font-bold tracking-wider uppercase">Solde: {formatCurrency(c.currentbalance)}</div>
                            </div>
                            {c.phone && <div className="text-[10px] font-mono text-indigo-400 font-bold">{c.phone}</div>}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* 2. Logistics & Notes */}
              <div className="hidden xl:flex flex-1 gap-1.5">
                 <div className="flex-1 space-y-1">
                    <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest pl-1">Livraison</h3>
                    <input type="text" value={shippingAddress} onChange={e => setShippingAddress(e.target.value)} placeholder="Adresse..." className="w-full p-1.5 border border-slate-600/40 rounded-xl text-sm shadow-sm shadow-black/10" />
                 </div>
                 <div className="w-48 space-y-1">
                    <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest pl-1">Véhicule</h3>
                    <select value={vehicleId} onChange={e => setVehicleId(e.target.value)} className="w-full p-1.5 border border-slate-600/40 rounded-xl text-xs bg-slate-900/60 shadow-sm shadow-black/10 appearance-none">
                      <option value="">Sélectionner</option>
                      {vehicles.map(v => <option key={v.vehicleid} value={v.vehicleid}>{v.vehiclenumber}</option>)}
                    </select>
                 </div>
                 <div className="flex-1 space-y-1">
                    <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest pl-1">Observations</h3>
                    <input type="text" value={observation} onChange={e => setObservation(e.target.value)} placeholder="Notes..." className="w-full p-1.5 border border-slate-600/40 rounded-xl text-sm shadow-sm shadow-black/10" />
                 </div>
              </div>
            </div>

            {/* ROW 2: Product Search (Full Width) & Tools */}
            <div className="flex flex-col lg:flex-row gap-3 items-center">
              {/* 3. Search & Scanner Dock */}
              <div className="flex-1 relative">
                 <input 
                  type="text" 
                  value={searchQuery} 
                  onChange={e => setSearchQuery(e.target.value)} 
                  placeholder="🔍 Scanner ou rechercher un produit..." 
                  className="w-full p-1.5 pl-10 border-2 border-white/[0.06] rounded-2xl bg-slate-900/40 shadow-[inner_0_2px_4px_rgba(0,0,0,0.02)] focus:border-brand-primary/40 focus:bg-slate-900/60 transition-all font-bold text-sm"
                />
                <div className="absolute left-3.5 top-2.5 text-slate-400">🔍</div>
                {searchQuery.length > 2 && isSearching && (
                  <div className="absolute top-full left-0 mt-1 min-w-full lg:min-w-[500px] xl:min-w-[600px] bg-slate-900/60 border shadow-2xl rounded-2xl z-[60] p-6 ring-8 ring-black/5 animate-in fade-in slide-in-from-top-2 duration-200 text-center">
                    <div className="inline-block w-5 h-5 border-2 border-white/[0.08] border-t-brand-primary rounded-full animate-spin"></div>
                    <span className="ml-2 text-sm text-slate-400">Recherche...</span>
                  </div>
                )}
                {searchQuery.length > 2 && !isSearching && filteredProducts.length > 0 && (
                  <div className="absolute top-full left-0 mt-1 min-w-full lg:min-w-[500px] xl:min-w-[600px] bg-slate-900/60 border shadow-2xl rounded-2xl z-[60] max-h-[60vh] overflow-y-auto ring-8 ring-black/5 animate-in fade-in slide-in-from-top-2 duration-200 custom-scrollbar">
                    {filteredProducts.map(p => (
                      <div key={p.productid} onClick={() => addToCart(p)} className="p-3 hover:bg-sky-500/10 cursor-pointer flex items-center justify-between border-b last:border-0 border-slate-100">
                        <div className="flex-1 min-w-0 pr-4">
                          <div className="font-black text-slate-100 break-words whitespace-normal leading-tight mb-0.5">{p.productname}</div>
                          <div className="text-[10px] text-slate-500 font-bold uppercase tracking-widest break-words whitespace-normal">{p.famille || p.brandname} • {p.productcode}</div>
                        </div>
                        <div className="text-right flex-none">
                          <div className="text-base font-black text-brand-primary">{formatCurrency(p.prixvente || p.baseprice)}</div>
                          <div className="text-[10px] text-slate-400 font-bold">Stock: {p.totalqty}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* 4. Tools */}
              <div className="flex-none flex gap-2">
                <button onClick={() => setIsProductBrowserOpen(true)} className="px-3 py-1.5 bg-slate-900/60 border border-white/[0.06] text-slate-400 rounded-2xl font-black text-xs shadow-sm shadow-black/10 hover:bg-slate-900/40 flex items-center justify-center gap-2 transition-transform active:scale-95">📋 CATALOGUE</button>
                <button onClick={() => setIsManualProductOpen(true)} className="px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-white rounded-2xl font-black text-xs shadow-lg shadow-black/20 shadow-amber-900/20 flex items-center justify-center gap-2 transition-transform active:scale-95">✏️ MANUEL</button>
              </div>
            </div>
          </div>
        </div>

        {/* MIDDLE SECTION: Shopping Cart (Full Width Center) */}
        <div className={`flex-1 flex flex-col min-w-0 bg-slate-800/50 relative overflow-hidden ${activeMobileTab === 'CART' ? 'flex' : 'hidden lg:flex'}`}>
          <POSCartTable
            cart={cart}
            sortedCart={sortedCart}
            cartWidths={cartWidths}
            handleCartResize={handleCartResize}
            handleCartSort={handleCartSort}
            cartSortConfig={cartSortConfig}
            getCartRowProps={getCartRowProps}
            getCartRowClass={getCartRowClass}
            setCartSelectedIndex={setCartSelectedIndex}
            units={units}
            updateItem={updateItem}
            removeItem={removeItem}
            activeMobileTab={activeMobileTab}
            setActiveMobileTab={setActiveMobileTab}
            totalHT={totalHT}
            totalNet={totalNet}
            formatCurrency={formatCurrency}
            getPriceSourceBadge={getPriceSourceBadge}
            getSortIcon={getSortIcon}
          />
        </div>

        {/* BOTTOM SECTION: Summary & Checkout Dashboard (Full Width Bottom) */}
        <div className={`flex-none bg-[#0c111d] text-white p-1 px-3 pb-20 border-t-2 border-brand-primary ${activeMobileTab === 'PAYMENT' ? 'block' : 'hidden lg:block'}`}>
          <div className="max-w-[1600px] mx-auto grid grid-cols-1 lg:grid-cols-3 gap-3">
            
            {/* 1. Totals Breakdown */}
            <div className="space-y-1 lg:border-r border-slate-700/30 pr-4">
              <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 border-b border-slate-700/50 pb-1">Récapitulatif Financier</h3>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm text-slate-200">
                <span>Total Brut HT</span>
                <span className="font-mono text-right">{formatCurrency(totalHT)}</span>
                <span>Frais de Livraison</span>
                <span className="text-brand-primary text-right font-bold">+{formatCurrency(deliveryCost)}</span>
                <span>Taxe de Timbre</span>
                <span className="text-right">+{formatCurrency(timber)}</span>
                <span className="text-red-400">Remise Commerciale</span>
                <span className="text-red-400 text-right font-bold">-{formatCurrency(discount)}</span>
              </div>
            </div>

            {/* 2. Payment Details */}
            <div className="flex flex-col justify-center px-4 lg:border-r border-slate-700/50 scale-95 origin-center">
               {selectedCustomerId && (
                 <div className="mb-0.5 p-1 px-2 bg-sky-500/10 border border-sky-500/20 rounded-xl flex items-center justify-between animate-in fade-in slide-in-from-top-1 duration-300">
                    <span className="text-[9px] font-black text-red-400 uppercase tracking-widest leading-none">Solde:</span>
                    <span className={`text-base font-black font-mono ${clientBalance > 0 ? 'text-red-400' : 'text-green-400'}`}>{formatCurrency(clientBalance)}</span>
                 </div>
               )}
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <div className="text-[9px] text-slate-400 uppercase font-bold tracking-widest leading-none">Net à Payer (P.A.C)</div>
                    <div className="text-xl font-black text-white font-mono leading-none pt-1">
                      {formatCurrency(totalNet).replace('DZD', '')} <span className="text-[10px] font-normal text-slate-300">DA</span>
                    </div>
                  </div>
                  <div className="text-right">
                    <label className="block text-[9px] text-slate-300 font-bold uppercase mb-1">Versement</label>
                    <SmartNumberInput value={payment} onChange={val => setPayment(val)} className="w-32 bg-slate-950 border border-slate-700 text-white p-1.5 rounded-xl text-lg font-black font-mono text-right focus:border-brand-primary outline-none shadow-inner" />
                  </div>
               </div>
               
               <div className="flex gap-2 items-center h-10">
                  <div className="flex-1 flex gap-1">
                    <button onClick={() => setPaymentMethod('ESPECE')} className={`flex-1 py-1.5 rounded-lg text-[9px] font-black uppercase border transition-all ${paymentMethod === 'ESPECE' ? 'bg-slate-900/60 text-white border-white' : 'bg-slate-900 text-slate-400 border-slate-700'}`}>ESPECE</button>
                    <button onClick={() => setPaymentMethod('VIREMENT')} className={`flex-1 py-1.5 rounded-lg text-[9px] font-black uppercase border transition-all ${paymentMethod === 'VIREMENT' ? 'bg-slate-900/60 text-white border-white' : 'bg-slate-900 text-slate-400 border-slate-700'}`}>VIREMENT</button>
                    <button onClick={() => setPaymentMethod('CHEQUE')} className={`flex-1 py-1.5 rounded-lg text-[9px] font-black uppercase border transition-all ${paymentMethod === 'CHEQUE' ? 'bg-slate-900/60 text-white border-white' : 'bg-slate-900 text-slate-400 border-slate-700'}`}>CHEQUE</button>
                  </div>
                  <div className={`flex-none px-3 h-full rounded-xl flex flex-col justify-center text-right ${reste > 0 ? 'bg-sky-500/10 border border-sky-500/20' : 'bg-emerald-500/100/10 border border-green-500/20'}`}>
                    <span className="text-[8px] font-black uppercase text-slate-500 leading-none">Reste</span>
                    <span className={`text-base font-black font-mono ${reste > 0 ? 'text-red-400' : 'text-green-400'}`}>{formatCurrency(reste)}</span>
                  </div>
               </div>
            </div>

            {/* 3. Global Actions */}
            <div className="flex flex-col gap-2 justify-center pl-4">
              <div className="grid grid-cols-4 gap-1.5">
                <button onClick={handlePrintBCMobile} disabled={cart.length === 0} className="py-1.5 bg-slate-700 hover:bg-slate-600 rounded-xl text-sm disabled:opacity-30" title="Bon de Chargement">🚚</button>
                <button onClick={handlePrintBLMobile} disabled={cart.length === 0} className="py-1.5 bg-slate-700 hover:bg-slate-600 rounded-xl text-sm disabled:opacity-30" title="Bon de Livraison">📄</button>
                <button onClick={handlePrintBSSMobile} disabled={cart.length === 0} className="py-1.5 bg-slate-700 hover:bg-slate-600 rounded-xl text-sm disabled:opacity-30" title="Bon Sans Solde">🚫</button>
                <button onClick={handlePrintTicketMobile} disabled={cart.length === 0} className="py-1.5 bg-slate-700 hover:bg-slate-600 rounded-xl text-sm disabled:opacity-30" title="Ticket">🎫</button>
              </div>
              
              <button 
                onClick={handleValidateSale} 
                disabled={isSubmitting || cart.length === 0 || (isRetailMode ? !retailClientName.trim() : (!selectedCustomerId && !customerSearchQuery.trim()))}
                className="w-full py-2 btn-glassy rounded-xl font-black text-base shadow-lg shadow-black/20 flex justify-center items-center gap-3 transition-all active:scale-95 disabled:opacity-40"
              >
                {isSubmitting ? <><div className="w-5 h-5 border-4 border-white border-t-transparent rounded-full animate-spin"></div>...</> : <><span className="text-base px-2 py-0.5 bg-sky-900/30 rounded-md">F1</span> VALIDER</>}
              </button>
            </div>
          </div>
        </div>

      {/* Modals & Hidden Elements */}
      <Suspense fallback={null}>
        <POSCustomerModal
          isOpen={isCustomerModalOpen}
          onClose={() => setIsCustomerModalOpen(false)}
          onCreateSuccess={(newCustomer) => {
            setCustomers([...customers, newCustomer]);
            setSelectedCustomerId(newCustomer.customerid);
          }}
        />

        <POSManualProductModal
          isOpen={isManualProductOpen}
          onClose={() => setIsManualProductOpen(false)}
          onAdd={({ name, qty, price, colis, palettes }) => {
            if (!manualProductId) {
              alert("Erreur: Le produit manuel n'est pas encore initialisé. Veuillez patienter une seconde ou rafraîchir la page.");
              return;
            }
            const defaultUnit = units.find(u => u.unitcode === 'PCS') || units[0];
            setCart([...cart, {
              rowId: crypto.randomUUID(),
              productId: manualProductId,
              productCode: 'MANUAL',
              productName: name || 'Produit Manuel',
              brandName: 'Manual',
              stockQty: 0,
              stockPalettes: 0,
              stockCartons: 0,
              piecesPerCarton: 0,
              cartonsPerPalette: 0,
              sqmPerPiece: parseSqmPerPiece(name),
              palettes: Number(palettes) || 0,
              cartons: Number(colis) || 0,
              quantity: Number(qty) || 1,
              unitId: defaultUnit?.unitid || 1,
              unitPrice: Number(price) || 0,
              priceSource: 'MANUEL',
              lineTotal: (Number(qty) || 1) * (Number(price) || 0),
              purchasePrice: 0
            }]);
            setIsManualProductOpen(false);
          }}
        />

        <POSProductBrowser
          isOpen={isProductBrowserOpen}
          onClose={() => setIsProductBrowserOpen(false)}
          browserSearch={browserSearch}
          setBrowserSearch={setBrowserSearch}
          filteredBrowserProducts={filteredBrowserProducts}
          getRowProps={getRowProps}
          getRowClass={getRowClass}
          setSelectedIndex={setSelectedIndex}
          addToCart={addToCart}
          formatCurrency={formatCurrency}
        />
      </Suspense>

      <div style={{ position: 'absolute', left: '-9999px', top: 0 }}>
        <StandardDocument ref={blRef} type="DELIVERY_NOTE" data={getPrintData()} />
        <StandardDocument ref={bcRef} type="LOADING_SLIP" data={getPrintData()} />
        <StandardDocument ref={bssRef} type="NO_BALANCE_SLIP" data={getPrintData()} />
        <StandardDocument ref={ticketRef} type="TICKET" data={getPrintData()} />
      </div>
      {/* Mobile Navigation Bar */}
      <div className="lg:hidden fixed bottom-0 left-0 right-0 bg-white/95 backdrop-blur-md border-t p-2 flex justify-around items-center h-20 shadow-[0_-10px_15px_-3px_rgba(0,0,0,0.1)] z-50">
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
            <span className="absolute -top-1 -right-2 bg-sky-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full border-2 border-white">{cart.length}</span>
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
