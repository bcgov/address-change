{{/* vim: set filetype=mustache: */}}

{{/*
Expand the name of the project.
*/}}
{{- define "patroni.project" -}}
{{- default .Chart.Name .Values.project | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{/*
Expand the name of the chart.
*/}}
{{- define "patroni.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Create a default fully qualified app name.
We truncate at 63 chars because some Kubernetes name fields are limited to this (by the DNS naming spec).
If release name contains chart name it will be used as a full name.
*/}}
{{- define "patroni.fullname" -}}
{{- if .Values.fullnameOverride }}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- $name := default .Chart.Name .Values.nameOverride }}
{{- if contains $name .Release.Name }}
{{- .Release.Name | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" }}
{{- end }}
{{- end }}
{{- end }}

{{/*
Create chart name and version as used by the chart label.
*/}}
{{- define "patroni.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Common labels
*/}}
{{- define "patroni.labels" -}}
helm.sh/chart: {{ include "patroni.chart" . }}
{{ include "patroni.selectorLabels" . }}
{{- if .Chart.AppVersion }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
{{- end }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
app.kubernetes.io/part-of: {{ include "patroni.project" . }}
{{- end }}

{{/*
Selector labels
*/}}
{{- define "patroni.selectorLabels" -}}
app.kubernetes.io/name: {{ include "patroni.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}

{{/*
Create the name of the service account to use
*/}}
{{- define "patroni.serviceAccountName" -}}
{{- if .Values.vault.enabled }}
{{- required "vault.serviceAccountName is required" .Values.vault.serviceAccountName }}
{{- else }}
{{- include "patroni.legacyServiceAccountName" . }}
{{- end }}
{{- end }}

{{/* Preserve the account used by existing pods during Vault migration. */}}
{{- define "patroni.legacyServiceAccountName" -}}
{{- if .Values.serviceAccount.create }}
{{- default (include "patroni.fullname" .) .Values.serviceAccount.name }}
{{- else }}
{{- default "default" .Values.serviceAccount.name }}
{{- end }}
{{- end }}
