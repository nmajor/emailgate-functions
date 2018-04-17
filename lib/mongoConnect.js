import { MongoClient } from 'mongodb';
import config from '../config';

let db = null;

export default function (cb) {
  if (db) { cb(db); return; }

  console.log('blah remove status', `MongoURL: ${config.mongoUrl}`);

  MongoClient.connect(config.mongoUrl, (err, conn) => {
    if (err) { return console.log('error', `There was a problem connecting to the database ${err.message}`, err); }
    console.log('status', 'Connected to db');

    db = conn;
    return cb(db);
  });
}
