/** Ensure `project.bibliography` in myst.yml lists a BibTeX file. */
export function ensureMystBibliography(mystYaml: string, bibPathRelativeToMyst: string): string {
  const lines = mystYaml.split('\n');
  const projectIdx = lines.findIndex((l) => /^\s*project:\s*$/.test(l));
  if (projectIdx === -1) return mystYaml;

  for (let i = projectIdx + 1; i < lines.length; i++) {
    const line = lines[i];
    if (/^\S/.test(line)) break;
    if (/^\s{2}bibliography:\s*$/.test(line)) {
      let j = i + 1;
      const existing = new Set<string>();
      while (j < lines.length && /^\s{4}-\s+/.test(lines[j])) {
        existing.add(lines[j].replace(/^\s{4}-\s+/, '').trim());
        j++;
      }
      if (existing.has(bibPathRelativeToMyst)) return mystYaml;
      lines.splice(j, 0, `    - ${bibPathRelativeToMyst}`);
      return lines.join('\n');
    }
  }

  lines.splice(projectIdx + 1, 0, `  bibliography:`, `    - ${bibPathRelativeToMyst}`);
  return lines.join('\n');
}
