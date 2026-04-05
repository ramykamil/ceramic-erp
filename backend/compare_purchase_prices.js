const fs = require('fs');
const xlsx = require('xlsx');
const { Pool } = require('pg');

const cloudPool = new Pool({
    connectionString: "postgresql://postgres.ugvioyruqoafvsqvnwiy:%22p3yf%2BXV7'EMz%5E%23@aws-1-eu-central-1.pooler.supabase.com:5432/postgres",
    ssl: { rejectUnauthorized: false }
});

async function extractSqlPrices() {
    const sqlContent = fs.readFileSync('cloud_migration_dump_20262502.sql', 'utf8');
    const sqlPrices = new Map();

    // COPY public.products (productid, productcode, productname, categoryid, brandid, primaryunitid, description, specifications, baseprice, isactive, createdat, updatedat, "ImageUrl", purchaseprice, size, factoryid, calibre, choix, qteparcolis, qtecolisparpalette, piecespercarton, cartonsperpalette) FROM stdin;
    // Indexes: 2=productname, 8=baseprice, 13=purchaseprice

    let inCopyBlock = false;
    const lines = sqlContent.split('\n');
    for (const line of lines) {
        if (line.startsWith('COPY public.products (')) {
            inCopyBlock = true;
            continue;
        }
        if (inCopyBlock && line.startsWith('\\.')) {
            inCopyBlock = false;
            continue;
        }
        if (inCopyBlock) {
            const parts = line.split('\t');
            if (parts.length >= 14) {
                const productName = parts[2].trim();
                const salePrice = parseFloat(parts[8]);
                const purchasePrice = parseFloat(parts[13]);
                if (!isNaN(purchasePrice) && purchasePrice > 0) {
                    sqlPrices.set(productName, { sale: salePrice, purchase: purchasePrice });
                }
            }
        }
    }
    return sqlPrices;
}

function extractExcelPrices() {
    const workbook = xlsx.readFile('../STOCK LYOUM.xls');
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const data = xlsx.utils.sheet_to_json(sheet, { header: 1, raw: false });

    const excelPrices = new Map();

    let headerRowIndex = -1;
    let nameIdx = -1;
    let purchasePriceIdx = -1;

    for (let i = 0; i < Math.min(30, data.length); i++) {
        const row = data[i];
        if (Array.isArray(row)) {
            const nameCol = row.findIndex(c => typeof c === 'string' && (c.toLowerCase().includes('article') || c.toLowerCase().includes('produit') || c.toLowerCase().includes('designation')));
            // Try to find PRIC ACHAT, P.A, etc.
            const priceCol = row.findIndex(c => typeof c === 'string' && (c.toLowerCase().includes('prix') && c.toLowerCase().includes('achat')) || c === 'P.A');

            if (nameCol !== -1 && priceCol !== -1) {
                headerRowIndex = i;
                nameIdx = nameCol;
                purchasePriceIdx = priceCol;
                break;
            }
        }
    }

    if (headerRowIndex === -1) {
        console.log("Could not find headers in Excel file automatically. Using assumed columns (1=Name, 2=Purchase Price).");
        nameIdx = 1; // Assuming column B is name
        purchasePriceIdx = 2; // Assuming column C is price
        headerRowIndex = 5; // Skip first few title rows
    } else {
        console.log(`Found Execl headers at row ${headerRowIndex}: NameCol=${nameIdx}, PriceCol=${purchasePriceIdx}`);
    }

    for (let i = headerRowIndex + 1; i < data.length; i++) {
        const row = data[i];
        if (!row || !row[nameIdx]) continue;

        const productName = row[nameIdx].toString().trim();
        let purchasePrice = row[purchasePriceIdx];

        if (purchasePrice !== undefined && purchasePrice !== null && purchasePrice !== '') {
            let priceStr = purchasePrice.toString().replace(/\s/g, '').replace(',', '.');
            let price = parseFloat(priceStr);

            if (!isNaN(price) && price > 0) {
                if (price < 10) price *= 1000;
                excelPrices.set(productName, price);
            }
        }
    }
    return excelPrices;
}

async function comparePrices() {
    console.log('Extracting from SQL Dump...');
    const sqlPrices = await extractSqlPrices();
    console.log(`Found ${sqlPrices.size} products with purchase prices in SQL Dump`);

    console.log('\nExtracting from Excel...');
    const excelPrices = extractExcelPrices();
    console.log(`Found ${excelPrices.size} products with purchase prices in Excel`);

    console.log('\nFetching from Cloud DB...');
    const cloudRes = await cloudPool.query('SELECT ProductID, ProductName, PurchasePrice FROM Products WHERE IsActive = true');
    const cloudPrices = new Map();
    cloudRes.rows.forEach(r => {
        const p = parseFloat(r.purchaseprice || 0);
        if (p > 0) cloudPrices.set(r.productname.trim(), p);
    });
    console.log(`Found ${cloudPrices.size} active products with purchase prices in Cloud DB`);

    console.log('\n========================================================================================================');
    console.log(' ' + padCol('ID', 6) + ' | ' + padCol('PRODUCT NAME', 45) + ' | ' + padCol('CLOUD DB', 10) + ' | ' + padCol('SQL DUMP', 10) + ' | ' + padCol('EXCEL', 10));
    console.log('========================================================================================================');

    let discrepancies = [];

    for (const row of cloudRes.rows) {
        const name = row.productname.trim();
        const cloudPrice = parseFloat(row.purchaseprice || 0);

        const sqlData = sqlPrices.get(name);
        const sqlPrice = sqlData ? sqlData.purchase : 0;

        const excelPrice = excelPrices.get(name) || 0;

        const hasSqlMismatch = sqlPrice > 0 && Math.abs(cloudPrice - sqlPrice) > 0.01;
        const hasExcelMismatch = excelPrice > 0 && Math.abs(cloudPrice - excelPrice) > 0.01;
        const sqlVsExcelMismatch = sqlPrice > 0 && excelPrice > 0 && Math.abs(sqlPrice - excelPrice) > 0.01;

        if (hasSqlMismatch || hasExcelMismatch || sqlVsExcelMismatch || (cloudPrice === 0 && (sqlPrice > 0 || excelPrice > 0))) {
            discrepancies.push({
                id: row.productid,
                name,
                cloud: cloudPrice,
                sql: sqlPrice,
                excel: excelPrice
            });
        }
    }

    console.log(`Found ${discrepancies.length} products with mismatched purchase prices.\n`);

    discrepancies.sort((a, b) => a.name.localeCompare(b.name));

    for (const d of discrepancies) {
        const cStr = d.cloud > 0 ? d.cloud.toFixed(2) : '-';
        const sStr = d.sql > 0 ? d.sql.toFixed(2) : '-';
        const eStr = d.excel > 0 ? d.excel.toFixed(2) : '-';

        let marker = ' ';
        if (d.cloud !== d.sql && d.sql > 0) marker = '*'; // Cloud differs from SQL Backup
        if (d.cloud !== d.excel && d.excel > 0) marker = '!'; // Cloud differs from recent Excel

        console.log(marker + padCol(d.id.toString(), 5) + ' | ' + padCol(d.name.substring(0, 45), 45) + ' | ' + padCol(cStr, 10) + ' | ' + padCol(sStr, 10) + ' | ' + padCol(eStr, 10));
    }

    console.log('\nLegend: * = Cloud differs from SQL Dump | ! = Cloud differs from Excel');

    cloudPool.end();
}

function padCol(str, len) {
    if (str.length > len) return str.substring(0, len - 3) + '...';
    return str.padEnd(len, ' ');
}

comparePrices().catch(console.error);
