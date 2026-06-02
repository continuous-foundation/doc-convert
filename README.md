# `doc-convert` Command Line Tool

Convert Word (`.docx`) manuscripts into [MyST](https://mystmd.org/) projects suitable for JDH publishing — structured `myst.yml`, `article.md`, extracted figures, citations, and author metadata.

The CLI runs a fixed pipeline (Pandoc → cleanup → figures/tables/crossrefs → citations → ROR enrichment). Example inputs for this monorepo live under [../docx-examples/](../docx-examples/); conversion quality is tracked in [../gap-analysis/](../gap-analysis/).

## Install

You need [Bun](https://bun.sh/) and [Pandoc](https://pandoc.org/installing.html) on your `PATH`.

```bash
cd doc-convert
bun install
bun run build
```

Optional: link the CLI globally (`bun link` after build).

## Quick start

Convert one manuscript (writes to `_improved/` under the project root):

```bash
bun src/index.ts path/to/manuscript.docx --project-root path/to/project --workdir _improved
```

From the monorepo root, run all bundled examples:

```bash
../scripts/convert-docx-examples.sh
```

List all 13 pipeline steps with planned `[run]` / `[skip]` / `[warn-skip]` dispositions (no workdir, no Pandoc):

```bash
bun src/index.ts path/to/manuscript.docx --list-steps
```

Optional per-directory pipeline config — run from the project directory where you convert:

```bash
cd path/to/project
bun ../../doc-convert/src/index.ts configure
bun ../../doc-convert/src/index.ts manuscript.docx --list-steps   # preview after edits
```

## Documentation

Full author guide, CLI reference, and pipeline details: **[docs/](docs/)** ([guide](docs/guide/index.md), [reference](docs/reference/cli.md)).

## License

MIT — see [LICENSE](LICENSE).


<p style="text-align: center; color: #aaa; padding-top: 50px">
  Made with love by
  <a href="https://continuous.foundation" target="_blank" style="color: #aaa">
    Continuous Science Foundation <img src="https://cdn.curvenote.com/static/site/csf/icon.svg" style="height: 1em" />
  </a>
</p>
