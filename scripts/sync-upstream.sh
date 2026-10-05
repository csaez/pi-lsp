#!/usr/bin/env bash
# Sync src/ and test/ from upstream (spences10/my-pi, packages/pi-lsp) with a
# 3-way merge, so fork changes (servers.ts, servers.test.ts) are preserved.
# Usage: scripts/sync-upstream.sh [upstream-ref]   (default: upstream/main)
# Records the new base in .upstream-base only when every file merged cleanly.
set -euo pipefail
cd "$(dirname "$0")/.."

PKG=packages/pi-lsp
REF=${1:-upstream/main}
git remote get-url upstream >/dev/null 2>&1 ||
	git remote add upstream https://github.com/spences10/my-pi.git
git fetch upstream --depth=1 --no-tags
BASE=$(cat .upstream-base)
git cat-file -e "$BASE^{commit}" 2>/dev/null ||
	git fetch upstream --depth=1 --no-tags "$BASE"
NEW=$(git rev-parse "$REF")

# Upstream uses vite-plus; the fork runs plain vitest.
norm() { sed "s#'vite-plus/test'#'vitest'#g"; }
show() { git show "$1:$PKG/$2" 2>/dev/null | norm; }

files=$( { git ls-tree -r --name-only "$BASE" -- "$PKG/src" "$PKG/test";
           git ls-tree -r --name-only "$NEW" -- "$PKG/src" "$PKG/test"; } |
         sed "s#^$PKG/##" | sort -u )
conflicts=0
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
for f in $files; do
	mkdir -p "$(dirname "$f")"
	if ! git cat-file -e "$NEW:$PKG/$f" 2>/dev/null; then
		echo "REMOVED upstream (review, not deleted): $f"; continue
	fi
	if [ ! -e "$f" ]; then show "$NEW" "$f" >"$f"; echo "added: $f"; continue; fi
	if git cat-file -e "$BASE:$PKG/$f" 2>/dev/null; then
		show "$BASE" "$f" >"$tmp/base"
	else : >"$tmp/base"; fi
	show "$NEW" "$f" >"$tmp/new"
	if git merge-file -L fork -L base -L upstream "$f" "$tmp/base" "$tmp/new"; then
		:
	else
		echo "CONFLICT: $f"; conflicts=$((conflicts + 1))
	fi
done

echo
echo "== package.json: upstream changes since base (port manually) =="
git diff "$BASE" "$NEW" -- "$PKG/package.json" "$PKG/tsconfig.json" \
	"$PKG/tsconfig.build.json" | grep '^[+-]' | grep -v '^\(+++\|---\)' || echo "(none)"

if [ "$conflicts" -gt 0 ]; then
	echo "$conflicts conflict(s). Resolve markers, then: echo $NEW > .upstream-base"
	exit 1
fi
echo "$NEW" >.upstream-base
echo "Merged cleanly. Base is now $NEW. Next: npm run check && npm test && npm run build"
