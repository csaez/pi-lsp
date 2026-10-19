import { spawn } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { pathToFileURL } from 'node:url';
import { create_child_process_env } from './env.js';
import { retry_cancelled_request } from './retry.js';
export class LspClientStartError extends Error {
    command;
    args;
    code;
    constructor(message, options) {
        super(message, options.cause ? { cause: options.cause } : undefined);
        this.name = 'LspClientStartError';
        this.command = options.command;
        this.args = options.args;
        this.code = options.code;
    }
}
export class LspClient extends EventEmitter {
    #proc = null;
    #options;
    #next_id = 1;
    #pending = new Map();
    #buffer = Buffer.alloc(0);
    #initialized = false;
    #supports_pull_diagnostics = false;
    #open_docs = new Map();
    #diagnostics_by_uri = new Map();
    #diagnostic_waiters = new Set();
    constructor(options) {
        super();
        this.#options = options;
    }
    async start() {
        this.#proc = spawn(this.#options.command, this.#options.args, {
            stdio: ['pipe', 'pipe', 'pipe'],
            env: create_child_process_env(),
        });
        let start_reject = null;
        const start_failure = new Promise((_, reject) => {
            start_reject = reject;
        });
        const reject_start = (error) => {
            if (!start_reject)
                return false;
            const reject = start_reject;
            start_reject = null;
            reject(error);
            return true;
        };
        const start_error = (message, cause, code) => new LspClientStartError(message, {
            command: this.#options.command,
            args: this.#options.args,
            cause,
            code,
        });
        this.#proc.on('error', (err) => {
            const wrapped = start_error(`Failed to spawn ${this.#options.command}`, err, error_code(err));
            if (!reject_start(wrapped)) {
                this.#emit_error(wrapped);
            }
        });
        this.#proc.on('close', () => {
            if (!this.#initialized) {
                reject_start(start_error(`LSP server ${this.#options.command} closed before initialization`));
            }
            for (const pending of this.#pending.values()) {
                clearTimeout(pending.timer);
                pending.reject(new Error('LSP server closed'));
            }
            this.#pending.clear();
            this.#release_diagnostic_waiters(new Error('LSP server closed'));
            this.#initialized = false;
            this.#proc = null;
        });
        this.#proc.stderr?.on('data', () => {
            // Discard stderr; many servers are chatty.
        });
        this.#proc.stdout.on('data', (chunk) => {
            this.#buffer = Buffer.concat([this.#buffer, chunk]);
            this.#drain_buffer();
        });
        try {
            const initialize_result = await Promise.race([
                this.#request('initialize', {
                    processId: process.pid,
                    rootUri: this.#options.root_uri,
                    capabilities: {
                        textDocument: {
                            diagnostic: {},
                            publishDiagnostics: {
                                relatedInformation: true,
                                versionSupport: true,
                            },
                            hover: {
                                contentFormat: ['markdown', 'plaintext'],
                            },
                            definition: { linkSupport: false },
                            references: {},
                            documentSymbol: {
                                hierarchicalDocumentSymbolSupport: true,
                            },
                        },
                        workspace: {
                            workspaceFolders: true,
                            symbol: {},
                        },
                    },
                    workspaceFolders: [
                        { uri: this.#options.root_uri, name: 'workspace' },
                    ],
                }),
                start_failure,
            ]);
            const capabilities = initialize_result?.capabilities;
            this.#supports_pull_diagnostics = Boolean(capabilities?.diagnosticProvider);
            this.#notify('initialized', {});
            this.#initialized = true;
            start_reject = null;
        }
        catch (error) {
            await this.stop();
            throw error;
        }
    }
    is_ready() {
        return this.#initialized;
    }
    async ensure_document_open(uri, text) {
        const existing = this.#open_docs.get(uri);
        if (existing) {
            if (existing.text === text)
                return;
            const next_version = existing.version + 1;
            this.#open_docs.set(uri, { version: next_version, text });
            this.#notify('textDocument/didChange', {
                textDocument: { uri, version: next_version },
                contentChanges: [{ text }],
            });
            // Invalidate cached diagnostics so wait_for_diagnostics waits for fresh ones.
            this.#diagnostics_by_uri.delete(uri);
            return;
        }
        const language_id = this.#options.language_id_for_uri(uri) ?? 'plaintext';
        this.#open_docs.set(uri, { version: 1, text });
        this.#diagnostics_by_uri.delete(uri);
        this.#notify('textDocument/didOpen', {
            textDocument: {
                uri,
                languageId: language_id,
                version: 1,
                text,
            },
        });
    }
    async close_document(uri) {
        if (!this.#open_docs.has(uri))
            return;
        this.#open_docs.delete(uri);
        this.#diagnostics_by_uri.delete(uri);
        this.#notify('textDocument/didClose', {
            textDocument: { uri },
        });
    }
    open_document_count() {
        return this.#open_docs.size;
    }
    async hover(uri, position) {
        const result = (await this.#request('textDocument/hover', {
            textDocument: { uri },
            position,
        }));
        return result ?? null;
    }
    async definition(uri, position) {
        const result = (await this.#request('textDocument/definition', {
            textDocument: { uri },
            position,
        }));
        return normalize_location_result(result);
    }
    async references(uri, position, include_declaration) {
        const result = (await this.#request('textDocument/references', {
            textDocument: { uri },
            position,
            context: { includeDeclaration: include_declaration },
        }));
        return result ?? [];
    }
    async document_symbols(uri) {
        const result = (await this.#request('textDocument/documentSymbol', {
            textDocument: { uri },
        }));
        return normalize_document_symbol_result(result);
    }
    /** Diagnostics received for the current document, or null if none arrived. */
    get_diagnostics(uri) {
        return this.#diagnostics_by_uri.get(uri) ?? null;
    }
    /**
     * Resolves with the diagnostics the server supplied for the current
     * document; an empty array is an explicit clean result. Resolves with
     * null when no result arrived before the deadline, and rejects when the
     * client stops or the server closes while waiting.
     */
    async wait_for_diagnostics(uri, timeout_ms = 1500) {
        const cached = this.get_diagnostics(uri);
        if (cached)
            return cached;
        if (this.#supports_pull_diagnostics) {
            const response = (await retry_cancelled_request((remaining_ms) => this.#request('textDocument/diagnostic', { textDocument: { uri } }, remaining_ms), timeout_ms));
            if (!Array.isArray(response?.items))
                return null;
            if (this.#open_docs.has(uri)) {
                this.#diagnostics_by_uri.set(uri, response.items);
            }
            return response.items;
        }
        return new Promise((resolve, reject) => {
            let active = true;
            const cleanup = () => {
                if (!active)
                    return false;
                active = false;
                this.off('diagnostics', handler);
                clearTimeout(timer);
                this.#diagnostic_waiters.delete(release);
                return true;
            };
            const settle = () => {
                if (cleanup())
                    resolve(this.get_diagnostics(uri));
            };
            const release = (error) => {
                if (cleanup())
                    reject(error);
            };
            const handler = (event_uri) => {
                if (event_uri !== uri)
                    return;
                settle();
            };
            const timer = setTimeout(settle, timeout_ms);
            this.on('diagnostics', handler);
            this.#diagnostic_waiters.add(release);
        });
    }
    async stop() {
        if (this.#initialized) {
            try {
                await this.#request('shutdown', null, 1000);
                this.#notify('exit', null);
            }
            catch {
                // Server may already be dead; proceed.
            }
        }
        for (const pending of this.#pending.values()) {
            clearTimeout(pending.timer);
            pending.reject(new Error('LSP client stopped'));
        }
        this.#pending.clear();
        this.#release_diagnostic_waiters(new Error('LSP client stopped'));
        this.#open_docs.clear();
        this.#diagnostics_by_uri.clear();
        if (this.#proc) {
            this.#proc.kill();
            this.#proc = null;
        }
        this.#initialized = false;
        this.#supports_pull_diagnostics = false;
    }
    #release_diagnostic_waiters(error) {
        for (const release of Array.from(this.#diagnostic_waiters)) {
            release(error);
        }
    }
    #request(method, params, timeout_override) {
        return new Promise((resolve, reject) => {
            const id = this.#next_id++;
            const timeout_ms = timeout_override ??
                this.#options.request_timeout_ms ??
                30_000;
            const timer = setTimeout(() => {
                if (this.#pending.has(id)) {
                    this.#pending.delete(id);
                    reject(new Error(`LSP request ${method} timed out`));
                }
            }, timeout_ms);
            this.#pending.set(id, { resolve, reject, timer });
            try {
                this.#send({ jsonrpc: '2.0', id, method, params });
            }
            catch (error) {
                clearTimeout(timer);
                this.#pending.delete(id);
                reject(error);
            }
        });
    }
    #notify(method, params) {
        this.#send({ jsonrpc: '2.0', method, params });
    }
    #send(message) {
        if (!this.#proc?.stdin?.writable) {
            throw new Error('LSP server not connected');
        }
        const body = Buffer.from(JSON.stringify(message), 'utf8');
        const header = Buffer.from(`Content-Length: ${body.length}\r\n\r\n`, 'ascii');
        this.#proc.stdin.write(Buffer.concat([header, body]));
    }
    #emit_error(error) {
        if (this.listenerCount('error') > 0) {
            this.emit('error', error);
        }
    }
    #drain_buffer() {
        while (true) {
            const header_end = this.#buffer.indexOf('\r\n\r\n');
            if (header_end === -1)
                return;
            const header = this.#buffer
                .subarray(0, header_end)
                .toString('ascii');
            const match = header.match(/Content-Length:\s*(\d+)/i);
            if (!match) {
                this.#buffer = this.#buffer.subarray(header_end + 4);
                continue;
            }
            const length = Number(match[1]);
            const body_start = header_end + 4;
            if (this.#buffer.length < body_start + length)
                return;
            const body = this.#buffer.subarray(body_start, body_start + length);
            this.#buffer = this.#buffer.subarray(body_start + length);
            try {
                this.#handle_message(JSON.parse(body.toString('utf8')));
            }
            catch (error) {
                this.#emit_error(error);
            }
        }
    }
    #handle_message(message) {
        const numeric_id = typeof message.id === 'number'
            ? message.id
            : typeof message.id === 'string' && /^-?\d+$/.test(message.id)
                ? Number(message.id)
                : null;
        if (numeric_id != null && this.#pending.has(numeric_id)) {
            const pending = this.#pending.get(numeric_id);
            this.#pending.delete(numeric_id);
            clearTimeout(pending.timer);
            if (message.error) {
                pending.reject(new Error(`LSP error ${message.error.code}: ${message.error.message}`));
            }
            else {
                pending.resolve(message.result);
            }
            return;
        }
        if (message.method === 'textDocument/publishDiagnostics' &&
            message.params) {
            const params = message.params;
            // Diagnostics for a closed document or an earlier version are
            // stale; they must not answer for the current text.
            const open_doc = this.#open_docs.get(params.uri);
            if (!open_doc)
                return;
            if (typeof params.version === 'number' &&
                params.version !== open_doc.version) {
                return;
            }
            this.#diagnostics_by_uri.set(params.uri, params.diagnostics);
            this.emit('diagnostics', params.uri);
            return;
        }
        if (message.method && message.id != null) {
            // Respond to server-to-client requests we don't implement so it doesn't block.
            this.#send({
                jsonrpc: '2.0',
                id: message.id,
                result: null,
            });
        }
    }
}
export function normalize_location_result(result) {
    if (!result)
        return [];
    const entries = Array.isArray(result) ? result : [result];
    return entries.map((entry) => {
        if ('uri' in entry)
            return entry;
        return {
            uri: entry.targetUri,
            range: entry.targetSelectionRange ?? entry.targetRange,
        };
    });
}
export function normalize_document_symbol_result(result) {
    if (!result)
        return [];
    if (result.length === 0 ||
        ('range' in result[0] && 'selectionRange' in result[0])) {
        return result;
    }
    const symbol_info = result;
    return symbol_info.map((entry) => ({
        name: entry.name,
        kind: entry.kind,
        range: entry.location.range,
        selectionRange: entry.location.range,
        containerName: entry.containerName,
        uri: entry.location.uri,
    }));
}
export function file_path_to_uri(file_path) {
    return pathToFileURL(file_path).href;
}
function error_code(error) {
    return typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        typeof error.code === 'string'
        ? error.code
        : undefined;
}
//# sourceMappingURL=client.js.map