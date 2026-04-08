import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      // Allaoua Ceram Brand Colors
      colors: {
        brand: {
          primary: '#0284C7',       // Sky Blue 600
          'primary-dark': '#0369A1', // Sky Blue 700
          'primary-light': '#E0F2FE', // Sky Blue 100
          secondary: '#1F2937',      // Dark Gray/Black
          'secondary-light': '#374151',
          accent: '#075985',        // Darker Sky Blue
        },
      },
      backgroundImage: {
        "gradient-radial": "radial-gradient(var(--tw-gradient-stops))",
        "gradient-conic": "conic-gradient(from 180deg at 50% 50%, var(--tw-gradient-stops))",
        // Brand gradient - Glassy Blue
        "brand-gradient": "linear-gradient(135deg, #0284C7 0%, #0369A1 100%)",
        "brand-gradient-dark": "linear-gradient(135deg, #1F2937 0%, #374151 100%)",
      },
      animation: {
        aurora: "aurora 60s linear infinite",
        "aurora-slow": "aurora 90s linear infinite reverse",
      },
      keyframes: {
        aurora: {
          from: {
            backgroundPosition: "50% 50%",
          },
          to: {
            backgroundPosition: "350% 50%",
          },
        },
      },
      // Brand box shadows - Blue
      boxShadow: {
        'brand': '0 4px 14px 0 rgba(2, 132, 199, 0.25)',
        'brand-lg': '0 10px 25px -3px rgba(2, 132, 199, 0.3)',
      },
    },
  },
  plugins: [],
};
export default config;