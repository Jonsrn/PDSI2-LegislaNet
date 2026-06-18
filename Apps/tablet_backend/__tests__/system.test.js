const request = require('supertest');
const app = require('../server');

describe('System Routes (Integração)', () => {
    
    // A rota de versão é pública para o tablet conseguir checar antes de logar
    describe('GET /api/system/version', () => {
        it('Deve retornar os metadados de versão com sucesso (Status 200)', async () => {
            const response = await request(app).get('/api/system/version');
            
            expect(response.status).toBe(200);
            expect(response.body).toHaveProperty('version');
            expect(response.body).toHaveProperty('apkUrl');
            expect(response.body).toHaveProperty('required');
        });
    });

});
