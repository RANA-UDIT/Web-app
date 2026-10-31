output "application_url" {
  description = "HTTPS URL of the Terraform-managed travel catalogue."
  value       = "https://${azurerm_linux_web_app.travel.default_hostname}"
}

output "app_name" {
  description = "App Service name; set this as the GitHub Actions AZURE_WEBAPP_NAME repository variable."
  value       = azurerm_linux_web_app.travel.name
}

output "resource_group_name" {
  description = "Resource group created exclusively for Assignment 3."
  value       = azurerm_resource_group.travel.name
}
