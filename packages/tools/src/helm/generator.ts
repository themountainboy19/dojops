import { LLMProvider } from "@oda/core";
import * as yaml from "js-yaml";
import { HelmChartResponse, HelmChartResponseSchema, HelmInput } from "./schemas";

export async function generateHelmValues(
  input: HelmInput,
  llm: LLMProvider,
): Promise<HelmChartResponse> {
  const response = await llm.generate({
    system: `You are a Helm chart expert. Generate Helm chart values as structured JSON.
Include image config, service config, resource limits, and environment variables.
Respond with valid JSON only.`,
    prompt: `Generate Helm values for:
Chart: ${input.chartName}
Image: ${input.image}
Port: ${input.port}
Description: ${input.description}`,
    schema: HelmChartResponseSchema,
  });

  return response.parsed as HelmChartResponse;
}

export function generateChartYaml(input: HelmInput): string {
  const chart = {
    apiVersion: "v2",
    name: input.chartName,
    description: input.description,
    type: "application",
    version: "0.1.0",
    appVersion: input.appVersion,
  };
  return yaml.dump(chart, { lineWidth: 120, noRefs: true });
}

export function valuesToYaml(values: HelmChartResponse["values"]): string {
  return yaml.dump(values, { lineWidth: 120, noRefs: true });
}

export function generateDeploymentTemplate(chartName: string): string {
  return `apiVersion: apps/v1
kind: Deployment
metadata:
  name: {{ include "${chartName}.fullname" . }}
  labels:
    {{- include "${chartName}.labels" . | nindent 4 }}
spec:
  replicas: {{ .Values.replicaCount }}
  selector:
    matchLabels:
      {{- include "${chartName}.selectorLabels" . | nindent 6 }}
  template:
    metadata:
      labels:
        {{- include "${chartName}.selectorLabels" . | nindent 8 }}
    spec:
      containers:
        - name: {{ .Chart.Name }}
          image: "{{ .Values.image.repository }}:{{ .Values.image.tag }}"
          imagePullPolicy: {{ .Values.image.pullPolicy }}
          ports:
            - containerPort: {{ .Values.service.port }}
              protocol: TCP
          {{- with .Values.resources }}
          resources:
            {{- toYaml . | nindent 12 }}
          {{- end }}
`;
}

export function generateServiceTemplate(chartName: string): string {
  return `apiVersion: v1
kind: Service
metadata:
  name: {{ include "${chartName}.fullname" . }}
  labels:
    {{- include "${chartName}.labels" . | nindent 4 }}
spec:
  type: {{ .Values.service.type }}
  ports:
    - port: {{ .Values.service.port }}
      targetPort: {{ .Values.service.port }}
      protocol: TCP
  selector:
    {{- include "${chartName}.selectorLabels" . | nindent 4 }}
`;
}

export function generateHelpersTemplate(chartName: string): string {
  return `{{- define "${chartName}.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" }}
{{- end }}

{{- define "${chartName}.fullname" -}}
{{- if .Values.fullnameOverride }}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- $name := default .Chart.Name .Values.nameOverride }}
{{- printf "%s" $name | trunc 63 | trimSuffix "-" }}
{{- end }}
{{- end }}

{{- define "${chartName}.labels" -}}
helm.sh/chart: {{ .Chart.Name }}-{{ .Chart.Version }}
{{ include "${chartName}.selectorLabels" . }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end }}

{{- define "${chartName}.selectorLabels" -}}
app.kubernetes.io/name: {{ include "${chartName}.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}
`;
}
