require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });
const pool = require('../config/database');

async function findDuplicates() {
    try {
        const query = `
      SELECT p.id, p.name, p.famille, b.name as brand_name
      FROM products p
      LEFT JOIN brands b ON p.brand_id = b.id
    `;
        const { rows: products } = await pool.query(query);

        console.log(`Fetched ${products.length} products.\n`);

        // Group by famille
        const groupedByFamily = {};
        for (const p of products) {
            const family = p.famille || 'UNKNOWN_FAMILY';
            if (!groupedByFamily[family]) {
                groupedByFamily[family] = [];
            }
            groupedByFamily[family].push(p);
        }

        const duplicates = [];

        // Rule 1: Remove \bREC\b (case-insensitive) and all spaces
        // Rule 2: Remove all spaces
        // Compare products within the same family
        for (const [family, prods] of Object.entries(groupedByFamily)) {
            const signatureGroups = {};

            for (const p of prods) {
                let name = p.name || '';
                name = name.toUpperCase();

                // Signature: remove literal word REC, remove spaces, remove special chars like / or -
                // Example: BARCELONA CREMA REC 60/60 -> BARCELONACREMA60/60
                let sig = name.replace(/\bREC\b/ig, '').replace(/\s+/g, '');
                // Some might have hyphens or slashes, unify them? Let's just remove spaces for now.

                if (!signatureGroups[sig]) {
                    signatureGroups[sig] = [];
                }
                signatureGroups[sig].push(p);
            }

            for (const [sig, group] of Object.entries(signatureGroups)) {
                if (group.length > 1) {
                    // Check if they actually have different original names
                    const distinctNames = new Set(group.map(g => g.name.toUpperCase().trim()));
                    if (distinctNames.size > 1) {
                        duplicates.push({
                            family,
                            signature: sig,
                            products: group
                        });
                    }
                }
            }
        }

        if (duplicates.length === 0) {
            console.log("No duplicates found matching the criteria.");
        } else {
            console.log("====== POTENTIAL DUPLICATES FOUND ======\n");
            for (const dup of duplicates) {
                console.log(`Famille: ${dup.family}`);
                console.log(`Products:`);
                for (const p of dup.products) {
                    console.log(`  - [ID: ${p.id}] ${p.name} (Brand: ${p.brand_name || 'N/A'})`);
                }
                console.log("----------------------------------------");
            }
        }

        process.exit(0);

    } catch (err) {
        console.error("Error:", err);
        process.exit(1);
    }
}

findDuplicates();
