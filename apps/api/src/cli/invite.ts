import { parseArgs } from 'node:util';
import { config } from '../config.js';
import {
  createInvitation,
  listInvitations,
  revokeInvitation,
} from '../services/invitations.js';

const HELP = `
Gestión de invitaciones de la cartera (requiere SUPABASE_SERVICE_ROLE_KEY).

Uso:
  npm run invite -- --email persona@ejemplo.com   Crea una invitación y muestra el enlace.
  npm run invite -- --list                        Lista las últimas invitaciones.
  npm run invite -- --revoke <uuid>               Anula una invitación sin usar.

Opciones:
  --email <correo>   Correo del invitado. El registro usará ese correo.
  --list             Muestra las invitaciones (máximo 100).
  --revoke <uuid>    Borra una invitación pendiente.
  -h, --help         Muestra esta ayuda.

Caducidad: ${config.INVITE_TTL_DAYS} días. Base del enlace: ${config.inviteBaseUrl}
`.trim();

const fail = (message: string): never => {
  console.error(`\n✖ ${message}\n`);
  process.exit(1);
};

const main = async (): Promise<void> => {
  const { values } = parseArgs({
    options: {
      email: { type: 'string' },
      list: { type: 'boolean', default: false },
      revoke: { type: 'string' },
      help: { type: 'boolean', short: 'h', default: false },
    },
    allowPositionals: false,
  });

  if (values.help) {
    console.log(HELP);
    return;
  }

  if (values.list) {
    const invitations = await listInvitations();
    if (invitations.length === 0) {
      console.log('No hay invitaciones registradas.');
      return;
    }

    console.log(`\n${invitations.length} invitación(es):\n`);
    for (const invitation of invitations) {
      const state = invitation.accepted_at
        ? `usada el ${invitation.accepted_at.slice(0, 10)}`
        : invitation.expires_at < new Date().toISOString()
          ? 'caducada'
          : `caduca el ${invitation.expires_at.slice(0, 10)}`;
      console.log(`  ${invitation.id}  ${invitation.email.padEnd(36)} ${state}`);
    }
    console.log('');
    return;
  }

  if (values.revoke) {
    const removed = await revokeInvitation(values.revoke);
    if (!removed) {
      fail('No existe una invitación pendiente con ese id.');
    }
    console.log(`✔ Invitación ${values.revoke} anulada.`);
    return;
  }

  if (!values.email) {
    console.log(HELP);
    process.exitCode = 1;
    return;
  }

  const email = values.email.trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    fail(`El correo "${values.email}" no parece válido.`);
  }

  const invitation = await createInvitation(email);

  console.log('\n✔ Invitación creada\n');
  console.log(`  Correo:  ${invitation.email}`);
  console.log(`  Caduca:  ${invitation.expires_at.slice(0, 10)}`);
  console.log(`  Enlace:  ${invitation.url}\n`);
  console.log('  Envía ese enlace al invitado. El token no se guarda en claro:');
  console.log('  si se pierde, anula la invitación y crea otra.\n');
};

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  fail(`No se pudo completar la operación: ${message}`);
});
