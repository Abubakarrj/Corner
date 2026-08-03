// The shops, in the order they appear in the picker.
//
// Kept as data rather than written into the modal's markup so a second
// location is a one-entry change here — the heading ("Our location" /
// "Choose your location"), the separators between cards, and the scrolling
// all key off this array's length.
//
// `href` is deliberately absent for now: there is no per-location page,
// address, ordering link, or hours yet, and a card that looks tappable but
// goes nowhere is worse than one that plainly doesn't. When those exist,
// adding the field and wrapping the card in a Link is the whole change.
export type Location = {
  name: string;
  image: string;
  // Describes the drawing for anyone who can't see it — not a caption, since
  // the neighbourhood name is rendered below the image either way.
  alt: string;
};

export const LOCATIONS: Location[] = [
  {
    name: "Korean Town",
    image: "/location-korean-town.png",
    alt: "Line drawing of the Corner Bagel storefront: a glass shopfront above a raised stoop with a railing and steps up from the sidewalk.",
  },
];
