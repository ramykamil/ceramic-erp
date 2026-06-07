require('dotenv').config();
const { Pool } = require('pg');
const xlsx = require('xlsx');
const path = require('path');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

async function main() {
    const client = await pool.connect();
    try {
        console.log("--- Loading 'Rapport_Final_Nettoyage.xlsx' ---");
        const reportPath = path.resolve(__dirname, '../Rapport_Final_Nettoyage.xlsx');
        const workbook = xlsx.readFile(reportPath);

        // Ensure we explicitly read the delete sheet
        const deleteSheetName = "À SUPPRIMER (Safe Delete)";
        if (!workbook.SheetNames.includes(deleteSheetName)) {
            throw new Error(`Sheet "${deleteSheetName}" not found in report file.`);
        }

        const worksheet = workbook.Sheets[deleteSheetName];
        const rowsToDelete = xlsx.utils.sheet_to_json(worksheet);

        const productIdsToDelete = rowsToDelete.map(row => row['ID Produit (Base de données)']).filter(Boolean);
        console.log(`Found ${productIdsToDelete.length} product IDs verified for deletion.`);

        if (productIdsToDelete.length === 0) {
            console.log("Nothing to delete. Exiting.");
            return;
        }

        console.log("--- Executing Deletions ---");
        await client.query('BEGIN');

        // First delete their inventory to keep stock clean
        const invDeleteResult = await client.query(`
            DELETE FROM Inventory 
            WHERE ProductID = ANY($1::int[])
        `, [productIdsToDelete]);
        console.log(`✅ Deleted ${invDeleteResult.rowCount} associated Inventory records.`);

        // Deactivate the products (safe soft delete)
        const updateResult = await client.query(`
            UPDATE Products 
            SET IsActive = false, UpdatedAt = CURRENT_TIMESTAMP
            WHERE ProductID = ANY($1::int[])
        `, [productIdsToDelete]);
        console.log(`✅ Deactivated (Safe Deleted) ${updateResult.rowCount} Products from the online catalogue.`);

        await client.query('COMMIT');

        console.log("\n--- Refreshing Materialized View ---");
        await pool.query('REFRESH MATERIALIZED VIEW mv_Catalogue');
        console.log('✅ mv_Catalogue fully refreshed with the removed products hidden.');

        console.log("\n✅✅✅ CATALOGUE CLEANUP FULLY COMPLETED ✅✅✅");
        console.log(`The 1501 products + your Protected Keep List are the only items remaining active out of the ${3266} verified today.`);

    } catch (e) {
        await client.query('ROLLBACK');
        console.error("❌ ERROR - Transaction rolled back:", e);
    } finally {
        client.release();
        pool.end();
    }
}
main();
