# The Guide

Convert a Word manuscript (`.docx`) into a **MyST-ready project**: `myst.yml`, `article.md`, extracted `media/`, and usually `references.bib`. This guide covers **CLI usage only** for authors running conversions on your machine.

For flags, exit codes, and the full option list, see [CLI reference](../reference/cli.md). For the 13 pipeline steps, see [Pipeline](../reference/pipeline.md).

Preview this documentation site locally — see [Preview the docs site](#preview-the-docs-site) below.

---

## Overview

`doc-convert` runs a fixed **13-step pipeline** (Pandoc import, MyST scaffolding, DOCX-specific cleanup, citations, optional ROR affiliation enrichment). You point it at one `.docx` file; it writes outputs under a **workdir** (default `_improved/`) beside your project root.

**You need:**

- [Bun](https://bun.sh) (or Node 20–24 per package engines)
- **Pandoc on your PATH** (test with `pandoc --version`)
- Network access if you keep **ROR affiliation lookup** enabled (default)

**You do not need** to read `doc-convert` source code to run a conversion.

For known **conversion quality** limitations (tables, metadata edge cases), see the repo gap analysis: [gap-analysis/SUMMARY.md](../../../gap-analysis/SUMMARY.md).

---

## Installation and prerequisites

### 1. Install the tool (development checkout)

From the monorepo root, enter the `doc-convert` package:

```bash
cd doc-convert
bun install
```

Canonical invocation (from this directory):

```bash
bun src/index.ts --help
```

### 2. Pandoc

Pandoc must be installed and on `PATH`. Example check:

```bash
which pandoc
pandoc --version
```

If Pandoc is missing, step 1 fails when you run a real conversion (not `--list-steps`).

### 3. Optional: global `doc-convert` binary

After building:

```bash
cd doc-convert
bun run build
```

you can run `doc-convert` from `dist/doc-convert.cjs` (or `bun link` per package README). **Rebuild** after pulling CLI changes so `dist/` matches `src/`.

### 4. ROR lookups (default on)

Step 13 calls the [ROR](https://ror.org) API to enrich affiliations in `myst.yml`. Use `--no-ror-lookup` for offline runs or air-gapped environments. See [CLI reference](../reference/cli.md).

---

## Quick start

Assume:

- Manuscript: `/path/to/my-article/manuscript.docx`
- Optional assets live in the same folder: `metadata.yml`, `media/`, `plugins/` (all optional)

```bash
cd doc-convert

bun src/index.ts /path/to/my-article/manuscript.docx \
  --project-root /path/to/my-article \
  --workdir _improved
```

**Expected result:** directory `/path/to/my-article/_improved/` — see [Outputs](../reference/outputs.md) for the usual file tree.

Inspect the pipeline without writing files (still pass the `.docx` path; no workdir is created):

```bash
bun src/index.ts /path/to/my-article/manuscript.docx --list-steps
```

You get a numbered list with dispositions such as `[run]`, `[skip]`, and `[warn-skip]` for all 13 steps. Run this from the directory where you keep `doc-convert.yml` so the preview matches a real conversion. See [Pipeline — list-steps output](../reference/pipeline.md).

### Optional: `configure` for step control

When you want to skip specific pipeline steps (for example ROR enrichment offline), create `doc-convert.yml` in the directory where you run `doc-convert`:

```bash
cd /path/to/my-article
bun /path/to/doc-convert/src/index.ts configure
```

From the monorepo, a concrete example:

```bash
cd ../docx-examples/pdc
bun ../../doc-convert/src/index.ts configure
```

Edit `steps:` entries (`run` or `skip`), then verify with `--list-steps` before converting. Full details: [Configuration](../reference/configuration.md).

Preview the Pandoc command without creating a workdir (first run only — stops after step 1):

```bash
bun src/index.ts /path/to/my-article/manuscript.docx \
  --project-root /path/to/my-article \
  --workdir _improved \
  --dry-run
```

If `_improved/` already exists from a prior run, `--dry-run` walks all 13 steps and prints `(dry-run)` summaries without overwriting files.

Re-run a full conversion after deleting the old output:

```bash
rm -rf /path/to/my-article/_improved
# then run the quick start command again
```

---

## Running examples in this repo

The monorepo ships three sample manuscripts under `docx-examples/` (jay, loren, pdc). **Do not** treat them as separate products—use them to validate your install.

### One manuscript

```bash
cd doc-convert

bun src/index.ts ../docx-examples/jay/manuscript.docx \
  --project-root ../docx-examples/jay \
  --workdir _improved
```

Outputs: `docx-examples/jay/_improved/` (from the monorepo root)

### All three (batch script)

From the monorepo root:

```bash
./scripts/convert-docx-examples.sh
```

Or from `doc-convert/`:

```bash
../scripts/convert-docx-examples.sh
```

Runs the same CLI for `jay`, `loren`, and `pdc` when each has `manuscript.docx`. Prints `=== <name> ===` between runs.

### Clean re-run

```bash
rm -rf docx-examples/jay/_improved
# repeat for loren/pdc as needed
./scripts/convert-docx-examples.sh
```

---

## Preview the docs site

This guide is part of a **MyST Markdown website** under `doc-convert/docs/`. From the package directory:

```bash
cd doc-convert
bun install          # installs mystmd (first time)
bun run docs:start   # live preview at http://localhost:3000
```

Build static HTML (output in `doc-convert/docs/_build/`):

```bash
bun run docs:build
```

### Preview a converted manuscript

After conversion, each `_improved/` folder is its own MyST project. Preview from the workdir:

```bash
cd docx-examples/pdc/_improved   # from monorepo root
myst start
```

Use any example under `docx-examples/{jay,loren,pdc}/_improved/` the same way.

---

## Known limitations

Conversion **quality** gaps (tables, metadata edge cases) are tracked separately from this CLI guide:

- Summary: [gap-analysis/SUMMARY.md](../../../gap-analysis/SUMMARY.md)
- Per-manuscript notes: `gap-analysis/jay.md`, `loren.md`, `pdc.md`
