require('dotenv').config();
const xlsx = require('xlsx');
const { Pool } = require('pg');
const path = require('path');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

async function main() {
    try {
        console.log('--- Loading Original Excel File ---');
        const filePath = path.resolve(__dirname, '../Table Produit NOUVEAUX.xls');
        const workbook = xlsx.readFile(filePath);
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const rawData = xlsx.utils.sheet_to_json(worksheet, { defval: null });
        console.log(`Loaded ${rawData.length} rows from Excel.\n`);

        const client = await pool.connect();

        console.log('--- Loading Database Inventory ---');
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
            WHERE p.IsActive = true
            GROUP BY p.ProductID, p.ProductCode, p.ProductName
        `;
        const dbProductsResult = await client.query(dbQuery);
        const dbProducts = dbProductsResult.rows;
        console.log(`Loaded ${dbProducts.length} active products from Online Database.\n`);

        const dbByCode = new Map();
        const dbByName = new Map();
        dbProducts.forEach(p => {
            if (p.productcode) dbByCode.set(p.productcode.trim().toUpperCase(), p);
            if (p.productname) dbByName.set(p.productname.trim().toUpperCase(), p);
        });

        const proofData = [];

        console.log('--- Comparing and Generating Proof File ---');

        for (const row of rawData) {
            const excelCode = row['Reference']?.toString().trim().toUpperCase() || '';
            const excelName = row['Libellé']?.toString().trim().toUpperCase() || '';
            const excelQty = parseFloat(row['Qté']) || 0;
            const excelPallets = parseFloat(row['NB PALETTE']) || 0;
            const excelColis = parseFloat(row['NB COLIS']) || 0;

            let dbProduct = null;
            let nameMatches = dbProducts.filter(p => p.productname && p.productname.trim().toUpperCase() === excelName);
            if (nameMatches.length === 1) {
                dbProduct = nameMatches[0];
            } else if (nameMatches.length > 1) {
                // If multiple products have the same name, use the one with the correct code
                dbProduct = nameMatches.find(p => p.productcode && p.productcode.trim().toUpperCase() === excelCode);
                if (!dbProduct) dbProduct = nameMatches[0]; // fallback
            } else {
                dbProduct = dbByCode.get(excelCode);
            }

            if (!dbProduct) {
                continue; // Skip products not in DB, focus on the matching ones
            }

            const dbQty = parseFloat(dbProduct.totalqty);
            const dbPallets = parseFloat(dbProduct.totalpallets);
            const dbColis = parseFloat(dbProduct.totalcolis);

            const qtyMatches = Math.abs(excelQty - dbQty) <= 0.01;
            const palletsMatch = Math.abs(excelPallets - dbPallets) <= 0.01;
            const colisMatch = Math.abs(excelColis - dbColis) <= 0.01;

            const allMatch = qtyMatches && palletsMatch && colisMatch;

            proofData.push({
                "Référence": excelCode,
                "Libellé (Nom du Produit)": excelName,
                "Quantité Excel Original": excelQty.toFixed(2),
                "Quantité Base de Données": dbQty.toFixed(2),
                "Palettes Excel": excelPallets.toFixed(2),
                "Palettes Base de Données": dbPallets.toFixed(2),
                "Colis Excel": excelColis.toFixed(2),
                "Colis Base de Données": dbColis.toFixed(2),
                "Statut Correspondance": allMatch ? "✅ MATCH PARFAIT" : "❌ DIFFÉRENCE",
            });
        }

        client.release();
        pool.end();

        // Create new Excel workbook
        const newWorkbook = xlsx.utils.book_new();
        const newWorksheet = xlsx.utils.json_to_sheet(proofData);

        // Auto-size columns slightly
        const wscols = [
            { wch: 20 }, // Reference
            { wch: 40 }, // Name
            { wch: 25 }, // Qty Excel
            { wch: 25 }, // Qty DB
            { wch: 15 }, // Pallets Excel
            { wch: 25 }, // Pallets DB
            { wch: 15 }, // Colis Excel
            { wch: 25 }, // Colis DB
            { wch: 25 }  // Status
        ];
        newWorksheet['!cols'] = wscols;

        xlsx.utils.book_append_sheet(newWorkbook, newWorksheet, "Vérification Quantités");

        const outputPath = path.resolve(__dirname, `../Verification_Quantites_Match_${Date.now()}.xlsx`);
        xlsx.writeFile(newWorkbook, outputPath);

        console.log(`✅ Proof Excel file generated successfully at:\n${outputPath}`);

    } catch (err) {
        console.error('Error generating proof file:', err);
        pool.end();
    }
}

main();
