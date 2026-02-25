const fs = require('fs');
const readline = require('readline');

async function checkBackup() {
    const fileStream = fs.createReadStream('c:\\Users\\PC\\OneDrive\\Bureau\\ceramic-erp-platform\\backend\\cloud_migration_dump_20262502.sql');
    const rl = readline.createInterface({
        input: fileStream,
        crlfDelay: Infinity
    });

    let totalFiche = 0;
    let missingFiche = 0;

    let inCopyProducts = false;
    for await (const line of rl) {
        if (line.startsWith('COPY public.products (')) {
            inCopyProducts = true;
            continue;
        }
        if (inCopyProducts && line === '\\.') {
            inCopyProducts = false;
            break;
        }

        if (inCopyProducts) {
            const parts = line.split('\t');
            const productName = parts[2]; // ProductName is 3rd column
            if (productName && (productName.startsWith('FICHE:') || parts[1].startsWith('FICHE:'))) {
                totalFiche++;
                if (parts[4] === '\\N') {
                    missingFiche++;
                }
            }
        }
    }

    console.log(`Total FICHE products in dump: ${totalFiche}`);
    console.log(`Missing BrandID in dump: ${missingFiche}`);
}

checkBackup();
