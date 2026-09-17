# Hugging Face deployment

Production Space: `Ma-Ri-Ba-Ku/Inspector-ALTO`.

The application is deployed as a **Hugging Face Static Space**, but Hugging Face does **not** build the frontend. Static Space hosting is free, while the optional `app_build_command` path launches a Hugging Face Job and currently requires credits. To keep the production deployment free of Hugging Face build credits, GitHub Actions compiles the application first and uploads only the generated static files.

## Deployment flow

`main` is the source of truth. `.github/workflows/deploy-hf-space.yml`:

1. validates the Hugging Face README metadata;
2. installs the frontend dependencies on GitHub Actions;
3. runs the browser test suite;
4. builds the Vite static application on GitHub Actions;
5. verifies `dist/index.html` exists;
6. assembles a clean deployment tree containing the Hugging Face README, license, and the contents of `dist/` at repository root;
7. obtains a short-lived Hugging Face credential through GitHub Actions OIDC;
8. synchronizes the prebuilt files to `Ma-Ri-Ba-Ku/Inspector-ALTO`.

The deployed Space therefore contains roughly:

```text
README.md
LICENSE
index.html
assets/
  ...
```

It does **not** contain `frontend/node_modules`, the Python reference implementation, GitHub workflows, internal documentation, or frontend source code. GitHub remains the source repository; the Hugging Face repository is a deployment artifact.

The Space frontmatter is intentionally build-free:

```yaml
sdk: static
app_file: index.html
```

`app_build_command` must remain absent. `scripts/validate-space-metadata.mjs` enforces this in CI so a future change cannot accidentally re-enable the credit-gated Hugging Face build job.

The upload uses `--delete="*"`, so stale deployment files are removed whenever a new version is published.

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
