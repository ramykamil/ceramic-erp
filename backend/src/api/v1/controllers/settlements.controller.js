const pool = require('../../../config/database');

const settlementsController = {
    // Get all factories for the dropdown
    getFactories: async (req, res) => {
        try {
            const result = await pool.query('SELECT * FROM Factories ORDER BY FactoryName');
            res.json({ success: true, data: result.rows });
        } catch (error) {
            console.error('Error fetching factories:', error);
            res.status(500).json({ success: false, message: 'Erreur lors de la récupération des usines' });
        }
    },

    // Generate a new settlement
    generateSettlement: async (req, res) => {
        const { factoryId, startDate, endDate } = req.body;

        if (!factoryId || !startDate || !endDate) {
            return res.status(400).json({ success: false, message: 'Paramètres manquants' });
        }

        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            // 1. Calculate total amount owed based on BasePrice of sold items
            // We join OrderItems -> Products -> Brands to filter by FactoryID
            // We join OrderItems -> Orders to filter by Date and Status
            const query = `
        SELECT 
          COALESCE(SUM(oi.Quantity * p.BasePrice), 0) as TotalAmount
        FROM OrderItems oi
        JOIN Products p ON oi.ProductID = p.ProductID
        JOIN Brands b ON p.BrandID = b.BrandID
        JOIN Orders o ON oi.OrderID = o.OrderID
        WHERE 
          b.FactoryID = $1
          AND o.OrderDate >= $2
          AND o.OrderDate <= $3
          AND o.Status NOT IN ('CANCELLED', 'DRAFT')
      `;

            const result = await client.query(query, [factoryId, startDate, endDate]);
            const totalAmount = parseFloat(result.rows[0].totalamount);

            if (totalAmount <= 0) {
                await client.query('ROLLBACK');
                return res.status(400).json({ success: false, message: 'Aucune vente trouvée pour cette période' });
            }

            // 2. Create Settlement Record
            const insertQuery = `
        INSERT INTO Settlements (FactoryID, StartDate, EndDate, TotalAmount, Status)
        VALUES ($1, $2, $3, $4, 'PENDING')
        RETURNING *
      `;

            const insertResult = await client.query(insertQuery, [factoryId, startDate, endDate, totalAmount]);

            await client.query('COMMIT');

            res.status(201).json({
                success: true,
                message: 'Règlement généré avec succès',
                data: insertResult.rows[0]
            });

        } catch (error) {
            await client.query('ROLLBACK');
            console.error('Error generating settlement:', error);
            res.status(500).json({ success: false, message: 'Erreur lors de la génération du règlement' });
        } finally {
            client.release();
        }
    },

    // Get all settlements
    getSettlements: async (req, res) => {
        try {
            const query = `
        SELECT 
          s.*,
          f.FactoryName
        FROM Settlements s
        JOIN Factories f ON s.FactoryID = f.FactoryID
        ORDER BY s.CreatedAt DESC
      `;
            const result = await pool.query(query);
            res.json({ success: true, data: result.rows });
        } catch (error) {
            console.error('Error fetching settlements:', error);
            res.status(500).json({ success: false, message: 'Erreur lors de la récupération des règlements' });
        }
    },

    // Update settlement status
    updateSettlementStatus: async (req, res) => {
        const { id } = req.params;
        const { status } = req.body;

        if (!['PENDING', 'PAID'].includes(status)) {
            return res.status(400).json({ success: false, message: 'Statut invalide' });
        }

        try {
            const result = await pool.query(
                'UPDATE Settlements SET Status = $1 WHERE SettlementID = $2 RETURNING *',
                [status, id]
            );

            if (result.rows.length === 0) {
                return res.status(404).json({ success: false, message: 'Règlement non trouvé' });
            }

            res.json({ success: true, data: result.rows[0] });
        } catch (error) {
            console.error('Error updating settlement status:', error);
            res.status(500).json({ success: false, message: 'Erreur lors de la mise à jour du statut' });
        }
    }
};

module.exports = settlementsController;
