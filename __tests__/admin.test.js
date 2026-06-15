const request = require('supertest');
const app = require('../server');
const { getSuperAdminToken, getAppAuth, getTvAuth } = require('./helpers/authHelper');

describe('API Web Backend - Admin Routes (Super Admin Role)', () => {
    let superAdminToken;
    let appToken;
    let tvToken;
    let partidoCriadoId = null;

    beforeAll(async () => {
        superAdminToken = await getSuperAdminToken();
        const authData = await getAppAuth();
        appToken = authData.token;
        const tvAuth = await getTvAuth();
        tvToken = tvAuth.token;
    });

    afterAll(async () => {
        // Teardown de Segurança (Garante que se o delete falhar, tentamos de novo)
        if (partidoCriadoId) {
            await request(app)
                .delete(`/api/admin/partidos/${partidoCriadoId}`)
                .set('Authorization', `Bearer ${superAdminToken}`);
        }
    });

    describe('Segurança de Acesso (RBAC)', () => {
        it('Deve rejeitar Admin da Câmara com 403 Forbidden', async () => {
            const res = await request(app)
                .get('/api/admin/camaras')
                .set('Authorization', `Bearer ${appToken}`);
            expect(res.status).toBe(403);
            expect(res.body.error).toMatch(/acesso negado/i);
        });

        it('Deve rejeitar TV com 403 Forbidden', async () => {
            const res = await request(app)
                .get('/api/admin/camaras')
                .set('Authorization', `Bearer ${tvToken}`);
            expect(res.status).toBe(403);
            expect(res.body.error).toMatch(/acesso negado/i);
        });

        it('Deve bloquear acesso sem token (401)', async () => {
            const res = await request(app).get('/api/admin/camaras');
            expect(res.status).toBe(401);
        });

        it('Deve rejeitar token JWT malformado (401)', async () => {
            const res = await request(app)
                .get('/api/admin/camaras')
                .set('Authorization', 'Bearer token.falso.invalido');
            expect(res.status).toBe(401);
        });

        it('Deve bloquear App na criação de partidos globais (403)', async () => {
            const res = await request(app)
                .post('/api/admin/partidos')
                .set('Authorization', `Bearer ${appToken}`)
                .field('nome', 'Partido Invasor')
                .field('sigla', 'PINV');
            expect(res.status).toBe(403);
        });

        it('Deve bloquear TV na criação de partidos globais (403)', async () => {
            const res = await request(app)
                .post('/api/admin/partidos')
                .set('Authorization', `Bearer ${tvToken}`)
                .field('nome', 'Partido TV')
                .field('sigla', 'PTV');
            expect(res.status).toBe(403);
        });

        it('Deve permitir acesso ao Super Admin com 200 OK', async () => {
            const res = await request(app)
                .get('/api/admin/camaras')
                .set('Authorization', `Bearer ${superAdminToken}`);
            expect(res.status).toBe(200);
            expect(Array.isArray(res.body.data)).toBe(true);
        });
    });

    describe('Gestão de Câmaras (Validação de Dados e Restrições)', () => {
        it('Deve retornar 400 ao tentar criar Câmara sem campos obrigatórios (nome, cnpj, etc)', async () => {
            const res = await request(app)
                .post('/api/admin/camaras')
                .set('Authorization', `Bearer ${superAdminToken}`)
                .send({ nome: '' }); // Faltando CNPJ, email, etc.

            expect(res.status).toBe(400);
            expect(res.body.error || res.body.errors).toBeDefined();
        });

        it('Deve retornar erro de conflito (400 ou 409) ao tentar criar Câmara com e-mail do Admin já existente', async () => {
            const res = await request(app)
                .post('/api/admin/camaras')
                .set('Authorization', `Bearer ${superAdminToken}`)
                .send({
                    nome: 'Camara Conflito',
                    cnpj: '12.345.678/0001-90',
                    email: 'srn@exemplo.com', // Já existe da nossa câmara
                    telefone: '89999999999',
                    endereco: 'Rua x',
                    slug: 'camara-conflito',
                    limite_sessoes: 10,
                    limite_armazenamento_gb: 5,
                    admin_nome: 'Admin Teste',
                    admin_email: 'srn@exemplo.com', // O email real causa conflito
                    admin_senha: 'Password@123'
                });

            // Pode ser 400 da validação cruzada do Controller ou 409 do Banco.
            expect(res.status).toBeGreaterThanOrEqual(400);
            expect(res.status).toBeLessThan(500);
        });
    });

    describe('Gestão de Partidos (Caminho Feliz com Teardown)', () => {
        it('Deve cadastrar um partido temporário (Status 201)', async () => {
            const res = await request(app)
                .post('/api/admin/partidos')
                .set('Authorization', `Bearer ${superAdminToken}`)
                // Como não estamos mandando file real, mandamos só os fields via form
                .field('nome', 'Partido de Teste Backend')
                .field('sigla', 'PTEST');

            expect(res.status).toBe(201);
            expect(res.body).toHaveProperty('id');
            expect(res.body).toHaveProperty('nome', 'Partido de Teste Backend');
            
            // Registramos o ID para Teardown
            partidoCriadoId = res.body.id;
        });

        it('Deve editar o partido temporário (Status 200)', async () => {
            expect(partidoCriadoId).toBeDefined();

            const res = await request(app)
                .put(`/api/admin/partidos/${partidoCriadoId}`)
                .set('Authorization', `Bearer ${superAdminToken}`)
                .field('nome', 'Partido Teste Atualizado')
                .field('sigla', 'PTESTA');

            expect(res.status).toBe(200);
            expect(res.body).toHaveProperty('nome', 'Partido Teste Atualizado');
        });

        it('Deve deletar o partido e confirmar exclusão (Status 204)', async () => {
            expect(partidoCriadoId).toBeDefined();

            const res = await request(app)
                .delete(`/api/admin/partidos/${partidoCriadoId}`)
                .set('Authorization', `Bearer ${superAdminToken}`);

            expect(res.status).toBe(204);

            // Anula o ID pra não disparar o fallback no afterAll
            partidoCriadoId = null;
        });

        it('Deve retornar erro ao tentar editar um partido inexistente', async () => {
            const fakeUUID = 'a3c4f7b2-085e-4581-9b04-a1db03a42921';
            const res = await request(app)
                .put(`/api/admin/partidos/${fakeUUID}`)
                .set('Authorization', `Bearer ${superAdminToken}`)
                .field('nome', 'Partido Fantasma')
                .field('sigla', 'FANTASMA');
            // O controller pode retornar 404 ou 500 dependendo do tratamento
            expect(res.status).toBeGreaterThanOrEqual(400);
        });

        it('Deve retornar erro ao tentar deletar um partido inexistente', async () => {
            const fakeUUID = 'b4d5e8c3-196f-5692-ab05-b2ec14b53a32';
            const res = await request(app)
                .delete(`/api/admin/partidos/${fakeUUID}`)
                .set('Authorization', `Bearer ${superAdminToken}`);
            // O controller pode retornar 404 ou 500 dependendo do tratamento
            expect(res.status).toBeGreaterThanOrEqual(400);
        });
    });
});
