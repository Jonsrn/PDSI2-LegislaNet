const express = require("express");
const router = express.Router();
const pautaController = require("../controllers/pautaController");
const { uploadSingle } = require("../middleware/uploadMiddleware");
const { canManagePautas } = require("../middleware/authMiddleware");

/**
 * Protected agenda routes for listing, creating, updating, and deleting pautas.
 *
 * @module routes/pautas
 */

router.get("/", canManagePautas, pautaController.getAllPautas);

router.get("/autores", canManagePautas, pautaController.getAutoresPautas);

router.post(
  "/",
  canManagePautas,
  uploadSingle("arquivo"),
  pautaController.createPauta
);

router.get("/:id", canManagePautas, pautaController.getPautaById);

router.put("/:id/status", canManagePautas, pautaController.updatePautaStatus);

router.put(
  "/:id/resultado",
  canManagePautas,
  pautaController.updateResultadoVotacao
);

router.put(
  "/:id",
  canManagePautas,
  uploadSingle("arquivo"),
  pautaController.updatePauta
);

router.delete("/:id", canManagePautas, pautaController.deletePauta);

module.exports = router;
