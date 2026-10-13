#!/bin/sh

set -eu

# The full runner image includes Docker tooling needed by the validation jobs.
# linux/amd64 keeps local results consistent on Apple Silicon and GitHub runners.
runner_image="${ACT_RUNNER_IMAGE:-catthehacker/ubuntu:act-latest}"
architecture="${ACT_CONTAINER_ARCHITECTURE:-linux/amd64}"
# Docker builds in the workflow need the host daemon socket inside act's job
# container. Docker Desktop exposes this conventional socket to Linux
# containers even though macOS itself commonly uses ~/.docker/run instead.
# This is for trusted, local workflow simulation only.
daemon_socket="${ACT_CONTAINER_DAEMON_SOCKET:-unix:///var/run/docker.sock}"

run_workflow() {
  event="$1"
  workflow="$2"
  shift 2

  exec act "$event" \
    --workflows "$workflow" \
    --platform "ubuntu-latest=$runner_image" \
    --container-architecture "$architecture" \
    --container-daemon-socket "$daemon_socket" \
    "$@"
}

case "${1:-help}" in
  pr)
    run_workflow pull_request .github/workflows/pr.yml
    ;;
  merge-queue)
    run_workflow merge_group .github/workflows/merge-queue.yml
    ;;
  main)
    run_workflow push .github/workflows/post-merge.yml
    ;;
  release)
    run_workflow release .github/workflows/release.yml
    ;;
  mtls)
    # Run the reusable validation workflow directly, enabling its optional e2e job.
    run_workflow workflow_call .github/workflows/validate.yml --input run_mtls_e2e=true
    ;;
  help | --help | -h)
    cat <<'EOF'
Usage: devbox run act -- <workflow>

Workflows: pr, merge-queue, main, release, mtls

Convenience aliases are also available, for example:
  devbox run act:pr
  devbox run act:mtls

Set ACT_RUNNER_IMAGE, ACT_CONTAINER_ARCHITECTURE, or ACT_CONTAINER_DAEMON_SOCKET
to override local defaults.
EOF
    ;;
  *)
    echo "Unknown workflow: $1" >&2
    echo "Run 'devbox run act -- help' for usage." >&2
    exit 2
    ;;
esac
