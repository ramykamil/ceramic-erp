const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

async function sync() {
    console.log('--- STARTING PRECISION SYNC (ROWS 1-13) ---');
    
    // Exact data extracted FROM stock06-04F.xlsx
    const items = [
        { name: '3D STONE CREMA 30/90', qty: 0, buy: 1050, sell: 1150, qc: 1.32, cp: 42 },
        { name: '3D STONE GRIS 30/90', qty: 0, buy: 1050, sell: 1150, qc: 1.32, cp: 42 },
        { name: '3D STONE LIGHT 30/90', qty: 0, buy: 1050, sell: 1150, qc: 1.32, cp: 42 },
        { name: '3D WALL PANEL BEIGE 30/90', qty: 268.8, buy: 1000, sell: 1100, qc: 1.6, cp: 42 },
        { name: '3D WALL PANEL BROWN 30/90', qty: 0, buy: 950, sell: 1050, qc: 1.6, cp: 42 },
        { name: '3D WALL PANEL CREMA 30/90', qty: 0, buy: 950, sell: 1050, qc: 1.6, cp: 42 },
        { name: '3D WALL PANEL DARK GRIS 30/90', qty: 67.2, buy: 950, sell: 1050, qc: 1.6, cp: 42 },
        { name: '3D WALL PANEL GRIS 30/90', qty: 336, buy: 1000, sell: 1100, qc: 1.6, cp: 42 },
        { name: '3D WALL PANEL LIGHT 30/90', qty: 67.2, buy: 950, sell: 1050, qc: 1.6, cp: 42 },
        { name: '4D BEIGE 30/90', qty: 0, buy: 880, sell: 980, qc: 1.68, cp: 42 },
        { name: '4D BROWN 30/90', qty: 537.6, buy: 880, sell: 980, qc: 1.68, cp: 42 },
        { name: '4D CALACATA REC 60/60', qty: 2419.2, buy: 920, sell: 980, qc: 1.44, cp: 36 },
        { name: '4D CALACATA REC 60/60 (2éme)', qty: 0, buy: 520, sell: 580, qc: 1.44, cp: 36 }
    ];

    for (const item of items) {
        // 1. Find the product ID
        const { data: product, error: pErr } = await supabase
            .from('products')
            .select('productid')
            .eq('productname', item.name)
            .maybeSingle();

        if (pErr) {
            console.error(`Error finding ${item.name}:`, pErr.message);
            continue;
        }

        if (!product) {
            console.warn(`Product NOT FOUND in database: ${item.name}`);
            continue;
        }

        console.log(`Updating ${item.name} (ID: ${product.productid})...`);

        // 2. Update Product Specs (Prices, Q/C, C/P)
        const { error: upErr } = await supabase
            .from('products')
            .update({
                purchaseprice: item.buy,
                baseprice: item.sell,
                qteparcolis: item.qc,
                qtecolisparpalette: item.cp
            })
            .eq('productid', product.productid);

        if (upErr) console.error(`Error updating prices for ${item.name}:`, upErr.message);

        // 3. Update Inventory Quantity (Overwrite completely)
        const { error: invErr } = await supabase
            .from('inventory')
            .update({ quantityonhand: item.qty })
            .eq('productid', product.productid);

        if (invErr) console.error(`Error updating qty for ${item.name}:`, invErr.message);
    }

    console.log('--- SYNC FINISHED ---');
}

sync();
