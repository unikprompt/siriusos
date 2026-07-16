import { Command } from 'commander';
import { resolveEnv } from '../utils/env.js';
import { pollEmail } from '../mail/imap-poller.js';

/**
 * `siriusos mail poll` — un ciclo del IMAP poller. Diseñado para correr por cron.
 *
 * Sin credenciales en el .env del agente objetivo, sale en silencio (exit 0),
 * así el cron se puede cablear antes de que Mario cree el buzón. Los defaults
 * salen de resolveEnv (CTX_*); los flags permiten override para un cron que
 * corra fuera del contexto de un agente.
 */
export const mailCommand = new Command('mail').description('Conector de correo entrante (IMAP)');

mailCommand
  .command('poll')
  .description('Un ciclo de poll IMAP: entrega los correos UNSEEN al inbox del agente objetivo')
  .option('--agent <name>', 'Agente objetivo (dueño del .env y del inbox)', 'orquestador')
  .option('--org <org>', 'Org del agente objetivo')
  .option('--instance <id>', 'Instance ID')
  .option('--project-root <path>', 'Raíz del proyecto (orgs/<org>/agents/<agent>/.env)')
  .option('--quiet', 'No imprimir el resumen a stdout', false)
  .action((opts: { agent: string; org?: string; instance?: string; projectRoot?: string; quiet?: boolean }) => {
    const env = resolveEnv();
    const result = pollEmail({
      agent: opts.agent,
      org: opts.org ?? env.org,
      instanceId: opts.instance ?? env.instanceId,
      projectRoot: opts.projectRoot ?? env.projectRoot ?? env.frameworkRoot,
    });

    if (!opts.quiet) {
      if (result.status === 'no-credentials') {
        // Silencio operativo: una línea informativa, sin ruido ni error.
        console.log('mail poll: credenciales IMAP no configuradas, no-op.');
      } else if (result.status === 'ok') {
        console.log(`mail poll: ${result.fetched} nuevos, ${result.delivered} entregados a ${opts.agent}.`);
      } else {
        console.log(`mail poll: error — ${result.message ?? 'desconocido'} (ver imap-poller.log).`);
      }
    }
    // Siempre exit 0: el poller nunca debe romper el cron.
  });
