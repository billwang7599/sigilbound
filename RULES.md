# Sigilbound Rules — draft v0.6 (paper prototype)

All numbers are starting guesses to test on paper. Names in the sample cards are placeholders until the theme is set.
Everything here must be playable at a real table with cards, one life tracker per player, and a few small dice.

**Changes from v0.5:**
- New section 12, **Game phases and deck types:** your Sigil count is the clock (early 1–3, mid 4–5, late 6+), and
  decks lean toward one phase: Aggro, Midrange or Control.
- Two new first-set keywords: **Awaken N** (bonus if you have N+ Sigils when you play it) and **Rush** (+2 ATK while
  you have 3 or fewer Sigils).
- Replacing your own monster was already allowed (section 7), so no rule change there.
- Card design guide: Rush and Awaken cost 2 points, plus a cost-tier guideline (cheap cards lean ATK, 6-cost cards
  trade 2–4 points for an effect).
- Crests now list the deck type they lean toward.
- Sample cards rebuilt as two full 30-card decks: **Ember Rush (Aggro)** vs **Deepwall (Control)**. Every card shows
  its budget. New cards: Flarekit, Blazerunner, Kindlewing, Mudling, Deepwater Colossus, Abyssal Leviathan, Firebolt.
  Elder Treant reworked. Cards not in either deck were cut from the sample list.
- Playtest list adds: control with no way to win, aggro too strong at 20 LP, midrange best at everything.

**Changes from v0.4 to v0.5:**
- **Rest draw:** if you don't bind a card during your turn, draw 1 card at the end of it. Fixes hands running dry in
  the midgame (Lorcana's main complaint) and makes binding a real choice late in the game.
- **First set uses only Guard and Leap.** Swift, Trample and Sturdy stay in the rules as later-set keywords (marked
  below); sample cards that had them are reworked. The campaign introduces the rest later.
- Playtest list now tracks game length in turns, with a set order of fixes if games end too fast.

**Changes from v0.3 to v0.4:**
- Attacking a defense-position monster now deals damage that **adds up for the rest of the turn**. Several attacks can
  bring down a wall that no single attack could. All damage clears at the end of each turn.
- Attacking a defense-position monster never costs the attacker LP (no recoil).
- Attack-vs-attack battles are unchanged: settled one at a time, nothing carries over.
- **Guard** now pulls attacks from its own lane and adjacent lanes, and only works in defense position. A Guard in the
  center pulls from all 3.
- Trample deals whatever goes past the defender's *remaining* DEF.
- Re-tuned Pebblekin, Boulderhorn and Brace for the new Guard and damage rules.

**Changes from v0.2 to v0.3:**
- Battle now uses Yu-Gi-Oh math: monsters have ATK and DEF and an attack or defense position. Attacking is optional.
- Monsters no longer keep damage, so the damage dice and monster healing are gone.
- There are three spell types: Quick, Prepared and Ambush.
- Triggers are back ("when destroyed", "when attacked" and so on), each limited to once per card per turn.
- The ban on ramp, cost reduction and extra summons is replaced by limits (section 11).
- Every effect uses one of five fixed ranges.
- New keyword: Guard. Crests are re-tuned for the new battle system.

## 1. Winning

- **Each player starts with 20 Life Points (LP).** Reduce your opponent to 0 and you win.
- **LP is the only win condition.** Running out of cards doesn't make you lose. It costs LP instead (section 7).
- **Both players reach 0 at the same time:** the player whose turn it is wins.
- You can concede at any time.

## 2. What you need

- **Deck:** exactly 30 cards (monsters and spells), at most 2 copies of any card.
- **Home field:** 1 field card, kept outside the deck.
- **Crest:** 1 crest card, kept outside the deck (section 6).
- **Life tracker:** paper or a die per player.
- **Damage dice:** a few small dice to mark damage on defense-position monsters during an attack step. They all come
  off at the end of the turn, so nothing stays on the board between turns.

## 3. The board

```
               Left          Center          Right
Opponent    [spell][mon]  [spell][mon]  [spell][mon]     Opponent's Sigil row
Fields       (A's home)   (the place)    (B's home)
You         [spell][mon]  [spell][mon]  [spell][mon]     Your Sigil row
```

- **3 lanes.** Each player has one **monster slot** and one **spell slot** per lane on their side.
- **Each lane has one field, and it applies to both players' cards in that lane.**
  - Left lane: the first player's home field. Right lane: the second player's home field (as seen by the first player).
  - Center lane: **the place where the duel happens.** Duel at a volcano and the center is Volcano. In PvP the center
    comes from a rotating pool. A plain place uses **Crossroads** (no effect).
- **Sigil row:** your resource cards, face down, beside your side of the board.

## 4. Setup

1. Flip a coin. The winner chooses to go first or second.
2. Each player shuffles and draws **5 cards**.
3. **Mulligan, once:** put any number of cards from your hand on the bottom of your deck, draw that many, then shuffle.
4. The second player draws **1 extra card** to make up for going second.
5. **The first player skips their attack step on turn 1.**

## 5. Sigils (resources)

- **Bind, once per turn:** put any one card from your hand face down into your Sigil row. It's now a Sigil.
  Binding is optional.
- **Pay costs** by turning that many untapped Sigils sideways (tapping them).
- **At the start of your turn,** straighten all your Sigils.
- Sigils you leave untapped can pay for **Ambush spells on your opponent's turn** (section 9).
- The number of Sigils in your row is public. Which cards they are is secret.
- **Rest draw:** a turn where you don't bind gives you 1 extra card at the end of the turn (section 7). Early on you'll
  usually bind for Sigils; later, holding off keeps your hand full.

Because you can bind any card, you can never get stuck without resources. The choice is which card in your hand you
can spare.

## 6. Crest (your own ability)

Each player brings one Crest. You can use it **once per turn, on your turn only**, by tapping **2 Sigils**.

| Crest | Ability | Leans toward |
|---|---|---|
| **Ember** | One of your monsters gets +2 ATK this turn. | Aggro |
| **Tide** | Gain 2 LP. | Midrange |
| **Stone** | One of your monsters gets +2 DEF until the start of your next turn. | Control |
| **Gale** | Do a Move (section 7) without paying for it, ignoring the "entered this turn" limit. | Midrange / tempo |

- The leanings are suggestions, not locks. Any Crest can go in any deck.

- In the campaign you earn new Crests from trainers, quests and bosses. Town duelists use them too.
- In ranked PvP every Crest is its standard version. Progress unlocks which Crests you own and how they look, never
  their power.

## 7. A turn

1. **Start.** Straighten your Sigils. Draw 1 card. Then "start of your turn" effects happen, lanes left to right.
2. **Main.** In any order:
   - **Bind** one card as a Sigil (once per turn).
   - **Play a monster** into one of your monster slots by paying its cost, in **attack position** (upright) or
     **defense position** (sideways). If the slot is taken by your own monster, that monster goes to your discard
     pile (it's replaced).
   - **Change position** of any of your monsters, once each per turn. A monster can't change position on the turn it
     entered play.
   - **Cast a Quick spell**, **set a Prepared spell**, or **flip a Prepared spell** you set on an earlier turn
     (section 9).
   - **Use your Crest** (once per turn, 2 Sigils).
   - **Move, once per turn, for 1 Sigil:** move one of your monsters to an adjacent empty monster slot, or swap two of
     your monsters in adjacent slots. A monster that entered play this turn can't move. Moving keeps its position.
3. **Attack.** Pick your attackers **one at a time, in any order.** Each monster in attack position may attack once,
   into the lane across from it, unless a Guard pulls it elsewhere (section 8). A monster that entered play this turn
   can't attack. After this step you can't play cards or use your Crest until your next turn.
4. **End.** "End of turn" effects happen, lanes left to right. **Rest draw:** if you didn't bind a card this turn,
   draw 1 card. Then **all damage on all monsters clears** (take the damage dice off), and the turn passes.

Other rules:
- **Hand limit 7.** If you would draw an 8th card, discard it instead.
- **Empty deck:** when you would draw but can't, you lose 2 LP instead.
- **"Entered play" includes any way a monster arrives:** from hand, from the discard pile, or as a token.

## 8. Battle

When your monster attacks, it targets the enemy monster slot across from it, unless an enemy **Guard** pulls the
attack (see Keywords). Then:

| Target | Result |
|---|---|
| **Empty slot** | Your opponent loses LP equal to the attacker's ATK. |
| **Monster in attack position** | Compare ATK. The lower one is destroyed and its owner loses the difference in LP. If ATK is tied, both are destroyed and nobody loses LP. Nothing carries over to later attacks. |
| **Monster in defense position** | The defender takes damage equal to the attacker's ATK (put a die on it). **Damage adds up for the rest of the turn.** When its total damage reaches its DEF, it's destroyed. The defender doesn't hit back, the attacker's owner never loses LP, and no damage goes through to the defender's owner (except Trample). |

- **Example:** a 7 DEF monster in defense position is attacked by a 3, then another 3, then a 2. Damage goes 3, 6, 8:
  destroyed on the third hit. With only the two 3s, it survives at 6 damage and heals at the end of the turn.
- **Example:** your 5 ATK monster attacks their 3 ATK monster in attack position. They cast an Ambush that makes it
  7 ATK. Your monster is destroyed and you lose 2 LP.
- **All damage clears at the end of every turn.** Damage only ever builds up on defense-position monsters.
- If an effect lowers a monster's DEF to its current damage or below, it's destroyed.
- Destroyed monsters go to their owner's discard pile.
- Monsters in defense position can't attack.
- **The choice of position:** attack position threatens damage but can lose a single fight outright. Defense position
  can't be beaten by one weak attack, but several attackers together can bring it down.
- The most damage one turn can deal is the combined ATK of monsters that were already on the board when your opponent's
  turn ended (plus effects, and Swift monsters in later sets). You can always see lethal coming a turn ahead.

### Keywords

**First set:** only **Leap**, **Guard**, **Awaken** and **Rush** appear on cards. Swift, Trample and Sturdy are
written here so the rules are ready for later sets and campaign content; they're marked *(later set)*.

| Keyword | Meaning |
|---|---|
| **Awaken N** | When you play this from your hand, if you have **N or more Sigils** (tapped or not), it gets the listed bonus (for example "Awaken 5: +2/+2"). The bonus lasts while it stays on the board. Monsters that enter play any other way (e.g. Second Wind) don't Awaken. |
| **Rush** | **+2 ATK while you have 3 or fewer Sigils** (tapped or not). Checked all the time, so it turns off the moment you bind your 4th. |
| **Swift** *(later set)* | Can attack the turn it enters play. |
| **Leap** | When it attacks, you may hit the opponent directly even if a monster is across, unless a Guard pulls the attack. |
| **Guard** | **Only works while this monster is in defense position.** Enemy monsters in **this lane and adjacent lanes** that attack must attack this monster (Leap included). In the center it pulls from all 3 lanes; on an edge, from 2. |
| **Trample** *(later set)* | When it destroys a defense-position monster, the opponent loses LP equal to whatever went past the defender's remaining DEF. |
| **Sturdy** *(later set)* | The first time each turn this would be destroyed in battle, it isn't. Its damage stays, so the next hit that turn destroys it. |

- **More than one Guard applies:** the attacker picks which Guard to attack.
- Once a Guard is destroyed, it stops pulling. Your monsters that haven't attacked yet attack their own lanes as usual.
- A Guard monster in attack position is a normal monster: it pulls nothing. Switching it to defense position turns
  Guard on, so opponents can see the wall coming at the end of your turn.

## 9. Spells

| Type | When you can play it | How it works | What it's for |
|---|---|---|---|
| **Quick** | Your Main step, from hand | Pay, it happens right away, then goes to your discard pile. | Removal, buffs, tempo |
| **Prepared** | Your Main step: pay and **set it face down in one of your empty spell slots** | On a **later** turn of yours, flip it during your Main step for free. It happens, then goes to your discard pile. | Planning a big turn a turn early, and keeping a threat hidden |
| **Ambush** | **Your opponent's turn**, from hand, when its condition happens | Pay with your untapped Sigils, and it happens right away. | Punishing an attack, saving a monster |

- **Prepared spells belong to their lane.** Their ranges (section 10) count from the lane they're set in. Your
  opponent can see that something is set in a lane, but not what it is.
- **Prepared spells are a little stronger than Quick spells of the same cost,** to pay you back for waiting and for
  revealing that something is coming.
- **At most 1 Ambush per opponent turn.**
- **Nothing can respond to an Ambush.** An Ambush can respond to a Quick spell or a flipped Prepared spell, but there
  are never chains of responses.
- Leaving Sigils untapped at the end of your turn is the bluff: maybe you're holding an Ambush, maybe you aren't.

## 10. Effects

### Timings

Card text uses only these timings:

- **On play:** once, when the card enters play from hand.
- **Start of your turn:** each turn while it's on the board.
- **While:** always on while it's on the board.
- **When it attacks / When it's attacked:** when the battle is declared, before comparing numbers.
- **When destroyed:** when it goes to the discard pile from the board. This happens from the discard pile.

### Limits that keep turns short

- **Each card's triggered ability works at most once per turn.** With 3 slots per side, any chain ends quickly.
- **If several trigger at once,** the player whose turn it is resolves theirs first, lanes left to right, then the
  other player. Each one finishes before the next starts.
- **Extra summons** (tokens, monsters returned from the discard pile) still need an empty monster slot and still
  can't attack the turn they enter.

### Ranges

| Range | Means |
|---|---|
| **This lane** | The card's own lane, both sides. |
| **Across** | The enemy slot directly opposite. |
| **Adjacent** | The lanes next to this one. The center has 2 neighbors and each edge lane has 1. |
| **Any lane** | You pick one. |
| **All lanes** | Everything. |

The center lane reaches more with "Adjacent" effects, and the edge lanes are safer because fewer enemy effects reach
them.

## 11. Card design guide (for making cards, not for players)

- **Monster stat budget:** ATK + DEF = 2 × cost + 3 (1 cost = 5, 3 cost = 9, 6 cost = 15).
- A keyword or line of text costs about 1–2 points. Leap, Guard, Rush and Awaken cost 2 each.
- **Cost tiers:** keep the budget at every cost, but spend it differently.
  - **Cost 1–2:** lean ATK (ATK ≥ DEF), unless the card is a Guard or a wall.
  - **Cost 3–5:** balanced bodies, keywords and small effects.
  - **Cost 6:** trade **2–4 stat points for an effect** that can swing the game, so the card feels like a finisher
    and not just a big body.
- Costs run 1 to 6.
- **Affinities (placeholders):** Fire, Water, Earth, Air, Neutral. Fields mostly care about affinity.
- **The one hard rule: every effect must be limited by a card, a slot, or once per turn.** If a card can repeat itself
  with none of those three limits, don't print it.
- **Ramp** only by binding an extra card from hand. Nothing makes Sigils for free or untaps them.
- **Cost reduction** never takes a cost below 1.
- **"Deal damage to a monster"** isn't a thing anymore. Write it as "destroy a monster with DEF X or less" or as a DEF
  reduction.

## 12. Game phases and deck types

You bind at most one Sigil per turn, so **your Sigil count is the game's clock.**

| Phase | Your Sigils | What the board looks like |
|---|---|---|
| **Early** | 1–3 | Cheap monsters, lanes often empty, LP falls fast. |
| **Mid** | 4–5 | Every slot full. Trades, Guard placement and Prepared spells decide things. |
| **Late** | 6+ | Big monsters, removal, finishers. |

- **The 3-slot cap does the balancing.** Early, you're short on Sigils, so the card that does the most per Sigil wins.
  Late, you're short on slots, so the card that does the most per slot wins. A 1-cost 3/2 is great on turn 1 and a
  waste of a slot on turn 9 (you can replace it, section 7).
- **The rest draw shapes the plan.** An aggro deck that only needs 3 Sigils can stop binding around turn 4 and draw an
  extra card every turn after. A control deck has to keep binding to reach its big cards, and gives up those draws.

### Deck types

| Deck | Wins by | Beats | Loses to |
|---|---|---|---|
| **Aggro** (early) | Cheap high-ATK monsters, Rush, Leap, LP damage. Stops binding early and lives on rest draws. | Control, before it gets set up | Midrange: its 3–4 cost Guards stop the attacks |
| **Midrange** (mid) | Strong 3–4 cost monsters, Awaken, flexible Guard placement, good trades | Aggro | Control: removal and bigger late threats outlast it |
| **Control** (late) | Guard walls, Ambush, removal, then 6-cost finishers | Midrange | Aggro, if it falls too far behind early |

## 13. Sample fields

| Field | Effect |
|---|---|
| **Crossroads** | No effect. |
| **Volcano** | Fire monsters here get +1 ATK. Non-Fire monsters here get −1 DEF. |
| **Deep Lake** | Monsters here get +1 DEF. Leap doesn't work here. |
| **Old Forest** | At the start of each player's turn, if they have a monster here, they gain 1 LP. |
| **Mountain Pass** | Monsters here get +1 DEF and can't be moved into or out of this lane. |
| **Storm Peak** | Air monsters here have Leap. Non-Air monsters here get −1 DEF. |

## 14. Sample cards and test decks

Two full decks, built to test the Aggro vs Control matchup. **Budget** shows ATK + DEF plus points spent on keywords
and text, against 2 × cost + 3.

### Monsters

| Name | Aff. | Cost | ATK/DEF | Text | Budget |
|---|---|---|---|---|---|
| Cinderpup | Fire | 1 | 3/2 | — | 5 = 5 |
| Flarekit | Fire | 1 | 1/2 | Rush | 3 + Rush 2 = 5 |
| Gustling | Air | 1 | 2/1 | Leap | 3 + Leap 2 = 5 |
| Pebblekin | Earth | 1 | 0/3 | Guard | 3 + Guard 2 = 5 |
| Ripplefin | Water | 1 | 1/4 | — | 5 = 5 |
| Emberhorn | Fire | 2 | 4/3 | — | 7 = 7 |
| Ash Hound | Fire | 2 | 3/2 | On play: the monster across gets −2 DEF this turn. | 5 + text 2 = 7 |
| Blazerunner | Fire | 2 | 3/2 | Rush | 5 + Rush 2 = 7 |
| Skitterwing | Air | 2 | 2/3 | Leap | 5 + Leap 2 = 7 |
| Mudling | Earth | 2 | 1/4 | Awaken 5: +2/+2 | 5 + Awaken 2 = 7 |
| Kindlewing | Air | 3 | 3/4 | Awaken 4: +2/+2 | 7 + Awaken 2 = 9 |
| Shellback | Water | 3 | 2/7 | — | 9 = 9 |
| Stormhawk | Air | 4 | 5/4 | Leap | 9 + Leap 2 = 11 |
| Kiln Golem | Fire | 4 | 5/5 | When destroyed: your opponent loses 2 LP. | 10 + text 1 = 11 |
| Boulderhorn | Earth | 4 | 1/8 | Guard | 9 + Guard 2 = 11 |
| Undertow Serpent | Water | 5 | 5/6 | On play: return the monster across to its owner's hand. | 11 + text 2 = 13 |
| Deepwater Colossus | Water | 5 | 4/7 | Awaken 7: +3/+3 | 11 + Awaken 2 = 13 |
| Elder Treant | Earth | 6 | 7/5 | On play: destroy every enemy monster with DEF 2 or less. | 12 + text 3 = 15 |
| Abyssal Leviathan | Water | 6 | 7/5 | On play: return up to 2 enemy monsters (any lanes) to their owners' hands. | 12 + text 3 = 15 |

### Quick spells

| Name | Cost | Effect |
|---|---|---|
| Spark | 1 | Destroy a monster with DEF 2 or less in any lane. |
| Firebolt | 2 | Your opponent loses 3 LP. |
| Rally | 2 | Your monsters in all lanes get +1 ATK this turn. |
| Insight | 2 | Draw 2 cards. |

### Prepared spells

| Name | Cost | Effect when flipped |
|---|---|---|
| Undermine | 1 | The monster across loses 3 DEF this turn and switches to defense position. |
| Warcry | 2 | Your monsters in this lane and adjacent lanes get +2 ATK this turn. |
| Second Wind | 2 | Put a monster from your discard pile into your empty monster slot in this lane. |
| Rockslide | 3 | Destroy the monster across, whatever its position. |

### Ambush spells

| Name | Cost | Condition and effect |
|---|---|---|
| Brace | 1 | When one of your monsters is attacked: it gets +3 DEF this turn. |
| Smoke | 1 | When an enemy monster would hit you directly: cancel that attack. |
| Snap Trap | 2 | When an enemy monster attacks: destroy it if its ATK is 4 or less. |
| Riposte | 2 | When one of your monsters is destroyed in battle: destroy the attacker. |

### Deck 1: Ember Rush (Aggro)

Fire/Air. **Home field:** Volcano. **Crest:** Ember. Plan: fill lanes on turns 1–3, stop binding at 3 Sigils so Rush
stays on and the rest draw keeps your hand full, finish with Firebolt and Leap.

| Card | Copies |
|---|---|
| Cinderpup | 2 |
| Flarekit | 2 |
| Gustling | 2 |
| Emberhorn | 2 |
| Ash Hound | 2 |
| Blazerunner | 2 |
| Skitterwing | 2 |
| Kindlewing | 2 |
| Stormhawk | 2 |
| Kiln Golem | 2 |
| Spark | 2 |
| Firebolt | 2 |
| Rally | 2 |
| Undermine | 2 |
| Warcry | 2 |
| **Total** | **30** (20 monsters, 10 spells) |

### Deck 2: Deepwall (Control)

Water/Earth. **Home field:** Deep Lake (stops Leap in that lane). **Crest:** Stone. Plan: survive with Guards,
Ambush and removal, keep binding, then win with the finishers: **Elder Treant, Abyssal Leviathan and Deepwater
Colossus** (Second Wind can bring one back).

| Card | Copies |
|---|---|
| Pebblekin | 2 |
| Ripplefin | 2 |
| Mudling | 2 |
| Shellback | 2 |
| Boulderhorn | 2 |
| Undertow Serpent | 2 |
| Deepwater Colossus | 1 |
| Elder Treant | 1 |
| Abyssal Leviathan | 2 |
| Spark | 2 |
| Insight | 2 |
| Rockslide | 2 |
| Second Wind | 2 |
| Brace | 2 |
| Snap Trap | 2 |
| Riposte | 1 |
| Smoke | 1 |
| **Total** | **30** (16 monsters, 14 spells) |

## 15. Things to watch while playtesting

- **Game length:** write down the number of turns every game lasts (each player's turn counts as 1). Aim for 8–12.
  If most games end in under 7, raise LP to 25, then 30, **before** changing any card stats.
- **Stalls:** ganging up should beat walls now. Check that a big defense-position monster still feels worth playing,
  and that it doesn't just die to two average attackers.
- **Center Guard:** pulling all 3 lanes may be too strong (or too easy to kill all at once). Try a center-only limit
  of 2 lanes if so.
- **Attack vs defense position:** do players pick each one about equally often?
- **Going first vs second:** is skipping the first attack plus 1 extra card for the second player fair?
- **Binding:** if players always bind, binding isn't a real choice. If they stop early, big cards may be too weak.
- **Running out of cards / rest draw:** do hands still run dry by the midgame? If the rest draw isn't enough, try
  drawing 2 at the start of each turn instead. If hands overflow (hitting the limit of 7), the rest draw is too
  generous.
- **When do players stop binding?** If it's around turn 4–6, the rest draw is doing its job.
- **Ambush:** do players hold up Sigils, or is it always better to spend them on your own turn?
- **Prepared vs Quick:** is waiting a turn worth it?
- **Crests:** is 2 Sigils the right price? Does any Crest win games on its own?
- **Leap and Guard:** is Leap still too strong, or does Guard shut it down?
- **Fields:** does the home field feel like an advantage, and does the center place matter?
- **Control with no way to win:** does Deepwall actually close games, or does it survive and stall? Every control deck
  needs 2–3 real finishers. If games drag, make the finishers stronger before adding more walls.
- **Aggro too strong at 20 LP:** if Ember Rush wins most games before turn 7, raise LP first (see game length), then
  look at Rush and Firebolt.
- **Midrange best at everything:** once there's a midrange deck, check it doesn't beat both others. If it does, make
  removal and Ambush stronger so control can beat it.
- **Rush and Awaken:** does Rush make stopping at 3 Sigils feel like a real plan? Is Awaken worth holding a card for?
- **Elder Treant:** wiping every DEF 2 or less may hit aggro too hard. Try DEF 1 or less if so.

## 16. Rules that sit outside this page

- **Campaign bosses** can break rules (extra lanes, more LP, a fourth field, lane-control win conditions). PvP never
  does.
- **Ranked PvP** evens out monster stats and Crests so collection grinding doesn't beat skill (details later).
