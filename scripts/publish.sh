#!/usr/bin/env sh
set -eu

# Build everything
echo "Building package..."
yarn build

# # Bump version
# npm version ${NEW_VERSION}

echo "Publishing package..."

# Publish
npm publish --access public

echo "Creating tag..."

tag_version="v${NEW_VERSION}"
git tag -a $tag_version -m "Publish version v${tag_version}"

git push origin $tag_version