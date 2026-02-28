#!/usr/bin/env bash
set -euo pipefail

if [ -f ".env" ]; then
    set -a
    # shellcheck disable=SC1091
    . ".env"
    set +a
fi

if [ -n "${AWS_REGION:-}" ] && [ -z "${CDK_DEFAULT_REGION:-}" ]; then
    export CDK_DEFAULT_REGION="${AWS_REGION}"
fi

if [ -n "${AWS_ACCOUNT_ID:-}" ] && [ -z "${CDK_DEFAULT_ACCOUNT:-}" ]; then
    export CDK_DEFAULT_ACCOUNT="${AWS_ACCOUNT_ID}"
fi

if [ "${1:-}" = "cdk" ] && [ -n "${AWS_PROFILE:-}" ]; then
    shift
    exec cdk --profile "${AWS_PROFILE}" "$@"
fi

exec "$@"
