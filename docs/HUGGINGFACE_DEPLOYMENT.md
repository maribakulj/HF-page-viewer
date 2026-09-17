# Hugging Face deployment

Production Space: `Ma-Ri-Ba-Ku/Inspector-ALTO`.

The application is deployed as a **Hugging Face Static Space**. No Docker, Gradio compute runtime, or paid Hugging Face plan is required for the application itself.

## Deployment flow

`main` is the source of truth. `.github/workflows/deploy-hf-space.yml`:

1. installs the frontend dependencies;
2. runs the browser test suite;
3. builds the Vite static application;
4. verifies `dist/index.html` exists;
5. obtains a short-lived Hugging Face credential through GitHub Actions OIDC;
6. synchronizes the deployable source to `Ma-Ri-Ba-Ku/Inspector-ALTO`.

Only these paths are published to the Space repository:

- `README.md`;
- `LICENSE`;
- `frontend/**`.

The upload uses `--delete="*"`, so stale deployment files such as an old `Dockerfile` are removed from the Space. GitHub-only files, Python reference code, tests outside the frontend, and internal project documentation are not copied to Hugging Face.

Hugging Face then executes the Static Space build declared in the README frontmatter:

```yaml
sdk: static
app_build_command: cd frontend && npm install --no-audit --no-fund && npm run build
app_file: dist/index.html
```

## One-time Trusted Publisher configuration

The workflow intentionally does **not** store a long-lived `HF_TOKEN` in GitHub. Configure a repository Trusted Publisher in the Space settings with these exact claims:

- Provider: `GitHub Actions`
- repository: `maribakulj/HF-page-viewer`
- branch: `main`
- workflow: `deploy-hf-space.yml`

The workflow requests the resource:

```text
spaces/Ma-Ri-Ba-Ku/Inspector-ALTO
```

After that one-time setting is present, every push to `main` can publish with a short-lived repo-scoped token generated through OIDC.

## Manual deployment

The workflow also exposes `workflow_dispatch`, so the same validated deployment can be launched manually from GitHub Actions without creating a dummy commit.
