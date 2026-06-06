const express = require("express");
const router = express.Router();
const falaAoVivoController = require("../controllers/falaAoVivoController");
const { hasPermission } = require("../middleware/authMiddleware");

/**
 * Live-speaking routes for public status, TV notifications, and protected
 * timeout updates.
 */
const canMarkTempoEsgotado = hasPermission(["tv", "admin_camara", "super_admin"]);

// Public and TV routes do not require HTTP auth; TVs authenticate over sockets.
router.get("/status/:camaraId", falaAoVivoController.getStatusFala);
router.post("/notify", falaAoVivoController.notifyFalaAoVivo);

router.post(
	"/tempo-esgotado/:historicoId",
	canMarkTempoEsgotado,
	falaAoVivoController.markTempoEsgotado
);

module.exports = router;
