import swaggerJsdoc from 'swagger-jsdoc';
import { env } from './env';

const options: swaggerJsdoc.Options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'VoiceScript API',
      version: '1.0.0',
      description: 'REST API for the VoiceScript app — JWT authentication, role management, and dynamic sidebar menu.',
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
            role: { type: 'string', enum: ['admin', 'reporter', 'editor'], example: 'reporter' },
            city: { type: 'string', nullable: true, example: 'Jakarta' },
            created_at: { type: 'string', format: 'date-time', example: '2026-06-11T10:00:00Z' },
            has_active_job: { type: 'boolean', example: false, description: 'true if the user currently has an active job (reporter: ASSIGNED, editor: TRANSCRIBED/REVIEWED)' },
          },
        },
        MenuItem: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            title: { type: 'string', example: 'Jobs' },
            path: { type: 'string', example: '/jobs', nullable: true },
            icon: { type: 'string', example: 'briefcase-icon', nullable: true },
            label: { type: 'string', example: 'core', nullable: true },
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
        Job: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid', example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890' },
            case_name: { type: 'string', example: 'State v. Wijaya' },
            duration: { type: 'integer', example: 30 },
            location: { type: 'string', enum: ['physical', 'remote'], example: 'physical' },
            city: { type: 'string', example: 'Bandung' },
            status: { type: 'string', enum: ['NEW', 'ASSIGNED', 'TRANSCRIBED', 'REVIEWED', 'COMPLETED'], example: 'NEW' },
            reporter_id: { type: 'string', format: 'uuid', nullable: true, example: null },
            reporter_name: { type: 'string', nullable: true, example: 'Adi Nugroho' },
            editor_id: { type: 'string', format: 'uuid', nullable: true, example: null },
            editor_name: { type: 'string', nullable: true, example: 'Budi Santoso' },
            transcript_notes: { type: 'string', nullable: true, example: null },
            review_notes: { type: 'string', nullable: true, example: null },
            submitted_at: { type: 'string', format: 'date-time', nullable: true, example: null },
            reviewed_at: { type: 'string', format: 'date-time', nullable: true, example: null },
            created_at: { type: 'string', format: 'date-time', example: '2026-06-11T10:00:00Z' },
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
      { name: 'Health', description: 'Server and database connection status' },
      { name: 'Auth', description: 'Registration, login, token refresh, and logout' },
      { name: 'Admin', description: 'User management by admin (requires admin role)' },
      { name: 'Jobs', description: 'Court reporting job management' },
      { name: 'Payments', description: 'Job financial summary — paid and pending (admin only)' },
      { name: 'Reporter', description: 'Reporter portal — earnings summary and job history' },
      { name: 'Editor', description: 'Editor portal — earnings summary and job history' },
    ],
  },
  apis: ['./src/routes/*.ts'],
};

export const swaggerSpec = swaggerJsdoc(options);
