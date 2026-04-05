const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const cloudPool = new Pool({
    connectionString: "postgresql://postgres.ugvioyruqoafvsqvnwiy:%22p3yf%2BXV7'EMz%5E%23@aws-1-eu-central-1.pooler.supabase.com:5432/postgres",
    ssl: { rejectUnauthorized: false }
});

// Normalize: strip FICHE:, REC, punctuation, collapse spaces, sort words
function getSortedWordKey(name) {
    return name
        .toUpperCase()
        .replace(/FICHE\s*:\s*/g, '')
        .replace(/\bREC\b/g, '')
        .replace(/[\/\+\-\(\)\.\,]/g, ' ')
        .replace(/[^A-Z0-9\s]/g, '')
        .split(/\s+/)
        .filter(w => w.length > 0)
        .sort()
        .join(' ');
}

function isFiche(name) {
    return /^FICHE\s*:/i.test(name.trim());
}

async function deepDuplicateCheck() {
    try {
        console.log('Fetching all active products from cloud DB...\n');
        const result = await cloudPool.query(`
            SELECT p.ProductID, p.ProductName, p.ProductCode,
                   b.BrandName, c.CategoryName
            FROM Products p
            LEFT JOIN Brands b ON p.BrandID = b.BrandID
            LEFT JOIN Categories c ON p.CategoryID = c.CategoryID
            WHERE p.IsActive = true
            ORDER BY p.ProductID
        `);

        const products = result.rows;
        console.log(`Fetched ${products.length} active products.\n`);

        // Group by sorted word key
        const wordSetMap = new Map();
        for (const p of products) {
            const key = getSortedWordKey(p.productname);
            if (!wordSetMap.has(key)) wordSetMap.set(key, []);
            wordSetMap.get(key).push(p);
        }

        // Filter: only groups where there are TRUE duplicates
        // A true duplicate is when:
        //  - There are 2+ non-FICHE products with the same key (actual product duplicates)
        //  - There are 2+ FICHE products with the same key
        //  - There are 3+ products total (more than expected 1 FICHE + 1 product pair)
        const trueGroups = [];

        for (const [key, group] of wordSetMap.entries()) {
            if (group.length < 2) continue;

            const ficheProducts = group.filter(p => isFiche(p.productname));
            const normalProducts = group.filter(p => !isFiche(p.productname));

            const isDuplicate =
                normalProducts.length > 1 || // 2+ non-FICHE products = duplicate
                ficheProducts.length > 1 ||  // 2+ FICHE products = duplicate
                group.length > 2;            // More than a simple FICHE+product pair

            if (isDuplicate) {
                trueGroups.push({ key, group, ficheProducts, normalProducts });
            }
        }

        console.log(`Found ${trueGroups.length} true duplicate groups (excluding normal FICHE+product pairs).\n`);

        if (trueGroups.length === 0) {
            console.log('✅ No true duplicates found!');
            cloudPool.end();
            return;
        }

        // Get inventory quantities
        const allIds = new Set();
        for (const g of trueGroups) {
            for (const p of g.group) allIds.add(p.productid);
        }
        const invResult = await cloudPool.query(
            `SELECT ProductID, SUM(QuantityOnHand) as qty, SUM(PalletCount) as pal, SUM(ColisCount) as col FROM Inventory WHERE ProductID = ANY($1) GROUP BY ProductID`,
            [Array.from(allIds)]
        );
        const qtyMap = new Map();
        for (const r of invResult.rows) {
            qtyMap.set(r.productid, {
                qty: parseFloat(r.qty || 0),
                pal: parseFloat(r.pal || 0),
                col: parseFloat(r.col || 0)
            });
        }

        // Build report
        let csv = 'Group #,Category/Family,Product ID,Product Code,Product Name,Quantity,Pallets,Colis,Is FICHE\n';
        let report = '=== TRUE DUPLICATE GROUPS ===\n\n';
        let groupNum = 0;

        for (const { group } of trueGroups) {
            groupNum++;
            const family = group[0].brandname || group[0].categoryname || 'Unknown';
            report += `Group ${groupNum} | Family: ${family}\n`;
            for (const p of group) {
                const inv = qtyMap.get(p.productid) || { qty: 0, pal: 0, col: 0 };
                const fiche = isFiche(p.productname) ? 'YES' : 'NO';
                report += `  ID: ${p.productid} | "${p.productname}" | Qty: ${inv.qty} | FICHE: ${fiche}\n`;
                csv += `"${groupNum}","${family}","${p.productid}","${(p.productcode || '').replace(/"/g, '""')}","${p.productname.replace(/"/g, '""')}","${inv.qty}","${inv.pal}","${inv.col}","${fiche}"\n`;
            }
            report += '\n';
        }

        console.log(report);

        const csvPath = path.resolve(__dirname, '..', '..', 'deep_duplicates_scan.csv');
        fs.writeFileSync(csvPath, csv);
        console.log(`✅ CSV saved to: ${csvPath}`);
        console.log(`Total true duplicate groups: ${trueGroups.length}`);

    } catch (err) {
        console.error('❌ Error:', err.message, err.stack);
    } finally {
        cloudPool.end();
    }
}

deepDuplicateCheck();
