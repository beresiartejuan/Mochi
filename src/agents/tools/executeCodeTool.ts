import { exec } from "node:child_process";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { promisify } from "node:util";
import { tool } from "ai";
import { z } from "zod";

const execAsync = promisify(exec);

const SANDBOX_IMAGE = "python:3.13";
const EXEC_TIMEOUT_MS = 30_000;
const STDOUT_LIMIT = 8_000;
const STDERR_LIMIT = 4_000;

export function createExecuteCodeTool() {
  return tool({
    description:
      "Ejecuta código Python en un sandbox de Docker aislado (sin red, solo lectura, con límites de CPU y memoria). " +
      "El código corre en el filesystem del contenedor, no en la máquina host. " +
      "Devuelve stdout, stderr y el código de salida.",
    inputSchema: z.object({
      code: z.string().describe("Código Python a ejecutar en el sandbox."),
    }),
    execute: async ({ code }) => {
      if (!code.trim()) {
        return { ok: false, error: "El código está vacío." };
      }

      const containerName = `mochi-sandbox-${randomUUID()}`;
      let tempDir: string | null = null;

      try {
        tempDir = await mkdtemp(join(tmpdir(), "mochi-sandbox-"));
        await writeFile(join(tempDir, "main.py"), code, "utf8");
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return { ok: false, error: `No se pudo preparar el sandbox: ${message}` };
      }

      try {
        const { stdout, stderr } = await execAsync(
          [
            "docker run --rm",
            `--name ${containerName}`,
            "--network=none",
            "--read-only",
            "--tmpfs /tmp",
            "--memory=256m",
            "--cpus=1",
            "--cap-drop=ALL",
            "--security-opt=no-new-privileges",
            `-v ${tempDir}:/code:ro`,
            SANDBOX_IMAGE,
            "python /code/main.py",
          ].join(" \\\n    "),
          { timeout: EXEC_TIMEOUT_MS },
        );

        return {
          ok: true,
          stdout: stdout.slice(0, STDOUT_LIMIT),
          stderr: stderr.slice(0, STDERR_LIMIT),
        };
      } catch (error) {
        const execError = error as { code?: number; stdout?: string; stderr?: string; killed?: boolean; message: string };

        if (execError.killed) {
          return { ok: false, error: `Timeout: el código tardó más de ${EXEC_TIMEOUT_MS / 1000}s.` };
        }

        if (execError.code !== undefined) {
          return {
            ok: false,
            exitCode: execError.code,
            stdout: execError.stdout?.slice(0, STDOUT_LIMIT),
            stderr: execError.stderr?.slice(0, STDERR_LIMIT),
          };
        }

        return { ok: false, error: execError.message };
      } finally {
        await cleanup(containerName, tempDir);
      }
    },
  });
}

async function cleanup(containerName: string, tempDir: string | null): Promise<void> {
  try {
    await execAsync(`docker rm -f ${containerName}`);
  } catch {
    // El contenedor ya no existe (--rm lo elimina al terminar).
  }

  if (tempDir) {
    await rm(tempDir, { recursive: true, force: true }).catch(() => {});
  }
}