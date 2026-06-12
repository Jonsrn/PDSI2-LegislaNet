const request = require('supertest');
const app = require('../server');
const { TEST_USER, getAuthToken } = require('./helpers/authHelper');

describe('Auth Routes (Integração)', () => {
    
    describe('POST /api/auth/login', () => {
        it('Deve retornar 400 Bad Request se os campos obrigatórios não forem enviados', async () => {
            const response = await request(app)
                .post('/api/auth/login')
                .send({}); // Payload vazio

            expect(response.status).toBe(400);
            expect(response.body).toHaveProperty('errors');
        });

        it('Deve retornar 400 se o email tiver um formato inválido', async () => {
            const response = await request(app)
                .post('/api/auth/login')
                .send({
                    email: 'email-invalido',
                    password: '123'
                });

            expect(response.status).toBe(400);
            expect(response.body.errors[0].msg).toBe('O email é inválido');
        });

        it('Deve retornar 401 Unauthorized para credenciais inexistentes no Supabase', async () => {
            const response = await request(app)
                .post('/api/auth/login')
                .send({
                    email: 'vereador_inexistente_999@camara.gov.br',
                    password: 'senhaIncorreta123'
                });

            expect(response.status).toBe(401);
            expect(response.body).toHaveProperty('error');
        });

        it('Caminho Feliz: Deve retornar 200 OK e o Token JWT ao logar com credenciais reais', async () => {
            const response = await request(app)
                .post('/api/auth/login')
                .send(TEST_USER);

            // O output de erro mostrará a body caso quebre, facilitando o debug
            expect(response.status).toBe(200);
            expect(response.body).toHaveProperty('token');
            expect(response.body).toHaveProperty('user');
            expect(response.body.user).toHaveProperty('email', TEST_USER.email);
        });
    });

    describe('POST /api/auth/logout', () => {
        it('Deve retornar 401 Unauthorized se tentarmos deslogar sem um Token JWT válido', async () => {
            const response = await request(app)
                .post('/api/auth/logout')
                .send(); // Sem header de Authorization

            expect(response.status).toBe(401);
        });

        it('Caminho Feliz: Deve retornar 200 OK ao deslogar usando o JWT correto', async () => {
            const token = await getAuthToken();
            
            const response = await request(app)
                .post('/api/auth/logout')
                .set('Authorization', `Bearer ${token}`)
                .send();

            expect(response.status).toBe(200);
            expect(response.body.message).toBe('Logout realizado com sucesso.');
        });
    });
});
