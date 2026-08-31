# CSC Sports Scoreboard

A lightweight scoreboard and schedule site for the Civil Service Commission (Cordova, Cebu) sportsfest. No server or build step: open `index.html` in a browser to view, and `admin.html` to manage schedules and results. Data is saved in the browser via localStorage.

## Teams

Royal Blue, Red, Yellow, Green.

## Sports and categories

- Basketball
- Volleyball
- Badminton: Singles (Men), Mixed Doubles
- Table Tennis: Singles (Men), Singles (Women)
- Pickleball: Beginner, Novice, Intermediate, each with Doubles Men, Doubles Women, Mixed Doubles

## Format and scoring

Each sport category is a single round robin (every team plays each other once). Round-robin standings seed the teams, tiebroken by point difference. Then:

- Championship: 1st vs 2nd seed
- Battle for 3rd: 3rd vs 4th seed

Final placements award points to the overall standings: 1st = 10, 2nd = 7, 3rd = 5, 4th = 3.

## Special events

Muse and Banner Raising are scored by placement (not head to head), using the same 10/7/5/3 scale, recorded from the Admin page.

## Files

- `index.html` - public scoreboard and schedule viewer
- `admin.html` - admin panel for schedules, results, and special events
- `css/style.css` - all styling
- `js/data.js` - sports config, teams, tournament logic, and storage
- `js/app.js` - viewer logic
- `js/admin.js` - admin logic
- `img/` - logos and favicon
