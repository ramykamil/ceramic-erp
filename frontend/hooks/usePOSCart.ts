import { useState, useMemo, useCallback } from 'react';
import api from '@/lib/api';

export interface Product {
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

export interface OrderItem {
  rowId: string;
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

// --- Tile Dimension Parser ---
export const parseSqmPerPiece = (productName: string): number => {
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

export const normalizePackaging = (productName: string, rawPiecesPerCarton: number, initialSqmPerPiece: number) => {
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

export const convertQuantity = (
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

interface UsePOSCartProps {
  selectedCustomerId: number | '';
  isRetailMode: boolean;
  appSettings: {
    retailmargin?: number;
    wholesalemargin?: number;
    retailmargintype?: 'PERCENT' | 'AMOUNT';
    wholesalemargintype?: 'PERCENT' | 'AMOUNT';
  };
  units: any[];
  deliveryCost: number;
  discount: number;
  timber: number;
  payment: number;
}

export function usePOSCart({
  selectedCustomerId,
  isRetailMode,
  appSettings,
  units,
  deliveryCost,
  discount,
  timber,
  payment,
}: UsePOSCartProps) {
  const [cart, setCart] = useState<OrderItem[]>([]);

  const addToCart = async (product: Product) => {
    let defaultUnit = units.find(u => u.unitcode === 'PCS')?.unitid || units[0]?.unitid;
    const isInteger = Math.abs(product.derivedpiecespercolis - Math.round(product.derivedpiecespercolis)) < 0.01;
    if (product.derivedpiecespercolis > 0) {
      defaultUnit = isInteger ? units.find(u => u.unitcode === 'PCS')?.unitid || defaultUnit : units.find(u => u.unitid === 1 || u.unitcode === 'SQM')?.unitid || defaultUnit;
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

    setCart(prevCart => [...prevCart, {
      rowId: crypto.randomUUID(), productId: product.productid, productCode: product.productcode, productName: product.productname,
      brandName: product.famille || product.brandname || '', stockQty: product.totalqty || 0, stockPalettes: product.nbpalette || 0, stockCartons: product.nbcolis || 0,
      piecesPerCarton, cartonsPerPalette: product.derivedcolisperpalette || 0, sqmPerPiece,
      palettes: 0, cartons: 0, quantity: 1, unitId: defaultUnit, unitPrice, priceSource, lineTotal: unitPrice,
      purchasePrice: Number(product.prixachat) || 0
    }]);
  };

  const updateItem = (rowId: string, field: keyof OrderItem, value: any) => {
    setCart(prevCart => {
      const newCart = [...prevCart];
      const idx = newCart.findIndex(i => i.rowId === rowId);
      if (idx === -1) return prevCart;
      const item = { ...newCart[idx] };

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
      newCart[idx] = item;
      return newCart;
    });
  };

  const removeItem = (rowId: string) => {
    setCart(prevCart => prevCart.filter(i => i.rowId !== rowId));
  };

  const loadOrder = useCallback((orderItems: any[], allProducts: Product[]) => {
    const items = orderItems.map((item: any) => {
      const p = allProducts.find(x => Number(x.productid) === Number(item.productid));
      const rawPiecesPerColis = parseFloat(item.qteparcolis) || p?.derivedpiecespercolis || 0;
      const rawColisPerPalette = parseFloat(item.qtecolisparpalette) || p?.derivedcolisperpalette || 0;
      const { piecesPerCarton, sqmPerPiece } = normalizePackaging(item.productname, rawPiecesPerColis, parseSqmPerPiece(item.productname));
      const currentUnit = units.find(u => u.unitid === item.unitid)?.unitcode || 'PCS';

      let palettes = Number(item.palletcount) || 0;
      let cartons = Number(item.coliscount) || 0;

      if (palettes === 0 && cartons === 0 && (piecesPerCarton > 0 || rawColisPerPalette > 0)) {
        let pieces = Number(item.quantity);
        if (currentUnit === 'SQM' && sqmPerPiece > 0) pieces = Number(item.quantity) / sqmPerPiece;
        else if ((currentUnit === 'CARTON' || currentUnit === 'CRT') && piecesPerCarton > 0) pieces = Number(item.quantity) * piecesPerCarton;
        cartons = Number((piecesPerCarton > 0 ? pieces / piecesPerCarton : pieces).toFixed(2));
        palettes = Number((rawColisPerPalette > 0 ? cartons / rawColisPerPalette : 0).toFixed(2));
      }

      return {
        rowId: crypto.randomUUID(), productId: Number(item.productid), productCode: item.productcode, productName: item.productname,
        brandName: item.brandname || p?.famille || p?.brandname || '', 
        stockQty: p?.totalqty || 0, stockPalettes: p?.nbpalette || 0, stockCartons: p?.nbcolis || 0,
        piecesPerCarton, cartonsPerPalette: rawColisPerPalette, sqmPerPiece,
        palettes, cartons, quantity: Number(item.quantity),
        unitId: item.unitid, unitPrice: Number(item.unitprice), lineTotal: Number(item.linetotal),
        priceSource: item.pricesource || 'HISTORY',
        purchasePrice: Number(item.costprice) || Number(p?.prixachat) || 0
      };
    });
    setCart(items);
  }, [units]);

  const totalHT = useMemo(() => cart.reduce((sum, i) => sum + Number(i.lineTotal), 0), [cart]);
  const totalNet = useMemo(() => totalHT + Number(deliveryCost) - Number(discount) + Number(timber), [totalHT, deliveryCost, discount, timber]);
  const reste = useMemo(() => totalNet - payment, [totalNet, payment]);

  return {
    cart,
    setCart,
    addToCart,
    updateItem,
    removeItem,
    loadOrder,
    totalHT,
    totalNet,
    reste,
  };
}
