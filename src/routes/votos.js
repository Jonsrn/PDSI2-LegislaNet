const express = require('express');
const router = express.Router();
const votoController = require('../controllers/votoController');

/**
 * Vote routes for creating votes and reading agenda vote data.
 *
 * @module routes/votos
 */

router.post('/', votoController.createVoto);

router.get('/pauta/:pauta_id', votoController.getVotosPorPauta);

router.get('/pauta/:pauta_id/totals', votoController.getVotosTotals);

module.exports = router;
