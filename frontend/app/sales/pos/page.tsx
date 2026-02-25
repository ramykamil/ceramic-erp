'use client';

import { useState, useEffect, useCallback, useRef, Suspense } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import api from '@/lib/api';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useReactToPrint } from 'react-to-print';
import { ReceiptTemplate, Order as ReceiptOrder } from '@/components/print/ReceiptTemplate';
import { StandardDocument, DocumentType, DocumentData } from '@/components/print/StandardDocument';
import { ResizableHeader, useColumnWidths } from '@/components/ResizableSortableHeader';

// --- Interfaces ---
interface Product {
  productid: number;
  productcode: string;
  productname: string;
  baseprice: number;
  prixvente?: number;  // From backend alias
  prixachat?: number;  // From backend alias
  brandname: string;
  famille?: string;    // Brand name alias
  // Stock aggregated from Inventory
  totalqty: number;           // Total quantity on hand
  nbpalette: number;          // Total pallets
  nbcolis: number;            // Total boxes (colis)
  // Derived packaging info
  derivedpiecespercolis: number;  // QteParColis or calculated
  derivedcolisperpalette: number; // QteColisParPalette or calculated
  // Legacy fallbacks
  quantityonhand?: number;
  palletcount?: number;
  coliscount?: number;
}

interface Customer {
  customerid: number;
  customercode?: string;  // Used to identify special customers like 'COMPTOIR'
  customername: string;
  customertype: string;
  currentbalance: number;
  address?: string; // New
  phone?: string;   // New
}

interface InventoryItem {
  productid: number;
  palletcount: number;
  coliscount: number;
  quantityonhand: number;
}

interface OrderItem {
  productId: number;
  productCode: string;
  productName: string;
  brandName: string;
  stockQty: number;
  stockPalettes: number;
  stockCartons: number;
  piecesPerCarton: number;
  cartonsPerPalette: number;
  sqmPerPiece: number;  // Calculated from tile dimensions (e.g., 33x33cm = 0.1089 m²)
  palettes: number;
  cartons: number;
  quantity: number;
  unitId: number;
  unitPrice: number;
  unitVideo?: string;
  priceSource: string;
  lineTotal: number;
  purchasePrice?: number; // Added for warning logic
}

// --- Helper ---
const formatCurrency = (amount: number) => new Intl.NumberFormat('fr-DZ', { style: 'currency', currency: 'DZD' }).format(amount);

// --- Price Source Badge ---
const getPriceSourceBadge = (source: string) => {
  const badges: Record<string, string> = {
    HISTORY: 'bg-purple-100 text-purple-700',  // Last sale price
    CUSTOM: 'bg-green-100 text-green-700',     // Custom price
    CONTRACT: 'bg-green-100 text-green-700',
    PRICELIST: 'bg-blue-100 text-blue-700',
    BASE: 'bg-slate-100 text-slate-600',
    MARGE_DETAIL: 'bg-emerald-100 text-emerald-700',  // Retail margin applied
    MARGE_GROS: 'bg-cyan-100 text-cyan-700',          // Wholesale margin applied
    NOT_FOUND: 'bg-red-100 text-red-700',
  };
  return badges[source] || badges.BASE;
};

// --- Tile Dimension Parser ---
// Extracts tile dimensions from product name (e.g., "ARCILLA GRIS 33/33" → 0.33 x 0.33 = 0.1089 m²)
const parseSqmPerPiece = (productName: string): number => {
  // Match patterns like "33/33", "45X45", "30x60", "60/120", etc.
  const match = productName.match(/(\d+)\s*[\/xX×]\s*(\d+)/);
  if (match) {
    const width = parseInt(match[1]) / 100;  // Convert cm to meters
    const height = parseInt(match[2]) / 100;
    return width * height;  // Area in m²
  }
  return 0;  // Unknown tile size
};

// --- Unit Conversion Helpers ---
const convertToSqm = (pieces: number, sqmPerPiece: number): number => {
  if (sqmPerPiece <= 0) return 0;
  return pieces * sqmPerPiece;
};

const convertToPieces = (sqm: number, sqmPerPiece: number): number => {
  if (sqmPerPiece <= 0) return 0;
  return sqm / sqmPerPiece;
};

// --- Packaging Normalization Helper ---
// Fixes issue where "Pieces per Carton" field in backend actually contains "M2 per Carton"
// (e.g. 1.44 for 60x60 tiles). Detects this based on tile dimensions and normalizes it.
const normalizePackaging = (productName: string, rawPiecesPerCarton: number, initialSqmPerPiece: number) => {
  let piecesPerCarton = rawPiecesPerCarton;
  let sqmPerPiece = initialSqmPerPiece;

  if (sqmPerPiece > 0 && rawPiecesPerCarton > 0 && rawPiecesPerCarton % 1 !== 0) {
    const calculatedPieces = Math.round(rawPiecesPerCarton / sqmPerPiece);
    // Verify if it divides reasonably cleanly (allow small float error)
    if (Math.abs(calculatedPieces * sqmPerPiece - rawPiecesPerCarton) < 0.05) {
      piecesPerCarton = calculatedPieces;
      // Use actual SQM/Piece derived from the "m2/carton" value for better precision
      // e.g. 1.42 m²/ctn ÷ 7 pcs = 0.2028... instead of 0.2025
      sqmPerPiece = rawPiecesPerCarton / calculatedPieces;
      console.log(`[Packaging Normalized] ${productName}: ${rawPiecesPerCarton} -> ${piecesPerCarton} pcs/ctn, sqm=${sqmPerPiece.toFixed(4)}`);
    }
  }
  return { piecesPerCarton, sqmPerPiece };
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

  // Convert to base unit (PCS) first
  let pcsQty: number;
  if (fromUnit === 'PCS') {
    pcsQty = value;
  } else if (fromUnit === 'SQM') {
    pcsQty = sqmPerPiece > 0 ? value / sqmPerPiece : value;
  } else if (fromUnit === 'CARTON' || fromUnit === 'CRT') {
    pcsQty = piecesPerCarton > 0 ? value * piecesPerCarton : value;
  } else {
    pcsQty = value; // Unknown unit, keep as is
  }

  // Convert from PCS to target unit
  if (toUnit === 'PCS') {
    return pcsQty;
  } else if (toUnit === 'SQM') {
    return sqmPerPiece > 0 ? pcsQty * sqmPerPiece : pcsQty;
  } else if (toUnit === 'CARTON' || toUnit === 'CRT') {
    return piecesPerCarton > 0 ? pcsQty / piecesPerCarton : pcsQty;
  }

  return value; // Fallback
};

// --- Smart Number Input Component (Fixes Mobile "Stickiness") ---
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

  // Sync local value when prop changes externally (but not if it matches the parsed local value)
  useEffect(() => {
    // Only update if the prop value is different from the parsed local value
    // This prevents cursor jumping when typing "1." -> parsed is 1 -> prop updates to 1 -> would reset to "1" without this check
    const parsedLocal = parseFloat(localValue);
    if (!isNaN(parsedLocal) && parsedLocal !== value) {
      setLocalValue(value.toString());
    } else if (localValue === '' && value === 0) {
      // Allow empty string to mean 0
    }
  }, [value]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newVal = e.target.value;
    setLocalValue(newVal);

    // Only trigger parent check if it's a valid number
    // Allow empty string to likely mean 0
    if (newVal === '') {
      onChange(0);
      return;
    }

    const parsed = parseFloat(newVal);
    if (!isNaN(parsed)) {
      onChange(parsed);
    }
  };

  const handleBlur = () => {
    // On blur, strictly sync back to the actual prop value to ensure formatting
    setLocalValue(value.toString());
  };

  return (
    <input
      type="number"
      inputMode="decimal" // Hints mobile keyboard to show decimal pad
      value={localValue}
      onChange={handleChange}
      onBlur={handleBlur}
      onWheel={(e) => e.currentTarget.blur()} // Prevent scroll from changing value
      min={min}
      step={step}
      className={className}
      placeholder={placeholder}
      onClick={(e) => e.currentTarget.select()} // Auto-select on click for easier editing
    />
  );
};

function POSContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const editOrderId = searchParams.get('editOrderId');
  const [loadedEditId, setLoadedEditId] = useState<number | null>(null);

  // --- Data Lists ---
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [inventoryLevels, setInventoryLevels] = useState<InventoryItem[]>([]);
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

  const [manualProductId, setManualProductId] = useState<number | null>(null); // Store generic MANUAL product ID

  // Resizable columns for cart table
  const { widths: cartWidths, handleResize: handleCartResize } = useColumnWidths('pos-cart-table', {
    designation: 200,
    marque: 80,
    stock: 70,
    palettes: 80,
    cartons: 80,
    quantity: 90,
    unite: 60,
    prixunit: 90,
    src: 60,
    totalligne: 100,
  });

  // --- Header State (Identification) ---
  const [selectedCustomerId, setSelectedCustomerId] = useState<number | ''>('');
  const [clientBalance, setClientBalance] = useState(0);
  const [orderDate, setOrderDate] = useState('');  // Initialized empty to avoid hydration mismatch
  const [priceLevel, setPriceLevel] = useState('Standard');
  const [observation, setObservation] = useState('');
  const [shippingAddress, setShippingAddress] = useState(''); // NEW
  const [clientPhone, setClientPhone] = useState('');         // NEW
  const [originalOrderState, setOriginalOrderState] = useState<{ status: string, totalAmount: number, paymentAmount: number } | null>(null);

  // --- Middle State (Cart) ---
  const [searchQuery, setSearchQuery] = useState('');
  const [cart, setCart] = useState<OrderItem[]>([]);

  // --- Footer State (Logistics & Totals) ---
  const [driverId, setDriverId] = useState<string>('');
  const [vehicleId, setVehicleId] = useState<string>('');
  const [deliveryCost, setDeliveryCost] = useState<number>(0);
  const [discount, setDiscount] = useState<number>(0);
  const [timber, setTimber] = useState<number>(0);
  const [payment, setPayment] = useState<number>(0);
  const [paymentMethod, setPaymentMethod] = useState<'ESPECE' | 'VIREMENT' | 'CHEQUE'>('ESPECE');

  // --- Submission & Print State ---
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);
  const [printingOrder, setPrintingOrder] = useState<ReceiptOrder | null>(null);
  const printRef = useRef<HTMLDivElement>(null);
  const blRef = useRef<HTMLDivElement>(null);
  const bcRef = useRef<HTMLDivElement>(null);
  const bssRef = useRef<HTMLDivElement>(null);
  const ticketRef = useRef<HTMLDivElement>(null);

  // --- Customer Modal State ---
  const [isCustomerModalOpen, setIsCustomerModalOpen] = useState(false);
  const [newCustomerName, setNewCustomerName] = useState('');
  const [newCustomerType, setNewCustomerType] = useState<'RETAIL' | 'WHOLESALE'>('WHOLESALE');
  const [newCustomerPhone, setNewCustomerPhone] = useState('');
  const [newCustomerAddress, setNewCustomerAddress] = useState('');
  const [isCreatingCustomer, setIsCreatingCustomer] = useState(false);

  // --- Product Browser Modal State ---
  const [isProductBrowserOpen, setIsProductBrowserOpen] = useState(false);
  const [browserSearch, setBrowserSearch] = useState('');

  // --- Manual Product Modal State ---
  const [isManualProductOpen, setIsManualProductOpen] = useState(false);
  const [manualProductName, setManualProductName] = useState('');
  const [manualProductQty, setManualProductQty] = useState(1);
  const [manualProductPrice, setManualProductPrice] = useState(0);
  const [manualProductBrand, setManualProductBrand] = useState('');

  // --- User & Retail Mode State ---
  const [userName, setUserName] = useState<string>('');
  const [userRole, setUserRole] = useState<string>('');
  const [isRetailMode, setIsRetailMode] = useState(false);
  const [retailClientName, setRetailClientName] = useState(''); // Manual text input for retail sales
  const [employerName, setEmployerName] = useState(''); // Manual text input for who made the sale (Établie par)
  const [customerSearchQuery, setCustomerSearchQuery] = useState(''); // Search query for wholesale customer selection

  // --- Print Handlers ---
  const handlePrint = useReactToPrint({
    content: () => printRef.current,
    documentTitle: printingOrder ? `Recu_${printingOrder.ordernumber}` : 'Recu',
    onAfterPrint: () => setPrintingOrder(null),
  });

  const handlePrintBL = useReactToPrint({
    content: () => blRef.current,
    documentTitle: 'BonDeLivraison',
  });

  const handlePrintBC = useReactToPrint({
    content: () => bcRef.current,
    documentTitle: 'BonDeChargement',
  });

  const handlePrintBSS = useReactToPrint({
    content: () => bssRef.current,
    documentTitle: 'BonSansSolde',
  });

  const handlePrintTicket = useReactToPrint({
    content: () => ticketRef.current,
    documentTitle: 'Ticket',
  });

  // --- Mobile Detection ---
  const isMobile = (): boolean => {
    if (typeof window === 'undefined') return false;
    return /iPhone|iPad|iPod|Android/i.test(navigator.userAgent) || window.innerWidth < 768;
  };

  // --- Number to French Words for Mobile Print ---
  const numberToFrenchWordsMobile = (amount: number): string => {
    if (isNaN(amount) || amount === 0) return 'Zéro Dinar';
    const u = ['', 'Un', 'Deux', 'Trois', 'Quatre', 'Cinq', 'Six', 'Sept', 'Huit', 'Neuf',
      'Dix', 'Onze', 'Douze', 'Treize', 'Quatorze', 'Quinze', 'Seize', 'Dix-Sept', 'Dix-Huit', 'Dix-Neuf'];
    const t = ['', '', 'Vingt', 'Trente', 'Quarante', 'Cinquante', 'Soixante', 'Soixante', 'Quatre-Vingt', 'Quatre-Vingt'];
    const chunk = (n: number): string => {
      if (n === 0) return '';
      if (n < 20) return u[n];
      if (n < 100) {
        const d = Math.floor(n / 10), r = n % 10;
        if (d === 7) return 'Soixante' + (r === 0 ? '-Dix' : (r === 1 ? '-et-Onze' : '-' + u[10 + r]));
        if (d === 9) return 'Quatre-Vingt-' + u[10 + r];
        if (d === 8) return r === 0 ? 'Quatre-Vingts' : 'Quatre-Vingt-' + u[r];
        return t[d] + (r === 1 ? '-et-Un' : (r === 0 ? '' : '-' + u[r]));
      }
      if (n < 1000) {
        const h = Math.floor(n / 100), rest = n % 100;
        return (h === 1 ? 'Cent' : u[h] + ' Cent' + (rest === 0 ? 's' : '')) + (rest > 0 ? ' ' + chunk(rest) : '');
      }
      return '';
    };
    const abs = Math.abs(amount);
    const intP = Math.floor(abs), decP = Math.round((abs - intP) * 100);
    let res = '';
    if (intP === 0) res = 'Zéro';
    else if (intP >= 1000000) {
      const m = Math.floor(intP / 1000000), rest = intP % 1000000;
      res = (m === 1 ? 'Un Million' : chunk(m) + ' Millions');
      const th = Math.floor(rest / 1000), rm = rest % 1000;
      if (th > 0) res += ' ' + (th === 1 ? 'Mille' : chunk(th) + ' Mille');
      if (rm > 0) res += ' ' + chunk(rm);
    } else if (intP >= 1000) {
      const th = Math.floor(intP / 1000), rest = intP % 1000;
      res = (th === 1 ? 'Mille' : chunk(th) + ' Mille') + (rest > 0 ? ' ' + chunk(rest) : '');
    } else res = chunk(intP);
    res += intP <= 1 ? ' Dinar' : ' Dinars';
    if (decP > 0) res += ' et ' + chunk(decP) + (decP <= 1 ? ' Centime' : ' Centimes');
    return (amount < 0 ? 'Moins ' : '') + res;
  };

  // --- Mobile Print Handler ---
  // Opens document in new window for mobile browsers where useReactToPrint may fail
  // Matches StandardDocument component exactly for accuracy
  // --- Mobile Print Handler ---
  // Opens document in new window for mobile browsers where useReactToPrint may fail
  // Uses renderToStaticMarkup to render the exact same StandardDocument component as PC
  const handleMobilePrint = (shortType: 'BL' | 'BC' | 'BSS' | 'TICKET') => {
    const data = getPrintData();

    // Map short types to StandardDocument types
    const typeMap: Record<string, DocumentType> = {
      'BL': 'DELIVERY_NOTE',
      'BC': 'LOADING_SLIP',
      'BSS': 'NO_BALANCE_SLIP',
      'TICKET': 'TICKET'
    };

    const docType = typeMap[shortType] || 'DELIVERY_NOTE';

    // Render the component to static HTML
    const componentHtml = renderToStaticMarkup(
      <StandardDocument type={docType} data={data} />
    );

    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      alert('Popup bloqué! Veuillez autoriser les popups pour imprimer.');
      return;
    }

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>${shortType}</title>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
            @media print {
                @page { margin: 0; }
                body { margin: 0; }
            }
        </style>
      </head>
      <body>
        ${componentHtml}
        <script>
          // Auto-print when loaded
          window.onload = function() { 
              setTimeout(function() {
                  window.print();
                  // Optional: close after print (some users prefer to keep it open)
                  // window.close();
              }, 500);
          };
        </script>
      </body>
      </html>
    `);

    printWindow.document.close();
  };

  // Unified print handlers that work on both desktop and mobile
  const handlePrintBLMobile = () => {
    if (isMobile()) {
      handleMobilePrint('BL');
    } else {
      handlePrintBL();
    }
  };

  const handlePrintBCMobile = () => {
    if (isMobile()) {
      handleMobilePrint('BC');
    } else {
      handlePrintBC();
    }
  };

  const handlePrintBSSMobile = () => {
    if (isMobile()) {
      handleMobilePrint('BSS');
    } else {
      handlePrintBSS();
    }
  };

  const handlePrintTicketMobile = () => {
    if (isMobile()) {
      handleMobilePrint('TICKET');
    } else {
      handlePrintTicket();
    }
  };



  // Get data for printing
  const getPrintData = (): DocumentData => {
    const selectedCustomer = customers.find(c => c.customerid === selectedCustomerId);
    const selectedDriver = drivers.find(d => d.driverid === parseInt(driverId));
    const selectedVehicle = vehicles.find(v => v.vehicleid === parseInt(vehicleId));

    // Use a stable document number based on the current orderDate state only
    // This avoids hydration mismatches since orderDate is set from state
    const docNumber = `BL-${orderDate.replace(/-/g, '')}`;

    // Fix for "Ancien Solde" when editing a confirmed order
    // If we are editing a confirmed order, the clientBalance from DB ALREADY includes this order's debt.
    // So "Ancien Solde" (before this order) should be: CurrentBalance - (OrderTotal - OrderPayment)
    let correctedOldBalance = isRetailMode ? 0 : clientBalance;

    if (editOrderId && originalOrderState?.status === 'CONFIRMED' && !isRetailMode) {
      const originalDebt = originalOrderState.totalAmount - originalOrderState.paymentAmount;
      // Subtract the debt this order originally added to the balance
      correctedOldBalance = clientBalance - originalDebt;
    }

    return {
      number: docNumber,
      date: orderDate,
      time: '',  // Avoid time-based hydration issues
      clientName: isRetailMode ? (retailClientName || 'Client Comptoir') : (selectedCustomer?.customername || customerSearchQuery || 'Client Passager'),
      clientAddress: shippingAddress || selectedCustomer?.address || '',
      clientPhone: clientPhone || selectedCustomer?.phone || '',
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
        sqmPerPiece: item.sqmPerPiece,
        piecesPerCarton: item.piecesPerCarton,
        cartonsPerPalette: item.cartonsPerPalette,
      })),
      totalHT: totalHT,
      totalTVA: totalTVA,
      timbre: timber,
      discount: discount,
      deliveryCost: deliveryCost, // Pass deliveryCost
      payment: payment,
      oldBalance: correctedOldBalance,
      createdBy: (employerName.trim() || userName) || 'Vendeur',
      driverName: selectedDriver ? `${selectedDriver.firstname} ${selectedDriver.lastname}` : undefined,
      vehiclePlate: selectedVehicle?.vehiclenumber,
    };
  };

  useEffect(() => {
    if (printingOrder && printRef.current) {
      handlePrint();
    }
  }, [printingOrder, handlePrint]);

  // --- Load User Info from localStorage ---
  useEffect(() => {
    const role = localStorage.getItem('user_role') || '';
    const name = localStorage.getItem('user_name') || '';
    setUserRole(role);
    setUserName(name);
    setIsRetailMode(role === 'SALES_RETAIL');
    // Set orderDate on client side only to avoid hydration mismatch
    // Use local time instead of UTC to avoid shifting to previous day
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    setOrderDate(`${year}-${month}-${day}`);
  }, []);

  // --- Loading Data ---
  useEffect(() => {
    const init = async () => {
      try {
        const [cust, prod, inv, driv, veh, unit, settings, brandsRes] = await Promise.all([
          api.getCustomers({ limit: 5000 }),
          api.getProducts({ limit: 5000 }),
          api.getInventoryLevels({ limit: 5000 }),
          api.getDrivers(),
          api.getVehicles(),
          api.getUnits(),
          api.getSettings(),
          api.getBrands()
        ]);
        if (cust.success) setCustomers((cust.data as Customer[]) || []);
        if (prod.success) setProducts((prod.data as Product[]) || []);
        if (inv.success) setInventoryLevels((inv.data as InventoryItem[]) || []);
        if (driv.success) setDrivers((driv.data as any[]) || []);
        if (veh.success) setVehicles((veh.data as any[]) || []);
        if (unit.success) setUnits((unit.data as any[]) || []);
        if (settings.success && settings.data) setAppSettings(settings.data as any);
        if (brandsRes.success) setBrands((brandsRes.data as any[]) || []);
      } catch (error: any) {
        console.error('Error loading data:', error);
        setApiError(`Erreur de chargement: ${error.message}`);
      }
    };
    init();
  }, []);

  // --- Refresh customers when window gains focus (to catch newly added/edited clients) ---
  useEffect(() => {
    const refreshCustomers = async () => {
      try {
        const cust = await api.getCustomers({ limit: 5000 });
        if (cust.success) setCustomers((cust.data as Customer[]) || []);
      } catch (error) {
        console.error('Error refreshing customers:', error);
      }
    };

    const handleFocus = () => {
      refreshCustomers();
    };

    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, []);

  // Helper to format date as YYYY-MM-DD using local time
  const formatDateForInput = (date: Date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  // Fetch MANUAL product ID
  useEffect(() => {
    const fetchManualProduct = async () => {
      try {
        const res = await api.getProducts({ search: 'MANUAL', limit: 1 });
        if (res.success && res.data && Array.isArray(res.data) && res.data.length > 0) {
          const manual = res.data.find((p: any) => p.productcode === 'MANUAL');
          if (manual) {
            setManualProductId(manual.productid);
            console.log('Manual Product ID found:', manual.productid);
          }
        }
      } catch (err) {
        console.error('Failed to fetch MANUAL product:', err);
      }
    };
    fetchManualProduct();
  }, []);

  // --- Check Edit Mode ---
  useEffect(() => {
    const loadOrderToEdit = async () => {
      // Prevent reloading if already loaded (unless ID changed)
      if (editOrderId && loadedEditId === Number(editOrderId)) {
        return;
      }

      if (editOrderId && products.length > 0 && customers.length > 0) {
        try {
          const res = await api.getOrder(Number(editOrderId));
          if (res.success && res.data) {
            const order = res.data as any;
            // Populate Cart
            const items: OrderItem[] = order.items.map((item: any) => ({
              productId: item.productid,
              productCode: item.productcode,
              productName: item.productname,
              // brandName and stockQty handled by spread below
              // Look up product stats
              ...(() => {
                const p = products.find(p => p.productid === item.productid);
                // Calculate normalized packaging (fix 1.44 vs 4 pcs issue)
                const rawSqm = parseSqmPerPiece(item.productname);
                const rawPcs = p?.derivedpiecespercolis || 0;
                const { piecesPerCarton, sqmPerPiece } = normalizePackaging(item.productname, rawPcs, rawSqm);

                return {
                  stockQty: p?.totalqty || 0,
                  stockPalettes: p?.nbpalette || 0,
                  stockCartons: p?.nbcolis || 0,
                  brandName: p?.famille || p?.brandname || '',
                  priceSource: 'HISTORY', // Treat existing as history
                  sqmPerPiece: sqmPerPiece,
                  piecesPerCarton: piecesPerCarton,
                  cartonsPerPalette: p?.derivedcolisperpalette || 0,
                  purchasePrice: Number(p?.prixachat) || 0 // Populate purchase price
                }
              })(),
              quantity: Number(item.quantity),
              unitId: item.unitid, // Should map unitId
              unitPrice: Number(item.unitprice),
              lineTotal: Number(item.linetotal),
              palettes: Number(item.palletcount),
              cartons: Number(item.coliscount),
              // Recalculate derived helper values?
              // We rely on product lookup helper above
            }));
            setCart(items);

            // Handle Passager Client in Wholesale/Admin mode
            const comptoirCust = customers.find(c => c.customercode === 'COMPTOIR') || customers.find(c => c.customertype === 'RETAIL');
            if (order.customerid === comptoirCust?.customerid && order.retailclientname) {
              setSelectedCustomerId('');
              setCustomerSearchQuery(order.retailclientname);
            } else {
              setSelectedCustomerId(order.customerid);
              // Do not clear customerSearchQuery here if it's already set by the user during the session? 
              // Usually loading an order overwrites the UI, so clearing is correct.
              setCustomerSearchQuery('');
            }

            setPayment(order.paymentamount || 0);
            setPaymentMethod(order.paymentmethod || 'ESPECE');
            // Handle Delivery Cost (case insensitive fallback)
            const dCost = order.deliverycost !== undefined ? order.deliverycost : (order.DeliveryCost !== undefined ? order.DeliveryCost : 0);
            setDeliveryCost(Number(dCost));
            // Currently backend stores total, but maybe not delivery separate?
            // Wait, I didn't add DeliveryCost to Orders table properly?
            // I used Notes. But if I update, I should extract it?
            // Or let user re-enter.
            // Actually, totalAmount accounts for it.
            // If backend updateOrder expects deliveryCost, we better set it.
            setObservation(order.notes || '');
            setRetailClientName(order.retailclientname || '');
            setEmployerName(order.salespersonname || '');
            setShippingAddress(order.shippingaddress || ''); // NEW: Load Address
            setClientPhone(order.clientphone || '');         // NEW: Load Phone
            if (order.orderdate) {
              const d = new Date(order.orderdate);
              const year = d.getFullYear();
              const month = String(d.getMonth() + 1).padStart(2, '0');
              const day = String(d.getDate()).padStart(2, '0');
              setOrderDate(`${year}-${month}-${day}`);
            }

            // Capture initial state for "Ancien Solde" correction
            setOriginalOrderState({
              status: order.status,
              totalAmount: Number(order.totalamount),
              paymentAmount: Number(order.paymentamount || 0)
            });

            // Mark as loaded
            setLoadedEditId(Number(editOrderId));
          }
        } catch (e) {
          console.error("Failed to load order", e);
        }
      }
    };
    loadOrderToEdit();
  }, [editOrderId, products, customers, loadedEditId]);

  // Update Balance when Client Changes
  useEffect(() => {
    if (selectedCustomerId) {
      const c = customers.find(c => c.customerid === selectedCustomerId);
      setClientBalance(c?.currentbalance || 0);
    } else {
      setClientBalance(0);
    }
  }, [selectedCustomerId, customers]);

  // --- Keyboard Shortcuts ---
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'F1') {
        e.preventDefault();
        handleValidateSale();
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        if (isCustomerModalOpen) {
          setIsCustomerModalOpen(false);
        } else {
          router.push('/');
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [cart, selectedCustomerId, isSubmitting, isCustomerModalOpen]);

  // --- Logic: Add to Cart with Price Fetching ---
  const addToCart = async (product: Product) => {
    const exists = cart.find(i => i.productId === product.productid);
    if (exists) return;

    // Determine default unit based on product name
    // 120/60 products are sold in PCS (Exception requested by user)
    // Other tiles with Integer PCS/CTN -> PCS
    // Tiles with Decimal PCS/CTN -> SQM

    let defaultUnit = units.find(u => u.unitcode === 'PCS')?.unitid || units[0]?.unitid;
    const productNameLower = product.productname.toLowerCase();
    const has12060 = productNameLower.includes('120/60') || productNameLower.includes('120x60');
    const hasTileDimensions = /\d+[x\/]\d+/.test(product.productname);
    const isFicheProduct = productNameLower.startsWith('fiche');
    const isSingleItemPackaging = (product.derivedpiecespercolis === 1 && product.derivedcolisperpalette === 1);

    // Check if packaging is integer (approximate check to avoid float issues)
    const isIntegerPackaging = Math.abs(product.derivedpiecespercolis - Math.round(product.derivedpiecespercolis)) < 0.01;

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

    // Get stock data from product (aggregated in backend query)
    const stockPalettes = product.nbpalette || 0;
    const stockCartons = product.nbcolis || 0;
    const stockQty = product.totalqty || 0;

    // STOCK VALIDATION: Warn if stock is 0 or negative
    if (stockQty <= 0) {
      if (!confirm(`⚠️ ATTENTION: "${product.productname}" n'a pas de stock disponible (${stockQty}).\n\nVoulez-vous quand même l'ajouter au panier?`)) {
        return; // User cancelled, don't add
      }
    }

    // Calculate sqmPerPiece from tile dimensions
    const initialSqmPerPiece = parseSqmPerPiece(product.productname);
    const rawPackaging = product.derivedpiecespercolis || 0;

    // Normalize packaging using the helper
    const { piecesPerCarton, sqmPerPiece } = normalizePackaging(product.productname, rawPackaging, initialSqmPerPiece);

    const cartonsPerPalette = product.derivedcolisperpalette || 0;

    // Fetch calculated price if customer selected
    // NEW: Uses price history lookup (last sale price > custom price > base price)
    // Use prixvente (backend alias) or baseprice as fallback
    let unitPrice = Number(product.prixvente) || Number(product.baseprice) || 0;
    let priceSource = 'BASE';

    if (selectedCustomerId) {
      try {
        // Use new endpoint that checks sale history first
        const priceRes = await api.getCustomerProductPrice(selectedCustomerId as number, product.productid);
        if (priceRes.success && priceRes.data) {
          const data = priceRes.data as any;
          unitPrice = Number(data.recommendedPrice) || unitPrice;
          priceSource = data.priceSource || 'BASE'; // 'HISTORY', 'CUSTOM', or 'BASE'
        }
      } catch (error) {
        console.error('Error fetching price:', error);
      }
    }

    // APPLY MARGIN when using BASE price (from prixachat)
    // Formula: PrixVente = PrixAchat × (1 + Marge%)
    if (priceSource === 'BASE') {
      const purchasePrice = Number(product.prixachat) || 0;
      if (purchasePrice > 0) {
        // Determine which margin to apply based on user role
        const marginValue = isRetailMode
          ? (Number(appSettings.retailmargin) || 0)
          : (Number(appSettings.wholesalemargin) || 0);

        const marginType = isRetailMode
          ? (appSettings.retailmargintype || 'PERCENT')
          : (appSettings.wholesalemargintype || 'PERCENT');

        if (marginValue > 0) {
          if (marginType === 'AMOUNT') {
            // Price = PurchasePrice + Margin (Fixed Amount)
            unitPrice = purchasePrice + marginValue;
            console.log(`[Margin Applied] ${product.productname}: ${purchasePrice} + ${marginValue} = ${unitPrice.toFixed(2)} (Fixed Amount)`);
          } else {
            // Price = PurchasePrice * (1 + margin/100)
            unitPrice = purchasePrice * (1 + marginValue / 100);
            console.log(`[Margin Applied] ${product.productname}: ${purchasePrice} × (1 + ${marginValue}%) = ${unitPrice.toFixed(2)} (Percentage)`);
          }
          priceSource = isRetailMode ? 'MARGE_DETAIL' : 'MARGE_GROS';
        }
      }
    }

    // Fallback: If margin failed or was 0, and we rely on purchase price, set unitPrice
    // But usually purchasePrice * 1 is strictly cost.
    // If no margin set, we shouldn't sell at cost?
    // For now assuming existing logic is fine: if 0 margin, it sells at cost (or base price if 0 cost).


    // Ensure unitPrice is a valid number
    if (isNaN(unitPrice)) unitPrice = 0;

    const newItem: OrderItem = {
      productId: product.productid,
      productCode: product.productcode,
      productName: product.productname,
      brandName: product.famille || product.brandname || '',
      stockQty,
      stockPalettes,
      stockCartons,
      piecesPerCarton,
      cartonsPerPalette,
      sqmPerPiece,  // Already calculated above from tile dimensions in name
      palettes: 0,
      cartons: 0,
      quantity: 1,
      unitId: defaultUnit,
      unitPrice,
      priceSource,
      lineTotal: unitPrice * 1,
      purchasePrice: Number(product.prixachat) || 0 // Populate purchase price
    };
    setCart([...cart, newItem]);
    setSearchQuery('');
  };

  // --- Logic: Update Cart Item with Auto-Calculation ---
  const updateItem = (index: number, field: keyof OrderItem, value: any) => {
    const newCart = [...cart];
    const item = newCart[index];

    // When UNIT changes, convert quantity (NOT price)
    if (field === 'unitId') {
      const newUnitId = Number(value);
      const oldUnitCode = units.find((u: any) => u.unitid === item.unitId)?.unitcode || 'PCS';
      const newUnitCode = units.find((u: any) => u.unitid === newUnitId)?.unitcode || 'PCS';

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
      // Price stays the same - user entered it

      // Recalculate cartons and palettes based on new quantity
      // For CARTON unit, cartons = quantity (since 1 CARTON = 1)
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
      setCart(newCart);
      return;
    }

    (item as any)[field] = value;

    // Auto-calculate palettes and cartons when QUANTITY changes
    // Use Math.floor to show only COMPLETE cartons/palettes (not rounded up)
    // IMPORTANT: The quantity field value is in the currently selected UNIT
    // We need to convert to pieces first to calculate cartons correctly
    if (field === 'quantity') {
      const qty = parseFloat(value) || 0;
      const currentUnitCode = units.find((u: any) => u.unitid === item.unitId)?.unitcode || 'PCS';

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
      const cartons = parseFloat(value) || 0;
      const currentUnitCode = units.find((u: any) => u.unitid === item.unitId)?.unitcode || 'PCS';

      // Recalculate quantity from cartons (in pieces first, then convert to current unit)
      if (item.piecesPerCarton > 0) {
        const piecesQty = cartons * item.piecesPerCarton;

        // Convert pieces to the current unit
        if (currentUnitCode === 'SQM' && item.sqmPerPiece > 0) {
          item.quantity = piecesQty * item.sqmPerPiece;
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
      const palettes = parseFloat(value) || 0;
      const currentUnitCode = units.find((u: any) => u.unitid === item.unitId)?.unitcode || 'PCS';

      // Recalculate cartons from palettes
      if (item.cartonsPerPalette > 0) {
        item.cartons = palettes * item.cartonsPerPalette;
        // Recalculate quantity from cartons (in pieces first, then convert to current unit)
        if (item.piecesPerCarton > 0) {
          const piecesQty = item.cartons * item.piecesPerCarton;

          // Convert pieces to the current unit
          if (currentUnitCode === 'SQM' && item.sqmPerPiece > 0) {
            item.quantity = piecesQty * item.sqmPerPiece;
          } else if (currentUnitCode === 'CARTON' || currentUnitCode === 'CRT') {
            item.quantity = item.cartons; // If unit is CARTON, quantity = cartons
          } else {
            item.quantity = piecesQty; // PCS
          }
        }
      }
    }

    item.lineTotal = item.quantity * item.unitPrice;
    setCart(newCart);
  };

  const removeItem = (index: number) => {
    const newCart = [...cart];
    newCart.splice(index, 1);
    setCart(newCart);
  };

  // --- Calculations ---
  const totalHT = cart.reduce((sum, item) => sum + Number(item.lineTotal), 0);
  const totalTVA = 0;
  const totalNet = totalHT + totalTVA + Number(deliveryCost) - Number(discount) + Number(timber);
  const reste = totalNet - payment;

  // --- Search Filter (includes brand/famille) ---
  const filteredProducts = searchQuery.length > 1
    ? products.filter(p =>
      p.productname?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.productcode?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.famille?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.brandname?.toLowerCase().includes(searchQuery.toLowerCase())
    ).slice(0, 50) // Limit results for performance
    : [];

  // --- Customer Search Filter (for wholesale mode) ---
  const filteredCustomers = customerSearchQuery.length > 1
    ? customers.filter(c =>
      c.customertype !== 'RETAIL' && // Exclude retail customers
      (c.customername?.toLowerCase().includes(customerSearchQuery.toLowerCase()) ||
        c.customercode?.toLowerCase().includes(customerSearchQuery.toLowerCase()))
    ).slice(0, 30) // Limit results for performance
    : [];

  // Get selected customer name for display
  const selectedCustomer = customers.find(c => c.customerid === selectedCustomerId);

  // --- Create New Customer ---
  const handleCreateCustomer = async () => {
    if (!newCustomerName.trim()) {
      alert("Le nom du client est requis.");
      return;
    }
    setIsCreatingCustomer(true);
    try {
      const response = await api.createCustomer({
        customerCode: `CUST-${Date.now()}`,
        customerName: newCustomerName.trim(),
        customerType: newCustomerType,
        priceListId: null,
        phone: newCustomerPhone || null,
        address: newCustomerAddress || null,
        email: null,
        contactPerson: null,
        taxId: null,
        paymentTerms: null,
        rc: null,
        ai: null,
        nif: null,
        nis: null,
        rib: null,
        ancienSolde: 0
      });
      if (response.success && response.data) {
        const newCustomer = response.data as Customer;
        setCustomers([...customers, newCustomer]);
        setSelectedCustomerId(newCustomer.customerid);
        setIsCustomerModalOpen(false);
        setNewCustomerName('');
        setNewCustomerPhone('');
        setNewCustomerAddress('');
        alert(`✅ Client "${newCustomer.customername}" créé avec succès!`);
      } else {
        throw new Error(response.message || 'Échec de création');
      }
    } catch (error: any) {
      console.error('Error creating customer:', error);
      alert(`❌ Erreur: ${error.message}`);
    } finally {
      setIsCreatingCustomer(false);
    }
  };

  // --- Add Manual Product to Cart ---
  const handleAddManualProduct = () => {
    if (!manualProductName.trim()) {
      alert('Veuillez entrer le nom du produit.');
      return;
    }
    if (manualProductQty <= 0) {
      alert('La quantité doit être supérieure à 0.');
      return;
    }
    if (manualProductPrice <= 0) {
      alert('Le prix doit être supérieur à 0.');
      return;
    }

    const defaultUnit = units.find((u: any) => u.unitcode === 'PCS')?.unitid || units[0]?.unitid;

    // Prevent adding manual product if the ID was not fetched (avoids backend error)
    if (!manualProductId) {
      alert('Erreur technique: Impossible de charger l\'ID du produit manuel. Veuillez recharger la page.');
      console.error('Manual Product ID is null/undefined. Cannot proceed.');
      return;
    }

    const productIdToUse = manualProductId;

    const newItem: OrderItem = {
      productId: productIdToUse,
      productCode: 'MANUEL',
      productName: manualProductName.trim(),
      brandName: manualProductBrand || 'Produit Manuel',
      stockQty: 0,
      stockPalettes: 0,
      stockCartons: 0,
      piecesPerCarton: 0,
      cartonsPerPalette: 0,
      sqmPerPiece: parseSqmPerPiece(manualProductName),
      palettes: 0,
      cartons: 0,
      quantity: manualProductQty,
      unitId: defaultUnit,
      unitPrice: manualProductPrice,
      priceSource: 'MANUEL',
      lineTotal: manualProductQty * manualProductPrice,
    };

    setCart([...cart, newItem]);

    // Reset and close modal
    setManualProductName('');
    setManualProductQty(1);
    setManualProductPrice(0);
    setManualProductBrand('');
    setIsManualProductOpen(false);
  };

  // --- Validate Sale Handler ---
  const handleValidateSale = async () => {
    // DEBUG: Log retail mode detection
    console.log('DEBUG handleValidateSale:', { isRetailMode, retailClientName, userRole, selectedCustomerId });

    if (isSubmitting) return;

    // Retail mode: require client name
    // Wholesale mode: require customer selection OR a manually typed client name (passager)
    let isPassagerSale = false;
    if (isRetailMode) {
      if (!retailClientName.trim()) { alert("Veuillez entrer le nom du client."); return; }
    } else {
      if (!selectedCustomerId) {
        if (!customerSearchQuery.trim()) {
          alert("Veuillez sélectionner un client ou saisir un nom de client.");
          return;
        }
        isPassagerSale = true;
      }
    }

    if (cart.length === 0) { alert("Le panier est vide."); return; }

    setIsSubmitting(true);
    setApiError(null);

    try {
      // For passager sales (retail or wholesale), we use the "CLIENT COMPTOIR" placeholder
      // Look for customer with code 'COMPTOIR' or type 'RETAIL'
      const retailDefaultCustomer = customers.find(c => c.customercode === 'COMPTOIR')
        || customers.find(c => c.customertype === 'RETAIL');

      const effectiveCustomerId: number = (isRetailMode || isPassagerSale)
        ? (retailDefaultCustomer?.customerid || 0)
        : (selectedCustomerId as number);

      const passagerName = isRetailMode ? retailClientName.trim() : customerSearchQuery.trim();

      const selectedCustomer = (isRetailMode || isPassagerSale) ? null : customers.find(c => c.customerid === selectedCustomerId);

      const retailNotes = (isRetailMode || isPassagerSale)
        ? `Client Passager: ${passagerName} | Vendeur: ${userName || 'N/A'}`
        : '';

      // IMPORTANT: Use correct orderType based on user mode
      // RETAIL = cash sales (no balance tracking)
      // WHOLESALE = credit sales (balance tracking enabled)
      const orderType = isRetailMode ? 'RETAIL' : 'WHOLESALE';



      if (editOrderId) {
        // --- UPDATE EXISTING ORDER ---
        const res = await api.updateOrder(Number(editOrderId), {
          customerId: typeof effectiveCustomerId === 'number' ? effectiveCustomerId : null,
          clientName: (isRetailMode || isPassagerSale) ? passagerName : undefined,
          items: cart.map(item => ({
            productId: item.productId,
            quantity: item.quantity,
            unitId: item.unitId,
            unitPrice: item.unitPrice,
            palettes: item.palettes,
            cartons: item.cartons
          })),
          paymentAmount: payment,
          paymentMethod,
          deliveryCost,
          discount,
          timber,
          orderDate, // Include orderDate in update
          shippingAddress, // NEW: Send Address
          clientPhone,     // NEW: Send Phone
          notes: `${retailNotes} | ${observation}`
        });

        if (res.success) {
          alert('Commande modifiée avec succès');
          router.push('/orders');
        } else {
          throw new Error(res.message || 'Erreur lors de la modification');
        }

      } else {
        // --- CREATE NEW ORDER (Existing Logic) ---
        const orderResponse = await api.createOrder({
          customerId: effectiveCustomerId,
          orderType: orderType,
          warehouseId: 1,
          orderDate, // Include orderDate in create
          notes: `${retailNotes} | POS - Driver: ${driverId || 'N/A'}, Vehicle: ${vehicleId || 'N/A'}, Delivery: ${deliveryCost} DA, Discount: ${discount} DA, Timber: ${timber} DA, Payment: ${payment} DA`,
          retailClientName: (isRetailMode || isPassagerSale) ? passagerName : null,
          shippingAddress: shippingAddress || null,
          clientPhone: clientPhone || null,
          paymentAmount: payment,
          paymentMethod: paymentMethod
        });

        if (!orderResponse.success) throw new Error(orderResponse.message || 'Échec création commande');

        const orderId = (orderResponse.data as any).orderid;

        await Promise.all(cart.map(item =>
          api.addOrderItem(orderId, {
            productId: item.productId,
            quantity: item.quantity,
            unitId: item.unitId,
            unitPrice: item.unitPrice,
            colisCount: item.cartons,
            palletCount: item.palettes,
            productName: item.productCode === 'MANUEL' ? item.productName : undefined // Pass custom name for manual products
          })
        ));

        // Update financials (Delivery, Discount, etc) which are not handled by addOrderItem
        await api.updateOrderFinancials(orderId, {
          deliveryCost: deliveryCost,
          discount: discount,
          timber: timber,
          notes: `${retailNotes} | POS - Driver: ${driverId || 'N/A'}, Vehicle: ${vehicleId || 'N/A'}`,
          paymentAmount: payment,
          paymentMethod: paymentMethod
        });

        // 3. Finalize/Print (Already created as Pending)
        // Auto-print disabled per user request
        // setPrintingOrder({...});

        alert(`✅ Commande enregistrée (En Attente) - ${(orderResponse.data as any).ordernumber}`);

        // Reset form
        setCart([]);
        setPayment(0);
        setSelectedCustomerId('');
        setRetailClientName('');
        setObservation('');
        setDeliveryCost(0);
        // Clear URL param if strictly create mode? N/A
      } // End else
    } catch (error: any) {
      console.error('Sale validation error:', error);
      setApiError(`Erreur: ${error.message}`);
      alert(`❌ Erreur: ${error.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 p-3 sm:p-4 lg:p-6 pb-40 md:pb-6 text-slate-800">
      <div className="max-w-[1920px] mx-auto">

        {/* === HEADER BAR === */}
        <div className="mb-4 flex flex-col md:flex-row justify-between items-start md:items-center gap-3">
          <div>
            <h1 className="text-xl md:text-2xl font-bold text-slate-800">Point de Vente</h1>
            <p className="hidden md:block text-slate-500 text-xs mt-0.5">
              <span className="text-blue-600 font-medium">F1</span> valider • <span className="text-slate-600">Esc</span> annuler
            </p>
          </div>
          <Link href="/" className="bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 px-3 py-2 rounded-lg text-sm font-medium shadow-sm flex items-center gap-1.5">
            ← Retour
          </Link>
        </div>

        {/* Error Display */}
        {apiError && (
          <div className="mb-3 p-3 bg-red-50 text-red-700 border border-red-200 rounded-lg text-sm">
            <strong>Erreur:</strong> {apiError}
          </div>
        )}

        {/* === MAIN CONTENT === */}
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">

          {/* === LEFT COLUMN === */}
          <div className="xl:col-span-3 space-y-4">

            {/* Identifications Card */}
            <div className="bg-white rounded-lg border border-slate-200 shadow-sm">
              <div className="bg-slate-50 px-3 py-2 border-b border-slate-200 flex justify-between items-center">
                <h2 className="text-xs font-bold text-slate-600 uppercase tracking-wide">Identifications</h2>
                {userName && (
                  <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-medium">
                    👤 {userName}
                  </span>
                )}
              </div>
              <div className="p-3 space-y-3">
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Date</label>
                  <input type="date" value={orderDate} onChange={e => setOrderDate(e.target.value)}
                    className="w-full p-2 border border-slate-300 rounded text-sm" />
                </div>

                {/* Conditional Client Selection */}
                {isRetailMode ? (
                  // RETAIL MODE: Manual text input for client name and employer name
                  <>
                    <div>
                      <label className="block text-xs font-medium text-slate-500 mb-1">
                        Nom du Client <span className="text-orange-500 text-xs">(Vente Détail)</span>
                      </label>
                      <input
                        type="text"
                        value={retailClientName}
                        onChange={e => setRetailClientName(e.target.value)}
                        placeholder="Ex: Mohamed, Client comptoir..."
                        className="w-full p-2 border border-slate-300 rounded text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-500 mb-1">
                        Établie par <span className="text-blue-500 text-xs">(Vendeur)</span>
                      </label>
                      <input
                        type="text"
                        value={employerName}
                        onChange={e => setEmployerName(e.target.value)}
                        placeholder={userName || "Nom du vendeur..."}
                        className="w-full p-2 border border-blue-200 rounded text-sm bg-blue-50"
                      />
                    </div>
                  </>
                ) : (
                  // WHOLESALE MODE: Searchable customer input
                  <>
                    <div>
                      <label className="block text-xs font-medium text-slate-500 mb-1">Client *</label>
                      <div className="flex gap-1.5">
                        <div className="relative flex-1">
                          {/* Show selected customer or search input */}
                          {selectedCustomerId ? (
                            <div className="flex items-center gap-2 p-2 border border-green-300 rounded text-sm bg-green-50">
                              <span className="flex-1 font-medium text-green-800 truncate">
                                ✓ {selectedCustomer?.customername || 'Client sélectionné'}
                              </span>
                              <button
                                onClick={() => {
                                  setSelectedCustomerId('');
                                  setCustomerSearchQuery('');
                                }}
                                className="text-red-500 hover:text-red-700 font-bold text-lg leading-none"
                                title="Effacer"
                              >
                                ×
                              </button>
                            </div>
                          ) : (
                            <>
                              <input
                                type="text"
                                placeholder="🔍 Rechercher client..."
                                value={customerSearchQuery}
                                onChange={e => setCustomerSearchQuery(e.target.value)}
                                className="w-full p-2 border border-slate-300 rounded text-sm focus:border-blue-400 focus:ring-1 focus:ring-blue-400"
                              />
                              {/* Autocomplete dropdown */}
                              {filteredCustomers.length > 0 && (
                                <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-300 shadow-xl z-50 max-h-48 overflow-y-auto rounded-lg">
                                  {filteredCustomers.map(c => (
                                    <div
                                      key={c.customerid}
                                      onClick={() => {
                                        setSelectedCustomerId(c.customerid);
                                        setCustomerSearchQuery('');
                                      }}
                                      className="p-2.5 hover:bg-blue-50 cursor-pointer flex justify-between border-b border-slate-100 last:border-0 text-sm"
                                    >
                                      <span className="font-medium text-slate-800">{c.customername}</span>
                                      <span className={`text-xs ${c.currentbalance > 0 ? 'text-red-600' : 'text-green-600'}`}>
                                        {formatCurrency(c.currentbalance)}
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              )}
                              {/* No results message */}
                              {customerSearchQuery.length > 1 && filteredCustomers.length === 0 && (
                                <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-300 shadow-lg z-50 p-3 rounded-lg text-center text-slate-500 text-sm">
                                  Aucun client trouvé pour "{customerSearchQuery}"
                                </div>
                              )}
                            </>
                          )}
                        </div>
                        <button onClick={() => setIsCustomerModalOpen(true)} className="bg-blue-600 hover:bg-blue-700 text-white px-3 rounded font-bold">+</button>
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-500 mb-1">Solde</label>
                      <input disabled value={formatCurrency(clientBalance)}
                        className={`w-full p-2 border rounded text-sm font-bold text-right ${clientBalance > 0 ? 'bg-red-50 border-red-200 text-red-600' : 'bg-green-50 border-green-200 text-green-600'}`} />
                    </div>
                  </>
                )}
                {/* Address & Phone Inputs (For everyone) */}
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1">Adresse (Livraison/Info)</label>
                    <input type="text" value={shippingAddress} onChange={e => setShippingAddress(e.target.value)}
                      placeholder="Adresse..."
                      className="w-full p-2 border border-slate-300 rounded text-sm" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1">Téléphone</label>
                    <input type="text" value={clientPhone} onChange={e => setClientPhone(e.target.value)}
                      placeholder="Numéro..."
                      className="w-full p-2 border border-slate-300 rounded text-sm" />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Observation</label>
                  <textarea value={observation} onChange={e => setObservation(e.target.value)} rows={2}
                    placeholder="Notes..."
                    className="w-full p-2 border border-slate-300 rounded text-sm resize-none" />
                </div>
              </div>
            </div>

            {/* Logistics Card */}
            <div className="bg-white rounded-lg border border-slate-200 shadow-sm">
              <div className="bg-slate-50 px-3 py-2 border-b border-slate-200">
                <h2 className="text-xs font-bold text-slate-600 uppercase tracking-wide">Logistique</h2>
              </div>
              <div className="p-3 space-y-2">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1">Chauffeur</label>
                    <select className="w-full p-2 border border-slate-300 rounded text-sm" value={driverId} onChange={e => setDriverId(e.target.value)}>
                      <option value="">--</option>
                      {drivers.map(d => <option key={d.driverid} value={d.driverid}>{d.firstname} {d.lastname}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1">Véhicule</label>
                    <select className="w-full p-2 border border-slate-300 rounded text-sm" value={vehicleId} onChange={e => setVehicleId(e.target.value)}>
                      <option value="">--</option>
                      {vehicles.map(v => <option key={v.vehicleid} value={v.vehicleid}>{v.vehiclenumber}</option>)}
                    </select>
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Livraison (DA)</label>
                  <input type="number" value={deliveryCost} onChange={e => setDeliveryCost(Number(e.target.value))}
                    onWheel={(e) => e.currentTarget.blur()}
                    className="w-full p-2 border border-slate-300 rounded text-sm text-right" />
                </div>
              </div>
            </div>

            {/* Finance Card */}
            <div className="bg-white rounded-lg border border-slate-200 shadow-sm">
              <div className="bg-slate-50 px-3 py-2 border-b border-slate-200">
                <h2 className="text-xs font-bold text-slate-600 uppercase tracking-wide">Finance</h2>
              </div>
              <div className="p-3 space-y-2">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1">Remise</label>
                    <input type="number" value={discount} onChange={e => setDiscount(Number(e.target.value))}
                      onWheel={(e) => e.currentTarget.blur()}
                      className="w-full p-2 border border-slate-300 rounded text-sm text-right text-red-600" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1">Timbre</label>
                    <input type="number" value={timber} onChange={e => setTimber(Number(e.target.value))}
                      onWheel={(e) => e.currentTarget.blur()}
                      className="w-full p-2 border border-slate-300 rounded text-sm text-right" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs font-medium text-amber-600 mb-1 font-bold">Versement (DA)</label>
                    <input type="number" value={payment} onChange={e => setPayment(Number(e.target.value))}
                      onWheel={(e) => e.currentTarget.blur()}
                      className="w-full p-2 border-2 border-amber-300 rounded text-sm text-right font-bold text-blue-800 bg-amber-50" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Mode Paiement</label>
                    <select
                      value={paymentMethod}
                      onChange={e => setPaymentMethod(e.target.value as 'ESPECE' | 'VIREMENT' | 'CHEQUE')}
                      className="w-full p-2 border border-slate-300 rounded text-sm bg-white"
                    >
                      <option value="ESPECE">💵 Espèce</option>
                      <option value="VIREMENT">🏦 Virement</option>
                      <option value="CHEQUE">📄 Chèque</option>
                    </select>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* === CENTER/RIGHT: Product Grid + Totals === */}
          <div className="xl:col-span-9 flex flex-col gap-4">

            {/* Search Bar + Browse Button */}
            <div className="flex gap-2">
              <div className="relative flex-1">
                <input
                  autoFocus
                  type="text"
                  placeholder="🔍 Rechercher produit..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="w-full p-2.5 border-2 border-blue-300 rounded-lg bg-amber-50 text-slate-800 placeholder:text-slate-400 text-sm font-medium"
                />
                {filteredProducts.length > 0 && (
                  <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-300 shadow-xl z-50 max-h-60 overflow-y-auto rounded-lg">
                    {filteredProducts.map(p => (
                      <div
                        key={p.productid}
                        onClick={() => addToCart(p)}
                        className="p-2.5 hover:bg-blue-50 cursor-pointer flex justify-between border-b border-slate-100 last:border-0 text-sm"
                      >
                        <span className="font-medium text-slate-800">
                          {p.productname}
                          <span className="text-slate-500 text-xs ml-2 font-normal">
                            ({p.famille || p.brandname || 'Sans marque'})
                          </span>
                        </span>
                        <span className="text-green-600 font-medium">{formatCurrency(Number(p.prixvente) || Number(p.baseprice) || 0)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <button
                onClick={() => setIsProductBrowserOpen(true)}
                className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2.5 rounded-lg font-medium text-sm flex items-center gap-2 whitespace-nowrap"
              >
                📋 Catalogue
              </button>
              <button
                onClick={() => setIsManualProductOpen(true)}
                className="bg-amber-500 hover:bg-amber-600 text-white px-4 py-2.5 rounded-lg font-medium text-sm flex items-center gap-2 whitespace-nowrap"
              >
                ✏️ Produit Manuel
              </button>
            </div>

            {/* Product Table - Desktop */}
            <div className="hidden md:block bg-white rounded-lg border border-slate-200 shadow-sm flex-1 overflow-hidden flex flex-col">
              <div className="overflow-x-auto flex flex-col" style={{ maxHeight: 'calc(100vh - 50px)' }}>
                <table className="w-full text-xs" style={{ tableLayout: 'fixed' }}>
                  <thead className="bg-slate-700 text-white text-[10px] uppercase sticky top-0 z-10">
                    <tr>
                      <th className="px-1.5 py-1.5 text-left" style={{ width: 30 }}>#</th>
                      <ResizableHeader columnKey="designation" width={cartWidths.designation} onResize={handleCartResize} className="px-1.5 py-1.5 text-left">Désignation</ResizableHeader>
                      <ResizableHeader columnKey="marque" width={cartWidths.marque} onResize={handleCartResize} className="px-1.5 py-1.5 text-left">Marque</ResizableHeader>
                      <ResizableHeader columnKey="stock" width={cartWidths.stock} onResize={handleCartResize} className="px-1.5 py-1.5 text-right">Stock</ResizableHeader>
                      <ResizableHeader columnKey="palettes" width={cartWidths.palettes} onResize={handleCartResize} className="px-1.5 py-1.5 text-center" style={{ backgroundColor: '#3730a3' }}>Palettes</ResizableHeader>
                      <ResizableHeader columnKey="cartons" width={cartWidths.cartons} onResize={handleCartResize} className="px-1.5 py-1.5 text-center" style={{ backgroundColor: '#3730a3' }}>Cartons</ResizableHeader>
                      <ResizableHeader columnKey="quantity" width={cartWidths.quantity} onResize={handleCartResize} className="px-1.5 py-1.5 text-center" style={{ backgroundColor: '#1e40af' }}>Quantité</ResizableHeader>
                      <ResizableHeader columnKey="unite" width={cartWidths.unite} onResize={handleCartResize} className="px-1.5 py-1.5 text-left">Unité</ResizableHeader>
                      <ResizableHeader columnKey="prixunit" width={cartWidths.prixunit} onResize={handleCartResize} className="px-1.5 py-1.5 text-right">Prix Unit.</ResizableHeader>
                      <ResizableHeader columnKey="src" width={cartWidths.src} onResize={handleCartResize} className="px-1.5 py-1.5 text-center">Src</ResizableHeader>
                      <ResizableHeader columnKey="totalligne" width={cartWidths.totalligne} onResize={handleCartResize} className="px-1.5 py-1.5 text-right">Total Ligne</ResizableHeader>
                      <th className="px-1.5 py-1.5" style={{ width: 30 }}></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 overflow-y-auto">
                    {cart.map((item, index) => (
                      <tr key={index} className="hover:bg-slate-50">
                        <td className="px-1.5 py-1 text-slate-400">{index + 1}</td>
                        <td className="px-1.5 py-1">
                          <div className="font-medium text-slate-800 truncate max-w-[250px] text-xs leading-tight">{item.productName}</div>
                          {item.piecesPerCarton > 0 && (
                            <div className="text-[10px] text-slate-400 leading-tight">
                              {parseFloat(String(item.piecesPerCarton))} pcs/ctn • {parseFloat(String(item.cartonsPerPalette))} ctn/pal
                            </div>
                          )}
                        </td>
                        <td className="px-1.5 py-1 text-slate-600 text-[10px]">{item.brandName || '-'}</td>
                        <td className="px-1.5 py-1 text-right text-slate-500 bg-slate-50 font-mono">{parseFloat(String(item.stockQty)).toLocaleString('fr-FR', { maximumFractionDigits: 2 })}</td>
                        <td className="px-1.5 py-1 bg-indigo-50">
                          <SmartNumberInput
                            value={item.palettes}
                            onChange={(val) => updateItem(index, 'palettes', val)}
                            className="w-full text-center p-1 border border-indigo-200 rounded font-bold text-indigo-800 bg-white text-xs"
                          />
                        </td>
                        <td className="px-1.5 py-1 bg-indigo-50">
                          <SmartNumberInput
                            value={item.cartons}
                            onChange={(val) => updateItem(index, 'cartons', val)}
                            className="w-full text-center p-1 border border-indigo-200 rounded font-bold text-indigo-800 bg-white text-xs"
                          />
                        </td>
                        <td className="px-1.5 py-1 bg-blue-50">
                          <SmartNumberInput
                            value={item.quantity}
                            step="0.01"
                            onChange={(val) => updateItem(index, 'quantity', val)}
                            className="w-full text-center p-1 border-2 border-blue-300 rounded font-bold text-blue-900 bg-white text-xs"
                          />
                          {/* Conversion hint - Skip FICHE products (sample/technical sheets) */}
                          {item.sqmPerPiece > 0 && item.quantity > 0 && !item.productName.toLowerCase().startsWith('fiche') && (
                            <div className="text-[10px] text-center mt-0.5 text-slate-500">
                              {units.find(u => u.unitid === item.unitId)?.unitcode === 'SQM'
                                ? `≈ ${convertToPieces(item.quantity, item.sqmPerPiece).toFixed(1)} pcs`
                                : units.find(u => u.unitid === item.unitId)?.unitcode === 'PCS'
                                  ? `≈ ${convertToSqm(item.quantity, item.sqmPerPiece).toFixed(2)} m²`
                                  : null
                              }
                            </div>
                          )}
                        </td>
                        <td className="px-1.5 py-1">
                          <select
                            value={item.unitId}
                            onChange={(e) => updateItem(index, 'unitId', Number(e.target.value))}
                            className="w-full p-1 text-[10px] border border-slate-200 rounded"
                          >
                            {units.filter(u => u.unitcode !== 'BOX').map(u => (
                              <option key={u.unitid} value={u.unitid}>
                                {u.unitcode === 'CARTON' ? 'COLIS' : u.unitcode}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="px-1.5 py-1">
                          <SmartNumberInput
                            value={item.unitPrice}
                            step="0.01"
                            onChange={(val) => updateItem(index, 'unitPrice', val)}
                            className={`w-full text-right p-1 border rounded font-mono text-xs ${(item.purchasePrice && item.unitPrice < item.purchasePrice)
                              ? 'border-red-500 text-red-600 bg-red-50'
                              : 'border-slate-200'
                              }`}
                          />
                          {(item.purchasePrice && item.unitPrice < item.purchasePrice) && (
                            <div className="text-[10px] text-red-600 font-bold mt-0.5 text-right flex justify-end items-center gap-1">
                              <span>⚠️ &lt; Achat ({formatCurrency(item.purchasePrice)})</span>
                            </div>
                          )}
                        </td>
                        <td className="px-1.5 py-1 text-center">
                          <span className={`px-1 py-0.5 rounded text-[10px] font-medium ${getPriceSourceBadge(item.priceSource)}`}>
                            {item.priceSource.slice(0, 3)}
                          </span>
                        </td>
                        <td className="px-1.5 py-1 text-right font-bold text-slate-800 font-mono">
                          {formatCurrency(item.lineTotal)}
                        </td>
                        <td className="px-1.5 py-1 text-center">
                          <button onClick={() => removeItem(index)} className="text-red-500 hover:text-red-700 font-bold text-sm leading-none">×</button>
                        </td>
                      </tr>
                    ))}
                    {cart.length === 0 && (
                      <tr>
                        <td colSpan={12} className="px-6 py-8 text-center text-slate-400 italic text-xs">
                          Recherchez et ajoutez des produits...
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Product Cards - Mobile */}
            <div className="md:hidden space-y-3">
              {cart.length === 0 ? (
                <div className="bg-white rounded-xl p-8 text-center text-slate-400 italic border border-slate-200">
                  Recherchez et ajoutez des produits...
                </div>
              ) : (
                cart.map((item, index) => (
                  <div key={index} className="bg-white rounded-xl border border-slate-200 shadow-sm p-3">
                    {/* Header Row */}
                    <div className="flex justify-between items-start mb-2">
                      <div className="flex-1 pr-2">
                        <div className="font-semibold text-slate-800 text-sm leading-tight">{item.productName}</div>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-xs text-slate-500">{item.brandName || 'Sans marque'}</span>
                          <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${getPriceSourceBadge(item.priceSource)}`}>
                            {item.priceSource}
                          </span>
                        </div>
                        <div className="text-xs text-slate-400 mt-0.5">
                          {item.piecesPerCarton > 0 && `${item.piecesPerCarton} pcs/ctn`}
                          {item.cartonsPerPalette > 0 && ` • ${item.cartonsPerPalette} ctn/pal`}
                          {` • Stock: ${parseFloat(String(item.stockQty)).toLocaleString('fr-FR', { maximumFractionDigits: 2 })}`}
                        </div>
                      </div>
                      <button
                        onClick={() => removeItem(index)}
                        className="text-red-500 hover:text-red-700 font-bold text-xl w-8 h-8 flex items-center justify-center bg-red-50 rounded-full"
                      >
                        ×
                      </button>
                    </div>

                    {/* Packaging Row */}
                    <div className="grid grid-cols-3 gap-2 mb-2">
                      <div>
                        <label className="block text-xs text-indigo-600 mb-1 text-center font-medium">Palettes</label>
                        <SmartNumberInput
                          value={item.palettes}
                          onChange={(val) => updateItem(index, 'palettes', val)}
                          className="w-full text-center p-3 border border-indigo-200 rounded-lg font-bold text-indigo-800 bg-indigo-50 text-lg shadow-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-indigo-600 mb-1 text-center font-medium">Cartons</label>
                        <SmartNumberInput
                          value={item.cartons}
                          onChange={(val) => updateItem(index, 'cartons', val)}
                          className="w-full text-center p-3 border border-indigo-200 rounded-lg font-bold text-indigo-800 bg-indigo-50 text-lg shadow-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-blue-600 mb-1 text-center font-medium">Quantité</label>
                        <SmartNumberInput
                          value={item.quantity}
                          step="0.01"
                          onChange={(val) => updateItem(index, 'quantity', val)}
                          className="w-full text-center p-3 border-2 border-blue-400 rounded-lg font-bold text-blue-900 bg-blue-50 text-lg shadow-sm"
                        />
                        {/* Conversion hint - Skip FICHE products (sample/technical sheets) */}
                        {item.sqmPerPiece > 0 && item.quantity > 0 && !item.productName.toLowerCase().startsWith('fiche') && (
                          <div className="text-xs text-center mt-0.5 text-slate-500">
                            {units.find(u => u.unitid === item.unitId)?.unitcode === 'SQM'
                              ? `≈ ${convertToPieces(item.quantity, item.sqmPerPiece).toFixed(1)} pcs`
                              : units.find(u => u.unitid === item.unitId)?.unitcode === 'PCS'
                                ? `≈ ${convertToSqm(item.quantity, item.sqmPerPiece).toFixed(2)} m²`
                                : null
                            }
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Unit & Price Row */}
                    <div className="flex justify-between items-center pt-2 border-t border-slate-100 gap-2 relative">
                      <div className="flex items-center gap-2 flex-1">
                        <select
                          value={item.unitId}
                          onChange={(e) => updateItem(index, 'unitId', Number(e.target.value))}
                          className="p-2 text-xs border border-slate-200 rounded-lg bg-white"
                        >
                          {units.filter(u => u.unitcode !== 'BOX').map(u => (
                            <option key={u.unitid} value={u.unitid}>
                              {u.unitcode === 'CARTON' ? 'COLIS' : u.unitcode}
                            </option>
                          ))}
                        </select>
                        <SmartNumberInput
                          value={item.unitPrice}
                          step="0.01"
                          onChange={(val) => updateItem(index, 'unitPrice', val)}
                          className={`w-28 text-right p-3 border rounded-lg font-mono text-sm shadow-sm ${(item.purchasePrice && item.unitPrice < item.purchasePrice)
                            ? 'border-red-500 text-red-600 bg-red-50'
                            : 'border-slate-200'
                            }`}
                        />
                        {(item.purchasePrice && item.unitPrice < item.purchasePrice) && (
                          <div className="absolute right-0 -bottom-5 text-[10px] text-red-600 font-bold flex items-center gap-1 bg-white px-1 rounded border border-red-100 shadow-sm z-10">
                            <span>⚠️ &lt; Achat ({formatCurrency(item.purchasePrice)})</span>
                          </div>
                        )}
                        <span className="text-xs text-slate-500">DA</span>
                      </div>
                      <div className="text-right">
                        <div className="font-bold text-lg text-slate-800">{formatCurrency(item.lineTotal)}</div>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Totals & Actions - Desktop Only */}
            <div className="hidden md:block bg-white rounded-lg border border-slate-200 shadow-sm p-4">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

                {/* Totals */}
                <div className="space-y-1.5 text-sm">
                  <div className="flex justify-between text-slate-600">
                    <span>Total HT:</span>
                    <span className="font-mono">{formatCurrency(totalHT)}</span>
                  </div>
                  {deliveryCost > 0 && (
                    <div className="flex justify-between text-slate-600">
                      <span>Livraison:</span>
                      <span className="font-mono">+{formatCurrency(deliveryCost)}</span>
                    </div>
                  )}
                  {discount > 0 && (
                    <div className="flex justify-between text-red-600">
                      <span>Remise:</span>
                      <span className="font-mono">-{formatCurrency(discount)}</span>
                    </div>
                  )}
                  {timber > 0 && (
                    <div className="flex justify-between text-slate-600">
                      <span>Timbre:</span>
                      <span className="font-mono">+{formatCurrency(timber)}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-lg font-bold bg-slate-800 text-white p-2.5 rounded-lg mt-2">
                    <span>NET:</span>
                    <span className="font-mono">{formatCurrency(totalNet)}</span>
                  </div>
                  {payment > 0 && (
                    <div className="flex justify-between text-blue-700 font-semibold">
                      <span>Versement:</span>
                      <span className="font-mono">-{formatCurrency(payment)}</span>
                    </div>
                  )}
                  <div className={`flex justify-between font-bold text-lg ${reste > 0 ? 'text-red-600' : 'text-green-600'}`}>
                    <span>Reste:</span>
                    <span className="font-mono">{formatCurrency(reste)}</span>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex flex-col justify-end gap-2">
                  {/* Print Buttons Row */}
                  <div className="flex gap-2">
                    <button
                      onClick={handlePrintBCMobile}
                      disabled={cart.length === 0}
                      className="flex-1 px-2 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-lg font-medium text-xs disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      🖨️ BC
                    </button>
                    <button
                      onClick={handlePrintBLMobile}
                      disabled={cart.length === 0}
                      className="flex-1 px-2 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium text-xs disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      🖨️ BL
                    </button>
                    <button
                      onClick={handlePrintBSSMobile}
                      disabled={cart.length === 0}
                      className="flex-1 px-2 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg font-medium text-xs disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      🖨️ BSS
                    </button>
                    <button
                      onClick={handlePrintTicketMobile}
                      disabled={cart.length === 0}
                      className="flex-1 px-2 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-lg font-medium text-xs disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      🎫 Ticket
                    </button>
                  </div>
                  <button onClick={() => router.push('/')} className="w-full px-4 py-2.5 bg-slate-100 border border-slate-300 text-slate-700 rounded-lg font-medium hover:bg-slate-200">
                    <span className="text-slate-400 text-xs">(Esc)</span> Annuler
                  </button>
                  <button
                    onClick={handleValidateSale}
                    disabled={isSubmitting || cart.length === 0 || (isRetailMode ? !retailClientName.trim() : (!selectedCustomerId && !customerSearchQuery.trim()))}
                    className="w-full px-6 py-3 bg-green-600 text-white rounded-lg font-bold hover:bg-green-700 shadow-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    {isSubmitting ? (
                      <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div> En cours...</>
                    ) : (
                      <><span className="text-green-200 text-xs">(F1)</span> Valider Vente</>
                    )}
                  </button>
                </div>
              </div>
            </div>

            {/* Mobile Totals Summary */}
            <div className="md:hidden bg-white rounded-xl border border-slate-200 shadow-sm p-4 mb-36">
              <div className="space-y-1.5 text-sm">
                <div className="flex justify-between text-slate-600">
                  <span>Total HT:</span>
                  <span className="font-mono">{formatCurrency(totalHT)}</span>
                </div>
                {deliveryCost > 0 && (
                  <div className="flex justify-between text-slate-600">
                    <span>Livraison:</span>
                    <span className="font-mono text-blue-600">+{formatCurrency(deliveryCost)}</span>
                  </div>
                )}
                {discount > 0 && (
                  <div className="flex justify-between text-red-600">
                    <span>Remise:</span>
                    <span className="font-mono">-{formatCurrency(discount)}</span>
                  </div>
                )}
                {timber > 0 && (
                  <div className="flex justify-between text-slate-600">
                    <span>Timbre:</span>
                    <span className="font-mono">+{formatCurrency(timber)}</span>
                  </div>
                )}
                <div className="flex justify-between text-lg font-bold bg-slate-800 text-white p-3 rounded-lg mt-2">
                  <span>NET:</span>
                  <span className="font-mono">{formatCurrency(totalNet)}</span>
                </div>
                {payment > 0 && (
                  <div className="flex justify-between text-blue-700 font-semibold">
                    <span>Versement:</span>
                    <span className="font-mono">-{formatCurrency(payment)}</span>
                  </div>
                )}
                <div className={`flex justify-between font-bold text-lg ${reste > 0 ? 'text-red-600' : 'text-green-600'}`}>
                  <span>Reste:</span>
                  <span className="font-mono">{formatCurrency(reste)}</span>
                </div>
                {!isRetailMode && clientBalance !== 0 && (
                  <div className="flex justify-between text-xs text-slate-500 pt-1 border-t border-slate-100">
                    <span>Ancien solde client:</span>
                    <span className={`font-mono ${clientBalance > 0 ? 'text-red-500' : 'text-green-500'}`}>
                      {formatCurrency(clientBalance)}
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Fixed Mobile Action Bar */}
        <div className="md:hidden fixed bottom-16 left-0 right-0 bg-white border-t border-slate-200 shadow-lg p-3 z-40">
          <div className="flex gap-2 mb-2">
            <button
              onClick={handlePrintBCMobile}
              disabled={cart.length === 0}
              className="flex-1 py-3 bg-amber-500 active:bg-amber-600 text-white rounded-lg font-medium text-sm disabled:opacity-50"
            >
              🖨️ Charg.
            </button>
            <button
              onClick={handlePrintBLMobile}
              disabled={cart.length === 0}
              className="flex-1 py-3 bg-blue-600 active:bg-blue-700 text-white rounded-lg font-medium text-sm disabled:opacity-50"
            >
              🖨️ Livraison
            </button>
            <button
              onClick={handlePrintTicketMobile}
              disabled={cart.length === 0}
              className="flex-1 py-3 bg-teal-600 active:bg-teal-700 text-white rounded-lg font-medium text-sm disabled:opacity-50"
            >
              🎫 Ticket
            </button>
          </div>
          <button
            onClick={handleValidateSale}
            disabled={isSubmitting || cart.length === 0 || (isRetailMode ? !retailClientName.trim() : (!selectedCustomerId && !customerSearchQuery.trim()))}
            className="w-full py-4 bg-green-600 active:bg-green-700 text-white rounded-xl font-bold text-lg disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {isSubmitting ? (
              <><div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div> En cours...</>
            ) : (
              <>✓ Valider ({formatCurrency(totalNet)})</>
            )}
          </button>
        </div>

        {/* Hidden Print Components */}
        <div style={{ display: 'none' }}>
          {printingOrder && <ReceiptTemplate ref={printRef} order={printingOrder} />}
          <StandardDocument ref={blRef} type="DELIVERY_NOTE" data={getPrintData()} />
          <StandardDocument ref={bcRef} type="LOADING_SLIP" data={getPrintData()} />
          <StandardDocument ref={ticketRef} type="TICKET" data={getPrintData()} />
        </div>

        {/* Customer Modal */}
        {isCustomerModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-0 md:p-4">
            <div className="w-full h-full md:h-auto md:max-w-md bg-white md:rounded-lg shadow-2xl flex flex-col">
              <div className="p-4 border-b flex justify-between items-center">
                <h2 className="text-lg font-bold">Nouveau Client</h2>
                <button onClick={() => setIsCustomerModalOpen(false)} className="text-slate-400 hover:text-slate-600 text-2xl">&times;</button>
              </div>
              <div className="p-4 space-y-3">
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Nom *</label>
                  <input type="text" value={newCustomerName} onChange={e => setNewCustomerName(e.target.value)}
                    placeholder="SARL CERAMIQUE" className="w-full p-2 border border-slate-300 rounded text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Type</label>
                  <select value={newCustomerType} onChange={e => setNewCustomerType(e.target.value as 'RETAIL' | 'WHOLESALE')} className="w-full p-2 border border-slate-300 rounded text-sm">
                    <option value="WHOLESALE">Grossiste</option>
                    <option value="RETAIL">Détaillant</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Téléphone</label>
                  <input type="tel" value={newCustomerPhone} onChange={e => setNewCustomerPhone(e.target.value)}
                    placeholder="0555 123 456" className="w-full p-2 border border-slate-300 rounded text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Adresse</label>
                  <textarea value={newCustomerAddress} onChange={e => setNewCustomerAddress(e.target.value)} rows={2}
                    placeholder="Zone Industrielle" className="w-full p-2 border border-slate-300 rounded text-sm resize-none" />
                </div>
              </div>
              <div className="p-4 border-t flex justify-end gap-2 mt-auto">
                <button onClick={() => setIsCustomerModalOpen(false)} disabled={isCreatingCustomer} className="bg-white border border-slate-300 text-slate-700 px-4 py-2 rounded text-sm font-medium">Annuler</button>
                <button onClick={handleCreateCustomer} disabled={isCreatingCustomer || !newCustomerName.trim()}
                  className="bg-blue-600 text-white px-4 py-2 rounded text-sm font-medium disabled:opacity-50">
                  {isCreatingCustomer ? 'Création...' : 'Créer'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* MANUAL PRODUCT MODAL */}
        {isManualProductOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-0 md:p-4">
            <div className="w-full h-full md:h-auto md:max-w-md bg-white md:rounded-lg shadow-2xl flex flex-col">
              <div className="p-4 border-b flex justify-between items-center bg-amber-50">
                <h2 className="text-lg font-bold text-amber-800">✏️ Produit Manuel</h2>
                <button onClick={() => setIsManualProductOpen(false)} className="text-slate-400 hover:text-slate-600 text-2xl">&times;</button>
              </div>
              <div className="p-4 space-y-4">
                <p className="text-sm text-slate-500 bg-slate-50 p-2 rounded">
                  Utilisez cette option pour ajouter un produit qui n'est pas dans l'inventaire (ancien produit, article spécial, etc.)
                </p>
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Nom du Produit *</label>
                  <input
                    type="text"
                    value={manualProductName}
                    onChange={e => setManualProductName(e.target.value)}
                    placeholder="Ex: Carrelage 30x30 Ancien Stock"
                    className="w-full p-2 border border-slate-300 rounded text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Marque</label>
                  <select
                    value={manualProductBrand}
                    onChange={e => setManualProductBrand(e.target.value)}
                    className="w-full p-2 border border-slate-300 rounded text-sm bg-white"
                  >
                    <option value="">-- Sélectionner une marque --</option>
                    {brands.map(b => (
                      <option key={b.brandid} value={b.brandname}>{b.brandname}</option>
                    ))}
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1">Quantité *</label>
                    <input
                      type="number"
                      value={manualProductQty}
                      onChange={e => setManualProductQty(Number(e.target.value))}
                      min="1"
                      className="w-full p-2 border border-slate-300 rounded text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1">Prix Unitaire (DA) *</label>
                    <input
                      type="number"
                      value={manualProductPrice}
                      onChange={e => setManualProductPrice(Number(e.target.value))}
                      min="0"
                      step="0.01"
                      className="w-full p-2 border border-slate-300 rounded text-sm"
                    />
                  </div>
                </div>
                <div className="p-3 bg-amber-50 border border-amber-200 rounded text-sm">
                  <strong className="text-amber-800">Total ligne:</strong>{' '}
                  <span className="font-bold text-amber-700">{(manualProductQty * manualProductPrice).toLocaleString('fr-DZ')} DA</span>
                </div>
              </div>
              <div className="p-4 border-t flex justify-end gap-2">
                <button
                  onClick={() => setIsManualProductOpen(false)}
                  className="bg-white border border-slate-300 text-slate-700 px-4 py-2 rounded text-sm font-medium"
                >
                  Annuler
                </button>
                <button
                  onClick={handleAddManualProduct}
                  disabled={!manualProductName.trim() || manualProductQty <= 0 || manualProductPrice <= 0}
                  className="bg-amber-500 hover:bg-amber-600 text-white px-4 py-2 rounded text-sm font-medium disabled:opacity-50"
                >
                  Ajouter au Panier
                </button>
              </div>
            </div>
          </div>
        )}

        {/* PRODUCT BROWSER MODAL */}
        {isProductBrowserOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-0 md:p-4">
            <div className="w-full h-full md:h-auto md:max-w-4xl bg-white md:rounded-xl shadow-2xl md:max-h-[85vh] flex flex-col">
              <div className="p-4 border-b border-slate-200 flex justify-between items-center">
                <h2 className="text-lg font-bold text-slate-800">📋 Catalogue Produits</h2>
                <button onClick={() => { setIsProductBrowserOpen(false); setBrowserSearch(''); }} className="text-slate-400 hover:text-slate-600 text-2xl">&times;</button>
              </div>
              <div className="p-4 border-b border-slate-100">
                <input
                  type="text"
                  placeholder="🔍 Rechercher par nom, code..."
                  value={browserSearch}
                  onChange={e => setBrowserSearch(e.target.value)}
                  className="w-full p-2.5 border border-slate-300 rounded-lg text-sm"
                  autoFocus
                />
              </div>
              <div className="flex-1 overflow-auto p-2">
                <table className="w-full text-sm">
                  <thead className="bg-slate-100 text-slate-700 text-xs uppercase sticky top-0">
                    <tr>
                      <th className="p-2 text-left">Produit</th>
                      <th className="p-2 text-left">Famille</th>
                      {!isRetailMode && <th className="p-2 text-right">Prix Vente</th>}
                      <th className="p-2 text-right">Stock</th>
                      <th className="p-2 text-center">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {products
                      .filter(p =>
                        !browserSearch ||
                        p.productname.toLowerCase().includes(browserSearch.toLowerCase()) ||
                        p.productcode.toLowerCase().includes(browserSearch.toLowerCase()) ||
                        (p.famille && p.famille.toLowerCase().includes(browserSearch.toLowerCase()))
                      )
                      .slice(0, 200) // Limit for performance
                      .map(p => {
                        const inCart = cart.some(c => c.productId === p.productid);
                        // Use totalqty from product (aggregated in backend query)
                        const stock = p.totalqty || 0;
                        const price = Number(p.prixvente) || Number(p.baseprice) || 0;
                        return (
                          <tr key={p.productid} className={`hover:bg-blue-50 ${inCart ? 'bg-green-50' : ''}`}>
                            <td className="p-2">
                              <div className="font-medium text-slate-800">
                                {p.productname}
                                <span className="text-slate-500 text-xs ml-2 font-normal">
                                  ({p.famille || p.brandname || 'Sans marque'})
                                </span>
                              </div>
                              <div className="text-xs text-slate-400">
                                {p.productcode}
                              </div>
                            </td>
                            <td className="p-2 text-slate-600">{p.famille || p.brandname || '-'}</td>
                            {!isRetailMode && <td className="p-2 text-right font-medium text-green-600">{formatCurrency(price)}</td>}
                            <td className="p-2 text-right font-mono">{parseFloat(String(stock)).toLocaleString('fr-FR', { maximumFractionDigits: 2 })}</td>
                            <td className="p-2 text-center">
                              <button
                                onClick={() => { addToCart(p); }}
                                disabled={inCart}
                                className={`px-3 py-1.5 rounded text-xs font-medium ${inCart ? 'bg-gray-200 text-gray-500' : 'bg-blue-600 hover:bg-blue-700 text-white'}`}
                              >
                                {inCart ? '✓ Ajouté' : '+ Ajouter'}
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
                {products.length > 200 && (
                  <p className="text-center text-slate-400 text-xs py-2">Affichage limité à 200 produits. Utilisez la recherche pour affiner.</p>
                )}
              </div>
              <div className="p-3 bg-slate-50 border-t border-slate-100 text-right">
                <button
                  onClick={() => { setIsProductBrowserOpen(false); setBrowserSearch(''); }}
                  className="bg-slate-600 hover:bg-slate-700 text-white px-4 py-2 rounded-lg text-sm font-medium"
                >
                  Fermer
                </button>
              </div>
            </div>
          </div>
        )}

      </div>

      {/* Hidden Print Components for Desktop */}
      <div style={{ position: 'absolute', left: '-9999px', top: 0 }}>
        <StandardDocument ref={blRef} type="DELIVERY_NOTE" data={getPrintData()} />
        <StandardDocument ref={bcRef} type="LOADING_SLIP" data={getPrintData()} />
        <StandardDocument ref={bssRef} type="NO_BALANCE_SLIP" data={getPrintData()} />
        <StandardDocument ref={ticketRef} type="TICKET" data={getPrintData()} />
      </div>
    </div>
  );
}

export default function POSPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center bg-slate-50 text-slate-500">Chargement...</div>}>
      <POSContent />
    </Suspense>
  );
}