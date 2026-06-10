import daisyui from 'daisyui'

export default {
  content: ['./index.html', './src/**/*.{vue,js,ts,jsx,tsx}'],
  theme: { extend: {} },
  plugins: [daisyui],
  daisyui: {
    themes: [
      {
        fiestalok: {
          "primary":          "#3b82f6",
          "primary-content":  "#ffffff",
          "secondary":        "#f3f4f6",
          "secondary-content":"#1f2937",
          "accent":           "#2563eb",
          "accent-content":   "#ffffff",
          "neutral":          "#374151",
          "neutral-content":  "#ffffff",
          "base-100":         "#ffffff",
          "base-200":         "#f9fafb",
          "base-300":         "#f3f4f6",
          "base-content":     "#111827",
          "info":             "#0ea5e9",
          "success":          "#22c55e",
          "warning":          "#f59e0b",
          "error":            "#ef4444",
        }
      }
    ]
  }
}
