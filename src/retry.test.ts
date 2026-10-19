// Fork-only (not upstream): covers src/retry.ts and its use in client.ts.
import { writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LspClient } from './client.js';
import {
	is_retriggerable_lsp_error,
	retry_cancelled_request,
} from './retry.js';

const cancelled = () =>
	new Error('LSP error -32802: server cancelled the request');

describe('is_retriggerable_lsp_error', () => {
	it('matches ServerCancelled and ContentModified only', () => {
		expect(is_retriggerable_lsp_error(cancelled())).toBe(true);
		expect(
			is_retriggerable_lsp_error(
				new Error('LSP error -32801: content modified'),
			),
		).toBe(true);
		expect(
			is_retriggerable_lsp_error(
				new Error('LSP error -32800: request cancelled'),
			),
		).toBe(false);
		expect(
			is_retriggerable_lsp_error(new Error('LSP server closed')),
		).toBe(false);
		expect(is_retriggerable_lsp_error('LSP error -32802: x')).toBe(
			false,
		);
	});
});

describe('retry_cancelled_request', () => {
	it('retries until the request succeeds', async () => {
		const run = vi
			.fn()
			.mockRejectedValueOnce(cancelled())
			.mockRejectedValueOnce(cancelled())
			.mockResolvedValue('ok');
		await expect(retry_cancelled_request(run, 1000)).resolves.toBe(
			'ok',
		);
		expect(run).toHaveBeenCalledTimes(3);
	});

	it('does not retry other errors', async () => {
		const run = vi.fn().mockRejectedValue(new Error('boom'));
		await expect(retry_cancelled_request(run, 1000)).rejects.toThrow(
			'boom',
		);
		expect(run).toHaveBeenCalledTimes(1);
	});

	it('gives up with the last error once the budget is spent', async () => {
		let t = 0;
		const run = vi.fn(async () => {
			t += 400;
			throw cancelled();
		});
		await expect(
			retry_cancelled_request(run, 1000, () => t),
		).rejects.toThrow('-32802');
		expect(run).toHaveBeenCalledTimes(3);
	});

	it('passes the remaining budget to each attempt', async () => {
		let t = 0;
		const budgets: number[] = [];
		await retry_cancelled_request(
			async (remaining) => {
				budgets.push(remaining);
				t += 300;
				if (budgets.length < 3) throw cancelled();
			},
			1000,
			() => t,
		);
		expect(budgets).toEqual([1000, 700, 400]);
	});
});

// Mimics ty: a pending pull-diagnostic request is cancelled with -32802
// when another document is opened before it is answered.
const FAKE_SERVER = `
let buf = Buffer.alloc(0);
let pending = null;
const send = (m) => {
	const b = Buffer.from(JSON.stringify({ jsonrpc: '2.0', ...m }));
	process.stdout.write('Content-Length: ' + b.length + '\\r\\n\\r\\n');
	process.stdout.write(b);
};
const handle = (m) => {
	if (m.method === 'initialize')
		return send({ id: m.id, result: { capabilities: { diagnosticProvider: {} } } });
	if (m.method === 'shutdown') return send({ id: m.id, result: null });
	if (m.method === 'exit') process.exit(0);
	if (m.method === 'textDocument/didOpen' && pending) {
		send({ id: pending, error: { code: -32802, message: 'server cancelled the request' } });
		pending = null;
	}
	if (m.method === 'textDocument/diagnostic') {
		if (pending) send({ id: pending, result: { kind: 'full', items: [] } });
		pending = m.id;
		setTimeout(() => {
			if (pending !== m.id) return;
			pending = null;
			send({ id: m.id, result: { kind: 'full', items: [] } });
		}, 20);
	}
};
process.stdin.on('data', (c) => {
	buf = Buffer.concat([buf, c]);
	for (;;) {
		const end = buf.indexOf('\\r\\n\\r\\n');
		if (end < 0) return;
		const len = Number(/Content-Length: (\\d+)/i.exec(buf.subarray(0, end).toString())[1]);
		if (buf.length < end + 4 + len) return;
		handle(JSON.parse(buf.subarray(end + 4, end + 4 + len).toString()));
		buf = buf.subarray(end + 4 + len);
	}
});
`;

const dirs: string[] = [];
afterEach(() => {
	for (const dir of dirs.splice(0)) {
		rmSync(dir, { recursive: true, force: true });
	}
});

describe('LspClient pull diagnostics', () => {
	it('retries requests the server cancels when another file opens', async () => {
		const dir = mkdtempSync(join(tmpdir(), 'pi-lsp-retry-'));
		dirs.push(dir);
		const server = join(dir, 'server.cjs');
		writeFileSync(server, FAKE_SERVER);
		const client = new LspClient({
			command: process.execPath,
			args: [server],
			root_uri: 'file:///repo',
			language_id_for_uri: () => 'python',
		});
		await client.start();
		try {
			await client.ensure_document_open('file:///repo/a.py', 'a = 1');
			const first = client.wait_for_diagnostics('file:///repo/a.py');
			await client.ensure_document_open('file:///repo/b.py', 'b = 1');
			const second = client.wait_for_diagnostics('file:///repo/b.py');
			await expect(Promise.all([first, second])).resolves.toEqual([
				[],
				[],
			]);
		} finally {
			await client.stop();
		}
	});
});
