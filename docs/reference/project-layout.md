# Project layout

## `--project-root`

Directory treated as the **article project**. Defaults to the folder containing `manuscript.docx` if you omit the flag.

Optional inputs copied or merged when present:

| Path under project root | Role |
|-------------------------|------|
| `metadata.yml` | Extra metadata (copied when present) |
| `media/` | Pre-existing media (copied when present) |
| `plugins/` | Optional plugins folder (copied when present) |

If none exist, step 2 reports `(no optional dependencies found in project root)`.

The bundled `docx-examples/` manuscripts do **not** ship these folders; they are documented here for your own projects. When present, step 2 copies them into the workdir before later steps run.

## `--workdir`

- **Relative** (default `_improved`): resolved as `{project-root}/{workdir}/`
- **Absolute**: used as-is for all outputs

Primary output paths are listed in [Outputs](outputs.md).

## `doc-convert.yml` (optional)

Pipeline config lives in the **current working directory** when you invoke the CLI — typically the same folder as `manuscript.docx`, not necessarily `--project-root` if you pass that flag explicitly.

Create it with `doc-convert configure` from that directory. See [Configuration](configuration.md).
