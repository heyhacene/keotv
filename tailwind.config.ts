import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: 'class',
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        tv: {
          bg: '#0a0d14',
          surface: '#111622',
          card: '#161d2d',
          cardHover: '#1e273c',
          border: '#232d42',
          focus: '#0284c7', // Sky-600
          focusGlow: 'rgba(2, 132, 199, 0.45)',
          accent: '#38bdf8',
          textMuted: '#8b9bb4',
          textSubtle: '#52627a',
          activeItem: '#1e293b',
        },
      },
      boxShadow: {
        'tv-focus': '0 0 0 3px #38bdf8, 0 10px 25px -5px rgba(56, 189, 248, 0.4)',
        'tv-card': '0 4px 20px -2px rgba(0, 0, 0, 0.5)',
      },
      fontFamily: {
        tv: ['system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
    },
  },
  plugins: [],
};

export default config;
