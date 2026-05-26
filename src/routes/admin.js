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
 * Super-admin routes for camara, partido, and vereador administration.
 *
 * @module routes/admin
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

// Camara routes.
router.get('/camaras', 
    paginationValidation,
    handleValidationErrors,
    adminController.getCamarasPaginado
);

router.get('/check-email', adminController.checkEmailExists);

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

// Partido routes.
router.get('/partidos/check', adminController.checkPartidoExists);

router.post('/partidos',
    strictRateLimit,
    uploadImage('partido', 'logo'),
    partidoValidation,
    handleValidationErrors,
    adminController.createPartido
);

router.put('/partidos/:id',
    strictRateLimit,
    uploadImage('partido', 'logo'),
    uuidValidation('id'),
    partidoValidation,
    handleValidationErrors,
    adminController.updatePartido
);

router.delete('/partidos/:id',
    strictRateLimit,
    uuidValidation('id'),
    handleValidationErrors,
    adminController.deletePartido
);

router.get('/camaras/:camaraId/vereadores',
    uuidValidation('camaraId'),
    handleValidationErrors,
    adminController.getVereadoresByCamaraAdmin
);

module.exports = router;
