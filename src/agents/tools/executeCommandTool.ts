import { exec } from "node:child_process";
import { promisify } from "node:util";
import { tool } from "ai";
import { z } from "zod";

const execAsync = promisify(exec);

export function createExecuteCommandTool(config: { workspaceDir: string }) {
  return tool({
    description:
      "Ejecuta un comando de terminal dentro del workspace autorizado. " +
      "Se rechaza automáticamente cualquier comando que intente salir del directorio raíz configurado (por ejemplo cd .., rutas absolutas fuera del workspace, o expansiones peligrosas).",
    inputSchema: z.object({
      command: z.string().describe("Comando de terminal a ejecutar. Debe ser relativo al workspace."),
    }),
    execute: async ({ command }) => {
      const validationError = validateCommand(command, config.workspaceDir);
      if (validationError) {
        return { ok: false, error: validationError };
      }

      try {
        const { stdout, stderr } = await execAsync(command, {
          cwd: config.workspaceDir,
          timeout: 120_000,
          env: {
            ...process.env,
            PATH: process.env.PATH,
            HOME: process.env.HOME,
          },
        });

        return {
          ok: true,
          stdout: stdout.slice(0, 8_000),
          stderr: stderr.slice(0, 4_000),
        };
      } catch (error) {
        const execError = error as { stdout?: string; stderr?: string; message: string };
        return {
          ok: false,
          error: execError.message,
          stdout: execError.stdout?.slice(0, 8_000),
          stderr: execError.stderr?.slice(0, 4_000),
        };
      }
    },
  });
}

const DANGEROUS_PATTERNS = [
  /(^|[;&|]|\$\()\s*cd\s+(\.\.|["']?\/[a-zA-Z0-9_\-/]+)/,
  /\b(rm\s+-rf\s*\/|mkfs\.|dd\s+if=.*of=\/dev|<\(\/dev\/zero\)>\s*\/dev\/)/,
  /[`|;]\s*sudo\b/,
  />\s*\/etc\/|>\s*\/usr\/|>\s*\/bin\/|>\s*\/sbin\//,
  /\$\(\s*rm\s/,
  /\b(shutdown|reboot|halt|poweroff)\b/,
];

function validateCommand(command: string, workspaceDir: string): string | null {
  const normalizedWorkspace = normalizePath(workspaceDir);

  for (const pattern of DANGEROUS_PATTERNS) {
    if (pattern.test(command)) {
      return `Comando bloqueado por seguridad: coincide con el patrón ${pattern.source}`;
    }
  }

  const absolutePathMatches = command.matchAll(/(?:^|["'\s])(\/[^\s"'`;|&<>{}$]+)/g);
  for (const match of absolutePathMatches) {
    const absolutePath = normalizePath(match[1]!);
    if (!absolutePath.startsWith(normalizedWorkspace)) {
      return `Comando bloqueado: referencia a ruta absoluta fuera del workspace (${match[1]}).`;
    }
  }

  return null;
}

function normalizePath(p: string): string {
  return p.replace(/\/+/g, "/").replace(/\/$/, "") || "/";
}
