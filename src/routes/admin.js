const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const { isSuperAdmin } = require('../middleware/authMiddleware');
const {
    adminRateLimit,
    strictRateLimit,
    uuidValidation,
    paginationValidation,
    handleValidationErrors,
    sanitizeRequest,
    adminAuditLog
} = require('../middleware/securityMiddleware');
const { partidoValidation } = require('../validators/partidoValidator');
const { camaraValidation } = require('../validators/camaraValidator');
const { uploadImage, uploadMultiple } = require('../middleware/imageUploadMiddleware');
const multer = require('multer');

/**
 * Super-admin routes for chamber, party, email, and councilor administration.
 *
 * All routes use admin rate limiting, request sanitization, super-admin
 * authorization, and audit logging before route-specific validation.
 */

/**
 * In-memory Multer configuration for bounded multipart uploads.
 */
const storage = multer.memoryStorage();
const upload = multer({ 
    storage: storage,
    limits: {
        fileSize: 5 * 1024 * 1024,
        files: 10
    }
});

router.use(adminRateLimit);
router.use(sanitizeRequest);
router.use(isSuperAdmin);
router.use(adminAuditLog);

/**
 * @swagger
 * /api/admin/camaras:
 *   get:
 *     summary: Lista todas as câmaras (Acesso Exclusivo Super Admin)
 *     tags: [Super Admin]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Lista paginada de câmaras
 *       403:
 *         description: Acesso negado
 */
router.get('/camaras', 
    paginationValidation,
    handleValidationErrors,
    adminController.getCamarasPaginado
);

/**
 * @swagger
 * /api/admin/check-email:
 *   get:
 *     summary: Verifica se um email já está em uso
 *     tags: [Super Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: email
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Status do email
 */
router.get('/check-email', adminController.checkEmailExists);

/**
 * @swagger
 * /api/admin/camaras:
 *   post:
 *     summary: Cadastra uma nova câmara com seus respectivos usuários
 *     tags: [Super Admin]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *     responses:
 *       201:
 *         description: Câmara criada com sucesso
 */
router.post('/camaras',
    strictRateLimit,
    uploadMultiple([
        { name: 'brasao', maxCount: 1 },
        { name: 'vereador_fotos' } 
    ]),
    camaraValidation,
    handleValidationErrors,
    adminController.createCamaraCompleta
);

router.get('/partidos/check', adminController.checkPartidoExists);

/**
 * @swagger
 * /api/admin/partidos:
 *   post:
 *     summary: Cadastra um novo partido
 *     tags: [Super Admin]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       201:
 *         description: Partido criado com sucesso
 */
router.post('/partidos',
    strictRateLimit,
    uploadImage('partido', 'logo'),
    partidoValidation,
    handleValidationErrors,
    adminController.createPartido
);

/**
 * @swagger
 * /api/admin/partidos/{id}:
 *   put:
 *     summary: Edita um partido existente
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
 *         description: Partido editado
 */
router.put('/partidos/:id',
    strictRateLimit,
    uploadImage('partido', 'logo'),
    uuidValidation('id'),
    partidoValidation,
    handleValidationErrors,
    adminController.updatePartido
);

/**
 * @swagger
 * /api/admin/partidos/{id}:
 *   delete:
 *     summary: Exclui um partido
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
 *         description: Partido deletado
 */
router.delete('/partidos/:id',
    strictRateLimit,
    uuidValidation('id'),
    handleValidationErrors,
    adminController.deletePartido
);

/**
 * @swagger
 * /api/admin/camaras/{camaraId}/vereadores:
 *   get:
 *     summary: Lista vereadores por câmara
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
router.get('/camaras/:camaraId/vereadores',
    uuidValidation('camaraId'),
    handleValidationErrors,
    adminController.getVereadoresByCamaraAdmin
);

module.exports = router;
