#!/usr/bin/env node
// Hook PostToolUse (Edit|Write) : quand un fichier de code de l'app est modifié,
// 1) vérifie la syntaxe des .js, 2) pose le marqueur « relecture en attente »
//    que le hook review-gate.mjs utilise pour exiger le passage de l'agent code-reviewer.
import { readFileSync, mkdirSync, appendFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { relative, resolve, join } from 'node:path';

const input = JSON.parse(readFileSync(0, 'utf8') || '{}');
const root = process.env.CLAUDE_PROJECT_DIR || process.cwd();
const file = input.tool_input?.file_path;
if (!file) process.exit(0);

const rel = relative(root, resolve(root, file));
// Code de l'app : exclut node_modules, vendor, .claude (hooks et agent) et tout ce qui sort du projet.
const isCode = !rel.startsWith('..') && !/^(vendor|node_modules|\.claude|\.git)\//.test(rel)
  && /\.(m?js|html|css|webmanifest)$/.test(rel);
if (!isCode) process.exit(0);

const stateDir = join(root, '.claude', 'state'), marker = join(stateDir, 'review-pending');
const firstTime = !existsSync(marker);
mkdirSync(stateDir, { recursive: true });
appendFileSync(marker, `${rel}\n`);

let context = '';
if (/\.m?js$/.test(rel)) {
  try { execFileSync(process.execPath, ['--check', resolve(root, rel)], { stdio: 'pipe' }); }
  catch (e) { context = `Erreur de syntaxe dans ${rel} :\n${String(e.stderr || e.message).slice(0, 600)}`; }
}
if (firstTime) context += `${context ? '\n' : ''}Code modifié (${rel}) : lance l'agent code-reviewer avant de conclure.`;
if (context) process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: 'PostToolUse', additionalContext: context } }));
