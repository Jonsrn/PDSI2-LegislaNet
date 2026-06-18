/**
 * Livestream routes for querying YouTube livestream state and triggering
 * manual checks.
 */

const express = require('express');
const router = express.Router();
const livestreamController = require('../controllers/livestreamController');

// Log each livestream route request for operational troubleshooting.
router.use((req, res, next) => {
    console.log(`[LIVESTREAM_ROUTES] ${new Date().toISOString()} - ${req.method} ${req.originalUrl}`);
    next();
});

/**
 * @swagger
 * /api/livestreams/status:
 *   get:
 *     summary: Retorna o status geral do serviço de Livestream e Webhooks
 *     tags: [Exibição TV / Ao Vivo]
 *     responses:
 *       200:
 *         description: Status do sistema
 */
router.get('/status', livestreamController.getSystemStatus);

/**
 * @swagger
 * /api/livestreams/camara/{camaraId}/current:
 *   get:
 *     summary: Retorna a livestream ativa no momento (se houver)
 *     tags: [Exibição TV / Ao Vivo]
 *     parameters:
 *       - in: path
 *         name: camaraId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Livestream atual
 */
router.get('/camara/:camaraId/current', livestreamController.getCurrentLivestream);

/**
 * @swagger
 * /api/livestreams/camara/{camaraId}/last:
 *   get:
 *     summary: Retorna a última livestream registrada (mesmo finalizada)
 *     tags: [Exibição TV / Ao Vivo]
 *     parameters:
 *       - in: path
 *         name: camaraId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Última livestream
 */
router.get('/camara/:camaraId/last', livestreamController.getLastLivestream);

/**
 * @swagger
 * /api/livestreams/camara/{camaraId}/display:
 *   get:
 *     summary: Retorna os dados da livestream que a TV deve exibir (Current ou Last)
 *     tags: [Exibição TV / Ao Vivo]
 *     parameters:
 *       - in: path
 *         name: camaraId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Dados de exibição da livestream
 */
router.get('/camara/:camaraId/display', livestreamController.getDisplayLivestream);

/**
 * @swagger
 * /api/livestreams/camara/{camaraId}:
 *   get:
 *     summary: Lista o histórico completo de livestreams de uma câmara
 *     tags: [Exibição TV / Ao Vivo]
 *     parameters:
 *       - in: path
 *         name: camaraId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Lista de livestreams
 */
router.get('/camara/:camaraId', livestreamController.getCamaraLivestreams);

/**
 * @swagger
 * /api/livestreams/camara/{camaraId}/check:
 *   post:
 *     summary: Força a verificação da API do YouTube para achar novas lives (Uso interno/Mesa)
 *     tags: [Exibição TV / Ao Vivo]
 *     parameters:
 *       - in: path
 *         name: camaraId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Check concluído
 */
router.post('/camara/:camaraId/check', livestreamController.forceCheckCamara);

module.exports = router;
