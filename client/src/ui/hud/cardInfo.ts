/** What the HUD says about a card wherever it is: its id, live numbers, status notes and keywords. */
import { atkOf, card, defOf, hasLeap, type GameState, type PlayerId } from "@sigilbound/engine";
import { keywordsOf } from "../../core/keywords.js";
import type { PopupSrc } from "../state.js";

export interface CardInfo {
  id: string;
  atk?: number;
  def?: number;
  damage?: number;
  notes: string[];
  /** KEYWORDS keys to explain, card text first, then anything the board gave it (Leap from a crest...). */
  keys: string[];
}

export function cardInfo(src: PopupSrc, s: GameState | null | undefined, me: PlayerId): CardInfo | null {
  const opp: PlayerId = me === 0 ? 1 : 0;
  if (src.kind === "card") return { id: src.id, notes: src.note ? [src.note] : [], keys: keywordsOf(src.id) };
  if (!s) return null;
  if (src.kind === "hand") {
    const id = s.players[me].hand.find((c) => c.uid === src.uid)?.id;
    if (!id) return null;
    const notes: string[] = [];
    let atk: number | undefined;
    if (card(id).rush && s.players[me].sigils.length <= 3) {
      atk = card(id).atk + 2;
      notes.push("Rush is on: +2 ATK while you have 3 or fewer Sigils");
    }
    return { id, atk, notes, keys: keywordsOf(id) };
  }
  if (src.kind === "spell") {
    const sp = s.players[me].spells[src.lane];
    if (!sp) return null;
    return {
      id: sp.id, keys: keywordsOf(sp.id),
      notes: [sp.setTurn < s.turn ? "Set face down. You can flip it now (free)." : "Set this turn: flip it on a later turn."],
    };
  }
  const p: PlayerId = src.kind === "monster" ? me : opp;
  const m = s.players[p].monsters[src.lane];
  if (!m) return null;
  const notes: string[] = [m.position === "atk" ? "Attack position" : "Defense position"];
  if (m.damage) notes.push(`${m.damage} damage this turn`);
  if (m.entered === s.turn) notes.push("entered this turn");
  if (m.attacked) notes.push("has attacked");
  if (m.atkPerm || m.defPerm) notes.push("Awakened");
  const def = card(m.id);
  if (def.guard) notes.push(m.position === "def" ? "Guard is on" : "Guard is off (attack position)");
  if (def.rush) notes.push(s.players[p].sigils.length <= 3 ? "Rush is on (+2 ATK)" : "Rush is off (4+ Sigils)");
  const keys = keywordsOf(m.id);
  if (hasLeap(s, src.lane, m) && !keys.includes("leap")) keys.push("leap");
  return { id: m.id, atk: atkOf(s, p, src.lane), def: defOf(s, p, src.lane), damage: m.damage, notes, keys };
}
