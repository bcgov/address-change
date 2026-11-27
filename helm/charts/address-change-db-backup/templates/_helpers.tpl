{{- define "ac-backup.labels" -}}
app.kubernetes.io/name: address-change-db-backup-provisioner
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/part-of: address-change
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end -}}

{{- define "ac-backup.s3Env" -}}
- name: VAULT_ENABLED
  value: {{ .Values.vault.enabled | quote }}
- name: AWS_DEFAULT_REGION
  value: {{ .Values.s3.region | quote }}
- name: ARCHIVE_ENDPOINT
  value: {{ required "s3.endpoint is required in S3 mode" .Values.s3.endpoint | quote }}
- name: ARCHIVE_BUCKET
  value: {{ required "s3.bucket is required in S3 mode" .Values.s3.bucket | quote }}
- name: ARCHIVE_PREFIX
  value: {{ required "s3.prefix is required in S3 mode" .Values.s3.prefix | quote }}
{{- if not .Values.vault.enabled }}
{{- range list "AWS_ACCESS_KEY_ID" "AWS_SECRET_ACCESS_KEY" }}
- name: {{ . }}
  valueFrom:
    secretKeyRef:
      name: {{ required "s3.secretName is required" $.Values.s3.secretName | quote }}
      key: {{ . }}
{{- end }}
{{- end }}
- name: PGHOST
  value: {{ .Values.database.host | quote }}
- name: PGPORT
  value: {{ .Values.database.port | quote }}
- name: PGSSLMODE
  value: {{ .Values.database.sslMode | quote }}
{{- end }}

{{- define "ac-backup.s3ClientInit" -}}
- name: install-s3-client
  image: {{ .Values.s3.clientImage | quote }}
  securityContext:
    allowPrivilegeEscalation: false
    capabilities: {drop: [ALL]}
  command: [/bin/sh, -ec]
  args:
    - |
      cp -R /usr/local/aws-cli/v2/current/dist/. /s3-client/
      /s3-client/aws --version
  volumeMounts:
    - {name: s3-client, mountPath: /s3-client}
{{- end }}
