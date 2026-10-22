#!/usr/bin/env bash
set -euo pipefail
: "${PDF_DEPLOY_HOST:?Configure the production deployment host}"
: "${PDF_DEPLOY_USER:?Configure the restricted deployment user}"
: "${PDF_DEPLOY_KEY:?Configure the dedicated deployment SSH key}"
: "${PDF_DEPLOY_HOST_KEY:?Pin the production SSH host key}"
: "${GITHUB_SHA:?An immutable release source is required}"
[[ "$GITHUB_SHA" =~ ^[a-f0-9]{40}$ && "$PDF_DEPLOY_HOST" =~ ^[A-Za-z0-9.-]+$ && "$PDF_DEPLOY_USER" =~ ^[a-z_][a-z0-9_-]*$ ]]
STAGE=$(mktemp -d)
trap 'rm -rf "$STAGE"' EXIT
printf '%s\n' "$PDF_DEPLOY_KEY" > "$STAGE/key"
chmod 600 "$STAGE/key"
printf '%s\n' "$PDF_DEPLOY_HOST_KEY" > "$STAGE/known_hosts"
SSH_ARGS=(-i "$STAGE/key" -o BatchMode=yes -o StrictHostKeyChecking=yes -o "UserKnownHostsFile=$STAGE/known_hosts")
# A retry of an older release must not roll back a newer successful deployment.
CURRENT=$(ssh "${SSH_ARGS[@]}" "$PDF_DEPLOY_USER@$PDF_DEPLOY_HOST" 'if [ -f /etc/publisle-deployed-release ]; then cat /etc/publisle-deployed-release; fi')
if [[ -n "$CURRENT" && "$CURRENT" != "$GITHUB_SHA" ]]; then
  [[ "$CURRENT" =~ ^[a-f0-9]{40}$ ]]
  if git merge-base --is-ancestor "$GITHUB_SHA" "$CURRENT"; then
    echo "A newer source is already deployed; skipping this older deployment."
    exit 0
  fi
  git merge-base --is-ancestor "$CURRENT" "$GITHUB_SHA"
fi
pnpm --filter @publisle/pdf-service build
docker build -f deploy/vps/native-worker.Dockerfile -t publisle-pdf-release .
IMAGE=$(docker image inspect publisle-pdf-release --format '{{.Id}}')
[[ "$IMAGE" =~ ^sha256:[a-f0-9]{64}$ ]]
# The compiler in the deployment image must be the published Linux compiler.
CID=$(docker create publisle-pdf-release)
docker cp "$CID:/usr/local/bin/publisle-pdf" "$STAGE/compiler"
docker rm "$CID"
node --input-type=module - "$STAGE/compiler" <<'JS'
import {readFileSync} from 'node:fs';import{createHash}from'node:crypto';import{execFileSync}from'node:child_process';
const {version}=JSON.parse(readFileSync('packages/research/package.json'));
const cwd=process.env.RUNNER_TEMP;
const result=JSON.parse(execFileSync('npm',['pack',`@publisle/pdf-native-linux-x64@${version}`,'--ignore-scripts','--json'],{cwd,encoding:'utf8'}));
const manifest=JSON.parse(execFileSync('tar',['-xOf',`${cwd}/${result[0].filename}`,'package/artifact.json'],{encoding:'utf8'}));
if(createHash('sha256').update(readFileSync(process.argv[2])).digest('hex')!==manifest.files['bin/publisle-pdf'])throw Error('Deployment compiler differs from the published compiler');
JS
docker save publisle-pdf-release | gzip -1 > "$STAGE/image.tar.gz"
git archive --format=tar --prefix=source/ "$GITHUB_SHA" > "$STAGE/source.tar"
REMOTE="/var/tmp/publisle-deploy-$GITHUB_SHA"
ssh "${SSH_ARGS[@]}" "$PDF_DEPLOY_USER@$PDF_DEPLOY_HOST" "mkdir -p '$REMOTE'"
scp "${SSH_ARGS[@]}" "$STAGE/image.tar.gz" "$STAGE/source.tar" "$PDF_DEPLOY_USER@$PDF_DEPLOY_HOST:$REMOTE/"
ssh "${SSH_ARGS[@]}" "$PDF_DEPLOY_USER@$PDF_DEPLOY_HOST" "tar -xf '$REMOTE/source.tar' -C '$REMOTE' && sudo -n /usr/local/sbin/publisle-deploy '$GITHUB_SHA' '$IMAGE'"
