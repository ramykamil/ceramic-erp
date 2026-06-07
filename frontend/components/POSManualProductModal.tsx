import { useState } from 'react';

interface POSManualProductModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAdd: (data: {
    name: string;
    qty: number;
    price: number;
    colis: number;
    palettes: number;
  }) => void;
}

export function POSManualProductModal({
  isOpen,
  onClose,
  onAdd,
}: POSManualProductModalProps) {
  const [manualProductName, setManualProductName] = useState('');
  const [manualProductQty, setManualProductQty] = useState(1);
  const [manualProductPrice, setManualProductPrice] = useState(0);
  const [manualProductColis, setManualProductColis] = useState(0);
  const [manualProductPalettes, setManualProductPalettes] = useState(0);

  const handleAdd = () => {
    onAdd({
      name: manualProductName,
      qty: manualProductQty,
      price: manualProductPrice,
      colis: manualProductColis,
      palettes: manualProductPalettes,
    });
    // Reset inputs
    setManualProductName('');
    setManualProductQty(1);
    setManualProductPrice(0);
    setManualProductColis(0);
    setManualProductPalettes(0);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm">
      <div className="w-full max-w-md bg-slate-900/60 rounded-2xl shadow-2xl overflow-hidden p-6">
        <h2 className="text-xl font-bold mb-6 text-orange-400 border-b pb-4">Produit Manuel</h2>
        <div className="space-y-4">
          <input
            type="text"
            placeholder="Désignation..."
            value={manualProductName}
            onChange={(e) => setManualProductName(e.target.value)}
            className="w-full p-4 bg-slate-900/40 border border-slate-600/40 rounded-xl"
          />
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-slate-400 uppercase ml-1">Qté</label>
              <input
                type="number"
                placeholder="Qté"
                value={manualProductQty}
                onChange={(e) => setManualProductQty(Number(e.target.value))}
                className="w-full p-4 bg-slate-900/40 border border-slate-600/40 rounded-xl"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-slate-400 uppercase ml-1">Prix</label>
              <input
                type="number"
                placeholder="Prix"
                value={manualProductPrice}
                onChange={(e) => setManualProductPrice(Number(e.target.value))}
                className="w-full p-4 bg-slate-900/40 border border-slate-600/40 rounded-xl"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-slate-400 uppercase ml-1">Colis</label>
              <input
                type="number"
                placeholder="Colis"
                value={manualProductColis}
                onChange={(e) => setManualProductColis(Number(e.target.value))}
                className="w-full p-4 bg-slate-900/40 border border-slate-600/40 rounded-xl"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-slate-400 uppercase ml-1">Palettes</label>
              <input
                type="number"
                placeholder="Palettes"
                value={manualProductPalettes}
                onChange={(e) => setManualProductPalettes(Number(e.target.value))}
                className="w-full p-4 bg-slate-900/40 border border-slate-600/40 rounded-xl"
              />
            </div>
          </div>
          <div className="flex gap-3 pt-4">
            <button
              onClick={onClose}
              className="flex-1 py-4 text-slate-500 font-bold"
            >
              Annuler
            </button>
            <button
              onClick={handleAdd}
              className="flex-1 py-4 bg-amber-500 text-white rounded-xl font-bold uppercase tracking-wider"
            >
              Ajouter
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
