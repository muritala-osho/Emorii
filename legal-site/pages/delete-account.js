import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';

export default function DeleteAccount() {
  const router = useRouter();

  return (
    <>
      <Head>
        <title>Delete Your Account — Emorii</title>
        <meta
          name="description"
          content="Request deletion of your Emorii account and associated personal data."
        />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" href="/favicon.ico" />
      </Head>

      <header className="site-header">
        <div className="site-header-inner">
          <span className="site-logo">Emorii</span>
          <nav className="site-nav">
            <Link href="/privacy" className={router.pathname === '/privacy' ? 'active' : ''}>
              Privacy Policy
            </Link>
            <Link href="/terms" className={router.pathname === '/terms' ? 'active' : ''}>
              Terms of Service
            </Link>
            <Link
              href="/delete-account"
              className={router.pathname === '/delete-account' ? 'active' : ''}
            >
              Delete Account
            </Link>
          </nav>
        </div>
      </header>

      <main className="page-wrapper">
        <div className="doc-header">
          <h1 className="doc-title">Delete Your Emorii Account</h1>
          <div className="doc-meta">
            <span>Account and data deletion</span>
            <span>Last Updated: 19 April 2026</span>
          </div>
        </div>

        <div className="doc-section">
          <h2>Delete your account in the app</h2>
          <p>
            The fastest way to delete your Emorii account and associated data is
            through the app:
          </p>
          <ol>
            <li>Open Emorii and sign in to your account.</li>
            <li>Open <strong>Settings</strong>.</li>
            <li>Open <strong>Privacy</strong>.</li>
            <li>Select <strong>Delete Account</strong> and confirm the request.</li>
          </ol>
          <p>
            Account deletion is permanent. You may be asked to confirm your
            password or verify your identity before the deletion is completed.
          </p>
        </div>

        <div className="doc-section">
          <h2>What will be deleted</h2>
          <p>
            Deleting your account removes your profile and associated account
            data, including profile information, photos, matches, messages,
            activities, friend requests, and call history.
          </p>
          <p>
            Some information may be retained for a limited period when required
            by law, for fraud prevention, security, dispute resolution, or
            accounting obligations. Any retained information is handled
            according to the Emorii Privacy Policy.
          </p>
        </div>

        <div className="doc-section">
          <h2>Can’t access the app?</h2>
          <p>
            If you cannot sign in or cannot complete the deletion steps, send a
            request from the email address associated with your Emorii account.
            Include “Account deletion request” in the subject line. We may need
            to verify ownership before processing the request.
          </p>
          <div className="contact-block">
            <p><strong>Account deletion support</strong></p>
            <p>
              <a href="mailto:privacy@emorii.com?subject=Account%20deletion%20request">
                privacy@emorii.com
              </a>
            </p>
          </div>
        </div>

        <div className="doc-section">
          <p>
            Read our <Link href="/privacy">Privacy Policy</Link> for more
            information about how Emorii handles personal data.
          </p>
        </div>
      </main>

      <footer className="site-footer">
        <p>© {new Date().getFullYear()} Emorii. All rights reserved.</p>
      </footer>
    </>
  );
}