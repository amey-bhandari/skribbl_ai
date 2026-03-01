import { logger } from "../logger.js";
import type { AiProvider, AiProviderInput } from "./AiProvider.js";
import { QuickDrawPrototypeMatcher } from "./QuickDrawPrototypeMatcher.js";

type LocalDoodleProviderOptions = {
  maxLabels: number;
};

export class LocalDoodleProvider implements AiProvider {
  readonly name = "local_doodle" as const;
  readonly configured: boolean;
  private readonly focusedMatcher: QuickDrawPrototypeMatcher | null;
  private readonly fullMatcher: QuickDrawPrototypeMatcher | null;
  private readonly configurationError: string | null;

  constructor(private readonly options: LocalDoodleProviderOptions) {
    try {
      this.focusedMatcher = new QuickDrawPrototypeMatcher("quickdraw_prototypes.json");
      this.fullMatcher = new QuickDrawPrototypeMatcher("quickdraw_prototypes_full.json");
      this.configured = true;
      this.configurationError = null;
    } catch (error) {
      this.focusedMatcher = null;
      this.fullMatcher = null;
      this.configured = false;
      this.configurationError = formatError(error);
      logger.error("local doodle provider unavailable", {
        error: this.configurationError
      });
    }
  }

  async detectLabels(input: AiProviderInput) {
    if (!this.configured || !this.focusedMatcher || !this.fullMatcher) {
      throw new Error(
        this.configurationError
          ? `Local doodle classifier is not configured: ${this.configurationError}`
          : "Local doodle classifier is not configured"
      );
    }

    logger.info("local doodle request started", {
      difficulty: input.aiDifficulty,
      strokeCount: input.strokes.length,
      candidateCount: input.candidates.length
    });

    const matcher = input.aiDifficulty === "easy" ? this.fullMatcher : this.focusedMatcher;
    const labels = matcher.predict(
      input.strokes,
      this.options.maxLabels,
      input.aiDifficulty === "easy" ? null : input.candidates.map((candidate) => candidate.answer)
    );

    logger.info("local doodle request completed", {
      difficulty: input.aiDifficulty,
      labelCount: labels.length,
      topLabel: labels[0]?.label
    });

    return labels;
  }

  getDebugStatus(): Record<string, unknown> {
    if (!this.configured || !this.focusedMatcher || !this.fullMatcher) {
      return {
        status: "error",
        backend: "quickdraw_prototype_v1",
        mode: "in_process",
        error: this.configurationError ?? "Local doodle classifier is not configured"
      };
    }

    return {
      status: "ok",
      backend: "quickdraw_prototype_v1",
      mode: "in_process",
      difficulties: {
        hard: this.focusedMatcher.getStatus(),
        easy: this.fullMatcher.getStatus()
      }
    };
  }
}

function formatError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return "Unknown error";
}
