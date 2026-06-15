const request = require('supertest');
const app = require('../server');
const { getSuperAdminToken, getAppAuth } = require('./helpers/authHelper');

describe('API Web Backend - Gestão de Vereadores (Fase 5)', () => {
    let appToken;
    let superToken;
    let camaraId;
    let partidoId;
    let vereadorId;
    let testEmail = `vereador_${Math.floor(Math.random() * 10000)}@teste.com`;

    beforeAll(async () => {
        const appAuth = await getAppAuth();
        appToken = appAuth.token;
        camaraId = appAuth.profile.camara_id;
        superToken = await getSuperAdminToken();

        const resPartido = await request(app)
            .post('/api/admin/partidos')
            .set('Authorization', `Bearer ${superToken}`)
            .field('nome', 'Partido Temporário de Vereador')
            .field('sigla', 'PTV');
        
        partidoId = resPartido.body?.id;
        if (!partidoId) {
            throw new Error(`Erro ao criar partido para o teste: ${JSON.stringify(resPartido.body)}`);
        }
    });

    describe('Segurança Perimetral', () => {
        it('Deve rejeitar o Admin da Câmara (App) ao tentar usar a rota de Super Admin para criar vereadores globalmente (Status 403)', async () => {
            const res = await request(app)
                .post(`/api/camaras/${camaraId}/vereadores`)
                .set('Authorization', `Bearer ${appToken}`);
            
            expect(res.status).toBe(403);
        });

        it('Deve bloquear acesso sem token na listagem de vereadores (401)', async () => {
            const res = await request(app).get('/api/app/vereadores');
            expect(res.status).toBe(401);
        });

        it('Deve rejeitar token JWT malformado (401)', async () => {
            const res = await request(app)
                .get('/api/app/vereadores')
                .set('Authorization', 'Bearer token.invalido.abc');
            expect(res.status).toBe(401);
        });
    });

    describe('Validação de Dados e Restrições de Negócio', () => {
        it('Deve retornar 400 ao tentar criar vereador sem partido', async () => {
            const res = await request(app)
                .post('/api/app/vereadores')
                .set('Authorization', `Bearer ${appToken}`)
                .field('nome_parlamentar', 'Vereador Incompleto')
                .field('email', 'inc@teste.com')
                .field('senha', 'Teste123@');
            
            expect(res.status).toBe(400);
            expect(res.body.error || res.body.errors).toBeDefined();
        });

        it('Deve retornar 400 ao tentar criar vereador sem email', async () => {
            const res = await request(app)
                .post('/api/app/vereadores')
                .set('Authorization', `Bearer ${appToken}`)
                .field('nome_parlamentar', 'Vereador Sem Email')
                .field('senha', 'Teste123@')
                .field('partido_id', partidoId);
            
            expect(res.status).toBe(400);
        });

        it('Deve retornar 400 ao tentar criar vereador sem senha', async () => {
            const res = await request(app)
                .post('/api/app/vereadores')
                .set('Authorization', `Bearer ${appToken}`)
                .field('nome_parlamentar', 'Vereador Sem Senha')
                .field('email', `sem_senha_${Date.now()}@teste.com`)
                .field('partido_id', partidoId);
            
            expect(res.status).toBe(400);
        });
    });

    describe('Fluxo do Admin da Câmara (App Role)', () => {
        it('Deve criar um vereador na sua própria câmara (Status 201)', async () => {
            const res = await request(app)
                .post('/api/app/vereadores')
                .set('Authorization', `Bearer ${appToken}`)
                .field('nome_parlamentar', 'Vereador de Teste')
                .field('email', testEmail)
                .field('senha', 'Teste123@')
                .field('partido_id', partidoId)
                .field('is_presidente', 'false')
                .field('is_vice_presidente', 'false');

            expect(res.status).toBe(201);
            expect(res.body.data).toHaveProperty('id');
            vereadorId = res.body.data.id;
        });

        it('Deve listar os vereadores da sua câmara (Status 200)', async () => {
            const res = await request(app)
                .get('/api/app/vereadores')
                .set('Authorization', `Bearer ${appToken}`);
            
            expect(res.status).toBe(200);
            expect(Array.isArray(res.body)).toBe(true);
            const vereadorEncontrado = res.body.find(v => v.id === vereadorId);
            expect(vereadorEncontrado).toBeDefined();
        });

        it('Deve atualizar os dados do vereador (Status 200)', async () => {
            const res = await request(app)
                .put(`/api/app/vereadores/${vereadorId}`)
                .set('Authorization', `Bearer ${appToken}`)
                .field('nome_parlamentar', 'Vereador de Teste Modificado')
                .field('partido_id', partidoId);

            expect(res.status).toBe(200);
            expect(res.body).toHaveProperty('nome_parlamentar', 'Vereador de Teste Modificado');
        });

        it('Deve garantir a regra de negócio da Mesa (Bloquear 2º Presidente ativo)', async () => {
            // A Câmara de teste já possui um presidente (criado pelo helper de autenticação)
            // Tenta criar um NOVO vereador TAMBÉM como Presidente
            const resNew = await request(app)
                .post('/api/app/vereadores')
                .set('Authorization', `Bearer ${appToken}`)
                .field('nome_parlamentar', 'Vereador Opositor')
                .field('email', `opositor_${Date.now()}@teste.com`)
                .field('senha', 'Teste123@')
                .field('partido_id', partidoId)
                .field('is_presidente', 'true');
            
            // Deve falhar com 400 da regra de negócio (Conflito de cargo)
            expect(resNew.status).toBe(400);
            expect(resNew.body.error).toMatch(/Conflito de cargo/i);
        });
    });

    describe('Limpeza (Teardown)', () => {
        it('Deve deletar o vereador recém-criado usando o Super Admin (Status 204)', async () => {
            // O APP não tem permissão para DELETE físico, apenas inativar,
            // Então usamos o Super Admin para remover completamente
            const res = await request(app)
                .delete(`/api/vereadores/${vereadorId}`)
                .set('Authorization', `Bearer ${superToken}`);
            
            expect(res.status).toBe(204); // 204 No Content
        });

        it('Deve deletar o partido criado para o teste (Status 204)', async () => {
            const res = await request(app)
                .delete(`/api/admin/partidos/${partidoId}`)
                .set('Authorization', `Bearer ${superToken}`);
            
            expect(res.status).toBe(204);
        });
    });
});
