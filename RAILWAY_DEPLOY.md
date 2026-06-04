# Deploying to Railway (Backend)

Railway is better than Render free tier for this project because:
- No cold-start sleep (Render free sleeps after 15 min → 30-60s first connection)
- 500 free hours/month (~20 days of 24/7 uptime)
- WebSocket support works natively
- Deploys from GitHub automatically

---

## Step 1 — Create a Railway account
1. Go to https://railway.app
2. Sign up with your GitHub account

---

## Step 2 — Deploy the backend

1. Click **"New Project"**
2. Choose **"Deploy from GitHub repo"**
3. Select `killer-in-the-city`
4. Railway will detect it as a Node.js project — **but** because your repo has both `frontend/` and `backend/`, you need to set the root directory:
   - In the service settings → **"Source"** → set **Root Directory** to `backend`
5. Railway will auto-run `npm start` (which runs `node server.js`) ✅

---

## Step 3 — Set environment variables (optional)
No required env vars — `PORT` is automatically injected by Railway.

If you want to lock CORS to your Vercel domain later:
| Key | Value |
|-----|-------|
| `FRONTEND_URL` | `https://your-app.vercel.app` |

---

## Step 4 — Get your Railway URL
1. Go to your service → **"Settings"** → **"Networking"**
2. Click **"Generate Domain"**
3. You'll get something like `https://killer-in-the-city-production.up.railway.app`

---

## Step 5 — Update frontend to point to Railway

In Vercel dashboard (or your `.env` file locally):

```
REACT_APP_BACKEND_URL=https://killer-in-the-city-production.up.railway.app
```

In Vercel:
1. Project Settings → Environment Variables
2. Add `REACT_APP_BACKEND_URL` = your Railway URL
3. Redeploy the frontend (or push a commit — it auto-deploys)

---

## Step 6 — Verify it works
Open: `https://your-railway-url.railway.app/health`
You should see: `{"ok":true}`

---

## Keeping within free tier
- Railway gives **500 hours/month free** on the Hobby plan's trial
- After trial, Hobby plan is **$5/month** (worth it for always-on WebSockets)
- Alternatively: deploy only when playing, pause the service otherwise

---

## Summary: full free stack
| Layer | Platform | Cost |
|-------|----------|------|
| Frontend | Vercel | Free forever |
| Backend | Railway | Free 500h/mo |
| Database | None needed (in-memory) | Free |

