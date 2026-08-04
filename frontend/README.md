# NeoMatCare — Web Dashboard

React + Vite web frontend for **NeoMatCare**, an AI-assisted maternal, newborn, and under-five emergency referral platform for Northern Ghana — built as an entry to UNICEF StartUp Lab's *AI for Nurturing Care* hackathon.

Used by facility admins, superadmins, specialists, and drivers; also usable by health workers on a desktop/laptop. For the full project narrative — problem statement, solution mapping, architecture, and roadmap — see the [backend repo's README](https://github.com/mohammedawalbawahissah-gif/NeomatCare#readme).

## Related repositories

| Layer | Repository |
|-------|-----------|
| **Backend API** | [`NeomatCare`](https://github.com/mohammedawalbawahissah-gif/NeomatCare) |
| **Web Dashboard** (this repo) | [`neomatcare-frontend`](https://github.com/mohammedawalbawahissah-gif/neomatcare-frontend) |
| **Mobile App** | [`neomatcare-mobile`](https://github.com/mohammedawalbawahissah-gif/neomatcare-mobile) |

## Tech stack

- React 18 + Vite
- React Router
- Tailwind CSS
- TanStack Query
- Axios (with an offline-first mutation queue — see `src/utils/offlineQueue.js`)
- Recharts (analytics), React Leaflet (maps)
- Lucide icons

## Setup

```bash
npm install
cp .env.example .env.local   # then set VITE_API_URL to your backend
npm run dev
```

Vite bakes `VITE_API_URL` in at build time, not runtime — rebuild after changing it.

### Build for production

```bash
npm run build
```

## Project structure

```
src/
├── api/           # axios instance + all API modules
├── components/    # shared UI, layout, AI panels, voice, sync/offline indicators
├── contexts/      # auth, offline queue
├── hooks/
├── pages/         # one folder per role/feature area
└── utils/         # offline mutation queue, helpers
```

## License

MIT — see [LICENSE](LICENSE).
