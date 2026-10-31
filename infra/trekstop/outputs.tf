output "application_url" {
  description = "HTTPS URL of the Trek-Stop application."
  value       = "https://${azurerm_linux_web_app.trekstop.default_hostname}"
}

output "app_name" {
  description = "Name of the new Trek-Stop App Service."
  value       = azurerm_linux_web_app.trekstop.name
}

output "resource_group_name" {
  description = "Resource group created exclusively for Trek-Stop."
  value       = azurerm_resource_group.trekstop.name
}
