const express = require('express');
const router = express.Router({ mergeParams: true }); 
const vereadorController = require('../controllers/vereadorController');
const { isSuperAdmin, hasPermission } = require('../middleware/authMiddleware');
const { uploadImage } = require('../middleware/imageUploadMiddleware');

/**
 * Vereador management routes for super admins and camara-scoped users.
 *
 * @module routes/vereadorRoutes
 */

router.use(isSuperAdmin);

/**
 * @route   GET /api/camaras/:camaraId/vereadores
 * @desc    List all vereadores for a specific camara.
 * @access  Private (Super Admin)
 */
router.get('/', vereadorController.getVereadoresByCamara);

/**
 * @route   POST /api/camaras/:camaraId/vereadores
 * @desc    Create a vereador for the camara.
 * @access  Private (Super Admin)
 */
router.post('/', uploadImage('vereador', 'foto_url_vereador'), vereadorController.createVereador);


const singleVereadorRouter = express.Router();

/**
 * @route   PUT /api/vereadores/:id
 * @desc    Update a specific vereador.
 * @access  Private (Super Admin)
 */
singleVereadorRouter.put('/:id', uploadImage('vereador', 'foto_url_vereador'), isSuperAdmin, vereadorController.updateVereador);

/**
 * @route   DELETE /api/vereadores/:id
 * @desc    Remove a specific vereador.
 * @access  Private (Super Admin)
 */
singleVereadorRouter.delete('/:id', isSuperAdmin, vereadorController.deleteVereador);


const appVereadorRouter = express.Router();

const isUsuarioCamara = hasPermission(['admin_camara', 'vereador']);

/**
 * @route   GET /api/app/vereadores
 * @desc    List vereadores for the authenticated user's camara.
 * @access  Private (Camara users)
 */
appVereadorRouter.get('/', isUsuarioCamara, vereadorController.getVereadoresDaPropriaCamara);

/**
 * @route   POST /api/app/vereadores
 * @desc    Create a vereador in the authenticated user's camara.
 * @access  Private (Camara users)
 */
appVereadorRouter.post('/', uploadImage('vereador', 'foto'), isUsuarioCamara, vereadorController.createVereadorNaPropriaCamara);

/**
 * @route   PUT /api/app/vereadores/:id
 * @desc    Update a vereador in the authenticated user's camara.
 * @access  Private (Camara users)
 */
appVereadorRouter.put('/:id', uploadImage('vereador', 'foto'), isUsuarioCamara, vereadorController.updateVereadorDaPropriaCamara);

module.exports = { 
    nestedVereadorRouter: router, 
    singleVereadorRouter: singleVereadorRouter,
    appVereadorRouter: appVereadorRouter 
};
