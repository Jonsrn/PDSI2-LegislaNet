-- ==============================================================================
-- MIGRATION: 007 - Storage Buckets e Políticas
-- ==============================================================================



-- 1. Criação dos Buckets Públicos
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES 
    ('pdfs-pautas', 'pdfs-pautas', true, null, null),
    ('fotos-vereadores', 'fotos-vereadores', true, null, null),
    ('logos-partidos', 'logos-partidos', true, null, null),
    ('brasoes-camara', 'brasoes-camara', true, null, null)
ON CONFLICT (id) DO UPDATE SET public = EXCLUDED.public;

-- 2. Políticas para pdfs-pautas
CREATE POLICY "Pl pdfs qg04cu_0" ON storage.objects FOR SELECT TO anon, authenticated USING (bucket_id = 'pdfs-pautas');
CREATE POLICY "Pl pdfs qg04cu_1" ON storage.objects FOR INSERT TO anon, authenticated WITH CHECK (bucket_id = 'pdfs-pautas');
CREATE POLICY "Pl pdfs qg04cu_2" ON storage.objects FOR UPDATE TO anon, authenticated USING (bucket_id = 'pdfs-pautas');
CREATE POLICY "Pl pdfs qg04cu_3" ON storage.objects FOR DELETE TO anon, authenticated USING (bucket_id = 'pdfs-pautas');

-- 3. Políticas para fotos-vereadores
CREATE POLICY "Pl fotos vereadores 8t81x0_0" ON storage.objects FOR SELECT TO anon, authenticated USING (bucket_id = 'fotos-vereadores');
CREATE POLICY "Pl fotos vereadores 8t81x0_1" ON storage.objects FOR INSERT TO anon, authenticated WITH CHECK (bucket_id = 'fotos-vereadores');
CREATE POLICY "Pl fotos vereadores 8t81x0_2" ON storage.objects FOR UPDATE TO anon, authenticated USING (bucket_id = 'fotos-vereadores');
CREATE POLICY "Pl fotos vereadores 8t81x0_3" ON storage.objects FOR DELETE TO anon, authenticated USING (bucket_id = 'fotos-vereadores');

-- 4. Políticas para logos-partidos
CREATE POLICY "Pl logos partidos v1pktz_0" ON storage.objects FOR SELECT TO anon, authenticated USING (bucket_id = 'logos-partidos');
CREATE POLICY "Pl logos partidos v1pktz_1" ON storage.objects FOR INSERT TO anon, authenticated WITH CHECK (bucket_id = 'logos-partidos');
CREATE POLICY "Pl logos partidos v1pktz_2" ON storage.objects FOR UPDATE TO anon, authenticated USING (bucket_id = 'logos-partidos');
CREATE POLICY "Pl logos partidos v1pktz_3" ON storage.objects FOR DELETE TO anon, authenticated USING (bucket_id = 'logos-partidos');

-- 5. Políticas para brasoes-camara
CREATE POLICY "Pl brasoes 12ctvgz_0" ON storage.objects FOR INSERT TO anon, authenticated WITH CHECK (bucket_id = 'brasoes-camara');
CREATE POLICY "Pl brasoes 12ctvgz_1" ON storage.objects FOR SELECT TO anon, authenticated USING (bucket_id = 'brasoes-camara');
CREATE POLICY "Pl brasoes 12ctvgz_2" ON storage.objects FOR UPDATE TO anon, authenticated USING (bucket_id = 'brasoes-camara');
CREATE POLICY "Pl brasoes 12ctvgz_3" ON storage.objects FOR DELETE TO anon, authenticated USING (bucket_id = 'brasoes-camara');
