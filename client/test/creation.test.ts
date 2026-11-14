import assert from "node:assert/strict";
import { test } from "node:test";
import { DEFAULT_APPEARANCE, PARTS, SLOTS, isAppearance } from "../src/gfx/chibi.js";
import { cycle, initialCreation, moveRow, nextScreenFromTitle, normalizeProfile, validateName } from "../src/core/creation.js";
import { clearProfile, loadProfile, saveProfile } from "../src/ui/state.js";

function stubStorage(init: Record<string, string> = {}) {
  const m = new Map(Object.entries(init));
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => { m.set(k, v); },
    removeItem: (k: string) => { m.delete(k); },
    m,
  };
}

test("cycle steps forward and back and wraps at both ends", () => {
  for (const slot of SLOTS) {
    const opts = PARTS[slot];
    const first = { ...DEFAULT_APPEARANCE, [slot]: opts[0]! };
    const last = { ...DEFAULT_APPEARANCE, [slot]: opts[opts.length - 1]! };
    assert.equal(cycle(slot, first, -1)[slot], opts[opts.length - 1], `${slot} prev wraps`);
    assert.equal(cycle(slot, last, 1)[slot], opts[0], `${slot} next wraps`);
    assert.equal(cycle(slot, first, 1)[slot], opts[1 % opts.length]);
    // Only the cycled slot changes.
    for (const other of SLOTS) if (other !== slot) assert.equal(cycle(slot, first, 1)[other], first[other]);
  }
});

test("every option of every slot is reachable by cycling, and stays valid", () => {
  for (const slot of SLOTS) {
    let a = { ...DEFAULT_APPEARANCE };
    const seen = new Set<string>();
    for (let i = 0; i < PARTS[slot].length; i++) { seen.add(a[slot]); a = cycle(slot, a, 1); assert.ok(isAppearance(a)); }
    assert.equal(seen.size, PARTS[slot].length, slot);
    assert.equal(a[slot], DEFAULT_APPEARANCE[slot], `${slot} full loop returns home`);
  }
});

test("moveRow wraps over the slot rows", () => {
  assert.equal(moveRow(0, -1), SLOTS.length - 1);
  assert.equal(moveRow(SLOTS.length - 1, 1), 0);
  assert.equal(moveRow(2, 1), 3);
});

test("names: trimmed, 1-16 chars, limited characters", () => {
  assert.deepEqual(validateName("  Bill  "), { ok: true, name: "Bill" });
  assert.equal(validateName("a  b").name, "a b");
  assert.ok(validateName("O'Neil-the_2nd").ok);
  assert.ok(validateName("x".repeat(16)).ok);
  assert.ok(!validateName("x".repeat(17)).ok);
  assert.ok(!validateName("").ok);
  assert.ok(!validateName("   ").ok);
  assert.ok(!validateName("<script>").ok);
  assert.ok(!validateName("名前").ok);
  assert.ok(!validateName(42).ok);
});

test("initial creation: an existing profile is kept, a new one gets a seeded look and no name", () => {
  const p = { name: "Bill", appearance: { ...DEFAULT_APPEARANCE, hair: PARTS.hair[0]! } };
  assert.deepEqual(initialCreation(p, 1), { appearance: p.appearance, name: "Bill", row: 0 });
  const a = initialCreation(null, "seed");
  assert.equal(a.name, "");
  assert.ok(isAppearance(a.appearance));
  assert.deepEqual(initialCreation(null, "seed"), a);
});

test("profile save/load round-trips; garbage storage never throws", () => {
  const kv = stubStorage();
  assert.equal(loadProfile(kv), null);
  const p = { name: "Bill", appearance: { ...DEFAULT_APPEARANCE, eyes: PARTS.eyes[1]! } };
  saveProfile(p, kv);
  assert.deepEqual(loadProfile(kv), p);
  clearProfile(kv);
  assert.equal(loadProfile(kv), null);

  const key = "sigilbound.profile";
  assert.equal(loadProfile(stubStorage({ [key]: "{not json" })), null);
  assert.equal(loadProfile(stubStorage({ [key]: "null" })), null);
  assert.equal(loadProfile(stubStorage({ [key]: "[1,2]" })), null);
  assert.equal(loadProfile(stubStorage({ [key]: JSON.stringify({ name: "" }) })), null);
  // A good name with a broken look is repaired, not dropped.
  const fixed = loadProfile(stubStorage({ [key]: JSON.stringify({ name: " Zed ", appearance: { hair: "nope", eyes: 7 } }) }));
  assert.deepEqual(fixed, { name: "Zed", appearance: { ...DEFAULT_APPEARANCE } });
  // Throwing storage (private mode).
  const boom = { getItem: () => { throw new Error("x"); }, setItem: () => { throw new Error("x"); }, removeItem: () => { throw new Error("x"); } };
  assert.equal(loadProfile(boom), null);
  assert.doesNotThrow(() => saveProfile(p, boom));
  assert.doesNotThrow(() => clearProfile(boom));
  assert.equal(normalizeProfile("x"), null);
});

test("Enter the world: no profile goes to creation, a profile goes to the world", () => {
  assert.equal(nextScreenFromTitle(null), "create");
  assert.equal(nextScreenFromTitle({ name: "Bill", appearance: { ...DEFAULT_APPEARANCE } }), "world");
});
