// Only file each builder needs to edit for their app.
const APP_NAME = "QuoteLine Quote Comparison";

// Microsoft Entra ID sign-in for the Axis Services Group tenant. The site's address
// (for example https://<site>.netlify.app) must be listed as a "Single-page application"
// redirect URI on this app registration.
const MSAL_CONFIG = {
  auth: {
    clientId: "7485bf02-3fbf-478b-a4d0-05ddcc3b1c1e",
    authority: "https://login.microsoftonline.com/e52a9a87-78f1-4048-b915-d974ad3d98ac",
    redirectUri: window.location.origin
  },
  cache: { cacheLocation: "localStorage" }
};
const LOGIN_SCOPES = ["User.Read"];
