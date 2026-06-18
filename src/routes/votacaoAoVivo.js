const express = require("express");
const router = express.Router();
const votacaoAoVivoController = require("../controllers/votacaoAoVivoController");

/**
 * Live-voting routes for cross-server notifications and public status reads.
 */

// Internal trusted-server routes used by the tablet backend on port 3003.
/**
 * @swagger
 * /api/votacao-ao-vivo/notify:
 *   post:
 *     summary: Notifica que uma nova pauta entrou em votação (Uso interno)
 *     tags: [Exibição TV / Ao Vivo]
 *     responses:
 *       200:
 *         description: Notificação enviada
 */
router.post("/notify", votacaoAoVivoController.notifyVotacaoAoVivo);
/**
 * @swagger
 * /api/votacao-ao-vivo/notify-voto:
 *   post:
 *     summary: Notifica o telão que um vereador votou (Uso interno)
 *     tags: [Exibição TV / Ao Vivo]
 *     responses:
 *       200:
 *         description: Notificação enviada
 */
router.post("/notify-voto", votacaoAoVivoController.notifyVoto);

// Public status route for portal and TV clients; returns non-sensitive live state.
/**
 * @swagger
 * /api/votacao-ao-vivo/status/{camaraId}:
 *   get:
 *     summary: Exibe o status da votação em andamento na câmara (Para a TV)
 *     tags: [Exibição TV / Ao Vivo]
 *     parameters:
 *       - in: path
 *         name: camaraId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Status da votação atual
 */
router.get("/status/:camaraId", votacaoAoVivoController.getStatusVotacao);

module.exports = router;
