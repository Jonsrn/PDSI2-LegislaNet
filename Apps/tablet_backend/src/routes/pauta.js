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
 * Lists agenda items grouped by status for the authenticated chamber.
 */
router.get('/', pautaController.getPautasDaCamara);

/**
 * Returns one agenda item by ID.
 */
router.get('/:id', pautaController.getPautaById);

/**
 * Returns vote statistics for one agenda item.
 */
router.get('/:id/estatisticas', pautaController.getEstatisticasVotacao);

module.exports = router;
