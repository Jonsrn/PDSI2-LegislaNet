/**
 * Security middleware utilities.
 *
 * Provides rate limiting, request sanitization, reusable validators, validation
 * error handling, and admin audit logging.
 */

const rateLimit = require("express-rate-limit");
const { body, param, query, validationResult } = require("express-validator");
const createLogger = require("../utils/logger");
const logger = createLogger("SECURITY_MIDDLEWARE");

/**
 * Rate limiter for administrative APIs.
 *
 * Super admin requests can skip this limiter when `req.user` is already set.
 */
const adminRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10000,
  message: {
    error: "Muitas requisições. Tente novamente em 15 minutos.",
    code: "RATE_LIMIT_EXCEEDED",
  },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req, res) => {
    return req.user && req.user.role === "super_admin";
  },
});

/**
 * Rate limiter for creation and mutation operations.
 */
const strictRateLimit = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 10000,
  message: {
    error: "Limite de operações excedido. Aguarde 5 minutos.",
    code: "STRICT_RATE_LIMIT_EXCEEDED",
  },
});

/**
 * Removes high-risk HTML/JavaScript patterns from user-provided strings.
 *
 * @param {unknown} str - Value to sanitize.
 * @returns {unknown} Sanitized string, or the original value when not a string.
 */
const sanitizeString = (str) => {
  if (typeof str !== "string") return str;

  return str
    .trim()
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
    .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, "")
    .replace(/javascript:/gi, "")
    .replace(/on\w+\s*=/gi, "")
    .substring(0, 1000);
};

/**
 * Builds UUID v4 route-parameter validation for a given field.
 *
 * @param {string} [field="id"] - Route parameter name to validate.
 * @returns {Array} Express-validator validation chain.
 */
const uuidValidation = (field = "id") => [
  param(field).isUUID(4).withMessage(`${field} deve ser um UUID válido`),
];

/**
 * Reusable validation chain for paginated list endpoints.
 */
const paginationValidation = [
  query("page")
    .optional()
    .isInt({ min: 1, max: 1000 })
    .withMessage("Página deve ser um número entre 1 e 1000"),

  query("limit")
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage("Limite deve ser um número entre 1 e 100"),

  query("search")
    .optional()
    .isLength({ max: 100 })
    .withMessage("Busca muito longa")
    .customSanitizer(sanitizeString),
];

/**
 * Sends a 400 response when express-validator collected validation errors.
 *
 * @param {import("express").Request} req - Express request.
 * @param {import("express").Response} res - Express response.
 * @param {import("express").NextFunction} next - Express next callback.
 * @returns {void}
 */
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    logger.error("Erro de validação:", {
      url: req.url,
      method: req.method,
      errors: errors.array(),
      ip: req.ip,
    });

    return res.status(400).json({
      error: "Dados inválidos",
      details: errors.array().map((err) => ({
        field: err.param,
        message: err.msg,
      })),
    });
  }
  next();
};

/**
 * Sanitizes string values in request body and query parameters.
 *
 * @param {import("express").Request} req - Express request.
 * @param {import("express").Response} res - Express response.
 * @param {import("express").NextFunction} next - Express next callback.
 * @returns {void}
 */
const sanitizeRequest = (req, res, next) => {
  if (req.body && typeof req.body === "object") {
    for (const key in req.body) {
      if (typeof req.body[key] === "string") {
        req.body[key] = sanitizeString(req.body[key]);
      }
    }
  }

  if (req.query && typeof req.query === "object") {
    for (const key in req.query) {
      if (typeof req.query[key] === "string") {
        req.query[key] = sanitizeString(req.query[key]);
      }
    }
  }

  next();
};

/**
 * Logs administrative operation metadata after JSON responses are sent.
 *
 * @param {import("express").Request} req - Express request.
 * @param {import("express").Response} res - Express response.
 * @param {import("express").NextFunction} next - Express next callback.
 * @returns {void}
 */
const adminAuditLog = (req, res, next) => {
  const originalSend = res.json;

  res.json = function (data) {
    logger.log("Admin Operation:", {
      method: req.method,
      url: req.url,
      user: req.user?.id || "unknown",
      ip: req.ip,
      userAgent: req.get("User-Agent"),
      timestamp: new Date().toISOString(),
      status: res.statusCode,
    });

    originalSend.call(this, data);
  };

  next();
};

module.exports = {
  adminRateLimit,
  strictRateLimit,
  uuidValidation,
  paginationValidation,
  handleValidationErrors,
  sanitizeRequest,
  adminAuditLog,
  sanitizeString,
};
