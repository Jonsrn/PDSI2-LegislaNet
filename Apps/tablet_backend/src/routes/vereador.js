const express = require('express');
const router = express.Router();
const vereadorController = require('../controllers/vereadorController');
const { authenticateVereador } = require('../middleware/authMiddleware');

/**
 * Council member routes for authenticated tablet sessions.
 *
 * @type {import('express').Router}
 */
router.use(authenticateVereador);

/**
 * @swagger
 * /api/vereador/profile:
 *   get:
 *     summary: Obter Perfil
 *     description: Retorna os dados completos do vereador autenticado
 *     tags: [Vereadores]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Perfil retornado com sucesso
 *       401:
 *         description: Não autorizado (Requer Token JWT)
 */
router.get('/profile', vereadorController.getVereadorProfile);

/**
 * @swagger
 * /api/vereador/camara:
 *   get:
 *     summary: Listar Vereadores da Câmara
 *     description: Retorna todos os vereadores ativos associados à mesma câmara do usuário logado
 *     tags: [Vereadores]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Lista de vereadores retornada com sucesso
 *       401:
 *         description: Não autorizado
 */
router.get('/camara', vereadorController.getVereadoresDaCamara);

/**
 * @swagger
 * /api/vereador/foto:
 *   put:
 *     summary: Atualizar Foto de Perfil
 *     description: Permite ao vereador alterar sua foto de perfil através de uma nova URL
 *     tags: [Vereadores]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - fotoUrl
 *             properties:
 *               fotoUrl:
 *                 type: string
 *                 example: "https://minha-nova-foto.jpg"
 *     responses:
 *       200:
 *         description: Foto atualizada com sucesso
 *       400:
 *         description: Payload mal formatado
 *       401:
 *         description: Não autorizado
 */
router.put('/foto', vereadorController.updateVereadorFoto);

module.exports = router;
