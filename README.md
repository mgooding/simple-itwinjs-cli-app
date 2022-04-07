# simple-itwinjs-cli-app

This is a minimal example of a command-line [iTwin.js](https://itwinjs.org/) application that downloads an iModel
from iModelHub and prints the result of an ECSQL query.

## Prerequisites

- [Node](https://nodejs.org/en/): an installation of the latest security patch of Node 14.

## Setup

Edit `IMODELHUB_REQUEST_PROPS` in [Main.ts](./src/Main.ts) to replace iTwinId and iModelId with the appropriate
values for your iModel.

You will also need to provide a clientId, scope and redirectUri for your application. To register an application,
go to [https://developer.bentley.com/register/](https://developer.bentley.com/register/).

- Add "Visualization" and "Digital Twin Management" as API Associations
- Select "Desktop/Mobile" as the Application Type
- Enter "http://localhost:3000/signin-callback" for Redirect URI
- No logout URI is required

Once your application is created, go to its details page and copy/paste the scope, clientId and redirectUri fields
into `AUTH_CLIENT_CONFIG_PROPS` in [Main.ts](./src/Main.ts).

Open your favorite shell to the root of the cloned repository and:

```sh
npm install
npm run build
npm start
```
