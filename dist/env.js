import { create_child_process_env as create_shared_child_process_env } from './vendor/pi-child-env/index.js';
export function create_child_process_env(explicit_env = {}, source_env = process.env) {
    return create_shared_child_process_env({
        profile: 'lsp',
        explicit_env,
        source_env,
    });
}
//# sourceMappingURL=env.js.map