// Variables de entorno para la suite de pruebas. No se conecta a Supabase
// real: los tests unitarios no hacen red y los de API solo prueban
// validación, CSRF y autenticación (respuestas antes de tocar la BD).
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'silent';
process.env.PORT ??= '3999';
process.env.APP_ORIGIN ??= 'http://localhost:5173';
process.env.COOKIE_SECURE ??= 'false';
process.env.SUPABASE_URL ??= 'https://test-project.supabase.co';
process.env.SUPABASE_ANON_KEY ??= 'test-anon-key-0000000000000000000000000000';
process.env.SUPABASE_SERVICE_ROLE_KEY ??= 'test-service-role-key-000000000000000000000000';
