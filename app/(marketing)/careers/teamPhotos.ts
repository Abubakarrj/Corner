// Pictures of the shop and the people in it, for the careers page.
//
// A careers page made entirely of well-organised sentences tells somebody what
// the job is and nothing about what it would be like. The reference this came
// from works because you see two people in caps laughing outside the door
// before you read a word — you learn the place is somewhere people seem glad
// to be, which is the thing a paragraph can claim and never demonstrate.
//
// ——— Empty on purpose ———
//
// This list ships empty, and the page draws nothing at all when it is. That is
// deliberate: a strip of grey placeholder boxes where the team should be is
// worse than no photographs, because it reads as a page that broke rather than
// a page that is honest. Add real ones and the section appears.
//
// ——— Adding a photo ———
//
//   1. Put the file in public/team/ — a .jpg or .webp, at least 1200px on its
//      long side. Anything smaller looks soft on a phone at 3x.
//   2. Add a row below.
//   3. Write the alt.
//
// Order is the order they appear. They are all cropped to the same shape, so
// a photo whose subject is off to one edge will lose that edge — pick ones
// that survive a centre crop, or crop them yourself first.
//
// Two things worth getting right rather than getting done:
//
// Alt text is the one string on this page that isn't translated, and that is a
// considered trade rather than an oversight. Everything else here is UI copy
// that means the same thing in ten languages; this describes one specific
// photograph and has to be rewritten every time the photograph changes.
// Ten translations that go stale the moment somebody swaps a picture are worse
// than one sentence that is true. Write it in English, describe what is
// happening rather than naming the file, and keep it short.
//
// And: ask the people in the picture. Everybody identifiable on a page that
// says "come and work here" should know they are on it — including anybody who
// has since left, whose photo should come down when they do.

export type TeamPhoto = {
  /** Path under /public, e.g. "/team/morning-shift.jpg". */
  src: string;
  /** What is happening in it. Not the file name, not "team photo". */
  alt: string;
};

export const TEAM_PHOTOS: TeamPhoto[] = [
  // {
  //   src: "/team/opening-shift.jpg",
  //   alt: "Two bakers shaping dough at the bench before the shop opens",
  // },
];
