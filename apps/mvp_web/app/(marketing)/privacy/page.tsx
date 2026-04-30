import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Privacy Policy",
  description:
    "How SolarLayout collects, uses, and protects your personal data in compliance with the DPDP Act 2023.",
}

export default function PrivacyPage() {
  return (
    <div className="px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
      <div className="mx-auto max-w-3xl">
        <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
          Privacy Policy
        </h1>

        <p className="mt-4 text-sm text-muted-foreground">
          Effective date: 21 April 2026 &middot; Last updated: 21 April 2026
        </p>

        <h2 className="mt-10 text-2xl font-semibold tracking-tight text-foreground">
          1. Information We Collect
        </h2>
        <p className="mt-4 text-lg leading-relaxed text-muted-foreground">
          We collect the following categories of personal data:
        </p>
        <ul className="mt-3 list-disc space-y-2 pl-6 text-lg leading-relaxed text-muted-foreground">
          <li>
            <strong>Name</strong> — provided during registration
          </li>
          <li>
            <strong>Email address</strong> — provided during registration
          </li>
          <li>
            <strong>IP address</strong> — collected automatically when you
            access the Service
          </li>
          <li>
            <strong>Mobile number</strong> (optional) — if provided for support
            communication
          </li>
        </ul>

        <h2 className="mt-10 text-2xl font-semibold tracking-tight text-foreground">
          2. Purpose of Collection
        </h2>
        <p className="mt-4 text-lg leading-relaxed text-muted-foreground">
          We use the information collected for:
        </p>
        <ul className="mt-3 list-disc space-y-2 pl-6 text-lg leading-relaxed text-muted-foreground">
          <li>Delivering and maintaining the SolarLayout Service</li>
          <li>Providing customer support and responding to enquiries</li>
          <li>Improving our products, features, and user experience</li>
          <li>Communicating important updates about the Service</li>
        </ul>

        <h2 className="mt-10 text-2xl font-semibold tracking-tight text-foreground">
          3. How We Store Your Data
        </h2>
        <p className="mt-4 text-lg leading-relaxed text-muted-foreground">
          Your personal data is encrypted at rest and in transit. Our servers
          are located in India. We implement industry-standard security measures
          to protect your data against unauthorised access, alteration, or
          disclosure.
        </p>

        <h2 className="mt-10 text-2xl font-semibold tracking-tight text-foreground">
          4. Data Retention
        </h2>
        <p className="mt-4 text-lg leading-relaxed text-muted-foreground">
          We retain your personal data for as long as your account is active,
          plus an additional two years after account closure or inactivity.
          After this period, your data will be securely deleted unless retention
          is required by law.
        </p>

        <h2 className="mt-10 text-2xl font-semibold tracking-tight text-foreground">
          5. Your Rights Under the DPDP Act 2023
        </h2>
        <p className="mt-4 text-lg leading-relaxed text-muted-foreground">
          Under the Digital Personal Data Protection Act, 2023 (&quot;DPDP
          Act&quot;), you have the following rights:
        </p>
        <ul className="mt-3 list-disc space-y-2 pl-6 text-lg leading-relaxed text-muted-foreground">
          <li>
            <strong>Right to Access</strong> — request a summary of your
            personal data and processing activities
          </li>
          <li>
            <strong>Right to Correction</strong> — request correction of
            inaccurate or incomplete personal data
          </li>
          <li>
            <strong>Right to Erasure</strong> — request deletion of your
            personal data, subject to legal retention requirements
          </li>
          <li>
            <strong>Right to Grievance Redressal</strong> — raise a complaint
            with our Grievance Officer or the Data Protection Board of India
          </li>
        </ul>

        <h2 className="mt-10 text-2xl font-semibold tracking-tight text-foreground">
          6. Third-Party Sharing
        </h2>
        <p className="mt-4 text-lg leading-relaxed text-muted-foreground">
          We do not sell your personal data. We may share data with essential
          third-party service providers (such as hosting, analytics, and payment
          processing) only to the extent necessary to operate the Service. All
          third-party providers are contractually required to protect your data.
        </p>

        <h2 className="mt-10 text-2xl font-semibold tracking-tight text-foreground">
          7. Cookies
        </h2>
        <p className="mt-4 text-lg leading-relaxed text-muted-foreground">
          We use analytics cookies to understand how visitors interact with our
          website. Cookies are placed only after you provide consent. You can
          manage or withdraw cookie consent at any time through your browser
          settings.
        </p>

        <h2 className="mt-10 text-2xl font-semibold tracking-tight text-foreground">
          8. Grievance Officer
        </h2>
        <p className="mt-4 text-lg leading-relaxed text-muted-foreground">
          In accordance with the DPDP Act 2023, we have appointed a Grievance
          Officer to address your concerns:
        </p>
        <ul className="mt-3 list-none space-y-2 pl-0 text-lg leading-relaxed text-muted-foreground">
          <li>
            <strong>Name:</strong> Data Protection Officer
          </li>
          <li>
            <strong>Email:</strong>{" "}
            <a
              href="mailto:support@solarlayout.in"
              className="text-primary underline underline-offset-4 hover:text-primary/80"
            >
              support@solarlayout.in
            </a>
          </li>
        </ul>
        <p className="mt-4 text-lg leading-relaxed text-muted-foreground">
          We will acknowledge your grievance within 48 hours and resolve it
          within 30 days.
        </p>

        <h2 className="mt-10 text-2xl font-semibold tracking-tight text-foreground">
          9. Changes to This Policy
        </h2>
        <p className="mt-4 text-lg leading-relaxed text-muted-foreground">
          We may update this privacy policy from time to time. Changes will be
          posted on this page with a revised effective date. We encourage you to
          review this page periodically.
        </p>

        <h2 className="mt-10 text-2xl font-semibold tracking-tight text-foreground">
          10. Contact
        </h2>
        <p className="mt-4 text-lg leading-relaxed text-muted-foreground">
          For questions about this privacy policy, please contact us at{" "}
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
