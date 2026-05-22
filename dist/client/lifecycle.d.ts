import { type ChildProcess } from 'node:child_process';
export interface LspClientOptions {
    command: string;
    args: string[];
    root_uri: string;
    language_id_for_uri: (uri: string) => string | undefined;
    request_timeout_ms?: number;
}
export declare class LspClientStartError extends Error {
    command: string;
    args: string[];
    code?: string;
    constructor(message: string, options: {
        command: string;
        args: string[];
        cause?: unknown;
        code?: string;
    });
}
export interface LspProcessHandlers {
    on_stdout: (chunk: Buffer) => void;
    on_error: (error: Error) => void;
    on_close: () => void;
}
export declare function start_lsp_process(options: LspClientOptions, handlers: LspProcessHandlers): ChildProcess;
export declare function create_start_error(options: LspClientOptions, message: string, cause?: unknown, code?: string): LspClientStartError;
export declare function create_initialize_params(options: LspClientOptions): unknown;
export declare function error_code(error: unknown): string | undefined;
