import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage } from "@/components/legal/LegalPage";
import { LEGAL } from "@/lib/legal";
import { pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata({
  title: "Privacy policy",
  description: "What DuMeGud collects, why, who we share it with, and the choices you have.",
  path: "/legal/privacy",
});

// Draft for legal review. Every item below matches what the app actually stores and sends: if a
// feature starts collecting something new, add it here in the same change.
export default function PrivacyPage() {
  const mail = `mailto:${LEGAL.contactEmail}`;
  return (
    <LegalPage
      title="Privacy policy"
      intro={
        <p>
          This policy explains what information DuMeGud collects, why we need it, who we share it with and what you can
          ask us to do with it. We only collect what we need to run DuMeGud and keep money safe. We never sell your
          information.
        </p>
      }
      sections={[
        {
          id: "who",
          title: "Who we are",
          body: (
            <p>
              DuMeGud is run by {LEGAL.operator}, {LEGAL.country}. We decide how your information is used. You can reach us
              at <a href={mail}>{LEGAL.contactEmail}</a>.
            </p>
          ),
        },
        {
          id: "creators",
          title: "If you are a creator",
          body: (
            <ul>
              <li>Your name, email address and password. We store the password only in a scrambled form we can&apos;t read.</li>
              <li>If you sign in with Google: your name, email address and Google account ID.</li>
              <li>Your page: handle, display name, photo, bio, category and social links.</li>
              <li>
                ID check: your legal name, date of birth, ID type and number, photos of your ID and a selfie holding it. Your
                name and date of birth are encrypted. Your ID number is kept only as a one-way code, so we can stop the same
                ID being used twice.
              </li>
              <li>Your mobile money number and the name registered to it, which we get from Monime to check it&apos;s yours.</li>
              <li>Your balance, gifts, sales and withdrawals.</li>
              <li>The products and files you upload.</li>
            </ul>
          ),
        },
        {
          id: "supporters",
          title: "If you send a gift",
          body: (
            <ul>
              <li>The amount and the creator you supported.</li>
              <li>Your name and message, only if you add them.</li>
              <li>Your social username, only if you agree to a shout-out.</li>
              <li>
                Payment details from Monime: the mobile money operator, a transaction reference and a one-way code that lets
                us group gifts from the same number without storing the number. We never receive your PIN.
              </li>
              <li>Which share link or app brought you to the page.</li>
            </ul>
          ),
        },
        {
          id: "buyers",
          title: "If you buy a product",
          body: (
            <ul>
              <li>Your email address (encrypted) and name, so we can send your downloads and help you find them later.</li>
              <li>What you bought, when, and how many times you downloaded it.</li>
              <li>The same payment details from Monime as for a gift.</li>
            </ul>
          ),
        },
        {
          id: "everyone",
          title: "From everyone",
          body: (
            <ul>
              <li>
                Your IP address and browser details, used to stop abuse and fraud. When we store an IP address, we keep only
                a one-way code, not the address itself.
              </li>
              <li>Reports you send us about a page or product.</li>
              <li>Emails you send us.</li>
            </ul>
          ),
        },
        {
          id: "why",
          title: "Why we use it",
          body: (
            <ul>
              <li>To run your account, your page and your shop.</li>
              <li>To process gifts, sales and withdrawals with Monime.</li>
              <li>To check identities and mobile money numbers, and to prevent fraud, scams and money laundering.</li>
              <li>To send emails you need: sign-in links, receipts, download links and account notices.</li>
              <li>To keep DuMeGud secure and working, and to fix problems.</li>
              <li>To meet our legal duties, including record keeping and lawful requests from authorities.</li>
            </ul>
          ),
        },
        {
          id: "public",
          title: "What other people can see",
          body: (
            <ul>
              <li>A creator&apos;s page, photo, bio, links and products are public.</li>
              <li>
                Supporters&apos; names appear on a creator&apos;s page only if they chose to share them. If you hide your name,
                you are never named.
              </li>
              <li>Gift amounts are never shown publicly, including in &quot;top supporters&quot;.</li>
              <li>A creator can see the names and messages supporters chose to share with them.</li>
              <li>We never show anyone&apos;s ID documents, mobile money number or email address on a public page.</li>
            </ul>
          ),
        },
        {
          id: "sharing",
          title: "Who we share it with",
          body: (
            <>
              <p>Only with companies that help us run DuMeGud, and only what each one needs:</p>
              <ul>
                <li>Monime and mobile money operators (Orange Money, AfriMoney), to move money and check number owners.</li>
                <li>Cloudflare, to store files and photos and to send email.</li>
                <li>Neon, which hosts our database.</li>
                <li>Vercel, which hosts the website and helps block bots and attacks.</li>
                <li>Upstash, to limit repeated attempts (it sees one-way codes, not your details).</li>
                <li>Google, only if you choose to sign in with Google.</li>
              </ul>
              <p>
                We share information with the police, courts or regulators only when the law requires it. Some of these
                companies store data outside {LEGAL.country}; we choose providers that protect it.
              </p>
            </>
          ),
        },
        {
          id: "cookies",
          title: "Cookies",
          body: (
            <>
              <p>We only use cookies DuMeGud needs to work. There are no advertising or tracking cookies.</p>
              <ul>
                <li>A sign-in cookie that keeps you logged in.</li>
                <li>A short-lived cookie that lets you add your name or username right after sending a gift.</li>
                <li>A short-lived cookie that opens your downloads right after you buy something.</li>
                <li>A security cookie for our staff when they make sensitive changes.</li>
              </ul>
            </>
          ),
        },
        {
          id: "keeping",
          title: "How long we keep it",
          body: (
            <ul>
              <li>
                Account and page details: while your account is open. When you delete your account, they are erased 30 days
                later, unless you change your mind before then.
              </li>
              <li>ID photos: deleted when your account is erased. We keep a record of the check itself.</li>
              <li>Records of gifts, sales and withdrawals: as long as the law requires for financial records.</li>
              <li>Security logs: only as long as needed to investigate abuse.</li>
            </ul>
          ),
        },
        {
          id: "security",
          title: "How we protect it",
          body: (
            <p>
              Sensitive details are encrypted. ID documents are kept in private storage that only our verification team can
              open, and every time staff view them is logged. Connections to DuMeGud are encrypted. No system is perfect, so
              if something goes wrong we&apos;ll tell affected people and the authorities as the law requires.
            </p>
          ),
        },
        {
          id: "rights",
          title: "Your choices",
          body: (
            <>
              <p>You can ask us to:</p>
              <ul>
                <li>give you a copy of the information we hold about you</li>
                <li>correct anything that is wrong</li>
                <li>delete your information or close your account</li>
                <li>stop using your information for something you object to</li>
              </ul>
              <p>
                Email <a href={mail}>{LEGAL.contactEmail}</a>. We&apos;ll reply within 30 days. We may need to check it&apos;s
                really you first, and we may have to keep some records by law. You can edit your page at any time from your
                dashboard, and you can choose to stay anonymous when you send a gift.
              </p>
            </>
          ),
        },
        {
          id: "children",
          title: "Children",
          body: (
            <p>
              DuMeGud is not for children under 13. Creators must be 18 or over. If you think a child has given us
              information, tell us and we&apos;ll delete it.
            </p>
          ),
        },
        {
          id: "changes",
          title: "Changes to this policy",
          body: (
            <p>
              If we change how we use your information in a way that matters, we&apos;ll email account holders before it
              happens. The date at the top shows the latest version. See also our <Link href="/legal/terms">terms of use</Link>.
            </p>
          ),
        },
      ]}
    />
  );
}
