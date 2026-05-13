-- ==============================================================================
-- MIGRATION: 006 - Índices de Performance
-- ==============================================================================

-- Índices para eventos_fala
CREATE INDEX IF NOT EXISTS idx_eventos_fala_historico ON public.eventos_fala USING btree (historico_fala_id);
CREATE INDEX IF NOT EXISTS idx_eventos_fala_timestamp ON public.eventos_fala USING btree ("timestamp");
CREATE INDEX IF NOT EXISTS idx_eventos_fala_tipo ON public.eventos_fala USING btree (tipo_evento);

-- Índices para historico_falas
CREATE INDEX IF NOT EXISTS idx_historico_falas_camara_id ON public.historico_falas USING btree (camara_id);
CREATE INDEX IF NOT EXISTS idx_historico_falas_encerrada_em ON public.historico_falas USING btree (encerrada_em);
CREATE INDEX IF NOT EXISTS idx_historico_falas_preparada_em ON public.historico_falas USING btree (preparada_em);
CREATE INDEX IF NOT EXISTS idx_historico_falas_sessao_id ON public.historico_falas USING btree (sessao_id);
CREATE INDEX IF NOT EXISTS idx_historico_falas_status ON public.historico_falas USING btree (status);
CREATE INDEX IF NOT EXISTS idx_historico_falas_vereador_id ON public.historico_falas USING btree (vereador_id);

-- Índices para livestreams
CREATE INDEX IF NOT EXISTS idx_livestreams_camara_id ON public.livestreams USING btree (camara_id);
CREATE INDEX IF NOT EXISTS idx_livestreams_created_at ON public.livestreams USING btree (created_at);
CREATE INDEX IF NOT EXISTS idx_livestreams_current ON public.livestreams USING btree (is_current);
CREATE INDEX IF NOT EXISTS idx_livestreams_status ON public.livestreams USING btree (status);

-- Índice para a View Materializada
CREATE INDEX IF NOT EXISTS idx_mv_vereador_estatisticas_camara_id ON public.mv_vereador_estatisticas USING btree (camara_id);

-- Índices para pautas
CREATE INDEX IF NOT EXISTS idx_pautas_ao_vivo_true ON public.pautas USING btree (sessao_id, updated_at);
CREATE INDEX IF NOT EXISTS idx_pautas_status_updated_at ON public.pautas USING btree (status, updated_at);

-- Índices para auth_sessions
CREATE INDEX IF NOT EXISTS idx_sessions_profile_id ON public.auth_sessions USING btree (profile_id);
CREATE INDEX IF NOT EXISTS idx_sessions_refresh_hash ON public.auth_sessions USING btree (refresh_token_hash);

-- Índices para tv_displays
CREATE INDEX IF NOT EXISTS idx_tv_displays_camara_id ON public.tv_displays USING btree (camara_id);
