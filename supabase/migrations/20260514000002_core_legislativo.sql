-- ==============================================================================
-- MIGRATION: 002 - Core Legislativo (Sessões, Pautas, Votos, Vereadores)
-- ==============================================================================

CREATE TYPE "public"."pauta_status" AS ENUM ('Pendente', 'Em Votação', 'Finalizada', 'Arquivada');
CREATE TYPE "public"."resultado_votacao" AS ENUM ('Não Votada', 'Aprovada', 'Reprovada');
CREATE TYPE "public"."sessao_status" AS ENUM ('Agendada', 'Em Andamento', 'Finalizada');
CREATE TYPE "public"."sessao_tipo" AS ENUM ('Ordinária', 'Extraordinária', 'Solene');
CREATE TYPE "public"."voto_tipo" AS ENUM ('SIM', 'NÃO', 'ABSTENÇÃO');

CREATE TABLE IF NOT EXISTS "public"."partidos" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "nome" "text" NOT NULL,
    "sigla" character varying(20) NOT NULL,
    "logo_url" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "public"."sessoes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "camara_id" "uuid" NOT NULL,
    "nome" "text" NOT NULL,
    "tipo" "public"."sessao_tipo" NOT NULL,
    "status" "public"."sessao_status" DEFAULT 'Agendada'::"public"."sessao_status" NOT NULL,
    "data_sessao" timestamp with time zone NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    PRIMARY KEY ("id"),
    FOREIGN KEY ("camara_id") REFERENCES "public"."camaras"("id") ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS "public"."pautas" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "sessao_id" "uuid" NOT NULL,
    "nome" "text" NOT NULL,
    "descricao" "text",
    "anexo_url" "text",
    "status" "public"."pauta_status" DEFAULT 'Pendente'::"public"."pauta_status" NOT NULL,
    "votacao_simbolica" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "autor" "text",
    "created_by" "uuid",
    "resultado_votacao" "public"."resultado_votacao" DEFAULT 'Não Votada'::"public"."resultado_votacao" NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "ao_vivo" boolean DEFAULT false NOT NULL,
    PRIMARY KEY ("id"),
    FOREIGN KEY ("sessao_id") REFERENCES "public"."sessoes"("id") ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS "public"."vereadores" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "profile_id" "uuid" NOT NULL UNIQUE,
    "camara_id" "uuid" NOT NULL,
    "partido_id" "uuid",
    "nome_parlamentar" "text" NOT NULL,
    "foto_url" "text",
    "is_presidente" boolean DEFAULT false,
    "is_vice_presidente" boolean DEFAULT false,
    "is_active" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "data_saida" timestamp with time zone,
    PRIMARY KEY ("id"),
    FOREIGN KEY ("camara_id") REFERENCES "public"."camaras"("id") ON DELETE CASCADE,
    FOREIGN KEY ("partido_id") REFERENCES "public"."partidos"("id") ON DELETE SET NULL,
    FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS "public"."votos" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "pauta_id" "uuid" NOT NULL,
    "vereador_id" "uuid" NOT NULL,
    "voto" "public"."voto_tipo" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "partido_id_no_voto" "uuid",
    "era_presidente_no_voto" boolean DEFAULT false,
    "era_vice_presidente_no_voto" boolean DEFAULT false,
    PRIMARY KEY ("id"),
    UNIQUE ("pauta_id", "vereador_id"),
    FOREIGN KEY ("pauta_id") REFERENCES "public"."pautas"("id") ON DELETE CASCADE,
    FOREIGN KEY ("vereador_id") REFERENCES "public"."vereadores"("id") ON DELETE CASCADE,
    FOREIGN KEY ("partido_id_no_voto") REFERENCES "public"."partidos"("id")
);

CREATE TABLE IF NOT EXISTS "public"."oradores" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "sessao_id" "uuid" NOT NULL,
    "vereador_id" "uuid" NOT NULL,
    "ordem" integer NOT NULL,
    "tempo_fala_minutos" integer,
    "created_at" timestamp with time zone DEFAULT "now"(),
    PRIMARY KEY ("id"),
    UNIQUE ("sessao_id", "ordem"),
    UNIQUE ("sessao_id", "vereador_id"),
    FOREIGN KEY ("sessao_id") REFERENCES "public"."sessoes"("id") ON DELETE CASCADE,
    FOREIGN KEY ("vereador_id") REFERENCES "public"."vereadores"("id") ON DELETE CASCADE
);

-- RLS
ALTER TABLE "public"."partidos" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."sessoes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."pautas" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."vereadores" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."votos" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."oradores" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Partidos são visíveis publicamente" ON "public"."partidos" FOR SELECT USING (true);
CREATE POLICY "Acesso total para super admins" ON "public"."partidos" USING (("public"."get_my_role"() = 'super_admin'::"text"));

CREATE POLICY "Sessões são visíveis publicamente" ON "public"."sessoes" FOR SELECT USING (true);
CREATE POLICY "Acesso total para super admins" ON "public"."sessoes" USING (("public"."get_my_role"() = 'super_admin'::"text"));
CREATE POLICY "Admins podem gerir sessões da sua câmara" ON "public"."sessoes" USING (("camara_id" = "public"."get_my_camara_id"()) AND ("public"."get_my_role"() = 'admin_camara'::"text"));

CREATE POLICY "Pautas são visíveis publicamente" ON "public"."pautas" FOR SELECT USING (true);
CREATE POLICY "Acesso total para super admins" ON "public"."pautas" USING (("public"."get_my_role"() = 'super_admin'::"text"));
CREATE POLICY "Admins podem gerir pautas da sua câmara" ON "public"."pautas" USING (
    ("sessao_id" IN (SELECT "id" FROM "public"."sessoes" WHERE "camara_id" = "public"."get_my_camara_id"())) 
    AND ("public"."get_my_role"() = 'admin_camara'::"text")
);

CREATE POLICY "Vereadores são visíveis publicamente" ON "public"."vereadores" FOR SELECT USING (true);
CREATE POLICY "Acesso total para super admins" ON "public"."vereadores" USING (("public"."get_my_role"() = 'super_admin'::"text"));
CREATE POLICY "Admins podem gerir vereadores da sua câmara" ON "public"."vereadores" USING (("camara_id" = "public"."get_my_camara_id"()) AND ("public"."get_my_role"() = 'admin_camara'::"text"));

CREATE POLICY "Votos são visíveis publicamente" ON "public"."votos" FOR SELECT USING (true);
CREATE POLICY "Acesso total para super admins" ON "public"."votos" USING (("public"."get_my_role"() = 'super_admin'::"text"));
CREATE POLICY "Admins podem gerir votos da sua câmara" ON "public"."votos" USING (
    ("pauta_id" IN (SELECT p."id" FROM "public"."pautas" p JOIN "public"."sessoes" s ON p."sessao_id" = s."id" WHERE s."camara_id" = "public"."get_my_camara_id"()))
    AND ("public"."get_my_role"() = 'admin_camara'::"text")
);
CREATE POLICY "Vereadores podem votar em pautas da sua câmara" ON "public"."votos" FOR INSERT WITH CHECK (
    ("vereador_id" IN (SELECT "id" FROM "public"."vereadores" WHERE "profile_id" = "auth"."uid"()))
);

CREATE POLICY "Oradores são visíveis publicamente" ON "public"."oradores" FOR SELECT USING (true);
CREATE POLICY "Acesso total para super admins" ON "public"."oradores" USING (("public"."get_my_role"() = 'super_admin'::"text"));
CREATE POLICY "Admins podem gerir oradores da sua câmara" ON "public"."oradores" USING (
    ("sessao_id" IN (SELECT "id" FROM "public"."sessoes" WHERE "camara_id" = "public"."get_my_camara_id"()))
    AND ("public"."get_my_role"() = 'admin_camara'::"text")
);
