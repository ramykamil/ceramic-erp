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
        console.log("--- Fetching Old Products (< Feb 1, 2026) ---");
        const result = await pool.query(`
            SELECT 
                p.ProductID, 
                p.ProductCode, 
                p.ProductName, 
                b.BrandName,
                p.CreatedAt
            FROM Products p
            LEFT JOIN Brands b ON p.BrandID = b.BrandID
            WHERE p.CreatedAt < '2026-02-01' AND p.IsActive = true
            ORDER BY p.ProductID ASC
        `);

        const oldProducts = result.rows;
        console.log(`Found ${oldProducts.length} active old products.`);

        const productsToKeep = [];
        const productsToDelete = [];

        for (const prod of oldProducts) {
            // We check the product name, and also the brand name just in case the family name is stored there
            const nameMatch = shouldKeepProduct(prod.productname);
            const brandMatch = shouldKeepProduct(prod.brandname);
            const refMatch = shouldKeepProduct(prod.productcode);

            if (nameMatch || brandMatch || refMatch) {
                productsToKeep.push(prod);
            } else {
                productsToDelete.push(prod);
            }
        }

        console.log(`\n--- Filtering Results ---`);
        console.log(`✅ MATCHED KEEP LIST (Protected): ${productsToKeep.length}`);
        console.log(`❌ SAFE TO DELETE (Unprotected): ${productsToDelete.length}`);

        if (productsToDelete.length > 0) {
            const newWorkbook = xlsx.utils.book_new();

            // Sheet 1: Safe to delete
            const wsDelete = xlsx.utils.json_to_sheet(productsToDelete.map(p => ({
                "ID Produit": p.productid,
                "Reference": p.productcode,
                "Nom": p.productname,
                "Marque/Famille": p.brandname,
                "Date Création": p.createdat
            })));
            wsDelete['!cols'] = [{ wch: 10 }, { wch: 30 }, { wch: 50 }, { wch: 25 }, { wch: 25 }];
            xlsx.utils.book_append_sheet(newWorkbook, wsDelete, "À SUPPRIMER (Safe)");

            // Sheet 2: Protected
            const wsKeep = xlsx.utils.json_to_sheet(productsToKeep.map(p => ({
                "ID Produit": p.productid,
                "Reference": p.productcode,
                "Nom": p.productname,
                "Marque/Famille": p.brandname,
                "Date Création": p.createdat
            })));
            wsKeep['!cols'] = [{ wch: 10 }, { wch: 30 }, { wch: 50 }, { wch: 25 }, { wch: 25 }];
            xlsx.utils.book_append_sheet(newWorkbook, wsKeep, "CONSERVÉS (Keep List)");

            const outputPath = path.resolve(__dirname, `../Anciens_Produits_Filtres.xlsx`);
            xlsx.writeFile(newWorkbook, outputPath);

            console.log(`\n✅ Generated filtered Excel report at:\n${outputPath}`);
        }

    } catch (e) {
        console.error(e);
    } finally {
        pool.end();
    }
}
main();
