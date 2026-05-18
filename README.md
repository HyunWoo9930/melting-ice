# 이 얼음이 녹기 전에

시간을 정하면 얼음이 천천히 녹는 가벼운 공부 타이머입니다.

## Local Preview

```bash
npm install
npm run dev
```

Then open the local URL printed by Vite.

## Checks

```bash
npm test
npm run build
```

## Deploy

Pushes to `main` run GitHub Actions, build the Vite app, and deploy the static `dist` bundle to the server with `rsync`.

Required repository secrets:

- `RUMICLEAN_SSH_HOST`
- `RUMICLEAN_SSH_USER`
- `RUMICLEAN_SSH_KEY`
- `RUMICLEAN_SSH_PORT`

The workflow deploys only the generated runtime bundle and the static assets copied by Vite.
