import 'dotenv/config';
import app from './app.js';
import { connectDb } from './db.js';

const port = Number(process.env.PORT) || 5000;

connectDb()
  .then(() => {
app.listen(port, '0.0.0.0', () => {
    console.log(`Clinic API listening on http://localhost:${port}`);
    console.log('From a phone, use this computer’s LAN address with the same port.');
  });
  })
  .catch((error) => {
    if (error.code === 'NO_URI') {
      console.error('Missing MONGODB_URI. Add it to server/.env');
    } else {
      console.error('Could not connect to MongoDB');
      console.error(error.message);
    }
    process.exit(1);
  });
