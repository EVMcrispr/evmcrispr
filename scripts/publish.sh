#!/usr/bin/env sh
set -eu

# Build everything
echo "Building package..."
yarn build

echo "Testing"
yarn test

# # Bump version
# npm version ${NEW_VERSION}

echo "Publishing package..."

# Publish
npm version ${NEW_VERSION}
npm publish --access public

echo "Creating tag..."

tag_version="v${NEW_VERSION}"
git tag -a $tag_version -m "Release version v${tag_version} :rocket:"

git push origin $tag_version