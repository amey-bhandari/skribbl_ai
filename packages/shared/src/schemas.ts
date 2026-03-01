import { z } from "zod";
import { CANVAS_SIZE, MAX_GUESS_LENGTH } from "./config";

const aiDifficultySchema = z.union([z.literal("easy"), z.literal("hard")]);
const gameModeSchema = z.union([z.literal("humans_vs_humans"), z.literal("humans_vs_ai")]);

export const pointSchema = z.object({
  x: z.number().min(0).max(CANVAS_SIZE),
  y: z.number().min(0).max(CANVAS_SIZE)
});

export const roomCodeSchema = z
  .string()
  .trim()
  .min(4)
  .max(8)
  .regex(/^[A-Z0-9]+$/);

export const playerNameSchema = z.string().trim().min(2).max(24);

export const clientEventSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("room:create"),
    name: playerNameSchema
  }),
  z.object({
    type: z.literal("room:join"),
    roomCode: roomCodeSchema,
    name: playerNameSchema
  }),
  z.object({
    type: z.literal("room:start")
  }),
  z.object({
    type: z.literal("canvas:stroke_start"),
    x: pointSchema.shape.x,
    y: pointSchema.shape.y,
    color: z.string().trim().min(4).max(16),
    width: z.number().min(2).max(32)
  }),
  z.object({
    type: z.literal("canvas:stroke_point"),
    x: pointSchema.shape.x,
    y: pointSchema.shape.y
  }),
  z.object({
    type: z.literal("canvas:stroke_end")
  }),
  z.object({
    type: z.literal("guess:submit"),
    text: z.string().trim().min(1).max(MAX_GUESS_LENGTH),
    bucketIndex: z.number().int().min(0).max(8)
  }),
  z.object({
    type: z.literal("room:reset_score")
  }),
  z.object({
    type: z.literal("room:set_ai_difficulty"),
    difficulty: aiDifficultySchema
  }),
  z.object({
    type: z.literal("room:set_game_mode"),
    gameMode: gameModeSchema
  })
]);

export type ClientEventInput = z.infer<typeof clientEventSchema>;
