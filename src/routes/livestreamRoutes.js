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

router.get('/status', livestreamController.getSystemStatus);

router.get('/camara/:camaraId/current', livestreamController.getCurrentLivestream);

router.get('/camara/:camaraId/last', livestreamController.getLastLivestream);

router.get('/camara/:camaraId/display', livestreamController.getDisplayLivestream);

router.get('/camara/:camaraId', livestreamController.getCamaraLivestreams);

router.post('/camara/:camaraId/check', livestreamController.forceCheckCamara);

module.exports = router;
