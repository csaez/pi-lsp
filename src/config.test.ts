import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { load_server_override } from './config.js';
import { get_server_config } from './servers.js';

const dirs: string[] = [];

function tmp(): string {
	const dir = mkdtempSync(join(tmpdir(), 'pi-lsp-config-'));
	dirs.push(dir);
	return dir;
}

afterEach(() => {
	for (const dir of dirs.splice(0)) {
		rmSync(dir, { recursive: true, force: true });
	}
});

function write_global(dir: string, body: string): NodeJS.ProcessEnv {
	const file = join(dir, 'pi-lsp.json');
	writeFileSync(file, body);
	return { MY_PI_LSP_CONFIG: file };
}

describe('load_server_override', () => {
	it('returns undefined when no file exists', () => {
		const dir = tmp();
		expect(
			load_server_override('cpp', dir, {
				env: { MY_PI_LSP_CONFIG: join(dir, 'missing.json') },
			}),
		).toBeUndefined();
	});

	it('reads a global override', () => {
		const dir = tmp();
		const env = write_global(
			dir,
			JSON.stringify({ servers: { cpp: { command: 'ccls', args: ['-v'] } } }),
		);
		expect(load_server_override('cpp', dir, { env })).toEqual({
			command: 'ccls',
			args: ['-v'],
			source: 'global',
		});
		expect(load_server_override('python', dir, { env })).toBeUndefined();
	});

	it('ignores invalid files and entries', () => {
		const dir = tmp();
		expect(
			load_server_override('cpp', dir, { env: write_global(dir, '{nope') }),
		).toBeUndefined();
		expect(
			load_server_override('cpp', dir, {
				env: write_global(
					dir,
					JSON.stringify({ servers: { cpp: { command: 'x', args: [1] } } }),
				),
			}),
		).toBeUndefined();
	});

	it('prefers the project file and can skip it', () => {
		const dir = tmp();
		const env = write_global(
			dir,
			JSON.stringify({ servers: { cpp: { command: 'ccls' } } }),
		);
		mkdirSync(join(dir, '.pi'));
		writeFileSync(
			join(dir, '.pi', 'pi-lsp.json'),
			JSON.stringify({ servers: { cpp: { command: 'proj' } } }),
		);
		expect(load_server_override('cpp', dir, { env })?.source).toBe(
			'project',
		);
		expect(
			load_server_override('cpp', dir, { env, allow_project: false })
				?.command,
		).toBe('ccls');
	});
});

describe('get_server_config with overrides', () => {
	it('uses the override and marks project ones as project-local', () => {
		const dir = tmp();
		const env = write_global(
			dir,
			JSON.stringify({ servers: { cpp: { command: 'ccls' } } }),
		);
		expect(get_server_config('cpp', dir, { env })).toMatchObject({
			command: 'ccls',
			args: [],
			is_project_local: false,
		});
		mkdirSync(join(dir, '.pi'));
		writeFileSync(
			join(dir, '.pi', 'pi-lsp.json'),
			JSON.stringify({ servers: { cpp: { command: 'proj' } } }),
		);
		expect(get_server_config('cpp', dir, { env })?.is_project_local).toBe(
			true,
		);
		expect(
			get_server_config('cpp', dir, { env, allow_project_local: false })
				?.command,
		).toBe('ccls');
	});
});
