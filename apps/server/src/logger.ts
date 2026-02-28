type LogValue = string | number | boolean | null | undefined | Record<string, unknown>;

function formatMeta(meta?: Record<string, LogValue>): string {
  if (!meta) {
    return "";
  }

  return ` ${JSON.stringify(meta)}`;
}

export const logger = {
  info(message: string, meta?: Record<string, LogValue>) {
    console.log(`[info] ${message}${formatMeta(meta)}`);
  },
  warn(message: string, meta?: Record<string, LogValue>) {
    console.warn(`[warn] ${message}${formatMeta(meta)}`);
  },
  error(message: string, meta?: Record<string, LogValue>) {
    console.error(`[error] ${message}${formatMeta(meta)}`);
  }
};

