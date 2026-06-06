import { Alert } from "react-native";

type DetectorRule = {
  label: string;
  test: (text: string, lower: string) => boolean;
};

const DETECTORS: DetectorRule[] = [
  {
    label: "Phone number",
    test: (t) =>
      /\b\d{3}[-.\s]?\d{3}[-.\s]?\d{4}\b/.test(t) ||
      /\+\d{1,3}[\s-]?\d{6,14}\b/.test(t) ||
      /\b\d{10,13}\b/.test(t),
  },
  {
    label: "Email address",
    test: (t) => /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/.test(t),
  },
  {
    label: "Web link",
    test: (t) => /https?:\/\/[^\s]+/i.test(t) || /\bwww\.[^\s]+\.[a-z]{2,}/i.test(t),
  },
  {
    label: "Social handle",
    test: (t) => /(^|\s)@[A-Za-z0-9_.]{3,}/.test(t),
  },
  {
    label: "Street address",
    test: (t) =>
      /\b\d+\s+[A-Za-z\s]+(?:Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Drive|Dr|Court|Ct|Lane|Ln)\b/i.test(t),
  },
  {
    label: "Off-platform messaging app",
    test: (_t, lower) =>
      ["whatsapp", "telegram", "snapchat", "wechat", "viber", "signal", "kik", "discord"].some((k) =>
        lower.includes(k),
      ),
  },
  {
    label: "Other social platform",
    test: (_t, lower) =>
      ["instagram", "facebook", "tiktok", "twitter", "ig handle", "fb me", "add me on"].some((k) =>
        lower.includes(k),
      ),
  },
  {
    label: "Request to move off-app",
    test: (_t, lower) =>
      [
        "call me",
        "text me",
        "my number",
        "phone number",
        "give me your number",
        "what's your number",
        "whats your number",
      ].some((k) => lower.includes(k)),
  },
  {
    label: "Financial / sensitive credentials",
    test: (_t, lower) =>
      [
        "credit card",
        "debit card",
        "bank account",
        "routing number",
        "sort code",
        "iban",
        "password",
        " pin ",
        "ssn",
        "social security",
        "send money",
        "wire transfer",
        "bitcoin",
        "crypto wallet",
        "gift card",
      ].some((k) => lower.includes(k)),
  },
  {
    label: "In-person meetup proposal",
    test: (_t, lower) =>
      ["live at", "i live in", "meet at", "come to my", "my address", "pick you up"].some((k) =>
        lower.includes(k),
      ),
  },
];

export interface SecurityScanResult {
  isSensitive: boolean;
  reasons: string[];
}

export function scanForSensitiveInfo(text: string): SecurityScanResult {
  if (!text || typeof text !== "string") return { isSensitive: false, reasons: [] };
  const lower = text.toLowerCase();
  const reasons: string[] = [];
  for (const rule of DETECTORS) {
    try {
      if (rule.test(text, lower)) reasons.push(rule.label);
    } catch {
      // ignore individual detector errors
    }
  }
  return { isSensitive: reasons.length > 0, reasons };
}

export function containsSensitiveInfo(text: string): boolean {
  return scanForSensitiveInfo(text).isSensitive;
}

export function showPersonalInfoWarning(
  reasonsOrOnProceed: string[] | (() => void),
  onProceed?: () => void,
  onCancel?: () => void,
): void {
  let reasons: string[] = [];
  let proceed: () => void;
  let cancel: (() => void) | undefined;

  if (typeof reasonsOrOnProceed === "function") {
    proceed = reasonsOrOnProceed;
    cancel = onProceed as unknown as (() => void) | undefined;
  } else {
    reasons = reasonsOrOnProceed;
    proceed = onProceed || (() => {});
    cancel = onCancel;
  }

  const detectedLine =
    reasons.length > 0
      ? `We spotted: ${reasons.join(", ")}.\n\n`
      : "We spotted possible personal info in your message.\n\n";

  Alert.alert(
    "Heads up — keep yourself safe",
    `${detectedLine}For your safety, we recommend:\n\n` +
      "• Keep conversations inside Emorii\n" +
      "• Never share financial or login info\n" +
      "• Be cautious of urgent money requests\n" +
      "• Report suspicious behavior\n\n" +
      "Send this message anyway?",
    [
      { text: "Cancel", style: "cancel", onPress: cancel },
      { text: "Send anyway", style: "destructive", onPress: proceed },
    ],
    { cancelable: true },
  );
}
