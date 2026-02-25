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
          primary: '#DC2626',       // Red
          'primary-dark': '#B91C1C',
          'primary-light': '#FEE2E2',
          secondary: '#1F2937',      // Dark Gray/Black
          'secondary-light': '#374151',
          accent: '#991B1B',        // Darker Red
        },
      },
      backgroundImage: {
        "gradient-radial": "radial-gradient(var(--tw-gradient-stops))",
        "gradient-conic": "conic-gradient(from 180deg at 50% 50%, var(--tw-gradient-stops))",
        // Brand gradient
        "brand-gradient": "linear-gradient(135deg, #DC2626 0%, #991B1B 100%)",
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
      // Brand box shadows
      boxShadow: {
        'brand': '0 4px 14px 0 rgba(220, 38, 38, 0.25)',
        'brand-lg': '0 10px 25px -3px rgba(220, 38, 38, 0.3)',
      },
    },
  },
  plugins: [],
};
export default config;