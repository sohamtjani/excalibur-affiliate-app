/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        navy: '#0c1a2e',
        gold: '#c9a24b',
        ink: '#101c30',
        mist: '#d9e3f0',
      },
      boxShadow: {
        luxe: '0 24px 60px rgba(4, 12, 24, 0.22)',
      },
      fontFamily: {
        serif: ['"Cormorant Garamond"', 'serif'],
        sans: ['"Manrope"', 'system-ui', 'sans-serif'],
      },
      backgroundImage: {
        'hero-glow':
          'radial-gradient(circle at top, rgba(201, 162, 75, 0.26), transparent 44%), linear-gradient(135deg, #091320 0%, #0c1a2e 52%, #142b46 100%)',
      },
    },
  },
  plugins: [],
};
