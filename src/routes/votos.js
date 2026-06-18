const express = require('express');
const router = express.Router();
const votoController = require('../controllers/votoController');

/**
 * Vote routes for creating votes and reading agenda vote data.
 *
 * @module routes/votos
 */

/**
 * @swagger
 * /api/votos:
 *   post:
 *     summary: Registra um voto manual pelo App
 *     tags: [Gestão da Câmara]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       201:
 *         description: Voto registrado
 */
router.post('/', votoController.createVoto);

/**
 * @swagger
 * /api/votos/pauta/{pauta_id}:
 *   get:
 *     summary: Lista todos os votos nominais de uma pauta
 *     tags: [Gestão da Câmara]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: pauta_id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Lista de votos
 */
router.get('/pauta/:pauta_id', votoController.getVotosPorPauta);

/**
 * @swagger
 * /api/votos/pauta/{pauta_id}/totals:
 *   get:
 *     summary: Retorna a contagem total de votos (Sim, Não, Abstenção)
 *     tags: [Gestão da Câmara]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: pauta_id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Totais dos votos
 */
router.get('/pauta/:pauta_id/totals', votoController.getVotosTotals);

module.exports = router;
