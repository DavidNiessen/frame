import { resolve } from 'node:path';
import { isMediaFilename } from '../src/core/imports';
import type { Workflow } from '../src/core/launch';

export interface LaunchFiles {
  workflow: Workflow;
  paths: string[];
  error?: string;
}
export function launchArguments(argv: string[], cwd: string): LaunchFiles | null {
  let workflow: Workflow = 'edit',
    explicit = false,
    files = false;
  const paths: string[] = [];
  for (const argument of argv.slice(1)) {
    if (!files && argument === '--') {
      files = true;
      continue;
    }
    if (!files && argument.startsWith('--frame-workflow=')) {
      const value = argument.slice('--frame-workflow='.length);
      if (value === 'edit' || value === 'convert') {
        workflow = value;
        explicit = true;
      }
      continue;
    }
    if (
      (!files && argument.startsWith('-')) ||
      /^(?:[a-z][a-z\d+.-]*):\/\//i.test(argument) ||
      !isMediaFilename(argument)
    )
      continue;
    paths.push(resolve(cwd, argument));
  }
  return paths.length || explicit ? { workflow, paths } : null;
}
