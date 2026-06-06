
const express = require('express');
const router = express.Router();

const PRIVACY_POLICY = {
  lastUpdated: "2025-01-25",
  content: `
# Privacy Policy

Last Updated: January 25, 2025

## Introduction
Emorii ("we", "us", or "our") respects your privacy and is committed to protecting your personal data.

## Data We Collect
- **Profile Information**: Name, age, gender, bio, photos, interests
- **Location Data**: Your location for matching purposes
- **Usage Data**: Swipe history, matches, messages, call history
- **Device Information**: Device type, OS version, unique identifiers

## How We Use Your Data
- To provide and improve our matching service
- To facilitate communication between matched users
- To ensure safety and prevent fraud
- To send important notifications about your account

## Data Sharing
We do NOT sell your personal data. We may share data with:
- Other users you match with (limited profile information)
- Service providers (cloud hosting, analytics)
- Law enforcement when legally required

## Your Rights
- Access your data
- Delete your account and data
- Opt out of certain data processing
- Export your data

## Data Security
We use industry-standard encryption and security measures to protect your data.

## Contact Us
For privacy concerns: privacy@emorii.app

## Changes to Privacy Policy
We may update this policy and will notify you of significant changes.
  `
};

const TERMS_OF_SERVICE = {
  lastUpdated: "2025-01-25",
  content: `
# Terms of Service

Last Updated: January 25, 2025

## Agreement to Terms
By using Emorii, you agree to these Terms of Service.

## Eligibility
- You must be at least 18 years old
- You must provide accurate information
- One account per person

## User Conduct
You agree NOT to:
- Harass, abuse, or harm other users
- Share inappropriate or offensive content
- Use the service for commercial purposes
- Create fake profiles or impersonate others
- Share other users' information without consent

## Content Rights
- You retain rights to your photos and content
- You grant us license to use your content within the app
- You're responsible for content you share

## Safety
- Report suspicious behavior
- Never share financial information with matches
- Meet in public places for first dates
- We verify some profiles but cannot guarantee authenticity

## Account Termination
We may suspend or terminate accounts that violate these terms.

## Limitation of Liability
Emorii is provided "as is". We're not liable for:
- User conduct or safety
- Lost connections or data
- Third-party actions

## Subscription & Payments
- Subscriptions auto-renew unless cancelled
- Refunds subject to our refund policy
- Prices subject to change with notice

## Changes to Terms
We may update these terms and will notify you of material changes.

## Contact
For questions: support@emorii.app

## Governing Law
These terms are governed by applicable laws.
  `
};

router.get('/privacy-policy', (req, res) => {
  res.json({
    success: true,
    data: PRIVACY_POLICY
  });
});

router.get('/terms-of-service', (req, res) => {
  res.json({
    success: true,
    data: TERMS_OF_SERVICE
  });
});

const COMMUNITY_GUIDELINES = {
  lastUpdated: "2026-04-22",
  content: `Welcome to Emorii — where real connections happen.

We built Emorii to help people find genuine relationships, friendships, and love. To keep this a safe, respectful, and authentic space for everyone, every member agrees to follow these guidelines. Breaking them can result in warnings, suspension, or a permanent ban.

1. Be Real

- Use your real name and real photos. No catfishing, no fake identities, no celebrity photos, no AI-generated faces pretending to be you.
- One person, one account. Multiple accounts will be removed.
- Your face must be clearly visible in at least one profile photo.
- You must be 18 or older. No exceptions, ever.
- Be honest about who you are — your age, location, relationship status, and intentions.

2. Be Respectful

- Treat everyone with kindness, even when you're not interested.
- No hate speech. This includes attacks based on race, ethnicity, tribe, nationality, religion, gender, sexual orientation, disability, or appearance.
- No harassment, threats, or bullying. Not in messages, not in your bio, not anywhere.
- "No" means no. If someone declines a date, ignores you, or unmatches, respect it and move on.
- Don't body-shame, slut-shame, or mock anyone, even in a "joking" way.

3. Be Safe

- Never send money to someone you've met on Emorii — no matter how convincing the story is. This is the #1 scam pattern.
- Don't share sensitive personal info (bank details, ID numbers, passwords, OTP codes) with matches.
- Meet in public places for first dates. Tell a friend where you're going.
- Trust your instincts. If something feels off, it usually is. Block and report.
- Video-call before meeting in person to confirm the person matches their photos.

4. What's Not Allowed

The following will get your account removed immediately:

- Nudity or sexually explicit content in profile photos, bios, or messages
- Soliciting or offering paid services (escort work, sugar arrangements, "pay-per-meet")
- Promoting or selling anything — products, services, OnlyFans, Telegram channels, crypto, MLM schemes
- Sharing illegal content — drugs, weapons, stolen goods
- Underage users or content involving minors in any way
- Violence, gore, or self-harm content
- Spam — copy-pasted messages to many users, link farming, contact-info-only profiles
- Impersonating someone else — public figures, other users, or fictional characters
- Sharing other users' private content (photos, messages, personal info) without permission
- Romance scams — fake love stories designed to extract money or information

5. Photo Rules

Allowed:
- Clear photos of you (face visible)
- Group photos (if it's clear which one is you)
- Photos of you doing things you love
- Pet, travel, lifestyle photos that show your personality

Not allowed:
- Nudity, lingerie shots, or sexually suggestive poses
- Photos of children (yours or anyone else's)
- Photos of weapons or drug use
- Memes or text-only images as your main photo
- Photos that aren't of you
- Photos with your phone number, social handles, or WhatsApp numbers written on them

6. Messaging Rules

- No unsolicited explicit messages or photos. Ever.
- Don't ask for money, gifts, or financial help.
- Don't push to move conversations off the app immediately — scammers do this to avoid getting caught.
- Don't send the same message to dozens of matches. Be genuine.
- What's shared in a chat stays in that chat. Don't screenshot and share private conversations publicly.

7. Voice & Video Calls

- Be fully clothed. Treat video calls like a real first meeting.
- No screen recording or screenshotting another person without consent.
- If someone exposes themselves or behaves inappropriately, end the call immediately and report them.

8. Reporting & Blocking

If you see someone breaking these rules:

- Tap their profile then Report and choose the reason
- Block them to stop all contact instantly
- Reports are anonymous — the other person never knows you reported them
- Our moderation team reviews every report, usually within 24 hours

Don't retaliate. If someone harasses you, report them — don't fight back publicly.

9. What Happens When Rules Are Broken

We use a tiered approach:

- Minor (rude messages, low-quality photo): Warning + content removal
- Moderate (repeated rule breaks, mild harassment): Temporary suspension (1–30 days)
- Severe (nudity, scams, harassment, fake profile): Permanent ban + device fingerprint block
- Illegal (minors, threats, fraud): Permanent ban + reported to authorities

Banned accounts cannot be appealed for serious violations. Don't try to make a new account — it will be detected and removed.

10. Premium Members Aren't Above the Rules

Paying for Premium is awesome — it doesn't give you special permissions. Premium members are held to the exact same standards as everyone else, and may actually be held to a slightly higher bar since you're investing in real connections.

11. Help Us Build a Better Community

- Be patient — finding the right person takes time
- Give thoughtful first messages — "Hi" rarely works
- Update your profile when your life changes
- Leave gracefully — if you find love (or just leave), please delete your account so you don't waste anyone's time
- Share feedback — tell us how to make Emorii better

Contact Us

Questions about these guidelines? Need to report something serious?

- safety@emorii.app (urgent safety issues)
- support@emorii.app (general questions)

Thank you for being part of Emorii. Now go find someone amazing.

Last Updated: April 22, 2026`
};

router.get('/community-guidelines', (req, res) => {
  res.json({
    success: true,
    data: COMMUNITY_GUIDELINES
  });
});

module.exports = router;
