export declare function is_retriggerable_lsp_error(error: unknown): boolean;
export declare function retry_cancelled_request<T>(run: (remaining_ms: number) => Promise<T>, timeout_ms: number, now?: () => number): Promise<T>;
