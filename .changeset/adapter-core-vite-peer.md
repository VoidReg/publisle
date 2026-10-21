---
"@publisle/adapter-core": patch
---

Move `vite` from dependencies to an optional peer dependency. Only the optional `./vite` plugin entry imports it, so a core install now skips the entire Vite toolchain; hosts using the plugin already have Vite in their build.
