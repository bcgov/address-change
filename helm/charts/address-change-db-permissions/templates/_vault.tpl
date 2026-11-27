{{/* Input: root chart context and a list of {path, fields: [{env, key}]}. */}}
{{- define "ac-db.vault.annotations" -}}
{{- $root := .root -}}
vault.hashicorp.com/agent-inject: "true"
vault.hashicorp.com/agent-inject-token: "false"
vault.hashicorp.com/agent-pre-populate-only: "true"
vault.hashicorp.com/agent-init-first: "true"
vault.hashicorp.com/namespace: {{ $root.Values.vault.namespace | quote }}
vault.hashicorp.com/auth-path: {{ $root.Values.vault.authPath | quote }}
vault.hashicorp.com/role: {{ required "vault.role is required" $root.Values.vault.role | quote }}
vault.hashicorp.com/agent-requests-cpu: "10m"
vault.hashicorp.com/agent-limits-cpu: "50m"
vault.hashicorp.com/agent-requests-mem: "25Mi"
vault.hashicorp.com/agent-limits-mem: "100Mi"
{{ range $i, $secret := .secrets }}
vault.hashicorp.com/agent-inject-secret-env-{{ $i }}.sh: {{ required "Vault secret path is required" $secret.path | quote }}
vault.hashicorp.com/error-on-missing-key-env-{{ $i }}.sh: "true"
vault.hashicorp.com/agent-inject-template-env-{{ $i }}.sh: |
  {{ printf "{{- with secret %q -}}" $secret.path }}
  {{- range $secret.fields }}
  {{ .env }}=$(printf '%s' '{{ printf "{{ index .Data.data %q | base64Encode }}" .key }}' | base64 -d; printf '.')
  {{ .env }}=${{ "{" }}{{ .env }}%.}
  export {{ .env }}
  test -n "${{ "{" }}{{ .env }}}" || exit 1
  {{- end }}
  {{ "{{- end }}" }}
{{- end }}
{{- end }}

{{- define "ac-db.vault.load" -}}
{{- range $i, $_ := .secrets }}
. /vault/secrets/env-{{ $i }}.sh
{{- end }}
{{- end }}

{{- define "ac-db.vault.tokenAnnotation" -}}
vault.hashicorp.com/agent-service-account-token-volume-name: vault-auth-token
{{- end }}

{{- define "ac-db.vault.tokenVolume" -}}
- name: vault-auth-token
  projected:
    sources:
      - serviceAccountToken:
          path: token
          expirationSeconds: 600
{{- end }}
