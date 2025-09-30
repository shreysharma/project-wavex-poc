# Cloud Build trigger for GitHub with inline configuration
resource "google_cloudbuild_trigger" "github_trigger" {
  count = var.enable_cloud_build ? 1 : 0
  
  name        = "${local.service_name}-build-trigger"
  location    = var.region
  description = "Build and deploy ${local.service_name} when code changes"

  # GitHub trigger configuration for 2nd gen connection
  repository_event_config {
    # For 2nd gen connections, the format is:
    # projects/PROJECT_ID/locations/REGION/connections/CONNECTION_NAME/repositories/OWNER-REPO
    repository = "projects/${var.project_id}/locations/${var.region}/connections/${var.github_connection_name}/repositories/${var.github_repo}"
    push {
      branch = "^${var.github_branch}$"
    }
  }

  # Include files - trigger on any change in the repository
  included_files = ["**"]
  
  # Use the Cloud Build service account
  service_account = google_service_account.cloud_build_sa[0].id
  
  # Inline build configuration
  build {
    # Step 1: Build Docker image
    step {
      name = "gcr.io/cloud-builders/docker"
      args = [
        "build",
        "-t", "${var.region}-docker.pkg.dev/${var.project_id}/${google_artifact_registry_repository.docker_repo[0].name}/${var.service_name}:$COMMIT_SHA",
        "-t", "${var.region}-docker.pkg.dev/${var.project_id}/${google_artifact_registry_repository.docker_repo[0].name}/${var.service_name}:latest",
        "."
      ]
    }
    
    # Step 2: Push image to Artifact Registry
    step {
      name = "gcr.io/cloud-builders/docker"
      args = [
        "push",
        "--all-tags",
        "${var.region}-docker.pkg.dev/${var.project_id}/${google_artifact_registry_repository.docker_repo[0].name}/${var.service_name}"
      ]
    }
    
    # Step 3: Deploy to Cloud Run
    step {
      name = "gcr.io/cloud-builders/gcloud"
      args = [
        "run", "deploy",
        local.service_name,
        "--image", "${var.region}-docker.pkg.dev/${var.project_id}/${google_artifact_registry_repository.docker_repo[0].name}/${var.service_name}:$COMMIT_SHA",
        "--region", var.region,
        "--platform", "managed",
        "--allow-unauthenticated",
        "--service-account", google_service_account.cloud_run_sa.email,
        "--update-labels", "commit-sha=$SHORT_SHA,triggered-by=cloud-build"
      ]
    }
    
    # Build options
    options {
      machine_type = "E2_HIGHCPU_8"
      logging      = "CLOUD_LOGGING_ONLY"
    }
    
    # Build timeout
    timeout = "1200s"
  }
  
  depends_on = [
    google_project_service.required_apis,
    google_project_iam_member.cloud_build_roles,
    google_artifact_registry_repository.docker_repo
  ]
}

# Grant Cloud Build service account access to deploy Cloud Run service
resource "google_cloud_run_service_iam_member" "cloud_build_deployer" {
  count    = var.enable_cloud_build ? 1 : 0
  service  = google_cloud_run_service.service.name
  location = google_cloud_run_service.service.location
  role     = "roles/run.developer"
  member   = "serviceAccount:${google_service_account.cloud_build_sa[0].email}"
}

# Frontend Cloud Build trigger for GitHub with inline configuration
resource "google_cloudbuild_trigger" "frontend_github_trigger" {
  count = var.enable_cloud_build ? 1 : 0

  name        = "${local.service_name}-frontend-build-trigger"
  location    = var.region
  description = "Build and deploy ${local.service_name}-frontend when code changes"

  # GitHub trigger configuration for 2nd gen connection
  repository_event_config {
    # For 2nd gen connections, the format is:
    # projects/PROJECT_ID/locations/REGION/connections/CONNECTION_NAME/repositories/OWNER-REPO
    repository = "projects/${var.project_id}/locations/${var.region}/connections/${var.github_connection_name}/repositories/${var.github_repo}"
    push {
      branch = "^${var.github_branch}$"
    }
  }

  # Include files - trigger on any change in the wavex directory
  included_files = ["wavex/**"]

  # Use the Cloud Build service account
  service_account = google_service_account.cloud_build_sa[0].id

  # Inline build configuration
  build {
    # Step 1: Build Docker image from wavex/Dockerfile
    step {
      name = "gcr.io/cloud-builders/docker"
      args = [
        "build",
        "-t", "${var.region}-docker.pkg.dev/${var.project_id}/${google_artifact_registry_repository.docker_repo[0].name}/${var.service_name}-frontend:$COMMIT_SHA",
        "-t", "${var.region}-docker.pkg.dev/${var.project_id}/${google_artifact_registry_repository.docker_repo[0].name}/${var.service_name}-frontend:latest",
        "-f", "wavex/Dockerfile",
        "wavex"
      ]
    }

    # Step 2: Push image to Artifact Registry
    step {
      name = "gcr.io/cloud-builders/docker"
      args = [
        "push",
        "--all-tags",
        "${var.region}-docker.pkg.dev/${var.project_id}/${google_artifact_registry_repository.docker_repo[0].name}/${var.service_name}-frontend"
      ]
    }

    # Step 3: Deploy to Cloud Run
    step {
      name = "gcr.io/cloud-builders/gcloud"
      args = [
        "run", "deploy",
        "${local.service_name}-frontend",
        "--image", "${var.region}-docker.pkg.dev/${var.project_id}/${google_artifact_registry_repository.docker_repo[0].name}/${var.service_name}-frontend:$COMMIT_SHA",
        "--region", var.region,
        "--platform", "managed",
        "--allow-unauthenticated",
        "--service-account", google_service_account.cloud_run_sa.email,
        "--update-labels", "commit-sha=$SHORT_SHA,triggered-by=cloud-build"
      ]
    }

    # Build options
    options {
      machine_type = "E2_HIGHCPU_8"
      logging      = "CLOUD_LOGGING_ONLY"
    }

    # Build timeout
    timeout = "1200s"
  }

  depends_on = [
    google_project_service.required_apis,
    google_project_iam_member.cloud_build_roles,
    google_artifact_registry_repository.docker_repo
  ]
}

# Grant Cloud Build service account access to deploy frontend Cloud Run service
resource "google_cloud_run_service_iam_member" "cloud_build_frontend_deployer" {
  count    = var.enable_cloud_build ? 1 : 0
  service  = google_cloud_run_service.frontend.name
  location = google_cloud_run_service.frontend.location
  role     = "roles/run.developer"
  member   = "serviceAccount:${google_service_account.cloud_build_sa[0].email}"
}