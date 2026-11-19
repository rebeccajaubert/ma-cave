#!/usr/bin/env node
// Hook SubagentStop (agent code-reviewer) : la relecture a eu lieu, on lève le marqueur.
// Si le code est encore modifié ensuite (corrections), mark-dirty.mjs le reposera.
import { rmSync } from 'node:fs';
import { join } from 'node:path';

rmSync(join(process.env.CLAUDE_PROJECT_DIR || process.cwd(), '.claude', 'state', 'review-pending'), { force: true });
