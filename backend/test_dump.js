const pool = require('./src/config/database');
pool.query("SELECT pg_get_viewdef('mv_Catalogue')")
    .then(res => {
        console.log(res.rows[0].pg_get_viewdef);
        pool.end();
    });
