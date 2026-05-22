export class LspDiagnosticsStore {
    #diagnostics_by_uri = new Map();
    #diagnostic_waiters = new Set();
    #events;
    constructor(events) {
        this.#events = events;
    }
    get(uri) {
        return this.#diagnostics_by_uri.get(uri) ?? [];
    }
    publish(uri, diagnostics) {
        this.#diagnostics_by_uri.set(uri, diagnostics);
        this.#events.emit('diagnostics', uri);
    }
    async wait(uri, timeout_ms = 1500) {
        if (this.#diagnostics_by_uri.has(uri)) {
            return this.get(uri);
        }
        return new Promise((resolve) => {
            let active = true;
            const cleanup = () => {
                if (!active)
                    return;
                active = false;
                this.#events.off('diagnostics', handler);
                clearTimeout(timer);
                this.#diagnostic_waiters.delete(cleanup);
                resolve(this.get(uri));
            };
            const handler = (event_uri) => {
                if (event_uri !== uri)
                    return;
                cleanup();
            };
            const timer = setTimeout(cleanup, timeout_ms);
            this.#events.on('diagnostics', handler);
            this.#diagnostic_waiters.add(cleanup);
        });
    }
    flush_waiters() {
        for (const cleanup of Array.from(this.#diagnostic_waiters)) {
            cleanup();
        }
    }
}
//# sourceMappingURL=diagnostics.js.map