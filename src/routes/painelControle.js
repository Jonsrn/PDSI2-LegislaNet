const express = require("express");
const router = express.Router();
const painelControleController = require("../controllers/painelControleController");
const { hasPermission } = require("../middleware/authMiddleware");

/**
 * Control-panel routes for chamber admins to manage voting and speaker turns.
 */
const canAccessPainelControle = hasPermission(["admin_camara", "super_admin"]);

router.get(
  "/pautas-em-votacao",
  canAccessPainelControle,
  painelControleController.getPautasEmVotacao
);

router.get(
  "/oradores",
  canAccessPainelControle,
  painelControleController.getOradoresAtivos
);

router.post(
  "/iniciar-votacao/:pautaId",
  canAccessPainelControle,
  painelControleController.iniciarVotacao
);

router.post(
  "/iniciar-fala/:oradorId",
  canAccessPainelControle,
  painelControleController.iniciarFala
);

router.post(
  "/iniciar-fala-start/:oradorId",
  canAccessPainelControle,
  painelControleController.iniciarFalaStart
);

router.post(
  "/encerrar-fala/:oradorId",
  canAccessPainelControle,
  painelControleController.encerrarFala
);

// Speaker-history controls are separate from voting actions.
router.get(
  "/fala-ativa",
  canAccessPainelControle,
  painelControleController.getFalaAtiva
);

router.post(
  "/fala/:historicoId/iniciar",
  canAccessPainelControle,
  painelControleController.iniciarFalaByHistorico
);

router.post(
  "/fala/:historicoId/pausar",
  canAccessPainelControle,
  painelControleController.pausarFala
);

router.post(
  "/fala/:historicoId/retomar",
  canAccessPainelControle,
  painelControleController.retomarFala
);

router.post(
  "/fala/:historicoId/adicionar-tempo",
  canAccessPainelControle,
  painelControleController.adicionarTempoFala
);

router.post(
  "/fala/:historicoId/recomecar",
  canAccessPainelControle,
  painelControleController.recomecarFala
);

router.post(
  "/fala/:historicoId/encerrar",
  canAccessPainelControle,
  painelControleController.encerrarFalaByHistorico
);

module.exports = router;
