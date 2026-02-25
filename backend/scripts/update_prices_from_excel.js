const path = require('path');
const XLSX = require('xlsx');

// Adjust path to load db config
let pool;
try {
    pool = require('../src/config/database');
} catch (e) {
    console.log('Could not load ../src/config/database, trying ../src/db');
    pool = require('../src/db');
}

async function updatePrices() {
    console.log('Starting Price Update...');
    const filePath = path.join(__dirname, '..', '..', "PRIX D'achat.xls");

    let workbook;
    try {
        workbook = XLSX.readFile(filePath);
    } catch (e) {
        console.error('Failed to read Excel file at ' + filePath + ':', e);
        process.exit(1);
    }

    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    // Read raw data
    const data = XLSX.utils.sheet_to_json(sheet, { header: 1, range: 0, raw: false });

    // Rows start at index 1 (row 2)
    const rows = data.slice(1);

    console.log(`Found ${rows.length} rows in Excel.`);

    const client = await pool.connect();
    let updatedCount = 0;
    let missingCount = 0;
    let errorCount = 0;

    try {
        await client.query('BEGIN');

        for (const row of rows) {
            // Excel columns: 0=Famille, 1=Reference(Brand), 2=Libellé(Name), 3=Prix d'achat
            const name = row[2];
            let priceRaw = row[3];

            if (!name) continue; // Skip empty rows

            // Clean price
            let price = 0;
            if (priceRaw) {
                const cleanPrice = priceRaw.toString().replace(/DA/g, '').replace(/\s/g, '').replace(/,/g, '');
                price = parseFloat(cleanPrice);
            }

            if (isNaN(price)) {
                // console.log(`Invalid price for ${name}: ${priceRaw}`);
                continue;
            }

            // Update in DB
            // We match by ProductName (case-insensitive)
            const updateRes = await client.query(
                `UPDATE Products 
                 SET PurchasePrice = $1, UpdatedAt = CURRENT_TIMESTAMP 
                 WHERE LOWER(ProductName) = LOWER($2)
                 RETURNING ProductID`,
                [price, name.trim()]
            );

            if (updateRes.rowCount > 0) {
                updatedCount++;
                // console.log(`[UPDATED] "${name}" -> ${price}`);
            } else {
                console.log(`[MISSING] "${name}"`);
                missingCount++;
            }
        }

        console.log('------------------------------------------------');
        console.log(`Total Rows Processed: ${rows.length}`);
        console.log(`Updated in DB: ${updatedCount}`);
        console.log(`Missing in DB: ${missingCount}`);

        await client.query('COMMIT');
        console.log('Transaction COMMITTED.');

        // Refresh materialized view
        console.log('Refreshing mv_Catalogue...');
        try {
            await pool.query('REFRESH MATERIALIZED VIEW mv_Catalogue');
            console.log('View refreshed successfully.');
        } catch (refreshErr) {
            console.warn('Failed to refresh mv_Catalogue:', refreshErr);
        }

    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Error during update:', err);
    } finally {
        client.release();
        await pool.end();
    }
}

updatePrices();
