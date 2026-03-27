/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './src/**/*.{js,jsx,ts,tsx}',
    './src/app/**/*.{js,jsx,ts,tsx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'system-ui', 'sans-serif']
      },
      colors: {
        surface: {
          base:     '#0d111a',
          sidebar:  '#0a0e17',
          card:     '#141824',
          elevated: '#1a1f30',
          border:   '#232840',
          strong:   '#353d60'
        },
        ink: {
          DEFAULT: '#dde1f0',
          dim:     '#a0a8c8',
          muted:   '#8890b0',
          faint:   '#6b7299'
        }
      },
      boxShadow: {
        'glow-sm':  '0 0 12px rgba(99,102,241,0.25)',
        'modal':    '0 24px 64px rgba(0,0,0,0.7), 0 4px 16px rgba(0,0,0,0.4)'
      }
    }
  },
  plugins: []
};
