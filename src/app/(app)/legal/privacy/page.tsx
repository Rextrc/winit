import type { Metadata } from "next";
import Link from "next/link";
import { pageMetadata } from "@/lib/metadata";
import { LegalPage, Section } from "@/components/legal/LegalPage";

export const metadata: Metadata = pageMetadata(
  "Privacy Policy",
  "What WinIt collects, why, and how it's used — no data is ever sold.",
);

const UPDATED = "September 28, 2026";

export default function PrivacyPage() {
  return (
    <LegalPage
      title="Privacy Policy"
      updated={UPDATED}
      intro={
        <>
          This describes what information WinIt collects when you use it, why, and what we do with it. WinIt
          involves no real money, so there&apos;s no payment or financial data to collect — everything below is
          account and gameplay information.
        </>
      }
    >
      <Section title="1. Information we collect">
        <p>
          <strong className="text-slate-200">Account information:</strong> the username and password you choose, and
          an email address if you provide one (it&apos;s optional, used only for account recovery and account-related
          notices).
        </p>
        <p>
          <strong className="text-slate-200">Gameplay data:</strong> your play-money balance, bet history, game
          results, level and progression, achievements, and chat messages you post in the lobby.
        </p>
        <p>
          <strong className="text-slate-200">Technical information:</strong> the IP address your account was created
          from, used only to detect referral and bonus abuse (for example, the same person creating multiple
          accounts). Standard server logs may also record IP addresses and browser information for security and
          debugging.
        </p>
        <p>
          <strong className="text-slate-200">Cookies:</strong> a session cookie that keeps you signed in. It&apos;s
          required for the app to work and isn&apos;t used for tracking across other sites.
        </p>
        <p>We don&apos;t collect payment information, because WinIt never processes real money.</p>
      </Section>

      <Section title="2. How we use it">
        <ul className="list-disc space-y-1 pl-5">
          <li>To run your account and keep your progress and balance</li>
          <li>To keep the game fair — detecting bots, multi-accounting, and bonus or referral abuse</li>
          <li>To moderate chat and enforce the Terms of Service</li>
          <li>To send account-related messages to an email address you&apos;ve provided, if any</li>
          <li>To fix bugs and keep the service running</li>
        </ul>
      </Section>

      <Section title="3. What we don't do">
        <p>
          We do not sell your information. We do not share it with advertisers or data brokers. WinIt currently shows
          no third-party ads and no analytics scripts. If that changes, we&apos;ll update this policy first and name
          the providers involved — a service like that (for example, Google AdSense) would set its own cookies and
          has its own privacy policy governing that data.
        </p>
      </Section>

      <Section title="4. Who can see it">
        <p>
          Your username, level, and public activity (like chat messages and win shares) are visible to other
          players, the same as in any multiplayer app. Your email, password, balance history, and IP address are not
          shown to other players.
        </p>
        <p>
          Staff accounts can view account details to moderate the platform and respond to support requests. We may
          disclose information if required by law.
        </p>
        <p>
          We use third-party infrastructure to run WinIt — hosting and, if you provide an email, an email-delivery
          service. These providers process data only to provide that infrastructure, not for their own purposes.
        </p>
      </Section>

      <Section title="5. How long we keep it">
        <p>
          We keep account and gameplay data for as long as your account is active. If you ask us to delete your
          account, we&apos;ll remove or anonymize personal information, though some records (like a moderation
          history tied to enforcement actions) may be retained for a reasonable period.
        </p>
      </Section>

      <Section title="6. Children's privacy">
        <p>
          WinIt is not directed at, and is not intended for, anyone under 18. We don&apos;t knowingly collect
          information from anyone under that age. If you believe a minor has created an account, contact us and
          we&apos;ll remove it.
        </p>
      </Section>

      <Section title="7. Your choices">
        <p>
          You can update your email in Settings at any time. To request a copy of your data or ask us to delete your
          account, contact us using the details below.
        </p>
      </Section>

      <Section title="8. Security">
        <p>
          Passwords are hashed, never stored in plain text. We take reasonable measures to protect your information,
          but no online service can guarantee absolute security.
        </p>
      </Section>

      <Section title="9. Changes">
        <p>
          We may update this policy as WinIt changes. We&apos;ll update the date at the top when we do. Material
          changes — like introducing third-party ads or analytics — will be called out clearly here.
        </p>
      </Section>

      <Section title="10. Contact">
        <p>
          Questions about this policy, or a request about your data? Reach out at{" "}
          <a href="mailto:support@winit.app" className="text-volt hover:underline">
            support@winit.app
          </a>
          .
        </p>
        <p className="text-slate-500">
          See also our{" "}
          <Link href="/legal/terms" className="text-volt hover:underline">
            Terms of Service
          </Link>
          .
        </p>
      </Section>
    </LegalPage>
  );
}
