const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const authController = require('../controllers/authController');
const { authenticateVereador } = require('../middleware/authMiddleware');

/**
 * Authentication routes for vereador tablet sessions.
 */
router.post(
    '/login',
    body('email', 'O email é inválido').isEmail(),
    body('password', 'A senha não pode estar em branco').notEmpty(),
    authController.handleVereadorLogin
);

router.post('/logout', authenticateVereador, authController.handleVereadorLogout);

module.exports = router;
