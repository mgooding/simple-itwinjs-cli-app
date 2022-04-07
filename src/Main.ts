/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/

import * as yargs from "yargs";
import { IModelDb, IModelHost, IModelHostConfiguration, SnapshotDb } from "@itwin/core-backend";
import { Logger, LogLevel } from "@itwin/core-bentley";
import { Presentation } from "@itwin/presentation-backend";
import { openIModelFromIModelHub } from "./IModelHubDownload";
import { startProtobufRpcServer } from "./ProtobufRpcServer";
import { BackendIModelsAccess } from "@itwin/imodels-access-backend";

// Find your context and iModel IDs at https://www.itwinjs.org/getting-started/registration-dashboard/?tab=1
const IMODELHUB_REQUEST_PROPS = {
  iTwinId: "1486f682-9d27-46e4-a395-0befa790dfc2", // EDIT ME! Specify your own iTwinId
  iModelId: "4365f433-9763-4b79-80b3-f2e40140ffd9", // EDIT ME! Specify your own iModelId
};

const AUTH_CLIENT_CONFIG_PROPS = {
  // TODO - remove
  // clientId: "native-aSW1OXKAxooCx7L6lzVireLxa",
  // scope: "email openid profile organization itwinjs imodelaccess:read imodels:read",

  clientId: "", // EDIT ME! Specify your own clientId
  scope: "", // EDIT ME! Specify your own scope
  redirectUri: "http://localhost:3000/signin-callback", // EDIT ME! Specify your redirectUri
};

export async function openIModelFromIModelHub(): Promise<BriefcaseDb> {
  if (AUTH_CLIENT_CONFIG_PROPS.clientId?.length === 0 || AUTH_CLIENT_CONFIG_PROPS.scope?.length === 0 || AUTH_CLIENT_CONFIG_PROPS.redirectUri?.length === 0)
    return Promise.reject("You must edit AUTH_CLIENT_CONFIG in IModelHubDownload.ts");

  const authorizationClient = new NodeCliAuthorizationClient({ ...AUTH_CLIENT_CONFIG_PROPS });
  Logger.logInfo(APP_LOGGER_CATEGORY, "Attempting to sign in");
  await authorizationClient.signIn();
  Logger.logInfo(APP_LOGGER_CATEGORY, "Sign in successful");
  IModelHost.authorizationClient = authorizationClient;

  if (IMODELHUB_REQUEST_PROPS.iTwinId?.length === 0 || IMODELHUB_REQUEST_PROPS.iModelId?.length === 0)
    return Promise.reject("You must edit IMODELHUB_REQUEST_PROPS in IModelHubDownload.ts");

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


export const APP_LOGGER_CATEGORY = "imodel-unity-example";

interface UnityBackendArgs {
  snapshotFile?: string;
}

const unityBackendArgs: yargs.Arguments<UnityBackendArgs> = yargs
  .usage("Usage: $0 --snapshotFile [Snapshot iModel file]\nIf snapshotFile is not specified, attempts to use iModel specified in IModelHubDownload.ts.")
  .string("snapshotFile")
  .alias("snapshotFile", "s")
  .describe("snapshotFile", "Path to a Snapshot iModel file (.bim)")
  .argv;

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

  Presentation.initialize();
  Presentation.getManager().activeLocale = "en";
  Presentation.getManager().activeUnitSystem = "metric";

  Logger.initializeToConsole();
  Logger.setLevel(APP_LOGGER_CATEGORY, LogLevel.Trace);

  let iModel: IModelDb;

  if (!unityBackendArgs.snapshotFile) {
    Logger.logInfo(APP_LOGGER_CATEGORY, "No snapshot specified, attempting to open from iModelHub");
    iModel = await openIModelFromIModelHub();
  } else {
    Logger.logInfo(APP_LOGGER_CATEGORY, `Attempting to open ${unityBackendArgs.snapshotFile}`);
    iModel = SnapshotDb.openFile(unityBackendArgs.snapshotFile);
    Logger.logInfo(APP_LOGGER_CATEGORY, `${unityBackendArgs.snapshotFile} opened successfully`);
  }

  startProtobufRpcServer(iModel);

})().catch((reason) => {
  process.stdout.write(`${reason}\n`);
  process.exit(1);
});
