const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const authController = require('../controllers/authController');
const { authenticateVereador } = require('../middleware/authMiddleware');

/**
 * Authentication routes for council member tablet sessions.
 *
 * @type {import('express').Router}
 */

/**
 * Authenticates a council member with email and password credentials.
 */
router.post(
    '/login',
    body('email', 'Email inválido').isEmail(),
    body('password', 'Senha não pode estar em branco').notEmpty(),
    authController.handleVereadorLogin
);

/**
 * Logs out an authenticated council member session.
 */
router.post('/logout', authenticateVereador, authController.handleVereadorLogout);

module.exports = router;
