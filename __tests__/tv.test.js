const request = require('supertest');
const app = require('../server');
const { getTvAuth, getAppAuth } = require('./helpers/authHelper');

describe('API Web Backend - Módulos de TV e Tempo Real (Fase 4)', () => {
    let tvToken;
    let tvCamaraId;
    let appToken;

    beforeAll(async () => {
        // Autentica como TV
        const tvAuth = await getTvAuth();
        tvToken = tvAuth.token;
        tvCamaraId = tvAuth.profile.camara_id;

        // Autentica como Admin da Câmara (Mesa)
        const appAuth = await getAppAuth();
        appToken = appAuth.token;
    });

    describe('Segurança RBAC - TV vs Painel de Controle', () => {
        it('Deve proibir a TV de acessar rotas da Mesa/Painel de Controle (Status 403)', async () => {
            const res = await request(app)
                .get('/api/painel-controle/fala-ativa')
                .set('Authorization', `Bearer ${tvToken}`);
            expect(res.status).toBe(403);
        });

        it('Deve permitir que o Admin da Câmara (Mesa) acesse o Painel de Controle (Status 200)', async () => {
            const res = await request(app)
                .get('/api/painel-controle/fala-ativa')
                .set('Authorization', `Bearer ${appToken}`);
            expect(res.status).toBe(200);
        });
    });

    describe('Endpoints de Transmissão (Leitura Pública/TV)', () => {
        it('Deve ler o status da Votação Ao Vivo (Status 200)', async () => {
            const res = await request(app)
                .get(`/api/votacao-ao-vivo/status/${tvCamaraId}`);
            
            // É público, mas verifica o layout base
            expect(res.status).toBe(200);
            expect(res.body).toHaveProperty('isLive');
        });

        it('Deve ler o status da Fala Ao Vivo / Tribuna (Status 200)', async () => {
            const res = await request(app)
                .get(`/api/fala-ao-vivo/status/${tvCamaraId}`);
            
            expect(res.status).toBe(200);
            expect(res.body).toHaveProperty('isLive');
        });
    });

    describe('Endpoints de Livestream (Integração YouTube)', () => {
        it('Deve ler o status global de Webhooks do Livestream (Status 200)', async () => {
            const res = await request(app)
                .get('/api/livestreams/status');
            expect(res.status).toBe(200);
            expect(res.body).toHaveProperty('data');
            expect(res.body.data).toHaveProperty('youtube_api_connected');
        });

        it('Deve ler o display da livestream da Câmara (Status 200)', async () => {
            const res = await request(app)
                .get(`/api/livestreams/camara/${tvCamaraId}/display`);
            expect([200, 404]).toContain(res.status); // Pode ser 404 se não tiver livestream na câmara de testes
            if (res.status === 200) {
                expect(res.body).toHaveProperty('type'); 
            }
        });
    });
});
