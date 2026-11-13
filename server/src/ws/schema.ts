/** Every client message passes these schemas. No message can claim a result: it only names an action. */
import { z } from "zod";

const lane = z.number().int().min(0).max(2);
const uid = z.number().int().min(1).max(1_000_000);
const position = z.enum(["atk", "def"]);
const target = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("direct") }).strict(),
  z.object({ kind: z.literal("monster"), lane }).strict(),
]);

export const actionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("mulligan"), uids: z.array(uid).max(7) }).strict(),
  z.object({ type: z.literal("bind"), uid }).strict(),
  z.object({ type: z.literal("summon"), uid, lane, position, targets: z.array(lane).max(2).optional() }).strict(),
  z.object({ type: z.literal("position"), lane }).strict(),
  z.object({ type: z.literal("cast"), uid, target: z.object({ side: z.union([z.literal(0), z.literal(1)]), lane }).strict().optional() }).strict(),
  z.object({ type: z.literal("set"), uid, lane }).strict(),
  z.object({ type: z.literal("flip"), lane, uid: uid.optional(), position: position.optional() }).strict(),
  z.object({ type: z.literal("crest"), lane: lane.optional(), to: lane.optional() }).strict(),
  z.object({ type: z.literal("move"), from: lane, to: lane }).strict(),
  z.object({ type: z.literal("attackStep") }).strict(),
  z.object({ type: z.literal("attack"), lane, target }).strict(),
  z.object({ type: z.literal("endTurn") }).strict(),
  z.object({ type: z.literal("ambush"), uid }).strict(),
  z.object({ type: z.literal("pass") }).strict(),
  z.object({ type: z.literal("concede") }).strict(),
]);

const id = z.string().min(1).max(64);

export const clientMessageSchema = z.discriminatedUnion("t", [
  z.object({ t: z.literal("new"), deck: z.enum(["ember_rush", "deepwall"]) }).strict(),
  z.object({ t: z.literal("resume"), duelId: id, token: id }).strict(),
  z.object({ t: z.literal("act"), duelId: id, action: actionSchema }).strict(),
]);
