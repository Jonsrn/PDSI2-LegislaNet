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

/**
 * @swagger
 * /api/sessoes:
 *   get:
 *     summary: Lista todas as sessões da câmara
 *     tags: [Gestão da Câmara]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Lista de sessões paginadas
 */
router.get("/", canManageSessoes, sessoesController.getAllSessoes);

/**
 * @swagger
 * /api/sessoes/disponiveis:
 *   get:
 *     summary: Lista sessões ativas prontas para iniciar
 *     tags: [Gestão da Câmara]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Sessões disponíveis
 */
router.get(
  "/disponiveis",
  canManageSessoes,
  sessoesController.getSessoesDisponiveis
);

/**
 * @swagger
 * /api/sessoes/opcoes:
 *   get:
 *     summary: Lista resumida de sessões (para selects)
 *     tags: [Gestão da Câmara]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Opções de sessões
 */
router.get("/opcoes", canManageSessoes, sessoesController.getSessoesOpcoes);

/**
 * @swagger
 * /api/sessoes/vereadores-ativos:
 *   get:
 *     summary: Lista vereadores ativos da câmara
 *     tags: [Gestão da Câmara]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Lista de vereadores
 */
router.get(
  "/vereadores-ativos",
  canManageSessoes,
  vereadorController.getVereadoresAtivos
);

// Speaker routes must stay before parameterized session routes.
/**
 * @swagger
 * /api/sessoes/oradores:
 *   get:
 *     summary: Lista geral de oradores inscritos
 *     tags: [Gestão da Câmara]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Lista de oradores
 */
router.get("/oradores", canManageSessoes, oradoresController.getAllOradores);

/**
 * @swagger
 * /api/sessoes/oradores:
 *   post:
 *     summary: Inscreve um vereador para falar
 *     tags: [Gestão da Câmara]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       201:
 *         description: Orador inscrito
 */
router.post("/oradores", canManageSessoes, oradoresController.createOrador);

/**
 * @swagger
 * /api/sessoes/oradores/{id}:
 *   put:
 *     summary: Atualiza o tempo restante do orador
 *     tags: [Gestão da Câmara]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Tempo atualizado
 */
router.put(
  "/oradores/:id",
  canManageSessoes,
  oradoresController.updateTempoOrador
);

/**
 * @swagger
 * /api/sessoes/oradores/{id}:
 *   delete:
 *     summary: Remove o orador da lista de fala
 *     tags: [Gestão da Câmara]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Orador removido
 */
router.delete(
  "/oradores/:id",
  canManageSessoes,
  oradoresController.deleteOrador
);

/**
 * @swagger
 * /api/sessoes/{id}:
 *   get:
 *     summary: Exibe dados de uma sessão específica
 *     tags: [Gestão da Câmara]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Dados da sessão
 */
router.get("/:id", canManageSessoes, sessoesController.getSessaoById);

/**
 * @swagger
 * /api/sessoes:
 *   post:
 *     summary: Agenda uma nova sessão
 *     tags: [Gestão da Câmara]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       201:
 *         description: Sessão agendada
 */
router.post(
  "/",
  canManageSessoes,
  sessaoValidation,
  handleValidationErrors,
  sessoesController.createSessao
);

/**
 * @swagger
 * /api/sessoes/{id}:
 *   put:
 *     summary: Atualiza os dados de uma sessão
 *     tags: [Gestão da Câmara]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Sessão atualizada
 */
router.put(
  "/:id",
  canManageSessoes,
  sessaoValidation,
  handleValidationErrors,
  sessoesController.updateSessao
);

/**
 * @swagger
 * /api/sessoes/{id}:
 *   delete:
 *     summary: Exclui uma sessão (se não possuir vínculos)
 *     tags: [Gestão da Câmara]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Sessão excluída
 */
router.delete("/:id", canManageSessoes, sessoesController.deleteSessao);

/**
 * @swagger
 * /api/sessoes/{sessaoId}/oradores:
 *   get:
 *     summary: Lista oradores de uma sessão específica
 *     tags: [Gestão da Câmara]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: sessaoId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Oradores da sessão
 */
router.get(
  "/:sessaoId/oradores",
  canManageSessoes,
  oradoresController.getOradoresBySessao
);

module.exports = router;
