/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/lib/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        background: 'var(--color-background)',
        surface: 'var(--color-surface)',
        'surface-muted': 'var(--color-surface-muted)',
        border: 'var(--color-border)',
        'text-primary': 'var(--color-text-primary)',
        'text-secondary': 'var(--color-text-secondary)',
        'text-muted': 'var(--color-text-muted)',
        accent: 'var(--color-accent)',
        'accent-hover': 'var(--color-accent-hover)',
        success: 'var(--color-success)',
        warning: 'var(--color-warning)',
        error: 'var(--color-error)',
      },
      boxShadow: {
        elevated: 'var(--shadow-elevated)',
        soft: 'var(--shadow-soft)',
      },
      borderRadius: {
        sm: 'var(--radius-sm)',
        md: 'var(--radius-md)',
        lg: 'var(--radius-lg)',
        xl: 'var(--radius-xl)',
      },
    },
  },
  plugins: [],
  safelist: [
    'ui-card',
    'ui-card-muted',
    'ui-button',
    'ui-button-primary',
    'ui-button-secondary',
    'ui-button-link',
    'ui-table',
    'ui-banner',
    'ui-banner-success',
    'ui-banner-warning',
    'ui-banner-error',
    'ui-empty-state',
    'glass-card',
    'gradient-bg',
    'accent-gradient',
  ],
};
