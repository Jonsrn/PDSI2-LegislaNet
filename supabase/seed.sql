-- ==============================================================================
-- SEED: Dados essenciais para inicialização do projeto em tempo de login
-- ==============================================================================

-- 1. Inserir Câmaras base para os logins existirem
INSERT INTO public.camaras (id, nome_camara, municipio, estado, is_active)
VALUES 
('a5df7317-35d5-47e0-955f-668862ed00ac', 'Câmara Municipal de Dom Expedito Lopes', 'Del', 'PI', true)
ON CONFLICT (id) DO NOTHING;

-- 2. Inserir os Usuários diretamente no esquema Auth 
INSERT INTO auth.users (
    id,
    instance_id,
    email,
    encrypted_password,
    email_confirmed_at,
    raw_app_meta_data,
    raw_user_meta_data,
    created_at,
    updated_at,
    role,
    aud,
    confirmation_token,
    recovery_token,
    email_change_token_new,
    email_change
) VALUES
('d8612e16-98bf-48c0-b173-de6d20e23601', '00000000-0000-0000-0000-000000000000', 'jffilho618@gmail.com', '$2a$10$pujQclwnMu.WT8XvmY4ytOnn.e2HYf5g3ltuuuXX8LnnPYSG1W/Eq', now(), '{"provider":"email","providers":["email"]}', '{"nome":"Bomba"}', now(), now(), 'authenticated', 'authenticated', '', '', '', ''),
('d326d456-63c0-4c55-82e8-9bea6c80bf98', '00000000-0000-0000-0000-000000000000', 'del@exemplo.com', '$2a$10$jvfxKuDBTCny7SvgtJSLUeNhgsBatdfUSmLozdusaUe6kkc4UiANi', now(), '{"provider":"email","providers":["email"]}', '{"nome":"Admin Câmara Municipal de Del"}', now(), now(), 'authenticated', 'authenticated', '', '', '', ''),
('525e8ac1-4b5f-444d-a71b-f4f591a938e1', '00000000-0000-0000-0000-000000000000', 'tv@del.com', '$2a$10$gr7bEIy00F5zaEcTAZ7EguqtOeipMA6qztQzKK6Jkk1px7NM1.INC', now(), '{"provider":"email","providers":["email"]}', '{"nome":"TV Câmara Municipal de Del"}', now(), now(), 'authenticated', 'authenticated', '', '', '', '')
ON CONFLICT (id) DO UPDATE SET
    encrypted_password = EXCLUDED.encrypted_password,
    aud = EXCLUDED.aud,
    role = EXCLUDED.role,
    email_confirmed_at = EXCLUDED.email_confirmed_at;

-- 2.1 Inserir Identidades de Login (Obrigatório para o Supabase Auth validar a senha)
INSERT INTO auth.identities (id, user_id, provider_id, identity_data, provider, created_at, updated_at) VALUES
(gen_random_uuid(), 'd8612e16-98bf-48c0-b173-de6d20e23601', 'd8612e16-98bf-48c0-b173-de6d20e23601', format('{"sub":"%s","email":"%s"}', 'd8612e16-98bf-48c0-b173-de6d20e23601', 'jffilho618@gmail.com')::jsonb, 'email', now(), now()),
(gen_random_uuid(), 'd326d456-63c0-4c55-82e8-9bea6c80bf98', 'd326d456-63c0-4c55-82e8-9bea6c80bf98', format('{"sub":"%s","email":"%s"}', 'd326d456-63c0-4c55-82e8-9bea6c80bf98', 'del@exemplo.com')::jsonb, 'email', now(), now()),
(gen_random_uuid(), '525e8ac1-4b5f-444d-a71b-f4f591a938e1', '525e8ac1-4b5f-444d-a71b-f4f591a938e1', format('{"sub":"%s","email":"%s"}', '525e8ac1-4b5f-444d-a71b-f4f591a938e1', 'tv@del.com')::jsonb, 'email', now(), now())
ON CONFLICT DO NOTHING;

-- 3. Inserir os perfis atrelados (Roles e Câmara ID)
INSERT INTO public.profiles (id, nome, role, camara_id) VALUES
('d8612e16-98bf-48c0-b173-de6d20e23601', 'Bomba', 'super_admin', null),
('d326d456-63c0-4c55-82e8-9bea6c80bf98', 'Admin Câmara Municipal de Del', 'admin_camara', 'a5df7317-35d5-47e0-955f-668862ed00ac'),
('525e8ac1-4b5f-444d-a71b-f4f591a938e1', 'TV Câmara Municipal de Del', 'tv', 'a5df7317-35d5-47e0-955f-668862ed00ac')
ON CONFLICT (id) DO UPDATE SET 
role = EXCLUDED.role, 
camara_id = EXCLUDED.camara_id,
nome = EXCLUDED.nome;
