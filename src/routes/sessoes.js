const express = require("express");
const router = express.Router();
const { body } = require("express-validator");
const sessoesController = require("../controllers/sessoesController");
const vereadorController = require("../controllers/vereadorController");
const oradoresController = require("../controllers/oradoresController");
const { canManageSessoes } = require("../middleware/authMiddleware");
const { handleValidationErrors } = require("../middleware/securityMiddleware");
const { sessaoValidation } = require("../validators/sessaoValidator");

/**
 * Protected session and speaker management routes.
 *
 * @module routes/sessoes
 */

router.get("/", canManageSessoes, sessoesController.getAllSessoes);

router.get(
  "/disponiveis",
  canManageSessoes,
  sessoesController.getSessoesDisponiveis
);

router.get("/opcoes", canManageSessoes, sessoesController.getSessoesOpcoes);

router.get(
  "/vereadores-ativos",
  canManageSessoes,
  vereadorController.getVereadoresAtivos
);

// Speaker routes must stay before parameterized session routes.
router.get("/oradores", canManageSessoes, oradoresController.getAllOradores);

router.post("/oradores", canManageSessoes, oradoresController.createOrador);

router.put(
  "/oradores/:id",
  canManageSessoes,
  oradoresController.updateTempoOrador
);

router.delete(
  "/oradores/:id",
  canManageSessoes,
  oradoresController.deleteOrador
);

router.get("/:id", canManageSessoes, sessoesController.getSessaoById);

router.post(
  "/",
  canManageSessoes,
  sessaoValidation,
  handleValidationErrors,
  sessoesController.createSessao
);

router.put(
  "/:id",
  canManageSessoes,
  sessaoValidation,
  handleValidationErrors,
  sessoesController.updateSessao
);

router.delete("/:id", canManageSessoes, sessoesController.deleteSessao);

router.get(
  "/:sessaoId/oradores",
  canManageSessoes,
  oradoresController.getOradoresBySessao
);

module.exports = router;
