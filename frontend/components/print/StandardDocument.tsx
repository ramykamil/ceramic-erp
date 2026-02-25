import React from 'react';

// Types
export type DocumentType = 'DELIVERY_NOTE' | 'LOADING_SLIP' | 'PURCHASE_ORDER' | 'NO_BALANCE_SLIP' | 'RETURN_SLIP' | 'FACTURE' | 'TICKET' | 'BON_VERSEMENT';

export interface PrintItem {
    productCode: string;
    productName: string;
    brandName?: string;  // Marque/Famille
    quantity: number;
    unitCode: string;
    unitPrice?: number;
    lineTotal?: number;
    palletCount?: number;
    boxCount?: number;
    piecesPerCarton?: number;  // For displaying pcs/ctn in print
    cartonsPerPalette?: number;  // For displaying ctn/pal in print
}

export interface DocumentData {
    number: string;
    date: string;
    time?: string;
    clientName?: string;
    clientAddress?: string;
    clientPhone?: string;
    clientNIF?: string;  // For facture
    clientRC?: string;   // For facture
    items: PrintItem[];
    // Financials
    totalHT?: number;
    totalTVA?: number;
    timbre?: number;
    discount?: number;
    deliveryCost?: number; // Added delivery cost
    payment?: number;
    oldBalance?: number;
    // User info
    createdBy?: string;
    driverName?: string;
    vehiclePlate?: string;
    // Versement specific
    versementAmount?: number;
    previousBalance?: number;
    newBalance?: number;
    paymentMethod?: string;
    observation?: string;
}

interface DocumentProps {
    type: DocumentType;
    data: DocumentData;
}

// Helper - handle NaN and undefined values
const formatCurrency = (val: number | undefined | null): string => {
    const num = Number(val);
    if (isNaN(num)) return '0,00 DA';
    return new Intl.NumberFormat('fr-DZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(num) + ' DA';
};

// Convert number to French words for "montant en lettres"
const numberToFrenchWords = (amount: number): string => {
    if (isNaN(amount) || amount === 0) return 'Zéro Dinar';

    const units = ['', 'Un', 'Deux', 'Trois', 'Quatre', 'Cinq', 'Six', 'Sept', 'Huit', 'Neuf',
        'Dix', 'Onze', 'Douze', 'Treize', 'Quatorze', 'Quinze', 'Seize', 'Dix-Sept', 'Dix-Huit', 'Dix-Neuf'];
    const tens = ['', '', 'Vingt', 'Trente', 'Quarante', 'Cinquante', 'Soixante', 'Soixante', 'Quatre-Vingt', 'Quatre-Vingt'];

    const convertChunk = (n: number): string => {
        if (n === 0) return '';
        if (n < 20) return units[n];
        if (n < 100) {
            const t = Math.floor(n / 10);
            const u = n % 10;
            // 70-79: Soixante-Dix, Soixante-et-Onze...
            if (t === 7) return 'Soixante' + (u === 0 ? '-Dix' : (u === 1 ? '-et-Onze' : '-' + units[10 + u]));
            // 90-99: Quatre-Vingt-Dix, Quatre-Vingt-Onze...
            if (t === 9) return 'Quatre-Vingt-' + units[10 + u];
            // 80: Quatre-Vingts, 81-89: Quatre-Vingt-Un...
            if (t === 8) return u === 0 ? 'Quatre-Vingts' : 'Quatre-Vingt-' + units[u];
            // Others: Vingt-et-Un, Trente-Deux...
            return tens[t] + (u === 1 ? '-et-Un' : (u === 0 ? '' : '-' + units[u]));
        }
        if (n < 1000) {
            const h = Math.floor(n / 100);
            const rest = n % 100;
            const prefix = h === 1 ? 'Cent' : units[h] + ' Cent' + (rest === 0 ? 's' : '');
            return prefix + (rest > 0 ? ' ' + convertChunk(rest) : '');
        }
        return '';
    };

    const abs = Math.abs(amount);
    const intPart = Math.floor(abs);
    const decPart = Math.round((abs - intPart) * 100);

    let result = '';

    if (intPart === 0) {
        result = 'Zéro';
    } else if (intPart >= 1000000000) {
        const billions = Math.floor(intPart / 1000000000);
        const rest = intPart % 1000000000;
        result = (billions === 1 ? 'Un Milliard' : convertChunk(billions) + ' Milliards');
        if (rest > 0) {
            const millions = Math.floor(rest / 1000000);
            const afterMil = rest % 1000000;
            if (millions > 0) result += ' ' + (millions === 1 ? 'Un Million' : convertChunk(millions) + ' Millions');
            const thousands = Math.floor(afterMil / 1000);
            const remainder = afterMil % 1000;
            if (thousands > 0) result += ' ' + (thousands === 1 ? 'Mille' : convertChunk(thousands) + ' Mille');
            if (remainder > 0) result += ' ' + convertChunk(remainder);
        }
    } else if (intPart >= 1000000) {
        const millions = Math.floor(intPart / 1000000);
        const rest = intPart % 1000000;
        result = (millions === 1 ? 'Un Million' : convertChunk(millions) + ' Millions');
        if (rest > 0) {
            const thousands = Math.floor(rest / 1000);
            const remainder = rest % 1000;
            if (thousands > 0) result += ' ' + (thousands === 1 ? 'Mille' : convertChunk(thousands) + ' Mille');
            if (remainder > 0) result += ' ' + convertChunk(remainder);
        }
    } else if (intPart >= 1000) {
        const thousands = Math.floor(intPart / 1000);
        const rest = intPart % 1000;
        result = (thousands === 1 ? 'Mille' : convertChunk(thousands) + ' Mille');
        if (rest > 0) result += ' ' + convertChunk(rest);
    } else {
        result = convertChunk(intPart);
    }

    result += intPart <= 1 ? ' Dinar' : ' Dinars';

    if (decPart > 0) {
        result += ' et ' + convertChunk(decPart) + (decPart <= 1 ? ' Centime' : ' Centimes');
    }

    return (amount < 0 ? 'Moins ' : '') + result;
};

export const StandardDocument = React.forwardRef<HTMLDivElement, DocumentProps>(({ type, data }, ref) => {
    const isLoadingSlip = type === 'LOADING_SLIP';
    const isNoBalanceSlip = type === 'NO_BALANCE_SLIP';
    const isReturnSlip = type === 'RETURN_SLIP';
    const isFacture = type === 'FACTURE';
    const isBL = type === 'DELIVERY_NOTE'; // Bon de Livraison
    const isTicket = type === 'TICKET'; // Receipt-style ticket
    const showPrices = !isLoadingSlip && !isNoBalanceSlip; // BC and BSS hide all prices
    const showBalance = type === 'DELIVERY_NOTE' || type === 'TICKET'; // BL and Ticket show full balance info
    const isPurchaseOrder = type === 'PURCHASE_ORDER';
    const showLegalInfo = !isBL && !isPurchaseOrder && !isLoadingSlip && !isNoBalanceSlip && !isTicket; // Hide RC, NIF, NIS, AI from BL, BC, BSS, Ticket
    const showFinancialDetails = !isBL && !isPurchaseOrder && !isTicket; // Hide TVA, timbre, remise, total HT from BL, BC, Ticket
    const titleMap: Record<string, string> = {
        'DELIVERY_NOTE': 'BON DE LIVRAISON',
        'LOADING_SLIP': 'BON DE CHARGEMENT',
        'PURCHASE_ORDER': 'BON DE COMMANDE',
        'NO_BALANCE_SLIP': 'BON SANS SOLDE',
        'RETURN_SLIP': 'BON DE RETOUR',
        'FACTURE': 'FACTURE',
        'TICKET': 'TICKET DE CAISSE',
        'BON_VERSEMENT': 'BON DE VERSEMENT'
    };

    // Calculate Totals with NaN protection
    const safeNumber = (n: number | undefined | null): number => {
        const num = Number(n);
        return isNaN(num) ? 0 : num;
    };

    const totalHT = safeNumber(data.totalHT) || data.items.reduce((sum, item) => sum + safeNumber(item.lineTotal), 0);
    const totalTVA = safeNumber(data.totalTVA);
    const timbre = safeNumber(data.timbre);
    const discount = safeNumber(data.discount);
    const delivery = safeNumber(data.deliveryCost);
    const totalNet = totalHT + totalTVA + timbre + delivery - discount;
    const payment = safeNumber(data.payment);
    const reste = totalNet - payment;
    const oldBalance = safeNumber(data.oldBalance);
    const newBalance = oldBalance + reste;

    // Calculate pallet/box totals
    const totalPallets = data.items.reduce((sum, item) => sum + safeNumber(item.palletCount), 0);
    const totalBoxes = data.items.reduce((sum, item) => sum + safeNumber(item.boxCount), 0);
    const totalQty = data.items.reduce((sum, item) => sum + safeNumber(item.quantity), 0);

    // Calculate total SQM and total PCS for inverse display
    // If item is in SQM, add to totalSqm and convert to PCS for totalPcs
    // If item is in PCS, add to totalPcs and convert to SQM for totalSqm
    // IMPORTANT: Skip FICHE products (sample/technical sheets) - they are single items, not tiles
    let totalSqm = 0;
    let totalPcs = 0;
    let hasSqmItems = false;
    let hasPcsItems = false;
    let hasFicheItems = false;

    data.items.forEach(item => {
        // Track FICHE products separately
        const isFicheProduct = item.productName.toLowerCase().startsWith('fiche');
        if (isFicheProduct) {
            hasFicheItems = true;
        }

        const match = item.productName.match(/(\d+)\s*[\/xX×]\s*(\d+)/);
        const sqmPerPiece = match ? (parseInt(match[1]) / 100) * (parseInt(match[2]) / 100) : 0;

        if (item.unitCode === 'SQM') {
            hasSqmItems = true;
            totalSqm += safeNumber(item.quantity);
            // Convert SQM to PCS for inverse
            if (sqmPerPiece > 0) {
                totalPcs += safeNumber(item.quantity) / sqmPerPiece;
            }
        } else if (item.unitCode === 'PCS') {
            hasPcsItems = true;
            totalPcs += safeNumber(item.quantity);
            // Convert PCS to SQM for inverse
            // Skip FICHE products for SQM calculation
            if (sqmPerPiece > 0 && !isFicheProduct) {
                totalSqm += safeNumber(item.quantity) * sqmPerPiece;
            }
        }
    });

    // Detect if we have mixed units (makes raw totalQty meaningless)
    const hasMixedUnits = (hasSqmItems && hasPcsItems) || (hasFicheItems && (hasSqmItems || hasPcsItems));

    // Styles - Ticket uses smaller dimensions (80mm width for thermal printers)
    const pageStyle: React.CSSProperties = isTicket ? {
        padding: '5mm 3mm',
        backgroundColor: 'white',
        color: 'black',
        fontFamily: "'Courier New', Courier, monospace",
        fontSize: '9px',
        width: '80mm',
        minHeight: 'auto',
        margin: '0 auto',
        boxSizing: 'border-box',
        position: 'relative',
    } : {
        padding: '15mm 12mm',
        backgroundColor: 'white',
        color: 'black',
        fontFamily: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif",
        fontSize: '10px',
        width: '210mm',
        minHeight: '297mm',
        margin: '0 auto',
        boxSizing: 'border-box',
        position: 'relative',
    };

    const headerStyle: React.CSSProperties = {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        borderBottom: '4px solid #b91c1c',
        paddingBottom: '12px',
        marginBottom: '15px',
    };

    const cellStyle: React.CSSProperties = {
        border: '1px solid #374151',
        padding: '5px 6px',
    };

    const headerCellStyle: React.CSSProperties = {
        ...cellStyle,
        backgroundColor: '#1f2937',
        color: 'white',
        fontWeight: 'bold',
        textAlign: 'center',
        fontSize: '9px',
        textTransform: 'uppercase',
    };

    // TICKET LAYOUT - Compact receipt-style for thermal printers (80mm width)
    if (isTicket) {
        return (
            <div ref={ref} style={pageStyle}>
                {/* Ticket Header */}
                <div style={{ textAlign: 'center', borderBottom: '2px dashed #000', paddingBottom: '8px', marginBottom: '8px' }}>
                    <div style={{ fontWeight: 'bold', fontSize: '14px', letterSpacing: '1px' }}>ALLAOUA CERAM</div>
                    <div style={{ fontSize: '8px', color: '#666' }}>MATERIAUX DE CONSTRUCTION</div>
                    <div style={{ fontSize: '7px', marginTop: '3px' }}>ZONE D'ACTIVITE -OEB-</div>
                    <div style={{ fontSize: '7px', fontWeight: 'bold' }}>Tél: 0660 46 88 94</div>
                </div>

                {/* Document Info */}
                <div style={{ textAlign: 'center', marginBottom: '8px' }}>
                    <div style={{ fontWeight: 'bold', fontSize: '12px' }}>TICKET DE CAISSE</div>
                    <div style={{ fontSize: '9px' }}>N°: <strong>{data.number}</strong></div>
                    <div style={{ fontSize: '8px' }}>Date: {new Date(data.date).toLocaleDateString('fr-DZ')}</div>
                    {data.createdBy && <div style={{ fontSize: '9px', fontWeight: 'bold' }}>Établie par: {data.createdBy}</div>}
                </div>

                {/* Client Info */}
                <div style={{ borderTop: '1px dashed #000', borderBottom: '1px dashed #000', padding: '5px 0', marginBottom: '8px' }}>
                    <div style={{ fontSize: '9px' }}>
                        <strong>Client:</strong> {data.clientName || 'CLIENT PASSAGER'}
                    </div>
                </div>

                {/* Items List */}
                <div style={{ marginBottom: '8px' }}>
                    {data.items.map((item, index) => (
                        <div key={index} style={{ borderBottom: '1px dotted #ccc', paddingBottom: '4px', marginBottom: '4px' }}>
                            <div style={{ fontSize: '8px', fontWeight: 'bold' }}>{item.productName}</div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '8px' }}>
                                <span>
                                    {item.palletCount ? `${parseFloat(Number(item.palletCount).toFixed(2))}P ` : ''}{item.boxCount ? `${parseFloat(Number(item.boxCount).toFixed(2))}C ` : ''}{Number(item.quantity || 0).toFixed(2)} {item.unitCode}
                                </span>
                                <span style={{ fontWeight: 'bold' }}>{formatCurrency(item.lineTotal)}</span>
                            </div>
                            <div style={{ fontSize: '7px', color: '#666' }}>
                                @ {formatCurrency(item.unitPrice)} / {item.unitCode}
                            </div>
                        </div>
                    ))}
                </div>

                {/* Totals Summary */}
                <div style={{ borderTop: '2px solid #000', paddingTop: '5px', fontSize: '9px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2px' }}>
                        <span>Articles: {data.items.length}</span>
                        <span>Palettes: {parseFloat(totalPallets.toFixed(2))} | Colis: {parseFloat(totalBoxes.toFixed(2))}</span>
                    </div>
                    {totalSqm > 0 && (
                        <div style={{ textAlign: 'right', fontSize: '8px', color: '#0369a1' }}>
                            ≈ {totalSqm.toFixed(2)} m² | ≈ {totalPcs.toFixed(0)} pcs
                        </div>
                    )}
                </div>

                {/* Financial Summary */}
                <div style={{ borderTop: '1px dashed #000', marginTop: '5px', paddingTop: '5px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', fontWeight: 'bold', marginBottom: '3px' }}>
                        <span>TOTAL TTC:</span>
                        <span>{formatCurrency(totalNet)}</span>
                    </div>
                    {delivery > 0 && (
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '8px' }}>
                            <span>Livraison:</span>
                            <span>+{formatCurrency(delivery)}</span>
                        </div>
                    )}
                    {discount > 0 && (
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '8px', color: '#dc2626' }}>
                            <span>Remise:</span>
                            <span>-{formatCurrency(discount)}</span>
                        </div>
                    )}
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '9px', backgroundColor: '#f0f0f0', padding: '3px', marginTop: '3px' }}>
                        <span>Versement:</span>
                        <span style={{ color: '#16a34a', fontWeight: 'bold' }}>{formatCurrency(payment)}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', fontWeight: 'bold', marginTop: '3px' }}>
                        <span>Reste:</span>
                        <span style={{ color: reste > 0 ? '#dc2626' : '#16a34a' }}>{formatCurrency(reste)}</span>
                    </div>
                </div>

                {/* Balance Info */}
                <div style={{ borderTop: '1px dashed #000', marginTop: '5px', paddingTop: '5px', fontSize: '8px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span>Ancien Solde:</span>
                        <span>{formatCurrency(oldBalance)}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold' }}>
                        <span>NOUVEAU SOLDE:</span>
                        <span style={{ color: newBalance > 0 ? '#dc2626' : '#16a34a' }}>{formatCurrency(newBalance)}</span>
                    </div>
                </div>

                {/* Footer */}
                <div style={{ textAlign: 'center', marginTop: '10px', paddingTop: '8px', borderTop: '2px dashed #000', fontSize: '7px', color: '#666' }}>
                    <div>Merci pour votre achat!</div>
                    <div>ALLAOUA CERAM</div>
                </div>
            </div>
        );
    }

    // BON DE VERSEMENT LAYOUT - Receipt for client payment
    if (type === 'BON_VERSEMENT') {
        const versementDate = new Date(data.date);
        const prevBal = safeNumber(data.previousBalance);
        const versAmt = safeNumber(data.versementAmount) || safeNumber(data.payment);
        const newBal = safeNumber(data.newBalance) !== 0 ? safeNumber(data.newBalance) : prevBal - versAmt;

        return (
            <div ref={ref} style={{
                padding: '15mm 12mm',
                backgroundColor: 'white',
                color: 'black',
                fontFamily: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif",
                fontSize: '11px',
                width: '210mm',
                minHeight: '148mm', // Half A4 height
                margin: '0 auto',
                boxSizing: 'border-box',
                position: 'relative',
            }}>
                {/* Header */}
                <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'flex-start',
                    borderBottom: '4px solid #16a34a',
                    paddingBottom: '12px',
                    marginBottom: '15px',
                }}>
                    {/* Company Info */}
                    <div style={{ width: '45%' }}>
                        <div style={{
                            color: '#16a34a',
                            fontWeight: '800',
                            fontSize: '24px',
                            letterSpacing: '-1px',
                            lineHeight: '1.1',
                        }}>
                            ALLAOUA CERAM
                        </div>
                        <div style={{
                            fontWeight: 'bold',
                            fontSize: '10px',
                            marginTop: '3px',
                            color: '#374151',
                        }}>
                            MATERIAUX DE CONSTRUCTION
                        </div>
                        <div style={{
                            marginTop: '8px',
                            fontSize: '9px',
                            lineHeight: '1.5',
                            color: '#4b5563',
                            borderLeft: '3px solid #16a34a',
                            paddingLeft: '8px'
                        }}>
                            <p style={{ margin: '2px 0' }}>ZONE D'ACTIVITE -OEB-</p>
                            <p style={{ margin: '2px 0', fontWeight: 'bold' }}>Tél: 0660 46 88 94</p>
                        </div>
                    </div>

                    {/* Document Info */}
                    <div style={{
                        textAlign: 'center',
                        border: '3px solid #16a34a',
                        padding: '12px 20px',
                        borderRadius: '8px',
                        backgroundColor: '#f0fdf4'
                    }}>
                        <h2 style={{
                            fontWeight: '800',
                            fontSize: '18px',
                            margin: '0 0 8px 0',
                            color: '#16a34a',
                        }}>
                            BON DE VERSEMENT
                        </h2>
                        <p style={{ margin: '4px 0', fontSize: '14px' }}>
                            N°: <strong style={{ color: '#16a34a', fontSize: '15px' }}>{data.number}</strong>
                        </p>
                        <p style={{ margin: '4px 0', fontSize: '11px', color: '#4b5563' }}>
                            Le: <strong>{versementDate.toLocaleDateString('fr-DZ')}</strong>
                            <span> à <strong>{data.time || versementDate.toLocaleTimeString('fr-DZ', { hour: '2-digit', minute: '2-digit' })}</strong></span>
                        </p>
                    </div>
                </div>

                {/* Client Info Box */}
                <div style={{
                    marginBottom: '15px',
                    border: '2px solid #374151',
                    padding: '12px 15px',
                    borderRadius: '6px',
                    backgroundColor: '#fefce8',
                }}>
                    <div style={{ display: 'flex', marginBottom: '6px', alignItems: 'baseline' }}>
                        <span style={{ fontWeight: 'bold', width: '100px', fontSize: '10px', color: '#4b5563' }}>CLIENT:</span>
                        <span style={{
                            textTransform: 'uppercase',
                            fontWeight: 'bold',
                            fontSize: '16px',
                            color: '#1f2937'
                        }}>
                            {data.clientName || 'CLIENT'}
                        </span>
                    </div>
                    {data.clientPhone && (
                        <div style={{ display: 'flex', alignItems: 'baseline' }}>
                            <span style={{ fontWeight: 'bold', width: '100px', fontSize: '10px', color: '#4b5563' }}>TÉLÉPHONE:</span>
                            <span style={{ fontSize: '11px', fontWeight: 'bold' }}>{data.clientPhone}</span>
                        </div>
                    )}
                </div>

                {/* Payment Details Box */}
                <div style={{
                    border: '3px solid #16a34a',
                    borderRadius: '8px',
                    overflow: 'hidden',
                    marginBottom: '15px',
                }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <tbody>
                            <tr>
                                <td style={{ padding: '10px 15px', fontWeight: 'bold', fontSize: '12px', backgroundColor: '#f3f4f6', width: '40%' }}>Mode de Règlement</td>
                                <td style={{ padding: '10px 15px', fontSize: '12px', textTransform: 'capitalize' }}>
                                    {(data.paymentMethod || 'Espèces').toLowerCase()}
                                </td>
                            </tr>
                            <tr style={{ backgroundColor: '#f0fdf4' }}>
                                <td style={{ padding: '10px 15px', fontWeight: 'bold', fontSize: '12px' }}>Ancien Solde</td>
                                <td style={{ padding: '10px 15px', fontFamily: 'monospace', fontSize: '14px', color: prevBal > 0 ? '#dc2626' : '#16a34a' }}>
                                    {formatCurrency(prevBal)}
                                </td>
                            </tr>
                            <tr style={{ backgroundColor: '#16a34a', color: 'white' }}>
                                <td style={{ padding: '12px 15px', fontWeight: 'bold', fontSize: '14px' }}>MONTANT VERSÉ</td>
                                <td style={{ padding: '12px 15px', fontFamily: 'monospace', fontWeight: 'bold', fontSize: '20px' }}>
                                    {formatCurrency(versAmt)}
                                </td>
                            </tr>
                            <tr style={{ backgroundColor: '#7c3aed', color: 'white' }}>
                                <td style={{ padding: '12px 15px', fontWeight: 'bold', fontSize: '14px' }}>NOUVEAU SOLDE</td>
                                <td style={{ padding: '12px 15px', fontFamily: 'monospace', fontWeight: 'bold', fontSize: '18px', color: newBal > 0 ? '#fca5a5' : '#86efac' }}>
                                    {formatCurrency(newBal)}
                                </td>
                            </tr>
                        </tbody>
                    </table>
                </div>

                {/* Observation */}
                {data.observation && (
                    <div style={{
                        marginBottom: '15px',
                        padding: '10px 15px',
                        backgroundColor: '#f9fafb',
                        borderRadius: '6px',
                        border: '1px solid #e5e7eb'
                    }}>
                        <p style={{ fontWeight: 'bold', fontSize: '10px', marginBottom: '5px', color: '#6b7280' }}>OBSERVATION:</p>
                        <p style={{ fontSize: '11px', fontStyle: 'italic' }}>{data.observation}</p>
                    </div>
                )}

                {/* Signature Boxes */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginTop: '20px' }}>
                    <div style={{ border: '2px solid #374151', padding: '10px', height: '80px', textAlign: 'center', borderRadius: '6px' }}>
                        <p style={{ fontWeight: 'bold', fontSize: '10px', marginBottom: '5px' }}>CACHET & SIGNATURE</p>
                        <p style={{ fontSize: '8px', color: '#6b7280', marginTop: '5px' }}>{data.createdBy || ''}</p>
                    </div>
                    <div style={{ border: '2px solid #374151', padding: '10px', height: '80px', textAlign: 'center', borderRadius: '6px' }}>
                        <p style={{ fontWeight: 'bold', fontSize: '10px', marginBottom: '5px' }}>CLIENT</p>
                    </div>
                </div>

                {/* Footer */}
                <div style={{
                    position: 'absolute',
                    bottom: '8mm',
                    left: '12mm',
                    right: '12mm',
                    textAlign: 'center',
                    fontSize: '8px',
                    color: '#9ca3af',
                    borderTop: '1px solid #e5e7eb',
                    paddingTop: '5px'
                }}>
                    ALLAOUA CERAM - Bon de Versement
                </div>
            </div>
        );
    }

    return (
        <div ref={ref} style={pageStyle}>

            {/* --- HEADER --- */}
            <div style={headerStyle}>
                {/* Left: Company Info */}
                <div style={{ width: '38%' }}>
                    <div style={{
                        color: '#b91c1c',
                        fontWeight: '800',
                        fontSize: '28px',
                        letterSpacing: '-1.5px',
                        lineHeight: '1.1',
                        fontFamily: "'Arial Black', 'Helvetica Neue', sans-serif"
                    }}>
                        ALLAOUA CERAM
                    </div>
                    <div style={{
                        fontWeight: 'bold',
                        fontSize: '11px',
                        marginTop: '3px',
                        color: '#374151',
                        letterSpacing: '1px'
                    }}>
                        MATERIAUX DE CONSTRUCTION
                    </div>
                    <div style={{
                        marginTop: '10px',
                        fontSize: '9px',
                        lineHeight: '1.5',
                        color: '#4b5563',
                        borderLeft: '3px solid #b91c1c',
                        paddingLeft: '8px'
                    }}>
                        <p style={{ margin: '2px 0' }}>ZONE D'ACTIVITE -OEB-</p>
                        <p style={{ margin: '2px 0', fontWeight: 'bold' }}>Tél: 0660 46 88 94 - 0772 61 11 26</p>
                    </div>
                </div>

                {/* Center: Legal Info - Hidden for BL */}
                {showLegalInfo && (
                    <div style={{ width: '28%', textAlign: 'center', paddingTop: '5px' }}>
                        <div style={{
                            fontSize: '8px',
                            color: '#6b7280',
                            lineHeight: '1.8',
                            backgroundColor: '#f9fafb',
                            padding: '8px',
                            borderRadius: '4px',
                            border: '1px solid #e5e7eb'
                        }}>
                            <p style={{ margin: '0' }}><strong>RC:</strong> 04/00-0406435822</p>
                            <p style={{ margin: '0' }}><strong>NIF:</strong> 002204040643550</p>
                            <p style={{ margin: '0' }}><strong>AI:</strong> 04010492431</p>
                            <p style={{ margin: '0' }}><strong>NIS:</strong> 0024040406435</p>
                        </div>
                    </div>
                )}

                {/* Right: Document Info */}
                <div style={{
                    width: '30%',
                    textAlign: 'center',
                    border: isReturnSlip ? '3px solid #ef4444' : '3px solid #1f2937',
                    padding: '10px 12px',
                    borderRadius: '6px',
                    backgroundColor: isReturnSlip ? '#fee2e2' : '#f9fafb'
                }}>
                    <h2 style={{
                        fontWeight: '800',
                        fontSize: '14px',
                        margin: '0 0 8px 0',
                        color: isReturnSlip ? '#b91c1c' : '#1f2937',
                        letterSpacing: '0.5px'
                    }}>
                        {titleMap[type]}
                    </h2>
                    <p style={{ margin: '4px 0', fontSize: '13px' }}>
                        N°: <strong style={{ color: '#b91c1c', fontSize: '14px' }}>{data.number}</strong>
                    </p>
                    <p style={{ margin: '4px 0', fontSize: '10px', color: '#4b5563' }}>
                        Le: <strong>{new Date(data.date).toLocaleDateString('fr-DZ')}</strong>
                        {data.time && <span> à <strong>{data.time}</strong></span>}
                    </p>
                    {data.createdBy && (
                        <p style={{ margin: '4px 0', fontSize: '14px', color: '#000' }}>
                            Établie par: <strong>{data.createdBy}</strong>
                        </p>
                    )}
                </div>
            </div>

            {/* --- CLIENT / SUPPLIER BOX --- */}
            <div style={{
                marginBottom: '15px',
                border: '2px solid #374151',
                padding: '12px 15px',
                borderRadius: '6px',
                backgroundColor: '#fefce8',
            }}>
                <div style={{ display: 'flex', marginBottom: '6px', alignItems: 'baseline' }}>
                    <span style={{ fontWeight: 'bold', width: '70px', fontSize: '9px', color: '#4b5563' }}>POUR:</span>
                    <span style={{
                        textTransform: 'uppercase',
                        fontWeight: 'bold',
                        fontSize: '14px',
                        color: '#1f2937'
                    }}>
                        {data.clientName || 'CLIENT PASSAGER'}
                    </span>
                </div>
                {data.clientAddress && (
                    <div style={{ display: 'flex', marginBottom: '4px', alignItems: 'baseline' }}>
                        <span style={{ fontWeight: 'bold', width: '70px', fontSize: '9px', color: '#4b5563' }}>ADRESSE:</span>
                        <span style={{ fontSize: '10px' }}>{data.clientAddress}</span>
                    </div>
                )}
                {data.clientPhone && (
                    <div style={{ display: 'flex', alignItems: 'baseline' }}>
                        <span style={{ fontWeight: 'bold', width: '70px', fontSize: '9px', color: '#4b5563' }}>TEL:</span>
                        <span style={{ fontSize: '10px', fontWeight: 'bold' }}>{data.clientPhone}</span>
                    </div>
                )}
            </div>

            {/* --- ITEMS TABLE --- */}
            <table style={{
                width: '100%',
                borderCollapse: 'collapse',
                marginBottom: '15px',
                fontSize: '9px',
                border: '2px solid #374151'
            }}>
                <thead>
                    <tr>
                        <th style={{ ...headerCellStyle, width: '25px' }}>N°</th>
                        <th style={{ ...headerCellStyle, width: '70px', textAlign: 'left' }}>Référence</th>
                        <th style={{ ...headerCellStyle, textAlign: 'left' }}>Désignation</th>
                        <th style={{ ...headerCellStyle, width: '55px', textAlign: 'left' }}>Marque</th>
                        <th style={{ ...headerCellStyle, width: '40px' }}>Palette</th>
                        <th style={{ ...headerCellStyle, width: '40px' }}>Colis</th>
                        <th style={{ ...headerCellStyle, width: '45px' }}>Qté</th>
                        <th style={{ ...headerCellStyle, width: '30px' }}>Unité</th>
                        {showPrices && <th style={{ ...headerCellStyle, width: '60px', textAlign: 'right' }}>Prix U.</th>}
                        {showPrices && <th style={{ ...headerCellStyle, width: '70px', textAlign: 'right' }}>Total</th>}
                    </tr>
                </thead>
                <tbody>
                    {data.items.map((item, index) => (
                        <tr key={index} style={{ backgroundColor: index % 2 === 0 ? '#ffffff' : '#f9fafb' }}>
                            <td style={{ ...cellStyle, textAlign: 'center', fontWeight: 'bold', color: '#6b7280' }}>{index + 1}</td>
                            <td style={{ ...cellStyle, fontSize: '8px', color: '#4b5563' }}>{item.productCode || '-'}</td>
                            <td style={cellStyle}>
                                <div style={{ fontWeight: '500' }}>{item.productName}</div>
                                {(item.piecesPerCarton || item.cartonsPerPalette) && (
                                    <div style={{ fontSize: '7px', color: '#6b7280', marginTop: '2px' }}>
                                        {item.piecesPerCarton ? `${item.piecesPerCarton} pcs/ctn` : ''}
                                        {item.piecesPerCarton && item.cartonsPerPalette ? ' • ' : ''}
                                        {item.cartonsPerPalette ? `${item.cartonsPerPalette} ctn/pal` : ''}
                                    </div>
                                )}
                            </td>
                            <td style={{ ...cellStyle, fontSize: '8px', color: '#6b7280' }}>{item.brandName ?? '-'}</td>
                            <td style={{ ...cellStyle, textAlign: 'center', fontWeight: 'bold', color: '#7c3aed' }}>{item.palletCount != null ? parseFloat(Number(item.palletCount).toFixed(2)) : '-'}</td>
                            <td style={{ ...cellStyle, textAlign: 'center', fontWeight: 'bold', color: '#0891b2' }}>{item.boxCount != null ? parseFloat(Number(item.boxCount).toFixed(2)) : '-'}</td>
                            <td style={{ ...cellStyle, textAlign: 'center', fontWeight: 'bold', fontSize: '11px', backgroundColor: '#dbeafe' }}>{Number(item.quantity || 0).toFixed(2)}</td>
                            <td style={{ ...cellStyle, textAlign: 'center', fontSize: '8px' }}>{item.unitCode}</td>
                            {showPrices && <td style={{ ...cellStyle, textAlign: 'right', fontFamily: 'monospace' }}>{formatCurrency(item.unitPrice)}</td>}
                            {showPrices && <td style={{ ...cellStyle, textAlign: 'right', fontWeight: 'bold', fontFamily: 'monospace', backgroundColor: '#f0fdf4' }}>{formatCurrency(item.lineTotal)}</td>}
                        </tr>
                    ))}
                    {/* Empty rows to fill space */}
                    {data.items.length < 10 && Array.from({ length: Math.min(10 - data.items.length, 5) }).map((_, i) => (
                        <tr key={`empty-${i}`}>
                            <td style={{ ...cellStyle, height: '18px' }}>&nbsp;</td>
                            <td style={cellStyle}>&nbsp;</td>
                            <td style={cellStyle}>&nbsp;</td>
                            <td style={cellStyle}>&nbsp;</td>
                            <td style={cellStyle}>&nbsp;</td>
                            <td style={cellStyle}>&nbsp;</td>
                            <td style={cellStyle}>&nbsp;</td>
                            <td style={cellStyle}>&nbsp;</td>
                            {showPrices && <td style={cellStyle}>&nbsp;</td>}
                            {showPrices && <td style={cellStyle}>&nbsp;</td>}
                        </tr>
                    ))}
                </tbody>
                {/* Totals Footer Row */}
                <tfoot>
                    <tr style={{ backgroundColor: '#e5e7eb', fontWeight: 'bold' }}>
                        <td colSpan={4} style={{ ...cellStyle, textAlign: 'right', fontSize: '9px' }}>
                            TOTAL ARTICLES: {data.items.length}
                        </td>
                        <td style={{ ...cellStyle, textAlign: 'center', backgroundColor: '#ede9fe', color: '#7c3aed' }}>{parseFloat(totalPallets.toFixed(2))}</td>
                        <td style={{ ...cellStyle, textAlign: 'center', backgroundColor: '#cffafe', color: '#0891b2', fontWeight: 'bold' }}>{parseFloat(totalBoxes.toFixed(2))}</td>
                        <td style={{ ...cellStyle, textAlign: 'center', backgroundColor: '#bfdbfe', fontSize: '10px' }}>
                            {/* Only show raw total if all items use same unit - otherwise it's meaningless */}
                            {!hasMixedUnits && <div>{totalQty.toFixed(2)}</div>}
                            {/* Show meaningful converted totals */}
                            {totalPcs > 0 && <div style={{ fontSize: '9px', color: '#7c3aed', fontWeight: 'bold' }}>≈ {totalPcs.toFixed(0)} pcs</div>}
                            {totalSqm > 0 && <div style={{ fontSize: '9px', color: '#0369a1', fontWeight: 'bold' }}>≈ {totalSqm.toFixed(2)} m²</div>}
                        </td>
                        <td style={cellStyle}>&nbsp;</td>
                        {showPrices && <td style={cellStyle}>&nbsp;</td>}
                        {showPrices && <td style={{ ...cellStyle, textAlign: 'right', fontSize: '10px', backgroundColor: '#dcfce7' }}>{formatCurrency(totalHT)}</td>}
                    </tr>
                </tfoot>
            </table>

            {/* --- FOOTERS (CONDITIONAL) --- */}

            {/* 1. LOADING SLIP FOOTER (Signatures) */}
            {isLoadingSlip && (
                <div style={{ marginTop: '20px' }}>
                    {/* Transport Info */}
                    <div style={{
                        border: '2px solid #374151',
                        padding: '12px',
                        marginBottom: '15px',
                        borderRadius: '6px',
                        backgroundColor: '#f0f9ff'
                    }}>
                        <p style={{ fontWeight: 'bold', marginBottom: '10px', fontSize: '10px', color: '#0369a1' }}>📦 INFORMATIONS TRANSPORT:</p>
                        <div style={{ display: 'flex', gap: '40px', fontSize: '11px' }}>
                            <p style={{ margin: 0 }}>Chauffeur: <strong style={{ borderBottom: '1px dotted #000', paddingBottom: '2px', minWidth: '120px', display: 'inline-block' }}>{data.driverName || ''}</strong></p>
                            <p style={{ margin: 0 }}>Matricule: <strong style={{ borderBottom: '1px dotted #000', paddingBottom: '2px', minWidth: '100px', display: 'inline-block' }}>{data.vehiclePlate || ''}</strong></p>
                        </div>
                    </div>

                    {/* Signature Boxes */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px' }}>
                        {['Etabli par', 'PREPARATEUR', 'SERVICE CONTROLE', 'CLIENT'].map((label, i) => (
                            <div key={i} style={{
                                border: '2px solid #374151',
                                padding: '8px',
                                height: '90px',
                                textAlign: 'center',
                                borderRadius: '4px',
                                backgroundColor: i === 0 ? '#fef3c7' : '#fff'
                            }}>
                                <p style={{ fontWeight: 'bold', textDecoration: 'underline', marginBottom: '5px', fontSize: '11px' }}>{label}:</p>
                                {i === 0 && <p style={{ marginTop: '25px', fontWeight: 'bold', fontSize: '13px' }}>{data.createdBy || ''}</p>}
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* 2. DELIVERY / PURCHASE FOOTER (Financials) */}
            {showPrices && (
                <div style={{ display: 'flex', gap: '15px' }}>
                    {/* Left: Signatures & Text */}
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                        {/* Amount in words */}
                        <div style={{
                            border: '2px solid #374151',
                            padding: '10px',
                            minHeight: '50px',
                            borderRadius: '4px',
                            backgroundColor: '#fffbeb'
                        }}>
                            <p style={{ fontWeight: 'bold', fontSize: '9px', marginBottom: '5px', color: '#92400e' }}>
                                ✍️ Arrêté la présente facture à la somme de :
                            </p>
                            <p style={{ fontStyle: 'italic', color: '#1f2937', fontSize: '9px', fontWeight: 500 }}>
                                {numberToFrenchWords(totalNet)}
                            </p>
                        </div>

                        {/* Driver info for Delivery Note */}
                        {type === 'DELIVERY_NOTE' && (
                            <div style={{
                                border: '2px solid #374151',
                                padding: '8px',
                                marginTop: '10px',
                                fontSize: '10px',
                                borderRadius: '4px',
                                backgroundColor: '#f0f9ff'
                            }}>
                                <div style={{ display: 'flex', gap: '25px' }}>
                                    <span>Chauffeur: <strong>{data.driverName || '______________'}</strong></span>
                                    <span>Matricule: <strong>{data.vehiclePlate || '______________'}</strong></span>
                                </div>
                            </div>
                        )}

                        {/* Signature Boxes */}
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginTop: '10px' }}>
                            <div style={{ border: '2px solid #374151', padding: '8px', height: '70px', textAlign: 'center', borderRadius: '4px' }}>
                                <p style={{ fontWeight: 'bold', fontSize: '9px', marginBottom: '5px' }}>CACHE & SIGNATURE</p>
                            </div>
                            <div style={{ border: '2px solid #374151', padding: '8px', height: '70px', textAlign: 'center', borderRadius: '4px' }}>
                                <p style={{ fontWeight: 'bold', fontSize: '9px', marginBottom: '5px' }}>CLIENT</p>
                            </div>
                        </div>
                    </div>

                    {/* Right: Totals - Larger for BL */}
                    <div style={{ width: isBL ? '320px' : '200px' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', border: '2px solid #374151', borderRadius: '6px', overflow: 'hidden' }}>
                            <tbody>
                                {/* Financial details - Hidden for BL */}
                                {showFinancialDetails && (
                                    <>
                                        <tr>
                                            <td style={{ ...cellStyle, fontWeight: 'bold', fontSize: '9px', backgroundColor: '#f3f4f6' }}>Total HT</td>
                                            <td style={{ ...cellStyle, textAlign: 'right', fontFamily: 'monospace', fontSize: '10px' }}>{formatCurrency(totalHT)}</td>
                                        </tr>
                                        <tr>
                                            <td style={{ ...cellStyle, fontSize: '9px' }}>TVA</td>
                                            <td style={{ ...cellStyle, textAlign: 'right', fontFamily: 'monospace' }}>{formatCurrency(totalTVA)}</td>
                                        </tr>
                                        <tr>
                                            <td style={{ ...cellStyle, fontSize: '9px' }}>Timbre</td>
                                            <td style={{ ...cellStyle, textAlign: 'right', fontFamily: 'monospace' }}>{formatCurrency(timbre)}</td>
                                        </tr>
                                        <tr>
                                            <td style={{ ...cellStyle, fontSize: '9px' }}>Remise</td>
                                            <td style={{ ...cellStyle, textAlign: 'right', fontFamily: 'monospace', color: '#dc2626' }}>-{formatCurrency(discount)}</td>
                                        </tr>
                                    </>
                                )}
                                {delivery > 0 && (
                                    <tr>
                                        <td style={{ ...cellStyle, fontSize: '9px' }}>Livraison</td>
                                        <td style={{ ...cellStyle, textAlign: 'right', fontFamily: 'monospace' }}>+{formatCurrency(delivery)}</td>
                                    </tr>
                                )}
                                <tr style={{ backgroundColor: '#1f2937' }}>
                                    <td style={{ ...cellStyle, fontWeight: 'bold', fontSize: isBL ? '12px' : '10px', color: 'white' }}>Total TTC</td>
                                    <td style={{ ...cellStyle, textAlign: 'right', fontWeight: 'bold', fontFamily: 'monospace', fontSize: isBL ? '14px' : '11px', color: '#fef08a' }}>{formatCurrency(totalNet)}</td>
                                </tr>

                                {/* Payment & Balance Section (Only for Delivery Note, NOT for BSS) */}
                                {showBalance && (
                                    <>
                                        <tr>
                                            <td style={{ ...cellStyle, fontSize: '11px', backgroundColor: '#dcfce7' }}>Versement</td>
                                            <td style={{ ...cellStyle, textAlign: 'right', fontFamily: 'monospace', fontSize: '12px', color: '#16a34a', fontWeight: 'bold' }}>{formatCurrency(payment)}</td>
                                        </tr>
                                        <tr>
                                            <td style={{ ...cellStyle, fontWeight: 'bold', fontSize: '11px', backgroundColor: '#fee2e2' }}>Reste</td>
                                            <td style={{ ...cellStyle, textAlign: 'right', fontWeight: 'bold', fontFamily: 'monospace', fontSize: '13px', color: reste > 0 ? '#dc2626' : '#16a34a' }}>{formatCurrency(reste)}</td>
                                        </tr>
                                        <tr>
                                            <td style={{ ...cellStyle, fontSize: '10px', color: '#6b7280' }}>Ancien Solde</td>
                                            <td style={{ ...cellStyle, textAlign: 'right', fontFamily: 'monospace', fontSize: '11px', color: '#6b7280' }}>{formatCurrency(oldBalance)}</td>
                                        </tr>
                                        <tr style={{ backgroundColor: '#7c3aed' }}>
                                            <td style={{ ...cellStyle, fontWeight: 'bold', fontSize: '11px', color: 'white' }}>NOUVEAU SOLDE</td>
                                            <td style={{ ...cellStyle, textAlign: 'right', fontWeight: 'bold', fontFamily: 'monospace', fontSize: '14px', color: newBalance > 0 ? '#fca5a5' : '#86efac' }}>{formatCurrency(newBalance)}</td>
                                        </tr>
                                    </>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* Footer - Page Info */}
            <div style={{
                position: 'absolute',
                bottom: '10mm',
                left: '12mm',
                right: '12mm',
                textAlign: 'center',
                fontSize: '8px',
                color: '#9ca3af',
                borderTop: '1px solid #e5e7eb',
                paddingTop: '5px'
            }}>
                ALLAOUA CERAM - Document officiel
            </div>
        </div>
    );
});

StandardDocument.displayName = 'StandardDocument';
