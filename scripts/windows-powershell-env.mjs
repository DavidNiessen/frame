/** Windows PowerShell must build its own module paths, rather than inherit PowerShell 7's. */
export function windowsPowerShellEnv(environment = process.env) {
  const child = { ...environment };
  for (const key of Object.keys(child)) if (key.toLowerCase() === 'psmodulepath') delete child[key];
  return child;
}
