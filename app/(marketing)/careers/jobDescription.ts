import type { StringKey } from "../../i18n/en";
import type { PositionId } from "./application";

// What each job actually is, in the applicant's words rather than the shop's.
//
// ——— Modelled on a real one, and cut ———
//
// The reference was a specialty coffee group's barista posting. Its shape is
// good and most of its length is not, so what survived is the part that
// answers a question somebody has:
//
//   a sentence saying what the job is
//   what you would be doing        ← their "Key aspects of the role"
//   what we are looking for        ← theirs, near enough verbatim in shape
//
// Three sections of the reference are deliberately absent.
//
//   The company blurb. Two paragraphs about the group before a word about the
//   job. This shop's story is on About Us and the board says the shop's name
//   at the top; saying it again above the form is the "About the shop" section
//   that was already cut once from the board.
//
//   The benefits list. Free lunch every shift, 30% off retail, an annual party
//   with a trip to a coffee farm, a cycle-to-work scheme. Every line of that
//   is a promise about employment, and this shop has not made any of them. A
//   job posting is not the place to invent a benefit somebody will turn up
//   expecting. If the shop wants to offer some, they go here as a third list
//   and the component below is already shaped for it.
//
//   The values page. "Our four core values" and eleven sentences underneath.
//   Nobody chooses a bagel shop on it, and it is the part of a job description
//   that reads as written for the employer rather than the reader.
//
// ——— On the translations ———
//
// These are English-only for now. The i18n system is built for exactly this:
// every other locale is a Partial<> of the English table and falls back to it
// key by key, so a Spanish reader sees a Spanish page with these paragraphs in
// English rather than a broken one. That is a real gap and not a silent one —
// the rest of the careers page is translated ten ways and this is the piece
// that is not yet.

export type JobDescription = {
  /** One sentence. What the job is, before any list. */
  summary: StringKey;
  /** The shifts as they are actually worked. */
  doing: StringKey[];
  /** What would make somebody good at it. Written as things a person can
   *  recognise in themselves, not as filters — "have run a shift before"
   *  rather than "2+ years of supervisory experience", which is the sort of
   *  line that stops a good applicant who has done the job for eighteen
   *  months. Nothing here is a bar the shop would actually refuse on. */
  looking: StringKey[];
};

export const DESCRIPTIONS: Record<PositionId, JobDescription> = {
  counter: {
    summary: "careers.jdCounterSummary",
    doing: [
      "careers.jdCounterDo1",
      "careers.jdCounterDo2",
      "careers.jdCounterDo3",
      "careers.jdCounterDo4",
    ],
    looking: [
      "careers.jdCounterWant1",
      "careers.jdCounterWant2",
      "careers.jdCounterWant3",
      "careers.jdFoodCard",
    ],
  },
  kitchen: {
    summary: "careers.jdKitchenSummary",
    doing: [
      "careers.jdKitchenDo1",
      "careers.jdKitchenDo2",
      "careers.jdKitchenDo3",
      "careers.jdKitchenDo4",
    ],
    looking: [
      "careers.jdKitchenWant1",
      "careers.jdKitchenWant2",
      "careers.jdKitchenWant3",
      "careers.jdFoodCard",
    ],
  },
  "shift-lead": {
    summary: "careers.jdLeadSummary",
    doing: [
      "careers.jdLeadDo1",
      "careers.jdLeadDo2",
      "careers.jdLeadDo3",
      "careers.jdLeadDo4",
    ],
    looking: [
      "careers.jdLeadWant1",
      "careers.jdLeadWant2",
      "careers.jdLeadWant3",
      "careers.jdFoodCard",
    ],
  },
  manager: {
    summary: "careers.jdManagerSummary",
    doing: [
      "careers.jdManagerDo1",
      "careers.jdManagerDo2",
      "careers.jdManagerDo3",
      "careers.jdManagerDo4",
      "careers.jdManagerDo5",
    ],
    looking: [
      "careers.jdManagerWant1",
      "careers.jdManagerWant2",
      "careers.jdManagerWant3",
      // The manager's certificate, not the handler card: California wants at
      // least one Food Safety Manager in the business, and this is the job
      // that holds it.
      "careers.jdManagerCert",
    ],
  },
};
