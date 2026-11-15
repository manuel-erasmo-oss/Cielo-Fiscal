import type { Config } from 'tailwindcss'

const config: Config = {
  darkMode: 'class',
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
    // Única diferencia con el config de Cielo Cloud Nómina: BTN_PRIMARY vive
    // en src/lib/utils.ts y aquí ningún otro archivo repite sus clases, así
    // que sin esta línea Tailwind no genera el gradiente del botón.
    './src/lib/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['var(--font-inter)', 'system-ui', 'sans-serif'],
      },
      colors: {
        // Cielo Cloud brand
        cielo: {
          navy:  '#1B2980',
          green: '#00E676',
          50:    '#eef0fb',
          100:   '#d5d9f4',
          200:   '#aab4ea',
          700:   '#1B2980',
          800:   '#151f66',
          900:   '#0d1449',
        },
      },
      animation: {
        'fade-in': 'fadeIn 0.2s ease-in-out',
        'slide-in': 'slideIn 0.2s ease-out',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideIn: {
          '0%': { transform: 'translateY(-4px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
      },
    },
  },
  plugins: [],
}

export default config
