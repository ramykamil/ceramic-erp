const parseSqmPerPiece = (str) => {
    if (!str) return 0;
    const match = str.match(/(\d{2,3})\s*[xX*\/]\s*(\d{2,3})/);
    if (match) return (parseInt(match[1]) * parseInt(match[2])) / 10000;
    return 0;
};
const convertUnitToInventory = (qty, cartUnitCode, primaryUnitCode, sqmPerPiece, productName) => {
    let finalQty = parseFloat(qty) || 0;
    const isFicheProduct = (productName || '').toLowerCase().startsWith('fiche');
    if (isFicheProduct || sqmPerPiece <= 0) return finalQty;

    const isCartPcs = (cartUnitCode === 'PCS' || cartUnitCode === 'PIECE');
    const isCartSqm = (cartUnitCode === 'SQM' || cartUnitCode === 'M2');

    const isPrimaryPcs = (primaryUnitCode === 'PCS' || primaryUnitCode === 'PIECE' || !primaryUnitCode);
    const isPrimarySqm = (primaryUnitCode === 'SQM' || primaryUnitCode === 'M2');

    console.log({ cartUnitCode, primaryUnitCode, sqmPerPiece, isCartPcs, isCartSqm, isPrimaryPcs, isPrimarySqm, finalQty });
    if (isCartSqm && isPrimaryPcs) {
        return finalQty / sqmPerPiece;
    }
    else if (isCartPcs && isPrimarySqm) {
        return finalQty * sqmPerPiece;
    }
    return finalQty;
};

const sqmPerPiece = parseSqmPerPiece('ARIZONA PERLA 20/75');
console.log('Result SQM->PCS:', convertUnitToInventory(153.60, 'SQM', 'PCS', sqmPerPiece, 'ARIZONA PERLA 20/75'));
