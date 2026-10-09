# secure-api-code-challenge

This is to demonstrate my engineering / coding skills paired with IAM exposure.

## Development

The project uses Devbox to provide Node.js 22 and pnpm. Enter the development shell,
then install dependencies:

```sh
devbox shell
pnpm install
```

Common commands are available through Devbox or pnpm:

```sh
devbox run dev       # run the API in watch mode
devbox run check     # type-check, lint, and verify formatting
devbox run format    # apply Prettier formatting
```

The baseline includes a TypeScript ESM health endpoint at `src/server.ts`, ESLint's
flat configuration, and Prettier. `pnpm build` emits the production output to `dist/`.
