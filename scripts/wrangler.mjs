import {spawn} from 'node:child_process';
import {mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
await mkdir('.local/config',{recursive:true});
const cli=spawn(process.execPath,['node_modules/wrangler/bin/wrangler.js',...process.argv.slice(2)],{stdio:'inherit',env:{...process.env,XDG_CONFIG_HOME:resolve('.local/config'),WRANGLER_LOG_PATH:resolve('.local/wrangler.log'),WRANGLER_SEND_METRICS:'false'}});
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>cli.kill(signal));
cli.on('exit',code=>{process.exitCode=code || 0;});
