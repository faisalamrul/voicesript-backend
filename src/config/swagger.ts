import swaggerJsdoc from 'swagger-jsdoc';
import { env } from './env';

const options: swaggerJsdoc.Options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'VoiceScript API',
      version: '1.0.0',
      description: 'REST API untuk aplikasi VoiceScript — autentikasi JWT, manajemen role, dan dynamic menu sidebar.',
    },
    servers: [
      {
        url: `http://localhost:${env.PORT}/api/v1`,
        description: 'Development server',
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
      schemas: {
        UserPublic: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid', example: 'd290f1ee-6c54-4b01-90e6-d701748f0851' },
            name: { type: 'string', example: 'Budi Santoso' },
            email: { type: 'string', format: 'email', example: 'budi@example.com' },
            role: { type: 'string', enum: ['admin', 'reporter', 'reviewer'], example: 'reporter' },
          },
        },
        MenuItem: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            title: { type: 'string', example: 'Dashboard' },
            path: { type: 'string', example: '/dashboard', nullable: true },
            icon: { type: 'string', example: 'home-icon', nullable: true },
            sort_order: { type: 'integer', example: 1 },
            children: {
              type: 'array',
              items: { $ref: '#/components/schemas/MenuItem' },
            },
          },
        },
        Tokens: {
          type: 'object',
          properties: {
            access_token: { type: 'string', example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...' },
            refresh_token: { type: 'string', example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...' },
          },
        },
        ErrorResponse: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: false },
            message: { type: 'string', example: 'Error message' },
            errors: {
              type: 'object',
              additionalProperties: {
                type: 'array',
                items: { type: 'string' },
              },
              nullable: true,
            },
          },
        },
      },
    },
    tags: [
      { name: 'Health', description: 'Status server dan koneksi database' },
      { name: 'Auth', description: 'Registrasi, login, refresh token, dan logout' },
      { name: 'Admin', description: 'Manajemen user oleh admin (butuh role admin)' },
    ],
  },
  apis: ['./src/routes/*.ts'],
};

export const swaggerSpec = swaggerJsdoc(options);
