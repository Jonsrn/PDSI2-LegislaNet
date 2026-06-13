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
 * @swagger
 * /api/camaras/{id}:
 *   get:
 *     summary: Retorna detalhes de uma câmara específica
 *     tags: [Super Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Detalhes da câmara
 */
router.get('/:id', camaraController.getCamaraById);

/**
 * @swagger
 * /api/camaras/{id}:
 *   put:
 *     summary: Edita dados e brasão de uma câmara
 *     tags: [Super Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *     responses:
 *       200:
 *         description: Câmara atualizada com sucesso
 */
router.put('/:id', uploadImage('camara', 'brasao'), camaraController.updateCamara);


module.exports = router;
