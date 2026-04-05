import React from 'react';

export interface OrderItem {
    orderitemid: number;
    productid: number;
    productcode: string;
    productname: string;
    quantity: number;
    unitid: number;
    unitcode: string;
    unitname: string;
    unitprice: number;
    discountpercent: number;
    discountamount: number;
    taxpercent: number;
    taxamount: number;
    linetotal: number;
    palletcount: number;
    coliscount: number;
}

export interface Order {
    orderid: number;
    ordernumber: string;
    ordertype: 'RETAIL' | 'WHOLESALE';
    customerid: number;
    customername: string;
    customercode: string;
    customertype: string;
    warehousename: string;
    orderdate: string;
    subtotal: number;
    taxamount: number;
    totalamount: number;
    status: string;
    notes: string;
    salespersonname?: string;
    items: OrderItem[];
}

interface ReceiptTemplateProps {
    order: Order;
}

// Helper: Extract palettes/cartons from notes (POS stores this in notes)
const extractPackageInfo = (notes: string): { palettes: number; cartons: number } => {
    // Default values
    let palettes = 0;
    let cartons = 0;

    // Try to extract from notes if they contain the info
    // For now, return 0 - will be populated from order items in future
    return { palettes, cartons };
};

export const ReceiptTemplate = React.forwardRef<HTMLDivElement, ReceiptTemplateProps>(({ order }, ref) => {
    const isRetail = order.ordertype === 'RETAIL';

    const formatCurrency = (amount: number) => {
        return new Intl.NumberFormat('fr-DZ', { style: 'currency', currency: 'DZD' }).format(amount);
    };

    const formatDate = (dateString: string) => {
        return new Date(dateString).toLocaleDateString('fr-DZ', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
        });
    };

    // Calculate totals
    const totalQuantity = order.items.reduce((sum, item) => sum + item.quantity, 0);

    if (isRetail) {
        // TICKET FORMAT DÉTAIL (80mm)
        return (
            <div ref={ref} className="p-4 font-mono text-sm text-black bg-white" style={{ width: '80mm', margin: '0 auto' }}>
                <div className="text-center mb-4">
                    <h1 className="text-xl font-bold uppercase">Allaoua Céramique</h1>
                    <p className="text-xs">Zone Industrielle, Rouiba</p>
                    <p className="text-xs">Tél : 023 85 XX XX</p>
                </div>

                <div className="border-b border-dashed border-black mb-2 pb-2">
                    <p>Ticket : {order.ordernumber}</p>
                    <p>Date : {formatDate(order.orderdate)}</p>
                    <p>Client : {order.customername}</p>
                    {order.salespersonname && <p>Vendeur : {order.salespersonname}</p>}
                </div>

                <div className="mb-2">
                    <table className="w-full text-left">
                        <thead>
                            <tr className="border-b border-black">
                                <th className="py-1">Article</th>
                                <th className="py-1 text-right">Qté</th>
                                <th className="py-1 text-right">Total</th>
                            </tr>
                        </thead>
                        <tbody>
                            {order.items.map((item) => (
                                <tr key={item.orderitemid}>
                                    <td className="py-1">
                                        <div className="font-bold">{item.productname}</div>
                                        <div className="text-xs text-gray-600">{formatCurrency(item.unitprice)} × {item.quantity} {item.unitcode}</div>
                                    </td>
                                    <td className="py-1 text-right align-top">{item.quantity}</td>
                                    <td className="py-1 text-right align-top">{formatCurrency(item.linetotal)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                <div className="border-t border-dashed border-black pt-2 mb-4">
                    <div className="flex justify-between text-sm">
                        <span>Quantité totale :</span>
                        <span>{totalQuantity}</span>
                    </div>
                    <div className="flex justify-between font-bold text-lg mt-2">
                        <span>TOTAL</span>
                        <span>{formatCurrency(order.totalamount)}</span>
                    </div>
                </div>

                <div className="text-center text-xs mt-4">
                    <p>Merci pour votre achat !</p>
                    <p>À bientôt chez Allaoua Céramique</p>
                </div>
            </div>
        );
    }

    // FORMAT FACTURE GROS (A4)
    return (
        <div ref={ref} className="p-8 font-sans text-black bg-white" style={{ width: '210mm', minHeight: '297mm', margin: '0 auto' }}>
            {/* En-tête */}
            <div className="flex justify-between items-start mb-8 border-b pb-6">
                <div>
                    <h1 className="text-3xl font-bold text-blue-900 uppercase mb-2">Allaoua Céramique</h1>
                    <p className="text-gray-600">Zone Industrielle</p>
                    <p className="text-gray-600">Rouiba, Alger, Algérie</p>
                    <p className="text-gray-600">Tél : +213 23 85 XX XX</p>
                    <p className="text-gray-600">E-mail : contact@allaoua-ceramique.dz</p>
                </div>
                <div className="text-right">
                    <h2 className="text-2xl font-bold text-gray-800 mb-2">BON DE LIVRAISON</h2>
                    <p className="text-gray-600">N° : <span className="font-semibold text-black">{order.ordernumber}</span></p>
                    <p className="text-gray-600">Date : <span className="font-semibold text-black">{formatDate(order.orderdate)}</span></p>
                    <p className="text-gray-600">Statut : <span className="font-semibold text-black uppercase">{order.status}</span></p>
                </div>
            </div>

            {/* Informations client */}
            <div className="mb-8 bg-gray-50 p-6 rounded-lg border border-gray-200">
                <h3 className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-3">Facturer à</h3>
                <div className="text-lg font-bold text-gray-900">{order.customername}</div>
                <div className="text-gray-700">Code client : {order.customercode}</div>
                <div className="text-gray-700">Type : {order.customertype === 'WHOLESALE' ? 'Grossiste' : 'Détaillant'}</div>
            </div>

            {/* Tableau des articles */}
            <div className="mb-8">
                <table className="w-full text-left border-collapse">
                    <thead>
                        <tr className="bg-gray-100 border-b border-gray-300 text-sm uppercase text-gray-600">
                            <th className="py-3 px-4">Désignation</th>
                            <th className="py-3 px-4 text-center">Palettes</th>
                            <th className="py-3 px-4 text-center">Cartons</th>
                            <th className="py-3 px-4 text-center">Quantité</th>
                            <th className="py-3 px-4 text-center">Unité</th>
                            <th className="py-3 px-4 text-right">Prix unitaire</th>
                            <th className="py-3 px-4 text-right">Total HT</th>
                        </tr>
                    </thead>
                    <tbody className="text-gray-700">
                        {order.items.map((item, index) => (
                            <tr key={item.orderitemid} className={index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                                <td className="py-3 px-4 border-b">
                                    <div className="font-semibold">{item.productname}</div>
                                    <div className="text-xs text-gray-500">{item.productcode}</div>
                                </td>
                                <td className="py-3 px-4 text-center border-b font-medium">{item.palletcount || 0}</td>
                                <td className="py-3 px-4 text-center border-b font-medium">{item.coliscount || 0}</td>
                                <td className="py-3 px-4 text-center border-b font-bold">{item.quantity}</td>
                                <td className="py-3 px-4 text-center border-b">{item.unitcode}</td>
                                <td className="py-3 px-4 text-right border-b">{formatCurrency(item.unitprice)}</td>
                                <td className="py-3 px-4 text-right border-b font-medium">{formatCurrency(item.linetotal)}</td>
                            </tr>
                        ))}
                    </tbody>
                    <tfoot className="bg-gray-100 font-semibold">
                        <tr>
                            <td className="py-3 px-4 border-t-2 border-gray-300">TOTAUX</td>
                            <td className="py-3 px-4 text-center border-t-2 border-gray-300">
                                {order.items.reduce((sum, item) => sum + (item.palletcount || 0), 0)}
                            </td>
                            <td className="py-3 px-4 text-center border-t-2 border-gray-300">
                                {order.items.reduce((sum, item) => sum + (item.coliscount || 0), 0)}
                            </td>
                            <td className="py-3 px-4 text-center border-t-2 border-gray-300 font-bold">
                                {totalQuantity}
                            </td>
                            <td className="py-3 px-4 border-t-2 border-gray-300"></td>
                            <td className="py-3 px-4 border-t-2 border-gray-300"></td>
                            <td className="py-3 px-4 text-right border-t-2 border-gray-300 font-bold">
                                {formatCurrency(order.subtotal)}
                            </td>
                        </tr>
                    </tfoot>
                </table>
            </div>

            {/* Total général */}
            <div className="flex justify-end mb-12">
                <div className="w-1/3">
                    <div className="flex justify-between py-2 border-b border-gray-200">
                        <span className="text-gray-600">Sous-total HT :</span>
                        <span className="font-medium">{formatCurrency(order.subtotal)}</span>
                    </div>
                    <div className="flex justify-between py-3 border-b-2 border-black mt-2">
                        <span className="text-xl font-bold text-black">TOTAL À PAYER :</span>
                        <span className="text-xl font-bold text-blue-900">{formatCurrency(order.totalamount)}</span>
                    </div>
                </div>
            </div>

            {/* Notes */}
            {order.notes && (
                <div className="mb-8 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                    <h4 className="text-sm font-bold text-yellow-800 mb-2">Remarques :</h4>
                    <p className="text-yellow-700 text-sm">{order.notes}</p>
                </div>
            )}

            {/* Signatures */}
            <div className="grid grid-cols-2 gap-8 mb-8">
                <div className="border-t border-gray-300 pt-4">
                    <p className="text-sm text-gray-600 mb-12">Signature du client :</p>
                    <div className="border-b border-gray-300"></div>
                </div>
                <div className="border-t border-gray-300 pt-4">
                    <p className="text-sm text-gray-600 mb-12">Signature du livreur :</p>
                    <div className="border-b border-gray-300"></div>
                </div>
            </div>

            {/* Pied de page */}
            <div className="border-t pt-6 text-center text-gray-500 text-sm">
                <p className="mb-1">Merci pour votre confiance.</p>
                <p>Conditions de paiement : Paiement à réception de facture, sauf accord contraire.</p>
                <p className="mt-2 text-xs">Allaoua Céramique - RC : XX/XX-XXXXXXX - NIF : XXXXXXXXXXX</p>
            </div>
        </div>
    );
});

ReceiptTemplate.displayName = 'ReceiptTemplate';
