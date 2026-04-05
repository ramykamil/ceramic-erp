require('dotenv').config();
const { Pool } = require('pg');
const xlsx = require('xlsx');
const path = require('path');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

// Simple Levenshtein distance implementation
function levenshteinDistance(s1, s2) {
    if (!s1 || !s2) return 100;
    if (s1.length === 0) return s2.length;
    if (s2.length === 0) return s1.length;

    let matrix = [];
    for (let i = 0; i <= s2.length; i++) { matrix[i] = [i]; }
    for (let j = 0; j <= s1.length; j++) { matrix[0][j] = j; }

    for (let i = 1; i <= s2.length; i++) {
        for (let j = 1; j <= s1.length; j++) {
            if (s2.charAt(i - 1) == s1.charAt(j - 1)) {
                matrix[i][j] = matrix[i - 1][j - 1];
            } else {
                matrix[i][j] = Math.min(
                    matrix[i - 1][j - 1] + 1, // substitution
                    Math.min(matrix[i][j - 1] + 1, // insertion
                        matrix[i - 1][j] + 1) // deletion
                );
            }
        }
    }
    return matrix[s2.length][s1.length];
}

function calculateSimilarity(s1, s2) {
    if (!s1 || !s2) return 0;
    let longer = s1;
    let shorter = s2;
    if (s1.length < s2.length) {
        longer = s2;
        shorter = s1;
    }
    let longerLength = longer.length;
    if (longerLength == 0) return 1.0;
    return (longerLength - levenshteinDistance(longer, shorter)) / parseFloat(longerLength);
}

// Function to check word overlap (very useful for product names with varying sizes/colors)
function calculateWordOverlap(s1, s2) {
    if (!s1 || !s2) return 0;
    const words1 = s1.split(/\s+/).filter(w => w.length > 2);
    const words2 = s2.split(/\s+/).filter(w => w.length > 2);
    if (words1.length === 0 || words2.length === 0) return 0;

    let overlapCount = 0;
    for (const w1 of words1) {
        if (words2.includes(w1)) overlapCount++;
    }
    return overlapCount / Math.max(words1.length, words2.length);
}

async function main() {
    try {
        console.log('--- Loading "New" Excel File Products ---');
        const filePath = path.resolve(__dirname, '../Table Produit NOUVEAUX.xls');
        const workbook = xlsx.readFile(filePath);
        const worksheet = workbook.Sheets[workbook.SheetNames[0]];
        const rawData = xlsx.utils.sheet_to_json(worksheet, { defval: null });

        // Extract distinct valid names from Excel
        const newNamesRaw = rawData.map(row => row['Libellé']?.toString().trim().toUpperCase() || '');
        const newNames = [...new Set(newNamesRaw.filter(n => n.length > 0))];
        console.log(`Loaded ${newNames.length} distinct product names from Excel.\n`);

        console.log('--- Loading "Old" Database Products ---');
        const dbResult = await pool.query(`
            SELECT 
                ProductID, 
                ProductCode, 
                ProductName, 
                CreatedAt
            FROM Products 
            WHERE CreatedAt < '2026-02-01' AND IsActive = true
            ORDER BY ProductID ASC
        `);
        const oldProducts = dbResult.rows;
        console.log(`Loaded ${oldProducts.length} active old products from Database.\n`);

        console.log('--- Comparing string similarities... (This might take a moment) ---');

        const potentialDuplicates = [];

        for (const oldProd of oldProducts) {
            const oldName = (oldProd.productname || '').trim().toUpperCase();
            if (!oldName) continue;

            let bestMatch = null;
            let highestSimilarity = 0;
            let highestWordOverlap = 0;

            for (const newName of newNames) {
                // Ignore perfect matches, since perfect matches are... perfect, and usually not the "slightly different" duplicates
                // Wait, if it perfectly matches, why did it not get used? 
                // Because Excel products might have overridden something else, or created new. 
                // Let's include perfect matches just in case they are true dupes.

                const wordOverlap = calculateWordOverlap(oldName, newName);
                const similarity = calculateSimilarity(oldName, newName);

                // Track best purely by a combined score or just keep the max
                const combinedScore = (similarity * 0.4) + (wordOverlap * 0.6);

                if (combinedScore > highestSimilarity) {
                    highestSimilarity = combinedScore;
                    highestWordOverlap = wordOverlap;
                    bestMatch = newName;
                }
            }

            // Thresholds: if similarity > 60% OR word overlap > 60%
            if (highestSimilarity > 0.6 || highestWordOverlap > 0.6) {
                potentialDuplicates.push({
                    "Ancien ID Produit (Base de données)": oldProd.productid,
                    "Ancien Code": oldProd.productcode,
                    "Ancien Nom (Base de données)": oldName,
                    "Nouveau Nom Correspondant (Excel)": bestMatch,
                    "Score de Similarité (%)": (highestSimilarity * 100).toFixed(1) + "%",
                });
            }
        }

        console.log(`Found ${potentialDuplicates.length} potential fuzzy duplicates.\n`);

        if (potentialDuplicates.length > 0) {
            // Sort by priority/similarity
            potentialDuplicates.sort((a, b) => parseFloat(b["Score de Similarité (%)"]) - parseFloat(a["Score de Similarité (%)"]));

            // Save to Excel for review
            const newWorkbook = xlsx.utils.book_new();
            const newWorksheet = xlsx.utils.json_to_sheet(potentialDuplicates);

            newWorksheet['!cols'] = [
                { wch: 15 }, // ID
                { wch: 30 }, // Old Code
                { wch: 45 }, // Old Name
                { wch: 45 }, // New Name
                { wch: 25 }, // Score
            ];

            xlsx.utils.book_append_sheet(newWorkbook, newWorksheet, "Doublons Potentiels");

            const outputPath = path.resolve(__dirname, `../Doublons_Potentiels_Anciens_Produits.xlsx`);
            xlsx.writeFile(newWorkbook, outputPath);

            console.log(`✅ Fuzzy duplicates Excel file generated successfully at:\n${outputPath}`);
        }

    } catch (e) {
        console.error(e);
    } finally {
        pool.end();
    }
}
main();
