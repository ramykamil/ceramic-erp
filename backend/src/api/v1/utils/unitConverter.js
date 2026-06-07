/**
 * Utility helper to parse sqm per piece from dimensions/product name
 */
const parseSqmPerPiece = (str) => {
  if (!str) return 0;
  const match = str.match(/(\d{2,3})\s*[xX*\/]\s*(\d{2,3})/);
  if (match) {
    return (parseInt(match[1]) * parseInt(match[2])) / 10000; // cm*cm / 10000 = m2
  }
  return 0;
};

/**
 * Universal unit conversion logic to convert product quantity to primary unit
 */
const convertUnitToInventory = (qty, cartUnitCode, primaryUnitCode, sqmPerPiece, qteParColis = 0, cartonsPerPalette = 0) => {
  const q = parseFloat(qty) || 0;
  const unitCode = (cartUnitCode || '').toUpperCase();
  const primUnitCode = (primaryUnitCode || '').toUpperCase();

  if (!unitCode || !primUnitCode || unitCode === primUnitCode) return q;

  let piecesQty = q;
  
  // 1. Convert from cartUnit to PCS (Base)
  if (unitCode === 'SQM' && sqmPerPiece > 0) {
    piecesQty = q / sqmPerPiece;
  } else if (unitCode === 'CARTON' || unitCode === 'CRT' || unitCode === 'COLIS') {
    piecesQty = qteParColis > 0 ? q * qteParColis : q;
  } else if (unitCode === 'PALETTE' || unitCode === 'PAL') {
    piecesQty = q * (qteParColis || 1) * (cartonsPerPalette || 1);
  }

  // 2. Convert from PCS (Base) to primaryUnit
  if (primUnitCode === 'SQM') {
    if ((unitCode === 'CARTON' || unitCode === 'CRT' || unitCode === 'COLIS') && qteParColis > 0 && sqmPerPiece > 0) {
      const isMultiple = Math.abs(qteParColis / sqmPerPiece - Math.round(qteParColis / sqmPerPiece)) < 0.01;
      if (!isMultiple) return q * qteParColis; // Return SQM directly
    }
    return sqmPerPiece > 0 ? piecesQty * sqmPerPiece : piecesQty;
  }
  
  if (primUnitCode === 'CARTON' || primUnitCode === 'CRT' || primUnitCode === 'COLIS') {
    return qteParColis > 0 ? piecesQty / qteParColis : piecesQty;
  }

  return piecesQty; // PCS
};

/**
 * Convert quantity to stock unit using product info object
 */
const convertToStockUnit = (quantity, unitCode, productInfo) => {
  const sqmPerPiece = parseSqmPerPiece(productInfo.size || productInfo.productname);
  return convertUnitToInventory(
    quantity,
    unitCode,
    productInfo.primaryunitcode || productInfo.primaryUnitCode,
    sqmPerPiece,
    parseFloat(productInfo.qteparcolis) || 0,
    parseFloat(productInfo.qtecolisparpalette) || 0
  );
};

module.exports = {
  parseSqmPerPiece,
  convertUnitToInventory,
  convertToStockUnit
};
