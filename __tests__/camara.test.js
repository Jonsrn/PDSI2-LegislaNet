const request = require('supertest');
const app = require('../server');
const { getAppAuth, getSuperAdminToken } = require('./helpers/authHelper');

describe('API Web Backend - Gestão da Câmara (App Role)', () => {
    let appToken;
    let camaraId;
    let sessaoId = null;
    let pautaId = null;

    beforeAll(async () => {
        const authData = await getAppAuth();
        appToken = authData.token;
        camaraId = authData.profile.camara_id;
    });

    afterAll(async () => {
        // Teardown Atômico (Limpamos Pauta e depois Sessão para não quebrar FK)
        if (pautaId) {
            await request(app)
                .delete(`/api/pautas/${pautaId}`)
                .set('Authorization', `Bearer ${appToken}`);
        }
        if (sessaoId) {
            await request(app)
                .delete(`/api/sessoes/${sessaoId}`)
                .set('Authorization', `Bearer ${appToken}`);
        }
    });

    describe('Segurança Perimetral', () => {
        it('Deve rejeitar o App ao tentar editar o Brasão no camaraRoutes (403)', async () => {
            const res = await request(app)
                .put(`/api/camaras/${camaraId}`)
                .set('Authorization', `Bearer ${appToken}`);
            expect(res.status).toBe(403);
        });
    });

    describe('Fluxo Principal: Sessões e Pautas', () => {
        it('Deve agendar uma Sessão (Status 201)', async () => {
            const numeroAleatorio = Math.floor(Math.random() * 900) + 10;
            const futureDate = new Date();
            futureDate.setDate(futureDate.getDate() + numeroAleatorio);
            const dataSessao = futureDate.toISOString();

            const res = await request(app)
                .post('/api/sessoes')
                .set('Authorization', `Bearer ${appToken}`)
                .send({
                    numero: numeroAleatorio,
                    tipo: 'Ordinária',
                    data_sessao: dataSessao
                });

            expect(res.status).toBe(201);
            expect(res.body.data).toHaveProperty('id');
            sessaoId = res.body.data.id;
        });

        it('Deve cadastrar uma Pauta associada à Sessão (Status 201)', async () => {
            expect(sessaoId).toBeDefined();

            const res = await request(app)
                .post('/api/pautas')
                .set('Authorization', `Bearer ${appToken}`)
                .field('sessao_id', sessaoId)
                .field('nome', 'Pauta de Teste Automatizado')
                .field('descricao', 'Testando o Web Backend pelo Jest')
                .field('autor', 'Vereador Teste');

            expect(res.status).toBe(201);
            expect(Array.isArray(res.body.data)).toBe(true);
            pautaId = res.body.data[0].id;
        });

        it('Deve listar as Pautas (Status 200)', async () => {
            const res = await request(app)
                .get('/api/pautas')
                .set('Authorization', `Bearer ${appToken}`);
            
            expect(res.status).toBe(200);
            expect(res.body).toHaveProperty('data');
            expect(Array.isArray(res.body.data)).toBe(true);
        });

        it('Deve exibir os Totais de Votos da Pauta recém-criada (Status 200)', async () => {
            expect(pautaId).toBeDefined();
            
            const res = await request(app)
                .get(`/api/votos/pauta/${pautaId}/totals`)
                .set('Authorization', `Bearer ${appToken}`);
            
            expect(res.status).toBe(200);
            // Votos devem estar zerados, pois acabou de criar
            expect(res.body).toHaveProperty('sim', 0);
            expect(res.body).toHaveProperty('nao', 0);
        });
    });

    describe('Deleções (Limpeza da Base)', () => {
        it('Deve deletar a Pauta (Status 200)', async () => {
            const res = await request(app)
                .delete(`/api/pautas/${pautaId}`)
                .set('Authorization', `Bearer ${appToken}`);
            expect(res.status).toBe(200);
            pautaId = null; // Impede fallback no afterAll
        });

        it('Deve deletar a Sessão (Status 200)', async () => {
            const res = await request(app)
                .delete(`/api/sessoes/${sessaoId}`)
                .set('Authorization', `Bearer ${appToken}`);
            expect(res.status).toBe(200);
            sessaoId = null; // Impede fallback no afterAll
        });
    });
});
