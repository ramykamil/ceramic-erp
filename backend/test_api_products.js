require('dotenv').config();
const pool = require('./src/config/database');

async function testGetProducts() {
    const page = 1;
    const limit = 5000;
    const offset = (page - 1) * limit;

    try {
        const query = `
      SELECT 
        mvc.ProductID, mvc.ProductCode, mvc.ProductName,
        mvc.BrandID as brandid, mvc.Famille, mvc.PrixVente, mvc.PrixAchat,
        p.BasePrice, p.PurchasePrice,
        mvc.Calibre, mvc.Choix, mvc.QteParColis, mvc.QteColisParPalette, mvc.Size,
        COALESCE(inv.RealTotalQty, 0) as TotalQty, 
        COALESCE(inv.RealNbPalette, 0) as NbPalette, 
        COALESCE(inv.RealNbColis, 0) as NbColis,
        mvc.DerivedPiecesPerColis, mvc.DerivedColisPerPalette,
        COUNT(*) OVER() as TotalCount
      FROM mv_Catalogue mvc
      LEFT JOIN Products p ON mvc.ProductID = p.ProductID
      LEFT JOIN (
        SELECT 
            ProductID, 
            SUM(QuantityOnHand) as RealTotalQty, 
            SUM(PalletCount) as RealNbPalette, 
            SUM(ColisCount) as RealNbColis
        FROM Inventory
        GROUP BY ProductID
      ) inv ON mvc.ProductID = inv.ProductID
      WHERE 1=1
      ORDER BY ProductName ASC
      LIMIT $1 OFFSET $2
    `;

        const res = await pool.query(query, [limit, offset]);
        console.log(`Total rows returned: ${res.rows.length}`);

        // Check for ALMERIA
        const almeria = res.rows.filter(r => r.productname && r.productname.includes('ALMERIA GRIS REC'));
        console.log('Matches found for ALMERIA GRIS REC:', almeria.length);
        if (almeria.length > 0) {
            console.log('Sample Match:', almeria[0].productname, 'Qty:', almeria[0].totalqty);
        }
    } catch (err) {
        console.error(err);
    } finally {
        pool.end();
    }
}

testGetProducts();
