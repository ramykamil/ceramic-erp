import { formatDate } from '@/lib/utils';

const formatQty = (amount: number) =>
  new Intl.NumberFormat('fr-DZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Math.max(0, amount || 0));

interface ProductHistoryAdjustmentsTabProps {
  isLoading: boolean;
  adjustmentHistoryData: any;
  sortedAjustements: any[];
  handleSortAjustements: (key: any) => void;
  sortAjustements: any;
  getModalSortIcon: (config: any, key: string) => React.ReactNode;
}

export function ProductHistoryAdjustmentsTab({
  isLoading,
  adjustmentHistoryData,
  sortedAjustements,
  handleSortAjustements,
  sortAjustements,
  getModalSortIcon,
}: ProductHistoryAdjustmentsTabProps) {
  if (isLoading) {
    return (
      <div className="text-center py-12">
        <div className="inline-block w-8 h-8 border-4 border-amber-200 border-t-amber-600 rounded-full animate-spin mb-4"></div>
        <p className="text-slate-500">Chargement...</p>
      </div>
    );
  }

  if (!adjustmentHistoryData) return null;

  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="bg-amber-50 p-4 rounded-lg border border-amber-200">
          <p className="text-xs text-amber-600 font-medium uppercase">Total Ajustements</p>
          <p className="text-2xl font-bold text-amber-700">{adjustmentHistoryData.totals.totalAdjustments}</p>
        </div>
        <div className="bg-emerald-50 p-4 rounded-lg border border-emerald-200">
          <p className="text-xs text-emerald-600 font-medium uppercase">Quantité Ajoutée</p>
          <p className="text-2xl font-bold text-emerald-700">+{formatQty(adjustmentHistoryData.totals.totalAdded)}</p>
        </div>
        <div className="bg-sky-500/10 p-4 rounded-lg border border-sky-500/20">
          <p className="text-xs text-sky-400 font-medium uppercase">Quantité Retirée</p>
          <p className="text-2xl font-bold text-sky-300">-{formatQty(adjustmentHistoryData.totals.totalRemoved)}</p>
        </div>
      </div>
      {adjustmentHistoryData.adjustments.length === 0 ? (
        <div className="text-center py-12 text-slate-400">
          <p className="text-lg">Aucun ajustement manuel enregistré pour ce produit</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-amber-100/50 text-[10px] text-amber-800 uppercase sticky top-0 font-bold">
              <tr>
                <th
                  className="p-3 text-center cursor-pointer hover:bg-amber-200"
                  onClick={() => handleSortAjustements('createdat')}
                >
                  Date / Heure {getModalSortIcon(sortAjustements, 'createdat')}
                </th>
                <th
                  className="p-3 text-left cursor-pointer hover:bg-amber-200"
                  onClick={() => handleSortAjustements('createdbyuser')}
                >
                  Utilisateur {getModalSortIcon(sortAjustements, 'createdbyuser')}
                </th>
                <th
                  className="p-3 text-right cursor-pointer hover:bg-amber-200"
                  onClick={() => handleSortAjustements('quantity')}
                >
                  Quantité Modifiée {getModalSortIcon(sortAjustements, 'quantity')}
                </th>
                <th className="p-3 text-left">Notes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {sortedAjustements.map((adj: any) => {
                const qty = parseFloat(adj.quantity);
                return (
                  <tr key={adj.transactionid} className="hover:bg-amber-50/20">
                    <td className="p-3 text-center text-slate-400 font-mono">{formatDate(adj.createdat, true)}</td>
                    <td className="p-3 font-medium text-slate-100">{adj.createdbyuser || '-'}</td>
                    <td
                      className={`p-3 text-right font-bold font-mono ${
                        qty > 0 ? 'text-emerald-600 bg-emerald-50/30' : 'text-sky-400 bg-sky-500/10/30'
                      }`}
                    >
                      {qty > 0 ? '+' : ''}
                      {formatQty(qty)}
                    </td>
                    <td className="p-3 text-slate-400 text-xs">{adj.notes || '-'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
