const express = require("express");
const router = express.Router();
const path = require("path");
const fs = require("fs");

/**
 * System routes for tablet app metadata.
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
