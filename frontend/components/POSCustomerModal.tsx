import { useState } from 'react';
import api from '@/lib/api';

interface Customer {
  customerid: number;
  customercode?: string;
  customername: string;
  customertype: string;
  currentbalance: number;
  address?: string;
  phone?: string;
}

interface POSCustomerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreateSuccess: (newCustomer: Customer) => void;
}

export function POSCustomerModal({ isOpen, onClose, onCreateSuccess }: POSCustomerModalProps) {
  const [newCustomerName, setNewCustomerName] = useState('');
  const [newCustomerType, setNewCustomerType] = useState<'RETAIL' | 'WHOLESALE'>('WHOLESALE');
  const [newCustomerPhone, setNewCustomerPhone] = useState('');
  const [newCustomerAddress, setNewCustomerAddress] = useState('');
  const [isCreatingCustomer, setIsCreatingCustomer] = useState(false);

  const handleCreateCustomer = async () => {
    setIsCreatingCustomer(true);
    try {
      const res = await api.createCustomer({
        customerCode: `C$-${Date.now()}`,
        customerName: newCustomerName,
        customerType: newCustomerType,
        phone: newCustomerPhone,
        address: newCustomerAddress,
        ancienSolde: 0,
      });
      if (res.success && res.data) {
        onCreateSuccess(res.data as Customer);
        onClose();
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsCreatingCustomer(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm">
      <div className="w-full max-w-md bg-slate-900/60 rounded-2xl shadow-2xl overflow-hidden p-6 scale-in">
        <h2 className="text-xl font-bold mb-6 text-slate-100 border-b pb-4">Nouveau Client</h2>
        <div className="space-y-4">
          <input
            type="text"
            placeholder="Nom complet..."
            value={newCustomerName}
            onChange={(e) => setNewCustomerName(e.target.value)}
            className="w-full p-4 bg-slate-900/40 border border-slate-600/40 rounded-xl"
          />
          <select
            value={newCustomerType}
            onChange={(e) => setNewCustomerType(e.target.value as any)}
            className="w-full p-4 bg-slate-900/40 border border-slate-600/40 rounded-xl"
          >
            <option value="WHOLESALE">Grossiste / Revendeur</option>
            <option value="RETAIL">Détaillant / Client de passage</option>
          </select>
          <input
            type="tel"
            placeholder="Téléphone..."
            value={newCustomerPhone}
            onChange={(e) => setNewCustomerPhone(e.target.value)}
            className="w-full p-4 bg-slate-900/40 border border-slate-600/40 rounded-xl"
          />
          <div className="flex gap-3 pt-4">
            <button
              onClick={onClose}
              className="flex-1 py-4 text-slate-500 font-bold hover:text-slate-200 transition-colors"
            >
              Annuler
            </button>
            <button
              onClick={handleCreateCustomer}
              disabled={isCreatingCustomer}
              className="flex-1 py-4 btn-glassy rounded-xl font-bold"
            >
              {isCreatingCustomer ? 'CRÉATION...' : 'CRÉER'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
