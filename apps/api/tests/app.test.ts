import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';

const app = createApp();
const ORIGIN = 'http://localhost:5173';

describe('seguridad y errores de la API', () => {
  it('devuelve 404 RFC 7807 para rutas desconocidas', async () => {
    const response = await request(app).get('/api/v1/no-existe');

    expect(response.status).toBe(404);
    expect(response.headers['content-type']).toContain('application/problem+json');
    expect(response.body).toMatchObject({
      status: 404,
      code: 'NOT_FOUND',
      instance: '/api/v1/no-existe',
    });
  });

  it('rechaza peticiones mutantes sin Origin válido (CSRF)', async () => {
    const response = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'a@b.com', password: 'x' });

    expect(response.status).toBe(403);
    expect(response.body.code).toBe('FORBIDDEN');
  });

  it('acepta el origen configurado y valida el cuerpo', async () => {
    const response = await request(app)
      .post('/api/v1/auth/login')
      .set('Origin', ORIGIN)
      .send({ email: 'no-es-un-correo', password: '' });

    expect(response.status).toBe(422);
    expect(response.body.code).toBe('VALIDATION_ERROR');
    expect(response.body.errors.length).toBeGreaterThan(0);
  });

  it('exige autenticación en las rutas privadas', async () => {
    const response = await request(app).get('/api/v1/assets');
    expect(response.status).toBe(401);
    expect(response.body.code).toBe('UNAUTHENTICATED');
  });

  it('exige autenticación también en PATCH /auth/me', async () => {
    const response = await request(app)
      .patch('/api/v1/auth/me')
      .set('Origin', ORIGIN)
      .send({ display_name: 'Otro' });

    expect(response.status).toBe(401);
  });

  it('añade cabeceras de seguridad y x-request-id', async () => {
    const response = await request(app).get('/api/v1/no-existe');

    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['x-powered-by']).toBeUndefined();
    expect(response.headers['x-request-id']).toBeTruthy();
    expect(response.headers['x-frame-options']).toBeDefined();
  });

  it('rechaza cuerpos que no son JSON', async () => {
    const response = await request(app)
      .post('/api/v1/auth/login')
      .set('Origin', ORIGIN)
      .set('Content-Type', 'text/plain')
      .send('email=a@b.com');

    expect(response.status).toBe(403);
  });
});
