const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const cloudPool = new Pool({
    connectionString: "postgresql://postgres.ugvioyruqoafvsqvnwiy:%22p3yf%2BXV7'EMz%5E%23@aws-1-eu-central-1.pooler.supabase.com:5432/postgres",
    ssl: { rejectUnauthorized: false }
});

function isFiche(name) { return /^FICHE\s*:/i.test(name.trim()); }

function normalize(name) {
    return name.toUpperCase()
        .replace(/FICHE\s*:\s*/g, '')
        .replace(/\bREC\b/g, '')
        .replace(/[\/\+\-\(\)\.\,\:\;\'\"\`\´\ï]/g, ' ')
        .replace(/2[ée]me/gi, '2EME').replace(/\b2me\b/gi, '2EME')
        .replace(/M[²ý]/g, 'M2')
        .replace(/[^A-Z0-9\s]/g, '')
        .replace(/\s+/g, ' ').trim();
}

function sortedKey(name) { return normalize(name).split(/\s+/).filter(w => w).sort().join(' '); }
function truncKey(name) { return normalize(name).split(/\s+/).filter(w => w).map(w => w.length > 3 ? w.substring(0, 3) : w).sort().join(' '); }
function collapsedKey(name) { return normalize(name).replace(/\s+/g, ''); }

function lev(a, b) {
    const m = a.length, n = b.length;
    if (!m) return n; if (!n) return m;
    const d = Array.from({ length: m + 1 }, (_, i) => { const r = new Array(n + 1); r[0] = i; return r; });
    for (let j = 1; j <= n; j++) d[0][j] = j;
    for (let i = 1; i <= m; i++) for (let j = 1; j <= n; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    return d[m][n];
}

async function verificationScan() {
    console.log('=== FINAL VERIFICATION SCAN ===\n');
    const result = await cloudPool.query(`
        SELECT p.ProductID, p.ProductName, p.ProductCode,
               b.BrandName, c.CategoryName
        FROM Products p
        LEFT JOIN Brands b ON p.BrandID = b.BrandID
        LEFT JOIN Categories c ON p.CategoryID = c.CategoryID
        WHERE p.IsActive = true ORDER BY p.ProductID
    `);
    const products = result.rows;
    console.log(`Active products: ${products.length}\n`);

    // Strategy 1: Sorted word key
    const s1 = new Map();
    for (const p of products) { const k = sortedKey(p.productname); if (!s1.has(k)) s1.set(k, []); s1.get(k).push(p); }

    // Strategy 2: Truncated word key
    const s2 = new Map();
    for (const p of products) { const k = truncKey(p.productname); if (!s2.has(k)) s2.set(k, []); s2.get(k).push(p); }

    // Strategy 3: Collapsed key
    const s3 = new Map();
    for (const p of products) { const k = collapsedKey(p.productname); if (!s3.has(k)) s3.set(k, []); s3.get(k).push(p); }

    // Collect potential groups
    const pairMap = new Map();
    function addGroup(group, strategy) {
        if (group.length < 2) return;
        const fiche = group.filter(p => isFiche(p.productname)).length;
        const normal = group.length - fiche;
        if (normal < 2 && fiche < 2 && group.length < 3) return;
        const ids = group.map(p => p.productid).sort((a, b) => a - b);
        const key = ids.join('-');
        if (!pairMap.has(key)) pairMap.set(key, { products: group, strategy });
    }
    for (const [, g] of s1) addGroup(g, 'SortedWord');
    for (const [, g] of s2) addGroup(g, 'TruncWord');
    for (const [, g] of s3) addGroup(g, 'Collapsed');

    // Strategy 4: Levenshtein within same brand+dimension
    const bdg = new Map();
    for (const p of products) {
        const brand = (p.brandname || p.categoryname || '').toUpperCase();
        const dimM = p.productname.match(/(\d+[\/\*x]\d+)/i);
        const dim = dimM ? dimM[1] : '';
        const k = `${brand}|${dim}`;
        if (!bdg.has(k)) bdg.set(k, []);
        bdg.get(k).push(p);
    }
    for (const [, group] of bdg) {
        if (group.length < 2 || group.length > 50) continue;
        for (let i = 0; i < group.length; i++) for (let j = i + 1; j < group.length; j++) {
            const n1 = normalize(group[i].productname), n2 = normalize(group[j].productname);
            if (Math.abs(n1.length - n2.length) > 3) continue;
            const dist = lev(n1, n2);
            if (dist > 0 && dist <= 2) {
                const nums1 = (n1.match(/\d+/g) || []).join(','), nums2 = (n2.match(/\d+/g) || []).join(',');
                if (nums1 !== nums2 && !n1.includes('2EME') && !n2.includes('2EME') && !n1.includes('M2') && !n2.includes('M2')) continue;
                // Filter: same word count, differing only in model number → not a dupe
                const w1 = n1.split(/\s+/), w2 = n2.split(/\s+/);
                if (w1.length === w2.length) {
                    let dc = 0, dn = true;
                    for (let k = 0; k < w1.length; k++) { if (w1[k] !== w2[k]) { dc++; if (!/^\d+$/.test(w1[k]) || !/^\d+$/.test(w2[k])) dn = false; } }
                    if (dc === 1 && dn) continue;
                }
                // Filter: base words differ → not same product
                const base1 = n1.replace(/\d+/g, 'N'), base2 = n2.replace(/\d+/g, 'N');
                if (base1 !== base2) continue;

                const pair = [group[i], group[j]];
                const ids = pair.map(p => p.productid).sort((a, b) => a - b);
                const key = ids.join('-');
                if (!pairMap.has(key)) pairMap.set(key, { products: pair, strategy: `Fuzzy(d=${dist})` });
            }
        }
    }

    // Get inventory
    const allIds = new Set();
    for (const [, g] of pairMap) for (const p of g.products) allIds.add(p.productid);
    const invResult = await cloudPool.query(
        `SELECT ProductID, SUM(QuantityOnHand) as qty FROM Inventory WHERE ProductID = ANY($1) GROUP BY ProductID`,
        [Array.from(allIds)]
    );
    const qtyMap = new Map();
    for (const r of invResult.rows) qtyMap.set(r.productid, parseFloat(r.qty || 0));

    // Report
    let csv = 'Group #,Strategy,Family,Product ID,Product Name,Quantity,Is FICHE\n';
    let groupNum = 0;
    let totalSuspects = 0;

    for (const [, { products: group, strategy }] of pairMap) {
        groupNum++;
        totalSuspects += group.length;
        const family = group[0].brandname || group[0].categoryname || 'Unknown';
        console.log(`Group ${groupNum} [${strategy}] Family: ${family}`);
        for (const p of group) {
            const qty = qtyMap.get(p.productid) || 0;
            const fiche = isFiche(p.productname) ? 'YES' : 'NO';
            console.log(`  ID: ${p.productid} | "${p.productname}" | Qty: ${qty} | FICHE: ${fiche}`);
            csv += `"${groupNum}","${strategy}","${family}","${p.productid}","${p.productname.replace(/"/g, '""')}","${qty}","${fiche}"\n`;
        }
        console.log('');
    }

    if (groupNum === 0) {
        console.log('✅✅✅ ZERO DUPLICATES FOUND — DATABASE IS CLEAN! ✅✅✅');
    } else {
        console.log(`\n⚠️ Found ${groupNum} suspect groups (${totalSuspects} products).`);
    }

    const outPath = path.resolve(__dirname, '..', '..', 'verification_scan_results.csv');
    fs.writeFileSync(outPath, csv);
    console.log(`Results saved to: ${outPath}`);
    cloudPool.end();
}

verificationScan();
