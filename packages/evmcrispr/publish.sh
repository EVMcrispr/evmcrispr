#!/usr/bin/env sh
set -eu

# Build everything
echo "Building package…"
yarn build

echo "Running tests…"
yarn test

echo "Bumping version and creating tag…"

tag_version="v${NEW_VERSION}"

npm version ${NEW_VERSION} -m "Release version ${tag_version} :rocket:"

echo "Pushing the main branch…"

git push origin main

echo "Pushing the ${tag_version} tag…"

git push origin ${tag_version}

echo "Publishing to npm…"

npm publish --access public

echo "Done."
