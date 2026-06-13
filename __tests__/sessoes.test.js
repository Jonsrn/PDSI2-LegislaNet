const request = require('supertest');
const app = require('../server');
const { getAppAuth, getTvAuth } = require('./helpers/authHelper');

describe('API Web Backend - Core: Sessões (Mesa Diretora)', () => {
    let appToken;
    let camaraId;
    let tvToken;
    let sessaoCriadaId = null;

    beforeAll(async () => {
        // Usa o admin da câmara para gerenciar a sessão
        const authData = await getAppAuth();
        appToken = authData.token;
        camaraId = authData.profile.camara_id;

        const tvData = await getTvAuth();
        tvToken = tvData.token;
    });

    afterAll(async () => {
        // Teardown Garantido: Exclui a sessão criada, o que também limpa pautas em cascata
        if (sessaoCriadaId) {
            await request(app)
                .delete(`/api/sessoes/${sessaoCriadaId}`)
                .set('Authorization', `Bearer ${appToken}`);
        }
    });

    describe('Segurança de Acesso (RBAC)', () => {
        it('Deve rejeitar TV na criação de Sessão (403 Forbidden)', async () => {
            const res = await request(app)
                .post('/api/sessoes')
                .set('Authorization', `Bearer ${tvToken}`)
                .send({
                    numero: 998,
                    tipo: 'Ordinária',
                    data_sessao: new Date('2035-12-31T10:00:00Z').toISOString()
                });

            expect(res.status).toBe(403);
        });

        it('Deve bloquear acesso sem token (401 Unauthorized)', async () => {
            const res = await request(app).get('/api/sessoes');
            expect(res.status).toBe(401);
        });
    });

    describe('Gestão do Ciclo de Vida da Sessão (Caminho Feliz)', () => {
        // Gera um número aleatório válido para evitar conflitos de ano/numero
        const numSessao = Math.floor(Math.random() * 900) + 1;
        const dataSessao = new Date('2035-12-31T10:00:00Z').toISOString();

        it('Deve criar uma sessão futura com sucesso (Status 201)', async () => {
            const res = await request(app)
                .post('/api/sessoes')
                .set('Authorization', `Bearer ${appToken}`)
                .send({
                    numero: numSessao,
                    tipo: 'Ordinária',
                    data_sessao: dataSessao,
                    status: 'Agendada'
                });

            expect(res.status).toBe(201);
            expect(res.body).toHaveProperty('data');
            expect(res.body.data).toHaveProperty('id');
            expect(res.body.data.status).toBe('Agendada');

            sessaoCriadaId = res.body.data.id;
        });

        it('Não deve permitir criar sessão duplicada no mesmo ano (Status 409)', async () => {
            const res = await request(app)
                .post('/api/sessoes')
                .set('Authorization', `Bearer ${appToken}`)
                .send({
                    numero: numSessao, // Mesmo número
                    tipo: 'Ordinária', // Mesmo tipo
                    data_sessao: dataSessao, // Mesmo ano
                    status: 'Agendada'
                });

            expect(res.status).toBe(409);
        });

        it('Deve listar as sessões cadastradas da câmara (Status 200)', async () => {
            const res = await request(app)
                .get('/api/sessoes')
                .set('Authorization', `Bearer ${appToken}`);

            expect(res.status).toBe(200);
            expect(res.body).toHaveProperty('data');
            expect(Array.isArray(res.body.data)).toBe(true);
            
            // A sessão criada deve estar na lista
            const encontrou = res.body.data.find(s => s.id === sessaoCriadaId);
            expect(encontrou).toBeDefined();
        });

        it('Deve listar sessões disponíveis para vínculo de pauta (Status 200)', async () => {
            const res = await request(app)
                .get('/api/sessoes/disponiveis')
                .set('Authorization', `Bearer ${appToken}`);

            expect(res.status).toBe(200);
            expect(Array.isArray(res.body.data)).toBe(true);
            const encontrou = res.body.data.find(s => s.id === sessaoCriadaId);
            expect(encontrou).toBeDefined();
        });

        it('Deve retornar os detalhes da sessão criada (Status 200)', async () => {
            const res = await request(app)
                .get(`/api/sessoes/${sessaoCriadaId}`)
                .set('Authorization', `Bearer ${appToken}`);

            expect(res.status).toBe(200);
            expect(res.body).toHaveProperty('id', sessaoCriadaId);
            expect(res.body.tipo).toBe('Ordinária');
        });

        it('Deve permitir editar informações de uma sessão Agendada (Status 200)', async () => {
            const novoDataSessao = new Date('2036-01-10T10:00:00Z').toISOString();
            
            const res = await request(app)
                .put(`/api/sessoes/${sessaoCriadaId}`)
                .set('Authorization', `Bearer ${appToken}`)
                .send({
                    numero: numSessao,
                    tipo: 'Solene',
                    data_sessao: novoDataSessao,
                    status: 'Agendada'
                });

            expect(res.status).toBe(200);
            expect(res.body.data.tipo).toBe('Solene');
        });

        it('Deve apagar a sessão criada e limpar recursos (Status 200)', async () => {
            const res = await request(app)
                .delete(`/api/sessoes/${sessaoCriadaId}`)
                .set('Authorization', `Bearer ${appToken}`);

            expect(res.status).toBe(200);
            
            // Remove o ID do teardown
            sessaoCriadaId = null;
        });

        it('Deve retornar 404 ao buscar uma sessão deletada', async () => {
            // Usaremos um UUID válido inexistente para ter certeza que não quebra
            const fakeId = '00000000-0000-0000-0000-000000000000';
            const res = await request(app)
                .get(`/api/sessoes/${fakeId}`)
                .set('Authorization', `Bearer ${appToken}`);

            expect(res.status).toBe(404);
        });
    });
});
