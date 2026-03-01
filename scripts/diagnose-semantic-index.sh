#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'USAGE'
Usage:
  scripts/diagnose-semantic-index.sh [WORKSPACE_PATH] [--out OUT_DIR]

Examples:
  scripts/diagnose-semantic-index.sh /Users/jbl2024/meditor
  scripts/diagnose-semantic-index.sh /Users/jbl2024/meditor --out /tmp/tomosona-diagnostics

Notes:
  - Expects DB at: <workspace>/.tomosona/tomosona.sqlite
  - Produces timestamped CSV files + a markdown summary report.
USAGE
}

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  usage
  exit 0
fi

workspace="${1:-$PWD}"
out_root=""

shift_count=0
if [[ $# -gt 0 && "${1:-}" != --* ]]; then
  shift_count=1
fi
for ((i=1+shift_count; i<=$#; i++)); do
  arg="${!i}"
  if [[ "$arg" == "--out" ]]; then
    next_index=$((i+1))
    out_root="${!next_index:-}"
    if [[ -z "$out_root" ]]; then
      echo "error: --out requires a value" >&2
      exit 1
    fi
  fi
done

if ! command -v sqlite3 >/dev/null 2>&1; then
  echo "error: sqlite3 is required but not found in PATH" >&2
  exit 1
fi

workspace="${workspace%/}"
db_path="$workspace/.tomosona/tomosona.sqlite"
if [[ ! -f "$db_path" ]]; then
  echo "error: database not found: $db_path" >&2
  exit 1
fi

ts="$(date +%Y%m%d-%H%M%S)"
if [[ -z "$out_root" ]]; then
  out_root="$workspace/.tomosona/diagnostics"
fi
out_dir="$out_root/semantic-index-$ts"
mkdir -p "$out_dir"

report="$out_dir/report.md"
errors=0
skipped=0

{
  echo "# Tomosona Semantic Index Diagnostics"
  echo
  echo "- Timestamp: $(date -u '+%Y-%m-%d %H:%M:%S UTC')"
  echo "- Workspace: $workspace"
  echo "- Database: $db_path"
  echo "- SQLite version: $(sqlite3 --version)"
  echo
} > "$report"

run_skipped() {
  local id="$1"
  local title="$2"
  local reason="$3"
  local sql="${4:-}"
  skipped=$((skipped + 1))
  {
    echo "## [$id] $title"
    echo
    if [[ -n "$sql" ]]; then
      echo '```sql'
      echo "$sql"
      echo '```'
      echo
    fi
    echo "Status: SKIPPED"
    echo
    echo "$reason"
    echo
  } >> "$report"
}

run_query() {
  local id="$1"
  local title="$2"
  local sql="$3"
  local csv_file="$out_dir/${id}.csv"
  local err_file="$out_dir/${id}.err"

  echo "Running [$id] $title"
  if sqlite3 -header -csv "$db_path" "$sql" >"$csv_file" 2>"$err_file"; then
    {
      echo "## [$id] $title"
      echo
      echo '```sql'
      echo "$sql"
      echo '```'
      echo
      echo '```csv'
      cat "$csv_file"
      echo
      echo '```'
      echo
    } >> "$report"
  else
    errors=$((errors + 1))
    {
      echo "## [$id] $title"
      echo
      echo '```sql'
      echo "$sql"
      echo '```'
      echo
      echo "Status: FAILED"
      echo
      echo '```text'
      cat "$err_file"
      echo
      echo '```'
      echo
    } >> "$report"
  fi
}

sample_path="$(sqlite3 -noheader -batch "$db_path" "SELECT path FROM note_embeddings ORDER BY updated_at_ms DESC, path LIMIT 1;")"
vec_table_exists="$(sqlite3 -noheader -batch "$db_path" "SELECT COUNT(*) FROM sqlite_master WHERE name='note_embeddings_vec';" || echo 0)"
vec_cli_ready=0
vec_cli_error=""
if [[ "$vec_table_exists" == "1" ]]; then
  vec_probe_err="$out_dir/vec_probe.err"
  if sqlite3 -noheader -batch "$db_path" "SELECT COUNT(*) FROM note_embeddings_vec LIMIT 1;" >/dev/null 2>"$vec_probe_err"; then
    vec_cli_ready=1
  else
    vec_cli_error="$(cat "$vec_probe_err")"
  fi
else
  vec_cli_error="note_embeddings_vec table not found"
fi

{
  echo "## Runtime Capabilities"
  echo
  echo "- vec table exists in sqlite_master: $([[ "$vec_table_exists" == "1" ]] && echo yes || echo no)"
  echo "- vec operations usable from sqlite3 CLI: $([[ "$vec_cli_ready" == "1" ]] && echo yes || echo no)"
  if [[ "$vec_cli_ready" != "1" ]]; then
    echo "- vec CLI probe error: \`${vec_cli_error//$'\n'/ }\`"
  fi
  echo
} >> "$report"

run_query "01_schema_objects" "Schema objects" "
SELECT name, type
FROM sqlite_master
WHERE name IN ('chunks','chunks_fts','embeddings','note_embeddings','note_links','note_properties','note_embeddings_vec')
ORDER BY name;
"

run_query "02_table_counts" "Core table counts" "
SELECT 'chunks' AS table_name, COUNT(*) AS n FROM chunks
UNION ALL SELECT 'embeddings', COUNT(*) FROM embeddings
UNION ALL SELECT 'note_embeddings', COUNT(*) FROM note_embeddings
UNION ALL SELECT 'note_links', COUNT(*) FROM note_links
UNION ALL SELECT 'note_properties', COUNT(*) FROM note_properties;
"

run_query "03_chunk_embedding_distribution" "Chunk embedding model/dim distribution" "
SELECT model, dim, COUNT(*) AS n
FROM embeddings
GROUP BY model, dim
ORDER BY n DESC;
"

run_query "04_note_embedding_distribution" "Note embedding model/dim distribution" "
SELECT model, dim, COUNT(*) AS n
FROM note_embeddings
GROUP BY model, dim
ORDER BY n DESC;
"

run_query "05_chunk_embedding_coverage" "Chunk to embedding coverage" "
SELECT
  (SELECT COUNT(*) FROM chunks) AS chunks_total,
  (SELECT COUNT(*) FROM embeddings) AS chunk_embeddings_total,
  (SELECT COUNT(*) FROM chunks c LEFT JOIN embeddings e ON e.chunk_id = c.id WHERE e.chunk_id IS NULL) AS chunks_without_embedding;
"

run_query "06_embedding_orphans" "Embedding orphan check" "
SELECT COUNT(*) AS embedding_orphans
FROM embeddings e
LEFT JOIN chunks c ON c.id = e.chunk_id
WHERE c.id IS NULL;
"

run_query "07_note_embedding_freshness" "Note embedding freshness" "
SELECT
  COUNT(*) AS note_embeddings_total,
  MIN(updated_at_ms) AS min_updated_at_ms,
  MAX(updated_at_ms) AS max_updated_at_ms
FROM note_embeddings;
"

run_query "08_notes_missing_note_embedding" "Notes with chunks but missing note embedding" "
SELECT c.path, COUNT(*) AS chunk_count
FROM chunks c
LEFT JOIN note_embeddings n ON n.path = c.path
GROUP BY c.path
HAVING n.path IS NULL
ORDER BY chunk_count DESC, c.path
LIMIT 50;
"

run_query "09_heaviest_notes" "Heaviest notes by chunk count" "
SELECT path, COUNT(*) AS chunk_count
FROM chunks
GROUP BY path
ORDER BY chunk_count DESC
LIMIT 20;
"

run_query "10_fts_row_count" "FTS row count" "
SELECT COUNT(*) AS fts_rows FROM chunks_fts;
"

run_query "11_fts_sample_query" "FTS sample query ('graph')" "
SELECT c.path, snippet(chunks_fts, 2, '[', ']', '...', 10) AS snip, bm25(chunks_fts) AS score
FROM chunks_fts
JOIN chunks c ON c.id = chunks_fts.rowid
WHERE chunks_fts MATCH 'graph'
ORDER BY score
LIMIT 10;
"

run_query "12_note_links_sample" "Note links sample" "
SELECT source_path, target_key
FROM note_links
ORDER BY source_path, target_key
LIMIT 30;
"

if [[ "$vec_cli_ready" == "1" ]]; then
  run_query "13_vec_row_count" "Vector table row count parity" "
SELECT
  (SELECT COUNT(*) FROM note_embeddings) AS note_embeddings_n,
  (SELECT COUNT(*) FROM note_embeddings_vec) AS note_embeddings_vec_n;
"

  run_query "14_vec_missing_paths" "Paths missing from vec index" "
SELECT n.path
FROM note_embeddings n
LEFT JOIN note_embeddings_vec v ON v.path = n.path
WHERE v.path IS NULL
LIMIT 50;
"

  if [[ -n "$sample_path" ]]; then
    escaped_sample_path="${sample_path//\'/\'\'}"
    run_query "15_vec_knn_sample" "KNN sample from most recent note embedding" "
SELECT path, distance
FROM note_embeddings_vec
WHERE embedding MATCH (SELECT embedding FROM note_embeddings_vec WHERE path = '$escaped_sample_path')
  AND k = 8
ORDER BY distance;
"
  else
    run_skipped "15_vec_knn_sample" "KNN sample from most recent note embedding" "no rows in note_embeddings."
  fi
else
  run_skipped "13_vec_row_count" "Vector table row count parity" "sqlite3 CLI cannot use vec0 module; app runtime may still support vec operations." "
SELECT
  (SELECT COUNT(*) FROM note_embeddings) AS note_embeddings_n,
  (SELECT COUNT(*) FROM note_embeddings_vec) AS note_embeddings_vec_n;
"
  run_skipped "14_vec_missing_paths" "Paths missing from vec index" "sqlite3 CLI cannot use vec0 module; app runtime may still support vec operations." "
SELECT n.path
FROM note_embeddings n
LEFT JOIN note_embeddings_vec v ON v.path = n.path
WHERE v.path IS NULL
LIMIT 50;
"
  run_skipped "15_vec_knn_sample" "KNN sample from most recent note embedding" "sqlite3 CLI cannot use vec0 module; app runtime may still support vec operations." "
SELECT path, distance
FROM note_embeddings_vec
WHERE embedding MATCH (SELECT embedding FROM note_embeddings_vec WHERE path = '<sample_path>')
  AND k = 8
ORDER BY distance;
"
fi

run_query "16_integrity" "SQLite integrity checks" "
PRAGMA quick_check;
PRAGMA foreign_key_check;
"

summary_file="$out_dir/summary.txt"
{
  echo "Report: $report"
  echo "Output dir: $out_dir"
  echo "Failures: $errors"
  echo "Skipped: $skipped"
} > "$summary_file"

cat "$summary_file"
if [[ $errors -gt 0 ]]; then
  echo "Some checks failed. Open report for details: $report" >&2
  exit 2
fi
