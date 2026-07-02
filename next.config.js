/** @type {import('next').NextConfig} */
const isGithubActions = process.env.GITHUB_ACTIONS === 'true';

// When building inside GitHub Actions for GitHub Pages, the site is served
// from https://<org>.github.io/<repo>/ — so we need a basePath/assetPrefix
// matching the repo name. Set REPO_NAME as an env var in the deploy workflow.
let repo = process.env.REPO_NAME || '';
let basePath = isGithubActions && repo ? `/${repo}` : '';

const nextConfig = {
  output: 'export',
  images: {
    unoptimized: true, // required for static export
  },
  basePath: basePath || undefined,
  assetPrefix: basePath ? `${basePath}/` : undefined,
  trailingSlash: true,
  reactStrictMode: true,
};

module.exports = nextConfig;
