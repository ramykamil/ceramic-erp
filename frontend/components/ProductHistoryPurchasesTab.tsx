import { formatDate } from '@/lib/utils';

const formatMoney = (amount: number) =>
  new Intl.NumberFormat('fr-DZ', { style: 'currency', currency: 'DZD', minimumFractionDigits: 2 }).format(amount || 0);

const formatQty = (amount: number) =>
  new Intl.NumberFormat('fr-DZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Math.max(0, amount || 0));

interface ProductHistoryPurchasesTabProps {
  isLoading: boolean;
  purchaseHistoryData: any;
  sortedAchats: any[];
  handleSortAchats: (key: any) => void;
  sortAchats: any;
  getModalSortIcon: (config: any, key: string) => React.ReactNode;
}

export function ProductHistoryPurchasesTab({
  isLoading,
  purchaseHistoryData,
  sortedAchats,
  handleSortAchats,
  sortAchats,
  getModalSortIcon,
}: ProductHistoryPurchasesTabProps) {
  if (isLoading) {
    return (
      <div className="text-center py-12">
        <div className="inline-block w-8 h-8 border-4 border-orange-500/20 border-t-orange-600 rounded-full animate-spin mb-4"></div>
        <p className="text-slate-500">Chargement...</p>
      </div>
    );
  }

  if (!purchaseHistoryData) return null;

  return (
    <>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-6">
        <div className="bg-orange-50 p-4 rounded-lg border border-orange-500/20">
          <p className="text-xs text-orange-400 font-medium uppercase">Fournisseurs</p>
          <p className="text-2xl font-bold text-orange-400">{purchaseHistoryData.totals.supplierCount}</p>
        </div>
        <div className="bg-violet-500/10 p-4 rounded-lg border border-violet-500/20">
          <p className="text-xs text-violet-400 font-medium uppercase">Commandes</p>
          <p className="text-2xl font-bold text-violet-400">{purchaseHistoryData.totals.totalOrders}</p>
        </div>
        <div className="bg-indigo-500/100/10 p-4 rounded-lg border border-indigo-200">
          <p className="text-xs text-indigo-400 font-medium uppercase">Palettes</p>
          <p className="text-2xl font-bold text-indigo-400">{formatQty(purchaseHistoryData.totals.totalPallets || 0)}</p>
        </div>
        <div className="bg-cyan-50 p-4 rounded-lg border border-cyan-200">
          <p className="text-xs text-cyan-600 font-medium uppercase">Cartons</p>
          <p className="text-2xl font-bold text-cyan-700">{formatQty(purchaseHistoryData.totals.totalCartons || 0)}</p>
        </div>
        <div className="bg-emerald-50 p-4 rounded-lg border border-emerald-200">
          <p className="text-xs text-emerald-600 font-medium uppercase">Qté Totale</p>
          <p className="text-2xl font-bold text-emerald-700">{formatQty(purchaseHistoryData.totals.totalQty)}</p>
        </div>
        <div className="bg-sky-500/10 p-4 rounded-lg border border-sky-500/20">
          <p className="text-xs text-sky-400 font-medium uppercase">Montant Total</p>
          <p className="text-2xl font-bold text-sky-300">{formatMoney(purchaseHistoryData.totals.totalAmount)}</p>
        </div>
      </div>
      {purchaseHistoryData.orders.length === 0 ? (
        <div className="text-center py-12 text-slate-400">
          <p className="text-lg">Aucun achat enregistré pour ce produit</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-orange-500/10 text-[10px] text-orange-400 uppercase sticky top-0 font-bold">
              <tr>
                <th
                  className="p-3 text-center cursor-pointer hover:bg-orange-200"
                  onClick={() => handleSortAchats('ponumber')}
                >
                  N° Bon {getModalSortIcon(sortAchats, 'ponumber')}
                </th>
                <th
                  className="p-3 text-center cursor-pointer hover:bg-orange-200"
                  onClick={() => handleSortAchats('orderdate')}
                >
                  Date {getModalSortIcon(sortAchats, 'orderdate')}
                </th>
                <th
                  className="p-3 text-left cursor-pointer hover:bg-orange-200"
                  onClick={() => handleSortAchats('suppliername')}
                >
                  Fournisseur {getModalSortIcon(sortAchats, 'suppliername')}
                </th>
                <th
                  className="p-3 text-center cursor-pointer hover:bg-orange-200"
                  onClick={() => handleSortAchats('createdby')}
                >
                  Utilisateur {getModalSortIcon(sortAchats, 'createdby')}
                </th>
                <th
                  className="p-3 text-right bg-indigo-500/100/100/10/80 cursor-pointer hover:bg-indigo-200"
                  onClick={() => handleSortAchats('pallets')}
                >
                  Palettes {getModalSortIcon(sortAchats, 'pallets')}
                </th>
                <th
                  className="p-3 text-right bg-cyan-100/80 cursor-pointer hover:bg-cyan-200"
                  onClick={() => handleSortAchats('cartons')}
                >
                  Cartons {getModalSortIcon(sortAchats, 'cartons')}
                </th>
                <th
                  className="p-3 text-right bg-emerald-100/80 cursor-pointer hover:bg-emerald-200"
                  onClick={() => handleSortAchats('qty')}
                >
                  Qté {getModalSortIcon(sortAchats, 'qty')}
                </th>
                <th
                  className="p-3 text-right cursor-pointer hover:bg-orange-200"
                  onClick={() => handleSortAchats('unitprice')}
                >
                  Prix Unit. {getModalSortIcon(sortAchats, 'unitprice')}
                </th>
                <th
                  className="p-3 text-right cursor-pointer hover:bg-orange-200"
                  onClick={() => handleSortAchats('linetotal')}
                >
                  Montant {getModalSortIcon(sortAchats, 'linetotal')}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {sortedAchats.map((o: any, idx: number) => (
                <tr key={`${o.orderid}-${idx}`} className="hover:bg-orange-50/30">
                  <td className="p-3 text-center text-orange-400 text-xs font-mono font-semibold">{o.ponumber || '-'}</td>
                  <td className="p-3 text-center text-slate-400 text-xs font-mono">{formatDate(o.orderdate)}</td>
                  <td className="p-3 font-medium text-slate-100">
                    {o.suppliername}
                    {o.suppliercode && <span className="text-xs text-slate-400 ml-1">{o.suppliercode}</span>}
                  </td>
                  <td className="p-3 text-center">
                    <span className="px-2 py-1 rounded-full text-xs font-medium bg-slate-800/50 text-slate-200">
                      {o.createdby}
                    </span>
                  </td>
                  <td className="p-3 text-right font-bold text-indigo-400 font-mono bg-indigo-500/100/10/50">{formatQty(o.pallets || 0)}</td>
                  <td className="p-3 text-right font-bold text-cyan-600 font-mono bg-cyan-50/50">{formatQty(o.cartons || 0)}</td>
                  <td className="p-3 text-right font-bold text-emerald-600 font-mono bg-emerald-50/50">{formatQty(o.qty)}</td>
                  <td className="p-3 text-right text-slate-400 font-mono">{formatMoney(o.unitprice)}</td>
                  <td className="p-3 text-right font-bold text-slate-100 font-mono">{formatMoney(o.linetotal)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
