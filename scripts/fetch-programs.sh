#!/usr/bin/env bash
set -euo pipefail

RPC_URL="${RPC_URL:-https://api.mainnet-beta.solana.com}"
here="$(cd "$(dirname "$0")" && pwd)"
out="$here/../tests/fixtures/programs"

mkdir -p "$out"

dump() {
  echo "dumping $2 from $RPC_URL"
  solana program dump -u "$RPC_URL" "$1" "$out/$2"
}

dump cpamdpZCGKUy5JxQXB4dcpGPiikHawvSWAd6mEn1sGG cp_amm.so
dump LBUZKhRxPF3XUpBCjp4YzTKgLccjZhTSDM9YuVaPwxo dlmm.so
dump dbcij3LWUppWqq96dh6gJWwBifmcGfLSB5D4DuSMaqN dbc.so

echo "fixtures written to $out (gitignored; check the Meteora licence before redistributing)"
