export const metadata = {
  title: "Terms of Service — SolarDesign",
}

export default function TermsPage() {
  return (
    <section className="mx-auto w-full max-w-3xl px-6 py-16">
      <h1 className="mb-2 text-3xl font-bold tracking-tight">Terms of Service</h1>
      <p className="mb-10 text-sm text-muted-foreground">
        Effective date: 18 April 2026 · Last updated: 18 April 2026
      </p>

      <div className="prose prose-sm max-w-none text-foreground [&_a]:underline [&_a]:underline-offset-2 [&_a:hover]:text-muted-foreground [&_h2]:mt-10 [&_h2]:mb-3 [&_h2]:text-lg [&_h2]:font-semibold [&_h3]:mt-6 [&_h3]:mb-2 [&_h3]:font-semibold [&_p]:mb-4 [&_p]:text-muted-foreground [&_ul]:mb-4 [&_ul]:ml-5 [&_ul]:list-disc [&_ul]:text-muted-foreground [&_li]:mb-1">

        <p>
          These Terms of Service (&ldquo;Terms&rdquo;) govern your access to and use of the SolarDesign
          platform (&ldquo;Platform&rdquo;) operated by SolarDesign (&ldquo;we&rdquo;, &ldquo;us&rdquo;, &ldquo;our&rdquo;),
          a company incorporated under the Companies Act, 2013, with its registered office in
          Bengaluru, Karnataka, India.
        </p>
        <p>
          By creating an account or using the Platform, you (&ldquo;User&rdquo;, &ldquo;you&rdquo;) agree to these Terms
          on behalf of yourself and, where applicable, the organisation you represent. If you do not
          agree, do not use the Platform.
        </p>
        <p>
          These Terms constitute a binding contract under the Indian Contract Act, 1872. Users must
          be at least 18 years of age and legally competent to enter into a contract under Indian law.
        </p>

        <h2>1. The Platform</h2>
        <p>
          SolarDesign is a cloud-based solar project design platform for utility-scale projects in
          India. It provides tools for site boundary import, shadow-free area calculation, DC and AC
          layout, CUF and P50/P75/P90 yield simulation, DISCOM-compliant SLD generation, IS 732 /
          IS 1255 cable schedules, ALMM-compliant equipment library, BoM, BoQ, and lender-ready
          DPR export.
        </p>
        <p>
          Features available under each plan are described at{" "}
          <a href="/pricing">solardesign.in/pricing</a> and may be updated from time to time with
          notice to active subscribers.
        </p>

        <h2>2. Account Registration</h2>
        <ul>
          <li>You must provide accurate and current information at registration.</li>
          <li>You are responsible for maintaining the confidentiality of your login credentials.</li>
          <li>You must notify us immediately at <a href="mailto:support@solardesign.in">support@solardesign.in</a> if you suspect unauthorised access to your account.</li>
          <li>One account may not be shared across multiple individuals unless seats are purchased under a multi-user plan.</li>
          <li>We reserve the right to suspend or terminate accounts found to be in breach of these Terms.</li>
        </ul>

        <h2>3. Subscription Plans and Billing</h2>
        <h3>Plans</h3>
        <p>
          The Platform is offered under three plans: Starter (free), Professional, and Enterprise.
          Plan details, feature availability, and pricing are published at{" "}
          <a href="/pricing">solardesign.in/pricing</a>.
        </p>
        <h3>Free trial</h3>
        <p>
          New users may access the Professional plan at no charge for 14 days from the date of
          account creation (&ldquo;Trial Period&rdquo;). No credit card is required to start the trial.
          At the end of the Trial Period, access reverts to the Starter plan unless a subscription
          is activated.
        </p>
        <h3>Pricing and currency</h3>
        <p>
          All subscription fees are denominated in Indian Rupees (INR) and are exclusive of GST.
          GST at the applicable rate will be charged in addition to the subscription fee and will
          appear separately on the invoice.
        </p>
        <h3>Billing cycle</h3>
        <ul>
          <li>Professional plan: billed annually in advance.</li>
          <li>Enterprise plan: billing terms are specified in the order form or agreement.</li>
          <li>Invoices are issued electronically and are GST-compliant under the CGST Act, 2017.</li>
        </ul>
        <h3>Renewals and cancellation</h3>
        <ul>
          <li>Subscriptions renew automatically at the end of each billing cycle unless cancelled before the renewal date.</li>
          <li>To cancel, contact <a href="mailto:billing@solardesign.in">billing@solardesign.in</a> at least 15 days before the renewal date.</li>
          <li>No refunds are issued for the current billing cycle after renewal. Unused portions of a cancelled subscription are not refunded.</li>
        </ul>
        <h3>Non-payment</h3>
        <p>
          If payment is not received within 7 days of the due date, access may be downgraded to
          the Starter plan. Project data is retained for 60 days after downgrade to allow renewal
          or export.
        </p>

        <h2>4. Acceptable Use</h2>
        <p>You may use the Platform only for lawful purposes. You must not:</p>
        <ul>
          <li>Upload data or files that infringe third-party intellectual property rights</li>
          <li>Attempt to reverse-engineer, decompile, or extract the source code of the Platform</li>
          <li>Use automated tools (bots, scrapers) to access the Platform without our written permission</li>
          <li>Attempt to gain unauthorised access to other users&rsquo; accounts or project data</li>
          <li>Use the Platform to process data in violation of applicable law, including the DPDP Act, 2023</li>
          <li>Resell or sublicense access to the Platform without a written reseller agreement</li>
          <li>Use the Platform in a way that disrupts its availability to other users</li>
        </ul>

        <h2>5. Intellectual Property</h2>
        <h3>Our IP</h3>
        <p>
          The Platform, including its software, algorithms, simulation methodology, user interface,
          and documentation, is the intellectual property of SolarDesign and is protected under
          the Copyright Act, 1957, the Patents Act, 1970, and applicable Indian IP law. These Terms
          do not transfer any ownership of our IP to you.
        </p>
        <h3>Your data</h3>
        <p>
          You retain full ownership of all project data, KMZ / DXF files, and design outputs you
          create on the Platform. By uploading data, you grant us a limited, non-exclusive licence
          to process it solely to provide the Platform services to you. We do not use your project
          data to train models or for any purpose other than delivering the Platform.
        </p>
        <h3>ALMM and regulatory data</h3>
        <p>
          The ALMM module and inverter library is maintained by us and sourced from MNRE published
          lists. Accuracy is maintained on a best-effort basis. We are not responsible for project
          disqualification arising from equipment selection if the ALMM list changes after a design
          is completed. Users are responsible for verifying ALMM status at the time of bid submission.
        </p>

        <h2>6. Third-Party Data Sources</h2>
        <p>
          Yield simulation uses irradiance data from Meteonorm, NASA POWER, and Solargis. These are
          independent third-party sources. We do not warrant the accuracy of third-party data.
          Simulation outputs are indicative and must be validated by a qualified engineer before
          use in lender submissions, regulatory filings, or bid documents.
        </p>

        <h2>7. Availability and Support</h2>
        <ul>
          <li>We target 99.5% monthly uptime for the Platform, excluding scheduled maintenance.</li>
          <li>Scheduled maintenance windows will be communicated at least 48 hours in advance.</li>
          <li>Support is provided by email and chat for Professional plan users, and by a dedicated customer success manager for Enterprise customers.</li>
          <li>Support is available on Indian business days (Monday to Friday, excluding national public holidays).</li>
        </ul>

        <h2>8. Limitation of Liability</h2>
        <p>
          To the maximum extent permitted under Indian law:
        </p>
        <ul>
          <li>The Platform is provided on an &ldquo;as is&rdquo; and &ldquo;as available&rdquo; basis. We do not warrant that it will be error-free, uninterrupted, or fit for any specific engineering purpose.</li>
          <li>Design outputs — layouts, SLD, cable schedules, simulation reports, BoM, BoQ, DPR — are tools to assist qualified engineers. They do not constitute certified engineering documents. You are responsible for professional review and sign-off before regulatory submission or construction.</li>
          <li>Our aggregate liability to you for any claim arising from these Terms or use of the Platform shall not exceed the subscription fees paid by you in the 12 months preceding the claim.</li>
          <li>We are not liable for indirect, consequential, or punitive losses, including loss of revenue, loss of bid, or project delays.</li>
        </ul>

        <h2>9. Indemnification</h2>
        <p>
          You agree to indemnify and hold harmless SolarDesign, its directors, employees, and
          agents from any claim, liability, or expense (including legal fees) arising from your
          use of the Platform in violation of these Terms or applicable law.
        </p>

        <h2>10. Termination</h2>
        <ul>
          <li>You may terminate your account at any time by written notice to <a href="mailto:support@solardesign.in">support@solardesign.in</a>.</li>
          <li>We may suspend or terminate your account for breach of these Terms, non-payment, or where required by law, with or without prior notice depending on the severity of the breach.</li>
          <li>On termination, your right to access the Platform ceases. Project data is available for export for 60 days following termination, after which it is deleted.</li>
        </ul>

        <h2>11. Dispute Resolution</h2>
        <p>
          Any dispute arising from or relating to these Terms or the Platform shall be resolved as
          follows:
        </p>
        <ul>
          <li><strong>Step 1 — Negotiation:</strong> The parties shall attempt to resolve the dispute by good-faith negotiation within 30 days of written notice.</li>
          <li><strong>Step 2 — Arbitration:</strong> If unresolved, the dispute shall be referred to arbitration under the Arbitration and Conciliation Act, 1996. The seat of arbitration shall be Bengaluru. The arbitration shall be conducted in English by a sole arbitrator mutually appointed by the parties.</li>
          <li><strong>Step 3 — Courts:</strong> If arbitration is not applicable or fails, the courts of Bengaluru, Karnataka shall have exclusive jurisdiction.</li>
        </ul>

        <h2>12. Governing Law</h2>
        <p>
          These Terms are governed by and construed in accordance with the laws of India, including
          the Indian Contract Act, 1872, the Information Technology Act, 2000, the Digital Personal
          Data Protection Act, 2023, and the CGST Act, 2017.
        </p>

        <h2>13. Force Majeure</h2>
        <p>
          We are not liable for failure to perform obligations under these Terms due to causes
          beyond our reasonable control, including natural disasters, government action, internet
          infrastructure failure, or power outages. We will notify you of any such event and
          resume performance as soon as reasonably practicable.
        </p>

        <h2>14. Amendments</h2>
        <p>
          We may amend these Terms from time to time. Material amendments will be communicated
          by email to the registered account address at least 14 days before they take effect.
          Continued use of the Platform after the effective date constitutes acceptance of the
          amended Terms. If you do not accept the amended Terms, you may terminate your account
          before the effective date.
        </p>

        <h2>15. Contact</h2>
        <p>
          For queries regarding these Terms:{" "}
          <a href="mailto:legal@solardesign.in">legal@solardesign.in</a>
        </p>
        <p>
          For billing queries:{" "}
          <a href="mailto:billing@solardesign.in">billing@solardesign.in</a>
        </p>
        <p>
          For support:{" "}
          <a href="mailto:support@solardesign.in">support@solardesign.in</a>
        </p>
      </div>
    </section>
  )
}
