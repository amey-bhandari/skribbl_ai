type TimerHandlers = {
  onTick: (secondsRemaining: number, bucketIndex: number) => Promise<void> | void;
  onCheckpoint: (bucketIndex: number) => Promise<void> | void;
  onTimeout: () => Promise<void> | void;
};

type TimerTask = {
  interval: NodeJS.Timeout;
  active: boolean;
  running: boolean;
  lastElapsedSecond: number;
  nextCheckpointSecond: number;
};

export class TimerEngine {
  private readonly tasks = new Map<string, TimerTask>();

  startRound(
    roomCode: string,
    startedAt: number,
    roundDurationSeconds: number,
    guessIntervalSeconds: number,
    handlers: TimerHandlers
  ): void {
    this.stopRound(roomCode);

    const task: TimerTask = {
      interval: setInterval(() => {
        void tick();
      }, 250),
      active: true,
      running: false,
      lastElapsedSecond: -1,
      nextCheckpointSecond: guessIntervalSeconds
    };

    const tick = async (): Promise<void> => {
      if (!task.active || task.running) {
        return;
      }

      task.running = true;

      try {
        const elapsedSeconds = Math.min(roundDurationSeconds, Math.floor((Date.now() - startedAt) / 1_000));

        while (task.nextCheckpointSecond < roundDurationSeconds && elapsedSeconds >= task.nextCheckpointSecond) {
          const bucketIndex = Math.max(0, Math.floor(task.nextCheckpointSecond / guessIntervalSeconds) - 1);
          await handlers.onCheckpoint(bucketIndex);
          if (!task.active) {
            return;
          }
          task.nextCheckpointSecond += guessIntervalSeconds;
        }

        if (elapsedSeconds !== task.lastElapsedSecond) {
          task.lastElapsedSecond = elapsedSeconds;
          const secondsRemaining = Math.max(0, roundDurationSeconds - elapsedSeconds);
          const bucketIndex = Math.min(
            Math.floor((roundDurationSeconds - 1) / guessIntervalSeconds),
            Math.floor(elapsedSeconds / guessIntervalSeconds)
          );
          await handlers.onTick(secondsRemaining, bucketIndex);
        }

        if (elapsedSeconds >= roundDurationSeconds) {
          task.active = false;
          clearInterval(task.interval);
          this.tasks.delete(roomCode);
          await handlers.onTimeout();
        }
      } finally {
        task.running = false;
      }
    };

    this.tasks.set(roomCode, task);
    void tick();
  }

  stopRound(roomCode: string): void {
    const existing = this.tasks.get(roomCode);
    if (!existing) {
      return;
    }

    existing.active = false;
    clearInterval(existing.interval);
    this.tasks.delete(roomCode);
  }
}
