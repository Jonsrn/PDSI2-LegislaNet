const express = require("express");
const router = express.Router();
const { body } = require("express-validator");
const rateLimit = require("express-rate-limit");
const authController = require("../controllers/authController");
const { hasPermission } = require("../middleware/authMiddleware");

/**
 * Web authentication routes.
 *
 * Login and refresh use dedicated rate limits to reduce brute-force and refresh
 * abuse. Web logout is restricted to admin roles; councilors use the tablet
 * backend authentication flow.
 */

const loginRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: "Muitas tentativas de login. Aguarde alguns minutos.",
    code: "AUTH_LOGIN_RATE_LIMIT_EXCEEDED",
  },
});

/**
 * Higher-volume limiter for token refresh requests.
 */
const refreshRateLimit = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: "Muitas tentativas de renovação. Aguarde alguns minutos.",
    code: "AUTH_REFRESH_RATE_LIMIT_EXCEEDED",
  },
});

/**
 * @swagger
 * /api/auth/login:
 *   post:
 *     summary: Autentica um usuário web e retorna o token JWT
 *     tags: [Autenticação]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password]
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *               password:
 *                 type: string
 *                 format: password
 *     responses:
 *       200:
 *         description: Login bem-sucedido
 *       400:
 *         description: Dados de entrada inválidos
 *       401:
 *         description: Credenciais incorretas
 */
router.post(
  "/login",
  loginRateLimit,
  body("email", "O email é inválido").isEmail(),
  body("password", "A senha não pode estar em branco").notEmpty(),
  authController.handleLogin
);

/**
 * @swagger
 * /api/auth/refresh:
 *   post:
 *     summary: Renova o token de acesso JWT (Refresh)
 *     tags: [Autenticação]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [refresh_token]
 *             properties:
 *               refresh_token:
 *                 type: string
 *     responses:
 *       200:
 *         description: Token renovado com sucesso
 *       400:
 *         description: Refresh token ausente
 *       401:
 *         description: Refresh token inválido
 */
router.post(
  "/refresh",
  refreshRateLimit,
  authController.handleRefreshToken
);

/**
 * @swagger
 * /api/auth/logout:
 *   post:
 *     summary: Encerra a sessão do usuário ativo
 *     tags: [Autenticação]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Logout realizado com sucesso
 *       401:
 *         description: Token ausente ou inválido
 *       403:
 *         description: Permissão negada (role insuficiente)
 */
router.post(
  "/logout",
  hasPermission(["super_admin", "admin_camara"]),
  authController.handleLogout
);

/**
 * @swagger
 * /api/auth/profile:
 *   get:
 *     summary: Retorna os dados do perfil do usuário logado
 *     tags: [Autenticação]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Perfil retornado com sucesso
 *       401:
 *         description: Usuário não autenticado
 *       403:
 *         description: Permissão negada
 */
router.get(
  "/profile",
  hasPermission(["vereador"]),
  authController.getVereadorProfile
);

module.exports = router;
