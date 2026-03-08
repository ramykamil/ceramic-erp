const pool = require('./src/config/database');
pool.query("SELECT * FROM Inventory WHERE ProductID = 4018")
    .then(res => {
        console.table(res.rows);
        pool.end();
    });
