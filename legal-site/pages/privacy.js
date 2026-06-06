import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';

export default function PrivacyPolicy() {
  const router = useRouter();

  return (
    <>
      <Head>
        <title>Privacy Policy — Emorii</title>
        <meta name="description" content="Emorii Privacy Policy — how we collect, use, and protect your personal data." />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" href="/favicon.ico" />
      </Head>

      <header className="site-header">
        <div className="site-header-inner">
          <span className="site-logo">Emorii</span>
          <nav className="site-nav">
            <Link href="/privacy" className={router.pathname === '/privacy' ? 'active' : ''}>Privacy Policy</Link>
            <Link href="/terms" className={router.pathname === '/terms' ? 'active' : ''}>Terms of Service</Link>
          </nav>
        </div>
      </header>

      <main className="page-wrapper">
        <div className="doc-header">
          <h1 className="doc-title">Privacy Policy</h1>
          <div className="doc-meta">
            <span>Effective Date: To be confirmed</span>
            <span>Last Updated: 19 April 2026</span>
          </div>
        </div>

        <div className="doc-section">
          <h2>1. Introduction</h2>
          <p>This Privacy Policy ("Policy") is issued by Ampie Ali Limited, a company duly incorporated under the laws of the Federal Republic of Nigeria ("Emorii," "we," "us," or "our"). Emorii is the Data Controller responsible for the collection, processing, and protection of your Personal Data in connection with the Emorii mobile application and related services (the "Platform").</p>
          <p>By creating an account on or using the Emorii Platform, you acknowledge that you have read, understood, and consent to the practices described in this Policy. If you do not agree with any part of this Policy, you must discontinue use of the Platform immediately.</p>
        </div>

        <div className="doc-section">
          <h2>2. Definitions</h2>
          <ul>
            <li><strong>Personal Data</strong> means any information relating to an identified or identifiable natural person.</li>
            <li><strong>Sensitive Personal Data</strong> includes data relating to racial or ethnic origin, religious beliefs, political opinions, biometric data, health data, sex life, sexual orientation, or criminal history.</li>
            <li><strong>Data Subject</strong> means any user of the Emorii Platform whose Personal Data is processed.</li>
            <li><strong>Data Controller</strong> means Ampie Ali Limited.</li>
            <li><strong>Data Processor</strong> means any third party that processes Personal Data on behalf of Emorii.</li>
            <li><strong>Processing</strong> means any operation performed on Personal Data, whether automated or not.</li>
            <li><strong>Consent</strong> means a freely given, specific, informed, and unambiguous indication of agreement to data processing.</li>
            <li><strong>NDPA</strong> means the Nigeria Data Protection Act 2023.</li>
            <li><strong>NDPC</strong> means the Nigeria Data Protection Commission.</li>
            <li><strong>Cookies</strong> are small text files placed on your device to store session and preference information.</li>
          </ul>
        </div>

        <div className="doc-section">
          <h2>3. Scope of This Policy</h2>
          <p>This Policy applies to all individuals who access, download, register on, or use the Emorii mobile application or website. It covers Personal Data collected within Nigeria and Personal Data transferred across borders in connection with the Platform's operation.</p>
          <p>This Policy does not apply to third-party websites, services, or applications linked to Emorii.</p>
        </div>

        <div className="doc-section">
          <h2>4. Data We Collect</h2>
          <p><strong>4.1 Information You Provide Directly</strong></p>
          <ul>
            <li>Registration Data (name, email, phone number, date of birth, gender, profile photos)</li>
            <li>Profile Data (biography, interests, matching preferences)</li>
            <li>Identity Verification Data (government-issued ID, selfie verification)</li>
            <li>Communication Data (messages, reports, feedback)</li>
            <li>Payment Data (transaction records; card details handled by third-party processors)</li>
            <li>Survey & Promotional Data</li>
          </ul>
          <p><strong>4.2 Information Collected Automatically</strong></p>
          <ul>
            <li>Device Information</li>
            <li>Usage Data (likes, swipes, matches, views)</li>
            <li>Location Data (GPS with consent; IP-based approximate location)</li>
            <li>Log Data (crash reports, diagnostics, access times)</li>
          </ul>
          <p><strong>4.3 Information from Third Parties</strong></p>
          <ul>
            <li>Social Login Data (Facebook, Google, Apple)</li>
            <li>Identity Verification Providers</li>
            <li>Information from Other Users</li>
          </ul>
          <p><strong>4.4 Sensitive Personal Data</strong></p>
          <p>Processed only with explicit consent and solely to improve matching accuracy.</p>
        </div>

        <div className="doc-section">
          <h2>5. Legal Basis for Processing</h2>
          <p>Emorii processes Personal Data under the following lawful bases:</p>
          <ul>
            <li>Consent</li>
            <li>Performance of Contract</li>
            <li>Legitimate Interest</li>
            <li>Legal Obligation</li>
            <li>Vital Interest</li>
          </ul>
        </div>

        <div className="doc-section">
          <h2>6. How We Use Your Data</h2>
          <p>Emorii uses Personal Data to:</p>
          <ul>
            <li>Provide and personalize matchmaking services</li>
            <li>Manage and authenticate user accounts</li>
            <li>Facilitate communication between matched users</li>
            <li>Process payments and subscriptions</li>
            <li>Detect and prevent fraud or harmful activity</li>
            <li>Enforce Terms of Service and community standards</li>
            <li>Conduct safety monitoring</li>
            <li>Send service-related notifications</li>
            <li>Deliver marketing communications (with consent)</li>
            <li>Improve the Platform through analytics and research</li>
            <li>Comply with legal obligations</li>
            <li>Resolve disputes and defend legal claims</li>
          </ul>
        </div>

        <div className="doc-section">
          <h2>7. Data Sharing and Disclosure</h2>
          <p>Emorii may share your Personal Data with:</p>
          <ul>
            <li>Other Users</li>
            <li>Service Providers</li>
            <li>Advertising Partners (aggregated, anonymized data only)</li>
            <li>Legal Authorities</li>
            <li>Successor Entities</li>
            <li>Third Parties with Your Consent</li>
          </ul>
          <p><strong>Emorii does not sell Personal Data.</strong></p>
        </div>

        <div className="doc-section">
          <h2>8. Cross-Border Data Transfers</h2>
          <p>Where Personal Data is transferred outside Nigeria, Emorii ensures compliance with NDPA Sections 41–43 through:</p>
          <ul>
            <li>Adequacy decisions</li>
            <li>Standard Contractual Clauses</li>
            <li>Binding Corporate Rules</li>
            <li>Explicit user consent</li>
          </ul>
        </div>

        <div className="doc-section">
          <h2>9. Data Retention</h2>
          <ul>
            <li><strong>Active Account Data:</strong> retained while account is active</li>
            <li><strong>Deleted Account Data:</strong> removed or anonymized within 90 days</li>
            <li><strong>Financial Records:</strong> retained for 6 years</li>
            <li><strong>Safety & Security Data:</strong> retained as needed</li>
            <li><strong>Communication Data:</strong> retained for 12 months after account deletion</li>
            <li><strong>Backup Data:</strong> purged within 180 days of deletion request</li>
          </ul>
        </div>

        <div className="doc-section">
          <h2>10. Data Security Measures</h2>
          <p>Emorii implements:</p>
          <ul>
            <li>TLS/SSL encryption in transit</li>
            <li>AES-256 encryption at rest</li>
            <li>Secure hosting infrastructure</li>
            <li>Regular security audits</li>
            <li>Strict access controls</li>
            <li>Incident response procedures</li>
            <li>Data Protection Impact Assessments (DPIAs)</li>
            <li>A designated Data Protection Officer (DPO)</li>
            <li>72-hour breach notification to NDPC</li>
          </ul>
        </div>

        <div className="doc-section">
          <h2>11. Your Rights Under NDPA</h2>
          <p>You have the right to:</p>
          <ul>
            <li>Be informed</li>
            <li>Access your data</li>
            <li>Rectify inaccurate data</li>
            <li>Request erasure</li>
            <li>Restrict processing</li>
            <li>Data portability</li>
            <li>Object to processing</li>
            <li>Avoid automated decision-making</li>
            <li>Withdraw consent</li>
            <li>Lodge complaints with the NDPC</li>
          </ul>
          <p>Requests may be submitted to <a href="mailto:dpo@emorii.com">dpo@emorii.com</a>.</p>
        </div>

        <div className="doc-section">
          <h2>12. Children's Privacy</h2>
          <p>Emorii is intended for users 18 years and older. We do not knowingly collect data from minors.</p>
        </div>

        <div className="doc-section">
          <h2>13. Cookies & Tracking Technologies</h2>
          <p>Emorii uses essential, performance, analytics, and advertising cookies. You may manage preferences via device or browser settings.</p>
        </div>

        <div className="doc-section">
          <h2>14. Marketing & Communications</h2>
          <p>Marketing communications are sent only with opt-in consent. You may withdraw consent via:</p>
          <ul>
            <li>Unsubscribe links</li>
            <li>In-app settings</li>
            <li>Email: <a href="mailto:privacy@emorii.com">privacy@emorii.com</a></li>
          </ul>
          <p>Service-related communications will continue regardless of marketing preferences.</p>
        </div>

        <div className="doc-section">
          <h2>15. Changes to This Policy</h2>
          <p>Material changes will be communicated at least 30 days in advance. Continued use of the Platform after updates constitutes acceptance.</p>
        </div>

        <div className="doc-section">
          <h2>16. Data Protection Officer</h2>
          <div className="contact-block">
            <p><strong>Data Protection Officer</strong></p>
            <p>Ampie Ali Limited</p>
            <p>Email: <a href="mailto:dpo@emorii.com">dpo@emorii.com</a></p>
          </div>
        </div>

        <div className="doc-section">
          <h2>17. Complaints & Regulatory Contact</h2>
          <p>If unresolved after contacting Emorii, you may lodge a complaint with the Nigeria Data Protection Commission (NDPC).</p>
        </div>

        <div className="doc-section">
          <h2>18. Contact Us</h2>
          <div className="contact-block">
            <p><strong>Ampie Ali Limited</strong></p>
            <p>General Privacy Enquiries: <a href="mailto:privacy@emorii.com">privacy@emorii.com</a></p>
            <p>Data Protection Officer: <a href="mailto:dpo@emorii.com">dpo@emorii.com</a></p>
          </div>
        </div>
      </main>

      <footer className="site-footer">
        <p>© 2026 Ampie Ali Limited. All rights reserved.</p>
      </footer>
    </>
  );
}
