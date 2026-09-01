# LGU Cordova Sportsfest Scoreboard

A lightweight scoreboard and schedule site for the CSC 126th anniversary sportsfest in Cordova, Cebu. Plain HTML/CSS/JS, no build step. Scores live in a shared Supabase database, so every device sees the same data; the viewer refreshes automatically. Hosted on GitHub Pages at https://csc126.cordova.gov.ph.

## Teams

Royal Blue, Red, Yellow, Green.

## Sports and categories

- Basketball
- Volleyball (best of 3 sets)
- Badminton (best of 3 sets): Singles (Men), Mixed Doubles
- Table Tennis (best of 3 sets): Singles (Men), Singles (Women)
- Pickleball: Beginner, Novice, Intermediate, each with Doubles Men, Doubles Women, Mixed Doubles

## Format and scoring

Each sport category is a single round robin (every team plays each other once). Round-robin standings seed the teams, tiebroken by point difference (or set difference for set-based sports). Then:

- Championship: 1st vs 2nd seed
- Battle for 3rd: 3rd vs 4th seed

Final placements award points to the overall standings: 1st = 10, 2nd = 7, 3rd = 5, 4th = 3.

## Special events

Muse, Banner Raising, and Pinoy Games (each Pinoy Game has its own title) are scored by placement, not head to head, using the same 10/7/5/3 scale, recorded from the Admin page.

## Data and access

- Storage: Supabase tables `matches` and `events` (each `{ id, data }`). Public read; writes require an admin login.
- Admin login: Supabase email/password auth, gated on `admin.html`.
- Config: `js/config.js` holds the Supabase URL and publishable key (safe in the browser; protected by row-level security).

## Deploying updates

GitHub Pages redeploys automatically on every push to `main`. To make sure viewers get the new CSS/JS immediately (no hard refresh), deploy with the helper script, which bumps a `?v=` cache-busting version on the asset links before pushing:

- PowerShell: `.\deploy.ps1 "commit message"`
- Bash: `./deploy.sh "commit message"`

Plain `git push` still works, but browsers may serve cached CSS/JS for up to ~10 minutes.

## Files

- `index.html` - public scoreboard and schedule viewer
- `admin.html` - admin panel (login required) for schedules, results, and special events
- `css/style.css` - all styling
- `js/config.js` - Supabase URL and publishable key
- `js/data.js` - sports config, teams, tournament logic, Supabase storage, and auth helpers
- `js/app.js` - viewer logic
- `js/admin.js` - admin logic
- `img/` - logos and favicon
- `CNAME` - custom domain for GitHub Pages
