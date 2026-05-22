# pi-lsp

A fork of [`@spences10/pi-lsp`](https://github.com/spences10/my-pi/tree/main/packages/pi-lsp) with added support for:

- **clangd** — C/C++ language server (diagnostics, go-to-definition, symbols)
- **ty** — Python type checker and language server from Astral

All other servers from the upstream package (TypeScript, Rust, Go, Ruby, Java, Lua, Svelte) are unchanged.

## What changed from upstream

`dist/servers.js` — two additions:

1. **Extension map** — `.cpp`, `.cc`, `.cxx`, `.c`, `.h`, `.hpp`, `.hxx` all map to the `cpp` language.
2. **Server map** — `cpp` entry pointing at `clangd --stdio`; `python` entry switched from `pylsp` to `ty server`.
3. **Workspace markers** — `compile_commands.json` and `CMakeLists.txt` added so clangd finds the correct project root.

## Installation

```bash
pi install git:github.com/<your-username>/pi-lsp
```

## Requirements

- `clangd` on `PATH` (tested with clangd 22)
- `ty` on `PATH` (tested with Astral ty)
- A `compile_commands.json` in your C++ build or project root for clangd to resolve includes

## Commands

```
/lsp status
/lsp list
/lsp restart all
/lsp restart cpp
/lsp restart python
```

## Upstream

Original package by Scott Spence — <https://github.com/spences10/my-pi>
MIT licence.
