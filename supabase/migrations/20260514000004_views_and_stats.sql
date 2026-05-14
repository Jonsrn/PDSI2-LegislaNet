-- ==============================================================================
-- MIGRATION: 004 - Views Materializadas
-- ==============================================================================

CREATE MATERIALIZED VIEW "public"."mv_vereador_estatisticas" AS
 WITH "votos_validos" AS (
         SELECT "v_1"."vereador_id",
            "count"("v_1"."id") AS "total_votos",
            "count"(DISTINCT "p"."sessao_id") AS "sessoes_com_voto"
           FROM ("public"."votos" "v_1"
             JOIN "public"."pautas" "p" ON (("v_1"."pauta_id" = "p"."id")))
          WHERE ("p"."status" = 'Finalizada'::"public"."pauta_status")
          GROUP BY "v_1"."vereador_id"
        ), "sessoes_mandato" AS (
         SELECT "ver"."id" AS "vereador_id",
            "count"(DISTINCT "s"."id") AS "total_sessoes"
           FROM (("public"."vereadores" "ver"
             JOIN "public"."sessoes" "s" ON (("s"."camara_id" = "ver"."camara_id")))
             JOIN "public"."pautas" "p" ON (("p"."sessao_id" = "s"."id")))
          WHERE (("s"."data_sessao" <= "now"()) AND ("s"."data_sessao" >= "ver"."created_at") AND (("ver"."data_saida" IS NULL) OR ("s"."data_sessao" <= "ver"."data_saida")) AND ("p"."status" = 'Finalizada'::"public"."pauta_status"))
          GROUP BY "ver"."id"
        )
 SELECT "v"."id" AS "vereador_id",
    "v"."camara_id",
    "v"."nome_parlamentar",
    "v"."foto_url",
    "v"."is_active",
    COALESCE("vv"."total_votos", (0)::bigint) AS "total_votacoes",
    COALESCE("vv"."sessoes_com_voto", (0)::bigint) AS "sessoes_presentes",
    COALESCE("sm"."total_sessoes", (0)::bigint) AS "total_sessoes_mandato",
        CASE
            WHEN (COALESCE("sm"."total_sessoes", (0)::bigint) = 0) THEN (0)::numeric
            ELSE "round"((((COALESCE("vv"."sessoes_com_voto", (0)::bigint))::numeric / ("sm"."total_sessoes")::numeric) * (100)::numeric))
        END AS "percentual_presenca",
    "now"() AS "last_refreshed"
   FROM (("public"."vereadores" "v"
     LEFT JOIN "votos_validos" "vv" ON (("v"."id" = "vv"."vereador_id")))
     LEFT JOIN "sessoes_mandato" "sm" ON (("v"."id" = "sm"."vereador_id")))
  WHERE ("v"."is_active" = true);
