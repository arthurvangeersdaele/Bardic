# Bardic auth worker

The small helper behind **Connect with GitHub** in Bardic's settings (Android, iPhone, web player, Story builder).

- GitHub's sign-in addresses cannot be called from a web page, so the worker relays GitHub's *device sign-in*: the bard types a short code on github.com. No GitHub permission is asked; Bardic only learns the public username and id.
- It keeps the registry of bard names, [`docs/recueil/bards.json`](../docs/recueil/bards.json): one name per GitHub account, once and for all, unique whatever the case, accents or spacing.
- The Recueil check ([`build_recueil_index.py`](../.github/scripts/build_recueil_index.py)) reads that registry: a registered name only signs tales sent by its owner.

Without a GitHub connection, every story is signed **Forgotten Barde**.

## Routes

| Route | What it does |
| --- | --- |
| `POST /device/code` | Starts a GitHub device sign-in, returns the code to type on github.com. |
| `POST /device/token` | `{ device_code }`: has the bard typed the code yet? Returns the token, username and registered name once done. |
| `GET /bard` | With `Authorization: Bearer <token>`: username and registered name (null if none). |
| `POST /bard` | With the token, `{ name }`: registers the bard name for this account, once and for all. |

## Setting it up (once)

1. **GitHub OAuth App.** github.com, Settings, Developer settings, OAuth Apps, New OAuth App. Name `Bardic`, homepage `https://arthurvangeersdaele.github.io/Bardic/`, callback URL the same (unused). Tick **Enable Device Flow**. Copy the **Client ID** (no secret needed).
2. **Registry token.** Settings, Developer settings, Fine-grained tokens, Generate: repository access *only* `arthurvangeersdaele/Bardic`, permission **Contents: Read and write**. Copy it.
3. **Cloudflare.** Create a free account at cloudflare.com. Note the **Account ID** (Workers & Pages overview), then create an **API token** with the template *Edit Cloudflare Workers*.
4. **Repository settings** (Settings, Secrets and variables, Actions):
   - secrets `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `BARDIC_REGISTRY_TOKEN`;
   - variable `BARDIC_GITHUB_CLIENT_ID`.
5. Run the workflow **Bardic auth worker** (Actions tab, Run workflow). It tests and deploys the worker to `https://bardic-auth.<your-subdomain>.workers.dev`.
6. Put that address in [`docs/auth/config.json`](../docs/auth/config.json) (`"worker": "https://bardic-auth.….workers.dev"`). Every Bardic reads it: the Connect with GitHub button appears everywhere, no app update needed.

## Tests

```
node --test auth-worker/test/worker.test.js
```
