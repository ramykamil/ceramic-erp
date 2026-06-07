import { formatDate } from '@/lib/utils';

const formatMoney = (amount: number) =>
  new Intl.NumberFormat('fr-DZ', { style: 'currency', currency: 'DZD', minimumFractionDigits: 2 }).format(amount || 0);

const formatQty = (amount: number) =>
  new Intl.NumberFormat('fr-DZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Math.max(0, amount || 0));

interface ProductHistorySalesTabProps {
  isLoading: boolean;
  historyData: any;
  sortedVentes: any[];
  handleSortVentes: (key: any) => void;
  sortVentes: any;
  getModalSortIcon: (config: any, key: string) => React.ReactNode;
}

export function ProductHistorySalesTab({
  isLoading,
  historyData,
  sortedVentes,
  handleSortVentes,
  sortVentes,
  getModalSortIcon,
}: ProductHistorySalesTabProps) {
  if (isLoading) {
    return (
      <div className="text-center py-12">
        <div className="inline-block w-8 h-8 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin mb-4"></div>
        <p className="text-slate-500">Chargement...</p>
      </div>
    );
  }

  if (!historyData) return null;

  return (
    <>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-6">
        <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
          <p className="text-xs text-blue-600 font-medium uppercase">Clients</p>
          <p className="text-2xl font-bold text-blue-700">{historyData.totals.customerCount}</p>
        </div>
        <div className="bg-purple-50 p-4 rounded-lg border border-purple-200">
          <p className="text-xs text-purple-600 font-medium uppercase">Commandes</p>
          <p className="text-2xl font-bold text-purple-700">{historyData.totals.totalOrders}</p>
        </div>
        <div className="bg-indigo-50 p-4 rounded-lg border border-indigo-200">
          <p className="text-xs text-indigo-600 font-medium uppercase">Palettes</p>
          <p className="text-2xl font-bold text-indigo-700">{formatQty(historyData.totals.totalPallets || 0)}</p>
        </div>
        <div className="bg-cyan-50 p-4 rounded-lg border border-cyan-200">
          <p className="text-xs text-cyan-600 font-medium uppercase">Cartons</p>
          <p className="text-2xl font-bold text-cyan-700">{formatQty(historyData.totals.totalCartons || 0)}</p>
        </div>
        <div className="bg-emerald-50 p-4 rounded-lg border border-emerald-200">
          <p className="text-xs text-emerald-600 font-medium uppercase">Qté (m²/pcs)</p>
          <p className="text-2xl font-bold text-emerald-700">{formatQty(historyData.totals.totalQty)}</p>
        </div>
        <div className="bg-amber-50 p-4 rounded-lg border border-amber-200">
          <p className="text-xs text-amber-600 font-medium uppercase">Chiffre d&apos;Affaires</p>
          <p className="text-2xl font-bold text-amber-700">{formatMoney(historyData.totals.totalAmount)}</p>
        </div>
      </div>
      {historyData.orders.length === 0 ? (
        <div className="text-center py-12 text-slate-400">
          <p className="text-lg">Aucune vente enregistrée pour ce produit</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-100 text-[10px] text-slate-500 uppercase sticky top-0 font-bold">
              <tr>
                <th
                  className="p-3 text-center cursor-pointer hover:bg-slate-200"
                  onClick={() => handleSortVentes('ordernumber')}
                >
                  N° Bon {getModalSortIcon(sortVentes, 'ordernumber')}
                </th>
                <th
                  className="p-3 text-center cursor-pointer hover:bg-slate-200"
                  onClick={() => handleSortVentes('orderdate')}
                >
                  Date {getModalSortIcon(sortVentes, 'orderdate')}
                </th>
                <th
                  className="p-3 text-left cursor-pointer hover:bg-slate-200"
                  onClick={() => handleSortVentes('customername')}
                >
                  Client {getModalSortIcon(sortVentes, 'customername')}
                </th>
                <th
                  className="p-3 text-center cursor-pointer hover:bg-slate-200"
                  onClick={() => handleSortVentes('createdby')}
                >
                  Utilisateur {getModalSortIcon(sortVentes, 'createdby')}
                </th>
                <th
                  className="p-3 text-right bg-indigo-100/80 cursor-pointer hover:bg-indigo-200"
                  onClick={() => handleSortVentes('pallets')}
                >
                  Palettes {getModalSortIcon(sortVentes, 'pallets')}
                </th>
                <th
                  className="p-3 text-right bg-cyan-100/80 cursor-pointer hover:bg-cyan-200"
                  onClick={() => handleSortVentes('cartons')}
                >
                  Cartons {getModalSortIcon(sortVentes, 'cartons')}
                </th>
                <th
                  className="p-3 text-right bg-emerald-100/80 cursor-pointer hover:bg-emerald-200"
                  onClick={() => handleSortVentes('qty')}
                >
                  Qté {getModalSortIcon(sortVentes, 'qty')}
                </th>
                <th
                  className="p-3 text-right cursor-pointer hover:bg-slate-200"
                  onClick={() => handleSortVentes('unitprice')}
                >
                  Prix Unit. {getModalSortIcon(sortVentes, 'unitprice')}
                </th>
                <th
                  className="p-3 text-right cursor-pointer hover:bg-slate-200"
                  onClick={() => handleSortVentes('linetotal')}
                >
                  Montant {getModalSortIcon(sortVentes, 'linetotal')}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {sortedVentes.map((o: any, idx: number) => (
                <tr key={`${o.orderid}-${idx}`} className="hover:bg-slate-50">
                  <td className="p-3 text-center text-blue-600 text-xs font-mono font-semibold">{o.ordernumber || '-'}</td>
                  <td className="p-3 text-center text-slate-600 text-xs font-mono">{formatDate(o.orderdate)}</td>
                  <td className="p-3 font-medium text-slate-800">
                    {o.customername} <span className="text-xs text-slate-400 ml-1">{o.customercode}</span>
                  </td>
                  <td className="p-3 text-center">
                    <span className="px-2 py-1 rounded-full text-xs font-medium bg-slate-100 text-slate-700">
                      {o.createdby}
                    </span>
                  </td>
                  <td className="p-3 text-right font-bold text-indigo-600 font-mono bg-indigo-50/50">{formatQty(o.pallets)}</td>
                  <td className="p-3 text-right font-bold text-cyan-600 font-mono bg-cyan-50/50">{formatQty(o.cartons)}</td>
                  <td className="p-3 text-right font-bold text-emerald-600 font-mono bg-emerald-50/50">{formatQty(o.qty)}</td>
                  <td className="p-3 text-right text-slate-600 font-mono">{formatMoney(o.unitprice)}</td>
                  <td className="p-3 text-right font-bold text-slate-800 font-mono">{formatMoney(o.linetotal)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
