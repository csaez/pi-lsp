import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
const CONFIG_ENV = 'MY_PI_LSP_CONFIG';
const CONFIG_FILENAME = 'pi-lsp.json';
function global_config_path(env) {
    if (env[CONFIG_ENV])
        return env[CONFIG_ENV];
    const agent_dir = env.PI_CODING_AGENT_DIR || join(homedir(), '.pi', 'agent');
    return join(agent_dir, CONFIG_FILENAME);
}
function read_override(path, language, source) {
    if (!existsSync(path))
        return undefined;
    try {
        const parsed = JSON.parse(readFileSync(path, 'utf8'));
        const entry = parsed.servers?.[language];
        if (!entry || typeof entry.command !== 'string' || !entry.command) {
            return undefined;
        }
        const args = Array.isArray(entry.args) ? entry.args : [];
        if (!args.every((arg) => typeof arg === 'string'))
            return undefined;
        return { command: entry.command, args: args, source };
    }
    catch {
        // A broken optional file must never disable the built-in servers.
        return undefined;
    }
}
/**
 * Look up a user-defined server for a language. The project file
 * (`<workspace>/.pi/pi-lsp.json`) wins over the global one
 * (`~/.pi/agent/pi-lsp.json`, or `$MY_PI_LSP_CONFIG`).
 */
export function load_server_override(language, cwd, options = {}) {
    const env = options.env ?? process.env;
    const project = options.allow_project === false
        ? undefined
        : read_override(join(cwd, '.pi', CONFIG_FILENAME), language, 'project');
    return (project ?? read_override(global_config_path(env), language, 'global'));
}
//# sourceMappingURL=config.js.map