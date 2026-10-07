/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './index.tsx',
    './App.tsx',
    './components/**/*.{js,ts,jsx,tsx}',
    './views/**/*.{js,ts,jsx,tsx}',
    './services/**/*.{js,ts,jsx,tsx}',
    './contexts/**/*.{js,ts,jsx,tsx}',
  ],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        sans: ['DM Sans', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['IBM Plex Mono', 'ui-monospace', 'monospace'],
      },
      colors: {
        brand: {
          300: '#6EE7B7',
          400: '#34D399',
          500: '#10B981',
          600: '#059669',
          700: '#047857',
          800: '#065F46',
          900: '#064E3B',
        },
      },
      animation: {
        shimmer:      'skeletonPulse 1.4s ease-in-out infinite',
        badgePop:     'badgePop 0.35s cubic-bezier(0.34, 1.56, 0.64, 1) both',
        toastIn:      'toastIn 0.35s cubic-bezier(0.16, 1, 0.3, 1) both',
        scaleIn:      'scaleIn 0.2s cubic-bezier(0.16, 1, 0.3, 1) both',
        slideInRight: 'slideInRight 0.3s cubic-bezier(0.16, 1, 0.3, 1) both',
        fadeIn:       'fadeIn 0.2s ease-out both',
      },
      keyframes: {
        skeletonPulse: {
          '0%, 100%': { opacity: '.72' },
          '50%': { opacity: '1' },
        },
        badgePop: {
          '0%':   { transform: 'scale(0)' },
          '70%':  { transform: 'scale(1.15)' },
          '100%': { transform: 'scale(1)' },
        },
        toastIn: {
          from: { opacity: '0', transform: 'translateY(20px) scale(0.95)' },
          to:   { opacity: '1', transform: 'translateY(0) scale(1)' },
        },
        scaleIn: {
          from: { opacity: '0', transform: 'scale(0.95)' },
          to:   { opacity: '1', transform: 'scale(1)' },
        },
        slideInRight: {
          from: { opacity: '0', transform: 'translateX(24px)' },
          to:   { opacity: '1', transform: 'translateX(0)' },
        },
        fadeIn: {
          from: { opacity: '0', transform: 'translateY(6px)' },
          to:   { opacity: '1', transform: 'translateY(0)' },
        },
      },
      boxShadow: {
        'glow-teal':  '0 0 24px rgba(20, 184, 166, 0.2)',
        'glow-rose':  '0 0 24px rgba(244, 63, 94, 0.2)',
        'glow-indigo':'0 0 24px rgba(99, 102, 241, 0.2)',
        'card':       '0 1px 3px rgba(0,0,0,0.05), 0 1px 2px rgba(0,0,0,0.03)',
        'card-hover': '0 10px 40px rgba(0,0,0,0.08)',
      },
    },
  },
  plugins: [],
};
