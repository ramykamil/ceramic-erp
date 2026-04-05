require('dotenv').config();
const { Pool } = require('pg');
const xlsx = require('xlsx');
const path = require('path');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

const KEEP_LIST = [
    "ALLAOUA CERAM",
    "ANDALOUS CERAM",
    "BELLA CERAM",
    "CERAM BOUMERDAS",
    "CERAM GLASS",
    "CERAMIQUE CHARK",
    "EL ATHMANIA",
    "ELNOURASSI",
    "F CERAM",
    "GRUPOPUMA",
    "KING",
    "NOVA CERAM",
    "OPERA CERAM",
    "SANI DECOR",
    "SCS",
    "شلغوم العيد"
];

function shouldKeepProduct(productName) {
    if (!productName) return false;
    const upperName = productName.toUpperCase();

    // Check for "FICHE" prefix
    if (upperName.startsWith('FICHE')) return true;

    // Check for "motif" prefix
    if (upperName.startsWith('MOTIF')) return true;

    // Check against families/keywords
    for (const keyword of KEEP_LIST) {
        if (upperName.includes(keyword.toUpperCase())) {
            return true;
        }
    }

    return false;
}

async function main() {
    try {
        console.log('--- Loading "New" Excel File Products (1501) ---');
        const excelPath = path.resolve(__dirname, '../Table Produit NOUVEAUX.xls');
        const workbook = xlsx.readFile(excelPath);
        const worksheet = workbook.Sheets[workbook.SheetNames[0]];
        const rawData = xlsx.utils.sheet_to_json(worksheet, { defval: null });

        const newNames = new Set(
            rawData.map(row => row['Libellé']?.toString().trim().toUpperCase()).filter(Boolean)
        );
        const newCodes = new Set(
            rawData.map(row => row['Reference']?.toString().trim().toUpperCase()).filter(Boolean)
        );
        console.log(`Loaded ${rawData.length} rows (${newNames.size} distinct product names) from Excel.\n`);

        console.log("--- Fetching All Active Products from Database ---");
        const dbResult = await pool.query(`
            SELECT 
                p.ProductID, 
                p.ProductCode, 
                p.ProductName, 
                b.BrandName,
                p.CreatedAt,
                p.UpdatedAt,
                COALESCE(SUM(i.QuantityOnHand), 0) as TotalQty
            FROM Products p
            LEFT JOIN Brands b ON p.BrandID = b.BrandID
            LEFT JOIN Inventory i ON p.ProductID = i.ProductID
            WHERE p.IsActive = true
            GROUP BY p.ProductID, p.ProductCode, p.ProductName, b.BrandName, p.CreatedAt, p.UpdatedAt
            ORDER BY p.ProductID ASC
        `);

        const allProducts = dbResult.rows;
        console.log(`Found ${allProducts.length} active products in Database.\n`);

        const productsToKeep = [];
        const productsToDelete = [];

        for (const prod of allProducts) {
            const name = (prod.productname || '').trim().toUpperCase();
            const code = (prod.productcode || '').trim().toUpperCase();

            let keepReason = null;

            // 1. Is it in the new Excel sheet?
            if (newNames.has(name) || newCodes.has(code)) {
                keepReason = "Excel File (Table Produit NOUVEAUX.xls)";
            }
            // 2. Is it protected by the Keep List?
            else if (shouldKeepProduct(prod.productname) || shouldKeepProduct(prod.brandname) || shouldKeepProduct(prod.productcode)) {
                keepReason = "Protected by Keep List (Family/Keyword)";
            }

            // Format for Excel out
            const outObj = {
                "ID Produit (Base de données)": prod.productid,
                "Reference": prod.productcode,
                "Nom (Libellé)": prod.productname,
                "Famille/Marque": prod.brandname,
                "Quantité en Stock": parseFloat(prod.totalqty),
                "Date de Création": (prod.createdat ? new Date(prod.createdat).toLocaleDateString() : ''),
            };

            if (keepReason) {
                outObj["Raison de Conservation"] = keepReason;
                productsToKeep.push(outObj);
            } else {
                productsToDelete.push(outObj);
            }
        }

        console.log(`\n--- Final Categorization Results ---`);
        console.log(`✅ TOTAL TO KEEP: ${productsToKeep.length}`);
        console.log(`❌ TOTAL TO DELETE: ${productsToDelete.length}`);

        // Output to Excel
        const newWorkbook = xlsx.utils.book_new();

        // Sheet 1: Keep
        const wsKeep = xlsx.utils.json_to_sheet(productsToKeep);
        wsKeep['!cols'] = [{ wch: 15 }, { wch: 30 }, { wch: 60 }, { wch: 30 }, { wch: 15 }, { wch: 20 }, { wch: 45 }];
        xlsx.utils.book_append_sheet(newWorkbook, wsKeep, "CONSERVÉS (Keep)");

        // Sheet 2: Delete
        const wsDelete = xlsx.utils.json_to_sheet(productsToDelete);
        wsDelete['!cols'] = [{ wch: 15 }, { wch: 30 }, { wch: 60 }, { wch: 30 }, { wch: 15 }, { wch: 20 }];
        xlsx.utils.book_append_sheet(newWorkbook, wsDelete, "À SUPPRIMER (Safe Delete)");

        const outputPath = path.resolve(__dirname, `../Rapport_Final_Nettoyage.xlsx`);
        xlsx.writeFile(newWorkbook, outputPath);

        console.log(`\n✅ Generated FINAL Cleanup Report at:\n${outputPath}`);

    } catch (e) {
        console.error(e);
    } finally {
        pool.end();
    }
}
main();
