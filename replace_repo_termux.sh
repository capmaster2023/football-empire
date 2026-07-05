#!/data/data/com.termux/files/usr/bin/bash
set -e

pkg update -y
pkg install -y git gh unzip nodejs

ZIP="/storage/emulated/0/Download/football-empire-v1.1-mercato-club-fixed.zip"
REPO="football-empire"
OWNER="$(gh api user -q .login)"
WORK="$HOME/$REPO"
TMP="$HOME/${REPO}-tmp"

if [ ! -f "$ZIP" ]; then
  echo "ERREUR: ZIP introuvable: $ZIP"
  echo "Mets football-empire-v1.1-mercato-club-fixed.zip dans Download."
  exit 1
fi

gh repo view "$OWNER/$REPO" >/dev/null 2>&1 || gh repo create "$OWNER/$REPO" --public --description "Football Empire Android game"

rm -rf "$WORK" "$TMP"
mkdir -p "$WORK" "$TMP"
unzip -oq "$ZIP" -d "$TMP"

if [ -d "$TMP/football-empire" ]; then
  cp -a "$TMP/football-empire/." "$WORK/"
else
  cp -a "$TMP/." "$WORK/"
fi

rm -rf "$TMP"
cd "$WORK"

git init
git branch -M main
git config --global user.name "$OWNER"
git config --global user.email "$OWNER@users.noreply.github.com"
git remote remove origin 2>/dev/null || true
git remote add origin "https://github.com/$OWNER/$REPO.git"

git add -A
git commit -m "Replace project with Football Empire v1.1" || true
git push -u origin main --force

echo "Repo remplacé: https://github.com/$OWNER/$REPO"
echo "Actions: https://github.com/$OWNER/$REPO/actions"
