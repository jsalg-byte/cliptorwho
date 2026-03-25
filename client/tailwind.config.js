import forms from '@tailwindcss/forms';

/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        bg: {
          base: 'var(--bg-base)',
          card: 'var(--bg-card)',
          elevated: 'var(--bg-elevated)',
        },
        border: 'var(--border)',
        accent: {
          purple: 'var(--accent-purple)',
          cyan: 'var(--accent-cyan)',
          green: 'var(--accent-green)',
          red: 'var(--accent-red)',
        },
        text: {
          primary: 'var(--text-primary)',
          secondary: 'var(--text-secondary)',
          muted: 'var(--text-muted)',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      animation: {
        pulseSoft: 'pulseSoft 1.8s ease-in-out infinite',
        slideIn: 'slideIn 240ms ease-out',
      },
      keyframes: {
        pulseSoft: {
          '0%, 100%': { opacity: 0.6, transform: 'scale(1)' },
          '50%': { opacity: 1, transform: 'scale(1.08)' },
        },
        slideIn: {
          '0%': { opacity: 0, transform: 'translateY(-10px)' },
          '100%': { opacity: 1, transform: 'translateY(0)' },
        },
      },
    },
  },
  plugins: [forms],
};
