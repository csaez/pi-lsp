import type { EventEmitter } from 'node:events';
import type { LspRange } from './protocol.js';
export interface LspDiagnostic {
    range: LspRange;
    severity?: 1 | 2 | 3 | 4;
    code?: string | number;
    source?: string;
    message: string;
}
export declare class LspDiagnosticsStore {
    #private;
    constructor(events: EventEmitter);
    get(uri: string): LspDiagnostic[];
    publish(uri: string, diagnostics: LspDiagnostic[]): void;
    wait(uri: string, timeout_ms?: number): Promise<LspDiagnostic[]>;
    flush_waiters(): void;
}
