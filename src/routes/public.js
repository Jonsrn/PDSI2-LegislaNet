const express = require("express");
const router = express.Router();
const publicController = require("../controllers/publicController");
const authController = require("../controllers/authController");

/**
 * Public portal routes and token-backed user profile lookup.
 *
 * @module routes/public
 */

/**
 * @swagger
 * /api/camaras/publicas:
 *   get:
 *     summary: Lista todas as câmaras ativas
 *     tags: [Portal Público]
 *     responses:
 *       200:
 *         description: Lista de câmaras
 */
router.get("/camaras/publicas", publicController.getCamarasPublicas);

/**
 * @swagger
 * /api/camaras/{id}/info:
 *   get:
 *     summary: Informações públicas de uma câmara
 *     tags: [Portal Público]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Detalhes da câmara
 */
router.get("/camaras/:id/info", publicController.getCamaraPublicInfo);

/**
 * @swagger
 * /api/camaras/{id}/sessoes-futuras:
 *   get:
 *     summary: Lista sessões agendadas da câmara
 *     tags: [Portal Público]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Sessões futuras
 */
router.get("/camaras/:id/sessoes-futuras", publicController.getSessoesFuturas);

/**
 * @swagger
 * /api/camaras/{id}/vereadores:
 *   get:
 *     summary: Lista vereadores ativos e seus partidos
 *     tags: [Portal Público]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Lista de vereadores
 */
router.get("/camaras/:id/vereadores", publicController.getVereadores);

/**
 * @swagger
 * /api/camaras/{id}/votacoes-recentes:
 *   get:
 *     summary: Lista as últimas votações finalizadas
 *     tags: [Portal Público]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Histórico de votações
 */
router.get(
  "/camaras/:id/votacoes-recentes",
  publicController.getVotacoesRecentes
);

/**
 * @swagger
 * /api/pautas/{id}/publica:
 *   get:
 *     summary: Informações públicas de uma pauta específica
 *     tags: [Portal Público]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Detalhes da pauta
 */
router.get("/pautas/:id/publica", publicController.getPautaPublica);

/**
 * @swagger
 * /api/votos/pauta/{id}/publico:
 *   get:
 *     summary: Votos abertos de uma pauta (para o portal da transparência)
 *     tags: [Portal Público]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Lista de votos
 */
router.get("/votos/pauta/:id/publico", publicController.getVotosPublicos);

/**
 * @swagger
 * /api/camaras/{id}/todas-pautas:
 *   get:
 *     summary: Histórico geral de pautas da câmara com paginação
 *     tags: [Portal Público]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Pautas paginadas
 */
router.get("/camaras/:id/todas-pautas", publicController.getAllPautasPublicas);

/**
 * @swagger
 * /api/me:
 *   get:
 *     summary: Retorna dados combinados do usuário autenticado (User, Profile, Câmara)
 *     tags: [Autenticação]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Dados do usuário
 *       401:
 *         description: Não autorizado
 */
router.get("/me", authController.getMe);

module.exports = router;
