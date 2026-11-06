/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      // Cores da marca: use bg-primary, text-accent, bg-soft etc.
      colors: {
        primary: {
          DEFAULT: "#464fa3", // índigo principal
          light: "#737dd9", // índigo mais claro (hover, ícones)
          dark: "#363d85",
        },
        accent: {
          DEFAULT: "#2ca9bc", // ciano dos números
          strong: "#0891b2", // cyan-600, palavra destacada nos títulos
        },
        soft: "#eaedfc", // fundo claro das seções
      },
      // Fontes: font-heading para títulos, font-body para textos
      fontFamily: {
        heading: ["Almarai", "sans-serif"],
        body: ["Roboto", "sans-serif"],
      },
    },
  },
  plugins: [],
};
