const pool = require('../config/database');

async function seed() {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        console.log('Seeding dummy products for ceramic dimensions...');

        // Fetch category
        const catRes = await client.query("SELECT CategoryID FROM Categories LIMIT 1");
        const categoryId = catRes.rows[0]?.categoryid || null;

        // Fetch brand
        const brandRes = await client.query("SELECT BrandID FROM Brands LIMIT 1");
        const brandId = brandRes.rows[0]?.brandid || null;

        // Fetch warehouse dynamically
        const whRes = await client.query("SELECT WarehouseID FROM Warehouses LIMIT 1");
        const warehouseId = whRes.rows[0]?.warehouseid || null;

        if (!warehouseId) {
            throw new Error("No warehouses found in DB.");
        }

        // Fetch units
        const sqmUnitRes = await client.query("SELECT UnitID FROM Units WHERE UnitCode = 'SQM' LIMIT 1");
        const sqmUnitId = sqmUnitRes.rows[0]?.unitid || null;

        const pcsUnitRes = await client.query("SELECT UnitID FROM Units WHERE UnitCode = 'PCS' LIMIT 1");
        const pcsUnitId = pcsUnitRes.rows[0]?.unitid || null;

        if (!sqmUnitId || !pcsUnitId) {
            throw new Error("Required units (SQM/PCS) not found in DB.");
        }

        const dummyProducts = [
            {
                code: 'DUMMY-20X20',
                name: 'Carrelage Blanc 20x20',
                size: '20x20',
                qteParColis: 1.00, // 1 m2 per carton (25 pieces of 0.04 m2)
                qteColisParPalette: 72,
                basePrice: 1200,
                purchasePrice: 800,
                baseUnit: 'SQM',
                isMeterBased: true,
                allowPiece: true,
                allowCarton: true
            },
            {
                code: 'DUMMY-30X30',
                name: 'Carrelage Beige 30x30',
                size: '30x30',
                qteParColis: 0.99, // 11 pieces of 0.09 m2
                qteColisParPalette: 60,
                basePrice: 1400,
                purchasePrice: 950,
                baseUnit: 'SQM',
                isMeterBased: true,
                allowPiece: true,
                allowCarton: true
            },
            {
                code: 'DUMMY-40X40',
                name: 'Carrelage Gris 40x40',
                size: '40x40',
                qteParColis: 0.96, // 6 pieces of 0.16 m2
                qteColisParPalette: 48,
                basePrice: 1600,
                purchasePrice: 1100,
                baseUnit: 'SQM',
                isMeterBased: true,
                allowPiece: true,
                allowCarton: true
            },
            {
                code: 'DUMMY-60X60',
                name: 'Porcelaine Elite 60x60',
                size: '60x60',
                qteParColis: 1.44, // 4 pieces of 0.36 m2
                qteColisParPalette: 36,
                basePrice: 2200,
                purchasePrice: 1500,
                baseUnit: 'SQM',
                isMeterBased: true,
                allowPiece: true,
                allowCarton: true
            },
            {
                code: 'DUMMY-80X80',
                name: 'Porcelaine Elite 80x80',
                size: '80x80',
                qteParColis: 1.28, // 2 pieces of 0.64 m2
                qteColisParPalette: 32,
                basePrice: 2800,
                purchasePrice: 1900,
                baseUnit: 'SQM',
                isMeterBased: true,
                allowPiece: true,
                allowCarton: true
            },
            {
                code: 'DUMMY-60X120',
                name: 'Porcelaine Elite 60x120',
                size: '60x120',
                qteParColis: 1.44, // 2 pieces of 0.72 m2
                qteColisParPalette: 30,
                basePrice: 3200,
                purchasePrice: 2200,
                baseUnit: 'SQM',
                isMeterBased: true,
                allowPiece: true,
                allowCarton: true
            },
            {
                code: 'DUMMY-BORDER',
                name: 'Listel Deco 8x30 (Piece)',
                size: '8x30',
                qteParColis: 1, // Sold individually
                qteColisParPalette: 1,
                basePrice: 450,
                purchasePrice: 250,
                baseUnit: 'PCS',
                isMeterBased: false,
                allowPiece: true,
                allowCarton: false
            }
        ];

        for (const dp of dummyProducts) {
            console.log(`Inserting ${dp.code}...`);
            
            // Clean up existing if any
            await client.query("DELETE FROM Products WHERE ProductCode = $1", [dp.code]);

            const pInsert = await client.query(`
                INSERT INTO Products (
                    ProductCode, ProductName, CategoryID, BrandID, PrimaryUnitID, 
                    BasePrice, PurchasePrice, Size, QteParColis, QteColisParPalette, 
                    BaseUnit, IsMeterBased, AllowPieceSale, AllowCartonDisplay, IsActive
                )
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, TRUE)
                RETURNING ProductID
            `, [
                dp.code, dp.name, categoryId, brandId, 
                dp.baseUnit === 'SQM' ? sqmUnitId : pcsUnitId,
                dp.basePrice, dp.purchasePrice, dp.size,
                dp.qteParColis, dp.qteColisParPalette,
                dp.baseUnit, dp.isMeterBased, dp.allowPiece, dp.allowCarton
            ]);

            const productId = pInsert.rows[0].productid;

            // Link primary unit in ProductUnits
            await client.query(`
                INSERT INTO ProductUnits (ProductID, UnitID, ConversionFactor, IsDefault)
                VALUES ($1, $2, 1.0, TRUE)
                ON CONFLICT DO NOTHING
            `, [productId, dp.baseUnit === 'SQM' ? sqmUnitId : pcsUnitId]);

            // If it supports carton display, link carton unit (BOX/CARTON etc. if exist)
            if (dp.allowCarton) {
                const cartonUnitRes = await client.query("SELECT UnitID FROM Units WHERE UnitCode = 'CARTON' OR UnitCode = 'COLIS' OR UnitCode = 'CRT' LIMIT 1");
                const cartonUnitId = cartonUnitRes.rows[0]?.unitid;
                if (cartonUnitId) {
                    await client.query(`
                        INSERT INTO ProductUnits (ProductID, UnitID, ConversionFactor, IsDefault)
                        VALUES ($1, $2, $3, FALSE)
                        ON CONFLICT DO NOTHING
                    `, [productId, cartonUnitId, dp.qteParColis]);
                }
            }

            // Create initial inventory of 1000 base units in warehouse
            await client.query(`
                INSERT INTO Inventory (ProductID, WarehouseID, OwnershipType, QuantityOnHand, PalletCount, ColisCount)
                VALUES ($1, $2, 'OWNED', 1000.0, $3, $4)
                ON CONFLICT (ProductID, WarehouseID, OwnershipType, FactoryID) DO UPDATE
                SET QuantityOnHand = 1000.0, PalletCount = EXCLUDED.PalletCount, ColisCount = EXCLUDED.ColisCount
            `, [
                productId,
                warehouseId,
                dp.qteColisParPalette > 0 ? (1000.0 / dp.qteParColis) / dp.qteColisParPalette : 0,
                dp.qteParColis > 0 ? 1000.0 / dp.qteParColis : 0
            ]);
        }

        await client.query('COMMIT');
        console.log('Dummy products seeded successfully!');

        // Refresh view
        try {
            await pool.query('REFRESH MATERIALIZED VIEW mv_Catalogue');
            console.log('Materialized view refreshed.');
        } catch (refreshErr) {
            console.warn('Failed to refresh mv_Catalogue:', refreshErr);
        }
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Error seeding dummy products:', error);
    } finally {
        client.release();
        await pool.end();
    }
}

seed();
