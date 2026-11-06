/** @type {import('tailwindcss').Config} */
export default {
    darkMode: 'class',
    content: [
      "./index.html",
      "./src/**/*.{js,ts,jsx,tsx}",
    ],
    theme: {
      extend: {
        colors: {
          brand: {
            blue: '#0071e3',
          },
          surface: '#f9f9f9',
          separator: '#e8e8ed',
          text: {
            primary: '#1d1d1f',
            secondary: '#6e6e73',
          },
          dark: {
            base: '#000000',
            surface: '#1c1c1e',
          },
        },
        height: {
            'fill-available': '-webkit-fill-available',
        }
      },
    },
    plugins: [require("tailwind-scrollbar-hide")],
  }
