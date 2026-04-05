const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const cloudPool = new Pool({
    connectionString: "postgresql://postgres.ugvioyruqoafvsqvnwiy:%22p3yf%2BXV7'EMz%5E%23@aws-1-eu-central-1.pooler.supabase.com:5432/postgres",
    ssl: { rejectUnauthorized: false }
});

// Levenshtein distance
function levenshtein(a, b) {
    const m = a.length, n = b.length;
    if (m === 0) return n;
    if (n === 0) return m;
    const d = Array.from({ length: m + 1 }, (_, i) => {
        const row = new Array(n + 1);
        row[0] = i;
        return row;
    });
    for (let j = 1; j <= n; j++) d[0][j] = j;
    for (let i = 1; i <= m; i++) {
        for (let j = 1; j <= n; j++) {
            const cost = a[i - 1] === b[j - 1] ? 0 : 1;
            d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
        }
    }
    return d[m][n];
}

// Normalize: strip FICHE:, REC, slashes→space, special chars, collapse spaces
function normalize(name) {
    return name
        .toUpperCase()
        .replace(/FICHE\s*:\s*/g, '')
        .replace(/\bREC\b/g, '')
        .replace(/[\/\+\-\(\)\.\,\:\;\'\"\`\´\ï]/g, ' ')
        .replace(/[^A-Z0-9\s²éèêë]/g, '')
        .replace(/\béme\b/gi, '')
        .replace(/\bme\b/gi, '')
        .replace(/\bM[²ý]\b/g, 'M2')
        .replace(/\b2éme\b/gi, '2EME')
        .replace(/\b2me\b/gi, '2EME')
        .replace(/\s+/g, ' ')
        .trim();
}

// Sorted word key (for word-order matching)
function sortedWordKey(name) {
    return normalize(name).split(/\s+/).filter(w => w).sort().join(' ');
}

// Truncated word key: first 3 chars of each word, sorted (catches POL vs POLI)
function truncatedWordKey(name) {
    return normalize(name).split(/\s+/).filter(w => w).map(w => w.substring(0, 3)).sort().join(' ');
}

// Collapsed key: remove all spaces and non-alphanumeric
function collapsedKey(name) {
    return normalize(name).replace(/\s+/g, '').replace(/[^A-Z0-9]/g, '');
}

// Size key: extract dimensions like 45/90, 60/60, 120/60 etc.
function getDimensions(name) {
    const match = name.match(/(\d+\/\d+)/);
    return match ? match[1] : '';
}

// Extract base product name (before dimensions)
function getBaseName(name) {
    return normalize(name)
        .replace(/\d+\/\d+/g, '')
        .replace(/\d+/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}

function isFiche(name) {
    return /^FICHE\s*:/i.test(name.trim());
}

async function finalScan() {
    try {
        console.log('Fetching all active products...\n');
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

        // ─── Strategy 1: Sorted word key ───
        const strategy1 = new Map();
        for (const p of products) {
            const key = sortedWordKey(p.productname);
            if (!strategy1.has(key)) strategy1.set(key, []);
            strategy1.get(key).push(p);
        }

        // ─── Strategy 2: Truncated word key (catches POL vs POLI, etc.) ───
        const strategy2 = new Map();
        for (const p of products) {
            const key = truncatedWordKey(p.productname);
            if (!strategy2.has(key)) strategy2.set(key, []);
            strategy2.get(key).push(p);
        }

        // ─── Strategy 3: Collapsed key ───
        const strategy3 = new Map();
        for (const p of products) {
            const key = collapsedKey(p.productname);
            if (!strategy3.has(key)) strategy3.set(key, []);
            strategy3.get(key).push(p);
        }

        // ─── Strategy 4: Levenshtein on normalized names within same brand+dimension ───
        // Group by brand+dimension first to limit comparisons
        const brandDimGroups = new Map();
        for (const p of products) {
            const brand = (p.brandname || p.categoryname || 'UNKNOWN').toUpperCase();
            const dim = getDimensions(p.productname);
            const key = `${brand}|${dim}`;
            if (!brandDimGroups.has(key)) brandDimGroups.set(key, []);
            brandDimGroups.get(key).push(p);
        }

        const levenshteinPairs = [];
        for (const [, group] of brandDimGroups.entries()) {
            if (group.length < 2 || group.length > 100) continue;
            for (let i = 0; i < group.length; i++) {
                for (let j = i + 1; j < group.length; j++) {
                    const n1 = normalize(group[i].productname);
                    const n2 = normalize(group[j].productname);
                    // Only compare if lengths are similar
                    if (Math.abs(n1.length - n2.length) > 5) continue;
                    const dist = levenshtein(n1, n2);
                    const maxLen = Math.max(n1.length, n2.length);
                    const similarity = 1 - dist / maxLen;
                    // Flag if >85% similar and distance <= 3
                    if (similarity >= 0.85 && dist <= 3 && dist > 0) {
                        levenshteinPairs.push({
                            p1: group[i],
                            p2: group[j],
                            dist,
                            similarity: (similarity * 100).toFixed(1)
                        });
                    }
                }
            }
        }

        // ─── Merge all found groups, dedup by product ID pairs ───
        const allPairKeys = new Set();
        const allGroups = [];

        function addFromMap(map, strategyName) {
            for (const [key, group] of map.entries()) {
                if (group.length < 2) continue;
                // Filter: at least 2 non-FICHE or 2 FICHE or 3+ total
                const ficheCount = group.filter(p => isFiche(p.productname)).length;
                const normalCount = group.length - ficheCount;
                if (normalCount <= 1 && ficheCount <= 1 && group.length <= 2) continue;

                const ids = group.map(p => p.productid).sort((a, b) => a - b);
                const pairKey = ids.join('-');
                if (allPairKeys.has(pairKey)) continue;
                allPairKeys.add(pairKey);
                allGroups.push({ strategy: strategyName, group });
            }
        }

        addFromMap(strategy1, 'Sorted-Word');
        addFromMap(strategy2, 'Truncated-Word');
        addFromMap(strategy3, 'Collapsed');

        // Add levenshtein pairs
        for (const pair of levenshteinPairs) {
            const ids = [pair.p1.productid, pair.p2.productid].sort((a, b) => a - b);
            const pairKey = ids.join('-');
            if (allPairKeys.has(pairKey)) continue;
            allPairKeys.add(pairKey);
            allGroups.push({
                strategy: `Fuzzy(${pair.similarity}%,d=${pair.dist})`,
                group: [pair.p1, pair.p2]
            });
        }

        console.log(`Found ${allGroups.length} potential duplicate groups.\n`);

        if (allGroups.length === 0) {
            console.log('✅ No duplicates found!');
            cloudPool.end();
            return;
        }

        // Get inventory
        const allIds = new Set();
        for (const g of allGroups) for (const p of g.group) allIds.add(p.productid);
        const invResult = await cloudPool.query(
            `SELECT ProductID, SUM(QuantityOnHand) as qty FROM Inventory WHERE ProductID = ANY($1) GROUP BY ProductID`,
            [Array.from(allIds)]
        );
        const qtyMap = new Map();
        for (const r of invResult.rows) qtyMap.set(r.productid, parseFloat(r.qty || 0));

        // Build report
        let csv = 'Group #,Strategy,Category/Family,Product ID,Product Code,Product Name,Quantity,Is FICHE\n';
        let report = '';
        let groupNum = 0;

        for (const { strategy, group } of allGroups) {
            groupNum++;
            const family = group[0].brandname || group[0].categoryname || 'Unknown';
            report += `Group ${groupNum} [${strategy}] Family: ${family}\n`;
            for (const p of group) {
                const qty = qtyMap.get(p.productid) || 0;
                const fiche = isFiche(p.productname) ? 'YES' : 'NO';
                report += `  ID: ${p.productid} | "${p.productname}" | Qty: ${qty} | FICHE: ${fiche}\n`;
                csv += `"${groupNum}","${strategy}","${family}","${p.productid}","${(p.productcode || '').replace(/"/g, '""')}","${p.productname.replace(/"/g, '""')}","${qty}","${fiche}"\n`;
            }
            report += '\n';
        }

        console.log(report);

        const csvPath = path.resolve(__dirname, '..', '..', 'final_duplicates_scan.csv');
        fs.writeFileSync(csvPath, csv);
        console.log(`\n✅ CSV saved to: ${csvPath}`);
        console.log(`Total groups: ${allGroups.length}`);

    } catch (err) {
        console.error('❌ Error:', err.message, err.stack);
    } finally {
        cloudPool.end();
    }
}

finalScan();
