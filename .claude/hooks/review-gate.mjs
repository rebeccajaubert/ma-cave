#!/usr/bin/env node
// Hook Stop : tant que du code a été modifié sans passage de l'agent code-reviewer,
// empêche de terminer le tour. Une seule relance (stop_hook_active) pour ne jamais boucler.
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const input = JSON.parse(readFileSync(0, 'utf8') || '{}');
const marker = join(process.env.CLAUDE_PROJECT_DIR || process.cwd(), '.claude', 'state', 'review-pending');
if (input.stop_hook_active || !existsSync(marker)) process.exit(0);

const files = [...new Set(readFileSync(marker, 'utf8').split('\n').filter(Boolean))].join(', ');
process.stdout.write(JSON.stringify({
  decision: 'block',
  reason: `Du code a été modifié depuis la dernière relecture (${files}). Lance l'agent code-reviewer, corrige les points « Bloquant » et « Important », puis termine.`,
}));
