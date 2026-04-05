require('dotenv').config();
const { Client } = require('pg');
const xlsx = require('xlsx');
const path = require('path');

// Raw connection details to guarantee no parsed .env injection issues
const DB_URL = "postgresql://postgres.ugvioyruqoafvsqvnwiy:%22p3yf%2BXV7'EMz%5E%23@aws-1-eu-central-1.pooler.supabase.com:5432/postgres";

async function uploadProducts() {
    console.log('--- STARTING DIRECT CLOUD UPLOAD ---');

    // 1. Load Excel File
    const filePath = path.resolve(__dirname, '../Table Produit NOUVEAUX.xls');
    const workbook = xlsx.readFile(filePath);
    const worksheet = workbook.Sheets[workbook.SheetNames[0]];
    const rawData = xlsx.utils.sheet_to_json(worksheet);

    console.log(`Loaded ${rawData.length} rows from Excel.`);

    // 2. Connect directly bypassing the application's database.js config
    const client = new Client({
        connectionString: DB_URL,
        ssl: { rejectUnauthorized: false },
        connectionTimeoutMillis: 10000
    });

    try {
        await client.connect();
        console.log('✓ Connected directly to Supabase cloud!');

        await client.query('BEGIN');

        // Pre-fetch Units
        const unitsRes = await client.query('SELECT UnitID, UnitCode, UnitName FROM Units');
        const units = unitsRes.rows;
        let defaultUnitId = units.find(u => u.unitcode === 'PCS' || u.unitname?.toLowerCase() === 'piece')?.unitid;

        if (!defaultUnitId && units.length > 0) defaultUnitId = units[0].unitid;

        let updatedCount = 0;
        let insertedCount = 0;

        for (const row of rawData) {
            const code = row['Reference']?.toString().trim().toUpperCase() || '';
            const name = row['Libellé']?.toString().trim().toUpperCase() || '';
            const purchasePrice = parseFloat(row["Prix d'achat"]) || 0;
            const salePrice = parseFloat(row['Prix de vente']) || 0;

            if (!name) continue;

            const checkRes = await client.query('SELECT ProductID FROM Products WHERE ProductName ILIKE $1', [name]);

            if (checkRes.rows.length > 0) {
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
                let safeCode = code || `NEW-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
                const codeCheck = await client.query('SELECT ProductID FROM Products WHERE ProductCode = $1', [safeCode]);
                if (codeCheck.rows.length > 0) { safeCode = `${safeCode}-${Date.now()}`; }

                await client.query(`
                    INSERT INTO Products (ProductCode, ProductName, PrimaryUnitID, BasePrice, IsActive)
                    VALUES ($1, $2, $3, $4, true)
                `, [safeCode, name, defaultUnitId, salePrice]);

                insertedCount++;
            }
        }

        await client.query('COMMIT');

        console.log('\n--- UPLOAD COMPLETE ---');
        console.log(`Products Updated: ${updatedCount}`);
        console.log(`Products Inserted: ${insertedCount}`);

    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Upload Error:', err);
    } finally {
        await client.end();
    }
}

uploadProducts();
