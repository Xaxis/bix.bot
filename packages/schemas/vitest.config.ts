import { defineConfig } from "vitest/config"

export default defineConfig({
    test: {
        include: ["**/*.test.ts"],
    },
    resolve: {
        alias: {
            "@bix/engine": new URL("../engine/src/index.ts", import.meta.url).pathname,
        },
    },
})
