/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Deep cognitive workspace palette
        void: '#08080f',
        surface: '#0d0d1a',
        panel: '#111124',
        border: '#1e1e3a',
        muted: '#2a2a4a',
        ghost: '#3d3d6b',

        // Accent
        pulse: '#6c63ff',       // primary purple-indigo
        'pulse-dim': '#4a45b5',
        aurora: '#00d4b5',      // teal — engagement positive
        amber: '#f59e0b',       // attention warning
        crimson: '#ef4444',     // overload alert
        sage: '#22c55e',        // mastery high

        // Text
        text: {
          primary: '#e8e8f0',
          secondary: '#9090b8',
          muted: '#5a5a80',
          inverse: '#08080f',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
      boxShadow: {
        glow: '0 0 24px rgba(108, 99, 255, 0.25)',
        'glow-aurora': '0 0 24px rgba(0, 212, 181, 0.2)',
        panel: '0 4px 24px rgba(0,0,0,0.6)',
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'fade-in': 'fadeIn 0.4s ease-out',
        'slide-up': 'slideUp 0.3s ease-out',
        'waveform': 'waveform 1.2s ease-in-out infinite',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(16px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        waveform: {
          '0%, 100%': { transform: 'scaleY(0.3)' },
          '50%': { transform: 'scaleY(1)' },
        },
      },
    },
  },
  plugins: [],
}
