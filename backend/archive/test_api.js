const { Pool } = require('pg');

const pool = new Pool({
    host: 'localhost',
    port: 5432,
    database: 'ceramic_erp',
    user: 'postgres',
    password: 'postgres',
});

async function main() {
    try {
        const res = await pool.query(`
      SELECT ProductID, ProductCode, ProductName, Famille
      FROM mv_Catalogue
      WHERE ProductName IN (
        'FICHE:MONDO CREMA 45/45',
        'FICHE:MIRAGE MARFIL REC 60/60',
        'FICHE:MONTREAL PERLA REC 60/60',
        'FICHE:MONTREAL 30/60',
        'FICHE:MILANO POLI REC 90/90'
      )
    `);

        console.table(res.rows);

    } catch (err) {
        console.error(err);
    } finally {
        pool.end();
    }
}

main();
