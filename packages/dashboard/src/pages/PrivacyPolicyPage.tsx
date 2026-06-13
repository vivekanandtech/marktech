export function PrivacyPolicyPage() {
  return (
    <div className="min-h-screen bg-app">
      <div className="max-w-2xl mx-auto px-6 py-12 space-y-6">
        <div>
          <h1 className="text-2xl font-bold t1">Privacy Policy</h1>
          <p className="text-sm t3 mt-1">Last updated: 12 June 2026</p>
        </div>

        <p className="text-sm t2 leading-relaxed">
          Marktech ("we", "us", "our") provides an advertising analytics dashboard that helps
          marketing agencies and businesses view performance data from their connected ad
          platforms in one place. This policy explains what information we collect, how we use
          it, and how you can control it.
        </p>

        <section className="space-y-2">
          <h2 className="text-base font-semibold t1">1. Information We Collect</h2>
          <p className="text-sm t2 leading-relaxed">
            <strong className="t1">Account information:</strong> name and email address used to
            sign in to Marktech.
          </p>
          <p className="text-sm t2 leading-relaxed">
            <strong className="t1">Meta (Facebook/Instagram) advertising data:</strong> when you
            connect your Meta account via Facebook Login, we request the{' '}
            <code className="text-xs bg-surface-2 px-1 py-0.5 rounded">ads_read</code> permission.
            This lets us read — but never modify — your ad account name, ID, and currency, along
            with campaign, ad set, and ad names, statuses, budgets, and performance metrics
            (spend, impressions, clicks, reach, CTR, CPM, ROAS).
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-semibold t1">2. How We Use Your Information</h2>
          <p className="text-sm t2 leading-relaxed">
            We use this information solely to display your advertising performance inside the
            Marktech dashboard — metrics, charts, and campaign tables. We do not use your data for
            advertising, profiling, or any purpose unrelated to displaying your own ad performance
            back to you.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-semibold t1">3. Data Storage & Security</h2>
          <p className="text-sm t2 leading-relaxed">
            Your Meta access token is stored in your browser's local storage and sent to our
            servers only when needed to fetch your ad data, over an encrypted (HTTPS) connection.
            We do not sell, rent, or share your data with any third party. Your access token is
            never written to a database or shared with anyone outside the request that fetches
            your own ad data from Meta on your behalf.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-semibold t1">4. Third-Party Services</h2>
          <p className="text-sm t2 leading-relaxed">
            Marktech connects to the Meta Marketing API (Graph API) to retrieve ad account and
            campaign data that you have authorized. Use of this data is also subject to Meta's own{' '}
            <a
              href="https://www.facebook.com/privacy/policy/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-indigo-500 hover:underline"
            >
              Data Policy
            </a>.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-semibold t1">5. Data Retention & Deletion</h2>
          <p className="text-sm t2 leading-relaxed">
            You can disconnect your Meta account at any time from Settings — this immediately
            removes the stored access token from your browser. To request deletion of any account
            data we hold, email us at{' '}
            <a href="mailto:vivek120891@gmail.com" className="text-indigo-500 hover:underline">
              vivek120891@gmail.com
            </a>{' '}
            and we will remove it within 30 days.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-semibold t1">6. Your Rights</h2>
          <p className="text-sm t2 leading-relaxed">
            You may access, correct, or request deletion of your personal data at any time by
            contacting us using the email above.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-semibold t1">7. Changes to This Policy</h2>
          <p className="text-sm t2 leading-relaxed">
            We may update this policy from time to time. Material changes will be reflected by
            updating the "Last updated" date at the top of this page.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-semibold t1">8. Contact Us</h2>
          <p className="text-sm t2 leading-relaxed">
            Questions about this policy? Email{' '}
            <a href="mailto:vivek120891@gmail.com" className="text-indigo-500 hover:underline">
              vivek120891@gmail.com
            </a>.
          </p>
        </section>
      </div>
    </div>
  )
}
