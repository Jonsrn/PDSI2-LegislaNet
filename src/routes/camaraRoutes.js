const express = require('express');
const router = express.Router();
const camaraController = require('../controllers/camaraController');
const { isSuperAdmin } = require('../middleware/authMiddleware');
const { uploadImage } = require('../middleware/imageUploadMiddleware');

/**
 * Super-admin routes for managing camara records.
 *
 * @module routes/camaraRoutes
 */

router.use(isSuperAdmin);

/**
 * @route   GET /api/camaras/:id
 * @desc    Get details for a specific camara.
 * @access  Private (Super Admin)
 */
router.get('/:id', camaraController.getCamaraById);

/**
 * @route   PUT /api/camaras/:id
 * @desc    Update camara information.
 * @access  Private (Super Admin)
 */
router.put('/:id', uploadImage('camara', 'brasao'), camaraController.updateCamara);


module.exports = router;
