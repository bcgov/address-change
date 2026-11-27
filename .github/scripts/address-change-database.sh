#!/usr/bin/env bash
set -euo pipefail

: "${OC_SERVER:?Set the GitHub Environment variable OC_SERVER}"
: "${OC_TOKEN:?Set the GitHub Environment secret OC_TOKEN}"
: "${OC_NAMESPACE:?Set the GitHub Environment variable OC_NAMESPACE}"
oc login "$OC_SERVER" --token="$OC_TOKEN"
unset OC_TOKEN

case "$TARGET_ENV" in
  test|prod) ;;
  *) echo "Shared database operations support TEST/PROD. PR databases are disposable." >&2; exit 1 ;;
esac
license_plate=${OC_NAMESPACE%-*}
vault_engine=nonprod
if [[ "$TARGET_ENV" == prod ]]; then vault_engine=prod; fi
vault_base="$license_plate-$vault_engine/data/address-change-api-$TARGET_ENV"
vault_options=(--set vault.enabled=true
  --set-string "vault.role=$license_plate-$vault_engine"
  --set-string "vault.serviceAccountName=$license_plate-vault"
  --set-string "vault.databasePath=$vault_base/address-change-db"
  --set-string "vault.s3Path=${VAULT_S3_PATH:-$vault_base/address-change-s3}")

if [[ "$OPERATION" == provision-patroni || "$OPERATION" == configure-patroni ]]; then
  chart=helm/charts/patroni
  helm dependency build "$chart"
  if [[ "$OPERATION" == provision-patroni ]]; then
    helm install address-change-db "$chart" -n "$OC_NAMESPACE" \
      "${vault_options[@]}" --wait --timeout 15m
  else
    helm upgrade address-change-db "$chart" -n "$OC_NAMESPACE" \
      "${vault_options[@]}" --reset-then-reuse-values --wait --timeout 15m
  fi
  oc -n "$OC_NAMESPACE" get service address-change-db-patroni -o name
  exit
fi

if [[ "$OPERATION" == bootstrap ]]; then
  oc -n "$OC_NAMESPACE" get service address-change-db-patroni -o name
  chart=helm/charts/address-change-db-bootstrap
  helm dependency build "$chart"
  helm upgrade --install address-change-db-bootstrap "$chart" \
    -n "$OC_NAMESPACE" "${vault_options[@]}" --reset-then-reuse-values --wait --timeout 10m
  exit
fi

: "${S3_ENDPOINT:?Set the GitHub Environment variable S3_ENDPOINT}"
: "${S3_BUCKET:?Set the GitHub Environment variable S3_BUCKET}"
chart=helm/charts/address-change-db-backup
release=address-change-db-backup
options=("${vault_options[@]}" -n "$OC_NAMESPACE" -f "$chart/environments/$TARGET_ENV.yaml"
  --set backup-storage.enabled=false
  --set-string "s3.endpoint=$S3_ENDPOINT"
  --set-string "s3.bucket=$S3_BUCKET"
  --set-string "s3.prefix=${S3_PREFIX:-address_change_db_backups}"
  --set-string "s3.region=${S3_REGION:-us-east-1}")

helm repo add bcgov https://bcgov.github.io/helm-charts
helm dependency build "$chart"

case "$OPERATION" in
  deploy-backup)
    claims=$(oc -n "$OC_NAMESPACE" get pvc \
      "$release-backup-pvc" "$release-verification-pvc" --ignore-not-found -o name)
    if [[ -n "$claims" ]]; then
      echo "Preserve the existing archives and follow the PVC-to-S3 migration instructions before deploying." >&2
      exit 1
    fi
    helm upgrade --install "$release" "$chart" "${options[@]}" --reset-then-reuse-values --wait --timeout 15m
    # Refresh env-based credentials even when the chart did not change.
    oc -n "$OC_NAMESPACE" rollout restart deployment/"$release"-s3
    oc -n "$OC_NAMESPACE" rollout status deployment/"$release"-s3 --timeout=5m
    ;;
  recover)
    : "${RECOVERY_DATABASE:?Supply an unused recovery database name}"
    job=$(helm template "$release" "$chart" "${options[@]}" \
      --set recovery.enabled=true \
      --set-string "recovery.database=$RECOVERY_DATABASE" \
      --set-string "recovery.object=$RECOVERY_ARCHIVE" \
      --show-only templates/recovery-job.yaml |
      oc -n "$OC_NAMESPACE" create -f - -o name)
    echo "Created $job in $OC_NAMESPACE"
    deadline=$((SECONDS + 3900))
    while (( SECONDS < deadline )); do
      conditions=$(oc -n "$OC_NAMESPACE" get "$job" \
        -o 'jsonpath={range .status.conditions[?(@.status=="True")]}{.type}{" "}{end}')
      case " $conditions " in
        *" Complete "*) oc -n "$OC_NAMESPACE" logs "$job" -c restore; exit 0 ;;
        *" Failed "*)
          oc -n "$OC_NAMESPACE" logs "$job" -c restore ||
            oc -n "$OC_NAMESPACE" describe "$job"
          exit 1
          ;;
      esac
      sleep 10
    done
    oc -n "$OC_NAMESPACE" describe "$job"
    exit 1
    ;;
  *) echo "Unknown operation: $OPERATION" >&2; exit 2 ;;
esac
