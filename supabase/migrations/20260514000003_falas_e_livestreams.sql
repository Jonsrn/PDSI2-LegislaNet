-- ==============================================================================
-- MIGRATION: 003 - Falas, TVs e Livestreams
-- ==============================================================================

CREATE TABLE IF NOT EXISTS "public"."historico_falas" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "orador_id" "uuid" NOT NULL,
    "sessao_id" "uuid" NOT NULL,
    "vereador_id" "uuid" NOT NULL,
    "camara_id" "uuid" NOT NULL,
    "status" "text" DEFAULT 'preparada'::"text" NOT NULL,
    "tempo_alocado_minutos" integer NOT NULL,
    "tempo_restante_segundos" integer,
    "preparada_em" timestamp with time zone NOT NULL,
    "iniciada_em" timestamp with time zone,
    "encerrada_em" timestamp with time zone,
    "tempo_decorrido_segundos" integer DEFAULT 0,
    "tempo_utilizado_minutos" numeric(10,2) DEFAULT 0,
    "total_pausas" integer DEFAULT 0,
    "tempo_total_pausado_segundos" integer DEFAULT 0,
    "tempo_adicionado_total_minutos" integer DEFAULT 0,
    "recomecos" integer DEFAULT 0,
    "encerrada_manualmente" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    PRIMARY KEY ("id"),
    FOREIGN KEY ("orador_id") REFERENCES "public"."oradores"("id") ON DELETE CASCADE,
    FOREIGN KEY ("sessao_id") REFERENCES "public"."sessoes"("id") ON DELETE CASCADE,
    FOREIGN KEY ("vereador_id") REFERENCES "public"."vereadores"("id") ON DELETE CASCADE,
    FOREIGN KEY ("camara_id") REFERENCES "public"."camaras"("id") ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS "public"."eventos_fala" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "historico_fala_id" "uuid" NOT NULL,
    "tipo_evento" "text" NOT NULL,
    "tempo_restante_segundos" integer,
    "tempo_adicionado_minutos" integer,
    "observacao" "text",
    "timestamp" timestamp with time zone DEFAULT "now"(),
    PRIMARY KEY ("id"),
    FOREIGN KEY ("historico_fala_id") REFERENCES "public"."historico_falas"("id") ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS "public"."livestreams" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "camara_id" "uuid" NOT NULL,
    "youtube_video_id" "text" UNIQUE,
    "youtube_video_url" "text",
    "status" "text" NOT NULL,
    "title" "text",
    "description" "text",
    "thumbnail_url" "text",
    "scheduled_start_time" timestamp with time zone,
    "actual_start_time" timestamp with time zone,
    "actual_end_time" timestamp with time zone,
    "viewer_count" integer DEFAULT 0,
    "is_current" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    PRIMARY KEY ("id"),
    FOREIGN KEY ("camara_id") REFERENCES "public"."camaras"("id") ON DELETE CASCADE,
    CONSTRAINT "livestreams_status_check" CHECK (("status" = ANY (ARRAY['live'::"text", 'upcoming'::"text", 'ended'::"text", 'scheduled'::"text"])))
);

-- Foreign keys circulares de camaras adicionadas após a criação de livestreams
ALTER TABLE "public"."camaras" ADD CONSTRAINT "camaras_current_livestream_id_fkey" FOREIGN KEY ("current_livestream_id") REFERENCES "public"."livestreams"("id");
ALTER TABLE "public"."camaras" ADD CONSTRAINT "camaras_last_livestream_id_fkey" FOREIGN KEY ("last_livestream_id") REFERENCES "public"."livestreams"("id");

CREATE TABLE IF NOT EXISTS "public"."tv_displays" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "profile_id" "uuid",
    "camara_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "last_seen_at" timestamp with time zone,
    PRIMARY KEY ("id"),
    FOREIGN KEY ("camara_id") REFERENCES "public"."camaras"("id") ON DELETE CASCADE,
    FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL
);

-- TRIGGERS DE UPDATE
CREATE OR REPLACE FUNCTION "public"."update_updated_at_column"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
  BEGIN
      NEW.updated_at = NOW();
      RETURN NEW;
  END;
$$;

CREATE TRIGGER "update_livestreams_updated_at" BEFORE UPDATE ON "public"."livestreams" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();
CREATE TRIGGER "trg_set_updated_at_pautas" BEFORE UPDATE ON "public"."pautas" FOR EACH ROW WHEN (("old".* IS DISTINCT FROM "new".*)) EXECUTE FUNCTION "public"."update_updated_at_column"();
CREATE TRIGGER "update_historico_falas_updated_at" BEFORE UPDATE ON "public"."historico_falas" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();

-- RLS
ALTER TABLE "public"."historico_falas" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."eventos_fala" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."livestreams" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."tv_displays" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Histórico de falas é visível publicamente" ON "public"."historico_falas" FOR SELECT USING (true);
CREATE POLICY "Acesso total para super admins" ON "public"."historico_falas" USING (("public"."get_my_role"() = 'super_admin'::"text"));
CREATE POLICY "Admins podem gerir histórico da sua câmara" ON "public"."historico_falas" USING (("camara_id" = "public"."get_my_camara_id"()) AND ("public"."get_my_role"() = 'admin_camara'::"text"));

CREATE POLICY "Eventos de fala são visíveis publicamente" ON "public"."eventos_fala" FOR SELECT USING (true);
CREATE POLICY "Acesso total para super admins" ON "public"."eventos_fala" USING (("public"."get_my_role"() = 'super_admin'::"text"));
CREATE POLICY "Admins podem gerir eventos de fala da câmara" ON "public"."eventos_fala" USING (
    ("historico_fala_id" IN (SELECT "id" FROM "public"."historico_falas" WHERE "camara_id" = "public"."get_my_camara_id"()))
    AND ("public"."get_my_role"() = 'admin_camara'::"text")
);

CREATE POLICY "Livestreams são visíveis publicamente" ON "public"."livestreams" FOR SELECT USING (true);
CREATE POLICY "Acesso total para super admins" ON "public"."livestreams" USING (("public"."get_my_role"() = 'super_admin'::"text"));
CREATE POLICY "Admins podem gerir livestreams da sua câmara" ON "public"."livestreams" USING (("camara_id" = "public"."get_my_camara_id"()) AND ("public"."get_my_role"() = 'admin_camara'::"text"));

CREATE POLICY "TV Displays são visíveis pela câmara" ON "public"."tv_displays" FOR SELECT USING (("camara_id" = "public"."get_my_camara_id"()) OR ("public"."get_my_role"() = 'super_admin'::"text"));
CREATE POLICY "Acesso total para super admins" ON "public"."tv_displays" USING (("public"."get_my_role"() = 'super_admin'::"text"));
CREATE POLICY "Admins podem gerir TVs da sua câmara" ON "public"."tv_displays" USING (("camara_id" = "public"."get_my_camara_id"()) AND ("public"."get_my_role"() = 'admin_camara'::"text"));
