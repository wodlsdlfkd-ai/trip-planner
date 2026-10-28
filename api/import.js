import { createImportHandler } from '../server/importAnalysis.js';
import { getServerServices } from '../server/firebase.js';
export default createImportHandler(getServerServices);
