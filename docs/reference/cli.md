# CLI reference

**Program:** convert a `.docx` (default command) or write local pipeline config (`configure`).

## Synopsis

```text
doc-convert [options] <input>
doc-convert configure [--force]
```

In this repo, run from the `doc-convert` package directory:

```bash
bun src/index.ts
```

## Argument

| Name | Description |
|------|-------------|
| `<input>` | Path to the Word manuscript (`.docx`). Relative paths resolve from your current working directory. |

Only `.docx` is accepted. Other extensions exit with an error.

## Options

| Flag | Description |
|------|-------------|
| `--workdir <path>` | Output directory **name** (relative to `--project-root`) or **absolute** path. Default: `_improved`. |
| `--project-root <path>` | Root for optional `metadata.yml`, `media/`, `plugins/`. Default: directory containing the input file. |
| `-d`, `--dry-run` | Print planned actions; do not write the workdir (see [Guide — Quick start](../guide/index.md#quick-start)). |
| `--ror-lookup` | Enable ROR affiliation lookups (default). |
| `--no-ror-lookup` | Skip ROR network calls. |
| `--ror-min-score <float>` | ROR match threshold between 0 and 1. Default: `0.8`. Invalid values error out. |
| `--list-steps` | Print all 13 steps as `N. [disposition] stepId — label`; reads `doc-convert.yml` from cwd only. Does not write a workdir or run Pandoc. See [Pipeline](pipeline.md). |
| `-v`, `--version` | Print version (e.g. `v0.0.1`) and exit. |
| `-h`, `--help` | Show help and exit. |

## `configure` subcommand

Separate subcommand — no `.docx` input required. Writes `./doc-convert.yml` to **process.cwd()** (where you run the command), not `--project-root`.

| Flag | Description |
|------|-------------|
| `-f`, `--force` | Overwrite an existing `doc-convert.yml` in the current directory |

Generates a commented YAML file with `version: 1` and every configurable step set to `run`. Pandoc import is omitted (always runs). On success prints `Wrote …/doc-convert.yml`. See [Configuration](configuration.md).

## Examples (from `--help`)

```bash
doc-convert manuscript.docx
doc-convert manuscript.docx --project-root ./article --workdir _improved
doc-convert manuscript.docx --list-steps
doc-convert configure
doc-convert configure --force
```

## Exit codes

| Code | When |
|------|------|
| **0** | Conversion finished; `configure` wrote config; `--list-steps` printed; `-h` / `--help`; `-v` / `--version` |
| **1** | Missing input file; unsupported extension; invalid `--ror-min-score`; invalid `doc-convert.yml`; `configure` without `--force` when file exists; unknown CLI flags; Pandoc or step runtime errors |

Error messages print to stderr as `error: …`.

## Debug stack traces

Set either environment variable before running:

```bash
DEBUG=1 bun src/index.ts manuscript.docx ...
# or
DOC_CONVERT_DEBUG=1 bun src/index.ts manuscript.docx ...
```

On failure, the CLI prints the error stack trace in addition to the `error: …` line. Leave unset for normal author use.

More symptom → fix mappings: [Troubleshooting](troubleshooting.md).
