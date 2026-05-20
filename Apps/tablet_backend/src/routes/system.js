const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');

/**
 * System routes for tablet application metadata.
 *
 * @type {import('express').Router}
 */

/**
 * Returns the current APK version metadata and download URL.
 *
 * Reads `public/downloads/version.json` when available and returns fallback
 * metadata when the file does not exist.
 *
 * @param {import('express').Request} req - Incoming HTTP request.
 * @param {import('express').Response} res - HTTP response object.
 * @returns {import('express').Response} Version metadata response.
 */
router.get('/version', (req, res) => {
    try {
        const versionPath = path.join(__dirname, '../../public/downloads/version.json');

        if (!fs.existsSync(versionPath)) {
            return res.json({
                version: '1.0.0',
                apkUrl: 'https://legislanet.com.br/downloads/app-release.apk',
                required: false,
                notes: 'Versão inicial',
            });
        }

        const versionData = JSON.parse(fs.readFileSync(versionPath, 'utf8'));
        return res.json(versionData);

    } catch (error) {
        console.error('Erro ao ler versão:', error);
        return res.status(500).json({ error: 'Erro interno ao verificar versão.' });
    }
});

module.exports = router;
