import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import cors from "cors";
import express from "express";
import { appConfig, publicConfig } from "./config.js";
import { logger } from "./logger.js";
import { GameServer } from "./services/GameServer.js";
import type { AiProvider } from "./services/AiProvider.js";
import { GoogleVisionProvider } from "./services/GoogleVisionProvider.js";
import { LocalDoodleProvider } from "./services/LocalDoodleProvider.js";

const app = express();
app.use(
  cors({
    origin: getCorsOrigin,
    credentials: true
  })
);
app.use(express.json());

app.get("/health", (_request, response) => {
  response.json({
    status: "ok",
    uptimeSeconds: Math.round(process.uptime()),
    timestamp: Date.now(),
    environment: appConfig.NODE_ENV
  });
});

app.get("/config", (_request, response) => {
  response.json(publicConfig);
});

const webBuildPath = resolveWebBuildPath();
if (webBuildPath) {
  app.use(express.static(webBuildPath));
  app.use((_request, response) => {
    response.sendFile(path.join(webBuildPath, "index.html"));
  });
}

const server = http.createServer(app);
const aiProvider = createAiProvider();
const gameServer = new GameServer(server, aiProvider);

gameServer.register();

setInterval(() => {
  gameServer.cleanupIdleRooms();
}, 5 * 60 * 1_000);

server.listen(appConfig.PORT, () => {
  logger.info("server started", {
    port: appConfig.PORT,
    environment: appConfig.NODE_ENV,
    aiProvider: aiProvider.name,
    visionAuthMode: appConfig.GOOGLE_APPLICATION_CREDENTIALS
      ? "service_account"
      : appConfig.GOOGLE_VISION_API_KEY
        ? "api_key"
        : "disabled"
  });
});

function resolveWebBuildPath(): string | null {
  const currentDir = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    path.resolve(currentDir, "../../web/dist"),
    path.resolve(currentDir, "../../../apps/web/dist"),
    path.resolve(process.cwd(), "../web/dist"),
    path.resolve(process.cwd(), "../../apps/web/dist")
  ];

  return candidates.find((candidate) => fs.existsSync(candidate)) ?? null;
}

function createAiProvider(): AiProvider {
  if (appConfig.AI_PROVIDER === "local_doodle") {
    return new LocalDoodleProvider({
      serviceUrl: appConfig.DOODLE_SERVICE_URL,
      timeoutMs: appConfig.VISION_TIMEOUT_MS,
      maxLabels: appConfig.MAX_VISION_LABELS
    });
  }

  return new GoogleVisionProvider({
    maxLabels: appConfig.MAX_VISION_LABELS,
    timeoutMs: appConfig.VISION_TIMEOUT_MS,
    credentialsPath: appConfig.GOOGLE_APPLICATION_CREDENTIALS,
    apiKey: appConfig.GOOGLE_VISION_API_KEY
  });
}

function getCorsOrigin(origin: string | undefined, callback: (error: Error | null, allow?: boolean | string) => void): void {
  if (!origin || appConfig.CORS_ORIGINS.length === 0) {
    callback(null, true);
    return;
  }

  const normalizedOrigin = origin.replace(/\/+$/, "");
  callback(null, appConfig.CORS_ORIGINS.includes(normalizedOrigin));
}
