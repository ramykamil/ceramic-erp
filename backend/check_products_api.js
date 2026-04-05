const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    password: process.env.DB_PASSWORD,
    port: process.env.DB_PORT,
});

async function check() {
    const client = await pool.connect();
    try {
        // Simulate the query used in product.controller.js
        let query = `
      SELECT 
        mvc.ProductID, mvc.ProductCode, mvc.ProductName,
        mvc.Famille, mvc.PrixVente, mvc.PrixAchat,
        mvc.Calibre, mvc.Choix, mvc.QteParColis, mvc.QteColisParPalette, mvc.Size,
        COALESCE(inv.RealTotalQty, 0) as TotalQty, 
        COALESCE(inv.RealNbPalette, 0) as NbPalette, 
        COALESCE(inv.RealNbColis, 0) as NbColis,
        mvc.DerivedPiecesPerColis, mvc.DerivedColisPerPalette,
        COUNT(*) OVER() as TotalCount
      FROM mv_Catalogue mvc
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
      LIMIT 1
    `;
        const res = await client.query(query);
        console.log('First Product Keys:', Object.keys(res.rows[0]));
        console.log('First Product Sample:', res.rows[0]);
    } catch (err) {
        console.error(err);
    } finally {
        client.release();
        pool.end();
    }
}

check();
