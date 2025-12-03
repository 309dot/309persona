/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#f2f6ff",
          100: "#e0e9ff",
          200: "#bcd1ff",
          300: "#8ab1ff",
          400: "#598dff",
          500: "#336bfd",
          600: "#214fda",
          700: "#163bb1",
          800: "#102a82",
          900: "#0a1c59",
        },
      },
      fontFamily: {
        sans: ["'Pretendard Variable'", "Inter", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
}

