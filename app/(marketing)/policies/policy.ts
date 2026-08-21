import type { LocaleId } from "../../localeScript";

// The two legal pages, as data rather than markup.
//
// They used to be JSX with the sentences typed straight into it, which is fine
// for one language and impossible for seven — a translator would have been
// editing `<p className="mt-2">` around their own prose. This is the same
// document, one level down: sections, and blocks inside them.
//
// ——— A note on translating a policy ———
//
// A translated privacy policy is not the same document as the English one. It
// is a translation of it, made so somebody can read what the business is
// doing, and if the two ever disagree the English is the one that was written
// and approved. Every non-English rendering says so at the top — see
// `governedBy` — which is the ordinary practice for a multilingual site and
// the only honest way to show this page in a language the business didn't
// sign off on.
//
// Tokens in the prose:
//   {privacyPolicy}  a link to /privacy-policy
//   {email}          a mailto: link to the address below
// Everything else is literal.

export const POLICY_EMAIL = "support@publicentity.co";
export const PRIVACY_EMAIL = "cornerbagel@publicentity.co";

export type PolicyBlock =
  | { kind: "p"; text: string }
  | { kind: "strong"; text: string }
  // A run of "Label: body" lines, as the cookie categories are written.
  | { kind: "kv"; items: { label: string; text: string }[] }
  // A sub-heading with a lead-in line and a bulleted list under it.
  | { kind: "list"; heading?: string; lead?: string; items: string[] };

export type PolicySection = { heading: string; blocks: PolicyBlock[] };

export type Policy = {
  title: string;
  // The lines under the title: the operator, the date.
  meta: string[];
  // Blocks before the first heading. The privacy policy opens with two.
  intro: PolicyBlock[];
  sections: PolicySection[];
};

export type PolicyPack = {
  cookie: Policy;
  privacy: Policy;
  goBack: string;
  // "This is a translation. The English version governs." Absent for English,
  // which is the version it would be talking about.
  governedBy?: string;
};

const enCookie: Policy = {
  title: "Cookie Policy",
  meta: ["Operated by Public Entity Holdings", "Last Updated: August 1, 2026"],
  intro: [],
  sections: [
    {
      heading: "1. Introduction",
      blocks: [
        {
          kind: "p",
          text: "This Cookie Policy explains how Corner Bagel (“Corner Bagel,” “we,” “our,” or “us”), operated by Public Entity Holdings, uses cookies and similar tracking technologies on our website. This policy should be read together with our {privacyPolicy}.",
        },
        {
          kind: "p",
          text: "This policy is intended for visitors using our website in the United States, including California. Where required by applicable law, including the California Consumer Privacy Act (CCPA) as amended by the California Privacy Rights Act (CPRA), we will obtain consent before placing non-essential cookies.",
        },
      ],
    },
    {
      heading: "2. What Are Cookies?",
      blocks: [
        {
          kind: "p",
          text: "Cookies are small text files stored on your device when you visit our website. They help recognize your device, remember preferences, improve functionality, and support online ordering. Cookies may be session cookies or persistent cookies and may be first-party or third-party cookies.",
        },
      ],
    },
    {
      heading: "3. How We Use Cookies",
      blocks: [
        {
          kind: "p",
          text: "We use cookies to ensure our website functions correctly and securely; remember your preferences; personalize your experience; analyze website performance (if enabled in the future); and support online ordering services, including those powered by Toast. We do not use cookies to collect sensitive personal information beyond what is necessary to complete services you request.",
        },
      ],
    },
    {
      heading: "4. Categories of Cookies We Use",
      blocks: [
        {
          kind: "kv",
          items: [
            {
              label: "Strictly Necessary",
              text: "Essential for security, session management, fraud prevention, checkout, and website functionality. No consent required.",
            },
            {
              label: "Functional",
              text: "Remember accessibility settings and ordering preferences. Consent required where applicable.",
            },
            {
              label: "Analytics",
              text: "Not currently active. If introduced, they will help us understand website usage and will only be enabled after obtaining consent.",
            },
            {
              label: "Advertising/Marketing",
              text: "Corner Bagel does not currently use advertising or marketing cookies.",
            },
          ],
        },
      ],
    },
    {
      heading: "5. Strictly Necessary Cookies",
      blocks: [
        {
          kind: "p",
          text: "These cookies are required for browsing the website, viewing menus, submitting contact forms, and completing online orders. Without these cookies, requested services cannot be provided.",
        },
      ],
    },
    {
      heading: "6. Functional Cookies",
      blocks: [
        {
          kind: "p",
          text: "Functional cookies remember your preferences and enhance your experience. These cookies do not track activity across other websites and are only used where permitted by law.",
        },
      ],
    },
    {
      heading: "7. Analytics Cookies",
      blocks: [
        {
          kind: "p",
          text: "Corner Bagel does not currently use analytics cookies. If analytics tools are added in the future, visitors will be notified and provided an opportunity to consent before activation.",
        },
      ],
    },
    {
      heading: "8. Advertising and Marketing Cookies",
      blocks: [
        {
          kind: "p",
          text: "Corner Bagel does not currently place advertising or retargeting cookies. We do not sell personal information collected through cookies for advertising purposes.",
        },
      ],
    },
    {
      heading: "9. Third-Party Cookies",
      blocks: [
        {
          kind: "p",
          text: "Our website may use third-party services, including Toast for online ordering. These providers may place their own cookies subject to their own privacy and cookie policies.",
        },
      ],
    },
    {
      heading: "10. Toast Ordering",
      blocks: [
        {
          kind: "p",
          text: "When you use the online ordering platform powered by Toast, Toast may place cookies necessary to operate the ordering experience. Toast’s privacy and cookie practices are governed by Toast’s own policies. Corner Bagel encourages customers to review those policies before placing an order.",
        },
      ],
    },
    {
      heading: "11. Managing Cookie Preferences",
      blocks: [
        {
          kind: "p",
          text: "You may accept, reject, or customize non-essential cookies using our cookie banner. Preferences may be changed at any time.",
        },
      ],
    },
    {
      heading: "12. Browser Controls",
      blocks: [
        {
          kind: "p",
          text: "Most browsers allow you to block or delete cookies. Blocking strictly necessary cookies may prevent portions of the website, including online ordering, from functioning correctly.",
        },
      ],
    },
    {
      heading: "13. Consent and Withdrawal",
      blocks: [
        {
          kind: "p",
          text: "Where required by law, we obtain consent before placing non-essential cookies. Consent may be withdrawn at any time through the cookie preference center or browser settings.",
        },
      ],
    },
    {
      heading: "14. Data Sharing",
      blocks: [
        {
          kind: "p",
          text: "We may share cookie-related information with trusted service providers that help operate our website or process online orders, including Toast, or when required by law. We do not sell personal information collected through cookies.",
        },
      ],
    },
    {
      heading: "15. Changes",
      blocks: [
        {
          kind: "p",
          text: "We may update this Cookie Policy from time to time. Material changes will be reflected by updating the Last Updated date.",
        },
      ],
    },
    {
      heading: "16. Contact Information",
      blocks: [
        { kind: "p", text: "Corner Bagel, operated by Public Entity Holdings. Email: {email}" },
        {
          kind: "p",
          text: "If you have questions regarding this Cookie Policy or your privacy rights, please contact us using the email above.",
        },
      ],
    },
  ],
};

const enPrivacy: Policy = {
  title: "Privacy Policy",
  meta: ["Effective Date: July 8, 2026"],
  intro: [
    {
      kind: "p",
      text: "At Corner Bagel (“Corner Bagel,” “we,” “our,” or “us”), we respect your privacy. This policy explains how we collect, use, disclose, and safeguard information when you visit our website, place an order, join our mailing list, participate in promotions, or otherwise interact with our business.",
    },
    {
      kind: "strong",
      text: "By using our website or services, you agree to this Privacy Policy.",
    },
  ],
  sections: [
    {
      heading: "Information We Collect",
      blocks: [
        {
          kind: "list",
          heading: "Information You Provide",
          lead: "We may collect:",
          items: [
            "Name",
            "Email address",
            "Phone number",
            "Billing and payment information",
            "Delivery or pickup information",
            "Order history",
            "Loyalty or rewards account information (if applicable)",
          ],
        },
        {
          kind: "list",
          heading: "Information Collected Automatically",
          lead: "When you visit our website, we may collect:",
          items: [
            "IP address",
            "Browser type",
            "Device information",
            "Operating system",
            "Pages visited",
            "Time spent on our website",
            "Referring websites",
            "Cookies and similar technologies",
            "Precise location, only when you ask us to find you",
          ],
        },
      ],
    },
    // Precise location is sensitive personal information under California law
    // and it has to be described on its own, not left as one bullet in a list
    // between "Operating system" and "Cookies". Two screens ask for it, it
    // leaves for Google when they do, and the section says both plainly.
    {
      heading: "Location",
      blocks: [
        {
          kind: "p",
          text: "Two screens can use your device’s location: the store finder, when you press the locate button, and the delivery map, which asks when you open it. Your browser asks your permission first, and if you decline, nothing is collected — both screens work from an address you type instead.",
        },
        {
          kind: "p",
          text: "When you do allow it, the coordinates are sent to Google Maps Platform so we can name what is at that spot and work out whether it falls inside our delivery area. Google’s handling of that request is governed by Google’s own privacy policy. We do not store the coordinates, we do not attach them to your account, and we do not use them for advertising or to build a profile of you. Only a delivery address you confirm is kept, and only as part of the order it belongs to.",
        },
        {
          kind: "p",
          text: "On iPhone and iPad, Location Services keeps a separate Precise Location switch for each website. With it turned off your device reports a neighbourhood rather than a street, which we will tell you when it happens. You can leave it off and place your delivery pin yourself.",
        },
      ],
    },
    {
      heading: "How We Use Your Information",
      blocks: [
        {
          kind: "list",
          lead: "We use your information to:",
          items: [
            "Process and fulfill orders",
            "Communicate regarding your orders",
            "Show you your own order history and its progress when you are signed in",
            "Provide customer support",
            "Improve our products and services",
            "Personalize your experience",
            "Send newsletters, promotions, and special offers (when you opt in)",
            "Operate loyalty or rewards programs",
            "Prevent fraud and maintain security",
            "Comply with legal obligations",
          ],
        },
      ],
    },
    {
      heading: "Your Order History",
      blocks: [
        {
          kind: "p",
          text: "When you are signed in, we keep a record of the orders you place — what was ordered, what it cost, and where it was going — against your email address, so that your order and its progress are available on any device you sign in on. We keep the fifty most recent; older ones are removed as new ones arrive. Card numbers are never part of this record. Where an order was paid by card we keep only the card brand and its last four digits, as a receipt does.",
        },
        {
          kind: "p",
          text: "When you are not signed in, your orders are kept only in your own browser's storage on the device you ordered from. They are not sent to us for this purpose, they do not follow you to another device, and clearing your browsing data removes them.",
        },
        {
          kind: "p",
          text: "To have your stored order history deleted, contact us at the address at the end of this policy.",
        },
      ],
    },
    // The daily demand tallies. Its own section rather than a line in "what
    // we collect", because part of it records people who never placed an
    // order, and burying that would be the problem rather than the disclosure.
    {
      heading: "What We Count",
      blocks: [
        {
          kind: "p",
          text: "We keep a daily count of how much was ordered, in what shape, and roughly where — a delivery counted against the part of the city it went to, a collection or a catering enquiry counted against the shop it was for. When an address turns out to be outside our delivery area we count that too. It is how we work out where to open next, and it comes from the people it would actually help.",
        },
        {
          kind: "p",
          text: "No address is kept. What is written down is a tally for a square of roughly one kilometre, for that day, and how far outside the area the refusals in it were on average — no address, no name, no account, and no record of any individual order or request. A square that size tells us one neighbourhood from another, which is the question, and not one home from another, which is not. Squares with fewer than five refusals in them are never shown to anybody, so the smallest thing this can describe is a group. Collections and catering enquiries are counted against the shop's own address, so they describe our premises rather than yours.",
        },
        {
          kind: "p",
          text: "Only addresses you type, search for, or put on an order are counted this way. A location your browser reports is never counted, and is still not stored — see Location above. The counts are deleted after ninety days.",
        },
      ],
    },
    {
      heading: "Marketing Communications",
      blocks: [
        {
          kind: "list",
          lead: "If you subscribe to our mailing list, we may send updates regarding:",
          items: [
            "New menu items",
            "Seasonal offerings",
            "Promotions",
            "Events",
            "Store announcements",
          ],
        },
        {
          kind: "p",
          text: "You may unsubscribe at any time by clicking the unsubscribe link included in our emails.",
        },
      ],
    },
    {
      heading: "Cookies & Tracking",
      blocks: [
        {
          kind: "list",
          lead: "Our website may use cookies and similar technologies to:",
          items: [
            "Remember user preferences",
            "Improve website functionality",
            "Analyze website traffic",
            "Measure marketing effectiveness",
          ],
        },
        {
          kind: "p",
          text: "Most browsers allow you to disable cookies through your browser settings, although doing so may affect certain website features.",
        },
      ],
    },
    {
      heading: "Payment Information",
      blocks: [
        { kind: "p", text: "Payments are processed through trusted third-party payment providers." },
        {
          kind: "strong",
          text: "Corner Bagel does not store complete payment card numbers on our servers.",
        },
      ],
    },
    {
      heading: "Sharing of Information",
      blocks: [
        { kind: "strong", text: "We do not sell your personal information." },
        {
          kind: "list",
          lead: "We may share information with trusted service providers that help us operate our business, including:",
          items: [
            "Payment processors",
            "Online ordering providers",
            "Delivery partners",
            "Email marketing platforms",
            "Website hosting providers",
            "Analytics providers",
            "Mapping and address lookup providers",
          ],
        },
        {
          kind: "p",
          text: "These providers are only permitted to use your information to perform services on our behalf. We may also disclose information if required by law or to protect our legal rights.",
        },
      ],
    },
    {
      heading: "Data Security",
      blocks: [
        {
          kind: "p",
          text: "We implement commercially reasonable administrative, technical, and physical safeguards designed to protect your information.",
        },
        {
          kind: "p",
          text: "While we strive to protect your information, no method of electronic transmission or storage is completely secure.",
        },
      ],
    },
    {
      heading: "Data Retention",
      blocks: [
        {
          kind: "list",
          lead: "We retain personal information only as long as necessary to:",
          items: [
            "Fulfill orders",
            "Provide requested services",
            "Meet legal and accounting requirements",
            "Resolve disputes",
            "Enforce our agreements",
          ],
        },
      ],
    },
    {
      heading: "Your Privacy Rights",
      blocks: [
        {
          kind: "list",
          lead: "Depending on your state or country of residence, you may have rights regarding your personal information, including to:",
          items: [
            "Access your information",
            "Correct inaccurate information",
            "Request deletion of personal information",
            "Request a copy of your information",
            "Opt out of certain marketing communications",
            "Limit our use of sensitive personal information, such as precise location",
          ],
        },
        { kind: "p", text: "To exercise these rights, please contact us at {email}." },
      ],
    },
    // Applicants are not customers, and the sections above are written about
    // customers. Somebody who fills in the form at /careers hands over more
    // about themselves than anybody who buys a bagel, gets nothing in return
    // yet, and in California has the same access and deletion rights — so the
    // document has to say what happens to it.
    {
      heading: "Job Applicants",
      blocks: [
        {
          kind: "p",
          text: "If you apply for a job with us, we collect what you enter on the application form: your name and contact details, the city you live in, the positions and availability you select, any school or work history and references you choose to add, and your written answers. We use it to decide whether to interview you, and for nothing else.",
        },
        {
          kind: "p",
          text: "We do not ask applicants about race, religion, age, disability, national origin, gender, sexual orientation, marital status, or veteran status, and we do not consider them. We do not run background checks through this form. If a background check ever becomes part of hiring, we will ask for your authorization separately and in writing, as federal law requires.",
        },
        {
          kind: "p",
          text: "Applications are delivered to our hiring email as a document. They are not added to any customer database and are not used for marketing. We keep them for up to one year and then delete them. Applicants have the same rights described above — access, correction, deletion, and a copy — and can exercise them by writing to {email}.",
        },
        {
          kind: "p",
          text: "While you are filling the form in, an unfinished draft is kept in your own browser so you can come back to it. It is not sent to us, it is deleted when you submit or if you leave it for fifteen minutes, and “Start over” on the form removes it at once. If you write your answers in a language other than English, we translate them so we can read them, and we keep what you actually wrote alongside the translation.",
        },
      ],
    },
    // ⚠️ The only thing in this app that publishes what somebody typed. Every
    // other section above describes data going *to* us — an order to the
    // kitchen, an application to an inbox. A note goes on a page every future
    // visitor can read, and a document that does not say so plainly is a
    // document that let somebody publish their own name without noticing.
    {
      heading: "Corner Notes",
      blocks: [
        {
          kind: "p",
          text: "Corner Notes is a public wall. If you leave one, the name, neighborhood, note and drawing you enter are shown on our website to anyone who visits it, right away and for as long as the note is up. Please treat it the way you would treat writing on a chalkboard in the shop: put nothing on it you would not want a stranger to read.",
        },
        {
          kind: "p",
          text: "All four fields are optional and all four are yours to make up. You do not need an account and we do not ask for your email, your address, or anything that identifies you. We do not store your IP address next to your note; our servers hold addresses briefly and separately, only to limit how many notes one person can leave in an hour.",
        },
        {
          kind: "p",
          text: "We may take a note down at any time, and we will take yours down if you ask. Because notes carry no account and no contact details, tell us enough to find it — roughly when you left it and what it said — and write to {email}. A note that is taken down stops being shown immediately.",
        },
      ],
    },
    {
      heading: "Children’s Privacy",
      blocks: [
        {
          kind: "p",
          text: "Our services are not directed toward children under 13 years of age, and we do not knowingly collect personal information from children. If we become aware that information from a child has been collected without appropriate consent, we will promptly delete it.",
        },
      ],
    },
    {
      heading: "Third-Party Links",
      blocks: [
        {
          kind: "p",
          text: "Our website may contain links to third-party websites or services. We are not responsible for the privacy practices or content of those third parties.",
        },
      ],
    },
    {
      heading: "Updates",
      blocks: [
        {
          kind: "p",
          text: "We may update this Privacy Policy from time to time. When changes are made, we will revise the Effective Date above. Continued use of our services after updates constitutes acceptance of the revised policy.",
        },
      ],
    },
    {
      heading: "Contact",
      blocks: [{ kind: "p", text: "Corner Bagel. Email: {email}" }],
    },
  ],
};

export const EN_POLICIES: PolicyPack = {
  cookie: enCookie,
  privacy: enPrivacy,
  goBack: "Go Back",
};

// Filled in per language by policyPacks.ts. Kept separate so this file stays
// the document and that one stays the translations.
export type PolicyPacks = Partial<Record<LocaleId, PolicyPack>>;
