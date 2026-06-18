const express = require('express');
const router = express.Router();
const votoController = require('../controllers/votoController');
const { authenticateVereador } = require('../middleware/authMiddleware');

/**
 * Vote routes for authenticated council member tablet sessions.
 *
 * @type {import('express').Router}
 */
router.use(authenticateVereador);

/**
 * @swagger
 * /api/votos:
 *   post:
 *     summary: Registrar ou Atualizar Voto
 *     description: Computa o voto do vereador autenticado em uma pauta específica
 *     tags: [Votos]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - pautaId
 *               - voto
 *             properties:
 *               pauta_id:
 *                 type: string
 *               voto:
 *                 type: string
 *                 enum: ["Sim", "Não", "Abstenção"]
 *     responses:
 *       200:
 *         description: Voto computado com sucesso
 *       400:
 *         description: Parâmetros inválidos
 *       401:
 *         description: Não autorizado
 */
router.post('/', votoController.registrarVoto);

/**
 * @swagger
 * /api/votos/meus-votos:
 *   get:
 *     summary: Histórico de Votos
 *     description: Retorna todos os votos computados pelo vereador logado
 *     tags: [Votos]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Histórico retornado com sucesso
 *       401:
 *         description: Não autorizado
 */
router.get('/meus-votos', votoController.getVotosDoVereador);

/**
 * @swagger
 * /api/votos/pauta/{pauta_id}:
 *   get:
 *     summary: Meu Voto em Pauta
 *     description: Retorna o voto do vereador logado para uma pauta específica (se houver)
 *     tags: [Votos]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: pauta_id
 *         schema:
 *           type: string
 *         required: true
 *         description: UUID da pauta
 *     responses:
 *       200:
 *         description: Voto retornado com sucesso
 *       401:
 *         description: Não autorizado
 */
router.get('/pauta/:pauta_id', votoController.getVotoEmPauta);

/**
 * @swagger
 * /api/votos/pauta/{pauta_id}/estatisticas:
 *   get:
 *     summary: Estatísticas de Votos da Pauta
 *     description: Retorna o somatório de votos da pauta específica
 *     tags: [Votos]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: pauta_id
 *         schema:
 *           type: string
 *         required: true
 *     responses:
 *       200:
 *         description: Estatísticas geradas com sucesso
 *       401:
 *         description: Não autorizado
 */
router.get('/pauta/:pauta_id/estatisticas', votoController.getEstatisticasPauta);

module.exports = router;
