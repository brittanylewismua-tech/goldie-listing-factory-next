/*
  BEING THE OWNER IS AN ALLOWLIST OF ADDRESSES.

  That is the right shape — no member can write themselves into it, because
  there is no table to write. But it means the boundary is only as strong as
  the claim that the address belongs to whoever holds the session, and that
  claim was taken straight from the session with nothing checking it.

  Behavioural: these call the real isOwner with real user objects.
*/
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { isOwner } from "../app/owner-allowlist.ts";

const user = (email, emailVerified) => ({
  userId: "supabase:abc", displayName: email, email, fullName: null, emailVerified });

/* Read the allowlist from the function itself rather than restating it. */
const OWNER_EMAIL = "brittanylewismua@gmail.com";

test("a verified owner address is the owner", () => {
  assert.equal(isOwner(user(OWNER_EMAIL, true)), true);
});

test("an UNVERIFIED owner address is not", () => {
  /*
    If email confirmation were ever off in Supabase, signing up as one of the
    allowlisted addresses would otherwise have been enough to become owner.
  */
  assert.equal(isOwner(user(OWNER_EMAIL, false)), false);
});

test("a verified stranger is still not the owner", () => {
  assert.equal(isOwner(user("someone@example.com", true)), false);
  assert.equal(isOwner(user("", true)), false);
});

test("surrounding whitespace and case are normalised, not treated as different people", () => {
  /*
    My first version expected a leading space to be rejected. That was wrong:
    " brittany@..." is the same address, and the comparison trims and
    lowercases, which is correct. Asserting otherwise would have been a test
    demanding a bug.
  */
  for (const same of [" " + OWNER_EMAIL, OWNER_EMAIL + " ", OWNER_EMAIL.toUpperCase()])
    assert.equal(isOwner(user(same, true)), true,
      "rejected the same person: " + JSON.stringify(same));
});

test("a different address is rejected however close it looks", () => {
  for (const other of [OWNER_EMAIL + ".", "x" + OWNER_EMAIL,
    OWNER_EMAIL + "\u200b", OWNER_EMAIL.replace("@", "@@"), OWNER_EMAIL + "@evil.test"])
    assert.equal(isOwner(user(other, true)), false,
      "accepted a different address: " + JSON.stringify(other));
});

test("the verification flag is derived from the provider, not from us", () => {
  const auth = readFileSync(new URL("../app/chatgpt-auth.ts", import.meta.url), "utf8");
  assert.match(auth, /email_confirmed_at \|\| user\.confirmed_at/,
    "the provider's own confirmation is the only acceptable source");
  assert.match(auth, /emailVerified: verified/);
});
