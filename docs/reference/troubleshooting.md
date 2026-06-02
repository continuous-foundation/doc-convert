# Troubleshooting

| Symptom | Likely cause | What to do |
|---------|--------------|------------|
| Pandoc not found / step 1 fails | Pandoc not on PATH | Install Pandoc; verify `which pandoc` |
| `Input file not found` | Wrong path or cwd | Use absolute paths or `cd` to the right directory |
| `Unsupported input` / not `.docx` | Wrong extension | Only `.docx` is supported |
| `--ror-min-score must be between 0 and 1` | Bad threshold | Pass a float in range, e.g. `0.8` |
| ROR step hangs or fails | Network / API | Retry or use `--no-ror-lookup` |
| Empty or stale `_improved/` | Partial dry-run or old run | `rm -rf` workdir; re-run without `--dry-run` |
| Global `doc-convert` behaves oddly | Stale `dist/` | `bun run build` in `doc-convert` |
| Citation step skipped | Manuscript has no detectable cite style | Check stdout for warn-skip; see gap analysis |
| Need full error stack | Opaque failure message | Re-run with `DEBUG=1` or `DOC_CONVERT_DEBUG=1` |
| Dry-run only shows step 1 | Expected on first run | Workdir was not created; remove `--dry-run` for a full convert |

See [CLI reference — Debug stack traces](cli.md#debug-stack-traces) for environment variables.

Conversion quality issues (tables, metadata) are tracked in [gap-analysis/SUMMARY.md](../../../gap-analysis/SUMMARY.md), not as CLI bugs.
