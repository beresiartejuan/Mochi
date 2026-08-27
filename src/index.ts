import "dotenv/config";
import { createBotDependencies, runBotLoop } from "./bot/botLoop.js";

const deps = createBotDependencies();
runBotLoop(deps);
