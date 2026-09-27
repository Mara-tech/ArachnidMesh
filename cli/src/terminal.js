import { spawnSync } from 'node:child_process';

// Set on the relaunched process, so it never tries to relaunch itself again.
const RELAUNCHED = 'ARACHNID_MESH_WINPTY';

/**
 * Git Bash's mintty (without pseudo-console support) hands a Windows program pipes, not a console:
 * no raw mode, keys arrive a line at a time, and the prompts cannot draw. That is why Git Bash
 * aliases `node` to `winpty node.exe` — an alias `npx` does not get.
 *
 * Only a guess from the environment; `insideMintty` confirms it.
 */
export function looksLikeMintty({ platform, stdinIsTTY, env }) {
  return platform === 'win32' && !stdinIsTTY && Boolean(env.MSYSTEM) && !env[RELAUNCHED];
}

/**
 * The MSYS runtime knows a mintty pty behind the pipe; Node does not. Asking Git's own `sh` also
 * makes sure stdout was not redirected — winpty refuses to run when it is.
 */
function insideMintty() {
  const result = spawnSync('sh', ['-c', 'test -t 0 && test -t 1'], { stdio: 'inherit' });
  return !result.error && result.status === 0;
}

/**
 * Relaunches this very command under winpty when the prompts would not work otherwise.
 * Returns the relaunched exit code, or null when this process should carry on by itself.
 */
export function relaunchInConsole() {
  const guess = looksLikeMintty({
    platform: process.platform,
    stdinIsTTY: Boolean(process.stdin.isTTY),
    env: process.env,
  });
  if (!guess || !insideMintty()) return null;

  const result = spawnSync('winpty', [process.execPath, ...process.argv.slice(1)], {
    stdio: 'inherit',
    env: { ...process.env, [RELAUNCHED]: '1' },
  });
  if (result.error) return null;
  return result.status ?? 1;
}
