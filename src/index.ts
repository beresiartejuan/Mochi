import "dotenv/config";
import { createBotDependencies, runBotLoop } from "./bot/botLoop.js";

const deps = await createBotDependencies();
runBotLoop(deps);
