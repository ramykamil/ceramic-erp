const pool = require('./src/config/database');
const fs = require('fs');
const path = require('path');

async function applyViewUpdate() {
    console.log('Starting migration to update mv_Catalogue...');
    const sqlPath = path.join(__dirname, 'CREATE_CATALOGUE_VIEW.sql');
    
    try {
        const sql = fs.readFileSync(sqlPath, 'utf-8');
        console.log('Reading SQL from:', sqlPath);
        
        // Materialized views cannot be easily altered this way if they depend on other things,
        // but our CREATE_CATALOGUE_VIEW.sql drops it first.
        const result = await pool.query(sql);
        console.log('✓ Materialized View Updated Successfully.');
        console.log('Result:', result.rows || result.command);
    } catch (error) {
        console.error('❌ Error applying view update:', error);
    } finally {
        await pool.end();
        process.exit();
    }
}

applyViewUpdate();
