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
/**
 * @swagger
 * /api/fala-ao-vivo/status/{camaraId}:
 *   get:
 *     summary: Exibe o status da fala ativa na tribuna (Para a TV)
 *     tags: [Exibição TV / Ao Vivo]
 *     parameters:
 *       - in: path
 *         name: camaraId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Orador ativo e tempo na tribuna
 */
router.get("/status/:camaraId", falaAoVivoController.getStatusFala);
/**
 * @swagger
 * /api/fala-ao-vivo/notify:
 *   post:
 *     summary: Notifica a TV sobre mudança no cronômetro da fala (Uso interno)
 *     tags: [Exibição TV / Ao Vivo]
 *     responses:
 *       200:
 *         description: Evento de fala transmitido
 */
router.post("/notify", falaAoVivoController.notifyFalaAoVivo);

/**
 * @swagger
 * /api/fala-ao-vivo/tempo-esgotado/{historicoId}:
 *   post:
 *     summary: Marca que o tempo do orador terminou automaticamente
 *     tags: [Exibição TV / Ao Vivo]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: historicoId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Histórico encerrado por tempo esgotado
 */
router.post(
	"/tempo-esgotado/:historicoId",
	canMarkTempoEsgotado,
	falaAoVivoController.markTempoEsgotado
);

module.exports = router;
