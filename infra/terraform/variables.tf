variable "subscription_id" {
  description = "Azure subscription ID to deploy into."
  type        = string
}

variable "location" {
  description = "Azure region for the Assignment 3 resources."
  type        = string
  default     = "centralindia"
}

variable "app_service_sku" {
  description = "App Service plan SKU. B1 supports a small, short-duration load test but is billable while running."
  type        = string
  default     = "B1"
}

variable "tags" {
  description = "Tags applied to the resources created by this stack."
  type        = map(string)
  default = {
    assignment = "cloud-computing-assignment-3"
    managed_by = "terraform"
  }
}
