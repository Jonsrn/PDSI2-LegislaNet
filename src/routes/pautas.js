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

/**
 * @swagger
 * /api/pautas:
 *   get:
 *     summary: Lista as pautas da câmara do usuário logado
 *     tags: [Gestão da Câmara]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Lista de pautas paginadas
 */
router.get("/", canManagePautas, pautaController.getAllPautas);

/**
 * @swagger
 * /api/pautas/autores:
 *   get:
 *     summary: Lista vereadores autores disponíveis na câmara
 *     tags: [Gestão da Câmara]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Lista de autores
 */
router.get("/autores", canManagePautas, pautaController.getAutoresPautas);

/**
 * @swagger
 * /api/pautas:
 *   post:
 *     summary: Cadastra uma nova pauta (com upload opcional de PDF)
 *     tags: [Gestão da Câmara]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *     responses:
 *       201:
 *         description: Pauta cadastrada com sucesso
 */
router.post(
  "/",
  canManagePautas,
  uploadSingle("arquivo"),
  pautaController.createPauta
);

/**
 * @swagger
 * /api/pautas/{id}:
 *   get:
 *     summary: Exibe dados detalhados de uma pauta
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
 *         description: Dados da pauta
 */
router.get("/:id", canManagePautas, pautaController.getPautaById);

/**
 * @swagger
 * /api/pautas/{id}/status:
 *   put:
 *     summary: Atualiza o status de tramitação da pauta (ex. "Em Votação")
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
 *         description: Status atualizado
 */
router.put("/:id/status", canManagePautas, pautaController.updatePautaStatus);

/**
 * @swagger
 * /api/pautas/{id}/resultado:
 *   put:
 *     summary: Define o resultado final da pauta pós-votação (ex. "Aprovada")
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
 *         description: Resultado gravado com sucesso
 */
router.put(
  "/:id/resultado",
  canManagePautas,
  pautaController.updateResultadoVotacao
);

/**
 * @swagger
 * /api/pautas/{id}:
 *   put:
 *     summary: Edita os metadados de uma pauta existente
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
 *         description: Pauta atualizada
 */
router.put(
  "/:id",
  canManagePautas,
  uploadSingle("arquivo"),
  pautaController.updatePauta
);

/**
 * @swagger
 * /api/pautas/{id}:
 *   delete:
 *     summary: Exclui a pauta permanentemente do banco
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
 *         description: Pauta excluída com sucesso
 */
router.delete("/:id", canManagePautas, pautaController.deletePauta);

module.exports = router;
