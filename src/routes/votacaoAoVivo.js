const express = require("express");
const router = express.Router();
const votacaoAoVivoController = require("../controllers/votacaoAoVivoController");

/**
 * Live-voting routes for cross-server notifications and public status reads.
 */

// Internal trusted-server routes used by the tablet backend on port 3003.
router.post("/notify", votacaoAoVivoController.notifyVotacaoAoVivo);
router.post("/notify-voto", votacaoAoVivoController.notifyVoto);

// Public status route for portal and TV clients; returns non-sensitive live state.
router.get("/status/:camaraId", votacaoAoVivoController.getStatusVotacao);

module.exports = router;
