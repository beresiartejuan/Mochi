import { request } from "node:https";
import { URL } from "node:url";

export function createIPv4Fetch(): typeof fetch {
  return (input, init) =>
    new Promise((resolve, reject) => {
      const url = new URL(input as string);
      const body = init?.body;
      const payload =
        typeof body === "string"
          ? body
          : body instanceof URLSearchParams
            ? body.toString()
            : body !== undefined && body !== null
              ? JSON.stringify(body)
              : undefined;

      const req = request(
        {
          hostname: url.hostname,
          port: url.port || 443,
          path: url.pathname + url.search,
          method: init?.method || "GET",
          headers: init?.headers as Record<string, string> | undefined,
          family: 4,
        },
        (res) => {
          const chunks: Buffer[] = [];
          res.on("data", (chunk) => chunks.push(chunk));
          res.on("end", () => {
            const bodyBuffer = Buffer.concat(chunks);
            const headers = Object.entries(res.headers).flatMap(([key, value]) => {
              if (value === undefined) return [];
              return Array.isArray(value)
                ? value.map((v) => [key, v] as [string, string])
                : ([[key, value]] as [string, string][]);
            });

            resolve(
              new Response(bodyBuffer, {
                status: res.statusCode ?? 200,
                statusText: res.statusMessage ?? "OK",
                headers,
              }),
            );
          });
        },
      );

      req.on("error", reject);

      if (payload) {
        req.write(payload);
      }
      req.end();
    });
}
