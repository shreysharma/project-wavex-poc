provider "google" {
  project = var.project_id
  region  = var.region
}

provider "google-beta" {
  project = var.project_id
  region  = var.region
}

locals {
  service_name = "${var.service_name}-${var.environment}"
  labels = {
    environment = var.environment
    managed_by  = "terraform"
    service     = var.service_name
  }
}

# Enable required APIs
resource "google_project_service" "required_apis" {
  for_each = toset([
    "run.googleapis.com",
    "cloudbuild.googleapis.com",
    "artifactregistry.googleapis.com",
    "logging.googleapis.com",
    "storage.googleapis.com",
    "pubsub.googleapis.com",
    "speech.googleapis.com",
    "translate.googleapis.com",
    "aiplatform.googleapis.com",
  ])
  
  service            = each.value
  disable_on_destroy = false
}

# Service Account for Cloud Run
resource "google_service_account" "cloud_run_sa" {
  account_id   = "${local.service_name}-sa"
  display_name = "Service Account for ${local.service_name}"
  description  = "Service account for Cloud Run service ${local.service_name}"
}

# Create service account key for the Cloud Run service account
resource "google_service_account_key" "cloud_run_sa_key" {
  service_account_id = google_service_account.cloud_run_sa.name
}

# Cloud Run Service
resource "google_cloud_run_service" "service" {
  name     = local.service_name
  location = var.region

  template {
    spec {
      service_account_name = google_service_account.cloud_run_sa.email
      
      containers {
        image = var.service_image
        
        ports {
          container_port = var.port
        }
        
        resources {
          limits = {
            cpu    = var.cpu
            memory = var.memory
          }
        }
        
        dynamic "env" {
          for_each = var.env_vars
          content {
            name  = env.key
            value = env.value
          }
        }
        
        env {
          name  = "GOOGLE_CLOUD_BUCKET_NAME"
          value = google_storage_bucket.logs_bucket.name
        }
        
        env {
          name  = "GOOGLE_SERVICE_ACCOUNT_JSON"
          value = base64decode(google_service_account_key.cloud_run_sa_key.private_key)
        }
      }
      
      timeout_seconds = var.timeout
    }
    
    metadata {
      annotations = {
        "autoscaling.knative.dev/minScale" = var.min_instances
        "autoscaling.knative.dev/maxScale" = var.max_instances
        "run.googleapis.com/cpu-throttling" = "false"
      }
      labels = local.labels
    }
  }
  
  traffic {
    percent         = 100
    latest_revision = true
  }
  
  metadata {
    labels = local.labels
  }
  
  depends_on = [google_project_service.required_apis]
}

# IAM policy to make the service publicly accessible
resource "google_cloud_run_service_iam_binding" "public_access" {
  service  = google_cloud_run_service.service.name
  location = google_cloud_run_service.service.location
  role     = "roles/run.invoker"
  members  = ["allUsers"]
}

# Artifact Registry for storing Docker images
resource "google_artifact_registry_repository" "docker_repo" {
  count = var.enable_cloud_build ? 1 : 0
  
  location      = var.region
  repository_id = "${var.service_name}-${var.environment}"
  description   = "Docker repository for ${var.service_name}"
  format        = "DOCKER"
  labels        = local.labels
  
  depends_on = [google_project_service.required_apis]
}

# Service Account for Cloud Build
resource "google_service_account" "cloud_build_sa" {
  count = var.enable_cloud_build ? 1 : 0
  
  account_id   = "${local.service_name}-build-sa"
  display_name = "Cloud Build Service Account for ${local.service_name}"
  description  = "Service account used by Cloud Build to deploy ${local.service_name}"
}

# IAM roles for Cloud Build service account
resource "google_project_iam_member" "cloud_build_roles" {
  for_each = var.enable_cloud_build ? toset([
    "roles/run.admin",
    "roles/artifactregistry.writer",
    "roles/logging.logWriter",
    "roles/iam.serviceAccountUser",
  ]) : toset([])
  
  project = var.project_id
  role    = each.value
  member  = "serviceAccount:${google_service_account.cloud_build_sa[0].email}"
}

# Allow Cloud Build to impersonate the Cloud Run service account
resource "google_service_account_iam_binding" "cloud_build_impersonate" {
  count = var.enable_cloud_build ? 1 : 0
  
  service_account_id = google_service_account.cloud_run_sa.id
  role               = "roles/iam.serviceAccountUser"
  members = [
    "serviceAccount:${google_service_account.cloud_build_sa[0].email}"
  ]
}

# Storage bucket for logs
resource "google_storage_bucket" "logs_bucket" {
  name          = "${var.service_name}-${var.environment}-${var.region}-logs-bucket"
  location      = var.region
  force_destroy = true

  # 30-day retention
  lifecycle_rule {
    condition {
      age = 30
    }
    action {
      type = "Delete"
    }
  }

  uniform_bucket_level_access = true
  labels = local.labels
  
  depends_on = [google_project_service.required_apis]
}

# Log sink to capture Cloud Run logs
resource "google_logging_project_sink" "cloud_run_logs" {
  name        = "${local.service_name}-logs-sink"
  destination = "storage.googleapis.com/${google_storage_bucket.logs_bucket.name}"

  filter = "(resource.type=\"cloud_run_revision\" AND (resource.labels.service_name=\"${google_cloud_run_service.service.name}\" OR resource.labels.service_name=\"${google_cloud_run_service.frontend.name}\")) OR (resource.type=\"cloud_build\" AND (resource.labels.trigger_name=\"${local.service_name}-build-trigger\" OR resource.labels.trigger_name=\"${local.service_name}-frontend-build-trigger\"))"

  unique_writer_identity = true

  depends_on = [google_storage_bucket.logs_bucket]
}

# Grant log sink permission to write to bucket
resource "google_storage_bucket_iam_member" "logs_sink_writer" {
  bucket = google_storage_bucket.logs_bucket.name
  role   = "roles/storage.objectCreator"
  member = google_logging_project_sink.cloud_run_logs.writer_identity
}

# Grant Cloud Run service account necessary IAM roles
resource "google_project_iam_member" "cloud_run_iam_roles" {
  for_each = toset([
    "roles/storage.admin",
    "roles/aiplatform.user",
    "roles/ml.developer",
    "roles/cloudtranslate.user"
  ])

  project = var.project_id
  role    = each.value
  member  = "serviceAccount:${google_service_account.cloud_run_sa.email}"
}

# Frontend Cloud Run Service
resource "google_cloud_run_service" "frontend" {
  name     = "${local.service_name}-frontend"
  location = var.region

  template {
    spec {
      service_account_name = google_service_account.cloud_run_sa.email

      containers {
        image = var.frontend_image

        ports {
          container_port = var.frontend_port
        }

        resources {
          limits = {
            cpu    = var.frontend_cpu
            memory = var.frontend_memory
          }
        }

        dynamic "env" {
          for_each = var.frontend_env_vars
          content {
            name  = env.key
            value = env.value
          }
        }

        env {
          name  = "GOOGLE_CLOUD_BUCKET_NAME"
          value = google_storage_bucket.logs_bucket.name
        }

        env {
          name  = "GOOGLE_SERVICE_ACCOUNT_JSON"
          value = base64decode(google_service_account_key.cloud_run_sa_key.private_key)
        }

        env {
          name  = "NEXT_PUBLIC_API_BASE_URL"
          value = google_cloud_run_service.service.status[0].url
        }
      }

      timeout_seconds = var.frontend_timeout
    }

    metadata {
      annotations = {
        "autoscaling.knative.dev/minScale" = var.frontend_min_instances
        "autoscaling.knative.dev/maxScale" = var.frontend_max_instances
        "run.googleapis.com/cpu-throttling" = "false"
      }
      labels = local.labels
    }
  }

  traffic {
    percent         = 100
    latest_revision = true
  }

  metadata {
    labels = local.labels
  }

  depends_on = [google_project_service.required_apis]
}

# IAM policy to make the frontend service publicly accessible
resource "google_cloud_run_service_iam_binding" "frontend_public_access" {
  service  = google_cloud_run_service.frontend.name
  location = google_cloud_run_service.frontend.location
  role     = "roles/run.invoker"
  members  = ["allUsers"]
}