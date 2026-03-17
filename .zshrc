unalias devtools 2>/dev/null || true

devtools() {
  local repo_root
  repo_root="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
  "${repo_root}/devtools/bin/mv37-devtools" "$@"
}
