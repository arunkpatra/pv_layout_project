import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Terms & Conditions",
  description:
    "Terms and conditions governing the use of SolarLayout desktop solutions and services.",
}

export default function TermsPage() {
  return (
    <div className="px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
      <div className="mx-auto max-w-3xl">
        <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
          Terms &amp; Conditions
        </h1>

        <p className="mt-4 text-sm text-muted-foreground">
          Effective date: 21 April 2026 &middot; Last updated: 21 April 2026
        </p>

        <h2 className="mt-10 text-2xl font-semibold tracking-tight text-foreground">
          1. Acceptance of Terms
        </h2>
        <p className="mt-4 text-lg leading-relaxed text-muted-foreground">
          By accessing or using the SolarLayout website and desktop applications
          (&quot;Service&quot;), you agree to be bound by these Terms &amp;
          Conditions. If you do not agree to these terms, please do not use the
          Service.
        </p>

        <h2 className="mt-10 text-2xl font-semibold tracking-tight text-foreground">
          2. Description of Service
        </h2>
        <p className="mt-4 text-lg leading-relaxed text-muted-foreground">
          SolarLayout provides desktop solutions for automated solar
          photovoltaic (PV) plant layout design. The software enables solar
          professionals to generate optimised module layouts, stringing plans,
          and related engineering outputs for utility-scale solar projects.
        </p>

        <h2 className="mt-10 text-2xl font-semibold tracking-tight text-foreground">
          3. User Registration
        </h2>
        <p className="mt-4 text-lg leading-relaxed text-muted-foreground">
          To download or use SolarLayout software, you must register by
          providing your name and email address. You agree to provide accurate
          and complete information during registration and to keep your account
          credentials secure.
        </p>

        <h2 className="mt-10 text-2xl font-semibold tracking-tight text-foreground">
          4. Intellectual Property
        </h2>
        <p className="mt-4 text-lg leading-relaxed text-muted-foreground">
          All intellectual property rights in the SolarLayout software, website,
          documentation, and related materials belong exclusively to SolarLayout
          and its licensors. You are granted a limited, non-exclusive,
          non-transferable licence to use the software solely for its intended
          purpose.
        </p>

        <h2 className="mt-10 text-2xl font-semibold tracking-tight text-foreground">
          5. Limitation of Liability
        </h2>
        <p className="mt-4 text-lg leading-relaxed text-muted-foreground">
          To the maximum extent permitted by applicable law, SolarLayout shall
          not be liable for any indirect, incidental, special, consequential, or
          punitive damages arising out of or related to your use of the Service.
          The total liability of SolarLayout for any claim shall not exceed the
          amount paid by you for the Service in the twelve months preceding the
          claim.
        </p>

        <h2 className="mt-10 text-2xl font-semibold tracking-tight text-foreground">
          6. Refund Policy
        </h2>
        <p className="mt-4 text-lg leading-relaxed text-muted-foreground">
          SolarLayout is a digital software product. Due to the nature of
          digital goods, refunds are limited. If the software fails to function
          as described and the issue cannot be resolved within 15 business days,
          you may request a refund within 30 days of purchase.
        </p>

        <h2 className="mt-10 text-2xl font-semibold tracking-tight text-foreground">
          7. Prohibited Uses
        </h2>
        <p className="mt-4 text-lg leading-relaxed text-muted-foreground">
          You agree not to:
        </p>
        <ul className="mt-3 list-disc space-y-2 pl-6 text-lg leading-relaxed text-muted-foreground">
          <li>Reverse-engineer, decompile, or disassemble the software</li>
          <li>
            Redistribute, sublicence, or resell the software without written
            permission
          </li>
          <li>
            Use the software for any unlawful purpose or in violation of any
            applicable law
          </li>
          <li>
            Attempt to gain unauthorised access to SolarLayout systems or
            infrastructure
          </li>
          <li>
            Remove or alter any proprietary notices, labels, or branding in the
            software
          </li>
        </ul>

        <h2 className="mt-10 text-2xl font-semibold tracking-tight text-foreground">
          8. Governing Law
        </h2>
        <p className="mt-4 text-lg leading-relaxed text-muted-foreground">
          These terms shall be governed by and construed in accordance with the
          laws of India, including the Information Technology Act, 2000 and the
          Consumer Protection Act, 2019. Any disputes arising under these terms
          shall be subject to the exclusive jurisdiction of the courts in
          Bangalore, Karnataka, India.
        </p>

        <h2 className="mt-10 text-2xl font-semibold tracking-tight text-foreground">
          9. Changes to These Terms
        </h2>
        <p className="mt-4 text-lg leading-relaxed text-muted-foreground">
          We reserve the right to update these terms at any time. Changes will
          be posted on this page with a revised effective date. Continued use of
          the Service after changes constitutes acceptance of the updated terms.
        </p>

        <h2 className="mt-10 text-2xl font-semibold tracking-tight text-foreground">
          10. Contact
        </h2>
        <p className="mt-4 text-lg leading-relaxed text-muted-foreground">
          If you have questions about these terms, please contact us at{" "}
          <a
            href="mailto:support@solarlayout.in"
            className="text-primary underline underline-offset-4 hover:text-primary/80"
          >
            support@solarlayout.in
          </a>
          .
        </p>
      </div>
    </div>
  )
}
