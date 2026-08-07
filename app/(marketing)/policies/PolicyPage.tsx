"use client";

import Link from "next/link";
import { useLocale } from "../../i18n";
import { EN_POLICIES, POLICY_EMAIL, PRIVACY_EMAIL, type Policy, type PolicyBlock } from "./policy";
import { POLICY_PACKS } from "./policyPacks";

// The shell both legal pages share: title, dated header, sections, and the
// "Go Back" link at the foot.
//
// One component rather than two nearly identical ones — the two documents were
// already built to match each other exactly ("a visitor moving between them
// shouldn't feel like they've left the site"), and keeping that true by
// copying the markup is how it stops being true.

// What the two tokens the prose can carry render as. Threaded through as a
// prop rather than read from a module variable: the privacy label depends on
// which language is on, and a value written during one render and read during
// another is the kind of thing that shows the wrong language for one frame.
type Links = {
  email: string;
  // The other document's own title, so the cookie policy's link to it reads
  // the way that page's heading does.
  privacyLabel: string;
};

// {privacyPolicy} and {email} are the only markup the prose carries. Split on
// them rather than storing HTML, so a translation is a sentence and never a
// tag a translator has to keep balanced.
function Prose({ text, links }: { text: string; links: Links }) {
  const parts = text.split(/(\{privacyPolicy\}|\{email\})/g);
  return (
    <>
      {parts.map((part, index) => {
        if (part === "{privacyPolicy}") {
          return (
            <Link
              key={index}
              href="/privacy-policy"
              className="underline hover:text-link transition-colors"
            >
              {links.privacyLabel}
            </Link>
          );
        }
        if (part === "{email}") {
          return (
            <a
              key={index}
              href={`mailto:${links.email}`}
              className="underline hover:text-link transition-colors"
            >
              {links.email}
            </a>
          );
        }
        return <span key={index}>{part}</span>;
      })}
    </>
  );
}

function Block({ block, links }: { block: PolicyBlock; links: Links }) {
  if (block.kind === "p") {
    return (
      <p className="mt-2 first:mt-0">
        <Prose text={block.text} links={links} />
      </p>
    );
  }
  if (block.kind === "strong") {
    return (
      <p className="mt-2 font-medium text-heading first:mt-0">
        <Prose text={block.text} links={links} />
      </p>
    );
  }
  if (block.kind === "kv") {
    return (
      <div className="space-y-3">
        {block.items.map((item) => (
          <p key={item.label}>
            <span className="font-medium text-heading">{item.label}:</span> {item.text}
          </p>
        ))}
      </div>
    );
  }
  return (
    <div className="mt-4 first:mt-0">
      {block.heading ? (
        <h3 className="font-medium text-heading mb-1">{block.heading}</h3>
      ) : null}
      {block.lead ? <p>{block.lead}</p> : null}
      <ul className="list-disc ps-5 space-y-1 mt-1">
        {block.items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
  );
}

export default function PolicyPage({ which }: { which: "cookie" | "privacy" }) {
  const locale = useLocale();
  const pack = POLICY_PACKS[locale] ?? EN_POLICIES;
  const policy: Policy = pack[which];
  const links: Links = {
    email: which === "cookie" ? POLICY_EMAIL : PRIVACY_EMAIL,
    privacyLabel: pack.privacy.title,
  };

  return (
    <section
      // The bottom padding clears the cookie banner rather than matching the
      // top. The banner is fixed to the viewport bottom at ~100px tall on a
      // phone, and it's how visitors reach the cookie policy in the first
      // place — so it's up when they arrive, and with symmetric padding the
      // "Go Back" link at the foot renders entirely behind it.
      className="min-h-screen w-full bg-page text-body px-6 pt-12 pb-[calc(9rem+env(safe-area-inset-bottom))] md:pt-20"
      style={{ fontFamily: "var(--font-geist-sans), sans-serif" }}
    >
      <div className="max-w-2xl mx-auto">
        <div className="mb-10 text-center">
          <h1 className="font-medium text-[32px] text-heading mb-2">{policy.title}</h1>
          {policy.meta.map((line) => (
            <p key={line} className="text-[14px]">
              {line}
            </p>
          ))}
        </div>

        {/* Said before the document, not after it: a translation of a legal
            notice is a reading aid, and which version governs is the first
            thing somebody relying on it needs to know. Absent in English,
            which is the version being referred to. */}
        {pack.governedBy ? (
          <p className="mb-8 rounded-xl border border-line-soft px-4 py-3 text-[13px] leading-[1.5] text-muted">
            {pack.governedBy}
          </p>
        ) : null}

        {/* text-justify only in scripts that have word spaces to stretch.
            Justifying Japanese, Chinese or Burmese is the browser pulling
            characters apart, and it reads as broken type rather than as a
            tidy right edge. */}
        <div
          className={`text-[14px] leading-[160%] space-y-8 ${
            ["ja", "zh", "my"].includes(locale) ? "" : "text-justify"
          }`}
        >
          {policy.intro.map((block, index) => (
            <Block key={index} block={block} links={links} />
          ))}

          {policy.sections.map((section) => (
            <div key={section.heading}>
              <h2 className="font-medium text-[18px] text-heading mb-3">{section.heading}</h2>
              {section.blocks.map((block, index) => (
                <Block key={index} block={block} links={links} />
              ))}
            </div>
          ))}
        </div>

        <div className="mt-12 text-center pt-8 border-t border-line-faint">
          <Link href="/" className="font-medium text-heading hover:underline">
            &larr; {pack.goBack}
          </Link>
        </div>
      </div>
    </section>
  );
}
