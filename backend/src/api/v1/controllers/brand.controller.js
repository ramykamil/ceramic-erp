// backend/src/api/v1/controllers/brand.controller.js
const pool = require('../../../config/database'); //

/**
 * Get all active brands
 */
async function getAllBrands(req, res, next) {
  try {
    // REMOVED: WHERE IsActive = TRUE
    const result = await pool.query('SELECT BrandID, BrandName, Description, IsActive, InitialBalance, CurrentBalance FROM Brands ORDER BY BrandName');
    res.json({ success: true, data: result.rows });
  } catch (error) { next(error); }
}

/**
 * Get a single brand by ID
 */
async function getBrandById(req, res, next) {
  try {
    const { id } = req.params;
    const result = await pool.query('SELECT * FROM Brands WHERE BrandID = $1', [id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Marque non trouvée' });
    }
    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    next(error);
  }
}

/**
 * Create a new brand
 */
async function createBrand(req, res, next) {
  try {
    const { brandName, description, initialBalance } = req.body;
    if (!brandName) {
      return res.status(400).json({ success: false, message: 'Le nom de la marque est requis' });
    }
    const balance = parseFloat(initialBalance) || 0;
    const query = `
      INSERT INTO Brands (BrandName, Description, InitialBalance, CurrentBalance)
      VALUES ($1, $2, $3, $3)
      RETURNING *
    `;
    const result = await pool.query(query, [brandName, description || null, balance]);
    res.status(201).json({ success: true, message: 'Marque créée avec succès', data: result.rows[0] });
  } catch (error) {
    // Handle unique constraint violation
    if (error.code === '23505') {
      return res.status(400).json({ success: false, message: 'Ce nom de marque existe déjà' });
    }
    next(error);
  }
}

/**
 * Update an existing brand
 */
async function updateBrand(req, res, next) {
  try {
    const { id } = req.params;
    const { brandName, description, isActive, initialBalance } = req.body;

    // Basic validation
    if (!brandName && description === undefined && isActive === undefined && initialBalance === undefined) {
      return res.status(400).json({ success: false, message: 'Aucune donnée à mettre à jour fournie' });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Check for existence and get old values
      const oldRes = await client.query('SELECT InitialBalance, CurrentBalance FROM Brands WHERE BrandID = $1 FOR UPDATE', [id]);
      if (oldRes.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ success: false, message: 'Marque non trouvée' });
      }
      const oldInitial = parseFloat(oldRes.rows[0].initialbalance) || 0;
      const oldCurrent = parseFloat(oldRes.rows[0].currentbalance) || 0;

      let newCurrent = oldCurrent;
      let newInitial = oldInitial;

      if (initialBalance !== undefined) {
        newInitial = parseFloat(initialBalance) || 0;
        const diff = newInitial - oldInitial;
        newCurrent = oldCurrent + diff;
      }

      const query = `
          UPDATE Brands
          SET
            BrandName = COALESCE($1, BrandName),
            Description = COALESCE($2, Description),
            IsActive = COALESCE($3, IsActive),
            InitialBalance = $4,
            CurrentBalance = $5,
            UpdatedAt = CURRENT_TIMESTAMP
          WHERE BrandID = $6
          RETURNING *
        `;
      const result = await client.query(query, [brandName, description, isActive, newInitial, newCurrent, id]);

      await client.query('COMMIT');
      res.json({ success: true, message: 'Marque mise à jour avec succès', data: result.rows[0] });

    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  } catch (error) {
    // Handle unique constraint violation
    if (error.code === '23505') {
      return res.status(400).json({ success: false, message: 'Ce nom de marque existe déjà' });
    }
    next(error);
  }
}

/**
 * Delete a brand (soft delete by setting IsActive = FALSE)
 */
async function deleteBrand(req, res, next) {
  try {
    const { id } = req.params;
    // Check if brand is associated with any products first (optional but recommended)
    // const productCheck = await pool.query('SELECT 1 FROM Products WHERE BrandID = $1 LIMIT 1', [id]);
    // if (productCheck.rows.length > 0) {
    //    return res.status(400).json({ success: false, message: 'Impossible de supprimer, marque associée à des produits. Désactivez-la plutôt.' });
    // }

    // Perform a soft delete
    const query = `
      UPDATE Brands
      SET IsActive = FALSE, UpdatedAt = CURRENT_TIMESTAMP
      WHERE BrandID = $1
      RETURNING BrandID -- Return only ID to confirm
    `;
    // For hard delete: DELETE FROM Brands WHERE BrandID = $1 RETURNING *

    const result = await pool.query(query, [id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Marque non trouvée' });
    }
    res.json({ success: true, data: result.rows });
  } catch (error) {
    next(error); // Pass error to the global error handler
  }
}

module.exports = {
  getAllBrands,
  getBrandById,
  createBrand,
  updateBrand,
  deleteBrand,
};