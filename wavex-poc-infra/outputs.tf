output "service_url" {
  description = "URL of the Cloud Run service"
  value       = google_cloud_run_service.service.status[0].url
}

output "service_name" {
  description = "Name of the Cloud Run service"
  value       = google_cloud_run_service.service.name
}

output "service_account_email" {
  description = "Email of the Cloud Run service account"
  value       = google_service_account.cloud_run_sa.email
}

output "cloud_build_trigger_id" {
  description = "ID of the Cloud Build trigger"
  value       = var.enable_cloud_build ? google_cloudbuild_trigger.github_trigger[0].id : null
}

output "cloud_build_service_account" {
  description = "Email of the Cloud Build service account"
  value       = var.enable_cloud_build ? google_service_account.cloud_build_sa[0].email : null
}

output "artifact_registry_url" {
  description = "URL of the Artifact Registry repository"
  value       = var.enable_cloud_build ? "${var.region}-docker.pkg.dev/${var.project_id}/${google_artifact_registry_repository.docker_repo[0].name}" : null
}

# Budget output - COMMENTED OUT FOR NOW
# output "budget_pubsub_topic" {
#   description = "Name of the Pub/Sub topic for budget alerts"
#   value       = var.enable_budget_alerts && var.billing_account_id != "" ? google_pubsub_topic.budget_alerts[0].name : null
# }

output "logs_bucket_name" {
  description = "Name of the logs storage bucket"
  value       = google_storage_bucket.logs_bucket.name
}

output "frontend_service_url" {
  description = "URL of the frontend Cloud Run service"
  value       = google_cloud_run_service.frontend.status[0].url
}

output "frontend_service_name" {
  description = "Name of the frontend Cloud Run service"
  value       = google_cloud_run_service.frontend.name
}

output "frontend_cloud_build_trigger_id" {
  description = "ID of the frontend Cloud Build trigger"
  value       = var.enable_cloud_build ? google_cloudbuild_trigger.frontend_github_trigger[0].id : null
}