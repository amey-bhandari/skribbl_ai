import { normalizeGuess, type VisionLabel } from "@skribbl-ai/shared";
import type { AiProvider, AiProviderInput } from "./AiProvider.js";

type LocalDoodleProviderOptions = {
  serviceUrl: string;
  timeoutMs: number;
  maxLabels: number;
};

type LocalDoodleResponse = {
  labels?: Array<{
    label?: string;
    confidence?: number;
  }>;
};

export class LocalDoodleProvider implements AiProvider {
  readonly configured: boolean;
  readonly name = "local_doodle" as const;

  constructor(private readonly options: LocalDoodleProviderOptions) {
    this.configured = Boolean(options.serviceUrl.trim());
  }

  async detectLabels(input: AiProviderInput): Promise<VisionLabel[]> {
    if (!this.configured) {
      throw new Error("Local doodle classifier is not configured");
    }

    const response = await withTimeout(
      fetch(buildPredictUrl(this.options.serviceUrl), {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          topK: this.options.maxLabels,
          strokes: input.strokes,
          candidates: input.candidates.map((candidate) => ({
            label: candidate.answer,
            aliases: candidate.aliases
          }))
        })
      }).catch((error: unknown) => {
        throw new Error(formatFetchError(error));
      }),
      this.options.timeoutMs
    );

    if (!response.ok) {
      const responseText = await response.text();
      throw new Error(
        `Local doodle request failed with status ${response.status}: ${truncateForLog(responseText || "<empty body>")}`
      );
    }

    const body = (await response.json()) as LocalDoodleResponse;
    return (body.labels ?? []).flatMap((entry) => {
      const label = entry.label?.trim();
      if (!label) {
        return [];
      }

      return [
        {
          label,
          confidence: Number(entry.confidence ?? 0),
          normalized: normalizeGuess(label)
        }
      ];
    });
  }
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: NodeJS.Timeout | null = null;
  try {
    return await Promise.race<T>([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error("Local doodle request timed out")), timeoutMs);
      })
    ]);
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
}

function buildPredictUrl(serviceUrl: string): string {
  const normalizedUrl = serviceUrl.endsWith("/") ? serviceUrl.slice(0, -1) : serviceUrl;
  return `${normalizedUrl}/predict`;
}

function truncateForLog(value: string, maxLength = 2_000): string {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, maxLength)}... [truncated]`;
}

function formatFetchError(error: unknown): string {
  if (!(error instanceof Error)) {
    return "Local doodle request failed";
  }

  const causeMessage =
    typeof error.cause === "object" &&
    error.cause &&
    "message" in error.cause &&
    typeof error.cause.message === "string"
      ? error.cause.message
      : null;

  return causeMessage ? `${error.message}: ${causeMessage}` : error.message;
}
