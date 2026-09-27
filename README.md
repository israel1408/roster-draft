# ProfileScore AI

Dating profile and chat screenshot auditor built with React, Vite, Tailwind CSS, and Lucide icons.

## Run locally

1. Run `npm install`.
2. Create a `.env` file with `VITE_OPENROUTER_API_KEY=your_openrouter_api_key`.
3. Run `npm run dev`.

Replace `YOUR_WHOP_LINK_HERE` in `src/App.jsx` with the checkout URL before launch. The free scan count and paid access flag are stored in browser localStorage. `VITE_` values are included in browser code, so use a server-side proxy for production secrets.