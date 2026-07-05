/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        navy: '#081120',
        cobalt: '#2563eb',
        sky: '#e8f3ff',
        ink: '#0f172a',
        mist: '#64748b',
      },
      boxShadow: {
        luxe: '0 30px 90px rgba(67, 96, 168, 0.16)',
        soft: '0 14px 40px rgba(67, 96, 168, 0.16)',
      },
      fontFamily: {
        sans: ['"Space Grotesk"', '"Plus Jakarta Sans"', 'system-ui', 'sans-serif'],
      },
      backgroundImage: {
        'hero-glow':
          'radial-gradient(circle at top, rgba(125, 211, 252, 0.42), transparent 34%), linear-gradient(135deg, #f8fbff 0%, #edf5ff 48%, #dbeafe 100%)',
      },
    },
  },
  plugins: [],
};
