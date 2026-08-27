import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';

export default function TermsOfService() {
  const router = useRouter();

  return (
    <>
      <Head>
        <title>Terms of Service — Emorii</title>
        <meta name="description" content="Emorii Terms of Service — rules and guidelines governing use of the Emorii platform." />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" href="/favicon.ico" />
      </Head>

      <header className="site-header">
        <div className="site-header-inner">
          <span className="site-logo">Emorii</span>
          <nav className="site-nav">
            <Link href="/privacy" className={router.pathname === '/privacy' ? 'active' : ''}>Privacy Policy</Link>
            <Link href="/terms" className={router.pathname === '/terms' ? 'active' : ''}>Terms of Service</Link>
            <Link href="/delete-account" className={router.pathname === '/delete-account' ? 'active' : ''}>Delete Account</Link>
          </nav>
        </div>
      </header>

      <main className="page-wrapper">
        <div className="doc-header">
          <h1 className="doc-title">Terms of Service</h1>
          <div className="doc-meta">
            <span>Effective Date: To be confirmed</span>
            <span>Last Updated: 19 April 2026</span>
          </div>
        </div>

        <div className="doc-section">
          <h2>1. Introduction</h2>
          <p>Welcome to Emorii, operated by Ampie Ali Limited ("Emorii," "we," "us," or "our"). These Terms of Service ("Terms") govern your access to and use of the Emorii mobile application, website, and related services (collectively, the "Platform").</p>
          <p>By creating an account or using the Platform, you agree to be bound by these Terms. If you do not agree, you must discontinue use of the Platform immediately.</p>
        </div>

        <div className="doc-section">
          <h2>2. Eligibility</h2>
          <p>To use Emorii, you must:</p>
          <ul>
            <li>Be at least 18 years old.</li>
            <li>Have the legal capacity to enter into a binding agreement.</li>
            <li>Create and maintain only one personal account.</li>
            <li>Not be a convicted sex offender or otherwise prohibited from using online dating services.</li>
          </ul>
          <p>By using Emorii, you represent and warrant that you meet all eligibility requirements.</p>
        </div>

        <div className="doc-section">
          <h2>3. Account Creation & Security</h2>
          <p>To access the Platform, you must create an account and provide accurate, complete information. You are responsible for:</p>
          <ul>
            <li>Maintaining the confidentiality of your login credentials.</li>
            <li>All activity occurring under your account.</li>
            <li>Not sharing your account with others.</li>
          </ul>
          <p>Emorii may suspend or terminate accounts that violate these Terms.</p>
        </div>

        <div className="doc-section">
          <h2>4. User Conduct</h2>
          <p>You agree not to engage in any of the following prohibited activities:</p>
          <ul>
            <li>Harassment, threats, hate speech, or abusive behavior.</li>
            <li>Fraud, impersonation, catfishing, or misrepresentation.</li>
            <li>Uploading sexually explicit content.</li>
            <li>Solicitation, prostitution, or human trafficking.</li>
            <li>Spamming, advertising, or commercial promotion.</li>
            <li>Reverse engineering, scraping, or unauthorized data extraction.</li>
            <li>Using the Platform for any unlawful purpose.</li>
          </ul>
          <p>Emorii reserves the right to investigate and take action, including account suspension or termination.</p>
        </div>

        <div className="doc-section">
          <h2>5. User Content</h2>
          <p>You retain ownership of the content you upload ("User Content"). By using Emorii, you grant us a non-exclusive, worldwide, royalty-free license to:</p>
          <ul>
            <li>Host, store, display, reproduce, and distribute your User Content.</li>
            <li>Use your content to operate, improve, and promote the Platform.</li>
          </ul>
          <p>You represent that you own or have the rights to all content you upload. Emorii may remove content that violates these Terms.</p>
        </div>

        <div className="doc-section">
          <h2>6. Matching & Communication Features</h2>
          <p>Emorii provides matchmaking algorithms and communication tools. You acknowledge that:</p>
          <ul>
            <li>Emorii does not guarantee matches or interactions.</li>
            <li>Emorii does not conduct criminal background checks.</li>
            <li>You are solely responsible for your interactions with other users.</li>
            <li>Emorii is not liable for user behavior on or off the Platform.</li>
          </ul>
          <p>We encourage safe dating practices and provide reporting tools for harmful behavior.</p>
        </div>

        <div className="doc-section">
          <h2>7. Subscriptions & Payments</h2>
          <p>Certain features require paid subscriptions or in-app purchases.</p>
          <p><strong>7.1 Billing</strong></p>
          <p>Payments are processed by third-party providers. Emorii does not store payment card details.</p>
          <p><strong>7.2 Auto-Renewal</strong></p>
          <p>Subscriptions automatically renew unless canceled before the renewal date.</p>
          <p><strong>7.3 Refunds</strong></p>
          <p>Refunds are handled in accordance with App Store policies and Nigerian consumer protection laws (FCCPA 2018). Emorii may refuse refunds for partially used subscription periods.</p>
        </div>

        <div className="doc-section">
          <h2>8. Privacy</h2>
          <p>Your use of Emorii is governed by the <Link href="/privacy">Emorii Privacy Policy</Link>, which explains how we collect, use, and protect your Personal Data. By using the Platform, you consent to the processing of your data as described in the Privacy Policy.</p>
        </div>

        <div className="doc-section">
          <h2>9. Intellectual Property</h2>
          <p>All Emorii trademarks, logos, software, and content (excluding User Content) are owned by Ampie Ali Limited and protected under Nigerian and international intellectual property laws.</p>
          <p>You may not copy, modify, distribute, or create derivative works without our written permission.</p>
        </div>

        <div className="doc-section">
          <h2>10. Safety & Reporting</h2>
          <p>You agree to:</p>
          <ul>
            <li>Exercise caution when interacting with other users.</li>
            <li>Report suspicious or harmful behavior.</li>
            <li>Avoid sharing financial information or sending money to other users.</li>
          </ul>
          <p>Emorii may take action to protect users but does not guarantee safety.</p>
        </div>

        <div className="doc-section">
          <h2>11. Termination</h2>
          <p>Emorii may suspend or terminate your account if:</p>
          <ul>
            <li>You violate these Terms.</li>
            <li>You engage in harmful or fraudulent behavior.</li>
            <li>Required by law or regulatory authorities.</li>
          </ul>
          <p>You may delete your account at any time through the app settings. Upon termination, certain provisions (e.g., IP rights, disclaimers, limitations of liability) will continue to apply.</p>
        </div>

        <div className="doc-section">
          <h2>12. Disclaimers</h2>
          <p>Emorii is provided "as is" and "as available." We do not guarantee:</p>
          <ul>
            <li>Continuous or error-free operation.</li>
            <li>Accuracy of matches or user profiles.</li>
            <li>Safety of offline interactions.</li>
          </ul>
          <p>To the fullest extent permitted by law, Emorii disclaims all warranties.</p>
        </div>

        <div className="doc-section">
          <h2>13. Limitation of Liability</h2>
          <p>To the maximum extent permitted by law:</p>
          <ul>
            <li>Emorii is not liable for indirect, incidental, or consequential damages.</li>
            <li>Emorii is not responsible for user behavior on or off the Platform.</li>
            <li>Emorii's total liability shall not exceed the amount you paid in the last 12 months.</li>
          </ul>
          <p>Some jurisdictions do not allow certain limitations; these may not apply to you.</p>
        </div>

        <div className="doc-section">
          <h2>14. Indemnification</h2>
          <p>You agree to indemnify and hold harmless Emorii from any claims, damages, or losses arising from:</p>
          <ul>
            <li>Your use of the Platform.</li>
            <li>Your violation of these Terms.</li>
            <li>Your interactions with other users.</li>
          </ul>
        </div>

        <div className="doc-section">
          <h2>15. Changes to These Terms</h2>
          <p>Emorii may update these Terms periodically. Material changes will be communicated at least 30 days in advance. Continued use of the Platform after changes constitutes acceptance.</p>
        </div>

        <div className="doc-section">
          <h2>16. Governing Law</h2>
          <p>These Terms are governed by the laws of the Federal Republic of Nigeria, without regard to conflict-of-law principles.</p>
        </div>

        <div className="doc-section">
          <h2>17. Contact Information</h2>
          <div className="contact-block">
            <p><strong>Ampie Ali Limited</strong></p>
            <p>Email: <a href="mailto:support@emorii.com">support@emorii.com</a></p>
            <p>Privacy Enquiries: <a href="mailto:privacy@emorii.com">privacy@emorii.com</a></p>
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
