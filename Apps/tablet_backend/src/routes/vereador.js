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
 * Returns the authenticated council member profile.
 */
router.get('/profile', vereadorController.getVereadorProfile);

/**
 * Lists active council members in the same chamber.
 */
router.get('/camara', vereadorController.getVereadoresDaCamara);

/**
 * Updates the authenticated council member profile photo URL.
 */
router.put('/foto', vereadorController.updateVereadorFoto);

module.exports = router;
