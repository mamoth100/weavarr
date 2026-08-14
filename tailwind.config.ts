import type { Config } from 'tailwindcss';
import plugin from 'tailwindcss/plugin';

const config: Config = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {},
  },
  plugins: [
    // touch: = coarse pointers (phones/tablets), mouse: = fine pointers.
    // Used to keep hover-reveal affordances on desktop while making the same
    // controls always-visible on touch, where hover doesn't exist.
    plugin(({ addVariant }) => {
      addVariant('touch', '@media (pointer: coarse)');
      addVariant('mouse', '@media (pointer: fine)');
    }),
  ],
};

export default config;
