#!/bin/bash
# Start script
npx prisma migrate dev
npx prisma generate
nest start --watch