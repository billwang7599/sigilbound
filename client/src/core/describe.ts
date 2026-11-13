/** Words for actions (menus) and events (the log). */
import { card, CRESTS, FIELDS, type Action, type GameEvent, type GameState, type PlayerId } from "@sigilbound/engine";

export const LANE_NAMES = ["Left", "Center", "Right"];
const name = (id: string | undefined) => (id ? card(id).name : "a card");

function handCard(s: GameState, p: PlayerId, uid: number): string {
  return s.players[p].hand.find((c) => c.uid === uid)?.id ?? "hidden";
}

export function describeAction(a: Action, s: GameState, me: PlayerId): string {
  const pl = s.players[me];
  const opp = s.players[me === 0 ? 1 : 0];
  switch (a.type) {
    case "mulligan": return a.uids.length ? `Mulligan ${a.uids.length}` : "Keep hand";
    case "bind": return "Bind as a Sigil";
    case "summon": {
      const old = pl.monsters[a.lane];
      let t = `Summon ${LANE_NAMES[a.lane]} · ${a.position === "atk" ? "Attack" : "Defense"}`;
      if (old) t += ` (replaces ${name(old.id)})`;
      if (a.targets?.length) t += ` · return ${a.targets.map((l) => name(opp.monsters[l]?.id)).join(" + ")}`;
      return t;
    }
    case "cast": {
      if (!a.target) return `Cast ${name(handCard(s, me, a.uid))}`;
      const m = s.players[a.target.side].monsters[a.target.lane];
      return `Cast on ${a.target.side === me ? "your" : "enemy"} ${name(m?.id)}`;
    }
    case "set": return `Set face down · ${LANE_NAMES[a.lane]}`;
    case "flip": {
      const id = pl.spells[a.lane]?.id;
      if (a.uid !== undefined) {
        const dead = pl.discard.find((c) => c.uid === a.uid);
        return `Flip: revive ${name(dead?.id)} · ${a.position === "atk" ? "Attack" : "Defense"}`;
      }
      return `Flip ${name(id)}`;
    }
    case "crest": {
      const c = CRESTS[pl.crest];
      if (pl.crest === "gale") return `Gale: move ${LANE_NAMES[a.lane!]} → ${LANE_NAMES[a.to!]} (2 Sigils)`;
      if (a.lane === undefined) return `${c.name}: ${c.text} (2 Sigils)`;
      return `${c.name} crest on ${name(pl.monsters[a.lane]?.id)} (2 Sigils)`;
    }
    case "move": {
      const swap = !!pl.monsters[a.to];
      return `${swap ? "Swap" : "Move"} ${LANE_NAMES[a.from]} ${swap ? "↔" : "→"} ${LANE_NAMES[a.to]} (1 Sigil)`;
    }
    case "position": {
      const m = pl.monsters[a.lane];
      return m?.position === "atk" ? "Switch to Defense" : "Switch to Attack";
    }
    case "attackStep": return "Go to Attack";
    case "attack": {
      if (a.target.kind === "direct") return "Attack directly";
      return `Attack ${name(opp.monsters[a.target.lane]?.id)} (${LANE_NAMES[a.target.lane]})`;
    }
    case "endTurn": return "End turn";
    case "ambush": return `Ambush: ${name(handCard(s, me, a.uid))}`;
    case "pass": return "Pass";
    case "concede": return "Concede";
  }
}

export function describeEvent(e: GameEvent, me: PlayerId): string | null {
  const who = (p: PlayerId) => (p === me ? "You" : "Rival");
  const whose = (p: PlayerId) => (p === me ? "your" : "Rival's");
  switch (e.t) {
    case "start": {
      const place = e.fields[1] ? ` The place: ${FIELDS[e.fields[1]].name}.` : "";
      return `Duel begins. ${who(e.first)} go${e.first === me ? "" : "es"} first.${place}`;
    }
    case "mulligan": return e.count ? `${who(e.p)} mulligan${e.p === me ? "" : "s"} ${e.count}.` : null;
    case "turn": return `— Turn ${e.turn}: ${e.p === me ? "your" : "Rival's"} turn —`;
    case "draw": return e.p === me && e.card ? `You draw ${name(e.card)}.` : null;
    case "burnDraw": return `${who(e.p)} can't hold more: ${name(e.card)} is discarded.`;
    case "emptyDeck": return `${who(e.p)} can't draw and lose${e.p === me ? "" : "s"} 2 LP.`;
    case "bind": return e.p === me ? `You bind ${name(e.card)} as a Sigil.` : "Rival binds a Sigil.";
    case "summon": return `${who(e.p)} summon${e.p === me ? "" : "s"} ${name(e.card)} (${LANE_NAMES[e.lane]}, ${e.position === "atk" ? "attack" : "defense"})${e.awakened ? " — Awakened!" : ""}.`;
    case "replace": return `${name(e.card)} is replaced.`;
    case "position": return `${whose(e.p)} ${LANE_NAMES[e.lane]} monster switches to ${e.position === "atk" ? "attack" : "defense"}.`;
    case "move": return `${who(e.p)} ${e.swap ? "swap" : "move"}${e.p === me ? "" : "s"} ${LANE_NAMES[e.from]} ${e.swap ? "↔" : "→"} ${LANE_NAMES[e.to]}.`;
    case "cast": return `${who(e.p)} cast${e.p === me ? "" : "s"} ${name(e.card)}.`;
    case "set": return e.p === me ? `You set ${name(e.card)} (${LANE_NAMES[e.lane]}).` : `Rival sets a spell face down (${LANE_NAMES[e.lane]}).`;
    case "flip": return `${who(e.p)} flip${e.p === me ? "" : "s"} ${name(e.card)}!`;
    case "crest": return `${who(e.p)} use${e.p === me ? "" : "s"} the ${CRESTS[e.crest].name} crest.`;
    case "attackStep": return `${who(e.p)} attack${e.p === me ? "" : "s"}!`;
    case "attack": return `${whose(e.p)} ${LANE_NAMES[e.lane]} monster (${e.atk} ATK) attacks ${e.target.kind === "direct" ? "directly" : `the ${LANE_NAMES[e.target.lane]} lane`}.`;
    case "window": return null;
    case "ambush": return `Ambush! ${who(e.p)} play${e.p === me ? "" : "s"} ${name(e.card)}.`;
    case "pass": return null;
    case "cancelled": return "The attack is cancelled.";
    case "lp": return `${who(e.p)} ${e.delta < 0 ? "lose" : "gain"}${e.p === me ? "" : "s"} ${Math.abs(e.delta)} LP (${e.reason}) → ${e.lp}.`;
    case "damage": return `${whose(e.p)} ${LANE_NAMES[e.lane]} defender takes ${e.amount} (total ${e.total}).`;
    case "destroyed": return `${whose(e.p)} ${name(e.card)} is destroyed.`;
    case "bounce": return `${whose(e.p)} ${name(e.card)} returns to hand.`;
    case "buff": {
      const parts = [e.atk ? `${e.atk > 0 ? "+" : ""}${e.atk} ATK` : "", e.def ? `${e.def > 0 ? "+" : ""}${e.def} DEF` : ""].filter(Boolean);
      return `${whose(e.p)} ${LANE_NAMES[e.lane]} monster gets ${parts.join(" ")}.`;
    }
    case "revive": return `${who(e.p)} revive${e.p === me ? "" : "s"} ${name(e.card)}.`;
    case "restDraw": return `${who(e.p)} rest${e.p === me ? "" : "s"} and draw${e.p === me ? "" : "s"} an extra card.`;
    case "endTurn": return null;
    case "gameOver": return e.winner === me ? "You win the duel!" : "Rival wins the duel.";
  }
}
