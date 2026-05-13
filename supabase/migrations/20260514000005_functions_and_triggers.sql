-- ==============================================================================
-- MIGRATION: 005 - Funções Auxiliares e Triggers Restantes
-- ==============================================================================

-- 1. email_exists (Verifica se um email já está cadastrado)
CREATE OR REPLACE FUNCTION "public"."email_exists"("email_to_check" "text") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
    found_email text;
BEGIN
    SELECT email INTO found_email FROM auth.users WHERE email = email_to_check LIMIT 1;
    RETURN found_email IS NOT NULL;
END;
$$;

-- 2. get_my_claims (Retorna o JWT atual)
CREATE OR REPLACE FUNCTION "public"."get_my_claims"() RETURNS "jsonb"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
    SELECT auth.jwt();
$$;

-- 3. handle_new_user (Gatilho para popular public.profiles quando usuário é criado no Supabase Auth)
CREATE OR REPLACE FUNCTION "public"."handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
    INSERT INTO public.profiles (id, nome, role, camara_id)
    VALUES (
        new.id,
        COALESCE(new.raw_user_meta_data->>'nome', split_part(new.email, '@', 1)),
        'admin_camara',
        NULL
    )
    ON CONFLICT (id) DO NOTHING;
    RETURN new;
END;
$$;

-- Trigger real para a tabela auth.users
DROP TRIGGER IF EXISTS "on_auth_user_created" ON "auth"."users";
CREATE TRIGGER "on_auth_user_created" AFTER INSERT ON "auth"."users" FOR EACH ROW EXECUTE FUNCTION "public"."handle_new_user"();

-- 4. refresh_vereador_estatisticas (Atualiza a View Materializada)
CREATE OR REPLACE FUNCTION "public"."refresh_vereador_estatisticas"() RETURNS void
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    REFRESH MATERIALIZED VIEW mv_vereador_estatisticas;
END;
$$;

-- 5. set_updated_at (Sinônimo usado em algumas tabelas do projeto original)
CREATE OR REPLACE FUNCTION "public"."set_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

-- 6. calcular_estatisticas_vereadores (RPC dinâmico para estatísticas)
CREATE OR REPLACE FUNCTION "public"."calcular_estatisticas_vereadores"("p_camara_id" "uuid", "p_data_atual" timestamp with time zone) RETURNS TABLE("vereador_id" "uuid", "total_votacoes" bigint, "sessoes_presentes" bigint)
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    RETURN QUERY
    SELECT 
        v.id AS vereador_id,
        (SELECT count(*)::bigint FROM votos WHERE votos.vereador_id = v.id) AS total_votacoes,
        (SELECT count(DISTINCT p.sessao_id)::bigint FROM votos JOIN pautas p ON p.id = votos.pauta_id WHERE votos.vereador_id = v.id) AS sessoes_presentes
    FROM vereadores v
    WHERE v.camara_id = p_camara_id;
END;
$$;
