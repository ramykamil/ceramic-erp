/**
 * Phase 1: Import Final Inventory
 * This script reads Table Produit NOUVEAUX.xls and imports the 1501 master products.
 * - If a product name exists, it ensures it's active and updates the base price / standard unit.
 * - If a product does not exist, it inserts it as a new product.
 */

require('dotenv').config();
const xlsx = require('xlsx');
const pool = require('./src/config/database');
const path = require('path');

async function importMasterList() {
    const client = await pool.connect();

    try {
        console.log('--- PHASE 1: IMPORTING MASTER INVENTORY ---');

        // 1. Load Excel File
        const filePath = path.resolve(__dirname, '../Table Produit NOUVEAUX.xls');
        const workbook = xlsx.readFile(filePath);
        const worksheet = workbook.Sheets[workbook.SheetNames[0]];
        const rawData = xlsx.utils.sheet_to_json(worksheet);

        console.log(`Loaded ${rawData.length} rows from Excel.`);

        await client.query('BEGIN');

        // Pre-fetch Units and Categories to map if possible
        const unitsRes = await client.query('SELECT UnitID, UnitCode, UnitName FROM Units');
        const units = unitsRes.rows;
        let defaultUnitId = units.find(u => u.unitcode === 'PCS' || u.unitname?.toLowerCase() === 'piece')?.unitid;

        if (!defaultUnitId && units.length > 0) {
            defaultUnitId = units[0].unitid;
        }

        let updatedCount = 0;
        let insertedCount = 0;

        for (const row of rawData) {
            const code = row['Reference']?.toString().trim().toUpperCase() || '';
            const name = row['Libellé']?.toString().trim().toUpperCase() || '';
            const purchasePrice = parseFloat(row["Prix d'achat"]) || 0;
            const salePrice = parseFloat(row['Prix de vente']) || 0;

            if (!name) continue;

            // Check if product exists by exact name match
            const checkRes = await client.query('SELECT ProductID FROM Products WHERE ProductName ILIKE $1', [name]);

            if (checkRes.rows.length > 0) {
                // Product exists, update it to ensure it's active and has latest base price
                const productId = checkRes.rows[0].productid;
                await client.query(`
                    UPDATE Products 
                    SET IsActive = true, 
                        BasePrice = $1,
                        UpdatedAt = CURRENT_TIMESTAMP
                    WHERE ProductID = $2
                `, [salePrice, productId]);
                updatedCount++;
            } else {
                // Product does not exist, insert it
                // We need a unique ProductCode. If 'code' is empty or already exists, we generate one.
                let safeCode = code;
                if (!safeCode) {
                    safeCode = `NEW-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
                } else {
                    const codeCheck = await client.query('SELECT ProductID FROM Products WHERE ProductCode = $1', [safeCode]);
                    if (codeCheck.rows.length > 0) {
                        safeCode = `${safeCode}-${Date.now()}`;
                    }
                }

                await client.query(`
                    INSERT INTO Products (ProductCode, ProductName, PrimaryUnitID, BasePrice, IsActive)
                    VALUES ($1, $2, $3, $4, true)
                `, [safeCode, name, defaultUnitId, salePrice]);

                insertedCount++;
            }
        }

        await client.query('COMMIT');

        console.log('\n--- PHASE 1 COMPLETE ---');
        console.log(`Products Updated: ${updatedCount}`);
        console.log(`Products Inserted: ${insertedCount}`);
        console.log('Master list is now active in the database.');

    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Error during Phase 1 import:', err);
    } finally {
        client.release();
        pool.end();
    }
}

importMasterList();
