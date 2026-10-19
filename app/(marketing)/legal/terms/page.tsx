import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage } from "@/components/legal/LegalPage";
import { LEGAL } from "@/lib/legal";
import { pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata({
  title: "Terms of use",
  description: "The rules for using DuMeGud: creating a page, sending gifts, buying digital products and withdrawing money.",
  path: "/legal/terms",
});

// Draft for legal review (implementation.md Phase 10, "Legal & content"). Plain English on
// purpose: most people reading this are on a phone and new to paying creators online.
export default function TermsPage() {
  const mail = `mailto:${LEGAL.contactEmail}`;
  return (
    <LegalPage
      title="Terms of use"
      intro={
        <p>
          These terms explain how DuMeGud works and what we expect from everyone who uses it. Please read them. By using
          DuMeGud, you agree to them.
        </p>
      }
      sections={[
        {
          id: "about",
          title: "About DuMeGud",
          body: (
            <>
              <p>
                DuMeGud lets creators in {LEGAL.country} make a page where fans can send them gifts and buy their digital
                work, using Orange Money or AfriMoney. DuMeGud is owned and run by {LEGAL.operator}, a company registered in{" "}
                {LEGAL.country} (&quot;we&quot;, &quot;us&quot;).
              </p>
              <p>
                Our <Link href="/legal/privacy">privacy policy</Link> explains how we handle your information. Creators also
                agree to the <Link href="/legal/creator-terms">creator terms</Link>.
              </p>
            </>
          ),
        },
        {
          id: "who",
          title: "Who can use DuMeGud",
          body: (
            <ul>
              <li>You must be at least 18 to create a creator page or withdraw money.</li>
              <li>If you are under 18, you need a parent or guardian&apos;s permission to send a gift or buy something.</li>
              <li>You can&apos;t use DuMeGud if we have closed your account before, or if the law doesn&apos;t allow you to.</li>
            </ul>
          ),
        },
        {
          id: "account",
          title: "Your account",
          body: (
            <ul>
              <li>Give us true information and keep it up to date.</li>
              <li>An account is for one person. Don&apos;t share it or sell it.</li>
              <li>Keep your password safe. You are responsible for what happens in your account.</li>
              <li>Tell us straight away if you think someone else has used your account.</li>
            </ul>
          ),
        },
        {
          id: "gifts",
          title: "Sending a gift",
          body: (
            <>
              <p>
                A gift is a voluntary way to support a creator. It is not a purchase, so the creator doesn&apos;t owe you a
                product, a service or a reply.
              </p>
              <ul>
                <li>You see the amount, and what the creator receives after fees, before you send.</li>
                <li>Gifts can&apos;t be reversed once the mobile money transfer goes through.</li>
                <li>
                  If you were charged by mistake, charged twice, or think the page is a scam, contact us at{" "}
                  <a href={mail}>{LEGAL.contactEmail}</a> or <Link href="/report">report it</Link>. We&apos;ll look into it
                  and refund you where that&apos;s fair or the law requires it.
                </li>
                <li>
                  Your name, message and social username are only shown if you choose to share them. Amounts are never
                  shown publicly.
                </li>
              </ul>
            </>
          ),
        },
        {
          id: "buying",
          title: "Buying digital products",
          body: (
            <>
              <p>
                When you buy a file, you get a licence to use it as described on the product page. You don&apos;t own the
                work itself, and you can&apos;t resell or share it unless the product page says you can.
              </p>
              <ul>
                <li>The product page shows the price, file format, licence, download limit and how long you have access.</li>
                <li>We send a link to your downloads by email. Keep it private, because anyone with the link can use it.</li>
                <li>Some PDFs are stamped with your order number to discourage sharing.</li>
                <li>
                  If a file doesn&apos;t open or isn&apos;t what the product page described, contact us within 7 days of buying
                  it. We&apos;ll help, which may mean a refund.
                </li>
              </ul>
            </>
          ),
        },
        {
          id: "creators",
          title: "Creators and withdrawals",
          body: (
            <ul>
              <li>Only sell work you made or have the right to sell.</li>
              <li>
                Before you can withdraw, we check your ID once, and your mobile money number must be registered in your own
                name.
              </li>
              <li>
                We may pause or review a withdrawal to protect you, your fans or us, for example after a number change or if
                something looks unusual. We&apos;ll tell you when we do.
              </li>
              <li>You are responsible for any tax on the money you receive.</li>
            </ul>
          ),
        },
        {
          id: "fees",
          title: "Fees",
          body: (
            <p>
              Making a page is free. We take a share of each gift and sale, and there is a fee on each withdrawal. Current
              fees are on our <Link href="/pricing">fees page</Link> and are always shown before anyone pays. If fees change,
              we&apos;ll tell creators at least 14 days before.
            </p>
          ),
        },
        {
          id: "rules",
          title: "What you can't do",
          body: (
            <>
              <p>Don&apos;t use DuMeGud to:</p>
              <ul>
                <li>break the law, or help someone else break it</li>
                <li>sell or share work that belongs to someone else</li>
                <li>pretend to be another person, creator or organisation</li>
                <li>trick people into sending money, or raise money for a false cause</li>
                <li>move money for someone else, or hide where money came from</li>
                <li>share sexual content involving anyone under 18, or any content that exploits children</li>
                <li>threaten, harass or encourage violence or hate against anyone</li>
                <li>spread malware, or try to break into accounts or our systems</li>
                <li>send gifts to yourself or fake activity on a page</li>
              </ul>
            </>
          ),
        },
        {
          id: "content",
          title: "Your content",
          body: (
            <p>
              You keep ownership of what you upload: your photo, bio, files and messages. You let us host, show and copy it
              as needed to run DuMeGud, and to show your page and products when we promote DuMeGud. This ends when you
              delete the content or your account, apart from copies we must keep by law.
            </p>
          ),
        },
        {
          id: "reports",
          title: "Reports and removals",
          body: (
            <p>
              Anyone can <Link href="/report">report a page or product</Link>. We may remove content, hold money or suspend
              an account that breaks these terms or the law. When we act on a report about you, we&apos;ll tell you why and
              how to appeal, unless the law stops us.
            </p>
          ),
        },
        {
          id: "payments",
          title: "Payment partners",
          body: (
            <p>
              Gifts, sales and withdrawals are processed by our payment partner Monime and your mobile money operator. Their
              terms also apply. We never see or store your mobile money PIN.
            </p>
          ),
        },
        {
          id: "closing",
          title: "Closing an account",
          body: (
            <>
              <p>
                Creators can delete their account from Settings. First withdraw everything in your wallet: we won&apos;t
                delete an account that still has money in it. If only a few cents are left, too little to send, you can
                choose to give them up.
              </p>
              <p>
                Your page goes offline straight away. You then have 30 days to change your mind by signing in. After that,
                your personal details are deleted and your handle becomes free for someone else. People who bought your
                products keep their downloads until their access ends. Some records stay because the law says we must keep
                them (see the <Link href="/legal/privacy">privacy policy</Link>).
              </p>
              <p>
                If your account is under review, contact us to close it. We may close an account that breaks these terms.
              </p>
            </>
          ),
        },
        {
          id: "liability",
          title: "Our responsibility",
          body: (
            <>
              <p>
                We work hard to keep DuMeGud running and your money safe, but we can&apos;t promise it will always be
                available or free of errors. Creators are responsible for what they offer and say.
              </p>
              <p>
                As far as the law allows, we are not responsible for indirect losses, and our total responsibility to you is
                limited to the fees we earned from you in the 12 months before the problem. Nothing in these terms takes
                away rights you have by law.
              </p>
            </>
          ),
        },
        {
          id: "changes",
          title: "Changes to these terms",
          body: (
            <p>
              We may update these terms as DuMeGud grows. If a change matters, we&apos;ll email account holders before it
              takes effect. The date at the top shows the latest version.
            </p>
          ),
        },
        {
          id: "law",
          title: "Law and disputes",
          body: (
            <p>
              These terms are governed by the laws of {LEGAL.country}. If you have a problem, please talk to us first at{" "}
              <a href={mail}>{LEGAL.contactEmail}</a>. If we can&apos;t sort it out, the courts of {LEGAL.country} decide.
            </p>
          ),
        },
        {
          id: "contact",
          title: "Contact us",
          body: (
            <p>
              {LEGAL.operator}, {LEGAL.country}. Email <a href={mail}>{LEGAL.contactEmail}</a>.
            </p>
          ),
        },
      ]}
    />
  );
}
