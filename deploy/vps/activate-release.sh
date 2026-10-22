#!/usr/bin/env bash
# Install this root-owned as /usr/local/sbin/publisle-deploy. Grant the dedicated
# deploy user sudo access to this entry point only, never to arbitrary scripts.
set -euo pipefail
[[ $EUID -eq 0 && ${1:-} =~ ^[a-f0-9]{40}$ && ${2:-} =~ ^sha256:[a-f0-9]{64}$ ]]
RELEASE_SHA=$1
IMAGE=$2
UPLOAD="/var/tmp/publisle-deploy-$RELEASE_SHA"
[[ -d "$UPLOAD/source/deploy/vps" && ! -L "$UPLOAD" ]]
# Snapshot without dereferencing links, then validate the private copy. The CI
# identity cannot race privileged activation by rewriting the upload directory.
install -d -o root -g root -m 0755 /var/lib/publisle-releases
STAGE=$(mktemp -d "/var/lib/publisle-releases/$RELEASE_SHA.XXXXXX")
cp -a --no-dereference "$UPLOAD/source" "$UPLOAD/image.tar.gz" "$STAGE/"
[[ -z $(find "$STAGE" -type l -print -quit) ]]
command -v java >/dev/null
command -v pdftotext >/dev/null
UID_PUBLISLE=$(id -u publisle)
RUNTIME=(--setenv=HOME=/var/lib/publisle-runtime --setenv="XDG_RUNTIME_DIR=/run/user/$UID_PUBLISLE" --setenv="DOCKER_HOST=unix:///run/user/$UID_PUBLISLE/docker.sock")
chown -R publisle:publisle "$STAGE"
chmod 750 "$STAGE"
function bounded() {
  systemd-run --unit="publisle-release-$RELEASE_SHA-$1" --wait --pipe --collect --uid=publisle --gid=publisle --working-directory="$STAGE/source" --slice=publisle-pdf.slice -p MemoryMax=320M -p MemorySwapMax=0 "${RUNTIME[@]}" --setenv="JAVA_TOOL_OPTIONS=-Xmx128m -XX:ActiveProcessorCount=1" "${@:2}"
}
bounded load /usr/bin/docker load -i "$STAGE/image.tar.gz"
# Validators live in the isolated staging tree, not the production API install.
bounded dependencies /usr/bin/env -C "$STAGE/source/deploy/vps/qa" /usr/bin/npm ci --ignore-scripts --no-audit --no-fund
ln -s deploy/vps/qa/node_modules "$STAGE/source/node_modules"
bounded validator /usr/bin/node tools/install-verapdf.mjs "$STAGE/verapdf"
bounded verify /usr/bin/node deploy/vps/verify-release.mjs "$IMAGE" "$STAGE"
BACKUP=$(mktemp -d "/opt/publisle-api/rollback-$RELEASE_SHA.XXXXXX")
cp -a /etc/publisle-api.env "$BACKUP/env"
if [[ -e /etc/publisle-native-pdf-verified.json ]]; then cp -a /etc/publisle-native-pdf-verified.json "$BACKUP/verification.json"; fi
FILES=(server.mjs images.mjs limits.mjs queue.mjs reap.mjs worker.mjs)
for file in "${FILES[@]}"; do [[ ! -e /opt/publisle-api/$file ]] || cp -a "/opt/publisle-api/$file" "$BACKUP/$file"; done
function rollback() {
  cp -a "$BACKUP/env" /etc/publisle-api.env
  if [[ -e "$BACKUP/verification.json" ]]; then cp -a "$BACKUP/verification.json" /etc/publisle-native-pdf-verified.json; else rm -f /etc/publisle-native-pdf-verified.json; fi
  for file in "${FILES[@]}"; do if [[ -e "$BACKUP/$file" ]]; then cp -a "$BACKUP/$file" "/opt/publisle-api/$file"; else rm -f "/opt/publisle-api/$file"; fi; done
  systemctl restart publisle-api
  echo 'Deployment failed; previous API, image configuration and verification restored.' >&2
}
trap rollback ERR
for file in "${FILES[@]}"; do install -o root -g root -m 0644 "$STAGE/source/deploy/vps/$file" "/opt/publisle-api/$file"; done
install -o root -g root -m 0644 "$STAGE/verification.json" /etc/publisle-native-pdf-verified.json
/usr/bin/node --input-type=module - "$IMAGE" <<'JS'
import {readFileSync,writeFileSync,renameSync} from 'node:fs';
const path='/etc/publisle-api.env';let text=readFileSync(path,'utf8');
for(const [key,value]of Object.entries({PDF_NATIVE_WORKER_IMAGE:process.argv[2],PDF_NATIVE_TEMPLATES:'article,article-arabic,ieee-journal,acm-journal,springer-journal,elsevier-numeric,elsevier-author-date',PDF_NATIVE_VERIFICATION_FILE:'/etc/publisle-native-pdf-verified.json'})){
 const line=new RegExp('^'+key+'=.*$','m');text=line.test(text)?text.replace(line,key+'='+value):text+'\n'+key+'='+value+'\n';
}writeFileSync(path+'.new',text,{mode:0o640});renameSync(path+'.new',path);
JS
systemctl restart publisle-api
for attempt in {1..20}; do
  if /usr/bin/node --input-type=module <<'JS'
const base='https://api.publisle.xyz';const health=await(await fetch(base+'/health')).json();if(!health.services?.pdf)process.exit(1);
const capabilities=await(await fetch(base+'/pdf/capabilities')).json();const rows=capabilities.templates??capabilities.pdf?.templates??[];
if(rows.length!==7||rows.some(row=>row.engines[0]==='rust'||!row.engines.includes('rust')))process.exit(1);
JS
  then trap - ERR; echo "Deployed $RELEASE_SHA ($IMAGE), health and legacy defaults verified."; exit 0; fi
  sleep 2
done
false
