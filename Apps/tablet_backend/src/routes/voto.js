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
 * Registers or updates a vote for an agenda item.
 */
router.post('/', votoController.registrarVoto);

/**
 * Returns all votes cast by the authenticated council member.
 */
router.get('/meus-votos', votoController.getVotosDoVereador);

/**
 * Returns the authenticated council member vote for one agenda item.
 */
router.get('/pauta/:pauta_id', votoController.getVotoEmPauta);

/**
 * Returns vote statistics for one agenda item.
 */
router.get('/pauta/:pauta_id/estatisticas', votoController.getEstatisticasPauta);

module.exports = router;
