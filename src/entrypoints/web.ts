import { logger } from "../shared/logger.js";
import { createServer } from "node:http";
import { Readable } from "node:stream";
import { createWebApp } from "../web/index.js";
import type { IncomingMessage, ServerResponse } from "node:http";
import { createInfrastructureServices, type InfrastructureServices } from "../infrastructure/index.js";
import { closeDbPool } from "../db/client.js";

type WebEntrypointDeps = {
  loadLatestScrapeState: InfrastructureServices["scraper"]["loadLatestScrapeState"];
};

async function handleRequest(app: ReturnType<typeof createWebApp>, request: Request): Promise<globalThis.Response> {
  return app.fetch(request);
}

function createWebEntrypointDeps(): WebEntrypointDeps {
  const infrastructure = createInfrastructureServices();
  return {
    loadLatestScrapeState: infrastructure.scraper.loadLatestScrapeState,
  };
}

export function startWebEntrypoint(): void {
  const webDeps = createWebEntrypointDeps();
  const app = createWebApp(webDeps);
  const port = Number(process.env.PORT ?? "3000");

  const server = createServer((nodeReq: IncomingMessage, nodeRes: ServerResponse) => {
    const url = new URL(nodeReq.url ?? "/", `http://127.0.0.1:${port}`);
    const headers = new Headers();
    Object.entries(nodeReq.headers).forEach(([key, value]) => {
      if (value === undefined) {
      return;
    }
      if (Array.isArray(value)) {
        headers.set(key, value.join(","));
      } else {
        headers.set(key, value);
      }
    });

    const hasRequestBody = nodeReq.method !== "GET" && nodeReq.method !== "HEAD";
    const requestInit: RequestInit & { duplex?: "half" } = {
      method: nodeReq.method,
      headers,
    };
    if (hasRequestBody) {
      requestInit.body = Readable.toWeb(nodeReq) as ReadableStream;
      requestInit.duplex = "half";
    }

    const req = new Request(url, requestInit);

    void handleRequest(app, req)
      .then(async (upstream) => {
        nodeRes.statusCode = upstream.status;
        for (const [name, value] of upstream.headers.entries()) {
          nodeRes.setHeader(name, value);
        }
        const body = await upstream.text();
        nodeRes.end(body);
      })
      .catch((error) => {
        logger.error("web entrypoint request failed", {
          entrypoint: "web",
          path: url.pathname,
          error: error instanceof Error ? error.message : String(error),
        });
        nodeRes.statusCode = 500;
        nodeRes.end("internal error");
      });
  });

  server.listen(port, "0.0.0.0", () => {
    logger.info("web entrypoint started", {
      entrypoint: "web",
      port,
      host: "0.0.0.0",
      status: "listening",
    });
  });

  const shutdown = async (signal: string): Promise<void> => {
    logger.info(`received ${signal}, shutting down gracefully`, {
      entrypoint: "web",
    });
    server.close(async () => {
      await closeDbPool();
      logger.info("web server closed", { entrypoint: "web" });
      process.exit(0);
    });
    setTimeout(() => {
      logger.error("force shutdown after 10s timeout", { entrypoint: "web" });
      void closeDbPool();
      process.exit(1);
    }, 10000);
  };

  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));
}

startWebEntrypoint();
