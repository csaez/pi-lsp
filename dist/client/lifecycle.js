import { spawn } from 'node:child_process';
import { create_child_process_env } from '../env.js';
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
export function start_lsp_process(options, handlers) {
    const proc = spawn(options.command, options.args, {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: create_child_process_env(),
    });
    proc.on('error', handlers.on_error);
    proc.on('close', handlers.on_close);
    proc.stderr?.on('data', () => {
        // Discard stderr; many servers are chatty.
    });
    proc.stdout.on('data', handlers.on_stdout);
    return proc;
}
export function create_start_error(options, message, cause, code) {
    return new LspClientStartError(message, {
        command: options.command,
        args: options.args,
        cause,
        code,
    });
}
export function create_initialize_params(options) {
    return {
        processId: process.pid,
        rootUri: options.root_uri,
        capabilities: {
            textDocument: {
                publishDiagnostics: {
                    relatedInformation: true,
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
        workspaceFolders: [{ uri: options.root_uri, name: 'workspace' }],
    };
}
export function error_code(error) {
    return typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        typeof error.code === 'string'
        ? error.code
        : undefined;
}
//# sourceMappingURL=lifecycle.js.map