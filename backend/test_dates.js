const pool = require('./src/config/database');
pool.query('SELECT OrderID, OrderNumber, OrderDate FROM Orders ORDER BY OrderID DESC LIMIT 5').then(res => {
    console.log(JSON.stringify(res.rows, null, 2));
    process.exit(0);
}).catch(err => {
    console.error(err);
    process.exit(1);
});
