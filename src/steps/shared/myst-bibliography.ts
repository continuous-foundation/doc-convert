import { openMystProject, closeMystProject } from './myst-yaml-project.js';

export function ensureMystBibliography(mystYaml: string, bibPathRelativeToMyst: string): string {
  const block = openMystProject(mystYaml);

  for (let i = 0; i < block.projectLines.length; i++) {
    const line = block.projectLines[i];
    if (!/^\s{2}bibliography:\s*$/.test(line)) continue;

    let j = i + 1;
    const existing = new Set<string>();
    while (j < block.projectLines.length && /^\s{4}-\s+/.test(block.projectLines[j])) {
      existing.add(block.projectLines[j].replace(/^\s{4}-\s+/, '').trim());
      j++;
    }
    if (existing.has(bibPathRelativeToMyst)) return mystYaml;
    block.projectLines.splice(j, 0, `    - ${bibPathRelativeToMyst}`);
    return closeMystProject(block);
  }

  block.projectLines.unshift(`  bibliography:`, `    - ${bibPathRelativeToMyst}`);
  return closeMystProject(block);
}
