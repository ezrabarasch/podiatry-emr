#!/bin/bash
set -e
cd /opt/podiatry-emr

BRANCH=$(git branch --show-current)
if [ -z "$BRANCH" ]; then
  echo "DEPLOY ABORTED: detached HEAD state - check out a branch first." >&2
  exit 1
fi

# Guard 1: refuse to deploy over uncommitted local changes.
# Direct server edits must be committed+pushed (or deliberately discarded) first.
if ! git diff --quiet || ! git diff --cached --quiet; then
  echo "DEPLOY ABORTED: uncommitted local changes in /opt/podiatry-emr." >&2
  echo "Commit and push them (or git checkout -- <file> to discard) before deploying:" >&2
  git status --short >&2
  exit 1
fi

git fetch origin "$BRANCH"

# Guard 2: refuse if local has commits origin doesn't (divergence/unpushed work).
# A hard reset here would silently discard them.
UNPUSHED=$(git rev-list --count origin/"$BRANCH"..HEAD)
if [ "$UNPUSHED" -gt 0 ]; then
  echo "DEPLOY ABORTED: $UNPUSHED local commit(s) not on origin/$BRANCH." >&2
  echo "Push them first: git push origin $BRANCH" >&2
  git log --oneline origin/"$BRANCH"..HEAD >&2
  exit 1
fi

git reset --hard origin/"$BRANCH"
npm install
npx prisma generate
npm run build
pm2 delete podiatry-emr 2>/dev/null || true
pm2 start node_modules/.bin/next --name "podiatry-emr" --cwd /opt/podiatry-emr -- start -p 3000
pm2 save
echo "Deploy complete: $BRANCH @ $(git rev-parse --short HEAD) at $(date)"
