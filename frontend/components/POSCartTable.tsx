import { useState, useEffect } from 'react';
import { ResizableHeader } from './ResizableSortableHeader';

interface OrderItem {
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

interface SmartInputProps {
  value: number;
  onChange: (val: number) => void;
  min?: number;
  step?: string | number;
  className?: string;
  placeholder?: string;
}

const SmartNumberInput = ({ value, onChange, min = 0, step = 'any', className, placeholder }: SmartInputProps) => {
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

interface POSCartTableProps {
  cart: OrderItem[];
  sortedCart: OrderItem[];
  cartWidths: any;
  handleCartResize: (key: any, width: number) => void;
  handleCartSort: (key: keyof OrderItem) => void;
  cartSortConfig: any;
  getCartRowProps: (idx: number) => any;
  getCartRowClass: (idx: number, baseClass: string) => string;
  setCartSelectedIndex: (idx: number) => void;
  units: any[];
  updateItem: (rowId: string, field: keyof OrderItem, value: any) => void;
  removeItem: (rowId: string) => void;
  activeMobileTab: string;
  setActiveMobileTab: (tab: 'CLIENT' | 'CART' | 'PAYMENT') => void;
  totalHT: number;
  totalNet: number;
  formatCurrency: (amount: number) => string;
  getPriceSourceBadge: (source: string) => string;
  getSortIcon: (config: any, key: string) => React.ReactNode;
}

export function POSCartTable({
  cart,
  sortedCart,
  cartWidths,
  handleCartResize,
  handleCartSort,
  cartSortConfig,
  getCartRowProps,
  getCartRowClass,
  setCartSelectedIndex,
  units,
  updateItem,
  removeItem,
  activeMobileTab,
  setActiveMobileTab,
  totalHT,
  totalNet,
  formatCurrency,
  getPriceSourceBadge,
  getSortIcon,
}: POSCartTableProps) {
  return (
    <div className="flex-1 p-1 overflow-hidden flex flex-col">
      <div className="flex-1 bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
        <div className="flex-1 flex flex-col min-h-0" style={{ scrollbarGutter: 'stable' }}>
          {/* Desktop Table View */}
          <div className="hidden lg:block overflow-auto flex-1 custom-scrollbar">
            <table className="border-separate border-spacing-0" style={{ minWidth: '680px', width: '100%' }}>
              <thead className="sticky top-0 bg-slate-800 text-white z-20">
                <tr className="text-[9px] font-black uppercase tracking-wider">
                  <ResizableHeader
                    columnKey="designation"
                    width={cartWidths.designation}
                    onResize={handleCartResize}
                    onClick={() => handleCartSort('productName')}
                    className="px-2 py-0.5 text-left cursor-pointer hover:bg-slate-700"
                  >
                    Désignation {getSortIcon(cartSortConfig, 'productName')}
                  </ResizableHeader>
                  <ResizableHeader
                    columnKey="marque"
                    width={cartWidths.marque}
                    onResize={handleCartResize}
                    onClick={() => handleCartSort('brandName')}
                    className="px-1.5 py-0.5 text-left cursor-pointer hover:bg-slate-700"
                  >
                    Marque {getSortIcon(cartSortConfig, 'brandName')}
                  </ResizableHeader>
                  <ResizableHeader
                    columnKey="stock"
                    width={cartWidths.stock}
                    onResize={handleCartResize}
                    onClick={() => handleCartSort('stockQty')}
                    className="px-1.5 py-0.5 text-right cursor-pointer hover:bg-slate-700"
                  >
                    Stock {getSortIcon(cartSortConfig, 'stockQty')}
                  </ResizableHeader>
                  <ResizableHeader
                    columnKey="palettes"
                    width={cartWidths.palettes}
                    onResize={handleCartResize}
                    onClick={() => handleCartSort('palettes')}
                    className="px-1.5 py-0.5 text-center bg-indigo-900/30 cursor-pointer hover:bg-indigo-900/50"
                  >
                    Pals {getSortIcon(cartSortConfig, 'palettes')}
                  </ResizableHeader>
                  <ResizableHeader
                    columnKey="cartons"
                    width={cartWidths.cartons}
                    onResize={handleCartResize}
                    onClick={() => handleCartSort('cartons')}
                    className="px-1.5 py-0.5 text-center bg-indigo-900/30 cursor-pointer hover:bg-indigo-900/50"
                  >
                    Ctns {getSortIcon(cartSortConfig, 'cartons')}
                  </ResizableHeader>
                  <ResizableHeader
                    columnKey="quantity"
                    width={cartWidths.quantity}
                    onResize={handleCartResize}
                    onClick={() => handleCartSort('quantity')}
                    className="px-2 py-0.5 text-center bg-red-900/30 cursor-pointer hover:bg-red-900/50"
                  >
                    Quantité {getSortIcon(cartSortConfig, 'quantity')}
                  </ResizableHeader>
                  <ResizableHeader columnKey="unite" width={cartWidths.unite} onResize={handleCartResize} className="px-1.5 py-0.5 text-center">
                    Unité
                  </ResizableHeader>
                  <ResizableHeader
                    columnKey="prixunit"
                    width={cartWidths.prixunit}
                    onResize={handleCartResize}
                    onClick={() => handleCartSort('unitPrice')}
                    className="px-1.5 py-0.5 text-right cursor-pointer hover:bg-slate-700"
                  >
                    Prix Unit {getSortIcon(cartSortConfig, 'unitPrice')}
                  </ResizableHeader>
                  <ResizableHeader columnKey="src" width={cartWidths.src} onResize={handleCartResize} className="px-1.5 py-0.5 text-center">
                    Src
                  </ResizableHeader>
                  <ResizableHeader
                    columnKey="totalligne"
                    width={cartWidths.totalligne}
                    onResize={handleCartResize}
                    onClick={() => handleCartSort('lineTotal')}
                    className="px-2 py-0.5 text-right cursor-pointer hover:bg-slate-700"
                  >
                    Total {getSortIcon(cartSortConfig, 'lineTotal')}
                  </ResizableHeader>
                  <th className="w-10 px-1 py-0.5"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {sortedCart.map((item, idx) => {
                  const isTransport = item.productName.toUpperCase().includes('TRANSPORT');
                  return (
                    <tr
                      key={item.rowId}
                      {...getCartRowProps(idx)}
                      className={getCartRowClass(
                        idx,
                        `group transition-all duration-200 pos-row-compact cursor-pointer ${
                          isTransport
                            ? 'bg-amber-100/80 hover:bg-amber-200/90 border-b-2 border-amber-300 text-amber-900 shadow-[inset_0_1px_2px_rgba(0,0,0,0.05)]'
                            : 'hover:bg-slate-50 border-b border-slate-100'
                        }`
                      )}
                      onClick={() => setCartSelectedIndex(idx)}
                    >
                      <td className="px-2 py-0.5 text-slate-700 min-w-0 flex-none overflow-hidden" style={{ width: cartWidths.designation }}>
                        <div className="font-bold text-[11px] truncate w-full leading-tight" title={item.productName}>
                          {item.productName}
                        </div>
                        {(item.piecesPerCarton > 0 || item.cartonsPerPalette > 0) && (
                          <div className="text-[8px] text-slate-400 font-medium tracking-tight truncate w-full leading-none">
                            {Number(item.piecesPerCarton) > 0 && `${Number(item.piecesPerCarton).toFixed(2)} / Colis`}
                            {Number(item.cartonsPerPalette) > 0 && ` • ${Number(item.cartonsPerPalette).toFixed(0)} Colis / Pal`}
                          </div>
                        )}
                      </td>
                      <td className="px-1.5 py-0.5 text-slate-500 text-[9px] uppercase flex-none overflow-hidden" style={{ width: cartWidths.marque }}>
                        <div className="truncate w-full">{item.brandName}</div>
                      </td>
                      <td className="px-1.5 py-0.5 text-right font-mono text-[9px] text-slate-400 flex-none overflow-hidden" style={{ width: cartWidths.stock }}>
                        {parseFloat(item.stockQty.toString()).toLocaleString()}
                      </td>
                      <td className="px-1.5 py-0.5 text-center flex-none overflow-hidden" style={{ width: cartWidths.palettes }}>
                        <SmartNumberInput
                          value={item.palettes}
                          onChange={(val) => updateItem(item.rowId, 'palettes', val)}
                          className="w-full text-center p-0.5 border border-slate-200 rounded font-bold text-indigo-700 bg-indigo-50/30 text-xs shadow-inner"
                        />
                      </td>
                      <td className="px-1.5 py-0.5 text-center flex-none overflow-hidden" style={{ width: cartWidths.cartons }}>
                        <SmartNumberInput
                          value={item.cartons}
                          onChange={(val) => updateItem(item.rowId, 'cartons', val)}
                          className="w-full text-center p-0.5 border border-slate-200 rounded font-bold text-indigo-700 bg-indigo-50/30 text-xs shadow-inner"
                        />
                      </td>
                      <td className="px-2 py-0.5 text-center flex-none overflow-hidden" style={{ width: cartWidths.quantity }}>
                        <SmartNumberInput
                          value={item.quantity}
                          onChange={(val) => updateItem(item.rowId, 'quantity', val)}
                          className="w-full text-center p-0.5 border-2 border-red-200 rounded font-bold text-red-700 bg-red-50 text-xs shadow-sm"
                        />
                      </td>
                      <td className="px-1.5 py-0.5 text-center flex-none overflow-hidden" style={{ width: cartWidths.unite }}>
                        <select
                          value={item.unitId}
                          onChange={(e) => updateItem(item.rowId, 'unitId', Number(e.target.value))}
                          className="w-full p-0.5 border border-slate-200 rounded text-[10px] bg-white hover:border-slate-400 transition-colors"
                        >
                          {units
                            .filter((u) => u.unitcode !== 'BOX')
                            .map((u) => (
                              <option key={u.unitid} value={u.unitid}>
                                {u.unitcode}
                              </option>
                            ))}
                        </select>
                      </td>
                      <td className="px-1.5 py-0.5 text-right flex-none overflow-hidden" style={{ width: cartWidths.prixunit }}>
                        <SmartNumberInput
                          value={item.unitPrice}
                          onChange={(val) => updateItem(item.rowId, 'unitPrice', val)}
                          className={`w-full text-right p-0.5 border rounded font-mono text-xs shadow-inner ${
                            item.purchasePrice && item.unitPrice < item.purchasePrice ? 'border-red-500 text-red-600 bg-red-50' : 'border-slate-200'
                          }`}
                        />
                      </td>
                      <td className="px-1.5 py-0.5 text-center flex-none overflow-hidden" style={{ width: cartWidths.src }}>
                        <span className={`text-[8px] px-1 py-0.5 rounded-full font-bold ${getPriceSourceBadge(item.priceSource)}`}>
                          {item.priceSource}
                        </span>
                      </td>
                      <td className="px-2 py-0.5 text-right font-bold text-slate-800 text-[11px] flex-none overflow-hidden" style={{ width: cartWidths.totalligne }}>
                        {formatCurrency(item.lineTotal)}
                      </td>
                      <td className="px-1 py-0.5 text-center w-10 flex-none overflow-hidden">
                        <button onClick={() => removeItem(item.rowId)} className="opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-700 transition-all text-xl">
                          &times;
                        </button>
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
          <div className="lg:hidden flex-1 overflow-auto p-2 pb-44 space-y-3 custom-scrollbar bg-slate-50">
            {cart.map((item) => {
              const isTransport = item.productName.toUpperCase().includes('TRANSPORT');
              return (
                <div key={item.rowId} className={`rounded-2xl border p-4 space-y-4 ${isTransport ? 'bg-amber-50 border-2 border-amber-300 shadow-lg shadow-amber-900/5' : 'bg-white border-slate-200 shadow-sm'}`}>
                  <div className="flex justify-between items-start">
                    <div className="flex-1 min-w-0">
                      <h4 className="font-black text-slate-800 leading-tight truncate">{item.productName}</h4>
                      <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">{item.brandName || 'SANS MARQUE'}</p>
                    </div>
                    <button onClick={() => removeItem(item.rowId)} className="p-2 text-red-400 hover:bg-red-50 rounded-full transition-colors">
                      &times;
                    </button>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Quantité</label>
                      <div className="flex items-center gap-2">
                        <SmartNumberInput
                          value={item.quantity}
                          onChange={(val) => updateItem(item.rowId, 'quantity', val)}
                          className="w-full text-center p-3 border-2 border-red-200 rounded-xl font-black text-red-700 bg-red-50 text-xl"
                        />
                        <select
                          value={item.unitId}
                          onChange={(e) => updateItem(item.rowId, 'unitId', Number(e.target.value))}
                          className="p-3 border border-slate-200 rounded-xl text-xs bg-slate-50 font-bold"
                        >
                          {units
                            .filter((u) => u.unitcode !== 'BOX')
                            .map((u) => (
                              <option key={u.unitid} value={u.unitid}>
                                {u.unitcode}
                              </option>
                            ))}
                        </select>
                      </div>
                    </div>
                    <div className="space-y-1">
                      <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Prix Unitaire</label>
                      <SmartNumberInput
                        value={item.unitPrice}
                        onChange={(val) => updateItem(item.rowId, 'unitPrice', val)}
                        className="w-full text-right p-3 border border-slate-200 rounded-xl font-bold bg-slate-50 text-lg"
                      />
                    </div>
                  </div>

                  {(item.piecesPerCarton > 0 || item.cartonsPerPalette > 0) && (
                    <div className="bg-indigo-50/50 rounded-xl p-3 grid grid-cols-2 gap-4">
                      <div className="space-y-1">
                        <label className="text-[9px] font-bold text-indigo-400 uppercase tracking-wider">Cartons (Ctns)</label>
                        <SmartNumberInput
                          value={item.cartons}
                          onChange={(val) => updateItem(item.rowId, 'cartons', val)}
                          className="w-full text-center p-2 border border-indigo-100 rounded-lg font-bold text-indigo-700 bg-white"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[9px] font-bold text-indigo-400 uppercase tracking-wider">Palettes (Pals)</label>
                        <SmartNumberInput
                          value={item.palettes}
                          onChange={(val) => updateItem(item.rowId, 'palettes', val)}
                          className="w-full text-center p-2 border border-indigo-100 rounded-lg font-bold text-indigo-700 bg-white"
                        />
                      </div>
                    </div>
                  )}

                  <div className="pt-3 border-t border-slate-100 flex justify-between items-center">
                    <span className={`text-[10px] px-2 py-1 rounded-full font-bold ${getPriceSourceBadge(item.priceSource)}`}>
                      {item.priceSource}
                    </span>
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
                <p className="font-bold uppercase tracking-widest leading-normal">Le panier est vide</p>
              </div>
            )}

            {/* Mobile Quick Summary Bar (Sticky above Nav) */}
            {cart.length > 0 && activeMobileTab !== 'PAYMENT' && (
              <div className="lg:hidden fixed bottom-20 left-0 right-0 bg-slate-800 text-white p-3 flex justify-between items-center z-45 animate-in slide-in-from-bottom duration-300">
                <div className="flex gap-4 items-center">
                  <div className="flex flex-col">
                    <span className="text-[10px] text-slate-400 font-black uppercase">Total</span>
                    <span className="text-lg font-black font-mono">{formatCurrency(totalNet)}</span>
                  </div>
                  <div className="h-6 w-px bg-slate-700"></div>
                  <div className="flex flex-col">
                    <span className="text-[10px] text-slate-400 font-black uppercase">Items</span>
                    <span className="text-lg font-black font-mono">{cart.length}</span>
                  </div>
                </div>
                <button
                  onClick={() => setActiveMobileTab('PAYMENT')}
                  className="btn-glassy px-6 py-2 rounded-xl font-black text-xs uppercase tracking-wider active:scale-95 transition-transform"
                >
                  Paiement →
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
