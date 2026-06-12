const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const authController = require('../controllers/authController');
const { authenticateVereador } = require('../middleware/authMiddleware');

/**
 * Authentication routes for vereador tablet sessions.
 */
/**
 * @swagger
 * /api/auth/login:
 *   post:
 *     summary: Autenticação de Vereador
 *     description: Realiza o login do vereador no tablet usando as credenciais do sistema e retorna o JWT
 *     tags: [Autenticação]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - password
 *             properties:
 *               email:
 *                 type: string
 *                 example: "vereador@camara.gov.br"
 *               password:
 *                 type: string
 *                 example: "senha123"
 *     responses:
 *       200:
 *         description: Login bem sucedido. Retorna o token JWT e dados do vereador.
 *       400:
 *         description: Dados inválidos de validação (express-validator)
 *       401:
 *         description: Credenciais incorretas (Email ou senha não conferem)
 */
router.post(
    '/login',
    body('email', 'O email é inválido').isEmail(),
    body('password', 'A senha não pode estar em branco').notEmpty(),
    authController.handleVereadorLogin
);

/**
 * @swagger
 * /api/auth/logout:
 *   post:
 *     summary: Encerrar sessão
 *     description: Realiza o logout revogando a sessão ativa (Requer JWT)
 *     tags: [Autenticação]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Sessão encerrada com sucesso
 *       401:
 *         description: Token não fornecido ou inválido
 */
router.post('/logout', authenticateVereador, authController.handleVereadorLogout);

module.exports = router;
