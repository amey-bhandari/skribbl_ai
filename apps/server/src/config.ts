import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { z } from "zod";
import {
  CANVAS_SIZE,
  GUESS_INTERVAL_SECONDS,
  INTERMISSION_SECONDS,
  MAX_PLAYERS,
  MAX_VISION_LABELS,
  MIN_PLAYERS,
  ROOM_IDLE_TTL_MINUTES,
  ROUND_DURATION_SECONDS,
  VISION_MIN_CONFIDENCE,
  VISION_TIMEOUT_MS,
  type GameConfig
} from "@skribbl-ai/shared";

loadEnvFiles();

const envSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    PORT: z.coerce.number().int().positive().default(3001),
    CORS_ORIGINS: z.string().optional(),
    ROUND_DURATION_SECONDS: z.coerce.number().int().min(30).default(ROUND_DURATION_SECONDS),
    GUESS_INTERVAL_SECONDS: z.coerce.number().int().min(5).default(GUESS_INTERVAL_SECONDS),
    INTERMISSION_SECONDS: z.coerce.number().int().min(3).default(INTERMISSION_SECONDS),
    ROOM_IDLE_TTL_MINUTES: z.coerce.number().int().min(5).default(ROOM_IDLE_TTL_MINUTES),
    VISION_MIN_CONFIDENCE: z.coerce.number().min(0).max(1).default(VISION_MIN_CONFIDENCE),
    MAX_VISION_LABELS: z.coerce.number().int().min(1).max(10).default(MAX_VISION_LABELS),
    VISION_TIMEOUT_MS: z.coerce.number().int().min(1_000).default(VISION_TIMEOUT_MS),
    AI_PROVIDER: z.enum(["google_vision", "local_doodle"]).optional(),
    GOOGLE_APPLICATION_CREDENTIALS: z.string().optional(),
    GOOGLE_VISION_API_KEY: z.string().optional()
  });

const parsedEnv = envSchema.parse(process.env);
const aiProvider =
  parsedEnv.AI_PROVIDER ??
  (parsedEnv.GOOGLE_APPLICATION_CREDENTIALS || parsedEnv.GOOGLE_VISION_API_KEY ? "google_vision" : "local_doodle");

export const appConfig = {
  ...parsedEnv,
  AI_PROVIDER: aiProvider,
  CORS_ORIGINS: parseCorsOrigins(parsedEnv.CORS_ORIGINS),
  MIN_PLAYERS,
  MAX_PLAYERS,
  CANVAS_SIZE
};

export const publicConfig: GameConfig = {
  roundDurationSeconds: appConfig.ROUND_DURATION_SECONDS,
  guessIntervalSeconds: appConfig.GUESS_INTERVAL_SECONDS,
  intermissionSeconds: appConfig.INTERMISSION_SECONDS,
  minPlayers: MIN_PLAYERS,
  maxPlayers: MAX_PLAYERS,
  canvasSize: CANVAS_SIZE,
  visionMinConfidence: appConfig.VISION_MIN_CONFIDENCE,
  maxVisionLabels: appConfig.MAX_VISION_LABELS
};

function loadEnvFiles(): void {
  const currentDir = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    path.resolve(currentDir, "../../../.env"),
    path.resolve(currentDir, "../../.env"),
    path.resolve(process.cwd(), ".env")
  ];

  for (const envPath of candidates) {
    if (!fs.existsSync(envPath)) {
      continue;
    }

    dotenv.config({
      path: envPath,
      override: false
    });
  }
}

function parseCorsOrigins(value: string | undefined): string[] {
  if (!value) {
    return [];
  }

  return value
    .split(",")
    .map((origin) => origin.trim().replace(/\/+$/, ""))
    .filter(Boolean);
}
