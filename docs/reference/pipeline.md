# Pipeline

The DOCX ruleset runs **13 steps** (`DOCX → MyST`). Inspect planned dispositions without writing files:

```bash
cd doc-convert
bun src/index.ts ../docx-examples/pdc/manuscript.docx --list-steps
```

Run from the directory where you keep (or want) `doc-convert.yml` — the CLI reads config from **cwd**, not `--project-root`. Example with config present:

```bash
cd ../docx-examples/pdc
bun ../../doc-convert/src/index.ts manuscript.docx --list-steps
```

(list-steps-output)=
## `--list-steps` output

The command still requires a `.docx` path (used to resolve defaults such as `--project-root`), but it does not create a workdir or call Pandoc.

Stdout looks like:

```text
Pipeline: DOCX → MyST
Input:   …/manuscript.docx
Config:  …/doc-convert.yml          ← only when ./doc-convert.yml exists in cwd

  1. [run] pandocDocxToMd — Convert DOCX to Markdown via Pandoc
  2. [run] copyDocxDependencies — Copy optional project dependencies into workdir
  …
  12. [warn-skip] improveCitationTags — Improve citekeys to author–year
  13. [run] enrichAffiliationsRor — Enrich affiliations via ROR
```

Each line is `N. [disposition] stepId — human-readable label`.

| Disposition | Meaning |
|-------------|---------|
| `run` | Step will execute on conversion |
| `skip` | Disabled in `doc-convert.yml`, or step key omitted while a config file is present |
| `warn-skip` | Enabled in config (or no config file), but built-in prerequisites are not met (for example no `references.bib` yet, or no citation dialect in the manuscript) |

`pandocDocxToMd` always shows `[run]`; it cannot be configured. To customize other steps, see [Configuration](configuration.md).

## Step reference

| # | Step ID | Label (from `--list-steps`) |
|---|---------|----------------------------|
| 1 | `pandocDocxToMd` | Convert DOCX to Markdown via Pandoc |
| 2 | `copyDocxDependencies` | Copy optional project dependencies into workdir |
| 3 | `initMystConfig` | Init myst.yml from canonical scaffold |
| 4 | `extractDocxFrontmatter` | Extract DOCX title/authors/affiliations → myst.yml + page frontmatter |
| 5 | `extractDocxParts` | Extract DOCX document parts → page frontmatter |
| 6 | `cleanPandocArtifacts` | Clean Pandoc conversion artifacts |
| 7 | `improveDocxFigures` | Wrap DOCX images in MyST figure directives |
| 8 | `improveDocxTables` | Convert DOCX tables to MyST table directives |
| 9 | `improveDocxCrossrefs` | Wire DOCX figure/table cross-references |
| 10 | `improveDocxMath` | Normalize DOCX math markup |
| 11 | `improveDocxCitations` | Normalize DOCX citations to BibTeX + MyST cites |
| 12 | `improveCitationTags` | Improve citekeys to author–year |
| 13 | `enrichAffiliationsRor` | Enrich affiliations via ROR |

## During a real conversion

Stdout shows `=== N/13 … ===` banners and per-step summaries (counts, bib entries, ROR enrichments). When config is loaded, the header also includes `Config: …/doc-convert.yml` and `Workdir: …`.

Steps with disposition `skip` print `(skipped)` and do not run. Steps with `warn-skip` print `(warn-skip: prerequisites not met)`.

**Quality caveats** (not CLI bugs): see [gap-analysis/SUMMARY.md](../../../gap-analysis/SUMMARY.md) for partial gaps such as supplementary table stubs.
