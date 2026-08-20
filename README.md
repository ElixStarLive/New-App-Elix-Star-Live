# Elix Star Live (rebuild)

Clean production rewrite. The old application at `C:\Users\Absm Construction\Desktop\Elix Star Live` is the read-only reference.

## Develop

```bash
cp .env.example .env
# set DATABASE_URL and JWT_SECRET
npm install
npm run migrate
npm run dev:all
```

Gates: `npm run check:all && npm run lint && npm test && npm run build`
