import Link from "next/link";

export default function PrivacyPolicyPage() {
  const sansStyle = {
    fontFamily: "var(--font-geist-sans), sans-serif",
  };

  return (
    <section
      className="min-h-screen w-full bg-white text-[#575757] px-6 py-12 md:py-20"
      style={sansStyle}
    >
      <div className="max-w-2xl mx-auto">
        {/* --- PRIVACY POLICY SECTION --- */}
        <div id="privacy" className="scroll-mt-10">
          <div className="mb-10 text-center">
            <h1 className="font-semibold text-[32px] text-[#2D2D2D] mb-2">
              Privacy Policy
            </h1>
            <p className="text-[14px]">Effective Date: July 8, 2026</p>
          </div>

          <div className="text-[14px] leading-[160%] space-y-8 text-justify">
            <p>
              At Corner Bagel (“Corner Bagel,” “we,” “our,” or “us”), we respect
              your privacy. This policy explains how we collect, use, disclose,
              and safeguard information when you visit our website, place an
              order, join our mailing list, participate in promotions, or
              otherwise interact with our business.
            </p>
            <p className="font-semibold text-[#2D2D2D]">
              By using our website or services, you agree to this Privacy Policy.
            </p>

            <div>
              <h2 className="font-semibold text-[18px] text-[#2D2D2D] mb-3">
                Information We Collect
              </h2>
              <div className="space-y-4">
                <div>
                  <h3 className="font-semibold text-[#2D2D2D] mb-1">
                    Information You Provide
                  </h3>
                  <p>We may collect:</p>
                  <ul className="list-disc pl-5 space-y-1 mt-1">
                    <li>Name</li>
                    <li>Email address</li>
                    <li>Phone number</li>
                    <li>Billing and payment information</li>
                    <li>Delivery or pickup information</li>
                    <li>Order history</li>
                    <li>Loyalty or rewards account information (if applicable)</li>
                  </ul>
                </div>
                <div>
                  <h3 className="font-semibold text-[#2D2D2D] mb-1">
                    Information Collected Automatically
                  </h3>
                  <p>When you visit our website, we may collect:</p>
                  <ul className="list-disc pl-5 space-y-1 mt-1">
                    <li>IP address</li>
                    <li>Browser type</li>
                    <li>Device information</li>
                    <li>Operating system</li>
                    <li>Pages visited</li>
                    <li>Time spent on our website</li>
                    <li>Referring websites</li>
                    <li>Cookies and similar technologies</li>
                  </ul>
                </div>
              </div>
            </div>

            <div>
              <h2 className="font-semibold text-[18px] text-[#2D2D2D] mb-3">
                How We Use Your Information
              </h2>
              <p>We use your information to:</p>
              <ul className="list-disc pl-5 space-y-1 mt-1">
                <li>Process and fulfill orders</li>
                <li>Communicate regarding your orders</li>
                <li>Provide customer support</li>
                <li>Improve our products and services</li>
                <li>Personalize your experience</li>
                <li>Send newsletters, promotions, and special offers (when you opt in)</li>
                <li>Operate loyalty or rewards programs</li>
                <li>Prevent fraud and maintain security</li>
                <li>Comply with legal obligations</li>
              </ul>
            </div>

            <div>
              <h2 className="font-semibold text-[18px] text-[#2D2D2D] mb-3">
                Marketing Communications
              </h2>
              <p>
                If you subscribe to our mailing list, we may send updates
                regarding:
              </p>
              <ul className="list-disc pl-5 space-y-1 mt-1">
                <li>New menu items</li>
                <li>Seasonal offerings</li>
                <li>Promotions</li>
                <li>Events</li>
                <li>Store announcements</li>
              </ul>
              <p className="mt-2">
                You may unsubscribe at any time by clicking the unsubscribe link
                included in our emails.
              </p>
            </div>

            <div>
              <h2 className="font-semibold text-[18px] text-[#2D2D2D] mb-3">
                Cookies & Tracking
              </h2>
              <p>Our website may use cookies and similar technologies to:</p>
              <ul className="list-disc pl-5 space-y-1 mt-1">
                <li>Remember user preferences</li>
                <li>Improve website functionality</li>
                <li>Analyze website traffic</li>
                <li>Measure marketing effectiveness</li>
              </ul>
              <p className="mt-2">
                Most browsers allow you to disable cookies through your browser
                settings, although doing so may affect certain website features.
              </p>
            </div>

            <div>
              <h2 className="font-semibold text-[18px] text-[#2D2D2D] mb-3">
                Payment Information
              </h2>
              <p>
                Payments are processed through trusted third-party payment
                providers.
              </p>
              <p className="mt-2 font-semibold text-[#2D2D2D]">
                Corner Bagel does not store complete payment card numbers on our
                servers.
              </p>
            </div>

            <div>
              <h2 className="font-semibold text-[18px] text-[#2D2D2D] mb-3">
                Sharing of Information
              </h2>
              <p className="font-semibold text-[#2D2D2D]">
                We do not sell your personal information.
              </p>
              <p className="mt-2">
                We may share information with trusted service providers that help
                us operate our business, including:
              </p>
              <ul className="list-disc pl-5 space-y-1 mt-1">
                <li>Payment processors</li>
                <li>Online ordering providers</li>
                <li>Delivery partners</li>
                <li>Email marketing platforms</li>
                <li>Website hosting providers</li>
                <li>Analytics providers</li>
              </ul>
              <p className="mt-2">
                These providers are only permitted to use your information to
                perform services on our behalf. We may also disclose information
                if required by law or to protect our legal rights.
              </p>
            </div>

            <div>
              <h2 className="font-semibold text-[18px] text-[#2D2D2D] mb-3">
                Data Security
              </h2>
              <p>
                We implement commercially reasonable administrative, technical,
                and physical safeguards designed to protect your information.
              </p>
              <p className="mt-2">
                While we strive to protect your information, no method of
                electronic transmission or storage is completely secure.
              </p>
            </div>

            <div>
              <h2 className="font-semibold text-[18px] text-[#2D2D2D] mb-3">
                Data Retention
              </h2>
              <p>We retain personal information only as long as necessary to:</p>
              <ul className="list-disc pl-5 space-y-1 mt-1">
                <li>Fulfill orders</li>
                <li>Provide requested services</li>
                <li>Meet legal and accounting requirements</li>
                <li>Resolve disputes</li>
                <li>Enforce our agreements</li>
              </ul>
            </div>

            <div>
              <h2 className="font-semibold text-[18px] text-[#2D2D2D] mb-3">
                Your Privacy Rights
              </h2>
              <p>
                Depending on your state or country of residence, you may have
                rights regarding your personal information, including to:
              </p>
              <ul className="list-disc pl-5 space-y-1 mt-1">
                <li>Access your information</li>
                <li>Correct inaccurate information</li>
                <li>Request deletion of personal information</li>
                <li>Request a copy of your information</li>
                <li>Opt out of certain marketing communications</li>
              </ul>
              <p className="mt-2">
                To exercise these rights, please contact us at{" "}
                <a
                  href="mailto:cornerbagel@publicentity.co"
                  className="underline hover:text-[#062CB3] transition-colors"
                >
                  cornerbagel@publicentity.co
                </a>
                .
              </p>
            </div>

            <div>
              <h2 className="font-semibold text-[18px] text-[#2D2D2D] mb-3">
                Children’s Privacy
              </h2>
              <p>
                Our services are not directed toward children under 13 years of
                age, and we do not knowingly collect personal information from
                children. If we become aware that information from a child has
                been collected without appropriate consent, we will promptly
                delete it.
              </p>
            </div>

            <div>
              <h2 className="font-semibold text-[18px] text-[#2D2D2D] mb-3">
                Third-Party Links
              </h2>
              <p>
                Our website may contain links to third-party websites or
                services. We are not responsible for the privacy practices or
                content of those third parties.
              </p>
            </div>

            <div>
              <h2 className="font-semibold text-[18px] text-[#2D2D2D] mb-3">
                Updates
              </h2>
              <p>
                We may update this Privacy Policy from time to time. When changes
                are made, we will revise the Effective Date above. Continued use
                of our services after updates constitutes acceptance of the
                revised policy.
              </p>
            </div>

            <div>
              <h2 className="font-semibold text-[18px] text-[#2D2D2D] mb-3">
                Contact
              </h2>
              <p>
                Corner Bagel
                <br />
                Email:{" "}
                <a
                  href="mailto:cornerbagel@publicentity.co"
                  className="underline hover:text-[#062CB3] transition-colors"
                >
                  cornerbagel@publicentity.co
                </a>
              </p>
            </div>
          </div>
        </div>

        <div className="mt-12 text-center pt-8 border-t border-gray-100">
          <Link
            href="/"
            className="font-semibold text-[#2D2D2D] hover:underline"
          >
            &larr; Go Back
          </Link>
        </div>
      </div>
    </section>
  );
}
