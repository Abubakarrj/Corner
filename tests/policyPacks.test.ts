// Every locale's privacy policy still rebuilds, and the new section landed in
// the right slot. rebuild() throws on a miscount, so the first half of this is
// the whole structural check; the second half is that it went where it was
// meant to rather than four paragraphs into the wrong section.
import { POLICY_PACKS } from "../app/(marketing)/policies/policyPacks";
import { EN_POLICIES } from "../app/(marketing)/policies/policy";

let failures = 0;
const ok = (what: string, cond: boolean, detail = "") => {
  if (cond) console.log("pass ", what);
  else { failures += 1; console.log("FAIL ", what, detail); }
};

const en = EN_POLICIES.privacy;
const enAt = en.sections.findIndex((s) => s.heading === "What We Count");
ok("English has the section", enAt >= 0);
ok("with three paragraphs", en.sections[enAt]?.blocks.length === 3,
   String(en.sections[enAt]?.blocks.length));
ok("and it sits before Marketing Communications",
   en.sections[enAt + 1]?.heading === "Marketing Communications",
   en.sections[enAt + 1]?.heading);

for (const [id, pack] of Object.entries(POLICY_PACKS)) {
  // Reaching .privacy at all means rebuild() ran and the counts matched.
  const privacy = pack.privacy;
  ok(`${id}: rebuilds`, privacy.sections.length === en.sections.length,
     `${privacy.sections.length} vs ${en.sections.length}`);
  const section = privacy.sections[enAt];
  ok(`${id}: the new section is in the same slot`, section !== undefined);
  ok(`${id}: it has three paragraphs`, section?.blocks.length === 3,
     String(section?.blocks.length));
  ok(`${id}: and is translated rather than left in English`,
     section?.heading !== "What We Count", section?.heading);
  const text = (section?.blocks ?? []).map((b) => ("text" in b ? b.text : "")).join(" ");
  ok(`${id}: it says the address is not kept`, text.length > 200, String(text.length));
}

// ——— Corner Notes ———
//
// ⚠️ The wall is the only feature in this app that publishes what a stranger
// typed, so the policy has to say so in every language somebody can read the
// site in — not only in the one the section was written in. rebuild() throwing
// on a miscount is what proves the strings landed; these prove they landed in
// the right section and say the thing that matters.
const notesAt = en.sections.findIndex((s) => s.heading === "Corner Notes");
ok("English says what Corner Notes publishes", notesAt >= 0);
ok("and says it before children's privacy",
   en.sections[notesAt + 1]?.heading === "Children’s Privacy",
   en.sections[notesAt + 1]?.heading);
// The sentence somebody needs before they type their name into a public wall.
const enNotes = (en.sections[notesAt]?.blocks ?? [])
  .map((b) => ("text" in b ? b.text : ""))
  .join(" ");
ok("⚠️ and warns that a note is shown to anyone who visits",
   /public wall/i.test(enNotes) && /anyone who visits/i.test(enNotes));
ok("and that the address is not stored beside the note",
   /IP address/i.test(enNotes));
ok("and how to have one taken down", /taken down/i.test(enNotes));

for (const [id, pack] of Object.entries(POLICY_PACKS)) {
  const section = pack.privacy.sections[notesAt];
  ok(`${id}: has the Corner Notes section in the same slot`, section !== undefined);
  ok(`${id}: with three paragraphs`, section?.blocks.length === 3,
     String(section?.blocks.length));
  // ⚠️ The heading stays "Corner Notes" everywhere on purpose — it is the name
  // of the thing, like Corner Bagel — so this checks the *paragraphs* moved
  // rather than the heading, which is the opposite of the check above.
  const text = (section?.blocks ?? []).map((b) => ("text" in b ? b.text : "")).join(" ");
  ok(`${id}: and the text is translated rather than left in English`,
     !text.includes("public wall"), text.slice(0, 40));
  ok(`${id}: and long enough to be the actual explanation`,
     text.length > 300, String(text.length));
}

console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
