const express = require('express');
const router = express.Router();
const partidoController = require('../controllers/partidoController');

/**
 * Partido lookup routes used by form workflows.
 *
 * @module routes/partidos
 */
/**
 * @swagger
 * /api/partidos:
 *   get:
 *     summary: Lista todos os partidos políticos cadastrados
 *     tags: [Público]
 *     responses:
 *       200:
 *         description: Lista de partidos
 */
router.get('/', partidoController.getAllPartidos);

module.exports = router;
