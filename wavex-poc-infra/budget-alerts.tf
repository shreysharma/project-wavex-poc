# Budget configuration - COMMENTED OUT FOR NOW
# resource "google_billing_budget" "budget" {
#   count = var.enable_budget_alerts && var.billing_account_id != "" ? 1 : 0
#   
#   billing_account = var.billing_account_id
#   display_name    = "${local.service_name}-budget"
#   
#   budget_filter {
#     projects = ["projects/${data.google_project.project.number}"]
#   }
#   
#   amount {
#     specified_amount {
#       currency_code = "USD"
#       units         = tostring(var.budget_amount)
#     }
#   }
#   
#   threshold_rules {
#     threshold_percent = 0.5
#   }
#   
#   threshold_rules {
#     threshold_percent = 0.9
#   }
#   
#   threshold_rules {
#     threshold_percent = 1.0
#   }
#   
#   all_updates_rule {
#     pubsub_topic = google_pubsub_topic.budget_alerts[0].id
#   }
#   
#   depends_on = [google_project_service.required_apis]
# }

# Get current project data
data "google_project" "project" {
  project_id = var.project_id
}

# Pub/Sub topic for budget alerts - COMMENTED OUT FOR NOW
# resource "google_pubsub_topic" "budget_alerts" {
#   count = var.enable_budget_alerts && var.billing_account_id != "" ? 1 : 0
#   
#   name   = "${local.service_name}-budget-alerts"
#   labels = local.labels
#   
#   depends_on = [google_project_service.required_apis]
# }

# Email notification channel - COMMENTED OUT FOR NOW
# resource "google_monitoring_notification_channel" "email" {
#   for_each = var.enable_budget_alerts && var.billing_account_id != "" ? toset(var.budget_alert_emails) : toset([])
#   
#   display_name = "Email to ${each.value}"
#   type         = "email"
#   
#   labels = {
#     email_address = each.value
#   }
# }