const { parseSqmPerPiece, convertUnitToInventory, convertToStockUnit } = require('./unitConverter');

describe('unitConverter utility functions', () => {
  describe('parseSqmPerPiece', () => {
    it('should parse standard size formats into square meters', () => {
      expect(parseSqmPerPiece('60x60')).toBe(0.36);
      expect(parseSqmPerPiece('30*30')).toBe(0.09);
      expect(parseSqmPerPiece('120 X 120')).toBe(1.44);
    });

    it('should return 0 for empty or invalid inputs', () => {
      expect(parseSqmPerPiece('')).toBe(0);
      expect(parseSqmPerPiece(null)).toBe(0);
      expect(parseSqmPerPiece('invalid-size')).toBe(0);
    });
  });

  describe('convertUnitToInventory', () => {
    it('should return quantity directly if units are the same', () => {
      expect(convertUnitToInventory(10, 'SQM', 'SQM', 0.36)).toBe(10);
      expect(convertUnitToInventory(15, 'PCS', 'PCS', 0)).toBe(15);
    });

    it('should convert SQM to PCS correctly', () => {
      // 1.44 SQM of 60x60 tile product (0.36 sqmPerPiece) = 4 PCS
      expect(convertUnitToInventory(1.44, 'SQM', 'PCS', 0.36)).toBe(4);
    });

    it('should convert CARTON to SQM correctly when qteParColis represents Pieces', () => {
      // 2 cartons, 4 pieces per carton, 0.25 sqm per piece = 2 * 4 * 0.25 = 2 SQM
      // 4 / 0.25 = 16 (an exact integer multiple), so it converts CARTON -> PCS -> SQM.
      expect(convertUnitToInventory(2, 'CARTON', 'SQM', 0.25, 4)).toBe(2);
    });

    it('should convert CARTON to SQM correctly when qteParColis represents SQM directly', () => {
      // 2 cartons, qteParColis = 1.44 SQM per carton directly (not a multiple of 0.2025 sqmPerPiece).
      // Math.abs(1.44 / 0.2025) = 7.11 (non-integer multiple) -> returns 2 * 1.44 = 2.88 SQM directly.
      expect(convertUnitToInventory(2, 'CARTON', 'SQM', 0.2025, 1.44)).toBe(2.88);
    });

    it('should convert PALETTE to PCS/SQM correctly', () => {
      // 1 palette, 40 cartons per palette, 8 pieces per carton = 320 PCS
      expect(convertUnitToInventory(1, 'PALETTE', 'PCS', 0.36, 8, 40)).toBe(320);
    });
  });

  describe('convertToStockUnit', () => {
    it('should convert quantity to stock unit using productInfo wrapper', () => {
      const productInfo = {
        size: '50x50', // 0.25 sqm
        primaryunitcode: 'SQM',
        qteparcolis: '4',
        qtecolisparpalette: '40'
      };
      // 2 cartons = 2 * 4 = 8 PCS = 8 * 0.25 = 2 SQM
      expect(convertToStockUnit(2, 'CARTON', productInfo)).toBe(2);
    });
  });
});
