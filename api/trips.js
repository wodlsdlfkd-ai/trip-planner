import { createTripHandler } from '../server/tripHandler.js';
import { getServerServices } from '../server/firebase.js';

export default createTripHandler(getServerServices);
