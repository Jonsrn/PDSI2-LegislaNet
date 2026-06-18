const swaggerJsDoc = require("swagger-jsdoc");

const swaggerOptions = {
  swaggerDefinition: {
    openapi: "3.0.0",
    info: {
      title: "LegislaNet Tablet API",
      version: "1.0.0",
      description: "API de integração com os tablets dos vereadores e painel público",
      contact: {
        name: "LegislaNet Devs",
      },
    },
    servers: [
      {
        url: "http://localhost:3001",
        description: "Servidor de Desenvolvimento",
      },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "JWT",
        },
      },
    },
    security: [
      {
        bearerAuth: [],
      },
    ],
  },
  apis: ["./server.js", "./src/routes/*.js"],
};

module.exports = swaggerJsDoc(swaggerOptions);
