export const EMOJI_LIST = [
  "😀","😂","😍","🥰","😘","🤗","😊","🙂","😉","😎","🤩","🥳","😋","🤤",
  "😜","🤪","😏","😌","😓","😪","🤒","😷",
  "🤕","🤢","🤮","🥵","🥶","😱","😨","😰","😥","😢","😭","😤","😠","🤬",
  "😈","👿","💀","☠️","💩","🤡","👹","👺","👻","👽","👾","🤖","🎃","😺",
  "😸","😹","😻","😼","😽","🙀","😿","😾","❤️","🧡","💛","💚","💙","💜",
  "🖤","🤍","🤎","💓","💕","💕","💞","💓","💗","💖","💘","💑","💎",
  "👍","🙌","🤝","✌️","🤟","🤘","🤙","👋","🖖","✋","👌","🤌",
  "🔥","✨","⭐","🎈","🎀",
  "🏆","🥇","🥈","🥉",
];

export const REPORT_REASONS = [
  { id: "inappropriate", label: "Inappropriate Content", icon: "alert-circle" },
  { id: "harassment", label: "Harassment or Bullying", icon: "user-x" },
  { id: "spam", label: "Spam or Scam", icon: "mail" },
  { id: "fake", label: "Fake Profile", icon: "user-check" },
  { id: "underage", label: "Underage User", icon: "shield-off" },
  { id: "other", label: "Other", icon: "more-horizontal" },
];

export const CHAT_THEMES = [
  { id: "default", name: "Default", image: null },
  { id: "luxury", name: "Luxury", image: require("@/assets/chat-themes/emorii_luxury.png") },
  { id: "blue_doodle", name: "Blue Doodle", image: require("@/assets/chat-themes/theme-blue-doodle.png") },
  { id: "cats", name: "Cats", image: require("@/assets/chat-themes/theme_cats.png") },
  { id: "dark_doodle", name: "Dark Doodle", image: require("@/assets/chat-themes/theme-dark-doodle.png") },
  { id: "dots", name: "Dots", image: require("@/assets/chat-themes/theme-dots.png") },
  { id: "geometry", name: "Geometry", image: require("@/assets/chat-themes/theme-geometry.jpg") },
  { id: "hearts_outline", name: "Hearts Outline", image: require("@/assets/chat-themes/theme_hearts_outline.png") },
  { id: "hearts_purple", name: "Hearts Purple", image: require("@/assets/chat-themes/theme_hearts_purple.png") },
  { id: "light_doodle", name: "Light Doodle", image: require("@/assets/chat-themes/theme-light-doodle.png") },
  { id: "love_dark", name: "Love Dark", image: require("@/assets/chat-themes/theme_love_dark.png") },
  { id: "love_pink", name: "Love Pink", image: require("@/assets/chat-themes/theme_love_pink.png") },
  { id: "magic", name: "Magic", image: require("@/assets/chat-themes/theme-magic.jpg") },
  { id: "rainbow", name: "Rainbow", image: require("@/assets/chat-themes/theme-rainbow.png") },
  { id: "sky_doodle", name: "Sky Doodle", image: require("@/assets/chat-themes/theme-sky-doodle.png") },
  { id: "valentine_black", name: "Valentine Black", image: require("@/assets/chat-themes/theme_valentine_black.png") },
];

export const AI_SUGGESTIONS = [
  "Hey! How's your day going? 😊",
  "I love your profile! What are your hobbies?",
  "What's your favorite thing to do on weekends?",
  "I noticed we have similar interests! Tell me more about yourself",
  "You seem really interesting! What do you do for fun?",
  "Hi there! What made you swipe right on me? 😄",
  "I'd love to get to know you better!",
  "What's the best trip you've ever taken?",
];

export const WAVEFORM_HEIGHTS = [
  0.3, 0.5, 0.8, 0.6, 1.0, 0.7, 0.4, 0.9, 0.5, 0.7,
  1.0, 0.6, 0.4, 0.8, 0.5, 0.9, 0.6, 0.3, 0.7, 0.5,
  0.8, 1.0, 0.4, 0.6, 0.9, 0.5, 0.7, 0.3, 0.8, 0.6,
];
