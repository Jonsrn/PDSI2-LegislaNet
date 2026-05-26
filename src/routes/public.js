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
 * @route   GET /api/camaras/publicas
 * @desc    List active camaras for public selection.
 * @access  Public
 */
router.get("/camaras/publicas", publicController.getCamarasPublicas);

/**
 * @route   GET /api/camaras/:id/info
 * @desc    Get public information for a specific camara.
 * @access  Public
 */
router.get("/camaras/:id/info", publicController.getCamaraPublicInfo);

/**
 * @route   GET /api/camaras/:id/sessoes-futuras
 * @desc    List upcoming sessions for a specific camara.
 * @access  Public
 */
router.get("/camaras/:id/sessoes-futuras", publicController.getSessoesFuturas);

/**
 * @route   GET /api/camaras/:id/vereadores
 * @desc    List active vereadores for a specific camara with party data.
 * @access  Public
 */
router.get("/camaras/:id/vereadores", publicController.getVereadores);

/**
 * @route   GET /api/camaras/:id/votacoes-recentes
 * @desc    List recent finalized votes for a specific camara.
 * @access  Public
 */
router.get(
  "/camaras/:id/votacoes-recentes",
  publicController.getVotacoesRecentes
);

/**
 * @route   GET /api/pautas/:id/publica
 * @desc    Get public information for a specific pauta.
 * @access  Public
 */
router.get("/pautas/:id/publica", publicController.getPautaPublica);

/**
 * @route   GET /api/votos/pauta/:id/publico
 * @desc    List public votes for a specific pauta.
 * @access  Public
 */
router.get("/votos/pauta/:id/publico", publicController.getVotosPublicos);

/**
 * @route   GET /api/camaras/:id/todas-pautas
 * @desc    List all public pautas for a specific camara with pagination.
 * @access  Public
 */
router.get("/camaras/:id/todas-pautas", publicController.getAllPautasPublicas);

/**
 * @route   GET /api/me
 * @desc    Get authenticated user, profile, and camara information.
 * @access  Protected via bearer token handled inside the controller.
 */
router.get("/me", authController.getMe);

module.exports = router;
