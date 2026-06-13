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

        it('Deve permitir acesso ao Super Admin com 200 OK', async () => {
            const res = await request(app)
                .get('/api/admin/camaras')
                .set('Authorization', `Bearer ${superAdminToken}`);
            expect(res.status).toBe(200);
            expect(Array.isArray(res.body.data)).toBe(true);
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
    });
});
