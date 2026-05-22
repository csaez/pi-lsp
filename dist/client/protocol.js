export class JsonRpcProtocol {
    #proc = null;
    #next_id = 1;
    #pending = new Map();
    #buffer = Buffer.alloc(0);
    #options;
    constructor(options) {
        this.#options = options;
    }
    attach(proc) {
        this.#proc = proc;
    }
    receive(chunk) {
        this.#buffer = Buffer.concat([this.#buffer, chunk]);
        this.drain_buffer();
    }
    detach() {
        this.#proc = null;
    }
    reject_pending(error) {
        for (const pending of this.#pending.values()) {
            clearTimeout(pending.timer);
            pending.reject(error);
        }
        this.#pending.clear();
    }
    request(method, params, timeout_override) {
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
                this.send({ jsonrpc: '2.0', id, method, params });
            }
            catch (error) {
                clearTimeout(timer);
                this.#pending.delete(id);
                reject(error);
            }
        });
    }
    notify(method, params) {
        this.send({ jsonrpc: '2.0', method, params });
    }
    send(message) {
        if (!this.#proc?.stdin?.writable) {
            throw new Error('LSP server not connected');
        }
        const body = Buffer.from(JSON.stringify(message), 'utf8');
        const header = Buffer.from(`Content-Length: ${body.length}\r\n\r\n`, 'ascii');
        this.#proc.stdin.write(Buffer.concat([header, body]));
    }
    drain_buffer() {
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
                this.handle_message(JSON.parse(body.toString('utf8')));
            }
            catch (error) {
                this.#options.on_error(error);
            }
        }
    }
    handle_message(message) {
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
        if (this.#options.on_notification(message))
            return;
        if (message.method && message.id != null) {
            // Respond to server-to-client requests we don't implement so it doesn't block.
            this.send({
                jsonrpc: '2.0',
                id: message.id,
                result: null,
            });
        }
    }
}
//# sourceMappingURL=protocol.js.map