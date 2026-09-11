import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';

export default function ChildSafetyStandards() {
  const router = useRouter();

  return (
    <>
      <Head>
        <title>Child Safety Standards — Emorii</title>
        <meta
          name="description"
          content="Emorii child safety standards and reporting policy."
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
              href="/child-safety"
              className={router.pathname === '/child-safety' ? 'active' : ''}
            >
              Child Safety
            </Link>
            <Link href="/delete-account" className={router.pathname === '/delete-account' ? 'active' : ''}>
              Delete Account
            </Link>
          </nav>
        </div>
      </header>

      <main className="page-wrapper">
        <div className="doc-header">
          <h1 className="doc-title">Child Safety Standards</h1>
          <div className="doc-meta">
            <span>Child sexual abuse and exploitation prevention</span>
            <span>Last Updated: 11 September 2026</span>
          </div>
        </div>

        <div className="doc-section">
          <h2>Emorii is an adults-only service</h2>
          <p>
            Emorii is a dating and social platform for adults aged 18 and over.
            Children and anyone under 18 are not permitted to create or use an
            Emorii account.
          </p>
          <p>
            We have zero tolerance for child sexual abuse and exploitation
            (CSAE), child sexual abuse material (CSAM), grooming, sexual
            solicitation of a minor, trafficking, or any attempt to exploit a
            child.
        </p>
        </div>

        <div className="doc-section">
          <h2>Prohibited content and conduct</h2>
          <p>Users must not use Emorii to:</p>
          <ul>
            <li>Create, upload, request, share, store, or distribute CSAM.</li>
            <li>Sexually exploit, groom, solicit, threaten, or abuse a child.</li>
            <li>Impersonate a minor or arrange sexual contact with a minor.</li>
            <li>Trade, promote, or facilitate child trafficking or exploitation.</li>
            <li>Move a child-safety violation to another platform or service.</li>
          </ul>
          <p>
            We may remove content, restrict features, suspend or permanently
            terminate accounts, and preserve relevant information when we
            identify suspected violations.
          </p>
        </div>

        <div className="doc-section">
          <h2>How to report a child-safety concern</h2>
          <p>
            Users can report a profile, message, image, video, or other
            child-safety concern directly in the Emorii app using the available
            reporting tools. Include as much detail as possible and do not
            forward or redistribute suspected CSAM.
          </p>
          <p>
            If you cannot use the app, contact our safety team at{' '}
            <a href="mailto:support@emorii.com?subject=Urgent%20child%20safety%20report">
              support@emorii.com
            </a>{' '}
            with “Urgent child safety report” in the subject line.
          </p>
          <div className="contact-block">
            <p><strong>Child-safety reports</strong></p>
            <p>
              <a href="mailto:support@emorii.com?subject=Urgent%20child%20safety%20report">
                support@emorii.com
              </a>
            </p>
          </div>
        </div>

        <div className="doc-section">
          <h2>Review and enforcement</h2>
          <p>
            We review reports and take action based on the available
            information. Actions may include removing content, restricting or
            closing accounts, preventing re-registration where appropriate, and
            escalating urgent threats to the relevant authorities.
          </p>
          <p>
            We may preserve account, content, and report information when
            necessary for safety investigations, fraud prevention, legal
            compliance, or requests from law enforcement.
          </p>
        </div>

        <div className="doc-section">
          <h2>Reporting to authorities</h2>
          <p>
            Emorii cooperates with lawful requests from law-enforcement and
            child-protection authorities. We report suspected CSAE or CSAM to
            the appropriate regional or national authorities when required by
            applicable law or when necessary to protect a child or prevent
            imminent harm.
          </p>
        </div>

        <div className="doc-section">
          <h2>Contact</h2>
          <div className="contact-block">
            <p><strong>Ampie Ali Limited — Emorii</strong></p>
            <p>
              Safety: <a href="mailto:support@emorii.com">support@emorii.com</a>
            </p>
            <p>
              Privacy and data requests:{' '}
              <a href="mailto:privacy@emorii.com">privacy@emorii.com</a>
            </p>
          </div>
        </div>

        <div className="doc-section">
          <p>
            See our <Link href="/terms">Terms of Service</Link> and{' '}
            <Link href="/privacy">Privacy Policy</Link> for additional platform
            rules and data-handling information.
          </p>
        </div>
      </main>

      <footer className="site-footer">
        <p>© {new Date().getFullYear()} Ampie Ali Limited. All rights reserved.</p>
      </footer>
    </>
  );
}