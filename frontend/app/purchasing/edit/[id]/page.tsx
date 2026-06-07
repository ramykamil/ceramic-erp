'use client';

import { PurchaseOrderForm } from '@/components/PurchaseOrderForm';
import { useParams } from 'next/navigation';

export default function EditPurchaseOrderPage() {
  const params = useParams();
  const poId = Number(params.id);

  return <PurchaseOrderForm mode="edit" poId={poId} />;
}
