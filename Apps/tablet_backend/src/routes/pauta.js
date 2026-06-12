const express = require('express');
const router = express.Router();
const pautaController = require('../controllers/pautaController');
const { authenticateVereador } = require('../middleware/authMiddleware');

/**
 * Agenda routes for authenticated council member tablet sessions.
 *
 * @type {import('express').Router}
 */
router.use(authenticateVereador);

/**
 * @swagger
 * /api/pautas:
 *   get:
 *     summary: Listar Pautas da Câmara
 *     description: Retorna a lista de pautas ativas agrupadas pelo status da sessão da Câmara do vereador
 *     tags: [Pautas]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Lista de pautas retornada com sucesso
 *       401:
 *         description: Não autorizado (Requer JWT válido)
 */
router.get('/', pautaController.getPautasDaCamara);

/**
 * @swagger
 * /api/pautas/{id}:
 *   get:
 *     summary: Buscar Pauta por ID
 *     description: Retorna os detalhes de uma pauta específica
 *     tags: [Pautas]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         schema:
 *           type: string
 *         required: true
 *         description: O UUID da Pauta
 *     responses:
 *       200:
 *         description: Pauta retornada com sucesso
 *       404:
 *         description: Pauta não encontrada
 *       401:
 *         description: Não autorizado
 */
router.get('/:id', pautaController.getPautaById);

/**
 * @swagger
 * /api/pautas/{id}/estatisticas:
 *   get:
 *     summary: Estatísticas de Votação
 *     description: Retorna o balanço de votos (Favoráveis, Contrários, Abstenções) de uma pauta específica
 *     tags: [Pautas]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         schema:
 *           type: string
 *         required: true
 *         description: O UUID da Pauta
 *     responses:
 *       200:
 *         description: Estatísticas retornadas com sucesso
 *       401:
 *         description: Não autorizado
 */
router.get('/:id/estatisticas', pautaController.getEstatisticasVotacao);

module.exports = router;
