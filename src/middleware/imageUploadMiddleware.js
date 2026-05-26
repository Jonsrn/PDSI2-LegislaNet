const multer = require('multer');
const path = require('path');
const supabaseAdmin = require('../config/supabaseAdminClient');
const createLogger = require('../utils/logger');

const logger = createLogger('IMAGE_UPLOAD_MIDDLEWARE');

/**
 * Middleware helpers for validating image uploads and storing files in
 * Supabase Storage.
 *
 * @module middleware/imageUploadMiddleware
 */

/**
 * Resolves the Supabase Storage bucket for an upload type and multipart field.
 *
 * @param {string} type - Upload context used by the route.
 * @param {string} fieldname - Multipart form field name.
 * @returns {string} Supabase Storage bucket name.
 */
const getBucketName = (type, fieldname) => {
    if (type === 'multiple') {
        if (fieldname === 'brasao') return 'brasoes-camara';
        if (fieldname === 'vereador_fotos') return 'fotos-vereadores';
        return 'fotos-vereadores';
    }
    
    switch (type) {
        case 'vereador': return 'fotos-vereadores';
        case 'partido': return 'logos-partidos';
        case 'camara': return 'brasoes-camara';
        default: return 'fotos-vereadores';
    }
};

/**
 * Uploads an in-memory Multer file to the appropriate Supabase Storage bucket.
 *
 * @param {object} file - Multer file object stored in memory.
 * @param {string} type - Upload context used to determine bucket and filename prefix.
 * @returns {Promise<object>} Uploaded file metadata, including public URL and bucket.
 * @throws {Error} When Supabase Storage rejects the upload.
 */
const uploadToSupabase = async (file, type) => {
    const bucketName = getBucketName(type, file.fieldname);
    
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    let prefix;
    
    if (type === 'multiple') {
        if (file.fieldname === 'brasao') {
            prefix = 'camara';
        } else if (file.fieldname === 'vereador_fotos') {
            prefix = 'vereador';
        } else {
            prefix = 'file';
        }
    } else {
        switch (type) {
            case 'vereador': prefix = 'vereador'; break;
            case 'partido': prefix = 'partido'; break;
            case 'camara': prefix = 'camara'; break;
            default: prefix = 'image';
        }
    }
    
    const filename = `${prefix}-${uniqueSuffix}${path.extname(file.originalname)}`;
    const filePath = `public/${filename}`;
    
    logger.log(`📤 Uploading para Supabase Storage - Bucket: ${bucketName}, Arquivo: ${filename}`);
    
    const { data: uploadData, error: uploadError } = await supabaseAdmin.storage
        .from(bucketName)
        .upload(filePath, file.buffer, { 
            contentType: file.mimetype,
            upsert: false 
        });

    if (uploadError) {
        logger.error('❌ Erro no upload Supabase:', uploadError.message);
        throw new Error(`Falha no upload: ${uploadError.message}`);
    }

    const publicUrl = supabaseAdmin.storage.from(bucketName).getPublicUrl(uploadData.path).data.publicUrl;
    
    logger.log(`✅ Upload concluído - URL: ${publicUrl}`);
    
    return {
        filename: filename,
        path: uploadData.path,
        url: publicUrl,
        bucket: bucketName
    };
};

/**
 * Accepts only image MIME types during Multer processing.
 *
 * @param {object} req - Express request object.
 * @param {object} file - Multer file candidate.
 * @param {Function} cb - Multer callback used to accept or reject the file.
 * @returns {void}
 */
const fileFilter = (req, file, cb) => {
    logger.log(`🔍 Verificando tipo do arquivo: ${file.mimetype}`);
    logger.log(`📄 Nome original: ${file.originalname}`);
    
    if (file.mimetype.startsWith('image/')) {
        logger.log('✅ Arquivo de imagem aceito');
        cb(null, true);
    } else {
        logger.error(`❌ Tipo de arquivo não permitido: ${file.mimetype}`);
        cb(new Error('Apenas arquivos de imagem são permitidos'), false);
    }
};

/**
 * Creates a Multer instance for image uploads.
 *
 * @param {string} type - Upload context passed to the storage factory.
 * @returns {object} Configured Multer upload instance.
 */
const createUpload = (type) => {
    return multer({
        storage: createStorage(type),
        limits: {
            fileSize: 5 * 1024 * 1024,
        },
        fileFilter: fileFilter
    });
};

/**
 * Creates middleware that handles a single image upload and stores it in
 * Supabase Storage.
 *
 * @param {string} [type='vereador'] - Upload context used for bucket and filename selection.
 * @param {string} [fieldName='foto'] - Multipart form field containing the image.
 * @returns {Function} Express middleware that enriches `req.file` with upload metadata.
 */
const uploadImage = (type = 'vereador', fieldName = 'foto') => {
    const limitSize = type === 'camara' ? undefined : 5 * 1024 * 1024;
    
    const upload = multer({
        storage: multer.memoryStorage(),
        limits: limitSize ? { fileSize: limitSize } : {},
        fileFilter: fileFilter
    });
    
    return (req, res, next) => {
        logger.log(`📤 Iniciando upload de imagem (${type}) para Supabase Storage - Campo: ${fieldName} ${limitSize ? `(limite: ${limitSize/1024/1024}MB)` : '(sem limite)'}`);
        
        const uploadHandler = upload.single(fieldName);
        
        uploadHandler(req, res, async (err) => {
            if (err) {
                logger.error('❌ Erro no processamento multer:', err.message);
                
                if (err instanceof multer.MulterError) {
                    if (err.code === 'LIMIT_FILE_SIZE') {
                        return res.status(400).json({ 
                            error: 'Imagem muito grande. Tamanho máximo: 5MB' 
                        });
                    }
                    return res.status(400).json({ 
                        error: `Erro no upload: ${err.message}` 
                    });
                }
                
                return res.status(400).json({ 
                    error: err.message 
                });
            }
            
            if (req.file) {
                try {
                    const uploadResult = await uploadToSupabase(req.file, type);
                    
                    req.file.url = uploadResult.url;
                    req.file.path = uploadResult.path;
                    req.file.filename = uploadResult.filename;
                    req.file.bucket = uploadResult.bucket;
                    
                    logger.log('✅ Upload de imagem concluído:', {
                        originalName: req.file.originalname,
                        filename: uploadResult.filename,
                        size: req.file.size,
                        url: uploadResult.url,
                        bucket: uploadResult.bucket
                    });
                    
                } catch (uploadError) {
                    logger.error('❌ Erro no upload para Supabase:', uploadError.message);
                    return res.status(500).json({ 
                        error: `Falha no upload: ${uploadError.message}` 
                    });
                }
            } else {
                logger.log('ℹ️ Nenhuma imagem enviada no upload');
            }
            
            next();
        });
    };
};

/**
 * Creates middleware that handles multiple image fields and uploads each file
 * to Supabase Storage.
 *
 * @param {Array<object>} fields - Multer field definitions accepted by `upload.fields`.
 * @returns {Function} Express middleware that enriches uploaded files with storage metadata.
 */
const uploadMultiple = (fields) => {
    const upload = multer({
        storage: multer.memoryStorage(),
        limits: {
            fileSize: 5 * 1024 * 1024,
            files: 10
        },
        fileFilter: fileFilter
    });
    
    return (req, res, next) => {
        upload.fields(fields)(req, res, async (err) => {
            if (err) {
                logger.error('❌ Erro no processamento multer (múltiplos):', err.message);
                return res.status(400).json({ error: err.message });
            }
            
            if (req.files) {
                try {
                    if (req.files.brasao && req.files.brasao[0]) {
                        const brasaoFile = req.files.brasao[0];
                        const uploadResult = await uploadToSupabase(brasaoFile, 'multiple');
                        req.files.brasao[0].url = uploadResult.url;
                        req.files.brasao[0].path = uploadResult.path;
                        req.files.brasao[0].bucket = uploadResult.bucket;
                    }
                    
                    if (req.files.vereador_fotos) {
                        for (let i = 0; i < req.files.vereador_fotos.length; i++) {
                            const file = req.files.vereador_fotos[i];
                            const uploadResult = await uploadToSupabase(file, 'multiple');
                            file.url = uploadResult.url;
                            file.path = uploadResult.path;
                            file.bucket = uploadResult.bucket;
                        }
                    }
                    
                    logger.log('✅ Upload múltiplo concluído para Supabase Storage');
                    
                } catch (uploadError) {
                    logger.error('❌ Erro no upload múltiplo para Supabase:', uploadError.message);
                    return res.status(500).json({ 
                        error: `Falha no upload: ${uploadError.message}` 
                    });
                }
            }
            
            next();
        });
    };
};

/**
 * Creates legacy-compatible middleware that keeps uploaded files in memory
 * without sending them to Supabase Storage.
 *
 * @param {Array<object>} fields - Multer field definitions accepted by `upload.fields`.
 * @returns {Function} Multer middleware for multipart field processing.
 */
const uploadMultipleCompat = (fields) => {
    const upload = multer({
        storage: multer.memoryStorage(),
        limits: {
            fileSize: 5 * 1024 * 1024,
            files: 10
        },
        fileFilter: fileFilter
    });
    
    return upload.fields(fields);
};

module.exports = {
    uploadImage,
    uploadMultiple,
    uploadMultipleCompat,
    uploadToSupabase,
    getBucketName
};
