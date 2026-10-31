variable "subscription_id" {
  description = "Azure subscription ID for the new Trek-Stop resource group."
  type        = string
}

variable "location" {
  description = "Azure region for the Trek-Stop resources."
  type        = string
  default     = "centralindia"
}

variable "app_service_sku" {
  description = "Linux App Service plan tier. B1 is billable for every hour the plan exists."
  type        = string
  default     = "B1"
}

variable "azure_maps_subscription_key" {
  description = "Primary key for the existing Azure Maps account used by Trek-Stop."
  type        = string
  sensitive   = true
}

variable "tags" {
  description = "Tags applied to the new Trek-Stop resources."
  type        = map(string)
  default = {
    application = "trek-stop"
    assignment  = "special-topics-database-systems"
    managed_by  = "terraform"
  }
}
