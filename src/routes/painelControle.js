const express = require("express");
const router = express.Router();
const painelControleController = require("../controllers/painelControleController");
const { hasPermission } = require("../middleware/authMiddleware");

/**
 * Control-panel routes for chamber admins to manage voting and speaker turns.
 */
const canAccessPainelControle = hasPermission(["admin_camara", "super_admin"]);

/**
 * @swagger
 * /api/painel-controle/pautas-em-votacao:
 *   get:
 *     summary: Lista as pautas abertas para votação na Sessão Ativa
 *     tags: [Painel de Controle (Tablet/Mesa)]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Pautas em votação
 */
router.get(
  "/pautas-em-votacao",
  canAccessPainelControle,
  painelControleController.getPautasEmVotacao
);

/**
 * @swagger
 * /api/painel-controle/oradores:
 *   get:
 *     summary: Lista oradores inscritos da Sessão Ativa
 *     tags: [Painel de Controle (Tablet/Mesa)]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Oradores inscritos
 */
router.get(
  "/oradores",
  canAccessPainelControle,
  painelControleController.getOradoresAtivos
);

/**
 * @swagger
 * /api/painel-controle/iniciar-votacao/{pautaId}:
 *   post:
 *     summary: Inicia a votação de uma pauta (Transmite para TV e Vereadores)
 *     tags: [Painel de Controle (Tablet/Mesa)]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: pautaId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Votação iniciada
 */
router.post(
  "/iniciar-votacao/:pautaId",
  canAccessPainelControle,
  painelControleController.iniciarVotacao
);

/**
 * @swagger
 * /api/painel-controle/iniciar-fala/{oradorId}:
 *   post:
 *     summary: Aciona um vereador para ir à tribuna (Fila de Fala)
 *     tags: [Painel de Controle (Tablet/Mesa)]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: oradorId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Fala acionada
 */
router.post(
  "/iniciar-fala/:oradorId",
  canAccessPainelControle,
  painelControleController.iniciarFala
);

/**
 * @swagger
 * /api/painel-controle/iniciar-fala-start/{oradorId}:
 *   post:
 *     summary: Dispara o cronômetro da fala do orador na TV
 *     tags: [Painel de Controle (Tablet/Mesa)]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: oradorId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Cronômetro disparado
 */
router.post(
  "/iniciar-fala-start/:oradorId",
  canAccessPainelControle,
  painelControleController.iniciarFalaStart
);

/**
 * @swagger
 * /api/painel-controle/encerrar-fala/{oradorId}:
 *   post:
 *     summary: Interrompe a fala ativa do orador
 *     tags: [Painel de Controle (Tablet/Mesa)]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: oradorId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Fala encerrada
 */
router.post(
  "/encerrar-fala/:oradorId",
  canAccessPainelControle,
  painelControleController.encerrarFala
);

// Speaker-history controls are separate from voting actions.
/**
 * @swagger
 * /api/painel-controle/fala-ativa:
 *   get:
 *     summary: Consulta o histórico/estado da fala ativa no momento
 *     tags: [Painel de Controle (Tablet/Mesa)]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Status da fala ativa
 */
router.get(
  "/fala-ativa",
  canAccessPainelControle,
  painelControleController.getFalaAtiva
);

/**
 * @swagger
 * /api/painel-controle/fala/{historicoId}/iniciar:
 *   post:
 *     summary: Retoma uma fala pelo ID do Histórico
 *     tags: [Painel de Controle (Tablet/Mesa)]
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
 *         description: Fala reiniciada
 */
router.post(
  "/fala/:historicoId/iniciar",
  canAccessPainelControle,
  painelControleController.iniciarFalaByHistorico
);

/**
 * @swagger
 * /api/painel-controle/fala/{historicoId}/pausar:
 *   post:
 *     summary: Pausa temporariamente o cronômetro da TV
 *     tags: [Painel de Controle (Tablet/Mesa)]
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
 *         description: Cronômetro pausado
 */
router.post(
  "/fala/:historicoId/pausar",
  canAccessPainelControle,
  painelControleController.pausarFala
);

/**
 * @swagger
 * /api/painel-controle/fala/{historicoId}/retomar:
 *   post:
 *     summary: Retoma o cronômetro da TV após uma pausa
 *     tags: [Painel de Controle (Tablet/Mesa)]
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
 *         description: Cronômetro retomado
 */
router.post(
  "/fala/:historicoId/retomar",
  canAccessPainelControle,
  painelControleController.retomarFala
);

/**
 * @swagger
 * /api/painel-controle/fala/{historicoId}/adicionar-tempo:
 *   post:
 *     summary: Adiciona tempo extra ao orador ativo
 *     tags: [Painel de Controle (Tablet/Mesa)]
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
 *         description: Tempo adicionado
 */
router.post(
  "/fala/:historicoId/adicionar-tempo",
  canAccessPainelControle,
  painelControleController.adicionarTempoFala
);

/**
 * @swagger
 * /api/painel-controle/fala/{historicoId}/recomecar:
 *   post:
 *     summary: Zera e reinicia o cronômetro da fala
 *     tags: [Painel de Controle (Tablet/Mesa)]
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
 *         description: Cronômetro recomeçado
 */
router.post(
  "/fala/:historicoId/recomecar",
  canAccessPainelControle,
  painelControleController.recomecarFala
);

/**
 * @swagger
 * /api/painel-controle/fala/{historicoId}/encerrar:
 *   post:
 *     summary: Encerra definitivamente o histórico de fala
 *     tags: [Painel de Controle (Tablet/Mesa)]
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
 *         description: Fala concluída e arquivada
 */
router.post(
  "/fala/:historicoId/encerrar",
  canAccessPainelControle,
  painelControleController.encerrarFalaByHistorico
);

module.exports = router;
