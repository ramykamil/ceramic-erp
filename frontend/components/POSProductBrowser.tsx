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

interface POSProductBrowserProps {
  isOpen: boolean;
  onClose: () => void;
  browserSearch: string;
  setBrowserSearch: (val: string) => void;
  filteredBrowserProducts: Product[];
  getRowProps: (idx: number) => any;
  getRowClass: (idx: number, baseClass: string) => string;
  setSelectedIndex: (idx: number) => void;
  addToCart: (product: Product) => void;
  formatCurrency: (amount: number) => string;
}

export function POSProductBrowser({
  isOpen,
  onClose,
  browserSearch,
  setBrowserSearch,
  filteredBrowserProducts,
  getRowProps,
  getRowClass,
  setSelectedIndex,
  addToCart,
  formatCurrency,
}: POSProductBrowserProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 backdrop-blur-md p-6">
      <div className="w-full max-w-5xl h-full max-h-[85vh] bg-white rounded-3xl shadow-2xl flex flex-col overflow-hidden">
        <div className="p-6 border-b flex justify-between items-center bg-slate-50">
          <h2 className="text-2xl font-black text-slate-800">Catalogue Produits</h2>
          <button onClick={onClose} className="text-3xl text-slate-400 hover:text-slate-600">
            &times;
          </button>
        </div>
        <div className="p-6 border-b">
          <input
            type="text"
            placeholder="🔍 Rechercher par nom, code, marque..."
            value={browserSearch}
            onChange={(e) => setBrowserSearch(e.target.value)}
            className="w-full p-5 bg-slate-50 border-2 border-slate-200 rounded-2xl text-lg font-bold"
            autoFocus
          />
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
                  className={getRowClass(idx, 'hover:bg-slate-50 transition-colors group cursor-pointer')}
                  onClick={() => setSelectedIndex(idx)}
                >
                  <td className="px-4 py-4">
                    <div className="font-bold text-slate-800">{p.productname}</div>
                    <div className="text-[10px] text-slate-500">{p.productcode}</div>
                  </td>
                  <td className="px-4 py-4 text-xs font-bold text-slate-400 uppercase">
                    {p.famille || p.brandname}
                  </td>
                  <td className="px-4 py-4 text-right font-black text-green-600">
                    {formatCurrency(p.prixvente || p.baseprice)}
                  </td>
                  <td className="px-4 py-4 text-right font-mono font-bold text-slate-500">
                    {p.totalqty}
                  </td>
                  <td className="px-4 py-4 text-center">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        addToCart(p);
                      }}
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
  );
}
