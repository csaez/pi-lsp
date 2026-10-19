// Fork-only (not upstream). Kept out of client.ts so upstream syncs only
// conflict on the single call site in wait_for_diagnostics.
// ServerCancelled (-32802) and ContentModified (-32801) mean "ask again".
// ty sends ServerCancelled for a pending pull-diagnostic request whenever
// another document is opened, which lsp_diagnostics_many does in parallel.
// client.ts only exposes errors as "LSP error <code>: <message>" strings.
const RETRIGGERABLE_ERROR = /^LSP error -3280[12]:/;
const RETRY_DELAY_MS = 25;
export function is_retriggerable_lsp_error(error) {
    return (error instanceof Error && RETRIGGERABLE_ERROR.test(error.message));
}
// timeout_ms is the budget across all attempts, so callers' wait_ms still
// bounds the total wait.
export async function retry_cancelled_request(run, timeout_ms, now = Date.now) {
    const deadline = now() + timeout_ms;
    for (;;) {
        try {
            return await run(Math.max(1, deadline - now()));
        }
        catch (error) {
            const remaining = deadline - now();
            if (!is_retriggerable_lsp_error(error) || remaining <= 0) {
                throw error;
            }
            await new Promise((resolve) => setTimeout(resolve, Math.min(RETRY_DELAY_MS, remaining)));
        }
    }
}
//# sourceMappingURL=retry.js.map