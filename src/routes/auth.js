const express = require("express");
const router = express.Router();
const { body } = require("express-validator");
const rateLimit = require("express-rate-limit");
const authController = require("../controllers/authController");
const { hasPermission } = require("../middleware/authMiddleware");

/**
 * Authentication routes for login, refresh, logout, and profile lookup.
 *
 * @module routes/auth
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

router.post(
  "/login",
  loginRateLimit,
  body("email", "O email é inválido").isEmail(),
  body("password", "A senha não pode estar em branco").notEmpty(),
  authController.handleLogin
);

router.post(
  "/refresh",
  refreshRateLimit,
  authController.handleRefreshToken
);

// Web logout is limited to administrative application users.
router.post(
  "/logout",
  hasPermission(["super_admin", "admin_camara"]),
  authController.handleLogout
);

router.get(
  "/profile",
  hasPermission(["vereador"]),
  authController.getVereadorProfile
);

module.exports = router;
