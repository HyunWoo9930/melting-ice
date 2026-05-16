# 이 얼음이 다 녹기전에

시간을 정하면 얼음이 천천히 녹는 가벼운 공부 타이머입니다.

## Local Preview

```bash
python3 -m http.server 4173
```

Then open `http://127.0.0.1:4173`.

## Deploy

Pushes to `main` run GitHub Actions and deploy the static runtime files to the server with `rsync`.

Required repository secrets:

- `RUMICLEAN_SSH_HOST`
- `RUMICLEAN_SSH_USER`
- `RUMICLEAN_SSH_KEY`
- `RUMICLEAN_SSH_PORT`

The workflow deploys only the runtime files: `index.html`, `styles.css`, `script.js`, `manifest.json`, `service-worker.js`, `assets/frames`, and `assets/icons`.
