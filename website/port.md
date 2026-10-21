# local and deployment guide

## requirements

- bun 1.2 or newer
- a current web browser

## installation

1. clone or copy the project to a local directory.
2. open a terminal in the project root.
3. install dependencies:

```bash
bun install
```

## environment setup

the current public site has no required environment variables.

when backend services are introduced, copy the provided example environment file to `.env.local` and fill in local values. do not commit private credentials.

## development

start the local development server:

```bash
bun run dev
```

open the local address shown in the terminal. changes under `src` update during development.

## quality checks

run linting before release:

```bash
bun run lint
```

## production build

create a production build:

```bash
bun run build
```

the deployment target must support tanstack start's server output and web standard request handling. configure the host to run the generated server entry rather than serving the source directory as static files.

## deployment

1. install dependencies with `bun install --frozen-lockfile`.
2. run `bun run build`.
3. deploy the generated output using the host's server application workflow.
4. configure environment variables in the host settings when backend services are added.
5. verify `/`, `/about`, `/features`, `/philosophy`, and `/roadmap` after deployment.