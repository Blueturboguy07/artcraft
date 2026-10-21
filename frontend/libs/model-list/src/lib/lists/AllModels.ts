import { IMAGE_MODELS } from "./ImageModels.js";
import { Model } from "../classes/Model.js";

// Every model the app offers. publik API serves images only; video, 3D and splat
// models are not offered.
export const ALL_MODELS_LIST: Model[] = [...IMAGE_MODELS];
