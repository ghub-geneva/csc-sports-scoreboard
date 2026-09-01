#!/usr/bin/env bash
# Cache-busting deploy: bumps the ?v= version on the CSS/JS links so
# browsers fetch fresh files, then commits and pushes.
# Usage:  ./deploy.sh "your commit message"
set -e

msg="${1:-Update site}"
ver="$(date -u +%Y%m%d%H%M%S)"

# Rewrite every ?v=<digits> in the HTML to the new version.
sed -i -E "s/\?v=[0-9]+/?v=$ver/g" index.html admin.html

git add -A
git commit -m "$msg"
git push

echo "Deployed. Asset version is now $ver"
