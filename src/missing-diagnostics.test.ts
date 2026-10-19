import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { create_test_lsp_extension } from '../test/support.js';
import { LspClient } from './client.js';

const SERVER_PATH = fileURLToPath(
	new URL('../test/synthetic-server.ts', import.meta.url),
);
const URI = 'file:///repo/src/a.ts';
const clients: LspClient[] = [];

async function start_client(...args: string[]): Promise<LspClient> {
	const client = new LspClient({
		command: process.execPath,
		args: [SERVER_PATH, ...args],
		root_uri: 'file:///repo',
		language_id_for_uri: () => 'typescript',
		request_timeout_ms: 2_000,
	});
	clients.push(client);
	await client.start();
	return client;
}

afterEach(async () => {
	await Promise.all(clients.splice(0).map((client) => client.stop()));
});

describe('LspClient.wait_for_diagnostics with a synthetic server', () => {
	it('reports an explicit empty result as clean', async () => {
		const client = await start_client();
		await client.ensure_document_open(URI, 'publish-clean');

		expect(await client.wait_for_diagnostics(URI, 2_000)).toEqual([]);
	});

	it('returns published diagnostics', async () => {
		const client = await start_client();
		await client.ensure_document_open(URI, 'publish-error');

		expect(
			await client.wait_for_diagnostics(URI, 2_000),
		).toMatchObject([{ message: 'Boom' }]);
	});

	it('reports no result when the server stays silent', async () => {
		const client = await start_client();
		await client.ensure_document_open(URI, 'silent');

		expect(await client.wait_for_diagnostics(URI, 50)).toBeNull();
		expect(client.get_diagnostics(URI)).toBeNull();
	});

	it('reports no result before a delayed response and the result after it', async () => {
		const client = await start_client();
		await client.ensure_document_open(URI, 'publish-delayed:150');

		expect(await client.wait_for_diagnostics(URI, 20)).toBeNull();
		expect(await client.wait_for_diagnostics(URI, 2_000)).toEqual([]);
	});

	it('ignores diagnostics published for an earlier document version', async () => {
		const client = await start_client();
		await client.ensure_document_open(URI, 'publish-error');
		await client.wait_for_diagnostics(URI, 2_000);
		await client.ensure_document_open(URI, 'publish-stale-clean');

		expect(await client.wait_for_diagnostics(URI, 100)).toBeNull();
	});

	it('ignores diagnostics published after the document closed', async () => {
		const client = await start_client();
		await client.ensure_document_open(URI, 'publish-clean-on-close');
		await client.close_document(URI);
		// Let the close-time publish arrive before the document reopens.
		await new Promise((resolve) => setTimeout(resolve, 100));
		await client.ensure_document_open(URI, 'silent');

		expect(await client.wait_for_diagnostics(URI, 50)).toBeNull();
	});

	it('rejects outstanding waits on shutdown', async () => {
		const client = await start_client();
		await client.ensure_document_open(URI, 'silent');
		const waiting = client.wait_for_diagnostics(URI, 5_000);
		const outcome = expect(waiting).rejects.toThrow(
			'LSP client stopped',
		);

		await client.stop();
		await outcome;
	});

	it('keeps explicit pull results and rejects a pull result without items', async () => {
		const client = await start_client('--pull');
		await client.ensure_document_open(URI, 'publish-clean');
		expect(await client.wait_for_diagnostics(URI, 2_000)).toEqual([]);

		await client.ensure_document_open(URI, 'publish-error');
		expect(
			await client.wait_for_diagnostics(URI, 2_000),
		).toMatchObject([{ message: 'Boom' }]);

		await client.ensure_document_open(URI, 'no-items');
		expect(await client.wait_for_diagnostics(URI, 2_000)).toBeNull();
	});
});

describe('lsp diagnostics tools with a synthetic server', () => {
	async function create_tools(texts: Record<string, string>) {
		return create_test_lsp_extension({
			create_client: (options) => {
				const client = new LspClient({
					...options,
					command: process.execPath,
					args: [SERVER_PATH],
				});
				clients.push(client);
				return client;
			},
			read_file: async (path) => texts[path] ?? 'silent',
			cwd: () => '/repo',
		});
	}

	it('distinguishes a clean file from missing diagnostics', async () => {
		const { tools } = await create_tools({
			'/repo/src/clean.ts': 'publish-clean',
		});

		const clean = await tools
			.get('lsp_diagnostics')
			.execute('1', { file: 'src/clean.ts' });
		const missing = await tools
			.get('lsp_diagnostics')
			.execute('2', { file: 'src/silent.ts', wait_ms: 50 });

		expect(clean.content[0].text).toBe(
			'/repo/src/clean.ts: no diagnostics',
		);
		expect(clean.details).toMatchObject({ ok: true });
		expect(missing.content[0].text).toContain(
			'/repo/src/silent.ts: validation incomplete',
		);
		expect(missing.content[0].text).toContain(
			'This is not a clean result.',
		);
		expect(missing.details).toMatchObject({
			ok: false,
			incomplete: true,
		});
	});

	it('counts incomplete files separately in a batch', async () => {
		const { tools } = await create_tools({
			'/repo/src/clean.ts': 'publish-clean',
			'/repo/src/broken.ts': 'publish-error',
		});

		const result = await tools
			.get('lsp_diagnostics_many')
			.execute('1', {
				files: ['src/clean.ts', 'src/broken.ts', 'src/silent.ts'],
				wait_ms: 200,
			});
		const text = result.content[0].text;

		expect(text).toContain(
			'Checked 3 file(s): 1 diagnostic(s), 1 clean, 0 error(s), 1 incomplete (not validated)',
		);
		expect(text).toContain('/repo/src/clean.ts: no diagnostics');
		expect(text).toContain('/repo/src/broken.ts: 1 diagnostic(s)');
		expect(text).toContain(
			'/repo/src/silent.ts: validation incomplete',
		);
		expect(result.details).toMatchObject({
			ok: false,
			clean_count: 1,
			diagnostic_count: 1,
			error_count: 0,
			incomplete_count: 1,
		});
	});
});
