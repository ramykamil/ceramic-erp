require('dotenv').config();
const xlsx = require('xlsx');
const { Pool } = require('pg');
const path = require('path');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

const normalize = (str) => {
    if (!str) return '';
    return str.toString().toLowerCase().replace(/\s+/g, '').trim();
};

async function checkRemaining() {
    const client = await pool.connect();
    try {
        const filePath = path.resolve(__dirname, '../Table Produit NOUVEAUX.xls');
        const workbook = xlsx.readFile(filePath);
        const sheetName = workbook.SheetNames[0];
        const rawData = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: null });

        const dbQuery = `
            SELECT 
                p.ProductID, 
                p.ProductCode, 
                p.ProductName, 
                COALESCE(SUM(i.QuantityOnHand), 0) as TotalQty,
                COALESCE(SUM(i.PalletCount), 0) as TotalPallets,
                COALESCE(SUM(i.ColisCount), 0) as TotalColis
            FROM Products p
            LEFT JOIN Inventory i ON p.ProductID = i.ProductID
            GROUP BY p.ProductID, p.ProductCode, p.ProductName
        `;
        // Removed IsActive = true to see if they were inserted as inactive by mistake
        const dbProductsResult = await client.query(dbQuery);
        const dbProducts = dbProductsResult.rows;

        const dbByCode = new Map();
        const dbByName = new Map();
        const dbByCodeNorm = new Map();
        const dbByNameNorm = new Map();

        dbProducts.forEach(p => {
            if (p.productcode) {
                dbByCode.set(p.productcode.trim().toUpperCase(), p);
                dbByCodeNorm.set(normalize(p.productcode), p);
            }
            if (p.productname) {
                dbByName.set(p.productname.trim().toUpperCase(), p);
                dbByNameNorm.set(normalize(p.productname), p);
            }
        });

        let mismatched = [];

        for (const row of rawData) {
            const excelCode = row['Reference']?.toString().trim() || '';
            const excelName = row['Libellé']?.toString().trim() || '';
            const excelQty = parseFloat(row['Qté']) || 0;
            const excelPallets = parseFloat(row['NB PALETTE']) || 0;
            const excelColis = parseFloat(row['NB COLIS']) || 0;

            const upperExcCode = excelCode.toUpperCase();
            const upperExcName = excelName.toUpperCase();
            const normExcCode = normalize(excelCode);
            const normExcName = normalize(excelName);

            let dbProduct = dbByCode.get(upperExcCode);
            if (!dbProduct && excelName) dbProduct = dbByName.get(upperExcName);
            if (!dbProduct) dbProduct = dbByCodeNorm.get(normExcCode) || dbByNameNorm.get(normExcName);

            if (!dbProduct) {
                mismatched.push(`MISSING ENTIRELY: [${excelCode}] ${excelName}`);
                continue;
            }

            const dbQty = parseFloat(dbProduct.totalqty);
            const dbPallets = parseFloat(dbProduct.totalpallets);
            const dbColis = parseFloat(dbProduct.totalcolis);

            const qtyOk = Math.abs(excelQty - dbQty) <= 0.01;
            const palOk = Math.abs(excelPallets - dbPallets) <= 0.01;
            const colOk = Math.abs(excelColis - dbColis) <= 0.01;

            if (!qtyOk || !palOk || !colOk) {
                mismatched.push(`MISMATCH: [${excelCode}] ${excelName} | Qty: DB=${dbQty}, Exc=${excelQty} | Pal: DB=${dbPallets}, Exc=${excelPallets} | Col: DB=${dbColis}, Exc=${excelColis}`);
            }
        }

        console.log(`Total Mismatches Found: ${mismatched.length}`);
        if (mismatched.length > 0) {
            console.log("Sample of 10:");
            mismatched.slice(0, 10).forEach(m => console.log(m));
        }

    } catch (err) {
        console.error(err);
    } finally {
        client.release();
        pool.end();
    }
}
checkRemaining();
