/*---------------------------------------------------------------------------------------------
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/

import { BriefcaseDb, BriefcaseManager, ECSqlStatement, IModelDb, IModelHost, IModelHostConfiguration } from "@itwin/core-backend";
import { DbResult, Logger, LogLevel } from "@itwin/core-bentley";
import { BriefcaseIdValue, LocalBriefcaseProps } from "@itwin/core-common";
import { BackendIModelsAccess } from "@itwin/imodels-access-backend";
import { NodeCliAuthorizationClient } from "@itwin/node-cli-authorization";

// Find your iTwin and iModel IDs at https://developer.bentley.com/my-imodels/
const IMODELHUB_REQUEST_PROPS = {
  iTwinId: "", // EDIT ME! Specify your own iTwinId
  iModelId: "", // EDIT ME! Specify your own iModelId
};

const AUTH_CLIENT_CONFIG_PROPS = {
  clientId: "", // EDIT ME! Specify your own clientId

  /** These are the minimum scopes needed - you can leave alone or replace with your own entries */
  scope: "email openid profile organization itwinjs imodelaccess:read imodels:read",
  /** This can be left as-is assuming you've followed the instructions in README.md when registering your application */
  redirectUri: "http://localhost:3000/signin-callback",
};

const APP_LOGGER_CATEGORY = "simple-itwinjs-cli-app";

(async () => {
  const imhConfig: IModelHostConfiguration = {
    hubAccess: new BackendIModelsAccess(), // needed to download iModels from iModelHub
    // These tile properties are unused by this application, but are required fields of IModelHostConfiguration.
    logTileLoadTimeThreshold: IModelHostConfiguration.defaultLogTileLoadTimeThreshold,
    logTileSizeThreshold: IModelHostConfiguration.defaultLogTileSizeThreshold,
    tileContentRequestTimeout: IModelHostConfiguration.defaultTileRequestTimeout,
    tileTreeRequestTimeout: IModelHostConfiguration.defaultTileRequestTimeout,
  };
  await IModelHost.startup(imhConfig);

  Logger.initializeToConsole();
  Logger.setLevelDefault(LogLevel.Warning);
  Logger.setLevel(APP_LOGGER_CATEGORY, LogLevel.Info);

  const iModel: IModelDb = await openIModelFromIModelHub();
  Logger.logInfo(APP_LOGGER_CATEGORY, `iModel ${iModel.name} acquired and opened`);

  const sql = "SELECT ECInstanceId, Description FROM bis.Category";
  Logger.logInfo(APP_LOGGER_CATEGORY, `Query: ${sql}`);
  iModel.withPreparedStatement(sql, (stmt: ECSqlStatement) => {
    while (stmt.step() === DbResult.BE_SQLITE_ROW)
      Logger.logInfo(APP_LOGGER_CATEGORY, `Id "${stmt.getValue(0).getId()}" Description "${stmt.getValue(1).getString()}"`);
  });

})().catch((reason) => {
  process.stdout.write(`${reason}\n`);
  process.exit(1);
});

export async function openIModelFromIModelHub(): Promise<BriefcaseDb> {
  if (!AUTH_CLIENT_CONFIG_PROPS.clientId || !AUTH_CLIENT_CONFIG_PROPS.scope || !AUTH_CLIENT_CONFIG_PROPS.redirectUri)
    return Promise.reject("You must edit AUTH_CLIENT_CONFIG in Main.ts");

  const authorizationClient = new NodeCliAuthorizationClient({ ...AUTH_CLIENT_CONFIG_PROPS });
  Logger.logInfo(APP_LOGGER_CATEGORY, "Attempting to sign in");
  await authorizationClient.signIn();
  Logger.logInfo(APP_LOGGER_CATEGORY, "Sign in successful");
  IModelHost.authorizationClient = authorizationClient;

  if (!IMODELHUB_REQUEST_PROPS.iTwinId || !IMODELHUB_REQUEST_PROPS.iModelId)
    return Promise.reject("You must edit IMODELHUB_REQUEST_PROPS in Main.ts");

  let briefcaseProps: LocalBriefcaseProps | undefined = getBriefcaseFromCache();
  if (!briefcaseProps)
    briefcaseProps = await downloadBriefcase();

  const briefcaseResult = BriefcaseDb.open({ fileName: briefcaseProps.fileName, readonly: true });
  return briefcaseResult;
}

function getBriefcaseFromCache(): LocalBriefcaseProps | undefined {
  const cachedBriefcases: LocalBriefcaseProps[] = BriefcaseManager.getCachedBriefcases(IMODELHUB_REQUEST_PROPS.iModelId);
  if (cachedBriefcases.length === 0) {
    Logger.logInfo(APP_LOGGER_CATEGORY, `No cached briefcase found for ${IMODELHUB_REQUEST_PROPS.iModelId}`);
    return undefined;
  }

  // Just using any version that's cached. A real program would verify that this is the desired changeset.
  Logger.logInfo(APP_LOGGER_CATEGORY, `Using cached briefcase found at ${cachedBriefcases[0].fileName}`);
  return cachedBriefcases[0];
}

async function downloadBriefcase(): Promise<LocalBriefcaseProps> {
  Logger.logInfo(APP_LOGGER_CATEGORY, `Downloading new briefcase for iTwinId ${IMODELHUB_REQUEST_PROPS.iTwinId} iModelId ${IMODELHUB_REQUEST_PROPS.iModelId}`);

  let nextProgressUpdate = new Date().getTime() + 2000; // too spammy without some throttling
  const onProgress = (loadedBytes: number, totalBytes: number): number => {
    if (new Date().getTime() > nextProgressUpdate) {
      if (loadedBytes === totalBytes)
        Logger.logInfo(APP_LOGGER_CATEGORY, `Download complete, applying changesets`);
      else
        Logger.logInfo(APP_LOGGER_CATEGORY, `Downloaded ${(loadedBytes / (1024 * 1024)).toFixed(2)}MB of ${(totalBytes / (1024 * 1024)).toFixed(2)}MB`);
      nextProgressUpdate = new Date().getTime() + 2000;
    }
    return 0;
  };

  return BriefcaseManager.downloadBriefcase({ ...IMODELHUB_REQUEST_PROPS, onProgress, briefcaseId: BriefcaseIdValue.Unassigned });
}
