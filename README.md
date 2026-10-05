# pi-lsp (fork)

Fork of [`@spences10/pi-lsp`](https://github.com/spences10/my-pi/tree/main/packages/pi-lsp)
0.0.48 with two additions. Everything else is unchanged upstream code.

- **clangd** for C/C++ (`.c .cc .cpp .cxx .h .hpp .hxx`). `compile_commands.json`
  and `CMakeLists.txt` count as workspace roots.
- **ty** (Astral) for Python. In auto mode `ty` is tried first (project
  `.venv`, then PATH), then the upstream order (pylsp, basedpyright, pyright).
  `MY_PI_LSP_PYTHON_SERVER=ty|pylsp|basedpyright|pyright` still forces one.

The diff against upstream is confined to `src/servers.ts` and its tests.
`dist/` is committed because pi installs git packages without building.

## Updating from upstream (instructions for humans and AI agents)

Upstream is the monorepo `https://github.com/spences10/my-pi`, package
path `packages/pi-lsp`. This repo is a standalone copy, not a git fork,
so history is not shared. The `upstream` git remote points at the
monorepo and `.upstream-base` holds the upstream commit this tree was
last synced to.

### Fork patch (the only intentional divergence)

Keep this list current. Everything not listed must equal upstream.

- `src/servers.ts`: `.c .cc .cpp .cxx .h .hpp .hxx` -> `cpp`; `cpp`
  entry in `LANGUAGE_SERVERS` (clangd, no args); `compile_commands.json`
  and `CMakeLists.txt` in `WORKSPACE_MARKERS`; `ty` entry in
  `PYTHON_SERVERS` (`ty server`); `ty` accepted by
  `MY_PI_LSP_PYTHON_SERVER`; auto mode tries `ty` before `pylsp`;
  final fallback and "no server" error hint use `ty`.
- `src/servers.test.ts`: tests for the above.
- Tooling differences (not upstream's): plain `tsc` + `vitest` instead of
  `vite-plus`/pnpm, `typescript` ^7 (the TS 7 native LSP integration tests need it; TS 5 fails them), pinned versions instead of `workspace:*`/`catalog:`
  in `package.json`, committed `dist/`, `scripts/`, `.upstream-base`.

### Procedure

1. `scripts/sync-upstream.sh` (optionally pass a ref, default
   `upstream/main`). It 3-way merges `src/` and `test/` from
   `.upstream-base` -> new upstream, rewriting `vite-plus/test` imports to
   `vitest`. Fork changes in `servers.ts` and `servers.test.ts` are
   preserved. On a clean run it updates `.upstream-base`.
2. Conflicts show as `<<<<<<< fork` / `>>>>>>> upstream` markers. The
   likely spot is the Python resolution in `servers.ts`
   (`resolve_python_server`). Keep upstream's new logic and re-apply the
   fork patch above on top. Then write the new commit into
   `.upstream-base`.
3. The script prints upstream changes to `package.json` and tsconfig
   files. Port them by hand, keeping the fork's tooling. In particular
   bump `@spences10/pi-*` dependency versions to match the published
   versions upstream uses (`npm view @spences10/pi-child-env version`
   etc.), and update `package-lock.json` with `npm install`.
4. Files reported as `REMOVED upstream` are not deleted automatically.
   Review and delete if appropriate.
5. Verify: `npm run check && chop npm test && chop npm run build`. `dist/` must be
   rebuilt and committed (pi installs git packages without building).
6. Bump `version` to `<upstream version>-clangd-ty.N`, update the
   "0.0.48" mentions at the top of this README, and refresh the
   upstream README section below and `CHANGELOG.upstream.md` from
   `packages/pi-lsp/README.md` and `CHANGELOG.md` upstream.
7. If upstream added native support for clangd, `ty`, or an equivalent
   backend selection, drop the matching part of the fork patch.

Upstream policy notes: they keep `pylsp` as the default Python server
and have declined PRs that change defaults, so the `ty`-first order is
expected to stay a fork-only patch.

## Install

    pi install git:github.com/csaez/pi-lsp

Requires `clangd` and/or `ty` on PATH.


---

# @spences10/pi-lsp

<!-- package-readme:header:start -->

[![built with Vite+](https://img.shields.io/badge/built%20with-Vite+-646CFF?logo=vite&logoColor=white)](https://viteplus.dev)
[![tested with Vitest](https://img.shields.io/badge/tested%20with-Vitest-6E9F18?logo=vitest&logoColor=white)](https://vitest.dev)
[![npm version](https://img.shields.io/npm/v/@spences10/pi-lsp?color=CB3837&logo=npm&logoColor=white)](https://www.npmjs.com/package/@spences10/pi-lsp)
[![license](https://img.shields.io/npm/l/@spences10/pi-lsp)](https://www.npmjs.com/package/@spences10/pi-lsp)

![my-pi package preview](https://raw.githubusercontent.com/spences10/my-pi/main/assets/pi-package-preview.png)

<!-- package-readme:header:end -->

Give agents precise code intelligence instead of guesswork. `pi-lsp`
exposes language-server diagnostics, hovers, definitions, references,
and symbols as Pi tools so models can validate edits and navigate
typed codebases accurately.

The hover, definition, and document-symbol tools prefer Pi's strict
JSON Schema sampling with closed, fully required schemas. LSP tools
with optional arguments use normal tool calling for provider
portability.

## Installation

<!-- package-readme:install:start -->

```bash
pi install npm:@spences10/pi-lsp
```

<!-- package-readme:install:end -->

Local development from this monorepo:

```bash
pnpm --filter @spences10/pi-lsp run build
pi install ./packages/pi-lsp
# or for one run only
pi -e ./packages/pi-lsp
```

## Required language servers

This package talks to language-server binaries installed globally on
`PATH` or locally in a project. Global installation makes one server
available across projects:

```bash
npm install -g typescript svelte-language-server
# or
pnpm add -g typescript svelte-language-server
```

Project-local development dependencies let a repository pin and share
specific server versions:

```bash
npm install -D typescript svelte-language-server
# or
pnpm add -D typescript svelte-language-server
```

For TypeScript 6 and earlier, add `typescript-language-server` to the
same global or project-local command. Volta users can install global
tools with `volta install typescript svelte-language-server`.

Supported server discovery includes:

- TypeScript 7 / JavaScript via the project-local native
  `tsc --lsp --stdio` server
- TypeScript 6 and earlier via `typescript-language-server --stdio`
- Svelte via `svelteserver`
- Python via `python-lsp-server`, Basedpyright, or Pyright
- Go via `gopls`
- Rust via `rust-analyzer`
- Ruby via `solargraph`
- Java via `jdtls`
- Lua via `lua-language-server`

The TypeScript backend is selected by capability. A project-local
TypeScript installation takes priority. TypeScript 7 without
`lib/tsserver.js` uses its native `tsc` LSP, while classic project
installations use `typescript-language-server`. When a project does
not pin TypeScript, a TypeScript 7 `tsc` on `PATH` provides the native
LSP. `/lsp status` reports the selected backend and full command. A
TypeScript 7 native server that cannot start reports a specific setup
hint.

### Python server selection

Python keeps `pylsp` when it is available, so installing another type
checker does not replace an existing pylsp setup or its plugins. When
pylsp is missing, project-local Basedpyright or Pyright takes priority
over global tools. The nearest project installation wins; within the
same directory, Basedpyright takes priority over Pyright. Global
fallback uses Basedpyright before Pyright.

Set `MY_PI_LSP_PYTHON_SERVER` to `pylsp`, `basedpyright`, or `pyright`
to select a specific backend. Unset it or use `auto` for the default
selection above. For example:

```bash
MY_PI_LSP_PYTHON_SERVER=pyright pi
```

An explicit selection never switches to another backend. Missing or
failed servers report an error and an installation hint. Install with
`pip install python-lsp-server`, `pip install basedpyright`, or
`pip install pyright`. Pyright-family servers use `--stdio`.

Python discovery checks executable files in ancestor `.venv/bin`
folders (`.venv/Scripts` on Windows), `node_modules/.bin`, and `PATH`.
Directories, broken links, and non-executable files are skipped. On
Windows, use native executables such as the `.exe` launchers from pip;
`.cmd` and `.bat` wrappers are not supported by the shell-free client.
`/lsp status` shows the selected backend and resolved command.

If project-binary trust is skipped, Python discovery excludes those
binaries even when an active virtual environment puts them on `PATH`.
Without a separate global server, the tool reports an error instead of
starting the skipped binary.

Server discovery does not select the Python interpreter used for
analysis. Configure the server's interpreter or virtual environment
settings separately when needed.

### Project-local binary trust

Project-local binaries in `node_modules/.bin` and Python `.venv`
folders are untrusted by default because they can execute
repo-controlled code. Interactive sessions prompt before starting a
project-local binary; headless sessions fall back to the global `PATH`
binary unless `MY_PI_LSP_PROJECT_BINARY=allow` or
`MY_PI_LSP_PROJECT_BINARY=trust` is set. `/lsp status` shows the
resolved binary path for running and idle servers.

An allow-once decision remains valid for the lifetime of the Pi
session, including after an idle language-server restart. Interactive
trust prompts follow tool cancellation and time out after 30 seconds,
returning a tool error instead of leaving the session indefinitely in
`Working`.

Language servers receive a restricted child-process environment by
default. Use `MY_PI_LSP_ENV_ALLOWLIST=NAME,OTHER_NAME` or the shared
`MY_PI_CHILD_ENV_ALLOWLIST` to pass selected ambient variables
through.

## Tools

The extension registers LSP-backed Pi tools for:

- diagnostics
- hover
- definitions
- references
- document symbols

These tools let the model inspect types, find usages, and catch
diagnostics without guessing from text search alone.

## Model reminder

When LSP tools are active, the extension reminds the model to use LSP
for code questions and validate changed files after the final relevant
edit, preferring `lsp_diagnostics_many` for batches. Passed
diagnostics can be reused for review, commit, and push if their inputs
are unchanged. Only affected or previously missing diagnostics need to
run; a commit or push request alone does not require another run.

## Commands

```text
/lsp status
/lsp list
/lsp restart all
/lsp restart <language>
```

Use `/lsp status` to inspect active clients and `/lsp restart` after
dependency installs or language-server crashes.

Language servers stop after five minutes without an active LSP request
and start again on demand. Set `MY_PI_LSP_IDLE_TIMEOUT_MS` to a
positive timeout in milliseconds, or set it to `0` to keep idle
servers running until the Pi session exits.

## Using from a custom harness

```ts
import lsp from '@spences10/pi-lsp';

// pass `lsp` as an ExtensionFactory to your Pi runtime
```

For harnesses that need to provide their own language-server client
factory, use the named extension factory:

```ts
import { create_lsp_extension } from '@spences10/pi-lsp';

const lsp = create_lsp_extension({ create_client });
```

The package also exports `CreateLspExtensionOptions`,
`should_inject_lsp_prompt`, and `LspClientLike` for custom harnesses
and tests that need to share the same prompt-gating or client seam.

`my-pi` imports this package directly and enables it as the built-in
LSP extension.

## Development

<!-- package-readme:development:start commands="check,test,build" -->

Package scripts build transitive workspace dependencies first, then
run local tools through Vite+ with `vp exec`.

```bash
pnpm --filter @spences10/pi-lsp run check
pnpm --filter @spences10/pi-lsp run test
pnpm --filter @spences10/pi-lsp run build
```

<!-- package-readme:development:end -->

## License

MIT
