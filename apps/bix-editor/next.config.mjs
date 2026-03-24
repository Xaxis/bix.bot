/** @type {import('next').NextConfig} */
const nextConfig = {
    transpilePackages: ["@bix/engine", "@bix/editor", "@bix/schemas"],
    webpack(config) {
        // Workspace packages use .js extensions in imports (Node ESM convention).
        // Webpack doesn't remap .js → .ts automatically, so teach it to try both.
        config.resolve.extensionAlias = {
            ".js": [".ts", ".tsx", ".js", ".jsx"],
            ".mjs": [".mts", ".mjs"],
        }
        return config
    },
}

export default nextConfig
