const express = require('express');
const router = express.Router();
const partidoController = require('../controllers/partidoController');

/**
 * Partido lookup routes used by form workflows.
 *
 * @module routes/partidos
 */
router.get('/', partidoController.getAllPartidos);

module.exports = router;
