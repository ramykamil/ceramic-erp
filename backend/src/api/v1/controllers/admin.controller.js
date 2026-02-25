const pool = require('../../../config/database');

/**
 * Run size extraction on all products
 */
async function runSizeExtraction(req, res, next) {
    try {
        const products = await pool.query("SELECT ProductID, ProductName FROM Products WHERE Size IS NULL OR Size = 'Standard'");
        let count = 0;

        for (const p of products.rows) {
            // Regex to find patterns like "60x60", "120x60", "45*45", "120/60"
            const match = p.productname.match(/(\d{2,3})\s*[xX*\/]\s*(\d{2,3})/);
            if (match) {
                const detectedSize = `${match[1]}x${match[2]}`; // Normalize to "60x60"
                await pool.query("UPDATE Products SET Size = $1 WHERE ProductID = $2", [detectedSize, p.productid]);
                count++;
            }
        }

        res.json({
            success: true,
            message: `${count} products updated with detected sizes.`
        });
    } catch (error) {
        next(error);
    }
}

module.exports = {
    runSizeExtraction
};
