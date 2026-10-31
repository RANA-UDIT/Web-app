resource "random_id" "suffix" {
  byte_length = 3
}

locals {
  suffix   = random_id.suffix.hex
  app_name = "travel-a3-${local.suffix}"
  tags     = var.tags
}

resource "azurerm_resource_group" "travel" {
  name     = "rg-travel-a3-${local.suffix}"
  location = var.location
  tags     = local.tags
}

resource "azurerm_log_analytics_workspace" "travel" {
  name                = "law-travel-a3-${local.suffix}"
  location            = azurerm_resource_group.travel.location
  resource_group_name = azurerm_resource_group.travel.name
  sku                 = "PerGB2018"
  retention_in_days   = 30
  tags                = local.tags
}

resource "azurerm_application_insights" "travel" {
  name                = "appi-travel-a3-${local.suffix}"
  location            = azurerm_resource_group.travel.location
  resource_group_name = azurerm_resource_group.travel.name
  application_type    = "web"
  workspace_id        = azurerm_log_analytics_workspace.travel.id
  tags                = local.tags
}

resource "azurerm_cosmosdb_account" "travel" {
  name                = "cosmos-travel-a3-${local.suffix}"
  location            = azurerm_resource_group.travel.location
  resource_group_name = azurerm_resource_group.travel.name
  offer_type          = "Standard"
  kind                = "GlobalDocumentDB"

  consistency_policy {
    consistency_level = "Session"
  }

  geo_location {
    location          = azurerm_resource_group.travel.location
    failover_priority = 0
  }

  capabilities {
    name = "EnableServerless"
  }

  tags = local.tags
}

resource "azurerm_cosmosdb_sql_database" "travel" {
  name                = "travelCatalogue"
  resource_group_name = azurerm_resource_group.travel.name
  account_name        = azurerm_cosmosdb_account.travel.name
}

resource "azurerm_cosmosdb_sql_container" "destinations" {
  name                = "destinations"
  resource_group_name = azurerm_resource_group.travel.name
  account_name        = azurerm_cosmosdb_account.travel.name
  database_name       = azurerm_cosmosdb_sql_database.travel.name
  partition_key_paths = ["/continent"]
}

resource "azurerm_storage_account" "travel" {
  name                     = "travelimg${local.suffix}"
  resource_group_name      = azurerm_resource_group.travel.name
  location                 = azurerm_resource_group.travel.location
  account_tier             = "Standard"
  account_replication_type = "RAGRS"
  min_tls_version          = "TLS1_2"

  # The application creates a blob-public container for uploaded images.
  allow_nested_items_to_be_public = true

  tags = local.tags
}

resource "azurerm_storage_container" "images" {
  name                  = "destination-images"
  storage_account_id    = azurerm_storage_account.travel.id
  container_access_type = "blob"
}

resource "azurerm_service_plan" "travel" {
  name                = "plan-travel-a3-${local.suffix}"
  location            = azurerm_resource_group.travel.location
  resource_group_name = azurerm_resource_group.travel.name
  os_type             = "Linux"
  sku_name            = var.app_service_sku
  tags                = local.tags
}

resource "azurerm_linux_web_app" "travel" {
  name                = local.app_name
  location            = azurerm_resource_group.travel.location
  resource_group_name = azurerm_resource_group.travel.name
  service_plan_id     = azurerm_service_plan.travel.id
  https_only          = true

  site_config {
    minimum_tls_version = "1.2"

    application_stack {
      node_version = "24-lts"
    }
  }

  app_settings = {
    APPLICATIONINSIGHTS_CONNECTION_STRING = azurerm_application_insights.travel.connection_string
    AZURE_STORAGE_CONNECTION_STRING       = azurerm_storage_account.travel.primary_connection_string
    AZURE_STORAGE_CONTAINER               = azurerm_storage_container.images.name
    COSMOS_CONTAINER                      = azurerm_cosmosdb_sql_container.destinations.name
    COSMOS_DATABASE                       = azurerm_cosmosdb_sql_database.travel.name
    COSMOS_ENDPOINT                       = azurerm_cosmosdb_account.travel.endpoint
    COSMOS_KEY                            = azurerm_cosmosdb_account.travel.primary_key
    NODE_ENV                              = "production"
    WEBSITE_NODE_DEFAULT_VERSION          = "~24"
  }

  tags = local.tags
}
