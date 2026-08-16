import type { PositionId } from "./application";

// The job descriptions, as the shop wrote them.
//
// ——— Plain strings, not StringKeys ———
//
// Everything else the app shows goes through the i18n table. These do not, and
// the reason is length: this is four documents of a few hundred words each,
// and putting them in en.ts would double that file to carry text no other
// locale has. They are English until somebody translates them, which the i18n
// system already handles for the two headings that *are* keys — every other
// locale is a Partial<> of English and falls back.
//
// The trade is deliberate and it has a cost: a Spanish reader gets an English
// job description. That is better than a broken page and worse than a Spanish
// one, and it is written here so nobody has to work out which.
//
// ——— One source, two renderings ———
//
// /careers/jd/[role] draws this as a page, /api/jd/[role] draws it as a PDF.
// Neither owns the text. The board's own one-line blurbs are elsewhere
// (openings.ts) and are deliberately not repeated here.

/** The shop, said once at the top of every description. */
export const SHOP_BLURB =
  "Corner Bagel is a neighborhood bagel shop built around a simple idea: good food, good people, right around the corner. We care about quality, speed, hospitality, cleanliness, and creating a shop people want to come back to.";

/** Where the job is. The board says "Koreantown", which is the shop; a job
 *  description says the city, which is what somebody works out a commute
 *  against. */
export const JOB_LOCATION = "Los Angeles, CA";

/** The document's own section headings.
 *
 *  English, with the body. They were i18n keys for a moment, which put a
 *  Spanish heading over an English list and made the page and the PDF disagree
 *  about what the section is called. The chrome around the document — the
 *  eyebrow, the three labels, the download link — stays translated, because
 *  that is the app talking rather than the document. */
export const HEADINGS = {
  about: "About Corner Bagel",
  role: "The Role",
  doing: "What You'll Do",
  looking: "What We're Looking For",
} as const;

export type JobDescription = {
  /** The shop's own name for the job. Not always the board's — see the note
   *  in openings.ts. "Cashier / Front of House" is this role's title in the
   *  document the shop wrote; "Counter & Register" is what the row says. */
  position: string;
  reportsTo: string;
  /** Exempt or not, and under what. Printed verbatim: this is the line an
   *  employment lawyer would read first, and paraphrasing it is not our job. */
  classification: string;
  /** "The Role", in paragraphs. */
  role: string[];
  doing: string[];
  looking: string[];
  /** A closing section where the shop wrote one. Manager has "What Success
   *  Looks Like", kitchen has "The Corner Bagel Standard", cashier has a
   *  short note about what actually matters in hiring. */
  closing?: { heading: string; body: string[] };
};

export const DESCRIPTIONS: Record<PositionId, JobDescription> = {
  "counter": {
    position: "Cashier / Front of House",
    reportsTo: "Shift Lead / Store Manager",
    classification: "Hourly, Non-Exempt",
    role: [
      "You're often the first person customers interact with at Corner Bagel.",
      "You'll take orders, answer questions, process payments, keep the front of the shop organized, and make sure customers feel taken care of without slowing down the line.",
      "You don't need to sound scripted. Be friendly, know the menu, pay attention, and keep things moving.",
    ],
    doing: [
      "Welcome customers",
      "Take accurate food and beverage orders",
      "Answer basic questions about the menu and ingredients",
      "Help customers understand bagel, spread, sandwich, drink, and add-on options",
      "Process cash and card payments accurately",
      "Confirm orders before submitting them",
      "Keep the register and customer-facing areas clean",
      "Restock cups, bags, napkins, utensils, and other supplies",
      "Help organize completed orders and customer handoff",
      "Communicate modifications and allergy-related requests clearly to the kitchen",
      "Help manage the line during busy periods",
      "Assist other stations when needed",
      "Complete opening and closing side work",
      "Follow food safety and sanitation procedures",
    ],
    looking: [
      "Friendly and comfortable talking with people",
      "Reliable and punctual",
      "Quick learner",
      "Comfortable working in a fast-paced environment",
      "Good attention to detail",
      "Able to communicate clearly with customers and coworkers",
      "Restaurant experience is helpful but not required",
      "Food Handler Card as required by California law",
    ],
    closing: {
      heading: "What actually matters",
      body: [
        "We can teach you the menu and systems. We care more about whether you show up, learn quickly, treat people well, and take pride in your work.",
      ],
    },
  },
  "kitchen": {
    position: "Prep / Kitchen Crew",
    reportsTo: "Shift Lead / Store Manager",
    classification: "Hourly, Non-Exempt",
    role: [
      "Prep / Kitchen Crew keeps the food side of Corner Bagel moving.",
      "You'll prepare ingredients, portion products, assemble sandwiches and bagel orders, maintain your station, and make sure everything leaving the kitchen meets our standards.",
      "Speed matters, but consistency matters too.",
    ],
    doing: [
      "Prepare ingredients according to recipes and prep lists",
      "Portion spreads, proteins, vegetables, toppings, and other ingredients",
      "Slice and prepare ingredients safely",
      "Assemble bagels and sandwiches to company specifications",
      "Toast and finish products as required",
      "Follow portion standards",
      "Label, date, rotate, and properly store prepared food",
      "Monitor station pars and restock before running out",
      "Communicate low inventory to the Shift Lead",
      "Maintain a clean and organized workstation",
      "Wash, rinse, and sanitize equipment, utensils, and food-contact surfaces according to required procedures",
      "Follow proper handwashing and glove procedures",
      "Prevent cross-contamination",
      "Follow allergy and special-order procedures",
      "Complete daily prep and cleaning checklists",
      "Help receive and organize deliveries",
      "Follow FIFO and proper food-storage procedures",
      "Minimize unnecessary food waste",
      "Assist with opening and closing kitchen duties",
      "Jump into other stations when needed",
    ],
    looking: [
      "Kitchen, deli, caf\u00e9, bakery, or restaurant experience is helpful but not required",
      "Comfortable working with food and following recipes",
      "Able to work quickly without getting sloppy",
      "Strong attention to cleanliness",
      "Reliable and punctual",
      "Comfortable working on your feet",
      "Able to perform normal kitchen lifting, carrying, reaching, and repetitive tasks",
      "Food Handler Card as required by California law",
    ],
    closing: {
      heading: "The Corner Bagel Standard",
      body: [
        "Be ready. Be clean. Be quick. Be kind.",
        "Nobody at Corner Bagel is above helping another station. If the register has a line, help. If prep is behind, help. If something is dirty, clean it. If a customer needs something, take care of them.",
        "We want people who care about the shop, their teammates, and the people who walk up to our window.",
      ],
    },
  },
  "shift-lead": {
    position: "Shift Lead",
    reportsTo: "Store Manager",
    classification: "Hourly, Non-Exempt",
    role: [
      "The Shift Lead keeps the shop running smoothly during their shift. You'll work alongside the team while making sure service stays fast, food stays consistent, the shop stays clean, and everyone knows what they're responsible for.",
      "This is a hands-on leadership role. You're not standing on the sidelines managing. You're jumping on register, helping make sandwiches, restocking, solving problems, and keeping the team moving.",
    ],
    doing: [
      "Open and/or close the shop according to company procedures",
      "Lead the team during assigned shifts",
      "Assign stations and keep everyone organized",
      "Make sure orders are prepared accurately and quickly",
      "Maintain Corner Bagel's food quality and presentation standards",
      "Support cashier, sandwich, prep, and handoff stations when needed",
      "Monitor breaks and shift coverage",
      "Keep the shop clean, stocked, and ready for service",
      "Handle basic customer concerns and resolve issues professionally",
      "Monitor product levels and communicate low inventory",
      "Complete opening, shift-change, and closing checklists",
      "Follow food safety, sanitation, and employee safety procedures",
      "Communicate equipment, staffing, product, or operational issues to management",
      "Help train new team members",
      "Set the tone for hospitality and teamwork during the shift",
    ],
    looking: [
      "Previous restaurant, caf\u00e9, bakery, or quick-service experience preferred",
      "Previous leadership experience is a plus",
      "Reliable and comfortable taking responsibility",
      "Strong communicator",
      "Works well under pressure",
      "Organized and attentive to details",
      "Comfortable giving teammates direction respectfully",
      "Able to stand for extended periods and perform normal restaurant duties",
      "Food Handler Card as required by California law",
    ],
  },
  "manager": {
    position: "Store Manager",
    reportsTo: "Ownership / Operations",
    classification: "To be determined based on compensation structure and applicable California law",
    role: [
      "The Store Manager owns the day-to-day performance of the shop.",
      "Your job is to make sure Corner Bagel opens ready, runs well, has the right people and products in place, and consistently delivers the experience we want customers to have.",
      "You'll manage the team, scheduling, training, inventory, food safety, service standards, and daily operations while working closely with ownership.",
      "We want a manager who notices things before someone has to point them out.",
    ],
    doing: [
      "Manage daily store operations from opening through close",
      "Hire, onboard, train, coach, and develop team members",
      "Build and manage weekly employee schedules",
      "Maintain appropriate staffing levels based on sales and demand",
      "Monitor attendance, punctuality, breaks, and timekeeping",
      "Lead Shift Leads and establish clear expectations for each shift",
      "Maintain service, food quality, cleanliness, and hospitality standards",
      "Monitor labor usage and help keep labor within company targets",
      "Manage inventory and product pars",
      "Place or coordinate vendor orders",
      "Monitor waste, shortages, comps, refunds, and product availability",
      "Conduct regular inventory counts",
      "Make sure required opening, closing, cleaning, and food-safety procedures are completed",
      "Maintain compliance with applicable health and workplace requirements",
      "Handle customer escalations",
      "Coordinate equipment maintenance and report facility issues",
      "Review daily sales and operational performance",
      "Communicate store issues and opportunities to ownership",
      "Help introduce new menu items, promotions, and operating procedures",
      "Build a strong team culture with accountability and respect",
      "Spend time on the floor and step into any station when the team needs help",
    ],
    looking: [
      "Restaurant, caf\u00e9, bakery, or quick-service management experience preferred",
      "Strong people-management skills",
      "Comfortable managing scheduling, inventory, labor, and daily operations",
      "Highly organized",
      "Calm and decisive during busy periods",
      "Strong understanding of hospitality",
      "Able to coach employees without creating unnecessary friction",
      "Comfortable using POS, scheduling, inventory, and other restaurant technology",
      "Food Manager Certification as required for the operation",
      "Availability to work mornings, weekends, and peak periods as needed",
    ],
    closing: {
      heading: "What Success Looks Like",
      body: [
        "The store is ready when the doors open. The team knows what they're doing. Customers move through quickly. Food looks and tastes right. Labor is controlled. Product is available. The shop stays clean. Problems get handled before they become bigger problems.",
      ],
    },
  },
};
