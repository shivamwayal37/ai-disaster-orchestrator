/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        'disaster-red': '#dc2626',
        'disaster-orange': '#ea580c',
        'disaster-yellow': '#ca8a04',
        'disaster-blue': '#2563eb',
      },
    },
  },
  plugins: [],
}
