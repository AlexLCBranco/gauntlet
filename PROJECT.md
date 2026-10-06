# Gauntlet

The shared home address for my apps. Each app keeps its own repo and Vercel
project; Gauntlet forwards a path on this domain to it, so everything lives
under one address.

Right now it is just two static files:

- `index.html` — a plain page at `/` linking to each app.
- `vercel.json` — rewrites that forward each app's path to its own deployment.

## Apps forwarded

| Path        | Forwards to                                 |
|-------------|---------------------------------------------|
| `/boardkit` | https://boardkit-iota.vercel.app/boardkit/  |
| `/linkkit`  | https://linkkit-lake.vercel.app/linkkit/    |

Boardkit needs all three rules (`/boardkit`, `/boardkit/`, `/boardkit/:path+`);
a single catch-all returned 404 on `/boardkit/`.

## Adding an app (e.g. Linkkit)

1. The app must be built to serve under its own base path (e.g. `/linkkit/`).
2. Copy the three Boardkit rules in `vercel.json`, swapping the path and URL.
3. Add a link to `index.html`.

## Later

Shared canvas, shared data and app code are planned to live here too. None
of that exists yet.
