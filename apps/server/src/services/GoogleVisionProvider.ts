import { ImageAnnotatorClient } from "@google-cloud/vision";
import { MAX_VISION_LABELS, normalizeGuess, type VisionLabel } from "@skribbl-ai/shared";
import type { AiProvider, AiProviderInput } from "./AiProvider.js";

type GoogleVisionProviderOptions = {
  maxLabels: number;
  timeoutMs: number;
  apiKey?: string;
  credentialsPath?: string;
};

export class GoogleVisionProvider implements AiProvider {
  readonly configured: boolean;
  readonly name = "google_vision" as const;
  private readonly client: ImageAnnotatorClient | null;
  private readonly apiKey: string | null;

  constructor(private readonly options: GoogleVisionProviderOptions) {
    this.apiKey = options.apiKey?.trim() ? options.apiKey.trim() : null;
    this.configured = Boolean(options.credentialsPath || this.apiKey);
    this.client = options.credentialsPath ? new ImageAnnotatorClient() : null;
  }

  async detectLabels({ imageBuffer }: AiProviderInput): Promise<VisionLabel[]> {
    if (this.client) {
      const request = this.client.annotateImage({
        image: {
          content: imageBuffer
        },
        features: [
          {
            type: "LABEL_DETECTION",
            maxResults: this.options.maxLabels ?? MAX_VISION_LABELS
          }
        ]
      });

      const [response] = await withTimeout(request, this.options.timeoutMs);
      return parseVisionLabels(response.labelAnnotations, this.options.maxLabels);
    }

    if (!this.apiKey) {
      throw new Error("Google Vision is not configured");
    }

    const response = await withTimeout(
      fetch(`https://vision.googleapis.com/v1/images:annotate?key=${encodeURIComponent(this.apiKey)}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          requests: [
            {
              image: {
                content: imageBuffer.toString("base64")
              },
              features: [
                {
                  type: "LABEL_DETECTION",
                  maxResults: this.options.maxLabels ?? MAX_VISION_LABELS
                }
              ]
            }
          ]
        })
      }),
      this.options.timeoutMs
    );

    if (!response.ok) {
      const responseText = await response.text();
      throw new Error(
        `Vision request failed with status ${response.status}: ${truncateForLog(responseText || "<empty body>")}`
      );
    }

    const body = (await response.json()) as GoogleVisionRestResponse;
    const errorMessage = body.responses?.[0]?.error?.message;
    if (errorMessage) {
      throw new Error(errorMessage);
    }

    return parseVisionLabels(body.responses?.[0]?.labelAnnotations, this.options.maxLabels);
  }
}

type GoogleVisionAnnotation = {
  description?: string | null;
  score?: number | null;
};

type GoogleVisionRestResponse = {
  responses?: Array<{
    labelAnnotations?: GoogleVisionAnnotation[];
    error?: {
      message?: string;
    };
  }>;
};

export function parseVisionLabels(
  labelAnnotations: GoogleVisionAnnotation[] | null | undefined,
  maxLabels: number
): VisionLabel[] {
  return (labelAnnotations ?? []).slice(0, maxLabels).flatMap((annotation) => {
    const label = annotation.description?.trim();
    if (!label) {
      return [];
    }

    return [
      {
        label,
        confidence: Number(annotation.score ?? 0),
        normalized: normalizeGuess(label)
      }
    ];
  });
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: NodeJS.Timeout | null = null;
  try {
    return await Promise.race<T>([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error("Vision request timed out")), timeoutMs);
      })
    ]);
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
}

function truncateForLog(value: string, maxLength = 2_000): string {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, maxLength)}... [truncated]`;
}
