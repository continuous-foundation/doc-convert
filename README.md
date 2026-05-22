## doc-convert

Convert and improve documents into a MyST-ready project (`myst.yml`, `article.md`, assets).

**All pipeline logic lives in this package** (`src/steps/`). The `BHmHNQKJaSWT/script/*.ts` files remain for reference and manual testing but are no longer invoked by the CLI.

### Entry points (rulesets)

| Command | Ruleset | Folders |
| --- | --- | --- |
| `doc-convert --jupytext <file.md>` | `jupytext` | `steps/common/` + `steps/jupytext/` |
| `doc-convert <file.md>` | `markdown` | `steps/common/` |
| `doc-convert <file.docx>` | `docx` | `steps/docx/` + `steps/common/` |

### Source layout

```
doc-convert/src/
  commands/              CLI (convert)
  engine/                runner, workdir, step context
  rulesets/              compose steps per entry point
  steps/                 self-contained pipeline steps
    common/              shared steps (one file each)
    jupytext/            notebook / region steps
    docx/                Pandoc bootstrap
    shared/              when guards, myst-config helpers
```

### Development

```bash
cd doc-convert
bun install
bun run compile
bun src/index.ts --jupytext ../BHmHNQKJaSWT/article.md --list-steps --project-root ../BHmHNQKJaSWT
bun run build
```

### Article repo

```bash
cd ../BHmHNQKJaSWT
npm run improve   # doc-convert --jupytext article.md
```
