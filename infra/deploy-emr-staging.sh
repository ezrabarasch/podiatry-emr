#!/bin/bash
set -e
cd /opt/podiatry-emr-staging
git fetch origin staging
git reset --hard origin/staging
npm install
npx prisma generate
npm run build
pm2 restart podiatry-emr-staging
echo "Staging deploy complete at $(date)"
