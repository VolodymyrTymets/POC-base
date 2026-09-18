#!/bin/sh
echo "Moving api/.env to $1"
cp $PWD/api/.env $1/api/
cp $PWD/api/.env.development $1/api/
cp $PWD/api/.env.test $1/api/


echo "Moving web/.env to $1/web/..."
cp $PWD/web/.env $1/web/
cp $PWD/web/packages/app/.env.development $1/web/packages/app/
cp $PWD/web/packages/admin/.env.development $1/web/packages/admin/
