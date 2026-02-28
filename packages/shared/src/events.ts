import type {
  AiDifficulty,
  AiGuessBatch,
  GameConfig,
  GuessFeedEntry,
  RoomState,
  RoundResult,
  RoundState,
  StrokeRecord,
  VisionLabel
} from "./types";

export type RoomCreateEvent = {
  type: "room:create";
  name: string;
};

export type RoomJoinEvent = {
  type: "room:join";
  roomCode: string;
  name: string;
};

export type RoomStartEvent = {
  type: "room:start";
};

export type StrokeStartEvent = {
  type: "canvas:stroke_start";
  x: number;
  y: number;
  color: string;
  width: number;
};

export type StrokePointEvent = {
  type: "canvas:stroke_point";
  x: number;
  y: number;
};

export type StrokeEndEvent = {
  type: "canvas:stroke_end";
};

export type GuessSubmitEvent = {
  type: "guess:submit";
  text: string;
  bucketIndex: number;
};

export type ResetScoreEvent = {
  type: "room:reset_score";
};

export type SetAiDifficultyEvent = {
  type: "room:set_ai_difficulty";
  difficulty: AiDifficulty;
};

export type ClientToServerEvent =
  | RoomCreateEvent
  | RoomJoinEvent
  | RoomStartEvent
  | StrokeStartEvent
  | StrokePointEvent
  | StrokeEndEvent
  | GuessSubmitEvent
  | ResetScoreEvent
  | SetAiDifficultyEvent;

export type RoomStateEvent = {
  type: "room:state";
  room: RoomState;
};

export type RoomErrorEvent = {
  type: "room:error";
  message: string;
};

export type GameStartedEvent = {
  type: "game:started";
  round: RoundState;
};

export type RoundPromptEvent = {
  type: "round:prompt";
  roundId: string;
  prompt: string;
};

export type RoundTimerEvent = {
  type: "round:timer";
  secondsRemaining: number;
  bucketIndex: number;
};

export type StrokeBroadcastEvent = {
  type: "canvas:stroke_broadcast";
  stroke: StrokeRecord;
};

export type GuessAcceptedEvent = {
  type: "guess:accepted";
  guess: GuessFeedEntry;
};

export type GuessRejectedEvent = {
  type: "guess:rejected";
  reason: string;
};

export type AiLabelsEvent = {
  type: "ai:labels";
  batch: AiGuessBatch;
};

export type AiSkippedEvent = {
  type: "ai:skipped";
  bucketIndex: number;
  reason: string;
};

export type RoundEndedEvent = {
  type: "round:ended";
  result: RoundResult;
};

export type GamePausedEvent = {
  type: "game:paused";
  reason: string;
};

export type ConfigEvent = {
  type: "config";
  config: GameConfig;
};

export type ServerToClientEvent =
  | RoomStateEvent
  | RoomErrorEvent
  | GameStartedEvent
  | RoundPromptEvent
  | RoundTimerEvent
  | StrokeBroadcastEvent
  | GuessAcceptedEvent
  | GuessRejectedEvent
  | AiLabelsEvent
  | AiSkippedEvent
  | RoundEndedEvent
  | GamePausedEvent
  | ConfigEvent;

export type ClientEventName = "client:event";
export type ServerEventName = "server:event";
