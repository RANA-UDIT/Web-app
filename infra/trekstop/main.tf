resource "random_id" "suffix" {
  byte_length = 3
}

locals {
  suffix = random_id.suffix.hex
  tags   = var.tags
}

resource "azurerm_resource_group" "trekstop" {
  name     = "rg-trekstop-${local.suffix}"
  location = var.location
  tags     = local.tags
}

resource "azurerm_log_analytics_workspace" "trekstop" {
  name                = "law-trekstop-${local.suffix}"
  location            = azurerm_resource_group.trekstop.location
  resource_group_name = azurerm_resource_group.trekstop.name
  sku                 = "PerGB2018"
  retention_in_days   = 30
  tags                = local.tags
}

resource "azurerm_application_insights" "trekstop" {
  name                = "appi-trekstop-${local.suffix}"
  location            = azurerm_resource_group.trekstop.location
  resource_group_name = azurerm_resource_group.trekstop.name
  application_type    = "web"
  workspace_id        = azurerm_log_analytics_workspace.trekstop.id
  tags                = local.tags
}

resource "azurerm_cosmosdb_account" "trekstop" {
  name                = "cosmos-trekstop-${local.suffix}"
  location            = azurerm_resource_group.trekstop.location
  resource_group_name = azurerm_resource_group.trekstop.name
  offer_type          = "Standard"
  kind                = "GlobalDocumentDB"

  consistency_policy {
    consistency_level = "Session"
  }

  geo_location {
    location          = azurerm_resource_group.trekstop.location
    failover_priority = 0
  }

  capabilities {
    name = "EnableServerless"
  }

  tags = local.tags
}

resource "azurerm_cosmosdb_sql_database" "trekstop" {
  name                = "trekStop"
  resource_group_name = azurerm_resource_group.trekstop.name
  account_name        = azurerm_cosmosdb_account.trekstop.name
}

resource "azurerm_cosmosdb_sql_container" "trails" {
  name                = "trails"
  resource_group_name = azurerm_resource_group.trekstop.name
  account_name        = azurerm_cosmosdb_account.trekstop.name
  database_name       = azurerm_cosmosdb_sql_database.trekstop.name
  partition_key_paths = ["/region"]
}

resource "azurerm_service_plan" "trekstop" {
  name                = "plan-trekstop-${local.suffix}"
  location            = azurerm_resource_group.trekstop.location
  resource_group_name = azurerm_resource_group.trekstop.name
  os_type             = "Linux"
  sku_name            = var.app_service_sku
  tags                = local.tags
}

resource "azurerm_linux_web_app" "trekstop" {
  name                = "trekstop-${local.suffix}"
  location            = azurerm_resource_group.trekstop.location
  resource_group_name = azurerm_resource_group.trekstop.name
  service_plan_id     = azurerm_service_plan.trekstop.id
  https_only          = true

  site_config {
    minimum_tls_version = "1.2"

    application_stack {
      node_version = "24-lts"
    }
  }

  app_settings = {
    APPLICATIONINSIGHTS_CONNECTION_STRING = azurerm_application_insights.trekstop.connection_string
    AZURE_MAPS_SUBSCRIPTION_KEY           = var.azure_maps_subscription_key
    COSMOS_CONTAINER                      = azurerm_cosmosdb_sql_container.trails.name
    COSMOS_DATABASE                       = azurerm_cosmosdb_sql_database.trekstop.name
    COSMOS_ENDPOINT                       = azurerm_cosmosdb_account.trekstop.endpoint
    COSMOS_KEY                            = azurerm_cosmosdb_account.trekstop.primary_key
    NODE_ENV                              = "production"
    WEBSITE_NODE_DEFAULT_VERSION          = "~24"
  }

  tags = local.tags
}
