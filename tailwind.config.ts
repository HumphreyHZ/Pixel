import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        shell: "#f4efe7",
        panel: "#fbf8f3",
        ink: "#141414",
        mist: "#6b675f",
        cloud: "#ebe7df",
        peach: "#f3d8c7",
        sky: "#dfe8f7",
        sage: "#d6e1d8",
        amber: "#f3e2bb",
      },
      boxShadow: {
        soft: "0 18px 45px rgba(28, 23, 18, 0.08)",
        float: "0 28px 70px rgba(28, 23, 18, 0.14)",
      },
      borderRadius: {
        panel: "2rem",
      },
      fontFamily: {
        sans: [
          "\"Avenir Next\"",
          "\"SF Pro Display\"",
          "\"PingFang SC\"",
          "\"Hiragino Sans GB\"",
          "\"Microsoft YaHei\"",
          "sans-serif"
        ],
      },
    },
  },
  plugins: [],
} satisfies Config;
