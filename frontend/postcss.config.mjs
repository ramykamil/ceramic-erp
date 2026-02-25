/** @type {import('postcss-load-config').Config} */
const config = {
  plugins: {
    // **Essential:** Tells PostCSS to use the Tailwind CSS plugin.
    tailwindcss: {},
    // **Recommended:** Adds vendor prefixes (like -webkit-, -moz-) for browser compatibility.
    autoprefixer: {},
  },
};

export default config;