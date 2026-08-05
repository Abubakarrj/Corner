import Link from "next/link";

// The cookie policy the banner's "consent" link points at. Structured to
// match /privacy-policy exactly — same shell, type scale, spacing, and
// "Go Back" footer — since the two are siblings and a visitor moving
// between them shouldn't feel like they've left the site.
//
// Content is the Corner Bagel Cookie Policy supplied by the business
// (Public Entity Holdings, last updated August 1, 2026), reproduced as
// written. Anything factual here — what cookies are set, whether analytics
// are live — is theirs to state, not something to infer from the code.
export const metadata = {
  title: "Cookie Policy — Corner Bagel",
  description:
    "How Corner Bagel uses cookies and similar tracking technologies on our website.",
};

const CONTACT_EMAIL = "support@publicentity.co";

// The four cookie categories from section 4, kept as data so the list markup
// stays one block rather than four near-identical copies.
const CATEGORIES = [
  {
    name: "Strictly Necessary",
    body: "Essential for security, session management, fraud prevention, checkout, and website functionality. No consent required.",
  },
  {
    name: "Functional",
    body: "Remember accessibility settings and ordering preferences. Consent required where applicable.",
  },
  {
    name: "Analytics",
    body: "Not currently active. If introduced, they will help us understand website usage and will only be enabled after obtaining consent.",
  },
  {
    name: "Advertising/Marketing",
    body: "Corner Bagel does not currently use advertising or marketing cookies.",
  },
];

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <h2 className="font-medium text-[18px] text-heading mb-3">{title}</h2>
      {children}
    </div>
  );
}

export default function CookiePolicyPage() {
  const sansStyle = {
    fontFamily: "var(--font-geist-sans), sans-serif",
  };

  return (
    <section
      // The bottom padding clears the cookie banner rather than matching the
      // top. The banner is fixed to the viewport bottom at ~100px tall on a
      // phone, and it's how visitors reach this page in the first place — so
      // it's up when they arrive, and with symmetric padding the "Go Back"
      // link at the foot of the page renders entirely behind it.
      className="min-h-screen w-full bg-page text-body px-6 pt-12 pb-[calc(9rem+env(safe-area-inset-bottom))] md:pt-20"
      style={sansStyle}
    >
      <div className="max-w-2xl mx-auto">
        <div className="mb-10 text-center">
          <h1 className="font-medium text-[32px] text-heading mb-2">
            Cookie Policy
          </h1>
          <p className="text-[14px]">Operated by Public Entity Holdings</p>
          <p className="text-[14px]">Last Updated: August 1, 2026</p>
        </div>

        <div className="text-[14px] leading-[160%] space-y-8 text-justify">
          <Section title="1. Introduction">
            <p>
              This Cookie Policy explains how Corner Bagel (“Corner Bagel,”
              “we,” “our,” or “us”), operated by Public Entity Holdings, uses
              cookies and similar tracking technologies on our website. This
              policy should be read together with our{" "}
              <Link
                href="/privacy-policy"
                className="underline hover:text-link transition-colors"
              >
                Privacy Policy
              </Link>
              .
            </p>
            <p className="mt-2">
              This policy is intended for visitors using our website in the
              United States, including California. Where required by applicable
              law, including the California Consumer Privacy Act (CCPA) as
              amended by the California Privacy Rights Act (CPRA), we will
              obtain consent before placing non-essential cookies.
            </p>
          </Section>

          <Section title="2. What Are Cookies?">
            <p>
              Cookies are small text files stored on your device when you visit
              our website. They help recognize your device, remember
              preferences, improve functionality, and support online ordering.
              Cookies may be session cookies or persistent cookies and may be
              first-party or third-party cookies.
            </p>
          </Section>

          <Section title="3. How We Use Cookies">
            <p>
              We use cookies to ensure our website functions correctly and
              securely; remember your preferences; personalize your experience;
              analyze website performance (if enabled in the future); and
              support online ordering services, including those powered by
              Toast. We do not use cookies to collect sensitive personal
              information beyond what is necessary to complete services you
              request.
            </p>
          </Section>

          <Section title="4. Categories of Cookies We Use">
            <div className="space-y-3">
              {CATEGORIES.map((category) => (
                <p key={category.name}>
                  <span className="font-medium text-heading">
                    {category.name}:
                  </span>{" "}
                  {category.body}
                </p>
              ))}
            </div>
          </Section>

          <Section title="5. Strictly Necessary Cookies">
            <p>
              These cookies are required for browsing the website, viewing
              menus, submitting contact forms, and completing online orders.
              Without these cookies, requested services cannot be provided.
            </p>
          </Section>

          <Section title="6. Functional Cookies">
            <p>
              Functional cookies remember your preferences and enhance your
              experience. These cookies do not track activity across other
              websites and are only used where permitted by law.
            </p>
          </Section>

          <Section title="7. Analytics Cookies">
            <p>
              Corner Bagel does not currently use analytics cookies. If
              analytics tools are added in the future, visitors will be notified
              and provided an opportunity to consent before activation.
            </p>
          </Section>

          <Section title="8. Advertising and Marketing Cookies">
            <p>
              Corner Bagel does not currently place advertising or retargeting
              cookies. We do not sell personal information collected through
              cookies for advertising purposes.
            </p>
          </Section>

          <Section title="9. Third-Party Cookies">
            <p>
              Our website may use third-party services, including Toast for
              online ordering. These providers may place their own cookies
              subject to their own privacy and cookie policies.
            </p>
          </Section>

          <Section title="10. Toast Ordering">
            <p>
              When you use the online ordering platform powered by Toast, Toast
              may place cookies necessary to operate the ordering experience.
              Toast’s privacy and cookie practices are governed by Toast’s own
              policies. Corner Bagel encourages customers to review those
              policies before placing an order.
            </p>
          </Section>

          <Section title="11. Managing Cookie Preferences">
            <p>
              You may accept, reject, or customize non-essential cookies using
              our cookie banner. Preferences may be changed at any time.
            </p>
          </Section>

          <Section title="12. Browser Controls">
            <p>
              Most browsers allow you to block or delete cookies. Blocking
              strictly necessary cookies may prevent portions of the website,
              including online ordering, from functioning correctly.
            </p>
          </Section>

          <Section title="13. Consent and Withdrawal">
            <p>
              Where required by law, we obtain consent before placing
              non-essential cookies. Consent may be withdrawn at any time
              through the cookie preference center or browser settings.
            </p>
          </Section>

          <Section title="14. Data Sharing">
            <p>
              We may share cookie-related information with trusted service
              providers that help operate our website or process online orders,
              including Toast, or when required by law. We do not sell personal
              information collected through cookies.
            </p>
          </Section>

          <Section title="15. Changes">
            <p>
              We may update this Cookie Policy from time to time. Material
              changes will be reflected by updating the Last Updated date.
            </p>
          </Section>

          <Section title="16. Contact Information">
            <p>
              Corner Bagel
              <br />
              Operated by Public Entity Holdings
              <br />
              Email:{" "}
              <a
                href={`mailto:${CONTACT_EMAIL}`}
                className="underline hover:text-link transition-colors"
              >
                {CONTACT_EMAIL}
              </a>
            </p>
            <p className="mt-2">
              If you have questions regarding this Cookie Policy or your privacy
              rights, please contact us using the email above.
            </p>
          </Section>
        </div>

        <div className="mt-12 text-center pt-8 border-t border-gray-100">
          <Link href="/" className="font-medium text-heading hover:underline">
            &larr; Go Back
          </Link>
        </div>
      </div>
    </section>
  );
}
