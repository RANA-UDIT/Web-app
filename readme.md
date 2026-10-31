# U-AT_lasTravel (Travel Web APP)

#### UDIT

#### 2025SIY7621, MS Research IIT Delhi

### Assignment 2 - Public Cloud

This travel catalogue application for the Cloud Computing course-(IITD) given custom name **U-AT_lasTravel**. Users can add travel destinations, see all destinations, and filter the list using different attributes.

The application is deployed on Azure App Service and can be opened here:

https://travel-catalogue-udit-gverg3cgd3auf7bb.centralindia-01.azurewebsites.net/

The source code is available here in GitHub repository:

https://github.com/

## Overview and Requirements

### Data layer

Azure Cosmos DB for NoSQL stores the list of travel destinations. Each destination is stored as a JSON document. The Cosmos DB container is named `destinations` and uses `continent` as its partition key.

The local application can use `data.json` when Azure settings are not present. The deployed application uses Cosmos DB through App Service environment variables.

### Web application

The application supports:

1. Adding a new travel destination.
2. Listing all saved destinations.
3. Searching by destination, country, or description.
4. Filtering by continent.
5. Filtering by travel mood, such as Culture, Adventure, or Beach.
6. Filtering by maximum daily budget.
7. Showing a clear error when required input is missing or invalid.
8. Opening through a public HTTPS URL.

The server checks the input before saving it. For example, the budget must be between 1 and 10,000 USD, and the description must contain at least 20 characters.

## Architecture Decisions

The project uses a small Node.js and Express backend with a plain HTML, CSS, and JavaScript frontend. This keeps the application easy to understand and deploy.

Azure App Service was selected because it provides a public HTTPS URL and supports Node.js applications. Azure Cosmos DB was selected for the destination data because it stores flexible JSON documents and keeps data available after the web application restarts. Azure Blob Storage was selected for images because images are files and should not be stored inside database documents.

Secrets and connection strings are stored in Azure App Service environment variables. They are not stored in the GitHub repository.

## Architecture Diagram

```text
User
	|
	| HTTPS
	v
Azure App Service
Node.js + Express  _________
   |          |             |
   |          |             +--> Application Insights
   |          |
   |          +----------------> Azure Blob Storage
   |                             destination images
   |
   +--------------------------> Azure Cosmos DB
				 travelCatalogue / destinations
```

### Azure App Service

Azure App Service hosts the Node.js application and gives it a public HTTPS address. The GitHub repository is connected through the App Service Deployment Center. A push to the `main` branch runs the GitHub Actions build and deployment workflow.

### Azure Cosmos DB

Cosmos DB is the main data layer. It stores destination records and allows the application to keep data after the web application is restarted. The application creates the database and container when it connects for the first time if they do not already exist.

### Azure Blob Storage

The application accepts an optional JPG, PNG, or WEBP image up to 5 MB. The image is uploaded to the `destination-images` Blob Storage container, and its URL is saved with the destination record.

## Feature Integration

Two public cloud features were integrated into the application: Azure Blob Storage and Application Insights. Both are connected to the Node.js backend through Azure App Service environment variables.

## Additional Cloud Features Added and Usecase

### 1. Azure Blob Storage image upload

Blob Storage is used for destination images. It is useful because users can add a real image with a destination, making the catalogue more informative. Blob Storage is suitable for storing image files and keeps large image data outside the Cosmos DB documents. This makes the application easier to scale and keeps the database records smaller.

### 2. Application Insights monitoring

Application Insights collects application request, dependency, and error information. It is useful because the developer can check whether the public website is working, see requests made by users, and find errors when the application is running in Azure.

## Environment variables

These values are configured in Azure App Service under **Settings > Environment variables**. They must not be committed to GitHub.

```text
COSMOS_ENDPOINT
COSMOS_KEY
COSMOS_DATABASE=travelCatalogue
COSMOS_CONTAINER=destinations
AZURE_STORAGE_CONNECTION_STRING
AZURE_STORAGE_CONTAINER=destination-images
APPLICATIONINSIGHTS_CONNECTION_STRING
```

## Main files

| File or folder | Work done |
|---|---|
| `server.js` | Express server, API routes, validation, Cosmos DB, Blob Storage, and Application Insights |
| `public/index.html` | Page structure, filters, cards, and add destination form |
| `public/styles.css` | Page design, layout, responsive styling, and animations |
| `public/app.js` | Loading, filtering, form submission, image upload, and error messages |
| `data.json` | Local development data when Cosmos DB is not configured |
| `package.json` | Project commands and Node.js dependencies |
| `.env.example` | Names of the required environment variables |
| `.github/workflows/` | GitHub Actions deployment workflow |

The `node_modules` folder contains installed third-party packages. It is not application source code and is not uploaded to GitHub.

## Running locally

Requirements: Node.js 18 or newer.

```powershell
npm install
npm start
```

Open this address in a browser:

http://localhost:3000

Without Azure environment variables, the app reads and writes `data.json`. With the Azure environment variables, it uses Cosmos DB and Blob Storage.

## Deployment
1. Azure App Service is connected to the GitHub repository.
2. GitHub Actions installs the Node.js packages and deploys the application.
3. Azure App Service reads the environment variables from its configuration.
4. The live URL is the public application URL listed above.

## Assignment 3

Assignment 3 Terraform files, deployment and cost-estimation instructions, and a read-only Locust load test are in [`infra/terraform/`](./infra/terraform/), [`loadtest/`](./loadtest/), and [`docs/assignment-3.md`](./docs/assignment-3.md). The Terraform stack is separate from the manually created Assignment 2 resources. Review the cost and cleanup guidance before creating Azure resources.
