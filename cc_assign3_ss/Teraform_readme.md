# Cloud Computing Assignment 3

**Infrastructure automation, cost estimation and monitoring**  
Travel catalogue application: U-AT_lasTravel  
Azure subscription: Azure for Students  
Region: Central India

This report records the Terraform deployment, the cost estimate, and a small Locust test of the travel catalogue. The Assignment 3 deployment is in its own resource group;

## Part 1 - Terraform deployment

### Terraform files

The Terraform configuration is in `..\infra\terraform\`:

| File | Purpose |
|---|---|
| `main.tf` | Defines the Assignment 3 resource group, App Service plan and Linux web app, Cosmos DB account/database/container, Blob Storage account/container, Log Analytics workspace, and Application Insights. The deployment uses Central India, Linux B1, Node.js 24 LTS, serverless Cosmos DB, and RA-GRS storage. |
| `variables.tf` | Declares the subscription ID, Azure region, App Service SKU, and resource tags. Defaults are Central India and B1. |
| `outputs.tf` | Prints the web app URL, app name, and Terraform resource group name after deployment. |
| `versions.tf` | Sets the Terraform and Azure/random provider requirements and configures the providers. |
| `terraform.tfvars.example` | Example containing the subscription ID field. Copy it to `terraform.tfvars` and put the subscription ID in the local copy. Do not commit the local `.tfvars` file. |
| `.terraform.lock.hcl` | Records the selected provider versions so later Terraform runs use the same versions. |

The local Terraform state file and saved plan are deployment working files. They are not included as assignment evidence because Terraform state can contain sensitive values.

### Deployment steps and commands

I used PowerShell from the repository. The deployment was authenticated to the Azure for Students subscription, and Azure prompted for MFA during resource creation.

```powershell
# Sign in (CLI) && ensure MFA enalbled in azure for error free deployment using terraform
az login
az account
az account show --output table

# Go to the Terraform directory
Set-Location .\infra\terraform

# Initialize providers and check the configuration
terraform init
terraform fmt
terraform validate

# Preview, save, and inspect the plan
terraform plan '-var=subscription_id=70b820b5-37f5-4061-8a89-4ed47d19d04e' '-out=assignment3.tfplan'
terraform show assignment3.tfplan

# Apply the reviewed plan, then inspect the deployed state and outputs
terraform apply assignment3.tfplan
terraform show
terraform output
```

The successful apply created 10 resources and did not change or destroy existing resources. Terraform outputs:

- Resource group: `rg-travel-a3-a8b135`
- App Service: `travel-a3-a8b135`
- Public URL: <https://travel-a3-a8b135.azurewebsites.net>

### Application deployment

After Terraform created the App Service, I set the GitHub Actions repository variable `AZURE_WEBAPP_NAME` to `travel-a3-a8b135` and ran the deployment workflow from the `use_tform` branch. I added a GitHub federated credential for that branch and gave the workflow's managed identity Website Contributor access to the new App Service. The GitHub Actions run completed successfully.

The website and `/api/destinations` endpoint were checked in a browser. The API returned destination records from Cosmos DB.

### Part 1 screenshots

The screenshots below are in the order of the Terraform checks, successful deployment, and application verification.

**Terraform validation and state output**

![Terraform validate succeeded and terraform show output](<Terraform dep1.jpg>)

**Terraform apply completed**

![Terraform apply completed successfully](<terraform apply2.jpg>)

**Terraform show after deployment**

![Terraform show lists the deployed resources and outputs](<terraform show .jpg>)

**GitHub Actions deployment**

![GitHub Actions build and deploy workflow succeeded](<git hub actions successful actions.jpg>)

**Deployed travel catalogue**

![Travel catalogue running on the Terraform App Service](<Deployed page of app.jpg>)

**API response**

![Destinations API returned records from Cosmos DB](<json_op of page deployed.jpg>)

## Part 2 - Cost estimation

I used the Azure Pricing Calculator and exported the estimate to `ExportedEstimate.xlsx`. The estimate is in Indian rupees and shows **₹0.00 upfront** and **₹1,427.82 estimated monthly cost** (about **₹17,133.88 per year**).

| Service | Calculator configuration | Estimated monthly cost |
|---|---|---:|
| App Service | Central India; Linux; Basic B1; one instance; 30 days | ₹1,244.02 |
| Azure Cosmos DB | NoSQL, serverless; 1 million RUs; 1 GB transactional storage; periodic backup | ₹47.99 |
| Storage Account | Central India; Blob, GPv2; hot tier; RA-GRS; 1 GB and the listed operations/data transfer | ₹35.02 |
| Azure Monitor | Calculator inputs included 0.5 GB/day Auxiliary Logs and the listed retention settings | ₹100.79 |
| **Total** |  | **₹1,427.82** |

For the workload assumptions, I used 100 active users per day and about 20 requests per user per day, or approximately 60,000 requests per month. The estimate used 1 GB of storage and 1 million Cosmos DB request units. These are planning assumptions, not measurements of monthly production usage.

The exported estimate is for **Basic B1**, not the Free App Service tier. B1 is the largest item in this estimate. A separate Free-tier scenario would have a different total and would not represent the B1 deployment used for the Locust test. Prices are calculator estimates and can differ from actual Azure charges.

### Part 2 screenshots and export

![App Service Basic B1 cost configuration](<Cost estimation compute1.jpg>)

![Azure Pricing Calculator total monthly estimate](<Total cost estimate.jpg>)

![Exported estimate shown in a spreadsheet](<excel ss of cost.jpg>)

[Open the exported calculator estimate](./ExportedEstimate.xlsx)

## Part 3 - Monitoring and performance test

### Locust test

I installed Locust 2.47.0 using Python 3.12 and ran the read-only test against the Terraform app. The test exercises the homepage, destination listing API, and continent-filter API. The configured profile was 5 users, a 1-user-per-second ramp-up, and a 2-minute run.

The captured Locust summary is:

| Request | Requests | Failures | Average | Median | 95th percentile | Maximum |
|---|---:|---:|---:|---:|---:|---:|
| `GET /` | 57 | 0 | 54 ms | 44 ms | 110 ms | 308 ms |
| `GET /api/destinations` | 172 | 0 | 99 ms | 83 ms | 210 ms | 405 ms |
| `GET /api/destinations?continent=[filter]` | 60 | 0 | 113 ms | 83 ms | 310 ms | 564 ms |
| **All requests** | **289** | **0** | **93 ms** | **79 ms** | **210 ms** | **564 ms** |

Locust reported 2.41 requests per second in the terminal summary. The separate Locust browser screenshot rounded this to 2.6 RPS. Both reports show zero failed requests. The run is a small, short test and should not be treated as a measure of capacity under heavy or sustained traffic.

The available Locust statistics CSVs are in the repository's `csv_results/` folder:

- [Request statistics](../csv_results/loadtest-results_stats.csv)
- [Request statistics over time](../csv_results/loadtest-results_stats_history.csv)
- [Failures](../csv_results/loadtest-results_failures.csv)
- [Exceptions](../csv_results/loadtest-results_exceptions.csv)

### Locust screenshots

![Locust web interface statistics for the test](<Locust_result_localhost.jpg>)

![Locust terminal summary and response-time percentiles](<Locust_ss2_terminal.jpg>)

### Insights and Azure monitoring evidence

In this test, all 289 requests succeeded. The average response time across the requests was 93 ms, and the observed maximum was 564 ms. The continent-filter request had the highest measured p95 latency at 310 ms; its maximum was 564 ms. This suggests the application responded successfully to this light read-only workload, but a larger and longer test would be needed to assess behavior at higher traffic.

The Terraform deployment also created Application Insights and a Log Analytics workspace. The `ExportedEstimate.xlsx` file in this folder is the **Pricing Calculator export**