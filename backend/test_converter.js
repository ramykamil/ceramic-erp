const convertUnitToInventory = (qty, cartUnitCode, primaryUnitCode, sqmPerPiece, productName) => {
    let finalQty = parseFloat(qty) || 0;
    const isFicheProduct = (productName || '').toLowerCase().startsWith('fiche');
    if (isFicheProduct || sqmPerPiece <= 0) return finalQty;

    const isCartPcs = (cartUnitCode === 'PCS' || cartUnitCode === 'PIECE');
    const isCartSqm = (cartUnitCode === 'SQM' || cartUnitCode === 'M2');

    const isPrimaryPcs = (primaryUnitCode === 'PCS' || primaryUnitCode === 'PIECE');
    const isPrimarySqm = (primaryUnitCode === 'SQM' || primaryUnitCode === 'M2') || (!primaryUnitCode && sqmPerPiece > 0);

    console.log(`Units inside converter: isCartSqm=${isCartSqm}, isCartPcs=${isCartPcs}, isPrimaryPcs=${isPrimaryPcs}, isPrimarySqm=${isPrimarySqm}`);

    if (isCartSqm && isPrimaryPcs) {
        return finalQty / sqmPerPiece;
    }
    else if (isCartPcs && isPrimarySqm) {
        return finalQty * sqmPerPiece;
    }

    return finalQty;
};

console.log('Test SQM Cartesian cart to PCS inventory:', convertUnitToInventory(103.68, 'SQM', 'PCS', 0.15, 'ARIZONA CAPPUCCINO REC 20/75'));
