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
 * @swagger
 * /api/camaras/{camaraId}/vereadores:
 *   get:
 *     summary: Lista todos os vereadores de uma câmara específica
 *     tags: [Super Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: camaraId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Lista de vereadores
 */
router.get('/', vereadorController.getVereadoresByCamara);

/**
 * @swagger
 * /api/camaras/{camaraId}/vereadores:
 *   post:
 *     summary: Cria um vereador para uma câmara específica
 *     tags: [Super Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: camaraId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       201:
 *         description: Vereador criado
 */
router.post('/', uploadImage('vereador', 'foto_url_vereador'), vereadorController.createVereador);


const singleVereadorRouter = express.Router();

/**
 * @swagger
 * /api/vereadores/{id}:
 *   put:
 *     summary: Atualiza dados de um vereador
 *     tags: [Super Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Vereador atualizado
 */
singleVereadorRouter.put('/:id', uploadImage('vereador', 'foto_url_vereador'), isSuperAdmin, vereadorController.updateVereador);

/**
 * @swagger
 * /api/vereadores/{id}:
 *   delete:
 *     summary: Remove um vereador
 *     tags: [Super Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Vereador removido
 */
singleVereadorRouter.delete('/:id', isSuperAdmin, vereadorController.deleteVereador);


const appVereadorRouter = express.Router();

const isUsuarioCamara = hasPermission(['admin_camara', 'vereador']);

/**
 * @swagger
 * /api/app/vereadores:
 *   get:
 *     summary: Lista vereadores da câmara do usuário logado
 *     tags: [Gestão da Câmara]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Lista de vereadores da câmara
 */
appVereadorRouter.get('/', isUsuarioCamara, vereadorController.getVereadoresDaPropriaCamara);

/**
 * @swagger
 * /api/app/vereadores:
 *   post:
 *     summary: Cria um vereador na câmara do usuário logado
 *     tags: [Gestão da Câmara]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       201:
 *         description: Vereador criado
 */
appVereadorRouter.post('/', uploadImage('vereador', 'foto'), isUsuarioCamara, vereadorController.createVereadorNaPropriaCamara);

/**
 * @swagger
 * /api/app/vereadores/{id}:
 *   put:
 *     summary: Atualiza um vereador da câmara do usuário logado
 *     tags: [Gestão da Câmara]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Vereador atualizado
 */
appVereadorRouter.put('/:id', uploadImage('vereador', 'foto'), isUsuarioCamara, vereadorController.updateVereadorDaPropriaCamara);

module.exports = { 
    nestedVereadorRouter: router, 
    singleVereadorRouter: singleVereadorRouter,
    appVereadorRouter: appVereadorRouter 
};
