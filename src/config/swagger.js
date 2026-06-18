const swaggerJsdoc = require('swagger-jsdoc');
const swaggerUi = require('swagger-ui-express');
const basicAuth = require('express-basic-auth');

// Options for the swagger docs
const options = {
    definition: {
        openapi: '3.0.0',
        info: {
            title: 'LegislaNet Web Backend API',
            version: '1.0.0',
            description: 'API Documentada para o Painel Web e Admin',
            contact: {
                name: 'LegislaNet Suporte',
            },
        },
        servers: [
            {
                url: 'http://localhost:3000',
                description: 'Servidor de Desenvolvimento',
            },
        ],
        components: {
            securitySchemes: {
                bearerAuth: {
                    type: 'http',
                    scheme: 'bearer',
                    bearerFormat: 'JWT',
                },
            },
        },
        security: [
            {
                bearerAuth: [],
            },
        ],
    },
    // Paths to files containing OpenAPI definitions
    apis: ['./src/routes/*.js'],
};

const swaggerSpec = swaggerJsdoc(options);

function setupSwagger(app) {
    // Auth for Swagger UI
    app.use('/api-docs', basicAuth({
        users: { 'admin': 'admin' },
        challenge: true,
    }), swaggerUi.serve, swaggerUi.setup(swaggerSpec));
    
    // Serve swagger.json
    app.get('/swagger.json', (req, res) => {
        res.setHeader('Content-Type', 'application/json');
        res.send(swaggerSpec);
    });
}

module.exports = setupSwagger;
