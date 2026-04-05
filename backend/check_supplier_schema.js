
const pool = require('./src/config/database');

async function checkSupplierSchema() {
    try {
        console.log("--- BRANDS ---");
        const brands = await pool.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'brands'");
        console.table(brands.rows);

        console.log("--- FACTORIES ---");
        const factories = await pool.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'factories'");
        console.table(factories.rows);
    } catch (e) {
        console.error(e);
    } finally {
        pool.end();
    }
}

checkSupplierSchema();
