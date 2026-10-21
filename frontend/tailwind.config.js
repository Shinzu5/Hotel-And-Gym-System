/** @type {import('tailwindcss').Config} */

// The palette is driven by CSS variables (see app/globals.css) so that ONE
// class on <html> — `dark` — flips the entire app, including every @apply in
// the component layer. `on-accent` is the one extra token: text and icons that
// sit ON a saturated surface (buttons, badges) are always white, while the
// surface token itself goes dark.
const v = (name) => `rgb(var(--${name}) / <alpha-value>)`;

const palette = {
  white: v("white"),
  black: v("black"),
  "on-accent": v("on-accent"),
  gray: {
    50: v("gray-50"),
    100: v("gray-100"),
    200: v("gray-200"),
    300: v("gray-300"),
    400: v("gray-400"),
    500: v("gray-500"),
    600: v("gray-600"),
    700: v("gray-700"),
    800: v("gray-800"),
    900: v("gray-900"),
  },
  green: {
    50: v("green-50"),
    100: v("green-100"),
    500: v("green-500"),
    600: v("green-600"),
    700: v("green-700"),
    800: v("green-800"),
    900: v("green-900"),
  },
  amber: {
    50: v("amber-50"),
    100: v("amber-100"),
    500: v("amber-500"),
    600: v("amber-600"),
    700: v("amber-700"),
    800: v("amber-800"),
    900: v("amber-900"),
  },
  red: {
    50: v("red-50"),
    100: v("red-100"),
    500: v("red-500"),
    600: v("red-600"),
    700: v("red-700"),
    800: v("red-800"),
  },
  blue: {
    50: v("blue-50"),
    100: v("blue-100"),
    500: v("blue-500"),
    600: v("blue-600"),
    700: v("blue-700"),
    800: v("blue-800"),
  },
  violet: {
    100: v("violet-100"),
    600: v("violet-600"),
    700: v("violet-700"),
  },
  emerald: {
    400: v("emerald-400"),
  },
};

module.exports = {
  darkMode: "class",
  content: [
    "./app/**/*.{js,jsx}",
    "./components/**/*.{js,jsx}",
    "./lib/**/*.{js,jsx}",
  ],
  theme: {
    extend: {
      colors: palette,
      fontFamily: {
        sans: [
          "ui-sans-serif",
          "system-ui",
          "-apple-system",
          "Segoe UI",
          "Roboto",
          "Helvetica Neue",
          "Arial",
          "Noto Sans",
          "sans-serif",
        ],
        display: [
          "Segoe UI",
          "Arial Black",
          "Impact",
          "ui-sans-serif",
          "system-ui",
          "sans-serif",
        ],
      },
      boxShadow: {
        card: "0 1px 2px 0 rgb(var(--shadow) / 0.06), 0 1px 3px 0 rgb(var(--shadow) / 0.08)",
        pop: "0 12px 32px -12px rgb(var(--shadow) / 0.35)",
      },
      keyframes: {
        "toast-in": {
          "0%": { opacity: "0", transform: "translateY(10px) scale(0.98)" },
          "100%": { opacity: "1", transform: "none" },
        },
        "pop-in": {
          "0%": { opacity: "0", transform: "translateY(6px) scale(0.985)" },
          "100%": { opacity: "1", transform: "none" },
        },
      },
      animation: {
        "toast-in": "toast-in 0.18s ease-out",
        "pop-in": "pop-in 0.16s ease-out",
      },
    },
  },
  plugins: [],
};
