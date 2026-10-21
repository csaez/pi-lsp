export interface ServerOverride {
    command: string;
    args: string[];
    source: 'global' | 'project';
}
/**
 * Look up a user-defined server for a language. The project file
 * (`<workspace>/.pi/pi-lsp.json`) wins over the global one
 * (`~/.pi/agent/pi-lsp.json`, or `$MY_PI_LSP_CONFIG`).
 */
export declare function load_server_override(language: string, cwd: string, options?: {
    env?: NodeJS.ProcessEnv;
    allow_project?: boolean;
}): ServerOverride | undefined;
