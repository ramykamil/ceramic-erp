const db = require('../../../config/database');

// Get all quick stock items
const getQuickStockItems = async (req, res) => {
    try {
        const result = await db.query(`
            SELECT 
                ItemID,
                ItemName,
                Quantity,
                UnitPrice,
                SoldQuantity,
                CreatedAt
            FROM QuickStockItems
            ORDER BY CreatedAt DESC
        `);

        res.json({
            success: true,
            data: result.rows
        });
    } catch (error) {
        console.error('Error fetching quick stock items:', error);
        res.status(500).json({ success: false, message: error.message });
    }
};

// Add new quick stock item
const addQuickStockItem = async (req, res) => {
    try {
        const { itemName, quantity, unitPrice } = req.body;

        if (!itemName) {
            return res.status(400).json({ success: false, message: 'Item name is required' });
        }

        const result = await db.query(`
            INSERT INTO QuickStockItems (ItemName, Quantity, UnitPrice, SoldQuantity)
            VALUES ($1, $2, $3, 0)
            RETURNING *
        `, [itemName, quantity || 0, unitPrice || 0]);

        res.json({
            success: true,
            data: result.rows[0],
            message: 'Item added successfully'
        });
    } catch (error) {
        console.error('Error adding quick stock item:', error);
        res.status(500).json({ success: false, message: error.message });
    }
};

// Update quick stock item
const updateQuickStockItem = async (req, res) => {
    try {
        const { id } = req.params;
        const { itemName, quantity, unitPrice } = req.body;

        const result = await db.query(`
            UPDATE QuickStockItems
            SET ItemName = COALESCE($1, ItemName),
                Quantity = COALESCE($2, Quantity),
                UnitPrice = COALESCE($3, UnitPrice)
            WHERE ItemID = $4
            RETURNING *
        `, [itemName, quantity, unitPrice, id]);

        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Item not found' });
        }

        res.json({
            success: true,
            data: result.rows[0],
            message: 'Item updated successfully'
        });
    } catch (error) {
        console.error('Error updating quick stock item:', error);
        res.status(500).json({ success: false, message: error.message });
    }
};

// Delete quick stock item
const deleteQuickStockItem = async (req, res) => {
    try {
        const { id } = req.params;

        await db.query('DELETE FROM QuickStockItems WHERE ItemID = $1', [id]);

        res.json({
            success: true,
            message: 'Item deleted successfully'
        });
    } catch (error) {
        console.error('Error deleting quick stock item:', error);
        res.status(500).json({ success: false, message: error.message });
    }
};

// Sell quick stock item (reduce quantity)
const sellQuickStockItem = async (req, res) => {
    try {
        const { id } = req.params;
        const { quantitySold, customerName, customerPhone } = req.body;

        if (!quantitySold || quantitySold <= 0) {
            return res.status(400).json({ success: false, message: 'Valid quantity is required' });
        }

        // Check available quantity
        const itemResult = await db.query(
            'SELECT * FROM QuickStockItems WHERE ItemID = $1',
            [id]
        );

        if (itemResult.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Item not found' });
        }

        const item = itemResult.rows[0];
        const availableQty = Number(item.quantity) - Number(item.soldquantity);

        if (quantitySold > availableQty) {
            return res.status(400).json({
                success: false,
                message: `Not enough stock. Available: ${availableQty}`
            });
        }

        // Update sold quantity
        const result = await db.query(`
            UPDATE QuickStockItems
            SET SoldQuantity = SoldQuantity + $1
            WHERE ItemID = $2
            RETURNING *
        `, [quantitySold, id]);

        const totalSale = quantitySold * Number(item.unitprice);

        res.json({
            success: true,
            data: result.rows[0],
            sale: {
                itemName: item.itemname,
                quantitySold,
                unitPrice: item.unitprice,
                totalAmount: totalSale,
                customerName,
                customerPhone
            },
            message: `Sold ${quantitySold} x ${item.itemname} = ${totalSale} DA`
        });
    } catch (error) {
        console.error('Error selling quick stock item:', error);
        res.status(500).json({ success: false, message: error.message });
    }
};

module.exports = {
    getQuickStockItems,
    addQuickStockItem,
    updateQuickStockItem,
    deleteQuickStockItem,
    sellQuickStockItem
};
