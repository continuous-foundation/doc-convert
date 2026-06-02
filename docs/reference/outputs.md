# Outputs

After a successful conversion, the **workdir** (default `_improved/` under `--project-root`) contains the MyST-ready project.

## Typical tree

```text
{workdir}/
  article.md
  myst.yml
  media/...
  references.bib   # when citations are normalized
```

## File roles

| File / folder | Purpose |
|---------------|---------|
| `article.md` | Main MyST page |
| `myst.yml` | Project config |
| `media/` | Figures extracted from DOCX |
| `references.bib` | Present when citations are normalized |

Optional copies from the project root (when they existed before conversion) may also appear under the workdir — see [Project layout](project-layout.md).

Each `_improved/` directory is a standalone MyST project. Preview with `myst start` from inside the workdir (see [Guide — Preview](../guide/index.md#preview-the-docs-site)).
