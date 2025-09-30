variable "project_id" {
  description = "The GCP project ID"
  type        = string
}

variable "region" {
  description = "The GCP region for resources"
  type        = string
  default     = "us-central1"
}

variable "environment" {
  description = "Environment name (dev, stg, prd)"
  type        = string
  default     = "dev"
}

variable "service_name" {
  description = "Name of the Cloud Run service"
  type        = string
  default     = "wavex"
}

variable "service_image" {
  description = "Docker image for the Cloud Run service"
  type        = string
}

variable "github_owner" {
  description = "GitHub repository owner"
  type        = string
}

variable "github_repo" {
  description = "GitHub repository name"
  type        = string
}

variable "github_branch" {
  description = "GitHub branch to trigger builds from"
  type        = string
  default     = "main"
}

variable "github_connection_name" {
  description = "Name of the Cloud Build GitHub connection (2nd gen)"
  type        = string
  default     = "github"
}

variable "budget_amount" {
  description = "Budget amount in USD"
  type        = number
  default     = 100
}

variable "budget_alert_emails" {
  description = "List of email addresses for budget alerts"
  type        = list(string)
  default     = []
}

variable "enable_cloud_build" {
  description = "Enable Cloud Build for CI/CD"
  type        = bool
  default     = true
}

variable "enable_budget_alerts" {
  description = "Enable budget alerts"
  type        = bool
  default     = true
}

variable "service_account_email" {
  description = "Service account email for Cloud Run service"
  type        = string
  default     = ""
}

variable "min_instances" {
  description = "Minimum number of Cloud Run instances"
  type        = number
  default     = 0
}

variable "max_instances" {
  description = "Maximum number of Cloud Run instances"
  type        = number
  default     = 10
}

variable "memory" {
  description = "Memory allocation for Cloud Run service"
  type        = string
  default     = "512Mi"
}

variable "cpu" {
  description = "CPU allocation for Cloud Run service"
  type        = string
  default     = "1"
}

variable "timeout" {
  description = "Request timeout in seconds"
  type        = number
  default     = 300
}

variable "port" {
  description = "Container port"
  type        = number
  default     = 8080
}

variable "env_vars" {
  description = "Environment variables for the Cloud Run service"
  type        = map(string)
  default     = {}
}

variable "billing_account_id" {
  description = "The billing account ID for budget alerts. If not provided, budget alerts will be disabled."
  type        = string
  default     = ""
}

variable "frontend_image" {
  description = "Docker image for the frontend Cloud Run service"
  type        = string
  default     = "gcr.io/cloudrun/hello"
}

variable "frontend_port" {
  description = "Frontend container port"
  type        = number
  default     = 8080
}

variable "frontend_env_vars" {
  description = "Environment variables for the frontend Cloud Run service"
  type        = map(string)
  default     = {}
}

variable "frontend_min_instances" {
  description = "Minimum number of frontend Cloud Run instances"
  type        = number
  default     = 0
}

variable "frontend_max_instances" {
  description = "Maximum number of frontend Cloud Run instances"
  type        = number
  default     = 10
}

variable "frontend_memory" {
  description = "Memory allocation for frontend Cloud Run service"
  type        = string
  default     = "512Mi"
}

variable "frontend_cpu" {
  description = "CPU allocation for frontend Cloud Run service"
  type        = string
  default     = "1"
}

variable "frontend_timeout" {
  description = "Frontend request timeout in seconds"
  type        = number
  default     = 300
}