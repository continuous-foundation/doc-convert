# Document Conversion CLI

Convert Word manuscripts (`.docx`) into **MyST-ready projects**: `myst.yml`, `article.md`, extracted `media/`, and usually `references.bib`.

## Getting Started Guide

For a full walkthrough — install, quick start, examples, previewing the docs site see: [The Guide](guide/index.md)

## Reference

Topic-specific CLI documentation:

- [CLI](reference/cli.md) — arguments, flags, exit codes, debug
- [Configuration](reference/configuration.md) — optional `doc-convert.yml` per directory
- [Pipeline](reference/pipeline.md) — 13 steps from `--list-steps`
- [Project layout](reference/project-layout.md) — `--project-root`, workdir, optional assets
- [Outputs](reference/outputs.md) — expected `_improved/` tree
- [Troubleshooting](reference/troubleshooting.md) — common errors and fixes

## Preview converted manuscripts

After running `doc-convert`, preview a manuscript site from its output directory:

```bash
cd /path/to/article/_improved
myst start
```

Example in this repo:

```bash
cd docx-examples/pdc/_improved   # from monorepo root
myst start
```
