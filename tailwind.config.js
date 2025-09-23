module.exports = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}"
  ],
  theme: {
    extend: {
      colors: {
        dark: {
          50:"#f8fafc",100:"#f1f5f9",200:"#e2e8f0",300:"#cbd5e1",400:"#94a3b8",
          500:"#64748b",600:"#475569",700:"#334155",800:"#1e293b",900:"#0f172a"
        }
      },
      animation: {
        "fade-in":"fadeIn .3s ease-in-out",
        "slide-up":"slideUp .3s ease-in-out",
        "pulse-soft":"pulseSoft 2s infinite"
      },
      keyframes: {
        fadeIn:{"0%":{opacity:"0"},"100%":{opacity:"1"}},
        slideUp:{"0%":{transform:"translateY(20px)",opacity:"0"},"100%":{transform:"translateY(0)",opacity:"1"}},
        pulseSoft:{"0%,100%":{opacity:"1"},"50%":{opacity:".7"}}
      }
    }
  },
  plugins:[]
}