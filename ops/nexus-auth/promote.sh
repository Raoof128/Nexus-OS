#!/usr/bin/env bash
# Run from /opt/nexus/standalone-release. Freeze and promotion are separate so
# the operator can compare the verified destination against the final snapshot.
set -euo pipefail
legacy=nexus-api-supabase-rollback
cd /opt/nexus/standalone-release
health() { curl --fail --silent --max-time 3 -H 'Host: home-notes-app.uk' http://127.0.0.1:8000/healthz; }

case "${1:-}" in
freeze)
    [[ "$(docker inspect -f '{{.State.Running}}' nexus-api)" == true ]]
    ! docker inspect "$legacy" >/dev/null 2>&1
    docker stop --time 10 nexus-api >/dev/null
    if ! docker rename nexus-api "$legacy"; then
        docker start nexus-api >/dev/null
        exit 1
    fi
    ;;
promote)
    [[ "$(docker inspect -f '{{.State.Running}}' "$legacy")" == false ]]
    docker run -d --name nexus-api --network nexus-standalone \
        --label nexus.auth=standalone --publish 127.0.0.1:8000:8000 \
        --restart unless-stopped --memory 224m --env-file api.env \
        nexus-standalone-api:release >/dev/null
    for _ in {1..15}; do
        if health; then exit 0; fi
        sleep 1
    done
    exit 1
    ;;
rollback)
    if docker inspect nexus-api >/dev/null 2>&1; then
        [[ "$(docker inspect -f '{{index .Config.Labels "nexus.auth"}}' nexus-api)" == standalone ]]
        docker stop --time 10 nexus-api >/dev/null
        docker rename nexus-api "nexus-api-standalone-$(date +%s)"
    fi
    docker rename "$legacy" nexus-api
    docker start nexus-api >/dev/null
    for _ in {1..15}; do
        if health; then exit 0; fi
        sleep 1
    done
    exit 1
    ;;
*) printf '%s\n' 'Usage: promote.sh freeze|promote|rollback' >&2; exit 2 ;;
esac
