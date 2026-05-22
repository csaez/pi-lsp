import type { ChildProcess } from 'node:child_process';
export interface LspPosition {
    line: number;
    character: number;
}
export interface LspRange {
    start: LspPosition;
    end: LspPosition;
}
export interface LspLocation {
    uri: string;
    range: LspRange;
}
export interface LspLocationLink {
    targetUri: string;
    targetRange: LspRange;
    targetSelectionRange?: LspRange;
    originSelectionRange?: LspRange;
}
export interface LspHover {
    contents: string | {
        language?: string;
        value: string;
    } | {
        kind: string;
        value: string;
    } | Array<string | {
        language?: string;
        value: string;
    } | {
        kind: string;
        value: string;
    }>;
    range?: LspRange;
}
export interface JsonRpcMessage {
    jsonrpc: '2.0';
    id?: number | string;
    method?: string;
    params?: unknown;
    result?: unknown;
    error?: {
        code: number;
        message: string;
        data?: unknown;
    };
}
export interface JsonRpcProtocolOptions {
    request_timeout_ms?: number;
    on_error: (error: unknown) => void;
    on_notification: (message: JsonRpcMessage) => boolean;
}
export declare class JsonRpcProtocol {
    #private;
    constructor(options: JsonRpcProtocolOptions);
    attach(proc: ChildProcess): void;
    receive(chunk: Buffer): void;
    detach(): void;
    reject_pending(error: Error): void;
    request(method: string, params: unknown, timeout_override?: number): Promise<unknown>;
    notify(method: string, params: unknown): void;
    send(message: JsonRpcMessage): void;
    drain_buffer(): void;
    handle_message(message: JsonRpcMessage): void;
}
