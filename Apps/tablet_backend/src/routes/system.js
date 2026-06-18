const express = require("express");
const router = express.Router();
const path = require("path");
const fs = require("fs");

/**
 * @swagger
 * /api/system/version:
 *   get:
 *     summary: Obter Versão do Aplicativo (APK)
 *     description: Retorna os metadados da versão mais recente do aplicativo do tablet disponível para download
 *     tags: [Sistema]
 *     responses:
 *       200:
 *         description: Metadados da versão retornados com sucesso
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 version:
 *                   type: string
 *                   example: "1.0.0"
 *                 apkUrl:
 *                   type: string
 *                 required:
 *                   type: boolean
 *                 notes:
 *                   type: string
 *       500:
 *         description: Erro interno ao ler os arquivos de versão
 */
router.get("/version", (req, res) => {
  try {
    const versionPath = path.join(
      __dirname,
      "../../public/downloads/version.json"
    );

    if (!fs.existsSync(versionPath)) {
      // Return initial metadata when version.json has not been published yet.
      return res.json({
        version: "1.0.0",
        apkUrl: "https://legislanet.com.br/downloads/app-release.apk",
        required: false,
        notes: "Versão inicial",
      });
    }

    const versionData = JSON.parse(fs.readFileSync(versionPath, "utf8"));
    res.json(versionData);
  } catch (error) {
    console.error("Erro ao ler versão:", error);
    res.status(500).json({ error: "Erro interno ao verificar versão" });
  }
});

module.exports = router;
