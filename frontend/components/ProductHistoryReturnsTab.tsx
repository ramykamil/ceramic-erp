import { formatDate } from '@/lib/utils';

const formatMoney = (amount: number) =>
  new Intl.NumberFormat('fr-DZ', { style: 'currency', currency: 'DZD', minimumFractionDigits: 2 }).format(amount || 0);

const formatQty = (amount: number) =>
  new Intl.NumberFormat('fr-DZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Math.max(0, amount || 0));

interface ProductHistoryReturnsTabProps {
  isLoading: boolean;
  returnHistoryData: any;
  sortedRetoursAchat: any[];
  sortedRetoursVente: any[];
  handleSortRetoursAchat: (key: any) => void;
  handleSortRetoursVente: (key: any) => void;
  sortRetoursAchat: any;
  sortRetoursVente: any;
  getModalSortIcon: (config: any, key: string) => React.ReactNode;
}

export function ProductHistoryReturnsTab({
  isLoading,
  returnHistoryData,
  sortedRetoursAchat,
  sortedRetoursVente,
  handleSortRetoursAchat,
  handleSortRetoursVente,
  sortRetoursAchat,
  sortRetoursVente,
  getModalSortIcon,
}: ProductHistoryReturnsTabProps) {
  if (isLoading) {
    return (
      <div className="text-center py-12">
        <div className="inline-block w-8 h-8 border-4 border-rose-200 border-t-rose-600 rounded-full animate-spin mb-4"></div>
        <p className="text-slate-500">Chargement...</p>
      </div>
    );
  }

  if (!returnHistoryData) return null;

  return (
    <>
      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-6">
        <div className="bg-orange-50 p-4 rounded-lg border border-orange-200">
          <p className="text-xs text-orange-600 font-medium uppercase">Retours Achat</p>
          <p className="text-2xl font-bold text-orange-700">{returnHistoryData.totals.totalPurchaseReturns}</p>
        </div>
        <div className="bg-orange-50 p-4 rounded-lg border border-orange-200">
          <p className="text-xs text-orange-600 font-medium uppercase">Qté Achat</p>
          <p className="text-2xl font-bold text-orange-700">{formatQty(returnHistoryData.totals.totalPurchaseReturnQty)}</p>
        </div>
        <div className="bg-orange-50 p-4 rounded-lg border border-orange-200">
          <p className="text-xs text-orange-600 font-medium uppercase">Montant Achat</p>
          <p className="text-2xl font-bold text-orange-700">{formatMoney(returnHistoryData.totals.totalPurchaseReturnAmount)}</p>
        </div>
        <div className="bg-rose-50 p-4 rounded-lg border border-rose-200">
          <p className="text-xs text-rose-600 font-medium uppercase">Retours Vente</p>
          <p className="text-2xl font-bold text-rose-700">{returnHistoryData.totals.totalSalesReturns}</p>
        </div>
        <div className="bg-rose-50 p-4 rounded-lg border border-rose-200">
          <p className="text-xs text-rose-600 font-medium uppercase">Qté Vente</p>
          <p className="text-2xl font-bold text-rose-700">{formatQty(returnHistoryData.totals.totalSalesReturnQty)}</p>
        </div>
        <div className="bg-rose-50 p-4 rounded-lg border border-rose-200">
          <p className="text-xs text-rose-600 font-medium uppercase">Montant Vente</p>
          <p className="text-2xl font-bold text-rose-700">{formatMoney(returnHistoryData.totals.totalSalesReturnAmount)}</p>
        </div>
      </div>

      {/* Purchase Returns Section */}
      <div className="mb-8">
        <h3 className="text-sm font-bold text-orange-700 uppercase tracking-wide mb-3 flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-orange-500"></span>
          Retours d&apos;Achat (Fournisseurs)
        </h3>
        {returnHistoryData.purchaseReturns.length === 0 ? (
          <div className="text-center py-6 text-slate-400 bg-slate-50 rounded-lg">
            <p>Aucun retour d&apos;achat pour ce produit</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-orange-100 text-[10px] text-orange-700 uppercase sticky top-0 font-bold">
                <tr>
                  <th
                    className="p-3 text-center cursor-pointer hover:bg-orange-200"
                    onClick={() => handleSortRetoursAchat('returnnumber')}
                  >
                    N° Retour {getModalSortIcon(sortRetoursAchat, 'returnnumber')}
                  </th>
                  <th
                    className="p-3 text-center cursor-pointer hover:bg-orange-200"
                    onClick={() => handleSortRetoursAchat('returndate')}
                  >
                    Date {getModalSortIcon(sortRetoursAchat, 'returndate')}
                  </th>
                  <th
                    className="p-3 text-left cursor-pointer hover:bg-orange-200"
                    onClick={() => handleSortRetoursAchat('suppliername')}
                  >
                    Fournisseur {getModalSortIcon(sortRetoursAchat, 'suppliername')}
                  </th>
                  <th
                    className="p-3 text-center cursor-pointer hover:bg-orange-200"
                    onClick={() => handleSortRetoursAchat('createdby')}
                  >
                    Utilisateur {getModalSortIcon(sortRetoursAchat, 'createdby')}
                  </th>
                  <th
                    className="p-3 text-right cursor-pointer hover:bg-orange-200"
                    onClick={() => handleSortRetoursAchat('qty')}
                  >
                    Qté {getModalSortIcon(sortRetoursAchat, 'qty')}
                  </th>
                  <th
                    className="p-3 text-right cursor-pointer hover:bg-orange-200"
                    onClick={() => handleSortRetoursAchat('unitprice')}
                  >
                    Prix Unit. {getModalSortIcon(sortRetoursAchat, 'unitprice')}
                  </th>
                  <th
                    className="p-3 text-right cursor-pointer hover:bg-orange-200"
                    onClick={() => handleSortRetoursAchat('linetotal')}
                  >
                    Montant {getModalSortIcon(sortRetoursAchat, 'linetotal')}
                  </th>
                  <th className="p-3 text-left">Motif</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {sortedRetoursAchat.map((r: any, idx: number) => (
                  <tr key={`pr-${r.returnid}-${idx}`} className="hover:bg-orange-50/30">
                    <td className="p-3 text-center text-orange-600 text-xs font-mono font-semibold">{r.returnnumber || '-'}</td>
                    <td className="p-3 text-center text-slate-600 text-xs font-mono">{formatDate(r.returndate)}</td>
                    <td className="p-3 font-medium text-slate-800">{r.suppliername}</td>
                    <td className="p-3 text-center">
                      <span className="px-2 py-1 rounded-full text-xs font-medium bg-slate-100 text-slate-700">
                        {r.createdby}
                      </span>
                    </td>
                    <td className="p-3 text-right font-bold text-orange-600 font-mono">{formatQty(r.qty)}</td>
                    <td className="p-3 text-right text-slate-600 font-mono">{formatMoney(r.unitprice)}</td>
                    <td className="p-3 text-right font-bold text-slate-800 font-mono">{formatMoney(r.linetotal)}</td>
                    <td className="p-3 text-slate-600 text-xs">{r.reason || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Sales Returns Section */}
      <div>
        <h3 className="text-sm font-bold text-rose-700 uppercase tracking-wide mb-3 flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-rose-500"></span>
          Retours de Vente (Clients)
        </h3>
        {returnHistoryData.salesReturns.length === 0 ? (
          <div className="text-center py-6 text-slate-400 bg-slate-50 rounded-lg">
            <p>Aucun retour de vente pour ce produit</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-rose-100 text-[10px] text-rose-700 uppercase sticky top-0 font-bold">
                <tr>
                  <th
                    className="p-3 text-center cursor-pointer hover:bg-rose-200"
                    onClick={() => handleSortRetoursVente('returnnumber')}
                  >
                    N° Retour {getModalSortIcon(sortRetoursVente, 'returnnumber')}
                  </th>
                  <th
                    className="p-3 text-center cursor-pointer hover:bg-rose-200"
                    onClick={() => handleSortRetoursVente('returndate')}
                  >
                    Date {getModalSortIcon(sortRetoursVente, 'returndate')}
                  </th>
                  <th
                    className="p-3 text-left cursor-pointer hover:bg-rose-200"
                    onClick={() => handleSortRetoursVente('customername')}
                  >
                    Client {getModalSortIcon(sortRetoursVente, 'customername')}
                  </th>
                  <th
                    className="p-3 text-center cursor-pointer hover:bg-rose-200"
                    onClick={() => handleSortRetoursVente('createdby')}
                  >
                    Utilisateur {getModalSortIcon(sortRetoursVente, 'createdby')}
                  </th>
                  <th
                    className="p-3 text-right cursor-pointer hover:bg-rose-200"
                    onClick={() => handleSortRetoursVente('qty')}
                  >
                    Qté {getModalSortIcon(sortRetoursVente, 'qty')}
                  </th>
                  <th
                    className="p-3 text-right cursor-pointer hover:bg-rose-200"
                    onClick={() => handleSortRetoursVente('unitprice')}
                  >
                    Prix Unit. {getModalSortIcon(sortRetoursVente, 'unitprice')}
                  </th>
                  <th
                    className="p-3 text-right cursor-pointer hover:bg-rose-200"
                    onClick={() => handleSortRetoursVente('linetotal')}
                  >
                    Montant {getModalSortIcon(sortRetoursVente, 'linetotal')}
                  </th>
                  <th className="p-3 text-left">Motif</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {sortedRetoursVente.map((r: any, idx: number) => (
                  <tr key={`sr-${r.returnid}-${idx}`} className="hover:bg-rose-50/30">
                    <td className="p-3 text-center text-rose-600 text-xs font-mono font-semibold">{r.returnnumber || '-'}</td>
                    <td className="p-3 text-center text-slate-600 text-xs font-mono">{formatDate(r.returndate)}</td>
                    <td className="p-3 font-medium text-slate-800">{r.customername}</td>
                    <td className="p-3 text-center">
                      <span className="px-2 py-1 rounded-full text-xs font-medium bg-slate-100 text-slate-700">
                        {r.createdby}
                      </span>
                    </td>
                    <td className="p-3 text-right font-bold text-rose-600 font-mono">{formatQty(r.qty)}</td>
                    <td className="p-3 text-right text-slate-600 font-mono">{formatMoney(r.unitprice)}</td>
                    <td className="p-3 text-right font-bold text-slate-800 font-mono">{formatMoney(r.linetotal)}</td>
                    <td className="p-3 text-slate-600 text-xs">{r.reason || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
