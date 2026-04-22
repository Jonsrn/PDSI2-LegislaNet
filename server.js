require("dotenv").config({ quiet: true });

const path = require("path");
const express = require("express");
const { createClient } = require("@supabase/supabase-js");

const app = express();
app.use(express.json({ limit: "1mb" }));

const PORT = Number(process.env.PORT || 3000);
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

const hasSupabaseConfig =
  SUPABASE_URL && SUPABASE_ANON_KEY && SUPABASE_SERVICE_KEY;

const supabase = hasSupabaseConfig
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  : null;

const supabaseAdmin = hasSupabaseConfig
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
  : null;

function decodeJwtPayload(token) {
  try {
    const payloadBase64 = token.split(".")[1];
    if (!payloadBase64) return null;
    const decodedJson = Buffer.from(payloadBase64, "base64").toString();
    return JSON.parse(decodedJson);
  } catch (_error) {
    return null;
  }
}

async function loadProfile(userId) {
  const { data: profileData, error: profileError } = await supabaseAdmin
    .from("profiles")
    .select("role, nome, camara_id")
    .eq("id", userId)
    .single();

  if (profileError || !profileData) {
    return null;
  }

  return profileData;
}

function requireSupabase(res) {
  if (hasSupabaseConfig) return true;

  res.status(500).json({
    error:
      "Configuração ausente. Defina SUPABASE_URL, SUPABASE_ANON_KEY e SUPABASE_SERVICE_KEY no .env.",
  });

  return false;
}

app.post("/api/auth/login", async (req, res) => {
  if (!requireSupabase(res)) return;

  const email = String(req.body?.email || "").trim();
  const password = String(req.body?.password || "");

  if (!email || !password) {
    return res.status(400).json({ error: "Email e senha são obrigatórios." });
  }

  try {
    const { data: authData, error: authError } =
      await supabase.auth.signInWithPassword({
        email,
        password,
      });

    if (authError || !authData?.user || !authData?.session?.access_token) {
      return res.status(401).json({ error: "Credenciais inválidas." });
    }

    const profileData = await loadProfile(authData.user.id);
    if (!profileData) {
      return res.status(404).json({ error: "Perfil de usuário não encontrado." });
    }

    return res.status(200).json({
      message: "Login bem-sucedido!",
      user: {
        id: authData.user.id,
        email: authData.user.email,
        nome: profileData.nome,
        role: profileData.role,
        camara_id: profileData.camara_id,
      },
      token: authData.session.access_token,
      refreshToken: authData.session.refresh_token || null,
      expiresIn:
        typeof authData.session.expires_in === "number"
          ? authData.session.expires_in
          : null,
    });
  } catch (_error) {
    return res
      .status(500)
      .json({ error: "Ocorreu um erro interno no servidor." });
  }
});

app.post("/api/auth/refresh", async (req, res) => {
  if (!requireSupabase(res)) return;

  const providedRefreshToken = String(req.body?.refreshToken || "").trim();

  try {
    if (providedRefreshToken) {
      const supabaseTmp = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
          detectSessionInUrl: false,
        },
      });

      const { data: refreshData, error: refreshError } =
        await supabaseTmp.auth.refreshSession({
          refresh_token: providedRefreshToken,
        });

      if (refreshError || !refreshData?.session || !refreshData?.user) {
        return res
          .status(401)
          .json({ error: "Refresh token inválido ou expirado" });
      }

      const profileData = await loadProfile(refreshData.user.id);
      if (!profileData) {
        return res
          .status(404)
          .json({ error: "Perfil de usuário não encontrado." });
      }

      return res.status(200).json({
        message: "Token renovado com sucesso!",
        user: {
          id: refreshData.user.id,
          email: refreshData.user.email,
          nome: profileData.nome,
          role: profileData.role,
          camara_id: profileData.camara_id,
        },
        token: refreshData.session.access_token,
        refreshToken: refreshData.session.refresh_token || providedRefreshToken,
        expiresIn:
          typeof refreshData.session.expires_in === "number"
            ? refreshData.session.expires_in
            : null,
      });
    }

    const authHeader = String(req.headers.authorization || "");
    if (!authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ error: "Token de autorização requerido" });
    }

    const currentToken = authHeader.split(" ")[1];
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser(currentToken);

    if (userError || !user) {
      return res.status(401).json({ error: "Token inválido ou expirado" });
    }

    const profileData = await loadProfile(user.id);
    if (!profileData) {
      return res.status(404).json({ error: "Perfil de usuário não encontrado." });
    }

    const payload = decodeJwtPayload(currentToken);

    return res.status(200).json({
      message: "Token validado com sucesso!",
      user: {
        id: user.id,
        email: user.email,
        nome: profileData.nome,
        role: profileData.role,
        camara_id: profileData.camara_id,
      },
      token: currentToken,
      refreshToken: null,
      expiresIn:
        payload && typeof payload.exp === "number"
          ? Math.max(0, payload.exp - Math.floor(Date.now() / 1000))
          : null,
    });
  } catch (_error) {
    return res
      .status(500)
      .json({ error: "Ocorreu um erro interno no servidor." });
  }
});

app.post("/api/auth/logout", (_req, res) => {
  return res.status(200).json({ message: "Logout realizado com sucesso." });
});

app.get("/api/health", (_req, res) => {
  res.status(200).json({ status: "ok", authOnlyBackend: true });
});

const webRoot = path.join(__dirname, "web");
app.use(express.static(webRoot));

app.get("/", (_req, res) => {
  return res.sendFile(path.join(webRoot, "index.html"));
});

app.get("*", (req, res) => {
  if (req.path.startsWith("/api/")) {
    return res.status(404).json({ error: "Rota não encontrada." });
  }

  // Evita fallback enganoso: se pedirem um arquivo inexistente, retorna 404.
  if (path.extname(req.path)) {
    return res.status(404).send("Página não encontrada.");
  }

  return res.sendFile(path.join(webRoot, "index.html"));
});

app.listen(PORT, () => {
  console.log(`LegislaNet auth-only server running on http://localhost:${PORT}`);
});
