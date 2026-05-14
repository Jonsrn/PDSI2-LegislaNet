-- ==============================================================================
-- MIGRATION: 001 - Autenticação Básica e Câmaras
-- ==============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TYPE "public"."user_role" AS ENUM ('super_admin', 'admin_camara', 'vereador', 'tv');

-- 1. Câmaras Municipais
CREATE TABLE IF NOT EXISTS "public"."camaras" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "nome_camara" "text" NOT NULL,
    "municipio" "text" NOT NULL,
    "estado" character(2) NOT NULL,
    "brasao_url" "text",
    "is_active" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "link_facebook" "text",
    "link_instagram" "text",
    "link_youtube" "text",
    "site_oficial" "text",
    "telefone" "text",
    "email_contato" "text",
    "endereco" "text",
    "youtube_stream_key" "text",
    "youtube_rtmp_url" "text",
    "youtube_channel_id" "text",
    "youtube_channel_url" "text",
    "current_livestream_id" "uuid",
    "last_livestream_id" "uuid",
    PRIMARY KEY ("id")
);

-- 2. Perfis de Usuário
CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" "uuid" NOT NULL,
    "nome" "text" NOT NULL,
    "role" "public"."user_role" DEFAULT 'admin_camara'::"public"."user_role" NOT NULL,
    "camara_id" "uuid",
    "min_token_iat" integer DEFAULT 0,
    PRIMARY KEY ("id"),
    FOREIGN KEY ("camara_id") REFERENCES "public"."camaras"("id") ON DELETE CASCADE,
    CONSTRAINT "check_camara_id_for_roles" CHECK (((("role" = 'super_admin'::"public"."user_role") AND ("camara_id" IS NULL)) OR (("role" = ANY (ARRAY['admin_camara'::"public"."user_role", 'vereador'::"public"."user_role", 'tv'::"public"."user_role"])) AND ("camara_id" IS NOT NULL))))
);

-- 3. Sessões de Autenticação
CREATE TABLE IF NOT EXISTS "public"."auth_sessions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "profile_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "last_used_at" timestamp with time zone,
    "expires_at" timestamp with time zone,
    "device_type" "text",
    "refresh_token_hash" "text" NOT NULL,
    "revoked" boolean DEFAULT false NOT NULL,
    "ip" "text",
    "user_agent" "text",
    PRIMARY KEY ("id"),
    FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE
);

-- 4. Funções Utilitárias para RLS
CREATE OR REPLACE FUNCTION "public"."get_my_camara_id"() RETURNS "uuid"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
    SELECT camara_id FROM profiles WHERE id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION "public"."get_my_role"() RETURNS "text"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
    SELECT role::text FROM profiles WHERE id = auth.uid();
$$;

-- 5. Segurança (RLS)
ALTER TABLE "public"."camaras" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."auth_sessions" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Câmaras são visíveis publicamente" ON "public"."camaras" FOR SELECT USING (true);
CREATE POLICY "Acesso total para super admins" ON "public"."camaras" USING (("public"."get_my_role"() = 'super_admin'::"text"));
CREATE POLICY "Admins de câmara podem atualizar sua câmara" ON "public"."camaras" FOR UPDATE USING (("id" = "public"."get_my_camara_id"()) AND ("public"."get_my_role"() = 'admin_camara'::"text"));

CREATE POLICY "Usuários veem perfis da sua câmara" ON "public"."profiles" FOR SELECT USING (("camara_id" = "public"."get_my_camara_id"()));
CREATE POLICY "O próprio usuário pode se atualizar" ON "public"."profiles" FOR UPDATE USING (("id" = "auth"."uid"()));
CREATE POLICY "Acesso total para super admins" ON "public"."profiles" USING (("public"."get_my_role"() = 'super_admin'::"text"));
CREATE POLICY "Admins podem gerenciar perfis da câmara" ON "public"."profiles" USING (("camara_id" = "public"."get_my_camara_id"()) AND ("public"."get_my_role"() = 'admin_camara'::"text"));

CREATE POLICY "Usuários veem suas próprias sessões" ON "public"."auth_sessions" FOR SELECT USING (("profile_id" = "auth"."uid"()) OR ("public"."get_my_role"() = 'super_admin'::"text"));
CREATE POLICY "Usuários gerenciam suas sessões" ON "public"."auth_sessions" USING ("profile_id" = "auth"."uid"());
CREATE POLICY "Acesso total para super admins" ON "public"."auth_sessions" USING (("public"."get_my_role"() = 'super_admin'::"text"));
